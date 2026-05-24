// api/deploy-status.js
// [11번 자동화 배포 관리자] 상태 조회 엔드포인트 - 완전판 (2025-05 Final Hotfix)
// 핵심 원칙: Vercel Node 18+ 환경에서 globalThis.fetch는 100% 보장.
// https 모듈 Promise 래핑 관련 비동기 누수를 완전 제거하고 fetch 단일 경로로 통일.

async function readStatus(pr) {
    const rawUrl = process.env.SUPABASE_URL;
    const key    = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!rawUrl || !key) {
        throw new Error('[ENV 누락] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 Vercel 환경 변수에 등록되어 있지 않습니다.');
    }

    const restUrl = rawUrl.replace(/\/+$/, '') + '/rest/v1';
    const authHeaders = {
        'apikey': key,
        'Authorization': `Bearer ${key}`
    };

    const errors = [];

    // 1차: deploy_status 테이블 직접 조회
    try {
        const url = `${restUrl}/deploy_status?pr=eq.${encodeURIComponent(pr)}&select=status&limit=1`;
        const res = await globalThis.fetch(url, { method: 'GET', headers: authHeaders });
        const text = await res.text();
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${text}`);
        }
        const rows = JSON.parse(text);
        if (rows && rows.length > 0) {
            console.log(`✅ deploy_status 조회 성공: pr=${pr}, status=${rows[0].status}`);
            return rows[0].status;
        }
        // 행이 없으면 폴백으로 넘어감 (아직 기록 안 됨 = PENDING)
        console.warn(`⚠️ deploy_status에서 pr='${pr}' 행 없음, master_config 폴백 시도`);
        errors.push(`[deploy_status] pr='${pr}' 행 없음`);
    } catch (e) {
        console.warn('⚠️ deploy_status 조회 실패:', e.message);
        errors.push(`[deploy_status 오류] ${e.message}`);
    }

    // 2차: master_config 폴백 조회
    try {
        const url = `${restUrl}/master_config?id=eq.deploy-state&select=data&limit=1`;
        const res = await globalThis.fetch(url, { method: 'GET', headers: authHeaders });
        const text = await res.text();
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${text}`);
        }
        const rows = JSON.parse(text);
        if (rows && rows.length > 0) {
            const state = rows[0].data || {};
            const status = state[pr] || 'PENDING';
            console.log(`✅ master_config 폴백 조회 성공: pr=${pr}, status=${status}`);
            return status;
        }
        errors.push(`[master_config] 'deploy-state' 행 없음`);
    } catch (e) {
        console.error('❌ master_config 폴백 조회 실패:', e.message);
        errors.push(`[master_config 오류] ${e.message}`);
    }

    // 양쪽 모두 행이 없으면 → 아직 승인/반려 전 상태이므로 PENDING 반환 (에러 아님)
    console.log(`ℹ️ pr='${pr}' 상태 미발견, PENDING 반환. 상세: ${errors.join(' | ')}`);
    return 'PENDING';
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    try {
        const { pr } = req.query;

        if (!pr) {
            return res.status(400).json({ error: 'Bad Request: pr 파라미터가 없습니다.' });
        }

        const status = await readStatus(pr);
        return res.status(200).json({ pr, status });

    } catch (err) {
        // 절대 죽지 않는 최후 방어선 → JSON 에러로 반환
        console.error('🚨 [deploy-status] 치명적 오류:', err);
        const errMsg = String(err && err.message ? err.message : err);
        if (res.headersSent) return;
        return res.status(500).json({
            error: 'Internal Server Error',
            message: errMsg,
            pr: req.query && req.query.pr ? req.query.pr : null
        });
    }
}
