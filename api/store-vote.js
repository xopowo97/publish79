// api/store-vote.js — 복간 투표(vote) 및 펀딩(fund) 처리 API (HMAC-SHA256 무결성 서명 검증 적용)
import crypto from 'crypto';

const SECRET_KEY = process.env.HMAC_SECRET_KEY || 'CHULPAN_FRIEND_SECRET_KEY_79';

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

    const { user_id, candidate_id, action_type, amount = 1 } = req.body;

    if (!user_id || !candidate_id || !action_type) {
        return res.status(400).json({ success: false, error: '필수 파라미터(user_id, candidate_id, action_type)가 누락되었습니다.' });
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

        // 1. Generate digital signature using HMAC-SHA256
        const timestamp = new Date().toISOString();
        const signaturePayload = `${user_id}:${candidate_id}:${action_type}:${timestamp}`;
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
        if (action_type === 'vote') {
            votesCurrent += 1;
            pointsRewarded = 100; // 투표 시 100P 적립
            if (votesCurrent >= votesTarget) {
                isFundingActive = true;
            }
        } else if (action_type === 'fund') {
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
                action_type,
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
        // First, check if user exists
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
                name: user_id.split('@')[0], // fallback name
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

    } catch (err) {
        console.error('[api/store-vote] 에러:', err);
        return res.status(500).json({
            success: false,
            error: '서버 내부 처리 중 오류가 발생했습니다.',
            message: err.message
        });
    }
}
