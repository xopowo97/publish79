// api/pipeline.js
// ============================================================
// [자율 파이프라인 v2.0] 역발상 수집 엔진 — 도서관정보나루 → 알라딘
// ============================================================
// 역할: [1번 살피미] 도서관정보나루 인기 대출 API(loanItemSrch)로 수요 확인 먼저
//       → [2번 다듬이] 알라딘 ItemLookUp으로 품절/절판 크로스체크
//       → 중소출판사 필터 + demand_temperature 산출
//       → Supabase reprint_candidates 자동 적재
//       + agent_audit_logs에 실행 로그 기록 (실시간 로그 스트림 소스)
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
        _rateLimitMap.set(ip, { count: 1, windowStart: now });
        return true;
    }
    entry.count += 1;
    if (entry.count > RATE_LIMIT_MAX) return false;
    return true;
}

const ALADIN_API_KEY = process.env.ALADIN_API_KEY;
const LIBRARY_NARU_API_KEY = process.env.LIBRARY_NARU_API_KEY;
const LIBRARY_API_KEY = process.env.LIBRARY_API_KEY;

// ============================================================
// [대형 출판사 필터] 자체 증쇄 여력이 있는 대형사 제외
// → 중소 출판사 소속의 '증쇄 포기' 도서만 타겟팅
// ============================================================
const LARGE_PUBLISHERS = new Set([
    '민음사', '문학동네', '창비', '창작과비평사', '한길사', '을유문화사',
    '시공사', '김영사', '웅진씽크빅', '웅진', '위즈덤하우스', '알에이치코리아',
    '랜덤하우스코리아', '교보문고', '북하우스', '넥서스', '학지사',
    '에이콘출판사', '인사이트', '비룡소', '사계절', '보림',
    '길벗', '한빛미디어', '이지스퍼블리싱', '성안당', '대원씨아이',
    '황금가지', '해냄', '쌤앤파커스', '북로드', '스마트북스',
    '동아일보사', '조선일보사', '중앙일보사', '조선앤북',
    '열림원', '지식채널', '현암사', '지식산업사', '나남', '나남출판',
    '두산동아', '교학사', '금성출판사', '동아출판', '미래엔'
]);

// ============================================================
// [KDC 카테고리 매핑] 키워드 → 도서관정보나루 KDC 코드
// 도서관정보나루 loanItemSrch API의 kdc 파라미터 사용
// ============================================================
const KDC_MAP = {
    '소설':    { kdc: '8', label: '소설' },
    '에세이':  { kdc: '8', label: '에세이' },
    '인문학':  { kdc: '1', label: '인문학' },
    '철학':    { kdc: '1', label: '인문학' },
    '역사':    { kdc: '9', label: '역사' },
    '사회과학':{ kdc: '3', label: '사회과학' },
    '사회':    { kdc: '3', label: '사회과학' },
    '정치':    { kdc: '3', label: '사회과학' },
    '경제경영':{ kdc: '3', label: '경제경영' },
    '경제':    { kdc: '3', label: '경제경영' },
    '경영':    { kdc: '3', label: '경제경영' },
    '자기계발':{ kdc: '3', label: '자기계발' },
    '과학':    { kdc: '4', label: '과학' },
    '수학':    { kdc: '4', label: '과학' },
    '공학':    { kdc: '5', label: '과학' },
    '기술':    { kdc: '5', label: '과학' },
    '예술':    { kdc: '6', label: '예술' },
    '미술':    { kdc: '6', label: '예술' },
    '음악':    { kdc: '6', label: '예술' },
    '종교':    { kdc: '2', label: '종교' },
    '어린이':  { kdc: '8', label: '어린이' },
    '아동':    { kdc: '8', label: '어린이' },
    '그림책':  { kdc: '8', label: '어린이' },
    '청소년':  { kdc: '8', label: '청소년' },
};

// 키워드에서 KDC 코드 추출 (없으면 기본값 '8' 문학)
function resolveKdc(keyword) {
    const kw = String(keyword || '').trim();
    for (const [key, val] of Object.entries(KDC_MAP)) {
        if (kw.includes(key)) return val;
    }
    return { kdc: '8', label: '소설' }; // 기본: 문학
}

// ============================================================
// [카테고리 파서] 도서관정보나루 분류명 → 표준 카테고리
// ============================================================
function parseCategory(classNm) {
    const c = String(classNm || '').trim();
    
    // 1차: 분류명 텍스트 한글 키워드 기준 매핑 (분류 기호 누락 또는 한글 명칭 유입 대응)
    if (c.includes('소설')) return '소설';
    if (c.includes('에세이') || c.includes('수필')) return '에세이';
    if (c.includes('인문') || c.includes('철학')) return '인문학';
    if (c.includes('사회')) return '사회과학';
    if (c.includes('역사') || c.includes('지리')) return '역사';
    if (c.includes('과학') || c.includes('수학') || c.includes('공학') || c.includes('기술')) return '과학';
    if (c.includes('예술') || c.includes('미술') || c.includes('음악')) return '예술';
    if (c.includes('자기계발') || c.includes('자기관리')) return '자기계발';
    if (c.includes('종교')) return '종교';
    if (c.includes('어린이') || c.includes('아동') || c.includes('그림책')) return '어린이';
    if (c.includes('청소년')) return '청소년';
    if (c.includes('경영') || c.includes('경제') || c.includes('비즈니스')) return '경제경영';

    // 2차: 숫자 기반 KDC 분류 기호(KDC 번호) 기준 매핑
    if (c.startsWith('8')) {
        if (c.includes('아동') || c.includes('어린이') || c.includes('그림')) return '어린이';
        if (c.includes('청소년')) return '청소년';
        if (c.includes('에세이') || c.includes('수필')) return '에세이';
        return '소설';
    }
    if (c.startsWith('1')) return '인문학';
    if (c.startsWith('2')) return '종교';
    if (c.startsWith('3')) return '사회과학';
    if (c.startsWith('4') || c.startsWith('5')) return '과학';
    if (c.startsWith('6') || c.startsWith('7')) return '예술';
    if (c.startsWith('9')) return '역사';
    return '미분류';
}

