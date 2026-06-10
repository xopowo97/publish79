-- ============================================================
-- [안티그래비티] Supabase DB 실전용 스키마 정의서 (SSOT)
-- 작성일: 2026-05-31  |  버전: v2.0 (실전 배포용)
-- ============================================================
-- 🔒 보안 원칙:
--   - 모든 테이블은 RLS 활성화 + anon 접근 전면 차단
--   - 오직 서비스 역할 키(service_role)를 가진 백엔드만 접근
--   - 시연용 INSERT 데이터 전면 소거 (실전 파이프라인만 수용)
-- ============================================================


-- ============================================================
-- [사전 정제] 기존 reprint_candidates 테이블 중복 isbn 데이터 안전 청소
-- isbn 컬럼이 없는 구버전 테이블 환경에서는 이 블록이 자동으로 무시됨
-- ============================================================
DO $$
BEGIN
    -- isbn 컬럼이 이미 존재하는 경우에만 중복 정리 실행
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reprint_candidates' AND column_name = 'isbn'
    ) THEN
        -- isbn이 NULL이 아니면서 중복된 레코드 중 id가 가장 작은 것만 남기고 삭제
        DELETE FROM reprint_candidates
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM reprint_candidates
            WHERE isbn IS NOT NULL
            GROUP BY isbn
        )
        AND isbn IS NOT NULL;
    END IF;
END $$;


-- ============================================================
-- ① agent_audit_logs 테이블 신설 (1번 살피미 + 12번 보안관 실제 트래픽 로그)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    agent_id    INTEGER NOT NULL,
    agent_name  TEXT NOT NULL,
    log_level   TEXT NOT NULL DEFAULT 'info',
    message     TEXT NOT NULL,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- [가드레일] log_level 허용값 제약 (info | success | warn | error 외 차단)
    CONSTRAINT chk_log_level CHECK (log_level IN ('info', 'success', 'warn', 'error'))
);

-- agent_audit_logs 인덱스 (실시간 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON agent_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_agent_id   ON agent_audit_logs (agent_id);

-- [멱등성] log_level CHECK 제약 조건 — 이미 존재하면 건너뜀 (재실행 안전)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_log_level' AND conrelid = 'agent_audit_logs'::regclass
    ) THEN
        ALTER TABLE agent_audit_logs
            ADD CONSTRAINT chk_log_level CHECK (log_level IN ('info', 'success', 'warn', 'error'));
    END IF;
EXCEPTION WHEN undefined_table THEN
    NULL; -- 테이블 자체가 없으면 무시 (CREATE TABLE이 처리)
END $$;


-- ============================================================
-- ② reprint_candidates 테이블 (없을 경우 신설)
-- ============================================================
CREATE TABLE IF NOT EXISTS reprint_candidates (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    author          TEXT,
    isbn            TEXT,                         -- UNIQUE 제약은 아래 DO 블록에서 멱등성 보장하며 추가
    pub_year        INTEGER,
    publisher       TEXT,
    library_loans   INTEGER DEFAULT 0,
    reprint_score   NUMERIC(5,2) DEFAULT 0,
    demand_index    NUMERIC(5,2) DEFAULT 0,
    is_out_of_print BOOLEAN DEFAULT true,
    status          TEXT DEFAULT 'candidate',
    is_simulated    BOOLEAN DEFAULT false,
    copyright_status TEXT DEFAULT 'protected',
    author_status   TEXT DEFAULT 'unknown',
    estimated_royalty_rate NUMERIC(4,2) DEFAULT 10.00,
    category        TEXT DEFAULT '미분류',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- [멱등성] isbn 컬럼 추가 — 이미 존재하면 건너뜀 (구버전 테이블 안전 확장)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reprint_candidates' AND column_name = 'isbn'
    ) THEN
        ALTER TABLE reprint_candidates ADD COLUMN isbn TEXT;
    END IF;
END $$;

-- [멱등성] pub_year 타입 변경 (character varying -> integer)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reprint_candidates' AND column_name = 'pub_year' AND data_type = 'character varying'
    ) THEN
        ALTER TABLE reprint_candidates 
            ALTER COLUMN pub_year TYPE INTEGER USING (NULLIF(regexp_replace(pub_year, '[^0-9]', '', 'g'), '')::integer);
    END IF;
END $$;

-- [멱등성] publisher 컬럼 추가
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reprint_candidates' AND column_name = 'publisher'
    ) THEN
        ALTER TABLE reprint_candidates ADD COLUMN publisher TEXT;
    END IF;
END $$;

-- [멱등성] demand_index 컬럼 추가
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reprint_candidates' AND column_name = 'demand_index'
    ) THEN
        ALTER TABLE reprint_candidates ADD COLUMN demand_index NUMERIC(5,2) DEFAULT 0;
    END IF;
