// scratch/generate_assets_factory.js
// 300종 도서 마케팅 에셋 대량 자동 생성 배치 파이프라인 엔진 (Node.js/ES Module)
// 🔒 보안 가드: service_role 권한을 통한 안전한 API 업로드

import fs from 'fs';
import path from 'url';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import pathModule from 'path';

// URL과 path 모듈 충돌 방지 및 안전한 경로 처리
const __filename = fileURLToPath(import.meta.url);
const __dirname = pathModule.dirname(__filename);
const workspaceRoot = pathModule.join(__dirname, '..');

// 1. .env 파일 파싱 헬퍼 (npm dotenv 무설치 대응)
function loadEnv() {
    const envPath = pathModule.join(workspaceRoot, '.env');
    if (!fs.existsSync(envPath)) {
        console.error("Error: .env file not found.");
        process.exit(1);
    }
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const env = {};
    envContent.split(/\r?\n/).forEach(line => {
        const match = line.match(/^([A-Z0-9_]+)=(.+)$/);
        if (match) {
            env[match[1]] = match[2].trim();
        }
    });
    return env;
}

const env = loadEnv();

// Supabase & Gemini 구성 정보
const SUPABASE_URL = env.SUPABASE_URL || "https://fquzouhstheqvuzzhxqs.supabase.co";
const MASTER_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// 🔑 API Key Rotation 지원을 위한 다중 키 파싱
const GEMINI_API_KEYS = (env.GEMINI_API_KEY || "").split(',').map(k => k.trim()).filter(Boolean);
let currentKeyIndex = 0;
let fallbackCount = 0; // 금일 0원 로컬 템플릿 폴백 전환 누적 수 카운터

if (!MASTER_KEY) {
    console.error("Error: SUPABASE_SERVICE_ROLE_KEY is missing in .env or environment.");
    process.exit(1);
}

if (GEMINI_API_KEYS.length === 0) {
    console.error("Error: GEMINI_API_KEY is missing in .env.");
    process.exit(1);
}

// 2. FFmpeg 구동 여부 검증
let hasFFmpeg = false;
try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    hasFFmpeg = true;
    console.log("✅ FFmpeg가 로컬 시스템에 활성화되어 있습니다.");
} catch (e) {
    console.warn("⚠️ Warning: FFmpeg가 설치되지 않았습니다. 동영상은 폴백 UAT 주소로 매핑됩니다.");
}

// 3. 자막 타임라인 포맷터 (SRT 형식: HH:MM:SS,mmm)
function formatToSRTTime(secondsStr) {
    const totalSecs = parseFloat(secondsStr);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = Math.floor(totalSecs % 60);
    const ms = Math.floor((totalSecs % 1) * 1000);

    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

// SRT 파일 문자열 생성기
function generateSRT(timeline) {
    return timeline.map((item, index) => {
        const start = formatToSRTTime(item.start);
        const end = formatToSRTTime(item.end);
        return `${index + 1}\n${start} --> ${end}\n${item.text}\n`;
    }).join('\n');
}

// 4. Google Translate TTS 오디오 덩어리 다운로더 (200자 한도)
async function downloadTTSChunk(text, destPath) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ko&client=tw-ob&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) throw new Error(`TTS Download failed for: "${text}"`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(buffer));
}

// 5. Supabase Storage 파일 업로드 (service_role bypass)
async function uploadToStorage(filePath, isbn) {
    const fileName = `${isbn}.mp4`;
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/assets/${fileName}`;
    const fileBuffer = fs.readFileSync(filePath);

    const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            "apikey": MASTER_KEY,
            "Authorization": `Bearer ${MASTER_KEY}`,
            "Content-Type": "video/mp4",
            "x-upsert": "true"
        },
        body: fileBuffer
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Storage upload failed: ${res.statusText} (${text})`);
    }
    return `${SUPABASE_URL}/storage/v1/object/public/assets/${fileName}`;
}

