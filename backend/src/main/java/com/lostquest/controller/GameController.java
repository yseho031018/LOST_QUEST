package com.lostquest.controller;

import com.lostquest.dto.GameScoreRequest;
import com.lostquest.dto.GameScoreResponse;
import com.lostquest.service.GameScoreService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 미니게임 ranking shared by every visitor. Public: no login is needed to read or submit; only administrators delete. */
@RestController
@RequestMapping("/api/game")
public class GameController {
    private final GameScoreService service;

    public GameController(GameScoreService service) {
        this.service = service;
    }

    @GetMapping("/ranking")
    public List<GameScoreResponse> ranking() {
        return service.ranking();
    }

    @PostMapping("/scores")
    @ResponseStatus(HttpStatus.CREATED)
    public GameScoreResponse.Saved submit(@Valid @RequestBody GameScoreRequest request, HttpServletRequest http) {
        return service.submit(request, clientAddress(http));
    }

    @DeleteMapping("/scores/{id}")
    public List<GameScoreResponse> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        return service.delete(jwt.getSubject(), id);
    }

    /** Visitors arrive through the Cloudflare tunnel, which puts their address in CF-Connecting-IP. */
    private static String clientAddress(HttpServletRequest http) {
        String forwarded = http.getHeader("CF-Connecting-IP");
        return forwarded != null && !forwarded.isBlank() ? forwarded.strip() : http.getRemoteAddr();
    }
}
