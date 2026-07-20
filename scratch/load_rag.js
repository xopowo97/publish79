// scratch/load_rag.js
// RAG 지식 기지 자동 마이그레이션 및 동기화 엔진 (Node.js)
// 🔒 보안 가드: service_role 키를 통한 RLS 우회 안전 적재

import fs from 'fs';
import pathModule from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathModule.dirname(__filename);
const workspaceRoot = pathModule.join(__dirname, '..');

// .env 파싱 헬퍼
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
const SUPABASE_URL = env.SUPABASE_URL || "https://fquzouhstheqvuzzhxqs.supabase.co";
const MASTER_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = env.GEMINI_API_KEY;

if (!MASTER_KEY || !GEMINI_API_KEY) {
    console.error("Error: SUPABASE_SERVICE_ROLE_KEY or GEMINI_API_KEY is missing in .env.");
    process.exit(1);
}

// 768차원 임베딩 획득 함수 (gemini-embedding-2)
async function getEmbedding(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "models/gemini-embedding-2",
                content: {
                    parts: [{ text: text }]
                },
                outputDimensionality: 768
            })
        });

        if (res.ok) {
            const data = await res.json();
            return data.embedding?.values || null;
        }
        console.error(`Embedding API error: status ${res.status} - ${await res.text()}`);
    } catch (e) {
        console.error("Embedding request failed:", e.message);
    }
    return null;
}

// RAG 데이터 업로드 메인 로직
async function main() {
    console.log("============================================================");
    console.log("🚀 RAG 지식 기지 자동 마이그레이션 엔진 기동");
    console.log("============================================================");

    const ragDir = pathModule.join(workspaceRoot, 'RAG_데이터');
    if (!fs.existsSync(ragDir)) {
        console.error(`RAG 데이터 폴더를 찾을 수 없습니다: ${ragDir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(ragDir).filter(f => f.endsWith('.txt'));
    console.log(`- 수집 대상 RAG 파일 수: ${files.length}개`);

    // 1단계: RAG 중복 꼬임을 차단하기 위해, 기존 지식 기지 전체를 초기화(Truncate 대신 DELETE)
    console.log("\n🧹 [1단계] 기존 RAG 테이블 초기화 중...");
    const deleteUrl = `${SUPABASE_URL}/rest/v1/rag_knowledge?id=gt.0`;
    const delRes = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
            "apikey": MASTER_KEY,
            "Authorization": `Bearer ${MASTER_KEY}`
        }
    });
    if (!delRes.ok) {
        console.error("Warning: RAG 테이블 초기화 실패 (데이터가 없거나 테이블이 없는 경우 무시됨)", await delRes.text());
    } else {
        console.log("   -> 기존 RAG 데이터 정리 완료.");
    }

    // 2단계: 파일별로 적절한 청크 크기로 분할하여 임베딩 획득 후 DB에 적재
    console.log("\n📦 [2단계] RAG 데이터 조판 및 적재 시작...");
    let successCount = 0;

    for (const fileName of files) {
        const filePath = pathModule.join(ragDir, fileName);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // 에이전트 매핑 결정
        let agentType = "ALL";
        if (fileName.includes("매뉴얼") || fileName.includes("상담")) {
            agentType = "ERP_STORE";
        } else if (fileName.includes("개발일지") || fileName.includes("설계")) {
            agentType = "CONTROL_PANEL";
        }

        // 텍스트 파일 내용을 문단 또는 글자 크기(약 1200자) 기준으로 조각(Chunk) 분할
        const rawParagraphs = content.split(/\n\s*\n/);
        const chunks = [];
        let tempChunk = "";

        for (const para of rawParagraphs) {
            const trimPara = para.trim();
            if (!trimPara) continue;

            if ((tempChunk + "\n\n" + trimPara).length > 1200) {
                if (tempChunk) chunks.push(tempChunk.trim());
                tempChunk = trimPara;
            } else {
                tempChunk = tempChunk ? (tempChunk + "\n\n" + trimPara) : trimPara;
            }
        }
        if (tempChunk) chunks.push(tempChunk.trim());

        console.log(`\n📖 파일: [${fileName}] | 에이전트 매핑: [${agentType}] | 생성 조각 수: ${chunks.length}개`);

        for (let idx = 0; idx < chunks.length; idx++) {
            const chunkText = chunks[idx];
            console.log(`   -> [조각 ${idx + 1}/${chunks.length}] 임베딩 벡터 생성 중...`);
            
            const embeddingVector = await getEmbedding(chunkText);
            if (!embeddingVector) {
                console.error(`   ❌ [조각 ${idx + 1}] 임베딩 벡터 획득 실패. 건너뜁니다.`);
                continue;
            }

            // Supabase에 insert 진행
            const insertUrl = `${SUPABASE_URL}/rest/v1/rag_knowledge`;
            const payload = {
                file_name: fileName,
                chunk_index: idx,
                content: chunkText,
                embedding: embeddingVector,
                target_agent: agentType
            };

            const insRes = await fetch(insertUrl, {
                method: 'POST',
                headers: {
                    "apikey": MASTER_KEY,
                    "Authorization": `Bearer ${MASTER_KEY}`,
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal"
                },
                body: JSON.stringify(payload)
            });

            if (insRes.ok) {
                successCount++;
                console.log(`      * DB 적재 완료 (성공 누적: ${successCount}건)`);
            } else {
                console.error(`      ❌ DB 적재 실패: ${insRes.status} - ${await insRes.text()}`);
            }

            // API 속도 제어를 위해 300ms 안전 지연
            await new Promise(r => setTimeout(r, 300));
        }
    }

    console.log(`\n============================================================`);
    console.log(`🟢 RAG 지식 기지 마이그레이션 완료! (총 ${successCount}개 조각 DB 적재 성공)`);
    console.log(`============================================================`);
}

main();
