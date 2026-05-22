// api/send-error.js
// Vercel Serverless Function을 사용하여 디스코드 웹훅의 CORS 제한을 극복하고, 토큰 노출을 차단합니다.
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1507261096820740156/GGvWtC0oN9MFJGHAKiB7IraMyf5HVDZJxdyj485AKSgfDQ2BWSRa9_ycQPVSRF2rlIIJ';

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
        let aiAnalysisText = '';

        // 1. Google Gemini API 키 확인 및 호출 (9번 에이전트 자동 에러 분석)
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (GEMINI_API_KEY) {
            try {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
                
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
                    }
                } else {
                    console.error("Gemini API 응답 오류:", await geminiRes.text());
                }
            } catch (geminiError) {
                console.error("Gemini API 호출 예외 발생:", geminiError);
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
