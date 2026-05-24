import https from 'https';

// Universal HTTP helper function compatible with all Node.js versions (including old runtimes without global fetch)
async function httpCall(url, method, headers, body) {
    if (typeof fetch === 'function') {
        try {
            const options = {
                method: method,
                headers: headers
            };
            if (body) {
                options.body = typeof body === 'object' ? JSON.stringify(body) : body;
            }
            const res = await fetch(url, options);
            if (res.ok) {
                try {
                    return await res.json();
                } catch (e) {
                    return await res.text();
                }
            } else {
                const text = await res.text();
                throw new Error(`Status ${res.status}: ${text}`);
            }
        } catch (fetchErr) {
            console.warn("Global fetch failed, falling back to https module:", fetchErr.message);
        }
    }

    return new Promise((resolve, reject) => {
        try {
            const parsedUrl = new URL(url);
            const reqHeaders = { ...headers };
            let bodyData = '';
            if (body) {
                bodyData = typeof body === 'object' ? JSON.stringify(body) : body;
                reqHeaders['Content-Length'] = Buffer.byteLength(bodyData);
                if (!reqHeaders['Content-Type']) {
                    reqHeaders['Content-Type'] = 'application/json';
                }
            }

            const options = {
                hostname: parsedUrl.hostname,
                port: 443,
                path: parsedUrl.pathname + parsedUrl.search,
                method: method,
                headers: reqHeaders
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(responseData ? JSON.parse(responseData) : {});
                        } catch (e) {
                            resolve(responseData);
                        }
                    } else {
                        reject(new Error(`HTTPS status ${res.statusCode}: ${responseData}`));
                    }
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            if (bodyData) {
                req.write(bodyData);
            }
            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

// Helper function to read status from Supabase (with master_config fallback)
async function readStatus(pr) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
        console.error("❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined in process.env!");
        return 'PENDING';
    }

    // Ensure trailing slash is cleaned
    const cleanUrl = supabaseUrl.endsWith('/') ? supabaseUrl.slice(0, -1) : supabaseUrl;
    const restUrl = `${cleanUrl}/rest/v1`;

    const headers = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
    };

    // Attempt 1: read from deploy_status table
    try {
        const url = `${restUrl}/deploy_status?pr=eq.${pr}&select=status`;
        const list = await httpCall(url, 'GET', headers);
        if (list && list.length > 0) {
            return list[0].status;
        }
    } catch (e) {
        console.warn("⚠️ deploy_status table read failed, trying fallback:", e.message);
    }

    // Attempt 2: fallback to master_config
    try {
        const url = `${restUrl}/master_config?id=eq.deploy-state&select=data`;
        const list = await httpCall(url, 'GET', headers);
        if (list && list.length > 0) {
            const deployState = list[0].data || {};
            return deployState[pr] || 'PENDING';
        }
    } catch (err) {
        console.error("❌ Fallback master_config read failed:", err.message);
    }
    
    return 'PENDING';
}

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

    // Read status from Supabase
    const status = await readStatus(pr);

    return res.status(200).json({ pr, status });
}
