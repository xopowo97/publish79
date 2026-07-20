import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getEnv() {
    const envPath = path.resolve(__dirname, '../.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const env = {};
    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const idx = trimmed.indexOf('=');
            if (idx > 0) {
                const key = trimmed.substring(0, idx).trim();
                const val = trimmed.substring(idx + 1).trim();
                env[key] = val;
            }
        }
    });
    return env;
}

async function query() {
    const env = getEnv();
    const rawUrl = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!rawUrl || !key) {
        console.error("Missing ENV keys!");
        return;
    }
    const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
    const headers = {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json'
    };
    try {
        // rag_knowledge 테이블의 1개 로우를 조회하여 컬럼 스키마 유추
        const res = await fetch(`${base}/rag_knowledge?select=*&limit=1`, {
            method: 'GET',
            headers
        });
        if (res.ok) {
            const data = await res.json();
            console.log("RAG Row fetched:", data);
            if (data.length > 0) {
                console.log("Columns on rag_knowledge:", Object.keys(data[0]));
            } else {
                console.log("rag_knowledge is currently empty.");
                // 데이터가 비었으면 RPC definition 등 다른 수단을 탐색해야 할 수 있습니다.
            }
        } else {
            console.error("Request failed status:", res.status, await res.text());
        }
    } catch (e) {
        console.error("Error querying columns:", e);
    }
}
query();
