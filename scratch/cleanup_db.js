// ============================================================
// scratch/cleanup_db.js
// [Step 1] 출판친구 DB 스마트 정제 스크립트
// 목적: 어린이/동화/아동 카테고리(POD 비수익) 도서를 삭제하고
//       인문/경제/자기계발/소설 등 상업 도서 471종을 안전하게 보존
//
// 사용법:
//   드라이런 (삭제 대상 목록만 조회): node scratch/cleanup_db.js
//   실제 삭제 실행:                   node scratch/cleanup_db.js --execute
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 직접 파싱 (dotenv 미설치 환경 대응)
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

// 삭제 대상 카테고리 (POD 비수익 어린이 양장본)
const PRUNE_CATEGORIES = [
    '어린이', '아동', '동화', '그림책', '유아',
    '어린이문학', '어린이/청소년', '어린이 문학', '초등',
];

// 절대 건드리지 않는 보존 대상 카테고리
const KEEP_CATEGORIES = [
    '인문학', '인문', '철학',
    '경제경영', '경제', '경영', '비즈니스',
    '자기계발',
    '소설', '소설/시/희곡', '문학',
    '사회과학', '사회',
    '역사', '역사/문화',
    '과학', '자연과학',
    '기술과학',
    '에세이', '청소년', '예술', '언어',
];

const DRY_RUN = !process.argv.includes('--execute');
const BATCH_SIZE = 50;

async function main() {
    const rawUrl = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!rawUrl || !key) {
        console.error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
        process.exit(1);
    }

    const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
    const headers = {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
    };

    console.log('========================================================');
    console.log('[출판친구] Step 1: DB 스마트 정제 스크립트');
    console.log(DRY_RUN ? '모드: 드라이런 (삭제 대상 조회만 - 실제 삭제 없음)' : '모드: 실제 삭제 실행 (--execute 플래그 감지)');
    console.log('========================================================\n');

    // 1단계: 전체 reprint_candidates 조회 (페이징)
    console.log('1단계: reprint_candidates 전체 목록 조회 중...');
    let allBooks = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
        const res = await fetch(
            `${base}/reprint_candidates?select=id,title,category,author,publisher&limit=${pageSize}&offset=${offset}`,
            { headers }
        );
        if (!res.ok) {
            const err = await res.text();
            console.error('Supabase 조회 실패 (offset=' + offset + '):', err);
            process.exit(1);
        }
        const page = await res.json();
        if (!Array.isArray(page) || page.length === 0) break;
        allBooks = allBooks.concat(page);
        if (page.length < pageSize) break;
        offset += pageSize;
    }

    console.log('전체 조회 완료: ' + allBooks.length + '종\n');

    // 2단계: 삭제/보존 분류
    const pruneTargets = [];
    const keepBooks = [];
    const unclassified = [];

    for (const book of allBooks) {
        const cat = (book.category || '').trim();
        const isPrune = PRUNE_CATEGORIES.some(pc => cat.includes(pc));
        const isKeep = KEEP_CATEGORIES.some(kc => cat.includes(kc));

        if (isPrune) pruneTargets.push(book);
        else if (isKeep) keepBooks.push(book);
        else unclassified.push(book);
    }

    console.log('----------------------------------------------------------');
    console.log('분류 결과:');
    console.log('  [삭제 대상] 어린이/아동/동화: ' + pruneTargets.length + '종');
    console.log('  [보존 대상] 상업 도서:         ' + keepBooks.length + '종');
    console.log('  [미분류]   카테고리 없음 등:    ' + unclassified.length + '종');
    console.log('----------------------------------------------------------\n');

    // 3단계: 삭제 대상 샘플 출력
    console.log('삭제 대상 샘플 (상위 20종):');
    pruneTargets.slice(0, 20).forEach((b, i) => {
        console.log('  ' + String(i + 1).padStart(2, '0') + '. [' + (b.category || '') + '] ' + b.title);
    });
    if (pruneTargets.length > 20) {
        console.log('  ... 외 ' + (pruneTargets.length - 20) + '종 추가 대상 존재');
    }

    if (unclassified.length > 0) {
        console.log('\n미분류 샘플 (상위 10종) - 삭제 안됨, 수동 검토 권장:');
        unclassified.slice(0, 10).forEach((b, i) => {
            console.log('  ' + String(i + 1).padStart(2, '0') + '. [' + (b.category || '카테고리없음') + '] ' + b.title);
        });
    }

    // 드라이런이면 종료
    if (DRY_RUN) {
        console.log('\n========================================================');
        console.log('드라이런 완료. 실제 삭제 없음.');
        console.log('  실제 삭제를 실행하려면:');
        console.log('  node scratch/cleanup_db.js --execute');
        console.log('========================================================');
        return;
    }

    // 4단계: 실제 배치 삭제 실행 (50건씩)
    if (pruneTargets.length === 0) {
        console.log('\n삭제 대상 도서가 없습니다. 완료!');
        return;
    }

    console.log('\n실제 삭제 시작: 총 ' + pruneTargets.length + '종 (' + BATCH_SIZE + '건씩 배치 처리)');
    let deletedTotal = 0;
    let errorTotal = 0;
    const ids = pruneTargets.map(b => b.id);

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const inClause = '(' + batch.join(',') + ')';
        const batchNum = Math.ceil((i + BATCH_SIZE) / BATCH_SIZE);

        try {
            const delRes = await fetch(
                `${base}/reprint_candidates?id=in.${inClause}`,
                { method: 'DELETE', headers }
            );

            if (delRes.ok || delRes.status === 204) {
                deletedTotal += batch.length;
                console.log('  배치 ' + batchNum + ': ' + batch.length + '건 삭제 완료 (누계: ' + deletedTotal + '종)');
            } else {
                const errText = await delRes.text();
                console.error('  배치 ' + batchNum + ' 삭제 실패:', errText.slice(0, 200));
                errorTotal += batch.length;
            }
        } catch (e) {
            console.error('  배치 ' + batchNum + ' 예외 발생:', e.message);
            errorTotal += batch.length;
        }

        await new Promise(r => setTimeout(r, 200));
    }

    // 5단계: 최종 결과
    console.log('\n========================================================');
    console.log('[Step 1] DB 정제 완료!');
    console.log('  삭제 완료:          ' + deletedTotal + '종');
    console.log('  실패/오류:          ' + errorTotal + '종');
    console.log('  보존 (상업 도서):    ' + keepBooks.length + '종');
    console.log('  미분류 유지:         ' + unclassified.length + '종');
    console.log('  최종 잔여 DB:        ' + (allBooks.length - deletedTotal) + '종');
    console.log('========================================================');
    console.log('다음 Step 2: 알짜 471종 온디맨드 에셋 팩 JSON 적재 작업 진행 예정');
}

main().catch(err => {
    console.error('치명적 예외 발생:', err);
    process.exit(1);
});
