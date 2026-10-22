package com.lostquest.entity;
import jakarta.persistence.*;
/** One finished 미니게임 run shared on the ranking. Nickname only: no account is linked. */
@Entity
@Table(name = "game_scores", indexes = @Index(name = "idx_game_scores_rank", columnList = "score, id"))
public class GameScore extends BaseEntity {
    @Column(nullable = false, length = 12)
    private String nickname;
    @Column(nullable = false)
    private int score;
    @Column(nullable = false)
    private int solved;
    @Column(name = "best_combo", nullable = false)
    private int bestCombo;
    protected GameScore() {}
    public GameScore(String nickname, int score, int solved, int bestCombo) {
        this.nickname = nickname; this.score = score; this.solved = solved; this.bestCombo = bestCombo;
    }
    public String getNickname() { return nickname; }
    public int getScore() { return score; }
    public int getSolved() { return solved; }
    public int getBestCombo() { return bestCombo; }
}
