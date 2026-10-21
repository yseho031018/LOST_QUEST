package com.lostquest.security;

import com.lostquest.entity.SocialProvider;
import com.lostquest.exception.AuthenticationFailedException;
import com.lostquest.exception.SocialLoginUnavailableException;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GoogleIdTokenVerifierTest {

    private static final String CLIENT_ID = "lost-quest-test.apps.googleusercontent.com";
    private static final KeyPair GOOGLE_KEY = rsaKeyPair();

    private final GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier(CLIENT_ID,
            NimbusJwtDecoder.withPublicKey((RSAPublicKey) GOOGLE_KEY.getPublic()).build());

    @Test
    void acceptsGoogleSignedTokenForThisClient() {
        SocialIdentity identity = verifier.verify(sign(GOOGLE_KEY, claims -> {}));

        assertThat(identity).isEqualTo(new SocialIdentity(SocialProvider.GOOGLE, "google-user-1", "hunter@gmail.com", "로스트 헌터"));
    }

    @Test
    void acceptsTheIssuerWithoutScheme() {
        assertThat(verifier.verify(sign(GOOGLE_KEY, claims -> claims.issuer("accounts.google.com"))).providerUserId())
                .isEqualTo("google-user-1");
    }

    @Test
    void dropsAnEmailGoogleHasNotVerified() {
        assertThat(verifier.verify(sign(GOOGLE_KEY, claims -> claims.claim("email_verified", false))).email()).isNull();
        assertThat(verifier.verify(sign(GOOGLE_KEY, claims -> claims.claims(all -> all.remove("email_verified")))).email()).isNull();
        assertThat(verifier.verify(sign(GOOGLE_KEY, claims -> claims.claims(all -> all.remove("email")))).email()).isNull();
    }

    @Test
    void rejectsTokenIssuedForAnotherApp() {
        assertInvalid(sign(GOOGLE_KEY, claims -> claims.audience(List.of("someone-else.apps.googleusercontent.com"))));
    }

    @Test
    void rejectsTokenFromAnotherIssuer() {
        assertInvalid(sign(GOOGLE_KEY, claims -> claims.issuer("https://evil.example")));
    }

    @Test
    void rejectsExpiredToken() {
        Instant issued = Instant.now().minus(3, ChronoUnit.HOURS);
        assertInvalid(sign(GOOGLE_KEY, claims -> claims.issuedAt(issued).expiresAt(issued.plus(1, ChronoUnit.HOURS))));
    }

    @Test
    void rejectsTokenNotSignedByGoogle() {
        assertInvalid(sign(rsaKeyPair(), claims -> {}));
    }

    @Test
    void rejectsMalformedToken() {
        assertInvalid("not-a-jwt");
    }

    @Test
    void reportsUnavailableWhenNotConfigured() {
        GoogleIdTokenVerifier disabled = new GoogleIdTokenVerifier(new SocialLoginProperties(new SocialLoginProperties.Google("")));

        assertThatThrownBy(() -> disabled.verify(sign(GOOGLE_KEY, claims -> {})))
                .isInstanceOf(SocialLoginUnavailableException.class);
    }

    @Test
    void reportsUnavailableWhenGoogleKeysCannotBeFetched() {
        GoogleIdTokenVerifier offline = new GoogleIdTokenVerifier(CLIENT_ID,
                NimbusJwtDecoder.withJwkSetUri("http://127.0.0.1:9/oauth2/v3/certs").build());

        assertThatThrownBy(() -> offline.verify(sign(GOOGLE_KEY, claims -> {})))
                .isInstanceOf(SocialLoginUnavailableException.class);
    }

    private void assertInvalid(String credential) {
        assertThatThrownBy(() -> verifier.verify(credential))
                .isInstanceOfSatisfying(AuthenticationFailedException.class,
                        ex -> assertThat(ex.getCode()).isEqualTo("INVALID_SOCIAL_TOKEN"));
    }

    private static String sign(KeyPair key, Consumer<JwtClaimsSet.Builder> customize) {
        RSAKey jwk = new RSAKey.Builder((RSAPublicKey) key.getPublic()).privateKey((RSAPrivateKey) key.getPrivate()).keyID("google-test").build();
        Instant now = Instant.now();
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer("https://accounts.google.com")
                .audience(List.of(CLIENT_ID))
                .subject("google-user-1")
                .issuedAt(now)
                .expiresAt(now.plus(1, ChronoUnit.HOURS))
                .claim("email", "hunter@gmail.com")
                .claim("email_verified", true)
                .claim("name", "로스트 헌터");
        customize.accept(claims);
        return new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(jwk)))
                .encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).keyId("google-test").build(), claims.build()))
                .getTokenValue();
    }

    private static KeyPair rsaKeyPair() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            return generator.generateKeyPair();
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}
