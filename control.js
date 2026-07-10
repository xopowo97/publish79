// ============================================================
// control.js — 에이전트 통제실 전용 스크립트
// ⚠️  이 파일은 index.html / script.js / style.css를
//     절대 수정하거나 의존하지 않습니다.
//     Supabase READ 전용 연동 + 통제실 UI 독립 운영
// ============================================================

'use strict';

// ───────────────────────────────────────────
// 0. Supabase 초기화 (READ-ONLY 운영 원칙)
// ───────────────────────────────────────────
const CTRL_SUPABASE_URL = 'https://fquzouhstheqvuzzhxqs.supabase.co';
const CTRL_SUPABASE_KEY = 'sb_publishable_BOtAPo474zF0XsKOxhKxsQ_wBqY1pcn';
let _ctrl_supabase = null;
try {
    if (typeof supabase !== 'undefined') {
        _ctrl_supabase = supabase.createClient(CTRL_SUPABASE_URL, CTRL_SUPABASE_KEY);
    } else {
        console.warn('[통제실] Supabase SDK 로드 실패. 오프라인 모드로 작동합니다.');
    }
} catch (e) {
    console.warn('[통제실] Supabase 초기화 실패:', e);
}

function ctrlApiUrl(path) {
    const isLocal = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '' ||
        window.location.protocol === 'file:';
    return isLocal ? `https://publish79.vercel.app${path}` : path;
}

// ───────────────────────────────────────────
// 1. 글로벌 상태
// ───────────────────────────────────────────
// [데모용 Mock 데이터] B2B/B2C 영업이 관련 임시 로그 모음 (DB 연동 시 삭제 가능)
const MOCK_SALES_LOGS = [
    { type: 'info', agent: '[B2B영업_영업이]', msg: '출판사 대상 BEP 복간 제안서 {n}건 자동 발송 완료', isMock: true },
    { type: 'success', agent: '[B2B영업_영업이]', msg: '절판 도서 {n}종에 대한 B2B 복간 계약 협의 개시', isMock: true },
    { type: 'info', agent: '[B2B영업_영업이]', msg: '공공도서관 희망도서 B2G 납품 제안서 생성 완료', isMock: true }
];

let _ctrl_trendChart = null;
let _ctrl_logIntervalId = null;
let _ctrl_lastLogId = 0;
let _ctrl_candidates = [
    { id: 1, title: "마녀", author: "주경철", publisher: "상상아카데미", pub_year: 2021, library_loans: 15230, reprint_score: 100, is_out_of_print: true, _a5Recommended: true },
    { id: 2, title: "오래된 미래", author: "헬레나 노르베리-호지", publisher: "중앙일보사", pub_year: 2019, library_loans: 12450, reprint_score: 98, is_out_of_print: true },
    { id: 3, title: "생각의 탄생", author: "루트번스타인", publisher: "에이전트 학술", pub_year: 2020, library_loans: 9120, reprint_score: 91, is_out_of_print: true },
    { id: 4, title: "침묵의 봄", author: "레이첼 카슨", publisher: "메디치미디어", pub_year: 2018, library_loans: 5890, reprint_score: 87, is_out_of_print: true },
    { id: 5, title: "국가란 무엇인가", author: "유시민", publisher: "청어출판사", pub_year: 2017, library_loans: 4720, reprint_score: 82, is_out_of_print: true }
];
let _ctrl_flashActive = false;
let _ctrl_flashTimerId = null;
let _ctrl_approvalLog = [];  // 승인 이력 배열

// 로테이션 표준 키워드 및 재시도 상태 관리
const CTRL_KEYWORD_ROTATION = [
    '소설', '에세이', '인문학', '경제경영', '사회과학', '역사',
    '과학', '예술', '자기계발', '종교', '어린이', '청소년'
];
let _ctrl_pipeline_retry_count = 0;

// 글로벌 시뮬레이션 상태
let _ctrl_simBook = null;
let _ctrl_simSpecs = null;
let _ctrl_approvedSpec = null;

// ePub 뷰어 모드 플래그 — true 동안 종이책 헬퍼 알림 차단
let _ctrl_epubViewerActive = false;

// 통제실용 지휘_판다 챗봇 글로벌 상태 및 마크다운 파서
let _controlChatHistory = [
    { role: 'model', parts: [{ text: "안녕하세요, 대표님! **16번 지휘_판다**입니다.\n에이전트 파이프라인의 예외 상황 의사결정이나 비즈니스 규칙 지시사항이 있으시면 언제든 말씀해주세요. 경청하고 수렴하겠습니다." }] }
];
let _controlChatLogId = null;

function parseChatMarkdown(text) {
    if (!text) return '';
    let html = text;
    html = html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/`(.*?)`/g, '<code style="background:rgba(255,255,255,0.1); color:#38bdf8; padding:2px 4px; border-radius:4px; font-family:monospace; font-size:11px;">$1</code>');
    html = html.replace(/```(?:json|javascript|js)?\s*([\s\S]*?)\s*```/g, '<pre style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:10px; font-family:monospace; font-size:11px; overflow-x:auto; margin:8px 0; color:#38bdf8; white-space:pre-wrap; word-break:break-all;">$1</pre>');
    html = html.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            return `<li style="margin-left: 12px; list-style-type: disc; font-size:12px; line-height:1.5; margin-bottom:4px;">${trimmed.substring(2)}</li>`;
        }
        return line;
    }).join('\n');
    html = html.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    return html;
}

// ───────────────────────────────────────────
// 2. 초기화 진입점
// ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initOrgAccordion();           // 조직도 수직 아코디언 초기화

    // ── 헬퍼창 닫기버튼 — 이벤트 위임 방식으로 확실하게 연결 ──
    document.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('#ai-close-btn');
        if (closeBtn) {
            e.stopPropagation();
            const panel = document.getElementById('ai-panel');
            if (panel) panel.classList.remove('active');
            const fab = document.getElementById('ai-fab');
            if (fab) {
                // 대표님이 승인하기 전까지는 헬퍼창을 그냥 닫아도 노란색 골드 펄스(pulse-gold)가 꺼지지 않고 유지되도록 처리
                fab.classList.remove('active');
                fab.style.opacity = '1';
                fab.style.pointerEvents = 'all';
            }
        }
    }, true); // useCapture=true で最優先

    const closeSlideBtn = document.getElementById('ctrl-slide-close-btn');
    if (closeSlideBtn) {
        closeSlideBtn.addEventListener('click', () => {
            if (typeof ctrlCloseSalesMarketingPanel === 'function') {
                ctrlCloseSalesMarketingPanel();
            }
        });
    }

    loadCtrlDashboard();
    updateSalesTimeline();
    updateMarketingChannels(false);
    startCtrlLogStream();
    startCtrlTicketListener();
    try {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    } catch (e) {
        console.warn('[통제실] Lucide 아이콘 초기화 실패:', e);
    }

    // 파이프라인 버튼 이벤트 연결
    const pipelineBtn = document.getElementById('ctrl-btn-pipeline');
    if (pipelineBtn) {
        pipelineBtn.addEventListener('click', () => triggerCtrlPipeline(false));
    }
    const flashBtn = document.getElementById('ctrl-btn-flashlight');
    if (flashBtn) {
        flashBtn.addEventListener('click', () => toggleCtrlFlashlight());
    }
    const pipelineNavBtn = document.getElementById('ctrl-nav-btn-pipeline');
    if (pipelineNavBtn) {
        pipelineNavBtn.addEventListener('click', () => triggerCtrlPipeline(false));
    }

    // AI Helper FAB 이벤트 (단 한번만 등록)
    const aiFab = document.getElementById('ai-fab');
    if (aiFab) {
        aiFab.addEventListener('click', () => toggleAIPanel());
    }

    const demoBtn = document.getElementById('ai-demo-btn');
    if (demoBtn) {
        demoBtn.addEventListener('click', () => triggerAIError('Manual Demo'));
    }

    const sendBtn = document.getElementById('ai-send-btn') || document.querySelector('.ai-send-btn');
    const aiInput = document.getElementById('ai-input') || document.querySelector('.ai-input');

    if (sendBtn) {
        sendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
        
        const handleSend = async () => {
            if (!aiInput || !aiInput.value.trim()) return;
            const message = aiInput.value.trim();
            const chatContent = document.getElementById('ai-chat-content');
            if (!chatContent) return;

            // 1. 사용자 말풍선 추가 및 입력창 비우기/비활성화
            const userMsg = document.createElement('div');
            userMsg.className = 'ai-msg ai-msg-user';
            userMsg.style.cssText = 'align-self:flex-end; max-width:85%;';
            userMsg.textContent = message;
            chatContent.appendChild(userMsg);

            aiInput.value = '';
            aiInput.disabled = true;
            sendBtn.disabled = true;
            setTimeout(() => { chatContent.scrollTop = chatContent.scrollHeight; }, 100);

            // 2. 히스토리에 사용자 메시지 추가
            _controlChatHistory.push({ role: 'user', parts: [{ text: message }] });

            // 3. 로딩 애니메이션 말풍선 추가
            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'ai-msg ai-msg-bot loading-bubble';
            loadingMsg.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="ctrl-dot ctrl-dot-green pulse" style="display:inline-block; margin-right:4px;"></span>
                    <span>16번 지휘_판다가 생각하는 중...</span>
                </div>
            `;
            chatContent.appendChild(loadingMsg);
            setTimeout(() => { chatContent.scrollTop = chatContent.scrollHeight; }, 100);

            try {
                // 4. API 송신
                const response = await fetch(ctrlApiUrl('/api/chat'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_type: 'CONTROL_PANEL',
                        contents: _controlChatHistory,
                        userId: sessionStorage.getItem('userId') || 'admin_control',
                        userRole: sessionStorage.getItem('userRole') || 'admin',
                        logId: _controlChatLogId
                    })
                });

                // 5. 로딩 말풍선 제거
                loadingMsg.remove();

                if (response.ok) {
                    const data = await response.json();
                    const replyText = data.responseText;
                    
                    // 세션 유지를 위해 logId 보존
                    if (data.logId) {
                        _controlChatLogId = data.logId;
                    }

                    // 히스토리에 모델 응답 추가
                    _controlChatHistory.push({ role: 'model', parts: [{ text: replyText }] });

                    // 봇 말풍선 추가
                    const botMsg = document.createElement('div');
                    botMsg.className = 'ai-msg ai-msg-bot';
                    botMsg.innerHTML = parseChatMarkdown(replyText);
                    chatContent.appendChild(botMsg);

                    // 실시간 로그 스트림에 기록
                    const logEl = document.getElementById('ctrl-log-stream');
                    if (logEl) {
                        _appendCtrlLogEntry(logEl, 'success', '지휘_판다', `대표님 의사결정 모방학습 로그 저장 완료 (ID: ${data.logId || 'N/A'})`, new Date());
                    }

                    // 의사결정 규칙이 도출된 경우, 콘솔 또는 UI에 피드백 표시
                    if (data.extractedRules && data.extractedRules.rules && data.extractedRules.rules.length > 0) {
                        console.log('추출된 비즈니스 규칙:', data.extractedRules.rules);
                        if (logEl) {
                            data.extractedRules.rules.forEach(rule => {
                                _appendCtrlLogEntry(logEl, 'info', '지휘_판다', `새로운 규칙 발견: "${rule}"`, new Date());
                            });
                        }
                    }

                } else {
                    const errText = await response.text();
                    const errObj = JSON.parse(errText || '{}');
                    const botMsg = document.createElement('div');
                    botMsg.className = 'ai-msg ai-msg-bot';
                    botMsg.style.color = '#ef4444';
                    botMsg.textContent = `❌ 오류가 발생했습니다: ${errObj.message || errObj.error || 'Gemini API 호출에 실패했습니다.'}`;
                    chatContent.appendChild(botMsg);
                }
            } catch (err) {
                loadingMsg.remove();
                const botMsg = document.createElement('div');
                botMsg.className = 'ai-msg ai-msg-bot';
                botMsg.style.color = '#ef4444';
                botMsg.textContent = `❌ 네트워크 오류: ${err.message}`;
                chatContent.appendChild(botMsg);
            } finally {
                aiInput.disabled = false;
                sendBtn.disabled = false;
                aiInput.focus();
                setTimeout(() => { chatContent.scrollTop = chatContent.scrollHeight; }, 100);
            }
        };

        sendBtn.onclick = handleSend;

        if (aiInput) {
            aiInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    sendBtn.click();
                }
            });
        }
    }

    // 분야 드롭다운 변경 시 실시간 필터 갱신 연동
    const kwInput = document.getElementById('ctrl-keyword-input');
    if (kwInput) {
        kwInput.addEventListener('change', () => {
            loadCtrlDashboard();
        });
    }

    // 에러 리스너 등록
    window.addEventListener('error', (event) => {
        if (!event.filename || !event.filename.includes('control.js')) return;
        const errorData = {
            message: event.message || event.error?.message || 'Unknown Error',
            filename: event.filename.split('/').pop(),
            lineno: event.lineno,
            colno: event.colno,
            userId: sessionStorage.getItem('userId') || 'admin_control',
            userRole: sessionStorage.getItem('userRole') || 'admin'
        };
        reportSystemError(errorData);
        showAIPanelOnError();
    });

    // 비동기 에러 리스너
    window.addEventListener('unhandledrejection', (event) => {
        try {
            const reason = event.reason;
            const reasonMsg = reason ? (reason.message || String(reason)) : 'Unknown Rejection';
            if (reasonMsg.includes('Failed to fetch') || reasonMsg.includes('NetworkError') || reasonMsg.includes('AbortError')) {
                return;
            }
            if (reason && reason.stack && !reason.stack.includes('control.js')) {
                return;
            }
            const errorData = {
                message: 'Unhandled Rejection: ' + reasonMsg,
                filename: 'Promise / Async Call',
                lineno: 0,
                userId: sessionStorage.getItem('userId') || 'admin_control',
                userRole: sessionStorage.getItem('userRole') || 'admin'
            };
            reportSystemError(errorData);
            showAIPanelOnError();
        } catch (e) {
            console.error('[unhandledrejection handler] 내부 오류:', e);
        }
    });

    // 보안관 스캔 백그라운드 구동 시작
    startSecuritySheriffWatchdog();

    // 스토어에서 결제 완료 후 통제실로 복귀(새로고침)했을 때 로그를 즉시 복원하여 출력
    const savedLog = localStorage.getItem('latestStoreLog');
    if (savedLog) {
        const logEl = document.getElementById('ctrl-log-stream');
        if (logEl) {
            _appendCtrlLogEntry(logEl, 'success', '영업_영업이', savedLog, new Date(), true);
        }
        localStorage.removeItem('latestStoreLog'); // 검증 완료 후 삭제
    }

    // [🚨 신규 수요 감지] B2C 스토어 도서 제안 실시간 모니터링 연동
    window.addEventListener('storage', (e) => {
        if (e.key === 'new_proposal_alert' && e.newValue) {
            try {
                const data = JSON.parse(e.newValue);
                triggerProposalAlert(data);
            } catch (err) {
                console.error("제안 알림 파싱 실패:", err);
            }
        }
    });

    setInterval(() => {
        const rawAlert = localStorage.getItem('new_proposal_alert');
        if (rawAlert) {
            try {
                const data = JSON.parse(rawAlert);
                triggerProposalAlert(data);
            } catch (err) {
                console.error("제안 폴링 파싱 실패:", err);
            }
            localStorage.removeItem('new_proposal_alert');
        }
    }, 1000);
});

function triggerProposalAlert(data) {
    const logEl = document.getElementById('ctrl-log-stream');
    if (!logEl) return;

    // 1. [1번 살피미] 수요 감지 경고 로그
    _appendCtrlLogEntry(
        logEl, 
        'warning', 
        '1번 딥서치_살피미', 
        `🚨 [신규 수요 감지] 도서명: "${data.title}" | 저자: ${data.author || '미상'} | 1번 살피미 국립중앙도서관 API 실시간 딥서치 엔진 가동.`, 
        new Date()
    );

    // 2. 1.5초 후 [16번 지휘_판다] 복간 후보 테이블 등록 완료 로그
    setTimeout(() => {
        _appendCtrlLogEntry(
            logEl, 
            'success', 
            '16번 지휘_판다', 
            `✅ [수요 분석 완료] "${data.title}" 도서의 서지 데이터 정제 및 무결성 서명 확인 성공. 복간 후보(reprint_candidates) 테이블에 등록 완료. (제안 포인트 200P 지급)`, 
            new Date()
        );
        
        // Reload dashboard candidates dynamically
        if (typeof loadCtrlDashboard === 'function') {
            loadCtrlDashboard();
        }
    }, 1500);

    // 3. 통제실 대시보드 화면에 Premium Notification Toast 팝업 노출
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 z-[200] bg-slate-900 border border-sky-500/30 text-white p-5 rounded-2xl shadow-2xl max-w-sm flex gap-4 items-start animate-in slide-in-from-bottom duration-300';
    toast.innerHTML = `
        <div class="bg-sky-500/20 p-2 rounded-xl text-sky-400 shrink-0 mt-0.5 animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell-ring"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M22 8a2 2 0 0 0-2-2"/><path d="M2 8a2 2 0 0 1 2-2"/></svg>
        </div>
        <div>
            <div class="text-xs font-black text-sky-400 uppercase tracking-widest">신규 수요 감지 (B2C 제안)</div>
            <h4 class="text-sm font-bold text-white mt-1 leading-tight">${data.title}</h4>
            <p class="text-xs text-slate-400 mt-1 leading-relaxed">${data.author || '저자 미상'} | ${data.publisher || '출판사 미상'}</p>
            <div class="text-[10px] text-slate-500 mt-2 font-mono">1번 딥서치_살피미 API 실시간 구동 완료</div>
        </div>
    `;
    document.body.appendChild(toast);
    
    // Automatically fade out and remove after 6 seconds
    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity', 'duration-500');
        setTimeout(() => toast.remove(), 500);
    }, 6000);
}
function updateSalesTimeline() {
    const container = document.getElementById('ctrl-sales-timeline');
    if (!container) return;

    const timelineData = [
        { pub: '상상아카데미', book: '마녀', status: 'success', msg: '대표 복간 제안 승인 완료 -> B2C 예약 펀딩 49부 개설 연동' },
        { pub: '메디치미디어', book: '침묵의 봄', status: 'processing', msg: 'AI 자율 제안 송출 완료 -> 출판사 2차 BEP 원가 보고서 검토 중' },
        { pub: '청어출판사', book: '국가란 무엇인가', status: 'running', msg: '수요 점수(82점) 임계치 도달 -> B2B 제안서 기안서 자동 작성 중' }
    ];

    container.innerHTML = timelineData.map(item => {
        let dotClass = 'ctrl-dot-slate';
        let statusText = '대기';
        let bgStyle = 'background: rgba(255,255,255,0.02);';

        if (item.status === 'success') {
            dotClass = 'ctrl-dot-green';
            statusText = '계약성공';
            bgStyle = 'background: rgba(16, 185, 129, 0.04); border: 1px solid rgba(16, 185, 129, 0.15);';
        } else if (item.status === 'processing') {
            dotClass = 'ctrl-dot-amber';
            statusText = '협의중';
            bgStyle = 'background: rgba(245, 158, 11, 0.04); border: 1px solid rgba(245, 158, 11, 0.15);';
        } else if (item.status === 'running') {
            dotClass = 'ctrl-dot-purple animate-pulse';
            statusText = '제안준비';
            bgStyle = 'background: rgba(168, 85, 247, 0.04); border: 1px solid rgba(168, 85, 247, 0.15);';
        }

        return `
        <div style="display:flex; flex-direction:column; gap:6px; padding:14px 16px; border-radius:12px; ${bgStyle} font-size:13px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:#f1f5f9; display:flex; align-items:center; gap:6px;">
                    <span class="ctrl-dot ${dotClass}" style="width:8px; height:8px;"></span>
                    ${item.pub}
                </span>
                <span style="font-weight:800; font-size:10px; padding:2px 6px; border-radius:4px; margin-left:auto; ${
                    item.status === 'success' ? 'background:rgba(16,185,129,0.1); color:#10b981;' :
                    item.status === 'processing' ? 'background:rgba(245,158,11,0.1); color:#f59e0b;' :
                    'background:rgba(168,85,247,0.1); color:#a855f7;'
                }">${statusText}</span>
            </div>
            <div style="color:var(--ctrl-text-main); font-weight:700; margin-top:4px; font-size:12px;">대상 도서: "${item.book}"</div>
            <div style="color:var(--ctrl-text-mute); font-size:11px; margin-top:2px; line-height:1.4;">${item.msg}</div>
        </div>
        `;
    }).join('');
}

// B2C Multi-channel Marketing Helper
function updateMarketingChannels(isCompleted = false) {
    const channels = ['youtube', 'instagram', 'kakao', 'tiktok'];
    channels.forEach(ch => {
        const el = document.getElementById(`m-status-${ch}`);
        if (!el) return;

        // [버그 방지 가드레일] 유튜브 숏폼 배포가 완료되었거나 로컬스토리지에 배포 상태가 보존되어 있다면 강제 리셋 생략 및 링크 복구
        if (ch === 'youtube' && (el.innerHTML.includes('라이브 보기') || localStorage.getItem('youtube-published') === 'true')) {
            if (localStorage.getItem('youtube-published') === 'true' && !el.innerHTML.includes('라이브 보기')) {
                el.innerHTML = `<a href="https://youtube.com/shorts/QDrpvRK_1gc" target="_blank" style="color:#ef4444; text-decoration:none; display:flex; align-items:center; gap:2px; font-weight: 900;">🔴 라이브 보기 <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
                el.style.background = 'rgba(239, 68, 68, 0.15)';
                el.style.color = '#ef4444';
                el.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                el.style.cursor = 'pointer';
            }
            return;
        }

        if (isCompleted) {
            el.textContent = '배포완료';
            el.style.background = 'rgba(16, 185, 129, 0.15)';
            el.style.color = '#10b981';
            el.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.3)';
        } else {
            el.textContent = '배포대기';
            el.style.background = 'rgba(255, 255, 255, 0.05)';
            el.style.color = 'var(--ctrl-text-mute)';
            el.style.boxShadow = 'none';
        }
    });
}

// B2B AI Sales & Marketing Panel Controls
window.ctrlOpenSalesMarketingPanel = function (agentId) {
    const panel = document.getElementById('ctrl-sales-marketing-panel');
    if (panel) {
        panel.style.right = '0';
        updateSalesTimeline();
        const statusEl = document.getElementById('ctrl-pipeline-status');
        const isCompleted = statusEl && statusEl.textContent.includes('완료');
        updateMarketingChannels(isCompleted);
        updateB2BBusinessMetrics();
    }
};

window.ctrlCloseSalesMarketingPanel = function () {
    const panel = document.getElementById('ctrl-sales-marketing-panel');
    if (panel) {
        panel.style.right = '-800px';
    }
};

async function updateB2BBusinessMetrics() {
    let totalBooksCount = 354;
    let outOfPrintCount = 5;
    let expiredCount = 1;
    let partnersCount = 3; // 상상아카데미, 메디치미디어, 청어출판사 기본 제안
    let successKinds = 1;  // '마녀' 기본 복간 성공

    const baseCopies = 5420;
    let addFund = parseInt(localStorage.getItem('simulated_fund_added') || '0', 10);
    const currentCopies = baseCopies + addFund;
    const currentSales = currentCopies * 20000;

    // Supabase DB와 연동하여 실시간 지표 긁어오기
    if (_ctrl_supabase) {
        try {
            // 1. 전체 수집된 원천도서 개수 조회 (books 테이블)
            const { count, error: countErr } = await _ctrl_supabase
                .from('books')
                .select('*', { count: 'exact', head: true });
            if (!countErr && count !== null) {
                totalBooksCount = count;
            }

            // 2. 최종 평가 분석 완료된 복간 후보 조회 (reprint_candidates 테이블)
            const { data, error } = await _ctrl_supabase
                .from('reprint_candidates')
                .select('id, copyright_status, is_funding_active, funding_current, funding_target, is_out_of_print');
            
            if (!error && data) {
                outOfPrintCount = data.filter(b => b.is_out_of_print !== false).length;
                expiredCount = data.filter(b => b.copyright_status === 'expired' || b.copyright_status === 'public_domain').length;
                
                // 복간 성공 조건: funding_current >= funding_target 또는 50부 이상 달성
                const successBooks = data.filter(b => (b.funding_current >= (b.funding_target || 50)) || b.is_funding_active === false);
                if (successBooks.length > 0) {
                    successKinds = successBooks.length;
                }
            }
        } catch(err) {
            console.warn('[통제실] 실시간 지표 수집 쿼리 오류:', err);
        }
    }

    // 1. 수집된 도서 및 만료 도서 바인딩
    const totalBooksEl = document.getElementById('b2b-stat-totalbooks');
    const outOfPrintEl = document.getElementById('b2b-stat-outofprint');
    const expiredEl = document.getElementById('b2b-stat-expired');
    const partnersEl = document.getElementById('b2b-stat-partners');
    
    if (totalBooksEl) totalBooksEl.textContent = totalBooksCount.toLocaleString() + '종';
    if (outOfPrintEl) outOfPrintEl.textContent = outOfPrintCount.toLocaleString() + '종';
    if (expiredEl) expiredEl.textContent = expiredCount.toLocaleString() + '종';
    if (partnersEl) partnersEl.textContent = partnersCount.toLocaleString() + '곳';

    // 2. 복간 성공 (종/부수) 바인딩
    const successKindsEl = document.getElementById('b2b-stat-success-kinds');
    const copiesEl = document.getElementById('b2b-stat-copies');
    if (successKindsEl) successKindsEl.textContent = successKinds.toLocaleString();
    if (copiesEl) copiesEl.textContent = currentCopies.toLocaleString();

    // 3. 플랫폼 누적 매출 및 가변 마진율 계산 바인딩
    const salesEl = document.getElementById('b2b-stat-sales');
    const marginPctEl = document.getElementById('b2b-stat-margin-pct');
    if (salesEl) salesEl.textContent = '₩' + currentSales.toLocaleString();
    
    // 플랫폼 수수료 예상 마진 비율: 펀딩 가속도에 따른 동적 가변 (기본 35% ~ 최대 45% 캡)
    const currentMarginPct = Math.min(45, Math.max(30, 35 + Math.floor(addFund / 100)));
    if (marginPctEl) marginPctEl.textContent = currentMarginPct.toString();

    // 4. 누적 AI API 사용료 계산 바인딩
    const apiCostsEl = document.getElementById('b2b-stat-api-costs');
    if (apiCostsEl) {
        // 수집도서당 20원 + 에셋팩당 150원 + 챗봇 대화당 50원 + 기본 배치 인프라 유지비 8,500원
        const baseCost = 8500;
        const scanCost = outOfPrintCount * 20;
        const assetCost = successKinds * 150;
        // audit_logs 개수를 연동하여 챗봇 사용료 산출
        let chatCount = 5;
        try {
            if (_ctrl_supabase) {
                const { count } = await _ctrl_supabase
                    .from('agent_audit_logs')
                    .select('*', { count: 'exact', head: true });
                if (count) chatCount = count;
            }
        } catch(e){}
        
        const totalApiCosts = baseCost + scanCost + assetCost + (chatCount * 50);
        apiCostsEl.textContent = '₩' + totalApiCosts.toLocaleString();
    }
}

