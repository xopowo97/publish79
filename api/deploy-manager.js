// api/deploy-manager.js
// ============================================================
// [통합 배포 API] 배포 상태 조회 & 배포 승인/반려 관리 매니저
// ============================================================

export default async function handler(req, res) {
    try {
        await _handle(req, res);
    } catch (fatalErr) {
        const msg = String(fatalErr?.message || fatalErr || 'Unknown fatal error');
        if (req.query.action === 'status') {
            return res.status(500).json({ error: 'Internal Server Error', message: msg });
        }
        return res.status(200).send(
            '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>[출판친구] 내부 오류 감지</title>' +
            '<style>body{font-family:sans-serif;background:#fff7ed;display:flex;' +
            'align-items:center;justify-content:center;min-height:100vh;padding:16px}' +
            '.card{background:#fff;border:1px solid #fed7aa;border-radius:16px;' +
            'padding:28px 20px;max-width:400px;width:100%;text-align:center}' +
            'h1{color:#c2410c;font-size:16px;margin-bottom:10px}' +
            'pre{background:#fff7ed;border-radius:8px;padding:10px;font-size:11px;' +
            'text-align:left;color:#7c2d12;word-break:break-all;white-space:pre-wrap}' +
            '</style></head><body><div class="card">' +
            '<div style="font-size:48px">⚠️</div>' +
            '<h1>내부 오류 감지 — 관리자에게 전달됨</h1>' +
            '<pre>' + msg + '</pre>' +
            '</div></body></html>'
        );
    }
}

