// api/control-helper.js
// ============================================================
// [통합 관제 & 인증 API] 로그인 세션 격리 / 카테고리 자산 집계 / 새벽 크론 자율 수집 라우터
// ============================================================

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
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const action = req.query.action || (req.body && req.body.action);
    const rawUrl = process.env.SUPABASE_URL;
    const supKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!rawUrl || !supKey) {
        return res.status(500).json({ error: '데이터베이스 연결 환경 변수가 설정되지 않았습니다.' });
    }

    const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
    const headers = {
        'apikey': supKey,
        'Authorization': `Bearer ${supKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    // ─── 분기 0: 백엔드 보안 인증 및 세션 격리 (action === 'login') ───
    if (action === 'login' || req.body?.id) {
        const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
        if (!checkLoginRateLimit(clientIp)) {
            return res.status(429).json({ success: false, error: '로그인 시도 횟수를 초과했습니다. 1분 후 다시 시도해주세요.' });
        }

        const { id, password } = req.body || {};
        const inputId = (id || '').trim();
        const inputPw = (password || '').trim();

        if (!inputId || !inputPw) {
            return res.status(400).json({ success: false, error: '아이디와 비밀번호를 모두 입력해주세요.' });
        }

        try {
            // 1. 공모전 심사위원 검증
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
                console.warn('[login] master_config 조회 지연:', e.message);
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

            // 3. 레거시 기본 계정
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

            // 4. 출판사 파트너 검증 (비밀번호 마스킹)
            const partnerRes = await fetch(`${base}/partners?select=*`, { method: 'GET', headers });
            if (partnerRes.ok) {
                const partners = await partnerRes.json();
                if (partners && partners.length > 0) {
                    const matched = partners.find(p => p.id === inputId || p.name === inputId);
                    if (matched) {
                        const targetPw = matched.password || matched.pw || '1234';
                        if (inputPw === targetPw) {
                            const safeProfile = {
                                id: matched.id,
                                name: matched.name,
                                grade: matched.grade || '일반등급(표준)',
                                bizNum: matched.biz_num || matched.bizNum || '',
                                addr: matched.addr || '',
                                addrDetail: matched.addr_detail || matched.addrDetail || '',
                                ceoName: matched.ceo_name || matched.ceoName || '',
                                bizType: matched.biz_type || matched.bizType || '',
                                bizItem: matched.biz_item || matched.bizItem || '',
                                taxEmail: matched.tax_email || matched.taxEmail || '',
                                managers: matched.managers || []
                            };
                            return res.status(200).json({
                                success: true,
                                role: 'publisher',
                                userId: matched.id,
                                profile: safeProfile
                            });
                        }
                    }
                }
            }

            // 5. 인쇄소 파트너 검증 (비밀번호 마스킹)
            const printerRes = await fetch(`${base}/printers?select=*`, { method: 'GET', headers });
            if (printerRes.ok) {
                const printers = await printerRes.json();
                if (printers && printers.length > 0) {
                    const matched = printers.find(p => p.id === inputId || p.name === inputId);
                    if (matched) {
                        const targetPw = matched.password || matched.pw || '1234';
                        if (inputPw === targetPw) {
                            const safeProfile = {
                                id: matched.id,
                                name: matched.name,
                                bizNum: matched.biz_num || matched.bizNum || '',
                                addr: matched.addr || '',
                                addrDetail: matched.addr_detail || matched.addrDetail || '',
                                ceoName: matched.ceo_name || matched.ceoName || '',
                                bizType: matched.biz_type || matched.bizType || '',
                                bizItem: matched.biz_item || matched.bizItem || '',
                                managers: matched.managers || []
                            };
                            return res.status(200).json({
                                success: true,
                                role: 'printer',
                                userId: matched.id,
                                profile: safeProfile
                            });
                        }

                        if (matched.managers && matched.managers.length > 0) {
                            const matchedManager = matched.managers.find(m => m.subPw === inputPw);
                            if (matchedManager) {
                                const isSettle = matchedManager.perms && matchedManager.perms.includes('settle');
                                return res.status(200).json({
                                    success: true,
                                    role: isSettle ? 'printer' : 'printer_worker',
                                    userId: matched.id,
                                    profile: { id: matched.id, name: matched.name, managerName: matchedManager.name, isManager: true }
                                });
                            }
                        }
                    }
                }
            }

            return res.status(401).json({ success: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });

        } catch (err) {
            console.error('[login error]', err);
            return res.status(500).json({ success: false, error: `인증 오류: ${err.message}` });
        }
    }

    // ─── 분기 1: 장르별 누적 도서 자산 집계 (stats) ───
    if (action === 'stats') {
        try {
            const response = await fetch(`${base}/reprint_candidates?select=category&limit=5000`, {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(502).json({ error: 'Supabase 통계 조회 실패', detail: errText });
            }

            const data = await response.json();
            const stats = {};
            data.forEach(item => {
                const cat = item.category || '미분류';
                stats[cat] = (stats[cat] || 0) + 1;
            });

            return res.status(200).json({
                success: true,
                totalCount: data.length,
                stats
            });
        } catch (err) {
            return res.status(500).json({ error: '통계 집계 중 예외 발생', detail: err.message });
        }
    }

    // ─── 분기 2: 상업 운했 수집 키워드 로테이션 (크론) ───
    if (action === 'cron') {
        const host = req.headers.host || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';

        const COMMERCIAL_KEYWORDS = [
            { keyword: '인문학', kdc: '1' },
            { keyword: '철학', kdc: '1' },
            { keyword: '경제경영', kdc: '3' },
            { keyword: '자기계발', kdc: '3' },
            { keyword: '사회과학', kdc: '3' },
            { keyword: '역사', kdc: '9' },
            { keyword: '소설', kdc: '8' },
            { keyword: '과학', kdc: '4' },
            { keyword: '예술', kdc: '6' },
        ];

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const totalMinutes = currentHour * 60 + currentMinute;
        const selected = COMMERCIAL_KEYWORDS[totalMinutes % COMMERCIAL_KEYWORDS.length];
        const jitterDelay = Math.floor(Math.random() * 2000) + 500;

        try {
            await new Promise(r => setTimeout(r, jitterDelay));

            const pipelineUrl = `${protocol}://${host}/api/pipeline?keyword=${encodeURIComponent(selected.keyword)}&kdc=${selected.kdc}&pageNo=1`;
            const response = await fetch(pipelineUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(502).json({
                    error: '파이프라인 기동 실패',
                    category: selected.keyword,
                    detail: errText.substring(0, 200)
                });
            }

            const result = await response.json();
            return res.status(200).json({
                success: true,
                cronHour: currentHour,
                cronMinute: currentMinute,
                selectedCategory: selected.keyword,
                jitterDelayMs: jitterDelay,
                pipelineResult: result
            });

        } catch (err) {
            return res.status(500).json({ error: '자율 가동 중 예외 발생', detail: err.message });
        }
    }

    return res.status(400).json({ error: '올바르지 않은 요청 액션(action)입니다.' });
}