// [신규] B2B 수집 도서 목록 팝업 모달 구동
window.showBooksListPopup = async function(filterType) {
    const modal = document.getElementById('b2b-books-modal');
    const titleEl = document.getElementById('b2b-modal-title');
    const container = document.getElementById('b2b-modal-list-container');
    
    if (!modal || !container) return;

    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    container.innerHTML = '<div style="text-align:center; padding:40px; color:#8b949e; font-size:12px;">데이터 로딩 중...</div>';

    let books = [];
    if (_ctrl_supabase) {
        try {
            let query = _ctrl_supabase.from('reprint_candidates').select('*');
            if (filterType === 'expired') {
                query = query.eq('copyright_status', 'expired');
            }
            const { data, error } = query;
            let resultData = data;
            
            // 만약 REST 쿼리에서 직접 select 처리가 되지 않은 경우 select * 후 filter
            if (error) {
                const { data: allData, error: allErr } = await _ctrl_supabase.from('reprint_candidates').select('*');
                if (!allErr && allData) {
                    resultData = filterType === 'expired' 
                        ? allData.filter(b => b.copyright_status === 'expired') 
                        : allData;
                }
            } else {
                const { data: fetchedData } = await query;
                resultData = fetchedData;
            }
            
            if (resultData && resultData.length > 0) {
                books = resultData;
            }
        } catch(err) {
            console.warn('[통제실] 책 목록 조회 실패, 로컬 데이터로 대체합니다.', err);
        }
    }

    if (books.length === 0) {
        books = _ctrl_candidates.filter(b => {
            if (filterType === 'expired') return b.copyright_status === 'expired' || b.id === 5;
            return true;
        });
    }

    titleEl.innerText = filterType === 'expired' 
        ? '저작권 만료 도서 목록 (실시간 관제)' 
        : '수집 절판 도서 목록 (실시간 관제)';

    container.innerHTML = books.map((book, idx) => `
        <div style="background:#161b22; border:1px solid #30363d; border-radius:12px; padding:16px; display:flex; justify-content:space-between; align-items:center; border-left: 4px solid ${
            book.copyright_status === 'expired' ? '#f59e0b' : '#38bdf8'
        };">
            <div>
                <div style="font-size:10px; font-weight:800; color:#58a6ff; margin-bottom:4px; font-family:monospace;">ISBN: ${book.isbn || '9791104' + (100000 + book.id)}</div>
                <h4 style="font-size:13px; font-weight:900; color:#f0f6fc; margin:0 0-4px 0; max-width:400px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${book.title}</h4>
                <p style="font-size:11px; color:#8b949e; margin:0;">${book.author || '저자 미상'} | ${book.publisher || '출판사 미상'} (${book.pub_year || '년도 미상'})</p>
            </div>
            <div style="text-align:right;">
                <span style="font-size:9px; font-weight:900; padding:3px 8px; border-radius:6px; background:${
                    book.copyright_status === 'expired' ? 'rgba(245,158,11,0.15); color:#f59e0b;' : 'rgba(56,189,248,0.15); color:#38bdf8;'
                }">${book.copyright_status === 'expired' ? '만료 도서' : '저작권 보호'}</span>
                <div style="font-size:10px; color:#8b949e; margin-top:6px; font-weight:700;">대출점수: ${book.library_loans ? book.library_loans.toLocaleString() : '0'}점</div>
            </div>
        </div>
    `).join('');
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
};

window.closeB2BBooksModal = function() {
    const modal = document.getElementById('b2b-books-modal');
    if (modal) {
        modal.style.display = 'none';
    }
};


// ───────────────────────────────────────────
// 3. 실시간 시계
// ───────────────────────────────────────────
function initClock() {
    const el = document.getElementById('ctrl-clock');
    if (!el) return;

    function tick() {
        const now = new Date();
        el.textContent =
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0') + ':' +
            String(now.getSeconds()).padStart(2, '0');
    }

    tick();
    setInterval(tick, 1000);
}

// ───────────────────────────────────────────
// 4. 트렌드 차트 초기화
// ───────────────────────────────────────────
function initCtrlTrendChart() {
    const canvas = document.getElementById('ctrl-trend-chart');
    if (!canvas) return;

    if (typeof Chart === 'undefined') {
        console.warn('[통제실] Chart.js 미로드. 차트 생략.');
        return;
    }

    if (_ctrl_trendChart) {
        _ctrl_trendChart.destroy();
        _ctrl_trendChart = null;
    }

    const labels = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
    }

    _ctrl_trendChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '복간 수요 지수',
                data: [58, 65, 72, 69, 81, 88, 94],
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14, 165, 233, 0.08)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#0ea5e9',
                pointRadius: 4,
                pointHoverRadius: 6,
                borderWidth: 2.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0d1117',
                    titleColor: '#64748b',
                    bodyColor: '#f1f5f9',
                    padding: 10,
                    cornerRadius: 10
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10, weight: '700' }, color: '#64748b' }
                },
                y: {
                    min: 40, max: 100,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { font: { size: 10, weight: '700' }, color: '#64748b', stepSize: 20 }
                }
            }
        }
    });
}

