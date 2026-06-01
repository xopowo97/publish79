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
let _ctrl_trendChart     = null;
let _ctrl_logIntervalId  = null;
let _ctrl_lastLogId      = 0;
let _ctrl_candidates     = [
    { id: 1, title: "오래된 미래", author: "헬레나 노르베리-호지", pub_year: 2019, library_loans: 12450, reprint_score: 98, is_out_of_print: true },
    { id: 2, title: "탈학교의 사회", author: "이반 일리치", pub_year: 2017, library_loans: 8940, reprint_score: 95, is_out_of_print: true },
    { id: 3, title: "생각의 탄생", author: "루트번스타인", pub_year: 2020, library_loans: 7120, reprint_score: 91, is_out_of_print: true }
];
let _ctrl_flashActive    = false;
let _ctrl_flashTimerId   = null;
let _ctrl_approvalLog    = [];  // 승인 이력 배열

// 글로벌 시뮬레이션 상태
let _ctrl_simBook        = null;
let _ctrl_simSpecs       = null;
let _ctrl_approvedSpec   = null;

// ───────────────────────────────────────────
// 2. 초기화 진입점
// ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    try {
        initCtrlTrendChart();
    } catch (e) {
        console.warn('[통제실] 차트 초기화 실패:', e);
    }
    loadCtrlDashboard();
    startCtrlLogStream();
    try {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    } catch (e) {
        console.warn('[통제실] Lucide 아이콘 초기화 실패:', e);
    }
});

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
// 5. 대시보드 데이터 로드 (에이전트 조직도 + 복간 후보)
// ───────────────────────────────────────────
async function loadCtrlDashboard() {
    if (!_ctrl_supabase) {
        console.warn('[통제실] Supabase 객체가 없어 로컬 정적 데이터 모드로 실행합니다.');
        return;
    }
    // 5-1. 에이전트 조직도
    try {
        const { data, error } = await _ctrl_supabase
            .from('agents')
            .select('*')
            .order('id', { ascending: true });

        if (!error && data && data.length > 0) {
            renderCtrlAgentOrgTree(data);
        }
    } catch (e) {
        console.warn('[통제실] 에이전트 조직도 DB 연동 실패 (정적 UI 유지):', e.message);
    }

    // 5-2. 복간 후보 TOP3
    try {
        const { data, error } = await _ctrl_supabase
            .from('reprint_candidates')
            .select('*')
            .order('reprint_score', { ascending: false })
            .limit(3);

        if (!error && data && data.length > 0) {
            _ctrl_candidates = data;
            renderCtrlReprintCandidates(data);
        }
    } catch (e) {
        console.warn('[통제실] 복간 후보 DB 연동 실패 (정적 UI 유지):', e.message);
    }
}

// ───────────────────────────────────────────
// 6. 에이전트 조직도 동적 렌더링
// ───────────────────────────────────────────
function renderCtrlAgentOrgTree(agents) {
    const container = document.getElementById('ctrl-org-tree');
    if (!container) return;

    const deptMapping = {
        'Front':    '📡 가치 창출 및 자율 서비스 본부',
        'Back':     '⚙️ 인프라 엔진 및 행정 지원 본부',
        'Security': '🛡️ AI 실시간 보안 및 통제 관제실'
    };

    const tagMapping = {
        1: '딥서치', 2: '정제', 3: '분석', 4: '조판', 5: '검수',
        6: '디자인', 7: '영업', 8: '마케팅', 9: '감시', 10: '치유',
        11: '배포', 12: '보안', 13: '지휘'
    };

    const grouped = {};
    agents.forEach(a => {
        const dept = a.department || 'Etc';
        if (!grouped[dept]) grouped[dept] = [];
        grouped[dept].push(a);
    });

    const deptOrder = ['Front', 'Back', 'Security', 'Etc'];
    let html = '';

    deptOrder.forEach(dKey => {
        const list = grouped[dKey];
        if (!list || list.length === 0) return;

        const isOrch = list.some(a => a.id === 13);
        const title  = deptMapping[dKey] || `${dKey} 부서`;

        html += `<div class="ctrl-dept ${isOrch ? 'ctrl-dept-orch' : ''}">
            <div class="ctrl-dept-title">${title}</div>`;

        list.forEach(agent => {
            let rowClass = 'ctrl-agent-idle';
            let dotClass = 'ctrl-dot-slate';

            if (agent.status === 'active' || agent.status === 'success') {
                rowClass = 'ctrl-agent-active';
                dotClass = agent.id === 13 ? 'ctrl-dot-purple' : 'ctrl-dot-green';
            } else if (agent.status === 'running' || agent.status === 'processing') {
                rowClass = 'ctrl-agent-running';
                dotClass = 'ctrl-dot-amber';
            } else if (agent.status === 'error' || agent.status === 'danger') {
                rowClass = 'ctrl-agent-error';
                dotClass = 'ctrl-dot-rose';
            }

            let taskText = '대기중';
            if (agent.status === 'running' || agent.status === 'processing') taskText = agent.role || '작동중';
            else if (agent.status === 'active' || agent.status === 'success') taskText = agent.role || '조치 완료';
            else if (agent.status === 'error' || agent.status === 'danger') taskText = '⚠️ 오류 발생';

            const tagText   = tagMapping[agent.id] || '에이전트';
            const isPurple  = agent.id === 13;

            html += `
            <div class="ctrl-agent-row ${rowClass}">
                <span class="ctrl-dot ${dotClass}"></span>
                <span class="ctrl-agent-name">${agent.id}번 ${agent.name}</span>
                <span class="ctrl-agent-task">${taskText}</span>
                <span class="ctrl-agent-tag ${isPurple ? 'ctrl-tag-purple' : ''}">${tagText}</span>
            </div>`;
        });

        html += `</div>`;
    });

    // 총지휘부가 따로 분리되는 경우 처리
    if (!grouped['Security']?.some(a => a.id === 13) && !Object.values(grouped).flat().some(a => a.id === 13)) {
        // 13번이 없는 경우 기본 유지
    }

    container.innerHTML = html;
}

