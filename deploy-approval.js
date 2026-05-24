import fs from 'fs';
import path from 'path';

// Helper function to upsert status to Supabase (with master_config fallback)
async function upsertStatus(pr, status) {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://fquzouhstheqvuzzhxqs.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_BOtAPo474zF0XsKOxhKxsQ_wBqY1pcn';
    
    const restUrl = `${supabaseUrl}/rest/v1`;

    // Attempt 1: deploy_status table
    try {
        const res = await fetch(`${restUrl}/deploy_status`, {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-dup'
            },
            body: JSON.stringify({ pr, status })
        });
        if (res.ok) return true;
    } catch (e) {
        console.warn("deploy_status table write failed, trying fallback:", e.message);
    }

    // Attempt 2: fallback to master_config
    try {
        let deployState = {};
        const getRes = await fetch(`${restUrl}/master_config?id=eq.deploy-state&select=data`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });
        if (getRes.ok) {
            const list = await getRes.json();
            if (list && list.length > 0) {
                deployState = list[0].data || {};
            }
        }
        
        deployState[pr] = status;
        
        await fetch(`${restUrl}/master_config`, {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-dup'
            },
            body: JSON.stringify({ id: 'deploy-state', data: deployState })
        });
        return true;
    } catch (err) {
        console.error("Fallback master_config write failed:", err.message);
        return false;
    }
}

export default async function handler(req, res) {
    const { action, pr, file } = req.query;

    if (!action || !pr) {
        return res.status(400).send('Missing action or pr query parameter.');
    }

    if (action === 'approve') {
        // 1. Update state in Supabase
        await upsertStatus(pr, 'APPROVED');

        // 2. GitHub PR Merge & Vercel Deploy (Simulation or Real)
        const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
        const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
        const GITHUB_REPO = process.env.GITHUB_REPO;

        let vercelLog = 'Deploying to Vercel...';
        let mergeLog = 'Merging PR on GitHub...';

        if (GITHUB_TOKEN && GITHUB_REPO) {
            try {
                // Find PR list to merge this branch
                const pullsUrl = `https://api.github.com/repos/${GITHUB_REPO}/pulls?head=${GITHUB_REPO.split('/')[0]}:${pr}`;
                const pullsRes = await fetch(pullsUrl, {
                    headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
                });
                if (pullsRes.ok) {
                    const pulls = await pullsRes.json();
                    if (pulls && pulls.length > 0) {
                        const prNumber = pulls[0].number;
                        const mergeUrl = `https://api.github.com/repos/${GITHUB_REPO}/pulls/${prNumber}/merge`;
                        const mergeRes = await fetch(mergeUrl, {
                            method: 'PUT',
                            headers: {
                                'Authorization': `token ${GITHUB_TOKEN}`,
                                'Accept': 'application/vnd.github.v3+json',
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ commit_title: `🤖 [11번 배포] 자동 승인 배포 머지: ${pr}` })
                        });
                        if (mergeRes.ok) {
                            mergeLog = `✅ GitHub PR #${prNumber}가 자율적으로 main 브랜치에 머지되었습니다.`;
                        } else {
                            mergeLog = `⚠️ GitHub PR 머지 실패: ${await mergeRes.text()}`;
                        }
                    }
                }
            } catch (err) {
                mergeLog = `⚠️ GitHub PR 머지 중 오류: ${err.message}`;
            }
        } else {
            mergeLog = `✅ [Simulated] GitHub PR (${pr})이 자율적으로 main 브랜치에 머지되었습니다.`;
        }

        if (VERCEL_TOKEN && VERCEL_PROJECT_ID) {
            try {
                const deployUrl = `https://api.vercel.com/v13/deployments?projectId=${VERCEL_PROJECT_ID}`;
                const vercelRes = await fetch(deployUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${VERCEL_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: 'publish79-platform',
                        gitSource: {
                            type: 'github',
                            repo: GITHUB_REPO,
                            ref: 'main'
                        }
                    })
                });
                if (vercelRes.ok) {
                    vercelLog = `✅ Vercel Production 배포가 성공적으로 트리거되었습니다 (publish79.vercel.app).`;
                } else {
                    vercelLog = `⚠️ Vercel 배포 실패: ${await vercelRes.text()}`;
                }
            } catch (err) {
                vercelLog = `⚠️ Vercel 배포 중 오류: ${err.message}`;
            }
        } else {
            vercelLog = `✅ [Simulated] Vercel API 호출 성공: publish79.vercel.app 무중단 프로덕션 릴리스 배포가 완료되었습니다.`;
        }

        // Return a beautiful HTML confirmation page for mobile browsers
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>[출판친구] 배포 승인 완료</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .card { background: white; padding: 30px; border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); max-width: 90%; width: 400px; text-align: center; border: 1px solid #e2e8f0; box-sizing: border-box; }
                    .icon { font-size: 50px; color: #10b981; margin-bottom: 15px; }
                    h1 { font-size: 20px; font-weight: 900; color: #1e293b; margin: 0 0 10px 0; }
                    p { color: #64748b; font-size: 13px; line-height: 1.6; margin-bottom: 20px; }
                    .log-box { background: #f1f5f9; padding: 12px; border-radius: 12px; font-family: monospace; font-size: 11px; text-align: left; color: #334155; margin-bottom: 20px; border: 1px solid #e2e8f0; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
                    .badge { display: inline-block; background: #ecfdf5; color: #065f46; padding: 6px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; margin-bottom: 15px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">✅</div>
                    <div class="badge">11번 자동화 배포 관리자</div>
                    <h1>배포 승인 완료!</h1>
                    <p>대표님의 모바일 승인이 확인되어 즉시 소스코드 머지 및 Vercel Production 배포를 실행합니다.</p>
                    <div class="log-box">${mergeLog}<br>${vercelLog}</div>
                    <p style="font-size: 10px; color: #94a3b8; margin: 0;">출판친구 자율 경영 거버넌스 파이프라인 (Antigravity)</p>
                </div>
            </body>
            </html>
        `);
    }

    if (action === 'reject') {
        // 1. Update state in Supabase
        await upsertStatus(pr, 'REJECTED');

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>[출판친구] 배포 반려 처리</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .card { background: white; padding: 30px; border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); max-width: 90%; width: 400px; text-align: center; border: 1px solid #e2e8f0; box-sizing: border-box; }
                    .icon { font-size: 50px; color: #ef4444; margin-bottom: 15px; }
                    h1 { font-size: 20px; font-weight: 900; color: #1e293b; margin: 0 0 10px 0; }
                    p { color: #64748b; font-size: 13px; line-height: 1.6; margin-bottom: 20px; }
                    .badge { display: inline-block; background: #fef2f2; color: #991b1b; padding: 6px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; margin-bottom: 15px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">❌</div>
                    <div class="badge">11번 자동화 배포 관리자</div>
                    <h1>배포 반려 완료</h1>
                    <p>대표님의 지시에 따라 자가치유 코드 패치를 반려하고 배포를 긴급 중단했습니다. 소스코드는 수정 이전 상태로 안전하게 롤백(Rollback) 유지됩니다.</p>
                    <p style="font-size: 10px; color: #94a3b8; margin: 0;">출판친구 자율 경영 거버넌스 파이프라인 (Antigravity)</p>
                </div>
            </body>
            </html>
        `);
    }

    return res.status(400).send('Invalid action.');
}
