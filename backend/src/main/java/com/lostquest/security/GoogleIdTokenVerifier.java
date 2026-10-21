package com.lostquest.security;

import com.lostquest.entity.SocialProvider;
import com.lostquest.exception.AuthenticationFailedException;
import com.lostquest.exception.SocialLoginUnavailableException;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

/**
 * Verifies the ID token that Google Identity Services hands the browser ("credential"): Google's RS256
 * signature (keys fetched from Google and cached), issuer, audience = our client id, and expiry. The token
 * is used once to identify the user and is never stored.
 */
@Component
public class GoogleIdTokenVerifier {

    static final String JWK_SET_URI = "https://www.googleapis.com/oauth2/v3/certs";
    private static final Set<String> ISSUERS = Set.of("https://accounts.google.com", "accounts.google.com");

    private final NimbusJwtDecoder decoder;

    @Autowired
    public GoogleIdTokenVerifier(SocialLoginProperties properties) {
        this(properties.google().clientId(), properties.google().configured() ? remoteDecoder() : null);
    }

    /** {@code signatureDecoder} checks signatures only; null leaves Google login disabled. */
    GoogleIdTokenVerifier(String clientId, NimbusJwtDecoder signatureDecoder) {
        this.decoder = signatureDecoder;
        if (decoder != null) {
            String audience = clientId.trim();
            decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                    new JwtTimestampValidator(),
                    new JwtClaimValidator<Object>(JwtClaimNames.ISS, issuer -> issuer != null && ISSUERS.contains(issuer.toString())),
                    new JwtClaimValidator<List<String>>(JwtClaimNames.AUD, audiences -> audiences != null && audiences.contains(audience))));
        }
    }

    public SocialIdentity verify(String credential) {
        if (decoder == null) {
            throw new SocialLoginUnavailableException("이 서버에는 구글 로그인이 설정되어 있지 않아요.");
        }
        Jwt token;
        try {
            token = decoder.decode(credential);
        } catch (BadJwtException ex) {
            // Forged, expired, or issued for another app.
            throw new AuthenticationFailedException("INVALID_SOCIAL_TOKEN", "구글 로그인 정보를 확인하지 못했어요. 다시 시도해 주세요.");
        } catch (JwtException ex) {
            // Google's signing keys could not be fetched.
            throw new SocialLoginUnavailableException("구글 로그인 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
        }
        String subject = token.getSubject();
        if (subject == null || subject.isBlank()) {
            throw new AuthenticationFailedException("INVALID_SOCIAL_TOKEN", "구글 로그인 정보를 확인하지 못했어요. 다시 시도해 주세요.");
        }
        String email = Boolean.TRUE.equals(token.getClaimAsBoolean("email_verified")) ? token.getClaimAsString("email") : null;
        return new SocialIdentity(SocialProvider.GOOGLE, subject, email, token.getClaimAsString("name"));
    }

    private static NimbusJwtDecoder remoteDecoder() {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(5));
        requestFactory.setReadTimeout(Duration.ofSeconds(5));
        return NimbusJwtDecoder.withJwkSetUri(JWK_SET_URI)
                .jwsAlgorithm(SignatureAlgorithm.RS256)
                .restOperations(new RestTemplate(requestFactory))
                .build();
    }
}