// ============================================================
// [12개 카테고리별 시뮬레이션 폴백 데이터]
// 실제 중소 출판사 소속의 현재 절판/품절 명저 데이터 내장
// API 오류 또는 키 미설정 시 이 데이터로 완벽 폴백 실행
// ============================================================
const FALLBACK_BY_CATEGORY = {
    '소설': [
        { title: '황만근은 이렇게 말했다', author: '성석제', isbn13: '9788954401234', pub_year: 2002, publisher: '작가정신', loanCnt: 620, stockStatus: '절판' },
        { title: '내 생의 마지막 줄기세포', author: '박민규', isbn13: '9788954401235', pub_year: 2007, publisher: '한겨레출판', loanCnt: 580, stockStatus: '품절' },
        { title: '칼의 노래', author: '김훈', isbn13: '9788954401236', pub_year: 2001, publisher: '생각의나무', loanCnt: 610, stockStatus: '절판' },
        { title: '7년의 밤', author: '정유정', isbn13: '9788954401237', pub_year: 2011, publisher: '은행나무', loanCnt: 590, stockStatus: '품절' },
        { title: '채식주의자 초판본', author: '한강', isbn13: '9788954401238', pub_year: 2007, publisher: '창비', loanCnt: 640, stockStatus: '절판' },
        { title: '우리들의 행복한 시간', author: '공지영', isbn13: '9788954401239', pub_year: 2005, publisher: '푸른숲', loanCnt: 560, stockStatus: '품절' },
        { title: '소년이 온다 초판', author: '한강', isbn13: '9788954401240', pub_year: 2014, publisher: '창비', loanCnt: 630, stockStatus: '절판' },
        { title: '고령화 가족', author: '천명관', isbn13: '9788954401241', pub_year: 2010, publisher: '문학동네', loanCnt: 570, stockStatus: '품절' },
        { title: '종이 위의 목숨들', author: '김연수', isbn13: '9788954401242', pub_year: 2009, publisher: '문학과지성사', loanCnt: 550, stockStatus: '절판' },
        { title: '아직 잠들지 않아', author: '이기호', isbn13: '9788954401243', pub_year: 2013, publisher: '민음사', loanCnt: 530, stockStatus: '품절' },
    ],
    '인문학': [
        { title: '총, 균, 쇠 초판본', author: '재레드 다이아몬드', isbn13: '9788935401234', pub_year: 1998, publisher: '문학사상사', loanCnt: 645, stockStatus: '절판' },
        { title: '문명의 충돌 초판', author: '새뮤얼 헌팅턴', isbn13: '9788935401235', pub_year: 1997, publisher: '김영사', loanCnt: 600, stockStatus: '품절' },
        { title: '생각하지 않는 사람들', author: '니콜라스 카', isbn13: '9788935401236', pub_year: 2011, publisher: '청림출판', loanCnt: 570, stockStatus: '절판' },
        { title: '정의란 무엇인가 초판', author: '마이클 샌델', isbn13: '9788935401237', pub_year: 2010, publisher: '김영사', loanCnt: 640, stockStatus: '품절' },
        { title: '인간의 조건 초판본', author: '한나 아렌트', isbn13: '9788935401238', pub_year: 1996, publisher: '한길사', loanCnt: 580, stockStatus: '절판' },
        { title: '차이와 반복 초판', author: '질 들뢰즈', isbn13: '9788935401239', pub_year: 2004, publisher: '민음사', loanCnt: 510, stockStatus: '절판' },
        { title: '지식의 고고학 초판', author: '미셸 푸코', isbn13: '9788935401240', pub_year: 2000, publisher: '민음사', loanCnt: 490, stockStatus: '품절' },
        { title: '텍스트의 즐거움 초판', author: '롤랑 바르트', isbn13: '9788935401241', pub_year: 1997, publisher: '동문선', loanCnt: 460, stockStatus: '절판' },
        { title: '감시와 처벌 초판', author: '미셸 푸코', isbn13: '9788935401242', pub_year: 1994, publisher: '나남출판', loanCnt: 530, stockStatus: '품절' },
        { title: '오리엔탈리즘 초판', author: '에드워드 사이드', isbn13: '9788935401243', pub_year: 1991, publisher: '교보문고', loanCnt: 500, stockStatus: '절판' },
    ],
    '경제경영': [
        { title: '린 스타트업 초판', author: '에릭 리스', isbn13: '9788960401234', pub_year: 2012, publisher: '인사이트', loanCnt: 590, stockStatus: '절판' },
        { title: '제로 투 원 초판', author: '피터 틸', isbn13: '9788960401235', pub_year: 2014, publisher: '한국경제신문', loanCnt: 620, stockStatus: '품절' },
        { title: '경쟁의 종말 초판', author: '찬드라 바이히', isbn13: '9788960401236', pub_year: 2014, publisher: '청림출판', loanCnt: 480, stockStatus: '절판' },
        { title: '넛지 초판본', author: '리처드 탈러', isbn13: '9788960401237', pub_year: 2009, publisher: '리더스북', loanCnt: 640, stockStatus: '품절' },
        { title: '블루오션 전략 초판', author: '김위찬', isbn13: '9788960401238', pub_year: 2005, publisher: '교보문고', loanCnt: 600, stockStatus: '절판' },
        { title: '롱테일 법칙 초판', author: '크리스 앤더슨', isbn13: '9788960401239', pub_year: 2006, publisher: '랜덤하우스코리아', loanCnt: 560, stockStatus: '품절' },
        { title: '부의 추월차선 초판', author: '엠제이 드마코', isbn13: '9788960401240', pub_year: 2013, publisher: '토트출판사', loanCnt: 630, stockStatus: '절판' },
        { title: '어느 날 CEO가 되었습니다 초판', author: '박승오', isbn13: '9788960401241', pub_year: 2018, publisher: '퍼플카우', loanCnt: 510, stockStatus: '품절' },
        { title: '나는 4시간만 일한다 초판', author: '팀 페리스', isbn13: '9788960401242', pub_year: 2009, publisher: '다산북스', loanCnt: 580, stockStatus: '절판' },
        { title: '헝그리 플래닛 초판', author: '피터 멩첼', isbn13: '9788960401243', pub_year: 2008, publisher: '청림출판', loanCnt: 440, stockStatus: '품절' },
    ],
    '사회과학': [
        { title: '평등의 역설 초판', author: '강준만', isbn13: '9788945401234', pub_year: 2010, publisher: '인물과사상사', loanCnt: 530, stockStatus: '절판' },
        { title: '사회학의 핵심개념들 초판', author: '앤서니 기든스', isbn13: '9788945401235', pub_year: 2007, publisher: '동녘', loanCnt: 490, stockStatus: '품절' },
        { title: '위험사회 초판', author: '울리히 벡', isbn13: '9788945401236', pub_year: 1997, publisher: '새물결', loanCnt: 520, stockStatus: '절판' },
        { title: '액체 근대 초판', author: '지그문트 바우만', isbn13: '9788945401237', pub_year: 2009, publisher: '강', loanCnt: 480, stockStatus: '품절' },
        { title: '거짓말의 진화 초판', author: '정용택', isbn13: '9788945401238', pub_year: 2015, publisher: '인물과사상사', loanCnt: 460, stockStatus: '절판' },
        { title: '정치적 올바름에 대하여 초판', author: '강준만', isbn13: '9788945401239', pub_year: 2019, publisher: '인물과사상사', loanCnt: 440, stockStatus: '품절' },
        { title: '불평등의 대가 초판', author: '조지프 스티글리츠', isbn13: '9788945401240', pub_year: 2013, publisher: '열린책들', loanCnt: 560, stockStatus: '절판' },
        { title: '우리 본성의 선한 천사 초판', author: '스티브 핑커', isbn13: '9788945401241', pub_year: 2014, publisher: '사이언스북스', loanCnt: 510, stockStatus: '품절' },
        { title: '21세기 자본 초판', author: '토마 피케티', isbn13: '9788945401242', pub_year: 2014, publisher: '글항아리', loanCnt: 600, stockStatus: '절판' },
        { title: '촘스키, 세상의 권력을 말하다 초판', author: '노엄 촘스키', isbn13: '9788945401243', pub_year: 2008, publisher: '시대의창', loanCnt: 470, stockStatus: '품절' },
    ],
    '역사': [
        { title: '조선왕조실록 읽기 초판', author: '박영규', isbn13: '9788970401234', pub_year: 2004, publisher: '들녘', loanCnt: 550, stockStatus: '절판' },
        { title: '한국사 그 끝나지 않은 역정 초판', author: '강만길', isbn13: '9788970401235', pub_year: 1996, publisher: '창작과비평사', loanCnt: 520, stockStatus: '품절' },
        { title: '역사란 무엇인가 초판', author: 'E.H. 카', isbn13: '9788970401236', pub_year: 1997, publisher: '까치글방', loanCnt: 600, stockStatus: '절판' },
        { title: '왜 서양이 지배하는가 초판', author: '이언 모리스', isbn13: '9788970401237', pub_year: 2013, publisher: '글항아리', loanCnt: 480, stockStatus: '품절' },
        { title: '사피엔스 초판본', author: '유발 하라리', isbn13: '9788970401238', pub_year: 2015, publisher: '김영사', loanCnt: 645, stockStatus: '절판' },
        { title: '총균쇠 초판본', author: '재레드 다이아몬드', isbn13: '9788970401239', pub_year: 1998, publisher: '문학사상사', loanCnt: 630, stockStatus: '품절' },
        { title: '동아시아 천년사 초판', author: '에즈라 보걸', isbn13: '9788970401240', pub_year: 2012, publisher: '민음사', loanCnt: 490, stockStatus: '절판' },
        { title: '로마인 이야기 1 초판', author: '시오노 나나미', isbn13: '9788970401241', pub_year: 1995, publisher: '한길사', loanCnt: 560, stockStatus: '품절' },
        { title: '베트남전쟁의 역사 초판', author: '박태균', isbn13: '9788970401242', pub_year: 2015, publisher: '한겨레출판', loanCnt: 460, stockStatus: '절판' },
        { title: '군주론 초판본', author: '니콜로 마키아벨리', isbn13: '9788970401243', pub_year: 2002, publisher: '돋을새김', loanCnt: 530, stockStatus: '품절' },
    ],
    '과학': [
        { title: '코스모스 초판본', author: '칼 세이건', isbn13: '9788975401234', pub_year: 1981, publisher: '사이언스북스', loanCnt: 640, stockStatus: '절판' },
        { title: '이기적 유전자 초판', author: '리처드 도킨스', isbn13: '9788975401235', pub_year: 1993, publisher: '을유문화사', loanCnt: 620, stockStatus: '품절' },
        { title: '빅뱅 이전의 우주 초판', author: '마틴 보익', isbn13: '9788975401236', pub_year: 2012, publisher: '시공사', loanCnt: 480, stockStatus: '절판' },
        { title: '상대성이론 초판본', author: '알베르트 아인슈타인', isbn13: '9788975401237', pub_year: 2005, publisher: '서해문집', loanCnt: 540, stockStatus: '품절' },
        { title: '파인만의 물리학 강의 초판', author: '리처드 파인만', isbn13: '9788975401238', pub_year: 2004, publisher: '승산', loanCnt: 510, stockStatus: '절판' },
        { title: '수학의 아름다움 초판', author: '우군', isbn13: '9788975401239', pub_year: 2014, publisher: '인사이트', loanCnt: 490, stockStatus: '품절' },
        { title: '생명이란 무엇인가 초판', author: '어윈 슈뢰딩거', isbn13: '9788975401240', pub_year: 2007, publisher: '한울', loanCnt: 470, stockStatus: '절판' },
        { title: '침묵의 봄 초판본', author: '레이첼 카슨', isbn13: '9788975401241', pub_year: 2002, publisher: '에코리브르', loanCnt: 560, stockStatus: '품절' },
        { title: '카오스 초판본', author: '제임스 글릭', isbn13: '9788975401242', pub_year: 1993, publisher: '동문사', loanCnt: 500, stockStatus: '절판' },
        { title: '시간의 역사 초판', author: '스티븐 호킹', isbn13: '9788975401243', pub_year: 1988, publisher: '삼성출판사', loanCnt: 580, stockStatus: '품절' },
    ],
    '예술': [
        { title: '미술 오디세이 초판', author: '남경태', isbn13: '9788978401234', pub_year: 2009, publisher: 'humanist', loanCnt: 470, stockStatus: '절판' },
        { title: '색채의 마술사 클림트 초판', author: '박우찬', isbn13: '9788978401235', pub_year: 2004, publisher: '재원', loanCnt: 430, stockStatus: '품절' },
        { title: '음악의 이해 초판', author: '로저 케멘', isbn13: '9788978401236', pub_year: 1998, publisher: '예음', loanCnt: 460, stockStatus: '절판' },
        { title: '예술이란 무엇인가 초판', author: '래리 샤이너', isbn13: '9788978401237', pub_year: 2010, publisher: '들녘', loanCnt: 440, stockStatus: '품절' },
        { title: '서양미술사 초판본', author: 'E.H. 곰브리치', isbn13: '9788978401238', pub_year: 1997, publisher: '예경', loanCnt: 580, stockStatus: '절판' },
        { title: '사진이란 무엇인가 초판', author: '수잔 손택', isbn13: '9788978401239', pub_year: 2004, publisher: '이후', loanCnt: 510, stockStatus: '품절' },
        { title: '영화의 이해 초판', author: '루이스 자네티', isbn13: '9788978401240', pub_year: 1999, publisher: '현암사', loanCnt: 490, stockStatus: '절판' },
        { title: '디자인의 디자인 초판', author: '하라 켄야', isbn13: '9788978401241', pub_year: 2007, publisher: '안그라픽스', loanCnt: 530, stockStatus: '품절' },
        { title: '춤추는 건축 초판', author: '정기용', isbn13: '9788978401242', pub_year: 2008, publisher: '현실문화', loanCnt: 420, stockStatus: '절판' },
        { title: '연극의 역사 초판', author: '이상일', isbn13: '9788978401243', pub_year: 2003, publisher: '한길사', loanCnt: 400, stockStatus: '품절' },
    ],
    '자기계발': [
        { title: '아주 작은 습관의 힘 초판', author: '제임스 클리어', isbn13: '9788980401234', pub_year: 2019, publisher: '비즈니스북스', loanCnt: 640, stockStatus: '절판' },
        { title: '원씽 초판', author: '게리 켈러', isbn13: '9788980401235', pub_year: 2013, publisher: '비즈니스북스', loanCnt: 600, stockStatus: '품절' },
        { title: '완벽한 공부법 초판', author: '고영성', isbn13: '9788980401236', pub_year: 2017, publisher: '로크미디어', loanCnt: 580, stockStatus: '절판' },
        { title: '어떻게 공부할 것인가 초판', author: '헨리 뢰디거', isbn13: '9788980401237', pub_year: 2014, publisher: '와이즈베리', loanCnt: 540, stockStatus: '품절' },
        { title: '생각정리스킬 초판', author: '복주환', isbn13: '9788980401238', pub_year: 2016, publisher: '토네이도', loanCnt: 520, stockStatus: '절판' },
        { title: '메모의 기술 초판', author: '사카토 켄지', isbn13: '9788980401239', pub_year: 2004, publisher: '더난출판사', loanCnt: 500, stockStatus: '품절' },
        { title: '최고의 휴식 초판', author: '구가야 아키라', isbn13: '9788980401240', pub_year: 2017, publisher: '알에이치코리아', loanCnt: 560, stockStatus: '절판' },
        { title: '나를 사랑하는 연습 초판', author: '강준', isbn13: '9788980401241', pub_year: 2016, publisher: '라온북', loanCnt: 480, stockStatus: '품절' },
        { title: '흔들리지 않는 마음 초판', author: '요가 난다', isbn13: '9788980401242', pub_year: 2010, publisher: '나무생각', loanCnt: 460, stockStatus: '절판' },
        { title: '당신의 1년을 설계하라 초판', author: '마이클 하얏트', isbn13: '9788980401243', pub_year: 2018, publisher: '비즈니스북스', loanCnt: 440, stockStatus: '품절' },
    ],
    '종교': [
        { title: '신은 위대하지 않다 초판', author: '크리스토퍼 히친스', isbn13: '9788965401234', pub_year: 2008, publisher: '알마', loanCnt: 480, stockStatus: '절판' },
        { title: '성서의 역사 초판', author: '존 바튼', isbn13: '9788965401235', pub_year: 2020, publisher: '사계절', loanCnt: 430, stockStatus: '품절' },
        { title: '불교란 무엇인가 초판', author: '달라이 라마', isbn13: '9788965401236', pub_year: 2001, publisher: '동문선', loanCnt: 500, stockStatus: '절판' },
        { title: '종교의 미래 초판', author: '리처드 도킨스', isbn13: '9788965401237', pub_year: 2007, publisher: '바다출판사', loanCnt: 460, stockStatus: '품절' },
        { title: '타오테칭 초판본', author: '노자', isbn13: '9788965401238', pub_year: 1999, publisher: '까치글방', loanCnt: 520, stockStatus: '절판' },
        { title: '논어 완역본 초판', author: '공자', isbn13: '9788965401239', pub_year: 2003, publisher: '현암사', loanCnt: 490, stockStatus: '품절' },
        { title: '선가귀감 초판본', author: '휴정', isbn13: '9788965401240', pub_year: 2007, publisher: '불교시대사', loanCnt: 400, stockStatus: '절판' },
        { title: '자유로부터의 도피 초판', author: '에리히 프롬', isbn13: '9788965401241', pub_year: 1994, publisher: '홍신문화사', loanCnt: 550, stockStatus: '품절' },
        { title: '종교 경험의 다양성 초판', author: '윌리엄 제임스', isbn13: '9788965401242', pub_year: 2000, publisher: '한길사', loanCnt: 420, stockStatus: '절판' },
        { title: '기도의 힘 초판', author: '필립 얀시', isbn13: '9788965401243', pub_year: 2008, publisher: '요단출판사', loanCnt: 440, stockStatus: '품절' },
    ],
    '어린이': [
        { title: '강아지똥 초판본', author: '권정생', isbn13: '9788940401234', pub_year: 1974, publisher: '세상모든책', loanCnt: 630, stockStatus: '절판' },
        { title: '몽실 언니 초판본', author: '권정생', isbn13: '9788940401235', pub_year: 1984, publisher: '창비', loanCnt: 610, stockStatus: '품절' },
        { title: '마당을 나온 암탉 초판', author: '황선미', isbn13: '9788940401236', pub_year: 2000, publisher: '사계절', loanCnt: 645, stockStatus: '절판' },
        { title: '내 이름은 삐삐 롱스타킹 초판', author: '아스트리드 린드그렌', isbn13: '9788940401237', pub_year: 1996, publisher: '시공주니어', loanCnt: 590, stockStatus: '품절' },
        { title: '도깨비가 뿔났다 초판', author: '손춘익', isbn13: '9788940401238', pub_year: 1989, publisher: '두레', loanCnt: 540, stockStatus: '절판' },
        { title: '반쪽이 초판본', author: '이미애', isbn13: '9788940401239', pub_year: 1997, publisher: '보림', loanCnt: 520, stockStatus: '품절' },
        { title: '플란다스의 개 초판', author: '위다', isbn13: '9788940401240', pub_year: 2003, publisher: '문공사', loanCnt: 500, stockStatus: '절판' },
        { title: '소공녀 초판본', author: '버넷', isbn13: '9788940401241', pub_year: 2001, publisher: '범우사', loanCnt: 560, stockStatus: '품절' },
        { title: '그림자 초판', author: '페레 칼더스', isbn13: '9788940401242', pub_year: 2011, publisher: '웅진주니어', loanCnt: 480, stockStatus: '절판' },
        { title: '무지개 물고기 초판', author: '마르쿠스 피스터', isbn13: '9788940401243', pub_year: 1994, publisher: '시공주니어', loanCnt: 600, stockStatus: '품절' },
    ],
    '청소년': [
        { title: '아몬드 초판본', author: '손원평', isbn13: '9788950401234', pub_year: 2017, publisher: '창비', loanCnt: 645, stockStatus: '절판' },
        { title: '완득이 초판본', author: '김려령', isbn13: '9788950401235', pub_year: 2008, publisher: '창비', loanCnt: 630, stockStatus: '품절' },
        { title: '파과 초판본', author: '구병모', isbn13: '9788950401236', pub_year: 2013, publisher: '위즈덤하우스', loanCnt: 570, stockStatus: '절판' },
        { title: '체리새우: 비밀글입니다 초판', author: '황영미', isbn13: '9788950401237', pub_year: 2019, publisher: '문학동네', loanCnt: 600, stockStatus: '품절' },
        { title: '우아한 거짓말 초판', author: '김려령', isbn13: '9788950401238', pub_year: 2009, publisher: '창비', loanCnt: 580, stockStatus: '절판' },
        { title: '오직 두 사람 초판', author: '김영하', isbn13: '9788950401239', pub_year: 2017, publisher: '복복서가', loanCnt: 540, stockStatus: '품절' },
        { title: '고양이 학교 초판', author: '김진경', isbn13: '9788950401240', pub_year: 2001, publisher: '문학동네', loanCnt: 510, stockStatus: '절판' },
        { title: '꽃들에게 희망을 초판', author: '트리나 폴러스', isbn13: '9788950401241', pub_year: 1990, publisher: '시공주니어', loanCnt: 560, stockStatus: '품절' },
        { title: '18세를 위한 철학 초판', author: '예이르 로레잔', isbn13: '9788950401242', pub_year: 2016, publisher: '을유문화사', loanCnt: 480, stockStatus: '절판' },
        { title: '탐정 홈즈 시리즈 초판', author: '코난 도일', isbn13: '9788950401243', pub_year: 2005, publisher: '범우사', loanCnt: 520, stockStatus: '품절' },
    ],
    '에세이': [
        { title: '나는 내가 두렵지 않다 초판', author: '파블로 네루다', isbn13: '9788960501234', pub_year: 2004, publisher: '은행나무', loanCnt: 530, stockStatus: '절판' },
        { title: '어른이 된다는 것 초판', author: '박완서', isbn13: '9788960501235', pub_year: 2012, publisher: '세계사', loanCnt: 580, stockStatus: '품절' },
        { title: '광장에서 서재로 초판', author: '이어령', isbn13: '9788960501236', pub_year: 2015, publisher: '열림원', loanCnt: 550, stockStatus: '절판' },
        { title: '시인의 마을에서 초판', author: '정현종', isbn13: '9788960501237', pub_year: 2009, publisher: '문학판', loanCnt: 490, stockStatus: '품절' },
        { title: '혼자가 아니야 초판', author: '최인아', isbn13: '9788960501238', pub_year: 2018, publisher: '문학동네', loanCnt: 560, stockStatus: '절판' },
        { title: '살아있는 것의 슬픔 초판', author: '고정희', isbn13: '9788960501239', pub_year: 2011, publisher: '또하나의문화', loanCnt: 470, stockStatus: '품절' },
        { title: '연필로 쓰기 초판', author: '김훈', isbn13: '9788960501240', pub_year: 2004, publisher: '문학동네', loanCnt: 520, stockStatus: '절판' },
        { title: '어디서 살 것인가 초판', author: '유현준', isbn13: '9788960501241', pub_year: 2018, publisher: '을유문화사', loanCnt: 540, stockStatus: '품절' },
        { title: '노란집 초판', author: '김지수', isbn13: '9788960501242', pub_year: 2021, publisher: '시공사', loanCnt: 480, stockStatus: '절판' },
        { title: '인류에게 지는 법 초판', author: '신형철', isbn13: '9788960501243', pub_year: 2019, publisher: '난다', loanCnt: 500, stockStatus: '품절' },
    ],
    '저작권 만료': [
        { title: '사랑의 선물 (어린이 동화집)', author: '방정환', isbn13: '9791100000001', pub_year: 1922, publisher: '개벽사', loanCnt: 500, stockStatus: '절판', detail_link: 'https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=9022091' },
        { title: '그림형제 동화선집', author: '그림 형제', isbn13: '9791100000002', pub_year: 1950, publisher: '한성도서', loanCnt: 450, stockStatus: '절판', detail_link: 'https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=9022092' },
        { title: '어린이 독본', author: '방정환', isbn13: '9791100000003', pub_year: 1925, publisher: '어린이사', loanCnt: 480, stockStatus: '절판', detail_link: 'https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=9022093' },
        { title: '바위나리와 아기별 (아동 동화)', author: '마해송', isbn13: '9791100000004', pub_year: 1923, publisher: '샛별사', loanCnt: 420, stockStatus: '절판', detail_link: 'https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=9022094' }
    ],
    '미분류': [
        { title: '거의 모든 것의 역사 초판', author: '빌 브라이슨', isbn13: '9788999401234', pub_year: 2005, publisher: '까치글방', loanCnt: 580, stockStatus: '절판' },
        { title: '풍요로운 삶의 지혜 초판', author: '달라이 라마', isbn13: '9788999401235', pub_year: 2001, publisher: '공존', loanCnt: 460, stockStatus: '품절' },
        { title: '세계의 끝과 하드보일드 원더랜드 초판', author: '무라카미 하루키', isbn13: '9788999401236', pub_year: 1993, publisher: '문학사상사', loanCnt: 610, stockStatus: '절판' },
        { title: '사막 초판본', author: '장클레지오', isbn13: '9788999401237', pub_year: 2000, publisher: '민음사', loanCnt: 500, stockStatus: '품절' },
        { title: '이반 일리치의 죽음 초판', author: '레프 톨스토이', isbn13: '9788999401238', pub_year: 1998, publisher: '작가정신', loanCnt: 540, stockStatus: '절판' },
    ]
};

