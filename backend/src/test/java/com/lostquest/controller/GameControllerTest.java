package com.lostquest.controller;

import com.lostquest.entity.User;
import com.lostquest.entity.UserRole;
import com.lostquest.repository.GameScoreRepository;
import com.lostquest.repository.UserRepository;
import com.lostquest.security.JwtTokenProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GameControllerTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private GameScoreRepository scores;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtTokenProvider tokens;
    @Autowired
    private PasswordEncoder passwords;
    private final List<User> created = new ArrayList<>();

    @BeforeEach
    void clear() {
        scores.deleteAll();
    }

    @AfterEach
    void removeUsers() {
        users.deleteAll(created);
        created.clear();
    }

    /** Each run comes from its own visitor address unless one is given, so the per-address limit stays out of the way. */
    private ResultActions submit(String nickname, int score, int solved, int bestCombo) throws Exception {
        return submitFrom(UUID.randomUUID().toString(), nickname, score, solved, bestCombo);
    }

    private ResultActions submitFrom(String address, String nickname, int score, int solved, int bestCombo) throws Exception {
        String body = """
                {"nickname":"%s","score":%d,"solved":%d,"bestCombo":%d}""".formatted(nickname, score, solved, bestCombo);
        return mockMvc.perform(post("/api/game/scores").header("CF-Connecting-IP", address)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private String tokenFor(UserRole role) {
        User user = users.save(new User("game-" + UUID.randomUUID() + "@lostquest.test", passwords.encode("Quest1234!"), "게임" + role, role));
        created.add(user);
        return tokens.issueAccessToken(user).value();
    }

    @Test
    void anyoneCanSubmitAndReadTheSharedRankingWithoutLogin() throws Exception {
        submit("탐정A", 1200, 10, 6).andExpect(status().isCreated())
                .andExpect(jsonPath("$.rank").value(1))
                .andExpect(jsonPath("$.entry.nickname").value("탐정A"));
        submit("탐정B", 1500, 12, 8).andExpect(status().isCreated()).andExpect(jsonPath("$.rank").value(1));
        submit("탐정C", 1200, 10, 4).andExpect(status().isCreated()).andExpect(jsonPath("$.rank").value(3));  // a tie stays behind the earlier run
        mockMvc.perform(get("/api/game/ranking"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[0].nickname").value("탐정B"))
                .andExpect(jsonPath("$[1].nickname").value("탐정A"))
                .andExpect(jsonPath("$[2].nickname").value("탐정C"))
                .andExpect(jsonPath("$[0].playedAt").exists());
    }

    @Test
    void theRankingShowsTheTopTenWhileLaterRunsStillGetTheirRank() throws Exception {
        for (int i = 1; i <= 11; i++) submit("p" + i, 100 * i, i, 0).andExpect(status().isCreated());
        submit("last", 100, 1, 0).andExpect(status().isCreated())
                .andExpect(jsonPath("$.rank").value(12))
                .andExpect(jsonPath("$.ranking", hasSize(10)));
    }

    @Test
    void nicknamesAreCleanedLikeOnTheGameScreen() throws Exception {
        submit("  열두 글자가   넘는 아주 긴 닉네임  ", 300, 3, 2).andExpect(status().isCreated())
                .andExpect(jsonPath("$.entry.nickname").value("열두 글자가 넘는 아주"));
        submit("   ", 300, 3, 2).andExpect(status().isBadRequest());
    }

    @Test
    void runsTheGameRulesCannotProduceAreRefused() throws Exception {
        submit("cheat", 99_990, 10, 5).andExpect(status().isBadRequest());   // more than 290 points per answer
        submit("cheat", 900, 10, 5).andExpect(status().isBadRequest());      // less than 100 points per answer
        submit("cheat", 1205, 10, 5).andExpect(status().isBadRequest());     // not a multiple of 10
        submit("cheat", 1200, 10, 11).andExpect(status().isBadRequest());    // combo longer than the answers
        submit("cheat", 17_400, 61, 5).andExpect(status().isBadRequest());   // more answers than 60 seconds allow
        submit("cheat", 0, 0, 0).andExpect(status().isBadRequest());         // nothing solved
        mockMvc.perform(get("/api/game/ranking")).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void abusiveAndStaffLikeNicknamesAreRefused() throws Exception {
        for (String name : List.of("씨발", "시 1 발", "ㅅㅂ", "F.u.c.k", "병신같다", "관리자", "Admin"))
            submit(name, 300, 3, 2).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors[0].message").value("사용할 수 없는 닉네임이에요. 다른 닉네임을 입력해 주세요."));
        submit("셜록 홈즈", 300, 3, 2).andExpect(status().isCreated());
        submit("시바견 사랑", 300, 3, 2).andExpect(status().isCreated());
        mockMvc.perform(get("/api/game/ranking")).andExpect(jsonPath("$", hasSize(2)));
    }

    @Test
    void oneAddressCanSaveTenRunsAMinute() throws Exception {
        for (int i = 0; i < 10; i++) submitFrom("203.0.113.7", "p" + i, 300, 3, 2).andExpect(status().isCreated());
        submitFrom("203.0.113.7", "p10", 300, 3, 2).andExpect(status().isTooManyRequests());
        submitFrom("203.0.113.8", "other", 300, 3, 2).andExpect(status().isCreated());
    }

    @Test
    void onlyAnAdministratorCanDeleteARun() throws Exception {
        submit("남길 기록", 600, 5, 2).andExpect(status().isCreated());
        long id = scores.findAll().get(0).getId();
        mockMvc.perform(delete("/api/game/scores/{id}", id)).andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/game/scores/{id}", id).header("Authorization", "Bearer " + tokenFor(UserRole.USER)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/game/ranking")).andExpect(jsonPath("$[0].id").value(id));

        String admin = "Bearer " + tokenFor(UserRole.ADMIN);
        mockMvc.perform(delete("/api/game/scores/{id}", id).header("Authorization", admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        mockMvc.perform(delete("/api/game/scores/{id}", id).header("Authorization", admin)).andExpect(status().isNotFound());
    }
}
