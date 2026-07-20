import fs from 'fs';
import pathModule from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathModule.dirname(__filename);
const workspaceRoot = pathModule.join(__dirname, '..');

function loadEnv() {
    const envPath = pathModule.join(workspaceRoot, '.env');
    if (!fs.existsSync(envPath)) {
        console.error("Error: .env file not found.");
        process.exit(1);
    }
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const env = {};
    envContent.split(/\r?\n/).forEach(line => {
        const match = line.match(/^([A-Z0-9_]+)=(.+)$/);
        if (match) {
            env[match[1]] = match[2].trim();
        }
    });
    return env;
}

const env = loadEnv();
const GEMINI_API_KEY = env.GEMINI_API_KEY;

async function test() {
    // generate_assets_factory.js 에서 사용하는 모델 규격과 동일하게 테스트합니다.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const book = {
        title: "먼저 온 미래 :AI 이후의 세계를 경험한 사람들",
        author: "테스트 저자",
        publisher: "테스트 출판사",
        pub_year: "2024"
    };

    const prompt = `
    다음 도서의 메타데이터를 정밀 분석하여 B2C 상용 서점 수준의 도서 소개 및 소셜 미디어 배포용 30초 숏폼 비디오 자막 타임라인을 기획해 주세요.
    
    도서명: ${book.title}
    저자: ${book.author}
    출판사: ${book.publisher}
    출간년도: ${book.pub_year}
    
    반드시 다음 JSON 규격으로만 완벽하게 답변해야 하며, JSON 외에 다른 설명은 절대 출력하지 마세요.
    `;

    console.log("Gemini API 호출 시도 중...");
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });
        
        console.log("HTTP 상태 코드:", res.status);
        console.log("HTTP 상태 텍스트:", res.statusText);
        const text = await res.text();
        console.log("응답 바디 텍스트:", text);
    } catch (err) {
        console.error("Fetch 실행 중 네트워크 예외 발생:", err);
    }
}

test();