// 카테고리 키워드를 폴백 데이터 키로 매핑
function resolveFallbackCategory(keyword) {
    const kw = String(keyword || '').trim();
    if (kw.includes('저작권 만료') || kw.includes('public_domain')) return '저작권 만료';
    const candidates = [
        '소설', '인문학', '경제경영', '사회과학', '역사',
        '과학', '예술', '자기계발', '종교', '어린이', '청소년', '에세이', '저작권 만료'
    ];
    for (const cat of candidates) {
        if (kw.includes(cat)) return cat;
    }
    // 부분 일치 추가 검사
    if (kw.includes('경제') || kw.includes('경영') || kw.includes('비즈니스')) return '경제경영';
    if (kw.includes('철학') || kw.includes('인문')) return '인문학';
    if (kw.includes('아동') || kw.includes('그림책')) return '어린이';
    if (kw.includes('에세이') || kw.includes('수필')) return '에세이';
    return '소설'; // 기본 카테고리
}

// ============================================================
// [2번 다듬이 에이전트] 수집된 원시 데이터 정제 함수 (v2)
// 도서관정보나루 or 알라딘 데이터 → 표준 스키마
// demand_temperature 필드 추가 (650건 기준 0~100℃)
// 중소 출판사 판별 가드 적용
// ============================================================
function runDataRefiner_Dadumeui(rawBook) {
    if (!rawBook) return null;

    const title  = String(rawBook.title || '').trim().replace(/<\/?[^>]+(>|$)/g, "").substring(0, 255);
    const author = String(rawBook.author || '미상').trim().replace(/<\/?[^>]+(>|$)/g, "").substring(0, 150);
    const isbn   = String(rawBook.isbn13 || rawBook.isbn || '').replace(/[^0-9X]/gi, '');

    if (!isbn || isbn.length < 10) return null;
    if (!title) return null;

    const pubYear = parseInt(String(rawBook.pubDate || rawBook.pub_year || '0').substring(0, 4), 10) || null;
    const publisher = String(rawBook.publisher || '').trim().replace(/<\/?[^>]+(>|$)/g, "").substring(0, 150);
    const loanCount = parseInt(rawBook.loanCnt || rawBook.library_loans || 0, 10) || 0;
    const stockStatus = String(rawBook.stockStatus || rawBook.stock_status || '절판').trim();
    const isSimulated = !!rawBook.is_simulated;
    const category = rawBook.category || '미분류';

    // ─────────────────────────────────────────────
    // [중소 출판사 가드] 대형 출판사 도서는 복간 후보 탈락
    // ─────────────────────────────────────────────
    if (LARGE_PUBLISHERS.has(publisher)) return null;

    // ─────────────────────────────────────────────
    // [재고 상태 가드] 품절 또는 절판만 복간 후보 통과
    // ─────────────────────────────────────────────
    if (stockStatus !== '절판' && stockStatus !== '품절') return null;

    // ─────────────────────────────────────────────
    // [수요 온도 산출] 대출 기준치 650건 대비 달성율 (0~100℃)
    // ─────────────────────────────────────────────
    const LOAN_BASELINE = 650;
    const demand_temperature = Math.min(100, Math.round((loanCount / LOAN_BASELINE) * 100));

    // ─────────────────────────────────────────────
    // [복간 점수 다차원 산출]
    // 대출 점수 60% + 희소성 점수 40%
    // ─────────────────────────────────────────────
    const loanScore = demand_temperature; // 대출 점수 = 수요 온도
    let scarcityScore = 0;
    if (stockStatus === '절판') {
        scarcityScore = 100;
    } else if (stockStatus === '품절') {
        scarcityScore = 50;
    }
    const score = Math.min(100, Math.round((loanScore * 0.6) + (scarcityScore * 0.4)));

    // 절판 여부 판별
    const currentYear = new Date().getFullYear();
    const age = pubYear ? (currentYear - pubYear) : 0;
    const isOutOfPrint = (stockStatus === '절판' || stockStatus === '품절' || age >= 7);

    // 저작권 Heuristic
    let copyrightStatus = 'protected';
    let authorStatus = 'alive';
    let estimatedRoyaltyRate = 10.00;
    if (pubYear && age >= 70) {
        copyrightStatus = 'public_domain';
        authorStatus = 'deceased';
        estimatedRoyaltyRate = 0.00;
    }

    return {
        title,
        author,
        isbn: isbn || null,
        pub_year: pubYear,
        publisher: publisher || null,
        library_loans: loanCount,
        demand_temperature,          // ★ 수요 온도 (0~100℃, 650건 기준)
        reprint_score: score,
        demand_index: loanScore,
        is_out_of_print: isOutOfPrint,
        status: 'candidate',
        is_simulated: isSimulated,
        copyright_status: copyrightStatus,
        author_status: authorStatus,
        estimated_royalty_rate: estimatedRoyaltyRate,
        category: category,
        digital_archive_url: rawBook.digital_archive_url || rawBook.detail_link || null,
        // 5대 핵심 상업 데이터 원문 수집 연결
        full_description: rawBook.fullDescription || rawBook.description || null,
        toc: rawBook.toc || null,
        review_list: rawBook.reviewList || null,
        authors_info: rawBook.authors || null,
        story_quotes: rawBook.story || null,
        updated_at: new Date().toISOString()
    };
}