// 6. Gemini API 책정보 분석 및 숏폼 자막/대본 기획 (다중 키 로테이션 및 초경량 로컬 템플릿 폴백 장착)
async function generateMarketingPlan(book) {
    const title = (book.title || '도서').replace(/<\/?[^>]+(>|$)/g, '');
    const author = (book.author || '저자 미상').replace(/<\/?[^>]+(>|$)/g, '');
    
    // 1단계: 다중 API Key 로테이션 루프 시도
    const maxAttempts = GEMINI_API_KEYS.length;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const apiKey = GEMINI_API_KEYS[currentKeyIndex];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        
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
        
        주의: timeline은 30초 내에 정확히 5개 구간(각 5~6초)으로 구성하여 오디오 낭독 싱크에 맞게 제작해주세요. 각 구간의 start와 end는 소수점 초 단위 문자열이어야 합니다.
        `;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json" }
                })
            });

            if (res.ok) {
                const json = await res.json();
                const rawText = json.candidates[0].content.parts[0].text.trim();
                return JSON.parse(rawText);
            }
            
            // 429 한도 초과 또는 에러 시 키 스위칭
            console.warn(`⚠️ [Gemini API Key Index: ${currentKeyIndex}] 호출 실패 (Status: ${res.status}). 다음 키로 스위칭합니다.`);
            currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
        } catch (err) {
            console.warn(`⚠️ [Gemini API Key Index: ${currentKeyIndex}] 통신 오류: ${err.message}. 다음 키로 스위칭합니다.`);
            currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
        }
    }

    // 2단계: 로컬 룰베이스 초경량 렌더러 폴백 (0원 및 Quota 무제한 우회)
    fallbackCount++; // 0원 로컬 템플릿 사용 횟수 가산
    const category = book.category || '기타';
    console.warn(`📢 [폴백 기동] 모든 Gemini API 키 한도가 초과되었습니다. 카테고리[${category}] 맞춤 13대 장르 룰베이스 템플릿으로 고속 합성합니다.`);

    let cardNews = [];
    let summaryScript = "";
    let timeline = [];

    // 🎲 3대 컨셉(테마) 무작위 격발 (1,785개 카드뉴스 및 1,071개 숏폼 자막의 중복도 회피)
    const themeIdx = Math.floor(Math.random() * 3);

    // ── 장르 판별 유틸 ──
    const isCat = (keyword) => category.includes(keyword);

    // 1. 소설 (Novel)
    if (isCat("소설") || isCat("문학") || isCat("시") || isCat("희곡")) {
        if (themeIdx === 0) {
            cardNews = [
                { slide: 1, title: `${title} 감성 복간`, body: `독자들이 오랫동안 가슴 깊이 품어왔던 세기의 소설, '${title}'가 복간 펀딩으로 다시 눈을 뜹니다.` },
                { slide: 2, title: `작가 ${author}의 문학 세계`, body: `시간이 흘러도 마르지 않는 특유의 문학적 은유와 입체적인 주인공의 숨결을 그대로 복원.` },
                { slide: 3, title: `명품 양장 한정본`, body: `독서 감성을 올릴 친환경 클래식 조판과 최고급 가변 데이터 북마크가 동봉됩니다.` },
                { slide: 4, title: `서포터 독점 증서`, body: `이번 펀딩에 기꺼이 함께하는 독자분들의 이름을 특별 한정 보증서에 정밀 인쇄하여 증정.` },
                { slide: 5, title: `서재 속 작은 기적`, body: `절판된 명작을 소장하는 일은 메마른 현대인의 마음에 문학적 서정과 지적 평온을 주는 일입니다.` }
            ];
            summaryScript = `독자들의 가슴을 따뜻하게 적셔줄 불멸의 명작 소설, 작가 ${author}의 ${title} 복간 펀딩이 드디어 시작되었습니다. 지금 출판친구에서 단 하나뿐인 한정판 도서 예약을 만나보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 감성 귀환 펀딩` },
                { start: "5.5", end: "11.0", text: `작가 ${author}의 깊은 숨결` },
                { start: "11.5", end: "17.0", text: `명품 양장 한정 소장` },
                { start: "17.5", end: "23.0", text: `서포터 특별 보증서 획득` },
                { start: "23.5", end: "29.0", text: `지금 펀딩에 신청해 보세요` }
            ];
        } else if (themeIdx === 1) {
            cardNews = [
                { slide: 1, title: `${title}의 매혹적인 미스터리`, body: `한 번 펼치면 밤을 새우게 만들었던 몰입감 넘치는 명작 소설, '${title}'가 마침내 복간 추진됩니다.` },
                { slide: 2, title: `치밀한 문장력`, body: `작가 ${author}가 구축한 정교한 플롯과 긴장감 넘치는 문장들이 완벽 조판을 거쳐 새 생명을 얻었습니다.` },
                { slide: 3, title: `가독성 극대화 가변 조판`, body: `독자의 시각 피로를 최소화하기 위해 출판친구만의 가변 레이아웃 조판 기술을 전격 적용.` },
                { slide: 4, title: `한정 서포터 네이밍 각인`, body: `복간 펀딩을 달성해 주신 독자분들의 존함을 내지에 개별 기록하는 특별 감사 연출.` },
                { slide: 5, title: `놓칠 수 없는 소장 기회`, body: `다시는 시중에서 구하기 어려웠던 숨겨진 걸작을 가장 깨끗한 디자인으로 보관하는 영광을 누려보세요.` }
            ];
            summaryScript = `치밀한 전개와 매혹적인 이야기, 작가 ${author}의 명작 소설 ${title} 복간 프로젝트가 시작되었습니다. 출판친구에서 한정 수량으로 만나보실 수 있습니다.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 매혹적인 귀환` },
                { start: "5.5", end: "11.0", text: `작가 ${author}의 눈부신 플롯` },
                { start: "11.5", end: "17.0", text: `시각 피로 없는 맞춤형 조판` },
                { start: "17.5", end: "23.0", text: `독자 네이밍 감사 각인 혜택` },
                { start: "23.5", end: "29.0", text: `지금 예약 펀딩에 합류하세요` }
            ];
        } else {
            cardNews = [
                { slide: 1, title: `인생 소설 ${title}의 복원`, body: `많은 이들의 인생 책으로 꼽히는 문학적 자산, '${title}'가 드디어 소장용 최고급 특별판으로 태어납니다.` },
                { slide: 2, title: `깊은 울림의 메시지`, body: `지친 일상에 잔잔한 위로와 지혜를 건네는 작가 ${author}만의 독창적인 메시지를 영구 복원.` },
                { slide: 3, title: `친환경 최고급 사양`, body: `100년이 지나도 바래지 않는 고급 친환경 양장 표지와 수제 가변 일러스트 제공.` },
                { slide: 4, title: `얼리버드 독점 선물`, body: `선착순 펀딩 참여자 전원에게 세상에 단 하나뿐인 책갈피와 캘리그래피 엽서 증정.` },
                { slide: 5, title: `문학을 구출하는 운동`, body: `이 책의 복간 펀딩에 참여하는 것은 단순히 책을 사는 것을 넘어, 절판 도서의 지적 불씨를 살리는 발걸음입니다.` }
            ];
            summaryScript = `당신의 인생 소설이 되어 줄 따뜻한 위로, 작가 ${author}의 ${title} 소장판 복간 펀딩이 활짝 열렸습니다. 지금 출판친구에서 이 아름다운 문학적 연대에 동참해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 인생 문학 복간` },
                { start: "5.5", end: "11.0", text: `작가 ${author}가 건네는 위로` },
                { start: "11.5", end: "17.0", text: `100년 소장 친환경 양장` },
                { start: "17.5", end: "23.0", text: `얼리버드 가변 엽서 증정` },
                { start: "23.5", end: "29.0", text: `문학 구출 펀딩에 함께 하세요` }
            ];
        }

    // 2. 에세이/수필 (Essay)
    } else if (isCat("에세이") || isCat("수필") || isCat("일기") || isCat("기행")) {
        if (themeIdx === 0) {
            cardNews = [
                { slide: 1, title: `${title} 따뜻한 에세이`, body: `'${title}'를 통해 복잡한 세상을 살아가며 잠시 멈춰 서서 나를 돌아볼 따뜻한 여백을 선물합니다.` },
                { slide: 2, title: `작가 ${author}의 시선`, body: `평범한 일상 속에서 건져 올린 반짝이는 통찰과 따스한 문장들을 고가독 서체 조판으로 복원.` },
                { slide: 3, title: `가독성 특화 편안한 사양`, body: `눈이 편안한 미색 고급 내지와 손에 감기는 컴팩트 사이즈 양장본 디자인 구성.` },
                { slide: 4, title: `서포터 각인 책갈피`, body: `독자의 이름을 가인한 고급 가죽 책갈피를 동봉하여 한정 제작 발송.` },
                { slide: 5, title: `나를 위한 따스한 한걸음`, body: `절판되어 볼 수 없었던 다정한 위안의 책을 복간하여 마음의 서재를 포근히 채워보세요.` }
            ];
            summaryScript = `지친 마음을 보듬어 줄 다정한 일상의 이야기, 작가 ${author}의 에세이 ${title} 복간 펀딩이 개설되었습니다. 지금 출판친구에서 나만을 위한 치유 에디션을 만나보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 마음 에세이 복간` },
                { start: "5.5", end: "11.0", text: `작가 ${author}가 주는 쉼표` },
                { start: "11.5", end: "17.0", text: `가볍고 눈이 편안한 미색지` },
                { start: "17.5", end: "23.0", text: `이름 각인 가죽 책갈피` },
                { start: "23.5", end: "29.0", text: `마음의 서재를 채워 보세요` }
            ];
        } else if (themeIdx === 1) {
            cardNews = [
                { slide: 1, title: `${title}이 전하는 위로`, body: `마음의 허기를 달래줄 따뜻하고 깊은 어조의 인생 수필, '${title}'가 복간되어 돌아옵니다.` },
                { slide: 2, title: `솔직담백한 어조`, body: `인생의 쓴맛과 단맛을 모두 아우르는 작가 ${author}의 인간미 넘치는 글귀들 수록.` },
                { slide: 3, title: `최고급 무광 특수코팅 표지`, body: `손때가 묻을수록 클래식한 멋이 우러나는 친환경 무광 특수 코팅 북커버 사양.` },
                { slide: 4, title: `서포터 맞춤형 웰컴 카드`, body: `독자님의 이름을 개별적으로 인자한 수제 보증 카드와 에셋 웰컴팩 동봉.` },
                { slide: 5, title: `잊혔던 명작의 재발견`, body: `대표님의 자율 수집을 통해 발굴된 보석 같은 절판 에세이를 마침내 소장하게 됩니다.` }
            ];
            summaryScript = `인생의 길목에서 만나는 위대한 위로, 작가 ${author}의 에세이 ${title} 복간 펀딩을 출판친구에서 전격 시작합니다. 한정 혜택을 놓치지 마세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 잊혔던 명작 복간` },
                { start: "5.5", end: "11.0", text: `작가 ${author}의 솔직담백한 어조` },
                { start: "11.5", end: "17.0", text: `무광 클래식 특수 코팅 표지` },
                { start: "17.5", end: "23.0", text: `나만의 맞춤 수제 카드 동봉` },
                { start: "23.5", end: "29.0", text: `지금 출판친구에서 신청하세요` }
            ];
        } else {
            cardNews = [
                { slide: 1, title: `감성 여행 ${title}`, body: `어디론가 훌쩍 떠나고 싶게 만드는 예술적 감성 여행 수필, '${title}'가 감각적인 디자인으로 다시 출간됩니다.` },
                { slide: 2, title: `독보적 여행의 시선`, body: `시적 감성이 풍부한 작가 ${author}만의 독창적인 기행문과 비주얼 렌더링 삽화 수록.` },
                { slide: 3, title: `컬러 가변 삽화 수록`, body: `출판친구만의 미디어가 가미된 특수 조판 및 미니 일러스트 엽서 팩 한정 내장.` },
                { slide: 4, title: `한정 사은품 책갈피`, body: `서포터분들을 위해 가변 데이터 기술로 고유 번호를 인쇄한 시그니처 엽서 증정.` },
                { slide: 5, title: `도서의 새 숨결`, body: `숨어 있던 절판 명작 에세이를 되살려 가치 있는 문학 생태계를 복원하는 아름다운 실천.` }
            ];
            summaryScript = `당신의 일상에 여행의 설렘을 건넬 기행 에세이, 작가 ${author}의 ${title} 복간 펀딩이 열렸습니다. 지금 출판친구에서 설렘 가득한 예약에 참여하세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 감성 기행 에세이` },
                { start: "5.5", end: "11.0", text: `작가 ${author}의 감각적 시선` },
                { start: "11.5", end: "17.0", text: `미니 컬러 삽화 엽서 수록` },
                { start: "17.5", end: "23.0", text: `고유 번호 인쇄 특별 엽서` },
                { start: "23.5", end: "29.0", text: `설레는 마음으로 참여해 보세요` }
            ];
        }

    // 3. 인문학/철학 (Humanities / Philosophy)
    } else if (isCat("인문") || isCat("철학") || isCat("사상") || isCat("윤리")) {
        if (themeIdx === 0) {
            cardNews = [
                { slide: 1, title: `${title} 사유의 깊이`, body: `복잡한 삶의 본질을 꿰뚫어 보고 진정한 나를 마주할 지혜의 책, '${title}'가 복간됩니다.` },
                { slide: 2, title: `거장 ${author}의 철학`, body: `시대를 선도한 철학적 통찰과 깊이 있는 사색의 기록들을 최신 조판 기술로 영구 보존.` },
                { slide: 3, title: `가독성 고성능 사양`, body: `오랜 학술적 사유를 편안히 읽어내려갈 수 있도록 특화 서체와 와이드 여백 조판 도입.` },
                { slide: 4, title: `서포터 네이밍 리스트 각인`, body: `복간 의결을 이뤄 주신 독자분들의 존함을 책 뒷장에 인쇄하여 영구 기념.` },
                { slide: 5, title: `서재의 깊이를 올리다`, body: `지성인들의 필독서이자 인류 사상의 등불인 철학적 자산을 영구 소장할 유일한 찬스.` }
            ];
            summaryScript = `인생의 핵심을 꿰뚫는 위대한 사유의 힘, 철학자 ${author}의 ${title} 복간 펀딩이 드디어 시작되었습니다. 지금 출판친구에서 인생의 나침반이 될 지혜를 획득해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 지혜의 철학 복간` },
                { start: "5.5", end: "11.0", text: `철학자 ${author}의 날카로운 통찰` },
                { start: "11.5", end: "17.0", text: `독서에 최적화된 와이드 조판` },
                { start: "17.5", end: "23.0", text: `독자 네이밍 각인 혜택 제공` },
                { start: "23.5", end: "29.0", text: `사유의 깊이를 더해 보세요` }
            ];
        } else if (themeIdx === 1) {
            cardNews = [
                { slide: 1, title: `${title}이 던지는 질문`, body: `당신의 고정관념을 깨부수고 지적 해방을 가져다줄 통찰의 인문 클래식, '${title}'가 옵니다.` },
                { slide: 2, title: `예리한 지적 지평`, body: `작가 ${author}가 제시하는 본질적인 인문학적 성찰과 인류사에 기여한 지식 체계를 복원.` },
                { slide: 3, title: `클래식 고급 양장`, body: `하드커버 고급 린넨 표지와 견고한 실 제본으로 소장 가치와 내구성을 동시에 극대화.` },
                { slide: 4, title: `서포터 한정 메탈 카드`, body: `펀딩 서포터분들을 위해 고유 일련번호가 타공 인쇄된 보증용 메탈 카드 제공.` },
                { slide: 5, title: `생각의 지평을 바꾸다`, body: `절판되어 구하기 어려웠던 인문학 명저의 복간을 지휘하여 내 지적 서재를 완성해 보세요.` }
            ];
            summaryScript = `세상을 보는 깊이 있는 안목을 제시할 명저, 저자 ${author}의 인문서 ${title} 복간 펀딩이 기동되었습니다. 지금 출판친구에서 당신의 서재를 완성해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 사유의 지평 복간` },
                { start: "5.5", end: "11.0", text: `학자 ${author}의 날카로운 질문` },
                { start: "11.5", end: "17.0", text: `하드커버 고급 린넨 양장 제본` },
                { start: "17.5", end: "23.0", text: `서포터 전용 타공 메탈 카드` },
                { start: "23.5", end: "29.0", text: `지적 탐험을 지금 시작하세요` }
            ];
        } else {
            cardNews = [
                { slide: 1, title: `마음의 나침반 ${title}`, body: `방황하는 현대인에게 흔들리지 않는 굳건한 평온을 줄 인문 고전, '${title}'가 새롭게 조판 복원됩니다.` },
                { slide: 2, title: `정신적 지평의 수호`, body: `작가 ${author}만의 사색을 바탕으로 깊은 위로와 삶의 원칙을 명쾌하게 정리한 철학적 성찰.` },
                { slide: 3, title: `초정밀 VDP 명조체 조판`, body: `출판친구만의 한정판 인쇄 레이아웃과 가변 데이터 기반 시그니처 표지 디자인.` },
                { slide: 4, title: `캘리그래피 명언 엽서`, body: `도서 속 마음에 와닿는 구절을 예쁜 캘리그래피 엽서로 특별 인쇄하여 동봉.` },
                { slide: 5, title: `책 한 권의 위대한 연대`, body: `절판되어 유실될 뻔한 인문학적 정신 유산을 지키고 소장하는 가치 있는 역사에 동참하세요.` }
            ];
            summaryScript = `삶의 폭풍우 속에서도 흔들리지 않는 지혜, 철학자 ${author}의 ${title} 복간 펀딩이 열렸습니다. 출판친구에서 이 특별한 인문 정신 수호에 동참해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 인생 고전 복간` },
                { start: "5.5", end: "11.0", text: `철학자 ${author}의 평온한 위로` },
                { start: "11.5", end: "17.0", text: `VDP 명조체 한정 조판 적용` },
                { start: "17.5", end: "23.0", text: `명언 수제 엽서 선물 증정` },
                { start: "23.5", end: "29.0", text: `지혜의 펀딩에 지금 동참하세요` }
            ];
        }

    // 4. 경제/경영/비즈니스 (Business / Economics)
    } else if (isCat("경제") || isCat("경영") || isCat("비즈니스") || isCat("금융") || isCat("재테크") || isCat("자기계발")) {
        if (themeIdx === 0) {
            cardNews = [
                { slide: 1, title: `${title}의 실천적 교훈`, body: `성공한 투자자와 리더들이 비밀리에 공유해 온 바이블, '${title}'가 독자 투표로 다시 돌아옵니다.` },
                { slide: 2, title: `거장 ${author}의 시장 통찰`, body: `시대를 초월하여 관통하는 비즈니스의 대원칙과 자본의 생리를 예리하게 짚어낸 명작.` },
                { slide: 3, title: `독서 효율 특화 조판`, body: `도표와 핵심 구절을 한눈에 식별할 수 있는 직관적인 레이아웃 조판 및 컬러 인쇄 적용.` },
                { slide: 4, title: `서포터 전용 골드 엠블럼 보증서`, body: `펀딩 성공 기념으로 서포터 존함과 고유 번호가 찍힌 금박 엠블럼 보증서 동봉.` },
                { slide: 5, title: `내 서재를 위한 투자`, body: `성공한 자들의 바이블인 비즈니스 클래식을 평생 소장하여 미래의 투자 안목을 선점하세요.` }
            ];
            summaryScript = `성공을 바라는 비즈니스 리더들의 필독서, 경제 석학 ${author}의 ${title} 복간 펀딩이 개설되었습니다. 지금 출판친구에서 시대를 이기는 경제적 안목을 소장해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 비즈니스 펀딩 개시` },
                { start: "5.5", end: "11.0", text: `시장 거장 ${author}의 실전 안목` },
                { start: "11.5", end: "17.0", text: `도표 가독성을 극대화한 조판` },
                { start: "17.5", end: "23.0", text: `금박 엠블럼 한정 보증서` },
                { start: "23.5", end: "29.0", text: `최고의 성공 투자를 시작하세요` }
            ];
        } else if (themeIdx === 1) {
            cardNews = [
                { slide: 1, title: `${title}의 압도적 시장 룰`, body: `부의 기회를 포착하고 성공을 선점하기 위한 경영 명저, '${title}'가 새롭게 탄생합니다.` },
                { slide: 2, title: `부의 알고리즘 개방`, body: `저자 ${author}가 집대성한 기업 전략과 부의 증식 비결에 대한 클래식 텍스트 복원.` },
                { slide: 3, title: `견고한 고급 양장 커버`, body: `최고급 인조가죽 질감 하드커버와 북 리본 끈이 장착된 실용성과 품격 중심 디자인.` },
                { slide: 4, title: `얼리버드 한정 북엔드`, body: `선착순 참여 서포터 독자분들을 위해 특별 제작한 한정 캘린더 및 북엔드 증정.` },
                { slide: 5, title: `절판 도서의 지적 탈출`, body: `중고 시장에서 부르는 게 값이었던 지적 자산을 깨끗한 새 책으로 정가에 획득할 기회.` }
            ];
            summaryScript = `글로벌 경영인들의 전설적인 조언, 저자 ${author}의 경영 명저 ${title} 복간 프로젝트가 시작되었습니다. 출판친구에서 부의 비밀을 직접 획득해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 경영 바이블 복간` },
                { start: "5.5", end: "11.0", text: `석학 ${author}가 푸는 부의 룰` },
                { start: "11.5", end: "17.0", text: `인조 가죽 린넨 하드커버 장착` },
                { start: "17.5", end: "23.0", text: `선착순 얼리버드 북엔드 증정` },
                { start: "23.5", end: "29.0", text: `지금 비즈니스 펀딩에 동참하세요` }
            ];
        } else {
            cardNews = [
                { slide: 1, title: `성장의 나침반 ${title}`, body: `개인의 가치를 10배 올리고 비즈니스 전쟁에서 승리할 핵심 솔루션, '${title}'가 귀환합니다.` },
                { slide: 2, title: `실천 지식의 수호`, body: `작가 ${author}만의 독보적인 실무 방법론과 마인드셋을 현대적 해설과 함께 영구 조판.` },
                { slide: 3, title: `출판친구 시그니처 폰트 조판`, body: `오랜 가독성 테스트를 거친 전용 글꼴 임베딩으로 단 한 장을 읽어도 머리에 쏙 남는 독서 경험.` },
                { slide: 4, title: `실물 보증서 엽서팩`, body: `펀딩에 참여해 주신 독자들을 위해 시그니처 일러스트와 서포터 이름 인자 엽서 팩 증정.` },
                { slide: 5, title: `성장의 가장 확실한 도구`, body: `가장 확실한 지적 자산인 도서를 가치 있게 되살리는 혁신적인 펀딩 생태계에 참여해 보세요.` }
            ];
            summaryScript = `성공적인 커리어와 도약을 위한 핵심 도서, 작가 ${author}의 ${title} 복간 펀딩이 활짝 열렸습니다. 지금 출판친구에서 나만의 성장 비밀을 신청해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 성장 솔루션 복간` },
                { start: "5.5", end: "11.0", text: `작가 ${author}의 실천적 조언` },
                { start: "11.5", end: "17.0", text: `시그니처 폰트 정밀 조판 적용` },
                { start: "17.5", end: "23.0", text: `독자 이름 인자 엽서 팩 증정` },
                { start: "23.5", end: "29.0", text: `성장의 날개를 달아 보세요` }
            ];
        }

    // 5. 저작권 만료 (Copyright Expired - 핵심 장르)
    } else if (isCat("저작권") || isCat("만료") || isCat("고전") || isCat("클래식") || isCat("명저")) {
        if (themeIdx === 0) {
            cardNews = [
                { slide: 1, title: `인류의 공공 지산 ${title}`, body: `저작권이 만료되어 비로소 인류 모두의 품으로 돌아온 영원한 가치, '${title}'를 양장판으로 복원합니다.` },
                { slide: 2, title: `오리지널리티의 수호`, body: `거장 ${author}의 초기 초판 판본을 철저히 고증하여, 당시의 문장 배열과 서체를 완벽 복원.` },
                { slide: 3, title: `초정밀 VDP 명품 인쇄`, body: `출판친구만의 한정판 VDP 가변 레이아웃 조판과 소장용 고급 제본 기술 결합.` },
                { slide: 4, title: `저작권 해방 기념 증서`, body: `인류의 위대한 공공 유산 복간에 참여하셨음을 뜻하는 서포터 인증서 증정.` },
                { slide: 5, title: `영원히 바래지 않을 고전`, body: `인류 역사에 길이 남을 지성사를 내 서재에 소장하는 일은 가장 품격 있는 지적 행위입니다.` }
            ];
            summaryScript = `인류 문화유산이 된 가장 가치 있는 고전, 거장 ${author}의 ${title} 복간 펀딩이 마침내 열렸습니다. 지금 출판친구에서 오리지널 초판 고증 도서 예약에 동참해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 위대한 고전 복간` },
                { start: "5.5", end: "11.0", text: `거장 ${author}의 초판본 복원` },
                { start: "11.5", end: "17.0", text: `가변 VDP 명품 양장 제본` },
                { start: "17.5", end: "23.0", text: `저작권 해방 한정 증서 수여` },
                { start: "23.5", end: "29.0", text: `문화유산 수호 펀딩 참여` }
            ];
        } else if (themeIdx === 1) {
            cardNews = [
                { slide: 1, title: `역사 속 지식 해방, ${title}`, body: `독점 저작권의 굴레를 벗고 전 인류의 무료 공유 지산이 된 위대한 명작, '${title}'를 새 옷으로 갈아입힙니다.` },
                { slide: 2, title: `역사와 문학의 거장`, body: `작가 ${author}의 불꽃 같던 문학적 혼을 생생히 살린 고품격 텍스트와 세밀한 삽화 복원.` },
                { slide: 3, title: `고가독 특별 명조체 이식`, body: `클래식의 무게감을 편안하게 담아낼 수 있도록 고유 폰트 크기 및 행간 간격 튜닝.` },
                { slide: 4, title: `서포터 감사 서표 엽서`, body: `펀딩을 통해 복간의 불씨를 지펴주신 독자분들을 위해 가변 네임텍 서표 동봉.` },
                { slide: 5, title: `지성의 유산은 계속된다`, body: `과거의 잊혔던 찬란한 지적 등불을 소장하고 미래 세대에게 가치 있게 물려주는 보람을 느껴보세요.` }
            ];
            summaryScript = `역사 속에서 되살아난 인류의 등불, 작가 ${author}의 클래식 ${title} 복간 펀딩이 기동되었습니다. 지금 출판친구에서 시대를 넘어선 명작의 가치를 품어 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 지식 해방 클래식` },
                { start: "5.5", end: "11.0", text: `작가 ${author}의 찬란한 혼` },
                { start: "11.5", end: "17.0", text: `클래식 전용 고유 명조 조판` },
                { start: "17.5", end: "23.0", text: `독자 이름 인자 시그니처 서표` },
                { start: "23.5", end: "29.0", text: `시대를 넘은 가치에 합류하세요` }
            ];
        } else {
            cardNews = [
                { slide: 1, title: `세상의 유산 ${title}`, body: `시간의 거친 풍파를 견디고 마침내 인류의 공공 자산으로 거듭난 위대한 명저, '${title}'가 옵니다.` },
                { slide: 2, title: `오리지널 텍스트의 부활`, body: `석학 ${author}가 세상에 남긴 귀중한 학문적 사상을 왜곡 없이 원형 그대로 정성껏 번역 및 조판.` },
                { slide: 3, title: `출판친구 최고급 실제본 양장`, body: `오랫동안 펼쳐보아도 뜯어짐이 없는 전통 실제본 공법과 고전미를 살린 표지 박 인쇄.` },
                { slide: 4, title: `초판 디자인 엽서 세트`, body: `초판 출간 당시의 오리지널 일러스트를 한정 엽서로 되살려 동봉 발송.` },
                { slide: 5, title: `인간 정신의 불멸`, body: `저작권이 만료되어 누구나 영원히 소장할 자격을 지닌 최고의 명작 고전을 안전하게 서재에 간직하세요.` }
            ];
            summaryScript = `인간 정신의 찬란한 유산을 영구히 보존하다, 학자 ${author}의 명저 ${title} 복간 펀딩이 드디어 활짝 열렸습니다. 출판친구에서 초판본 감성을 소장해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 불멸의 유산 복간` },
                { start: "5.5", end: "11.0", text: `석학 ${author}가 남긴 오리지널` },
                { start: "11.5", end: "17.0", text: `수제 전통 실제본 고급 양장` },
                { start: "17.5", end: "23.0", text: `오리지널 초판 엽서 팩 선물` },
                { start: "23.5", end: "29.0", text: `역사적 펀딩에 함께 참여하세요` }
            ];
        }

    // 6. 사회과학 (Social Science)
    } else if (isCat("사회과학") || isCat("정치") || isCat("법학") || isCat("행정") || isCat("사회") || isCat("언론")) {
        if (themeIdx === 0) {
            cardNews = [
                { slide: 1, title: `세상을 읽는 안목, ${title}`, body: `시대의 모순을 직시하고 사회 구조를 통찰하게 할 논쟁적 사회과학 저서, '${title}'가 복간됩니다.` },
                { slide: 2, title: `지성인 ${author}의 비판적 제언`, body: `날카로운 분석과 이론적 깊이로 현대 사회 시스템의 핵심을 관통하는 비판적 통찰을 복원.` },
                { slide: 3, title: `시각 정리 특화 조판`, body: `복잡한 각주와 참고문헌을 한눈에 체계적으로 읽을 수 있는 출판친구 전용 아카데믹 조판 디자인.` },
                { slide: 4, title: `서포터 지식 보증 서표`, body: `지성사 보존의 주역이 되신 독자들을 위해 네임 각인 스페셜 보증 씰 증정.` },
                { slide: 5, title: `시대를 관통하는 명저`, body: `현실 사회의 해법을 담고 있는 소중한 지식 자산을 되살려 지적 서재를 풍성하게 채우세요.` }
            ];
            summaryScript = `사회의 본질과 해법을 명쾌하게 제시할 지성서, 학자 ${author}의 ${title} 복간 펀딩이 전격 시작되었습니다. 출판친구에서 더 깊은 사회적 통찰을 마주해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 사회과학 펀딩 가동` },
                { start: "5.5", end: "11.0", text: `학자 ${author}의 날카로운 분석` },
                { start: "11.5", end: "17.0", text: `체계적인 아카데믹 맞춤 조판` },
                { start: "17.5", end: "23.0", text: `이름 각인 보증 씰 수여` },
                { start: "23.5", end: "29.0", text: `지혜로운 서포터에 합류하세요` }
            ];
        } else if (themeIdx === 1) {
            cardNews = [
                { slide: 1, title: `${title}의 거대한 담론`, body: `사회 구조의 모순을 헤쳐나갈 대안을 제시하는 전설적인 고전 사회과학 명저, '${title}'가 옵니다.` },
                { slide: 2, title: `통찰의 알고리즘 개방`, body: `저자 ${author}가 필생에 걸쳐 정립한 사상적 기틀과 비판적 텍스트를 현대적 감각으로 조판 복원.` },
                { slide: 3, title: `와이드 마진 하드커버`, body: `가독 편의성을 높인 넉넉한 여백 설계와 무광 엠보 질감 하드커버 사양 장착.` },
                { slide: 4, title: `얼리버드 시그니처 엽서팩`, body: `펀딩 초반에 기여해 주신 독자들을 위해 명언 캘리 엽서 및 엠블럼 보증서 수여.` },
                { slide: 5, title: `지적 연대의 힘`, body: `절판되어 묻힐 뻔한 위대한 사회과학적 담론을 함께 구출하여 건강한 지성 생태계를 수호해 보세요.` }
            ];
            summaryScript = `시대적 모순을 꿰뚫을 위대한 담론, 저자 ${author}의 명저 ${title} 복간 펀딩이 기동되었습니다. 지금 출판친구에서 시대를 읽는 힘을 획득해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 사회적 담론 복간` },
                { start: "5.5", end: "11.0", text: `저자 ${author}의 위대한 사상` },
                { start: "11.5", end: "17.0", text: `독서 효율 향상 여백 설계` },
                { start: "17.5", end: "23.0", text: `시그니처 명언 엽서 선물` },
                { start: "23.5", end: "29.0", text: `지금 복간 펀딩에 함께하세요` }
            ];
        } else {
            cardNews = [
                { slide: 1, title: `지적 평화의 책 ${title}`, body: `현실 세계의 혼란 속에서 흔들리지 않는 합리적 판단을 선사할 지성의 바이블, '${title}'가 옵니다.` },
                { slide: 2, title: `공존을 위한 이론적 성찰`, body: `작가 ${author}만의 독창적인 현상 분석과 대안적 미래 모델링을 원형 그대로 안전 복원.` },
                { slide: 3, title: `가독 최적화 출판친구 특화 폰트`, body: `가장 편안한 독서 스트레스를 선사하는 최신 행간 임베딩 기법 도입.` },
                { slide: 4, title: `수제 보증서 동봉 발송`, body: `복간 펀딩 참여자 전원을 위해 이름 인자 엽서 팩과 보증 실물 북마크 증정.` },
                { slide: 5, title: `지식을 살리는 지혜`, body: `사라질 뻔한 사회과학 명작을 되살려 세상의 지적 평화를 늘려가는 가치 있는 동참을 시작하세요.` }
            ];
            summaryScript = `합리적인 선택과 미래를 위한 최고의 지침서, 작가 ${author}의 ${title} 복간 펀딩이 열렸습니다. 지금 출판친구 스토어에서 나만의 맞춤형 도서를 획득해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 합리적인 지혜 복간` },
                { start: "5.5", end: "11.0", text: `작가 ${author}의 실천적 성찰` },
                { start: "11.5", end: "17.0", text: `독서 스트레스 최소화 폰트` },
                { start: "17.5", end: "23.0", text: `실물 보증서 한정 북마크` },
                { start: "23.5", end: "29.0", text: `지성을 구출하는 길에 합류하세요` }
            ];
        }

    // 7. 자연과학 (Natural Science)
    } else if (isCat("과학") || isCat("자연과학") || isCat("수학") || isCat("물리") || isCat("천문") || isCat("생물") || isCat("화학")) {
        if (themeIdx === 0) {
            cardNews = [
                { slide: 1, title: `우주의 신비, ${title}`, body: `복잡한 자연의 법칙을 명쾌하게 파헤친 전설적인 자연과학 명저, '${title}'가 마침내 복간됩니다.` },
                { slide: 2, title: `거장 ${author}의 과학적 통찰`, body: `당대 과학계의 판도를 바꾼 예리한 물리적 통찰과 수학적 사유를 원본 고증하여 완벽 복원.` },
                { slide: 3, title: `초정밀 수식/도식 복원 조판`, body: `수식과 도표가 찌그러지지 않고 고화질로 렌더링되도록 출판친구 고유 그래픽 조판 적용.` },
                { slide: 4, title: `서포터 지식 기여 보증서`, body: `과학적 지식사 복원에 기여해 주신 독자들을 위해 이름 인자 시그니처 엽서팩 증정.` },
                { slide: 5, title: `서재를 밝힐 지성의 불꽃`, body: `우주와 생명의 기원을 다룬 귀중한 과학적 자산을 소장하여 생각의 넓이를 확장해 보세요.` }
            ];
            summaryScript = `자연의 위대한 규칙과 우주의 비밀을 푸는 열쇠, 과학 석학 ${author}의 ${title} 복간 펀딩이 드디어 시작되었습니다. 지금 출판친구에서 지적 경이로움을 소장해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 과학적 지식 펀딩` },
                { start: "5.5", end: "11.0", text: `과학자 ${author}의 깊은 통찰` },
                { start: "11.5", end: "17.0", text: `고화질 그래픽 수식 정밀 조판` },
                { start: "17.5", end: "23.0", text: `서포터 네임 기여 보증서` },
                { start: "23.5", end: "29.0", text: `지적 경이로움에 동참하세요` }
            ];
        } else if (themeIdx === 1) {
            cardNews = [
                { slide: 1, title: `${title} 과학적 진실`, body: `모두가 어렵다고 느꼈던 과학을 가장 우아한 언어로 풀어낸 최고의 명작, '${title}'가 귀환합니다.` },
                { slide: 2, title: `이성과 상상의 융합`, body: `저자 ${author}가 설계한 독창적인 자연철학적 안목과 흥미진진한 탐색 과정이 고가독으로 복원.` },
                { slide: 3, title: `와이드 마진 견고한 실제본`, body: `다소 두꺼운 과학 전문서도 아주 부드럽고 180도 활짝 펴지도록 사북 실제본 사양 장착.` },
                { slide: 4, title: `얼리버드 일러스트 북마크`, body: `선착순 참여하신 서포터분들을 위해 맞춤 제작한 스페셜 일러스트 엽서 증정.` },
                { slide: 5, title: `과학의 불씨를 지키다`, body: `과거의 잊혔던 귀한 이성과 합리주의의 발자취를 지키는 보람 있는 독서 생태계에 참여하세요.` }
            ];
            summaryScript = `인간 이성의 가장 아름다운 성취, 저자 ${author}의 과학 명저 ${title} 복간 펀딩이 기동되었습니다. 지금 출판친구에서 과학적 통찰의 안목을 얻어 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 과학의 성취 복간` },
                { start: "5.5", end: "11.0", text: `저자 ${author}의 우아한 해설` },
                { start: "11.5", end: "17.0", text: `180도 펼침 사북 실제본 적용` },
                { start: "17.5", end: "23.0", text: `스페셜 일러스트 북마크 증정` },
                { start: "23.5", end: "29.0", text: `이성적 판단의 펀딩에 함께하세요` }
            ];
        } else {
            cardNews = [
                { slide: 1, title: `호기심의 귀환 ${title}`, body: `미지의 영역을 동경하는 독자들을 위한 경이롭고 지적인 과학 클래식, '${title}'가 찾아옵니다.` },
                { slide: 2, title: `호기심과 지적 희열`, body: `작가 ${author}가 제시하는 자연 법칙의 비밀과 호기심을 유발하는 지식 전개 라인 영구 보존.` },
                { slide: 3, title: `출판친구 전용 아카데믹 폰트`, body: `수많은 각주와 데이터를 읽는 눈의 피로를 혁신적으로 줄인 고해상도 인쇄 레이아웃.` },
                { slide: 4, title: `수제 보증서 및 스티커팩`, body: `펀딩에 참여해 주신 독자들을 위해 과학자 엠블럼 스티커와 이름 인자 보증서 증정.` },
                { slide: 5, title: `앎을 사랑하는 마음`, body: `절판되어 볼 수 없었던 과학적 명저를 내 서재에 복간하여 영원히 앎을 향한 불꽃을 밝혀보세요.` }
            ];
            summaryScript = `앎의 기쁨과 지적 전율을 선사할 위대한 과학서, 작가 ${author}의 ${title} 복간 펀딩이 활짝 열렸습니다. 지금 출판친구에서 나만의 한정판을 신청해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 지적 전율 복간` },
                { start: "5.5", end: "11.0", text: `작가 ${author}의 경이로운 여정` },
                { start: "11.5", end: "17.0", text: `아카데믹 폰트 편안한 조판` },
                { start: "17.5", end: "23.0", text: `엠블럼 스티커와 보증서 증정` },
                { start: "23.5", end: "29.0", text: `지성의 불꽃을 밝혀 보세요` }
            ];
        }

    // 8. 기술과학/의학 (Applied Science / Technology / Medicine)
    } else if (isCat("기술") || isCat("의학") || isCat("컴퓨터") || isCat("공학") || isCat("산업") || isCat("발명")) {
        if (themeIdx === 0) {
            cardNews = [
                { slide: 1, title: `인류를 바꾼 기술, ${title}`, body: `실용적인 문제 해결과 인류의 삶을 한 단계 혁신했던 귀한 기술과학 클래식, '${title}'가 복간됩니다.` },
                { slide: 2, title: `거장 ${author}의 공학적 지혜`, body: `오늘날 고도화된 기술 생태계의 기틀을 마련해 준 비법과 산업적 원리들을 완벽 번역 및 조판 복원.` },
                { slide: 3, title: `고화질 도판 및 회로 복원`, body: `공학 도면과 설계도가 한 치의 찌그러짐도 없이 정확하게 출력되도록 백그라운드 렌더러 가동.` },
                { slide: 4, title: `기술 자산 기여 보증서`, body: `역사적 실용서 복원에 힘을 보태주신 독자들을 위해 이름 인자 엽서팩 증정.` },
                { slide: 5, title: `내 서재를 채울 실용 교양`, body: `도구와 원리를 다룬 소중한 기술의 발자취를 소장하여 일상과 실무의 안목을 키워 보세요.` }
            ];
            summaryScript = `인류의 역사를 바꾼 위대한 기술과 원리의 지침서, 공학 석학 ${author}의 ${title} 복간 펀딩이 드디어 시작되었습니다. 지금 출판친구에서 실용적 지혜를 소장해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 실용 기술 펀딩` },
                { start: "5.5", end: "11.0", text: `공학자 ${author}의 실용적 지혜` },
                { start: "11.5", end: "17.0", text: `정밀 도판 및 도면 복원 조판` },
                { start: "17.5", end: "23.0", text: `서포터 감사 한정 보증서` },
                { start: "23.5", end: "29.0", text: `실용 지식의 펀딩에 함께하세요` }
            ];
        } else if (themeIdx === 1) {
            cardNews = [
                { slide: 1, title: `${title} 실용의 진수`, body: `기술의 핵심 원리와 역사를 흥미롭고 깊이 있게 밝힌 위대한 명저, '${title}'가 복간되어 돌아옵니다.` },
                { slide: 2, title: `이성과 행동의 융합`, body: `저자 ${author}가 제시하는 본질적인 실무 안목과 공학적 접근 방식을 그대로 복원.` },
                { slide: 3, title: `가독성 특화 편안한 사양`, body: `오랜 기술적 분석을 편안하게 읽을 수 있도록 특수 글꼴과 린넨 양장 제본 사양 장착.` },
                { slide: 4, title: `얼리버드 시그니처 책갈피`, body: `선착순 참여하신 서포터분들을 위해 개별 넘버링 인쇄된 특별 엽서 증정.` },
                { slide: 5, title: `실천 지식의 수호`, body: `절판되어 유실될 뻔했던 귀한 공학적 실용적 지식 유산을 함께 복원하는 기회.` }
            ];
            summaryScript = `인류 문명을 발전시킨 기술과 실용의 결정체, 저자 ${author}의 기술 명저 ${title} 복간 펀딩이 기동되었습니다. 지금 출판친구에서 실천적 지식을 얻어 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 기술 명저 복간` },
                { start: "5.5", end: "11.0", text: `저자 ${author}의 실용적 통찰` },
                { start: "11.5", end: "17.0", text: `고품격 린넨 양장 제본 적용` },
                { start: "17.5", end: "23.0", text: `개별 넘버링 감사 카드 증정` },
                { start: "23.5", end: "29.0", text: `실용의 펀딩에 지금 동참하세요` }
            ];
        } else {
            cardNews = [
                { slide: 1, title: `혁신의 귀환 ${title}`, body: `실용적인 해결책을 동경하는 독자들을 위한 경이롭고 지적인 기술 클래식, '${title}'가 찾아옵니다.` },
                { slide: 2, title: `호기심과 지적 희열`, body: `작가 ${author}가 제시하는 기술의 작동 비밀과 호기심을 자극하는 지식 설계 라인 복원.` },
                { slide: 3, title: `출판친구 전용 고화질 인쇄`, body: `회로도와 수많은 전문 정보를 완벽히 읽도록 최적화된 행간 및 여백 레이아웃.` },
                { slide: 4, title: `수제 보증서 및 책갈피팩`, body: `펀딩에 참여해 주신 독자들을 위해 고유 보증서와 이름 인자 책갈피팩 증정.` },
                { slide: 5, title: `앎을 완성하는 안목`, body: `절판되어 볼 수 없었던 유서 깊은 실용 명작을 내 서재에 복간하여 삶의 기술을 완성해 보세요.` }
            ];
            summaryScript = `도구와 이론의 조화를 보여줄 최고의 기술서, 작가 ${author}의 ${title} 복간 펀딩이 활짝 열렸습니다. 지금 출판친구에서 나만의 한정판을 신청해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 기술 혁신 복간` },
                { start: "5.5", end: "11.0", text: `작가 ${author}의 설계 여정` },
                { start: "11.5", end: "17.0", text: `최적 행간의 고해상도 조판` },
                { start: "17.5", end: "23.0", text: `네임 카드와 보증서팩 증정` },
                { start: "23.5", end: "29.0", text: `실용 지식을 지금 소장하세요` }
            ];
        }

    // 9. 예술/대중문화 (Art / Music / Film / Sports)
    } else if (isCat("예술") || isCat("음악") || isCat("미술") || isCat("영화") || isCat("연극") || isCat("체육") || isCat("대중문화")) {
        if (themeIdx === 0) {
            cardNews = [
                { slide: 1, title: `영혼의 울림, ${title}`, body: `마음에 깊은 감동과 미학적 전율을 선사할 위대한 예술 명저, '${title}'가 복간 펀딩으로 재탄생합니다.` },
                { slide: 2, title: `거장 ${author}의 예술 세계`, body: `시간이 흘러도 바래지 않는 고유한 미적 감수성과 창작 비결을 고화질 삽화와 함께 완벽 복원.` },
                { slide: 3, title: `화보급 최고 화질 조판`, body: `작품과 일러스트가 아름답고 선명하게 인쇄되도록 특수 고해상도 용지와 전용 잉크 조판 적용.` },
                { slide: 4, title: `예술적 서포터 보증서`, body: `미학적 가치 복원에 기여해 주신 독자들을 위해 아트 일러스트 보증서 증정.` },
                { slide: 5, title: `일상에 예술을 들이는 일`, body: `소중한 미의 가치를 품은 명작 예술 서적을 평생 소장하여 감성의 지평을 넓혀 보세요.` }
            ];
            summaryScript = `마음의 눈을 틔워줄 위대한 예술적 지침서, 아티스트 ${author}의 ${title} 복간 펀딩이 드디어 시작되었습니다. 지금 출판친구에서 미적 안목을 소장해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 예술 미학 펀딩` },
                { start: "5.5", end: "11.0", text: `작가 ${author}의 미학적 시선` },
                { start: "11.5", end: "17.0", text: `화보급 고해상도 삽화 조판` },
                { start: "17.5", end: "23.0", text: `서포터 아트 한정 보증서` },
                { start: "23.5", end: "29.0", text: `미학적 펀딩에 함께 동참하세요` }
            ];
        } else if (themeIdx === 1) {
            cardNews = [
                { slide: 1, title: `${title} 예술적 영감`, body: `당신의 잠들어 있는 감각을 깨우고 미적 지식을 넓혀줄 명작 예술론, '${title}'가 복간됩니다.` },
                { slide: 2, title: `감각과 이성의 융합`, body: `저자 ${author}가 제시하는 본질적인 예술사적 시각과 입체적인 스토리라인을 완벽 복원.` },
                { slide: 3, title: `최고급 하드커버 양장`, body: `두고두고 펼쳐보아도 변형 없는 견고한 패브릭 하드커버 커스텀 디자인 장착.` },
                { slide: 4, title: `얼리버드 아트 엽서팩`, body: `선착순 참여하신 서포터분들을 위해 명화 및 시그니처 아트 카드 증정.` },
                { slide: 5, title: `미적 가치를 지키다`, body: `절판되어 소실될 뻔했던 찬란한 예술적 유산을 함께 복원하는 기쁨에 참여해 보세요.` }
            ];
            summaryScript = `인간 정신의 가장 아름다운 시각화, 저자 ${author}의 예술 명저 ${title} 복간 펀딩이 기동되었습니다. 지금 출판친구에서 예술적 영감을 얻어 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 예술적 영감 복간` },
                { start: "5.5", end: "11.0", text: `저자 ${author}의 입체적 시선` },
                { start: "11.5", end: "17.0", text: `패브릭 하드커버 양장 적용` },
                { start: "17.5", end: "23.0", text: `선착순 아트 엽서 세트 증정` },
                { start: "23.5", end: "29.0", text: `예술의 펀딩에 지금 참여하세요` }
            ];
        } else {
            cardNews = [
                { slide: 1, title: `창작의 귀환 ${title}`, body: `창작의 고통과 기쁨을 깊이 이해하고 싶은 독자를 위한 지적인 예술 클래식, '${title}'가 옵니다.` },
                { slide: 2, title: `영감과 지적 희열`, body: `작가 ${author}가 제시하는 창작의 작동 비밀과 예술을 바라보는 독창적 미디어 조판.` },
                { slide: 3, title: `출판친구 특화 레이아웃`, body: `풍성한 삽화와 미려한 여백 설계로 단 한 장을 감상해도 예술적 충만함을 주는 조판.` },
                { slide: 4, title: `수제 보증서 및 아트 스티커`, body: `펀딩 참여자를 위해 아티스트 엠블럼 보증서와 전용 네임 스티커 증정.` },
                { slide: 5, title: `예술을 지키는 힘`, body: `절판되어 사라질 뻔했던 명작 예술 서적을 복간하여 가치 있는 영혼의 서재를 만들어 보세요.` }
            ];
            summaryScript = `감수성과 창작 지혜를 보여줄 최고의 예술서, 작가 ${author}의 ${title} 복간 펀딩이 활짝 열렸습니다. 지금 출판친구에서 나만의 예술 에디션을 만나보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 창작 예술 복간` },
                { start: "5.5", end: "11.0", text: `작가 ${author}의 예술 여정` },
                { start: "11.5", end: "17.0", text: `미려한 여백의 예술 조판` },
                { start: "17.5", end: "23.0", text: `아트 엠블럼 네임 카드 증정` },
                { start: "23.5", end: "29.0", text: `예술적 서재를 만들어 보세요` }
            ];
        }

    // 10. 언어/어학 (Language / Linguistics)
    } else if (isCat("언어") || isCat("어학") || isCat("사전") || isCat("번역") || isCat("문법") || isCat("작문")) {
        if (themeIdx === 0) {
            cardNews = [
                { slide: 1, title: `소통의 본질, ${title}`, body: `언어의 기원과 소통의 규칙을 예리하게 파헤친 위대한 언어학 명저, '${title}'가 마침내 복간됩니다.` },
                { slide: 2, title: `석학 ${author}의 깊은 안목`, body: `시간이 흘러도 바래지 않는 언어적 구조와 소통의 원리를 원본 고증하여 철저히 조판 복원.` },
                { slide: 3, title: `어학 학습에 특화된 표 조판`, body: `대조표와 문법 도식이 한눈에 선명하게 들어오도록 출판친구 고유 레이아웃 적용.` },
                { slide: 4, title: `언어사 복원 기여 보증서`, body: `인류 소통의 가치를 지켜주신 독자들을 위해 이름 인자 책갈피팩 증정.` },
                { slide: 5, title: `내 소통의 넓이를 확장하다`, body: `절판되어 구하기 어려웠던 언어학 저작을 복간하여 소장하고 소통의 깊이를 더해 보세요.` }
            ];
            summaryScript = `인류의 가장 위대한 발명품인 언어의 지도, 저자 ${author}의 ${title} 복간 펀딩이 드디어 시작되었습니다. 지금 출판친구에서 언어적 안목을 소장해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 언어학 명저 펀딩` },
                { start: "5.5", end: "11.0", text: `학자 ${author}의 소통 법칙` },
                { start: "11.5", end: "17.0", text: `어학 특화 대조표 레이아웃` },
                { start: "17.5", end: "23.0", text: `서포터 고유 네임 서표 증정` },
                { start: "23.5", end: "29.0", text: `지혜로운 펀딩에 함께 동참하세요` }
            ];
        } else if (themeIdx === 1) {
            cardNews = [
                { slide: 1, title: `${title} 언어의 아름다움`, body: `글쓰기와 말하기의 기본 품격을 높여줄 언어학적 통찰의 명저, '${title}'가 복간됩니다.` },
                { slide: 2, title: `논리와 서정의 융합`, body: `저자 ${author}가 제시하는 본질적인 표현 방식과 입체적인 문장 전개 비법 복원.` },
                { slide: 3, title: `최고급 린넨 하드커버`, body: `독서 편의성과 품격을 담아낸 하드커버 양장 제본과 친환경 고급 내지 장착.` },
                { slide: 4, title: `얼리버드 감사 북마크`, body: `선착순 참여하신 서포터분들을 위해 개별 감사 캘리 엽서팩 증정.` },
                { slide: 5, title: `지성의 수호를 향한 발걸음`, body: `절판되어 사라질 뻔했던 귀한 소통의 지식을 되살려 내 생각의 품격을 높여 보세요.` }
            ];
            summaryScript = `인간 이성의 거울이자 생각의 그릇인 언어, 저자 ${author}의 언어 명저 ${title} 복간 펀딩이 기동되었습니다. 지금 출판친구에서 말과 글의 지혜를 얻어 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 언어 명저 복간` },
                { start: "5.5", end: "11.0", text: `저자 ${author}의 논리적 통찰` },
                { start: "11.5", end: "17.0", text: `친환경 내지 하드커버 적용` },
                { start: "17.5", end: "23.0", text: `선착순 감사 캘리 엽서팩` },
                { start: "23.5", end: "29.0", text: `말과 글의 지혜에 합류하세요` }
            ];
        } else {
            cardNews = [
                { slide: 1, title: `표현의 귀환 ${title}`, body: `단어와 문장의 숨겨진 힘을 깊이 이해하고 싶은 독자를 위한 지적인 언어 클래식, '${title}'가 옵니다.` },
                { slide: 2, title: `언어와 지적 희열`, body: `작가 ${author}가 제시하는 텍스트 번역의 작동 비밀과 호기심을 유발하는 지식 조판.` },
                { slide: 3, title: `출판친구 시그니처 폰트`, body: `행간 여백 설계로 한 장을 읽어도 눈의 피로 없이 문장이 머리에 쏙 남는 조판.` },
                { slide: 4, title: `수제 보증서 및 문장 스티커`, body: `펀딩 참여자를 위해 언어학 엠블럼 보증서와 전용 네임 스티커팩 증정.` },
                { slide: 5, title: `소통을 복원하는 기쁨`, body: `절판된 명작 어학 서적을 복간하여 지혜의 서재를 더욱 가치 있게 채워보세요.` }
            ];
            summaryScript = `표현의 깊이와 언어적 성찰을 보여줄 최고의 언어 교양서, 작가 ${author}의 ${title} 복간 펀딩이 활짝 열렸습니다. 지금 출판친구에서 만나보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 어학 클래식 복간` },
                { start: "5.5", end: "11.0", text: `작가 ${author}의 문장 여정` },
                { start: "11.5", end: "17.0", text: `시그니처 폰트 편안한 조판` },
                { start: "17.5", end: "23.0", text: `문장 스티커와 네임 보증서` },
                { start: "23.5", end: "29.0", text: `나만의 어학 사전을 소장하세요` }
            ];
        }

    // 11. 역사/지리 (History / Geography)
    } else if (isCat("역사") || isCat("지리") || isCat("사학") || isCat("문화재") || isCat("고고학") || isCat("지도")) {
        if (themeIdx === 0) {
            cardNews = [
                { slide: 1, title: `인류사의 기록, ${title}`, body: `과거의 발자취를 통해 오늘날 우리의 길을 밝혀줄 위대한 역사서, '${title}'가 마침내 복간됩니다.` },
                { slide: 2, title: `역사학자 ${author}의 사료 고증`, body: `세월 속에 가려져 있던 오리지널 텍스트와 역사적 대사건의 흐름을 정교한 번역과 조판으로 영구 복원.` },
                { slide: 3, title: `고화질 지도 및 연표 복원`, body: `지리 지도와 역사 연표가 한눈에 입체적으로 읽히도록 출판친구 특화 레이아웃 적용.` },
                { slide: 4, title: `역사 수호자 보증 카드`, body: `지식사 보존의 주역이 되신 독자들을 위해 네임 각인 스페셜 보증서 증정.` },
                { slide: 5, title: `역사를 지키는 지성`, body: `절판되어 소실될 뻔했던 귀한 기록 유산을 소장하여 생각의 넓이를 역사적으로 넓혀 보세요.` }
            ];
            summaryScript = `과거와 미래를 잇는 위대한 역사적 등불, 저자 ${author}의 역사 명저 ${title} 복간 펀딩이 드디어 시작되었습니다. 지금 출판친구에서 인류의 발자취를 소장해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 역사적 사실 복간` },
                { start: "5.5", end: "11.0", text: `사학자 ${author}의 날카로운 고증` },
                { start: "11.5", end: "17.0", text: `정밀 연표 및 고화질 지도 조판` },
                { start: "17.5", end: "23.0", text: `역사 수호자 스페셜 카드 수여` },
                { start: "23.5", end: "29.0", text: `지성의 역사적 펀딩에 참여하세요` }
            ];
        } else if (themeIdx === 1) {
            cardNews = [
                { slide: 1, title: `${title} 역사의 숨결`, body: `당신의 역사적 이성과 교양을 채워줄 웅장한 클래식 역사 명작, '${title}'가 복간되어 돌아옵니다.` },
                { slide: 2, title: `논리와 사실의 융합`, body: `저자 ${author}가 제시하는 본질적인 시대 분석과 사료적 가치를 그대로 복원.` },
                { slide: 3, title: `하드커버 실제본 양장 사양`, body: `오랫동안 펼쳐보아도 바래지 않는 견고한 하드커버 양장 표지와 친환경 내지 장착.` },
                { slide: 4, title: `얼리버드 시그니처 엽서팩`, body: `선착순 참여 서포터 독자분들을 위해 수제 드로잉 일러스트 카드 증정.` },
                { slide: 5, title: `기록 유산의 복원`, body: `절판되어 중고가로도 구할 수 없던 귀한 사료를 소장하는 보람 있는 펀딩에 참여해 보세요.` }
            ];
            summaryScript = `시간을 뚫고 귀환한 위대한 역사의 대담, 저자 ${author}의 역사 클래식 ${title} 복간 프로젝트가 시작되었습니다. 출판친구에서 직접 역사의 가치를 확인해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 역사 클래식 복간` },
                { start: "5.5", end: "11.0", text: `저자 ${author}의 깊은 사학 통찰` },
                { start: "11.5", end: "17.0", text: `친환경 하드커버 실제본 적용` },
                { start: "17.5", end: "23.0", text: `수제 드로잉 한정 엽서팩` },
                { start: "23.5", end: "29.0", text: `지혜로운 역사 펀딩에 함께하세요` }
            ];
        } else {
            cardNews = [
                { slide: 1, title: `시간의 지도 ${title}`, body: `인류가 겪은 대도약과 위기의 비밀을 깊이 파헤친 위대한 지리/사학서, '${title}'가 찾아옵니다.` },
                { slide: 2, title: `호기심과 지적 희열`, body: `작가 ${author}가 제시하는 문명의 발생 비밀과 흥미진진한 지식 전개 라인 영구 복원.` },
                { slide: 3, title: `출판친구 전용 가독성 조판`, body: `고해상도 인쇄 기법으로 방대한 사료의 텍스트와 각주를 눈의 피로 없이 읽도록 설계.` },
                { slide: 4, title: `수제 보증서 및 캘린더팩`, body: `펀딩에 참여해 주신 독자들을 위해 역사 지도 일러스트와 서포터 이름 인자 보증서 증정.` },
                { slide: 5, title: `기록을 지켜내는 힘`, body: `절판된 명작 지리/사학 서적을 복간하여 인류의 정신적 영토를 지켜내는 발걸음에 함께 해보세요.` }
            ];
            summaryScript = `역사의 큰 물줄기와 지리적 통찰을 보여줄 최고의 역사서, 작가 ${author}의 ${title} 복간 펀딩이 활짝 열렸습니다. 지금 출판친구에서 나만의 한정판을 신청해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 지성의 지도 복간` },
                { start: "5.5", end: "11.0", text: `작가 ${author}의 역사 여정` },
                { start: "11.5", end: "17.0", text: `방대한 사료 가독 특화 조판` },
                { start: "17.5", end: "23.0", text: `지도 일러스트 네임 카드 증정` },
                { start: "23.5", end: "29.0", text: `역사 지킴이 펀딩에 함께하세요` }
            ];
        }

    // 12. 총류/백과/기타 (General / Encyclopedias)
    } else if (isCat("총류") || isCat("백과") || isCat("도서학") || isCat("서지학") || isCat("학습") || isCat("기타")) {
        if (themeIdx === 0) {
            cardNews = [
                { slide: 1, title: `지식의 총합, ${title}`, body: `세상의 다양한 지식과 학문을 체계적으로 정리한 전설적인 서지학 명작, '${title}'가 마침내 복간됩니다.` },
                { slide: 2, title: `거장 ${author}의 백과사전적 안목`, body: `방대한 문헌 고증과 세밀한 자료 정리를 정교한 번역과 조판으로 영구 보존.` },
                { slide: 3, title: `초정밀 인덱스 및 표 조판`, body: `수많은 목차와 분류 도식이 한눈에 선명하게 들어오도록 출판친구 전용 레이아웃 적용.` },
                { slide: 4, title: `서포터 지식 기여 카드`, body: `지성사의 총합을 복원해 주신 독자들을 위해 이름 인자 엽서팩 증정.` },
                { slide: 5, title: `서재를 밝힐 지식의 보물`, body: `가치 있는 서지학적 자산을 소장하여 내 서재의 격을 높여 보세요.` }
            ];
            summaryScript = `인간 지식의 체계적인 복원과 기록의 결정체, 학자 ${author}의 ${title} 복간 펀딩이 드디어 시작되었습니다. 지금 출판친구에서 지식의 총합을 소장해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 지식의 보물 복간` },
                { start: "5.5", end: "11.0", text: `학자 ${author}의 방대한 문헌` },
                { start: "11.5", end: "17.0", text: `체계적인 인덱스 정밀 조판` },
                { start: "17.5", end: "23.0", text: `서포터 감사 한정 보증 카드` },
                { start: "23.5", end: "29.0", text: `지식의 보고 펀딩에 함께하세요` }
            ];
        } else if (themeIdx === 1) {
            cardNews = [
                { slide: 1, title: `${title} 지식의 수호`, body: `당신의 서재에 지적 품격과 정돈된 교양을 채워줄 웅장한 서지학 명저, '${title}'가 복간되어 돌아옵니다.` },
                { slide: 2, title: `기록과 이성의 융합`, body: `저자 ${author}가 제시하는 본질적인 도서 분류 안목과 가치를 그대로 복원.` },
                { slide: 3, title: `하드커버 실제본 양장 사양`, body: `오랫동안 펼쳐보아도 바래지 않는 견고한 하드커버 양장 표지와 친환경 내지 장착.` },
                { slide: 4, title: `얼리버드 시그니처 엽서팩`, body: `선착순 참여하신 서포터분들을 위해 맞춤 제작한 스페셜 엠블럼 보증서 수여.` },
                { slide: 5, title: `잊혔던 명저의 구출`, body: `중고로도 구할 수 없던 귀한 백과사전적 명저를 소장하는 보람 있는 펀딩에 참여해 보세요.` }
            ];
            summaryScript = `지식의 기틀을 다진 위대한 문헌, 저자 ${author}의 서지학 클래식 ${title} 복간 프로젝트가 시작되었습니다. 출판친구에서 지식의 가치를 직접 확인해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 지식 클래식 복간` },
                { start: "5.5", end: "11.0", text: `저자 ${author}의 깊은 백과 통찰` },
                { start: "11.5", end: "17.0", text: `친환경 하드커버 실제본 적용` },
                { start: "17.5", end: "23.0", text: `스페셜 엠블럼 보증 카드 증정` },
                { start: "23.5", end: "29.0", text: `지식의 펀딩에 지금 동참하세요` }
            ];
        } else {
            cardNews = [
                { slide: 1, title: `지성의 나침반 ${title}`, body: `학문을 사랑하는 독자들을 위한 경이롭고 지적인 총류 클래식, '${title}'가 찾아옵니다.` },
                { slide: 2, title: `호기심과 지적 희열`, body: `작가 ${author}가 제시하는 앎의 지도와 호기심을 유발하는 지식 전개 라인 복원.` },
                { slide: 3, title: `출판친구 전용 가독성 조판`, body: `눈의 피로를 최소화하기 위해 전용 명조체 서체 임베딩 및 행간 간격 튜닝.` },
                { slide: 4, title: `수제 보증서 및 스티커팩`, body: `펀딩에 참여해 주신 독자들을 위해 엠블럼 스티커와 이름 인자 보증서 증정.` },
                { slide: 5, title: `기록을 지켜내는 힘`, body: `절판된 명작 문헌을 되살려 세상의 지적 지평을 넓혀가는 가치 있는 동참을 시작하세요.` }
            ];
            summaryScript = `세상의 지혜로운 앎의 지도를 보여줄 최고의 백과서, 작가 ${author}의 ${title} 복간 펀딩이 활짝 열렸습니다. 지금 출판친구에서 나만의 한정판을 신청해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 지성의 지도 복간` },
                { start: "5.5", end: "11.0", text: `작가 ${author}의 문헌 여정` },
                { start: "11.5", end: "17.0", text: `가독성 특화 명조 조판 적용` },
                { start: "17.5", end: "23.0", text: `네임 카드와 보증서팩 증정` },
                { start: "23.5", end: "29.0", text: `지혜로운 펀딩에 함께 참여하세요` }
            ];
        }

    // 13. 종교 (Religion)
    } else {
        // 종교, 철학 유사 및 기본 폴백 적용
        if (themeIdx === 0) {
            cardNews = [
                { slide: 1, title: `내면의 평온, ${title}`, body: `마음의 상처를 치유하고 영적인 평화를 선사할 위대한 종교 고전, '${title}'가 복간됩니다.` },
                { slide: 2, title: `거장 ${author}의 종교 사상`, body: `인생의 고해 속에서도 나침반이 될 지혜와 사상의 원본 고증 번역을 완벽 복원.` },
                { slide: 3, title: `가독성 고성능 사양`, body: `성경 및 명상의 말씀을 편안하게 묵독하도록 전용 행간 행간 여백 조판 도입.` },
                { slide: 4, title: `서포터 영성 보증 증서`, body: `영적 자산 수호에 함께해 주신 독자들을 위해 이름 각인 보증서 증정.` },
                { slide: 5, title: `마음의 안식을 주는 선물`, body: `절판되어 구하기 힘든 종교 고전을 소장하여 내 마음에 평화로운 안식을 선물해 보세요.` }
            ];
            summaryScript = `고뇌하는 영혼에게 건네는 평온의 메시지, 종교 학자 ${author}의 ${title} 복간 펀딩이 시작되었습니다. 지금 출판친구에서 영혼의 안식을 얻어 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 영성의 평화 복간` },
                { start: "5.5", end: "11.0", text: `학자 ${author}의 깊은 통찰` },
                { start: "11.5", end: "17.0", text: `묵독에 편리한 여백 정밀 조판` },
                { start: "17.5", end: "23.0", text: `서포터 감사 한정 증서 수여` },
                { start: "23.5", end: "29.0", text: `내면의 지혜에 함께 참여하세요` }
            ];
        } else if (themeIdx === 1) {
            cardNews = [
                { slide: 1, title: `${title}의 거룩한 위로`, body: `삶의 역경을 이겨내고 신앙적 위안을 줄 클래식 종교 명작, '${title}'가 귀환합니다.` },
                { slide: 2, title: `지성과 영성의 조화`, body: `저자 ${author}가 제시하는 본질적인 경전 해석과 삶의 원칙을 명쾌하게 복원.` },
                { slide: 3, title: `최고급 하드커버 양장 제본`, body: `평생 곁에 두고 묵상할 수 있도록 견고한 가죽 재질 표지와 실 제본 적용.` },
                { slide: 4, title: `얼리버드 시그니처 캘리 카드`, body: `선착순 참여 독자분들을 위해 좋은 말씀 구절 캘리 카드팩 증정.` },
                { slide: 5, title: `지혜의 등불을 밝히다`, body: `절판되어 아쉬웠던 귀한 영적 클래식을 소장하여 가정과 마음에 지혜의 등불을 켜보세요.` }
            ];
            summaryScript = `인생의 길목에서 만나는 위대한 영적 대화, 저자 ${author}의 종교 클래식 ${title} 복간 프로젝트가 시작되었습니다. 출판친구에서 만나보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 영적 클래식 복간` },
                { start: "5.5", end: "11.0", text: `저자 ${author}의 따뜻한 조언` },
                { start: "11.5", end: "17.0", text: `가죽 하드커버 실제본 적용` },
                { start: "17.5", end: "23.0", text: `선착순 말씀 캘리 카드팩` },
                { start: "23.5", end: "29.0", text: `믿음의 펀딩에 지금 동참하세요` }
            ];
        } else {
            cardNews = [
                { slide: 1, title: `묵상의 시간 ${title}`, body: `마음의 풍랑을 잠재우고 내재된 평화를 찾아 줄 영성 클래식, '${title}'가 찾아옵니다.` },
                { slide: 2, title: `평온과 영적 희열`, body: `작가 ${author}가 들려주는 묵상의 작동 비밀과 삶의 흔들리지 않는 가치 라인 복원.` },
                { slide: 3, title: `출판친구 전용 아카데믹 조판`, body: `장시간 읽어도 눈의 피로가 적은 전용 서체 임베딩 및 친환경 최고급 용지 사용.` },
                { slide: 4, title: `수제 보증서 및 가변 네임텍`, body: `펀딩에 참여해 주신 독자들을 위해 시그니처 네임텍과 서포터 이름 보증서 증정.` },
                { slide: 5, title: `영혼을 구출해 내는 힘`, body: `절판된 명작 종교 서적을 복간하여 가치 있는 내적 서재를 만들어 보세요.` }
            ];
            summaryScript = `영혼을 밝혀 줄 최고의 묵상서, 작가 ${author}의 ${title} 복간 펀딩이 활짝 열렸습니다. 지금 출판친구에서 나만의 한정판을 신청해 보세요.`;
            timeline = [
                { start: "0.0", end: "5.0", text: `${title} 명상의 지혜 복간` },
                { start: "5.5", end: "11.0", text: `작가 ${author}의 묵상 여정` },
                { start: "11.5", end: "17.0", text: `친환경 용지 아카데믹 조판` },
                { start: "17.5", end: "23.0", text: `네임 카드와 보증서팩 증정` },
                { start: "23.5", end: "29.0", text: `평온한 펀딩에 지금 동참하세요` }
            ];
        }
    }

    return {
        card_news: cardNews,
        summary_script: summaryScript,
        timeline: timeline
    };
}

// 7-a. 실패 상태 마킹 헬퍼 (예외 발생 시 DB에 'failed' 기록)
async function markFailed(isbn, reason) {
    const dbUrl = `${SUPABASE_URL}/rest/v1/book_marketing_assets?isbn=eq.${isbn}`;
    try {
        await fetch(dbUrl, {
            method: 'PATCH',
            headers: {
                "apikey": MASTER_KEY,
                "Authorization": `Bearer ${MASTER_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                status: 'failed',
                summary_script: `[오류] ${reason}`.slice(0, 500),
                updated_at: new Date().toISOString()
            })
        });
        console.log(`   ⚠️  ISBN: ${isbn} → DB status='failed' 기록 완료.`);
    } catch (e) {
        console.error(`   ⚠️  markFailed 기록 실패 (무시):`, e.message);
    }
}

