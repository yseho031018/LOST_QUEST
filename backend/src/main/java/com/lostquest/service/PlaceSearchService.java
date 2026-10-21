package com.lostquest.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.function.LongSupplier;
import java.nio.ByteBuffer;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;

/** User-triggered registration searches only; one backend instance, no autocomplete or bulk lookups. */
@Service
public class PlaceSearchService {
    public record Place(String id, String name, String address, String region, double latitude, double longitude) { }
    private record Cached(long expiresAt, List<Place> items) { }
    private final ObjectMapper mapper;
    private final String endpoint;
    private final boolean enabled;
    private final HttpClient client;
    private final LongSupplier now;
    private final Semaphore inFlight = new Semaphore(1);
    private final Map<String, Cached> cache = new LinkedHashMap<>(32, .75f, true);
    private long nextRequest;
    private long quotaStarted;
    private int dailyRequests;

    @org.springframework.beans.factory.annotation.Autowired
    public PlaceSearchService(ObjectMapper mapper,
            @Value("${app.place-search.url:https://nominatim.openstreetmap.org/search}") String endpoint,
            @Value("${app.place-search.enabled:true}") boolean enabled) {
        this(mapper, endpoint, enabled, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER).build(), System::nanoTime);
    }

    PlaceSearchService(ObjectMapper mapper, String endpoint, boolean enabled, HttpClient client, LongSupplier now) {
        URI uri = URI.create(endpoint);
        if (uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null || uri.getHost() == null
                || !("https".equals(uri.getScheme()) || ("http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost())))) {
            throw new IllegalArgumentException("Place search requires a configured HTTPS endpoint");
        }
        this.mapper = mapper; this.endpoint = endpoint; this.enabled = enabled; this.client = client; this.now = now;
        this.quotaStarted = now.getAsLong();
    }

    public List<Place> search(String input) {
        String query = input == null ? "" : input.strip().replaceAll("\\s+", " ");
        if (query.length() < 2 || query.length() > 100 || query.chars().anyMatch(Character::isISOControl)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "검색어를 2~100자로 입력해 주세요.");
        }
        if (!enabled) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "장소 검색을 사용할 수 없어요. 장소를 직접 입력해 주세요.");
        synchronized (cache) {
            Cached hit = cache.get(query);
            if (hit != null && now.getAsLong() - hit.expiresAt() < 0) return hit.items();
        }
        if (!inFlight.tryAcquire()) throw limited();
        try {
            long time = now.getAsLong();
            if (time - quotaStarted >= Duration.ofDays(1).toNanos()) { dailyRequests = 0; quotaStarted = time; }
            if ((dailyRequests > 0 && time - nextRequest < 0) || dailyRequests >= 1000) throw limited();
            // Aggregate limit for every PC/mobile user, including unsuccessful requests.
            nextRequest = time + Duration.ofMillis(1100).toNanos(); dailyRequests++;
            URI uri = URI.create(endpoint + "?format=jsonv2&countrycodes=kr&addressdetails=1&limit=5&accept-language=ko&q="
                    + URLEncoder.encode(query, StandardCharsets.UTF_8));
            HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(6))
                    .header("User-Agent", "LOST-QUEST/1.0 (+https://github.com/yseho031018/LOST_QUEST)")
                    .header("Accept", "application/json").GET().build();
            var pending = client.sendAsync(request, info -> new LimitedBody());
            HttpResponse<byte[]> response;
            try { response = pending.get(6, TimeUnit.SECONDS); }
            finally { pending.cancel(true); }
            byte[] bytes = response.body();
            if (response.statusCode() != 200) throw unavailable();
            JsonNode rows = mapper.readTree(bytes);
            if (rows == null || !rows.isArray() || rows.size() > 40) throw unavailable();
            List<Place> items = new ArrayList<>();
            for (JsonNode row : rows) {
                double latitude = row.path("lat").asDouble(Double.NaN), longitude = row.path("lon").asDouble(Double.NaN);
                if (!com.lostquest.validation.ItemCoordinates.valid(latitude, longitude)) continue;
                String address = row.path("display_name").asText("");
                String id = row.path("place_id").asText("");
                if (address.isBlank() || address.length() > 1000 || id.isBlank() || id.length() > 64) continue;
                String name = row.path("name").asText("");
                if (name.isBlank()) name = address;
                // Korean metropolitan cities can appear as city instead of state.
                // The client accepts only its explicit province-name aliases, never guesses a district.
                JsonNode parts = row.path("address");
                String region = parts.path("state").asText("");
                if (region.isBlank()) region = parts.path("province").asText("");
                if (region.isBlank()) region = parts.path("city").asText("");
                items.add(new Place(id, name.substring(0, Math.min(name.length(), 200)),
                        address, region.substring(0, Math.min(region.length(), 30)), latitude, longitude));
                if (items.size() == 5) break;
            }
            List<Place> result = List.copyOf(items);
            synchronized (cache) {
                cache.put(query, new Cached(now.getAsLong() + Duration.ofHours(24).toNanos(), result));
                while (cache.size() > 256) cache.remove(cache.keySet().iterator().next());
            }
            return result;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt(); throw unavailable();
        } catch (java.io.IOException | IllegalArgumentException | java.util.concurrent.ExecutionException | java.util.concurrent.TimeoutException ex) {
            throw unavailable();
        } finally { inFlight.release(); }
    }

    /** Bound the body as it arrives; the overall future timeout also covers stalled response bodies. */
    private static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final HttpResponse.BodySubscriber<byte[]> delegate = HttpResponse.BodySubscribers.ofByteArray();
        private Flow.Subscription subscription;
        private long size;
        private boolean failed;
        public CompletionStage<byte[]> getBody() { return delegate.getBody(); }
        public void onSubscribe(Flow.Subscription value) { subscription = value; delegate.onSubscribe(value); }
        public void onNext(List<ByteBuffer> buffers) {
            if (failed) return;
            size += buffers.stream().mapToLong(ByteBuffer::remaining).sum();
            if (size > 256_000) { failed = true; subscription.cancel(); delegate.onError(new java.io.IOException("Place response too large")); }
            else delegate.onNext(buffers);
        }
        public void onError(Throwable error) { if (!failed) { failed = true; delegate.onError(error); } }
        public void onComplete() { if (!failed) delegate.onComplete(); }
    }

    private static ResponseStatusException limited() { return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "잠시 후 다시 검색해 주세요."); }
    private static ResponseStatusException unavailable() { return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "장소 검색에 연결하지 못했어요. 장소를 직접 입력해 주세요."); }
}