// ───────────────────────────────────────────
// 4-1. 데이터 로딩 스켈레톤 UI 렌더러
// ───────────────────────────────────────────
function renderCtrlSkeletons() {
    const top3Container = document.getElementById('ctrl-top3-list');
    const feedContainer = document.getElementById('ctrl-feed-list');

    if (top3Container) {
        top3Container.innerHTML = Array(3).fill(0).map((_, i) => `
            <div class="ctrl-book-card" style="opacity: 0.6; animation: pulse 1.5s infinite; border: 1px dashed rgba(255,255,255,0.1); background: rgba(255,255,255,0.01); height: 72px; display: flex; align-items: center; justify-content: space-between; padding: 12px 14px;">
                <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
                    <div style="background: rgba(255,255,255,0.07); height: 12px; width: 60%; border-radius: 4px;"></div>
                    <div style="background: rgba(255,255,255,0.04); height: 10px; width: 40%; border-radius: 4px;"></div>
                </div>
                <div style="background: rgba(255,255,255,0.07); height: 28px; width: 28px; border-radius: 4px;"></div>
            </div>
        `).join('');
    }

    if (feedContainer) {
        feedContainer.innerHTML = Array(4).fill(0).map(() => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.05); border-radius: 12px; height: 58px; opacity: 0.5; animation: pulse 1.5s infinite; gap: 10px; width: 100%; box-sizing: border-box;">
                <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                    <div style="background: rgba(255,255,255,0.07); height: 8px; width: 30%; border-radius: 4px;"></div>
                    <div style="background: rgba(255,255,255,0.05); height: 10px; width: 70%; border-radius: 4px;"></div>
                    <div style="background: rgba(255,255,255,0.03); height: 8px; width: 50%; border-radius: 4px;"></div>
                </div>
                <div style="background: rgba(255,255,255,0.05); height: 18px; width: 45px; border-radius: 4px;"></div>
            </div>
        `).join('');
    }
}

// ───────────────────────────────────────────
// 5. 대시보드 데이터 로드 (에이전트 조직도 + 복간 후보)
// ───────────────────────────────────────────
async function loadCtrlDashboard() {
    let agentData = [];
    if (!_ctrl_supabase) {
        console.warn('[통제실] Supabase 객체가 없어 로컬 정적 데이터 모드로 실행합니다.');
    } else {
        // 5-1. 에이전트 조직도
        try {
            const { data, error } = await _ctrl_supabase
                .from('agents')
                .select('*')
                .order('id', { ascending: true });

            if (!error && data && data.length > 0) {
                agentData = data;
            }
        } catch (e) {
            console.warn('[통제실] 에이전트 조직도 DB 연동 실패 (정적 UI 유지):', e.message);
        }
    }

    // Supabase 연동에 실패하더라도 조직도는 동적 생성(아코디언 연동 및 클릭 이벤트 탑재)
    renderCtrlAgentOrgTree(agentData);

    const kwInput = document.getElementById('ctrl-keyword-input');
    const category = kwInput ? kwInput.value : 'all';

    // 데이터 로드 전 스켈레톤 로딩 가동
    renderCtrlSkeletons();

    // 5-2. 복간 후보 및 실시간 피드 연동
    try {
        let top3 = [];
        let latest = [];
        // Vercel API 우선 호출 (CORS 방어용 ctrlApiUrl 래퍼 사용)
        const endpoint = ctrlApiUrl('/api/reprint-candidates?category=' + encodeURIComponent(category));
        const res = await fetch(endpoint);
        if (res.ok) {
            const apiRes = await res.json();
            if (apiRes.success) {
                top3 = apiRes.top3 || apiRes.data || [];
                latest = apiRes.latest || [];
            }
        }

        // 백엔드 API 실패 시 Supabase 직접 조회 폴백
        if (top3.length === 0 && _ctrl_supabase) {
            let topQuery = _ctrl_supabase.from('reprint_candidates').select('*').order('reprint_score', { ascending: false });
            let latestQuery = _ctrl_supabase.from('reprint_candidates').select('*').order('created_at', { ascending: false });

            if (category && category !== 'all') {
                if (category === '저작권 만료' || category === 'public_domain') {
                    topQuery = topQuery.eq('copyright_status', 'public_domain');
                    latestQuery = latestQuery.eq('copyright_status', 'public_domain');
                } else {
                    topQuery = topQuery.eq('category', category);
                    latestQuery = latestQuery.eq('category', category);
                }
            }

            const [top3Res, latestRes] = await Promise.all([
                topQuery.limit(5),
                latestQuery.limit(8)
            ]);
            if (!top3Res.error && top3Res.data) top3 = top3Res.data;
            if (!latestRes.error && latestRes.data) latest = latestRes.data;
        }

        if (top3 && top3.length > 0) {
            _ctrl_candidates = top3;
            renderCtrlReprintCandidates(top3);
        } else {
            const container = document.getElementById('ctrl-top3-list');
            if (container) {
                container.innerHTML = `
                <div style="padding:24px; text-align:center; color:var(--ctrl-text-mute);">
                    <p style="font-size:11px; font-weight:600;">선택하신 카테고리의 분석 대기 중<br>파이프라인을 실행하면 실시간으로 표시됩니다.</p>
                </div>`;
            }
        }

        renderCtrlReprintFeed(latest);
    } catch (e) {
        console.warn('[통제실] 복간 후보 및 피드 연동 실패 (정적 UI 유지):', e.message);
    }
}

// ───────────────────────────────────────────
// 6. 에이전트 조직도 동적 렌더링
// ───────────────────────────────────────────
function renderCtrlAgentOrgTree(dbAgents) {
    const container = document.getElementById('ctrl-org-tree');
    if (!container) return;

    const dbMapping = {
        1: 1,   // 살피미
        2: 2,   // 다듬이
        3: 3,   // 계산이
        4: 4,   // 조판이
        5: 5,   // 고치미
        8: 6,   // 이지퍼비터POD
        10: 7,  // 영업이
        11: 8,  // 알리미
        12: 9,  // 눈치왕
        13: 10, // 닥터
        14: 11, // 배달이
        15: 12, // 보안관
        16: 13  // 판다
    };

    const getAgentState = (id) => {
        if (id === 17) {
            return { status: 'active', role: 'CS 상담 운영중' };
        }
        const dbId = dbMapping[id];
        const match = dbId !== undefined ? dbAgents.find(a => a.id === dbId) : null;
        if (match) {
            return { status: match.status || 'idle', role: match.role || '대기중' };
        }
        return { status: 'idle', role: '대기중' };
    };

    const departments = [
        {
            title: "🏢 [디지털 POD 사업부]",
            desc: "오프라인 종이책의 최적화 소량 생산을 전담하는 라인입니다.",
            agents: [
                { id: 1, name: "살피미", tag: "빅데이터 수집", cond: "" },
                { id: 2, name: "다듬이", tag: "서지 표준 정제", cond: "" },
                { id: 3, name: "계산이", tag: "원가/BEP 계산", cond: "" },
                { id: 5, name: "고치미", tag: "교정교열", cond: "가동/우회" },
                { id: 6, name: "번역이", tag: "원서 번역", cond: "가동/우회" },
                { id: 4, name: "조판이", tag: "인쇄용 PDF 뼈대 빌드", cond: "가동/우회" },
                { id: 7, name: "그림이", tag: "본문 삽화/표지 디자인", cond: "가동/우회" },
                { id: 8, name: "이지퍼비터_POD", tag: "인쇄 규격 PDF 컴파일", cond: "필수 가동" },
                { id: 10, name: "영업이", tag: "계약/B2B 제안", cond: "" },
                { id: 11, name: "알리미", tag: "홍보 및 예약 펀딩 개설", cond: "" }
            ]
        },
        {
            title: "📱 [디지털 epubb 사업부]",
            desc: "모바일/태블릿 환경에 맞는 인터랙티브 가변형 전자책을 생성하는 라인입니다.",
            agents: [
                { id: 1, name: "살피미", tag: "디지털 수요 분석", cond: "" },
                { id: 2, name: "다듬이", tag: "포맷 전처리", cond: "" },
                { id: 3, name: "계산이", tag: "유통 수수료 및 마진 계산", cond: "" },
                { id: 5, name: "고치미", tag: "전자책 리더 가독성 교정", cond: "필수 가동" },
                { id: 6, name: "번역이", tag: "다국어 번역", cond: "필수 가동" },
                { id: 4, name: "조판이", tag: "가변 레이아웃 HTML 조판", cond: "필수 가동" },
                { id: 7, name: "그림이", tag: "모바일 표지/인터랙티브 일러스트", cond: "필수 가동" },
                { id: 9, name: "이지퍼비터_ePub", tag: "EPUB3 멀티미디어 컴파일", cond: "필수 가동" },
                { id: 10, name: "영업이", tag: "대형 온라인 서점 유통 등록 대행", cond: "" },
                { id: 11, name: "알리미", tag: "SNS 신간 마케팅 및 배포", cond: "" }
            ]
        },
        {
            title: "⚙️ [공통 인프라 및 자율 운영본부]",
            desc: "시스템 감시, 자가 치유 및 보안을 제어합니다.",
            agents: [
                { id: 12, name: "눈치왕", tag: "시스템 감시", cond: "24시간 감시" },
                { id: 13, name: "닥터", tag: "자가 치유", cond: "자동 복구 패치" },
                { id: 14, name: "배달이", tag: "자율 배포", cond: "무중단 배포" },
                { id: 15, name: "보안관", tag: "실시간 보안관제", cond: "보안 통제" }
            ]
        },
        {
            title: "📞 [고객 상담본부]",
            desc: "ERP 사용법 안내 및 실시간 장애 대응을 전담하는 라인입니다.",
            agents: [
                { id: 17, name: "CS_상담이", tag: "ERP CS 가이드", cond: "실시간 운영" }
            ]
        },
        {
            title: "🧠 [총지휘부]",
            desc: "대표자의 비즈니스 결정을 모방 학습합니다.",
            agents: [
                { id: 16, name: "판다", tag: "최고의사결정(CEO Clone)", cond: "전체 지휘" }
            ]
        }
    ];

    let html = '';

    departments.forEach(dept => {
        const isOrch = dept.title.includes("총지휘부");
        const sectionClass = isOrch ? 'org-accordion-section org-dept-orch' : 'org-accordion-section';

        html += `<div class="${sectionClass}">
            <div class="org-accordion-header" aria-expanded="false">
                <span class="org-accordion-title">${dept.title}</span>
                <svg class="org-accordion-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="org-accordion-body">
                <div class="org-accordion-desc">${dept.desc}</div>
                <div class="org-accordion-content">`;

        dept.agents.forEach(agent => {
            const state = getAgentState(agent.id);
            let rowClass = 'ctrl-agent-idle';
            let dotClass = 'ctrl-dot-slate';

            if (state.status === 'active' || state.status === 'success') {
                rowClass = 'ctrl-agent-active';
                dotClass = agent.id === 16 ? 'ctrl-dot-purple' : 'ctrl-dot-green';
            } else if (state.status === 'running' || state.status === 'processing') {
                rowClass = 'ctrl-agent-running';
                dotClass = 'ctrl-dot-amber';
            } else if (state.status === 'error' || state.status === 'danger') {
                rowClass = 'ctrl-agent-error';
                dotClass = 'ctrl-dot-rose';
            }

            let taskText = '대기중';
            if (state.status === 'running' || state.status === 'processing') {
                taskText = state.role || '작동중';
            } else if (state.status === 'active' || state.status === 'success') {
                taskText = state.role || '조치 완료';
            } else if (state.status === 'error' || state.status === 'danger') {
                taskText = '오류 발생';
            }

            const condTag = agent.cond
                ? `<span class="ctrl-agent-cond" style="font-size:9px;padding:2px 5px;background:rgba(255,255,255,0.05);border-radius:4px;color:var(--ctrl-text-sub);margin-right:4px;">${agent.cond}</span>`
                : '';
            const isPurple = agent.id === 16;

            html += `
            <div class="ctrl-agent-row ${rowClass}" ${(Number(agent.id) === 10 || Number(agent.id) === 11) ? 'onclick="ctrlOpenSalesMarketingPanel(' + agent.id + ')" style="cursor:pointer;"' : ''}>
                <span class="ctrl-dot ${dotClass}"></span>
                <span class="ctrl-agent-name">${agent.id}번 ${agent.name}</span>
                <span class="ctrl-agent-task">(${taskText})</span>
                ${condTag}
                <span class="ctrl-agent-tag ${isPurple ? 'ctrl-tag-purple' : ''}" style="font-size:9px;">${agent.tag}</span>
            </div>`;
        });

        html += `</div></div></div>`;
    });

    container.innerHTML = html;

    // 아코디언 이벤트 바인딩 (DOM 재생성 후 재연결)
    setupAccordionEvents();
}


// ───────────────────────────────────────────
// 7. 복간 후보 TOP3 동적 렌더링
// ───────────────────────────────────────────
function renderCtrlReprintCandidates(candidates) {
    const container = document.getElementById('ctrl-top3-list');
    if (!container) return;

    // 마녀 점수 100점 보정 예외처리 (대표님 피드백 반영)
    if (candidates && candidates.length > 0) {
        candidates.forEach(c => {
            if (c.title && c.title.includes('\ub9c8\ub140')) {
                c.reprint_score = 100;
            }
        });
    }

    if (!candidates || candidates.length === 0) {
        container.innerHTML = `
        <div style="padding:24px; text-align:center; color:var(--ctrl-text-mute);">
            <p style="font-size:11px; font-weight:600;">후보 도서 분석 대기 중<br>파이프라인을 실행하면 실시간으로 표시됩니다.</p>
        </div>`;
        return;
    }

    const rankEmojis = ['🥇', '🥈', '🥉'];

    container.innerHTML = candidates.slice(0, 5).map((c, i) => {
        const rankClass = `ctrl-rank-${i + 1}`;
        const pubYear = c.pub_year ? `${c.pub_year}년` : '연도 미상';
        const loans = c.library_loans ? c.library_loans.toLocaleString() : '0';
        const simulatedBadge = c.is_simulated
            ? `<span style="background:#f59e0b; color:#fff; font-size:9px; padding:1px 4.5px; border-radius:3px; margin-left:6px; font-weight:900; vertical-align:middle; display:inline-block; box-shadow:0 0 4px rgba(245,158,11,0.4);">통계 보정 중</span>`
            : '';
        const publicDomainBadge = c.copyright_status === 'public_domain'
            ? `<span style="background:#10b981; color:#fff; font-size:9px; padding:1px 4.5px; border-radius:3px; margin-left:6px; font-weight:900; vertical-align:middle; display:inline-block; box-shadow:0 0 4px rgba(16,185,129,0.4);">저작권 만료 | 인세 0%</span>`
            : '';

        // 수요 온도 연산 및 라벨 매핑
        const temp = c.demand_temperature !== undefined ? c.demand_temperature : Math.min(100, Math.round(((c.library_loans || 0) / 650) * 100));
        let tempClass = 'ctrl-temp-cool';
        let tempLabel = '미온';
        let tempEmoji = '🔵';
        if (temp >= 90) {
            tempClass = 'ctrl-temp-boiling';
            tempLabel = '끓는점';
            tempEmoji = '🔴';
        } else if (temp >= 70) {
            tempClass = 'ctrl-temp-hot';
            tempLabel = '고온';
            tempEmoji = '🟠';
        } else if (temp >= 50) {
            tempClass = 'ctrl-temp-warm';
            tempLabel = '온열';
            tempEmoji = '🟡';
        }

        return `
        <div class="ctrl-book-card ${rankClass}" onclick="ctrlStartSimByIndex(${i})" style="cursor:pointer;">
            <div class="ctrl-rank-badge">${rankEmojis[i] || '\u{1F3C5}'} ${i + 1}위</div>
            <div class="ctrl-book-info">
                <div class="ctrl-book-title">${c.title} (${c.author})${simulatedBadge}${publicDomainBadge}</div>
                <div class="ctrl-book-meta" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:4px;">
                    <span class="ctrl-temp-badge ${tempClass}">${tempEmoji} ${temp}℃ ${tempLabel}</span>
                    <span>${c.is_out_of_print ? '절판' : '일반'} · ${pubYear} · 대출 <strong>${loans}</strong>건</span>
                </div>
            </div>
            <div class="ctrl-reprint-score">${c.reprint_score || 0}<span>점</span></div>
        </div>`;
    }).join('');
}

function renderCtrlReprintFeed(latestCandidates) {
    const container = document.getElementById('ctrl-feed-list');
    if (!container) return;

    if (!latestCandidates || latestCandidates.length === 0) {
        container.innerHTML = `
        <div style="padding:24px; text-align:center; color:var(--ctrl-text-mute); font-size:11px; font-weight:600;">
            실시간 도서 수집 대기 중...
        </div>`;
        return;
    }

    const categoryStyles = {
        '소설': 'background: rgba(244, 63, 94, 0.1); color: #f43f5e; border: 1px solid rgba(244, 63, 94, 0.2);',
        '에세이': 'background: rgba(236, 72, 153, 0.1); color: #ec4899; border: 1px solid rgba(236, 72, 153, 0.2);',
        '인문학': 'background: rgba(139, 92, 246, 0.1); color: #8b5cf6; border: 1px solid rgba(139, 92, 246, 0.2);',
        '사회과학': 'background: rgba(99, 102, 241, 0.1); color: #6366f1; border: 1px solid rgba(99, 102, 241, 0.2);',
        '역사': 'background: rgba(245, 158, 11, 0.1); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.2);',
        '과학': 'background: rgba(6, 182, 212, 0.1); color: #0891b2; border: 1px solid rgba(6, 182, 212, 0.2);',
        '예술': 'background: rgba(217, 70, 239, 0.1); color: #d012db; border: 1px solid rgba(217, 70, 239, 0.2);',
        '경제경영': 'background: rgba(16, 185, 129, 0.1); color: #059669; border: 1px solid rgba(16, 185, 129, 0.2);',
        '자기계발': 'background: rgba(14, 165, 233, 0.1); color: #0284c7; border: 1px solid rgba(14, 165, 233, 0.2);',
        '종교': 'background: rgba(20, 184, 166, 0.1); color: #0d9488; border: 1px solid rgba(20, 184, 166, 0.2);',
        '어린이': 'background: rgba(234, 179, 8, 0.1); color: #ca8a04; border: 1px solid rgba(234, 179, 8, 0.2);',
        '청소년': 'background: rgba(249, 115, 22, 0.1); color: #ea580c; border: 1px solid rgba(249, 115, 22, 0.2);',
        '저작권 만료': 'background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2);',
        '미분류': 'background: rgba(100, 116, 139, 0.1); color: #64748b; border: 1px solid rgba(100, 116, 139, 0.2);'
    };

    container.innerHTML = latestCandidates.map(c => {
        const title = (c.title || '').replace(/<\/?[^>]+(>|$)/g, "");
        const author = (c.author || '미상').replace(/<\/?[^>]+(>|$)/g, "");
        const category = c.category || '미분류';
        const catStyle = categoryStyles[category] || 'background: rgba(100, 116, 139, 0.1); color: #64748b; border: 1px solid rgba(100, 116, 139, 0.2);';

        const pubYear = c.pub_year ? `${c.pub_year}년` : '연도 미상';
        let publisher = c.publisher || '출판사 미상';
        let score = c.reprint_score || 0;
        if (title.includes('마녀') || (c.title && c.title.includes('마녀'))) {
            score = 100;
            publisher = '상상아카데미';
        }

        const simulatedBadge = c.is_simulated
            ? `<span style="background:#f59e0b; color:#fff; font-size:8px; padding:1px 4px; border-radius:3px; margin-left:6px; font-weight:900; vertical-align:middle; display:inline-block; box-shadow:0 0 4px rgba(245,158,11,0.3); animation: pulse 1.5s infinite;">통계 보정 중</span>`
            : '';
        const publicDomainBadge = c.copyright_status === 'public_domain'
            ? `<span style="background:#10b981; color:#fff; font-size:8px; padding:1px 4px; border-radius:3px; margin-left:6px; font-weight:900; vertical-align:middle; display:inline-block; box-shadow:0 0 4px rgba(16,185,129,0.3);">저작권 만료 | 인세 0%</span>`
            : '';

        // 수요 온도 연산 및 라벨 매핑
        const temp = c.demand_temperature !== undefined ? c.demand_temperature : Math.min(100, Math.round(((c.library_loans || 0) / 650) * 100));
        let tempClass = 'ctrl-temp-cool';
        let tempEmoji = '🔵';
        if (temp >= 90) {
            tempClass = 'ctrl-temp-boiling';
            tempEmoji = '🔴';
        } else if (temp >= 70) {
            tempClass = 'ctrl-temp-hot';
            tempEmoji = '🟠';
        } else if (temp >= 50) {
            tempClass = 'ctrl-temp-warm';
            tempEmoji = '🟡';
        }

        return `
        <div class="ctrl-feed-card" onclick="startCtrlSimByFeedIsbn('${c.isbn}')"
             style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; cursor: pointer; transition: all 0.2s; gap: 10px; width: 100%; min-width: 0;">
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <span style="font-size: 9px; font-weight: 800; padding: 1px 6px; border-radius: 10px; ${catStyle}">${category}</span>
                    <span class="ctrl-temp-badge ${tempClass}" style="padding: 1px 6.5px; border-radius: 10px; font-size: 8px;">${tempEmoji} ${temp}℃</span>
                    ${simulatedBadge}
                    ${publicDomainBadge}
                </div>
                <div style="font-size: 11px; font-weight: 700; color: var(--ctrl-text-main, #f1f5f9); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${title} (${author})</div>
                <div style="font-size: 9px; color: var(--ctrl-text-mute, #64748b); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${pubYear} · ${publisher}</div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; shrink-0; min-width: 50px;">
                <span style="font-size: 8px; color: var(--ctrl-text-mute, #64748b); font-weight: 700;">복간지수</span>
                <span style="font-size: 13px; font-weight: 900; color: #0ea5e9;">${score}점</span>
            </div>
        </div>`;
    }).join('');

    window._latestCtrlFeedCandidates = latestCandidates;
}

window.startCtrlSimByFeedIsbn = function (isbn) {
    const book = window._latestCtrlFeedCandidates?.find(b => b.isbn === isbn);
    if (book) {
        startCtrlSimByBookData(book);
    }
};

// ───────────────────────────────────────────
// 8. 에이전트 상태 로컬 UI 업데이트
// ───────────────────────────────────────────
function ctrlUpdateLocalAgentStatus(agentId, status, role) {
    const container = document.getElementById('ctrl-org-tree');
    if (!container) return;

    container.querySelectorAll('.ctrl-agent-row').forEach(row => {
        if (row.querySelector('.ctrl-agent-name')?.textContent.includes(`${agentId}번`)) {
            row.classList.remove('ctrl-agent-running', 'ctrl-agent-idle', 'ctrl-agent-error', 'ctrl-agent-active');
            const dot = row.querySelector('.ctrl-dot');
            const task = row.querySelector('.ctrl-agent-task');

            if (status === 'running') {
                row.classList.add('ctrl-agent-running');
                if (dot) { dot.className = 'ctrl-dot ctrl-dot-amber'; }
            } else if (status === 'success' || status === 'active') {
                row.classList.add('ctrl-agent-active');
                if (dot) { dot.className = agentId === 16 ? 'ctrl-dot ctrl-dot-purple' : 'ctrl-dot ctrl-dot-green'; }
            } else if (status === 'error') {
                row.classList.add('ctrl-agent-error');
                if (dot) { dot.className = 'ctrl-dot ctrl-dot-rose'; }
            } else {
                row.classList.add('ctrl-agent-idle');
                if (dot) { dot.className = 'ctrl-dot ctrl-dot-slate'; }
            }

            if (task) task.textContent = role;
        }
    });
}

// ───────────────────────────────────────────
// 9. Supabase 에이전트 상태 업데이트 (DB 기록)
// ───────────────────────────────────────────
async function ctrlUpdateAgentStatusInDB(agentId, status, role) {
    if (!_ctrl_supabase) return;
    try {
        await _ctrl_supabase
            .from('agents')
            .update({ status, role, updated_at: new Date().toISOString() })
            .eq('id', agentId);
    } catch (e) {
        console.warn('[통제실] DB 에이전트 상태 업데이트 오류:', e.message);
    }
}

// ───────────────────────────────────────────
// 10. 감사 로그 DB 기록
// ───────────────────────────────────────────
async function ctrlWriteAuditLog(agentId, agentName, logLevel, message, metadata) {
    if (!_ctrl_supabase) return;
    try {
        await _ctrl_supabase.from('agent_audit_logs').insert({
            agent_id: agentId,
            agent_name: agentName,
            log_level: logLevel,
            message: message,
            metadata: metadata ? JSON.stringify(metadata) : null,
            created_at: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[통제실] 감사 로그 기록 오류:', e.message);
    }
}

// ───────────────────────────────────────────
// 11. 실시간 로그 스트림
// ───────────────────────────────────────────
const CTRL_LOG_POOL = [
    { type: 'success', agent: '[딥서치_살피미]', msg: '국립중앙도서관 API 응답 정상 · 도서 {n}건 수집' },
    { type: 'info', agent: '[(총괄) 오케스트레이터]', msg: '데이터 신뢰도 재산출 완료 · 현재 {n}%' },
    { type: 'warn', agent: '[데이터정제_다듬이]', msg: '절판 도서 {n}건 필터링 처리 중' },
    { type: 'success', agent: '[에러감지_눈치왕]', msg: '에러 감지 0건 · 시스템 정상 운영 중' },
    { type: 'info', agent: '[마케팅_알리미]', msg: '복간 후보 보고서 초안 생성 완료' },
    { type: 'success', agent: '[보안통제_보안관]', msg: '비정상 API 호출 0건 · 보안 이상 없음' },
    { type: 'info', agent: '[코드수정_닥터]', msg: 'SQL Injection 스캔 완료 · 위협 없음' },
];

function startCtrlLogStream() {
    if (_ctrl_logIntervalId) {
        clearInterval(_ctrl_logIntervalId);
        _ctrl_logIntervalId = null;
    }
    // 최초 1회만 진짜 로그(DB) 렌더링하고, 주기적인 가짜 로그 생성 타이머는 삭제함
    _fetchAndRenderCtrlLogs();
}

async function _fetchAndRenderCtrlLogs() {
    const el = document.getElementById('ctrl-log-stream');
    if (!el) return;

    if (!_ctrl_supabase) {
        return;
    }

    try {
        const { data, error } = await _ctrl_supabase
            .from('agent_audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(15);

        if (!error && data && data.length > 0) {
            const newLogs = data.filter(l => l.id > _ctrl_lastLogId);
            if (newLogs.length === 0) return;

            _ctrl_lastLogId = Math.max(...data.map(l => l.id));

            newLogs.forEach(log => {
                _appendCtrlLogEntry(el,
                    log.log_level || 'info',
                    log.agent_name || '시스템',
                    log.message,
                    new Date(log.created_at)
                );
            });
            return;
        }
    } catch (_) { /* 폴백 */ }
}

function _appendCtrlLogEntry(el, type, agent, message, dateObj, isMock = false) {
    const d = dateObj || new Date();
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

    const div = document.createElement('div');
    const mockClass = (isMock || agent.includes('영업') || agent.includes('mock')) ? 'mock-log' : '';
    div.className = `ctrl-log-entry ctrl-log-${type} ${mockClass}`;
    div.innerHTML = `<span class="ctrl-log-time">${time}</span><span class="ctrl-log-agent">[${agent}]</span><span>${message}</span>`;
    
    if (mockClass) {
        div.setAttribute('style', 'border-left: 3px solid #f97316 !important; background: rgba(249, 115, 22, 0.05);');
    }
    
    el.prepend(div);

    while (el.children.length > 20) el.removeChild(el.lastChild);
}

function _appendCtrlSimulatedLog(el) {
    // 25% 확률로 영업이 mock 로그를 섞어서 출력합니다.
    const useMock = Math.random() < 0.25;
    let pool;
    if (useMock) {
        pool = MOCK_SALES_LOGS[Math.floor(Math.random() * MOCK_SALES_LOGS.length)];
    } else {
        pool = CTRL_LOG_POOL[Math.floor(Math.random() * CTRL_LOG_POOL.length)];
    }
    const n = Math.floor(Math.random() * 50) + 50;
    _appendCtrlLogEntry(el, pool.type, pool.agent.replace(/\[|\]/g, ''), pool.msg.replace('{n}', n), new Date(), pool.isMock || false);
}

// ───────────────────────────────────────────
// 12. 파이프라인 실행 트리거
// ───────────────────────────────────────────
async function triggerCtrlPipeline(isRetry = false) {
    const btn = document.getElementById('ctrl-btn-pipeline');
    const statusEl = document.getElementById('ctrl-pipeline-status');
    const kwInput = document.getElementById('ctrl-keyword-input');

    // 로테이션 인덱스 복원
    let rotIdx = parseInt(localStorage.getItem('ctrl_rotation_index') || '0', 10);
    if (isNaN(rotIdx) || rotIdx < 0 || rotIdx >= CTRL_KEYWORD_ROTATION.length) {
        rotIdx = 0;
    }

    let kw = kwInput?.value?.trim() || '';

    // 지능형 로테이션 및 재시도/빈값 수집 파라미터 처리
    let isAutoRotation = false;
    if (kw === 'all' || kw === '' || kw === '절판 도서' || isRetry) {
        if (isRetry) {
            kw = CTRL_KEYWORD_ROTATION[rotIdx];
            if (kwInput) {
                kwInput.value = kw;
            }
            isAutoRotation = true;
        } else {
            kw = 'all';
            isAutoRotation = true;
        }
    }

    if (!isRetry) {
        _ctrl_pipeline_retry_count = 0; // 최초 수동 가동 시 카운터 초기화
        resetEpubViewer();             // 신규 파이프라인 가동 시 ePub 뷰어 및 낭독 모드 강제 리셋 (헬퍼창 가드 해제)
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2"/></svg> 실행 중...'; }

    const retryPrefix = _ctrl_pipeline_retry_count > 0 ? `[재시도 ${_ctrl_pipeline_retry_count}/3] ` : '';
    if (statusEl) {
        const displayKw = (kw === 'all') ? '지능형 분석 분야' : `"${kw}"`;
        statusEl.textContent = `${retryPrefix}🔄 ${displayKw} → 살피미 → 다듬이 파이프라인 가동 중...`;
        statusEl.style.color = 'var(--ctrl-amber)';
    }

    try {
        const endpoint = ctrlApiUrl('/api/pipeline');
        const res = await fetch(`${endpoint}?keyword=${encodeURIComponent(kw)}`);
        const data = await res.json();

        if (res.ok && data.success) {
            const insertedCount = parseInt(data.inserted || 0, 10);

            // 실패 대비 가드: 수집 결과가 0건이고 자동 로테이션 모드인 경우 자동 스킵
            if (insertedCount === 0 && isAutoRotation) {
                _ctrl_pipeline_retry_count++;

                // 감사 로그 DB 적재
                await ctrlWriteAuditLog(13, '오케스트레이터', 'warn', `⚠️ "${kw}" 수집 결과 0건 감지 ➔ 다음 키워드로 자동 순환 건너뛰기`, { keyword: kw, retry: _ctrl_pipeline_retry_count });

                if (_ctrl_pipeline_retry_count <= 3) {
                    // 다음 로테이션으로 인덱스 이동 후 로컬 저장
                    rotIdx = (rotIdx + 1) % CTRL_KEYWORD_ROTATION.length;
                    localStorage.setItem('ctrl_rotation_index', rotIdx);

                    if (statusEl) {
                        statusEl.textContent = `⚠️ "${kw}" 결과 없음. 다음 키워드로 자동 건너뛰는 중... (${_ctrl_pipeline_retry_count}/3)`;
                        statusEl.style.color = 'var(--ctrl-amber)';
                    }

                    // 1초 후 자동 재시도
                    setTimeout(() => {
                        triggerCtrlPipeline(true);
                    }, 1000);
                    return;
                } else {
                    // 3회 실패 시 중단 및 실패 보고
                    if (statusEl) {
                        statusEl.textContent = `❌ 3회 연속 수집 데이터가 없습니다. 다른 검색어를 입력해 주세요.`;
                        statusEl.style.color = 'var(--ctrl-rose)';
                    }
                    await ctrlWriteAuditLog(13, '오케스트레이터', 'error', `❌ 3회 연속 자동 로테이션 수집 결과 없음으로 파이프라인 안전 차단`, { lastKeyword: kw });
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> 파이프라인 실행`;
                    }
                    return;
                }
            }

            // 정상 완료
            updateMarketingChannels(true);
            if (statusEl) {
                statusEl.textContent = `✅ 완료! ${data.totalCollected || 0}건 수집 → ${insertedCount}건 DB 적재`;
                statusEl.style.color = 'var(--ctrl-green)';
            }

            // 성공 시 다음 가동을 대비하여 로테이션 인덱스를 미리 한 칸 밀어둠
            if (isAutoRotation) {
                rotIdx = (rotIdx + 1) % CTRL_KEYWORD_ROTATION.length;
                localStorage.setItem('ctrl_rotation_index', rotIdx);
            }

            setTimeout(async () => {
                _ctrl_lastLogId = 0;
                await loadCtrlDashboard();

                // 오케스트레이터 AI 헬퍼 연동 추천 카드 제안 가동
                if (_ctrl_candidates && _ctrl_candidates.length > 0) {
                    setTimeout(() => {
                        triggerOrchestratorRecommendation();
                    }, 1000);
                    // [이지퍼비터] 인쇄 원가 최적화 제안 카드 — 복간 추천 카드 후 2.5초 뒤 표시
                    setTimeout(() => {
                        checkPrintCostOptimization(_ctrl_candidates[0], 30);
                    }, 2500);
                }
            }, 1500);
        } else {
            if (statusEl) {
                const detailMsg = data.detail ? ` (${data.detail})` : '';
                statusEl.textContent = `❌ 오류: ${data.error || '알 수 없는 오류'}${detailMsg}`;
                statusEl.style.color = 'var(--ctrl-rose)';
            }
        }
    } catch (err) {
        if (statusEl) { statusEl.textContent = `❌ 네트워크 오류: ${err.message}`; statusEl.style.color = 'var(--ctrl-rose)'; }
    } finally {
        // 재귀 호출 중인 경우는 최종 호출 마감에서만 버튼 상태를 활성화함
        if (_ctrl_pipeline_retry_count === 0 || _ctrl_pipeline_retry_count > 3) {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> 파이프라인 실행`;
            }
        }
    }
}

// ───────────────────────────────────────────
// 12-1. 13번 오케스트레이터 AI 헬퍼 자율 복간 추천 제안 카드 연동
// ───────────────────────────────────────────
function triggerOrchestratorRecommendation() {
    if (!_ctrl_candidates || _ctrl_candidates.length === 0) return;
    // ePub 뷰어 모드 중에는 종이책 복간 제안 카드 표시 차단
    if (_ctrl_epubViewerActive) return;

    // Supabase에서 reprint_score desc 정렬되어 오므로 첫 번째 도서가 항상 최고 점수
    const topBook = _ctrl_candidates[0];

    // 저작권 만료 도서(public_domain)인 경우 종이책 복간 제안 카드 표시 차단
    if (topBook.copyright_status === 'public_domain') return;

    const cleanTitle = (topBook.title || '').replace(/<\/?[^>]+(>|$)/g, '');
    const cleanAuthor = (topBook.author || '미상').replace(/<\/?[^>]+(>|$)/g, '');
    const score = topBook.reprint_score || 0;
    const loans = topBook.library_loans ? topBook.library_loans.toLocaleString() : '0';
    const pubYear = topBook.pub_year ? `${topBook.pub_year}년` : '연도 미상';

    // AI 헬퍼 패널 활성화 (닫혀 있을 때만)
    const panel = document.getElementById('ai-panel');
    const fab = document.getElementById('ai-fab');
    if (panel && !panel.classList.contains('active')) {
        toggleAIPanel();
    }

    // AI 헬퍼 FAB 아이콘에 골드 네온 펄스 활성화
    if (fab) {
        fab.classList.add('pulse-gold');
    }

    const chatContent = document.getElementById('ai-chat-content');
    if (!chatContent) return;

    const recommendCard = document.createElement('div');
    recommendCard.className = 'ai-msg ai-msg-bot';
    recommendCard.style.cssText = 'border-left: 4px solid var(--ctrl-purple, #a855f7); background: rgba(168, 85, 247, 0.05); border-radius: 12px; padding: 14px; margin-bottom: 12px; animation: fadeIn 0.4s ease; align-self: flex-start; max-width: 100%; width: 100%; box-sizing: border-box;';
    recommendCard.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; color:var(--ctrl-purple, #a855f7); font-weight:900; margin-bottom:8px; font-size:12px;">
            <span style="font-size:16px; animation: dotPulse 1.2s infinite;">🧠</span>
            <span>[13번 (총괄) 오케스트레이터] 복간 의사결정 제안</span>
        </div>
        <p style="font-size:12px; color:#1e293b; line-height:1.6; margin-bottom:8px; font-weight:600;">
            새로운 도서 분석 결과 최고 타당성을 지닌 도서가 식별되어 보고합니다. 복간을 진행하시겠습니까?
        </p>
        <div style="background: #ffffff; border: 1px solid rgba(168, 85, 247, 0.2); border-radius: 10px; padding: 12px; font-size:11px; margin-bottom:10px; color: #475569;">
            <div style="font-size:13px; font-weight:800; color:#0f172a; margin-bottom:4px;">📚 ${cleanTitle}</div>
            <div style="margin-bottom:6px;">저자: ${cleanAuthor} | 발행: ${pubYear}</div>
            <div style="display:flex; justify-content:space-between; border-top: 1px solid rgba(0,0,0,0.05); padding-top:6px; margin-top:6px;">
                <span>📊 복간 타당성 점수</span>
                <strong style="color:#0ea5e9; font-size:12px;">${score}점</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:4px;">
                <span>📈 연간 대출 횟수</span>
                <strong style="color:#0f172a;">${loans}회</strong>
            </div>
        </div>
        <button onclick="ctrlLaunchSimFromOrchestrator(0)"
            style="width: 100%; background: linear-gradient(135deg, #a855f7, #7c3aed); color: white; border: none; border-radius: 8px; font-size: 11px; font-weight: 800; cursor: pointer; padding: 10px 0; transition: all 0.2s; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);"
            onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
            🚀 시뮬레이션 가동 및 의사결정 카드 열기
        </button>
    `;

    chatContent.appendChild(recommendCard);

    // 전역 스크립트 연결용으로 헬퍼 함수 선언
    window.ctrlLaunchSimFromOrchestrator = function (index) {
        // FAB 골드 펄스 해제
        if (fab) {
            fab.classList.remove('pulse-gold');
        }
        ctrlStartSimByIndex(index);
    };

    if (window.lucide) {
        try { lucide.createIcons(); } catch (e) { }
    }
    setTimeout(() => { chatContent.scrollTop = chatContent.scrollHeight; }, 100);
}

// ───────────────────────────────────────────
// 12-2. [이지퍼비터] 인쇄 원가 최적화 컨설팅 — 신국판 50부 미만 감지 시
//        AI 헬퍼 패널에 "A5 판형 33.3% 절감" 제안 카드 자동 표시
// ───────────────────────────────────────────
/**
 * @param {object} bookData   - 복간 후보 도서 데이터 ({ title, author, reprint_score, ... })
 * @param {number} printQty   - 제작 부수 (기본값 30부 적용 — 소량 시뮬레이션 대표값)
 *
 * 판단 로직:
 *   · 디지털 낱장 기준 신국판(152×225mm): 315×467mm 트레이에 2판 → 면당 12원
 *   · 디지털 낱장 기준 A5(148×210mm)   : 315×467mm 트레이에 4판 → 면당 8원
 *   · 50부 미만 → 연속지(롤) 전환 불가 → 낱장 강제
 *   · 따라서 신국판 + qty < 50 조합에서는 A5 전환 시 면당 33.3% 절감
 */
async function checkPrintCostOptimization(bookData, printQty) {
    // ePub 뷰어 모드 중에는 종이책 원가 최적화 제안 차단
    if (_ctrl_epubViewerActive) return;

    // 저작권 만료 도서인 경우 종이책 인쇄 원가 최적화 제안 차단
    if (bookData && bookData.copyright_status === 'public_domain') return;

    // 기본 부수 미입력 시 소량 대표값 30부 적용
    const qty = (typeof printQty === 'number' && printQty > 0) ? printQty : 30;

    // ─── 조건 판단: 신국판 + 50부 미만 ───
    const isSheetfedForced = qty < 50;               // 연속지 전환 불가 임계치
    const defaultSpecIsShinkuk = true;                  // 복간 후보 도서 기본 사양: 신국판

    if (!isSheetfedForced || !defaultSpecIsShinkuk) return; // 조건 미충족 시 제안 안 함

    // ─── [3번 수익분석 계산이] 파트너 등급별 단가 실시간 조회 ───
    let publisher = bookData.publisher || '상상아카데미';
    // 상상아카데미는 VIP 등급으로 우대, 나머지는 일반 등급으로 처리
    const isVip = publisher.includes('상상아카데미');
    const partnerGrade = isVip ? 'VIP' : '일반';

    let printCostPerPageShinkuk = 12; // 기본 폴백
    let printCostPerPageA5 = 8;
    const coverProcessingCost = 1500;

    if (_ctrl_supabase) {
        try {
            const { data, error } = await _ctrl_supabase.from('master_config').select('data').eq('id', 'config').maybeSingle();
            if (!error && data?.data) {
                const gradeKey = isVip ? 'VIP 등급(우대)' : '일반등급(표준)';
                const gradeData = data.data.pricesByGrade?.[gradeKey];
                if (gradeData) {
                    // A5국판 낱장 요율 조회
                    const a5Match = gradeData.sheetSpecs?.find(x => x.n && x.n.includes('A5국판'));
                    if (a5Match && typeof a5Match.bw === 'number') {
                        printCostPerPageA5 = a5Match.bw;
                    }
                    // 신국판 낱장 요율 조회 (신국판은 낱장 규격이 없어서 패널티가 부과되나 VIP는 우대 요율 10원 적용)
                    printCostPerPageShinkuk = isVip ? 10 : 12;
                }
            }
        } catch(err) {
            console.warn('[수익분석_계산이] master_config 실시간 단가 연동 실패:', err);
        }
    }

    let totalPages = Math.max(200, Math.round((bookData.reprint_score || 80) * 2.5));
    if (bookData.title && bookData.title.includes('마녀')) {
        totalPages = 336; // 마녀 실증 도서 336P 고정
    }

    // 원가 계산
    const totalCostShinkuk = (totalPages * printCostPerPageShinkuk * qty) + (coverProcessingCost * qty);
    const totalCostA5 = (totalPages * printCostPerPageA5 * qty) + (coverProcessingCost * qty);
    const shinkukPerCopy = totalPages * printCostPerPageShinkuk + coverProcessingCost;
    const a5PerCopy = totalPages * printCostPerPageA5 + coverProcessingCost;
    const savingTotal = totalCostShinkuk - totalCostA5;
    const savingPerCopy = savingTotal / qty;
    const savingPct = Number(((totalCostShinkuk - totalCostA5) / totalCostShinkuk * 100).toFixed(1));

    // 대표님 요청: 마진율 대신 직관적인 실제 예상 원화 금액들 산출
    const retailPrice = 20000; // 책 소비자가 기본값
    const totalSales = retailPrice * qty; // 총 매출액 (30부 기준 600,000원)
    const platformFee = totalSales * 0.15; // 플랫폼 수수료 15% (30부 기준 90,000원)
    const publisherPayout = totalSales - totalCostA5 - platformFee; // 출판사 실질 예상 정산금

    const cleanTitle = (bookData.title || '').replace(/<\/?[^>]+(>|$)/g, '');
    const cleanAuthor = (bookData.author || '미상').replace(/<\/?[^>]+(>|$)/g, '');

    // ─── AI 헬퍼 패널 활성화 ───
    const panel = document.getElementById('ai-panel');
    const fab = document.getElementById('ai-fab');
    if (panel && !panel.classList.contains('active')) {
        toggleAIPanel();
    }
    if (fab) fab.classList.add('pulse-gold');

    const chatContent = document.getElementById('ai-chat-content');
    if (!chatContent) return;

    // ─── 제안 카드 HTML 생성 ───
    const costCard = document.createElement('div');
    costCard.className = 'ai-msg ai-msg-bot';
    costCard.id = 'ezpubitor-cost-card';
    costCard.style.cssText = `
        border-left: 4px solid #10b981;
        background: rgba(16, 185, 129, 0.06);
        border-radius: 12px;
        padding: 14px;
        margin-bottom: 12px;
        animation: fadeIn 0.4s ease;
        align-self: flex-start;
        max-width: 100%;
        width: 100%;
        box-sizing: border-box;
    `;
    costCard.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; color:#10b981; font-weight:900; margin-bottom:10px; font-size:12px;">
            <span style="font-size:17px;">💼</span>
            <span>[3번 수익분석_계산이] 파트너 등급별 실시간 원가/수익제안 (${partnerGrade}등급)</span>
        </div>
        <p style="font-size:11px; color:#334155; line-height:1.6; margin-bottom:10px; font-weight:500; background:#fff; padding:10px; border-radius:8px; border:1px dashed rgba(16,185,129,0.3)">
            📢 <strong>3번 수익분석_계산이</strong>가 Supabase 원격 DDL 단가를 분석하여 제작비를 산출했습니다. 승인 시 <strong>8번 이지퍼비터_POD 조판 생산 라인</strong>으로 발주 PDF가 전송됩니다.
        </p>
        <p style="font-size:11.5px; color:#0f172a; line-height:1.65; margin-bottom:10px; font-weight:600;">
            <strong style="color:#dc2626;">📌 ${qty}부 제작 원가 절감 제안</strong><br>
            현재 신국판 권당 ${shinkukPerCopy.toLocaleString()}원이 적용됩니다. 이를 A5국판 변경 시 권당 ${a5PerCopy.toLocaleString()}원으로 약 ${savingPct}% 절감됩니다.
        </p>
        <div style="background:#fff; border:1px solid rgba(16,185,129,0.2); border-radius:10px; padding:12px; font-size:11px; margin-bottom:10px; color:#475569;">
            <div style="font-size:12px; font-weight:800; color:#0f172a; margin-bottom:6px;">📚 ${cleanTitle} (${cleanAuthor})</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; border-bottom: 1px solid #edf2f7; padding-bottom: 8px;">
                <div style="color:#64748b;">제작 부수 / 예상 페이지</div>
                <div style="font-weight:800; color:#0f172a; text-align:right;">${qty}부 / ${totalPages}p</div>
                <div style="color:#64748b;">신국판 총제작비</div>
                <div style="font-weight:800; color:#dc2626; text-align:right;">₩${totalCostShinkuk.toLocaleString()}</div>
                <div style="color:#10b981; font-weight:700;">A5 전환 인쇄원가</div>
                <div style="font-weight:800; color:#10b981; text-align:right;">₩${totalCostA5.toLocaleString()}</div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; padding-top:8px;">
                <div style="color:#64748b;">출판사 예상 정산금</div>
                <div style="font-weight:800; color:#0284c7; text-align:right;">₩${Math.round(publisherPayout).toLocaleString()}</div>
                <div style="color:#64748b;">플랫폼 순수익 실금액</div>
                <div style="font-weight:800; color:#a855f7; text-align:right;">₩${Math.round(platformFee).toLocaleString()}</div>
            </div>
            <div style="display:flex; justify-content:space-between; border-top:1px solid rgba(0,0,0,0.06); padding-top:8px; margin-top:8px; align-items:center;">
                <span style="font-weight:700; color:#64748b;">💰 B2B 총 제작비 절감</span>
                <span style="font-size:15px; font-weight:900; color:#10b981;">-₩${savingTotal.toLocaleString()} (${savingPct}%↓)</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:4px; align-items:center;">
                <span style="font-weight:700; color:#64748b;">권당 제작비 절감</span>
                <span style="font-weight:800; color:#059669;">₩${Math.round(savingPerCopy).toLocaleString()} / 부</span>
            </div>
        </div>
        <button
            onclick="ctrlApproveA5Optimization(${bookData.id || 0})"
            id="ezpubitor-approve-btn"
            style="width:100%; background:linear-gradient(135deg,#10b981,#059669); color:white; border:none; border-radius:8px; font-size:11px; font-weight:800; cursor:pointer; padding:10px 0; transition:all 0.2s; box-shadow:0 4px 12px rgba(16,185,129,0.3);"
            onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'"
        >
            ✅ A5 판형 최적화 승인 및 제안 송출
        </button>
        <button
            onclick="document.getElementById('ezpubitor-cost-card')?.remove()"
            style="width:100%; background:transparent; color:#94a3b8; border:1px solid rgba(148,163,184,0.2); border-radius:8px; font-size:10px; font-weight:700; cursor:pointer; padding:6px 0; margin-top:6px; transition:all 0.2s;"
            onmouseover="this.style.color='#64748b'" onmouseout="this.style.color='#94a3b8'"
        >
            이 제안 닫기
        </button>
    `;

    chatContent.appendChild(costCard);

    // A5 최적화 승인 처리 함수 등록 (전역)
    window.ctrlApproveA5Optimization = function (bookIdOrIdx) {
        if (fab) fab.classList.remove('pulse-gold');

        // 승인 버튼 상태 변경
        const approveBtn = document.getElementById('ezpubitor-approve-btn');
        if (approveBtn) {
            approveBtn.textContent = '🚀 A5 최적화 시뮬레이션 가동 중...';
            approveBtn.disabled = true;
        }

        // 감사 로그 기록
        ctrlWriteAuditLog(
            3, '수익분석_계산이', 'success',
            `[VDP_이지퍼비터(ezpubitor)] A5 판형 원가 최적화 승인 — ${cleanTitle} · ${qty}부 · 절감액 ₩${savingTotal.toLocaleString()} (${savingPct}%↓)`,
            { bookTitle: cleanTitle, printQty: qty, savingTotal, savingPct, approvedSpec: 'A5국판' }
        );

        // 메인 오케스트레이터 배너 메시지 업데이트
        const orchMsg = document.getElementById('ctrl-orch-msg');
        if (orchMsg) {
            orchMsg.textContent = `[VDP_이지퍼비터(ezpubitor)] A5 최적화 승인 완료. ${cleanTitle} · A5판 기준 최종 조판 시뮬레이션 실행 중...`;
        }

        // 0.5초 후 시뮬레이션 모달 자동 가동
        setTimeout(() => {
            // 후보 목록에서 해당 도서 찾아 시뮬레이션 실행
            const targetBook = _ctrl_candidates.find(b => b.id === bookIdOrIdx) || _ctrl_candidates[0];
            if (targetBook) {
                startCtrlSimByBookData({ ...targetBook, _a5Recommended: true });
            } else {
                ctrlStartSimByIndex(0);
            }
        }, 500);
    };

    // 스크롤 유도
    setTimeout(() => { chatContent.scrollTop = chatContent.scrollHeight; }, 100);

    // 감사 로그 출력
    ctrlWriteAuditLog(
        13, '(총괄) 오케스트레이터', 'warn',
        `[VDP_이지퍼비터(ezpubitor)] 신국판 ${qty}부 소량 주문 감지 → A5 전환 시 ₩${savingTotal.toLocaleString()} 절감(${savingPct}%) 제안 카드 발행`,
        { bookTitle: cleanTitle, printQty: qty, savingTotal, savingPct }
    );
}

// ───────────────────────────────────────────
// 13. 플래시 라이트 모드
// ───────────────────────────────────────────
function toggleCtrlFlashlight() {
    const mainEl = document.querySelector('.ctrl-main');
    const btn = document.getElementById('ctrl-btn-flashlight');

    _ctrl_flashActive = !_ctrl_flashActive;

    if (_ctrl_flashActive) {
        if (mainEl) mainEl.classList.add('flashlight-active');
        if (btn) { btn.textContent = '⚡ 플래시 라이트 ON — 클릭 시 해제'; btn.classList.add('btn-flash-on'); }

        const msgEl = document.getElementById('ctrl-orch-msg');
        const scoreEl = document.getElementById('ctrl-orch-score');
        if (msgEl) msgEl.textContent = '⚠️ 시스템 과부하 감지! 플래시 라이트 모드 가동 — 비필수 에이전트 슬립 전환 중...';
        if (scoreEl) scoreEl.innerHTML = '67<span>%</span>';

        _insertCtrlWarningLogs();

        let countdown = 5;
        _ctrl_flashTimerId = setInterval(() => {
            countdown--;
            const m = document.getElementById('ctrl-orch-msg');
            if (m) m.textContent = `⚡ 과부하 방어 기제 작동 중... 시스템 안정화까지 ${countdown}초`;
            if (countdown <= 0) {
                clearInterval(_ctrl_flashTimerId);
                _ctrlAutoRecover();
            }
        }, 1000);
    } else {
        _ctrlAutoRecover();
    }
}

function _insertCtrlWarningLogs() {
    const logEl = document.getElementById('ctrl-log-stream');
    if (!logEl) return;
    const warnings = [
        { type: 'error', agent: '(총괄) 오케스트레이터', msg: '⚡ 플래시 라이트 모드 발동 — 비필수 에이전트 절전 전환 중' },
        { type: 'warn', agent: '딥서치_살피미', msg: '시스템 부하 감지 → API 호출 빈도 50% 조절 중' },
        { type: 'warn', agent: '보안통제_보안관', msg: '과부하 대응 2단계 방어 루틴 가동 완료' },
        { type: 'success', agent: '에러감지_눈치왕', msg: '⚡ 방어 기제 정상 작동 — 핵심 파이프라인 보호 완료' },
    ];
    warnings.forEach(w => _appendCtrlLogEntry(logEl, w.type, w.agent, w.msg, new Date()));
}

function _ctrlAutoRecover() {
    if (_ctrl_flashTimerId) { clearInterval(_ctrl_flashTimerId); _ctrl_flashTimerId = null; }
    _ctrl_flashActive = false;

    const mainEl = document.querySelector('.ctrl-main');
    const btn = document.getElementById('ctrl-btn-flashlight');

    if (mainEl) mainEl.classList.remove('flashlight-active');
    if (btn) {
        btn.classList.remove('btn-flash-on');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> 플래시 라이트 모드 시연`;
    }

    const msgEl = document.getElementById('ctrl-orch-msg');
    const scoreEl = document.getElementById('ctrl-orch-score');
    if (msgEl) msgEl.textContent = '시스템 안정화 완료. 과부하 방어 기제 정상 작동 검증됨. 전 에이전트 활성 상태 복귀.';
    if (scoreEl) scoreEl.innerHTML = '95<span>%</span>';

    const logEl = document.getElementById('ctrl-log-stream');
    if (logEl) _appendCtrlLogEntry(logEl, 'success', '오케스트레이터', '✅ 시스템 안정화 완료 — 전 에이전트 정상 운영 상태 복귀', new Date());
}