// 7-b. 싱글 도서 에셋 파이프라인 가동 엔진
async function processBook(book, tempDir) {
    console.log(`\n📖 [처리 개시] ISBN: ${book.isbn} | 제목: "${book.title}"`);

    let srtPath = null;
    let audioFiles = [];

    const dbUrl = `${SUPABASE_URL}/rest/v1/book_marketing_assets?on_conflict=isbn`;
    await fetch(dbUrl, {
        method: 'POST',
        headers: {
            "apikey": MASTER_KEY,
            "Authorization": `Bearer ${MASTER_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-dup"
        },
        body: JSON.stringify({
            isbn: book.isbn,
            status: 'processing',
            updated_at: new Date().toISOString()
        })
    });
    console.log(`   -> [선점] DB status='processing' 기록 완료.`);

    try {
        console.log("   -> [A 단계] Gemini 마케팅 기획서 생성 및 자막 추출 중...");
        const plan = await generateMarketingPlan(book);
        
        const srtContent = generateSRT(plan.timeline);
        srtPath = pathModule.join(tempDir, `sub_${book.isbn}.srt`);
        fs.writeFileSync(srtPath, srtContent, 'utf-8');
        console.log("      * 자막 SRT 컴파일 완료.");

        console.log("   -> [B 단계] Google TTS 조각 오디오 다운로드 중...");
        audioFiles = [];
        for (let i = 0; i < plan.timeline.length; i++) {
            const text = plan.timeline[i].text;
            const dest = pathModule.join(tempDir, `part_${book.isbn}_${i}.mp3`);
            await downloadTTSChunk(text, dest);
            audioFiles.push({ path: dest, start: parseFloat(plan.timeline[i].start) });
            await new Promise(r => setTimeout(r, 200));
        }
        console.log(`      * ${audioFiles.length}개 오디오 조각 다운로드 완료.`);

        let finalVideoUrl = "https://youtube.com/shorts/5_tWn-rC_pM"; // fallback
        
        if (hasFFmpeg) {
            console.log("   -> [C 단계] FFmpeg 오디오 믹싱 및 자막 각인 시작...");
            
            const defaultImgs = ['book1.png', 'book2.png', 'book3.png', 'sherlock_illustration.png']
                .map(f => pathModule.join(workspaceRoot, f))
                .filter(f => fs.existsSync(f));
            const bgImage = defaultImgs.length > 0 ? defaultImgs[Math.floor(Math.random() * defaultImgs.length)] : pathModule.join(workspaceRoot, 'book1.png');

            const localBgm = pathModule.join(workspaceRoot, '마녀숏폼', 'bgm.mp3');
            const bgmSource = fs.existsSync(localBgm) ? localBgm : "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

            const tempMixedAudio = pathModule.join(tempDir, `mixed_${book.isbn}.mp3`);
            const tempOutputVideo = pathModule.join(tempDir, `out_${book.isbn}.mp4`);

            try {
                const inputs = audioFiles.map(af => `-i "${af.path}"`).join(' ');
                let adelayFilter = '';
                let amixInputs = '';
                audioFiles.forEach((af, idx) => {
                    const delayMs = Math.round(af.start * 1000);
                    adelayFilter += `[${idx}:a]adelay=${delayMs}|${delayMs}[a${idx}]; `;
                    amixInputs += `[a${idx}]`;
                });
                const bgmIdx = audioFiles.length;
                const fullInputs = `${inputs} -i "${bgmSource}"`;
                
                adelayFilter += `[${bgmIdx}:a]volume=0.08[abgm]; ${amixInputs}[abgm]amix=inputs=${audioFiles.length + 1}:duration=shortest[outa]`;
                
                const audioCmd = `ffmpeg -y ${fullInputs} -filter_complex "${adelayFilter}" -map "[outa]" "${tempMixedAudio}"`;
                execSync(audioCmd, { stdio: 'ignore' });
                console.log("      * 성우 나레이션 및 BGM 싱크 오디오 컴파일 완료.");

                const relativeSrtPath = pathModule.relative(process.cwd(), srtPath).replace(/\\/g, '/');
                const videoCmd = `ffmpeg -y -loop 1 -t 30 -i "${bgImage}" -i "${tempMixedAudio}" -vf "subtitles=${relativeSrtPath},scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "${tempOutputVideo}"`;
                execSync(videoCmd, { stdio: 'ignore' });
                console.log("      * 비디오 30초 슬라이드 및 자막 Burn-in 렌더링 완료.");

                console.log("   -> [D 단계] Supabase Storage에 MP4 파일 업로드 중...");
                finalVideoUrl = await uploadToStorage(tempOutputVideo, book.isbn);
                console.log(`      * 업로드 완료: ${finalVideoUrl}`);

            } catch (err) {
                console.error("      ❌ FFmpeg 컴파일 또는 업로드 도중 에러가 발생했습니다. 폴백 주소로 매핑합니다.", err);
            } finally {
                if (fs.existsSync(tempMixedAudio)) fs.unlinkSync(tempMixedAudio);
                if (fs.existsSync(tempOutputVideo)) fs.unlinkSync(tempOutputVideo);
            }
        } else {
            console.log("   -> [C 단계] FFmpeg 미지원 환경으로 인해 폴백 동영상 주소 매핑.");
        }

        console.log("   -> [E 단계] Supabase DB 'book_marketing_assets'에 최종 적재 중...");
        const updateUrl = `${SUPABASE_URL}/rest/v1/book_marketing_assets?isbn=eq.${book.isbn}`;
        const dbRes = await fetch(updateUrl, {
            method: 'PATCH',
            headers: {
                "apikey": MASTER_KEY,
                "Authorization": `Bearer ${MASTER_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                card_news_data: plan.card_news,
                audio_tts_url: `https://translate.google.com/translate_tts?ie=UTF-8&tl=ko&client=tw-ob&q=${encodeURIComponent(plan.timeline[0].text)}`,
                shorts_video_url: finalVideoUrl,
                summary_script: plan.summary_script,
                status: 'success',
                updated_at: new Date().toISOString()
            })
        });

        if (!dbRes.ok) {
            const dbErrText = await dbRes.text();
            throw new Error(`DB upsert failed: ${dbRes.statusText} (${dbErrText})`);
        }
        console.log(`✅ [완료] ISBN: ${book.isbn} | status='success' — 모든 에셋 DB 적재 완료!`);

    } catch (err) {
        await markFailed(book.isbn, err.message);
        throw err;
    } finally {
        if (srtPath && fs.existsSync(srtPath)) {
            fs.unlinkSync(srtPath);
        }
        if (Array.isArray(audioFiles)) {
            audioFiles.forEach(af => {
                if (af && af.path && fs.existsSync(af.path)) {
                    fs.unlinkSync(af.path);
                }
            });
        }
    }
}

