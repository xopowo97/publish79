import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
    // CORS 프리플라이트 요청 지원 (로컬 UAT 테스트가 가능하도록 허용)
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { pr } = req.query;

    if (!pr) {
        return res.status(400).json({ error: 'Missing pr query parameter.' });
    }

    const stateFile = path.join(process.cwd(), 'api/deploy-state.json');
    let state = {};
    if (fs.existsSync(stateFile)) {
        try {
            state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        } catch (e) {
            state = {};
        }
    }

    const status = state[pr] || 'PENDING';

    return res.status(200).json({ pr, status });
}
