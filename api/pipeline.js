// api/pipeline.js
// ============================================================
// [자율 파이프라인] 1번 살피미 + 2번 다듬이 실전 결합 엔진
// ============================================================
// 역할: 국립중앙도서관 API(살피미)로 수집 → 다듬이(정제) → Supabase reprint_candidates 자동 적재
// + agent_audit_logs에 실행 로그 기록 (실시간 로그 스트림 소스)
// 담당: 안티그래비티 (Antigravity AI Agent)
// ============================================================

// ============================================================
// [보안 방어벽] Rate Limiter — IP별 분당 호출 빈도 제한
// Vercel 서버리스 인스턴스 메모리 기반 (인스턴스 초기화 시 리셋)
// 분당 10회 초과 시 429 Too Many Requests 반환
// ============================================================
const _rateLimitMap = new Map(); // { ip: { count, windowStart } }
const RATE_LIMIT_MAX = 10;        // 허용 최대 호출 수
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1분 윈도우

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = _rateLimitMap.get(ip);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        // 새 윈도우 시작
        _rateLimitMap.set(ip, { count: 1, windowStart: now });
        return true; // 허용
    }
    entry.count += 1;
    if (entry.count > RATE_LIMIT_MAX) {
        return false; // 차단
    }
    return true; // 허용
}

const LIBRARY_API_KEY = process.env.LIBRARY_API_KEY;
const LIBRARY_API_BASE = 'https://www.nl.go.kr/NL/search/openApi/search.do';

// ============================================================
// [2번 다듬이 에이전트] 수집된 원시 데이터 정제 함수
// 절판/희귀 판별 → 복간 점수 산출 → DB 표준 스키마 변환
// ============================================================
function runDataRefiner_Dadumeui(rawBook) {
    if (!rawBook) return null;

    // 필드 정규화 (국립중앙도서관 API 응답 키 매핑)
    const title  = String(rawBook.titleInfo   || rawBook.title   || '').trim();
    const author = String(rawBook.authorInfo  || rawBook.author  || '미상').trim();
    const isbn   = String(rawBook.isbn        || rawBook.EA_ISBN || '').replace(/[^0-9X]/gi, '');
    const pubYear = parseInt(
        String(rawBook.pubYearInfo || rawBook.pubYear || rawBook.pubDate || '0').substring(0, 4),
        10
    ) || null;
    const publisher = String(rawBook.publisherInfo || rawBook.publisher || '').trim();
    const loanCount = parseInt(rawBook.loanCnt || rawBook.loan_count || 0, 10) || 0;

    // 유효성 검사 (제목 없으면 스킵)
    if (!title) return null;

    // [2번 다듬이 핵심 로직] 복간 점수(reprint_score) 산출 알고리즘
    // 기준: 대출 횟수 기반 수요 지수 + 출판연도 절판 가중치
    let score = 0;

    // 대출 횟수 점수 (최대 60점)
    if (loanCount >= 500)      score += 60;
    else if (loanCount >= 200) score += 50;
    else if (loanCount >= 100) score += 40;
    else if (loanCount >= 50)  score += 30;
    else if (loanCount >= 10)  score += 20;
    else                       score += 10;

    // 출판연도 절판 가중치 (최대 30점)
    const currentYear = new Date().getFullYear();
    const age = pubYear ? (currentYear - pubYear) : 0;
    if (age >= 15)       score += 30;
    else if (age >= 10)  score += 20;
    else if (age >= 5)   score += 10;

    // ISBN 존재 여부 보너스 (10점)
    if (isbn && isbn.length >= 10) score += 10;

    // 100점 상한
    score = Math.min(score, 100);

    // 절판 추정 (출판 후 7년 이상 경과 시 절판 추정)
    const isOutOfPrint = age >= 7;

    return {
        title,
        author,
        isbn: isbn || null,
        pub_year: pubYear,
        publisher: publisher || null,
        library_loans: loanCount,
        reprint_score: score,
        demand_index: Math.min(loanCount / 5, 100), // 최대 100
        is_out_of_print: isOutOfPrint,
        status: 'candidate',
        created_at: new Date().toISOString()
    };
}