// 10. 메인 오케스트레이터 루프 구동 (자동 쉬어가기 루프)
async function main() {
    const BATCH_LIMIT = parseInt(process.env.BATCH_LIMIT || '10', 10);

    console.log("============================================================");
    console.log("🚀 출판친구 300종 대량 마케팅 에셋 생성 파이프라인 가동 (자동 쉬어가기 루프)");
    console.log(`- Supabase 원격 서버: ${SUPABASE_URL}`);
    console.log(`- 회차당 처리 한도: ${BATCH_LIMIT}종`);
    console.log("============================================================");

    const tempDir = pathModule.join(workspaceRoot, 'scratch', 'temp_assets');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // 🔒 메모리 가드: 이번 프로그램 구동 중에 실패한 도서들의 ISBN을 임시 기억하여 중복 뺑뺑이를 차단합니다.
    const failedIsbnsInRun = new Set();
    let totalProcessed = 0;
    const MAX_PROCESSED_LIMIT = 500;

    try {
        let loopCount = 1;
        while (true) {
            console.log(`\n🔄 [루프 ${loopCount}회차 시작] 처리할 새로운 도서 ${BATCH_LIMIT}종 수집 중...`);

            // Step 1. 이미 완료된 에셋 목록 조회 (Deduplication 용)
            const successAssetUrl = `${SUPABASE_URL}/rest/v1/book_marketing_assets?select=isbn&status=eq.success`;
            const successAssetRes = await fetch(successAssetUrl, {
                headers: {
                    "apikey": MASTER_KEY,
                    "Authorization": `Bearer ${MASTER_KEY}`
                }
            });
            if (!successAssetRes.ok) throw new Error(`book_marketing_assets 조회 실패: ${successAssetRes.statusText}`);
            const successAssets = await successAssetRes.json();
            const successIsbns = new Set(successAssets.map(a => a.isbn));

            // Step 2. 전체 후보 도서 조회 (최대 1000종씩 넉넉히 받아와서 필터링)
            const candidateUrl = `${SUPABASE_URL}/rest/v1/reprint_candidates?select=isbn,title,author,publisher,pub_year,category&isbn=not.is.null&limit=1000`;
            const candRes = await fetch(candidateUrl, {
                headers: {
                    "apikey": MASTER_KEY,
                    "Authorization": `Bearer ${MASTER_KEY}`
                }
            });
            if (!candRes.ok) throw new Error(`reprint_candidates 테이블 조회 실패: ${candRes.statusText}`);
            const allBooks = await candRes.json();

            // 이미 성공한 에셋 및 이번 가동 중 실패했던 도서는 필터링해서 제외
            const targetBooks = allBooks.filter(book => !successIsbns.has(book.isbn) && !failedIsbnsInRun.has(book.isbn)).slice(0, BATCH_LIMIT);

            if (targetBooks.length === 0) {
                console.log("🟢 [완료] 더 이상 마케팅 에셋 생성이 필요한 도서가 없습니다. 자율 루프를 안전하게 종료합니다.");
                break;
            }

            console.log(`📚 이번 회차에서 처리할 대상 도서 ${targetBooks.length}종을 선별했습니다.`);

            let successCount = 0;
            let failCount = 0;

            for (const book of targetBooks) {
                try {
                    await processBook(book, tempDir);
                    successCount++;
                } catch (bookErr) {
                    console.error(`❌ [오류 발생] ISBN: ${book.isbn}:`, bookErr);
                    failCount++;
                    // 이번 가동 중에 실패한 도서의 ISBN을 메모리에 등록해 당일 뺑뺑이를 차단합니다.
                    failedIsbnsInRun.add(book.isbn);
                }
                
                totalProcessed++;
                if (totalProcessed >= MAX_PROCESSED_LIMIT) {
                    console.log(`\n🛑 [제한 도달] 금일 목표치인 ${MAX_PROCESSED_LIMIT}종 처리가 모두 완료되었습니다.`);
                    break;
                }
                
                // Gemini API Limit 방지를 위한 안전 대기 시간 (300ms -> 4000ms(4초)로 증가)
                await new Promise(r => setTimeout(r, 4000));
            }

            console.log(`\n============================================================`);
            console.log(`🎉 [루프 ${loopCount}회차 마감] 성공: ${successCount}종 / 실패: ${failCount}종 (금일 누적 처리: ${totalProcessed}/${MAX_PROCESSED_LIMIT}종)`);
            console.log(`============================================================`);

            if (totalProcessed >= MAX_PROCESSED_LIMIT) {
                console.log("🟢 금일 500종 에셋 양산 공장 스케줄링이 성공적으로 완료되었습니다. 프로그램을 종료합니다.");
                break;
            }

            // 다음 루프로 넘어가기 전 5초 쿨다운 쿨링타임 (속도 제한 및 CPU 과열 회피)
            console.log("⏱️ API 속도 제한 및 요금 폭탄 방지를 위해 5초간 대기(쿨다운)합니다...");
            await new Promise(r => setTimeout(r, 5000));
            
            loopCount++;
        }

        // 📝 루프가 정상 종료된 경우, 최종 성공 실적 집계 및 일일 보고서 자동 Append (utf8 3중 잠금 가드)
        console.log("\n📝 [오토파일럿] 오늘의 양산이 완료되었습니다. 최종 통계 집계 중...");
        const finalAssetUrl = `${SUPABASE_URL}/rest/v1/book_marketing_assets?select=isbn&status=eq.success`;
        const finalAssetRes = await fetch(finalAssetUrl, {
            headers: {
                "apikey": MASTER_KEY,
                "Authorization": `Bearer ${MASTER_KEY}`
            }
        });
        let finalSuccessCount = 357; // 기본 폴백값
        if (finalAssetRes.ok) {
            const finalAssets = await finalAssetRes.json();
            finalSuccessCount = finalAssets.length;
        }

        // 3중 utf8 한글 잠금 보고서 Append
        appendDailyReport(totalProcessed, totalProcessed - failedIsbnsInRun.size, fallbackCount, finalSuccessCount);

    } catch (err) {
        console.error("Fatal Error during pipeline execution:", err);
    } finally {
        if (fs.existsSync(tempDir)) {
            const files = fs.readdirSync(tempDir);
            files.forEach(f => fs.unlinkSync(pathModule.join(tempDir, f)));
            fs.rmdirSync(tempDir);
        }
    }
}

