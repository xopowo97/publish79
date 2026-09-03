// api/login.js — [15번 보안_보안관] Vercel 서버리스 백엔드 인증 및 세션 격리 API
// Node 18+ 네이티브 전역 fetch 사용 (외부 라이브러리 0개 완벽 호환)

const _loginRateLimitMap = new Map();
const LOGIN_RATE_LIMIT_MAX = 15;
const LOGIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkLoginRateLimit(ip) {
    const now = Date.now();
    const entry = _loginRateLimitMap.get(ip);
    if (!entry || now - entry.windowStart > LOGIN_RATE_LIMIT_WINDOW_MS) {
        _loginRateLimitMap.set(ip, { count: 1, windowStart: now });
        return true;
    }
    entry.count += 1;
    return entry.count <= LOGIN_RATE_LIMIT_MAX;
}

export default async function handler(req, res) {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') {
        return res.status(200).send('OK');
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'POST 메소드만 지원합니다.' });
    }

    // IP 기준 Rate Limit 검사
    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    if (!checkLoginRateLimit(clientIp)) {
        console.warn(`[api/login] 로그인 시도 빈도 초과 차단 — IP: ${clientIp}`);
        return res.status(429).json({
            success: false,
            error: '로그인 시도 횟수를 초과했습니다. 1분 후 다시 시도해주세요.'
        });
    }

    const { id, password } = req.body || {};
    const inputId = (id || '').trim();
    const inputPw = (password || '').trim();

    if (!inputId || !inputPw) {
        return res.status(400).json({ success: false, error: '아이디와 비밀번호를 모두 입력해주세요.' });
    }

    try {
        const rawUrl = process.env.SUPABASE_URL;
        const key    = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

        if (!rawUrl || !key) {
            throw new Error('Supabase 서버 환경변수가 설정되지 않았습니다.');
        }

        const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
        const headers = {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
        };

        // 1. 공모전 심사위원 계정 검증
        if (inputId === 'culture' && inputPw === 'culture1234') {
            return res.status(200).json({
                success: true,
                role: 'judge',
                userId: 'culture',
                profile: { id: 'culture', name: '공모전 심사위원단' }
            });
        }

        // 2. 최고관리자 (Admin) 및 기본 계정 설정 검증
        let configData = {};
        try {
            const cfgRes = await fetch(`${base}/master_config?id=eq.config&select=data&limit=1`, { method: 'GET', headers });
            if (cfgRes.ok) {
                const cfgRows = await cfgRes.json();
                if (cfgRows && cfgRows.length > 0) configData = cfgRows[0].data || {};
            }
        } catch (e) {
            console.warn('[api/login] master_config 조회 지연:', e.message);
        }

        const adminPw = configData?.auth?.admin?.pw || '1234';
        const pubLegacyPw = configData?.auth?.publisher?.pw || '1234';
        const printLegacyPw = configData?.auth?.printer?.pw || '1234';

        if (inputId === (configData?.auth?.admin?.id || 'admin') && inputPw === adminPw) {
            return res.status(200).json({
                success: true,
                role: 'admin',
                userId: 'admin',
                profile: { id: 'admin', name: '최고관리자' }
            });
        }

        // 3. 레거시 기본 계정 호환
        if (inputId === 'pub' && inputPw === pubLegacyPw) {
            return res.status(200).json({
                success: true,
                role: 'publisher',
                userId: 'pub',
                profile: { id: 'pub', name: '기본출판사', grade: '일반등급(표준)' }
            });
        }
        if (inputId === 'print' && inputPw === printLegacyPw) {
            return res.status(200).json({
                success: true,
                role: 'printer',
                userId: 'print',
                profile: { id: 'print', name: '기본인쇄소' }
            });
        }

        // 4. 출판사 파트너 (`partners` 테이블) 검증
        const partnerRes = await fetch(`${base}/partners?select=*`, { method: 'GET', headers });
        if (partnerRes.ok) {
            const partners = await partnerRes.json();
            if (partners && partners.length > 0) {
                const matchedPartner = partners.find(p => p.id === inputId || p.name === inputId);
                if (matchedPartner) {
                    const targetPw = matchedPartner.password || matchedPartner.pw || '1234';
                    if (inputPw === targetPw) {
                        const safeProfile = {
                            id: matchedPartner.id,
                            name: matchedPartner.name,
                            grade: matchedPartner.grade || '일반등급(표준)',
                            bizNum: matchedPartner.biz_num || matchedPartner.bizNum || '',
                            addr: matchedPartner.addr || '',
                            addrDetail: matchedPartner.addr_detail || matchedPartner.addrDetail || '',
                            ceoName: matchedPartner.ceo_name || matchedPartner.ceoName || '',
                            bizType: matchedPartner.biz_type || matchedPartner.bizType || '',
                            bizItem: matchedPartner.biz_item || matchedPartner.bizItem || '',
                            taxEmail: matchedPartner.tax_email || matchedPartner.taxEmail || '',
                            managers: matchedPartner.managers || []
                        };
                        return res.status(200).json({
                            success: true,
                            role: 'publisher',
                            userId: matchedPartner.id,
                            profile: safeProfile
                        });
                    }
                }
            }
        }

        // 5. 인쇄소 파트너 (`printers` 테이블) 검증
        const printerRes = await fetch(`${base}/printers?select=*`, { method: 'GET', headers });
        if (printerRes.ok) {
            const printers = await printerRes.json();
            if (printers && printers.length > 0) {
                const matchedPrinter = printers.find(p => p.id === inputId || p.name === inputId);
                if (matchedPrinter) {
                    const targetPw = matchedPrinter.password || matchedPrinter.pw || '1234';
                    if (inputPw === targetPw) {
                        const safeProfile = {
                            id: matchedPrinter.id,
                            name: matchedPrinter.name,
                            bizNum: matchedPrinter.biz_num || matchedPrinter.bizNum || '',
                            addr: matchedPrinter.addr || '',
                            addrDetail: matchedPrinter.addr_detail || matchedPrinter.addrDetail || '',
                            ceoName: matchedPrinter.ceo_name || matchedPrinter.ceoName || '',
                            bizType: matchedPrinter.biz_type || matchedPrinter.bizType || '',
                            bizItem: matchedPrinter.biz_item || matchedPrinter.bizItem || '',
                            managers: matchedPrinter.managers || []
                        };
                        return res.status(200).json({
                            success: true,
                            role: 'printer',
                            userId: matchedPrinter.id,
                            profile: safeProfile
                        });
                    }

                    if (matchedPrinter.managers && matchedPrinter.managers.length > 0) {
                        const matchedManager = matchedPrinter.managers.find(m => m.subPw === inputPw);
                        if (matchedManager) {
                            const isSettle = matchedManager.perms && matchedManager.perms.includes('settle');
                            const safeProfile = {
                                id: matchedPrinter.id,
                                name: matchedPrinter.name,
                                managerName: matchedManager.name,
                                isManager: true
                            };
                            return res.status(200).json({
                                success: true,
                                role: isSettle ? 'printer' : 'printer_worker',
                                userId: matchedPrinter.id,
                                profile: safeProfile
                            });
                        }
                    }
                }
            }
        }

        return res.status(401).json({
            success: false,
            error: '아이디 또는 비밀번호가 올바르지 않습니다.'
        });

    } catch (err) {
        console.error('[api/login] 서버 인증 오류:', err);
        return res.status(500).json({
            success: false,
            error: `인증 서버 오류가 발생했습니다 (${err.message})`
        });
    }
}