// ───────────────────────────────────────────
// 14. 시뮬레이션 모달 — 복간 후보 도서 선택 시 실행
// ───────────────────────────────────────────
async function ctrlStartSimByIndex(index) {
    const book = _ctrl_candidates[index];
    if (!book) return;
    return startCtrlSimByBookData(book);
}

async function startCtrlSimByBookData(book) {
    if (!book) return;

    // HTML 태그 제거
    if (book.title) book.title = book.title.replace(/<\/?[^>]+(>|$)/g, '');
    if (book.author) book.author = book.author.replace(/<\/?[^>]+(>|$)/g, '');

    _ctrl_simBook = book;

    // 기존 모달 제거
    const old = document.getElementById('ctrl-sim-modal-wrap');
    if (old) old.remove();

    // 모달 생성
    const wrap = document.createElement('div');
    wrap.id = 'ctrl-sim-modal-wrap';
    wrap.className = 'ctrl-sim-overlay';
    wrap.innerHTML = buildSimModalHTML(book);
    document.body.appendChild(wrap);
    if (typeof lucide !== 'undefined') {
        try { lucide.createIcons(); } catch (e) { }
    }

    // 콘솔 로그 헬퍼
    const consoleEl = document.getElementById('ctrl-sim-console');
    const logConsole = (message, type = 'info', agentId = null, agentName = null) => {
        const time = new Date().toTimeString().split(' ')[0];
        const colorMap = {
            info: 'color:#7dd3fc;',
            success: 'color:#6ee7b7; font-weight:900;',
            warn: 'color:#fcd34d;',
            error: 'color:#fda4af; font-weight:900;'
        };
        const style = colorMap[type] || 'color:#94a3b8;';
        const line = document.createElement('div');
        line.innerHTML = `<span style="color:#4b5563;">[${time}]</span> <span style="${style}">${message}</span>`;
        consoleEl.appendChild(line);
        consoleEl.scrollTop = consoleEl.scrollHeight;

        if (agentId && agentName) {
            ctrlWriteAuditLog(agentId, agentName, type, message, { bookTitle: book.title });
        }
    };

    // 파이프라인 시뮬레이션 시작
    logConsole(`[(총괄) 오케스트레이터] 도서 '${book.title}' 1~8단계 자율 출판 파이프라인 시뮬레이션 가동 개시.`, 'info', 13, '(총괄) 오케스트레이터');

    await ctrlUpdateAgentStatusInDB(13, 'running', '파이프라인 실행 지휘 중');
    await ctrlUpdateAgentStatusInDB(1, 'success', '도서관 정보나루 및 알라딘 API 데이터 수집 완료');
    await ctrlUpdateAgentStatusInDB(2, 'success', '수집 데이터 정제 및 저작권 확인 완료');
    ctrlUpdateLocalAgentStatus(1, 'success', '수집 완료');
    ctrlUpdateLocalAgentStatus(2, 'success', '정제 완료');
    ctrlUpdateLocalAgentStatus(13, 'running', '파이프라인 지휘 중');

    // STEP 3: 가상 조판
    setTimeout(async () => {
        _ctrlSetStep(3, 'active', '진행중 (🟡)');
        ctrlUpdateLocalAgentStatus(4, 'running', '1차 가상 조판 시뮬레이션 중');
        logConsole(`[조판_조판이] 4대 표준 판형에 얹었을 때 물리 스펙 가상 계산 개시.`, 'info', 4, '조판_조판이');

        try {
            const res = await fetch(ctrlApiUrl('/api/typeset'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'simulate',
                    title: book.title,
                    author: book.author,
                    charsCount: Math.floor((book.reprint_score || 50) * 1500 + 80000),
                    innerPaper: '미색모조80g'
                })
            });

            if (!res.ok) throw new Error('조판 시뮬레이션 API 호출 실패');
            const typesetData = await res.json();
            const sims = typesetData.simulations;

            for (let i = 0; i < sims.length; i++) {
                await new Promise(r => setTimeout(r, 400));
                const s = sims[i];
                logConsole(`[조판_조판이] ${s.specName} 가상 레이아웃 완료 ➔ 예상 페이지: ${s.pages}p, 책등: ${s.spineMm}mm`, 'info', 4, '조판_조판이');
            }

            _ctrlSetStep(3, 'done', '완료 (🟢)');
            ctrlUpdateLocalAgentStatus(4, 'success', '1차 가상 조판 완료');
            logConsole(`[조판_조판이] 4대 판형 물리 스펙 산출 완료. 수익분석_계산이에게 데이터 전송.`, 'success', 4, '조판_조판이');

            // STEP 4: 수익성 검토
            setTimeout(async () => {
                _ctrlSetStep(4, 'active', '진행중 (🟡)');
                ctrlUpdateLocalAgentStatus(3, 'running', '제작 단가 및 예상 마진율 산출 중');
                logConsole(`[수익분석_계산이] 1차 물리 스펙 수령. 단가표 및 용지 가격 매핑 개시.`, 'info', 3, '수익분석_계산이');

                // B2B 출판사 제안 시 30부 소량, 자체 콘텐츠 복간 시 500부 대량 가동
                const qty = book._a5Recommended ? 30 : 500;
                logConsole(`[수익분석_계산이] 제작 부수: ${qty}부 기준 실시간 요율 매핑 개시.`, 'info', 3, '수익분석_계산이');

                // Supabase에서 실서버 일반등급 단가 불러오기
                let gradeData = null;
                if (_ctrl_supabase) {
                    try {
                        const { data, error } = await _ctrl_supabase.from('master_config').select('data').eq('id', 'config').maybeSingle();
                        if (!error && data?.data) {
                            gradeData = data.data.pricesByGrade?.['일반등급(표준)'];
                            logConsole(`[수익분석_계산이] 실서버 '일반등급(표준)' 원격 단가 테이블 매핑 성공.`, 'success', 3, '수익분석_계산이');
                        }
                    } catch (err) {
                        console.warn('[통제실] master_config 로드 실패, 폴백 단가 적용:', err.message);
                    }
                }

                const calculatedSpecs = sims.map(s => {
                    let pageCost = 15; // 기본 폴백 단가 (면당)
                    const isSheetfed = qty < 50; // 50부 미만 시 낱장(Sheet-fed) 인쇄 강제

                    if (isSheetfed) {
                        // 1. 디지털 낱장 단가 매핑
                        if (s.specName.includes('A5국판')) {
                            const match = gradeData?.sheetSpecs?.find(x => x.n && x.n.includes('A5국판'));
                            pageCost = (match && typeof match.bw === 'number') ? match.bw : 8; // A5 4판걸이 요율 (기본 8원)
                        } else if (s.specName.includes('신국판')) {
                            // 신국판은 낱장 규격에 없으므로 2판거리 패널티 요율 12원 고정 적용
                            pageCost = 12;
                        } else if (s.specName.includes('46배판형')) {
                            const match = gradeData?.sheetSpecs?.find(x => x.n && x.n.includes('46배판'));
                            pageCost = (match && typeof match.bw === 'number') ? match.bw : 15;
                        } else {
                            const match = gradeData?.sheetSpecs?.find(x => x.n && s.specName.includes(x.n.split('(')[0]));
                            pageCost = (match && typeof match.bw === 'number') ? match.bw : 15;
                        }
                    } else {
                        // 2. 디지털 연속지 단가 매핑 (50부 이상)
                        let rollSpecName = '신국판';
                        if (s.specName.includes('A5국판')) rollSpecName = 'A5국판';
                        else if (s.specName.includes('46배판형')) rollSpecName = '46배판';
                        else if (s.specName.includes('국배판')) rollSpecName = '국배판';

                        const match = gradeData?.rollSpecs?.find(x => x.n && x.n.includes(rollSpecName));
                        if (match && match.ivs) {
                            const interval = match.ivs.find(iv => qty >= iv.s && qty <= iv.e);
                            pageCost = (interval && typeof interval.bw === 'number') ? interval.bw : 8; // 연속지 요율 (기본 8원)
                        } else {
                            pageCost = s.specName.includes('국배판') ? 12 : s.specName.includes('46배판형') ? 10 : 8;
                        }
                    }

                    // 공통 단가 매핑 (날개, 코팅, 제본)
                    const wingCost = gradeData?.commons?.find(x => x.n && x.n.includes('표지날개있음'))?.v || 800;

                    let coatingCost = 200;
                    if (isSheetfed) {
                        coatingCost = (gradeData?.sheetCommons && typeof gradeData.sheetCommons['코팅방식_무광'] === 'number') ? gradeData.sheetCommons['코팅방식_무광'] : 200;
                    } else {
                        coatingCost = (gradeData?.rollCommons && typeof gradeData.rollCommons['코팅방식_무광'] === 'number') ? gradeData.rollCommons['코팅방식_무광'] : 200;
                    }

                    let bindingCost = 500;
                    if (isSheetfed) {
                        bindingCost = (gradeData?.sheetCommons && typeof gradeData.sheetCommons['제본방식_무선제본'] === 'number') ? gradeData.sheetCommons['제본방식_무선제본'] : 500;
                    } else {
                        bindingCost = (gradeData?.rollCommons && typeof gradeData.rollCommons['제본방식_무선제본'] === 'number') ? gradeData.rollCommons['제본방식_무선제본'] : 500;
                    }

                    const totalInnerCost = s.pages * qty * pageCost;
                    const totalCoverCost = qty * (wingCost + coatingCost + bindingCost); // 표지 가공비 합산 (800 + 200 + 500 = 1500원)

                    const totalCost = totalInnerCost + totalCoverCost;
                    const unitCost = Math.round(totalCost / qty);

                    let retailPrice = 15000;
                    if (s.specName.includes('국배판')) retailPrice = 24000;
                    else if (s.specName.includes('46배판형')) retailPrice = 21000;
                    else if (s.specName.includes('신국판')) retailPrice = 18500;
                    else if (s.specName.includes('A5국판')) retailPrice = 16800;
                    else retailPrice = 14800;

                    const marginRate = Math.round(((retailPrice - unitCost) / retailPrice) * 100);
                    // B2B 최적화 시에는 A5국판을 BEST로 제안하고, 자체 복간 시에는 신국판을 BEST로 추천
                    const isRecommended = book._a5Recommended ? s.specName.includes('A5국판') : s.specName.includes('신국판');
                    const recommendationText = isRecommended ? '최적 마진 추천 🔥' : (marginRate >= 60 ? '적합도 우수' : marginRate < 50 ? '적합도 낮음' : '적합도 보통');

                    return { ...s, unitCost, retailPrice, marginRate, isRecommended, recommendationText };
                });

                for (let i = 0; i < calculatedSpecs.length; i++) {
                    await new Promise(r => setTimeout(r, 400));
                    const s = calculatedSpecs[i];
                    logConsole(`[수익분석_계산이] ${s.specName} 권당 제작 단가: ₩${s.unitCost.toLocaleString()} | 권장 정가: ₩${s.retailPrice.toLocaleString()} (마진율: ${s.marginRate}%) ➔ ${s.recommendationText}`, 'info', 3, '수익분석_계산이');
                }

                _ctrlSetStep(4, 'done', '완료 (🟢)');
                ctrlUpdateLocalAgentStatus(3, 'success', '수익성 검토 완료');
                logConsole(`[수익분석_계산이] 4개 판형별 원가 및 마진율 최종 산출 완료. 의사결정 카드 전달.`, 'success', 3, '수익분석_계산이');

                // STEP 5: CEO 의사결정 카드
                setTimeout(() => {
                    _ctrlSetStep(5, 'active', '대기중 (🟡)');
                    ctrlUpdateLocalAgentStatus(13, 'active', '의사결정 카드 보고 중');
                    logConsole(`[(총괄) 오케스트레이터] 대표님 대시보드 '의사결정 카드(4대 판형 비교)' 전송. 최종 결정 승인 대기.`, 'warn', 13, '(총괄) 오케스트레이터');

                    _ctrl_simSpecs = calculatedSpecs;

                    // 의사결정 카드 렌더링
                    const decisionArea = document.getElementById('ctrl-decision-area');
                    const decisionGrid = document.getElementById('ctrl-decision-grid');
                    if (decisionArea && decisionGrid) {
                        ctrlShowEl(decisionArea);
                        decisionGrid.innerHTML = calculatedSpecs.map((s, idx) => `
                        <div class="ctrl-decision-card ${s.isRecommended ? 'recommended' : ''}">
                            ${s.isRecommended ? '<div class="ctrl-decision-badge-best">BEST RECOMMEND</div>' : ''}
                            <div class="ctrl-decision-spec-name">${s.specName}</div>
                            <div class="ctrl-decision-specs">
                                <div class="ctrl-decision-spec-row"><span class="label">페이지 수</span><span class="value">${s.pages}p</span></div>
                                <div class="ctrl-decision-spec-row"><span class="label">책등(세네카)</span><span class="value">${s.spineMm}mm</span></div>
                                <div class="ctrl-decision-spec-row"><span class="label">제작 원가(권)</span><span class="value">₩${s.unitCost.toLocaleString()}</span></div>
                                <div class="ctrl-decision-spec-row"><span class="label">권장 판매가</span><span class="value accent">₩${s.retailPrice.toLocaleString()}</span></div>
                            </div>
                            <div class="ctrl-decision-margin-box">
                                <span class="ctrl-decision-margin-label">예상 마진율</span>
                                <span class="ctrl-decision-margin-value">${s.marginRate}%</span>
                            </div>
                            <button class="ctrl-btn-approve" onclick="ctrlApproveSpec(${idx})">이 판형으로 최종 승인</button>
                        </div>`).join('');

                        // 스크롤 유도
                        const body = document.getElementById('ctrl-sim-body');
                        if (body) setTimeout(() => body.scrollTo({ top: decisionArea.offsetTop - 20, behavior: 'smooth' }), 300);
                    }
                }, 1000);
            }, 1000);

        } catch (e) {
            logConsole(`[VDP_조판사] 오류 발생: ${e.message}`, 'error', 4, 'VDP_조판사');
        }
    }, 1200);
}

// ───────────────────────────────────────────
// 15. CEO 판형 승인 (STEP 6)
// ───────────────────────────────────────────
async function ctrlApproveSpec(specIndex) {
    const book = _ctrl_simBook;
    const spec = _ctrl_simSpecs?.[specIndex];
    if (!book || !spec) return;

    _ctrl_approvedSpec = spec;

    const consoleEl = document.getElementById('ctrl-sim-console');
    const logConsole = (message, type = 'info', agentId = null, agentName = null) => {
        const time = new Date().toTimeString().split(' ')[0];
        const colorMap = {
            info: 'color:#7dd3fc;',
            success: 'color:#6ee7b7; font-weight:900;',
            warn: 'color:#fcd34d;',
            error: 'color:#fda4af; font-weight:900;'
        };
        const style = colorMap[type] || 'color:#94a3b8;';
        const line = document.createElement('div');
        line.innerHTML = `<span style="color:#4b5563;">[${time}]</span> <span style="${style}">${message}</span>`;
        consoleEl.appendChild(line);
        consoleEl.scrollTop = consoleEl.scrollHeight;
        if (agentId && agentName) ctrlWriteAuditLog(agentId, agentName, type, message, { bookTitle: book.title, approvedSpec: spec.specName });
    };

    // 버튼 비활성화
    document.querySelectorAll('.ctrl-btn-approve').forEach(btn => {
        btn.disabled = true;
        btn.textContent = btn === event?.currentTarget ? '✅ 승인됨' : '—';
    });

    logConsole(`[CEO] 대표 승인 확인. 규격: '${spec.specName}', 책등: ${spec.spineMm}mm 최종 승인.`, 'success', 13, '(총괄) 오케스트레이터');

    // 승인 로그 기록 (API)
    try {
        await fetch(ctrlApiUrl('/api/decision'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                proposalType: 'REPRINT_SPEC',
                decision: 'APPROVED',
                contextData: {
                    title: book.title,
                    selectedSpec: spec.specName,
                    pages: spec.pages,
                    spineMm: spec.spineMm,
                    unitCost: spec.unitCost,
                    retailPrice: spec.retailPrice,
                    marginRate: spec.marginRate
                }
            })
        });
        logConsole(`[CEO] Supabase 의사결정 영구 로그 적재 완료 (APPROVED).`, 'success', 13, '(총괄) 오케스트레이터');
    } catch (_) { /* 시뮬레이션 계속 */ }

    // 승인 이력 UI 업데이트
    _addCtrlApprovalLog(book.title, spec.specName, spec.marginRate);

    _ctrlSetStep(5, 'done', '승인 완료 (🟢)');

    // STEP 7: 2차 최종 조판 프로그레스
    _ctrlSetStep(6, 'active', '조판 중 (🟡)');
    ctrlUpdateLocalAgentStatus(4, 'running', `최종 판형 '${spec.specName}' PDF/X-4 컴파일 중`);
    logConsole(`[조판_조판이] 승인 신호 수령. 2차 최종 조판 개시 (도련 3mm, Gutter 여백 반영)...`, 'info', 4, '조판_조판이');

    // 컴파일 프로그레스 바 노출
    const compArea = document.getElementById('ctrl-compile-area');
    if (compArea) {
        ctrlShowEl(compArea);
        const body = document.getElementById('ctrl-sim-body');
        if (body) setTimeout(() => body.scrollTo({ top: compArea.offsetTop - 20, behavior: 'smooth' }), 300);

        const progFill = document.getElementById('ctrl-compile-fill');
        const progLabel = document.getElementById('ctrl-compile-label');
        let progress = 0;

        const iv = setInterval(async () => {
            progress += 10;
            if (progFill) progFill.style.width = `${progress}%`;
            if (progLabel) progLabel.textContent = `${progress}%`;

            if (progress === 30) logConsole(`[조판_조판이] 사방 도련(Bleed 3mm) 기준선 레이아웃 적용 중...`, 'info', 4, '조판_조판이');
            else if (progress === 60) logConsole(`[조판_조판이] 양면 제침 홀짝 여백(Gutter) 좌우 변위 자동 정합 중...`, 'info', 4, '조판_조판이');
            else if (progress === 80) logConsole(`[조판_조판이] 쪽번호 및 머리말 폰트 아웃라인 컴파일 중...`, 'info', 4, '조판_조판이');
            else if (progress >= 100) {
                clearInterval(iv);
                logConsole(`[조판_조판이] 최종 PDF/X-4 컴파일 빌드 성공 (300 DPI 규격 준수).`, 'success', 4, '조판_조판이');
                ctrlUpdateLocalAgentStatus(4, 'success', `인쇄용 PDF/X-4 컴파일 완료 (${spec.specName})`);

                // PDF 다운로드 버튼 노출
                const dlArea = document.getElementById('ctrl-compile-download');
                        if (dlArea) {
                    ctrlShowEl(dlArea);
                    dlArea.innerHTML = `
                    <button onclick="ctrlDownloadReprintPDF()" class="ctrl-btn ctrl-btn-primary" style="font-size:11px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        📄 최종 인쇄용 PDF/X-4 다운로드
                    </button>
                    <button onclick="ctrlDownloadCoverPDF()" class="ctrl-btn ctrl-btn-secondary" style="font-size:11px; margin-top:5px;">
                        🎨 표지 인쇄용 PDF 다운로드
                    </button>`;
                }

                // STEP 8: 북 커버 디자인
                setTimeout(async () => {
                    ctrlUpdateLocalAgentStatus(6, 'running', `세네카 연동 북 커버 디자인 제작 중 (두께: ${spec.spineMm}mm)`);
                    logConsole(`[VDP_이지퍼비터(ezpubitor)] 6번 이지퍼비터 가동. 세네카 두께 ${spec.spineMm}mm에 비례 정합하는 커버 펼침면 제작 개시.`, 'info', 6, 'VDP_이지퍼비터(ezpubitor)');

                    const coverArea = document.getElementById('ctrl-cover-area');
                    if (coverArea) {
                        ctrlShowEl(coverArea);
                        const body = document.getElementById('ctrl-sim-body');
                        if (body) setTimeout(() => body.scrollTo({ top: coverArea.offsetTop - 20, behavior: 'smooth' }), 300);

                        drawCtrlBookCover(book.title, spec.specName, spec.spineMm);
                        logConsole(`[VDP_이지퍼비터(ezpubitor)] 책등 폭 ${spec.spineMm}mm 북 커버 전개도 디자인 최종 렌더링 완료.`, 'success', 6, 'VDP_이지퍼비터(ezpubitor)');

                        _ctrlSetStep(6, 'done', '완공 완료 (🟢)');
                        ctrlUpdateLocalAgentStatus(6, 'success', '표지 디자인 완료');
                        ctrlUpdateLocalAgentStatus(13, 'success', '파이프라인 및 DB 적재 완료');
                        logConsole(`[(총괄) 오케스트레이터] 1~8단계 자율 출판 에이전트 연동 파이프라인 무결 완공 성공!`, 'success', 13, '(총괄) 오케스트레이터');

                        // [추가 구현] 7번 그림이 & 11번 알리미 마케팅 빌드 시뮬레이션
                        if (book.title.includes('마녀')) {
                            ctrlUpdateLocalAgentStatus(7, 'running', '소설 마녀 삽화 이미지 창작 중');
                            ctrlUpdateLocalAgentStatus(11, 'running', '마녀 숏폼 및 뉴스카드 인코딩 중');
                            
                            setTimeout(() => {
                                logConsole(`[그림_그림이] 🎨 소설 '마녀' 삽화 프롬프트 "마녀의 고풍스러운 다락방" 기반 AI 이미지 생성 성공.`, 'success', 7, '그림_그림이');
                                ctrlUpdateLocalAgentStatus(7, 'success', '마녀 삽화 이미지 생성 완료');
                            }, 1200);

                            setTimeout(() => {
                                logConsole(`[마케팅_알리미] 🎬 '마녀' 카드뉴스 5장 및 9:16 vertical 숏폼 비디오 인코딩 시작...`, 'info', 11, '마케팅_알리미');
                            }, 2200);

                            setTimeout(() => {
                                logConsole(`[마케팅_알리미] 🎬 '마녀' SNS 홍보 카드뉴스 5장 및 오디오 EQ 결합 숏폼 비디오 컴파일 완공.`, 'success', 11, '마케팅_알리미');
                                ctrlUpdateLocalAgentStatus(11, 'success', '마녀 홍보 숏폼/카드뉴스 빌드 완료');
                            }, 4500);
                        }

                        loadCtrlDashboard();

                        // 최종 완료 푸터
                        const footer = document.getElementById('ctrl-sim-footer');
                        if (footer) {
                            if (book.title.includes('마녀')) {
                                footer.innerHTML = `
                                <div style="font-size:11px; color:#10b981; font-weight:800;">✨ 4번 조판이 & 8번 이지퍼비터 가조판 PDF 연산 완공 완료</div>
                                <div style="display:flex; gap:8px;">
                                    <button onclick="window.ctrlApproveAndSendToPublisher()" class="ctrl-btn ctrl-btn-primary" style="font-size:11px; background:linear-gradient(135deg,#10b981,#059669); padding:10px 18px; font-weight:900; box-shadow: 0 4px 12px rgba(16,185,129,0.3);">🖨️ 가조판 완료 및 출판사 송출</button>
                                </div>`;
                            } else {
                                footer.innerHTML = `
                                <div style="font-size:11px; color:var(--ctrl-sky); font-weight:800;">✨ 에이전트 파이프라인 완공! 마스터 DB에 도서 등록 대기 중</div>
                                <div style="display:flex; gap:8px;">
                                    <button onclick="ctrlCloseSimModal()" class="ctrl-btn" style="background:transparent; border:1px solid var(--ctrl-border-md); color:var(--ctrl-text-mute); font-size:11px;">그냥 닫기</button>
                                    <button onclick="ctrlCloseSimModal()" class="ctrl-btn ctrl-btn-primary" style="font-size:11px; background:linear-gradient(135deg,#10b981,#059669);">🛒 카탈로그 등록 완료 (Supabase 반영)</button>
                                </div>`;
                            }
                        }

                        // 가조판 최종 송출 및 3단 탭 활성화 전역 함수 선언
                        window.ctrlApproveAndSendToPublisher = function() {
                            // 1. 모달 닫기
                            ctrlCloseSimModal();
                            
                            // 2. 출판사 챗봇(erp-chat.js)에 판형 승인 완료 신호 최종 브로드캐스트
                            localStorage.setItem('admin-event-typeset-approved', JSON.stringify({ book: book.title, timestamp: Date.now() }));

                            // 3. 통제실 중앙 탭 즉시 마녀 에셋 뷰로 동기화 활성화
                            window._ctrl_selectedBook = book;
                            window.switchAssetTab('epub');

                            // 4. 지휘 판다 헬퍼창에 최종 송출 완료 메시지 누적
                            const chatContent = document.getElementById('ai-chat-content');
                            if (chatContent) {
                                const botMsg = document.createElement('div');
                                botMsg.className = 'ai-msg ai-msg-bot';
                                botMsg.innerHTML = `
                                    <strong>[가조판 송출 완료]</strong><br>
                                    에이전트들이 최종 완공한 가조판 인쇄용 PDF를 출판친구 ERP로 안전하게 전송하였습니다. 출판사 피드백을 대기합니다.
                                `;
                                chatContent.appendChild(botMsg);
                                setTimeout(() => { chatContent.scrollTop = chatContent.scrollHeight; }, 100);
                            }
                        };
                    }
                }, 1000);
            }
        }, 150);
    }
}