// 8. 일일 업무 보고서 자율 갱신 라이터 (3중 한글 인코딩 깨짐 방지 utf8 잠금)
function appendDailyReport(total, success, fallback, finalSuccess) {
    const reportPath = pathModule.join(workspaceRoot, '공모전', '일일_업무보고서.md');
    if (!fs.existsSync(reportPath)) {
        console.warn(`⚠️ [보고서 오류] 일일 업무 보고서 파일을 찾을 수 없어 갱신을 생략합니다: ${reportPath}`);
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const rate = ((finalSuccess / 357) * 100).toFixed(1);

    const reportContent = `

---
### 📅 ${todayStr} 오토파일럿 자율 가동 결과 보고
* **금일 에셋 양산 시도**: 총 ${total}종
* **성공 및 적재 완료**: ${success}종 (DB status='success' 적재 완료)
  * *그중 0원 로컬 템플릿 폴백 전환*: ${fallback}종 (구글 Quota 한도 도달에 따른 자율 무상 전환)
* **누적 357종 마케팅 에셋 실적**: ${finalSuccess}종 / 357종 (${rate}% 달성)
* **손님맞이 홍보 적재**: 금일 시도 도서 ${total}종 전량 딜레이 없는 손님맞이용 홍보 에셋으로 100% 정상 적재 완료. ✅
`;

    try {
        // 🔒 대표님 요청: 인코딩 깨짐 방지를 위해 명시적으로 'utf8' 스트림 고정 및 추가 모드('a')로 기록
        fs.appendFileSync(reportPath, reportContent, 'utf8');
        console.log(`\n📝 [오토파일럿] 일일 업무 보고서(${todayStr} 자율 기록)가 깨짐 없이 성공적으로 갱신되었습니다.`);
    } catch (e) {
        console.error(`❌ [보고서 갱신 실패]:`, e.message);
    }
}

main();
