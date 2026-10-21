package com.lostquest.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * No userId, status or imageUrl: the author comes from the JWT, the status is always LOST,
 * and image upload is not implemented yet. Unknown JSON fields are ignored by Jackson.
 */
public record CreateLostItemRequest(
        @NotBlank @Size(max = ItemFieldRules.TITLE_MAX) String title,
        @NotBlank @Pattern(regexp = ItemFieldRules.CATEGORY_PATTERN, message = ItemFieldRules.CATEGORY_MESSAGE) String category,
        @NotBlank @Size(max = ItemFieldRules.COLOR_MAX) String color,
        @NotBlank @Size(min = ItemFieldRules.DESCRIPTION_MIN, max = ItemFieldRules.DESCRIPTION_MAX) String description,
        @NotNull @PastOrPresent LocalDate lostDate,
        @NotBlank @Pattern(regexp = ItemFieldRules.REGION_PATTERN, message = ItemFieldRules.REGION_MESSAGE) String region,
        @NotBlank @Size(max = ItemFieldRules.LOCATION_MAX) String location,
        Double latitude,
        Double longitude
) {
    public CreateLostItemRequest(String title, String category, String color, String description, LocalDate lostDate, String region, String location) {
        this(title, category, color, description, lostDate, region, location, null, null);
    }

    @com.fasterxml.jackson.annotation.JsonIgnore
    @jakarta.validation.constraints.AssertTrue(message = "위도와 경도를 함께 올바른 범위로 입력해 주세요.")
    public boolean isCoordinatesValid() {
        return com.lostquest.validation.ItemCoordinates.valid(latitude, longitude);
    }
}
