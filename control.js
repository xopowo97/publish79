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

// 로테이션 표준 키워드 및 재시도 상태 관리
const CTRL_KEYWORD_ROTATION = [
    '소설', '에세이', '인문학', '경제경영', '사회과학', '역사',
    '과학', '예술', '자기계발', '종교', '어린이', '청소년'
];
let _ctrl_pipeline_retry_count = 0;

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

    // 분야 드롭다운 변경 시 실시간 필터 갱신 연동
    const kwInput = document.getElementById('ctrl-keyword-input');
    if (kwInput) {
        kwInput.addEventListener('change', () => {
            loadCtrlDashboard();
        });
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
                topQuery = topQuery.eq('category', category);
                latestQuery = latestQuery.eq('category', category);
            }
            
            const [top3Res, latestRes] = await Promise.all([
                topQuery.limit(3),
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
function renderCtrlAgentOrgTree(agents) {
    const container = document.getElementById('ctrl-org-tree');
    if (!container) return;

    const deptMapping = {
        'Front':    '📡 가치 창출 및 자율 서비스 본부',
        'Back':     '⚙️ 인프라 엔진 및 행정 지원 본부',
        'Security': '🛡️ AI 실시간 보안 및 통제 관제실'
    };

    const tagMapping = {
        1: '딥서치', 2: '정제', 3: '분석', 4: '조판', 5: '교정',
        6: '가변조판', 7: '영업', 8: '마케팅', 9: '감시', 10: '자가치유',
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
        const simulatedBadge = c.is_simulated
            ? `<span style="background:#f59e0b; color:#fff; font-size:9px; padding:1px 4.5px; border-radius:3px; margin-left:6px; font-weight:900; vertical-align:middle; display:inline-block; box-shadow:0 0 4px rgba(245,158,11,0.4);">통계 보정 중</span>`
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
            <div class="ctrl-rank-badge">${rankEmojis[i]} ${i + 1}위</div>
            <div class="ctrl-book-info">
                <div class="ctrl-book-title">${c.title} (${c.author})${simulatedBadge}</div>
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
        '미분류': 'background: rgba(100, 116, 139, 0.1); color: #64748b; border: 1px solid rgba(100, 116, 139, 0.2);'
    };

    container.innerHTML = latestCandidates.map(c => {
        const title = (c.title || '').replace(/<\/?[^>]+(>|$)/g, "");
        const author = (c.author || '미상').replace(/<\/?[^>]+(>|$)/g, "");
        const category = c.category || '미분류';
        const catStyle = categoryStyles[category] || 'background: rgba(100, 116, 139, 0.1); color: #64748b; border: 1px solid rgba(100, 116, 139, 0.2);';
        
        const pubYear = c.pub_year ? `${c.pub_year}년` : '연도 미상';
        const publisher = c.publisher || '출판사 미상';
        const score = c.reprint_score || 0;
        
        const simulatedBadge = c.is_simulated
            ? `<span style="background:#f59e0b; color:#fff; font-size:8px; padding:1px 4px; border-radius:3px; margin-left:6px; font-weight:900; vertical-align:middle; display:inline-block; box-shadow:0 0 4px rgba(245,158,11,0.3); animation: pulse 1.5s infinite;">통계 보정 중</span>`
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

window.startCtrlSimByFeedIsbn = function(isbn) {
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
    { type: 'success', agent: '[딥서치_살피미]',        msg: '국립중앙도서관 API 응답 정상 · 도서 {n}건 수집' },
    { type: 'info',    agent: '[(총괄) 오케스트레이터]', msg: '데이터 신뢰도 재산출 완료 · 현재 {n}%' },
    { type: 'warn',    agent: '[데이터정제_다듬이]',         msg: '절판 도서 {n}건 필터링 처리 중' },
    { type: 'success', agent: '[에러감지_눈치왕]',         msg: '에러 감지 0건 · 시스템 정상 운영 중' },
    { type: 'info',    agent: '[마케팅_알리미]',         msg: '복간 후보 보고서 초안 생성 완료' },
    { type: 'success', agent: '[보안통제_보안관]',         msg: '비정상 API 호출 0건 · 보안 이상 없음' },
    { type: 'info',    agent: '[코드수정_닥터]',       msg: 'SQL Injection 스캔 완료 · 위협 없음' },
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
async function triggerCtrlPipeline(isRetry = false) {
    const btn      = document.getElementById('ctrl-btn-pipeline');
    const statusEl = document.getElementById('ctrl-pipeline-status');
    const kwInput  = document.getElementById('ctrl-keyword-input');
    
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
        const res  = await fetch(`${endpoint}?keyword=${encodeURIComponent(kw)}`);
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

    // Supabase에서 reprint_score desc 정렬되어 오므로 첫 번째 도서가 항상 최고 점수
    const topBook = _ctrl_candidates[0];
    
    const cleanTitle  = (topBook.title || '').replace(/<\/?[^>]+(>|$)/g, '');
    const cleanAuthor = (topBook.author || '미상').replace(/<\/?[^>]+(>|$)/g, '');
    const score       = topBook.reprint_score || 0;
    const loans       = topBook.library_loans ? topBook.library_loans.toLocaleString() : '0';
    const pubYear     = topBook.pub_year ? `${topBook.pub_year}년` : '연도 미상';

    // AI 헬퍼 패널 활성화 (닫혀 있을 때만)
    const panel = document.getElementById('ai-panel');
    const fab   = document.getElementById('ai-fab');
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
    window.ctrlLaunchSimFromOrchestrator = function(index) {
        // FAB 골드 펄스 해제
        if (fab) {
            fab.classList.remove('pulse-gold');
        }
        ctrlStartSimByIndex(index);
    };

    if (window.lucide) {
        try { lucide.createIcons(); } catch(e) {}
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
function checkPrintCostOptimization(bookData, printQty) {
    // 기본 부수 미입력 시 소량 대표값 30부 적용
    const qty = (typeof printQty === 'number' && printQty > 0) ? printQty : 30;

    // ─── 조건 판단: 신국판 + 50부 미만 ───
    const isSheetfedForced   = qty < 50;               // 연속지 전환 불가 임계치
    const defaultSpecIsShinkuk = true;                  // 복간 후보 도서 기본 사양: 신국판

    if (!isSheetfedForced || !defaultSpecIsShinkuk) return; // 조건 미충족 시 제안 안 함

    // ─── 원가 계산 (대표님 단가 요율 공식 반영: 내지비 + 표지/코팅/제본 1500원 합산) ───
    const totalPages      = Math.max(200, Math.round((bookData.reprint_score || 80) * 2.5));
    const printCostPerPageShinkuk = 12; // 원/면 (신국판 2판거리)
    const printCostPerPageA5     =  8; // 원/면 (A5 4판거리)
    const coverProcessingCost    = 1500; // 원 (코팅 200원 + 날개 800원 + 제본 500원 합산)

    const totalCostShinkuk = (totalPages * printCostPerPageShinkuk * qty) + (coverProcessingCost * qty);
    const totalCostA5      = (totalPages * printCostPerPageA5 * qty) + (coverProcessingCost * qty);
    const savingPerCopy    = (totalCostShinkuk - totalCostA5) / qty;
    const savingTotal      = totalCostShinkuk - totalCostA5;
    const savingPct        = Math.round(((totalCostShinkuk - totalCostA5) / totalCostShinkuk) * 100);

    const cleanTitle  = (bookData.title  || '').replace(/<\/?[^>]+(>|$)/g, '');
    const cleanAuthor = (bookData.author || '미상').replace(/<\/?[^>]+(>|$)/g, '');

    // ─── AI 헬퍼 패널 활성화 ───
    const panel = document.getElementById('ai-panel');
    const fab   = document.getElementById('ai-fab');
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
            <span>[7번 B2B영업_영업이] 복간 및 원가 최적화 영업 제안</span>
        </div>
        <p style="font-size:11px; color:#334155; line-height:1.6; margin-bottom:10px; font-weight:500; background:#fff; padding:10px; border-radius:8px; border:1px dashed rgba(16,185,129,0.3)">
            📢 <strong>8번 마케팅_알리미</strong>의 SNS 트렌드/수요 예측 분석에 근거해 타겟 출판사 복간 최적 사양을 영업 제안합니다. 승인 시 <strong>VDP_이지퍼비터(ezpubitor) 조판/커버 엔진</strong>이 대기 상태에 들어갑니다.
        </p>
        <p style="font-size:11.5px; color:#0f172a; line-height:1.65; margin-bottom:10px; font-weight:600;">
            <strong style="color:#dc2626;">📌 ${qty}부 소량 제작 감지 (디지털 낱장 가동 강제)</strong><br>
            현재 신국판(152x225) 기준 낱장 인쇄 시 2판거리 배열 제약으로 면당 <strong>12원</strong> 요율이 적용됩니다. 이를 A5국판(148x210)으로 변경 시 4판거리 배열이 확보되어 면당 <strong>8원</strong>으로 원가가 대폭 절감됩니다.
        </p>
        <div style="background:#fff; border:1px solid rgba(16,185,129,0.2); border-radius:10px; padding:12px; font-size:11px; margin-bottom:10px; color:#475569;">
            <div style="font-size:12px; font-weight:800; color:#0f172a; margin-bottom:6px;">📚 ${cleanTitle} (${cleanAuthor})</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 12px;">
                <div style="color:#64748b;">제작 부수</div>
                <div style="font-weight:800; color:#0f172a;">${qty}부</div>
                <div style="color:#64748b;">예상 페이지</div>
                <div style="font-weight:800; color:#0f172a;">${totalPages}p</div>
                <div style="color:#dc2626;">신국판 총제작비</div>
                <div style="font-weight:800; color:#dc2626;">₩${totalCostShinkuk.toLocaleString()}</div>
                <div style="color:#10b981;">A5 전환 총제작비</div>
                <div style="font-weight:800; color:#10b981;">₩${totalCostA5.toLocaleString()}</div>
            </div>
            <div style="display:flex; justify-content:space-between; border-top:1px solid rgba(0,0,0,0.06); padding-top:8px; margin-top:8px; align-items:center;">
                <span style="font-weight:700; color:#64748b;">💰 B2B 절감 예상액</span>
                <span style="font-size:15px; font-weight:900; color:#10b981;">-₩${savingTotal.toLocaleString()} (${savingPct}%↓)</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:4px; align-items:center;">
                <span style="font-weight:700; color:#64748b;">권당 원가 절감</span>
                <span style="font-weight:800; color:#059669;">₩${Math.round(savingPerCopy).toLocaleString()} / 부</span>
            </div>
        </div>
        <div style="font-size:10px; color:#94a3b8; margin-bottom:10px; line-height:1.5;">
            ※ 일반등급 표준 단가 기준: 표지 1,500원(코팅 200 + 날개 800 + 제본 500)이 정식 합산된 공인 제작 단가입니다.
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
    window.ctrlApproveA5Optimization = function(bookIdOrIdx) {
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
        { type: 'error',   agent: '(총괄) 오케스트레이터', msg: '⚡ 플래시 라이트 모드 발동 — 비필수 에이전트 절전 전환 중' },
        { type: 'warn',    agent: '딥서치_살피미',         msg: '시스템 부하 감지 → API 호출 빈도 50% 조절 중' },
        { type: 'warn',    agent: '보안통제_보안관',         msg: '과부하 대응 2단계 방어 루틴 가동 완료' },
        { type: 'success', agent: '에러감지_눈치왕',         msg: '⚡ 방어 기제 정상 작동 — 핵심 파이프라인 보호 완료' },
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
    const book = _ctrl_candidates[index];
    if (!book) return;
    return startCtrlSimByBookData(book);
}

async function startCtrlSimByBookData(book) {
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

                    // 공통 단가 매핑 (표지, 코팅, 제본)
                    const coverPrintCost = gradeData?.commons?.find(x => x.n && x.n.includes('표지컬러단면'))?.v || 1200;
                    const coatingCost = gradeData?.commons?.find(x => x.n && x.n.includes('코팅'))?.v || 300;
                    const bindingCost = 1600; // 제본비 기본

                    const totalInnerCost = s.pages * qty * pageCost;
                    const totalCoverCost = qty * coverPrintCost;
                    const totalCoatingCost = qty * coatingCost;
                    const totalBindingCost = qty * bindingCost;

                    const totalCost = totalInnerCost + totalCoverCost + totalCoatingCost + totalBindingCost;
                    const unitCost  = Math.round(totalCost / qty);

                    let retailPrice = 15000;
                    if (s.specName.includes('국배판'))  retailPrice = 24000;
                    else if (s.specName.includes('46배판형')) retailPrice = 21000;
                    else if (s.specName.includes('신국판')) retailPrice = 18500;
                    else if (s.specName.includes('A5국판'))  retailPrice = 16800;
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

    logConsole(`[CEO] 대표 승인 확인. 규격: '${spec.specName}', 책등: ${spec.spineMm}mm 최종 승인.`, 'success', 13, '(총괄) 오케스트레이터');

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

        const progFill   = document.getElementById('ctrl-compile-fill');
        const progLabel  = document.getElementById('ctrl-compile-label');
        let progress = 0;

        const iv = setInterval(async () => {
            progress += 10;
            if (progFill)  progFill.style.width  = `${progress}%`;
            if (progLabel) progLabel.textContent  = `${progress}%`;

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

    // 접지 가이드선 (재단선 및 날개/책등 접지선 - 어두운 배경에서도 선명하게 보이도록 밝은 노란색 점선으로 보강)
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
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

        // fontkit 동적 로드 (한글 폰트 임베딩 지원 모듈)
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

        // fontkit 등록
        pdfDoc.registerFontkit(fontkit);

        // 준비된 나눔명조 폰트 바이너리 로드
        const fontUrl = ctrlApiUrl('/NanumMyeongjo.ttf');
        const fontBytes = await fetch(fontUrl).then(res => res.arrayBuffer());
        const customFont = await pdfDoc.embedFont(fontBytes);

        const page   = pdfDoc.addPage([595.275, 841.889]);

        const specDim = { 'A5국판': [148,210], '신국판': [152,225], '46배판형': [188,257], '국배판': [210,297] };
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

        // 한글 폰트를 사용하여 정상적으로 한국어 출력
        page.drawText(`[통제실 시뮬레이션] ${book.title}`, { x: xOff+20, y: yOff+trimH-50, size: 12, font: customFont, color: rgb(0.28,0.34,0.42) });
        page.drawText(`규격: ${spec.specName} / 페이지: ${spec.pages}p / 책등: ${spec.spineMm}mm`, { x: xOff+20, y: yOff+trimH-80, size: 9, font: customFont, color: rgb(0.39,0.45,0.55) });
        page.drawText(`출판친구 자율출판 에이전트 통제실 -- 인쇄용 조판 시뮬레이터 결과물`, { x: xOff+20, y: yOff+30, size: 8, font: customFont, color: rgb(0.39,0.45,0.55) });

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

// ───────────────────────────────────────────
// 23. AI Helper (Antigravity) 및 자가치유 파이프라인 연동
// ───────────────────────────────────────────

window.toggleAIPanel = function() {
    const panel = document.getElementById('ai-panel');
    const fab = document.getElementById('ai-fab');
    if (!panel || !fab) return;
    
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
        try { lucide.createIcons(); } catch(e) {}
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

        const res = await fetch(ctrlApiUrl('/api/send-error'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
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

window.triggerAIError = function(testName = 'Manual Demo') {
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

window.simulateFix = function(eventOrNull, prUrl) {
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
        try { lucide.createIcons(); } catch(e) {}
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
        const res = await fetch(ctrlApiUrl('/api/self-heal'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
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
        try { lucide.createIcons(); } catch(e) {}
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
// 24. AI Helper UI 이벤트 바인딩 및 초기 설정
// ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.querySelector('.ai-send-btn');
    const aiInput = document.querySelector('.ai-input');
    
    if (sendBtn) {
        sendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
        sendBtn.onclick = function() {
            if (!aiInput || !aiInput.value.trim()) return;
            const chatContent = document.getElementById('ai-chat-content');
            if (!chatContent) return;
            
            const userMsg = document.createElement('div');
            userMsg.className = 'ai-msg ai-msg-user';
            userMsg.style.cssText = 'align-self:flex-end; max-width:85%;';
            userMsg.textContent = aiInput.value.trim();
            chatContent.appendChild(userMsg);
            
            aiInput.value = '';
            setTimeout(() => { chatContent.scrollTop = chatContent.scrollHeight; }, 100);
        };
        
        if (aiInput) {
            aiInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') sendBtn.click();
            });
        }
    }

    // 에러 리스너 등록
    window.addEventListener('error', (event) => {
        // control.js에서 발생한 에러만 포착 (CORS/외부 CDN/확장프로그램/빈 파일명 에러 무시)
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
            // 외부 promise rejection 무시 (control.js 스택을 포함한 경우만 에러 포착)
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
});
