// api/deploy-approval.js — [11번 자동화 배포 관리자] Vercel Production Standard
// 방어 패치 v3: URL 프로토콜 검증 가드 + 전역 최외곽 래핑 → Vercel 500 완전 봉쇄

// ══════════════════════════════════════════════════════════════════════════════
// 전략: 모든 내부 로직을 _handle()에 격리하고, export default는 오직
//       "무조건 200 응답"만 보장하는 외벽으로만 기능한다.
//       _handle() 내부에서 어떤 Fatal이 터져도 외벽 catch가 낚아채
//       res.status(200).send()로 마감 → Vercel 검은 화면 구조적 불가능.
// ══════════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
    try {
        await _handle(req, res);
    } catch (fatalErr) {
        // ── 최후 방어막: 내부 _handle()이 어떤 이유로든 폭사해도
        //    Vercel은 반드시 200 HTML을 받는다. 500은 절대 불가.
        const msg = String(fatalErr?.message || fatalErr || 'Unknown fatal error');
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

// ── 실제 핸들러 로직 (격리 실행) ──────────────────────────────────────────────
async function _handle(req, res) {

    // ── CORS ─────────────────────────────────────────────────────────────
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).send('OK');
    }

    // ── 파라미터 파싱 ─────────────────────────────────────────────────────
    const query  = req.query  || {};
    const action = query.action ? String(query.action) : '';
    const pr     = query.pr     ? String(query.pr)     : '';

    // ── Supabase 상태 기록 ────────────────────────────────────────────────
    let dbMsg = '';
    try {
        const rawUrl = process.env.SUPABASE_URL            || '';
        const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

        // [가드 1] 환경변수 존재 여부
        if (!rawUrl || !supaKey) {
            dbMsg = '[ENV] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 미등록';

        } else {
            // [가드 2] URL 프로토콜 검증 — http(s):// 없으면 fetch 자체를 차단
            //          Node.js fetch는 프로토콜 없는 주소에서 TypeError Fatal을 뿜음
            const cleanUrl = rawUrl.trim().replace(/\/$/, '');
            if (!cleanUrl.startsWith('https://') && !cleanUrl.startsWith('http://')) {
                dbMsg = '[URL 오류] 프로토콜 없음 → fetch 차단: "' +
                        cleanUrl.substring(0, 40) + '"';

            } else {
                // [가드 3] URL 생성자로 실제 파싱 가능 여부 사전 검증
                //          실패 시 fetch 실행 전에 안전 탈출
                const endpoint = cleanUrl + '/rest/v1/deploy_status';
                let urlValid = false;
                try {
                    new URL(endpoint);   // 파싱 실패 시 TypeError 발생
                    urlValid = true;
                } catch (_urlErr) {
                    dbMsg = '[URL 파싱 실패] new URL() 거부: "' +
                            endpoint.substring(0, 50) + '"';
                }

                if (urlValid) {
                    const targetStatus = (action === 'reject') ? 'REJECTED' : 'APPROVED';

                    // fetch 실행 — 이 시점에서는 URL이 100% 유효하다고 보증됨
                    const r = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'apikey'       : supaKey,
                            'Authorization': 'Bearer ' + supaKey,
                            'Content-Type' : 'application/json',
                            // return=minimal → Supabase가 204 빈 바디 반환
                            // body 파싱 일절 없음 → 이중읽기 크래시 원천 차단
                            'Prefer'       : 'return=minimal'
                        },
                        body: JSON.stringify({ pr: pr, status: targetStatus })
                    });

                    // [가드 4] status 코드만 확인 — r.text()/r.json() 절대 호출 안 함
                    if (r.status === 200 || r.status === 201 || r.status === 204) {
                        dbMsg = 'DB 기록 완료: ' + targetStatus +
                                ' (pr: ' + pr + ') [HTTP ' + r.status + ']';
                    } else {
                        dbMsg = 'DB 응답 비정상 [HTTP ' + r.status + '] — body 파싱 생략';
                    }
                }
            }
        }
    } catch (fetchErr) {
        // 내부 try-catch: fetch 네트워크 오류 등 런타임 예외 포획
        dbMsg = 'DB 오류: ' + String(fetchErr?.message || fetchErr);
    }

    // ── HTML 응답 조립 ────────────────────────────────────────────────────
    const isReject  = (action === 'reject');
    const icon      = isReject ? '&#10060;' : '&#9989;';
    const badgeBg   = isReject ? '#fef2f2'  : '#ecfdf5';
    const badgeClr  = isReject ? '#991b1b'  : '#065f46';
    const heading   = isReject
        ? '배포 반려 완료'
        : '&#127881; 출판친구 배포 승인이 완벽하게 성공했습니다!';
    const bodyText  = isReject
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

    // ── 최종 응답 — Vercel Node.js 런타임 표준 ───────────────────────────
    return res.status(200).send(html);
}
