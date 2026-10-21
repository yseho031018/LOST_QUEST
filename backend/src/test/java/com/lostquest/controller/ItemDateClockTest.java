package com.lostquest.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lostquest.entity.User;
import com.lostquest.entity.UserRole;
import com.lostquest.repository.UserRepository;
import com.lostquest.security.JwtTokenProvider;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Map;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Request and entity validation share the Korean item calendar, so a date the request accepts is never rejected on insert. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ItemDateClockTest {

    @TestBean
    private Clock itemDateClock;

    // 00:30 KST on 2100-01-02 while UTC is still on the 1st; the JVM's own calendar is always behind it.
    static Clock itemDateClock() {
        return Clock.fixed(Instant.parse("2100-01-01T15:30:00Z"), ZoneId.of("Asia/Seoul"));
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @DisplayName("한국 날짜 기준 오늘은 요청·저장 검증 모두 통과(201), 내일은 400")
    void koreanTodayPassesRequestAndEntityValidation() throws Exception {
        User author = userRepository.save(new User("date-author@lostquest.test", passwordEncoder.encode("Quest1234!"), "작성자", UserRole.USER));
        String token = jwtTokenProvider.issueAccessToken(author).value();
        for (String type : new String[]{"lost", "found"}) {
            postItem(type, "2100-01-02", token)
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$." + type + "Date").value("2100-01-02"));
            postItem(type, "2100-01-03", token)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors[*].field", hasItem(type + "Date")));
        }
    }

    private ResultActions postItem(String type, String date, String bearer) throws Exception {
        Map<String, Object> body = Map.of("title", "검은색 가죽 지갑", "category", "지갑", "color", "검정",
                "description", "검은색 반지갑입니다. 겉면에 작은 스크래치가 있어요.", type + "Date", date,
                "region", "서울", "location", "서울 성동구 서울숲역 3번 출구");
        return mockMvc.perform(post("/api/" + type + "-items")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearer)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }
}