// ───────────────────────────────────────────
// 7. 복간 후보 TOP3 동적 렌더링
// ───────────────────────────────────────────
function renderCtrlReprintCandidates(candidates) {
    const container = document.getElementById('ctrl-top3-list');
    if (!container) return;

    if (!candidates || candidates.length === 0) {
        container.innerHTML = `
        <div style="padding:24px; text-align:center; color:var(--ctrl-text-mute);">
            <p style="font-size:11px; font-weight:600;">후보 도서 분석 대기 중<br>파이프라인을 실행하면 실시간으로 표시됩니다.</p>
        </div>`;
        return;
    }

    const rankEmojis = ['🥇', '🥈', '🥉'];

    container.innerHTML = candidates.slice(0, 3).map((c, i) => {
        const rankClass = `ctrl-rank-${i + 1}`;
        const pubYear = c.pub_year ? `${c.pub_year}년` : '연도 미상';
        const loans   = c.library_loans ? c.library_loans.toLocaleString() : '0';

        return `
        <div class="ctrl-book-card ${rankClass}" onclick="ctrlStartSimByIndex(${i})" style="cursor:pointer;">
            <div class="ctrl-rank-badge">${rankEmojis[i]} ${i + 1}위</div>
            <div class="ctrl-book-info">
                <div class="ctrl-book-title">${c.title} (${c.author})</div>
                <div class="ctrl-book-meta">${c.is_out_of_print ? '절판' : '일반'} · ${pubYear} · 대출 <strong>${loans}</strong>건</div>
            </div>
            <div class="ctrl-reprint-score">${c.reprint_score || 0}<span>점</span></div>
        </div>`;
    }).join('');
}

