// api/chat.js — 이원화 자율 챗봇(지휘_판다 / 상담이) 백엔드 API
// Vercel Serverless Function - Vercel 대시보드 환경변수 및 .env 파일의 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY 참조
import crypto from 'crypto';

function maskPII(text) {
    if (!text || typeof text !== 'string') return text;
    let masked = text;
    // 1. 이메일 마스킹 (예: test@example.com -> t***@example.com)
    masked = masked.replace(/([a-zA-Z0-9_\-\.]+)@([a-zA-Z0-9_\-\.]+)\.([a-zA-Z]{2,5})/g, (match, emailUser, emailDomain, emailExt) => {
        return emailUser.charAt(0) + '***@' + emailDomain + '.' + emailExt;
    });
    // 2. 전화번호 마스킹 (예: 010-1234-5678 -> 010-****-5678)
    masked = masked.replace(/(01[016789])[-. ]?(\d{3,4})[-. ]?(\d{4})/g, (match, p1, p2, p3) => {
        return p1 + '-****-' + p3;
    });
    // 3. 계좌번호 마스킹 (숫자 및 대시 조합 9~15자리 감지)
    masked = masked.replace(/\b(\d{3,6})[- ]?(\d{2,4})[- ]?(\d{5,8})\b/g, (match, b1, b2, b3) => {
        return b1 + '-***-***' + b3.slice(-3);
    });
    return masked;
}

async function getQueryEmbedding(query, apiKey) {
    if (!query || typeof query !== 'string') return null;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/gemini-embedding-2',
                content: {
                    parts: [{ text: query }]
                },
                outputDimensionality: 768
            })
        });
        if (response.ok) {
            const data = await response.json();
            return data.embedding?.values || null;
        }
        console.warn('임베딩 추출 실패:', await response.text());
    } catch (e) {
        console.error('임베딩 API 오류:', e.message);
    }
    return null;
}

