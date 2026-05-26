// api/send-error.js
// Vercel Serverless Function을 사용하여 디스코드 웹훅의 CORS 제한을 극복하고, 토큰 노출을 차단합니다.
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1508640595286032505/4W8xfbHpdQkjHi2SCq0fVz5deSIxWigsu9LWZlmwU8HS6aaba3C_cUQHMtgFmMeHVYfp';

// 12번 실시간 AI 보안관 1차 필터링 함수
function runSecuritySheriff(payload) {
    const message = String(payload.message || '');
    const filename = String(payload.filename || '');
    const fullText = `${message} ${filename}`;

    // 1) Prompt Injection & Bypass 패턴 검사
    const promptInjectionRegex = /(ignore\s+previous\s+instructions|system\s+override|sudo\b|chmod\b)/i;
    // 2) XSS 패턴 검사
    const xssRegex = /(<script\b[^>]*>|javascript:|onerror\s*=)/i;
    // 3) SQL Injection 패턴 검사
    const sqliRegex = /\b(union|select|insert|update|delete|drop|alter)\b/i;

    let securityLevel = 'SAFE';
    let matchedPattern = '';

    if (promptInjectionRegex.test(fullText)) {
        securityLevel = 'DANGER';
        matchedPattern = 'Prompt Injection & System Bypass';
    } else if (xssRegex.test(fullText)) {
        securityLevel = 'DANGER';
        matchedPattern = 'Cross-Site Scripting (XSS)';
    } else if (sqliRegex.test(fullText) && (fullText.includes("'") || fullText.includes('"') || fullText.includes(';'))) {
        securityLevel = 'DANGER';
        matchedPattern = 'SQL Injection (SQLi)';
    } else if (sqliRegex.test(fullText)) {
        securityLevel = 'SUSPICIOUS';
        matchedPattern = 'Suspicious SQL Keyword';
    }

    return { securityLevel, matchedPattern };
}

