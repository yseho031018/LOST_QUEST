package com.lostquest.service;

import com.lostquest.dto.AuthUserResponse;
import com.lostquest.dto.GoogleLoginRequest;
import com.lostquest.dto.LoginResponse;
import com.lostquest.dto.SocialLoginResponse;
import com.lostquest.entity.SocialAccount;
import com.lostquest.entity.User;
import com.lostquest.entity.UserRole;
import com.lostquest.exception.DuplicateEmailException;
import com.lostquest.repository.SocialAccountRepository;
import com.lostquest.repository.UserRepository;
import com.lostquest.security.GoogleIdTokenVerifier;
import com.lostquest.security.JwtTokenProvider;
import com.lostquest.security.SocialIdentity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class SocialLoginService {

    /** Same limit as the signup and nickname-change forms (UTF-16 length). */
    private static final int MAX_NICKNAME_LENGTH = 20;
    private static final String DEFAULT_NICKNAME = "구글 회원";

    private final GoogleIdTokenVerifier googleIdTokenVerifier;
    private final SocialAccountRepository socialAccountRepository;
    private final UserRepository userRepository;
    private final JwtTokenProvider jwtTokenProvider;

    public SocialLoginService(GoogleIdTokenVerifier googleIdTokenVerifier, SocialAccountRepository socialAccountRepository,
            UserRepository userRepository, JwtTokenProvider jwtTokenProvider) {
        this.googleIdTokenVerifier = googleIdTokenVerifier;
        this.socialAccountRepository = socialAccountRepository;
        this.userRepository = userRepository;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @Transactional
    public SocialLoginResponse loginWithGoogle(GoogleLoginRequest request) {
        return signIn(googleIdTokenVerifier.verify(request.credential()), request.email());
    }

    /**
     * A linked provider account signs straight in. A new one joins the existing account with the same email when
     * the provider verified that email (expo decision: convenience over the pre-registration risk, since signup does
     * not verify email), or creates a password-less USER. An email the visitor typed in is never linked: it is unproven.
     */
    private SocialLoginResponse signIn(SocialIdentity identity, String enteredEmail) {
        Optional<SocialAccount> linked = socialAccountRepository.findByProviderAndProviderUserId(identity.provider(), identity.providerUserId());
        if (linked.isPresent()) {
            return issue(linked.get().getUser());
        }
        boolean verifiedByProvider = identity.email() != null;
        String email = verifiedByProvider ? identity.email() : enteredEmail;
        if (email == null) {
            return SocialLoginResponse.emailRequired();
        }
        email = email.trim().toLowerCase(Locale.ROOT);
        Optional<User> existing = userRepository.findByEmail(email);
        if (existing.isPresent()) {
            User user = existing.get();
            if (!verifiedByProvider) {
                throw new DuplicateEmailException("이미 가입된 이메일이에요. 기존 계정은 이메일과 비밀번호로 로그인해 주세요.");
            }
            if (socialAccountRepository.existsByUserIdAndProvider(user.getId(), identity.provider())) {
                throw new DuplicateEmailException("이 계정에는 다른 구글 계정이 이미 연결되어 있어요. 이메일과 비밀번호로 로그인해 주세요.");
            }
            socialAccountRepository.saveAndFlush(new SocialAccount(user, identity.provider(), identity.providerUserId()));
            return issue(user);
        }
        // A concurrent first sign-in for the same email or provider account hits a unique key and is reported as 409.
        User user = userRepository.save(User.withoutPassword(email, nickname(identity.name()), UserRole.USER));
        socialAccountRepository.saveAndFlush(new SocialAccount(user, identity.provider(), identity.providerUserId()));
        return issue(user);
    }

    private SocialLoginResponse issue(User user) {
        JwtTokenProvider.IssuedToken token = jwtTokenProvider.issueAccessToken(user);
        return SocialLoginResponse.signedIn(LoginResponse.bearer(token.value(), token.expiresInSeconds(), AuthUserResponse.from(user)));
    }

    /** The provider's display name, cut to the nickname limit without splitting a surrogate pair. */
    static String nickname(String name) {
        String value = name == null ? "" : name.strip();
        if (value.isEmpty()) {
            return DEFAULT_NICKNAME;
        }
        if (value.length() <= MAX_NICKNAME_LENGTH) {
            return value;
        }
        int end = MAX_NICKNAME_LENGTH;
        if (Character.isHighSurrogate(value.charAt(end - 1))) {
            end--;
        }
        return value.substring(0, end).strip();
    }
}
