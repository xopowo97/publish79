// api/deploy-status.js — [11번 자동화 배포 관리자] 상태 조회 Final Build
// fetch를 bare 키워드로 사용 (send-error.js와 동일한 방식 — 프로젝트 표준)

async function readStatus(pr) {
    const rawUrl = process.env.SUPABASE_URL;
    const key    = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!rawUrl || !key) {
        throw new Error('[ENV 오류] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 Vercel 환경 변수에 없습니다.');
    }

    // trailing slash 제거
    const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
    const authHeaders = {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };

    const errors = [];

    // ── 1차: deploy_status 테이블 조회 ─────────────────────────────────────
    try {
        const endpoint = base + '/deploy_status?pr=eq.' + encodeURIComponent(pr) + '&select=status&limit=1&t=' + Date.now();
        const resp = await fetch(endpoint, { method: 'GET', headers: authHeaders, cache: 'no-store' });

        if (!resp.ok) {
            const body = await resp.text();
            throw new Error('HTTP ' + resp.status + ': ' + body);
        }

        const text = await resp.text();
        const rows = text ? JSON.parse(text) : [];

        if (rows && rows.length > 0) {
            console.log('[deploy-status] deploy_status 조회 OK: pr=' + pr + ' status=' + rows[0].status);
            return rows[0].status;
        }
        // 행이 없음 = 아직 승인/반려 전 → PENDING (에러 아님)
        errors.push('[deploy_status] pr=' + pr + ' 행 없음 (아직 대기중)');
    } catch (e) {
        console.warn('[deploy-status] deploy_status 조회 실패:', e.message);
        errors.push('[deploy_status 오류] ' + e.message);
    }

    // ── 2차: master_config 폴백 ─────────────────────────────────────────────
    try {
        const endpoint = base + '/master_config?id=eq.deploy-state&select=data&limit=1&t=' + Date.now();
        const resp = await fetch(endpoint, { method: 'GET', headers: authHeaders, cache: 'no-store' });

        if (!resp.ok) {
            const body = await resp.text();
            throw new Error('HTTP ' + resp.status + ': ' + body);
        }

        const text = await resp.text();
        const rows = text ? JSON.parse(text) : [];

        if (rows && rows.length > 0) {
            const state  = rows[0].data || {};
            const status = state[pr] || 'PENDING';
            console.log('[deploy-status] master_config 폴백 OK: pr=' + pr + ' status=' + status);
            return status;
        }
        errors.push('[master_config] deploy-state 행 없음');
    } catch (e) {
        console.error('[deploy-status] master_config 폴백 실패:', e.message);
        errors.push('[master_config 오류] ' + e.message);
    }

    // 양쪽 모두 행 없음 → PENDING (아직 승인/반려 전 정상 상태)
    console.log('[deploy-status] 상태 미발견, PENDING 반환. 사유: ' + errors.join(' | '));
    return 'PENDING';
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const pr = (req.query && req.query.pr) ? String(req.query.pr) : '';

        if (!pr) {
            return res.status(400).json({ error: 'pr 파라미터가 없습니다.' });
        }

        const status = await readStatus(pr);
        return res.status(200).json({ pr: pr, status: status });

    } catch (err) {
        // 최후 방어선 — 절대 크래시 없음
        const msg = (err && err.message) ? String(err.message) : String(err);
        console.error('[deploy-status] FATAL:', msg);
        if (!res.headersSent) {
            return res.status(500).json({ error: 'Internal Server Error', message: msg });
        }
    }
}
