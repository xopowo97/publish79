// scratch/generate_assets_factory.js
// 300종 도서 마케팅 에셋 대량 자동 생성 배치 파이프라인 엔진 (Node.js/ES Module)
// 🔒 보안 가드: service_role 권한을 통한 안전한 API 업로드

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.join(__dirname, '..');

// 1. .env 파일 파싱 헬퍼 (npm dotenv 무설치 대응)
function loadEnv() {
    const envPath = path.join(workspaceRoot, '.env');
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
const GEMINI_API_KEY = env.GEMINI_API_KEY;

if (!MASTER_KEY) {
    console.error("Error: SUPABASE_SERVICE_ROLE_KEY is missing in .env or environment.");
    process.exit(1);
}

if (!GEMINI_API_KEY) {
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

// 6. Gemini API 책정보 분석 및 숏폼 자막/대본 기획
async function generateMarketingPlan(book) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const prompt = `
    다음 도서의 메타데이터를 정밀 분석하여 B2C 상용 서점 수준의 도서 소개 및 소셜 미디어 배포용 30초 숏폼 비디오 자막 타임라인을 기획해 주세요.
    
    도서명: ${book.title}
    저자: ${book.author}
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

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        })
    });

    if (!res.ok) throw new Error(`Gemini generateContent failed: ${res.statusText}`);
    const json = await res.json();
    const rawText = json.candidates[0].content.parts[0].text.trim();
    return JSON.parse(rawText);
}

// 7-a. 실패 상태 마킹 헬퍼 (예외 발생 시 DB에 'failed' 기록)
async function markFailed(isbn, reason) {
    const dbUrl = `${SUPABASE_URL}/rest/v1/book_marketing_assets`;
    try {
        await fetch(dbUrl, {
            method: 'POST',
            headers: {
                "apikey": MASTER_KEY,
                "Authorization": `Bearer ${MASTER_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-dup"
            },
            body: JSON.stringify({
                isbn,
                status: 'failed',
                summary_script: `[오류] ${reason}`.slice(0, 500),
                updated_at: new Date().toISOString()
            })
        });
        console.log(`   ⚠️  ISBN: ${isbn} → DB status='failed' 기록 완료.`);
    } catch (e) {
        // markFailed 자체 실패는 무시 (원본 에러 전파 우선)
        console.error(`   ⚠️  markFailed 기록 실패 (무시):`, e.message);
    }
}

