import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 파일 수동 파싱
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
        const res = await fetch(`${base}/reprint_candidates?select=isbn,title,created_at`, {
            method: 'GET',
            headers
        });
        if (res.ok) {
            const data = await res.json();
            console.log("Actual row count in DB:", data.length);
            if (data.length > 0) {
                console.log("Last 10 added books:");
                data.slice(-10).forEach(b => console.log(`- [${b.isbn}] ${b.title} (${b.created_at})`));
            }
        } else {
            console.error("Request failed with status:", res.status, await res.text());
        }
    } catch (e) {
        console.error("Error querying database:", e);
    }
}
query();
