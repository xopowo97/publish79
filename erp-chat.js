/**
 * erp-chat.js — 17번 고객응대_상담이 챗봇 뷰어 전용 스크립트
 * ⚠️ 완전 격리 모듈: 기존 ERP 엔진(script.js) 일절 미수정
 * IIFE 패턴으로 전역 변수 오염 방지
 */
(function () {
    'use strict';

    // ── 대화 상태 머신 ────────────────────────────────────────
    const STATE = {
        IDLE: 'IDLE',
        AWAITING_PROPOSAL_CONFIRM: 'AWAITING_PROPOSAL_CONFIRM',
        AWAITING_FORMAT_CHOICE: 'AWAITING_FORMAT_CHOICE',
        AWAITING_COVER_UPLOAD: 'AWAITING_COVER_UPLOAD',
        AWAITING_INTERIOR_UPLOAD: 'AWAITING_INTERIOR_UPLOAD',
        TYPESETTING: 'TYPESETTING',
        RESULT_READY: 'RESULT_READY',
        AWAITING_FUNDING_REQUEST: 'AWAITING_FUNDING_REQUEST',
        FUNDING_TRIGGERED: 'FUNDING_TRIGGERED',
    };

    // ── 샘플 출판 데이터 (UAT 시연용 Mock) ────────────────────
    const BOOK_MOCK = {
        title: '마녀',
        author: '주경철',
        pages: 340,
        genre: '에세이',
        paperType: '미색모조 100g',
        spineMm: 21.8,
        format: 'A5 (148×210mm)',
        estimatedCost: '₩ 125,640 (A5국판 30부 기준)',
        fundingTarget: '50부',
    };

    // ── DOM 참조 ───────────────────────────────────────────────
    let panel, messages, inputEl, fab, progressOverlay, progressBar, progressLabel;

    let currentState = STATE.IDLE;
    let uploadedCoverFile = null;
    let uploadedInteriorFile = null;
    let chatHistory = [];
    let chatLogId = null;

    // ── 초기화 ────────────────────────────────────────────────
    function init() {
        const container = document.getElementById('cs-chatbot-root');
        if (!container) return;

        container.innerHTML = buildShell();
        cacheDOM();
        bindEvents();

        // 17번 상담이 챗봇 웰컴 메시지 분기 (로그인 세션 권한 식별)
        const userRole = sessionStorage.getItem('userRole') || 'guest';
        const userId = sessionStorage.getItem('userId') || '';

        // 1.2초 후 환영 메시지 자동 출력
        setTimeout(() => addBotMessage(
            '안녕하세요! 저는 <strong>출판친구 CS 매니저 상담이</strong>예요 🤗<br>플랫폼 이용 관련 실무 가이드부터 원고 업로드까지 함께해 드릴게요.'
        ), 1200);

        // [기획 보완] 인쇄소가 아닌, '마녀' 도서의 계약 제안 대상 출판사(상상아카데미) 또는 관리자/심사위원인 경우에만 제안 카드 팝업
        const isTargetPublisher = userId === 'sangsang' || userRole === 'admin' || userRole === 'judge';

        if (isTargetPublisher) {
            setTimeout(() => {
                addBotMessage('현재 <strong>검토 중인 도서 제안서</strong>가 도착해 있어요. 확인하시겠어요?');
                showQuickReplies(['📄 제안서 확인', '❓ 자주 묻는 질문', '📞 담당자 연결']);
                currentState = STATE.AWAITING_PROPOSAL_CONFIRM;
            }, 2400);
        } else {
            // 인쇄소(printer)이거나 타 출판사인 경우, 복간 제안 팝업을 철저하게 격리(생략)하고 FAQ 실무 가이드 안내
            setTimeout(() => {
                addBotMessage('인쇄/제본 공정 관리, 송장 등록, 월말 정산 방법 등 실무 과정 중 궁금하신 점을 물어보세요!');
                showQuickReplies(['❓ 자주 묻는 질문', '📞 담당자 연결']);
                currentState = STATE.IDLE;
            }, 2400);
        }
    }

    // ── HTML 쉘 빌드 ─────────────────────────────────────────
    function buildShell() {
        return `
        <!-- FAB 버튼 -->
        <button class="cs-fab" id="cs-fab-btn" title="상담이와 대화하기">
            💬
            <span class="cs-fab-badge" id="cs-badge">1</span>
        </button>

        <!-- 챗봇 패널 -->
        <div class="cs-panel" id="cs-panel">
            <!-- 진행 오버레이 -->
            <div class="cs-progress-overlay" id="cs-progress-overlay">
                <div class="cs-progress-spinner"></div>
                <div class="cs-progress-label" id="cs-progress-label">조판 엔진 구동 중...</div>
                <div class="cs-progress-bar-wrap">
                    <div class="cs-progress-bar" id="cs-progress-bar"></div>
                </div>
                <div class="cs-progress-sub" id="cs-progress-sub">4번 조판이 AI 연산 중</div>
            </div>

            <!-- 헤더 -->
            <div class="cs-panel-header">
                <div class="cs-panel-avatar">🤖</div>
                <div class="cs-panel-title">
                    <strong>상담이 — CS 매니저</strong>
                    <span>온라인 · 응답 대기 중</span>
                </div>
                <button class="cs-panel-close" id="cs-panel-close">✕</button>
            </div>

            <!-- 메시지 목록 -->
            <div class="cs-messages" id="cs-messages"></div>

            <!-- 빠른 답변 칩 -->
            <div class="cs-quick-replies" id="cs-quick-replies"></div>

            <!-- 입력창 -->
            <div class="cs-input-wrap">
                <input type="text" class="cs-input" id="cs-input" placeholder="메시지를 입력하세요...">
                <button class="cs-send-btn" id="cs-send-btn">➤</button>
            </div>
        </div>`;
    }

    // ── DOM 캐싱 ─────────────────────────────────────────────
    function cacheDOM() {
        panel = document.getElementById('cs-panel');
        messages = document.getElementById('cs-messages');
        inputEl = document.getElementById('cs-input');
        fab = document.getElementById('cs-fab-btn');
        progressOverlay = document.getElementById('cs-progress-overlay');
        progressBar = document.getElementById('cs-progress-bar');
        progressLabel = document.getElementById('cs-progress-label');
    }

    // ── 이벤트 바인딩 ─────────────────────────────────────────
    function bindEvents() {
        // FAB 클릭
        document.getElementById('cs-fab-btn').addEventListener('click', togglePanel);
        // 패널 닫기
        document.getElementById('cs-panel-close').addEventListener('click', closePanel);
        // 전송 버튼
        document.getElementById('cs-send-btn').addEventListener('click', handleSend);
        // 엔터키
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });
    }

    // ── 패널 열기/닫기 ───────────────────────────────────────
    function togglePanel() {
        const isOpen = panel.classList.contains('cs-panel--open');
        isOpen ? closePanel() : openPanel();
    }

    function openPanel() {
        panel.classList.add('cs-panel--open');
        fab.classList.add('cs-fab--active');
        fab.innerHTML = '✕';
        const badge = document.getElementById('cs-badge');
        if (badge) badge.remove();
        inputEl.focus();
    }

    function closePanel() {
        panel.classList.remove('cs-panel--open');
        fab.classList.remove('cs-fab--active');
        fab.innerHTML = '💬';
    }

    // ── 메시지 처리 ───────────────────────────────────────────
    function handleSend() {
        const text = inputEl.value.trim();
        if (!text) return;
        inputEl.value = '';
        addUserBubble(text);
        clearQuickReplies();
        processInput(text);
    }

    // ── 입력 라우팅 (상태 머신) ──────────────────────────────
    function processInput(text) {
        const t = text.toLowerCase();

        // [버그 완치] 대기 중에도 일반 RAG 질문 입력 시 대답을 묵살하지 않도록 키워드 교차 판정으로 개편
        if ((currentState === STATE.AWAITING_PROPOSAL_CONFIRM || currentState === STATE.AWAITING_FORMAT_CHOICE) &&
            (t.includes('제안서') || t.includes('확인') || t.includes('proposal') || t.includes('📄'))) {
            if (currentState === STATE.AWAITING_FORMAT_CHOICE) return; // 버튼으로만 처리
            handleProposalView();
            return;
        }
        if (currentState === STATE.AWAITING_COVER_UPLOAD ||
            currentState === STATE.AWAITING_INTERIOR_UPLOAD) {
            addBotMessage('업로드 카드에서 파일을 선택해 주세요 📎');
            return;
        }
        if (t.includes('자주') || t.includes('faq') || t.includes('질문')) {
            handleFAQ();
            return;
        }
        if (t.includes('담당자') || t.includes('연결')) {
            addBotMessage('담당자 연결 중입니다. 잠시만 기다려주세요... 📞');
            return;
        }
        // 기본 RAG 검색 (백엔드 /api/chat 연동)
        callChatAPI(text);
    }

    // ── 제안서 카드 출력 ─────────────────────────────────────
    function handleProposalView() {
        showTyping(600, () => {
            const card = document.createElement('div');
            card.className = 'cs-card';
            card.innerHTML = `
                <div class="cs-card-title">📋 도서 제작 제안서</div>
                <div class="cs-card-body">
                    아래 도서의 POD 복간 및 독자 펀딩 제안서가 도착했습니다.
                </div>
                <div class="cs-card-row"><span>도서명</span><strong>${BOOK_MOCK.title}</strong></div>
                <div class="cs-card-row"><span>저자</span><strong>${BOOK_MOCK.author}</strong></div>
                <div class="cs-card-row"><span>분량</span><strong>${BOOK_MOCK.pages}페이지 / ${BOOK_MOCK.genre}</strong></div>
                <div class="cs-card-row"><span>현재 판형</span><strong>${BOOK_MOCK.format}</strong></div>
                <div class="cs-card-row"><span>예상 제작비</span><strong>${BOOK_MOCK.estimatedCost}</strong></div>
                <div class="cs-card-row"><span>펀딩 목표</span><strong>${BOOK_MOCK.fundingTarget} (B2C 연동)</strong></div>
                <div style="margin-top:10px; font-size:12px; color:#94a3b8; font-family:'Noto Sans KR',sans-serif; line-height:1.6;">
                    💡 A5국판(148×210mm) 최적 판형으로 조판 시 제작비 절감 및 인쇄 최적화가 가능합니다.
                </div>
                <button class="cs-btn cs-btn--primary" id="cs-approve-btn">✅ A5국판 최적 판형으로 진행</button>
                <button class="cs-btn cs-btn--ghost" id="cs-keep-format-btn">📐 기존 판형 유지로 진행</button>
                <button class="cs-btn cs-btn--ghost" id="cs-reject-btn" style="margin-top:2px;">↩ 수정 요청</button>
            `;
            messages.appendChild(card);
            scrollBottom();

            document.getElementById('cs-approve-btn').addEventListener('click', () => handleFormatChoice('optimal'));
            document.getElementById('cs-keep-format-btn').addEventListener('click', () => handleFormatChoice('keep'));
            document.getElementById('cs-reject-btn').addEventListener('click', () => {
                addBotMessage('수정 사항을 입력해 주시면 담당 MD에게 전달드릴게요 ✏️');
            });

            currentState = STATE.AWAITING_FORMAT_CHOICE;
        });
    }

    // ── 판형 선택 → 표지 업로드 카드 ──────────────────────────
    function handleFormatChoice(choice) {
        document.getElementById('cs-approve-btn').disabled = true;
        document.getElementById('cs-keep-format-btn').disabled = true;
        document.getElementById('cs-reject-btn').disabled = true;

        if (choice === 'optimal') {
            addUserBubble('✅ A5국판 최적 판형으로 진행');
            showTyping(800, () => {
                addBotMessage('A5국판으로 최적화하여 진행하겠습니다! 🎉<br>먼저 <strong>표지 PDF 파일</strong>을 업로드해 주세요.');
                renderCoverUploadCard();
                currentState = STATE.AWAITING_COVER_UPLOAD;
            });
        } else {
            addUserBubble('📐 기존 판형 유지로 진행');
            showTyping(800, () => {
                addBotMessage('기존 판형을 유지하여 진행하겠습니다.<br>먼저 <strong>표지 PDF 파일</strong>을 업로드해 주세요.');
                renderCoverUploadCard();
                currentState = STATE.AWAITING_COVER_UPLOAD;
            });
        }
    }

    // ── 표지 업로드 카드 (1단계) ──────────────────────────────
    function renderCoverUploadCard() {
        const card = document.createElement('div');
        card.className = 'cs-card';
        card.id = 'cs-cover-upload-card';
        card.innerHTML = `
            <div class="cs-card-title">📤 [1/2] 표지 PDF 업로드</div>
            <div class="cs-upload-zone" id="cs-cover-zone">
                <div class="cs-upload-icon">🖼️</div>
                <div>표지 PDF를 클릭하거나 여기에 드롭하세요</div>
                <div style="font-size:11px; margin-top:4px; color:#475569;">최대 500MB · PDF 형식 (앞표지+책등+뒤표지 포함)</div>
                <input type="file" id="cs-cover-input" accept=".pdf">
            </div>
            <div id="cs-cover-info" style="display:none; font-size:12px; color:#10b981; margin-top:8px; font-family:'Noto Sans KR',sans-serif;"></div>
        `;
        messages.appendChild(card);
        scrollBottom();

        const zone = document.getElementById('cs-cover-zone');
        const fileInput = document.getElementById('cs-cover-input');
        zone.addEventListener('click', () => fileInput.click());
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('cs-dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('cs-dragover'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('cs-dragover');
            handleCoverFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => handleCoverFile(e.target.files[0]));
    }

        // ── 표지 파일 선택 처리 ───────────────────────────────────
    function handleCoverFile(file) {
        if (!file) return;
        
        const zone = document.getElementById('cs-cover-zone');
        const infoEl = document.getElementById('cs-cover-info');
        
        // 업로드 무결성 검사 로더 연출
        zone.style.pointerEvents = 'none';
        zone.innerHTML = `
            <div class="cs-upload-icon">⏳</div>
            <div style="font-weight:bold; color:#f59e0b;">표지 PDF 무결성 검수 중...</div>
            <div style="font-size:10px; margin-top:4px; color:#64748b;">바이너리 분석 및 해상도(300 DPI) 확인 중 (50%)</div>
            <div class="cs-loading-bar-container" style="width:80%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; margin-top:8px; overflow:hidden; position:relative; margin-left:auto; margin-right:auto;">
                <div class="cs-loading-bar" style="width:0%; height:100%; background:#f59e0b; border-radius:2px; animation: csGlowLoad 1.0s ease-in-out forwards;"></div>
            </div>
            <style>
                @keyframes csGlowLoad {
                    0% { width: 0%; }
                    100% { width: 100%; }
                }
            </style>
        `;
        
        setTimeout(() => {
            uploadedCoverFile = file;
            const sizeMB = (file.size / 1024 / 1024).toFixed(1);
            
            // 원래 Zone 모양 복원하되 완료 상태 표현
            zone.innerHTML = `
                <div class="cs-upload-icon" style="color:#10b981;">🖼️</div>
                <div style="font-weight:bold; color:#10b981;">표지 검수 완료</div>
                <div style="font-size:11px; margin-top:4px; color:#64748b;">${file.name} (${sizeMB}MB)</div>
            `;
            
            infoEl.textContent = `✅ ${file.name} (${sizeMB}MB) — 표지 업로드 검수 통과 완료`;
            infoEl.style.display = 'block';

            // 표지 완료 후 자동으로 내지 업로드 안내
            showTyping(600, () => {
                addBotMessage('표지 파일이 안전하게 접수되었습니다! 📎<br>이제 <strong>내지(본문) PDF 파일</strong>을 업로드해 주세요.');
                renderInteriorUploadCard();
                currentState = STATE.AWAITING_INTERIOR_UPLOAD;
            });
        }, 1200);
    }

    // ── 내지 업로드 카드 (2단계) ──────────────────────────────
    function renderInteriorUploadCard() {
        const card = document.createElement('div');
        card.className = 'cs-card';
        card.id = 'cs-interior-upload-card';
        card.innerHTML = `
            <div class="cs-card-title">📤 [2/2] 내지(본문) PDF 업로드</div>
            <div class="cs-upload-zone" id="cs-interior-zone">
                <div class="cs-upload-icon">📄</div>
                <div>내지 PDF를 클릭하거나 여기에 드롭하세요</div>
                <div style="font-size:11px; margin-top:4px; color:#475569;">최대 500MB · PDF 형식 (본문 전체 페이지)</div>
                <input type="file" id="cs-interior-input" accept=".pdf">
            </div>
            <div id="cs-interior-info" style="display:none; font-size:12px; color:#10b981; margin-top:8px; font-family:'Noto Sans KR',sans-serif;"></div>
            <button class="cs-btn cs-btn--success" id="cs-typeset-btn" style="display:none;">🚀 가조판 시작 승인</button>
        `;
        messages.appendChild(card);
        scrollBottom();

        const zone = document.getElementById('cs-interior-zone');
        const fileInput = document.getElementById('cs-interior-input');
        zone.addEventListener('click', () => fileInput.click());
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('cs-dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('cs-dragover'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('cs-dragover');
            handleInteriorFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => handleInteriorFile(e.target.files[0]));
    }

        // ── 내지 파일 선택 처리 ───────────────────────────────────
    function handleInteriorFile(file) {
        if (!file) return;
        
        const zone = document.getElementById('cs-interior-zone');
        const infoEl = document.getElementById('cs-interior-info');
        const typesetBtn = document.getElementById('cs-typeset-btn');
        
        // 업로드 무결성 검사 로더 연출
        zone.style.pointerEvents = 'none';
        zone.innerHTML = `
            <div class="cs-upload-icon">⏳</div>
            <div style="font-weight:bold; color:#0ea5e9;">내지 PDF 본문 페이지 스캔 중...</div>
            <div style="font-size:10px; margin-top:4px; color:#64748b;">총 페이지 수 및 글꼴 임베딩 여부 확인 중 (60%)</div>
            <div class="cs-loading-bar-container" style="width:80%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; margin-top:8px; overflow:hidden; position:relative; margin-left:auto; margin-right:auto;">
                <div class="cs-loading-bar" style="width:0%; height:100%; background:#0ea5e9; border-radius:2px; animation: csGlowLoad 1.0s ease-in-out forwards;"></div>
            </div>
        `;
        
        setTimeout(() => {
            uploadedInteriorFile = file;
            const sizeMB = (file.size / 1024 / 1024).toFixed(1);
            
            // 원래 Zone 모양 복원하되 완료 상태 표현
            zone.innerHTML = `
                <div class="cs-upload-icon" style="color:#10b981;">📄</div>
                <div style="font-weight:bold; color:#10b981;">내지 검수 완료</div>
                <div style="font-size:11px; margin-top:4px; color:#64748b;">${file.name} (${sizeMB}MB)</div>
            `;
            
            infoEl.textContent = `✅ ${file.name} (${sizeMB}MB) — 내지 업로드 정합성 검사 통과`;
            infoEl.style.display = 'block';
            typesetBtn.style.display = 'flex';
            typesetBtn.addEventListener('click', startTypesetting);
            scrollBottom();
        }, 1200);
    }

    // ── 조판 진행 시뮬레이션 ─────────────────────────────────
    function startTypesetting() {
        document.getElementById('cs-typeset-btn').disabled = true;
        currentState = STATE.TYPESETTING;
        clearQuickReplies();

        // [통제실 실시간 연동] 가조판 요청 수신 신호 브로드캐스트 (저자 및 페이지 정보 탑재)
        localStorage.setItem('cs-event-typeset-requested', JSON.stringify({ 
            book: BOOK_MOCK.title, 
            author: BOOK_MOCK.author, 
            pages: BOOK_MOCK.pages, 
            timestamp: Date.now() 
        }));

        // 진행 오버레이 표시 및 30% 대기 상태 진입
        progressOverlay.classList.add('cs-visible');
        progressBar.style.width = '30%';
        progressLabel.textContent = '대표님(통제실)의 판형 최적화 승인을 대기 중입니다...';
        document.getElementById('cs-progress-sub').textContent = '통제실 검토 중 (신국판 ➔ A5국판 절감액 제안)';
    }

    // ── 관리자 승인 수신 후 실제 조판 시뮬레이션 재개 ──────────────────
    function resumeTypesetting() {
        const steps = [
            { pct: 60, label: '3분할 조판 레이아웃 생성...', sub: '앞표지 · 책등 · 뒤표지 분할 중' },
            { pct: 80, label: '8번 이지퍼비터 POD 파이프라인 연결...', sub: '고해상도 인쇄용 PDF 변환 중' },
            { pct: 95, label: '품질 검수 & 재단선 정렬...', sub: '✔ DPI 300 기준 적합 판정' },
            { pct: 100, label: '조판 완료! 결과물 준비 중...', sub: '✅ 인쇄 출력 가능 PDF 생성 완료' },
        ];

        let i = 0;
        const tick = () => {
            if (i >= steps.length) {
                setTimeout(showResult, 500);
                return;
            }
            const s = steps[i++];
            progressBar.style.width = s.pct + '%';
            progressLabel.textContent = s.label;
            document.getElementById('cs-progress-sub').textContent = s.sub;
            setTimeout(tick, i < steps.length ? 600 : 400);
        };
        tick();
    }

    // ── 결과 카드 출력 (다운로드 버튼 2개 + Acrobat 검수 가이드) ──
    function showResult() {
        progressOverlay.classList.remove('cs-visible');
        currentState = STATE.RESULT_READY;

        addBotMessage('✅ 가조판 작업이 완료되었습니다!<br>아래 버튼으로 표지와 내지 파일을 각각 다운로드하여 <strong>Acrobat Reader 등 전문 뷰어로 정밀 검수</strong>해 주세요.');

        const card = document.createElement('div');
        card.className = 'cs-card';
        card.innerHTML = `
            <div class="cs-card-title">📥 가조판 결과물 다운로드</div>
            <div class="cs-card-body" style="font-size:12px; color:#f59e0b; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.2); border-radius:8px; padding:10px; margin-bottom:10px;">
                ⚠️ <strong>정밀 검수 필수</strong><br>
                인쇄 사고를 방지하기 위해 반드시 다운로드 후 Acrobat Reader 또는 전문 PDF 뷰어로 다음 항목을 확인해 주세요.<br>
                · 표지 책등 규격: <strong>${BOOK_MOCK.spineMm}mm</strong><br>
                · 재단선(Bleed) 오차 여부<br>
                · 내지 페이지 순서 및 여백 확인
            </div>
            <button class="cs-btn cs-btn--download" id="cs-download-cover-btn">🖼️ 표지 가조판본 다운로드</button>
            <button class="cs-btn cs-btn--download" id="cs-download-interior-btn" style="margin-top:6px; background:linear-gradient(135deg,#0ea5e9,#0284c7);">📄 내지 가조판본 다운로드</button>
            <button class="cs-btn cs-btn--ghost" id="cs-reupload-btn" style="margin-top:6px;">🔄 원고 재업로드</button>
        `;
        messages.appendChild(card);
        scrollBottom();

        document.getElementById('cs-download-cover-btn').addEventListener('click', () => handleDownload('cover'));
        document.getElementById('cs-download-interior-btn').addEventListener('click', () => handleDownload('interior'));
        document.getElementById('cs-reupload-btn').addEventListener('click', () => {
            currentState = STATE.AWAITING_COVER_UPLOAD;
            uploadedCoverFile = null;
            uploadedInteriorFile = null;
            addBotMessage('원고 파일을 처음부터 다시 업로드해 주세요. 먼저 <strong>표지 PDF</strong>부터 업로드해 주세요 📎');
            renderCoverUploadCard();
        });

        // 양쪽 다운로드 완료 감지 후 알림이 개입 안내
        setTimeout(() => showMarketerStep(), 2000);
    }

    // ── 다운로드 핸들러 (표지/내지 분리) ────────────────────
    function handleDownload(type) {
        const btnId = type === 'cover' ? 'cs-download-cover-btn' : 'cs-download-interior-btn';
        const btn = document.getElementById(btnId);
        const label = type === 'cover' ? '표지' : '내지';
        const origText = btn.textContent;
        btn.textContent = `⏳ ${label} 다운로드 준비 중...`;
        btn.disabled = true;

        setTimeout(() => {
            // UAT 시연용: 프로젝트 루트에 존재하는 실제 PDF 주소 연결
            const link = document.createElement('a');
            link.href = type === 'cover' ? '/마녀_표지.pdf' : '/마녀-본문3쇄.pdf';
            link.download = type === 'cover'
                ? `가조판_마녀_표지_3분할.pdf`
                : `가조판_마녀_내지_본문.pdf`;
            link.click();
            btn.textContent = `✅ ${label} 다운로드 완료`;
        }, 1500);
    }

    // ── 알림이(마케터) 개입 단계 ──────────────────────────────
    function showMarketerStep() {
        addBotMessage('📣 <strong>알림이(마케터)</strong>가 전합니다:<br>검수가 완료되면 펀딩 개설을 진행해 주세요.<br><span style="color:#94a3b8; font-size:12px;">✨ 펀딩 개설이 진행되면 뉴스카드 및 숏폼이 자동 생성될 예정입니다.</span>');

        const card = document.createElement('div');
        card.className = 'cs-card';
        card.innerHTML = `
            <div class="cs-card-title">🚀 B2C 펀딩 개설 요청</div>
            <div class="cs-card-body">검수 완료 후 아래 버튼을 눌러 B2C 독자 스토어에 펀딩 개설을 요청해 주세요.<br>
            <span style="color:#94a3b8; font-size:12px;">개설이 진행되면 플랫폼 관리자 검수 후 정식 오픈됩니다.</span></div>
            <button class="cs-btn cs-btn--primary" id="cs-funding-request-btn">🚀 B2C 펀딩 개설 진행 요청</button>
        `;
        messages.appendChild(card);
        scrollBottom();

        document.getElementById('cs-funding-request-btn').addEventListener('click', handleFundingRequest);
        currentState = STATE.AWAITING_FUNDING_REQUEST;
    }

    // ── 펀딩 개설 요청 전송 ───────────────────────────────────
    function handleFundingRequest() {
        document.getElementById('cs-funding-request-btn').disabled = true;
        addUserBubble('🚀 B2C 펀딩 개설 진행 요청');

        // [통제실 실시간 연동] B2C 펀딩 개설 요청 신호 브로드캐스트
        localStorage.setItem('cs-event-funding-requested', JSON.stringify({ book: BOOK_MOCK.title, timestamp: Date.now() }));

        showTyping(800, () => {
            addBotMessage('펀딩 개설 요청이 플랫폼 관리자에게 전달되었습니다! 🎉<br>관리자 검수 완료 후 B2C 스토어에 도서 <strong>\'마녀\'</strong>의 펀딩이 정식 개설됩니다.<br><span style="color:#94a3b8; font-size:12px;">펀딩 개설 완료 시 이 창으로 안내드릴게요.</span>');
            currentState = STATE.FUNDING_TRIGGERED;
        });
    }

    // ── FAQ 처리 ─────────────────────────────────────────────
    function handleFAQ() {
        showTyping(500, () => {
            addBotMessage('자주 묻는 질문 목록입니다 📋');
            showQuickReplies(['📏 책등 계산 방법', '💰 제작비 산출', '⏱ 납기 일정', '🖨 인쇄 규격']);
        });
    }

    // ── Gemini RAG API 연동 ───────────────────────────────────
    async function callChatAPI(userMessage) {
        showTyping(0);
        try {
            const userRole = sessionStorage.getItem('userRole') || 'guest';
            const userId = sessionStorage.getItem('userId') || '';

            // 사용자 메시지 히스토리에 추가
            chatHistory.push({
                role: 'user',
                parts: [{ text: userMessage }]
            });

            const getApiUrl = (path) => {
                const isLocal = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1' ||
                    window.location.hostname === '' ||
                    window.location.protocol === 'file:';
                return isLocal ? `https://publish79.vercel.app${path}` : path;
            };

            const res = await fetch(getApiUrl('/api/chat'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    chat_type: 'ERP_STORE',
                    contents: chatHistory,
                    userRole: userRole,
                    userId: userId,
                    logId: chatLogId
                }),
            });
            removeTyping();
            if (!res.ok) throw new Error('API Error');
            const data = await res.json();
            
            if (data.logId) {
                chatLogId = data.logId;
            }

            const replyText = data.responseText || '답변을 불러오는 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.';
            
            // 모델 응답 히스토리에 추가
            chatHistory.push({
                role: 'model',
                parts: [{ text: replyText }]
            });

            addBotMessage(replyText);
        } catch (err) {
            console.error('CS 챗봇 API 호출 오류:', err);
            removeTyping();
            addBotMessage('지금 네트워크 연결이 불안정해요 🔌<br>잠시 후 다시 시도해 주세요.');
        }
    }

    // ── UI 헬퍼 ──────────────────────────────────────────────
    function addBotMessage(html) {
        removeTyping();
        const el = document.createElement('div');
        el.className = 'cs-bubble cs-bubble--bot';
        el.innerHTML = html;
        messages.appendChild(el);
        scrollBottom();
    }

    function addUserBubble(text) {
        const el = document.createElement('div');
        el.className = 'cs-bubble cs-bubble--user';
        el.textContent = text;
        messages.appendChild(el);
        scrollBottom();
    }

    function showTyping(delay, callback) {
        setTimeout(() => {
            const el = document.createElement('div');
            el.className = 'cs-typing';
            el.id = 'cs-typing';
            el.innerHTML = '<span></span><span></span><span></span>';
            messages.appendChild(el);
            scrollBottom();
            if (callback) setTimeout(callback, 600);
        }, delay);
    }

    function removeTyping() {
        const el = document.getElementById('cs-typing');
        if (el) el.remove();
    }

    function showQuickReplies(chips) {
        const wrap = document.getElementById('cs-quick-replies');
        wrap.innerHTML = '';
        chips.forEach(label => {
            const chip = document.createElement('button');
            chip.className = 'cs-chip';
            chip.textContent = label;
            chip.addEventListener('click', () => {
                addUserBubble(label);
                clearQuickReplies();
                processInput(label);
            });
            wrap.appendChild(chip);
        });
    }

    function clearQuickReplies() {
        const wrap = document.getElementById('cs-quick-replies');
        if (wrap) wrap.innerHTML = '';
    }

    function scrollBottom() {
        setTimeout(() => {
            messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
        }, 50);
    }

    // ── [통제실 및 스토어 실시간 연동 리스너] ───────────────────
    window.addEventListener('storage', (e) => {
        // AA. 플랫폼 관리자(대표님)의 판형 최적화 승인 수신 ➔ 조판 재개
        if (e.key === 'admin-event-typeset-approved' && e.newValue) {
            try {
                const data = JSON.parse(e.newValue);
                if (data.book === BOOK_MOCK.title && currentState === STATE.TYPESETTING) {
                    progressBar.style.width = '45%';
                    progressLabel.textContent = '대표님 승인 확인 완료! 조판 연산 가동';
                    document.getElementById('cs-progress-sub').textContent = '4번 조판이 AI 연산 가동 중...';
                    setTimeout(() => {
                        resumeTypesetting();
                    }, 800);
                }
            } catch(err) {
                console.error('[챗봇] 판형 승인 파싱 에러:', err);
            }
            localStorage.removeItem('admin-event-typeset-approved');
        }

        // A. 플랫폼 관리자(대표님)의 펀딩 개설 승인 수신
        if (e.key === 'admin-event-funding-approved' && e.newValue) {
            try {
                const data = JSON.parse(e.newValue);
                if (data.book === BOOK_MOCK.title) {
                    showTyping(800, () => {
                        addBotMessage(`🎉 <strong>[펀딩 개설 완료]</strong><br>도서 <strong>'${BOOK_MOCK.title}'</strong>의 B2C 펀딩이 대표 승인을 거쳐 정식 개설되었습니다!<br>아래 링크를 눌러 B2C 독자 스토어에서 확인하실 수 있습니다.<br><br><a href="/index.html" style="display:inline-block; padding:8px 16px; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:white; border-radius:8px; font-weight:bold; text-decoration:none; font-size:12px;">🔗 B2C 펀딩 페이지 보러가기</a>`);
                    });
                }
            } catch(err) {
                console.error('[챗봇] 승인 파싱 에러:', err);
            }
            localStorage.removeItem('admin-event-funding-approved');
        }

        // B. B2C 스토어 펀딩 100% 성공(결제 완수) 수신
        if (e.key === 'store-event-funding-completed' && e.newValue) {
            try {
                const data = JSON.parse(e.newValue);
                if (data.book === BOOK_MOCK.title) {
                    showTyping(800, () => {
                        addBotMessage(`📦 <strong>[펀딩 성공! 제작 발주 요청]</strong><br>도서 <strong>'${BOOK_MOCK.title}'</strong>의 B2C 독자 펀딩이 100% 달성 완료되었습니다!<br>최종 인쇄 제작 진행을 위해 아래 [주문하기] 버튼을 눌러 최종 제작 발주를 컨펌해 주세요.`);
                        
                        // 발주 버튼 카드 출력
                        const card = document.createElement('div');
                        card.className = 'cs-card';
                        card.id = 'cs-final-order-card';
                        card.innerHTML = `
                            <div class="cs-card-title">🖨️ 최종 도서 발주 컨펌</div>
                            <div class="cs-card-body">펀딩 성공에 따른 최종 도서 발주를 진행합니다. 제작을 확정하시겠습니까?</div>
                            <button class="cs-btn cs-btn--success" id="cs-final-order-btn">🖨️ 최종 제작 주문 (발주)</button>
                        `;
                        messages.appendChild(card);
                        scrollBottom();

                        // 문자 알림 무료 모방 전송 알림
                        triggerVirtualSMSNotification();

                        document.getElementById('cs-final-order-btn').addEventListener('click', () => {
                            document.getElementById('cs-final-order-btn').disabled = true;
                            addUserBubble('🖨️ 최종 제작 주문 (발주)');
                            // 통제실에 최종 발주 신호 발송 ➔ 파일 삭제 트리거
                            localStorage.setItem('erp-event-order-completed', JSON.stringify({ book: BOOK_MOCK.title, timestamp: Date.now() }));
                            showTyping(600, () => {
                                addBotMessage('최종 제작 발주가 완료되었습니다! 인쇄소 파이프라인으로 발주가 안전하게 이송되었으며, 서버 공간 절약을 위해 임시 PDF 파일 2종이 파기되었습니다. 감사합니다 📦');
                            });
                        });
                    });
                }
            } catch(err) {
                console.error('[챗봇] 펀딩 완료 파싱 에러:', err);
            }
            localStorage.removeItem('store-event-funding-completed');
        }
    });

    // 알림톡/문자 무료 모방 전송 시뮬레이션
    function triggerVirtualSMSNotification() {
        console.log(`[알림톡 발송] 수신처: 대표님 휴대폰 ➔ 도서 '마녀'의 B2C 펀딩 성공! B2B ERP에서 최종 발주를 완료해 주세요.`);
        alert(`📱 [알림톡 발송 완료 - UAT 데모]\n\n수신처: 대표님 휴대폰\n내용: [출판친구] 축하합니다! 도서 '마녀'의 B2C 펀딩이 100% 성공하였습니다. B2B ERP 상담이 창에서 [최종 제작 주문(발주)]을 완수해 주세요.`);
    }

    // ── DOM 준비 후 init ─────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