END $$;

-- [멱등성] updated_at 컬럼 추가
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reprint_candidates' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE reprint_candidates ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- [멱등성] is_out_of_print 컬럼 추가 및 기존 is_out_print 데이터 이관 후 이전 컬럼 제거
DO $$
BEGIN
    -- 1. 신규 컬럼인 is_out_of_print가 없는 경우 추가
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reprint_candidates' AND column_name = 'is_out_of_print'
    ) THEN
        ALTER TABLE reprint_candidates ADD COLUMN is_out_of_print BOOLEAN DEFAULT true;
    END IF;

    -- 2. 이전 컬럼인 is_out_print가 있는 경우 데이터 복사 후 컬럼 삭제
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reprint_candidates' AND column_name = 'is_out_print'
    ) THEN
        UPDATE reprint_candidates SET is_out_of_print = is_out_print;
        ALTER TABLE reprint_candidates DROP COLUMN is_out_print;
    END IF;
END $$;

-- [멱등성] isbn UNIQUE 제약 조건 — 이미 존재하면 건너뜀
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'reprint_candidates_isbn_key' AND conrelid = 'reprint_candidates'::regclass
    ) THEN
        ALTER TABLE reprint_candidates ADD CONSTRAINT reprint_candidates_isbn_key UNIQUE (isbn);
    END IF;
EXCEPTION WHEN undefined_table THEN
    NULL;
END $$;

-- [멱등성] is_simulated 컬럼 추가 — 이미 존재하면 건너뜀
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reprint_candidates' AND column_name = 'is_simulated'
    ) THEN
        ALTER TABLE reprint_candidates ADD COLUMN is_simulated BOOLEAN DEFAULT false;
    END IF;
END $$;

-- [멱등성] copyright_status 컬럼 추가 — 이미 존재하면 건너뜀
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reprint_candidates' AND column_name = 'copyright_status'
    ) THEN
        ALTER TABLE reprint_candidates ADD COLUMN copyright_status TEXT DEFAULT 'protected';
    END IF;
END $$;

-- [멱등성] author_status 컬럼 추가 — 이미 존재하면 건너뜀
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reprint_candidates' AND column_name = 'author_status'
    ) THEN
        ALTER TABLE reprint_candidates ADD COLUMN author_status TEXT DEFAULT 'unknown';
    END IF;
END $$;

-- [멱등성] estimated_royalty_rate 컬럼 추가 — 이미 존재하면 건너뜀
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reprint_candidates' AND column_name = 'estimated_royalty_rate'
    ) THEN
        ALTER TABLE reprint_candidates ADD COLUMN estimated_royalty_rate NUMERIC(4,2) DEFAULT 10.00;
    END IF;
END $$;

-- [멱등성] category 컬럼 추가 — 이미 존재하면 건너뜀
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reprint_candidates' AND column_name = 'category'
    ) THEN
        ALTER TABLE reprint_candidates ADD COLUMN category TEXT DEFAULT '미분류';
    END IF;
END $$;

-- [멱등성] digital_archive_url 컬럼 추가 — 이미 존재하면 건너뜀
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reprint_candidates' AND column_name = 'digital_archive_url'
    ) THEN
        ALTER TABLE reprint_candidates ADD COLUMN digital_archive_url TEXT;
    END IF;
END $$;

-- reprint_candidates 인덱스 (복간 점수 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_reprint_score ON reprint_candidates (reprint_score DESC);


-- ============================================================
-- ③ RLS(Row Level Security) 철통 잠금
--    anon 접근 완전 차단 — service_role만 우회 가능
-- ============================================================

-- agent_audit_logs RLS 설정
ALTER TABLE agent_audit_logs ENABLE ROW LEVEL SECURITY;

-- 기존 열린 정책(USING true) 폐기
DROP POLICY IF EXISTS "서비스 역할 전체 접근" ON agent_audit_logs;

-- anon/authenticated 접근을 허용하는 정책을 일절 생성하지 않음
-- → service_role 키는 RLS를 자동 우회하므로 백엔드만 접근 가능

-- reprint_candidates RLS 설정
ALTER TABLE reprint_candidates ENABLE ROW LEVEL SECURITY;

-- 기존 열린 정책(USING true) 폐기
DROP POLICY IF EXISTS "서비스 역할 전체 접근" ON reprint_candidates;

-- anon/authenticated 접근을 허용하는 정책을 일절 생성하지 않음
-- → service_role 키는 RLS를 자동 우회하므로 백엔드만 접근 가능


-- ============================================================
-- [검증 쿼리] 스키마 정상 적용 확인
-- ============================================================
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name IN ('agent_audit_logs', 'reprint_candidates')
ORDER BY table_name, ordinal_position;
