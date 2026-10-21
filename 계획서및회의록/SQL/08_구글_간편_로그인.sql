-- 2026-10-21: 구글 간편 로그인을 위한 스키마 변경.
-- 기존 회원·물품 데이터는 이동·복사·삭제하지 않습니다. 이메일 회원의 BCrypt 비밀번호 해시도 그대로 둡니다.
-- dev의 ddl-auto=update는 social_accounts 테이블은 자동으로 만들지만, 기존 users.password 열의 NOT NULL은 바꾸지 않습니다.
-- 따라서 1번 ALTER TABLE은 기존 DB에 직접 실행해야 합니다. 실행하지 않으면 구글로 처음 가입할 때 409(DATA_CONFLICT)가 납니다.
-- 운영 환경에서는 백업 후 새 서버 실행 전에 적용합니다.
USE lost_quest;

-- 1. 구글로 가입한 회원은 비밀번호가 없습니다(NULL). 이메일 회원은 계속 BCrypt 해시를 저장합니다.
ALTER TABLE users MODIFY COLUMN password varchar(60) COLLATE utf8mb4_unicode_ci NULL;

-- 2. 회원과 외부 로그인 계정의 연결. 구글 계정은 이메일이 아니라 구글의 고유 사용자 ID(sub)로 찾습니다.
--    카카오를 추가할 때는 provider enum에 값을 더하는 ALTER TABLE이 필요합니다.
CREATE TABLE IF NOT EXISTS social_accounts (
    id bigint NOT NULL AUTO_INCREMENT,
    created_at datetime(6) NOT NULL COMMENT '서버 생성 UTC 연결 시각',
    user_id bigint NOT NULL,
    provider enum('GOOGLE') NOT NULL,
    provider_user_id varchar(255) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_social_provider_user (provider, provider_user_id),
    UNIQUE KEY uk_social_user_provider (user_id, provider),
    CONSTRAINT fk_social_account_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 확인: password의 Null 값이 YES이고, 구글로 가입한 회원이 연결되어 보이면 적용된 것입니다.
SHOW COLUMNS FROM users LIKE 'password';
SELECT u.id, u.email, u.nickname, s.provider, s.created_at
FROM social_accounts s JOIN users u ON u.id = s.user_id;