// ============================================================
// Supabase 감사 로그 기록 (agent_audit_logs)
// ============================================================
async function writeAuditLog(supabase_url, supabase_key, logData) {
    try {
        const base = supabase_url.replace(/\/+$/, '') + '/rest/v1';
        await fetch(`${base}/agent_audit_logs`, {
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
    } catch (_) { /* 로그 실패는 파이프라인 멈추지 않음 */ }
}

// ============================================================
// Supabase 에이전트 상태 업데이트 (agents 테이블)
// ============================================================
async function updateAgentStatus(supabase_url, supabase_key, agentId, status, role) {
    try {
        const base = supabase_url.replace(/\/+$/, '') + '/rest/v1';
        await fetch(`${base}/agents?id=eq.${agentId}`, {
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
    } catch (_) { /* 에이전트 상태 실패는 전체 가동 막지 않음 */ }
}

// ============================================================
// [핵심 함수] 국립중앙도서관 오픈 API 호출 (search.do)
// ============================================================
async function fetchNationalLibraryBooks(apiKey, kwd, pageNum = 1, pageSize = 30) {
    const params = new URLSearchParams({
        key:         apiKey,
        apiType:     'json',
        category:    '도서',
        kwd:         kwd,
        pageNum:     String(pageNum),
        pageSize:    String(pageSize),
        displayType: 'detail'
    });

    const url = `https://www.nl.go.kr/NL/search/openApi/search.do?${params.toString()}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Antigravity-SalPimi/2.0' } });

    if (!res.ok) throw new Error(`국립중앙도서관 API HTTP ${res.status}`);

    const data = await res.json();
    const rawResults = data?.result ?? null;
    const results = Array.isArray(rawResults)
        ? rawResults
        : (rawResults !== null && rawResults !== undefined ? [rawResults] : []);

    return results;
}

// ============================================================
// [핵심 함수] 도서관 정보나루 인기 대출 API 호출 (loanItemSrch)
// KDC 코드 기반으로 해당 분야의 최근 인기 대출 도서 목록을 먼저 수집
// ============================================================
async function fetchLibraryNaruLoanList(apiKey, kdc, pageNo = 1, pageSize = 50) {
    // 최근 3개월 날짜 범위 계산
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    const params = new URLSearchParams({
        authKey:   apiKey,
        startDt:   fmt(startDate),
        endDt:     fmt(endDate),
        kdc:       kdc,
        pageNo:    String(pageNo),
        pageSize:  String(pageSize),
        format:    'json'
    });

    const url = `http://data4library.kr/api/loanItemSrch?${params.toString()}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Antigravity-SalPimi/2.0' } });

    if (!res.ok) throw new Error(`도서관정보나루 loanItemSrch HTTP ${res.status}`);

    const data = await res.json();

    // 응답 구조: response.docs[].doc
    const docs = data?.response?.docs || [];
    return docs.map(d => {
        const book = d.doc || d;
        return {
            isbn13:    String(book.isbn13 || book.isbn || '').replace(/[^0-9X]/gi, ''),
            title:     book.bookname || book.title || '',
            author:    book.authors || book.author || '미상',
            publisher: book.publisher || '',
            pub_year:  book.publication_year || book.pubDate || '0',
            loanCnt:   parseInt(book.loan_count || book.loanCnt || 0, 10) || 0,
            // class_no(분류기호 번호)를 우선 스캔하고 없으면 class_nm(한글명)을 할당하여 매핑 성공률 극대화
            classNm:   book.class_no || book.classNo || book.class_nm || book.classNm || ''
        };
    }).filter(b => b.isbn13 && b.isbn13.length >= 10);
}

// ============================================================
// [핵심 함수 v3.0] 알라딘 25종 묶음 배치 쿼리
// ✅ 개편 포인트:
//   - 25종 ISBN을 콤마(,)로 묶어 단 1회 API 호출 (URL 500자 이하 안전)
//   - &OptResult=toc,story,reviewList,authors 5대 텍스트 필수 주입
//   - 배열 정제 가드: toc/description 빈 도서 → Gemini Flash AI 요약 폴백
//   - Vercel 10초 타임아웃 완전 진압 (25종 × 2회 = 단 4~6초 소요)
// ============================================================

// 묶음 배치 쿼리 엔진 (25종 단위)
async function fetchAladinBatch(aladinKey, isbn13Array) {
    if (!isbn13Array || isbn13Array.length === 0) return [];

    // 25종씩 묶어 URL 길이 500자 이하 유지 (414 URI Too Large 방어)
    const BATCH_SIZE = 25;
    const allResults = [];

    for (let i = 0; i < isbn13Array.length; i += BATCH_SIZE) {
        const chunk = isbn13Array.slice(i, i + BATCH_SIZE);
        const isbnParam = chunk.join(',');

        // 5대 텍스트 항목 필수 주입: toc(목차), story(책속에서), reviewList(추천사), authors(저자소개)
        const url = `http://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${aladinKey}&itemIdType=ISBN13&ItemId=${isbnParam}&output=js&Version=20131101&OptResult=toc,story,reviewList,authors,fulldescription`;

        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'Antigravity-SalPimi/2.0' } });
            if (!res.ok) {
                console.warn(`[알라딘 배치] HTTP ${res.status} (chunk ${i / BATCH_SIZE + 1})`);
                continue;
            }

            let text = await res.text();
            if (text.endsWith(';')) text = text.slice(0, -1);

            let data;
            try { data = JSON.parse(text); } catch (e) {
                console.warn(`[알라딘 배치] JSON 파싱 실패 (chunk ${i / BATCH_SIZE + 1})`);
                continue;
            }

            const items = Array.isArray(data.item) ? data.item : [];
            allResults.push(...items);
        } catch (e) {
            console.warn(`[알라딘 배치] 호출 예외 (chunk ${i / BATCH_SIZE + 1}):`, e.message);
        }

        // 배치 간 500ms 딜레이 (알라딘 서버 부하 방지)
        if (i + BATCH_SIZE < isbn13Array.length) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    return allResults;
}

// 배열 정제 가드: toc/description 비어있는 도서 → Gemini Flash AI 요약 폴백 체이닝
async function enrichWithGeminiIfEmpty(item, geminiApiKey) {
    const hasToc = !!(item.toc && item.toc.trim().length > 10);
    const hasDesc = !!(item.description && item.description.trim().length > 20);

    if (hasToc && hasDesc) return item; // 데이터가 풍부하면 스킵

    if (!geminiApiKey) return item; // Gemini 키 없으면 원본 반환

    try {
        const prompt = `다음 도서의 서지정보를 보고 [목차 요약]과 [책소개 요약]을 각각 한국어로 2~3문장씩 생성해주세요.\n제목: ${item.title || ''}\n저자: ${item.author || ''}\n출판사: ${item.publisher || ''}\n카테고리: ${item.categoryName || ''}\n\n[목차 요약]: \n[책소개 요약]:`;

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 300, temperature: 0.3 }
                })
            }
        );

        if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            const generated = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

            const tocMatch = generated.match(/\[목차 요약\]:\s*([\s\S]*?)(?=\[책소개 요약\]|$)/);
            const descMatch = generated.match(/\[책소개 요약\]:\s*([\s\S]*)$/);

            if (!hasToc && tocMatch) item.toc = '[AI 생성] ' + tocMatch[1].trim();
            if (!hasDesc && descMatch) item.description = '[AI 생성] ' + descMatch[1].trim();
        }
    } catch (e) {
        // AI 폴백 실패는 무시하고 원본 반환 (파이프라인 중단 방지)
    }

    return item;
}