// ───────────────────────────────────────────
// 8. 에이전트 상태 로컬 UI 업데이트
// ───────────────────────────────────────────
function ctrlUpdateLocalAgentStatus(agentId, status, role) {
    const container = document.getElementById('ctrl-org-tree');
    if (!container) return;

    container.querySelectorAll('.ctrl-agent-row').forEach(row => {
        if (row.querySelector('.ctrl-agent-name')?.textContent.includes(`${agentId}번`)) {
            row.classList.remove('ctrl-agent-running', 'ctrl-agent-idle', 'ctrl-agent-error', 'ctrl-agent-active');
            const dot  = row.querySelector('.ctrl-dot');
            const task = row.querySelector('.ctrl-agent-task');

            if (status === 'running') {
                row.classList.add('ctrl-agent-running');
                if (dot) { dot.className = 'ctrl-dot ctrl-dot-amber'; }
            } else if (status === 'success' || status === 'active') {
                row.classList.add('ctrl-agent-active');
                if (dot) { dot.className = agentId === 13 ? 'ctrl-dot ctrl-dot-purple' : 'ctrl-dot ctrl-dot-green'; }
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
            agent_id:   agentId,
            agent_name: agentName,
            log_level:  logLevel,
            message:    message,
            metadata:   metadata ? JSON.stringify(metadata) : null,
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
    { type: 'success', agent: '[살피미]',        msg: '국립중앙도서관 API 응답 정상 · 도서 {n}건 수집' },
    { type: 'info',    agent: '[오케스트레이터]', msg: '데이터 신뢰도 재산출 완료 · 현재 {n}%' },
    { type: 'warn',    agent: '[다듬이]',         msg: '절판 도서 {n}건 필터링 처리 중' },
    { type: 'success', agent: '[눈치왕]',         msg: '에러 감지 0건 · 시스템 정상 운영 중' },
    { type: 'info',    agent: '[알림이]',         msg: '복간 후보 보고서 초안 생성 완료' },
    { type: 'success', agent: '[보안관]',         msg: '비정상 API 호출 0건 · 보안 이상 없음' },
    { type: 'info',    agent: '[자가치유]',       msg: 'SQL Injection 스캔 완료 · 위협 없음' },
];

function startCtrlLogStream() {
    if (_ctrl_logIntervalId) clearInterval(_ctrl_logIntervalId);

    _fetchAndRenderCtrlLogs();

    _ctrl_logIntervalId = setInterval(() => {
        const el = document.getElementById('ctrl-log-stream');
        if (!el) { clearInterval(_ctrl_logIntervalId); return; }
        _fetchAndRenderCtrlLogs();
    }, 5000);
}

async function _fetchAndRenderCtrlLogs() {
    const el = document.getElementById('ctrl-log-stream');
    if (!el) return;

    if (!_ctrl_supabase) {
        _appendCtrlSimulatedLog(el);
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

    // DB 미연동 시 시뮬레이션 폴백
    _appendCtrlSimulatedLog(el);
}

function _appendCtrlLogEntry(el, type, agent, message, dateObj) {
    const d = dateObj || new Date();
    const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;

    const div = document.createElement('div');
    div.className = `ctrl-log-entry ctrl-log-${type}`;
    div.innerHTML = `<span class="ctrl-log-time">${time}</span><span class="ctrl-log-agent">[${agent}]</span><span>${message}</span>`;
    el.prepend(div);

    while (el.children.length > 20) el.removeChild(el.lastChild);
}

function _appendCtrlSimulatedLog(el) {
    const pool = CTRL_LOG_POOL[Math.floor(Math.random() * CTRL_LOG_POOL.length)];
    const n    = Math.floor(Math.random() * 50) + 50;
    _appendCtrlLogEntry(el, pool.type, pool.agent.replace(/\[|\]/g, ''), pool.msg.replace('{n}', n), new Date());
}

// ───────────────────────────────────────────
// 12. 파이프라인 실행 트리거
// ───────────────────────────────────────────
async function triggerCtrlPipeline() {
    const btn      = document.getElementById('ctrl-btn-pipeline');
    const statusEl = document.getElementById('ctrl-pipeline-status');
    const kwInput  = document.getElementById('ctrl-keyword-input');
    const kw       = kwInput?.value?.trim() || '절판 도서';

    if (btn) { btn.disabled = true; btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2"/></svg> 실행 중...'; }
    if (statusEl) { statusEl.textContent = `🔄 "${kw}" → 살피미 → 다듬이 파이프라인 가동 중...`; statusEl.style.color = 'var(--ctrl-amber)'; }

    try {
        const endpoint = ctrlApiUrl('/api/pipeline');
        const res  = await fetch(`${endpoint}?keyword=${encodeURIComponent(kw)}`);
        const data = await res.json();

        if (res.ok && data.success) {
            if (statusEl) {
                statusEl.textContent = `✅ 완료! ${data.totalCollected || 0}건 수집 → ${data.inserted || 0}건 DB 적재`;
                statusEl.style.color = 'var(--ctrl-green)';
            }
            setTimeout(async () => {
                _ctrl_lastLogId = 0;
                await loadCtrlDashboard();
                if (_ctrl_candidates && _ctrl_candidates.length > 0) {
                    setTimeout(() => ctrlStartSimByIndex(0), 1200);
                }
            }, 1500);
        } else {
            if (statusEl) { statusEl.textContent = `❌ 오류: ${data.error || '알 수 없는 오류'}`; statusEl.style.color = 'var(--ctrl-rose)'; }
        }
    } catch (err) {
        if (statusEl) { statusEl.textContent = `❌ 네트워크 오류: ${err.message}`; statusEl.style.color = 'var(--ctrl-rose)'; }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> 파이프라인 실행`;
        }
    }
}

// ───────────────────────────────────────────
// 13. 플래시 라이트 모드
// ───────────────────────────────────────────
function toggleCtrlFlashlight() {
    const mainEl = document.querySelector('.ctrl-main');
    const btn    = document.getElementById('ctrl-btn-flashlight');

    _ctrl_flashActive = !_ctrl_flashActive;

    if (_ctrl_flashActive) {
        if (mainEl) mainEl.classList.add('flashlight-active');
        if (btn)    { btn.textContent = '⚡ 플래시 라이트 ON — 클릭 시 해제'; btn.classList.add('btn-flash-on'); }

        const msgEl   = document.getElementById('ctrl-orch-msg');
        const scoreEl = document.getElementById('ctrl-orch-score');
        if (msgEl)   msgEl.textContent = '⚠️ 시스템 과부하 감지! 플래시 라이트 모드 가동 — 비필수 에이전트 슬립 전환 중...';
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
        { type: 'error',   agent: '오케스트레이터', msg: '⚡ 플래시 라이트 모드 발동 — 비필수 에이전트 절전 전환 중' },
        { type: 'warn',    agent: '살피미',         msg: '시스템 부하 감지 → API 호출 빈도 50% 조절 중' },
        { type: 'warn',    agent: '보안관',         msg: '과부하 대응 2단계 방어 루틴 가동 완료' },
        { type: 'success', agent: '눈치왕',         msg: '⚡ 방어 기제 정상 작동 — 핵심 파이프라인 보호 완료' },
    ];
    warnings.forEach(w => _appendCtrlLogEntry(logEl, w.type, w.agent, w.msg, new Date()));
}

function _ctrlAutoRecover() {
    if (_ctrl_flashTimerId) { clearInterval(_ctrl_flashTimerId); _ctrl_flashTimerId = null; }
    _ctrl_flashActive = false;

    const mainEl = document.querySelector('.ctrl-main');
    const btn    = document.getElementById('ctrl-btn-flashlight');

    if (mainEl) mainEl.classList.remove('flashlight-active');
    if (btn) {
        btn.classList.remove('btn-flash-on');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> 플래시 라이트 모드 시연`;
    }

    const msgEl   = document.getElementById('ctrl-orch-msg');
    const scoreEl = document.getElementById('ctrl-orch-score');
    if (msgEl)   msgEl.textContent = '시스템 안정화 완료. 과부하 방어 기제 정상 작동 검증됨. 전 에이전트 활성 상태 복귀.';
    if (scoreEl) scoreEl.innerHTML = '95<span>%</span>';

    const logEl = document.getElementById('ctrl-log-stream');
    if (logEl) _appendCtrlLogEntry(logEl, 'success', '오케스트레이터', '✅ 시스템 안정화 완료 — 전 에이전트 정상 운영 상태 복귀', new Date());
}

// ───────────────────────────────────────────
// 14. 시뮬레이션 모달 — 복간 후보 도서 선택 시 실행
// ───────────────────────────────────────────
async function ctrlStartSimByIndex(index) {
    alert("도서 클릭이 확인되었습니다! (인덱스: " + index + ")");
    const book = _ctrl_candidates[index];
    if (!book) return;

    // HTML 태그 제거
    if (book.title)  book.title  = book.title.replace(/<\/?[^>]+(>|$)/g, '');
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
        try { lucide.createIcons(); } catch(e) {}
    }

    // 콘솔 로그 헬퍼
    const consoleEl  = document.getElementById('ctrl-sim-console');
    const logConsole = (message, type = 'info', agentId = null, agentName = null) => {
        const time  = new Date().toTimeString().split(' ')[0];
        const colorMap = {
            info:    'color:#7dd3fc;',
            success: 'color:#6ee7b7; font-weight:900;',
            warn:    'color:#fcd34d;',
            error:   'color:#fda4af; font-weight:900;'
        };
        const style = colorMap[type] || 'color:#94a3b8;';
        const line  = document.createElement('div');
        line.innerHTML = `<span style="color:#4b5563;">[${time}]</span> <span style="${style}">${message}</span>`;
        consoleEl.appendChild(line);
        consoleEl.scrollTop = consoleEl.scrollHeight;

        if (agentId && agentName) {
            ctrlWriteAuditLog(agentId, agentName, type, message, { bookTitle: book.title });
        }
    };

    // 파이프라인 시뮬레이션 시작
    logConsole(`[오케스트레이터] 도서 '${book.title}' 1~8단계 자율 출판 파이프라인 시뮬레이션 가동 개시.`, 'info', 13, '오케스트레이터');

    await ctrlUpdateAgentStatusInDB(13, 'running', '파이프라인 실행 지휘 중');
    await ctrlUpdateAgentStatusInDB(1, 'success', '도서관 API 데이터 수집 완료');
    await ctrlUpdateAgentStatusInDB(2, 'success', '도서 데이터 정제 완료');
    ctrlUpdateLocalAgentStatus(1, 'success', '수집 완료');
    ctrlUpdateLocalAgentStatus(2, 'success', '정제 완료');
    ctrlUpdateLocalAgentStatus(13, 'running', '파이프라인 지휘 중');

    // STEP 3: 가상 조판
    setTimeout(async () => {
        _ctrlSetStep(3, 'active', '진행중 (🟡)');
        ctrlUpdateLocalAgentStatus(4, 'running', '1차 가상 조판 시뮬레이션 중');
        logConsole(`[VDP_조판사] 4대 표준 판형에 얹었을 때 물리 스펙 가상 계산 개시.`, 'info', 4, 'VDP_조판사');

        try {
            const res  = await fetch(ctrlApiUrl('/api/typeset'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'simulate',
                    title:  book.title,
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
                logConsole(`[VDP_조판사] ${s.specName} 가상 레이아웃 완료 ➔ 예상 페이지: ${s.pages}p, 책등: ${s.spineMm}mm`, 'info', 4, 'VDP_조판사');
            }

            _ctrlSetStep(3, 'done', '완료 (🟢)');
            ctrlUpdateLocalAgentStatus(4, 'success', '1차 가상 조판 완료');
            logConsole(`[VDP_조판사] 4대 판형 물리 스펙 산출 완료. 수익성 분석 팀장에게 데이터 전송.`, 'success', 4, 'VDP_조판사');

            // STEP 4: 수익성 검토
            setTimeout(async () => {
                _ctrlSetStep(4, 'active', '진행중 (🟡)');
                ctrlUpdateLocalAgentStatus(3, 'running', '제작 단가 및 예상 마진율 산출 중');
                logConsole(`[수익성 분석 팀장] 1차 물리 스펙 수령. 단가표 및 용지 가격 매핑 개시.`, 'info', 3, '수익성·타당성 분석 팀장');

                const calculatedSpecs = sims.map(s => {
                    const totalCost = (s.pages * 500 * 15) + (500 * 1200) + (500 * 300) + (500 * 1600);
                    const unitCost  = Math.round(totalCost / 500);
                    let retailPrice = 15000;
                    if (s.specName.includes('국배판'))  retailPrice = 24000;
                    else if (s.specName.includes('신국판')) retailPrice = 18500;
                    else if (s.specName.includes('A5국판'))  retailPrice = 16800;
                    else retailPrice = 14800;

                    const marginRate = Math.round(((retailPrice - unitCost) / retailPrice) * 100);
                    const isRecommended   = s.specName.includes('신국판');
                    const recommendationText = isRecommended ? '최적 마진 추천 🔥' : (marginRate >= 60 ? '적합도 우수' : marginRate < 50 ? '적합도 낮음' : '적합도 보통');

                    return { ...s, unitCost, retailPrice, marginRate, isRecommended, recommendationText };
                });

                for (let i = 0; i < calculatedSpecs.length; i++) {
                    await new Promise(r => setTimeout(r, 400));
                    const s = calculatedSpecs[i];
                    logConsole(`[수익성 분석 팀장] ${s.specName} 권당 제작 단가: ₩${s.unitCost.toLocaleString()} | 권장 정가: ₩${s.retailPrice.toLocaleString()} (마진율: ${s.marginRate}%) ➔ ${s.recommendationText}`, 'info', 3, '수익성·타당성 분석 팀장');
                }

                _ctrlSetStep(4, 'done', '완료 (🟢)');
                ctrlUpdateLocalAgentStatus(3, 'success', '수익성 검토 완료');
                logConsole(`[수익성 분석 팀장] 4개 판형별 원가 및 마진율 최종 산출 완료. 의사결정 카드 전달.`, 'success', 3, '수익성·타당성 분석 팀장');

                // STEP 5: CEO 의사결정 카드
                setTimeout(() => {
                    _ctrlSetStep(5, 'active', '대기중 (🟡)');
                    ctrlUpdateLocalAgentStatus(13, 'active', '의사결정 카드 보고 중');
                    logConsole(`[오케스트레이터] 대표님 대시보드 '의사결정 카드(4대 판형 비교)' 전송. 최종 결정 승인 대기.`, 'warn', 13, '오케스트레이터');

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

    const consoleEl  = document.getElementById('ctrl-sim-console');
    const logConsole = (message, type = 'info', agentId = null, agentName = null) => {
        const time  = new Date().toTimeString().split(' ')[0];
        const colorMap = {
            info:    'color:#7dd3fc;',
            success: 'color:#6ee7b7; font-weight:900;',
            warn:    'color:#fcd34d;',
            error:   'color:#fda4af; font-weight:900;'
        };
        const style = colorMap[type] || 'color:#94a3b8;';
        const line  = document.createElement('div');
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

    logConsole(`[CEO] 대표 승인 확인. 규격: '${spec.specName}', 책등: ${spec.spineMm}mm 최종 승인.`, 'success', 13, '오케스트레이터');

    // 승인 로그 기록 (API)
    try {
        await fetch(ctrlApiUrl('/api/decision'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                proposalType: 'REPRINT_SPEC',
                decision:     'APPROVED',
                contextData: {
                    title: book.title,
                    selectedSpec: spec.specName,
                    pages:        spec.pages,
                    spineMm:      spec.spineMm,
                    unitCost:     spec.unitCost,
                    retailPrice:  spec.retailPrice,
                    marginRate:   spec.marginRate
                }
            })
        });
        logConsole(`[CEO] Supabase 의사결정 영구 로그 적재 완료 (APPROVED).`, 'success', 13, '오케스트레이터');
    } catch (_) { /* 시뮬레이션 계속 */ }

    // 승인 이력 UI 업데이트
    _addCtrlApprovalLog(book.title, spec.specName, spec.marginRate);

    _ctrlSetStep(5, 'done', '승인 완료 (🟢)');

    // STEP 7: 2차 최종 조판 프로그레스
    _ctrlSetStep(6, 'active', '조판 중 (🟡)');
    ctrlUpdateLocalAgentStatus(4, 'running', `최종 판형 '${spec.specName}' PDF/X-4 컴파일 중`);
    logConsole(`[VDP_조판사] 승인 신호 수령. 2차 최종 조판 개시 (도련 3mm, Gutter 여백 반영)...`, 'info', 4, 'VDP_조판사');

    // 컴파일 프로그레스 바 노출
    const compArea = document.getElementById('ctrl-compile-area');
    if (compArea) {
        ctrlShowEl(compArea);
        const body = document.getElementById('ctrl-sim-body');
        if (body) setTimeout(() => body.scrollTo({ top: compArea.offsetTop - 20, behavior: 'smooth' }), 300);

        const progFill   = document.getElementById('ctrl-compile-fill');
        const progLabel  = document.getElementById('ctrl-compile-label');
        let progress = 0;

        const iv = setInterval(async () => {
            progress += 10;
            if (progFill)  progFill.style.width  = `${progress}%`;
            if (progLabel) progLabel.textContent  = `${progress}%`;

            if (progress === 30) logConsole(`[VDP_조판사] 사방 도련(Bleed 3mm) 기준선 레이아웃 적용 중...`, 'info', 4, 'VDP_조판사');
            else if (progress === 60) logConsole(`[VDP_조판사] 양면 제침 홀짝 여백(Gutter) 좌우 변위 자동 정합 중...`, 'info', 4, 'VDP_조판사');
            else if (progress === 80) logConsole(`[VDP_조판사] 쪽번호 및 머리말 폰트 아웃라인 컴파일 중...`, 'info', 4, 'VDP_조판사');
            else if (progress >= 100) {
                clearInterval(iv);
                logConsole(`[VDP_조판사] 최종 PDF/X-4 컴파일 빌드 성공 (300 DPI 규격 준수).`, 'success', 4, 'VDP_조판사');
                ctrlUpdateLocalAgentStatus(4, 'success', `인쇄용 PDF/X-4 컴파일 완료 (${spec.specName})`);

                // PDF 다운로드 버튼 노출
                const dlArea = document.getElementById('ctrl-compile-download');
                if (dlArea) {
                    ctrlShowEl(dlArea);
                    dlArea.innerHTML = `
                    <button onclick="ctrlDownloadReprintPDF()" class="ctrl-btn ctrl-btn-primary" style="font-size:11px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        📄 최종 인쇄용 PDF/X-4 다운로드
                    </button>`;
                }

                // STEP 8: 북 커버 디자인
                setTimeout(async () => {
                    ctrlUpdateLocalAgentStatus(6, 'running', `세네카 연동 북 커버 디자인 제작 중 (두께: ${spec.spineMm}mm)`);
                    logConsole(`[디자이너] 6번 디자이너 가동. 세네카 두께 ${spec.spineMm}mm에 비례 정합하는 커버 펼침면 제작 개시.`, 'info', 6, '디자이너');

                    const coverArea = document.getElementById('ctrl-cover-area');
                    if (coverArea) {
                        ctrlShowEl(coverArea);
                        const body = document.getElementById('ctrl-sim-body');
                        if (body) setTimeout(() => body.scrollTo({ top: coverArea.offsetTop - 20, behavior: 'smooth' }), 300);

                        drawCtrlBookCover(book.title, spec.specName, spec.spineMm);
                        logConsole(`[디자이너] 책등 폭 ${spec.spineMm}mm 북 커버 전개도 디자인 최종 렌더링 완료.`, 'success', 6, '디자이너');

                        _ctrlSetStep(6, 'done', '완공 완료 (🟢)');
                        ctrlUpdateLocalAgentStatus(6, 'success', '표지 디자인 완료');
                        ctrlUpdateLocalAgentStatus(13, 'success', '파이프라인 및 DB 적재 완료');
                        logConsole(`[오케스트레이터] 1~8단계 자율 출판 에이전트 연동 파이프라인 무결 완공 성공!`, 'success', 13, '오케스트레이터');
                        loadCtrlDashboard();

                        // 최종 완료 푸터
                        const footer = document.getElementById('ctrl-sim-footer');
                        if (footer) {
                            footer.innerHTML = `
                            <div style="font-size:11px; color:var(--ctrl-sky); font-weight:800;">✨ 에이전트 파이프라인 완공! 마스터 DB에 도서 등록 대기 중</div>
                            <div style="display:flex; gap:8px;">
                                <button onclick="ctrlCloseSimModal()" class="ctrl-btn" style="background:transparent; border:1px solid var(--ctrl-border-md); color:var(--ctrl-text-mute); font-size:11px;">그냥 닫기</button>
                                <button onclick="ctrlCloseSimModal()" class="ctrl-btn ctrl-btn-primary" style="font-size:11px; background:linear-gradient(135deg,#10b981,#059669);">🛒 카탈로그 등록 완료 (Supabase 반영)</button>
                            </div>`;
                        }
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
    const icon   = document.getElementById(`ctrl-step-${stepNum}-icon`);
    const status = document.getElementById(`ctrl-step-${stepNum}-status`);
    const name   = document.getElementById(`ctrl-step-${stepNum}-name`);

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

    const wingWidth = 100;
    const baseWidth = 200;
    const spineWidth = Math.max(spineMm * 3.5, 12);
    const totalWidth = wingWidth * 2 + baseWidth * 2 + spineWidth;
    const height = 240;

    canvas.width  = totalWidth + 40;
    canvas.height = height + 40;

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const xLeftWing  = 20 + wingWidth;
    const xSpineLeft = 20 + wingWidth + baseWidth;
    const xSpineRight= 20 + wingWidth + baseWidth + spineWidth;
    const xRightWing = 20 + wingWidth + baseWidth * 2 + spineWidth;

    // 그라디언트 배경
    const gradient = ctx.createLinearGradient(20, 20, totalWidth + 20, 20);
    gradient.addColorStop(0,    '#0f172a');
    gradient.addColorStop(0.20, '#1e293b');
    gradient.addColorStop(0.48, '#0f172a');
    gradient.addColorStop(0.50, '#0ea5e9');
    gradient.addColorStop(0.52, '#0f172a');
    gradient.addColorStop(0.80, '#0284c7');
    gradient.addColorStop(1,    '#0c4a6e');
    ctx.fillStyle = gradient;
    ctx.fillRect(20, 20, totalWidth, height);

    // 접지 가이드선
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    [xLeftWing, xSpineLeft, xSpineRight, xRightWing].forEach(x => {
        ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, height + 20); ctx.stroke();
    });
    ctx.setLineDash([]);

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

        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.create();
        const page   = pdfDoc.addPage([595.275, 841.889]);

        const specDim = { 'A5국판': [148,210], '신국판': [152,225], '46판': [128,188], '국배판': [210,297] };
        let [tw, th] = [152, 225];
        for (const [k, v] of Object.entries(specDim)) {
            if (spec.specName.includes(k)) { [tw, th] = v; break; }
        }

        const mmPt = 72 / 25.4;
        const trimW = tw * mmPt;
        const trimH = th * mmPt;
        const xOff  = (595.275 - trimW) / 2;
        const yOff  = (841.889 - trimH) / 2;

        page.drawRectangle({ x: xOff, y: yOff, width: trimW, height: trimH, borderWidth: 0.5, borderColor: rgb(0.5,0.5,0.5), borderDashArray:[2,2] });
        page.drawRectangle({ x: xOff-8.5, y: yOff-8.5, width: trimW+17, height: trimH+17, borderWidth: 0.75, borderColor: rgb(0.9,0.2,0.2) });

        page.drawText(`[Control Room Sim] ${book.title}`, { x: xOff+20, y: yOff+trimH-50, size:12, color:rgb(0.28,0.34,0.42) });
        page.drawText(`Spec: ${spec.specName} / Pages: ${spec.pages}p / Spine: ${spec.spineMm}mm`, { x: xOff+20, y: yOff+trimH-80, size:9, color:rgb(0.39,0.45,0.55) });
        page.drawText(`Anti-Gravity Agent Control Room — Autonomous Publishing Pipeline`, { x: xOff+20, y: yOff+30, size:8, color:rgb(0.39,0.45,0.55) });

        const bytes = await pdfDoc.save();
        const link  = document.createElement('a');
        const fname = book.title.replace(/[/\\?%*:|"<>\s]/g, '_');
        link.href     = URL.createObjectURL(new Blob([bytes], { type:'application/pdf' }));
        link.download = `[인쇄용_최종조판]_${fname}_${spec.specName}.pdf`;
        link.click();
    } catch (err) {
        alert('PDF 생성 오류: ' + err.message);
    }
}

async function ctrlDownloadCoverPDF() {
    const canvas = document.getElementById('ctrl-cover-canvas');
    if (!canvas) return;

    try {
        if (!window.PDFLib) {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
                s.onload = resolve; s.onerror = reject;
                document.head.appendChild(s);
            });
        }

        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.create();
        const imgData = canvas.toDataURL('image/png');
        const pngImg  = await pdfDoc.embedPng(imgData);
        const page    = pdfDoc.addPage([canvas.width, canvas.height]);
        page.drawImage(pngImg, { x:0, y:0, width:canvas.width, height:canvas.height });

        const bytes = await pdfDoc.save();
        const link  = document.createElement('a');
        const fname = (_ctrl_simBook?.title || '북커버').replace(/[/\\?%*:|"<>\s]/g, '_');
        link.href     = URL.createObjectURL(new Blob([bytes], { type:'application/pdf' }));
        link.download = `[인쇄용_표지]_${fname}_펼침면.pdf`;
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

    const time = new Date().toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
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
    return `
    <div class="ctrl-sim-modal" onclick="event.stopPropagation()">
        <!-- Header -->
        <div class="ctrl-sim-header">
            <div>
                <div class="ctrl-sim-title-label">
                    <span style="width:8px;height:8px;border-radius:50%;background:var(--ctrl-sky);display:inline-block;animation:dotPulse 1.2s infinite;"></span>
                    GEM 13. 자율 의사결정 파이프라인
                </div>
                <div class="ctrl-sim-title">복간 의사결정 시뮬레이터</div>
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
                    ['1', '딥서치 수집', 'done', '완료 (🟢)'],
                    ['2', '데이터 정제', 'done', '완료 (🟢)'],
                    ['3', '1차 가상조판', 'idle', '대기'],
                    ['4', '수익성 검토', 'idle', '대기'],
                    ['5', '대표님 승인', 'idle', '대기'],
                    ['6', '최종조판/디자인', 'idle', '대기'],
                ].map(([num, name, state, status]) => `
                <div class="ctrl-step">
                    <div class="ctrl-step-icon ${state}" id="ctrl-step-${num}-icon">${num}</div>
                    <div class="ctrl-step-name" id="ctrl-step-${num}-name">${name}</div>
                    <div class="ctrl-step-status" id="ctrl-step-${num}-status" style="color:${state==='done'?'var(--ctrl-green)':state==='active'?'var(--ctrl-amber)':'var(--ctrl-text-mute)'};">${status}</div>
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
                    <span style="font-size:10px; background:rgba(245,158,11,0.1); color:var(--ctrl-amber); padding:3px 10px; border-radius:6px; font-weight:800; border:1px solid rgba(245,158,11,0.2);">초판 500부 제작 기준</span>
                </div>
                <div class="ctrl-decision-grid" id="ctrl-decision-grid"></div>
            </div>

            <!-- 컴파일 진행 영역 -->
            <div id="ctrl-compile-area" class="hidden" style="display:none;">
                <div class="ctrl-compile-area" style="display:flex; flex-direction:column; gap:12px;">
                    <div class="ctrl-compile-title">
                        <span style="width:8px;height:8px;border-radius:50%;background:var(--ctrl-sky);display:inline-block;animation:dotPulse 1.2s infinite;"></span>
                        4번 VDP_조판사: 2차 최종 조판 및 PDF/X-4 인쇄용 파일 빌드 중...
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
                        6번 수석 크리에이티브 디자이너: 책등 두께 정밀 정합 북 커버 전개도 디자인 출력 완료
                    </div>
                    <canvas id="ctrl-cover-canvas" width="650" height="280" style="border:1px solid var(--ctrl-border); border-radius:12px; max-width:100%;"></canvas>
                    <button onclick="ctrlDownloadCoverPDF()" class="ctrl-btn-cover-pdf">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        북 커버 펼침면 PDF 다운로드
                    </button>
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
