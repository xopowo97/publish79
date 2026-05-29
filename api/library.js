// api/library.js
// ============================================================
// [1번 살피미 에이전트] 국립중앙도서관 API 서버리스 프록시
// ============================================================
// 역할: API Key 노출 차단(보안) + 브라우저 CORS 우회 + 9번→12번 방어 루프 적용
// 담당: 안티그래비티 (Antigravity AI Agent)
// ============================================================

// ⚠️ API Key는 절대 코드에 직접 삽입하지 않습니다.
// 로컬: 프로젝트 루트의 .env 파일에 LIBRARY_API_KEY=... 등록
// Vercel: 대시보드 > Settings > Environment Variables에 LIBRARY_API_KEY 등록
const LIBRARY_API_KEY = process.env.LIBRARY_API_KEY;
const LIBRARY_API_BASE = 'https://www.nl.go.kr/NL/search/openApi/search.do';

// 자기 참조 에러 보고 URL (Vercel 환경에서 send-error API 내부 호출용)
// → 9번 기술행정지원 실장을 서버-to-서버로 호출
const SELF_BASE_URL = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

// ============================================================
// [12번 AI 보안관] 클라이언트 쿼리 키워드 인라인 1차 필터
// (서버단 진입 즉시 스캔 → send-error.js 내 2차 필터와 이중 방어)
// ============================================================
function runSecuritySheriff_Library(keyword) {
    const text = String(keyword || '');

    const promptInjectionRegex = /(ignore\s+previous\s+instructions|system\s+override|sudo\b|chmod\b)/i;
    const xssRegex = /(<script\b[^>]*>|javascript:|onerror\s*=)/i;
    const sqliRegex = /\b(union|select|insert|update|delete|drop|alter)\b/i;

    if (promptInjectionRegex.test(text)) {
        return { securityLevel: 'DANGER', matchedPattern: 'Prompt Injection & System Bypass' };
    }
    if (xssRegex.test(text)) {
        return { securityLevel: 'DANGER', matchedPattern: 'Cross-Site Scripting (XSS)' };
    }
    if (sqliRegex.test(text) && (text.includes("'") || text.includes('"') || text.includes(';'))) {
        return { securityLevel: 'DANGER', matchedPattern: 'SQL Injection (SQLi)' };
    }
    if (sqliRegex.test(text)) {
        return { securityLevel: 'SUSPICIOUS', matchedPattern: 'Suspicious SQL Keyword' };
    }

    return { securityLevel: 'SAFE', matchedPattern: '' };
}

// ============================================================
// [9번 기술행정지원 실장] 에러 포착 및 send-error API 전달 함수
// library.js 내에서 발생한 에러를 9번 실장에게 즉시 보고
// ============================================================
async function report9thAgentError(errorMessage, keyword) {
    try {
        const payload = {
            message: `[1번 살피미 에이전트] 도서관 API 호출 실패: ${errorMessage}`,
            filename: 'api/library.js',
            lineno: 0,
            colno: 0,
            userId: 'system_agent_01', // 1번 살피미 에이전트 식별자
            userRole: 'agent',
            userAgent: 'Antigravity-Agent/1.0 (SalPimi-DeepSearch)',
            timestamp: new Date().toISOString(),
            keyword: keyword // 추가 컨텍스트: 검색어
        };

        // ✅ 9번 기술행정지원 실장 API 호출 (서버-to-서버)
        const res = await fetch(`${SELF_BASE_URL}/api/send-error`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            console.log('[library.js] ✅ 9번 실장 에러 보고 완료 → 12번 보안관 필터 통과 확인됨');
        } else {
            console.error('[library.js] ❌ 9번 실장 에러 보고 실패 (HTTP:', res.status, ')');
        }
    } catch (reportError) {
        // 9번 실장 보고 자체가 실패해도 메인 핸들러를 크래시시키지 않음
        console.error('[library.js] ⚠️ 9번 실장 에러 보고 중 예외 발생:', reportError.message);
    }
}

