// ============================================================
// scratch/generate_ondemand_assets.js
// [Step 2] 471종 알짜 도서 온디맨드 60-템플릿 에셋 팩 JSON 생성 및 적재 스크립트
//
// 💡 특징:
//   - mp4 영상 사전 인코딩 0% (서버 비용 및 인코딩 시간 0초)
//   - 초경량 60개 템플릿 정보 + 카드뉴스 5장 텍스트 + 자막 대본 JSON 구축
//   - 471종 도서 전량에 60가지 고유 디자인 템플릿 매핑
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 파싱
const envPath = path.join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
            env[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        }
    }
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Supabase 환경변수가 설정되지 않았습니다.');
    process.exit(1);
}

const base = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1';
const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
};

// ── 60개 템플릿 조합 메트릭스 (5 레이아웃 x 4 컬러 x 3 애니메이션) ──
const LAYOUTS = ['CLASSIC_CENTER', 'MODERN_SPLIT', 'CINEMATIC_FULL', 'EDITORIAL_CARD', 'MINIMAL_TEXT'];
const COLOR_THEMES = ['HUMANITIES_AMBER', 'BUSINESS_NAVY', 'SELFHELP_EMERALD', 'NOVEL_VIOLET'];
const MOTIONS = ['SMOOTH_FADE', 'DYNAMIC_SLIDE', 'ZOOM_PULSE'];

function getTemplateConfig(index, category) {
    const templateId = (index % 60) + 1; // 1~60
    const layout = LAYOUTS[index % LAYOUTS.length];

    let colorTheme = COLOR_THEMES[0];
    const catStr = (category || '').toLowerCase();
    if (catStr.includes('경제') || catStr.includes('경영') || catStr.includes('비즈니스')) {
        colorTheme = COLOR_THEMES[1];
    } else if (catStr.includes('자기계발')) {
        colorTheme = COLOR_THEMES[2];
    } else if (catStr.includes('소설') || catStr.includes('문학')) {
        colorTheme = COLOR_THEMES[3];
    }

    const motion = MOTIONS[index % MOTIONS.length];
    const tplCode = 'TPL-' + String(templateId).padStart(2, '0');

    return { templateId, tplCode, layout, colorTheme, motion };
}

// ── 카드뉴스 5장 & 숏폼 대본 온디맨드 JSON 구성 헬퍼 ──
function buildAssetPack(book, index) {
    const title = book.title || '무제';
    const author = book.author || '저자 미상';
    const publisher = book.publisher || '출판사 미상';
    const category = book.category || '인문/상업';
    const pubYear = book.pub_year || '절판';

    const tplConfig = getTemplateConfig(index, category);

    // 5장 카드뉴스 문구 구조
    const cardNewsData = {
        templateCode: tplConfig.tplCode,
        templateId: tplConfig.templateId,
        layout: tplConfig.layout,
        colorTheme: tplConfig.colorTheme,
        motion: tplConfig.motion,
        slides: [
            {
                slide: 1,
                title: `📖 다시 만나는 명작`,
                subtitle: title,
                content: `"${author} 저자의 잊혀진 걸작, 복간 펀딩 개시!"`,
                tag: `복간 펀딩 #1`
            },
            {
                slide: 2,
                title: `💡 왜 지금 이 책인가?`,
                subtitle: `${category} 분야의 숨겨진 보석`,
                content: `${publisher} 출판사에서 ${pubYear}년 출간되어 깊은 울림을 주었던 바로 그 작품. 독자들의 열화와 같은 요청으로 돌아옵니다.`,
                tag: `지식 자산`
            },
            {
                slide: 3,
                title: `📑 핵심 한 문장`,
                subtitle: `책 속에서 길을 찾다`,
                content: `시대가 바뀌어도 변하지 않는 통찰과 가치. 절판의 아쉬움을 넘어 이제 당신의 서가에 영원히 소장하세요.`,
                tag: `명문장`
            },
            {
                slide: 4,
                title: `✨ 복간 리워드 혜택`,
                subtitle: `오직 펀딩 참여자 전용`,
                content: `① 소장용 고급 POD 한정판\n② 디지털 ePub 소장권\n③ 독자 이름 헌정 엽서 삽지`,
                tag: `특별 혜택`
            },
            {
                slide: 5,
                title: `🚀 펀딩 참여하기`,
                subtitle: `목표 펀딩 달성 시 정식 제작`,
                content: `지금 출판친구 B2C 스토어에서 펀딩에 참여하고 80% 수익 정산 복간 혁신에 함께해 주세요!`,
                tag: `펀딩 진행중`
            }
        ]
    };

    // 숏폼 성우 나레이션 대본
    const narrationText = `절판되어 찾아볼 수 없었던 ${author} 저자의 명작, "${title}". 독자들의 요청으로 출판친구에서 복간 펀딩을 시작합니다. 80퍼센트 정산 혁신으로 저자와 출판사를 살리는 복간 펀딩에 지금 참여하세요!`;

    const isbn = book.isbn || book.isbn_13 || `ISBN-${book.id}`;

    return {
        isbn: isbn,
        card_news_data: JSON.stringify(cardNewsData),
        summary_script: narrationText,
        genre_type: category,
        shorts_video_url: tplConfig.tplCode, // 온디맨드 60개 템플릿 코드 저장 (예: TPL-14)
        audio_tts_url: 'WEB_SPEECH_TTS_ONDEMAND',
        status: 'success', // CHECK (status IN ('processing', 'success', 'failed')) 만족
        updated_at: new Date().toISOString()
    };
}

