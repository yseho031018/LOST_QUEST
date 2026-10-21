package com.lostquest.controller;

import com.lostquest.dto.AuthUserResponse;
import com.lostquest.dto.ChangePasswordRequest;
import com.lostquest.dto.GoogleLoginRequest;
import com.lostquest.dto.LoginRequest;
import com.lostquest.dto.LoginResponse;
import com.lostquest.dto.SignupRequest;
import com.lostquest.dto.SocialLoginResponse;
import com.lostquest.dto.UpdateNicknameRequest;
import com.lostquest.service.AuthService;
import com.lostquest.service.SocialLoginService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final SocialLoginService socialLoginService;

    public AuthController(AuthService authService, SocialLoginService socialLoginService) {
        this.authService = authService;
        this.socialLoginService = socialLoginService;
    }

    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthUserResponse signup(@Valid @RequestBody SignupRequest request) {
        return authService.signup(request);
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    /** Signs in, or signs up, with a Google ID token. A first sign-in without a verified email answers EMAIL_REQUIRED. */
    @PostMapping("/social/google")
    public SocialLoginResponse googleLogin(@Valid @RequestBody GoogleLoginRequest request) {
        return socialLoginService.loginWithGoogle(request);
    }

    @GetMapping("/me")
    public AuthUserResponse me(@AuthenticationPrincipal Jwt jwt) {
        return authService.getCurrentUser(jwt.getSubject());
    }

    @PutMapping("/me/nickname")
    public AuthUserResponse updateNickname(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateNicknameRequest request) {
        return authService.updateNickname(jwt.getSubject(), request);
    }

    @PutMapping("/me/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ChangePasswordRequest request) {
        authService.changePassword(jwt.getSubject(), request);
    }
}
