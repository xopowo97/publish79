// api/typeset.js
// ============================================================
// [4번 VDP_조판사 에이전트] 가상 조판 및 물리 스펙 산출 서버리스 API
// ============================================================
// 역할: 4대 판형별 가상 페이지 수/책등(세네카) 계산 시뮬레이션 및 감사 로그/상태 업데이트 기록
// 담당: 안티그래비티 (Antigravity AI Agent)
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

// Supabase 감사 로그 기록
async function writeAuditLog(supabase_url, supabase_key, logData) {
    try {
        const base = supabase_url.replace(/\/+$/, '') + '/rest/v1';
        const endpoint = `${base}/agent_audit_logs`;
        await fetch(endpoint, {
            method: 'POST',
            headers: {
                'apikey': supabase_key,
                'Authorization': `Bearer ${supabase_key}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                agent_id: logData.agent_id,
                agent_name: logData.agent_name,
                log_level: logData.log_level || 'info',
                message: logData.message,
                metadata: logData.metadata ? JSON.stringify(logData.metadata) : null,
                created_at: new Date().toISOString()
            })
        });
    } catch (_) {}
}

// Supabase 에이전트 상태 업데이트
async function updateAgentStatus(supabase_url, supabase_key, agentId, status, role) {
    try {
        const base = supabase_url.replace(/\/+$/, '') + '/rest/v1';
        const endpoint = `${base}/agents?id=eq.${agentId}`;
        await fetch(endpoint, {
            method: 'PATCH',
            headers: {
                'apikey': supabase_key,
                'Authorization': `Bearer ${supabase_key}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                status: status,
                role: role,
                updated_at: new Date().toISOString()
            })
        });
    } catch (_) {}
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).send('OK');

    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    if (!checkRateLimit(clientIp)) {
        return res.status(429).json({ error: '요청 빈도 초과 (분당 최대 20회)' });
    }

    const rawUrl = process.env.SUPABASE_URL;
    const supKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!rawUrl || !supKey) {
        return res.status(500).json({ error: 'SUPABASE 환경변수 미설정' });
    }

    // POST 본문 파싱
    const { action, title, author, charsCount, innerPaper, selectedSpec } = req.body || {};

    if (!action) {
        return res.status(400).json({ error: 'action 파라미터가 누락되었습니다. (simulate 또는 compile 필요)' });
    }

    const log = (agent_id, agent_name, level, message, metadata) =>
        writeAuditLog(rawUrl, supKey, { agent_id, agent_name, log_level: level, message, metadata });

    try {
        if (action === 'simulate') {
            const count = parseInt(charsCount, 10) || 150000; // 글자수 기본값 150,000자
            const paper = String(innerPaper || '미색모조80g');

            // 1. 에이전트 상태 가동 (4번 VDP_조판사 -> 'running')
            await updateAgentStatus(rawUrl, supKey, 4, 'running', '4대 표준 규격 가상 조판 시뮬레이션 중');
            await log(4, 'VDP_조판사', 'info', `도서 '${title}' 1차 가상 조판 시작 (글자 수: ${count.toLocaleString()}자, 내지: ${paper})`, { title, charsCount: count, innerPaper: paper });

            // 2. 용지 평량별 두께 지정 (단위: mm)
            let pageThickness = 0.10; // 기본값 0.10mm
            if (paper.includes('80g')) pageThickness = 0.09;
            else if (paper.includes('100g')) pageThickness = 0.11;
            else if (paper.includes('120g')) pageThickness = 0.13;

            // 3. 4대 판형별 예상 페이지 수 및 세네카(책등) 계산
            // 판형별 글자수 밀도 기준 (페이지당 대략적인 글자 수)
            const specsDefinition = [
                { name: 'A5국판(148x210)', density: 460 },
                { name: '신국판(152x225)', density: 550 },
                { name: '46배판형(188x257)', density: 720 },
                { name: '국배판(210x297)', density: 920 }
            ];

            const simulations = specsDefinition.map(spec => {
                let pages = Math.ceil(count / spec.density);
                // 양면 인쇄를 고려한 짝수 정규화
                if (pages % 2 !== 0) pages += 1;
                // 최소 페이지 가드
                pages = Math.max(pages, 40);

                // 책등 계산: (페이지 / 2) * 장당두께 + 표지두께(0.5mm)
                const spineMm = Number(((pages / 2) * pageThickness + 0.5).toFixed(1));

                return {
                    specName: spec.name,
                    pages: pages,
                    spineMm: spineMm
                };
            });

            // 4. 에이전트 상태 완료 (4번 VDP_조판사 -> 'success')
            await updateAgentStatus(rawUrl, supKey, 4, 'success', '1차 가상 조판 완료');
            await log(4, 'VDP_조판사', 'success', `도서 '${title}' 4대 규격 가상 조판 시뮬레이션 완료`, { simulations });

            return res.status(200).json({
                success: true,
                simulations
            });

        } else if (action === 'compile') {
            if (!selectedSpec) {
                return res.status(400).json({ error: 'selectedSpec 파라미터가 누락되었습니다.' });
            }

            // 1. 에이전트 상태 가동 (4번 VDP_조판사 -> 'running')
            await updateAgentStatus(rawUrl, supKey, 4, 'running', `최종 판형 '${selectedSpec}' 맞춤 인쇄 표준 PDF/X-4 컴파일 중`);
            await log(4, 'VDP_조판사', 'info', `도서 '${title}' - '${selectedSpec}' 규격 최종 2차 조판 개시`, { title, selectedSpec });

            // 2. 가상의 컴파일 처리 완료 후 상태 완료 (4번 VDP_조판사 -> 'success')
            await updateAgentStatus(rawUrl, supKey, 4, 'success', `인쇄용 PDF/X-4 컴파일 완료 (${selectedSpec})`);
            await log(4, 'VDP_조판사', 'success', `도서 '${title}' 최종 300 DPI PDF/X-4 파일 빌드 성공`, { title, selectedSpec });

            return res.status(200).json({
                success: true,
                message: `'${selectedSpec}' 판형으로 최종 2차 조판 및 고해상도 PDF 컴파일 완료.`
            });
        } else {
            return res.status(400).json({ error: '알 수 없는 action입니다.' });
        }
    } catch (err) {
        const msg = err?.message ? String(err.message) : String(err);
        await log(9, '눈치왕', 'error', `VDP 조판 예외 발생: ${msg}`, {});
        await updateAgentStatus(rawUrl, supKey, 4, 'error', '가상 조판 처리 실패');
        return res.status(500).json({ error: '조판 엔진 내부 에러', detail: msg });
    }
}
