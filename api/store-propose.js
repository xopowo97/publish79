// api/store-propose.js — 신규 복간 도서 제안 및 1번 딥서치_살피미 에이전트 연동 API
import crypto from 'crypto';

const SECRET_KEY = process.env.HMAC_SECRET_KEY || 'CHULPAN_FRIEND_SECRET_KEY_79';
const SELF_BASE_URL = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

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

    const { user_id, title, author, publisher, category, reason } = req.body;

    if (!user_id || !title || !category) {
        return res.status(400).json({ success: false, error: '필수 파라미터(user_id, title, category)가 누락되었습니다.' });
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

        // 1. Trigger 1st Deep Search Agent (Proxy to 국립중앙도서관 API)
        let resolvedAuthor = author || '저자 미상';
        let resolvedPublisher = publisher || '출판사 미상';
        let resolvedPubYear = new Date().getFullYear() - 10; // 기본 10년 전 절판 가정
        let resolvedImageUrl = '';
        let reprintScore = 65; // 기본 점수

        try {
            console.log(`[store-propose] 🔍 1번 딥서치_살피미 에이전트 구동 시작 -> 검색어: "${title}"`);
            const libraryUrl = `${SELF_BASE_URL}/api/library?keyword=${encodeURIComponent(title)}`;
            const libRes = await fetch(libraryUrl, { method: 'GET' });
            
            if (libRes.ok) {
                const libData = await libRes.json();
                if (libData.success && libData.results && libData.results.length > 0) {
                    const bookInfo = libData.results[0]; // 가장 유사한 첫 번째 검색 결과
                    resolvedAuthor = bookInfo.author || resolvedAuthor;
                    resolvedPublisher = bookInfo.publisher || resolvedPublisher;
                    if (bookInfo.pubYear) {
                        resolvedPubYear = parseInt(bookInfo.pubYear, 10) || resolvedPubYear;
                    }
                    resolvedImageUrl = bookInfo.imageUrl || '';
                    
                    // 가변 복간 매력도 점수 산출 (대출 순위나 발행연도 가중치 부여)
                    const baseScore = 70;
                    const ageBonus = Math.min(20, Math.max(0, new Date().getFullYear() - resolvedPubYear)); // 오래될수록 보너스
                    reprintScore = baseScore + ageBonus;
                    console.log(`[store-propose] ✅ 1번 살피미가 도서 정보를 매칭했습니다. 점수: ${reprintScore}`);
                }
            }
        } catch (libErr) {
            console.warn('[store-propose] 국립중앙도서관 API 살피미 연동 실패(fallback 모드 작동):', libErr.message);
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
                action_type: 'vote', // 제안은 최초 투표와 동일하게 가산 처리
                amount: 1,
                points_rewarded: 200, // 제안 보너스 200P
                digital_signature: signature,
                created_at: timestamp
            })
        });
        if (!logRes.ok) {
            console.error('[store-propose] 서포터 로그 기록 실패:', await logRes.text());
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
            console.error('[store-propose] 사용자 프로필 갱신 실패:', await userUpsertRes.text());
        }

        return res.status(200).json({
            success: true,
            message: '새로운 복간 도서 제안서가 성공적으로 수집되어 딥서치 분석이 완료되었습니다.',
            signature,
            candidate: createdCandidate,
            reprintScore
        });

    } catch (err) {
        console.error('[api/store-propose] 에러:', err);
        return res.status(500).json({
            success: false,
            error: '서버 내부 처리 중 오류가 발생했습니다.',
            message: err.message
        });
    }
}
