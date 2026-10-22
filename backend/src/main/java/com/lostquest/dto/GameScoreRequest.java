package com.lostquest.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** A finished 미니게임 run. The service also checks the numbers against the game rules. */
public record GameScoreRequest(
        @NotBlank @Size(max = 40) String nickname,
        @Min(1) @Max(100_000) int score,
        @Min(1) @Max(200) int solved,
        @Min(0) @Max(200) int bestCombo
) {}
