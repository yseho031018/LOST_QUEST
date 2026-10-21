package com.lostquest.security;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Social login settings. The Google client id is public (the browser sends it to Google as well); a blank id
 * only disables Google login. No client secret is needed because the server verifies Google's signed ID token.
 */
@ConfigurationProperties(prefix = "app.social-login")
public record SocialLoginProperties(@DefaultValue Google google) {

    public record Google(String clientId) {
        public boolean configured() {
            return clientId != null && !clientId.isBlank();
        }
    }
}
