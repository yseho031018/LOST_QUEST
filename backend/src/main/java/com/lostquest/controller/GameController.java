package com.lostquest.controller;

import com.lostquest.dto.GameScoreRequest;
import com.lostquest.dto.GameScoreResponse;
import com.lostquest.service.GameScoreService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 미니게임 ranking shared by every visitor. Public: no login is needed to read or submit. */
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
    public GameScoreResponse.Saved submit(@Valid @RequestBody GameScoreRequest request) {
        return service.submit(request);
    }
}
