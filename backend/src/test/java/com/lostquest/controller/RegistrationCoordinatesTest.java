package com.lostquest.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lostquest.entity.*;
import com.lostquest.repository.*;
import com.lostquest.security.JwtTokenProvider;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test") @Transactional
class RegistrationCoordinatesTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired LostItemRepository lost;
    @Autowired FoundItemRepository found;
    @Autowired JwtTokenProvider jwt;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder passwords;
    String token;
    @BeforeEach void setup() { token = jwt.issueAccessToken(users.save(new User("map@lostquest.test", passwords.encode("MapTest123!"), "지도 테스트", UserRole.USER))).value(); }
    private Map<String,Object> body(String type) {
        var body = new LinkedHashMap<String,Object>();
        body.put("title", "검은색 지갑"); body.put("category", "지갑"); body.put("color", "검정"); body.put("description", "안쪽에 작은 표시가 있는 검은색 지갑입니다.");
        body.put(type + "Date", "2026-01-01"); body.put("region", "서울"); body.put("location", "서울 성동구 서울숲역");
        if (type.equals("found")) { body.put("ownershipQuestion", "안쪽 색상은?"); body.put("ownershipAnswer", "파랑"); }
        return body;
    }
    @ParameterizedTest @ValueSource(strings={"lost", "found"}) void persistsAndReturnsOptionalCoordinates(String type) throws Exception {
        var body = body(type); body.put("latitude", 37.54); body.put("longitude", 127.04);
        var response = mvc.perform(post("/api/" + type + "-items").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(body)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.latitude").value(37.54)).andExpect(jsonPath("$.longitude").value(127.04)).andReturn();
        long id = mapper.readTree(response.getResponse().getContentAsByteArray()).path("id").asLong();
        mvc.perform(get("/api/" + type + "-items/" + id)).andExpect(status().isOk()).andExpect(jsonPath("$.latitude").value(37.54));
        if (type.equals("lost")) assertThat(lost.findById(id).orElseThrow().getLongitude()).isEqualTo(127.04);
        else assertThat(found.findById(id).orElseThrow().getLongitude()).isEqualTo(127.04);
    }
    @ParameterizedTest @ValueSource(strings={"lost", "found"}) void allowsTextOnlyAndMultipartCoordinates(String type) throws Exception {
        mvc.perform(post("/api/"+type+"-items").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(body(type))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.latitude").doesNotExist()).andExpect(jsonPath("$.longitude").doesNotExist());
        var body = body(type); body.put("latitude", 37.54); body.put("longitude", 127.04);
        mvc.perform(multipart("/api/"+type+"-items").file(new MockMultipartFile("item", "item.json", "application/json", mapper.writeValueAsBytes(body))).header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.latitude").value(37.54));
    }
    @ParameterizedTest @ValueSource(strings={"lost", "found"}) void rejectsIncompleteAndOutOfRangeCoordinatesBeforeSaving(String type) throws Exception {
        for (Object[] pair : new Object[][]{{37.5,null},{null,127.0},{91.0,127.0},{37.0,-181.0}}) {
            var body = body(type); body.put("latitude", pair[0]); body.put("longitude", pair[1]);
            mvc.perform(post("/api/"+type+"-items").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(body)))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
        assertThat(lost.count()+found.count()).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"lost", "found"}) void editsKeepCoordinatesUnlessRegionOrPlaceChanges(String type) throws Exception {
        var body = body(type); body.put("latitude", 37.54); body.put("longitude", 127.04);
        var response = mvc.perform(post("/api/"+type+"-items").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(body))).andExpect(status().isCreated()).andReturn();
        long id=mapper.readTree(response.getResponse().getContentAsByteArray()).path("id").asLong();
        body.remove("latitude"); body.remove("longitude"); body.put("title", "제목 수정");
        mvc.perform(put("/api/"+type+"-items/"+id).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(body))).andExpect(status().isOk()).andExpect(jsonPath("$.latitude").value(37.54));
        body.put("location", "서울 성동구 서울숲역 2번 출구");
        mvc.perform(put("/api/"+type+"-items/"+id).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(body))).andExpect(status().isOk()).andExpect(jsonPath("$.latitude").doesNotExist()).andExpect(jsonPath("$.longitude").doesNotExist());
    }
    @Test void placeSearchRequiresLoginAndDisabledProviderMakesNoExternalCall() throws Exception {
        mvc.perform(get("/api/places/search").param("q","서울숲역")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/places/search").param("q","서울숲역").header("Authorization", "Bearer " + token)).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("PLACE_SEARCH_UNAVAILABLE"));
        mvc.perform(get("/api/places/search").param("q","a").header("Authorization", "Bearer " + token)).andExpect(status().isBadRequest());
    }
    @Test void rejectsNonFiniteCoordinatesAtEntityBoundary() {
        for (Double bad : new Double[]{Double.NaN,Double.NEGATIVE_INFINITY,Double.POSITIVE_INFINITY}) {
            assertThat(com.lostquest.validation.ItemCoordinates.valid(bad, 127.0)).isFalse();
            assertThat(com.lostquest.validation.ItemCoordinates.valid(37.0, bad)).isFalse();
        }
    }
}
