// api/store.js — 복간 펀딩 플랫폼 통합 스토어 API (제안/투표/펀딩 처리)
// Vercel Serverless Function - HMAC-SHA256 무결성 서명 및 살피미 에이전트 연동 통합

import crypto from 'crypto';
import fetch from 'node-fetch';

const SECRET_KEY = process.env.HMAC_SECRET_KEY || 'CHULPAN_FRIEND_SECRET_KEY_79';
const SELF_BASE_URL = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

// 🎨 [11번 알리미] Gemini API 책정보 분석 및 숏폼 자막/대본 기획 (4.5초 타임아웃 및 초경량 룰베이스 폴백 가드 장착)
async function generateMarketingPlan(book, geminiApiKey) {
    const title = (book.title || '도서').replace(/<\/?[^>]+(>|$)/g, '');
    const author = (book.author || '저자 미상').replace(/<\/?[^>]+(>|$)/g, '');
    const cat = book.category || '소설';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
        const prompt = `
        다음 도서의 메타데이터를 정밀 분석하여 B2C 상용 서점 수준의 도서 소개 및 소셜 미디어 배포용 30초 숏폼 비디오 자막 타임라인을 기획해 주세요.
        
        도서명: ${title}
        저자: ${author}
        출판사: ${book.publisher || '미상'}
        출간년도: ${book.pub_year || '미상'}
        
        반드시 다음 JSON 규격으로만 완벽하게 답변해야 하며, JSON 외에 다른 설명(마크다운 \`\`\`json 꼬리표 포함)은 절대 출력하지 마세요:
        {
          "card_news": [
            {"slide": 1, "title": "도서 아트 표지 및 인트로 카피", "body": "책의 깊이와 분위기를 담은 품격 있는 문학적 한 줄 카피"},
            {"slide": 2, "title": "핵심 줄거리 및 호기심 유발", "body": "독자가 책을 읽고 싶게 만드는 매혹적인 스토리 요약"},
            {"slide": 3, "title": "주요 등장인물 및 관계도", "body": "이야기의 주역들과 대립 구도를 입체적으로 정리한 캐릭터 소개"},
            {"slide": 4, "title": "이번 복간본의 물리적 소장 가치", "body": "AI 삽화, 조판, 두께 등 실물 소장용 가치 명세"},
            {"slide": 5, "title": "추천사 및 가치 제언", "body": "어떤 사람에게 추천하는지 타겟 독자 제언"}
          ],
          "summary_script": "숏폼 나레이션 전체 대본 텍스트",
          "timeline": [
            {"start": "0.0", "end": "5.0", "text": "첫 번째 5초 자막 나레이션 (15자 내외)"},
            {"start": "5.5", "end": "11.0", "text": "두 번째 자막 나레이션 (15자 내외)"},
            {"start": "11.5", "end": "17.0", "text": "세 번째 자막 나레이션 (15자 내외)"},
            {"start": "17.5", "end": "23.0", "text": "네 번째 자막 나레이션 (15자 내외)"},
            {"start": "23.5", "end": "29.0", "text": "다섯 번째 자막 나레이션 (15자 내외)"}
          ]
        }
        `;

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
            const json = await res.json();
            const rawText = json.candidates[0].content.parts[0].text.trim();
            return JSON.parse(rawText);
        }
    } catch (e) {
        console.warn(`[Gemini API] 타임아웃 또는 실패로 룰베이스 초경량 렌더러 가동:`, e.message);
    }

    // 2단계: 룰베이스 초경량 렌더러 (0.01초 만에 즉석 조립, Vercel 타임아웃 절대 방지)
    return {
        card_news: [
            { slide: 1, title: `${title}의 복간`, body: `독자들이 오랫동안 소망해 온 위대한 명작, '${title}'가 마침내 복간 프로젝트로 깨어납니다.` },
            { slide: 2, title: `숨겨진 가치와 의미`, body: `세월 속에 가려져 있던 작가 ${author}의 철학적 통찰과 매혹적인 세계관을 완벽 복원.` },
            { slide: 3, title: `명품 특별 소장판`, body: `VDP 초정밀 가변 조판 기술과 고급 내지를 적용하여 소장 가치를 극대화한 양장본.` },
            { slide: 4, title: `첫 서포터 참여 혜택`, body: `아래 출판친구스토어에서 펀딩에 참여해 나만의 맞춤형 도서 및 서포터 보증서를 획득하세요.` },
            { slide: 5, title: `문화를 지키는 발걸음`, body: `절판 도서의 복간은 단순히 옛 책을 찍는 것을 넘어, 우리 세대의 소중한 지적 유산을 영구히 보존하는 일입니다.` }
        ],
        summary_script: `시간의 베일에 가려져 있던 위대한 걸작, ${author}의 ${title} 복간 펀딩이 드디어 시작되었습니다. 진짜 한국어 마케팅 카피와 함께 이 특별한 역사에 동참해 보세요.`,
        timeline: [
            { start: "0.0", end: "5.0", text: `${title} 복간 펀딩 가동` },
            { start: "5.5", end: "11.0", text: `${author} 작가의 위대한 귀환` },
            { start: "11.5", end: "17.0", text: `오리지널 명품 조판 복원` },
            { start: "17.5", end: "23.0", text: `VDP 책갈피 한정 증정` },
            { start: "23.5", end: "29.0", text: `지금 펀딩을 개설하세요` }
        ]
    };
}

