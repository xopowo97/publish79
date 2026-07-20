// api/cron-gather.js
// ============================================================
// [자율 크론 수집 엔진] 백그라운드 자동 순환 수집기 (IP 우회 Jitter 탑재)
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

    const host = req.headers.host || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    
    // 13대 분야 로테이션 매핑 정의
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

    // 호출 시점의 분(Minute) 단위를 13으로 나눈 나머지로 자동 로테이션 인덱스 산출
    const currentMinute = new Date().getMinutes();
    const index = currentMinute % categories.length;
    const selected = categories[index];

    // 크롤링 차단 및 Rate limit 감지를 우회하기 위한 2~6초 무작위 안전 딜레이(Jitter) 생성
    const jitterDelay = Math.floor(Math.random() * 4000) + 2000; 

    try {
        // 백그라운드 지연 기동
        await new Promise(r => setTimeout(r, jitterDelay));

        // 기존의 완벽한 2중 락 및 다듬이/계산이 에이전트 파이프라인 API로 프록시 호출
        const pipelineUrl = `${protocol}://${host}/api/pipeline?keyword=${encodeURIComponent(selected.keyword)}&kdc=${selected.kdc}&pageNo=1`;
        
        console.log(`[크론 자율 수집] 선택 장르: "${selected.keyword}" | 딜레이: ${jitterDelay}ms | URL: ${pipelineUrl}`);

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
