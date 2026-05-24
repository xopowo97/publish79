// api/deploy-approval.js — [11번 자동화 배포 관리자] Vercel Production Standard
// 응답 규격: res.status(200).send(html) — Vercel Node.js 런타임 표준 준수
// 방어 패치 v2: Prefer=return=minimal, URL슬래시 단일정규식, body이중읽기 제거

export default async function handler(req, res) {

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
        const supaUrl = process.env.SUPABASE_URL     || '';
        const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

        if (!supaUrl || !supaKey) {
            dbMsg = '[ENV] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 미등록';
        } else {
            const targetStatus = (action === 'reject') ? 'REJECTED' : 'APPROVED';
            // [처방 2] URL 끝 슬래시 단일 제거 — 환경변수 오입력 방어
            const endpoint = supaUrl.replace(/\/$/, '') + '/rest/v1/deploy_status';

            const r = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'apikey': supaKey,
                    'Authorization': 'Bearer ' + supaKey,
                    'Content-Type': 'application/json',
                    // [처방 1] return=minimal: Supabase가 204 빈 바디 반환 → body 파싱 불필요
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ pr: pr, status: targetStatus })
            });

            // [처방 3] status 코드만 확인 — r.text()/r.json() 이중읽기 크래시 원천 제거
            if (r.status === 200 || r.status === 201 || r.status === 204) {
                dbMsg = 'DB 기록 완료: ' + targetStatus + ' (pr: ' + pr + ') [HTTP ' + r.status + ']';
            } else {
                dbMsg = 'DB 응답 비정상 [HTTP ' + r.status + '] — body 파싱 생략';
            }
        }
    } catch (fetchErr) {
        dbMsg = 'DB 오류: ' + String(fetchErr.message || fetchErr);
    }

    // ── HTML 응답 ─────────────────────────────────────────────────────────
    const isReject = (action === 'reject');

    const icon      = isReject ? '&#10060;' : '&#9989;';
    const badgeBg   = isReject ? '#fef2f2'  : '#ecfdf5';
    const badgeClr  = isReject ? '#991b1b'  : '#065f46';
    const heading   = isReject
        ? '&#48176;&#54252; &#48152;&#47140; &#50756;&#47308;'
        : '&#127881; &#52636;&#54032;&#52828;&#44396; &#48176;&#54252; &#49849;&#51064;&#51060; &#50756;&#48225;&#54616;&#44172; &#49457;&#44277;&#54588;&#49845;&#45768;&#45796;!';
    const bodyText  = isReject
        ? '&#45824;&#54364;&#45768;&#51032; &#51648;&#49884;&#50640; &#46384;&#46972; &#48176;&#54252;&#47484; &#48152;&#47140;&#54558;&#49845;&#45768;&#45796;.'
        : '&#45824;&#54364;&#45768;&#51032; &#47784;&#48148;&#51068; &#49849;&#51064;&#51060; &#54869;&#51064;&#46104;&#50632;&#49845;&#45768;&#45796;. Supabase &#44144;&#48260;&#45692;&#49828; DB&#50640; &#49849;&#51064; &#49345;&#53468;&#44032; &#51608;&#49884; &#44592;&#47197;&#46418;&#50632;&#49845;&#45768;&#45796;.';

    const html =
        '<!DOCTYPE html>' +
        '<html lang="ko">' +
        '<head>' +
        '<meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>[&#52636;&#54032;&#52828;&#44396;] &#48176;&#54252; &#52376;&#47532;</title>' +
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
        '<div class="badge">11&#48264; &#51088;&#46041;&#54868; &#48176;&#54252; &#44288;&#47532;&#51088;</div>' +
        '<h1>' + heading + '</h1>' +
        '<p>' + bodyText + '</p>' +
        '<div class="log">' + dbMsg + '</div>' +
        '<footer>&#52636;&#54032;&#52828;&#44396; &#51088;&#50977; &#44221;&#50689; &#44144;&#48260;&#45692;&#49828; &#54028;&#51060;&#54532;&#46972;&#51064; (Antigravity)</footer>' +
        '</div></body></html>';

    return res.status(200).send(html);
}
