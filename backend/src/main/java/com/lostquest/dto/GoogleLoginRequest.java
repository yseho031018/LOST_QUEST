package com.lostquest.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * {@code credential} is the ID token from Google Identity Services. {@code email} is sent only after the
 * server answered EMAIL_REQUIRED (Google gave no verified address); it is ignored otherwise.
 */
public record GoogleLoginRequest(
        @NotBlank @Size(max = 4096) String credential,
        @Email(regexp = EmailRules.PATTERN, message = EmailRules.MESSAGE) @Size(max = 254) String email
) {
    public GoogleLoginRequest {
        email = email == null || email.isBlank() ? null : email.trim();
    }
}
