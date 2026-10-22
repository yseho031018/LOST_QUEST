package com.lostquest.service;

import com.lostquest.dto.GameScoreRequest;
import com.lostquest.dto.GameScoreResponse;
import com.lostquest.entity.GameScore;
import com.lostquest.entity.User;
import com.lostquest.entity.UserRole;
import com.lostquest.exception.InvalidRequestParameterException;
import com.lostquest.exception.ResourceNotFoundException;
import com.lostquest.repository.GameScoreRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** Shared 미니게임 ranking (all-time top 10). Nickname only; runs that the game rules cannot produce are refused. */
@Service
@Transactional(readOnly = true)
public class GameScoreService {
    static final int NICKNAME_MAX = 12;
    // Game rules (QuestGamePage): 60 seconds; each correct answer is worth 100 + 30 per level above 쉬움 (up to +90)
    // + 20 per combo step (up to +100), so 100-290 points, always a multiple of 10.
    static final int MAX_SOLVED = 60;
    static final int MIN_POINTS_PER_SOLVE = 100;
    static final int MAX_POINTS_PER_SOLVE = 290;
    // A game lasts a minute, so one player saves at most about once a minute; visitors on one school network share an address.
    static final int SUBMITS_PER_MINUTE_PER_ADDRESS = 10;

    private final GameScoreRepository scores;
    private final CommunityWriteLimiter limiter;
    private final CurrentUserReader users;

    public GameScoreService(GameScoreRepository scores, CommunityWriteLimiter limiter, CurrentUserReader users) {
        this.scores = scores;
        this.limiter = limiter;
        this.users = users;
    }

    public List<GameScoreResponse> ranking() {
        return scores.findTop10ByOrderByScoreDescIdAsc().stream().map(GameScoreResponse::from).toList();
    }

    @Transactional
    public GameScoreResponse.Saved submit(GameScoreRequest request, String clientAddress) {
        String nickname = cleanNickname(request.nickname());
        if (nickname.isEmpty()) throw new InvalidRequestParameterException("nickname", "닉네임을 1~12자로 입력해 주세요.");
        if (NicknameFilter.isBlocked(nickname)) throw new InvalidRequestParameterException("nickname", "사용할 수 없는 닉네임이에요. 다른 닉네임을 입력해 주세요.");
        boolean possible = request.solved() <= MAX_SOLVED
                && request.bestCombo() <= request.solved()
                && request.score() % 10 == 0
                && request.score() >= request.solved() * MIN_POINTS_PER_SOLVE
                && request.score() <= request.solved() * MAX_POINTS_PER_SOLVE;
        if (!possible) throw new InvalidRequestParameterException("score", "게임 규칙으로 나올 수 없는 기록이에요.");
        limiter.check(clientAddress, "game-score", SUBMITS_PER_MINUTE_PER_ADDRESS);
        GameScore saved = scores.saveAndFlush(new GameScore(nickname, request.score(), request.solved(), request.bestCombo()));
        return new GameScoreResponse.Saved(scores.countAhead(saved.getScore(), saved.getId()) + 1, GameScoreResponse.from(saved), ranking());
    }

    /** Removes one run from the shared ranking (an abusive nickname, a test run). Administrators only. */
    @Transactional
    public List<GameScoreResponse> delete(String subject, Long id) {
        User viewer = users.require(subject);
        // The role is re-read from MySQL, so a stale ADMIN token cannot delete after a demotion.
        if (viewer.getRole() != UserRole.ADMIN) throw new AccessDeniedException("관리자만 처리할 수 있습니다.");
        GameScore score = scores.findById(id).orElseThrow(() -> new ResourceNotFoundException("랭킹 기록을 찾을 수 없습니다."));
        scores.delete(score);
        return ranking();
    }

    /** Same rule as the game screen: no control characters, single spaces, at most 12 characters. */
    static String cleanNickname(String value) {
        String text = value == null ? "" : value.replaceAll("\\p{Cntrl}", "").replaceAll("\\s+", " ").strip();
        return text.codePoints().limit(NICKNAME_MAX).collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append).toString();
    }
}
