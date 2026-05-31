// api/reprint-candidates.js — [13번 최상위 오케스트레이터] 복간 추천 TOP 3 후보 도서 조회 API
// Vercel Serverless Function - Vercel 대시보드 환경변수 및 .env 파일의 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 참조

// ============================================================
// [보안 방어벽] Rate Limiter — IP별 분당 조회 빈도 제한
// 조회 API이므로 pipeline보다 여유 있게 분당 20회
// ============================================================
const _rateLimitMap = new Map();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = _rateLimitMap.get(ip);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        _rateLimitMap.set(ip, { count: 1, windowStart: now });
        return true;
    }
    entry.count += 1;
    return entry.count <= RATE_LIMIT_MAX;
}

export default async function handler(req, res) {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') {
        return res.status(200).send('OK');
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'GET 메소드만 지원합니다.' });
    }

    // [Rate Limit 검사] 분당 20회 초과 시 차단
    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    if (!checkRateLimit(clientIp)) {
        console.warn(`[reprint-candidates] Rate Limit 초과 차단 — IP: ${clientIp}`);
        return res.status(429).json({
            error: '요청 빈도 초과 (분당 최대 20회)',
            retryAfter: '60초 후 재시도'
        });
    }

    try {
        const rawUrl = process.env.SUPABASE_URL;
        const key    = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!rawUrl || !key) {
            throw new Error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
        }

        const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
        // 복간 점수(reprint_score) 높은 순으로 상위 3개 조회
        const endpoint = `${base}/reprint_candidates?select=*&order=reprint_score.desc&limit=3`;

        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Supabase 조회 실패 (${response.status}): ${errText}`);
        }

        const candidates = await response.json();

        return res.status(200).json({
            success: true,
            count: candidates.length,
            data: candidates
        });

    } catch (err) {
        const msg = err && err.message ? String(err.message) : String(err);
        console.error('[api/reprint-candidates] 오류 발생:', msg);
        
        return res.status(500).json({
            success: false,
            error: '서버 내부 오류가 발생했습니다.',
            message: msg
        });
    }
}