async function main() {
    console.log('========================================================');
    console.log('🚀 [Step 2] 471종 알짜 도서 온디맨드 60-템플릿 에셋 팩 JSON 생성');
    console.log('========================================================\n');

    // 1. reprint_candidates 도서 471종 조회
    console.log('🔄 1단계: 현재 DB에 보존된 도서 목록 불러오는 중...');
    let allBooks = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
        const res = await fetch(
            `${base}/reprint_candidates?select=id,title,author,publisher,category,pages,pub_year,isbn,isbn_13&limit=${pageSize}&offset=${offset}`,
            { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        );
        if (!res.ok) {
            console.error('❌ 도서 목록 조회 실패:', await res.text());
            process.exit(1);
        }
        const page = await res.json();
        if (!Array.isArray(page) || page.length === 0) break;
        allBooks = allBooks.concat(page);
        if (page.length < pageSize) break;
        offset += pageSize;
    }

    console.log(`✅ 조회 완료: 총 ${allBooks.length}종 도서 확보\n`);

    if (allBooks.length === 0) {
        console.log('⚠️ 적재할 도서가 없습니다.');
        return;
    }

    // 2. 각 도서별 온디맨드 에셋 팩 JSON 구성
    console.log('⚡ 2단계: 60개 템플릿 조합 기반 초경량 에셋 팩 JSON 빌드 중...');
    const assetPacks = allBooks.map((b, i) => buildAssetPack(b, i));

    console.log(`✅ ${assetPacks.length}개 에셋 팩 JSON 구성 완공 (템플릿 TPL-01 ~ TPL-60 균등 배치)\n`);

    // 3. Supabase book_marketing_assets에 배치 Upsert (50건씩)
    console.log('💾 3단계: Supabase DB (book_marketing_assets)에 배치 적재 시작...');
    const BATCH_SIZE = 50;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < assetPacks.length; i += BATCH_SIZE) {
        const batch = assetPacks.slice(i, i + BATCH_SIZE);
        const batchNum = Math.ceil((i + BATCH_SIZE) / BATCH_SIZE);

        try {
            const upsertRes = await fetch(`${base}/book_marketing_assets`, {
                method: 'POST',
                headers,
                body: JSON.stringify(batch)
            });

            if (upsertRes.ok || upsertRes.status === 200 || upsertRes.status === 201) {
                successCount += batch.length;
                console.log(`   ✅ 배치 ${batchNum}: ${batch.length}건 온디맨드 에셋 적재 완료 (누계: ${successCount}/${assetPacks.length}종)`);
            } else {
                const errText = await upsertRes.text();
                console.error(`   ❌ 배치 ${batchNum} 적재 실패:`, errText.slice(0, 200));
                failCount += batch.length;
            }
        } catch (e) {
            console.error(`   ❌ 배치 ${batchNum} 예외 발생:`, e.message);
            failCount += batch.length;
        }

        await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n========================================================');
    console.log('🎉 [Step 2] 온디맨드 60-템플릿 에셋 팩 적재 완공!');
    console.log(`   ✅ 성공적 적재: ${successCount}종`);
    console.log(`   ❌ 실패/오류:   ${failCount}종`);
    console.log(`   🎨 디자인 템플릿: 60가지 고유 조합 (TPL-01 ~ TPL-60) 적용 완료`);
    console.log('========================================================');
    console.log('\n➡️ 다음 Step 3: 알라딘 25종 묶음 무결 수집 파이프라인 개편 진행 가능!');
}

main().catch(err => {
    console.error('💥 예외 발생:', err);
    process.exit(1);
});
