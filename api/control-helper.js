// api/control-helper.js
// ============================================================
// [통합 관제 API] 카테고리 자산 집계 & 새벽 크론 자율 수집 라우터
// ============================================================

export default async function handler(req, res) {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const action = req.query.action;
    const rawUrl = process.env.SUPABASE_URL;
    const supKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!rawUrl || !supKey) {
        return res.status(500).json({ error: '데이터베이스 연결 환경 변수가 설정되지 않았습니다.' });
    }

    // ─── 분기 1: 장르별 누적 도서 자산 집계 (stats) ───
    if (action === 'stats') {
        try {
            const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
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

    // ─── 분기 2: 백그라운드 자동 순환 수집 (cron) ───
    if (action === 'cron') {
        const host = req.headers.host || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';

        const categories = [
            { keyword: '소설', kdc: '8' },
            { keyword: '철학', kdc: '1' },
            { keyword: '사회과학', kdc: '3' },
            { keyword: '자연과학', kdc: '4' },
            { keyword: '기술과학', kdc: '5' },
            { keyword: '예술', kdc: '6' },
            { keyword: '언어', kdc: '7' },
            { keyword: '역사', kdc: '9' },
            { keyword: '총류', kdc: '0' },
            { keyword: '종교', kdc: '2' },
            { keyword: '청소년', kdc: '' },
            { keyword: '아동', kdc: '' },
            { keyword: '저작권 만료', kdc: '' }
        ];

        const currentMinute = new Date().getMinutes();
        const index = currentMinute % categories.length;
        const selected = categories[index];

        const jitterDelay = Math.floor(Math.random() * 4000) + 2000; 

        try {
            await new Promise(r => setTimeout(r, jitterDelay));

            const pipelineUrl = `${protocol}://${host}/api/pipeline?keyword=${encodeURIComponent(selected.keyword)}&kdc=${selected.kdc}&pageNo=1`;
            console.log(`[크론 자율 통합 수집] 선택 장르: "${selected.keyword}" | 딜레이: ${jitterDelay}ms | URL: ${pipelineUrl}`);

            const response = await fetch(pipelineUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(502).json({
                    error: '크론 연계 파이프라인 기동 실패',
                    category: selected.keyword,
                    detail: errText.substring(0, 200)
                });
            }

            const result = await response.json();

            return res.status(200).json({
                success: true,
                cronMinute: currentMinute,
                selectedCategory: selected.keyword,
                jitterDelayMs: jitterDelay,
                pipelineResult: result
            });

        } catch (err) {
            return res.status(500).json({
                error: '크론 자율 가동 중 예외 발생',
                detail: err.message
            });
        }
    }

    return res.status(400).json({ error: '올바르지 않은 요청 액션(action)입니다.' });
}
