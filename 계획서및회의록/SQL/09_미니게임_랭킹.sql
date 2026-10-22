-- 2026-10-22: 미니게임 랭킹을 서버에 저장합니다(모든 관람객이 같은 TOP 10을 봄).
-- 기존 테이블과 데이터는 바꾸지 않습니다. 새 테이블 하나만 추가합니다.
-- 운영 서버는 ddl-auto=validate로 실행되므로, 새 서버(JAR)를 켜기 전에 백업 후 이 파일을 먼저 실행합니다.
-- 로그인 없이 닉네임만 저장합니다(회원 계정과 연결하지 않음).
USE lost_quest;

CREATE TABLE IF NOT EXISTS game_scores (
    id bigint NOT NULL AUTO_INCREMENT,
    created_at datetime(6) NOT NULL COMMENT '서버 저장 UTC 시각(플레이 종료 시각)',
    nickname varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL,
    score int NOT NULL,
    solved int NOT NULL,
    best_combo int NOT NULL,
    PRIMARY KEY (id),
    KEY idx_game_scores_rank (score, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 확인: 테이블이 보이고, 랭킹 순서(점수 높은 순, 같으면 먼저 한 기록)로 조회되면 적용된 것입니다.
SHOW COLUMNS FROM game_scores;
SELECT nickname, score, solved, best_combo, created_at FROM game_scores ORDER BY score DESC, id ASC LIMIT 10;
