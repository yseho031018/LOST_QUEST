package com.lostquest.security;

import com.lostquest.entity.SocialProvider;

/**
 * A user confirmed by an external provider. {@code email} is set only when the provider vouches that the
 * address is verified; otherwise it is null and the user is asked to enter one.
 */
public record SocialIdentity(SocialProvider provider, String providerUserId, String email, String name) {
}
