package com.lostquest.exception;

/** Social login is not configured on this server, or the provider could not be reached. Mapped to 503. */
public class SocialLoginUnavailableException extends RuntimeException {
    public SocialLoginUnavailableException(String message) {
        super(message);
    }
}