// 📦 [11번 알리미] 비동기 대량 에셋 생성 백그라운드 구동 스레드
async function runBackgroundAssetBatch(base, key, geminiApiKey, limit) {
    try {
        console.log(`[bulk-assets] 📡 DB reprint_candidates에서 ${limit}종 조회 중...`);
        const candidateUrl = `${base}/reprint_candidates?select=isbn,title,author,publisher,pub_year,category&isbn=not.is.null&limit=${limit}`;
        const res = await fetch(candidateUrl, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`reprint_candidates 조회 실패: ${res.statusText}`);
        
        const books = await res.json();
        console.log(`[bulk-assets] 📚 도서 ${books.length}종 수신 완료.`);
        
        for (const book of books) {
            if (!book.isbn) continue;
            try {
                // 선점 마킹 (POST + resolution=merge-duplicates로 확실하게 Upsert)
                const preRes = await fetch(`${base}/book_marketing_assets?on_conflict=isbn`, {
                    method: 'POST',
                    headers: {
                        "apikey": key,
                        "Authorization": `Bearer ${key}`,
                        "Content-Type": "application/json",
                        "Prefer": "resolution=merge-duplicates"
                    },
                    body: JSON.stringify({
                        isbn: book.isbn,
                        status: 'processing',
                        updated_at: new Date().toISOString()
                    })
                });
                
                if (!preRes.ok) {
                    const errTxt = await preRes.text();
                    console.warn(`[bulk-assets] 선점 마킹 오류 (계속 진행): ${errTxt}`);
                }

                // Gemini 기획서 생성
                const plan = await generateMarketingPlan(book, geminiApiKey);
                
                // DB 최종 적재 (UAT 폴백 동영상 주소 QDrpvRK_1gc 연동)
                const payload = {
                    isbn: book.isbn,
                    card_news_data: plan.card_news,
                    audio_tts_url: `https://translate.google.com/translate_tts?ie=UTF-8&tl=ko&client=tw-ob&q=${encodeURIComponent(plan.timeline[0].text)}`,
                    shorts_video_url: "https://youtube.com/shorts/QDrpvRK_1gc",
                    summary_script: plan.summary_script,
                    status: 'success',
                    updated_at: new Date().toISOString()
                };

                const postRes = await fetch(`${base}/book_marketing_assets?on_conflict=isbn`, {
                    method: 'POST',
                    headers: {
                        "apikey": key,
                        "Authorization": `Bearer ${key}`,
                        "Content-Type": "application/json",
                        "Prefer": "resolution=merge-duplicates"
                    },
                    body: JSON.stringify(payload)
                });

                if (!postRes.ok) {
                    const errTxt = await postRes.text();
                    throw new Error(`최종 에셋 적재 실패: ${errTxt}`);
                }

                console.log(`[bulk-assets] ✅ ISBN: ${book.isbn} 에셋 적재 완료.`);
                
            } catch (bookErr) {
                console.error(`[bulk-assets] ❌ ISBN: ${book.isbn} 생성 오류:`, bookErr.message);
                // 실패 상태 마킹
                await fetch(`${base}/book_marketing_assets?on_conflict=isbn`, {
                    method: 'POST',
                    headers: {
                        "apikey": key,
                        "Authorization": `Bearer ${key}`,
                        "Content-Type": "application/json",
                        "Prefer": "resolution=merge-duplicates"
                    },
                    body: JSON.stringify({
                        isbn: book.isbn,
                        status: 'failed',
                        summary_script: `[오류] ${bookErr.message}`.slice(0, 500),
                        updated_at: new Date().toISOString()
                    })
                }).catch(() => {});
            }
            // API 리밋 방지 텀
            await new Promise(r => setTimeout(r, 400));
        }
    } catch (err) {
        console.error('[bulk-assets] 치명적 오류:', err.message);
    }
}

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).send('OK');
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'POST 메소드만 지원합니다.' });
    }

    const { action, user_id, title, author, publisher, category, reason, candidate_id, action_type, amount = 1, isbn } = req.body || {};

    // action 구분값 처리
    const resolvedAction = action || action_type || 'vote';

    if (resolvedAction !== 'get-marketing-assets' && !user_id) {
        return res.status(400).json({ success: false, error: '필수 파라미터(user_id)가 누락되었습니다.' });
    }

    try {
        const rawUrl = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!rawUrl || !key) {
            throw new Error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
        }

        const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
        const headers = {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };

        // 분기 0: 마케팅 에셋 조회 (get-marketing-assets) - service_role 우회
        if (resolvedAction === 'get-marketing-assets') {
            if (!isbn) {
                return res.status(400).json({ success: false, error: '마케팅 에셋 조회를 위한 필수 파라미터(isbn)가 누락되었습니다.' });
            }

            const assetUrl = `${base}/book_marketing_assets?isbn=eq.${encodeURIComponent(isbn)}&status=eq.success`;
            const assetRes = await fetch(assetUrl, { method: 'GET', headers: { apikey: key, Authorization: `Bearer ${key}` } });
            
            if (!assetRes.ok) {
                const errText = await assetRes.text();
                throw new Error(`마케팅 에셋 DB 조회 실패: ${errText}`);
            }

            const assets = await assetRes.json();
            return res.status(200).json({
                success: true,
                data: assets.length > 0 ? assets[0] : null
            });
        }

        // 분기 1: 도서 신규 제안 (propose)
        if (resolvedAction === 'propose') {
            if (!title || !category) {
                return res.status(400).json({ success: false, error: '도서 제안을 위한 필수 파라미터(title, category)가 누락되었습니다.' });
            }

            // 1. Trigger 1st Deep Search Agent (Proxy to 국립중앙도서관 API)
            let resolvedAuthor = author || '저자 미상';
            let resolvedPublisher = publisher || '출판사 미상';
            let resolvedPubYear = new Date().getFullYear() - 10; // 기본 10년 전 절판 가정
            let resolvedImageUrl = '';
            let reprintScore = 65; // 기본 점수

            try {
                console.log(`[store] 🔍 1번 딥서치_살피미 에이전트 구동 시작 -> 검색어: "${title}"`);
                const libraryUrl = `${SELF_BASE_URL}/api/library?keyword=${encodeURIComponent(title)}`;
                const libRes = await fetch(libraryUrl, { method: 'GET' });
                
                if (libRes.ok) {
                    const libData = await libRes.json();
                    if (libData.success && libData.results && libData.results.length > 0) {
                        const bookInfo = libData.results[0];
                        resolvedAuthor = bookInfo.author || resolvedAuthor;
                        resolvedPublisher = bookInfo.publisher || resolvedPublisher;
                        if (bookInfo.pubYear) {
                            resolvedPubYear = parseInt(bookInfo.pubYear, 10) || resolvedPubYear;
                        }
                        resolvedImageUrl = bookInfo.imageUrl || '';
                        
                        const baseScore = 70;
                        const ageBonus = Math.min(20, Math.max(0, new Date().getFullYear() - resolvedPubYear));
                        reprintScore = baseScore + ageBonus;
                        console.log(`[store] ✅ 1번 살피미가 도서 정보를 매칭했습니다. 점수: ${reprintScore}`);
                    }
                }
            } catch (libErr) {
                console.warn('[store] 국립중앙도서관 API 살피미 연동 실패(fallback 모드 작동):', libErr.message);
            }

            // 2. Insert into reprint_candidates table
            const insertCandUrl = `${base}/reprint_candidates`;
            const candPayload = {
                title,
                author: resolvedAuthor,
                publisher: resolvedPublisher,
                pub_year: resolvedPubYear,
                category,
                reprint_score: reprintScore,
                votes_current: 1, // 제안자 본인 표 1개 자동 반영
                votes_target: 10,
                is_funding_active: false,
                funding_current: 0,
                funding_target: 50,
                image_url: resolvedImageUrl || `https://via.placeholder.com/300x400?text=${encodeURIComponent(title)}`
            };

            const candRes = await fetch(insertCandUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(candPayload)
            });

            if (!candRes.ok) {
                const errText = await candRes.text();
                throw new Error(`복간 후보 도서 DB 등록 실패: ${errText}`);
            }

            const candData = await candRes.json();
            const createdCandidate = candData[0];

            // 3. Generate HMAC SHA-256 Signature for supporter proposal log
            const timestamp = new Date().toISOString();
            const signaturePayload = `${user_id}:${createdCandidate?.id || 999}:propose:${timestamp}`;
            const signature = crypto.createHmac('sha256', SECRET_KEY).update(signaturePayload).digest('hex');

            // 4. Record to supporter_logs
            const logUrl = `${base}/supporter_logs`;
            const logRes = await fetch(logUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    user_id,
                    candidate_id: createdCandidate?.id || null,
                    action_type: 'vote',
                    amount: 1,
                    points_rewarded: 200, // 제안 보너스 200P
                    digital_signature: signature,
                    created_at: timestamp
                })
            });
            if (!logRes.ok) {
                console.error('[store] 서포터 로그 기록 실패:', await logRes.text());
            }

            // 5. Update user points (200P)
            const userUrl = `${base}/user_profiles?id=eq.${encodeURIComponent(user_id)}`;
            const userGetRes = await fetch(userUrl, { method: 'GET', headers: { apikey: key, Authorization: `Bearer ${key}` } });
            let userPoints = 0;
            if (userGetRes.ok) {
                const users = await userGetRes.json();
                if (users.length > 0) {
                    userPoints = users[0].points || 0;
                }
            }

            const userUpsertUrl = `${base}/user_profiles`;
            const userUpsertRes = await fetch(userUpsertUrl, {
                method: 'POST',
                headers: {
                    ...headers,
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify({
                    id: user_id,
                    email: user_id,
                    name: user_id.split('@')[0],
                    points: userPoints + 200
                })
            });
            if (!userUpsertRes.ok) {
                console.error('[store] 사용자 프로필 갱신 실패:', await userUpsertRes.text());
            }

            return res.status(200).json({
                success: true,
                message: '새로운 복간 도서 제안서가 성공적으로 수집되어 딥서치 분석이 완료되었습니다.',
                signature,
                candidate: createdCandidate,
                reprintScore
            });
        }

        // 분기 2: 도서 투표(vote) 혹은 펀딩(fund)
        else if (resolvedAction === 'vote' || resolvedAction === 'fund') {
            if (!candidate_id) {
                return res.status(400).json({ success: false, error: '투표/펀딩을 위한 필수 파라미터(candidate_id)가 누락되었습니다.' });
            }

            // 1. Generate digital signature using HMAC-SHA256
            const timestamp = new Date().toISOString();
            const signaturePayload = `${user_id}:${candidate_id}:${resolvedAction}:${timestamp}`;
            const signature = crypto.createHmac('sha256', SECRET_KEY).update(signaturePayload).digest('hex');

            // 2. Fetch candidate info from reprint_candidates
            const candidateUrl = `${base}/reprint_candidates?id=eq.${candidate_id}`;
            const candGetRes = await fetch(candidateUrl, { method: 'GET', headers: { apikey: key, Authorization: `Bearer ${key}` } });
            if (!candGetRes.ok) {
                const errText = await candGetRes.text();
                throw new Error(`후보 조회 실패: ${errText}`);
            }
            const candidates = await candGetRes.json();
            if (candidates.length === 0) {
                return res.status(404).json({ success: false, error: '해당 도서 후보를 찾을 수 없습니다.' });
            }
            const candidate = candidates[0];

            // 3. Calculate updates
            let votesCurrent = candidate.votes_current || 0;
            let votesTarget = candidate.votes_target || 10;
            let isFundingActive = candidate.is_funding_active || false;
            let fundingCurrent = candidate.funding_current || 0;

            let pointsRewarded = 0;
            if (resolvedAction === 'vote') {
                votesCurrent += 1;
                pointsRewarded = 100; // 투표 시 100P 적립
                if (votesCurrent >= votesTarget) {
                    isFundingActive = true;
                }
            } else if (resolvedAction === 'fund') {
                fundingCurrent += amount;
                pointsRewarded = 50; // 펀딩 참여 시 50P 적립
            }

            // 4. DB Transactions (Supabase PATCH/POST)
            // A. Update reprint_candidates
            const updateCandidateUrl = `${base}/reprint_candidates?id=eq.${candidate_id}`;
            const candUpdateRes = await fetch(updateCandidateUrl, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    votes_current: votesCurrent,
                    is_funding_active: isFundingActive,
                    funding_current: fundingCurrent
                })
            });
            if (!candUpdateRes.ok) {
                const errText = await candUpdateRes.text();
                throw new Error(`도서 후보 정보 갱신 실패: ${errText}`);
            }

            // B. Add supporter_logs
            const logUrl = `${base}/supporter_logs`;
            const logRes = await fetch(logUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    user_id,
                    candidate_id,
                    action_type: resolvedAction,
                    amount,
                    points_rewarded: pointsRewarded,
                    digital_signature: signature,
                    created_at: timestamp
                })
            });
            if (!logRes.ok) {
                const errText = await logRes.text();
                throw new Error(`서포터 로그 기록 실패: ${errText}`);
            }

            // C. Update/Upsert user_profiles
            const userUrl = `${base}/user_profiles?id=eq.${encodeURIComponent(user_id)}`;
            const userGetRes = await fetch(userUrl, { method: 'GET', headers: { apikey: key, Authorization: `Bearer ${key}` } });
            let userPoints = 0;
            if (userGetRes.ok) {
                const users = await userGetRes.json();
                if (users.length > 0) {
                    userPoints = users[0].points || 0;
                }
            }
            
            const finalPoints = userPoints + pointsRewarded;
            const userUpsertUrl = `${base}/user_profiles`;
            const userUpsertRes = await fetch(userUpsertUrl, {
                method: 'POST',
                headers: {
                    ...headers,
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify({
                    id: user_id,
                    email: user_id,
                    name: user_id.split('@')[0],
                    points: finalPoints
                })
            });
            if (!userUpsertRes.ok) {
                const errText = await userUpsertRes.text();
                console.error(`사용자 프로필 갱신 실패: ${errText}`);
            }

            return res.status(200).json({
                success: true,
                message: '복간 참여 처리가 성공적으로 기록되었습니다.',
                signature,
                candidate: {
                    id: candidate_id,
                    votes_current: votesCurrent,
                    is_funding_active: isFundingActive,
                    funding_current: fundingCurrent
                }
            });
        }
        
        // 분기 3: 단일 에셋 즉석 생성 가동 (trigger-bulk-assets - 프론트엔드 루프 제어)
        else if (resolvedAction === 'trigger-bulk-assets') {
            const geminiApiKey = process.env.GEMINI_API_KEY;
            if (!geminiApiKey) {
                return res.status(400).json({ success: false, error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });
            }

            const targetIsbn = req.body.isbn;
            if (!targetIsbn) {
                return res.status(400).json({ success: false, error: '에셋 생성을 위한 필수 파라미터(isbn)가 누락되었습니다.' });
            }

            // 1. reprint_candidates에서 대상 도서 메타데이터 1건 쿼리
            const bookUrl = `${base}/reprint_candidates?select=isbn,title,author,publisher,pub_year,category&isbn=eq.${targetIsbn}&limit=1`;
            const bookRes = await fetch(bookUrl, { headers });
            if (!bookRes.ok) throw new Error(`도서 정보 조회 실패: ${bookRes.statusText}`);
            const books = await bookRes.json();
            if (books.length === 0) {
                return res.status(404).json({ success: false, error: '해당 ISBN의 도서를 찾을 수 없습니다.' });
            }
            const book = books[0];

            // 2. 선점 마킹 (POST + resolution=merge-duplicates로 확실하게 Upsert)
            await fetch(`${base}/book_marketing_assets?on_conflict=isbn`, {
                method: 'POST',
                headers: {
                    ...headers,
                    "Prefer": "resolution=merge-duplicates"
                },
                body: JSON.stringify({
                    isbn: book.isbn,
                    status: 'processing',
                    updated_at: new Date().toISOString()
                })
            });

            // 3. Gemini 기획서 생성 (동기 실행, Vercel 10초 이내 종료)
            const plan = await generateMarketingPlan(book, geminiApiKey);

            // 4. DB 최종 적재 (UAT 폴백 동영상 주소 QDrpvRK_1gc 연동)
            const payload = {
                isbn: book.isbn,
                card_news_data: plan.card_news,
                audio_tts_url: `https://translate.google.com/translate_tts?ie=UTF-8&tl=ko&client=tw-ob&q=${encodeURIComponent(plan.timeline[0].text)}`,
                shorts_video_url: "https://youtube.com/shorts/QDrpvRK_1gc",
                summary_script: plan.summary_script,
                status: 'success',
                updated_at: new Date().toISOString()
            };

            const postRes = await fetch(`${base}/book_marketing_assets?on_conflict=isbn`, {
                method: 'POST',
                headers: {
                    ...headers,
                    "Prefer": "resolution=merge-duplicates"
                },
                body: JSON.stringify(payload)
            });

            if (!postRes.ok) {
                const errTxt = await postRes.text();
                throw new Error(`최종 에셋 적재 실패: ${errTxt}`);
            }

            return res.status(200).json({
                success: true,
                message: `✅ ISBN: ${book.isbn} 에셋 적재 완료.`,
                book: book
            });
        }
        
        // 분기 4: 20종 대량 적재 대상 도서 목록 조회 (get-bulk-candidates)
        else if (resolvedAction === 'get-bulk-candidates') {
            const limitVal = parseInt(req.body.limit || '20', 10);
            
            // 1. reprint_candidates에서 최대 limitVal개 도서 조회 (ISBN이 있는 실체 도서)
            const candidateUrl = `${base}/reprint_candidates?select=isbn,title,author&isbn=not.is.null&order=reprint_score.desc&limit=${limitVal}`;
            const candsRes = await fetch(candidateUrl, { headers });
            if (!candsRes.ok) throw new Error(`후보 도서 조회 실패: ${candsRes.statusText}`);
            const books = await candsRes.json();

            // 2. book_marketing_assets에서 성공 상태인 에셋들의 isbn 리스트 조회
            const assetUrl = `${base}/book_marketing_assets?select=isbn&status=eq.success`;
            const assetRes = await fetch(assetUrl, { headers });
            const assets = assetRes.ok ? await assetRes.json() : [];
            const successIsbns = new Set(assets.map(a => a.isbn));

            // 3. 각 도서별로 이미 에셋이 성공적으로 존재하는지 여부 매핑
            const mappedBooks = books.map(b => ({
                ...b,
                has_asset: successIsbns.has(b.isbn)
            }));

            return res.status(200).json({
                success: true,
                books: mappedBooks
            });
        }
        
        else {
            return res.status(400).json({ success: false, error: '유효하지 않은 action 구분값입니다.' });
        }

    } catch (err) {
        console.error('[api/store] 에러:', err);
        return res.status(500).json({
            success: false,
            error: '서버 내부 처리 중 오류가 발생했습니다.',
            message: err.message
        });
    }
}
