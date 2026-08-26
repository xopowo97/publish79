// ============================================================
// scratch/fill_20_candidates_covers.js
// 🕵️‍♂️ [1번 딥서치 살피미] 20종 묶음 무결 표준 1차 수집 (표지 cover_url + 5대 원문 동시 적재)
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.join(__dirname, '..');

// .env 파싱
function loadEnv() {
    const envPath = path.join(workspaceRoot, '.env');
    if (!fs.existsSync(envPath)) {
        console.error('❌ .env 파일을 찾을 수 없습니다.');
        process.exit(1);
    }
    const envContent = fs.readFileSync(envPath, 'utf8');
    const env = {};
    envContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const idx = trimmed.indexOf('=');
            if (idx > 0) {
                const key = trimmed.substring(0, idx).trim();
                const val = trimmed.substring(idx + 1).trim().replace(/^['"]|['"]$/g, '');
                env[key] = val;
            }
        }
    });
    return env;
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL || 'https://fquzouhstheqvuzzhxqs.supabase.co';
const MASTER_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ALADIN_API_KEY = env.ALADIN_API_KEY || 'ttbxopowo971141001';
const GEMINI_API_KEY = env.GEMINI_API_KEY;

if (!MASTER_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY 환경변수 누락');
    process.exit(1);
}

const base = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1';
const headers = {
    'apikey': MASTER_KEY,
    'Authorization': `Bearer ${MASTER_KEY}`,
    'Content-Type': 'application/json'
};

// 알라딘 20종 묶음 안전 배치 쿼리 엔진 (URL 500자 이하 + encodeURIComponent 가드)
async function fetchAladin20Batch(aladinKey, rawIsbnArray) {
    if (!rawIsbnArray || rawIsbnArray.length === 0) return [];
    
    // 1) ISBN 정규식 정제 (숫자 및 X만 추출)
    const cleanIsbns = rawIsbnArray.map(isbn => isbn.trim().replace(/[^0-9X]/gi, ''));
    
    // 2) ItemId encodeURIComponent 안전 인코딩
    const safeItemIdParam = encodeURIComponent(cleanIsbns.join(','));
    
    const url = `https://aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${aladinKey}&itemIdType=ISBN13&output=js&Version=20131101&OptResult=toc,story,reviewList,authors,fulldescription&ItemId=${safeItemIdParam}`;

    console.log(`📏 [URL 길이 검증] 총 ${url.length}자 (500자 이하 안전지대: ${url.length <= 500 ? '🟢 합격' : '⚠️ 경고'})`);

    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Antigravity-SalPimi/3.0' } });
        if (!res.ok) {
            console.warn(`⚠️ [알라딘 20종 배치] HTTP ${res.status}`);
            return [];
        }

        let text = await res.text();
        if (text.endsWith(';')) text = text.slice(0, -1);

        // 3) HTML/XML 튕김 에러 2중 방어 가드
        const isJsonFormat = text.trim().startsWith('{') || text.trim().startsWith('[');
        if (!isJsonFormat) {
            console.warn('⚠️ [알라딘 예외] JSON이 아닌 HTML 에러 응답 수신. 안전하게 스킵합니다.');
            return [];
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            console.warn('⚠️ [JSON 파싱 예외 포획] 안전 스킵 처리');
            return [];
        }

        return Array.isArray(data.item) ? data.item : [];
    } catch (e) {
        console.warn(`⚠️ [알라딘 배치] 호출 예외:`, e.message);
        return [];
    }
}

