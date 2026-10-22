package com.lostquest.service;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;

/**
 * Public 미니게임 nicknames are shown to every visitor, so abusive words and staff-like names are refused.
 * Spaces, digits and symbols are ignored when matching ("시 1 발", "f.u.c.k").
 */
final class NicknameFilter {
    private static final List<String> BLOCKED = List.of(
        // Korean abuse (including consonant-only forms)
        "시발", "씨발", "씨빨", "시빨", "씨팔", "시팔", "씨바", "쓰바", "썅", "쌍년", "쌍놈", "병신", "븅신", "빙신", "좆", "존나",
        "개새", "개색", "개세", "개쉐", "새끼", "새기야", "미친", "미췬", "엠창", "느금", "니미", "니애미", "애미", "애비", "지랄", "염병",
        "닥쳐", "꺼져", "섹스", "보지", "자지", "걸레", "창녀", "김치녀", "일베",
        "ㅅㅂ", "ㅆㅂ", "ㅂㅅ", "ㅄ", "ㅈㄴ", "ㅈ같", "ㅗ",
        // English abuse
        "fuck", "fuk", "fck", "shit", "bitch", "sex", "porn", "dick", "pussy", "asshole", "nigger", "nigga", "cunt",
        // Names that look like the organizers
        "관리자", "운영자", "운영진", "admin", "lostquest", "로스트퀘스트");

    private NicknameFilter() {}

    static boolean isBlocked(String nickname) {
        String folded = Normalizer.normalize(nickname, Normalizer.Form.NFC).toLowerCase(Locale.ROOT)
            .replaceAll("[^\\p{L}]", "");
        return BLOCKED.stream().anyMatch(folded::contains);
    }
}