// ============================================================
// Vercel 서버리스 핸들러 (메인 진입점)
// ============================================================
export default async function handler(req, res) {
    // 1. CORS 헤더 설정 (브라우저 직접 호출 허용)
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') {
        return res.status(200).send('OK');
    }

    // ============================================================
    // [12번 AI 보안관] Step 1: 환경 변수(API Key) 존재 여부 사전 검증
    // ============================================================
    if (!LIBRARY_API_KEY) {
        const errMsg = 'LIBRARY_API_KEY 환경 변수가 설정되지 않았습니다. Vercel 대시보드 또는 .env 파일을 확인하세요.';
        console.error('[library.js] 🚨 12번 보안관 경고:', errMsg);
        await report9thAgentError(errMsg, '(API Key 미설정)');
        return res.status(500).json({
            error: errMsg,
            securityLog: '[12번 보안관] LIBRARY_API_KEY 미설정 → 배포 환경 점검 필요'
        });
    }

    // ============================================================
    // 쿼리 파라미터 파싱 (GET: ?keyword=출판 / POST: { keyword: "출판" })
    // ============================================================
    let keyword = '';
    if (req.method === 'GET') {
        keyword = req.query?.keyword || '';
    } else if (req.method === 'POST') {
        keyword = req.body?.keyword || '';
    }

    if (!keyword.trim()) {
        return res.status(400).json({ error: '검색 키워드(keyword)가 필요합니다.' });
    }

    // ============================================================
    // [12번 AI 보안관] Step 2: 클라이언트 키워드 인라인 보안 스캔
    // ============================================================
    const { securityLevel, matchedPattern } = runSecuritySheriff_Library(keyword);

    if (securityLevel === 'DANGER') {
        const dangerMsg = `[12번 보안관] 악성 키워드 탐지 → 패턴: ${matchedPattern} | 키워드: "${keyword.substring(0, 50)}"`;
        console.error(`[library.js] 🚨 DANGER: ${dangerMsg}`);

        // 9번 실장에게 DANGER 에러 즉시 보고
        await report9thAgentError(dangerMsg, keyword.substring(0, 50));

        return res.status(400).json({
            error: `보안 위협 감지: ${matchedPattern}`,
            securityLog: `[12번 보안관] DANGER 판정 → 국립중앙도서관 API 호출 즉시 차단. 패킷 파기 완료.`
        });
    }

    if (securityLevel === 'SUSPICIOUS') {
        // SUSPICIOUS는 차단하지 않되, 경고 로그만 기록
        console.warn(`[library.js] ⚠️ SUSPICIOUS 키워드 감지: "${keyword}" | 패턴: ${matchedPattern}`);
    }

    // ============================================================
    // [1번 살피미 에이전트] 국립중앙도서관 API 실제 호출
    // ============================================================
    const params = new URLSearchParams({
        key:         LIBRARY_API_KEY,
        apiType:     'json',
        category:    '도서',
        keyword:     keyword,
        pageNum:     '1',
        pageSize:    '10',
        displayType: 'detail'
    });

    const libraryUrl = `${LIBRARY_API_BASE}?${params.toString()}`;

    try {
        console.log(`[library.js] 📚 [Proxy Test] 국립중앙도서관 API 호출 시작 → 키워드: "${keyword}"`);

        const libraryRes = await fetch(libraryUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Antigravity-SalPimi-Agent/1.0'
            }
        });

        if (!libraryRes.ok) {
            // ============================================================
            // [9번 기술행정지원 실장] API 응답 에러 즉시 포착 및 보고
            // ============================================================
            const errText = await libraryRes.text();
            const errMsg = `국립중앙도서관 API HTTP 오류 (${libraryRes.status}): ${errText.substring(0, 200)}`;
            console.error(`[library.js] ❌ [Proxy Test] 9번→12번 방어 작동: ${errMsg}`);

            // 9번 실장 에러 포착 → send-error.js 내 12번 보안관 필터 자동 작동
            await report9thAgentError(errMsg, keyword);

            return res.status(502).json({
                error: '국립중앙도서관 API 응답 오류',
                detail: errMsg,
                proxyLog: '[Proxy Test] 9번→12번 방어 작동'
            });
        }

        const libraryData = await libraryRes.json();

        // ============================================================
        // ✅ 통신 성공 — 결과 정제 후 클라이언트로 전달
        // ============================================================
        // ✅ [타입 안전성] 응답 데이터에서 결과 배열을 안전하게 추출
        // 국립중앙도서관 API 응답 구조: { result: [...] } 또는 { docs: [...] } 등 다양
        const rawResults = libraryData.result ?? libraryData.docs ?? libraryData.data ?? null;

        // Array.isArray로 배열 여부 먼저 확인 →
        //   배열이면: 그대로 사용
        //   객체이면: [객체]로 감싸서 배열로 강제 변환
        //   비어있으면: []로 방어 (시스템 전체 멈춤 방지)
        const results = Array.isArray(rawResults)
            ? rawResults
            : (rawResults !== null && rawResults !== undefined ? [rawResults] : []);

        // totalCount도 안전하게 추출 (없으면 results 배열 길이로 대체)
        const totalCount = libraryData.total ?? libraryData.totalCount ?? libraryData.totalPage ?? results.length;

        console.log(`[library.js] ✅ [Proxy Test] Success → 검색 결과 ${totalCount}건 수신 완료. 키워드: "${keyword}"`);

        return res.status(200).json({
            success: true,
            keyword:    keyword,
            totalCount: totalCount,
            results:    results,
            proxyLog:   '[Proxy Test] Success',
            securityLog: `[12번 보안관] SAFE 판정 → 정상 호출 허가됨`
        });

    } catch (fetchError) {
        // ============================================================
        // [9번 기술행정지원 실장] 네트워크 예외(fetch 자체 실패) 포착
        // ============================================================
        const errMsg = `네트워크 예외 (fetch 실패): ${fetchError.message}`;
        console.error(`[library.js] ❌ [Proxy Test] 9번→12번 방어 작동: ${errMsg}`);

        // 9번 실장 에러 즉시 보고 → 12번 보안관 자동 통과
        await report9thAgentError(errMsg, keyword);

        return res.status(500).json({
            error: '서버 내부 오류 (네트워크 예외)',
            detail: errMsg,
            proxyLog: '[Proxy Test] 9번→12번 방어 작동'
        });
    }
}