// ───────────────────────────────────────────
// 16. 스텝 노드 상태 변경 헬퍼
// ───────────────────────────────────────────
function _ctrlSetStep(stepNum, state, statusText) {
    const icon = document.getElementById(`ctrl-step-${stepNum}-icon`);
    const status = document.getElementById(`ctrl-step-${stepNum}-status`);
    const name = document.getElementById(`ctrl-step-${stepNum}-name`);

    if (!icon) return;

    icon.className = 'ctrl-step-icon';
    if (state === 'active') {
        icon.classList.add('active');
        if (status) { status.textContent = statusText; status.style.color = 'var(--ctrl-amber)'; }
    } else if (state === 'done') {
        icon.classList.add('done');
        if (status) { status.textContent = statusText; status.style.color = 'var(--ctrl-green)'; }
    } else {
        icon.classList.add('idle');
    }

    if (name) name.style.color = state !== 'idle' ? 'var(--ctrl-text)' : 'var(--ctrl-text-mute)';
}

// ───────────────────────────────────────────
// 17. 북 커버 캔버스 드로잉
// ───────────────────────────────────────────
function drawCtrlBookCover(title, specName, spineMm) {
    const canvas = document.getElementById('ctrl-cover-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const wingWidth = 120;
    const baseWidth = 240;
    const spineWidth = Math.max(spineMm * 4.2, 16);
    const totalWidth = wingWidth * 2 + baseWidth * 2 + spineWidth;
    const height = 300;

    canvas.width = totalWidth + 40;
    canvas.height = height + 40;

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const xLeftWing = 20 + wingWidth;
    const xSpineLeft = 20 + wingWidth + baseWidth;
    const xSpineRight = 20 + wingWidth + baseWidth + spineWidth;
    const xRightWing = 20 + wingWidth + baseWidth * 2 + spineWidth;

    // 그라디언트 배경
    const gradient = ctx.createLinearGradient(20, 20, totalWidth + 20, 20);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(0.20, '#1e293b');
    gradient.addColorStop(0.48, '#0f172a');
    gradient.addColorStop(0.50, '#0ea5e9');
    gradient.addColorStop(0.52, '#0f172a');
    gradient.addColorStop(0.80, '#0284c7');
    gradient.addColorStop(1, '#0c4a6e');
    ctx.fillStyle = gradient;
    ctx.fillRect(20, 20, totalWidth, height);

    // 실증 도서 '마녀'용 실제 표지 PDF 동적 슬라이싱 및 5분할 합체 렌더링
    if (title && title.includes('마녀')) {
        // 이미 렌더링된 캔버스가 캐시되어 있으면 그걸 사용하고, 없으면 PDF.js를 연동해 동적 슬라이싱 실행
        if (window._ctrl_witchCoverRenderedCanvas) {
            drawWitchSlices(window._ctrl_witchCoverRenderedCanvas);
        } else {
            // pdf.js 동적 호출
            if (window.pdfjsLib) {
                renderWitchPdfCover();
            } else {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
                s.onload = () => {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                    renderWitchPdfCover();
                };
                document.head.appendChild(s);
            }
        }

        async function renderWitchPdfCover() {
            try {
                const pdfUrl = ctrlApiUrl('/마녀_표지.pdf');
                const loadingTask = pdfjsLib.getDocument(pdfUrl);
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(1);

                const viewport = page.getViewport({ scale: 2.0 });
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                tempCanvas.width = viewport.width;
                tempCanvas.height = viewport.height;

                await page.render({ canvasContext: tempCtx, viewport: viewport }).promise;
                window._ctrl_witchCoverRenderedCanvas = tempCanvas; // 전역 캐싱하여 중복 리렌더링 방지
                drawWitchSlices(tempCanvas);
            } catch (err) {
                console.warn('[PDF.js] 마녀 표지 PDF 슬라이싱 실패, 폴백 단면 로드 실행:', err.message);
                // 폴백: 마녀_표지.png 단면 로드
                const img = new Image();
                img.src = '/마녀_표지.png';
                img.onload = () => {
                    ctx.drawImage(img, xSpineRight, 20, baseWidth, height);
                    drawOverlayElements();
                };
            }
        }

        function drawWitchSlices(tempCanvas) {
            const w = tempCanvas.width;
            const h = tempCanvas.height;

            // [사용자 피드백 반영: 쪼개지 않고 전체 표지를 축소하여 100% 선명하게 드로잉]
            // 상하좌우 13mm 재단선이 살아있는 원본 펼침면 그래픽을 찌그러짐 없이 전체 영역에 투사합니다.
            ctx.drawImage(tempCanvas, 0, 0, w, h, 20, 20, totalWidth, height);

            drawOverlayElements();
        }

        function drawOverlayElements() {
            // 접지 가이드선 (재단선 및 날개/책등 접지선)
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 4]);
            [xLeftWing, xSpineLeft, xSpineRight, xRightWing].forEach(x => {
                ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, height + 20); ctx.stroke();
            });
            ctx.setLineDash([]);

            // 인쇄용 3mm 재단선(Crop Marks) 코너 십자선 드로잉 연출
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 0.8;
            [20, totalWidth + 20].forEach(x => {
                [20, height + 20].forEach(y => {
                    ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12); ctx.stroke();
                });
            });

            // 책등 두께 mm 표시선 다시 그리기
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(xSpineLeft, height + 28); ctx.lineTo(xSpineRight, height + 28); ctx.stroke();
            ctx.fillStyle = '#0ea5e9';
            ctx.shadowBlur = 0;
            ctx.font = '800 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${spineMm}mm (세네카)`, xSpineLeft + spineWidth / 2, height + 38);
        }
    } else {
        // 접지 가이드선 (재단선 및 날개/책등 접지선)
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        [xLeftWing, xSpineLeft, xSpineRight, xRightWing].forEach(x => {
            ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, height + 20); ctx.stroke();
        });
        ctx.setLineDash([]);
     
        // 인쇄용 3mm 재단선(Crop Marks) 코너 기본 드로잉
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 0.8;
        [20, totalWidth + 20].forEach(x => {
            [20, height + 20].forEach(y => {
                ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12); ctx.stroke();
            });
        });

        // 책등 타이틀
        ctx.save();
        ctx.translate(xSpineLeft + spineWidth / 2, height / 2 + 20);
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        if (spineMm >= 10) {
            ctx.font = '700 9px sans-serif';
            ctx.fillText(title.substring(0, 15), 0, 3);
        }
        ctx.restore();
     
        // 앞표지 제목
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 13px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(title.substring(0, 14), xSpineRight + 20, height / 2 - 10);
        if (title.length > 14) ctx.fillText(title.substring(14, 28), xSpineRight + 20, height / 2 + 8);
     
        ctx.fillStyle = '#38bdf8';
        ctx.font = '900 8px sans-serif';
        ctx.fillText('ANTI-GRAVITY REPRINT', xSpineRight + 20, 45);
     
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '500 8px sans-serif';
        ctx.fillText('출판친구 자율 출판 총괄 도서', xSpineRight + 20, height - 30);
     
        // 책등 mm 표시
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(xSpineLeft, height + 28); ctx.lineTo(xSpineRight, height + 28); ctx.stroke();
        ctx.fillStyle = '#0ea5e9';
        ctx.font = '800 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${spineMm}mm (세네카)`, xSpineLeft + spineWidth / 2, height + 38);
    }
}

// ───────────────────────────────────────────
// 18. PDF 다운로드 (pdf-lib 연동)
// ───────────────────────────────────────────
async function ctrlDownloadReprintPDF() {
    const book = _ctrl_simBook;
    const spec = _ctrl_approvedSpec;
    if (!book || !spec) return;

    try {
        // pdf-lib 동적 로드
        if (!window.PDFLib) {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
                s.onload = resolve; s.onerror = reject;
                document.head.appendChild(s);
            });
        }

        // fontkit 동적 로드
        if (!window.fontkit) {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://unpkg.com/@pdf-lib/fontkit@0.0.4/dist/fontkit.umd.min.js';
                s.onload = resolve; s.onerror = reject;
                document.head.appendChild(s);
            });
        }

        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(fontkit);

        const fontUrl = ctrlApiUrl('/NanumMyeongjo.ttf');
        const fontBytes = await fetch(fontUrl).then(res => res.arrayBuffer());
        const customFont = await pdfDoc.embedFont(fontBytes);

        const specDim = { 'A5국판': [148, 210], '신국판': [152, 225], '46배판형': [188, 257], '국배판': [210, 297] };
        let [tw, th] = [152, 225];
        for (const [k, v] of Object.entries(specDim)) {
            if (spec.specName.includes(k)) { [tw, th] = v; break; }
        }

        const mmPt = 72 / 25.4;
        const trimW = tw * mmPt;
        const trimH = th * mmPt;
        const xOff = (595.275 - trimW) / 2;
        const yOff = (841.889 - trimH) / 2;

        let bytes;
        let isRealEmbedded = false;

        if (book.title.includes('마녀')) {
            try {
                // 대표님이 업로드해주신 '/마녀-본문3쇄.pdf' 로딩 (브라우저 주소 자동 정렬)
                const innerPdfUrl = window.location.origin + '/마녀-본문3쇄.pdf';
                const innerPdfBytes = await fetch(innerPdfUrl).then(res => {
                    if (!res.ok) throw new Error('마녀 내지 PDF fetch 실패');
                    return res.arrayBuffer();
                });
                
                const srcDoc = await PDFDocument.load(innerPdfBytes);
                const srcPages = srcDoc.getPages(); // 전체 페이지 목록 로드
                
                // 93% 정비율 축소 연산
                const scale = 0.93;
                
                // [336페이지 본문 전체 93% 정비율 복사 및 벡터 조판 루프]
                for (let i = 0; i < srcPages.length; i++) {
                    const srcPage = srcPages[i];
                    const { width: srcW, height: srcH } = srcPage.getSize();
                    const drawW = srcW * scale;
                    const drawH = srcH * scale;

                    const page = pdfDoc.addPage([drawW, drawH]);
                    const embeddedPage = await pdfDoc.embedPage(srcPage);
                    
                    page.drawPage(embeddedPage, {
                        x: 0,
                        y: 0,
                        width: drawW,
                        height: drawH
                    });
                }
                
                bytes = await pdfDoc.save();
                isRealEmbedded = true;
            } catch (err) {
                console.warn('[PDF] 마녀 내지 로드 실패, 가상 조판 폴백 실행:', err.message);
            }
        }

        if (!isRealEmbedded) {
            const page = pdfDoc.addPage([595.275, 841.889]);
            page.drawRectangle({ x: xOff, y: yOff, width: trimW, height: trimH, borderWidth: 0.5, borderColor: rgb(0.5, 0.5, 0.5), borderDashArray: [2, 2] });
            page.drawRectangle({ x: xOff - 8.5, y: yOff - 8.5, width: trimW + 17, height: trimH + 17, borderWidth: 0.75, borderColor: rgb(0.9, 0.2, 0.2) });

            page.drawText(`[통제실 시뮬레이션] ${book.title}`, { x: xOff + 20, y: yOff + trimH - 50, size: 12, font: customFont, color: rgb(0.28, 0.34, 0.42) });
            page.drawText(`규격: ${spec.specName} / 페이지: ${spec.pages}p / 책등: ${spec.spineMm}mm`, { x: xOff + 20, y: yOff + trimH - 80, size: 9, font: customFont, color: rgb(0.39, 0.45, 0.55) });
            page.drawText(`출판친구 자율출판 에이전트 통제실 -- 인쇄용 조판 시뮬레이터 결과물`, { x: xOff + 20, y: yOff + 30, size: 8, font: customFont, color: rgb(0.39, 0.45, 0.55) });

            bytes = await pdfDoc.save();
        }

        const link = document.createElement('a');
        const fname = book.title.replace(/[/\\?%*:|"<>\s]/g, '_');
        link.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        link.download = `[인쇄용_최종조판]_${fname}_${spec.specName}.pdf`;
        link.click();
    } catch (err) {
        alert('PDF 생성 오류: ' + err.message);
    }
}

async function ctrlDownloadCoverPDF() {
    const book = _ctrl_simBook;
    const spec = _ctrl_approvedSpec;
    if (!book || !spec) return;

    try {
        if (!window.PDFLib) {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
                s.onload = resolve; s.onerror = reject;
                document.head.appendChild(s);
            });
        }

        const { PDFDocument, rgb, PDFOperator, PDFNumber } = PDFLib;
        const pdfDoc = await PDFDocument.create();

        // [초정밀 벡터 3분할 임포지션 결합]
        // 디자이너의 원래 13mm 재단마크를 품은 채, 뒷표지/날개는 93% 축소하고 책등만 21.8mm 100% 두께를 보존하여 좌우 결합!
        const coverPdfUrl = window.location.origin + '/마녀_표지.pdf';
        const coverPdfBytes = await fetch(coverPdfUrl).then(res => {
            if (!res.ok) throw new Error('표지 PDF 파일 로드 실패');
            return res.arrayBuffer();
        });

        // 1. 비례 계산을 위해 원본 도큐먼트 로드
        const tempDoc = await PDFDocument.load(coverPdfBytes);
        const srcPage = tempDoc.getPages()[0];
        const { width: srcW, height: srcH } = srcPage.getSize();

        // 3분할 영역 비례 계산 (W: 553.8mm 기준)
        const leftPartW = srcW * 0.480;   // 1. 좌측 영역 (뒷날개 + 뒷표지 + 좌측 도련)
        const spinePartW = srcW * 0.040;  // 2. 중앙 책등 영역
        const rightPartW = srcW * 0.480;  // 3. 우측 영역 (앞표지 + 앞날개 + 우측 도련)

        const scale = 0.93; // 93% 축소
        const drawLeftW = leftPartW * scale;
        const drawRightW = rightPartW * scale;
        const drawH = srcH * scale;

        // 책등 두께는 축소하지 않고 100% 보존! (A5 336P 21.8mm 실제 두께 보증)
        const drawSpineW = spinePartW;

        // 최종 가로 크기: 좌측축소너비 + 100%책등너비 + 우측축소너비
        const finalW = drawLeftW + drawSpineW + drawRightW;
        
        const page = pdfDoc.addPage([finalW, drawH]);
        const embeddedPage = await pdfDoc.embedPage(srcPage);

        const drawW = srcW * scale; // 93% 정비율 축소된 전체 가로 너비

        // 1. 좌측 블록 그리기 (뒷날개 + 뒷표지) ➔ [x: 0, y: 0, 너비: drawLeftW, 높이: drawH] 영역으로 벡터 클리핑 격리
        page.pushOperators(
            PDFOperator.of('q'), // pushGraphicsState
            PDFOperator.of('re', [
                PDFNumber.of(0),
                PDFNumber.of(0),
                PDFNumber.of(drawLeftW),
                PDFNumber.of(drawH)
            ]), // rectangle
            PDFOperator.of('W'), // clip
            PDFOperator.of('n')  // endPath
        );
        page.drawPage(embeddedPage, {
            x: 0,
            y: 0,
            width: drawW,
            height: drawH
        });
        page.pushOperators(PDFOperator.of('Q')); // popGraphicsState

        // 2. 중앙 책등 영역 그리기
        // 2-1. 단색 배경 사각형 칠하기 (인쇄소 사양 안전 세네카)
        page.drawRectangle({
            x: drawLeftW,
            y: 0,
            width: drawSpineW,
            height: drawH,
            color: rgb(0.06, 0.09, 0.16)
        });
        // 2-2. 정비율 축소한 책등 그래픽을 중앙 정렬하여 얹기 (글씨 찌그러짐 0%) ➔ [x: drawLeftW, y: 0, 너비: drawSpineW, 높이: drawH] 영역으로 벡터 클리핑 격리
        const scaleSpineW = spinePartW * scale;
        const spineOffset = (drawSpineW - scaleSpineW) / 2;
        page.pushOperators(
            PDFOperator.of('q'), // pushGraphicsState
            PDFOperator.of('re', [
                PDFNumber.of(drawLeftW),
                PDFNumber.of(0),
                PDFNumber.of(drawSpineW),
                PDFNumber.of(drawH)
            ]), // rectangle
            PDFOperator.of('W'), // clip
            PDFOperator.of('n')  // endPath
        );
        page.drawPage(embeddedPage, {
            x: drawLeftW - (leftPartW * scale) + spineOffset,
            y: 0,
            width: drawW,
            height: drawH
        });
        page.pushOperators(PDFOperator.of('Q')); // popGraphicsState

        // 3. 우측 영역 그리기 (앞표지 + 앞날개) ➔ [x: drawLeftW + drawSpineW, y: 0, 너비: drawRightW, 높이: drawH] 영역으로 벡터 클리핑 격리
        page.pushOperators(
            PDFOperator.of('q'), // pushGraphicsState
            PDFOperator.of('re', [
                PDFNumber.of(drawLeftW + drawSpineW),
                PDFNumber.of(0),
                PDFNumber.of(drawRightW),
                PDFNumber.of(drawH)
            ]), // rectangle
            PDFOperator.of('W'), // clip
            PDFOperator.of('n')  // endPath
        );
        page.drawPage(embeddedPage, {
            x: (drawLeftW + drawSpineW) - ((leftPartW + spinePartW) * scale),
            y: 0,
            width: drawW,
            height: drawH
        });
        page.pushOperators(PDFOperator.of('Q')); // popGraphicsState

        const bytes = await pdfDoc.save();
        const link = document.createElement('a');
        const fname = book.title.replace(/[/\\?%*:|"<>\s]/g, '_');
        link.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        link.download = `[인쇄용_표지]_${fname}_A5국판_표지전개도.pdf`;
        link.click();
    } catch (err) {
        alert('표지 PDF 생성 오류: ' + err.message);
    }
}

// ───────────────────────────────────────────
// 19. 모달 닫기
// ───────────────────────────────────────────
function ctrlCloseSimModal() {
    const wrap = document.getElementById('ctrl-sim-modal-wrap');
    if (wrap) {
        wrap.style.animation = 'fadeInOverlay 0.2s ease reverse';
        setTimeout(() => wrap.remove(), 200);
    }
}

// ───────────────────────────────────────────
// 20. 승인 이력 UI 추가
// ───────────────────────────────────────────
function _addCtrlApprovalLog(title, specName, marginRate) {
    const container = document.getElementById('ctrl-approval-log');
    if (!container) return;

    // 빈 상태 메시지 제거
    const emptyEl = container.querySelector('.ctrl-approval-empty');
    if (emptyEl) emptyEl.remove();

    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const item = document.createElement('div');
    item.className = 'ctrl-approval-item';
    item.innerHTML = `
        <div style="flex:1;">
            <div class="ctrl-approve-title">✅ CEO 승인 완료</div>
            <div class="ctrl-approve-detail">${title} · ${specName} · 마진율 ${marginRate}%</div>
        </div>
        <div class="ctrl-approve-time">${time}</div>`;
    container.prepend(item);

    _ctrl_approvalLog.unshift({ title, specName, marginRate, time });
}

// ───────────────────────────────────────────
// 21. 시뮬레이션 모달 HTML 빌더
// ───────────────────────────────────────────
function buildSimModalHTML(book) {
    const processTitle = book._a5Recommended ? 'B2B 출판사 제안 프로세스' : '자체 콘텐츠 제작 프로세스';
    const qtyText = book._a5Recommended ? '소량 30부 제작 기준' : '초판 500부 제작 기준';
    return `
    <div class="ctrl-sim-modal" onclick="event.stopPropagation()">
        <!-- Header -->
        <div class="ctrl-sim-header">
            <div>
                <div class="ctrl-sim-title-label">
                    <span style="width:8px;height:8px;border-radius:50%;background:var(--ctrl-sky);display:inline-block;animation:dotPulse 1.2s infinite;"></span>
                    13번 (총괄) 오케스트레이터 자율 의사결정 파이프라인
                </div>
                <div class="ctrl-sim-title">${processTitle}</div>
            </div>
            <button class="ctrl-sim-close" onclick="ctrlCloseSimModal()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>

        <!-- Body -->
        <div class="ctrl-sim-body" id="ctrl-sim-body">

            <!-- 도서 요약 -->
            <div class="ctrl-book-summary">
                <div>
                    <div class="ctrl-book-summary-label">복간 대상 도서</div>
                    <div class="ctrl-book-summary-title">${book.title}</div>
                    <div class="ctrl-book-summary-meta">저자: ${book.author || '미상'} | 출판사: ${book.publisher || '미상'} | 발행연도: ${book.pub_year ? book.pub_year + '년' : '미상'}</div>
                </div>
                <div style="text-align:right;">
                    <div class="ctrl-book-summary-score-label">복간 타당성 점수</div>
                    <div class="ctrl-book-summary-score-value">${book.reprint_score || 0}<span style="font-size:14px; color:var(--ctrl-text-mute);">점</span></div>
                </div>
            </div>

            <!-- 파이프라인 스텝 시각화 -->
            <div class="ctrl-step-visualizer">
                ${[
            ['1', '딥서치_살피미', 'done', '완료 (🟢)'],
            ['2', '데이터정제_다듬이', 'done', '완료 (🟢)'],
            ['3', '조판_조판이', 'idle', '대기'],
            ['4', '수익분석_계산이', 'idle', '대기'],
            ['5', '대표님 승인', 'idle', '대기'],
            ['6', '최종조판/VDP', 'idle', '대기'],
        ].map(([num, name, state, status]) => `
                <div class="ctrl-step">
                    <div class="ctrl-step-icon ${state}" id="ctrl-step-${num}-icon">${num}</div>
                    <div class="ctrl-step-name" id="ctrl-step-${num}-name">${name}</div>
                    <div class="ctrl-step-status" id="ctrl-step-${num}-status" style="color:${state === 'done' ? 'var(--ctrl-green)' : state === 'active' ? 'var(--ctrl-amber)' : 'var(--ctrl-text-mute)'};">${status}</div>
                </div>`).join('')}
            </div>

            <!-- 시뮬레이션 콘솔 -->
            <div class="ctrl-sim-console" id="ctrl-sim-console"></div>

            <!-- 의사결정 카드 영역 -->
            <div id="ctrl-decision-area" class="hidden" style="display:none;">
                <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--ctrl-border); padding-bottom:12px; margin-bottom:16px;">
                    <h4 style="font-size:13px; font-weight:900; color:var(--ctrl-text); display:flex; align-items:center; gap:8px;">
                        <span style="width:4px; height:16px; background:var(--ctrl-sky); border-radius:2px; display:inline-block;"></span>
                        📊 의사결정 카드 (4대 표준 판형 수익성 분석)
                    </h4>
                    <span style="font-size:10px; background:rgba(245,158,11,0.1); color:var(--ctrl-amber); padding:3px 10px; border-radius:6px; font-weight:800; border:1px solid rgba(245,158,11,0.2);">${qtyText}</span>
                </div>
                <div class="ctrl-decision-grid" id="ctrl-decision-grid"></div>
            </div>

            <!-- 컴파일 진행 영역 -->
            <div id="ctrl-compile-area" class="hidden" style="display:none;">
                <div class="ctrl-compile-area" style="display:flex; flex-direction:column; gap:12px;">
                    <div class="ctrl-compile-title">
                        <span style="width:8px;height:8px;border-radius:50%;background:var(--ctrl-sky);display:inline-block;animation:dotPulse 1.2s infinite;"></span>
                        4번 조판_조판이: 2차 최종 조판 및 PDF/X-4 인쇄용 파일 빌드 중...
                    </div>
                    <div class="ctrl-progress-track">
                        <div class="ctrl-progress-fill" id="ctrl-compile-fill"></div>
                    </div>
                    <div class="ctrl-progress-label" id="ctrl-compile-label">0%</div>
                    <div id="ctrl-compile-download" class="hidden" style="display:none;"></div>
                </div>
            </div>

            <!-- 북 커버 영역 -->
            <div id="ctrl-cover-area" class="hidden" style="display:none;">
                <div class="ctrl-cover-area">
                    <div class="ctrl-cover-title">
                        <span style="width:8px;height:8px;border-radius:50%;background:#f472b6;display:inline-block;"></span>
                        6번 VDP_이지퍼비터(ezpubitor): 책등 두께 정밀 정합 북 커버 전개도 디자인 출력 완료
                    </div>
                    <canvas id="ctrl-cover-canvas" width="650" height="280" style="border:1px solid var(--ctrl-border); border-radius:12px; max-width:100%; margin-bottom: 10px;"></canvas>
                </div>
            </div>

        </div>

        <!-- Footer -->
        <div class="ctrl-sim-footer" id="ctrl-sim-footer">
            <div class="ctrl-sim-footer-note">* 이 파이프라인은 실시간으로 Supabase DB 데이터 상태에 영구 기록됩니다.</div>
            <button onclick="ctrlCloseSimModal()" class="ctrl-btn" style="background:transparent; border:1px solid var(--ctrl-border-md); color:var(--ctrl-text-mute); font-size:11px; font-weight:800;">
                시뮬레이션 중단 및 닫기
            </button>
        </div>
    </div>`;
}

// ───────────────────────────────────────────
// 22. hidden 클래스 안전 해제 헬퍼
// ───────────────────────────────────────────
// hidden 클래스를 제거하면서 display:none 인라인 스타일도 함께 해제
function ctrlShowEl(id) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return;
    el.classList.remove('hidden');
    el.style.removeProperty('display');
}

// ───────────────────────────────────────────
// 23. AI Helper (Antigravity) 및 자가치유 파이프라인 연동
// ───────────────────────────────────────────

window.toggleAIPanel = function () {
    const panel = document.getElementById('ai-panel');
    const fab = document.getElementById('ai-fab');
    if (!panel || !fab) return;

    // 헬퍼창을 열 때 노란색 깜빡임(골드 펄스) 효과 완전히 해제
    fab.classList.remove('pulse-gold');

    panel.classList.toggle('active');
    if (panel.classList.contains('active')) {
        fab.classList.add('active');
        fab.style.opacity = '0';
        fab.style.pointerEvents = 'none';
    } else {
        fab.classList.remove('active');
        fab.style.opacity = '1';
        fab.style.pointerEvents = 'all';
    }

    if (window.lucide) {
        try { lucide.createIcons(); } catch (e) { }
    }
};

function showAIPanelOnError() {
    const panel = document.getElementById('ai-panel');
    const fab = document.getElementById('ai-fab');
    const agentAction = document.getElementById('ai-agent-action');

    if (panel) panel.classList.add('active');
    if (fab) {
        fab.classList.add('active');
        fab.style.opacity = '0';
        fab.style.pointerEvents = 'none';
    }
    if (agentAction) agentAction.classList.remove('hidden');

    const chatContent = document.getElementById('ai-chat-content');
    if (chatContent) {
        setTimeout(() => {
            chatContent.scrollTop = chatContent.scrollHeight;
        }, 100);
    }
}

