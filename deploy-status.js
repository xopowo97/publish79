import fs from 'fs';
import path from 'path';

// Helper function to read status from Supabase (with master_config fallback)
async function readStatus(pr) {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://fquzouhstheqvuzzhxqs.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_BOtAPo474zF0XsKOxhKxsQ_wBqY1pcn';
    
    const restUrl = `${supabaseUrl}/rest/v1`;

    // Attempt 1: read from deploy_status table
    try {
        const res = await fetch(`${restUrl}/deploy_status?pr=eq.${pr}&select=status`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });
        if (res.ok) {
            const list = await res.json();
            if (list && list.length > 0) {
                return list[0].status;
            }
        }
    } catch (e) {
        console.warn("deploy_status table read failed, trying fallback:", e.message);
    }

    // Attempt 2: fallback to master_config
    try {
        const getRes = await fetch(`${restUrl}/master_config?id=eq.deploy-state&select=data`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });
        if (getRes.ok) {
            const list = await getRes.json();
            if (list && list.length > 0) {
                const deployState = list[0].data || {};
                return deployState[pr] || 'PENDING';
            }
        }
    } catch (err) {
        console.error("Fallback master_config read failed:", err.message);
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
