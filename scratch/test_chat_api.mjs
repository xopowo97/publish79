// scratch/test_chat_api.mjs — Vercel 백엔드 /api/chat.js 로컬 모의 테스트 스크립트
import handler from '../api/chat.js';

// 테스트 환경변수 설정
process.env.GEMINI_API_KEY = 'mock-gemini-key';
process.env.SUPABASE_URL = 'https://fquzouhstheqvuzzhxqs.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';

let fetchCalls = [];

// global.fetch 모킹
global.mockRateLimitExceeded = false;

global.fetch = async (url, options) => {
    fetchCalls.push({ url, options });

    // 1. Gemini API 모킹
    if (url.includes('googleapis.com')) {
        let responseText = '';
        const reqBody = JSON.parse(options.body || '{}');
        const systemPrompt = reqBody.systemInstruction?.parts?.[0]?.text || '';

        if (systemPrompt.includes('지휘_판다')) {
            responseText = '안녕하세요, 대표님! 결정된 지침을 처리하겠습니다.\n```json\n{\n  "rules": ["테스트용 비즈니스 룰 1"]\n}\n```';
        } else if (systemPrompt.includes('CS_상담이') || systemPrompt.includes('고객응대')) {
            const lastMsg = reqBody.contents?.[reqBody.contents.length - 1]?.parts?.[0]?.text || '';
            if (lastMsg.includes('010-1234-5678') || lastMsg.includes('개인정보')) {
                responseText = '개인정보가 수신되었습니다. A5 변경 위치는 사이드바에 있습니다.';
            } else if (lastMsg.includes('티켓접수')) {
                responseText = '이 내용은 대표님(운영자)에게 즉시 전달할 티켓으로 접수해 드릴까요?\n```json\n{\n  "ticketTriggered": true,\n  "subject": "테스트용 긴급 오류 접수"\n}\n```';
            } else {
                responseText = '안녕하세요! 저는 17번 CS_상담이입니다. ERP 메뉴에 대해 안내해 드립니다.';
            }
        } else {
            responseText = '안녕하세요!';
        }

        return {
            ok: true,
            status: 200,
            json: async () => ({
                candidates: [{
                    content: {
                        parts: [{ text: responseText }]
                    }
                }]
            })
        };
    }

    // 2. Supabase REST API 모킹
    if (url.includes('supabase.co')) {
        if (url.includes('select=id') && global.mockRateLimitExceeded) {
            // Simulate rate limit exceeded (2 or more tickets exist)
            return {
                ok: true,
                status: 200,
                json: async () => [{ id: 1 }, { id: 2 }]
            };
        }
        if (url.includes('select=id')) {
            // Normal state: 0 tickets
            return {
                ok: true,
                status: 200,
                json: async () => []
            };
        }
        return {
            ok: true,
            status: 200,
            json: async () => [{
                id: 42,
                chat_type: 'ERP_STORE'
            }]
        };
    }

    return {
        ok: false,
        status: 404,
        text: async () => 'Not Found'
    };
};

// Mock Response 객체 생성 헬퍼
function createMockResponse() {
    const res = {
        statusCode: 200,
        headers: {},
        setHeader(name, value) {
            res.headers[name] = value;
        },
        status(code) {
            res.statusCode = code;
            return res;
        },
        json(data) {
            res.body = data;
            return res;
        },
        send(data) {
            res.body = data;
            return res;
        }
    };
    return res;
}

