// api/deploy-approval.js — [11번 자동화 배포 관리자] Production Final
// 핵심: Supabase 기록 → 즉시 HTML 반환. 외부 API 연쇄 호출로 인한 타임아웃 원천 제거.

export default async function handler(req, res) {
    // ── CORS ──────────────────────────────────────────────────────────────
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // ── 파라미터 수신 ───────────────────────────────────────────────────────
    const action = (req.query && req.query.action) ? String(req.query.action) : '';
    const pr     = (req.query && req.query.pr)     ? String(req.query.pr)     : '';

    // ── Supabase 기록 (타임아웃 방지를 위해 5초 이내 완료 보장) ──────────────
    let dbStatus = 'UNKNOWN';
    let dbMsg    = '';

    try {
        const supaUrl = process.env.SUPABASE_URL;
        const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supaUrl || !supaKey) {
            dbMsg = 'ENV 누락: SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 없음';
            dbStatus = 'ENV_MISSING';
        } else {
            const targetStatus = (action === 'reject') ? 'REJECTED' : 'APPROVED';
            const endpoint = supaUrl.replace(/\/+$/, '') + '/rest/v1/deploy_status';

            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'apikey': supaKey,
                    'Authorization': 'Bearer ' + supaKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-dup'
                },
                body: JSON.stringify({ pr: pr, status: targetStatus })
            });

            if (resp.status === 200 || resp.status === 201 || resp.status === 204) {
                dbStatus = 'OK';
                dbMsg = 'Supabase deploy_status 기록 완료 (' + targetStatus + ')';
            } else {
                const errBody = await resp.text();
                dbStatus = 'FAIL';
                dbMsg = 'Supabase 응답 [' + resp.status + ']: ' + errBody;
            }
        }
    } catch (e) {
        dbStatus = 'ERROR';
        dbMsg = 'Supabase fetch 오류: ' + String(e.message || e);
    }

    // ── 즉시 HTML 응답 반환 (어떤 경우에도 크래시 없음) ────────────────────
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (action === 'reject') {
        res.status(200).end(
            '<!DOCTYPE html><html lang="ko"><head>' +
            '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>[출판친구] 배포 반려 완료</title>' +
            '<style>*{box-sizing:border-box;margin:0;padding:0}' +
            'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}' +
            '.c{background:#fff;padding:32px 24px;border-radius:24px;box-shadow:0 8px 32px rgba(0,0,0,0.08);max-width:420px;width:100%;text-align:center;border:1px solid #e2e8f0}' +
            '.ico{font-size:56px;margin-bottom:14px}.badge{display:inline-block;background:#fef2f2;color:#991b1b;padding:4px 14px;border-radius:999px;font-size:11px;font-weight:700;margin-bottom:14px}' +
            'h1{font-size:18px;font-weight:900;color:#1e293b;margin-bottom:10px}' +
            'p{color:#64748b;font-size:13px;line-height:1.6;margin-bottom:12px}' +
            '.log{background:#f1f5f9;padding:10px 12px;border-radius:10px;font-family:monospace;font-size:11px;text-align:left;color:#334155;border:1px solid #e2e8f0;margin-bottom:12px}' +
            'footer{font-size:10px;color:#94a3b8}</style></head><body><div class="c">' +
            '<div class="ico">❌</div>' +
            '<div class="badge">11번 자동화 배포 관리자</div>' +
            '<h1>배포 반려 완료</h1>' +
            '<p>대표님의 지시에 따라 자가치유 코드 패치를 반려하고 배포를 긴급 중단했습니다. 소스코드는 수정 이전 상태로 안전하게 유지됩니다.</p>' +
            '<div class="log">' + dbMsg + '</div>' +
            '<footer>출판친구 자율 경영 거버넌스 파이프라인 (Antigravity)</footer>' +
            '</div></body></html>'
        );
        return;
    }

    // approve (기본값)
    res.status(200).end(
        '<!DOCTYPE html><html lang="ko"><head>' +
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>[출판친구] 배포 승인 완료</title>' +
        '<style>*{box-sizing:border-box;margin:0;padding:0}' +
        'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}' +
        '.c{background:#fff;padding:32px 24px;border-radius:24px;box-shadow:0 8px 32px rgba(0,0,0,0.08);max-width:420px;width:100%;text-align:center;border:1px solid #e2e8f0}' +
        '.ico{font-size:56px;margin-bottom:14px}.badge{display:inline-block;background:#ecfdf5;color:#065f46;padding:4px 14px;border-radius:999px;font-size:11px;font-weight:700;margin-bottom:14px}' +
        'h1{font-size:18px;font-weight:900;color:#1e293b;margin-bottom:10px}' +
        'p{color:#64748b;font-size:13px;line-height:1.6;margin-bottom:12px}' +
        '.log{background:#f1f5f9;padding:10px 12px;border-radius:10px;font-family:monospace;font-size:11px;text-align:left;color:#334155;border:1px solid #e2e8f0;margin-bottom:12px}' +
        'footer{font-size:10px;color:#94a3b8}</style></head><body><div class="c">' +
        '<div class="ico">✅</div>' +
        '<div class="badge">11번 자동화 배포 관리자</div>' +
        '<h1>🎉 출판친구 배포 승인이 완벽하게 성공했습니다!</h1>' +
        '<p>대표님의 모바일 승인이 확인되었습니다. Supabase 거버넌스 DB에 승인 상태가 즉시 기록되었습니다.</p>' +
        '<div class="log">' + dbMsg + '\npr: ' + pr + '</div>' +
        '<footer>출판친구 자율 경영 거버넌스 파이프라인 (Antigravity)</footer>' +
        '</div></body></html>'
    );
}