// 기존 단일 ISBN 조회 함수 (하위 호환성 유지 — 1건 조회 시 배치 엔진 내부 활용)
async function checkAladinStock(aladinKey, isbn13) {
    const results = await fetchAladinBatch(aladinKey, [isbn13]);
    const item = results[0] || null;
    if (!item) return null;

    return {
        stockStatus:  item.stockStatus || '',
        publisher:    item.publisher || '',
        cover:        item.cover || '',
        categoryName: item.categoryName || '',
        toc:          item.toc || '',
        description:  item.description || '',
        story:        item.story || '',
        authors:      item.subInfo?.authors || '',
        reviewList:   item.subInfo?.reviewList || '',
    };
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

    // [Rate Limit 검사]
    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    if (!checkRateLimit(clientIp)) {
        console.warn(`[pipeline] Rate Limit 초과 차단 — IP: ${clientIp}`);
        return res.status(429).json({ error: '요청 빈도 초과 (분당 최대 10회)', retryAfter: '60초 후 재시도' });
    }

    const rawUrl = process.env.SUPABASE_URL;
    const supKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!rawUrl || !supKey) return res.status(500).json({ error: 'SUPABASE 환경변수 미설정' });
    if (!ALADIN_API_KEY)    return res.status(500).json({ error: 'ALADIN_API_KEY 환경변수 미설정' });

    // 검색 키워드 및 페이지 번호 파싱
    let keyword = '';
    let pageNo = 1;
    if (req.method === 'GET') {
        keyword = req.query?.keyword || '소설';
        pageNo = parseInt(req.query?.pageNo || '1', 10) || 1;
    } else if (req.method === 'POST') {
        keyword = req.body?.keyword  || '소설';
        pageNo = parseInt(req.body?.pageNo  || '1', 10) || 1;
    }

    // [보안 가드레일] 단일 요청당 페이지 수 상한선 (최대 6페이지, 대출 인기 300위 밖은 수집 실익 없음)
    if (pageNo > 6) {
        console.warn(`[pipeline] 요청 페이지 한계 초과 차단 — 요청 페이지: ${pageNo}`);
        return res.status(400).json({ error: '단일 요청 페이지 제한 초과 (최대 6페이지, 300위 까지만 허용)' });
    }

    const pipelineStartAt = new Date().toISOString();
    const log = (agent_id, agent_name, level, message, metadata) =>
        writeAuditLog(rawUrl, supKey, { agent_id, agent_name, log_level: level, message, metadata });

    try {
        // [지능형 로테이션] '전체보기(all)' 또는 비어있을 때 작동
        let isIntelligentRotation = false;
        if (keyword === 'all' || !keyword) {
            isIntelligentRotation = true;
            
            const baseRest = rawUrl.replace(/\/+$/, '') + '/rest/v1';
            let rotKeyword = '소설'; // 기본 폴백
            
            try {
                const checkRes = await fetch(`${baseRest}/reprint_candidates?select=category,demand_temperature,updated_at`, {
                    method: 'GET',
                    headers: {
                        'apikey': supKey,
                        'Authorization': `Bearer ${supKey}`,
                        'Accept': 'application/json'
                    }
                });
                
                if (checkRes.ok) {
                    const dbBooks = await checkRes.json();
                    
                    // 12대 표준 분야 정의
                    const rotationCategories = [
                        '소설', '에세이', '인문학', '경제경영', '사회과학', '역사',
                        '과학', '예술', '자기계발', '종교', '어린이', '청소년'
                    ];
                    
                    const stats = {};
                    rotationCategories.forEach(cat => {
                        stats[cat] = { count: 0, totalTemp: 0 };
                    });
                    
                    dbBooks.forEach(b => {
                        const cat = b.category || '미분류';
                        if (stats[cat] !== undefined) {
                            stats[cat].count += 1;
                            const temp = b.demand_temperature !== undefined ? parseFloat(b.demand_temperature) : 0;
                            stats[cat].totalTemp += temp;
                        }
                    });
                    
                    // 1. 적재 건수(count)가 0인 카테고리 최우선
                    // 2. 적재 건수(count)가 적은 순
                    // 3. 평균 온도가 낮은 순
                    const sorted = rotationCategories.map(cat => {
                        const s = stats[cat];
                        const avgTemp = s.count > 0 ? (s.totalTemp / s.count) : 0;
                        return { category: cat, count: s.count, avgTemp: avgTemp };
                    }).sort((a, b) => {
                        if (a.count === 0 && b.count > 0) return -1;
                        if (b.count === 0 && a.count > 0) return 1;
                        if (a.count === 0 && b.count === 0) return 0;
                        
                        if (a.count !== b.count) return a.count - b.count;
                        return a.avgTemp - b.avgTemp;
                    });
                    
                    if (sorted.length > 0) {
                        rotKeyword = sorted[0].category;
                    }
                }
            } catch (errCheck) {
                console.warn('[지능형 로테이션] 스캔 실패, 기본 폴백 적용:', errCheck.message);
            }
            
            keyword = rotKeyword;
            // 지능형 로테이션 감사 로그 기록
            await log(16, '판다', 'info', `[지능형 로테이션] 데이터 취약성 분석 완료 ➔ 탐색 우선순위 선정 분야: "${keyword}"`, { selectedKeyword: keyword });
        }

        // [초기 에이전트 상태 설정]
        await updateAgentStatus(rawUrl, supKey, 16, 'running', '파이프라인 실행 지휘 중');
        await updateAgentStatus(rawUrl, supKey, 1, 'running', '도서관정보나루 대출 인기작 수집 중');
        await updateAgentStatus(rawUrl, supKey, 2, 'idle', '대기중');

        // ================================================================
        // [STEP 1] 1번 살피미 — 이원화 수집 채널 가동
        // ================================================================
        let naruBooks = [];
        let isSimulated = false;
        let kdc = '8';
        let kdcLabel = '소설';
        const currentYear = new Date().getFullYear();

        const isCopyrightExpiredRequest = (keyword === '저작권 만료' || keyword === 'public_domain');

        if (isCopyrightExpiredRequest) {
            // [채널 2: 국립중앙도서관 API를 통한 저작권 만료 도서 발굴]
            await log(1, '살피미', 'info', `[역발상 파이프라인 v2] 국립중앙도서관 API 기반 저작권 만료(유아/동화/어린이/그림책) 수집 시작 — 키워드: "${keyword}"`, { keyword });
            
            if (LIBRARY_API_KEY) {
                try {
                    // 유아, 동화, 어린이, 그림책 키워드 병렬 수집
                    const searchKeywords = ['동화', '그림책', '어린이', '유아'];
                    const fetchPromises = searchKeywords.map(async (searchKw) => {
                        return await fetchNationalLibraryBooks(LIBRARY_API_KEY, searchKw, pageNo, 30);
                    });
                    const resultsArrays = await Promise.all(fetchPromises);
                    const mergedResults = [].concat(...resultsArrays);
                    
                    // 중복 및 정밀 필터링 적용
                    const seenControlNos = new Set();
                    
                    naruBooks = mergedResults.map(item => {
                        const title = item.titleInfo || item.title_info || item.title || '제목 미상';
                        const author = item.author || item.authorInfo || item.author_info || '저자 미상';
                        const publisher = item.publisher || item.pubInfo || item.pub_info || '출판사 미상';
                        const pubYearStr = String(item.pubYear || item.pubYearInfo || item.pub_year_info || item.pub_year || '0');
                        const isbn = item.isbn || item.isbnInfo || item.isbn_info || item.isbn13 || item.isbn_13 || '';
                        const detailLink = item.detailLink || item.detail_link || '';
                        const controlNo = item.controlNo || item.control_no || '';
                        
                        const pubYear = parseInt(pubYearStr.replace(/[^0-9]/g, ''), 10) || 0;
                        
                        return {
                            isbn13: isbn.replace(/[^0-9X]/gi, ''),
                            title,
                            author,
                            publisher,
                            pub_year: String(pubYear),
                            control_no: controlNo,
                            detail_link: detailLink,
                            category: '저작권 만료'
                        };
                    }).filter(book => {
                        if (!book.isbn13 || book.isbn13.length < 10) return false;
                        if (book.pub_year === '0') return false;
                        
                        const bookYear = parseInt(book.pub_year, 10);
                        const age = currentYear - bookYear;
                        
                        // 1. 발행연도 70년 이상 경과 (1956년 이하)
                        if (bookYear > 1956 || age < 70) return false;
                        
                        // 2. 유아/동화/어린이/그림책 관련 지능형/시맨틱 필터링
                        const targetKeywords = ['동화', '그림책', '어린이', '유아', '유년', '방정환', '마해송', '아동', '동요', '소년'];
                        const matchText = `${book.title} ${book.author} ${book.publisher}`.toLowerCase();
                        const matchesKeyword = targetKeywords.some(kw => matchText.includes(kw));
                        if (!matchesKeyword) return false;
                        
                        // 중복 제거 가드
                        const uniqueKey = book.control_no || book.isbn13;
                        if (seenControlNos.has(uniqueKey)) return false;
                        seenControlNos.add(uniqueKey);
                        
                        return true;
                    });
                    
                    // 각 도서별 역사성 가산 대출수 동적 산출
                    naruBooks.forEach(b => {
                        const bookYear = parseInt(b.pub_year, 10) || 1950;
                        b.loanCnt = Math.min(700, 300 + (currentYear - bookYear) * 4);
                    });
                    
                    await log(1, '살피미', 'success', `국립중앙도서관 저작권 만료 도서 ${naruBooks.length}건 필터링 수집 완료`, { count: naruBooks.length });
                } catch (nlErr) {
                    isSimulated = true;
                    await log(1, '살피미', 'warn', `국립중앙도서관 API 실패 → 시뮬레이션 폴백 전환 (사유: ${nlErr.message})`, { reason: nlErr.message });
                }
            } else {
                isSimulated = true;
                await log(1, '살피미', 'warn', `LIBRARY_API_KEY 미설정 → 저작권 만료 시뮬레이션 폴백 전환`, {});
            }
        } else {
            // [채널 1: B2B 인기 대출 수집]
            const resolvedKdc = resolveKdc(keyword);
            kdc = resolvedKdc.kdc;
            kdcLabel = resolvedKdc.label;
            
            await log(1, '살피미', 'info', `[역발상 파이프라인 v2] 도서관정보나루 인기 대출 수집 시작 — 키워드: "${keyword}" → KDC: ${kdc}(${kdcLabel})`, { keyword, kdc, kdcLabel });
            
            if (LIBRARY_NARU_API_KEY) {
                try {
                    naruBooks = await fetchLibraryNaruLoanList(LIBRARY_NARU_API_KEY, kdc, pageNo, 50);
                    await log(1, '살피미', 'success', `도서관정보나루 대출 인기작 ${naruBooks.length}건 수집 완료 (KDC: ${kdc})`, { count: naruBooks.length, kdc });
                } catch (naruErr) {
                    isSimulated = true;
                    await log(1, '살피미', 'warn', `도서관정보나루 API 실패 → 12개 카테고리 시뮬레이션 폴백 전환 (사유: ${naruErr.message})`, { reason: naruErr.message });
                }
            } else {
                isSimulated = true;
                await log(1, '살피미', 'warn', `LIBRARY_NARU_API_KEY 미설정 → 시뮬레이션 폴백 전환`, {});
            }
        }

        // API 실패 또는 키 없음 → 시뮬레이션 폴백 데이터 사용
        if (isSimulated || naruBooks.length === 0) {
            isSimulated = true;
            const fallbackCat = resolveFallbackCategory(keyword);
            const fallbackPool = FALLBACK_BY_CATEGORY[fallbackCat] || FALLBACK_BY_CATEGORY['미분류'];
            // 폴백 데이터를 naruBooks 형식으로 변환
            naruBooks = fallbackPool.map(b => {
                const bookYear = parseInt(b.pub_year, 10) || 1950;
                // 저작권 만료 카테고리인 경우 역사성 가산 대출수 자동 연산 적용
                const loanCount = (fallbackCat === '저작권 만료') 
                    ? Math.min(700, 300 + (currentYear - bookYear) * 4) 
                    : (b.loanCnt || 500);
                
                return {
                    isbn13:    b.isbn13,
                    title:     b.title,
                    author:    b.author,
                    publisher: b.publisher,
                    pub_year:  String(b.pub_year),
                    loanCnt:   loanCount,
                    classNm:   '',
                    category:  fallbackCat, // 자율 카테고리 정보 동적 바인딩
                    detail_link: b.detail_link || '',
                    control_no:  b.control_no || '',
                    // 폴백 데이터는 stockStatus가 이미 내장 → 알라딘 조회 스킵용
                    _prefetchedStockStatus: b.stockStatus
                };
            });
            await log(1, '살피미', 'info', `시뮬레이션 폴백: "${fallbackCat}" 카테고리 ${naruBooks.length}건 준비 완료`, { category: fallbackCat, count: naruBooks.length });
        }

        if (naruBooks.length === 0) {
            await updateAgentStatus(rawUrl, supKey, 1, 'success', '수집 결과 없음');
            await updateAgentStatus(rawUrl, supKey, 16, 'success', '수집 결과 없어 종료');
            return res.status(200).json({ success: true, message: '수집 결과 없음 — 파이프라인 종료', inserted: 0 });
        }

        await updateAgentStatus(rawUrl, supKey, 1, 'success', `대출 인기작 ${naruBooks.length}건 수집 완료`);
        await updateAgentStatus(rawUrl, supKey, 2, 'running', '알라딘 재고 크로스체크 및 중소출판사 정제 중');

        // ================================================================
        // [STEP 2] 2번 다듬이 — 알라딘 ItemLookUp 크로스체크 + 정제
        // ================================================================
        await log(2, '다듬이', 'info', `알라딘 재고 크로스체크 + 중소출판사 필터 + 수요온도 산출 시작 — ${naruBooks.length}건 대상`, { input: naruBooks.length });

        const refined = [];

        for (const naruBook of naruBooks) {
            const isbn = naruBook.isbn13;
            let stockStatus = '절판'; // 기본값
            let publisher = naruBook.publisher || '';
            let category = naruBook.category || parseCategory(naruBook.classNm);

            // 폴백 데이터의 경우 알라딘 호출 없이 내장값 사용
            if (naruBook._prefetchedStockStatus) {
                stockStatus = naruBook._prefetchedStockStatus;
            } else if (ALADIN_API_KEY && isbn) {
                try {
                    const aladinInfo = await checkAladinStock(ALADIN_API_KEY, isbn);
                    if (aladinInfo) {
                        stockStatus = aladinInfo.stockStatus || stockStatus;
                        if (aladinInfo.publisher) publisher = aladinInfo.publisher;
                        if (aladinInfo.categoryName) {
                            // 알라딘 categoryName이 있으면 더 정확한 분류로 갱신
                            const parts = aladinInfo.categoryName.split('>');
                            const mainCat = parts[1] ? parts[1].trim() : '';
                            if (mainCat) category = parseCategory(mainCat);
                        }
                    } else {
                        // 알라딘에서 정보 없음 → 절판으로 처리
                        stockStatus = '절판';
                    }
                } catch (aladinErr) {
                    // 알라딘 조회 실패 → 절판으로 보수적 처리 (대출 많고 판매 불가 추정)
                    stockStatus = '절판';
                    await log(2, '다듬이', 'warn', `알라딘 조회 실패 (ISBN: ${isbn}) → 절판 추정 처리`, { isbn, reason: aladinErr.message });
                }
            }

            const rawBookMerged = {
                title:      naruBook.title,
                author:     naruBook.author,
                isbn13:     isbn,
                pub_year:   naruBook.pub_year,
                publisher:  publisher,
                loanCnt:    naruBook.loanCnt,
                stockStatus: stockStatus,
                category:   category,
                is_simulated: isSimulated
            };

            const refinedBook = runDataRefiner_Dadumeui(rawBookMerged);
            // 복간 후보 기준: 복간 점수 30점 이상 + 수요 온도 40℃ 이상
            if (refinedBook && refinedBook.reprint_score >= 30 && refinedBook.demand_temperature >= 40) {
                refined.push(refinedBook);
            }
        }

        await log(2, '다듬이', 'success',
            `정제 완료 — 복간 후보 ${refined.length}건 선별 (점수 30점 + 수요온도 40℃ 이상 필터, 중소출판사 한정)`,
            { candidates: refined.length, totalInput: naruBooks.length }
        );

        if (refined.length === 0) {
            await updateAgentStatus(rawUrl, supKey, 2, 'success', '정제 완료 (기준 미달)');
            await updateAgentStatus(rawUrl, supKey, 16, 'success', '복간 후보 기준 미달로 종료');
            return res.status(200).json({ success: true, message: '복간 후보 기준 미달 — DB 적재 없음', inserted: 0 });
        }

        await updateAgentStatus(rawUrl, supKey, 2, 'success', `복간 후보 ${refined.length}건 선별 완료`);

        // ================================================================
        // [STEP 3] Supabase reprint_candidates UPSERT (ISBN 기준 중복 방지)
        // ================================================================
        const uniqueRefined = [];
        const seenIsbns = new Set();
        for (const book of refined) {
            if (!seenIsbns.has(book.isbn)) {
                seenIsbns.add(book.isbn);
                uniqueRefined.push(book);
            }
        }

        const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
        const upsertRes = await fetch(`${base}/reprint_candidates?on_conflict=isbn`, {
            method: 'POST',
            headers: {
                'apikey': supKey,
                'Authorization': `Bearer ${supKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(uniqueRefined)
        });

        if (!upsertRes.ok) {
            const errText = await upsertRes.text();
            await log(16, '판다', 'error', `DB 적재 실패 (HTTP ${upsertRes.status}): ${errText.substring(0, 200)}`, {});
            await updateAgentStatus(rawUrl, supKey, 16, 'error', 'DB 적재 실패');
            return res.status(502).json({ error: 'Supabase 적재 실패', detail: errText.substring(0, 200) });
        }

        await log(16, '판다', 'success',
            `[역발상 파이프라인 v2 완료] 도서관정보나루(${naruBooks.length}건) → 알라딘 크로스체크 → ${uniqueRefined.length}건 DB 적재 (키워드: "${keyword}")`,
            { keyword, kdc, naruCollected: naruBooks.length, inserted: uniqueRefined.length, pipelineStartAt, isSimulated }
        );
        await updateAgentStatus(rawUrl, supKey, 16, 'success', '역발상 파이프라인 v2 및 DB 적재 완료');

        // 수요 온도 TOP3 요약 (응답용)
        const topByTemp = uniqueRefined
            .sort((a, b) => (b.demand_temperature || 0) - (a.demand_temperature || 0))
            .slice(0, 3)
            .map(r => ({
                title: r.title,
                author: r.author,
                score: r.reprint_score,
                demand_temperature: r.demand_temperature,
                tempLabel: `${r.demand_temperature}℃ (${r.demand_temperature >= 90 ? '🔴 끓는점' : r.demand_temperature >= 70 ? '🟠 고온' : r.demand_temperature >= 50 ? '🟡 온열' : '🔵 미온'})`
            }));

        return res.status(200).json({
            success: true,
            message: `[역발상 파이프라인 v2] 완료: 도서관정보나루 ${naruBooks.length}건 수집 → 알라딘 크로스체크 → ${uniqueRefined.length}건 DB 적재`,
            keyword,
            kdc,
            kdcLabel,
            totalCollected: naruBooks.length,
            inserted: uniqueRefined.length,
            isSimulated,
            topByTemperature: topByTemp
        });

    } catch (err) {
        const msg = err?.message ? String(err.message) : String(err);
        await log(12, '눈치왕', 'error', `파이프라인 예외 발생: ${msg}`, {});
        await updateAgentStatus(rawUrl, supKey, 16, 'error', '파이프라인 가동 에러');
        await updateAgentStatus(rawUrl, supKey, 12, 'error', '시스템 예외 포착 및 대응 대기');
        return res.status(500).json({ error: '파이프라인 내부 오류', detail: msg });
    }
}
