package com.lostquest.dto;

import com.lostquest.entity.GameScore;

import java.time.Instant;
import java.util.List;

public record GameScoreResponse(Long id, String nickname, int score, int solved, int bestCombo, Instant playedAt) {
    public static GameScoreResponse from(GameScore score) {
        return new GameScoreResponse(score.getId(), score.getNickname(), score.getScore(), score.getSolved(), score.getBestCombo(), score.getCreatedAt());
    }

    /** The saved run's rank (1-based, over all runs) and the current top 10. */
    public record Saved(long rank, GameScoreResponse entry, List<GameScoreResponse> ranking) {}
}
