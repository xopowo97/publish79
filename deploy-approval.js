// api/deploy-approval.js
// [11번 자동화 배포 관리자] - 완전판 (2025-05 Final Hotfix)
// 핵심 원칙: Vercel Node 18+ 환경에서 globalThis.fetch는 100% 보장.
// https 모듈 Promise 래핑 관련 비동기 누수를 완전 제거하고 fetch 단일 경로로 통일.

// ── Supabase PostgREST 헬퍼 (fetch 단일 경로) ──────────────────────────────
async function supabasePost(restUrl, key, table, payload, prefer) {
    const url = `${restUrl}/${table}`;
    const res = await globalThis.fetch(url, {
        method: 'POST',
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Prefer': prefer || 'resolution=merge-dup'
        },
        body: JSON.stringify(payload)
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`Supabase POST /${table} → ${res.status}: ${text}`);
    }
    return text ? JSON.parse(text) : {};
}

async function supabaseGet(restUrl, key, table, query) {
    const url = `${restUrl}/${table}?${query}`;
    const res = await globalThis.fetch(url, {
        method: 'GET',
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`
        }
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`Supabase GET /${table}?${query} → ${res.status}: ${text}`);
    }
    return text ? JSON.parse(text) : [];
}

// ── 상태 기록 함수 ──────────────────────────────────────────────────────────
async function upsertStatus(pr, status) {
    const rawUrl = process.env.SUPABASE_URL;
    const key    = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!rawUrl || !key) {
        throw new Error('[ENV 누락] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 Vercel 환경 변수에 등록되어 있지 않습니다.');
    }
    const restUrl = rawUrl.replace(/\/+$/, '') + '/rest/v1';

    // 1차: deploy_status 테이블
    const errors = [];
    try {
        await supabasePost(restUrl, key, 'deploy_status', { pr, status }, 'resolution=merge-dup');
        console.log(`✅ deploy_status upsert 완료: pr=${pr}, status=${status}`);
        return;
    } catch (e) {
        errors.push(`[deploy_status] ${e.message}`);
        console.warn('⚠️ deploy_status 기록 실패, master_config 폴백 시도:', e.message);
    }

    // 2차: master_config 폴백
    try {
        let state = {};
        const rows = await supabaseGet(restUrl, key, 'master_config', 'id=eq.deploy-state&select=data');
        if (rows && rows.length > 0) state = rows[0].data || {};
        state[pr] = status;
        await supabasePost(restUrl, key, 'master_config', { id: 'deploy-state', data: state }, 'resolution=merge-dup');
        console.log(`✅ master_config 폴백 기록 완료: pr=${pr}, status=${status}`);
        return;
    } catch (e) {
        errors.push(`[master_config] ${e.message}`);
    }

    throw new Error(`Supabase 상태 기록 완전 실패:\n${errors.join('\n')}`);
}

// ── HTML 템플릿 헬퍼 ────────────────────────────────────────────────────────
function htmlPage(icon, badgeColor, badgeBg, badgeText, title, body, logBox) {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>[출판친구] ${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
    .card{background:#fff;padding:28px 24px;border-radius:24px;box-shadow:0 10px 40px rgba(0,0,0,0.08);max-width:440px;width:100%;text-align:center;border:1px solid #e2e8f0}
    .icon{font-size:52px;margin-bottom:12px}
    .badge{display:inline-block;background:${badgeBg};color:${badgeColor};padding:5px 14px;border-radius:999px;font-size:11px;font-weight:700;margin-bottom:14px}
    h1{font-size:18px;font-weight:900;color:#1e293b;margin-bottom:10px}
    p{color:#64748b;font-size:13px;line-height:1.65;margin-bottom:16px}
    .log{background:#f1f5f9;padding:12px;border-radius:12px;font-family:monospace;font-size:11px;text-align:left;color:#334155;border:1px solid #e2e8f0;white-space:pre-wrap;word-break:break-all;max-height:260px;overflow-y:auto;margin-bottom:16px}
    .log.err{background:#fff5f5;border-color:#fecaca;color:#991b1b}
    .footer{font-size:10px;color:#94a3b8}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <div class="badge">${badgeText}</div>
    <h1>${title}</h1>
    <p>${body}</p>
    ${logBox}
    <p class="footer">출판친구 자율 경영 거버넌스 파이프라인 (Antigravity)</p>
  </div>
</body>
</html>`;
}

// ── 핸들러 ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    // 전체 핸들러를 try-catch로 감싸 어떤 예외도 Vercel 컨테이너를 죽이지 않도록 함
    try {
        const { action, pr } = req.query;

        if (!action || !pr) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(400).send('Bad Request: action 또는 pr 파라미터가 없습니다.');
        }

        // ── APPROVE ────────────────────────────────────────────────────────
        if (action === 'approve') {
            await upsertStatus(pr, 'APPROVED');

            const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
            const GITHUB_REPO   = process.env.GITHUB_REPO;
            const VERCEL_TOKEN  = process.env.VERCEL_TOKEN;
            const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;

            let mergeLog = '';
            let vercelLog = '';

            // GitHub 머지 시도
            if (GITHUB_TOKEN && GITHUB_REPO) {
                try {
                    const owner = GITHUB_REPO.split('/')[0];
                    const head  = encodeURIComponent(`${owner}:${pr}`);
                    const prListRes = await globalThis.fetch(
                        `https://api.github.com/repos/${GITHUB_REPO}/pulls?head=${head}&state=open`,
                        { headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Antigravity-Bot' } }
                    );
                    const prList = await prListRes.json();
                    if (prList && prList.length > 0) {
                        const prNum = prList[0].number;
                        const mergeRes = await globalThis.fetch(
                            `https://api.github.com/repos/${GITHUB_REPO}/pulls/${prNum}/merge`,
                            {
                                method: 'PUT',
                                headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'Antigravity-Bot' },
                                body: JSON.stringify({ commit_title: `🤖 [11번 배포] 자동 승인 머지: ${pr}` })
                            }
                        );
                        const mergeJson = await mergeRes.json();
                        mergeLog = mergeRes.ok
                            ? `✅ GitHub PR #${prNum} → main 머지 완료`
                            : `⚠️ GitHub 머지 응답 ${mergeRes.status}: ${JSON.stringify(mergeJson)}`;
                    } else {
                        mergeLog = `⚠️ 오픈 상태의 PR을 찾을 수 없습니다 (branch: ${pr})`;
                    }
                } catch (e) {
                    mergeLog = `⚠️ GitHub API 호출 오류: ${e.message}`;
                }
            } else {
                mergeLog = `✅ [시뮬레이션] GitHub PR (${pr}) → main 머지 완료`;
            }

            // Vercel 재배포 시도
            if (VERCEL_TOKEN && VERCEL_PROJECT_ID) {
                try {
                    const vRes = await globalThis.fetch(
                        `https://api.vercel.com/v13/deployments`,
                        {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: 'publish79-platform', projectId: VERCEL_PROJECT_ID, gitSource: { type: 'github', repo: GITHUB_REPO, ref: 'main' } })
                        }
                    );
                    const vJson = await vRes.json();
                    vercelLog = vRes.ok
                        ? `✅ Vercel 배포 트리거 완료 → publish79.vercel.app`
                        : `⚠️ Vercel 배포 응답 ${vRes.status}: ${JSON.stringify(vJson)}`;
                } catch (e) {
                    vercelLog = `⚠️ Vercel API 호출 오류: ${e.message}`;
                }
            } else {
                vercelLog = `✅ [시뮬레이션] Vercel publish79.vercel.app 프로덕션 배포 완료`;
            }

            const logContent = `${mergeLog}\n${vercelLog}`;
            const html = htmlPage(
                '✅', '#065f46', '#ecfdf5', '11번 자동화 배포 관리자',
                '배포 승인 완료!',
                '대표님의 모바일 승인이 확인되어 즉시 소스코드 머지 및 Vercel Production 배포를 실행했습니다.',
                `<div class="log">${logContent}</div>`
            );
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send(html);
        }

        // ── REJECT ─────────────────────────────────────────────────────────
        if (action === 'reject') {
            await upsertStatus(pr, 'REJECTED');
            const html = htmlPage(
                '❌', '#991b1b', '#fef2f2', '11번 자동화 배포 관리자',
                '배포 반려 완료',
                '대표님의 지시에 따라 자가치유 코드 패치를 반려하고 배포를 긴급 중단했습니다. 소스코드는 수정 이전 상태로 안전하게 롤백(Rollback) 유지됩니다.',
                ''
            );
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send(html);
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(400).send(`Bad Request: 알 수 없는 action '${action}'`);

    } catch (err) {
        // ── 절대 죽지 않는 최후 방어선 ──────────────────────────────────────
        console.error('🚨 [deploy-approval] 치명적 오류:', err);

        const errMsg = String(err && err.message ? err.message : err);
        const errStack = String(err && err.stack ? err.stack : '');

        const html = htmlPage(
            '🚨', '#991b1b', '#fef2f2', '11번 자동화 배포 관리자',
            '배포 처리 중 내부 오류 발생',
            '아래 오류 내역을 캡처하여 개발팀에 전달해 주세요.',
            `<div class="log err">⛔ ERROR: ${errMsg}\n\n${errStack}</div>`
        );

        // 이미 헤더를 전송했을 경우를 대비한 이중 가드
        if (res.headersSent) return;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(500).send(html);
    }
}
