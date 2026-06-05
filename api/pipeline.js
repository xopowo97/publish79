// api/pipeline.js
// ============================================================
// [자율 파이프라인] 1번 살피미 + 2번 다듬이 실전 결합 엔진
// ============================================================
// 역할: 알라딘 OpenAPI(살피미)로 수집 → 도서관 정보나루 대출 통계 연동 및 폴백 처리 → 다듬이(정제/저작권 판별) → Supabase reprint_candidates 자동 적재
// + agent_audit_logs에 실행 로그 기록 (실시간 로그 스트림 소스)
// 담당: 안티그래비티 (Antigravity AI Agent)
// ============================================================

// ============================================================
// [보안 방어벽] Rate Limiter — IP별 분당 호출 빈도 제한
// Vercel 서버리스 인스턴스 메모리 기반 (인스턴스 초기화 시 리셋)
// 분당 10회 초과 시 429 Too Many Requests 반환
// ============================================================
const _rateLimitMap = new Map(); // { ip: { count, windowStart } }
const RATE_LIMIT_MAX = 10;        // 허용 최대 호출 수
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1분 윈도우

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = _rateLimitMap.get(ip);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        // 새 윈도우 시작
        _rateLimitMap.set(ip, { count: 1, windowStart: now });
        return true; // 허용
    }
    entry.count += 1;
    if (entry.count > RATE_LIMIT_MAX) {
        return false; // 차단
    }
    return true; // 허용
}

const ALADIN_API_KEY = process.env.ALADIN_API_KEY;
const LIBRARY_NARU_API_KEY = process.env.LIBRARY_NARU_API_KEY;

// ============================================================
// [2번 다듬이 에이전트] 수집된 원시 데이터 정제 함수
// 절판/희귀 판별 → 다차원 복간 점수 산출 → 저작권 메타데이터 Heuristic 판별 → DB 표준 스키마 변환
// ============================================================
function runDataRefiner_Dadumeui(rawBook) {
    if (!rawBook) return null;

    // 필드 정규화 및 HTML 태그 제거
    const title  = String(rawBook.title || '').trim().replace(/<\/?[^>]+(>|$)/g, "");
    const author = String(rawBook.author || '미상').trim().replace(/<\/?[^>]+(>|$)/g, "");
    const isbn   = String(rawBook.isbn13 || rawBook.isbn || '').replace(/[^0-9X]/gi, '');
    
    // 출판연도 추출 (예: "2015-03-20" -> 2015)
    const pubYear = parseInt(
        String(rawBook.pubDate || '0').substring(0, 4),
        10
    ) || null;
    
    const publisher = String(rawBook.publisher || '').trim().replace(/<\/?[^>]+(>|$)/g, "");
    const loanCount = parseInt(rawBook.library_loans || 0, 10) || 0;
    const stockStatus = String(rawBook.stockStatus || '').trim();
    const isSimulated = !!rawBook.is_simulated;

    if (!title) return null;

    // [복간 점수 다차원화 가중치 산식]
    // 1. 대출 점수 (60%): 최대 650건 기준 100점 척도
    const loanScore = Math.min(100, Math.round((loanCount / 650) * 100));

    // 2. 희소성 점수 (40%): 절판 100점, 품절 50점, 정상 유통 0점
    let scarcityScore = 0;
    if (stockStatus === '절판') {
        scarcityScore = 100;
    } else if (stockStatus === '품절') {
        scarcityScore = 50;
    }

    // 최종 복간 점수 계산 (각각 60%, 40% 가중치 적용 및 반올림)
    const score = Math.min(100, Math.round((loanScore * 0.6) + (scarcityScore * 0.4)));

    // 절판 여부 판별 (알라딘 상태값 우선, 없으면 연도 7년 기준 예비 룰 적용)
    const currentYear = new Date().getFullYear();
    const age = pubYear ? (currentYear - pubYear) : 0;
    const isOutOfPrint = (stockStatus === '절판' || stockStatus === '품절' || age >= 7);

    // [저작권 상태 Heuristic 판별]
    let copyrightStatus = 'protected';
    let authorStatus = 'unknown';
    let estimatedRoyaltyRate = 10.00; // 기본 인세율 10%

    if (pubYear && age >= 70) {
        copyrightStatus = 'public_domain';
        authorStatus = 'deceased'; // 사망 추정
        estimatedRoyaltyRate = 0.00; // 퍼블릭 도메인은 인세 0%
    } else {
        authorStatus = 'alive'; // 기본 생존 추정
    }

    return {
        title,
        author,
        isbn: isbn || null,
        pub_year: pubYear,
        publisher: publisher || null,
        library_loans: loanCount,
        reprint_score: score,
        demand_index: loanScore, // 대출 점수와 동일하게 설정하여 일관성 유지
        is_out_of_print: isOutOfPrint,
        status: 'candidate',
        is_simulated: isSimulated,
        copyright_status: copyrightStatus,
        author_status: authorStatus,
        estimated_royalty_rate: estimatedRoyaltyRate,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
}

// ============================================================
// Supabase에 감사 로그 기록 (agent_audit_logs 테이블)
// ============================================================
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
                log_level: logData.log_level || 'info', // info | success | warn | error
                message: logData.message,
                metadata: logData.metadata ? JSON.stringify(logData.metadata) : null,
                created_at: new Date().toISOString()
            })
        });
    } catch (_) {
        // 로그 기록 실패는 파이프라인 멈추지 않음
    }
}

