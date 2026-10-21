package com.lostquest.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.web.server.ResponseStatusException;
import java.net.*;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.assertj.core.api.Assertions.*;

class PlaceSearchServiceTest {
    private HttpServer server;
    private PlaceSearchService service;
    private final AtomicLong time = new AtomicLong(1);
    private final AtomicInteger calls = new AtomicInteger();
    private String body = "[{\"place_id\":42,\"name\":\"서울숲역\",\"display_name\":\"서울특별시 성동구 서울숲역\",\"lat\":\"37.54\",\"lon\":\"127.04\",\"address\":{\"state\":\"서울특별시\"}}]";
    private int status = 200;
    private volatile CountDownLatch entered, release;
    private volatile String userAgent, query;
    @BeforeEach void setup() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/search", exchange -> {
            calls.incrementAndGet(); userAgent = exchange.getRequestHeaders().getFirst("User-Agent"); query = exchange.getRequestURI().getRawQuery();
            if (entered != null) { entered.countDown(); try { release.await(8, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); } }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            try { exchange.sendResponseHeaders(status, bytes.length); exchange.getResponseBody().write(bytes); } finally { exchange.close(); }
        });
        server.start(); service = new PlaceSearchService(new ObjectMapper(), endpoint(), true, HttpClient.newHttpClient(), time::get);
    }
    private String endpoint() { return "http://127.0.0.1:" + server.getAddress().getPort() + "/search"; }
    @AfterEach void stop() { if (release != null) release.countDown(); server.stop(0); }
    private void advance(Duration duration) { time.addAndGet(duration.toNanos()); }
    private void fails(int code, Runnable action) { assertThatThrownBy(action::run).isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode().value()).isEqualTo(code)); }

    @Test void cachesNormalizedQueriesAndSetsProviderParametersAndIdentity() {
        var first = service.search(" 서울숲역  입구 ");
        assertThat(first).hasSize(1); assertThat(first.getFirst().region()).isEqualTo("서울특별시");
        assertThat(first.getFirst().latitude()).isEqualTo(37.54);
        assertThat(service.search("서울숲역 입구")).isEqualTo(first); assertThat(calls).hasValue(1);
        assertThat(userAgent).startsWith("LOST-QUEST/1.0");
        assertThat(query).contains("countrycodes=kr", "limit=5", "addressdetails=1", "q=");
        advance(Duration.ofHours(24)); service.search("서울숲역 입구"); assertThat(calls).hasValue(2);
    }
    @Test void enforcesAggregateSpacingEvenForDifferentUsersAndQueries() {
        service.search("서울숲역"); fails(429, () -> service.search("단대오거리역"));
        assertThat(calls).hasValue(1); advance(Duration.ofMillis(1100)); service.search("단대오거리역"); assertThat(calls).hasValue(2);
    }
    @Test void rejectsConcurrentRequestsWhileAnActualHttpRequestIsInFlight() throws Exception {
        entered = new CountDownLatch(1); release = new CountDownLatch(1);
        try (var executor = Executors.newSingleThreadExecutor()) {
            var pending = executor.submit(() -> service.search("서울숲역"));
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue(); advance(Duration.ofSeconds(2));
            fails(429, () -> service.search("서울숲역")); fails(429, () -> service.search("부산역"));
            assertThat(calls).hasValue(1); release.countDown(); assertThat(pending.get(2, TimeUnit.SECONDS)).hasSize(1);
            assertThat(service.search("서울숲역")).hasSize(1); assertThat(calls).hasValue(1);
        }
    }
    @Test void doesNotCallProviderForInvalidQueriesOrWhenDisabled() {
        for (String invalid : new String[]{"", "a", "x".repeat(101), "ab\u0000c"}) fails(400, () -> service.search(invalid));
        var disabled = new PlaceSearchService(new ObjectMapper(), endpoint(), false, HttpClient.newHttpClient(), time::get);
        fails(503, () -> disabled.search("서울숲역")); assertThat(calls).hasValue(0);
    }
    @Test void handlesProviderFailureAndReleasesSlotWithoutCachingErrors() {
        status = 503; fails(503, () -> service.search("서울숲역")); advance(Duration.ofSeconds(2));
        status = 200; assertThat(service.search("서울숲역")).hasSize(1); assertThat(calls).hasValue(2);
    }
    @Test void rejectsHtmlAndOversizedBodies() {
        body = "<!doctype html>"; fails(503, () -> service.search("서울숲역")); advance(Duration.ofSeconds(2));
        body = "x".repeat(260000); fails(503, () -> service.search("서울숲역")); advance(Duration.ofSeconds(2));
        body = "[]"; assertThat(service.search("서울숲역")).isEmpty();
    }
    @Test void cachesEmptyResultsAndFiltersInvalidCoordinates() {
        body = "[{\"place_id\":1,\"display_name\":\"이상한 장소\",\"lat\":\"NaN\",\"lon\":127},{\"place_id\":2,\"display_name\":\"이상한 장소\",\"lat\":91,\"lon\":127}]";
        assertThat(service.search("서울숲역")).isEmpty(); assertThat(service.search("서울숲역")).isEmpty(); assertThat(calls).hasValue(1);
    }
    @Test void acceptsMetropolitanCityAddressWithoutState() {
        body = body.replace("\"state\":\"서울특별시\"", "\"city\":\"서울특별시\"");
        assertThat(service.search("서울숲역").getFirst().region()).isEqualTo("서울특별시");
    }
    @Test void refusesUnsafeProviderConfiguration() {
        for (String url : new String[]{"http://example.com/search", "https://user:password@example.com/search", "https://example.com/search?q=x", "file:///tmp/search"})
            assertThatThrownBy(() -> new PlaceSearchService(new ObjectMapper(), url, true)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void timesOutAndReleasesSlot() throws Exception {
        entered = new CountDownLatch(1); release = new CountDownLatch(1);
        fails(503, () -> service.search("서울숲역")); release.countDown(); entered = null; advance(Duration.ofSeconds(7));
        assertThat(service.search("다른 장소")).hasSize(1);
    }
}