// ============================================================
// Supabase에 감사 로그 기록 (agent_audit_logs 테이블)
// ============================================================
async function writeAuditLog(supabase_url, supabase_key, logData) {
    try {
        const base = supabase_url.replace(/\/+$/, '') + '/rest/v1';
        const endpoint = `${base}/agent_audit_logs`;
        await fetch(endpoint, {
            method: 'POST',
            headers: {
                'apikey': supabase_key,
                'Authorization': `Bearer ${supabase_key}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                agent_id: logData.agent_id,
                agent_name: logData.agent_name,
                log_level: logData.log_level || 'info', // info | success | warn | error
                message: logData.message,
                metadata: logData.metadata ? JSON.stringify(logData.metadata) : null,
                created_at: new Date().toISOString()
            })
        });
    } catch (_) {
        // 로그 기록 실패는 파이프라인 멈추지 않음
    }
}

// ============================================================
// Vercel 서버리스 핸들러 (메인 진입점)
// ============================================================
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).send('OK');

    // [Rate Limit 검사] 클라이언트 IP 추출 후 빈도 제한 적용
    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    if (!checkRateLimit(clientIp)) {
        console.warn(`[pipeline] Rate Limit 초과 차단 — IP: ${clientIp}`);
        return res.status(429).json({
            error: '요청 빈도 초과 (분당 최대 10회)',
            retryAfter: '60초 후 재시도'
        });
    }

    const rawUrl  = process.env.SUPABASE_URL;
    const supKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!rawUrl || !supKey) {
        return res.status(500).json({ error: 'SUPABASE 환경변수 미설정' });
    }

    if (!LIBRARY_API_KEY) {
        return res.status(500).json({ error: 'LIBRARY_API_KEY 환경변수 미설정' });
    }

    // 검색 키워드 파싱 (GET: ?keyword=절판, POST: { keyword: "절판" })
    let keyword = '';
    if (req.method === 'GET') keyword = req.query?.keyword || '절판 도서';
    else if (req.method === 'POST') keyword = req.body?.keyword || '절판 도서';

    const pipelineStartAt = new Date().toISOString();
    const log = (agent_id, agent_name, level, message, metadata) =>
        writeAuditLog(rawUrl, supKey, { agent_id, agent_name, log_level: level, message, metadata });

    try {
        // ========================================================
        // [1번 살피미] 국립중앙도서관 API 호출 (딥서치)
        // ========================================================
        await log(1, '살피미', 'info', `국립중앙도서관 API 호출 시작 — 키워드: "${keyword}"`, { keyword });

        const params = new URLSearchParams({
            key:         LIBRARY_API_KEY,
            apiType:     'json',
            category:    '도서',
            kwd:         keyword,
            pageNum:     '1',
            pageSize:    '20',
            displayType: 'detail'
        });

        const libRes = await fetch(`${LIBRARY_API_BASE}?${params.toString()}`, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'Antigravity-SalPimi/1.0' }
        });

        if (!libRes.ok) {
            const errText = await libRes.text();
            await log(1, '살피미', 'error', `API 호출 실패 (HTTP ${libRes.status}): ${errText.substring(0, 200)}`, { status: libRes.status });
            return res.status(502).json({ error: '국립중앙도서관 API 오류', detail: errText.substring(0, 200) });
        }

        const libData = await libRes.json();
        const rawResults = libData.result ?? [];
        const results = Array.isArray(rawResults) ? rawResults : (rawResults ? [rawResults] : []);
        const totalCount = parseInt(libData.total ?? results.length, 10) || 0;

        await log(1, '살피미', 'success', `API 수집 완료 — ${totalCount}건 확보 (실 수신: ${results.length}건)`, { totalCount, received: results.length });

        if (results.length === 0) {
            return res.status(200).json({
                success: true, message: '수집 결과 없음 — 파이프라인 종료', inserted: 0
            });
        }

        // ========================================================
        // [2번 다듬이] 수집 데이터 정제 + 복간 점수 산출
        // ========================================================
        await log(2, '다듬이', 'info', `정제 파이프라인 시작 — ${results.length}건 입력`, { input: results.length });

        const refined = results
            .map(runDataRefiner_Dadumeui)
            .filter(r => r !== null && r.reprint_score >= 30); // 30점 이상만 후보

        await log(2, '다듬이', 'success', `정제 완료 — 복간 후보 ${refined.length}건 선별 (점수 30점 이상 필터)`, { candidates: refined.length });

        if (refined.length === 0) {
            return res.status(200).json({
                success: true, message: '복간 후보 기준 미달 — DB 적재 없음', inserted: 0
            });
        }

        // ========================================================
        // Supabase reprint_candidates 테이블 UPSERT (ISBN 기준 중복 방지)
        // ========================================================
        const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
        const upsertEndpoint = `${base}/reprint_candidates?on_conflict=isbn`;

        const upsertRes = await fetch(upsertEndpoint, {
            method: 'POST',
            headers: {
                'apikey': supKey,
                'Authorization': `Bearer ${supKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(refined)
        });

        if (!upsertRes.ok) {
            const errText = await upsertRes.text();
            await log(13, '오케스트레이터', 'error', `DB 적재 실패 (HTTP ${upsertRes.status}): ${errText.substring(0, 200)}`, {});
            return res.status(502).json({ error: 'Supabase 적재 실패', detail: errText.substring(0, 200) });
        }

        await log(13, '오케스트레이터', 'success', `파이프라인 완료 — ${refined.length}건 DB 적재 완료 (키워드: "${keyword}")`, {
            keyword, inserted: refined.length, pipelineStartAt
        });

        return res.status(200).json({
            success: true,
            message: `파이프라인 완료: 살피미 ${totalCount}건 수집 → 다듬이 정제 → ${refined.length}건 DB 적재`,
            keyword,
            totalCollected: totalCount,
            inserted: refined.length,
            sample: refined.slice(0, 3).map(r => ({ title: r.title, author: r.author, score: r.reprint_score }))
        });

    } catch (err) {
        const msg = err?.message ? String(err.message) : String(err);
        await log(9, '눈치왕', 'error', `파이프라인 예외 발생: ${msg}`, {});
        return res.status(500).json({ error: '파이프라인 내부 오류', detail: msg });
    }
}