async function _handle(req, res) {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).send('OK');
    }

    const query = req.query || {};
    const action = query.action ? String(query.action) : '';
    const pr = query.pr ? String(query.pr) : '';

    const rawUrl = process.env.SUPABASE_URL || '';
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    // ─── 분기 1: 배포 상태 조회 (status) ───
    if (action === 'status') {
        if (!pr) {
            return res.status(400).json({ error: 'pr 파라미터가 없습니다.' });
        }

        if (!rawUrl || !supaKey) {
            return res.status(500).json({ error: '데이터베이스 연결 환경 변수가 설정되지 않았습니다.' });
        }

        const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
        const authHeaders = {
            'apikey': supaKey,
            'Authorization': 'Bearer ' + supaKey,
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        const errors = [];

        // 1-1. deploy_status 테이블 조회
        try {
            const endpoint = base + '/deploy_status?pr=eq.' + encodeURIComponent(pr) + '&select=status&limit=1';
            const resp = await fetch(endpoint, { method: 'GET', headers: authHeaders });

            if (resp.ok) {
                const text = await resp.text();
                const rows = text ? JSON.parse(text) : [];
                if (rows && rows.length > 0) {
                    return res.status(200).json({ pr: pr, status: rows[0].status, errors });
                }
            } else {
                errors.push('[deploy_status] HTTP ' + resp.status);
            }
        } catch (e) {
            errors.push('[deploy_status 오류] ' + e.message);
        }

        // 1-2. master_config 폴백 조회
        try {
            const endpoint = base + '/master_config?id=eq.deploy-state&select=data&limit=1';
            const resp = await fetch(endpoint, { method: 'GET', headers: authHeaders });

            if (resp.ok) {
                const text = await resp.text();
                const rows = text ? JSON.parse(text) : [];
                if (rows && rows.length > 0) {
                    const state = rows[0].data || {};
                    const status = state[pr] || 'PENDING';
                    return res.status(200).json({ pr: pr, status: status, errors });
                }
            } else {
                errors.push('[master_config] HTTP ' + resp.status);
            }
        } catch (e) {
            errors.push('[master_config 오류] ' + e.message);
        }

        return res.status(200).json({ pr: pr, status: 'PENDING', errors });
    }

    // ─── 분기 2: 배포 승인 및 반려 (approve / reject) ───
    if (action === 'approve' || action === 'reject' || action === 'approval') {
        const isReject = (action === 'reject');
        const targetStatus = isReject ? 'REJECTED' : 'APPROVED';
        let dbMsg = '';

        try {
            if (!rawUrl || !supaKey) {
                dbMsg = '[ENV] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 미등록';
            } else {
                const cleanUrl = rawUrl.trim().replace(/\/$/, '');
                if (!cleanUrl.startsWith('https://') && !cleanUrl.startsWith('http://')) {
                    dbMsg = '[URL 오류] 프로토콜 없음 → fetch 차단';
                } else {
                    const endpoint = cleanUrl + '/rest/v1/deploy_status';
                    const r = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'apikey': supaKey,
                            'Authorization': 'Bearer ' + supaKey,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify({ pr: pr, status: targetStatus })
                    });

                    if (r.status === 200 || r.status === 201 || r.status === 204) {
                        dbMsg = 'DB 기록 완료: ' + targetStatus + ' (pr: ' + pr + ') [HTTP ' + r.status + ']';
                    } else {
                        dbMsg = 'DB 응답 비정상 [HTTP ' + r.status + ']';
                    }
                }
            }
        } catch (fetchErr) {
            dbMsg = 'DB 오류: ' + String(fetchErr?.message || fetchErr);
        }

        const icon = isReject ? '&#10060;' : '&#9989;';
        const badgeBg = isReject ? '#fef2f2' : '#ecfdf5';
        const badgeClr = isReject ? '#991b1b' : '#065f46';
        const heading = isReject
            ? '배포 반려 완료'
            : '&#127881; 출판친구 배포 승인이 완벽하게 성공했습니다!';
        const bodyText = isReject
            ? '대표님의 지시에 따라 배포를 반려했습니다.'
            : '대표님의 모바일 승인이 확인되었습니다. Supabase 거버넌스 DB에 승인 상태가 즉시 기록되었습니다.';

        const html =
            '<!DOCTYPE html>' +
            '<html lang="ko">' +
            '<head>' +
            '<meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>[출판친구] 배포 처리</title>' +
            '<style>' +
            '*{box-sizing:border-box;margin:0;padding:0}' +
            'body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;' +
            'background:#f8fafc;min-height:100vh;display:flex;align-items:center;' +
            'justify-content:center;padding:16px}' +
            '.card{background:#fff;padding:32px 24px;border-radius:24px;' +
            'box-shadow:0 8px 32px rgba(0,0,0,.08);max-width:420px;width:100%;' +
            'text-align:center;border:1px solid #e2e8f0}' +
            '.ico{font-size:56px;margin-bottom:14px}' +
            '.badge{display:inline-block;background:' + badgeBg + ';color:' + badgeClr + ';' +
            'padding:4px 14px;border-radius:999px;font-size:11px;font-weight:700;margin-bottom:14px}' +
            'h1{font-size:17px;font-weight:900;color:#1e293b;margin-bottom:10px}' +
            'p{color:#64748b;font-size:13px;line-height:1.6;margin-bottom:12px}' +
            '.log{background:#f1f5f9;padding:10px 12px;border-radius:10px;' +
            'font-family:monospace;font-size:11px;text-align:left;color:#334155;' +
            'border:1px solid #e2e8f0;margin-bottom:12px;word-break:break-all}' +
            'footer{font-size:10px;color:#94a3b8}' +
            '</style>' +
            '</head>' +
            '<body><div class="card">' +
            '<div class="ico">' + icon + '</div>' +
            '<div class="badge">11번 자동화 배포 관리자</div>' +
            '<h1>' + heading + '</h1>' +
            '<p>' + bodyText + '</p>' +
            '<div class="log">' + dbMsg + '</div>' +
            '<footer>출판친구 자율 경영 거버넌스 파이프라인 (Antigravity)</footer>' +
            '</div></body></html>';

        return res.status(200).send(html);
    }

    return res.status(400).json({ error: '올바르지 않은 요청 액션(action)입니다.' });
}
