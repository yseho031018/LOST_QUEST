package com.lostquest.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lostquest.entity.SocialProvider;
import com.lostquest.entity.User;
import com.lostquest.exception.AuthenticationFailedException;
import com.lostquest.exception.SocialLoginUnavailableException;
import com.lostquest.repository.SocialAccountRepository;
import com.lostquest.repository.UserRepository;
import com.lostquest.security.GoogleIdTokenVerifier;
import com.lostquest.security.SocialIdentity;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Google's token check is mocked here; GoogleIdTokenVerifierTest covers signature, issuer, audience and expiry.
 * The mock gives this class its own Spring context, so it also gets its own H2 database: recreating the shared
 * one would restart user ids under contexts that are still cached (and their per-user write limiter).
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:lostquest-social-login;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class SocialLoginControllerTest {

    private static final String CREDENTIAL = "google-id-token";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private UserRepository userRepository;
    @Autowired private SocialAccountRepository socialAccountRepository;
    @MockitoBean private GoogleIdTokenVerifier googleIdTokenVerifier;

    @Test
    void firstGoogleSignInCreatesPasswordlessUserAndSignsIn() throws Exception {
        googleReturns("google-1", "Hunter@Gmail.com", "로스트 헌터");

        JsonNode body = json(googleLogin(null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SIGNED_IN"))
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.expiresIn").value(3600))
                .andExpect(jsonPath("$.user.email").value("hunter@gmail.com"))
                .andExpect(jsonPath("$.user.nickname").value("로스트 헌터"))
                .andExpect(jsonPath("$.user.role").value("USER"))
                .andExpect(jsonPath("$.user.hasPassword").value(false)));

        User saved = userRepository.findByEmail("hunter@gmail.com").orElseThrow();
        assertThat(saved.getPassword()).isNull();
        assertThat(socialAccountRepository.findByProviderAndProviderUserId(SocialProvider.GOOGLE, "google-1"))
                .hasValueSatisfying(account -> assertThat(account.getUser().getId()).isEqualTo(saved.getId()));
        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + body.get("accessToken").asText()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(saved.getId()))
                .andExpect(jsonPath("$.hasPassword").value(false));
    }

    @Test
    void returningGoogleUserSignsIntoTheSameAccountEvenIfTheGoogleEmailChanged() throws Exception {
        googleReturns("google-1", "hunter@gmail.com", "헌터");
        long firstId = json(googleLogin(null).andExpect(status().isOk())).get("user").get("id").asLong();

        googleReturns("google-1", "renamed@gmail.com", "다른 이름");
        googleLogin(null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SIGNED_IN"))
                .andExpect(jsonPath("$.user.id").value(firstId))
                .andExpect(jsonPath("$.user.email").value("hunter@gmail.com"))
                .andExpect(jsonPath("$.user.nickname").value("헌터"));
        assertThat(userRepository.count()).isEqualTo(1);
        assertThat(socialAccountRepository.count()).isEqualTo(1);
    }

    @Test
    void googleEmailOfAnExistingPasswordAccountIsNotLinked() throws Exception {
        mockMvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", "hunter@gmail.com", "password", "Quest1234!", "nickname", "기존"))))
                .andExpect(status().isCreated());
        googleReturns("google-1", "hunter@gmail.com", "헌터");

        googleLogin(null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_EXISTS"))
                .andExpect(jsonPath("$.message").value("이미 가입된 이메일이에요. 기존 계정은 이메일과 비밀번호로 로그인해 주세요."));
        assertThat(socialAccountRepository.count()).isZero();
        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", "hunter@gmail.com", "password", "Quest1234!"))))
                .andExpect(status().isOk());
    }

    @Test
    void missingVerifiedEmailAsksForOneWithoutSavingAnything() throws Exception {
        googleReturns("google-2", null, "이메일없음");

        googleLogin(null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("EMAIL_REQUIRED"))
                .andExpect(jsonPath("$.accessToken").doesNotExist())
                .andExpect(jsonPath("$.user").doesNotExist());
        assertThat(userRepository.count()).isZero();
        assertThat(socialAccountRepository.count()).isZero();

        googleLogin("  New.Hunter@Example.com ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SIGNED_IN"))
                .andExpect(jsonPath("$.user.email").value("new.hunter@example.com"))
                .andExpect(jsonPath("$.user.nickname").value("이메일없음"));
        assertThat(socialAccountRepository.findByProviderAndProviderUserId(SocialProvider.GOOGLE, "google-2")).isPresent();
    }

    @Test
    void enteredEmailUsesTheSignupEmailRules() throws Exception {
        googleLogin("da@ee")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.errors[*].field", hasItem("email")));
        verify(googleIdTokenVerifier, never()).verify(anyString());
        assertThat(userRepository.count()).isZero();
    }

    @Test
    void enteredEmailThatIsAlreadyRegisteredIsRejected() throws Exception {
        googleReturns("google-1", "hunter@gmail.com", "헌터");
        googleLogin(null).andExpect(status().isOk());
        googleReturns("google-2", null, "둘째");

        googleLogin("HUNTER@gmail.com")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_EXISTS"));
        assertThat(socialAccountRepository.count()).isEqualTo(1);
    }

    @Test
    void enteredEmailIsIgnoredWhenGoogleVerifiedOne() throws Exception {
        googleReturns("google-1", "hunter@gmail.com", "헌터");

        googleLogin("other@example.com")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value("hunter@gmail.com"));
        assertThat(userRepository.existsByEmail("other@example.com")).isFalse();
    }

    @Test
    void googleNameIsCutToTheNicknameLimitAndBlankNamesGetADefault() throws Exception {
        googleReturns("google-1", "long@gmail.com", "  가나다라마바사아자차카타파하가나다라마바사아자  ");
        googleLogin(null).andExpect(jsonPath("$.user.nickname").value("가나다라마바사아자차카타파하가나다라마바"));

        googleReturns("google-2", "blank@gmail.com", "   ");
        googleLogin(null).andExpect(jsonPath("$.user.nickname").value("구글 회원"));
    }

    @Test
    void rejectedGoogleTokenIs401() throws Exception {
        when(googleIdTokenVerifier.verify(CREDENTIAL))
                .thenThrow(new AuthenticationFailedException("INVALID_SOCIAL_TOKEN", "구글 로그인 정보를 확인하지 못했어요. 다시 시도해 주세요."));

        googleLogin(null)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_SOCIAL_TOKEN"));
        assertThat(userRepository.count()).isZero();
    }

    @Test
    void unconfiguredGoogleLoginIs503() throws Exception {
        when(googleIdTokenVerifier.verify(CREDENTIAL))
                .thenThrow(new SocialLoginUnavailableException("이 서버에는 구글 로그인이 설정되어 있지 않아요."));

        googleLogin(null)
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("SOCIAL_LOGIN_UNAVAILABLE"))
                .andExpect(jsonPath("$.message").value("이 서버에는 구글 로그인이 설정되어 있지 않아요."));
    }

    @Test
    void blankCredentialIs400() throws Exception {
        mockMvc.perform(post("/api/auth/social/google").contentType(MediaType.APPLICATION_JSON).content("{\"credential\":\" \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[*].field", hasItem("credential")));
    }

    @Test
    void googleAccountCannotSignInWithAPassword() throws Exception {
        googleReturns("google-1", "hunter@gmail.com", "헌터");
        googleLogin(null).andExpect(status().isOk());

        // The login timing equalizer's own input must not unlock a password-less account.
        for (String password : new String[]{"lost-quest-timing-equalizer", "Quest1234!"}) {
            mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of("email", "hunter@gmail.com", "password", password))))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        }
    }

    @Test
    void googleAccountHasNoPasswordToChange() throws Exception {
        googleReturns("google-1", "hunter@gmail.com", "헌터");
        String token = json(googleLogin(null)).get("accessToken").asText();

        mockMvc.perform(put("/api/auth/me/password").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("currentPassword", "anything", "newPassword", "NewQuest5678!"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("currentPassword"))
                .andExpect(jsonPath("$.errors[0].message").value("소셜 로그인 계정은 비밀번호가 없어 변경할 수 없습니다."));
        assertThat(userRepository.findByEmail("hunter@gmail.com").orElseThrow().getPassword()).isNull();
    }

    private void googleReturns(String subject, String email, String name) {
        when(googleIdTokenVerifier.verify(CREDENTIAL)).thenReturn(new SocialIdentity(SocialProvider.GOOGLE, subject, email, name));
    }

    private ResultActions googleLogin(String email) throws Exception {
        Map<String, String> body = new HashMap<>();
        body.put("credential", CREDENTIAL);
        if (email != null) {
            body.put("email", email);
        }
        return mockMvc.perform(post("/api/auth/social/google").contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    private JsonNode json(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
    }
}
