package com.lostquest.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * SIGNED_IN carries the same token fields as {@link LoginResponse}. EMAIL_REQUIRED means the provider gave no
 * verified email for a new account: nothing was saved, and the client should resend with an email.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SocialLoginResponse(
        Status status,
        String accessToken,
        String tokenType,
        Long expiresIn,
        AuthUserResponse user
) {
    public enum Status { SIGNED_IN, EMAIL_REQUIRED }

    public static SocialLoginResponse signedIn(LoginResponse login) {
        return new SocialLoginResponse(Status.SIGNED_IN, login.accessToken(), login.tokenType(), login.expiresIn(), login.user());
    }

    public static SocialLoginResponse emailRequired() {
        return new SocialLoginResponse(Status.EMAIL_REQUIRED, null, null, null, null);
    }
}