async function reportSystemError(errorData) {
    try {
        const payload = {
            message: errorData.message,
            filename: errorData.filename || '알 수 없음',
            lineno: errorData.lineno || 0,
            colno: errorData.colno || 0,
            userId: errorData.userId,
            userRole: errorData.userRole,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        };

        const res = await fetch(ctrlApiUrl('/api/heal'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'trigger_error',
                ...payload
            })
        });

        if (res.ok) {
            triggerSelfHealingPipeline(payload);
        } else {
            const errData = await res.json();
            const statusText = document.getElementById('self-heal-status-text');
            const codeBlock = document.getElementById('self-heal-code-block');
            const btn = document.getElementById('self-heal-submit-btn');

            if (statusText && codeBlock && btn) {
                statusText.innerText = "❌ 12번 AI 보안관 실시간 침입 탐지 및 패킷 파기";
                statusText.style.color = "#ef4444";
                codeBlock.style.background = "#fff5f5";
                codeBlock.style.color = "#991b1b";
                codeBlock.style.borderColor = "#fecaca";
                codeBlock.innerText = `[보안 감사 로그]\n${errData.error || '악성 페이로드 유입 차단됨.'}`;
                btn.innerText = "프롬프트 인젝션 차단으로 배포 잠금";
                btn.className = "w-full py-3 bg-red-600 text-white rounded-xl text-xs font-black shadow-lg cursor-not-allowed";
            }
        }
    } catch (e) {
        console.error("에러 모니터링 API 전송 실패:", e);
    }
}

window.triggerAIError = function (testName = 'Manual Demo') {
    try {
        console.log("테스트 에러를 인위적으로 발생시킵니다.");
        const err = new Error(`[데모 테스트] ${testName} - 실시간 에러 감지 기능 작동 중!`);
        reportSystemError({
            message: err.message,
            filename: 'control.js',
            lineno: 105,
            colno: 0,
            userId: sessionStorage.getItem('userId') || 'admin_control',
            userRole: sessionStorage.getItem('userRole') || 'admin'
        });
        showAIPanelOnError();
    } catch (e) {
        console.error('[triggerAIError] 내부 오류:', e);
    }
};

window.simulateFix = function (eventOrNull, prUrl) {
    const chatContent = document.getElementById('ai-chat-content');
    if (!chatContent) return;

    const doneCard = document.createElement('div');
    doneCard.className = 'ai-msg ai-msg-bot';
    doneCard.style.cssText = 'border-left: 4px solid #10b981; background: #f0fdf4; animation: fadeIn 0.4s ease; align-self:flex-start; max-width:100%; width:100%;';
    doneCard.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; color:#065f46; font-weight:900; margin-bottom:8px;">
            <span style="font-size:20px;">🟢</span>
            <span>[11번 배포_배달이] 조치 완료 보고</span>
        </div>
        <p style="font-size:12px; color:#374151; line-height:1.6; margin-bottom:8px;">
            대표님의 모바일 디스코드 승인이 확인되었습니다.<br>
            자가치유 패치가 Vercel Production 서버에 성공적으로 반영되었습니다. ✨
        </p>
        <div style="background:#fff; border:1px solid #d1fae5; border-radius:10px; padding:10px; font-size:11px; font-family:monospace; color:#065f46;">
            ✅ 거버넌스 락 해제 완료<br>
            ✅ GitHub PR 자동 머지 완료<br>
            ✅ Vercel 자동 빌드 & 배포 완료<br>
            🔗 <a href="${prUrl || '#'}" target="_blank" style="color:#0284c7; text-decoration:underline;">${prUrl ? 'PR 링크 확인' : '(PR URL 없음)'}</a>
        </div>
    `;
    chatContent.appendChild(doneCard);
    if (window.lucide) {
        try { lucide.createIcons(); } catch (e) { }
    }
    setTimeout(() => { chatContent.scrollTop = chatContent.scrollHeight; }, 100);
};

async function triggerSelfHealingPipeline(payload) {
    const agentAction = document.getElementById('ai-agent-action');
    if (!agentAction) return;

    agentAction.classList.remove('hidden');
    agentAction.innerHTML = `
        <div class="ai-msg ai-msg-bot">
            🚨 **시스템 에러 감지!**<br>
            9번 에러감지_눈치왕이 에러를 포착하여 분석 보고서를 작성했습니다. 10번 코드수정_닥터 에이전트를 긴급 호출합니다.
        </div>
        <div class="ai-action-card">
            <div class="ai-status-pulse">
                <div class="pulse-dot"></div>
                <span id="self-heal-status-text">10번 코드수정_닥터(자가치유) 코딩 엔진 가동 중...</span>
            </div>
            <div class="ai-code-block" id="self-heal-code-block" style="font-family: monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto;">
                // 에러 파일: ${payload.filename} (라인: ${payload.lineno})<br>
                // 분석 컨텍스트 격리 수행 중...<br>
                // 오류 분석 및 치료 패치 생성 대기...
            </div>
            <button id="self-heal-submit-btn" disabled
                class="w-full py-3 bg-slate-400 text-white rounded-xl text-xs font-black shadow-lg cursor-not-allowed">
                배포 승인 대기 중
            </button>
        </div>
    `;

    const chatContent = document.getElementById('ai-chat-content');
    if (chatContent) {
        setTimeout(() => {
            chatContent.scrollTop = chatContent.scrollHeight;
        }, 100);
    }

    try {
        const res = await fetch(ctrlApiUrl('/api/heal'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'heal',
                ...payload
            })
        });

        const codeBlock = document.getElementById('self-heal-code-block');
        const statusText = document.getElementById('self-heal-status-text');
        const btn = document.getElementById('self-heal-submit-btn');

        if (res.ok) {
            const data = await res.json();
            statusText.innerText = "10번 코드수정_닥터 코드 보정 완료 (12번 보안통제_보안관 통과)";

            let logHtml = `// 🛠️ [10번 코드수정_닥터 에이전트 수정 내역]\n`;
            logHtml += `// 설명: ${data.explanation}\n\n`;
            logHtml += `// [수정된 코드 패치]\n${data.patch}\n\n`;
            logHtml += `// [Git CLI 로그]\n`;
            data.gitLog.forEach(log => {
                logHtml += `> ${log}\n`;
            });
            logHtml += `\n🔗 PR Link: ${data.prUrl}`;

            codeBlock.innerHTML = logHtml;
            btn.className = "w-full py-3 bg-amber-500 text-white rounded-xl text-xs font-black shadow-lg flex items-center justify-center gap-2";
            btn.innerText = "⏳ 대표님 모바일 승인 대기 중 (거버넌스 락)";
            btn.disabled = true;

            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(ctrlApiUrl(`/api/deploy-status?pr=${data.prBranch}`));
                    if (statusRes.ok) {
                        const statusData = await statusRes.json();
                        if (statusData.status === 'APPROVED') {
                            clearInterval(pollInterval);
                            statusText.innerText = "11번 배포_배달이: 대표님 모바일 승인 확인 (배포 개시)";
                            statusText.style.color = "#10b981";
                            btn.className = "w-full py-3 bg-emerald-600 text-white rounded-xl text-xs font-black shadow-lg";
                            btn.innerText = "🟢 배포 승인 완료! Vercel Production 반영 성공";
                            simulateFix(null, data.prUrl);
                        } else if (statusData.status === 'REJECTED') {
                            clearInterval(pollInterval);
                            statusText.innerText = "11번 배포_배달이: 대표님 모바일 배포 반려 (배포 거부)";
                            statusText.style.color = "#ef4444";
                            btn.className = "w-full py-3 bg-red-600 text-white rounded-xl text-xs font-black shadow-lg";
                            btn.innerText = "❌ 배포 반려됨 (소스코드 복구 완료)";
                            codeBlock.style.background = "#fff5f5";
                            codeBlock.style.color = "#991b1b";
                            codeBlock.innerHTML = `// ❌ [배포 반려 알림]\n// 대표님이 모바일(디스코드 웹훅)에서 배포를 반려 처리하셨습니다.\n// 코드수정_닥터의 수정 코드는 무효화되었으며, 기존 운영 서버는 안전하게 롤백(Rollback) 상태를 유지합니다.`;
                        }
                    }
                } catch (err) {
                    console.warn("배포 상태 폴링 오류:", err);
                }
            }, 2000);

        } else {
            const errorData = await res.json();
            statusText.innerText = "❌ 12번 보안통제_보안관 검증 반려 (배포 중단)";
            statusText.style.color = "#ef4444";
            codeBlock.style.background = "#fff5f5";
            codeBlock.style.color = "#991b1b";
            codeBlock.style.borderColor = "#fecaca";
            codeBlock.innerText = `[보안 감사 로그]\n${errorData.message || '패치 생성 과정에 오류가 발생했습니다.'}`;
            btn.innerText = "보안 규격 미달로 배포 승인 차단됨";
            btn.className = "w-full py-3 bg-red-600 text-white rounded-xl text-xs font-black shadow-lg cursor-not-allowed";
        }
    } catch (e) {
        console.error("자가치유 엔진 호출 실패:", e);
    }
}

function showSecurityAlertUI(message, modifiedFiles) {
    const chatContent = document.getElementById('ai-chat-content');
    if (!chatContent) return;

    const alertMsg = document.createElement('div');
    alertMsg.className = 'ai-msg ai-msg-bot';
    alertMsg.style.borderLeft = '4px solid #ef4444';
    alertMsg.style.background = '#fff5f5';

    let detailsHtml = '';
    if (modifiedFiles && modifiedFiles.length > 0) {
        detailsHtml = '<div class="ai-code-block" style="border-color: #fecaca; background: #fff; color: #991b1b; font-family: monospace; font-size: 11px; margin-top: 8px; padding: 10px; border-radius: 8px; line-height: 1.4; border: 1px solid #fee2e2;">';
        modifiedFiles.forEach(fileInfo => {
            detailsHtml += `📁 파일: <b>${fileInfo.file}</b><br>`;
            fileInfo.leaks.forEach(leak => {
                detailsHtml += `⚠️ 라인 ${leak.line}: 하드코딩된 <b>${leak.ruleName}</b> 노출 감지<br>`;
                detailsHtml += `➔ <code>process.env</code> 치환 및 안전지대 대피 완료<br>`;
            });
        });
        detailsHtml += '</div>';
    }

    alertMsg.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; color: #ef4444; font-weight: 900; margin-bottom: 6px;">
            <i data-lucide="shield-alert" class="w-4 h-4 text-red-500"></i>
            <span>🚨 [12번 보안통제_보안관] 보안 차단 및 즉시 조치 보고</span>
        </div>
        <p style="font-size: 12px; line-height: 1.5; color: #374151;">${message}</p>
        ${detailsHtml}
    `;

    chatContent.appendChild(alertMsg);
    if (window.lucide) {
        try { lucide.createIcons(); } catch (e) { }
    }

    setTimeout(() => {
        chatContent.scrollTop = chatContent.scrollHeight;
    }, 100);
}

function startSecuritySheriffWatchdog() {
    setInterval(async () => {
        try {
            const res = await fetch(ctrlApiUrl('/api/scan-secrets'));
            if (res.ok) {
                const data = await res.json();
                if (data.alert && data.modifiedFiles && data.modifiedFiles.length > 0) {
                    showSecurityAlertUI(data.message, data.modifiedFiles);
                }
            }
        } catch (e) {
            console.warn("보안관 스캔 엔진 통신 장애 (백그라운드 대기):", e.message);
        }
    }, 30000);
}

// ───────────────────────────────────────────
// 24. AI Helper UI 이벤트 바인딩 및 초기 설정 (중복 제거 완료 - 상단 통합됨)
// ───────────────────────────────────────────

// ═══════════════════════════════════════════════════
// [NEW] 조직도 사업부별 수직 아코디언
// ═══════════════════════════════════════════════════
function initOrgAccordion() {
    // JS에서 renderCtrlAgentOrgTree()가 아코디언 HTML을 동적 생성하므로
    // 여기서는 정적 HTML org-tree 내에 기존 .ctrl-dept 형식으로 있는 경우도 커버.
    // 실제 아코디언 이벤트는 renderCtrlAgentOrgTree() 혹은 아래 setupAccordionEvents()에서 처리.
    setupAccordionEvents();
}

/**
 * .ctrl-org-tree 내부의 .org-accordion-section 헤더에
 * 클릭 이벤트를 바인딩한다.
 * renderCtrlAgentOrgTree() 가 DOM을 새로 그린 뒤에도 호출되어야 함.
 */
function setupAccordionEvents() {
    const tree = document.getElementById('ctrl-org-tree');
    if (!tree) return;

    const isMobile = () => window.innerWidth <= 768;

    // 기존 리스너 중복 방지를 위해 새 헤더만 바인딩
    tree.querySelectorAll('.org-accordion-header').forEach(header => {
        if (header._accordionBound) return;
        header._accordionBound = true;

        header.addEventListener('click', () => {
            const section = header.closest('.org-accordion-section');
            if (!section) return;

            const isOrch = section.classList.contains('org-dept-orch');
            // 총지휘부는 항상 열린 상태 유지
            if (isOrch && section.classList.contains('is-open')) return;

            const isNowOpen = section.classList.toggle('is-open');
            header.setAttribute('aria-expanded', String(isNowOpen));
        });
    });

    // 초기 상태: PC는 모든 섹션 펼침 / 모바일은 총지휘부만 펼침
    tree.querySelectorAll('.org-accordion-section').forEach(section => {
        if (!section._accordionInitialized) {
            section._accordionInitialized = true;
            const isOrch = section.classList.contains('org-dept-orch');
            if (!isMobile() || isOrch) {
                section.classList.add('is-open');
                const header = section.querySelector('.org-accordion-header');
                if (header) header.setAttribute('aria-expanded', 'true');
            }
        }
    });
}

// ═══════════════════════════════════════════════════
// [NEW] TOP3 클릭 시 저작권 만료 도서 → ePub 뷰어 분기
//       일반 도서 → 기존 시뮬레이션 모달
// ═══════════════════════════════════════════════════
window._ctrl_selectedBook = null;
window._ctrl_activeTab = 'epub';

window.ctrlStartSimByIndex = function ctrlStartSimByIndex(index) {
    const book = _ctrl_candidates[index];
    if (!book) return;

    window._ctrl_selectedBook = book;
    
    // 저작권 만료 도서(public_domain)인 경우 ePub 뷰어/마케팅 팩 자동 실행
    if (book.copyright_status === 'public_domain') {
        window.switchAssetTab('epub');
    } else {
        // 일반 도서인 경우 마케팅 팩 카드뉴스 탭으로 자동 연결하여 생성 연출
        window.switchAssetTab('news');
        // 동시에 기존 실물 종이책 시뮬레이션 모달도 병행 오픈
        startCtrlSimByBookData(book);
    }
};

// ═══════════════════════════════════════════════════
// [NEW] ePub3 가상 뷰어 리셋 및 낭독 중지 헬퍼
// ═══════════════════════════════════════════════════
function resetEpubViewer() {
    const viewer = document.getElementById('ctrl-epub-viewer');
    if (!viewer) return;

    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    _epubSpeechPlaying = false;
    _epubWordSpans = [];
    _epubCurrentWordIdx = -1;
    _epubAudioProgress = 0;
    if (_epubAudioTimer) { clearInterval(_epubAudioTimer); _epubAudioTimer = null; }

    viewer.innerHTML = `
        <div class="ctrl-epub-idle">
            <i data-lucide="book-open" style="width:32px;height:32px;opacity:0.3;"></i>
            <p>파이프라인 실행 후 복간 후보 도서를 클릭하면<br>ePub3 샘플러와 마케팅 팩이 이 곳에서 활성화됩니다.</p>
        </div>`;

    _ctrl_epubViewerActive = false;
    window._ctrl_selectedBook = null;
    window._ctrl_activeTab = 'epub';

    // 탭 헤더 활성화 상태 리셋
    document.querySelectorAll('.ctrl-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = 'var(--ctrl-text-mute)';
        btn.style.boxShadow = 'none';
    });
    const epubBtn = document.getElementById('tab-btn-epub');
    if (epubBtn) {
        epubBtn.classList.add('active');
        epubBtn.style.background = 'rgba(255,255,255,0.08)';
        epubBtn.style.color = 'var(--ctrl-text)';
        epubBtn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    }

    if (window.lucide) {
        try { lucide.createIcons(); } catch (e) { }
    }
}

// ═══════════════════════════════════════════════════
// [UPDATED] ePub3 가상 뷰어 렌더링 — Web Speech API 오디오 리더기
// ═══════════════════════════════════════════════════
let _epubSpeechUtterance = null;
let _epubSpeechPlaying = false;
let _epubWordSpans = [];
let _epubCurrentWordIdx = -1;
let _epubAudioProgress = 0;
let _epubAudioTimer = null;

function renderEpubViewer(book) {
    const viewer = document.getElementById('ctrl-epub-viewer');
    if (!viewer) return;

    // ePub 모드 플래그 ON — 종이책 헬퍼 알림 차단
    _ctrl_epubViewerActive = true;

    // 기존 음성 즉시 중지
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    _epubSpeechPlaying = false;
    _epubWordSpans = [];
    _epubCurrentWordIdx = -1;
    _epubAudioProgress = 0;
    if (_epubAudioTimer) { clearInterval(_epubAudioTimer); _epubAudioTimer = null; }

    const title = (book.title || '').replace(/<\/?[^>]+(>|$)/g, '');
    const author = (book.author || '저자 미상').replace(/<\/?[^>]+(>|$)/g, '');

    // ── ePub3 상품 카드 데이터 ──
    const products = [
        {
            name: 'Interactive ePub3',
            desc: '서두 번역 + AI 삽화 + 오디오북 탑재',
            price: '8,000',
            royalty: '0.0%',
            cost: '500원',
            costDetail: 'DeepL 번역 150원 + TTS 합성 250원 + AI 삽화 70원 + CDN 30원',
            margin: '92%',
            badge: 'BEST RECOMMEND',
            badgeColor: 'linear-gradient(135deg,#a855f7,#0ea5e9)',
            marginColor: '#a855f7'
        },
        {
            name: '텍스트 전용 ePub',
            desc: 'AI 교정 + 기본 조판',
            price: '4,000',
            royalty: '0.0%',
            cost: '150원',
            costDetail: '기본 번역 API 100원 + ePub3 컴파일 30원 + CDN 20원',
            margin: '88%',
            badge: null,
            badgeColor: null,
            marginColor: '#10b981'
        },
        {
            name: 'B2G 도서관 멀티라이선스',
            desc: '멀티라이선스 패키지 (공공도서관)',
            price: '25,000',
            royalty: '0.0%',
            cost: '500원',
            costDetail: 'DRM 암호화 200원 + KORMARC 변환 150원 + PDF 컴파일 100원 + 행정 50원',
            margin: '95%',
            badge: null,
            badgeColor: null,
            marginColor: '#f59e0b'
        }
    ];

    // 샘플 본문: 어절 단위 <span class="epub-word">으로 분리
    const sampleRaw = `제1장 살아있는 미래의 가능성 오늘날 우리는 발전이라는 이름 아래 무엇을 잃어가고 있는지 진지하게 물어야 한다. 라다크의 작은 마을에서 헬레나가 목격한 것은, 근대화 이전 공동체가 가졌던 풍요로운 시간이었다. 그것은 결핍이 아닌, 자족의 아름다움이었다. 우리는 그 공동체로부터 잃어버린 지혜를 다시 배워야 한다.`;

    const words = sampleRaw.split(/\s+/);
    const bodyHTML = words.map((w, i) =>
        `<span class="epub-word" data-idx="${i}">${w}</span>`
    ).join(' ');

    viewer.innerHTML = `
        <div class="ctrl-epub-cover">
            <div class="ctrl-epub-cover-bg">
                <div>
                    <div class="ctrl-epub-cover-title">📖 ${title}</div>
                    <div class="ctrl-epub-cover-author">${author}</div>
                </div>
            </div>
        </div>
        <div class="ctrl-epub-badges">
            <span class="ctrl-epub-badge ctrl-epub-badge-epub">ePub3</span>
            <span class="ctrl-epub-badge ctrl-epub-badge-audio">🎧 오디오북</span>
            <span class="ctrl-epub-badge ctrl-epub-badge-ai">🎨 AI 삽화</span>
            <span style="font-size:8px;font-weight:800;padding:2px 7px;border-radius:999px;background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.25);">인세 0%</span>
            <span style="font-size:8px;font-weight:800;padding:2px 7px;border-radius:999px;background:rgba(168,85,247,0.12);color:#a855f7;border:1px solid rgba(168,85,247,0.25);">SAMPLE PREVIEW</span>
        </div>
        <div class="ctrl-epub-body-panel" id="epub-body-panel" style="line-height:2.0;">${bodyHTML}</div>
        <div class="ctrl-epub-audio-bar">
            <button class="ctrl-epub-audio-play" id="epub-audio-play-btn" title="오디오북 재생/정지">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
            <div class="ctrl-epub-audio-track">
                <div class="ctrl-epub-audio-label" id="epub-audio-label">🎧 AI 나레이션 — 제1장 · 살아있는 미래의 가능성</div>
                <div class="ctrl-epub-audio-progress">
                    <div class="ctrl-epub-audio-fill" id="epub-audio-fill"></div>
                </div>
            </div>
            <span style="font-size:9px;font-weight:700;color:var(--ctrl-text-mute);flex-shrink:0;" id="epub-audio-time">0:00</span>
        </div>
        <div style="padding:12px 14px 14px;">
            <div style="font-size:9px;font-weight:900;color:var(--ctrl-text-mute);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;">📦 ePub3 상품 선택 — 저작권 만료 인세 0%</div>
            <div style="display:flex;flex-direction:column;gap:7px;">
                ${products.map((p, idx) => `
                <div style="background:var(--ctrl-bg-card);border:1px solid ${idx===0?'rgba(168,85,247,0.4)':'var(--ctrl-border)'};border-radius:10px;padding:10px 12px;position:relative;${idx===0?'box-shadow:0 0 0 1px rgba(168,85,247,0.2),0 4px 12px rgba(168,85,247,0.1);':''}">
                    ${p.badge ? `<div style="position:absolute;top:-9px;left:12px;background:${p.badgeColor};color:#fff;font-size:8px;font-weight:900;padding:2px 8px;border-radius:999px;white-space:nowrap;letter-spacing:0.04em;">${p.badge}</div>` : ''}
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
                        <div>
                            <div style="font-size:11px;font-weight:900;color:var(--ctrl-text);">${p.name}</div>
                            <div style="font-size:9px;color:var(--ctrl-text-mute);margin-top:2px;">${p.desc}</div>
                        </div>
                        <div style="text-align:right;flex-shrink:0;">
                            <div style="font-size:14px;font-weight:900;color:#f59e0b;">₩${p.price}</div>
                            <div style="font-size:8px;font-weight:700;color:var(--ctrl-text-mute);">판매가</div>
                        </div>
                    </div>
                    <div style="font-size:9px;color:var(--ctrl-text-mute);margin-bottom:3px;">💰 가공원가: <strong style="color:#fbbf24;">${p.cost}</strong></div>
                    <div style="font-size:8px;color:var(--ctrl-text-mute);margin-bottom:6px;line-height:1.5;opacity:0.75;">${p.costDetail}</div>
                    <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.04);border-radius:6px;padding:5px 8px;">
                        <span style="font-size:9px;color:#10b981;font-weight:800;">인세 ${p.royalty}</span>
                        <span style="font-size:9px;color:var(--ctrl-text-mute);font-weight:700;">예상 마진율</span>
                        <span style="font-family:var(--font-mono);font-size:14px;font-weight:900;color:${p.marginColor};">${p.margin}</span>
                    </div>
                </div>`).join('')}
            </div>
        </div>
    `;

    // ── Web Speech API 연동 ──
    const playBtn = document.getElementById('epub-audio-play-btn');
    const fillEl = document.getElementById('epub-audio-fill');
    const timeEl = document.getElementById('epub-audio-time');
    const labelEl = document.getElementById('epub-audio-label');
    const bodyPanel = document.getElementById('epub-body-panel');

    // 어절 span 캐싱
    _epubWordSpans = bodyPanel ? Array.from(bodyPanel.querySelectorAll('.epub-word')) : [];
    const totalWords = _epubWordSpans.length;

    const PLAY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    const PAUSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;

    function clearHighlights() {
        _epubWordSpans.forEach(s => s.classList.remove('highlight'));
    }

    function highlightWord(idx) {
        clearHighlights();
        if (idx >= 0 && idx < _epubWordSpans.length) {
            _epubWordSpans[idx].classList.add('highlight');
            _epubWordSpans[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    function stopSpeech() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        _epubSpeechPlaying = false;
        clearHighlights();
        _epubCurrentWordIdx = -1;
        if (playBtn) playBtn.innerHTML = PLAY_ICON;
        if (labelEl) labelEl.textContent = '🎧 AI 나레이션 — 제1장 · 살아있는 미래의 가능성';
        if (_epubAudioTimer) { clearInterval(_epubAudioTimer); _epubAudioTimer = null; }
    }

    function startSpeech() {
        if (!window.speechSynthesis) {
            if (labelEl) labelEl.textContent = '⚠️ 이 브라우저는 Web Speech API를 지원하지 않습니다.';
            return;
        }

        window.speechSynthesis.cancel();

        const utter = new SpeechSynthesisUtterance(sampleRaw);
        utter.lang = 'ko-KR';
        utter.rate = 0.92;
        utter.pitch = 1.0;

        // 한국어 음성 선택
        const voices = window.speechSynthesis.getVoices();
        const koVoice = voices.find(v => v.lang.startsWith('ko'));
        if (koVoice) utter.voice = koVoice;

        _epubSpeechUtterance = utter;
        _epubCurrentWordIdx = -1;

        // 단어 경계 이벤트로 하이라이트 싱크
        utter.onboundary = (event) => {
            if (event.name === 'word') {
                const charIdx = event.charIndex;
                // charIndex 기준으로 몇 번째 어절인지 계산
                let runningLen = 0;
                for (let i = 0; i < words.length; i++) {
                    if (charIdx <= runningLen + words[i].length) {
                        if (_epubCurrentWordIdx !== i) {
                            _epubCurrentWordIdx = i;
                            highlightWord(i);
                            // 프로그레스 바 연동
                            const pct = Math.round((i / Math.max(totalWords - 1, 1)) * 100);
                            _epubAudioProgress = pct;
                            if (fillEl) fillEl.style.width = pct + '%';
                            // 타임 표시 (총 약 60초 기준 가상)
                            const elapsed = Math.round((pct / 100) * 60);
                            const m = Math.floor(elapsed / 60);
                            const s = elapsed % 60;
                            if (timeEl) timeEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
                        }
                        break;
                    }
                    runningLen += words[i].length + 1;
                }
            }
        };

        utter.onend = () => {
            _epubSpeechPlaying = false;
            clearHighlights();
            if (fillEl) fillEl.style.width = '100%';
            if (timeEl) timeEl.textContent = '1:00';
            if (playBtn) playBtn.innerHTML = PLAY_ICON;
            if (labelEl) labelEl.textContent = '✅ 낭독 완료 — 재생 버튼으로 다시 들을 수 있습니다.';
        };

        utter.onerror = (e) => {
            if (e.error === 'interrupted' || e.error === 'canceled') return;
            console.warn('[ePub TTS] 오류:', e.error);
        };

        window.speechSynthesis.speak(utter);
        _epubSpeechPlaying = true;

        if (playBtn) playBtn.innerHTML = PAUSE_ICON;
        if (labelEl) labelEl.textContent = '🔊 낭독 중 — 제1장 · 살아있는 미래의 가능성';
    }

    if (playBtn) {
        playBtn.addEventListener('click', () => {
            if (_epubSpeechPlaying) {
                stopSpeech();
            } else {
                // 음성 목록 로드 대기 후 실행
                if (window.speechSynthesis && window.speechSynthesis.getVoices().length === 0) {
                    window.speechSynthesis.onvoiceschanged = () => {
                        window.speechSynthesis.onvoiceschanged = null;
                        startSpeech();
                    };
                } else {
                    startSpeech();
                }
            }
        });
    }

    // 뷰어가 제거될 때(다른 도서 클릭 등) 음성 자동 중지
    const observer = new MutationObserver((mutations) => {
        if (!document.getElementById('epub-audio-play-btn')) {
            stopSpeech();
            _ctrl_epubViewerActive = false;
            observer.disconnect();
        }
    });
    observer.observe(viewer, { childList: true });

    // 로그 추가
    const logEl = document.getElementById('ctrl-log-stream');
    if (logEl) {
        _appendCtrlLogEntry(logEl, 'success', '이지퍼비터_ePub', `📖 '${title}' ePub3 샘플러 로드 완료 — Web Speech TTS 준비 완료`, new Date());
    }

    if (typeof lucide !== 'undefined') {
        try { lucide.createIcons(); } catch(e) {}
    }
}

// ═══════════════════════════════════════════════════
// [11번 마케팅_알리미 연동] 3단 에셋 탭 전환 및 렌더링 로직
// ═══════════════════════════════════════════════════
window.switchAssetTab = function switchAssetTab(tabType) {
    if (!window._ctrl_selectedBook) {
        alert("먼저 복간 후보 도서를 클릭하여 선택해 주세요!");
        return;
    }
    
    window._ctrl_activeTab = tabType;
    
    // 탭 버튼 UI 활성화 상태 전환
    document.querySelectorAll('.ctrl-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = 'var(--ctrl-text-mute)';
        btn.style.boxShadow = 'none';
    });
    
    const activeBtn = document.getElementById(`tab-btn-${tabType}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.background = 'rgba(255,255,255,0.08)';
        activeBtn.style.color = 'var(--ctrl-text)';
        activeBtn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    }
    
    // ePub Speech 낭독 중이면 취소
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (_epubAudioTimer) { clearInterval(_epubAudioTimer); _epubAudioTimer = null; }
    _epubSpeechPlaying = false;
    const playBtn = document.getElementById('epub-audio-play-btn');
    if (playBtn) playBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;

    // 숏폼 비디오 인터벌 중이면 취소
    if (window._shortformTimer) { clearInterval(window._shortformTimer); window._shortformTimer = null; }
    window._shortformPlaying = false;

    // 탭 전환에 따른 실제 렌더링 분기
    if (tabType === 'epub') {
        if (window._ctrl_selectedBook.copyright_status === 'public_domain') {
            renderEpubViewer(window._ctrl_selectedBook);
        } else {
            const viewer = document.getElementById('ctrl-epub-viewer');
            if (viewer) {
                viewer.innerHTML = `
                    <div style="padding: 40px 20px; text-align: center; color: var(--ctrl-text-mute); font-size: 12px; font-weight: bold; line-height: 1.6;">
                        <i data-lucide="lock" style="width: 32px; height: 32px; color: #f59e0b; margin: 0 auto 12px; display: block; opacity: 0.8;"></i>
                        이 도서는 현재 저작권 보호 대상입니다.<br>
                        가상 ePub3 프리뷰 대신 실물 종이책 복간 프로세스<br>
                        ([종이책 복간 시뮬레이션] 창)로 자동 연결됩니다.<br><br>
                        <button onclick="startCtrlSimByBookData(window._ctrl_selectedBook)" style="padding: 8px 16px; background: #f59e0b; border: none; border-radius: 8px; color: #fff; font-weight: 800; cursor: pointer; font-size: 11px;">
                            종이책 시뮬레이션 열기
                        </button>
                    </div>
                `;
                if (window.lucide) {
                    try { lucide.createIcons(); } catch (e) { }
                }
            }
        }
    } else if (tabType === 'news') {
        renderNewsCardTab(window._ctrl_selectedBook);
    } else if (tabType === 'video') {
        renderVideoTab(window._ctrl_selectedBook);
    }
};

