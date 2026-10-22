package com.lostquest.controller;

import com.lostquest.repository.GameScoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.hasSize;
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

    @BeforeEach
    void clear() {
        scores.deleteAll();
    }

    private ResultActions submit(String nickname, int score, int solved, int bestCombo) throws Exception {
        String body = """
                {"nickname":"%s","score":%d,"solved":%d,"bestCombo":%d}""".formatted(nickname, score, solved, bestCombo);
        return mockMvc.perform(post("/api/game/scores").contentType(MediaType.APPLICATION_JSON).content(body));
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
}
