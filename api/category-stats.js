// api/category-stats.js
// ============================================================
// [자율 통계 엔진] 장르별 누적 도서 자산 집계 API
// ============================================================

export default async function handler(req, res) {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const rawUrl = process.env.SUPABASE_URL;
    const supKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!rawUrl || !supKey) {
        return res.status(500).json({ error: '데이터베이스 연결 환경 변수가 설정되지 않았습니다.' });
    }

    try {
        const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
        // 가성비를 극대화하기 위해 전체 행의 category 컬럼만 초경량 select 조회
        const response = await fetch(`${base}/reprint_candidates?select=category`, {
            method: 'GET',
            headers: {
                'apikey': supKey,
                'Authorization': `Bearer ${supKey}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            return res.status(502).json({ error: 'Supabase 통계 조회 실패', detail: errText });
        }

        const data = await response.json();

        // 카테고리 집계 계산
        const stats = {};
        data.forEach(item => {
            const cat = item.category || '미분류';
            stats[cat] = (stats[cat] || 0) + 1;
        });

        return res.status(200).json({
            success: true,
            totalCount: data.length,
            stats
        });
    } catch (err) {
        return res.status(500).json({ error: '통계 집계 중 예외 발생', detail: err.message });
    }
}