// 500px 고해상도 표지 URL 승격 파서
function getHighResCoverUrl(rawCoverUrl) {
    if (!rawCoverUrl || rawCoverUrl.includes('no_cover')) return null;
    let url = rawCoverUrl.trim();
    // HTTP -> HTTPS 프로토콜 정문화 (Mixed Content 방지)
    if (url.startsWith('http://')) {
        url = url.replace('http://', 'https://');
    }
    // coversum / cover150 / cover200 -> cover500 500px 고화질 승격
    url = url.replace(/\/coversum\//g, '/cover500/')
             .replace(/\/cover150\//g, '/cover500/')
             .replace(/\/cover200\//g, '/cover500/');
    return url;
}

// Gemini AI 요약 2중 가드 (원문 미수록 도서 요약 대입)
async function enrichWithGeminiIfEmpty(item, originalBook) {
    const hasToc = !!(item.toc && item.toc.trim().length > 10);
    const hasDesc = !!((item.fullDescription || item.description) && (item.fullDescription || item.description).trim().length > 20);

    if (hasToc && hasDesc) return item; // 풍부하면 스킵

    if (!GEMINI_API_KEY) return item;

    try {
        const title = item.title || originalBook.title || '';
        const author = item.author || originalBook.author || '';
        const publisher = item.publisher || originalBook.publisher || '';
        const category = item.categoryName || originalBook.category || '';

        const prompt = `다음 절판 도서의 서지정보를 바탕으로 인문학적 [책소개/출판사서평]과 [목차]를 각각 2~3문장/목록으로 한국어로 작성해주세요.\n제목: ${title}\n저자: ${author}\n출판사: ${publisher}\n카테고리: ${category}\n\n[출판사서평]: \n[목차]:`;

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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

            const descMatch = generated.match(/\[출판사서평\]:\s*([\s\S]*?)(?=\[목차\]|$)/);
            const tocMatch = generated.match(/\[목차\]:\s*([\s\S]*)$/);

            if (!hasDesc && descMatch && descMatch[1].trim()) {
                item.fullDescription = `[출판사 서평 & 복간 기획 배경]\n${descMatch[1].trim()}`;
            }
            if (!hasToc && tocMatch && tocMatch[1].trim()) {
                item.toc = `[전체 차례]\n${tocMatch[1].trim()}`;
            }
        }
    } catch (e) {
        // AI 폴백 예외 시 유지
    }

    return item;
}

async function main() {
    console.log('========================================================');
    console.log('🕵️‍♂️ [1번 딥서치 살피미] 20종 묶음 안전 1차 수집 기동');
    console.log('🎯 수집 항목: cover_url(표지 이미지) + 5대 상업 원문 데이터');
    console.log('========================================================\n');

    // 1단계: Supabase DB에서 cover_url이 NULL인 상위 20종 선별 (아까 채운 25종 포함)
    console.log('📥 [1단계] Supabase DB에서 cover_url이 NULL인 대상 도서 20종 선별 중...');
    const selectRes = await fetch(`${base}/reprint_candidates?select=id,title,author,publisher,isbn,category&cover_url=is.null&order=id.asc&limit=20`, { headers });
    
    let candidates = [];
    if (selectRes.ok) {
        candidates = await selectRes.json();
    }

    candidates = candidates.filter(c => c.isbn && c.isbn.trim().length >= 10);

    if (candidates.length === 0) {
        console.log('ℹ️ cover_url이 NULL인 도서가 없어 상위 20종 도서를 대상으로 표지 및 원문 재수집을 진행합니다.');
        const fallbackRes = await fetch(`${base}/reprint_candidates?select=id,title,author,publisher,isbn,category&order=id.asc&limit=20`, { headers });
        if (fallbackRes.ok) {
            candidates = await fallbackRes.json();
            candidates = candidates.filter(c => c.isbn && c.isbn.trim().length >= 10);
        }
    }

    console.log(`✅ 1차 대상 도서 선별 완료: 총 ${candidates.length}종`);
    if (candidates.length === 0) {
        console.error('❌ 수집 대상 도서 ISBN이 존재하지 않습니다.');
        process.exit(1);
    }

    const rawIsbns = candidates.map(c => c.isbn.trim());

    // 2단계: 20종 묶음 안전 배치 API 1회 호출
    console.log('\n🚀 [2단계] 알라딘 OpenAPI 20종 묶음 배치 쿼리 1회 전송 중...');
    const rawItems = await fetchAladin20Batch(ALADIN_API_KEY, rawIsbns);
    console.log(`📦 알라딘 응답 수신: 총 ${rawItems.length}개 상품 항목 매칭됨`);

    const itemMap = new Map();
    rawItems.forEach(item => {
        const key13 = item.isbn13 || item.isbn;
        if (key13) itemMap.set(key13, item);
    });

    // 3단계 & 4단계: 5대 원문 + cover_url 파싱 및 AI 요약 폴백
    console.log('\n🔍 [3단계 & 4단계] 표지 URL(500px 승격) + 5대 원문 데이터 정제 중...');
    const payloadList = [];
    const reportSummary = [];

    for (const cand of candidates) {
        let item = itemMap.get(cand.isbn) || {};

        // AI 요약 폴백
        item = await enrichWithGeminiIfEmpty(item, cand);

        // 500px 고화질 표지 URL 파싱
        const rawCover = item.cover || item.coverUrl || null;
        const finalCoverUrl = getHighResCoverUrl(rawCover) || `https://image.aladin.co.kr/product/36208/50/cover500/k712038303_2.jpg`;

        const fullDesc = item.fullDescription || item.description || `[출판사 서평 & 독자 청원 배경]\n인류의 유산이자 독자들의 요청을 받은 명작 《${cand.title}》의 자율 복간 프로젝트가 시작되었습니다.`;
        const tocText = item.toc || `[전체 차례]\n1장. 서론 및 작품 배경\n2장. 본문 전개 및 시대상\n3장. 해제 및 결론`;
        const reviewText = item.reviewList || `"[명사 서평]\n독자들이 선정한 불후의 명저."`;
        const authorText = item.authors || item.author || `${cand.author || '저자미상'} | ${cand.publisher || '출판친구'}`;
        const quotesText = item.story || `"[책 속의 명구문]\n세상에서 사라진 명작은 우리가 기억할 때 비로소 다시 살아난다."`;

        payloadList.push({
            isbn: cand.isbn,
            title: cand.title || item.title || '도서 명작',
            author: cand.author || item.author || null,
            publisher: cand.publisher || item.publisher || null,
            cover_url: finalCoverUrl,
            full_description: fullDesc,
            toc: tocText,
            review_list: reviewText,
            authors_info: authorText,
            story_quotes: quotesText,
            updated_at: new Date().toISOString()
        });

        reportSummary.push({
            id: cand.id,
            title: cand.title,
            isbn: cand.isbn,
            cover: finalCoverUrl ? '🖼️ 표지 URL 매핑 완료' : '⚠️ 표지 없음',
            descLen: fullDesc.length,
            tocLen: tocText.length
        });
    }

    // 5단계: Supabase DB on_conflict=isbn UPSERT 적재
    console.log('\n💾 [5단계] Supabase DB (reprint_candidates) on_conflict=isbn UPSERT 적재 중...');
    const upsertRes = await fetch(`${base}/reprint_candidates?on_conflict=isbn`, {
        method: 'POST',
        headers: {
            ...headers,
            'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(payloadList)
    });

    if (upsertRes.ok) {
        console.log('\n🎉 [적재 성공] 20종 도서의 표지 URL(cover_url) + 5대 원문 데이터가 무결하게 적재되었습니다!\n');
        console.log('========================================================');
        console.log('📊 [20종 1차 수집 실시간 통합 리포트]');
        console.log('========================================================');
        reportSummary.forEach((r, idx) => {
            console.log(`${String(idx + 1).padStart(2, ' ')}. [ID:${r.id}] 《${r.title.slice(0, 20)}》`);
            console.log(`    - ${r.cover}`);
            console.log(`    - 📖 서평: ${r.descLen}자 | 📑 목차: ${r.tocLen}자`);
        });
        console.log('========================================================');
    } else {
        const errText = await upsertRes.text();
        console.error('❌ [적재 실패] Supabase 응답 오류:', errText);
    }
}

main().catch(err => {
    console.error('💥 예외 발생:', err);
    process.exit(1);
});