async function fetchRAGKnowledge(embedding, chatType, rawUrl, supKey) {
    if (!embedding || !rawUrl || !supKey) return [];
    const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
    const url = `${base}/rpc/match_rag_knowledge`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': supKey,
                'Authorization': `Bearer ${supKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query_embedding: embedding,
                match_threshold: 0.3,
                match_count: 3,
                filter_agent: chatType
            })
        });
        if (response.ok) {
            return await response.json();
        }
        console.warn('RAG 유사도 조회 실패:', await response.text());
    } catch (e) {
        console.error('RAG RPC 오류:', e.message);
    }
    return [];
}

export default async function handler(req, res) {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).send('OK');
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST 메소드만 지원합니다.' });
    }

    try {
        const { chat_type, contents, userId, userRole, logId } = req.body || {};

        if (!chat_type || !contents || !Array.isArray(contents)) {
            return res.status(400).json({
                success: false,
                error: '필수 파라미터가 누락되었거나 올바르지 않습니다. (chat_type, contents 필요)'
            });
        }

        // 1. 개인정보(PII) 마스킹 처리
        const maskedContents = contents.map(item => {
            if (item.role === 'user' && item.parts && Array.isArray(item.parts)) {
                return {
                    ...item,
                    parts: item.parts.map(part => {
                        if (part.text) {
                            return { ...part, text: maskPII(part.text) };
                        }
                        return part;
                    })
                };
            }
            return item;
        });

        // 2. 페르소나별 시스템 프롬프트 설정
        let systemPrompt = '';
        if (chat_type === 'CONTROL_PANEL') {
            systemPrompt = `당신은 '출판친구' 플랫폼의 에이전트 파이프라인 전체를 총괄 조율하고 대표님의 의사결정을 지원하는 **[16번 지휘_판다 (Panda Orchestrator)]** 에이전트입니다.
당신은 최고관리자(대표님)와 대화하며, 에지 케이스에서의 판단 기준(예: 품질 리스크 수용 한계, BEP 예외 승인 조건)을 경청하고 대화를 나눕니다.
답변할 때 최고관리자(대표님)에게 정중하고 전문적인 격식체(존칭)를 사용하십시오.
대화의 핵심 요점 중, 의사결정 규칙(비즈니스 룰)이나 대표님이 지시하거나 결정한 사항이 있다면, 답변의 가장 마지막 줄에 다음과 같은 JSON 블록 형식으로 추출하여 출력해야 합니다.
반드시 아래 JSON 형식을 그대로 유지하고, 백틱(\`\`\`json) 안에 가두어 별도 라인으로 출력해 주세요. 규칙이 새로 도출되지 않았다면 빈 배열로 적어주세요.
포맷 예시:
\`\`\`json
{
  "rules": [
    "결정된 비즈니스 룰 또는 조치 지시사항 1",
    "결정된 비즈니스 룰 또는 조치 지시사항 2"
  ]
}
\`\`\``;
        } else if (chat_type === 'ERP_STORE') {
            systemPrompt = `당신은 '출판친구' ERP 플랫폼에서 사용자(출판사, 인쇄소 파트너)들의 질문에 응대하고 가이드하는 **[17번 고객응대 상담이 (ERP CS Guide)]** 에이전트입니다.
당신은 오직 '출판친구 ERP 표준 매뉴얼'과 일반적인 메뉴 위치, 조작법, 파일 업로드 방법, 시스템 에러 대처 방안에 대해서만 안내해야 합니다.
답변할 때 친절하면서도 정직하고 명확한 어조(존칭)를 사용하십시오.

[⚠️ 중요 보안 가드레일 규칙]
1. 민감 정보 절대 노출 금지: 다른 출판사명, 특정 인쇄소 이름, 타사 정산 내역 및 주문 내역, 시스템 마스터 단가표 등 데이터베이스 기밀 정보는 절대 언급하거나 조회 유도하지 마십시오.
2. 매뉴얼 외 답변 제한: 제공되거나 명시되지 않은 기능(예: 타 플랫폼 연동, 미구현 결제 수단 등)에 대해 질문을 받으면 지어내지 말고 반드시 **"확인되지 않은 기능입니다."**라고 정직하게 응답하십시오.
3. 비즈니스 이관: 맞춤형 계약 단가나 개별 마진 관련 질문은 "보안 정책상 맞춤형 단가는 직접 조회가 불가능하니, 사이드바의 [정산 및 주문관리] 또는 [단가관리] 탭을 확인해 주시기 바랍니다."로 안내하십시오.

[🎫 문의 접수(티켓) 가이드]
만약 사용자가 시스템 에러(500, DB 장애 등)를 겪거나 정산 불일치에 대한 이의를 제기하는 등 AI 선에서 조치할 수 없는 예외 사항이 감지되면, 정중하게 대표님(운영자)에게 전달할 긴급 문의 티켓 접수를 제안하십시오.
질문 형식: "이 내용은 대표님(운영자)에게 즉시 전달할 티켓으로 접수해 드릴까요?"
사용자가 긍정적으로 대답(예, 응, 접수 등)하면, 대화 응답의 가장 마지막 줄에 다음과 같은 JSON 블록 형식으로 티켓 트리거를 출력하십시오. 이 블록은 백엔드에서 파싱되므로 공백과 줄바꿈을 포함해 포맷을 엄격히 유지해야 합니다.
\`\`\`json
{
  "ticketTriggered": true,
  "subject": "감지된 에러명 혹은 사용자의 핵심 이의 내용"
}
\`\`\``;
        } else {
            return res.status(400).json({
                success: false,
                error: "지원하지 않는 chat_type입니다. ('CONTROL_PANEL' 또는 'ERP_STORE'만 지원)"
            });
        }

        // 2. Google Gemini API 호출 (재시도 및 백업 모델 적용)
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
        }

        const rawUrl = process.env.SUPABASE_URL;
        const supKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        // RAG 지식 기지 조회 및 시스템 프롬프트 동적 주입
        try {
            const lastUserMessage = [...maskedContents].reverse().find(item => item.role === 'user');
            const userQuery = lastUserMessage?.parts?.[0]?.text || '';
            if (userQuery && rawUrl && supKey) {
                const embedding = await getQueryEmbedding(userQuery, GEMINI_API_KEY);
                if (embedding) {
                    const ragChunks = await fetchRAGKnowledge(embedding, chat_type, rawUrl, supKey);
                    if (ragChunks && ragChunks.length > 0) {
                        const knowledgeContext = ragChunks
                            .map((chunk, idx) => `[관련 지식 ${idx + 1}] (${chunk.file_name})\n${chunk.content}`)
                            .join('\n\n');
                        systemPrompt += `\n\n[출판친구 지식 기지 참조 내용]\n아래는 당신의 내부 지식 기지에서 검색된 최신 및 과거 관련 정보입니다. 답변 시 이 내용을 적극 참고하십시오:\n${knowledgeContext}`;
                    }
                }
            }
        } catch (ragErr) {
            console.error('RAG 조회 및 결합 오류:', ragErr.message);
        }

        let responseText = '';
        const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
        const maxAttempts = 3;
        let lastError = null;

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
                        contents: contents
                    })
                });

                if (geminiRes.ok) {
                    const geminiJson = await geminiRes.json();
                    if (geminiJson.candidates && geminiJson.candidates[0] && geminiJson.candidates[0].content.parts[0].text) {
                        responseText = geminiJson.candidates[0].content.parts[0].text.trim();
                        break;
                    }
                } else {
                    const errText = await geminiRes.text();
                    console.warn(`Gemini API 시도 ${i + 1} 실패 (${currentModel}):`, errText);
                    lastError = new Error(`Gemini API 응답 오류: ${errText}`);
                    if (i < maxAttempts - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            } catch (geminiError) {
                console.error(`Gemini API 호출 예외 발생 시도 ${i + 1} (${currentModel}):`, geminiError.message);
                lastError = geminiError;
                if (i < maxAttempts - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        if (!responseText) {
            throw lastError || new Error('Gemini API 호출을 완료할 수 없습니다.');
        }

        // 3. 지휘_판다 대화인 경우 의사결정 규칙(rules) 추출 파싱
        let extractedRules = {};
        if (chat_type === 'CONTROL_PANEL') {
            const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
            const match = responseText.match(jsonRegex);
            if (match) {
                try {
                    extractedRules = JSON.parse(match[1].trim());
                } catch (e) {
                    console.warn('Failed to parse extracted rules from model response:', e);
                }
            }
        }

        // 3.5. CS_상담이 티켓 트리거 감지 및 Rate Limiter / 보안 서명 검증
        let ticketTriggered = false;
        let ticketSubject = '';
        let securitySignature = null;

        if (chat_type === 'ERP_STORE') {
            const ticketJsonRegex = /```json\s*([\s\S]*?)\s*```/;
            const match = responseText.match(ticketJsonRegex);
            if (match) {
                try {
                    const parsed = JSON.parse(match[1].trim());
                    if (parsed && parsed.ticketTriggered === true) {
                        ticketTriggered = true;
                        ticketSubject = parsed.subject || '긴급 CS 문의';
                    }
                } catch (e) {
                    console.warn('Failed to parse ticket JSON block:', e);
                }
            }
        }

        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        const hashedIp = crypto.createHash('sha256').update(rawIp).digest('hex');

        if (ticketTriggered && rawUrl && supKey) {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
            const checkUrl = `${base}/chat_dialogue_logs?user_ip=eq.${hashedIp}&ticket_status=eq.PENDING&created_at=gte.${tenMinutesAgo}&select=id`;
            
            try {
                const checkRes = await fetch(checkUrl, {
                    method: 'GET',
                    headers: {
                        'apikey': supKey,
                        'Authorization': `Bearer ${supKey}`,
                        'Accept': 'application/json'
                    }
                });
                
                if (checkRes.ok) {
                    const tickets = await checkRes.json();
                    if (tickets && tickets.length >= 2) {
                        return res.status(429).json({
                            success: false,
                            error: 'Too Many Requests',
                            message: '단기간 내 너무 많은 티켓이 발행되었습니다. 잠시 후 다시 시도해 주세요. (DoS 방지)'
                        });
                    }
                }
            } catch (err) {
                console.error('Rate limit DB check error:', err.message);
            }

            // Generate HMAC-SHA256 signature
            const secret = process.env.TICKET_SECRET || 'fallback-security-stamp-secret-123';
            const signData = `${userId || 'Anonymous'}:${ticketSubject}:${hashedIp}`;
            securitySignature = crypto.createHmac('sha256', secret).update(signData).digest('hex');
        }

        // 4. Supabase DB 적재 (service_role 사용)
        let savedRow = null;

        if (rawUrl && supKey) {
            const base = rawUrl.replace(/\/+$/, '') + '/rest/v1';
            
            // model의 답변 내용을 contents(history) 목록에 추가하여 DB에 보관
            const updatedHistory = [
                ...contents,
                { role: 'model', parts: [{ text: responseText }] }
            ];

            const dbPayload = {
                chat_type,
                user_id: userId || 'Anonymous',
                user_role: userRole || 'guest',
                message_history: updatedHistory,
                extracted_rules: extractedRules,
                ticket_status: ticketTriggered ? 'PENDING' : 'NONE',
                security_signature: securitySignature,
                user_ip: hashedIp
            };

            const isUpdate = logId ? true : false;
            const endpoint = isUpdate 
                ? `${base}/chat_dialogue_logs?id=eq.${logId}` 
                : `${base}/chat_dialogue_logs`;

            const headers = {
                'apikey': supKey,
                'Authorization': `Bearer ${supKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            };

            try {
                const dbRes = await fetch(endpoint, {
                    method: isUpdate ? 'PATCH' : 'POST',
                    headers: headers,
                    body: JSON.stringify(dbPayload)
                });

                if (dbRes.ok) {
                    const dbData = await dbRes.json();
                    savedRow = dbData[0] || dbData;
                } else {
                    const dbErr = await dbRes.text();
                    console.error('Supabase DB 적재 실패:', dbErr);
                }
            } catch (dbError) {
                console.error('Supabase DB 연결 오류:', dbError.message);
            }
        } else {
            console.warn('Supabase 환경변수가 설정되지 않아 DB 적재를 생략합니다.');
        }

        return res.status(200).json({
            success: true,
            responseText: responseText,
            extractedRules: extractedRules,
            logId: savedRow ? savedRow.id : (logId || null)
        });

    } catch (err) {
        const msg = err && err.message ? String(err.message) : String(err);
        console.error('[api/chat] 오류 발생:', msg);

        return res.status(500).json({
            success: false,
            error: '서버 내부 오류가 발생했습니다.',
            message: msg
        });
    }
}
