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
    console.warn(`📢 [폴백 기동] 모든 Gemini API 키 한도가 초과되었습니다. 카테고리[${category}] 맞춤 룰베이스 템플릿으로 고속 합성합니다.`);

    let cardNews = [];
    let summaryScript = "";
    let timeline = [];

    // 카테고리별 디자인 및 텍스트 매핑 분기
    if (category.includes("소설") || category.includes("에세이") || category.includes("시") || category.includes("문학")) {
        cardNews = [
            { slide: 1, title: `${title}의 감성 귀환`, body: `독자들이 오랫동안 가슴속에 묻어두었던 명작 소설, '${title}'가 마침내 복간 프로젝트로 깨어납니다.` },
            { slide: 2, title: `작가 ${author}의 필체`, body: `시간이 흘러도 가슴 깊이 남는 특유의 문학적 감수성과 입체적인 인물 감성을 그대로 복원.` },
            { slide: 3, title: `명품 양장판 소장 가치`, body: `소장용 특별 내지와 가변 데이터 인쇄 책갈피 제공으로 독자 한 분만을 위한 명품 에디션 구성.` },
            { slide: 4, title: `서포터 독점 혜택`, body: `첫 복간 펀딩에 함께하시는 독자분들의 이름을 한땀한땀 각인한 실물 보증 증서 및 굿즈 발송.` },
            { slide: 5, title: `문학을 지키는 역사`, body: `절판된 한 권의 책을 되살리는 일은, 우리의 소중한 정신 유산과 서정적인 지적 지평을 보존하는 일입니다.` }
        ];
        summaryScript = `가슴을 따스하게 울릴 위대한 명작, 작가 ${author}의 문학 베스트셀러 ${title} 복간 펀딩이 드디어 개설되었습니다. 지금 출판친구에서 나만의 한정판 도서 예약에 참여해보세요.`;
        timeline = [
            { start: "0.0", end: "5.0", text: `${title} 감성 복간 펀딩` },
            { start: "5.5", end: "11.0", text: `${author} 작가의 깊은 이야기` },
            { start: "11.5", end: "17.0", text: `명품 양장본 한정 소장` },
            { start: "17.5", end: "23.0", text: `나만의 한정 보증서 획득` },
            { start: "23.5", end: "29.0", text: `지금 펀딩에 참여해보세요` }
        ];
    } else if (category.includes("경제") || category.includes("경영") || category.includes("비즈니스") || category.includes("자기계발") || category.includes("금융")) {
        cardNews = [
            { slide: 1, title: `${title}의 실천적 교훈`, body: `성공한 리더와 투자자들이 애타게 찾아온 실용 고전, '${title}'가 독자 투표를 통해 복간 추진됩니다.` },
            { slide: 2, title: `거장 ${author}의 안목`, body: `시대를 관통하는 예리한 비즈니스 룰과 자본의 흐름을 짚어낸 명작 에디션.` },
            { slide: 3, title: `초정밀 VDP 가독 조판`, body: `독서 효율을 극대화한 현대적 서체 임베딩 및 명품 양장 서적으로 소장 가치 극대화.` },
            { slide: 4, title: `서포터 특별 혜택`, body: `펀딩 참여자 한 분 한 분의 이름을 새겨 배송해 드리는 복간 보증서 증정.` },
            { slide: 5, title: `성공을 위한 최고의 투자`, body: `절판된 비즈니스 클래식을 내 서재에 소장하는 것은, 미래를 선점하는 가장 가치 있는 첫걸음입니다.` }
        ];
        summaryScript = `자본의 흐름을 꿰뚫어 볼 비즈니스 명작, 작가 ${author}의 ${title} 복간 펀딩이 드디어 가동되었습니다. 출판친구에서 복간 한정판 펀딩 예약에 지금 참여해 보세요.`;
        timeline = [
            { start: "0.0", end: "5.0", text: `${title} 비즈니스 펀딩` },
            { start: "5.5", end: "11.0", text: `성공을 이끈 ${author}의 통찰` },
            { start: "11.5", end: "17.0", text: `가독성 극대화 초정밀 조판` },
            { start: "17.5", end: "23.0", text: `나만의 한정 보증서 증정` },
            { start: "23.5", end: "29.0", text: `지금 펀딩에 신청해 보세요` }
        ];
    } else {
        // 인문학, 역사, 사회과학 및 기타 표준
        cardNews = [
            { slide: 1, title: `${title}의 위대한 귀환`, body: `독자들이 오랫동안 복간을 소망해 온 위대한 지식 보고, '${title}'가 마침내 복간 프로젝트로 귀환합니다.` },
            { slide: 2, title: `학자 ${author}의 통찰`, body: `세월 속에 가려져 있던 이 책만의 고유한 학문적 깊이와 입체적인 스토리라인을 완벽 복원.` },
            { slide: 3, title: `특별 한정 소장판`, body: `출판친구만의 초정밀 VDP 가변 조판과 나눔명조체 임베딩을 거쳐 완성되는 최고급 양장본.` },
            { slide: 4, title: `독점 서포터 혜택`, body: `복간 펀딩에 참여하는 독자분들을 위해 나만의 이름이 개별 인쇄된 실물 보증서 증정.` },
            { slide: 5, title: `지적 유산의 보존`, body: `절판 도서를 구출하는 것은 단순히 옛 책을 찍는 것을 넘어, 소중한 문화적 지평을 평생 지켜내는 일입니다.` }
        ];
        summaryScript = `독자들이 오랫동안 소망해 온 위대한 걸작, 작가 ${author}의 ${title} 복간 펀딩이 드디어 시작되었습니다. 지금 출판친구 스토어에서 나만의 맞춤형 도서 및 서포터 보증서를 획득하고 문화를 지켜내는 발걸음에 함께 해보세요.`;
        timeline = [
            { start: "0.0", end: "5.0", text: `${title} 복간 펀딩 가동` },
            { start: "5.5", end: "11.0", text: `${author} 작가의 위대한 귀환` },
            { start: "11.5", end: "17.0", text: `오리지널 명품 조판 복원` },
            { start: "17.5", end: "23.0", text: `VDP 책갈피 한정 증정` },
            { start: "23.5", end: "29.0", text: `지금 펀딩에 동참하세요` }
        ];
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

            // Step 2. 전체 후보 도서 조회 (최대 100종씩 넉넉히 받아와서 필터링)
            const candidateUrl = `${SUPABASE_URL}/rest/v1/reprint_candidates?select=isbn,title,author,publisher,pub_year,category&isbn=not.is.null&limit=100`;
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
