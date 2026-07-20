const fs = require('fs');
const path = require('path');

// .env 파일 파싱
const envPath = path.join(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
    console.error('.env file not found at: ' + envPath);
    process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        env[key] = val;
    }
});

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env');
    process.exit(1);
}

const base = url.replace(/\/+$/, '') + '/rest/v1';

async function checkAsset() {
    console.log('Connecting to Supabase at:', url);
    
    // 1. reprint_candidates에서 '위버멘쉬' 검색
    const bookRes = await fetch(`${base}/reprint_candidates?select=*&title=like.*위버멘쉬*`, {
        method: 'GET',
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Accept': 'application/json'
        }
    });

    if (!bookRes.ok) {
        console.error('Error fetching reprint_candidates:', bookRes.statusText);
        return;
    }

    const books = await bookRes.json();
    console.log(`\n=== reprint_candidates 내 위버멘쉬 검색 결과 (${books.length}건) ===`);
    if (books.length === 0) {
        console.log('위버멘쉬 도서가 수집 테이블에 존재하지 않습니다.');
    } else {
        books.forEach(b => {
            console.log(`- 제목: ${b.title} | 저자: ${b.author} | ISBN: ${b.isbn13} | 저작권: ${b.copyright_status}`);
        });
    }

    // 2. book_marketing_assets에서 위버멘쉬의 ISBN 혹은 전체 레코드 조회
    const assetRes = await fetch(`${base}/book_marketing_assets?select=*`, {
        method: 'GET',
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Accept': 'application/json'
        }
    });

    if (!assetRes.ok) {
        console.error('Error fetching book_marketing_assets:', assetRes.statusText);
        return;
    }

    const assets = await assetRes.json();
    console.log(`\n=== book_marketing_assets 내 전체 적재 현황 (${assets.length}건) ===`);
    if (assets.length === 0) {
        console.log('마케팅 에셋 테이블에 적재된 책이 하나도 없습니다.');
    } else {
        assets.forEach((a, i) => {
            console.log(`[${i+1}] ISBN: ${a.isbn} | 상태: ${a.status}`);
            console.log(`    - 숏폼 비디오 URL: "${a.shorts_video_url}"`);
            console.log(`    - 카드뉴스 카피 존재 여부: ${a.card_news_data ? '있음' : '없음'}`);
        });
    }
}

checkAsset().catch(console.error);