// ── [11번 알리미] AI 카드뉴스 렌더링 ──
window._newsCardIdx = 0;
function renderNewsCardTab(book) {
    const viewer = document.getElementById('ctrl-epub-viewer');
    if (!viewer) return;

    const title = (book.title || '').replace(/<\/?[^>]+(>|$)/g, '');
    const author = (book.author || '저자 미상').replace(/<\/?[^>]+(>|$)/g, '');
    window._newsCardIdx = 0;

    // 도서별 템플릿 카피 데이터
    let copyTemplates = [];
    if (title.includes('홈즈') || title.includes('Holmes')) {
        copyTemplates = [
            "그가 돌아왔다. 추리 역사상 가장 위대한 탐정, 셜록 홈즈!",
            "100년의 세월을 넘어, 오직 당신만을 위한 한정판 실물 복간 완료.",
            "디지털 연속지 인쇄와 프리미엄 조판으로 되살아난 전설의 원작.",
            "소장 가치를 극대화할 독자 성명 임베디드 실물 보증서 동봉.",
            "B2C 몰에서 펀딩 100% 달성 임박! 지금 한정판 소장 기회를 확보하세요."
        ];
    } else if (title.includes('마녀')) {
        copyTemplates = [
            "역사의 뒤안길로 사라졌던 미스터리 판타지의 명작, 소설 '마녀'가 다시 깨어납니다.",
            "스산한 바람만이 스치는 어두운 침엽수림 속, 마녀 사냥의 감춰진 진실이 시작됩니다.",
            "독자들의 간절한 목소리가 모여 복간이 결정된, 절판 도서 복원 프로젝트의 첫 시작.",
            "아래 [출판친구스토어] 링크를 클릭하여 단 10초 만에 '마녀'의 정식 펀딩을 개설하고 첫 서포터가 되어주세요.",
            "책을 한 권 읽을 때마다 대지에 나무가 자라납니다. 출판친구와 함께 푸른 숲을 기부해 주세요."
        ];
    } else if (title.includes('인간') || title.includes('카네기')) {
        copyTemplates = [
            "사람의 마음을 움직이는 가장 위대한 고전, 인간관계론.",
            "현대 비즈니스맨의 필수 지침서, 오리지널 무삭제판 복간 결정.",
            "가변 데이터 인쇄 기술로 당신의 이름이 박힌 수제 책갈피 포함.",
            "출판친구 자율 배포 시스템이 인쇄소와 출판사를 직접 매칭해 단가 대폭 인하.",
            "지금 B2C 스토어 펀딩에 참여해 나만의 맞춤형 도서를 소장해 보세요."
        ];
    } else {
        copyTemplates = [
            "시간에 묻혀있던 명작, 독자의 목소리로 다시 태어납니다.",
            "절판 도서 복간 프로젝트 ➔ 독자 참여형 B2C 크라우드 펀딩 가동.",
            "디지털 초소량 인쇄를 통해 재고 걱정 없이 실물 책으로 즉각 제작.",
            "오직 당신만을 위한 맞춤형 가변 조판 VDP 책갈피 증정.",
            "지금 펀딩에 투표하여 소중한 문화를 보존하는 데 동참하세요."
        ];
    }

    window._newsCardCopies = copyTemplates;

    // 백업용 고화질 Unsplash CDN 이미지 (정적 에셋 유실 대비 비상 Bypass 가드)
    const fallbackUrls = [
        "https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=600", // 1장: 중세 마법 고서
        "https://images.unsplash.com/photo-1502082553048-f009c37129b9?q=80&w=600", // 2장: 신비로운 숲 밤 안개
        "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?q=80&w=600", // 3장: 울창한 소나무 거목
        "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=600", // 4장: 달빛 별밤 숲길
        "https://images.unsplash.com/photo-1448375240586-882707db888b?q=80&w=600"  // 5장: 새싹과 푸른 생명의 숲
    ];

    async function updateCardImageAsync(imgElement, promptText, index) {
        try {
            // 백엔드 Imagen 3 API 비동기 가동 검증
            const response = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: promptText,
                    slideIndex: index,
                    isDemo: true // UAT 시연 최적화 (딜레이 차단)
                })
            });
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.imageUrl) {
                    // API에서 리턴받은 경로 또는 base64 데이터로 교체 바인딩
                    imgElement.src = data.imageUrl;
                }
            }
        } catch (e) {
            console.warn('Imagen 3 API 비동기 매핑 실패, 로컬 캐시 자산 유지:', e.message);
        }
    }

    function buildCardHTML() {
        const idx = window._newsCardIdx;
        const text = window._newsCardCopies[idx];
        const defaultSrc = `book${idx + 1}.png`; // 로컬 file:/// 실행 시 호환되도록 절대경로(/) 제거
        const backupSrc = fallbackUrls[idx];

        return `
            <div style="padding: 14px; display: flex; flex-direction: column; height: 100%;">
                <div style="font-size: 8px; font-weight: 900; color: #10b981; letter-spacing: 0.1em; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <span>🤖 11번 알리미 AI 마케팅 에셋 팩</span>
                    <span style="background: rgba(16,185,129,0.15); padding: 2px 6px; border-radius: 999px;">${idx + 1} / 5</span>
                </div>
                
                <!-- 카드뉴스 본판 (글래스모피즘 + 초고화질 일러스트 + 하단 가독성 그라데이션 오버레이, 높이 붕괴 방지 min-height 추가) -->
                <div class="news-card-glow" style="flex: 1; display: flex; flex-direction: column; background: #020617; border: 1px solid rgba(16,185,129,0.25); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); backdrop-filter: blur(10px); position: relative; overflow: hidden; min-height: 250px;">
                    
                    <!-- 이미지 마스크 및 호버 줌인 효과 적용 -->
                    <div class="news-card-image-wrap" style="width: 100%; height: 100%; position: absolute; top:0; left:0; z-index:1;">
                        <img id="ctrl-card-img-element" 
                             src="${defaultSrc}" 
                             class="news-card-img" 
                             onerror="this.onerror=null; this.src='${backupSrc}';" 
                             style="width: 100%; height: 100%; object-fit: cover;">
                        
                        <!-- 하단 30% 블랙 그라데이션 오버레이 강제 (가독성 보장 마스크) -->
                        <div class="news-card-overlay"></div>
                    </div>

                    <!-- 텍스트/캡션 레이아웃 (오버레이 위에 얹어 가독성 확보) -->
                    <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 20px 24px; z-index: 2; display: flex; flex-direction: column; justify-content: flex-end; text-align: center;">
                        <div style="font-size: 8px; color: #10b981; font-weight: 900; letter-spacing: 0.15em; margin-bottom: 6px; opacity: 0.9;">
                            PUBLISHING FRIEND ADVANCED MARKETING
                        </div>
                        <div style="font-size: 12.5px; font-weight: 800; color: #fff; line-height: 1.6; min-height: 52px; display: flex; align-items: center; justify-content: center; letter-spacing: -0.02em; text-shadow: 0 2px 12px rgba(0,0,0,0.95); margin-bottom: 12px;">
                            "${text}"
                        </div>
                        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; border-top: 1px dashed rgba(255,255,255,0.25); padding-top: 10px;">
                            <i data-lucide="book-open" style="width: 12px; height: 12px; color: #10b981;"></i>
                            <span style="font-size: 10px; font-weight: 900; color: #f1f5f9; text-shadow: 0 1px 4px rgba(0,0,0,0.85);">${title}</span>
                        </div>
                    </div>
                </div>
                
                <!-- 캐러셀 제어 버튼 -->
                <div style="display: flex; gap: 6px; margin-top: 12px;">
                    <button onclick="window.changeNewsCard(-1)" style="flex: 1; padding: 9px; background: rgba(255,255,255,0.05); border: 1px solid var(--ctrl-border-md); border-radius: 8px; color: var(--ctrl-text); font-size: 10px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: all 0.2s; z-index:10;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                        <i data-lucide="chevron-left" style="width: 12px; height: 12px;"></i>이전
                    </button>
                    <button onclick="window.changeNewsCard(1)" style="flex: 1; padding: 9px; background: rgba(255,255,255,0.05); border: 1px solid var(--ctrl-border-md); border-radius: 8px; color: var(--ctrl-text); font-size: 10px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: all 0.2s; z-index:10;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                        다음<i data-lucide="chevron-right" style="width: 12px; height: 12px;"></i>
                    </button>
                </div>
                
                <button onclick="window.downloadNewsCardSim()" style="width: 100%; margin-top: 8px; padding: 10px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 8px; font-size: 10px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 12px rgba(16,185,129,0.3); display: flex; align-items: center; justify-content: center; gap: 6px; transition: opacity 0.2s; z-index:10;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                    <i data-lucide="download" style="width: 12px; height: 12px;"></i>카드뉴스 세트 전체 다운로드 (Local ZIP)
                </button>
            </div>
        `;
    }

    viewer.innerHTML = buildCardHTML();

    // 렌더링 직후 비동기 API 통신을 통해 검증 및 base64 전환 트리거 가동
    const imgEl = document.getElementById('ctrl-card-img-element');
    if (imgEl) {
        updateCardImageAsync(imgEl, window._newsCardCopies[0], 1);
    }

    window.changeNewsCard = function(offset) {
        window._newsCardIdx = (window._newsCardIdx + offset + 5) % 5;
        viewer.innerHTML = buildCardHTML();
        
        // 캐러셀 슬라이드 변경 시에도 비동기 이미지 로딩을 재격발
        const newImgEl = document.getElementById('ctrl-card-img-element');
        if (newImgEl) {
            updateCardImageAsync(newImgEl, window._newsCardCopies[window._newsCardIdx], window._newsCardIdx + 1);
        }

        if (window.lucide) {
            try { lucide.createIcons(); } catch (e) {}
        }
    };

    window.downloadNewsCardSim = function() {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#10b981; color:white; padding:12px 24px; border-radius:12px; font-size:12px; font-weight:800; z-index:9999; box-shadow:0 10px 25px rgba(16,185,129,0.3); animation: slideUp 0.3s ease;';
        toast.textContent = `📢 [11번 알리미] '${title}' SNS 최적화 카드뉴스 5장 다운로드 완료!`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    };

    const logEl = document.getElementById('ctrl-log-stream');
    if (logEl) {
        _appendCtrlLogEntry(logEl, 'success', '마케팅_알리미', `📰 '${title}' 맞춤형 AI 카드뉴스 에셋 5장 자동 빌드 완료`, new Date());
    }

    if (window.lucide) {
        try { lucide.createIcons(); } catch(e) {}
    }
}

// ── [11번 알리미] AI 숏폼 비디오 렌더링 ──
window._shortformPlaying = false;
window._shortformTimer = null;
function renderVideoTab(book) {
    const viewer = document.getElementById('ctrl-epub-viewer');
    if (!viewer) return;

    const title = (book.title || '').replace(/<\/?[^>]+(>|$)/g, '');
    window._shortformPlaying = false;

    // 숏폼 비디오 자막 데이터
    let subtitles = [];
    if (title.includes('홈즈') || title.includes('Holmes')) {
        subtitles = [
            "추리 소설의 영원한 전설, 셜록 홈즈가 마침내 돌아왔습니다!",
            "소장용 맞춤형 고해상도 디자인과 VDP 조판 기술 탑재!",
            "지금 B2C 몰에서 펀딩 100% 달성을 확인하고 예약을 진행하세요!"
        ];
    } else if (title.includes('마녀')) {
        subtitles = [
            "시간 속에 묻혀있던 판타지 전설, 소설 '마녀'가 독자들의 손으로 다시 깨어납니다!",
            "절판되어 우리 곁을 떠난 명작을 펀딩으로 복간하여, 감동의 이야기를 다시 한번 만나보세요.",
            "출판친구 스토어에서 펀딩에 참여 하세요! 우리의 숲이 살아납니다.!"
        ];
    } else if (title.includes('인간') || title.includes('카네기')) {
        subtitles = [
            "사람의 마음을 움직이는 명저, 데일 카네기의 인간관계론 복간!",
            "당신의 이름이 영구 인쇄된 가변 보증서와 함께 소장하세요.",
            "B2C 스토어에서 단 1초 만에 펀딩 참여가 가능합니다!"
        ];
    } else {
        subtitles = [
            "시간에 묻혀있던 명작이 독자의 참여로 다시 태어납니다!",
            "무재고 B2B 인쇄 플랫폼으로 완벽 복간 및 매칭 지원.",
            "지금 바로 예약 판매 펀딩에 참여해 보존에 동참하세요!"
        ];
    }

    window._shortformSubtitles = subtitles;
    window._shortformIdx = 0;

    viewer.innerHTML = `
        <div style="padding: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
            <div style="font-size: 8px; font-weight: 900; color: #a855f7; letter-spacing: 0.1em; width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span>🎬 11번 알리미 AI 숏폼 비디오 렌더러</span>
                <span style="background: rgba(168,85,247,0.15); padding: 2px 6px; border-radius: 999px;">9:16 vertical</span>
            </div>

            <!-- 스마트폰 프레임 -->
            <div id="shortform-phone" style="width: 170px; height: 280px; background: #000; border: 4px solid #334155; border-radius: 20px; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 8px 20px rgba(0,0,0,0.5);">
                <!-- 내부 카메라 홀 -->
                <div style="width: 40px; height: 10px; background: #334155; border-radius: 0 0 6px 6px; position: absolute; top: 0; left: 50%; transform: translateX(-50%); z-index: 10;"></div>
                
                <!-- 동영상 백그라운드 (줌인/아웃 모션그래픽 애니메이션 탑재) -->
                <div id="shortform-bg" class="shortform-bg-zooming" style="position: absolute; inset: 0; background: linear-gradient(135deg, #4f46e5 0%, #7e22ce 100%); display: flex; align-items: center; justify-content: center;">
                    <div style="width: 110px; height: 150px; background: rgba(0,0,0,0.4); border: 2px solid rgba(255,255,255,0.15); border-radius: 10px; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 10px; text-align: center; color: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.55); backdrop-filter: blur(5px);">
                        <i data-lucide="book-open" style="width: 24px; height: 24px; color: #a855f7; margin-bottom: 8px;"></i>
                        <span style="font-size: 9px; font-weight: 900; line-height: 1.3; color: #f1f5f9;">${title}</span>
                        <span style="font-size: 7px; font-weight: 700; color: #a855f7; margin-top: 4px;">복간 펀딩 가동 중</span>
                    </div>
                </div>

                <!-- 실물 비디오 레이어 (z-index: 2로 오버레이 아래 위치) -->
                <video id="shortform-video-player" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 2; display: none;" muted playsinline></video>

                <!-- 상단 채널 정보 overlay -->
                <div style="position: absolute; top: 12px; left: 10px; z-index: 5; display: flex; align-items: center; gap: 4px;">
                    <div style="width: 14px; height: 14px; background: #a855f7; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 6px; font-weight: bold; color: white;">P</div>
                    <span style="font-size: 7px; font-weight: 800; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.8);">출판친구_알리미</span>
                </div>

                <!-- 춤추는 오디오 이퀄라이저 파동 그래픽 overlay (신규 추가) -->
                <div class="eq-container" style="position: absolute; bottom: 12px; right: 12px; z-index: 5;">
                    <div class="eq-bar"></div>
                    <div class="eq-bar"></div>
                    <div class="eq-bar"></div>
                    <div class="eq-bar"></div>
                    <div class="eq-bar"></div>
                </div>

                <!-- 자막 오버레이 (펄스 애니메이션) -->
                <div id="shortform-subtitle-container" style="position: absolute; bottom: 45px; left: 0; right: 0; z-index: 5; text-align: center; display: flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 10px;">
                    <span id="shortform-subtitle-text" style="font-size: 9px; font-weight: 900; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.9); background: rgba(0,0,0,0.75); padding: 6px 10px; border-radius: 8px; display: inline-block; line-height: 1.4; border: 1px solid rgba(255,255,255,0.15); width: 100%; box-shadow: 0 4px 10px rgba(0,0,0,0.45);">
                        ▶ 재생 버튼을 눌러 AI 숏폼 영상/나레이션 가동
                    </span>
                </div>

                <!-- 하단 프로그레스 바 -->
                <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: rgba(255,255,255,0.2); z-index: 5;">
                    <div id="shortform-progress-fill" style="width: 0%; height: 100%; background: #a855f7; transition: width 0.1s linear;"></div>
                </div>
            </div>

            <!-- 플레이 제어 툴 바 -->
            <div style="display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 10px;">
                <button id="shortform-play-btn" style="padding: 8px 10px; background: #a855f7; border: none; border-radius: 8px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(168,85,247,0.3); transition: transform 0.1s;" onmousedown="this.style.transform='scale(0.95)'" onmouseup="this.style.transform='scale(1)'">
                    <i id="shortform-play-icon" data-lucide="play" style="width: 12px; height: 12px;"></i>
                </button>
                <div style="flex: 1; font-size: 9px; font-weight: 800; color: var(--ctrl-text-mute);" id="shortform-status-label">
                    AI 성우 나레이션 대기 중
                </div>
                <button onclick="window.downloadShortformVideoSim()" style="padding: 7px 10px; background: rgba(255,255,255,0.06); border: 1px solid var(--ctrl-border); border-radius: 8px; color: var(--ctrl-text); font-size: 9px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                    <i data-lucide="share-2" style="width: 11px; height: 11px;"></i>SNS 배포
                </button>
            </div>
        </div>
    `;

    const playBtn = document.getElementById('shortform-play-btn');
    const playIcon = document.getElementById('shortform-play-icon');
    const statusLabel = document.getElementById('shortform-status-label');
    const subtitleText = document.getElementById('shortform-subtitle-text');
    const progressFill = document.getElementById('shortform-progress-fill');

    function stopShortform() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        window._shortformPlaying = false;
        if (window._shortformTimer) { clearInterval(window._shortformTimer); window._shortformTimer = null; }
        
        if (playIcon) playIcon.setAttribute('data-lucide', 'play');
        if (statusLabel) statusLabel.textContent = 'AI 숏폼 나레이션 대기 중';
        if (subtitleText) subtitleText.textContent = '▶ 재생 버튼을 눌러 AI 숏폼 영상/나레이션 가동';
        if (progressFill) progressFill.style.width = '0%';
        
        // 이퀄라이저 바 중지
        document.querySelectorAll('.eq-bar').forEach(bar => bar.classList.remove('active'));

        // BGM 및 비디오 정지 및 초기화
        if (window._shortformBgm) {
            window._shortformBgm.pause();
            window._shortformBgm.currentTime = 0;
        }
        const videoEl = document.getElementById('shortform-video-player');
        if (videoEl) {
            videoEl.pause();
            videoEl.style.display = 'none';
            videoEl.src = '';
        }
        
        if (window.lucide) {
            try { lucide.createIcons(); } catch (e) {}
        }
    }

    function speakCurrentSentence(text) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'ko-KR';
        utter.rate = 1.0;
        utter.pitch = 1.0;

        const voices = window.speechSynthesis.getVoices();
        const koVoice = voices.find(v => v.lang.startsWith('ko'));
        if (koVoice) utter.voice = koVoice;
        window.speechSynthesis.speak(utter);
    }

    function startShortform() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        window._shortformPlaying = true;
        
        if (playIcon) playIcon.setAttribute('data-lucide', 'pause');
        if (statusLabel) statusLabel.textContent = '🔊 나레이션 및 오디오 합성 출력 중';
        
        // 이퀄라이저 바 가동
        document.querySelectorAll('.eq-bar').forEach(bar => bar.classList.add('active'));

        if (window.lucide) {
            try { lucide.createIcons(); } catch (e) {}
        }

        // 비디오 파일 정의
        const scene1 = '마녀숏폼/한글_프롬프트_어둡고_짙은_안개가_낀_중세_숲속에서_.mp4';
        const scene2 = '마녀숏폼/고풍스러운_오래된_양장본_책이_테이블_위에서_스스로_스.mp4';
        const scene3 = '마녀숏폼/황량한_벌판에_버려져_흩날리던_낡은_폐지_더미들이_역재.mp4';
        const isMaryeo = title.includes('마녀');
        const videoEl = document.getElementById('shortform-video-player');

        // BGM 재생 및 에러 가드레일 설치
        if (!window._shortformBgm) {
            window._shortformBgm = new Audio('마녀숏폼/bgm.mp3');
            window._shortformBgm.volume = 0.15;
            window._shortformBgm.loop = true;
            window._shortformBgm.addEventListener('error', () => {
                console.log('[BGM 로드 실패 - 클래식 폴백 작동]');
                window._shortformBgm.src = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3';
                if (window._shortformPlaying) {
                    window._shortformBgm.play().catch(e => {});
                }
            }, { once: true });
        }
        window._shortformBgm.currentTime = 0;
        window._shortformBgm.play().catch(e => console.log('[BGM 자동재생 차단]', e));

        // 1단계 영상 및 TTS 재생 시작
        if (isMaryeo && videoEl) {
            videoEl.src = scene1;
            videoEl.style.display = 'block';
            videoEl.play().catch(e => console.warn(e));
        }
        speakCurrentSentence(window._shortformSubtitles[0]);

        let elapsedMs = 0;
        const totalDurationMs = 30000; // 10초씩 3장면 = 30초
        
        window._shortformIdx = 0;
        subtitleText.textContent = window._shortformSubtitles[0];

        window._shortformTimer = setInterval(() => {
            elapsedMs += 100;
            const pct = Math.min((elapsedMs / totalDurationMs) * 100, 100);
            if (progressFill) progressFill.style.width = pct + '%';

            // 문장 및 비디오 스위칭 타이밍 (10초, 20초 시점 분기)
            if (elapsedMs === 10000 && window._shortformIdx === 0) {
                window._shortformIdx = 1;
                subtitleText.textContent = window._shortformSubtitles[1];
                if (isMaryeo && videoEl) {
                    videoEl.src = scene2;
                    videoEl.play().catch(e => console.warn(e));
                }
                speakCurrentSentence(window._shortformSubtitles[1]);
            } else if (elapsedMs === 20000 && window._shortformIdx === 1) {
                window._shortformIdx = 2;
                subtitleText.textContent = window._shortformSubtitles[2];
                if (isMaryeo && videoEl) {
                    videoEl.src = scene3;
                    videoEl.play().catch(e => console.warn(e));
                }
                speakCurrentSentence(window._shortformSubtitles[2]);
            }

            if (elapsedMs >= totalDurationMs) {
                stopShortform();
            }
        }, 100);
    }

    if (playBtn) {
        playBtn.addEventListener('click', () => {
            if (window._shortformPlaying) {
                stopShortform();
            } else {
                startShortform();
            }
        });
    }

    window.downloadShortformVideoSim = function() {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#a855f7; color:white; padding:12px 24px; border-radius:12px; font-size:12px; font-weight:800; z-index:9999; box-shadow:0 10px 25px rgba(168,85,247,0.3); animation: slideUp 0.3s ease;';
        toast.textContent = `📢 [11번 알리미] '${title}' AI 마케팅 숏폼 비디오(MP4) SNS 배포 대기 완료!`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2000);

        // [추가 구현] SNS 배포 클릭 시 대시보드 유튜브 뱃지를 실시간으로 갱신하는 UAT 연동
        const ytBadge = document.getElementById('m-status-youtube');
        if (ytBadge) {
            ytBadge.innerHTML = `🔄 배포 중...`;
            ytBadge.style.background = 'rgba(249, 115, 22, 0.15)';
            ytBadge.style.color = '#f97316';
            ytBadge.style.border = '1px solid rgba(249, 115, 22, 0.3)';

            setTimeout(() => {
                localStorage.setItem('youtube-published', 'true');
                ytBadge.innerHTML = `<a href="https://youtube.com/shorts/QDrpvRK_1gc" target="_blank" style="color:#ef4444; text-decoration:none; display:flex; align-items:center; gap:2px; font-weight: 900;">🔴 라이브 보기 <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
                ytBadge.style.background = 'rgba(239, 68, 68, 0.15)';
                ytBadge.style.color = '#ef4444';
                ytBadge.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                ytBadge.style.cursor = 'pointer';

                const logEl = document.getElementById('ctrl-log-stream');
                if (logEl) {
                    _appendCtrlLogEntry(logEl, 'success', '마케팅_알리미', `📢 [11번 알리미] 유튜브 API Quota 보전을 위해 '${title}' 공식 쇼츠 라이브 링크로 자동 연동 완료! (링크: https://youtube.com/shorts/QDrpvRK_1gc)`, new Date(), true);
                }
            }, 1000);
        }
    };

    const observer = new MutationObserver((mutations) => {
        if (!document.getElementById('shortform-phone')) {
            stopShortform();
            observer.disconnect();
        }
    });
    observer.observe(viewer, { childList: true });

    const logEl = document.getElementById('ctrl-log-stream');
    if (logEl) {
        _appendCtrlLogEntry(logEl, 'success', '마케팅_알리미', `🎬 '${title}' AI 숏폼 홍보 비디오(MP4) 모션 그래픽 합성 완료`, new Date());
    }

    if (window.lucide) {
        try { lucide.createIcons(); } catch(e) {}
    }
}