// ============================================================
// Supabase에 에이전트 상태 업데이트 (agents 테이블)
// ============================================================
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
    } catch (_) {
        // 에이전트 상태 업데이트 실패가 전체 파이프라인 가동을 막지 않음
    }
}

// ============================================================
// Vercel 서버리스 핸들러 (메인 진입점)
// ============================================================
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).send('OK');

    // [Rate Limit 검사] 클라이언트 IP 추출 후 빈도 제한 적용
    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    if (!checkRateLimit(clientIp)) {
        console.warn(`[pipeline] Rate Limit 초과 차단 — IP: ${clientIp}`);
        return res.status(429).json({
            error: '요청 빈도 초과 (분당 최대 10회)',
            retryAfter: '60초 후 재시도'
        });
    }

    const rawUrl  = process.env.SUPABASE_URL;
    const supKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!rawUrl || !supKey) {
        return res.status(500).json({ error: 'SUPABASE 환경변수 미설정' });
    }

    if (!ALADIN_API_KEY) {
        return res.status(500).json({ error: 'ALADIN_API_KEY 환경변수 미설정' });
    }

    // 검색 키워드 파싱 (GET: ?keyword=절판, POST: { keyword: "절판" })
    let keyword = '';
    if (req.method === 'GET') keyword = req.query?.keyword || '절판 도서';
    else if (req.method === 'POST') keyword = req.body?.keyword || '절판 도서';

    const pipelineStartAt = new Date().toISOString();
    const log = (agent_id, agent_name, level, message, metadata) =>
        writeAuditLog(rawUrl, supKey, { agent_id, agent_name, log_level: level, message, metadata });

    try {
        // [초기 상태 변경] 오케스트레이터 및 1번 살피미 작동 시작, 2번 다듬이 대기 상태 리셋
        await updateAgentStatus(rawUrl, supKey, 13, 'running', '파이프라인 실행 지휘 중');
        await updateAgentStatus(rawUrl, supKey, 1, 'running', '알라딘 API 데이터 수집 중');
        await updateAgentStatus(rawUrl, supKey, 2, 'idle', '대기중');

        // ========================================================
        // [1번 살피미] 알라딘 OpenAPI 책 검색 API 호출
        // ========================================================
        await log(1, '살피미', 'info', `알라딘 OpenAPI 호출 시작 — 키워드: "${keyword}"`, { keyword });

        const aladinUrl = `http://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${ALADIN_API_KEY}&Query=${encodeURIComponent(keyword)}&QueryType=Keyword&MaxResults=20&start=1&SearchTarget=Book&output=js&Version=20131101`;

        const aladinRes = await fetch(aladinUrl, {
            headers: { 'User-Agent': 'Antigravity-SalPimi/1.0' }
        });

        if (!aladinRes.ok) {
            const errText = await aladinRes.text();
            await log(1, '살피미', 'error', `알라딘 API 호출 실패 (HTTP ${aladinRes.status}): ${errText.substring(0, 200)}`, { status: aladinRes.status });
            
            // 오류 상태 변경
            await updateAgentStatus(rawUrl, supKey, 1, 'error', '알라딘 API 호출 오류');
            await updateAgentStatus(rawUrl, supKey, 13, 'error', '파이프라인 실행 중단');
            return res.status(502).json({ error: '알라딘 OpenAPI 오류', detail: errText.substring(0, 200) });
        }

        let aladinText = await aladinRes.text();
        if (aladinText.endsWith(';')) {
            aladinText = aladinText.substring(0, aladinText.length - 1);
        }
        
        let aladinData;
        try {
            aladinData = JSON.parse(aladinText);
        } catch (pe) {
            await log(1, '살피미', 'error', `알라딘 응답 파싱 실패`, { raw: aladinText.substring(0, 200) });
            throw pe;
        }

        const rawResults = aladinData.item ?? [];
        const results = Array.isArray(rawResults) ? rawResults : (rawResults ? [rawResults] : []);
        const totalCount = parseInt(aladinData.totalResults ?? results.length, 10) || 0;

        await log(1, '살피미', 'success', `알라딘 수집 완료 — ${totalCount}건 확보 (실 수신: ${results.length}건)`, { totalCount, received: results.length });

        if (results.length === 0) {
            // 결과 없음 상태 변경
            await updateAgentStatus(rawUrl, supKey, 1, 'success', '도서 수집 완료 (결과 없음)');
            await updateAgentStatus(rawUrl, supKey, 13, 'success', '수집 결과 없어 종료');
            return res.status(200).json({
                success: true, message: '수집 결과 없음 — 파이프라인 종료', inserted: 0
            });
        }

        // [상태 변경] 1번 살피미 수집 성공 및 2번 다듬이 정제 가동
        await updateAgentStatus(rawUrl, supKey, 1, 'success', '도서 수집 완료');
        await updateAgentStatus(rawUrl, supKey, 2, 'running', '수집 도서 데이터 정제 중');

        // ========================================================
        // [1번 살피미 + 2번 다듬이] 도서관 정보나루 대출 통계 연쇄 호출 및 정제
        // ========================================================
        await log(2, '다듬이', 'info', `대출 통계 연동 및 정제 시작 — ${results.length}건 대상`, { input: results.length });

        const refined = [];
        
        for (const item of results) {
            const isbn = String(item.isbn13 || item.isbn || '').replace(/[^0-9X]/gi, '');
            let libraryLoans = 0;
            let isSimulated = false;

            if (isbn && LIBRARY_NARU_API_KEY) {
                try {
                    const naruUrl = `http://data4library.kr/api/srchDtlList?authKey=${LIBRARY_NARU_API_KEY}&isbn13=${isbn}&loaninfoYN=Y&format=json`;
                    const naruRes = await fetch(naruUrl);
                    if (!naruRes.ok) {
                        throw new Error(`HTTP Error ${naruRes.status}`);
                    }
                    const naruData = await naruRes.json();
                    
                    if (naruData?.response?.detail?.[0]?.book?.loanCnt !== undefined) {
                        libraryLoans = parseInt(naruData.response.detail[0].book.loanCnt, 10) || 0;
                    } else if (naruData?.response?.loanInfo?.[0]?.Total?.loanCnt !== undefined) {
                        libraryLoans = parseInt(naruData.response.loanInfo[0].Total.loanCnt, 10) || 0;
                    } else if (naruData?.response?.loanInfo?.[0]?.total?.loanCnt !== undefined) {
                        libraryLoans = parseInt(naruData.response.loanInfo[0].total.loanCnt, 10) || 0;
                    } else {
                        throw new Error('대출 통계 응답 구조 비정상');
                    }
                } catch (err) {
                    isSimulated = true;
                    libraryLoans = Math.floor(Math.random() * 601) + 50; // 50~650 랜덤 대출수
                    console.log(`[INFO] Fallback mode: Simulated Data applied (ISBN: ${isbn}, Reason: ${err.message})`);
                    await log(2, '다듬이', 'warn', `[INFO] Fallback mode: Simulated Data applied (ISBN: ${isbn})`, { isbn, reason: err.message });
                }
            } else {
                // ISBN이 없거나 정보나루 API 키가 설정되지 않은 경우에도 폴백 적용
                isSimulated = true;
                libraryLoans = Math.floor(Math.random() * 601) + 50;
                console.log(`[INFO] Fallback mode: Simulated Data applied (ISBN: ${isbn || 'N/A'}, Reason: No Key/ISBN)`);
                await log(2, '다듬이', 'warn', `[INFO] Fallback mode: Simulated Data applied (ISBN: ${isbn || 'N/A'})`, { isbn });
            }

            const rawBookMerged = {
                ...item,
                library_loans: libraryLoans,
                is_simulated: isSimulated
            };

            const refinedBook = runDataRefiner_Dadumeui(rawBookMerged);
            // 복간 후보 기준: 복간 점수 30점 이상
            if (refinedBook && refinedBook.reprint_score >= 30) {
                refined.push(refinedBook);
            }
        }

        await log(2, '다듬이', 'success', `정제 완료 — 복간 후보 ${refined.length}건 선별 (점수 30점 이상 필터)`, { candidates: refined.length });

        if (refined.length === 0) {
            // 기준 미달 상태 변경
            await updateAgentStatus(rawUrl, supKey, 2, 'success', '정제 완료 (기준 미달)');
            await updateAgentStatus(rawUrl, supKey, 13, 'success', '복간 후보 기준 미달로 종료');
            return res.status(200).json({
                success: true, message: '복간 후보 기준 미달 — DB 적재 없음', inserted: 0
            });
        }

        // [상태 변경] 2번 다듬이 정제 성공
        await updateAgentStatus(rawUrl, supKey, 2, 'success', '복간 후보 선별 완료');

        // ========================================================
        // Supabase reprint_candidates 테이블 UPSERT (ISBN 기준 중복 방지)
        // ========================================================
        const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
        const upsertEndpoint = `${base}/reprint_candidates?on_conflict=isbn`;

        const upsertRes = await fetch(upsertEndpoint, {
            method: 'POST',
            headers: {
                'apikey': supKey,
                'Authorization': `Bearer ${supKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(refined)
        });

        if (!upsertRes.ok) {
            const errText = await upsertRes.text();
            await log(13, '오케스트레이터', 'error', `DB 적재 실패 (HTTP ${upsertRes.status}): ${errText.substring(0, 200)}`, {});
            
            // 오류 상태 변경
            await updateAgentStatus(rawUrl, supKey, 13, 'error', 'DB 적재 실패');
            return res.status(502).json({ error: 'Supabase 적재 실패', detail: errText.substring(0, 200) });
        }

        await log(13, '오케스트레이터', 'success', `파이프라인 완료 — ${refined.length}건 DB 적재 완료 (키워드: "${keyword}")`, {
            keyword, inserted: refined.length, pipelineStartAt
        });

        // [상태 변경] 오케스트레이터 최종 파이프라인 및 DB 적재 성공 완료
        await updateAgentStatus(rawUrl, supKey, 13, 'success', '파이프라인 및 DB 적재 완료');

        return res.status(200).json({
            success: true,
            message: `파이프라인 완료: 살피미 ${totalCount}건 수집 → 다듬이 정제 → ${refined.length}건 DB 적재`,
            keyword,
            totalCollected: totalCount,
            inserted: refined.length,
            sample: refined.slice(0, 3).map(r => ({ title: r.title, author: r.author, score: r.reprint_score }))
        });

    } catch (err) {
        const msg = err?.message ? String(err.message) : String(err);
        await log(9, '눈치왕', 'error', `파이프라인 예외 발생: ${msg}`, {});
        
        // 예외 상태 변경
        await updateAgentStatus(rawUrl, supKey, 13, 'error', '파이프라인 가동 에러');
        await updateAgentStatus(rawUrl, supKey, 9, 'error', '시스템 예외 포착 및 대응 대기');
        return res.status(500).json({ error: '파이프라인 내부 오류', detail: msg });
    }
}
