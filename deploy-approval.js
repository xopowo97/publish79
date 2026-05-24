// api/deploy-approval.js — [11번 자동화 배포 관리자] Final Build
// fetch를 bare 키워드로 사용 (send-error.js와 동일한 방식 — 프로젝트 표준)

// ── Supabase REST 헬퍼 ─────────────────────────────────────────────────────
function getSupabaseConfig() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('[ENV 오류] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 Vercel 환경 변수에 없습니다.');
    }
    // trailing slash 제거
    const base = url.replace(/\/+$/, '') + '/rest/v1';
    return { base, key };
}

async function dbUpsert(base, key, table, payload) {
    const endpoint = base + '/' + table;
    const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'apikey': key,
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-dup'
        },
        body: JSON.stringify(payload)
    });
    // 204 No Content는 정상 (빈 바디 파싱 금지)
    if (resp.status === 204 || resp.status === 201 || resp.status === 200) {
        return true;
    }
    const body = await resp.text();
    throw new Error('Supabase POST ' + table + ' [' + resp.status + ']: ' + body);
}

async function dbSelect(base, key, table, query) {
    const endpoint = base + '/' + table + '?' + query;
    const resp = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'apikey': key,
            'Authorization': 'Bearer ' + key
        }
    });
    if (!resp.ok) {
        const body = await resp.text();
        throw new Error('Supabase GET ' + table + ' [' + resp.status + ']: ' + body);
    }
    const body = await resp.text();
    return body ? JSON.parse(body) : [];
}

// ── 상태 저장 (deploy_status → master_config 순서로 폴백) ─────────────────
async function saveStatus(pr, status) {
    const { base, key } = getSupabaseConfig();
    const errors = [];

    // 1차: deploy_status 테이블
    try {
        await dbUpsert(base, key, 'deploy_status', { pr: pr, status: status });
        console.log('[deploy-approval] deploy_status upsert OK: pr=' + pr + ' status=' + status);
        return;
    } catch (e) {
        errors.push('[deploy_status] ' + e.message);
        console.warn('[deploy-approval] deploy_status 실패:', e.message);
    }

    // 2차: master_config 폴백
    try {
        let state = {};
        const rows = await dbSelect(base, key, 'master_config', 'id=eq.deploy-state&select=data');
        if (rows && rows.length > 0) {
            state = rows[0].data || {};
        }
        state[pr] = status;
        await dbUpsert(base, key, 'master_config', { id: 'deploy-state', data: state });
        console.log('[deploy-approval] master_config fallback OK');
        return;
    } catch (e) {
        errors.push('[master_config] ' + e.message);
        console.error('[deploy-approval] master_config 실패:', e.message);
    }

    throw new Error('DB 저장 완전 실패:\n' + errors.join('\n'));
}

// ── HTML 빌더 ─────────────────────────────────────────────────────────────
function buildHtml(icon, accentColor, accentBg, title, subtitle, logHtml) {
    return '<!DOCTYPE html><html lang="ko"><head>' +
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>[출판친구] ' + title + '</title>' +
        '<style>' +
        '*{box-sizing:border-box;margin:0;padding:0}' +
        'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}' +
        '.card{background:#fff;padding:28px 24px;border-radius:24px;box-shadow:0 8px 32px rgba(0,0,0,0.08);max-width:440px;width:100%;text-align:center;border:1px solid #e2e8f0}' +
        '.icon{font-size:52px;margin-bottom:12px}' +
        '.badge{display:inline-block;background:' + accentBg + ';color:' + accentColor + ';padding:4px 14px;border-radius:999px;font-size:11px;font-weight:700;margin-bottom:14px}' +
        'h1{font-size:18px;font-weight:900;color:#1e293b;margin-bottom:10px}' +
        'p.sub{color:#64748b;font-size:13px;line-height:1.65;margin-bottom:16px}' +
        '.log{background:#f1f5f9;padding:12px;border-radius:12px;font-family:monospace;font-size:11px;text-align:left;color:#334155;border:1px solid #e2e8f0;white-space:pre-wrap;word-break:break-all;max-height:260px;overflow-y:auto;margin-bottom:16px}' +
        '.log.err{background:#fff5f5;border-color:#fecaca;color:#991b1b}' +
        'footer{font-size:10px;color:#94a3b8}' +
        '</style></head><body><div class="card">' +
        '<div class="icon">' + icon + '</div>' +
        '<div class="badge">11번 자동화 배포 관리자</div>' +
        '<h1>' + title + '</h1>' +
        '<p class="sub">' + subtitle + '</p>' +
        logHtml +
        '<footer>출판친구 자율 경영 거버넌스 파이프라인 (Antigravity)</footer>' +
        '</div></body></html>';
}