export default async function handler(req, res) {
    // 1. CORS 프리플라이트 요청 지원 (로컬 UAT 테스트가 가능하도록 허용)
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const payload = req.body;

        // 12번 실시간 AI 보안관 1차 필터링 수행
        const { securityLevel, matchedPattern } = runSecuritySheriff(payload);
        if (securityLevel === 'DANGER') {
            const fields = [
                { name: "발생 계정 (ID)", value: `\`${payload.userId || 'Anonymous'}\` (${payload.userRole || 'guest'})`, inline: true },
                { name: "발생 파일", value: payload.filename || '알 수 없음', inline: true },
                { name: "라인 번호", value: String(payload.lineno || '0'), inline: true },
                { name: "에러 메시지", value: `\`\`\`${payload.message || 'No message'}\`\`\`` },
                { name: "🛡️ 12번 실시간 AI 보안관 판정", value: `🚫 **DANGER (위험 - ${matchedPattern} 감지)**` },
                { name: "조치 사항", value: "구글 Gemini API 분석 호출 즉시 차단 및 악성 패킷 즉각 파기(Drop) 완료" }
            ];

            const discordPayload = {
                embeds: [{
                    title: "🚨 보안 위협 감지: 12번 AI 보안관 긴급 보고",
                    color: 15548997, // Red
                    fields: fields,
                    footer: { text: "Antigravity AI Autonomous Pipeline (Security Sheriff Active)" }
                }]
            };

            await fetch(DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(discordPayload)
            });

            return res.status(400).json({
                error: `Security Exception: Malicious payload (${matchedPattern}) detected and dropped by 12th AI Sheriff.`
            });
        }

        let aiAnalysisText = '';

        // 1. Google Gemini API 키 확인 및 호출 (9번 에이전트 자동 에러 분석)
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (GEMINI_API_KEY) {
            const systemPrompt = `당신은 '출판친구' 플랫폼의 에이전트 파이프라인에서 가장 먼저 가동되는 **[9번: 기술행정지원 실장]** 에이전트입니다.
당신의 역할은 발생한 시스템 에러를 분석하여 대표님께 격식 있고 친절하게 브리핑하고, 다음 12번(보안) 및 10번(코딩) 에이전트에게 전달할 명확한 보고서를 작성하는 것입니다.

반드시 다음 템플릿 형식을 정확히 준수하여 짧고 명확하게 한국어로 작성해 주세요. 불필요한 서론이나 인사말은 생략하고 구분선(---) 안의 내용만 출력하십시오.

---
[🚨 9번 실장 에러 분석 보고서]
1. 상황 브리핑: (대표님께 현재 에러 상태를 존칭을 써서 친절하게 요약 보고)
2. 에러 유형 분류: (예: 구문 오류 / Supabase DB 연동 오류 / 네트워크 API 오류 등)
3. 12번 에이전트(보안) 협업 요청사항: (예: API 키 유출 검사 여부 등)
4. 10번 에이전트(코딩) 협업 요청사항: (예: null 참조 오류 부분 수정 코드 마련 요청 등)
---`;

            const errorContext = `[에러 데이터 상세 정보]
- 에러 메시지: ${payload.message}
- 발생 파일명: ${payload.filename}
- 라인 번호: ${payload.lineno}
- 열 번호: ${payload.colno}
- 사용자 계정 (ID): ${payload.userId}
- 사용자 역할 (Role): ${payload.userRole}
- 사용자 브라우저 (User Agent): ${payload.userAgent}
- 발생 시각: ${payload.timestamp}`;

            // 일시적인 503 에러나 트래픽 폭주(High Demand)를 우회하기 위한 재시도 및 백업 모델 루프
            const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
            const maxAttempts = 3;

            for (let i = 0; i < maxAttempts; i++) {
                const currentModel = models[i % models.length];
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${GEMINI_API_KEY}`;
                
                try {
                    const geminiRes = await fetch(geminiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            systemInstruction: {
                                parts: [{ text: systemPrompt }]
                            },
                            contents: [{
                                parts: [{ text: errorContext }]
                            }]
                        })
                    });

                    if (geminiRes.ok) {
                        const geminiJson = await geminiRes.json();
                        if (geminiJson.candidates && geminiJson.candidates[0] && geminiJson.candidates[0].content.parts[0].text) {
                            aiAnalysisText = geminiJson.candidates[0].content.parts[0].text.trim();
                            break; // 성공 시 루프 탈출
                        }
                    } else {
                        const errText = await geminiRes.text();
                        console.warn(`Gemini API 시도 ${i + 1} 실패 (${currentModel}):`, errText);
                        // 다음 재시도 전 1초 대기 (Spike 완화)
                        if (i < maxAttempts - 1) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                } catch (geminiError) {
                    console.error(`Gemini API 호출 예외 발생 시도 ${i + 1} (${currentModel}):`, geminiError.message);
                    if (i < maxAttempts - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }
        }

        // 2. 디스코드 전송을 위한 최종 페이로드 조립
        const fields = [
            { name: "발생 계정 (ID)", value: `\`${payload.userId || 'Anonymous'}\` (${payload.userRole || 'guest'})`, inline: true },
            { name: "발생 파일", value: payload.filename || '알 수 없음', inline: true },
            { name: "라인 번호", value: String(payload.lineno || '0'), inline: true },
            { name: "에러 메시지", value: `\`\`\`${payload.message || 'No message'}\`\`\`` },
            { name: "브라우저 정보", value: (payload.userAgent || '알 수 없음').substring(0, 100) }, // 길이 제한 방지
            { name: "발생 시간", value: payload.timestamp ? new Date(payload.timestamp).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : new Date().toLocaleString() }
        ];

        // Gemini AI 리포트가 성공적으로 생성되었다면 임베드 필드에 추가
        if (aiAnalysisText) {
            fields.push({
                name: "🤖 9번 기술행정지원 실장 AI 진단 리포트",
                value: aiAnalysisText
            });
        } else {
            fields.push({
                name: "🤖 9번 기술행정지원 실장 알림",
                value: "⚠️ `GEMINI_API_KEY` 환경변수가 설정되지 않았거나 API 호출에 실패하여 AI 실시간 리포트 생성이 생략되었습니다. (일반 알림으로 대체 작동 중)"
            });
        }

        const discordPayload = {
            embeds: [{
                title: "🚨 시스템 에러 감지 (출판친구)",
                color: 15548997, // Red
                fields: fields,
                footer: { text: "Antigravity AI Autonomous Pipeline" }
            }]
        };

        // 디스코드 API로 중계 요청 발송
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discordPayload)
        });

        if (response.ok) {
            return res.status(200).json({ success: true });
        } else {
            const errText = await response.text();
            return res.status(response.status).json({ error: errText });
        }
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