async function runTests() {
    console.log('🧪 [테스트 시작] /api/chat.js 백엔드 로직 검증');

    // Test 1: CONTROL_PANEL (지휘_판다) 분기 및 DB 적재 테스트
    {
        console.log('\n--- 1. CONTROL_PANEL 테스트 (16번 지휘_판다) ---');
        fetchCalls = [];
        const req = {
            method: 'POST',
            body: {
                chat_type: 'CONTROL_PANEL',
                contents: [{ role: 'user', parts: [{ text: '품질 5% 미만 에러인 경우 어떻게 해?' }] }],
                userId: 'admin_test',
                userRole: 'admin'
            }
        };
        const res = createMockResponse();

        await handler(req, res);

        console.log('HTTP 응답 코드:', res.statusCode);
        console.log('Gemini 답변 내용:', res.body.responseText);
        console.log('추출된 비즈니스 룰:', res.body.extractedRules);
        console.log('Supabase 적재 Log ID:', res.body.logId);

        // 검증 조건
        if (res.statusCode !== 200) throw new Error('Test 1 실패: 응답 코드가 200이 아닙니다.');
        if (!res.body.responseText.includes('지휘_판다')) throw new Error('Test 1 실패: 지휘_판다 답변이 누락되었습니다.');
        if (res.body.logId !== 42) throw new Error('Test 1 실패: Supabase 모의 적재 ID가 올바르지 않습니다.');
        if (!res.body.extractedRules.rules || res.body.extractedRules.rules[0] !== '테스트용 비즈니스 룰 1') {
            throw new Error('Test 1 실패: 마크다운 내 JSON 의사결정 룰 파싱에 실패했습니다.');
        }
        console.log('✅ Test 1 통과!');
    }

    // Test 2: ERP_STORE (17번 CS_상담이) 분기 및 DB 적재 테스트
    {
        console.log('\n--- 2. ERP_STORE 테스트 (17번 CS_상담이) ---');
        fetchCalls = [];
        const req = {
            method: 'POST',
            body: {
                chat_type: 'ERP_STORE',
                contents: [{ role: 'user', parts: [{ text: 'A5로 바꾸면 진짜 싸지나요?' }] }],
                userId: 'publisher_test',
                userRole: 'publisher'
            }
        };
        const res = createMockResponse();

        await handler(req, res);

        console.log('HTTP 응답 코드:', res.statusCode);
        console.log('Gemini 답변 내용:', res.body.responseText);
        console.log('Supabase 적재 Log ID:', res.body.logId);

        // 검증 조건
        if (res.statusCode !== 200) throw new Error('Test 2 실패: 응답 코드가 200이 아닙니다.');
        if (!res.body.responseText.includes('17번 CS_상담이')) throw new Error('Test 2 실패: 17번 CS_상담이 답변이 누락되었습니다.');
        console.log('✅ Test 2 통과!');
    }

    // Test 3: 개인정보(PII) 실시간 마스킹 처리 검증
    {
        console.log('\n--- 3. PII 마스킹 검증 테스트 ---');
        fetchCalls = [];
        const req = {
            method: 'POST',
            body: {
                chat_type: 'ERP_STORE',
                contents: [{ role: 'user', parts: [{ text: '내 번호는 010-1234-5678 이고 메일은 test@example.com 입니다.' }] }],
                userId: 'publisher_test',
                userRole: 'publisher'
            }
        };
        const res = createMockResponse();

        await handler(req, res);

        // Supabase DB payload 확인
        const dbCall = fetchCalls.find(call => call.url.includes('supabase.co') && call.options.method === 'POST');
        if (!dbCall) throw new Error('Test 3 실패: Supabase 적재 호출을 찾을 수 없습니다.');
        
        const payload = JSON.parse(dbCall.options.body);
        const userMsg = payload.message_history[0].parts[0].text;
        
        console.log('마스킹된 DB 적재 메시지:', userMsg);

        if (userMsg.includes('010-1234-5678') || userMsg.includes('test@example.com')) {
            throw new Error('Test 3 실패: 민감정보 마스킹 처리가 누락되었습니다.');
        }
        console.log('✅ Test 3 통과!');
    }

    // Test 4: 티켓 발행시 보안관 디지털 검증 서명 및 DoS(Rate Limiting) 방어 작동 검증
    {
        console.log('\n--- 4. 티켓 보안 서명 및 DoS 방어 테스트 ---');
        
        // 4-1. 정상 티켓 생성 및 서명 발급 검증
        {
            fetchCalls = [];
            global.mockRateLimitExceeded = false;
            const req = {
                method: 'POST',
                body: {
                    chat_type: 'ERP_STORE',
                    contents: [{ role: 'user', parts: [{ text: '에러가 납니다 티켓접수 해주세요' }] }],
                    userId: 'publisher_test',
                    userRole: 'publisher'
                }
            };
            const res = createMockResponse();

            await handler(req, res);

            const dbCall = fetchCalls.find(call => call.url.includes('supabase.co') && call.options.method === 'POST');
            const payload = JSON.parse(dbCall.options.body);
            
            console.log('적재 티켓 상태:', payload.ticket_status);
            console.log('생성된 보안관 서명:', payload.security_signature);

            if (payload.ticket_status !== 'PENDING') throw new Error('Test 4-1 실패: 티켓 상태가 PENDING이 아닙니다.');
            if (!payload.security_signature) throw new Error('Test 4-1 실패: 보안 서명이 생성되지 않았습니다.');
            console.log('✅ Test 4-1 (정상 티켓 서명) 통과!');
        }

        // 4-2. 10분 내 3회 이상 티켓 발행 시도 시 429 Too Many Requests 차단 검증
        {
            fetchCalls = [];
            global.mockRateLimitExceeded = true; // Rate Limit 초과 시뮬레이션
            const req = {
                method: 'POST',
                body: {
                    chat_type: 'ERP_STORE',
                    contents: [{ role: 'user', parts: [{ text: '에러가 납니다 티켓접수 해주세요' }] }],
                    userId: 'publisher_test',
                    userRole: 'publisher'
                }
            };
            const res = createMockResponse();

            await handler(req, res);

            console.log('HTTP 응답 코드 (초과 요청 시):', res.statusCode);
            console.log('응답 에러 메시지:', res.body.message);

            if (res.statusCode !== 429) {
                throw new Error('Test 4-2 실패: DoS 방어 429 차단이 동작하지 않았습니다.');
            }
            console.log('✅ Test 4-2 (DoS 429 차단) 통과!');
        }
    }

    console.log('\n🎉 [성공] 모든 API 단위 테스트가 정상 통과했습니다!');
}

runTests().catch(err => {
    console.error('❌ 테스트 실패:', err);
    process.exit(1);
});
