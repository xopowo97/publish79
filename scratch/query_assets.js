// scratch/query_assets.js
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function check() {
    const rawUrl = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!rawUrl || !key) {
        console.error("Missing ENV keys");
        return;
    }
    const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
    const headers = {
        'apikey': key,
        'Authorization': `Bearer ${key}`
    };

    try {
        console.log("1. reprint_candidates 도서 5건 조회:");
        const candRes = await fetch(`${base}/reprint_candidates?limit=5`, { headers });
        const cands = await candRes.json();
        console.log(cands.map(c => ({ id: c.id, title: c.title, isbn: c.isbn })));

        console.log("\n2. book_marketing_assets 최근 10건 조회:");
        const assetRes = await fetch(`${base}/book_marketing_assets?order=updated_at.desc&limit=10`, { headers });
        const assets = await assetRes.json();
        console.log(assets.map(a => ({ isbn: a.isbn, status: a.status, title: a.summary_script?.slice(0, 30) })));
    } catch (e) {
        console.error("Error: ", e);
    }
}
check();