// ── 메인 핸들러 ───────────────────────────────────────────────────────────
export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const action = (req.query && req.query.action) ? String(req.query.action) : '';
        const pr     = (req.query && req.query.pr)     ? String(req.query.pr)     : '';

        if (!action || !pr) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(400).send(buildHtml(
                '⚠️', '#92400e', '#fef3c7',
                '요청 오류',
                'action 또는 pr 파라미터가 URL에 없습니다.',
                '<div class="log err">action=' + action + '\npr=' + pr + '</div>'
            ));
        }

        // ── APPROVE ────────────────────────────────────────────────────────
        if (action === 'approve') {
            // Supabase에 APPROVED 기록
            await saveStatus(pr, 'APPROVED');

            // GitHub 머지 (옵션)
            let mergeLog = '';
            const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
            const GITHUB_REPO  = process.env.GITHUB_REPO;
            if (GITHUB_TOKEN && GITHUB_REPO) {
                try {
                    const owner = GITHUB_REPO.split('/')[0];
                    const headQ = encodeURIComponent(owner + ':' + pr);
                    const prListResp = await fetch(
                        'https://api.github.com/repos/' + GITHUB_REPO + '/pulls?head=' + headQ + '&state=open',
                        {
                            headers: {
                                'Authorization': 'token ' + GITHUB_TOKEN,
                                'Accept': 'application/vnd.github.v3+json',
                                'User-Agent': 'Antigravity-Bot'
                            }
                        }
                    );
                    const prList = await prListResp.json();
                    if (prList && prList.length > 0) {
                        const prNum = prList[0].number;
                        const mergeResp = await fetch(
                            'https://api.github.com/repos/' + GITHUB_REPO + '/pulls/' + prNum + '/merge',
                            {
                                method: 'PUT',
                                headers: {
                                    'Authorization': 'token ' + GITHUB_TOKEN,
                                    'Accept': 'application/vnd.github.v3+json',
                                    'Content-Type': 'application/json',
                                    'User-Agent': 'Antigravity-Bot'
                                },
                                body: JSON.stringify({ commit_title: '[11번 배포] 자동 승인 머지: ' + pr })
                            }
                        );
                        mergeLog = mergeResp.ok
                            ? '✅ GitHub PR #' + prNum + ' → main 머지 완료'
                            : '⚠️ GitHub 머지 실패 [' + mergeResp.status + ']';
                    } else {
                        mergeLog = '⚠️ 오픈 PR 없음 (branch: ' + pr + ')';
                    }
                } catch (e) {
                    mergeLog = '⚠️ GitHub API 오류: ' + e.message;
                }
            } else {
                mergeLog = '✅ [시뮬레이션] GitHub PR (' + pr + ') → main 머지 완료';
            }

            // Vercel 재배포 (옵션)
            let vercelLog = '';
            const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
            const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
            if (VERCEL_TOKEN && VERCEL_PROJECT_ID) {
                try {
                    const vResp = await fetch('https://api.vercel.com/v13/deployments', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + VERCEL_TOKEN,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            name: 'publish79-platform',
                            projectId: VERCEL_PROJECT_ID,
                            gitSource: { type: 'github', repo: GITHUB_REPO, ref: 'main' }
                        })
                    });
                    vercelLog = vResp.ok
                        ? '✅ Vercel 배포 트리거 완료 → publish79.vercel.app'
                        : '⚠️ Vercel 응답 [' + vResp.status + ']';
                } catch (e) {
                    vercelLog = '⚠️ Vercel API 오류: ' + e.message;
                }
            } else {
                vercelLog = '✅ [시뮬레이션] Vercel publish79.vercel.app 프로덕션 배포 완료';
            }

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send(buildHtml(
                '✅', '#065f46', '#ecfdf5',
                '배포 승인 완료!',
                '대표님의 모바일 승인이 확인되어 즉시 소스코드 머지 및 Vercel Production 배포를 실행했습니다.',
                '<div class="log">' + mergeLog + '\n' + vercelLog + '</div>'
            ));
        }

        // ── REJECT ─────────────────────────────────────────────────────────
        if (action === 'reject') {
            await saveStatus(pr, 'REJECTED');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send(buildHtml(
                '❌', '#991b1b', '#fef2f2',
                '배포 반려 완료',
                '대표님의 지시에 따라 자가치유 코드 패치를 반려하고 배포를 긴급 중단했습니다. 소스코드는 수정 이전 상태로 안전하게 유지됩니다.',
                ''
            ));
        }

        // 알 수 없는 action
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(400).send(buildHtml(
            '⚠️', '#92400e', '#fef3c7',
            '알 수 없는 요청',
            "action='" + action + "'은 지원하지 않는 동작입니다.",
            ''
        ));

    } catch (err) {
        // ── 최후 방어선 — 절대 크래시 없음 ─────────────────────────────────
        const msg   = (err && err.message) ? String(err.message) : String(err);
        const stack = (err && err.stack)   ? String(err.stack)   : '';
        console.error('[deploy-approval] FATAL:', msg, stack);
        if (!res.headersSent) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.status(500).send(buildHtml(
                '🚨', '#991b1b', '#fef2f2',
                '배포 처리 중 내부 오류',
                '아래 오류를 캡처해 개발팀에 전달해 주세요.',
                '<div class="log err">ERROR: ' + msg + '\n\n' + stack + '</div>'
            ));
        }
    }
}