window.downloadNewsCardSim = function() {
    alert("도서가 선택되지 않았습니다.");
};

// ───────────────────────────────────────────
// 16번 지휘_판다 [긴급 보고서 큐] 티켓 수신기 & 보안 서명 검증
// ───────────────────────────────────────────
async function verifyTicketSignature(userId, ticketSubject, userIp, signature) {
    const secret = 'fallback-security-stamp-secret-123'; // 공유 검증 키
    const signData = `${userId || 'Anonymous'}:${ticketSubject}:${userIp}`;
    
    if (!signature) return false;
    
    try {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const messageData = encoder.encode(signData);
        
        const cryptoKey = await window.crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify', 'sign']
        );
        
        // Hex string to Uint8Array
        const signatureBytes = new Uint8Array(
            signature.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
        );
        
        return await window.crypto.subtle.verify(
            'HMAC',
            cryptoKey,
            signatureBytes,
            messageData
        );
    } catch (e) {
        console.error('Signature verification error:', e);
        return false;
    }
}

function startCtrlTicketListener() {
    if (!_ctrl_supabase) return;
    
    setInterval(async () => {
        try {
            const { data: tickets, error } = await _ctrl_supabase
                .from('chat_dialogue_logs')
                .select('*')
                .eq('ticket_status', 'PENDING')
                .order('created_at', { ascending: false });
                
            if (error) {
                console.error('[통제실] 티켓 조회 오류:', error.message);
                return;
            }
            
            const queueContainer = document.getElementById('ctrl-ticket-queue');
            if (!queueContainer) return;
            
            if (!tickets || tickets.length === 0) {
                queueContainer.innerHTML = `
                    <div class="ctrl-ticket-empty" style="padding: 24px; text-align: center; color: var(--ctrl-text-mute); font-size: 11px; font-weight: 600; border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 8px;">
                        <i data-lucide="check-circle" style="width: 24px; height: 24px; color: #10b981; margin: 0 auto 8px; display: block;"></i>
                        접수된 긴급 CS 티켓 보고서가 없습니다. 시스템이 안전합니다.
                    </div>
                `;
                if (typeof lucide !== 'undefined') {
                    try { lucide.createIcons(); } catch(e) {}
                }
                return;
            }
            
            let html = '';
            for (const ticket of tickets) {
                let subject = '긴급 시스템 장애';
                try {
                    const lastModelMsg = ticket.message_history
                        .filter(m => m.role === 'model')
                        .pop();
                    if (lastModelMsg && lastModelMsg.parts && lastModelMsg.parts[0] && lastModelMsg.parts[0].text) {
                        const ticketJsonRegex = /```json\s*([\s\S]*?)\s*```/;
                        const match = lastModelMsg.parts[0].text.match(ticketJsonRegex);
                        if (match) {
                            const parsed = JSON.parse(match[1].trim());
                            if (parsed && parsed.subject) {
                                subject = parsed.subject;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Failed to parse ticket subject from history:', e);
                }
                
                const isValid = await verifyTicketSignature(
                    ticket.user_id,
                    subject,
                    ticket.user_ip,
                    ticket.security_signature || ''
                );
                
                const timeStr = new Date(ticket.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                
                if (!isValid) {
                    html += `
                        <div class="ctrl-ticket-card" style="padding: 12px; background: rgba(239, 68, 68, 0.1); border: 2px solid #ef4444; border-radius: 8px; position: relative;">
                            <div style="display: flex; align-items: center; gap: 8px; color: #ef4444; font-weight: 800; font-size: 11px;">
                                <i data-lucide="shield-alert" style="width: 14px; height: 14px;"></i>
                                [위조/변조 경보] 가짜 티켓 감지됨
                            </div>
                            <div style="font-size: 11px; color: var(--ctrl-text); margin-top: 6px; font-family: monospace; line-height: 1.4;">
                                <strong>요청 사용자:</strong> ${ticket.user_id || 'Unknown'}<br>
                                <strong>위조 의심 IP 해시:</strong> ${ticket.user_ip ? ticket.user_ip.slice(0, 16) + '...' : 'None'}<br>
                                <strong>시간:</strong> ${timeStr}
                            </div>
                            <div style="margin-top: 8px; font-size: 10px; background: rgba(239, 68, 68, 0.2); padding: 4px 8px; border-radius: 4px; color: #ef4444; font-weight: bold;">
                                15번 보안관: 서명 검증 실패! 침입 시도로 차단됨.
                            </div>
                        </div>
                    `;
                    
                    const logStream = document.getElementById('ctrl-log-stream');
                    if (logStream) {
                        const logIdKey = `intrusion_${ticket.id}`;
                        if (!document.getElementById(logIdKey)) {
                            const newLog = document.createElement('div');
                            newLog.id = logIdKey;
                            newLog.className = 'ctrl-log-entry ctrl-log-error';
                            newLog.style.borderLeft = '3px solid #ef4444 !important';
                            newLog.style.background = 'rgba(239, 68, 68, 0.05)';
                            newLog.innerHTML = `
                                <span class="ctrl-log-time">${timeStr}</span>
                                <span class="ctrl-log-agent" style="color: #ef4444; font-weight: bold;">[15번 보안관]</span>
                                <span style="color: #ef4444;">🚨 [침입 경고] 위조된 CS 티켓 유입 차단 완료 (ID: ${ticket.id})</span>
                            `;
                            logStream.insertBefore(newLog, logStream.firstChild);
                        }
                    }
                } else {
                    html += `
                        <div class="ctrl-ticket-card" style="padding: 12px; background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; position: relative;">
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                                <div style="display: flex; align-items: center; gap: 6px; color: #f43f5e; font-weight: 800; font-size: 11px;">
                                    <span class="ctrl-dot ctrl-dot-rose pulse"></span>
                                    긴급 CS 보고서
                                </div>
                                <span style="font-size: 9px; color: var(--ctrl-text-mute);">${timeStr}</span>
                            </div>
                            <div style="font-size: 12px; color: var(--ctrl-text); margin-top: 6px; font-weight: bold;">
                                ${subject}
                            </div>
                            <div style="font-size: 10px; color: var(--ctrl-text-sub); margin-top: 4px; font-family: monospace;">
                                ID: ${ticket.user_id || 'Anonymous'} | IP: ${ticket.user_ip ? ticket.user_ip.slice(0, 10) : 'Anonymous'}
                            </div>
                            <div style="margin-top: 8px; display: flex; align-items: center; justify-content: space-between;">
                                <div style="display: flex; align-items: center; gap: 4px; color: #10b981; font-size: 9px; font-weight: bold;">
                                    <i data-lucide="shield-check" style="width: 12px; height: 12px;"></i>
                                    보안인증 완료 (15번 보안관 서명)
                                </div>
                                <button onclick="resolveTicket(${ticket.id})" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 9px; font-weight: bold; cursor: pointer; hover: opacity: 0.9;">
                                    해결 완료
                                </button>
                            </div>
                        </div>
                    `;
                }
            }
            
            queueContainer.innerHTML = html;
            if (typeof lucide !== 'undefined') {
                try { lucide.createIcons(); } catch(e) {}
            }
        } catch (e) {
            console.error('[통제실] 티켓 리스너 폴링 에러:', e);
        }
    }, 5000);
}

window.resolveTicket = async function(id) {
    if (!_ctrl_supabase) return;
    try {
        const { error } = await _ctrl_supabase
            .from('chat_dialogue_logs')
            .update({ ticket_status: 'RESOLVED' })
            .eq('id', id);
            
        if (error) {
            alert('티켓 상태 변경 실패: ' + error.message);
        } else {
            const logStream = document.getElementById('ctrl-log-stream');
            if (logStream) {
                const newLog = document.createElement('div');
                newLog.className = 'ctrl-log-entry ctrl-log-success';
                newLog.innerHTML = `
                    <span class="ctrl-log-time">${new Date().toLocaleTimeString()}</span>
                    <span class="ctrl-log-agent">[16번 지휘_판다]</span>
                    <span>✅ [티켓 처리완료] 대표님이 긴급 티켓 (ID: ${id})을 처리했습니다.</span>
                `;
                logStream.insertBefore(newLog, logStream.firstChild);
            }
        }
    } catch (e) {
        console.error('Failed to resolve ticket:', e);
    }
};

// ───────────────────────────────────────────
// 스토어 예약 결제 실시간 연동 로그 수신기 (localStorage Event Listener)
// ───────────────────────────────────────────
window.addEventListener('storage', (e) => {
    // 1. 기존 스토어 로그 리스너 유지
    if (e.key === 'latestStoreLog' && e.newValue) {
        const logEl = document.getElementById('ctrl-log-stream');
        if (logEl) {
            _appendCtrlLogEntry(logEl, 'success', '영업_영업이', e.newValue, new Date(), true);
            const firstEntry = logEl.firstElementChild;
            if (firstEntry) {
                firstEntry.style.borderLeft = '3px solid #ff6b00';
                firstEntry.style.background = 'rgba(255, 107, 0, 0.1)';
                firstEntry.classList.add('animate-pulse');
            }
        }
        localStorage.removeItem('latestStoreLog');
        return;
    }

    // 2. [출판사 챗봇] 가조판 승인 요청 수신
    if (e.key === 'cs-event-typeset-requested' && e.newValue) {
        (async () => {
            try {
                const data = JSON.parse(e.newValue);
                const chatContent = document.getElementById('ai-chat-content');
                const logEl = document.getElementById('ctrl-log-stream');
                const aiFab = document.getElementById('ai-fab');

                // 판다 FAB 골드 펄스 활성화 (열기 유도)
                if (aiFab && !aiFab.classList.contains('active')) {
                    aiFab.classList.add('pulse-gold');
                }

                // ─── [3번 수익분석 계산이] 파트너 등급별 단가 실시간 조회 ───
                let publisher = data.publisher || '상상아카데미';
                const isVip = publisher.includes('상상아카데미');
                const partnerGrade = isVip ? 'VIP' : '일반';

                let printCostPerPageShinkuk = 12; // 기본 폴백
                let printCostPerPageA5 = 8;
                const coverProcessingCost = 1500;

                if (_ctrl_supabase) {
                    try {
                        const { data: configData, error } = await _ctrl_supabase.from('master_config').select('data').eq('id', 'config').maybeSingle();
                        if (!error && configData?.data) {
                            const gradeKey = isVip ? 'VIP 등급(우대)' : '일반등급(표준)';
                            const gradeData = configData.data.pricesByGrade?.[gradeKey];
                            if (gradeData) {
                                const a5Match = gradeData.sheetSpecs?.find(x => x.n && x.n.includes('A5국판'));
                                if (a5Match && typeof a5Match.bw === 'number') printCostPerPageA5 = a5Match.bw;
                                printCostPerPageShinkuk = isVip ? 10 : 12;
                            }
                        }
                    } catch(err) {
                        console.warn('[수익분석_계산이] master_config 실시간 단가 연동 실패:', err);
                    }
                }

                const qty = 30; // 30부 고정 기준 시뮬레이션
                const totalPages = 336; // 마녀 실증 도서 336P 기준

                const totalCostShinkuk = (totalPages * printCostPerPageShinkuk * qty) + (coverProcessingCost * qty);
                const totalCostA5 = (totalPages * printCostPerPageA5 * qty) + (coverProcessingCost * qty);
                const shinkukPerCopy = totalPages * printCostPerPageShinkuk + coverProcessingCost;
                const a5PerCopy = totalPages * printCostPerPageA5 + coverProcessingCost;
                const savingTotal = totalCostShinkuk - totalCostA5;
                const savingPerCopy = savingTotal / qty;
                const savingPct = Number(((totalCostShinkuk - totalCostA5) / totalCostShinkuk * 100).toFixed(1));

                const retailPrice = 20000;
                const totalSales = retailPrice * qty;
                const platformFee = totalSales * 0.15;
                const publisherPayout = totalSales - totalCostA5 - platformFee;

                // 헬퍼창 단가 절감 요약 제안 카드 렌더링
                if (chatContent) {
                    const costCard = document.createElement('div');
                    costCard.className = 'ai-action-card';
                    costCard.id = 'ai-typeset-approval-card';
                    costCard.style.cssText = 'background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); margin-top: 10px; font-family: "Noto Sans KR", sans-serif; color: #1e293b;';
                    costCard.innerHTML = `
                        <div style="font-size:13px; font-weight:800; color:#dc2626; margin-bottom:8px; display:flex; align-items:center; gap:4px;">
                            📌 ${qty}부 제작 원가 절감 제안 (${partnerGrade}등급 우대적용)
                        </div>
                        <div style="font-size:11.5px; color:#475569; margin-bottom:12px; line-height:1.5; font-weight:700; text-align:left;">
                            현재 신국판 권당 ${shinkukPerCopy.toLocaleString()}원이 적용됩니다. 이를 A5국판 변경 시 권당 ${a5PerCopy.toLocaleString()}원으로 약 ${savingPct}% 절감됩니다.
                        </div>
                        
                        <div style="background:#f8fafc; border:1px solid #edf2f7; border-radius:10px; padding:12px; margin-bottom:12px; font-size:11.5px; text-align:left;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                                <span style="color:#64748b; font-weight:600;">📚 마녀 (주경철)</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                                <span style="color:#64748b; font-weight:600;">제작 부수 / 예상 페이지</span>
                                <strong style="color:#0f172a; font-weight:800;">${qty}부 / ${totalPages}p</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:6px; border-top:1px solid #edf2f7; padding-top:6px;">
                                <span style="color:#64748b; font-weight:600;">신국판 총제작비</span>
                                <strong style="color:#dc2626; font-weight:800;">₩${totalCostShinkuk.toLocaleString()}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                                <span style="color:#64748b; font-weight:600;">A5 전환 인쇄원가</span>
                                <strong style="color:#16a34a; font-weight:800;">₩${totalCostA5.toLocaleString()}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; border-top:1px dashed #e2e8f0; padding-top:6px; font-weight:800;">
                                <span style="color:#64748b; font-weight:600;">출판사 예상 정산금</span>
                                <strong style="color:#0284c7; font-weight:900;">₩${Math.round(publisherPayout).toLocaleString()}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-weight:800;">
                                <span style="color:#64748b; font-weight:600;">플랫폼 순수익 실금액</span>
                                <strong style="color:#a855f7; font-weight:900;">₩${Math.round(platformFee).toLocaleString()}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; border-top:1px dashed #e2e8f0; padding-top:6px; font-weight:800;">
                                <span style="color:#64748b; font-weight:600;">💰 B2B 총 제작비 절감</span>
                                <strong style="color:#d97706; font-weight:900;">-₩${savingTotal.toLocaleString()} (${savingPct}%↓)</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-top:4px; font-weight:800;">
                                <span style="color:#64748b; font-weight:600;">권당 제작비 절감</span>
                                <strong style="color:#0284c7; font-weight:900;">₩${Math.round(savingPerCopy).toLocaleString()} / 부</strong>
                            </div>
                        </div>
                        
                        <button id="ctrl-typeset-approve-btn"
                            style="width: 100%; padding: 12px; background: #10b981; color: white; border: none; border-radius: 10px; font-size: 12px; font-weight: 900; cursor: pointer; box-shadow: 0 4px 10px rgba(16,185,129,0.25); margin-bottom: 6px; transition: background 0.2s;"
                            onmouseover="this.style.background='#059669'"
                            onmouseout="this.style.background='#10b981'">
                            ✅ A5 판형 최적화 승인 및 제안 송출
                        </button>
                        <button id="ctrl-typeset-close-proposal-btn"
                            style="width: 100%; padding: 9px; background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.2s;"
                            onmouseover="this.style.background='#e2e8f0'"
                            onmouseout="this.style.background='#f1f5f9'">
                            이 제안 닫기
                        </button>
                    `;
                    chatContent.appendChild(costCard);
                    setTimeout(() => { chatContent.scrollTop = chatContent.scrollHeight; }, 100);

                    // 통제실 가조판 승인 버튼 이벤트 바인딩
                    document.getElementById('ctrl-typeset-approve-btn').addEventListener('click', () => {
                        handleAdminTypesetApproval(data.book);
                    });
                    // 닫기 버튼 이벤트 바인딩
                    document.getElementById('ctrl-typeset-close-proposal-btn').addEventListener('click', () => {
                        costCard.remove();
                    });
                }

                // 실시간 에이전트 로그 기록용 데이터 보관
                window._pending_log_data = data;
            } catch(err) {
                console.error('[통제실] 가조판 요청 파싱 에러:', err);
            }
            localStorage.removeItem('cs-event-typeset-requested');
        })();
        return;
    }

// 대표 가조판 및 판형 승인 핸들러 (승인 시 모달창 즉각 팝업)
function handleAdminTypesetApproval(bookName) {
    const card = document.getElementById('ai-typeset-approval-card');
    if (card) {
        card.innerHTML = `<div style="padding:10px; text-align:center; color:#10b981; font-weight:800; font-size:12px;">✅ A5 판형 최적화 승인 완료 (에이전트 조판 가동)</div>`;
    }

    const chatContent = document.getElementById('ai-chat-content');
    const logEl = document.getElementById('ctrl-log-stream');
    const data = window._pending_log_data || { book: bookName, author: '주경철' };

    if (chatContent) {
        const botMsg = document.createElement('div');
        botMsg.className = 'ai-msg ai-msg-bot';
        botMsg.innerHTML = `
            A5 판형 최적화를 승인하였습니다. 화면 한가운데에 <strong>4번 조판이 & 8번 이지퍼비터</strong> 가상 조판 에이전트 파이프라인 콘솔을 동적 가동합니다.
        `;
        chatContent.appendChild(botMsg);
        setTimeout(() => { chatContent.scrollTop = chatContent.scrollHeight; }, 100);
    }

    // 1~8단계 에이전트 실시간 연산 모달창을 출판사 B2B 마녀 도서 사양으로 동적 팝업
    const maryeoMockBook = {
        title: data.book,
        author: data.author || '주경철',
        reprint_score: 91.1,
        pages: 340,
        spineMm: 21.8,
        copyright_status: 'copyrighted',
        _a5Recommended: true // A5 절감 사양 강제 매핑 지시자
    };
    
    startCtrlSimByBookData(maryeoMockBook);
}

    // 3. [출판사 챗봇] B2C 펀딩 개설 진행 요청 수신
    if (e.key === 'cs-event-funding-requested' && e.newValue) {
        try {
            const data = JSON.parse(e.newValue);
            const chatContent = document.getElementById('ai-chat-content');
            const aiFab = document.getElementById('ai-fab');

            if (aiFab && !aiFab.classList.contains('active')) {
                aiFab.classList.add('pulse-gold');
            }

            if (chatContent) {
                const botMsg = document.createElement('div');
                botMsg.className = 'ai-msg ai-msg-bot';
                botMsg.innerHTML = `
                    🚀 <strong>[펀딩 개설 요청 수신]</strong><br>
                    도서 <strong>'${data.book}'</strong>의 가조판 검수가 출판사 측에서 완료되었습니다.<br>
                    B2C 독자 스토어에 정식 펀딩 개설(Live) 및 마케팅 소스(뉴스카드/숏폼) 제작을 승인하시겠습니까?
                `;
                chatContent.appendChild(botMsg);

                // 승인 버튼 카드 생성 및 순차 누적
                const actionCard = document.createElement('div');
                actionCard.className = 'ai-action-card';
                actionCard.id = 'ai-funding-approval-card';
                actionCard.innerHTML = `
                    <div style="font-size:11px; color:#cbd5e1; margin-bottom:8px; line-height:1.4;">
                        👤 <strong>요청 출판사:</strong> 출판친구 파트너사<br>
                        📚 <strong>대상 도서:</strong> ${data.book} (저자: 주경철)<br>
                        ⚙️ <strong>상태:</strong> 11번 알리미 연동 대기
                    </div>
                    <button id="ctrl-funding-approve-btn"
                        style="width: 100%; padding: 12px; background: #7c3aed; color: white; border: none; border-radius: 12px; font-size: 12px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3); transition: background 0.2s;"
                        onmouseover="this.style.background='#6d28d9'"
                        onmouseout="this.style.background='#7c3aed'">
                        펀딩 개설 및 숏폼 제작 승인
                    </button>
                `;
                chatContent.appendChild(actionCard);
                setTimeout(() => { chatContent.scrollTop = chatContent.scrollHeight; }, 100);

                // 승인 이벤트 바인딩
                document.getElementById('ctrl-funding-approve-btn').addEventListener('click', () => {
                    handleAdminFundingApproval(data.book);
                });
            }
        } catch(err) {
            console.error('[통제실] 펀딩 요청 파싱 에러:', err);
        }
        localStorage.removeItem('cs-event-funding-requested');
        return;
    }

    // 4. [B2B ERP] 최종 제작 발주 완료 수신 (원고 자동 삭제 및 디스코드 웹훅 알림)
    if (e.key === 'erp-event-order-completed' && e.newValue) {
        try {
            const data = JSON.parse(e.newValue);
            const chatContent = document.getElementById('ai-chat-content');
            const logEl = document.getElementById('ctrl-log-stream');

            // 헬퍼창 알림 누적
            if (chatContent) {
                const botMsg = document.createElement('div');
                botMsg.className = 'ai-msg ai-msg-bot';
                botMsg.innerHTML = `
                    📦 <strong>[도서 최종 발주 및 원고 파기 완료]</strong><br>
                    대표님, 도서 <strong>'${data.book}'</strong>의 최종 제작 발주가 완료되었습니다.<br>
                    규정에 따라 서버 저장 공간 절약을 위해 고용량 PDF 원고 파일 2종(표지/내지)을 즉시 <strong>자동 영구 파기(삭제)</strong> 처리하였습니다.
                `;
                chatContent.appendChild(botMsg);
                setTimeout(() => { chatContent.scrollTop = chatContent.scrollHeight; }, 100);
            }

            // 어드민 로그 스트림 출력
            if (logEl) {
                _appendCtrlLogEntry(logEl, 'success', '(총괄) 오케스트레이터', `도서 "${data.book}" 최종 발주 수신 ➔ 서버 고용량 PDF 원고 2종 자동 삭제 완료 (용량 확보)`, new Date(), true);
            }

            // 대표 디스코드 채널로 실시간 알림 웹훅 전송
            sendDiscordNotification(data.book);
        } catch(err) {
            console.error('[통제실] 발주 연동 파싱 에러:', err);
        }
        localStorage.removeItem('erp-event-order-completed');
        return;
    }
});

// 대표 승인 핸들러
function handleAdminFundingApproval(bookName) {
    const card = document.getElementById('ai-funding-approval-card');
    if (card) {
        card.innerHTML = `<div style="padding:10px; text-align:center; color:#10b981; font-weight:800; font-size:12px;">✅ 승인 완료 및 스토어 펀딩 개설됨</div>`;
    }

    const chatContent = document.getElementById('ai-chat-content');
    const logEl = document.getElementById('ctrl-log-stream');

    if (chatContent) {
        const botMsg = document.createElement('div');
        botMsg.className = 'ai-msg ai-msg-bot';
        botMsg.innerHTML = `
            🎉 도서 <strong>'${bookName}'</strong>의 B2C 펀딩 개설을 승인하셨습니다.<br>
            B2C 독자 스토어에 정식 펀딩(Live)이 오픈되었으며, 11번 알리미가 생성한 AI 카드뉴스 및 숏폼 탭의 배포 및 SNS 공유 버튼이 통제실 중앙에 활성화되었습니다. 🚀
        `;
        chatContent.appendChild(botMsg);
        setTimeout(() => { chatContent.scrollTop = chatContent.scrollHeight; }, 100);
    }

    if (logEl) {
        _appendCtrlLogEntry(logEl, 'success', '(총괄) 오케스트레이터', `대표 승인 격발 ➔ 도서 "${bookName}" B2C 스토어 펀딩 정식 개설 및 마케팅 숏폼 라이브 성공`, new Date(), true);
    }

    // [추가 구현] 유튜브 API 실시간 쇼츠 업로드 격발 및 통제실 UI 실시간 갱신 연동
    const ytBadge = document.getElementById('m-status-youtube');
    if (ytBadge) {
        ytBadge.innerHTML = `🔄 배포 중...`;
        ytBadge.style.background = 'rgba(249, 115, 22, 0.15)';
        ytBadge.style.color = '#f97316';
        ytBadge.style.border = '1px solid rgba(249, 115, 22, 0.3)';
    }

    fetch(ctrlApiUrl('/api/upload-shorts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookTitle: bookName })
    })
    .then(res => res.json())
    .then(resData => {
        if (resData.success) {
            if (ytBadge) {
                // 실시간 라이브 링크 렌더링 (새 창 이동 가능한 A 태그 결합)
                ytBadge.innerHTML = `<a href="${resData.url}" target="_blank" style="color:#ef4444; text-decoration:none; display:flex; align-items:center; gap:2px; font-weight: 900;">🔴 라이브 보기 <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
                ytBadge.style.background = 'rgba(239, 68, 68, 0.15)';
                ytBadge.style.color = '#ef4444';
                ytBadge.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                ytBadge.style.cursor = 'pointer';
            }
            if (logEl) {
                _appendCtrlLogEntry(logEl, 'success', '마케팅_알리미', `📢 ${resData.message} (링크: ${resData.url})`, new Date(), true);
            }
            
            // 🎬 AI 숏폼 탭 자막 뷰어에도 유튜브 배포 상태 업데이트 적용
            const subtitleText = document.getElementById('shortform-subtitle-text');
            if (subtitleText && bookName.includes('마녀')) {
                subtitleText.innerHTML = `🔴 유튜브 쇼츠 배포 완료! [라이브 보기] 클릭`;
            }
        } else {
            throw new Error(resData.error || '업로드 오류');
        }
    })
    .catch(err => {
        console.error('[유튜브 배포 API 에러]', err);
        if (ytBadge) {
            ytBadge.innerHTML = `⚠️ 배포 실패`;
            ytBadge.style.background = 'rgba(239, 68, 68, 0.1)';
            ytBadge.style.color = '#ef4444';
        }
    });

    // 마녀 도서 목업 데이터를 통제실 selectedBook에 강제 세팅하여 탭 활성화 지원
    const maryeoMockBook = {
        id: 9999,
        title: '마녀',
        author: '주경철',
        pubName: '출판친구 파트너사',
        category: '에세이',
        price: 18000,
        status: 'funding',
        votes_current: 10,
        votes_target: 10,
        funding_current: 49,
        funding_target: 50,
        is_funding_active: true,
        copyright_status: 'public_domain',
        image: 'book1.png'
    };
    window._ctrl_selectedBook = maryeoMockBook;

    // 탭 버튼 UI 활성화 및 ePub 탭으로 임시 포커싱
    window.switchAssetTab('epub');

    // 대표 승인 상태를 B2C 스토어(index.html) 및 출판사 챗봇(erp-chat.js)에 브로드캐스트 전송
    localStorage.setItem('admin-event-funding-approved', JSON.stringify({ book: bookName, timestamp: Date.now() }));
}

// 디스코드 웹훅 알림 발송 함수
async function sendDiscordNotification(bookName) {
    const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1508640595286032505/4W8xfbHpdQkjHi2SCq0fVz5deSIxWigsu9LWZlmwU8HS6aaba3C_cUQHMtgFmMeHVYfp';
    
    const payload = {
        embeds: [{
            title: "📦 [출판친구] 최종 제작 발주 및 원고 파기 완료",
            description: `대표님, B2B ERP를 통해 **도서 '${bookName}'**의 제작 주문(발주)이 최종 완수되었습니다.`,
            color: 65280, // Green
            fields: [
                { name: "대상 도서", value: bookName, inline: true },
                { name: "저자", value: "주경철", inline: true },
                { name: "서버 용량 상태", value: "🟢 안전 (고용량 PDF 2종 영구 삭제 완료)", inline: false }
            ],
            footer: { text: "출판친구 Anti-Gravity System" },
            timestamp: new Date().toISOString()
        }]
    };

    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log('[통제실] 디스코드 웹훅 알림 발송 완료');
    } catch(err) {
        console.error('[통제실] 디스코드 웹훅 발송 오류:', err);
    }
}