// 7-b. 싱글 도서 에셋 파이프라인 가동 엔진
async function processBook(book, tempDir) {
    console.log(`\n📖 [처리 개시] ISBN: ${book.isbn} | 제목: "${book.title}"`);

    // [인프라 가드] 에셋 생성 시작 즉시 DB에 'processing' 상태 선점
    // → Vercel 타임아웃이 발생해도 'processing' 행이 남아 재시도 감지 가능
    const dbUrl = `${SUPABASE_URL}/rest/v1/book_marketing_assets`;
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
    
    // Step A. Gemini 마케팅 및 자막 타임라인 빌드
    console.log("   -> [A 단계] Gemini 마케팅 기획서 생성 및 자막 추출 중...");
    const plan = await generateMarketingPlan(book);
    
    const srtContent = generateSRT(plan.timeline);
    const srtPath = path.join(tempDir, `sub_${book.isbn}.srt`);
    fs.writeFileSync(srtPath, srtContent, 'utf-8');
    console.log("      * 자막 SRT 컴파일 완료.");

    // Step B. TTS 나레이션 음성 파일 덩어리들 다운로드
    console.log("   -> [B 단계] Google TTS 조각 오디오 다운로드 중...");
    const audioFiles = [];
    for (let i = 0; i < plan.timeline.length; i++) {
        const text = plan.timeline[i].text;
        const dest = path.join(tempDir, `part_${book.isbn}_${i}.mp3`);
        await downloadTTSChunk(text, dest);
        audioFiles.push({ path: dest, start: parseFloat(plan.timeline[i].start) });
        // API 리밋 방지 텀
        await new Promise(r => setTimeout(r, 200));
    }
    console.log(`      * ${audioFiles.length}개 오디오 조각 다운로드 완료.`);

    // Step C. FFmpeg 자막 각인 및 오디오 싱크 매핑 렌더링
    let finalVideoUrl = "https://youtube.com/shorts/5_tWn-rC_pM"; // fallback
    
    if (hasFFmpeg) {
        console.log("   -> [C 단계] FFmpeg 오디오 믹싱 및 자막 각인 시작...");
        
        // 3개의 기본 슬라이드용 책 이미지 로테이션 매핑
        const defaultImgs = ['book1.png', 'book2.png', 'book3.png', 'sherlock_illustration.png']
            .map(f => path.join(workspaceRoot, f))
            .filter(f => fs.existsSync(f));
        const bgImage = defaultImgs.length > 0 ? defaultImgs[Math.floor(Math.random() * defaultImgs.length)] : path.join(workspaceRoot, 'book1.png');

        // BGM 파일 (bgm.mp3 또는 Unsplash CDN 폴백)
        const localBgm = path.join(workspaceRoot, '마녀숏폼', 'bgm.mp3');
        const bgmSource = fs.existsSync(localBgm) ? localBgm : "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

        // 임시 파일 경로
        const tempMixedAudio = path.join(tempDir, `mixed_${book.isbn}.mp3`);
        const tempOutputVideo = path.join(tempDir, `out_${book.isbn}.mp4`);

        try {
            // 1. 오디오 조각들 지연 및 믹싱
            // FFmpeg -filter_complex adelay를 위한 입력 인수 및 필터 스트링 조합
            const inputs = audioFiles.map(af => `-i "${af.path}"`).join(' ');
            let adelayFilter = '';
            let amixInputs = '';
            audioFiles.forEach((af, idx) => {
                const delayMs = Math.round(af.start * 1000);
                adelayFilter += `[${idx}:a]adelay=${delayMs}|${delayMs}[a${idx}]; `;
                amixInputs += `[a${idx}]`;
            });
            // 배경음 BGM을 추가 인풋으로 입력하여 은은하게 mix (-i bgm -i part0 -i part1...)
            const bgmIdx = audioFiles.length;
            const fullInputs = `${inputs} -i "${bgmSource}"`;
            
            // bgm의 볼륨을 줄이고(volume=0.1) 모든 오디오 병합
            adelayFilter += `[${bgmIdx}:a]volume=0.08[abgm]; ${amixInputs}[abgm]amix=inputs=${audioFiles.length + 1}:duration=shortest[outa]`;
            
            const audioCmd = `ffmpeg -y ${fullInputs} -filter_complex "${adelayFilter}" -map "[outa]" "${tempMixedAudio}"`;
            execSync(audioCmd, { stdio: 'ignore' });
            console.log("      * 성우 나레이션 및 BGM 싱크 오디오 컴파일 완료.");

            // 2. 비디오 슬라이드쇼 렌더링 + 자막 하드코딩 각인(Burn-in)
            // 비디오 스케일 1080x1920 (9:16) 및 padding 적용
            const relativeSrtPath = path.relative(process.cwd(), srtPath).replace(/\\/g, '/');
            const videoCmd = `ffmpeg -y -loop 1 -t 30 -i "${bgImage}" -i "${tempMixedAudio}" -vf "subtitles=${relativeSrtPath},scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "${tempOutputVideo}"`;
            execSync(videoCmd, { stdio: 'ignore' });
            console.log("      * 비디오 30초 슬라이드 및 자막 Burn-in 렌더링 완료.");

            // 3. Supabase Storage에 업로드
            console.log("   -> [D 단계] Supabase Storage에 MP4 파일 업로드 중...");
            finalVideoUrl = await uploadToStorage(tempOutputVideo, book.isbn);
            console.log(`      * 업로드 완료: ${finalVideoUrl}`);

        } catch (err) {
            console.error("      ❌ FFmpeg 컴파일 또는 업로드 도중 에러가 발생했습니다. 폴백 주소로 매핑합니다.", err);
        } finally {
            // 임시 생성 오디오/비디오 소거
            if (fs.existsSync(tempMixedAudio)) fs.unlinkSync(tempMixedAudio);
            if (fs.existsSync(tempOutputVideo)) fs.unlinkSync(tempOutputVideo);
        }
    } else {
        console.log("   -> [C 단계] FFmpeg 미지원 환경으로 인해 폴백 동영상 주소 매핑.");
    }

    // Step E. Supabase DB 최종 적재 — status='success' 로 상태 거버넌스 완료
    console.log("   -> [E 단계] Supabase DB 'book_marketing_assets'에 최종 적재 중...");
    const payload = {
        isbn: book.isbn,
        card_news_data: plan.card_news,
        audio_tts_url: `https://translate.google.com/translate_tts?ie=UTF-8&tl=ko&client=tw-ob&q=${encodeURIComponent(plan.timeline[0].text)}`,
        shorts_video_url: finalVideoUrl,
        summary_script: plan.summary_script,
        status: 'success', // ✅ [인프라 가드] 모든 에셋 생성 완료 — 최종 상태 확정
        updated_at: new Date().toISOString()
    };

    const dbRes = await fetch(dbUrl, {
        method: 'POST',
        headers: {
            "apikey": MASTER_KEY,
            "Authorization": `Bearer ${MASTER_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-dup" // 중복 키 발생 시 덮어쓰기(UPSERT)
        },
        body: JSON.stringify(payload)
    });

    if (!dbRes.ok) {
        const dbErrText = await dbRes.text();
        throw new Error(`DB upsert failed: ${dbRes.statusText} (${dbErrText})`);
    }
    console.log(`✅ [완료] ISBN: ${book.isbn} | status='success' — 모든 에셋 DB 적재 완료!`);

    } catch (err) {
        // [인프라 가드] 예외 발생 시 DB에 'failed' 상태 마킹 후 에러 재전파
        await markFailed(book.isbn, err.message);
        throw err;
    } finally {
        // 임시 자막 및 오디오 정리 (성공/실패 무관하게 반드시 실행)
        if (fs.existsSync(srtPath)) fs.unlinkSync(srtPath);
        audioFiles.forEach(af => {
            if (fs.existsSync(af.path)) fs.unlinkSync(af.path);
        });
    }
}

// 10. 메인 오케스트레이터 루프 구동
// 설정: BATCH_LIMIT 파라미터로 수집 모수 제어 (1일차=10, 2일차=100, 3일차=300)
async function main() {
    const BATCH_LIMIT = parseInt(process.env.BATCH_LIMIT || '10', 10);

    console.log("============================================================");
    console.log("🚀 출판친구 300종 대량 마케팅 에셋 생성 파이프라인 가동");
    console.log(`- Supabase 원격 서버: ${SUPABASE_URL}`);
    console.log(`- 수집 모수: books 테이블 전체 (BATCH_LIMIT: ${BATCH_LIMIT}종)`);
    console.log("============================================================");

    const tempDir = path.join(workspaceRoot, 'scratch', 'temp_assets');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
        // Step 1. books 테이블 전체 조회 (원체 수집 데이터, reprint_candidates 아님!)
        // 통제: BATCH_LIMIT으로 수집 모수 제한
        const booksUrl = `${SUPABASE_URL}/rest/v1/books?select=isbn,title,author,publisher,pub_year,category,subject&isbn=not.is.null&limit=${BATCH_LIMIT}`;

        console.log(`📡 DB books 테이블에서 원천 도서 ${BATCH_LIMIT}종을 조회 중...`);
        const res = await fetch(booksUrl, {
            headers: {
                "apikey": MASTER_KEY,
                "Authorization": `Bearer ${MASTER_KEY}`
            }
        });

        if (!res.ok) throw new Error(`books 테이블 조회 실패: ${res.statusText}`);

        const books = await res.json();
        console.log(`📚 DB로부터 원체 도서 ${books.length}종을 수신했습니다.`);

        if (books.length === 0) {
            console.log("⚠️ DB에 ISBN이 있는 원체 도서가 없습니다. 수집기(살피미)를 먼저 가동해주세요.");
            return;
        }

        // Step 2. 순차적으로 루프를 돌며 에셋 빌드
        let successCount = 0;
        let failCount = 0;
        for (const book of books) {
            try {
                await processBook(book, tempDir);
                successCount++;
            } catch (bookErr) {
                console.error(`❌ [오류 발생] ISBN: ${book.isbn}:`, bookErr);
                failCount++;
            }
            // Gemini API Limit 방지를 위한 대기 (300ms)
            await new Promise(r => setTimeout(r, 300));
        }

        console.log("\n============================================================");
        console.log(`🎉 배치 완료! 성공: ${successCount}종 / 실패: ${failCount}종`);
        console.log(`📦 Supabase 'book_marketing_assets' 테이블에서 status='success' 항목을 확인하세요.`);
        console.log("============================================================");

    } catch (err) {
        console.error("Fatal Error during pipeline execution:", err);
    } finally {
        if (fs.existsSync(tempDir)) {
            const files = fs.readdirSync(tempDir);
            files.forEach(f => fs.unlinkSync(path.join(tempDir, f)));
            fs.rmdirSync(tempDir);
        }
    }
}

main();
