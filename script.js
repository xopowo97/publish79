const DEFAULT_GRADES = ['신규등급', '일반등급(표준)', 'VIP등급', '기업등급'];

// --- 로그인 관련 기능 추가 ---
document.addEventListener('DOMContentLoaded', () => {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    if (isLoggedIn) {
        const role = sessionStorage.getItem('userRole');
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('app-container').classList.remove('hidden');
        if (typeof switchRole === 'function') {
            setTimeout(() => switchRole(role), 100);
        }
    }
});

function handleLogin() {
    const id = document.getElementById('login-id').value;
    const pw = document.getElementById('login-pw').value;

    // 임시 권한별 로그인 정보
    if (id === 'admin' && pw === '1234') {
        enterApp('admin');
    } else if (id === 'pub' && pw === '1234') {
        enterApp('publisher');
    } else if (id === 'print' && pw === '1234') {
        enterApp('printer');
    } else {
        alert('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
}

function enterApp(role) {
    sessionStorage.setItem('isLoggedIn', 'true');
    sessionStorage.setItem('userRole', role);
    
    // 페이드아웃 효과 후 전환
    const overlay = document.getElementById('login-overlay');
    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
        document.getElementById('app-container').classList.remove('hidden');
        if (typeof switchRole === 'function') {
            switchRole(role);
        }
    }, 500);
}

function logout() {
    sessionStorage.clear();
    location.reload();
}
// -----------------------

// 초기 기본 단가 데이터를 생성하는 함수
function getBasePriceData() {
    const sheetSpecs = [
        {id:1, n:'36판(103x182)', bw:8, cl:30, face:30}, {id:2, n:'국반판(105x148)', bw:8, cl:30, face:30},
        {id:3, n:'30절판(125x205)', bw:8, cl:30, face:30}, {id:4, n:'B6(128x182)', bw:8, cl:30, face:30},
        {id:5, n:'46판(128x188)', bw:8, cl:30, face:30}, {id:6, n:'다찌판(128x210)', bw:8, cl:30, face:30},
        {id:7, n:'A5국판(148x210)', bw:8, cl:30, face:30}, {id:8, n:'크라운판(176x248)', bw:12, cl:50, face:50},
        {id:9, n:'B5(182x257)', bw:12, cl:50, face:50}, {id:10, n:'46배판(188x257)', bw:12, cl:50, face:50},
        {id:11, n:'국배판(210x297)', bw:12, cl:50, face:50}
    ];
    const rollSpecs = [
        {id:101, n:'36판(103x182)', ivs:[]}, {id:102, n:'국반판(105x148)', ivs:[]}, {id:103, n:'30절판(125x205)', ivs:[]},
        {id:104, n:'B6(128x182)', ivs:[]}, {id:105, n:'46판(128x188)', ivs:[]}, {id:106, n:'다찌판(128x210)', ivs:[]},
        {id:107, n:'A5국판(148x210)', ivs:[]}, {id:108, n:'신국판(152x225)', ivs:[]}, {id:109, n:'크라운판(176x248)', ivs:[]},
        {id:110, n:'B5(182x257)', ivs:[]}, {id:111, n:'46배판(188x257)', ivs:[]}, {id:112, n:'국배판(210x297)', ivs:[]}
    ];
    const commons = [
        {id:201, n:'표지날개있음(권당)', v:1500}, {id:202, n:'표지날개없음(권당)', v:1000},
        {id:203, n:'표지흑백단면인쇄(권당)', v:0}, {id:204, n:'표지컬러양면인쇄(권당)', v:300},
        {id:207, n:'표지흑백양면인쇄(권당)', v:100}, {id:208, n:'표지컬러단면인쇄(권당)', v:200},
        {id:205, n:'100g용지할증(Page당)', v:0.5}, {id:206, n:'120g용지할증(Page당)', v:1},
        {id:209, n:'단면할증', v:5}
    ];

    const DEFAULT_IVS_A = [
        {s:50, e:100, bw:8, cl:12, wo:1200, wx:1000},
        {s:101, e:200, bw:7.5, cl:11.5, wo:1100, wx:900},
        {s:201, e:300, bw:7, cl:11, wo:1000, wx:800}
    ];
    const DEFAULT_IVS_B = [
        {s:50, e:100, bw:12, cl:18, wo:1200, wx:1000},
        {s:101, e:200, bw:11.5, cl:17.5, wo:1100, wx:900},
        {s:201, e:300, bw:11, cl:17, wo:1000, wx:800}
    ];

    rollSpecs.forEach(rs => {
        if (rs.id >= 109) rs.ivs = JSON.parse(JSON.stringify(DEFAULT_IVS_B));
        else rs.ivs = JSON.parse(JSON.stringify(DEFAULT_IVS_A));
    });

    return { sheetSpecs, rollSpecs, commons };
}

let MASTER = {
    grades: [...DEFAULT_GRADES],
    currentGrade: '일반등급(표준)',
    pricesByGrade: {}, // 각 등급별 단가 저장소
    coverPapers: ['스노우지 200g', '스노우지 250g', '아트지 200g', '아트지 250g', '랑데뷰 내츄럴 210g', '랑데뷰 내츄럴 240g', '랑데뷰 울트라화이트 210g', '랑데뷰 울트라화이트 240g'],
    innerPapers: ['백모조80g', '백모조100g', '백모조120g', '미색모조80g', '미색모조100g'],
    facePapers: ['없음', '매직칼라 옥색 120g', '매직칼라 노랑색 120g', '매직칼라 연분홍색 120g', '매직칼라 연두색 120g', '밍크지 군청색 120g', '밍크지 연청색 120g', '밍크지 적색 120g'],
    coating: ['무광', '유광'], binding: ['무선제본', '중철제본'], wing: ['날개 있음', '날개 없음'],
    coverPrinting: ['표지-흑백단면', '표지-흑백양면', '표지-컬러단면', '표지-컬러양면'],
    innerPrinting: ['내지-흑백단면', '내지-흑백양면', '내지-컬러단면', '내지-컬러양면', '내지-부분컬러'],
    faceInsert: ['없음', '면지있음(앞뒤1장)4P', '면지있음(앞뒤2장)8P'],
    customGroups: [], // Array of objects: { name: '특가공', type: 'book' }
    partners: [
        { id: 'sidae_admin', name: '시대인재', grade: 'VIP등급', bizNum: '123-45-67890', addr: '서울시 강남구 테헤란로 123', addrDetail: '시대인재 빌딩 5층', managers: [{name: '김철수', dept: '교재지원팀', tel: '010-1234-5678', email: 'kim@sidae.com'}] },
        { id: 'mega_procure', name: '메가스터디', grade: '일반등급(표준)', bizNum: '222-33-44444', addr: '서울시 서초구', addrDetail: '메가빌딩', managers: [{name: '이영희', dept: '구매팀', tel: '010-5555-6666', email: 'lee@mega.com'}] }
    ],
    orderPersistence: {
        sheet: {},
        roll: {}
    },
    orders: [
        {
            id: 'ORDER_001', date: '2026-03-30', mode: 'sheet',
            pubName: '시대인재', bookTitle: '2026 수능 대비 수학 실전 모의고사 (Vol.1)',
            managerName: '남궁민', unitPrice: '3,800', qty: '100', totalPrice: '380,000',
            data: { 'ord-book-title': '2026 수능 대비 수학 실전 모의고사 (Vol.1)', 'ord-qty': '100', 'ord-spec': 'A5국판(148x210)', 'ord-manager': '홍길동' }
        },
        {
            id: 'ORDER_002', date: '2026-03-29', mode: 'roll',
            pubName: '메가스터디', bookTitle: '개념완성 사회문화 요약집 (Final)',
            managerName: '김철수', unitPrice: '2,500', qty: '500', totalPrice: '1,250,000',
            data: { 'ord-book-title': '개념완성 사회문화 요약집 (Final)', 'ord-qty': '500', 'ord-spec': 'A5국판(148x210)', 'ord-manager': '김철수' }
        }
    ],
    printers: [
        { 
            id: 'printer_master', name: '출판프린팅', bizNum: '555-66-77777', 
            addr: '경기도 파주시', addrDetail: '출판단지길 100', ceoName: '박인쇄', bizType: '서비스/인쇄',
            managers: [
                {name: '최작업', tel: '010-9999-8888', email: 'choi@print.com', subPw: '1111', perms: ['prod']},
                {name: '정회계', tel: '010-7777-6666', email: 'jung@print.com', subPw: '2222', perms: ['settle']}
            ]
        }
    ],
    products: [] // 스토어 판매 도서 목록
};

// 초기 등급 데이터 세팅
function initMaster() {
    // 1. 과거 데이터(찌꺼기) 청소로 용량 확보
    localStorage.removeItem('antigrafiti_master'); 
    
    const saved = localStorage.getItem('MASTER_DATA');
    if (saved) {
        const parsed = JSON.parse(saved);
        // Deep merge or specific property assignment to keep new structure properties
        MASTER = { ...MASTER, ...parsed };
        if (!MASTER.orderPersistence) {
            MASTER.orderPersistence = { sheet: {}, roll: {} };
        }
        // 기본 등급들이 누락되었다면 추가 (5단계 -> 4단계 개편 대응)
        DEFAULT_GRADES.forEach(g => {
            if (!MASTER.grades.includes(g)) MASTER.grades.push(g);
        });

        // 모든 등급에 대해 단가 데이터 구조가 있는지 확인 및 생성
        MASTER.grades.forEach(g => {
            if (!MASTER.pricesByGrade[g]) {
                MASTER.pricesByGrade[g] = getBasePriceData();
            } else {
                if (!MASTER.pricesByGrade[g].commons.some(c => c.n === '단면할증')) {
                    MASTER.pricesByGrade[g].commons.push({id:209, n:'단면할증', v:5});
                }
            }
            if (!MASTER.pricesByGrade[g].sheetCommons) {
                MASTER.pricesByGrade[g].sheetCommons = {};
                MASTER.pricesByGrade[g].rollCommons = {};
                
                // 데이터 마이그레이션: 기존 commons 배열에서 값 추출하여 매핑 구조로 복원 (하이브리드 지원)
                const cFind = (n) => (MASTER.pricesByGrade[g].commons.find(c => c.n.includes(n)) || {v:0}).v;
                
                MASTER.pricesByGrade[g].sheetCommons['표지날개_날개 있음'] = cFind('표지날개있음');
                MASTER.pricesByGrade[g].sheetCommons['표지날개_날개 없음'] = cFind('표지날개없음');
                MASTER.pricesByGrade[g].sheetCommons['내지인쇄_내지-흑백단면'] = cFind('표지흑백단면');
                MASTER.pricesByGrade[g].sheetCommons['내지인쇄_내지-흑백양면'] = cFind('표지흑백양면');
                MASTER.pricesByGrade[g].sheetCommons['표지인쇄_표지-컬러단면'] = cFind('표지컬러단면');
                MASTER.pricesByGrade[g].sheetCommons['표지인쇄_표지-컬러양면'] = cFind('표지컬러양면');
                MASTER.pricesByGrade[g].sheetCommons['코팅방식_무광'] = 0;
                MASTER.pricesByGrade[g].sheetCommons['코팅방식_유광'] = 0;
            }
        });
    } else {
        MASTER.grades.forEach(g => {
            MASTER.pricesByGrade[g] = getBasePriceData();
            MASTER.pricesByGrade[g].sheetCommons = {};
            MASTER.pricesByGrade[g].rollCommons = {};
        });
    }

    // 인쇄소 협약단가 기본 데이터 초기화
    if (!MASTER.pricesByGrade['인쇄소 협약단가']) {
        MASTER.pricesByGrade['인쇄소 협약단가'] = getBasePriceData();
        MASTER.pricesByGrade['인쇄소 협약단가'].sheetCommons = {};
        MASTER.pricesByGrade['인쇄소 협약단가'].rollCommons = {};
    }

    // 마이그레이션: customGroups가 문자열 배열이면 객체 배열로 변환 및 오류 데이터 정리 (undefined 버그 해결)
    if (MASTER.customGroups && MASTER.customGroups.length > 0) {
        MASTER.customGroups = MASTER.customGroups.map(g => {
            if (typeof g === 'string') {
                return { name: g, type: 'book', isVisible: true };
            }
            if (g.isVisible === undefined) {
                g.isVisible = true; // backward compatibility
            }
            return g;
        });
        // 유효한 name을 가진 객체만 필터링
        MASTER.customGroups = MASTER.customGroups.filter(g => g && g.name && g.name !== 'undefined');
    } else {
        MASTER.customGroups = [];
    }

    if (!MASTER.products) MASTER.products = [];
}
initMaster();

function saveMasterData() {
    localStorage.setItem('MASTER_DATA', JSON.stringify(MASTER));
    alert("모든 설정 정보가 브라우저에 성공적으로 저장되었습니다.");
}

function saveMasterDataSilent() {
    try {
        const data = JSON.stringify(MASTER);
        // 용량 체크 (대략적인 바이트 계산)
        const sizeInMb = (data.length * 2) / (1024 * 1024);
        
        if (sizeInMb > 4.5) {
            alert("⚠️ 경고: 브라우저 저장 공간이 거의 꽉 찼습니다 (현재 " + sizeInMb.toFixed(2) + "MB). \n불필요한 도서를 삭제하여 공간을 확보해 주세요. 그렇지 않으면 저장이 실패할 수 있습니다.");
        }
        
        localStorage.setItem('MASTER_DATA', data);
    } catch (e) {
        console.error("저장 실패:", e);
        alert("❌ 저장 공간이 부족하여 데이터를 브라우저에 기록하지 못했습니다. \n표지 이미지를 줄이거나 불필요한 도서를 삭제한 후 다시 시도해 주세요.");
    }
}

let mode = 'sheet';
let editingOrderId = null; 
let settlementChart = null; // 차트 인스턴스 저장용
let partnerCurrentPage = 1;
const partnerItemsPerPage = 5;

// ---------------------------------------------------------
// 1. 등급 관리 기능 (고정 등급 삭제 방어 로직 포함)
// ---------------------------------------------------------
function addGrade() {
    const name = document.getElementById('newGradeName').value.trim();
    if(!name) return alert("등급명을 입력하세요.");
    if(MASTER.grades.includes(name)) return alert("이미 존재하는 등급입니다.");
    
    MASTER.grades.push(name);
    // 신규등급의 단가를 그대로 복사
    MASTER.pricesByGrade[name] = JSON.parse(JSON.stringify(MASTER.pricesByGrade['신규등급']));
    
    document.getElementById('newGradeName').value = "";
    renderGradeTabs();
}

// 등급 삭제 기능 (표준 5단계는 삭제 불가)
function removeGrade(name, event) {
    event.stopPropagation(); // 탭 클릭 이벤트 방지
    if(DEFAULT_GRADES.includes(name)) {
        alert("표준 등급(신규/일반/우수/최우수/특수)은 삭제할 수 없습니다.");
        return;
    }
    if(!confirm(`[${name}] 등급을 삭제하시겠습니까?`)) return;
    
    MASTER.grades = MASTER.grades.filter(g => g !== name);
    if(MASTER.currentGrade === name) MASTER.currentGrade = '일반등급(표준)';
    renderGradeTabs();
    renderPrice();
}

function setGrade(name) {
    MASTER.currentGrade = name;
    
    // 인쇄소 협약단가 선택 시 등급 추가/출판사 검색 도구 숨김
    const tools = document.getElementById('price-tools');
    if (tools) {
        if (name === '인쇄소 협약단가') {
            tools.innerHTML = `
                <div class="flex items-center gap-2 text-emerald-700 font-bold text-sm px-4">
                    <i data-lucide="info" class="w-4 h-4"></i> 
                    인쇄소 협약단가는 모든 인쇄소에 공통 적용되는 매입 원가 기준입니다. (등급 무관)
                </div>
                <div class="ml-auto">
                    <button onclick="saveMasterData()" class="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-xs font-black shadow-sm flex items-center gap-1.5">
                        <i data-lucide="save" class="w-3.5 h-3.5"></i> [원가데이터저장]
                    </button>
                </div>
            `;
            lucide.createIcons();
        } else {
            // 기본 도구 메뉴 복구
            tools.innerHTML = `
                <div class="flex items-center gap-1">
                    <input type="text" id="newGradeName" placeholder="등급명 입력" class="input-pptx w-40">
                    <button onclick="addGrade()" class="bg-sky-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap">+ 등급추가</button>
                </div>
                <div class="w-px h-6 bg-slate-200"></div>
                <div class="flex items-center gap-1">
                    <input type="text" id="pubSearchInput" placeholder="출판사명 검색" class="input-pptx w-40">
                    <button onclick="searchPublisher()" class="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap">검색</button>
                </div>
                <div class="w-px h-6 bg-slate-200"></div>
                <button onclick="saveMasterData()" class="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-xs font-black shadow-sm flex items-center gap-1.5">
                    <i data-lucide="save" class="w-3.5 h-3.5"></i> [데이터저장]
                </button>
            `;
            lucide.createIcons();
        }
    }
    
    renderGradeTabs();
    renderPrice();
}

function renderGradeTabs() {
    const container = document.getElementById('grade-tabs-container');
    if (!container) return;
    
    let html = MASTER.grades.map(g => {
        const isDefault = DEFAULT_GRADES.includes(g);
        return `
        <div class="relative group">
            <button onclick="setGrade('${g}')" 
                class="px-6 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${MASTER.currentGrade === g ? 'bg-sky-600 text-white shadow-md' : 'text-slate-400 bg-white hover:bg-slate-50'}">
                ${g}
                ${!isDefault ? `<span onclick="removeGrade('${g}', event)" class="hover:text-red-500 opacity-50 hover:opacity-100"><i data-lucide="x" class="w-3 h-3"></i></span>` : ''}
            </button>
        </div>
        `;
    }).join('');

    // 인쇄소 협약단가 탭 추가
    html += `
        <div class="w-px h-6 bg-slate-200 mx-2 self-center"></div>
        <button onclick="setGrade('인쇄소 협약단가')" 
            class="px-6 py-2 rounded-lg font-black text-sm flex items-center gap-2 transition-all ${MASTER.currentGrade === '인쇄소 협약단가' ? 'bg-emerald-600 text-white shadow-md' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'}">
            <i data-lucide="factory" class="w-4 h-4"></i> 인쇄소 협약단가 (통합매입원가)
        </button>
    `;

    container.innerHTML = html;
    
    // 파트너사 관리 모듈의 등급 선택 드롭박스(select) 동적 업데이트
    const gradeSelect = document.getElementById('gradeSearch');
    if (gradeSelect) {
        const currentVal = gradeSelect.value;
        gradeSelect.innerHTML = MASTER.grades.map(g => `<option value="${g}">${g}</option>`).join('');
        if (currentVal) gradeSelect.value = currentVal;
    }

    lucide.createIcons();
}

// ---------------------------------------------------------
// 2. 출판사 검색 기능
// ---------------------------------------------------------
function searchPublisher() {
    const keyword = document.getElementById('pubSearchInput').value.trim();
    if(!keyword) return alert("출판사명을 입력하세요.");

    const partner = MASTER.partners.find(p => p.name.includes(keyword));
    if(partner) {
        setGrade(partner.grade);
        document.getElementById('order-pub-name').value = partner.name;
        alert(`[${partner.name}] 파트너사가 검색되었습니다. 지정된 [${partner.grade}]으로 단가가 자동 적용됩니다.`);
    } else {
        alert("검색된 파트너사가 없습니다. [파트너사 관리]에서 먼저 등록해주세요.");
    }
}

// ---------------------------------------------------------
// 3. 유동엔진 (로직 보존)
// ---------------------------------------------------------
function removeCustomGroup(groupName) {
    if(!confirm(`[${groupName}] 그룹을 삭제하시겠습니까?`)) return;
    delete MASTER[groupName];
    MASTER.customGroups = MASTER.customGroups.filter(g => g.name !== groupName);
    renderSpec();
    renderPrice();
    saveMasterDataSilent();
}

function addCustomGroup() {
    const input = document.getElementById('customGroupNameInput');
    const groupName = input.value.trim();
    if (!groupName) { alert("항목 명칭을 입력하세요."); return; }
    
    // Check for duplicates
    if (MASTER.customGroups.some(g => g.name === groupName) || MASTER[groupName]) {
        alert("이미 존재하는 항목 이름입니다."); return;
    }
    
    const type = document.querySelector('input[name="extraType"]:checked')?.value || 'book';
    const isVisibleEl = document.getElementById('customGroupVisibleInput');
    const isVisible = isVisibleEl ? isVisibleEl.checked : true;
    
    MASTER.customGroups.push({ name: groupName, type: type, isVisible: isVisible });
    MASTER[groupName] = [];
    input.value = "";
    if (isVisibleEl) isVisibleEl.checked = true;
    
    renderSpec();
    renderPrice();
    saveMasterDataSilent();
}

function syncCommonData(mode, groupTitle, key, value) {
    const priceData = MASTER.pricesByGrade[MASTER.currentGrade];
    const storageKey = groupTitle + "_" + key;
    if (mode === 'sheet') {
        priceData.sheetCommons[storageKey] = parseFloat(value) || 0;
    } else {
        priceData.rollCommons[storageKey] = parseFloat(value) || 0;
    }
    sync();
}

function syncData(type, id, field, value) {
    const priceData = MASTER.pricesByGrade[MASTER.currentGrade];
    const list = ['sheetSpecs', 'rollSpecs', 'commons'].includes(type) ? priceData[type] : MASTER[type];

    if (typeof list[0] === 'object') {
        const item = list.find(x => x.id === id);
        if (item) {
            if(field.includes('.')) { 
                const parts = field.split('.');
                if (parts.length === 3) {
                    item[parts[0]][parts[1]][parts[2]] = parseFloat(value) || 0;
                } else {
                   item[parts[0]][parts[1]] = parseFloat(value) || 0;
                }
            } else {
                item[field] = field === 'n' ? value : parseFloat(value) || 0;
            }
        }
    } else {
        list[id] = value;
    }
    sync(); 
}

function addItem(type) {
    const newId = Date.now();
    const priceData = MASTER.pricesByGrade[MASTER.currentGrade];
    
    if (type === 'sheetSpecs') priceData[type].push({id: newId, n: '새 규격', bw: 0, cl: 0, face: 0});
    else if (type === 'rollSpecs') {
        // Find existing rollSpec to copy IVS structure, or use default
        const ivs = priceData.rollSpecs.length > 0 ? JSON.parse(JSON.stringify(priceData.rollSpecs[0].ivs)) : [];
        priceData[type].push({id: newId, n: '새 규격', ivs: ivs});
    }
    else if (type === 'commons') priceData[type].push({id: newId, n: '새 항목', v: 0});
    else if (MASTER.customGroups.some(g => g.name === type)) MASTER[type].push('새 항목');
    else MASTER[type].push('새 항목');
    
    renderSpec();
    renderPrice();
    saveMasterDataSilent();
}

function removeItem(type, id) {
    if(!confirm("정말 삭제하시겠습니까?")) return;
    const priceData = MASTER.pricesByGrade[MASTER.currentGrade];
    const target = ['sheetSpecs', 'rollSpecs', 'commons'].includes(type) ? priceData : MASTER;

    if (typeof target[type][0] === 'object') {
        target[type] = target[type].filter(x => x.id !== id);
    } else {
        target[type].splice(id, 1);
    }
    renderSpec();
    renderPrice();
    saveMasterDataSilent();
}

function moveItem(type, id, direction) {
    const priceData = MASTER.pricesByGrade[MASTER.currentGrade];
    const list = ['sheetSpecs', 'rollSpecs', 'commons'].includes(type) ? priceData[type] : MASTER[type];
    
    let idx;
    if (typeof list[0] === 'object') {
        idx = list.findIndex(x => x.id == id);
    } else {
        idx = parseInt(id);
    }
    
    if (idx === -1 || isNaN(idx)) return;
    
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    
    // Swap
    [list[idx], list[targetIdx]] = [list[targetIdx], list[idx]];
    
    renderSpec();
    renderPrice();
    saveMasterDataSilent();
}

function renderSpec() {
    const draw = (cid, type) => {
        const container = document.getElementById(cid);
        if(!container) return;
        const priceData = MASTER.pricesByGrade[MASTER.currentGrade];
        const list = ['sheetSpecs', 'rollSpecs'].includes(type) ? priceData[type] : MASTER[type];
        
        container.innerHTML = list.map((it, idx) => {
            const isObj = typeof it === 'object';
            const val = isObj ? it.n : it;
            const id = isObj ? it.id : idx;
            return `
                <div class="flex gap-1 items-center bg-white p-1.5 rounded-lg border border-slate-200">
                    <input class="input-pptx border-none text-[12px] h-7" value="${val}" oninput="syncData('${type}', ${id}, '${isObj?'n':idx}', this.value)">
                    <div class="flex flex-col gap-0.5">
                        <button onclick="moveItem('${type}', '${id}', -1)" class="text-slate-300 hover:text-sky-500"><i data-lucide="chevron-up" class="w-2.5 h-2.5"></i></button>
                        <button onclick="moveItem('${type}', '${id}', 1)" class="text-slate-300 hover:text-sky-500"><i data-lucide="chevron-down" class="w-2.5 h-2.5"></i></button>
                    </div>
                    <button onclick="removeItem('${type}', ${id})" class="text-slate-300 hover:text-red-500 ml-1"><i data-lucide="x" class="w-3 h-3"></i></button>
                </div>`;
        }).join('');
    };

    ['sheetSpecs','rollSpecs','coverPapers','innerPapers','facePapers','coating','binding','wing','coverPrinting','innerPrinting','faceInsert'].forEach(t => draw('list-'+t, t));

    const customContainer = document.getElementById('custom-groups-container');
    if (customContainer) {
        customContainer.innerHTML = MASTER.customGroups.map(group => `
            <div class="card-common bg-slate-100 border-slate-200">
                <div class="section-title">
                    <span class="flex items-center gap-1">${group.name} <span class="${group.type==='page'?'text-emerald-500':(group.type==='sheet'?'text-amber-500':'text-sky-500')} text-[10px] font-normal">(${group.type==='page'?'Page당':(group.type==='sheet'?'장당':'권당')})</span></span>
                    <div class="ml-auto flex gap-2">
                        <button onclick="addItem('${group.name}')" class="text-[10px] text-slate-400 hover:text-slate-600">+ 추가</button>
                        <button onclick="removeCustomGroup('${group.name}')" class="text-[10px] text-red-300 hover:text-red-500">삭제</button>
                    </div>
                </div>
                <div id="list-${group.name}" class="space-y-1"></div>
            </div>
        `).join('');

        MASTER.customGroups.forEach(group => draw('list-' + group.name, group.name));
    }
    lucide.createIcons();
}

function renderPrice() {
    const priceData = MASTER.pricesByGrade[MASTER.currentGrade];
    const sheetGrid = document.getElementById('price-sheet-grid');
    if (sheetGrid) {
        sheetGrid.innerHTML = priceData.sheetSpecs.map(s => `
            <div class="price-card-slim">
                <div class="text-[11px] font-bold w-24 truncate text-slate-500">${s.n}</div>
                <div class="flex gap-3 items-center ml-auto">
                    <div class="flex items-center gap-1"><span class="text-[9px] text-slate-400">흑</span><input class="price-input-small" value="${s.bw}" oninput="syncData('sheetSpecs',${s.id},'bw',this.value)"></div>
                    <div class="flex items-center gap-1"><span class="text-[9px] text-sky-400">컬</span><input class="price-input-small text-sky-600" value="${s.cl}" oninput="syncData('sheetSpecs',${s.id},'cl',this.value)"></div>
                    <div class="flex items-center gap-1"><span class="text-[9px] text-emerald-400">면</span><input class="price-input-small text-emerald-600" value="${s.face}" oninput="syncData('sheetSpecs',${s.id},'face',this.value)"></div>
                </div>
                <button onclick="removeItem('sheetSpecs', ${s.id})" class="text-slate-300 ml-2"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
            </div>`).join('');
    }

    const renderCommonGrid = (containerId, mode) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        const targetMap = mode === 'sheet' ? priceData.sheetCommons : priceData.rollCommons;
        const groups = [
            { title: '표지인쇄', items: MASTER.coverPrinting },
            { title: '코팅방식', items: MASTER.coating },
            { title: '표지날개', items: MASTER.wing },
            { title: '제본방식', items: MASTER.binding },
            { title: '내지인쇄', items: MASTER.innerPrinting },
            ...MASTER.customGroups.map(g => ({ title: g.name, items: MASTER[g.name] || [] }))
        ];
        
        container.innerHTML = groups.map(g => `
            <div class="bg-white p-3 border rounded-xl flex flex-col gap-2">
                <div class="text-[11px] font-black text-sky-700 bg-sky-50 px-2 py-1 rounded-md w-fit">${g.title}</div>
                <div class="space-y-1.5">
                    ${g.items.map(item => `
                        <div class="flex items-center justify-between">
                            <span class="text-[11px] font-bold text-slate-600 truncate mr-1">${item}</span>
                            <div class="flex items-center gap-1 shrink-0">
                                <input class="price-input-small w-16 text-right font-bold text-emerald-600" value="${targetMap[g.title + '_' + item] || 0}" oninput="syncCommonData('${mode}', '${g.title}', '${item}', this.value)">
                                <span class="text-[9px] text-slate-400">원</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    };
    renderCommonGrid('price-sheet-common-grid', 'sheet');
    renderCommonGrid('price-roll-common-grid', 'roll');

    const rollContainers = document.getElementById('price-roll-containers');
    if (rollContainers) {
        rollContainers.innerHTML = priceData.rollSpecs.map(rs => `
            <div class="bg-white border rounded-2xl overflow-hidden">
                <div class="bg-slate-50 px-4 py-2 border-b flex justify-between items-center">
                    <span class="text-xs font-bold text-slate-700">${rs.n} 슬라이딩 단가 (${MASTER.currentGrade})</span>
                </div>
                <table class="w-full text-xs">
                    <thead><tr class="bg-slate-50/50"><th>시작부수</th><th>종료부수</th><th>흑백(P)</th><th>컬러(P)</th><th>날개O</th><th>날개X</th></tr></thead>
                    <tbody>
                        ${rs.ivs.map((iv, ix) => `
                        <tr class="border-t text-center hover:bg-slate-50/30">
                            <td class="py-2"><input class="w-12 text-center border-b outline-none" value="${iv.s}" oninput="syncData('rollSpecs',${rs.id},'ivs.${ix}.s',this.value)"></td>
                            <td><input class="w-12 text-center border-b outline-none" value="${iv.e}" oninput="syncData('rollSpecs',${rs.id},'ivs.${ix}.e',this.value)"></td>
                            <td><input class="w-12 text-right border-b outline-none" value="${iv.bw}" oninput="syncData('rollSpecs',${rs.id},'ivs.${ix}.bw',this.value)"></td>
                            <td><input class="w-12 text-right border-b outline-none text-amber-600 font-bold" value="${iv.cl}" oninput="syncData('rollSpecs',${rs.id},'ivs.${ix}.cl',this.value)"></td>
                            <td><input class="w-12 text-right border-b outline-none" value="${iv.wo}" oninput="syncData('rollSpecs',${rs.id},'ivs.${ix}.wo',this.value)"></td>
                            <td><input class="w-12 text-right border-b outline-none" value="${iv.wx}" oninput="syncData('rollSpecs',${rs.id},'ivs.${ix}.wx',this.value)"></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`).join('');
    }
    lucide.createIcons();
}


function showPage(p, isEdit = false) {
    // 파트너사 정보 수정 중(파일 선택 등) 페이지 이탈 방지
    if (currentBizFileData) {
        if (!confirm("수정사항(사업자등록증 등)이 저장되지 않았습니다. 이대로 페이지를 이동하시겠습니까?")) {
            return;
        }
        currentBizFileData = null; // 확인 후 이동 시 데이터 초기화
    }

    // 모든 콘텐츠 및 메뉴 활성 상태 초기화
    document.querySelectorAll('.page-content, .sidebar-item').forEach(el => el.classList.remove('active'));
    
    // 수정 모드 명시적 제어
    if (!isEdit) {
        editingOrderId = null;
    }

    // 페이지 제목 매핑
    const titles = {
        'spec': '제작 사양 관리',
        'price': '단가관리',
        'order': '주문하기',
        'settlement': '정산 및 주문관리',
        'partner': '파트너사관리',
        'printer-mgmt': '인쇄소관리',
        'store-mgmt': '판매 도서 관리',
        'production': '생산진행관리',
        'stock': '재고관리',
        'paper': '용지구매',
        'job': '구인구직'
    };

    // 제목 업데이트
    const titleEl = document.getElementById('main-title');
    if (titleEl && titles[p]) {
        titleEl.innerText = titles[p];
    }

    const pageEl = document.getElementById('page-' + p);
    const btnEl = document.getElementById('btn-' + p);
    
    if(pageEl) pageEl.classList.add('active'); 
    if(btnEl) btnEl.classList.add('active');
    
    const priceTools = document.getElementById('price-tools');
    if (priceTools) {
        priceTools.className = (p==='price') ? 'mb-4 flex items-center gap-4 bg-slate-50 p-2 rounded-xl border' : 'hidden';
    }
    
    if(p==='spec') renderSpec();
    if(p==='price') { renderGradeTabs(); renderPrice(); }
    if(p==='partner') {
        const role = (typeof currentUserRole !== 'undefined') ? currentUserRole : 'admin';
        const titleEl = document.getElementById('main-title');
        if (role === 'publisher') {
            const myPartner = MASTER.partners[0];
            titleEl.innerHTML = `<span class="text-sky-600">${myPartner.name}</span>님, 반갑습니다! <span class="text-slate-400 text-sm font-bold ml-2">(기본정보관리)</span>`;
            
            // 필수 정보 입력 유도 (임시)
            if (!myPartner.bizNum || !myPartner.addr) {
                setTimeout(() => {
                    alert("📢 원활한 주문과 정산을 위해 사업자 정보 및 담당자 정보를 먼저 완성해주세요.");
                }, 500);
            }
        } else {
            // 관리자 모드일 경우 초기 상태 보정 (모든 잠금 해제)
            document.getElementById('u_name').readOnly = false;
            document.getElementById('gradeSearch').disabled = false;
        }
        renderPartners();
    }
    if(p==='order') {
        renderOrder();
        // 버튼 문구 리셋 로직 추가: 수정 모드가 아니면 '제작', 수정 모드면 '수정'으로 표시
        const submitBtn = document.getElementById('btn-submit-order');
        if(submitBtn) {
            const prefix = editingOrderId ? '수정' : '제작';
            submitBtn.innerText = mode === 'sheet' ? `${prefix} 등록 완료(낱장)` : `${prefix} 등록 완료(연속지)`;
        }
        
        // 등록 도서 불러오기 옵션 렌더링
        const loadSelect = document.getElementById('ord-load-product');
        if (loadSelect) {
            loadSelect.innerHTML = `<option value="">도서를 선택하면 사양이 자동으로 입력됩니다.</option>` + 
                MASTER.products.map(p => `<option value="${p.id}">${p.title} (${p.spec} / ${p.pages}P)</option>`).join('');
        }
    }
    if(p==='store-mgmt') renderStoreMgmt();
    if(p==='production') renderProductionBoard();
    if(p==='printer-mgmt') {
        const role = (typeof currentUserRole !== 'undefined') ? currentUserRole : 'admin';
        const titleEl = document.getElementById('main-title');
        if (role === 'printer' || role === 'printer_worker') {
            const myPrinter = MASTER.printers[0];
            titleEl.innerHTML = `<span class="text-indigo-600">${myPrinter.name}</span>님, 반갑습니다! <span class="text-slate-400 text-sm font-bold ml-2">(인쇄소 정보관리)</span>`;
            if (role === 'printer_worker') {
                alert("작업자 계정은 정보관리 및 정산 메뉴 접근이 제한됩니다.");
                showPage('production');
                return;
            }
        }
        renderPrintersMgmt();
    }
    if(p==='settlement') {
        const role = (typeof currentUserRole !== 'undefined') ? currentUserRole : 'admin';
        if (role === 'printer_worker') {
            alert("정산 및 주문관리 메뉴에 대한 접근 권한이 없습니다.");
            showPage('production');
            return;
        }

        renderSettlementTable();
        if (document.getElementById('dashboard-section') && !document.getElementById('dashboard-section').classList.contains('hidden')) {
            updateChart();
        }
    }
    
    // 페이지 전환 시 권한 뱃지 업데이트
    renderRoleBadge(p);
}

function renderRoleBadge(p) {
    const container = document.getElementById('role-badge-container');
    if (!container) return;

    // 생산진행관리(production) 페이지에서만 뱃지 노출
    if (p !== 'production') {
        container.innerHTML = '';
        return;
    }

    const role = (typeof currentUserRole !== 'undefined') ? currentUserRole : 'admin';
    let badgeHtml = '';

    if (role === 'admin') {
        badgeHtml = `<span class="bg-slate-800 text-white px-3 py-1 rounded-full text-[10px] font-black tracking-tighter flex items-center gap-1 shadow-sm border border-slate-700">
            <i data-lucide="shield-check" class="w-3 h-3 text-sky-400"></i> 권한: 플랫폼 관리자
        </span>`;
    } else if (role === 'printer') {
        badgeHtml = `<span class="bg-emerald-600 text-white px-3 py-1 rounded-full text-[10px] font-black tracking-tighter flex items-center gap-1 shadow-sm border border-emerald-500">
            <i data-lucide="factory" class="w-3 h-3"></i> 권한: 인쇄소 마스터
        </span>`;
    } else if (role === 'publisher') {
        badgeHtml = `<span class="bg-sky-600 text-white px-3 py-1 rounded-full text-[10px] font-black tracking-tighter flex items-center gap-1 shadow-sm border border-sky-500">
            <i data-lucide="book-open" class="w-3 h-3"></i> 권한: 출판사(주문자)
        </span>`;
    }

    container.innerHTML = badgeHtml;
    if (window.lucide) lucide.createIcons();
}

function renderOrder() {
    const role = (typeof currentUserRole !== 'undefined') ? currentUserRole : 'admin';
    const pubSearchBtn = document.getElementById('btn-order-pub-search');
    const pubNameInput = document.getElementById('order-pub-name');

    // 역할에 따른 검색 버튼 노출 제어
    if (pubSearchBtn) {
        pubSearchBtn.style.display = (role === 'admin' || role === 'printer') ? 'block' : 'none';
    }

    // 출판사 모드일 때 자동 설정 (첫 번째 파트너 또는 고정값)
    if (role === 'publisher' && (pubNameInput.value === '테스트 출판사' || !pubNameInput.value)) {
        const myPartner = MASTER.partners[0]; // 실제 환경에서는 로그인된 세션 정보 사용
        if (myPartner) {
            pubNameInput.value = myPartner.name;
            setGrade(myPartner.grade);
        }
    }

    const priceData = MASTER.pricesByGrade[MASTER.currentGrade];
    const fill = (id, list) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = list.map(it => `<option value="${it.n||it}">${it.n||it}</option>`).join('');
        
        // Restore saved value if exists
        if (MASTER.orderPersistence && MASTER.orderPersistence[mode] && MASTER.orderPersistence[mode][id]) {
            el.value = MASTER.orderPersistence[mode][id];
        }
    };
    fill('ord-spec', mode==='sheet' ? priceData.sheetSpecs : priceData.rollSpecs);
    fill('ord-binding', MASTER.binding);
    fill('ord-cover', MASTER.coverPapers);
    fill('ord-coating', MASTER.coating);
    fill('ord-printing', MASTER.coverPrinting);
    fill('ord-wing', MASTER.wing);
    fill('ord-inner', MASTER.innerPapers);
    fill('ord-inner-print', MASTER.innerPrinting);
    fill('ord-face', MASTER.facePapers);
    fill('ord-face-insert', MASTER.faceInsert);
    
    // 동적 커스텀 그룹(추가설정) 드롭다운 렌더링
    const customContainer = document.getElementById('ord-custom-groups-container');
    const orderCustomSection = document.getElementById('order-custom-settings-section');
    if (customContainer && orderCustomSection) {
        const visibleGroups = MASTER.customGroups.filter(g => g.isVisible !== false);
        
        if (visibleGroups.length === 0) {
            orderCustomSection.style.display = 'none';
        } else {
            orderCustomSection.style.display = 'block';
            customContainer.innerHTML = visibleGroups.map(group => `
                <div>
                    <label class="text-[10px] font-bold text-slate-400 mb-1 block">${group.name}</label>
                    <select id="ord-custom-${group.name}" class="input-pptx bg-white" onchange="sync()">
                        <option value="">선택 안함</option>
                        ${(MASTER[group.name]||[]).map(item => `<option value="${item}">${item}</option>`).join('')}
                    </select>
                </div>
            `).join('');
            
            // Restore saved values
            visibleGroups.forEach(group => {
                const el = document.getElementById(`ord-custom-${group.name}`);
                if (el && MASTER.orderPersistence && MASTER.orderPersistence[mode] && MASTER.orderPersistence[mode][`ord-custom-${group.name}`]) {
                    el.value = MASTER.orderPersistence[mode][`ord-custom-${group.name}`];
                }
            });
        }
    }

    // 담당자 목록 동적 생성 (선택된 출판사 기준)
    const mgrSelect = document.getElementById('ord-manager');
    const partner = MASTER.partners.find(p => p.name === pubNameInput.value);
    if (mgrSelect) {
        if (partner && partner.managers) {
            mgrSelect.innerHTML = '<option value="">선택하세요</option>' + 
                partner.managers.map(m => `<option value="${m.name}">${m.name} (${m.dept})</option>`).join('');
        } else {
            mgrSelect.innerHTML = '<option value="">출판사를 먼저 검색하세요</option>';
        }
        
        if (MASTER.orderPersistence && MASTER.orderPersistence[mode] && MASTER.orderPersistence[mode]['ord-manager']) {
            mgrSelect.value = MASTER.orderPersistence[mode]['ord-manager'];
            updateManager(mgrSelect.value); // 연락처 및 이메일 정보 복구
        }
    }

    // Restore non-select inputs
    const inputsToRestore = ['ord-custom-size', 'ord-tp', 'ord-qty', 'ord-cp', 'ord-bp'];
    MASTER.customGroups.forEach(g => inputsToRestore.push(`ord-custom-${g.name}`));
    inputsToRestore.forEach(id => {
        const el = document.getElementById(id);
        if (el && MASTER.orderPersistence && MASTER.orderPersistence[mode] && MASTER.orderPersistence[mode][id] !== undefined) {
            el.value = MASTER.orderPersistence[mode][id];
        }
    });

    // 배송지 초기화 (수정 모드일 경우 기존 데이터 로드, 아니면 최초 1회 빈 줄)
    const container = document.getElementById('delivery-rows-container');
    if (container) {
        container.innerHTML = ''; // 초기화
        const currentOrder = editingOrderId ? MASTER.orders.find(o => o.id === editingOrderId) : null;
        if (currentOrder && currentOrder.deliveries && currentOrder.deliveries.length > 0) {
            currentOrder.deliveries.forEach(d => addDeliveryRow(d));
        } else {
            addDeliveryRow();
        }
    }
    
    sync();
}

// 출판사 검색 모달(심플) 열기
function openOrderPubSearch() {
    const names = MASTER.partners.map(p => p.name);
    const choice = prompt("검색할 출판사명을 입력하거나 아래 목록에서 확인하세요:\n\n" + names.join(", "));
    if (choice) {
        const partner = MASTER.partners.find(p => p.name.includes(choice));
        if (partner) {
            selectOrderPublisher(partner.name);
        } else {
            alert("해당 출판사를 찾을 수 없습니다. [파트너사관리]에서 먼저 등록해주세요.");
        }
    }
}

function selectOrderPublisher(name) {
    const partner = MASTER.partners.find(p => p.name === name);
    if (!partner) return;

    document.getElementById('order-pub-name').value = partner.name;
    
    // 해당 출판사의 등급으로 단가 즉시 변경
    setGrade(partner.grade);
    
    // 담당자 목록 및 전체 화면 갱신
    renderOrder(); 

    // 담당자가 1명뿐일 경우 자동 선택
    if (partner.managers && partner.managers.length === 1) {
        const mgrName = partner.managers[0].name;
        const mgrSelect = document.getElementById('ord-manager');
        if (mgrSelect) {
            mgrSelect.value = mgrName;
            updateManager(mgrName);
            // 데이터 영속성에도 즉시 반영
            if (!MASTER.orderPersistence[mode]) MASTER.orderPersistence[mode] = {};
            MASTER.orderPersistence[mode]['ord-manager'] = mgrName;
            saveMasterDataSilent();
        }
    }

    alert(`[${partner.name}] 출판사가 선택되었습니다. [${partner.grade}] 단가가 자동 적용됩니다.`);
}

function updateManager(name) {
    const pubName = document.getElementById('order-pub-name').value;
    const partner = MASTER.partners.find(p => p.name === pubName);
    const mgr = partner ? partner.managers.find(m => m.name === name) : null;
    
    const data = mgr || {tel: "", email: ""};
    const telInput = document.getElementById('ord-mgr-tel');
    const emailInput = document.getElementById('ord-mgr-email');
    if (telInput) telInput.value = data.tel || "";
    if (emailInput) emailInput.value = data.email || "";
}

function setMode(m) {
    mode = m;
    const ms = document.getElementById('ms');
    const mr = document.getElementById('mr');
    if (ms) ms.className = m==='sheet'?'flex-1 py-4 rounded-xl font-black bg-sky-600 text-white shadow-lg':'flex-1 py-4 rounded-xl font-black bg-slate-100 text-slate-400';
    if (mr) mr.className = m==='roll'?'flex-1 py-4 rounded-xl font-black bg-sky-600 text-white shadow-lg':'flex-1 py-4 rounded-xl font-black bg-slate-100 text-slate-400';
    
    // Toggle Face Paper views
    const sheetFace = document.getElementById('ord-face-sheet-view');
    const rollFace = document.getElementById('ord-face-roll-view');
    if(sheetFace) sheetFace.className = m==='sheet' ? 'space-y-4' : 'hidden';
    if(rollFace) rollFace.className = m==='roll' ? 'space-y-1 text-[11px] font-bold leading-relaxed text-emerald-800 italic' : 'hidden';

    // Update Submit Button Text (수정 모드 여부에 따라 문구 변경)
    const submitBtn = document.getElementById('btn-submit-order');
    if(submitBtn) {
        const prefix = editingOrderId ? '수정' : '제작';
        submitBtn.innerText = m === 'sheet' ? `${prefix} 등록 완료(낱장)` : `${prefix} 등록 완료(연속지)`;
    }

    renderOrder();
}

function calculatePages() {
    const tpInput = document.getElementById('ord-tp');
    const cpInput = document.getElementById('ord-cp');
    const bpInput = document.getElementById('ord-bp');
    const innerPrint = document.getElementById('ord-inner-print')?.value || '';
    
    const tp = parseInt(tpInput.value) || 0;
    
    // 내지 인쇄 방식에 따라 cp 자동 설정 (부분컬러 모드일 때는 사용자 입력 허용)
    if (!innerPrint.includes('부분컬러')) {
        if (innerPrint.includes('컬러')) {
            cpInput.value = tp;
        } else if (innerPrint.includes('흑백')) {
            cpInput.value = 0;
        }
    }
    
    const cp = parseInt(cpInput.value) || 0;
    let bp = tp - cp;
    if (bp < 0) bp = 0;
    bpInput.value = bp;
}

function sync() {
    const priceData = MASTER.pricesByGrade[MASTER.currentGrade];
    const qty = parseInt(document.getElementById('ord-qty')?.value) || 0;
    const tp = parseInt(document.getElementById('ord-tp')?.value) || 0;
    const cp = parseInt(document.getElementById('ord-cp')?.value) || 0;
    const bp = parseInt(document.getElementById('ord-bp')?.value) || 0;
    const specName = document.getElementById('ord-spec')?.value || '';
    
    let each = 0;
    const findCommon = (n) => (priceData.commons.find(c => c.n.includes(n)) || {v:0}).v;

    const innerPrint = document.getElementById('ord-inner-print')?.value || '';
    const isSingleSided = innerPrint.includes('단면');
    const physicalSheets = isSingleSided ? tp : (tp / 2);

    if(mode === 'sheet') {
        const spec = priceData.sheetSpecs.find(s => s.n === specName);
        if(spec) {
            let currentSpec = spec;
            if (specName.includes('사용자규격') || specName.includes('변형')) {
                const customSize = document.getElementById('ord-custom-size')?.value || '';
                const [w] = customSize.split(/x|\*/i).map(Number);
                if (w && !isNaN(w)) {
                    if (w <= 148) {
                        currentSpec = priceData.sheetSpecs.find(s => s.n.includes('A5국판')) || spec;
                    } else if (w <= 176) {
                        currentSpec = priceData.sheetSpecs.find(s => s.n.includes('크라운판')) || spec;
                    } else {
                        currentSpec = priceData.sheetSpecs.find(s => s.n.includes('국배판')) || spec;
                    }
                }
            }

            // 1-2, 1-4, 1-5: 페이지 단가 (규격별 흑백/컬러 적용)
            let innerPrintCost = (bp * currentSpec.bw) + (cp * currentSpec.cl);
            if (isSingleSided) {
                innerPrintCost = innerPrintCost / 2;
                each += (tp / 2) * findCommon('단면할증');
            }
            each += innerPrintCost;

            // 1-9: 내지 용지 할증 (100g, 120g 대상) - 물리적인 종이 수량 추적
            const innerPaper = document.getElementById('ord-inner')?.value || '';
            if (innerPaper.includes('100g')) {
                each += physicalSheets * findCommon('100g용지할증');
            } else if (innerPaper.includes('120g')) {
                each += physicalSheets * findCommon('120g용지할증');
            }

            // [하이브리드 개편] 기존 5대 공통 그룹 합산
            const groupMap = {
                'ord-printing': '표지인쇄',
                'ord-coating': '코팅방식',
                'ord-wing': '표지날개',
                'ord-binding': '제본방식',
                'ord-inner-print': '내지인쇄'
            };
            const commonFields = ['ord-printing', 'ord-coating', 'ord-wing', 'ord-binding', 'ord-inner-print'];
            commonFields.forEach(id => {
                const val = document.getElementById(id)?.value;
                const groupTitle = groupMap[id];
                const storageKey = groupTitle + "_" + val;
                if (val && val !== '선택 안함' && priceData.sheetCommons[storageKey] !== undefined) {
                    each += priceData.sheetCommons[storageKey];
                }
            });

            // [하이브리드 개편] 커스텀 카테고리 합산
            MASTER.customGroups.forEach(group => {
                const val = document.getElementById(`ord-custom-${group.name}`)?.value;
                const storageKey = group.name + "_" + val;
                if (val && val !== '선택 안함' && priceData.sheetCommons[storageKey] !== undefined) {
                    let cost = priceData.sheetCommons[storageKey];
                    if (group.type === 'page') cost = cost * tp;
                    else if (group.type === 'sheet') cost = cost * (tp / 2);
                    each += cost;
                }
            });

            // 1-10: 면지 설정
            const facePaper = document.getElementById('ord-face')?.value;
            const faceInsert = document.getElementById('ord-face-insert')?.value;

            // 수정요청: 면지용지 없음 선택 시 할증 없음, 용지 선택 시 면지 단가 적용
            if (facePaper && facePaper !== '없음' && faceInsert && faceInsert !== '없음') {
                let multiplier = 0;
                if (faceInsert.includes('4P')) multiplier = 4;
                else if (faceInsert.includes('8P')) multiplier = 8;
                
                each += (currentSpec.face || 0) * multiplier;
            }
        }
    } else {
        // 디지털 연속지 인쇄 로직 (브라켓 방식 유지)
        const spec = priceData.rollSpecs.find(r => r.n === specName);
        if(spec) {
            let bracket = spec.ivs.find(v => qty >= v.s && qty <= v.e) || spec.ivs[spec.ivs.length-1];
            
            if (specName.includes('사용자규격') || specName.includes('변형')) {
                const customSize = document.getElementById('ord-custom-size')?.value || '';
                const [w] = customSize.split(/x|\*/i).map(Number);
                if (w && !isNaN(w)) {
                    let fallbackSpec;
                    if (w <= 152) {
                        fallbackSpec = priceData.rollSpecs.find(s => s.n.includes('신국판')) || spec;
                    } else {
                        fallbackSpec = priceData.rollSpecs.find(s => s.n.includes('크라운판')) || spec;
                    }
                    if (fallbackSpec && fallbackSpec.ivs) {
                        bracket = fallbackSpec.ivs.find(v => qty >= v.s && qty <= v.e) || fallbackSpec.ivs[fallbackSpec.ivs.length-1];
                    }
                }
            }

            // 2. 내지 관련 비용 (페이지 단가 + 용지 할증)
            let innerPrintCost = (bp * bracket.bw) + (cp * bracket.cl);
            if (isSingleSided) {
                innerPrintCost = innerPrintCost / 2;
                each += (tp / 2) * findCommon('단면할증');
            }
            each += innerPrintCost;

            // 내지 용지 할증 (100g, 120g 대상) - 물리적인 종이 수량 추적
            const innerPaper = document.getElementById('ord-inner')?.value || '';
            if (innerPaper.includes('100g')) {
                each += physicalSheets * findCommon('100g용지할증');
            } else if (innerPaper.includes('120g')) {
                each += physicalSheets * findCommon('120g용지할증');
            }
            
            // 1. 표지 관련 비용 (날개 유무에 따른 연속지 슬라이딩 단가 유지 - Hybrid)
            const wingVal = document.getElementById('ord-wing')?.value;
            let coverCost = (wingVal === '날개 있음') ? bracket.wo : bracket.wx;
            each += coverCost;

            // [하이브리드 개편] 기존 5대 공통 그룹 합산 (디지털 연속지)
            const groupMap = {
                'ord-printing': '표지인쇄',
                'ord-coating': '코팅방식',
                'ord-wing': '표지날개',
                'ord-binding': '제본방식',
                'ord-inner-print': '내지인쇄'
            };
            const commonFields = ['ord-printing', 'ord-coating', 'ord-wing', 'ord-binding', 'ord-inner-print'];
            commonFields.forEach(id => {
                const val = document.getElementById(id)?.value;
                const groupTitle = groupMap[id];
                const storageKey = groupTitle + "_" + val;
                if (val && val !== '선택 안함' && priceData.rollCommons[storageKey] !== undefined) {
                    each += priceData.rollCommons[storageKey];
                }
            });

            // [하이브리드 개편] 커스텀 카테고리 합산 (디지털 연속지)
            MASTER.customGroups.forEach(group => {
                const val = document.getElementById(`ord-custom-${group.name}`)?.value;
                const storageKey = group.name + "_" + val;
                if (val && val !== '선택 안함' && priceData.rollCommons[storageKey] !== undefined) {
                    let cost = priceData.rollCommons[storageKey];
                    if (group.type === 'page') cost = cost * tp;
                    else if (group.type === 'sheet') cost = cost * (tp / 2);
                    each += cost;
                }
            });
        }
    }

    // 데이터 영속성 저장
    if (!MASTER.orderPersistence) MASTER.orderPersistence = { sheet: {}, roll: {} };
    if (!MASTER.orderPersistence[mode]) MASTER.orderPersistence[mode] = {};

    const ids = [
        'order-pub-name', 'ord-manager',
        'ord-spec', 'ord-custom-size', 'ord-tp', 'ord-qty', 'ord-cp', 'ord-bp',
        'ord-cover', 'ord-printing', 'ord-coating', 'ord-wing', 'ord-binding',
        'ord-inner', 'ord-inner-print', 'ord-face', 'ord-face-insert'
    ];
    MASTER.customGroups.forEach(g => ids.push(`ord-custom-${g.name}`));
    
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) MASTER.orderPersistence[mode][id] = el.value;
    });
    saveMasterDataSilent();

    const rEach = document.getElementById('r-each');
    const rTotal = document.getElementById('r-total');
    if (rEach) rEach.innerText = Math.round(each).toLocaleString();
    if (rTotal) rTotal.innerText = Math.round(each * qty).toLocaleString();
}

function renderProductionBoard() {
    const board = document.getElementById('kanban-board');
    if (!board) return;

    const columns = [
        { id: '접수대기', title: '접수대기', color: 'slate' },
        { id: '인쇄/가공중', title: '인쇄/가공중', color: 'sky' },
        { id: '포장대기', title: '포장대기', color: 'amber' },
        { id: '출고완료', title: '출고완료', color: 'emerald' },
        { id: '작업보류', title: '작업보류', color: 'rose' }
    ];

    board.innerHTML = columns.map(col => `
        <div class="flex-shrink-0 w-[300px] kb-col-${col.color} rounded-2xl p-4 flex flex-col h-full border border-slate-200 shadow-sm">
            <div class="flex items-center justify-between mb-4 px-1">
                <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full bg-${col.color}-500 shadow-sm"></div>
                    <span class="font-black kb-header-${col.color} text-sm">${col.title}</span>
                </div>
                <span class="text-[10px] font-bold text-slate-500 bg-white/80 px-2.5 py-1 rounded-full border border-slate-200/50">
                    ${MASTER.orders.filter(o => (o.status || '접수대기') === col.id && !o.isDeleted).length}
                </span>
            </div>
            <div class="flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar" id="col-${col.id}"></div>
        </div>
    `).join('');

    MASTER.orders.filter(o => !o.isDeleted).forEach(order => {
        if (!order.status) order.status = '접수대기';
        
        const colContainer = document.getElementById(`col-${order.status}`);
        if (!colContainer) return;

        const card = document.createElement('div');
        card.className = "bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all group";
        
        const role = (typeof currentUserRole !== 'undefined') ? currentUserRole : 'admin';
        
        // 카드 하단 액션 버튼
        let actionHtml = '';
        if (role === 'admin' || role === 'printer' || role === 'printer_worker') {
            if (order.status === '접수대기') {
                actionHtml = `<button class="k-btn k-btn-primary flex-1" onclick="changeProdStatus('${order.id}', '인쇄/가공중')">인쇄시작</button>
                              <button class="k-btn k-btn-outline" onclick="changeProdStatus('${order.id}', '작업보류')">보류</button>`;
            } else if (order.status === '인쇄/가공중') {
                actionHtml = `<button class="k-btn k-btn-primary flex-1" onclick="changeProdStatus('${order.id}', '포장대기')">가공완료</button>`;
            } else if (order.status === '포장대기') {
                actionHtml = `<button class="k-btn k-btn-primary flex-1" onclick="promptTracking('${order.id}')">송장입력/배송</button>`;
            } else if (order.status === '작업보류') {
                actionHtml = `
                    <button class="k-btn k-btn-outline flex-1" onclick="changeProdStatus('${order.id}', '접수대기')">대기복귀</button>
                    ${role === 'admin' || role === 'printer' ? `
                    <button class="bg-rose-50 text-rose-600 p-2 rounded-lg hover:bg-rose-100 transition-all border border-rose-100 flex items-center justify-center gap-1 text-xs font-bold" onclick="trashOrder('${order.id}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        완전삭제
                    </button>` : ''}`;
            }
        }

        const customSize = order.data['ord-custom-size'];
        const isCustomSize = customSize && (order.data['ord-spec']?.includes('사용자규격') || order.data['ord-spec']?.includes('변형'));
        const customBadgeHtml = isCustomSize ? `<div class="mt-1"><span class="bg-rose-50 text-rose-600 px-2 py-0.5 rounded text-[10px] font-black border border-rose-200">직접입력: ${customSize}</span></div>` : '';

        card.innerHTML = `
            <div class="flex justify-between items-start mb-2 cursor-pointer" onclick="openOrderDetails('${order.id}')">
                <div class="text-[10px] font-black text-slate-400">ID: ${order.id.slice(-6)}</div>
                <div class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-50 text-slate-500 border border-slate-100">${order.mode==='sheet'?'낱장':'연속지'}</div>
            </div>
            <div class="font-black text-slate-800 text-sm mb-1 leading-tight line-clamp-2 cursor-pointer" onclick="openOrderDetails('${order.id}')">${order.bookTitle}</div>
            ${customBadgeHtml}
            <div class="text-[11px] font-bold text-slate-500 ${order.status === '출고완료' ? 'mb-1' : 'mb-3'}">${order.pubName} / ${order.qty}부</div>
            ${order.status === '출고완료' && order.deliveries ? `
                <div class="space-y-1 mb-3">
                    ${order.deliveries.map(d => `
                        <div class="bg-emerald-50 text-emerald-700 text-[9px] font-black p-2 rounded-lg border border-emerald-100 flex flex-col gap-0.5 shadow-sm">
                            <div class="flex justify-between">
                                <span><i data-lucide="user" class="w-2.5 h-2.5 inline mr-1"></i>${d.recipient} (${d.qty}부)</span>
                                <span class="text-[8px] opacity-70">${(d.address || '').slice(0,12)}...</span>
                            </div>
                            <div class="flex items-center gap-1.5 border-t border-emerald-100 pt-1 mt-1">
                                <i data-lucide="truck" class="w-3 h-3"></i>
                                <span class="truncate">송장: ${d.trackingList && d.trackingList.length > 0 ? d.trackingList.map(t => t.code).join(', ') : (d.trackingNum || '미입력')}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>` : ''}
            
            <div class="flex gap-2">
                ${actionHtml}
            </div>
        `;
        colContainer.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
}

function changeProdStatus(id, newStatus) {
    const order = MASTER.orders.find(o => o.id === id);
    if (!order) return;
    order.status = newStatus;
    saveMasterDataSilent();
    renderProductionBoard();
}

function promptTracking(id) {
    const order = MASTER.orders.find(o => o.id === id);
    if (!order) return;

    const overlay = document.getElementById('tracking-modal-overlay');
    const container = document.getElementById('tracking-input-container');
    if (!overlay || !container) {
        // Fallback to simple prompt if modal doesn't exist yet (though we should add it to HTML)
        const num = prompt("송장번호를 입력해주세요:");
        if (num) {
            order.trackingNum = num; // Legacy fallback
            order.status = '출고완료';
            saveMasterDataSilent();
            renderProductionBoard();
        }
        return;
    }

    // 모달 상단 텍스트 초기화 (재활용 대응)
    const mainTitle = document.getElementById('tracking-modal-main-title');
    const modalLabel = document.getElementById('tracking-modal-label');
    if (mainTitle) mainTitle.innerText = "배송지별 송장 번호 입력";
    if (modalLabel) {
        modalLabel.innerText = "LOGISTICS MANAGEMENT";
        modalLabel.className = "text-[10px] font-bold text-emerald-600 mb-1 uppercase tracking-widest";
    }

    document.getElementById('tracking-modal-order-id').innerText = order.id.slice(-6);
    document.getElementById('tracking-modal-book-title').innerText = order.bookTitle;
    
    const role = (typeof currentUserRole !== 'undefined') ? currentUserRole : 'admin';
    const saveBtn = document.getElementById('btn-save-tracking');
    if (role === 'printer') {
        saveBtn.innerText = "출고 처리 완료";
        saveBtn.className = "flex-1 bg-emerald-600 text-white py-3 rounded-xl font-black text-sm shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all";
        saveBtn.onclick = () => saveTrackingNumbers(id);
        saveBtn.style.display = 'block';
    } else {
        saveBtn.style.display = 'none';
    }

    container.innerHTML = (order.deliveries || []).map((d, idx) => `
        <div class="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div class="flex justify-between items-start pb-3 border-b border-slate-50">
                <div>
                    <div class="text-xs font-black text-slate-800">${d.recipient} (${d.qty}부)</div>
                    <div class="text-[10px] text-slate-400 mt-0.5">${d.address} ${d.addressDetail || ''}</div>
                </div>
                ${role === 'printer' ? `<button onclick="addTrackingRow(${idx})" class="bg-sky-50 text-sky-600 px-3 py-1 rounded-lg text-[10px] font-black hover:bg-sky-100 transition-all">+ 송장추가</button>` : ''}
            </div>
            <div id="tracking-rows-${idx}" class="space-y-2">
                ${((d.trackingList && d.trackingList.length > 0) ? d.trackingList : [{courier: 'CJ대한통운', code: d.trackingNum || ''}]).map((t, tIdx) => renderTrackingRow(idx, tIdx, t)).join('')}
            </div>
        </div>
    `).join('');

    overlay.classList.remove('hidden');
    lucide.createIcons();
}

function renderTrackingRow(dIdx, tIdx, data) {
    const role = (typeof currentUserRole !== 'undefined') ? currentUserRole : 'admin';
    const isPrinter = role === 'printer';

    return `
        <div class="flex gap-2 items-center tracking-row-item" data-didx="${dIdx}">
            <select class="t-courier input-pptx py-1.5 text-[11px] w-24" ${!isPrinter ? 'disabled' : ''}>
                <option value="CJ대한통운" ${data.courier==='CJ대한통운'?'selected':''}>CJ대한통운</option>
                <option value="로젠택배" ${data.courier==='로젠택배'?'selected':''}>로젠택배</option>
                <option value="한진택배" ${data.courier==='한진택배'?'selected':''}>한진택배</option>
                <option value="롯데택배" ${data.courier==='롯데택배'?'selected':''}>롯데택배</option>
                <option value="우체국택배" ${data.courier==='우체국택배'?'selected':''}>우체국택배</option>
                <option value="경동택배" ${data.courier==='경동택배'?'selected':''}>경동택배</option>
                <option value="직접배송" ${data.courier==='직접배송'?'selected':''}>직접배송</option>
            </select>
            <input type="text" class="t-code input-pptx py-1.5 text-[11px] flex-1" value="${data.code || ''}" placeholder="송장번호" ${!isPrinter ? 'readonly' : ''}>
            <input type="number" class="t-box input-pptx py-1.5 text-[11px] w-16" value="${data.box || ''}" placeholder="박스수" ${!isPrinter ? 'readonly' : ''}>
            <input type="number" class="t-cost input-pptx py-1.5 text-[11px] w-24" value="${data.cost || ''}" placeholder="배송비(원)" ${!isPrinter ? 'readonly' : ''}>
            ${isPrinter ? `<button onclick="this.closest('.tracking-row-item').remove()" class="text-slate-300 hover:text-red-400"><i data-lucide="x" class="w-4 h-4"></i></button>` : ''}
        </div>
    `;
}

function addTrackingRow(dIdx) {
    const container = document.getElementById(`tracking-rows-${dIdx}`);
    if (!container) return;
    const div = document.createElement('div');
    div.innerHTML = renderTrackingRow(dIdx, Date.now(), {courier: 'CJ대한통운', code: ''});
    container.appendChild(div.firstElementChild);
    lucide.createIcons();
}

function saveTrackingNumbers(id) {
    const order = MASTER.orders.find(o => o.id === id);
    if (!order) return;

    let totalShippingCost = 0;

    (order.deliveries || []).forEach((d, idx) => {
        const rows = document.querySelectorAll(`.tracking-row-item[data-didx="${idx}"]`);
        d.trackingList = Array.from(rows).map(row => {
            const costVal = row.querySelector('.t-cost').value;
            const cost = costVal ? parseInt(costVal) : 0;
            totalShippingCost += cost;
            return {
                courier: row.querySelector('.t-courier').value,
                code: row.querySelector('.t-code').value.trim(),
                box: row.querySelector('.t-box').value.trim(),
                cost: cost
            };
        }).filter(t => t.code !== '' || t.cost > 0 || t.box !== '');
        
        // 하위 호환성을 위해 첫 번째 송장번호 저장
        d.trackingNum = d.trackingList.length > 0 ? d.trackingList[0].code : '';
    });

    order.shippingCost = totalShippingCost;
    order.finalTotalPrice = parseInt(order.totalPrice.replace(/[^0-9]/g, '')) + totalShippingCost;

    order.status = '출고완료';
    saveMasterDataSilent();
    closeTrackingModal();
    renderProductionBoard();
    alert("배송 정보 및 배송비가 저장되었습니다.");
}

function closeTrackingModal() {
    const overlay = document.getElementById('tracking-modal-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function trashOrder(id) {
    if (!confirm("이 주문을 목록에서 영구적으로 삭제(휴지통)하시겠습니까?")) return;
    const order = MASTER.orders.find(o => o.id === id);
    if (order) {
        order.isDeleted = true;
        saveMasterDataSilent();
        renderProductionBoard();
    }
}

// 상세 정보 패널 열기
function openOrderDetails(id) {
    const order = MASTER.orders.find(o => o.id === id);
    if (!order) return;

    const role = typeof currentUserRole !== 'undefined' ? currentUserRole : 'admin';

    const overlay = document.getElementById('order-details-overlay');
    const panel = document.getElementById('order-details-panel');
    
    const customSize = order.data['ord-custom-size'];
    const isCustomSize = customSize && (order.data['ord-spec']?.includes('사용자규격') || order.data['ord-spec']?.includes('변형'));
    
    let specHtml = renderSpecDetailItem('규격', order.data['ord-spec']);
    if (isCustomSize) {
        specHtml = renderSpecDetailItem('규격', `${order.data['ord-spec']} <span class="text-rose-600 ml-1">[직접입력: ${customSize}]</span>`);
    }

    // 패널 내용 구성
    panel.innerHTML = `
        <!-- Print Header (Hidden on screen) -->
        <div class="hidden print:block mb-8 border-b-2 border-black pb-4 px-6 pt-6">
            <h2 class="text-2xl font-black text-black">작업지시서 (Job Ticket)</h2>
            <div class="text-sm mt-2 text-black">출력일시: ${new Date().toLocaleString()}</div>
        </div>

        <div class="p-6 border-b border-slate-200 flex justify-between items-center bg-white print:hidden">
            <div>
                <div class="text-[10px] font-bold text-sky-600 mb-1">ORDER DETAILS</div>
                <h3 class="text-lg font-black text-slate-800">주문 상세 명세</h3>
            </div>
            <button onclick="closeOrderDetails()" class="p-2 hover:bg-slate-100 rounded-full transition-all">
                <i data-lucide="x" class="w-5 h-5 text-slate-400"></i>
            </button>
        </div>
        
        <div class="flex-1 overflow-y-auto p-6 space-y-8 bg-white print:p-6 print:overflow-visible">
            <!-- 기본 정보 -->
            <div class="space-y-4">
                <div class="flex justify-between items-center border-b border-slate-200 pb-3 print:border-black">
                    <span class="badge ${order.mode==='sheet'?'badge-blue':'badge-outline'} print:border-black print:text-black print:bg-white">${order.mode==='sheet'?'디지털 낱장':'디지털 연속지'}</span>
                    <span class="text-[11px] font-bold text-slate-400 print:text-black">${order.date}</span>
                </div>
                <div class="text-2xl font-black text-slate-900 leading-tight print:text-black">${order.bookTitle}</div>
                <div class="p-5 bg-white rounded-xl border border-slate-200 print:border-black print:rounded-none">
                    <div class="flex justify-between mb-2"><span class="text-xs text-slate-500 font-bold print:text-black">출판사</span><span class="text-sm font-black text-slate-800 print:text-black">${order.pubName}</span></div>
                    <div class="flex justify-between mb-2"><span class="text-xs text-slate-500 font-bold print:text-black">담당자</span><span class="text-sm font-black text-slate-800 print:text-black">${order.managerName}</span></div>
                    <div class="flex justify-between pt-3 mt-1 border-t border-slate-100 print:border-black"><span class="text-xs text-slate-500 font-bold print:text-black">제작부수</span><span class="text-base font-black text-sky-700 print:text-black">${parseInt(order.qty).toLocaleString()}부</span></div>
                </div>
            </div>

            <!-- 제작 사양 요약 -->
            <div>
                <div class="text-[12px] font-black text-slate-800 mb-3 flex items-center gap-2 print:text-black"><i data-lucide="settings-2" class="w-4 h-4 print:hidden"></i>제작 사양 요약</div>
                <div class="grid grid-cols-1 gap-0 border-t border-slate-200 print:border-black">
                    ${specHtml}
                    ${renderSpecDetailItem('페이지', `총 ${order.data['ord-tp']}P (컬러 ${order.data['ord-cp']}P / 흑백 ${order.data['ord-bp']}P)`)}
                    ${renderSpecDetailItem('표지용지', order.data['ord-cover'])}
                    ${renderSpecDetailItem('표지인쇄', order.data['ord-printing'])}
                    ${renderSpecDetailItem('코팅/날개', `${order.data['ord-coating']} / ${order.data['ord-wing']}`)}
                    ${renderSpecDetailItem('제본방식', order.data['ord-binding'])}
                    ${renderSpecDetailItem('내지용지', order.data['ord-inner'])}
                    ${renderSpecDetailItem('내지인쇄', order.data['ord-inner-print'])}
                    ${order.mode === 'sheet' ? renderSpecDetailItem('면지정보', `${order.data['ord-face']} (${order.data['ord-face-insert']})`) : ''}
                </div>
                ${isCustomSize ? `<div class="mt-4 p-4 bg-white border border-rose-200 rounded-xl text-rose-700 text-xs font-black flex items-center gap-2 print:border-black print:text-black print:rounded-none"><i data-lucide="alert-triangle" class="w-4 h-4 print:hidden"></i> *주의: 사용자규격(변형) 재단 작업입니다.</div>` : ''}
            </div>

            <!-- 배송 정보 -->
            <div>
                <div class="text-[12px] font-black text-slate-800 mb-3 flex items-center gap-2 print:text-black"><i data-lucide="truck" class="w-4 h-4 print:hidden"></i>배송 및 송장 정보</div>
                <div class="space-y-3">
                    ${(order.deliveries || []).map(d => `
                        <div class="p-4 bg-white rounded-xl border border-slate-200 text-xs print:border-black print:rounded-none">
                            <div class="flex justify-between mb-2 border-b border-slate-100 pb-2 print:border-black">
                                <div class="font-black text-slate-800 text-sm print:text-black">${d.recipient} (${d.qty}부)</div>
                                <div class="text-slate-500 font-bold print:text-black">${d.contact}</div>
                            </div>
                            <div class="text-slate-600 print:text-black leading-relaxed">${d.address} ${d.addressDetail || ''}</div>
                            <div class="mt-3 space-y-2">
                                ${d.trackingList && d.trackingList.length > 0 ? d.trackingList.map(t => `
                                    <div class="bg-slate-50 px-3 py-2 rounded border border-slate-100 flex justify-between items-center print:bg-white print:border-black">
                                        <span class="text-[10px] font-bold text-slate-500 print:text-black">${t.courier}</span>
                                        <span class="font-black text-slate-700 print:text-black">${t.code}</span>
                                    </div>
                                `).join('') : (d.trackingNum ? `
                                    <div class="bg-slate-50 px-3 py-2 rounded border border-slate-100 flex justify-between items-center print:bg-white print:border-black">
                                        <span class="text-[10px] font-bold text-slate-500 print:text-black">송장번호</span>
                                        <span class="font-black text-slate-700 print:text-black">${d.trackingNum}</span>
                                    </div>
                                ` : '<div class="text-[10px] text-slate-400 italic print:text-black">송장 미입력</div>')}
                            </div>
                        </div>
                    `).join('')}
                    ${(!order.deliveries || order.deliveries.length === 0) ? '<div class="text-xs text-slate-400 italic p-4 bg-white rounded-xl border border-dashed border-slate-300 print:border-black print:rounded-none print:text-black">배송 정보가 없습니다.</div>' : ''}
                </div>
            </div>

            <!-- 금액 정보 -->
            ${role === 'printer_worker' ? `
                <div class="p-6 bg-white rounded-xl text-slate-500 border border-slate-200 text-center print:hidden">
                    <div class="text-sm font-bold mb-1 flex items-center justify-center gap-2"><i data-lucide="lock" class="w-4 h-4"></i> 접근 권한 제한</div>
                    <div class="text-[11px]">작업자 계정은 금액 정보를 확인할 수 없습니다.</div>
                </div>
            ` : `
                <div class="p-6 bg-sky-50 rounded-xl text-sky-900 border border-sky-200 shadow-sm print:bg-white print:border-black print:rounded-none print:shadow-none">
                    <div class="flex justify-between items-center mb-4 border-b border-sky-200 pb-4 print:border-black">
                        <span class="text-xs font-bold text-sky-700 print:text-black">권당 제작 단가</span>
                        <span class="text-lg font-black text-sky-800 print:text-black">₩ ${order.unitPrice}원</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-bold print:text-black">총 주문 합계</span>
                        <span class="text-2xl font-black text-sky-700 print:text-black">₩ ${order.totalPrice}원</span>
                    </div>
                    <div class="text-[10px] text-sky-600 font-bold text-right mt-2 print:text-black">* VAT 별도</div>
                </div>
            `}

            <!-- 작업 파일 관리 (다운로드 및 출력) -->
            <div class="mt-8 pt-6 border-t border-slate-200 space-y-4 print:hidden">
                <div class="text-[12px] font-black text-slate-800 mb-3 flex items-center gap-2"><i data-lucide="file-down" class="w-4 h-4"></i>인쇄용 데이터 및 지시서</div>
                <div class="grid grid-cols-2 gap-3">
                    <button onclick="downloadOrderFile('${order.id}', '내지')" 
                        class="flex items-center justify-center gap-2 py-3.5 rounded-xl border ${order.innerFile ? 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-300 pointer-events-none'} transition-all text-xs font-bold">
                        <i data-lucide="download" class="w-4 h-4"></i> 내지 다운로드
                    </button>
                    <button onclick="downloadOrderFile('${order.id}', '표지')" 
                        class="flex items-center justify-center gap-2 py-3.5 rounded-xl border ${order.coverFile ? 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-300 pointer-events-none'} transition-all text-xs font-bold">
                        <i data-lucide="download" class="w-4 h-4"></i> 표지 다운로드
                    </button>
                </div>
                <button onclick="window.print()" 
                    class="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-slate-800 text-white hover:bg-slate-900 transition-all text-xs font-black shadow-lg">
                    <i data-lucide="printer" class="w-4 h-4"></i> 작업지시서(PDF) 출력
                </button>
            </div>
        </div>

        <div class="p-6 border-t border-slate-200 bg-white flex gap-3 print:hidden">
            ${order.status === '대기' && (role === 'admin' || role === 'publisher') ? `
                <button onclick="deleteOrder('${order.id}')" class="flex-1 bg-white border border-rose-200 py-3.5 rounded-xl font-bold text-rose-600 text-sm hover:bg-rose-50 transition-all shadow-sm">주문 취소</button>
            ` : ''}
            <button onclick="closeOrderDetails()" class="flex-1 bg-slate-100 border border-slate-200 py-3.5 rounded-xl font-black text-slate-700 text-sm hover:bg-slate-200 transition-all shadow-sm">닫기</button>
        </div>
    `;

    overlay.classList.remove('hidden');
    setTimeout(() => {
        panel.classList.remove('translate-x-full');
    }, 10);
    lucide.createIcons();
}

function closeOrderDetails() {
    const overlay = document.getElementById('order-details-overlay');
    const panel = document.getElementById('order-details-panel');
    if (!overlay || !panel) return;

    panel.classList.add('translate-x-full');
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 300);
}

function renderSpecDetailItem(label, value) {
    return `
        <div class="flex justify-between py-2.5 border-b border-slate-100 text-xs print:border-black print:py-1.5">
            <span class="text-slate-500 font-bold print:text-black">${label}</span>
            <span class="text-slate-800 font-black print:text-black">${value || '-'}</span>
        </div>
    `;
}

function renderCancelButton(order) {
    const role = (typeof currentUserRole !== 'undefined') ? currentUserRole : 'admin';
    if (order.status === '접수대기') {
        return `<button onclick="cancelOrderPublisher('${order.id}')" class="flex-1 bg-rose-600 text-white py-3 rounded-xl font-black text-sm shadow-lg shadow-rose-100">작업 직접 취소</button>`;
    } else if (order.status === '인쇄/가공중' || order.status === '포장대기') {
        return `<button onclick="requestCancelOrder('${order.id}')" class="flex-1 bg-amber-500 text-white py-3 rounded-xl font-black text-sm shadow-lg shadow-amber-100">취소 요청</button>`;
    }
    return '';
}

function closeOrderDetails() {
    const overlay = document.getElementById('order-details-overlay');
    const panel = document.getElementById('order-details-panel');
    overlay.classList.add('hidden');
    panel.classList.add('translate-x-full');
}

function cancelOrderPublisher(id) {
    if (!confirm("인쇄 작업 전입니다. 주문을 즉시 취소하시겠습니까?")) return;
    const order = MASTER.orders.find(o => o.id === id);
    order.status = '작업보류';
    saveMasterDataSilent();
    closeOrderDetails();
    renderProductionBoard();
    renderSettlementTable();
}

function requestCancelOrder(id) {
    alert("이미 작업이 진행 중입니다. 관리자에게 취소 요청 알림을 보냈습니다. (작업 보류 상태로 대기)");
    const order = MASTER.orders.find(o => o.id === id);
    order.status = '작업보류';
    saveMasterDataSilent();
    closeOrderDetails();
    renderProductionBoard();
}

function downloadOrderFile(id, type) {
    alert(`주문번호 [${id}]의 [${type}] 인쇄용 파일 다운로드를 시작합니다.`);
}

let deliveryIdx = 0;
function addDeliveryRow(data = null) {
    deliveryIdx++;
    const container = document.getElementById('delivery-rows-container');
    if (!container) return;
    
    const row = document.createElement('div');
    row.id = `delivery-row-${deliveryIdx}`;
    row.className = 'delivery-row bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3 relative';
    row.innerHTML = `
        <div class="grid grid-cols-2 gap-3">
            <div><label class="text-[10px] font-bold text-slate-400 mb-1 block">수령인</label><input type="text" class="input-pptx d-recipient" placeholder="이름" value="${data ? data.recipient : ''}"></div>
            <div><label class="text-[10px] font-bold text-slate-400 mb-1 block">연락처</label><input type="text" class="input-pptx d-contact" placeholder="010-0000" value="${data ? data.contact : ''}"></div>
        </div>
        <div>
            <label class="text-[10px] font-bold text-slate-400 mb-1 block">배송지 주소 (기본)</label>
            <div class="flex gap-1">
                <input type="text" id="ord-address-${deliveryIdx}" class="input-pptx d-address flex-1 bg-white" placeholder="주소 검색" readonly value="${data ? data.address : ''}">
                <button onclick="execDaumPostcode(${deliveryIdx})" class="bg-slate-800 text-white px-3 py-2 rounded-xl text-[10px] font-bold shrink-0">검색</button>
            </div>
        </div>
        <div class="grid grid-cols-4 gap-3 items-end">
            <div class="col-span-3">
                <label class="text-[10px] font-bold text-slate-400 mb-1 block">상세 주소</label>
                <input type="text" id="ord-address-detail-${deliveryIdx}" class="input-pptx d-address-detail w-full bg-white" placeholder="나머지 상세 주소 입력" value="${data ? (data.addressDetail || '') : ''}">
            </div>
            <div class="col-span-1">
                <label class="text-[10px] font-bold text-slate-400 mb-1 block">수량</label>
                <div class="flex gap-1 items-center">
                    <input type="number" class="input-pptx d-qty" placeholder="부수" value="${data ? data.qty : ''}">
                    ${container.children.length > 0 ? `<button onclick="removeDeliveryRow(${deliveryIdx})" class="text-red-300 hover:text-red-500 transition-colors p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '<div class="w-6"></div>'}
                </div>
            </div>
        </div>
    `;
    container.appendChild(row);
    if (window.lucide) lucide.createIcons();
}

function removeDeliveryRow(id) {
    const row = document.getElementById(`delivery-row-${id}`);
    if (row) row.remove();
}

function execDaumPostcode(idx) {
    if (typeof daum === 'undefined') {
        return alert("주소 서비스 스크립트가 로드되지 않았습니다. 인터넷 연결을 확인해 주세요.");
    }
    new daum.Postcode({
        oncomplete: function(data) {
            let addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
            let extraAddr = '';
            if(data.userSelectedType === 'R'){
                if(data.bname !== '' && /[동|로|가]$/g.test(data.bname)) extraAddr += data.bname;
                if(data.buildingName !== '' && data.apartment === 'Y') extraAddr += (extraAddr !== '' ? ', ' + data.buildingName : data.buildingName);
                if(extraAddr !== '') extraAddr = ' (' + extraAddr + ')';
            }
            const target = document.getElementById(`ord-address-${idx}`);
            if(target) target.value = addr + extraAddr;
            
            // 상세주소 입력창으로 포커스 이동
            const detailTarget = document.getElementById(`ord-address-detail-${idx}`);
            if(detailTarget) detailTarget.focus();
        }
    }).open();
}

function submitOrderSheet() {
    // 1. 데이터 수집
    const today = new Date().toISOString().split('T')[0];
    const pubName = document.getElementById('order-pub-name')?.value || '테스트 출판사';
    const bookTitle = document.getElementById('ord-book-title')?.value || '제목 없음';
    const managerName = document.getElementById('ord-manager')?.value;
    
    if (!managerName || managerName === '선택하세요' || managerName === '') {
        alert("담당자를 선택해주세요. 파트너사 등록 시 등록된 담당자가 리스트에 나타납니다.");
        return;
    }
    
    const unitPrice = document.getElementById('r-each')?.innerText || '0';
    const qty = document.getElementById('ord-qty')?.value || '0';
    const totalPrice = document.getElementById('r-total')?.innerText || '0';
    
    const isEdit = !!editingOrderId;
    const orderId = isEdit ? editingOrderId : 'ORDER_' + Date.now();
    
    // 배송 정보 수집
    const deliveryRows = document.querySelectorAll('.delivery-row');
    const deliveries = Array.from(deliveryRows).map(row => ({
        recipient: row.querySelector('.d-recipient').value,
        contact: row.querySelector('.d-contact').value,
        address: row.querySelector('.d-address').value,
        addressDetail: row.querySelector('.d-address-detail').value,
        qty: row.querySelector('.d-qty').value,
        trackingList: [] // 다중 송장 구조로 초기화
    }));

    // 주문 상세 데이터 스냅샷 저장
    const orderData = {
        id: orderId,
        date: isEdit ? MASTER.orders.find(o => o.id === editingOrderId).date : today,
        mode: mode,
        pubName: pubName,
        bookTitle: bookTitle,
        managerName: managerName,
        unitPrice: unitPrice,
        qty: qty,
        totalPrice: totalPrice,
        deliveries: deliveries,
        innerFile: currentFiles.inner,
        coverFile: currentFiles.cover,
        data: JSON.parse(JSON.stringify(MASTER.orderPersistence[mode]))
    };

    if (isEdit) {
        const idx = MASTER.orders.findIndex(o => o.id === editingOrderId);
        if (idx !== -1) MASTER.orders[idx] = orderData;
        editingOrderId = null; // 수정 완료 후 초기화
    } else {
        MASTER.orders.unshift(orderData); // 새 주문은 맨 앞으로
    }
    
    // 데이터 저장 및 테이블 갱신
    saveMasterDataSilent();
    renderSettlementTable();
    updateSettlementStats();
    
    alert(isEdit ? "주문 수정이 완료되었습니다." : "제작 등록 신청이 완료되었습니다.");
    
    // 파일 상태 초기화
    currentFiles = { inner: null, cover: null };
    resetFileUI();
    
    showPage('settlement');
}

let currentFiles = { inner: null, cover: null };

function handleFileSelect(type, input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        currentFiles[type] = {
            name: file.name,
            time: new Date().toLocaleString()
        };
        const area = document.getElementById(`file-${type}-area`);
        const status = document.getElementById(`${type}-file-status`);
        if (area && status) {
            area.classList.remove('bg-slate-50');
            area.classList.add('bg-emerald-50', 'border-emerald-200');
            status.textContent = `파일이 준비되었습니다: ${file.name}`;
            status.classList.remove('text-slate-400');
            status.classList.add('text-emerald-600', 'font-bold');
        }
    }
}

function resetFileUI() {
    ['inner', 'cover'].forEach(type => {
        const area = document.getElementById(`file-${type}-area`);
        const status = document.getElementById(`${type}-file-status`);
        const input = document.getElementById(`${type}-file-input`);
        if (area && status) {
            area.classList.remove('bg-emerald-50', 'border-emerald-200');
            area.classList.add('bg-slate-50');
            status.textContent = `선택된 파일 없음`;
            status.classList.add('text-slate-400');
            status.classList.remove('text-emerald-600', 'font-bold');
        }
        if (input) input.value = '';
    });
}

function downloadOrderFile(orderId, type) {
    const order = MASTER.orders.find(o => o.id === orderId);
    if (!order) return;
    
    const file = type === '내지' ? order.innerFile : order.coverFile;
    if (!file) {
        alert("첨부된 파일이 없습니다.");
        return;
    }
    
    alert(`[가상 다운로드 실행]\n구분: ${type} 데이터\n파일명: ${file.name}\n업로드 시간: ${file.time}\n\n* 실제 서버 구현 시 해당 파일의 URL로 연결됩니다.`);
}

let settlementCurrentPage = 1;
const settlementItemsPerPage = 10;

function getFilteredOrders() {
    const startDate = document.getElementById('search-start-date')?.value;
    const endDate = document.getElementById('search-end-date')?.value;
    const pubSearch = document.getElementById('filter-publisher-name')?.value.toLowerCase() || "";
    const managerSearch = document.getElementById('filter-manager-name')?.value.toLowerCase() || "";

    return MASTER.orders.filter(o => {
        if (startDate && o.date < startDate) return false;
        if (endDate && o.date > endDate) return false;
        if (pubSearch && !o.pubName.toLowerCase().includes(pubSearch)) return false;
        if (managerSearch && !o.managerName.toLowerCase().includes(managerSearch)) return false;
        return true;
    });
}

function renderSettlementTable() {
    const tableBody = document.getElementById('settlement-data-rows');
    if (!tableBody) return;

    // 조건에 맞는 주문 필터링
    const filtered = getFilteredOrders();
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / settlementItemsPerPage);

    // 현재 페이지 범위 계산
    if (settlementCurrentPage > totalPages && totalPages > 0) settlementCurrentPage = totalPages;
    const start = (settlementCurrentPage - 1) * settlementItemsPerPage;
    const end = start + settlementItemsPerPage;
    const pageItems = filtered.slice(start, end);

    tableBody.innerHTML = pageItems.map(o => {
        const isSheet = (o.mode === 'sheet');
        const badgeClass = isSheet ? 'badge badge-blue' : 'badge badge-outline';
        const badgeText = isSheet ? '디지털 낱장' : '디지털 연속지';
        const finalizedBadge = o.isFinalized ? '<span class="badge" style="background:#f1f5f9; color:#94a3b8; border:1px solid #e2e8f0;">🔒 정산확정</span>' : '';

        return `
            <tr class="data-row ${o.isFinalized ? 'opacity-70' : ''}">
                <td class="td-style">${o.date}</td>
                <td class="td-style font-bold">${o.pubName}</td>
                <td class="td-style">
                    <div class="flex items-center gap-2">
                        <span class="${badgeClass}">${badgeText}</span>
                        ${finalizedBadge}
                    </div>
                    <div class="book-title">${o.bookTitle}</div>
                </td>
                <td class="td-style">${o.managerName}</td>
                <td class="td-style text-right">${o.unitPrice}원</td>
                <td class="td-style text-right">${o.qty}부</td>
                <td class="td-style text-right">${o.totalPrice}원</td>
                <td class="td-style text-right text-emerald-600">${o.shippingCost ? o.shippingCost.toLocaleString() + '원' : '-'}</td>
                <td class="td-style text-right font-black text-sky-600">${o.finalTotalPrice ? o.finalTotalPrice.toLocaleString() + '원' : o.totalPrice + '원'}</td>
                <td class="td-style text-center">
                    <div class="btn-group">
                        <button onclick="editOrder('${o.id}')" class="btn-table" ${o.isFinalized ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>수정</button>
                        <button onclick="downloadExcel('${o.id}')" class="btn-table btn-excel">발주서</button>
                        <button onclick="deleteOrder('${o.id}')" class="btn-table btn-delete" ${o.isFinalized ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>삭제</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    updateSettlementStats(filtered);
    renderSettlementPagination(totalItems);
}

function renderSettlementPagination(totalItems) {
    const container = document.getElementById('settlement-pagination');
    if (!container) return;

    const totalPages = Math.ceil(totalItems / settlementItemsPerPage);
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = `<button class="pg-btn" onclick="changeSettlementPage(${settlementCurrentPage - 1})" ${settlementCurrentPage === 1 ? 'disabled' : ''}>&lt;</button>`;
    
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="pg-btn ${i === settlementCurrentPage ? 'active' : ''}" onclick="changeSettlementPage(${i})">${i}</button>`;
    }

    html += `<button class="pg-btn" onclick="changeSettlementPage(${settlementCurrentPage + 1})" ${settlementCurrentPage === totalPages ? 'disabled' : ''}>&gt;</button>`;
    
    container.innerHTML = html;
}

function changeSettlementPage(p) {
    settlementCurrentPage = p;
    renderSettlementTable();
}

// 정산 관리 통계 실시간 업데이트 함수
function updateSettlementStats(filteredOrders) {
    // 인자가 없으면 현재 테이블의 가시적 데이터를 기반으로 처리 (기존 호환성 유지)
    const orders = filteredOrders || MASTER.orders;
    
    let totalCount = orders.length;
    let totalQty = orders.reduce((sum, o) => sum + (parseInt(o.qty.replace(/[^0-9]/g, '')) || 0), 0);
    let totalAmount = orders.reduce((sum, o) => {
        const finalPrice = o.finalTotalPrice !== undefined ? o.finalTotalPrice : (parseInt(o.totalPrice.replace(/[^0-9]/g, '')) || 0);
        return sum + finalPrice;
    }, 0);

    const countEl = document.getElementById('stat-count');
    const qtyEl = document.getElementById('stat-qty');
    const totalEl = document.getElementById('stat-total');

    if (countEl) countEl.innerText = totalCount.toLocaleString();
    if (qtyEl) qtyEl.innerText = totalQty.toLocaleString();
    if (totalEl) totalEl.innerText = totalAmount.toLocaleString();

    // 역할에 따른 대시보드 카드 동적 렌더링
    renderRoleDashboard(totalCount, totalQty, totalAmount, orders);

    // 대시보드 섹션이 열려있는 경우 차트 실시간 연동
    const dashSection = document.getElementById('dashboard-section');
    if (dashSection && !dashSection.classList.contains('hidden')) {
        const activeTab = document.querySelector('.chart-tab-btn.active');
        const currentRange = activeTab ? activeTab.id.replace('btn-chart-', '') : 'week';
        updateChart(currentRange);
    }
}

function renderRoleDashboard(count, qty, sales, filteredOrders) {
    const container = document.getElementById('dash-summary-cards');
    if (!container) return;

    const role = (typeof currentUserRole !== 'undefined') ? currentUserRole : 'admin';
    const ordersToCalculate = filteredOrders || MASTER.orders;
    let html = '';

    if (role === 'admin') {
        const purchase = computeTotalPurchase(ordersToCalculate);
        const margin = sales - purchase;
        const marginRate = sales > 0 ? ((margin / sales) * 100).toFixed(1) : 0;
        
        // 목표 매출 달성률 (사용자 설정 목표값 사용)
        const monthlyGoal = MASTER.monthlyGoal || 50000000;
        const achievementRate = Math.min(((sales / monthlyGoal) * 100), 100).toFixed(1);

        html = `
            <div class="summary-card">
                <span class="summary-label">조회 건수</span>
                <div class="summary-value">${count.toLocaleString()}<small>건</small></div>
            </div>
            <div class="summary-card">
                <span class="summary-label text-blue">총 매출액 (출판사 청구액)</span>
                <div class="summary-value text-blue">${sales.toLocaleString()}<small>원</small></div>
            </div>
            <div class="summary-card">
                <span class="summary-label text-amber">총 매입액 (인쇄소 정산액)</span>
                <div class="summary-value text-amber">${purchase.toLocaleString()}<small>원</small></div>
            </div>
            <div class="summary-card highlight">
                <span class="summary-label">영업이익 / 수익률</span>
                <div class="summary-value">${margin.toLocaleString()}<small>원 (${marginRate}%)</small></div>
            </div>
            <div class="summary-card">
                <span class="summary-label">목표 달성률 (월 ${ (monthlyGoal / 10000).toLocaleString() }만 기준)</span>
                <div class="summary-value text-emerald">${achievementRate}<small>%</small></div>
                <div class="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div class="bg-emerald-500 h-full" style="width: ${achievementRate}%"></div>
                </div>
            </div>
        `;
    } else if (role === 'publisher') {
        html = `
            <div class="summary-card">
                <span class="summary-label">조회 건수</span>
                <div class="summary-value">${count.toLocaleString()}<small>건</small></div>
            </div>
            <div class="summary-card">
                <span class="summary-label">총 제작부수</span>
                <div class="summary-value">${qty.toLocaleString()}<small>부</small></div>
            </div>
            <div class="summary-card highlight">
                <span class="summary-label">총 제작 지출액 (VAT 별도)</span>
                <div class="summary-value">${sales.toLocaleString()}<small>원</small></div>
            </div>
        `;
    } else if (role === 'printer') {
        const purchase = computeTotalPurchase(ordersToCalculate);
        html = `
            <div class="summary-card">
                <span class="summary-label">조회 건수</span>
                <div class="summary-value">${count.toLocaleString()}<small>건</small></div>
            </div>
            <div class="summary-card">
                <span class="summary-label">총 작업부수</span>
                <div class="summary-value">${qty.toLocaleString()}<small>부</small></div>
            </div>
            <div class="summary-card highlight">
                <span class="summary-label">총 하청 매출액 (정산예정액)</span>
                <div class="summary-value">${purchase.toLocaleString()}<small>원</small></div>
            </div>
        `;
    }

    container.innerHTML = html;
    container.style.gridTemplateColumns = `repeat(${role === 'admin' ? 5 : 3}, 1fr)`;
}

function computeTotalPurchase(orders) {
    return orders.reduce((sum, o) => sum + (computePurchaseCost(o) || 0), 0);
}

function computePurchaseCost(order) {
    const costData = MASTER.pricesByGrade['인쇄소 협약단가'];
    if (!costData || !order.data) return 0;

    const qty = parseInt(order.qty) || 0;
    const tp = parseInt(order.data['ord-tp']) || 0;
    const cp = parseInt(order.data['ord-cp']) || 0;
    const bp = tp - cp;
    const specName = order.data['ord-spec'];

    let cost = 0;
    const findCommonCost = (n) => (costData.commons.find(c => c.n.includes(n)) || {v:0}).v;

    if (order.mode === 'sheet') {
        const spec = costData.sheetSpecs.find(s => s.n === specName);
        if (spec) {
            cost = (bp * spec.bw) + (cp * spec.cl);
            const innerPaper = order.data['ord-inner'] || '';
            if (innerPaper.includes('100g')) cost += tp * findCommonCost('100g용지할증');
            else if (innerPaper.includes('120g')) cost += tp * findCommonCost('120g용지할증');

            let coverCost = (order.data['ord-wing'] === '날개 있음') ? findCommonCost('표지날개있음') : findCommonCost('표지날개없음');
            const printVal = order.data['ord-printing'];
            if (printVal) {
                const foundSurcharge = costData.commons.find(c => c.n.includes('표지' + printVal));
                if (foundSurcharge) coverCost += foundSurcharge.v;
            }
            cost += coverCost;

            const facePaper = order.data['ord-face'];
            const faceInsert = order.data['ord-face-insert'];
            if (facePaper && facePaper !== '없음' && faceInsert && faceInsert !== '없음') {
                let mult = faceInsert.includes('4P') ? 4 : (faceInsert.includes('8P') ? 8 : 0);
                cost += (spec.face || 0) * mult;
            }
        }
    } else {
        const spec = costData.rollSpecs.find(r => r.n === specName);
        if (spec) {
            const bracket = spec.ivs.find(v => qty >= v.s && qty <= v.e) || spec.ivs[spec.ivs.length-1];
            cost = (bp * bracket.bw) + (cp * bracket.cl);
            const innerPaper = order.data['ord-inner'] || '';
            if (innerPaper.includes('100g')) cost += tp * findCommonCost('100g용지할증');
            else if (innerPaper.includes('120g')) cost += tp * findCommonCost('120g용지할증');

            let coverCost = (order.data['ord-wing'] === '날개 있음') ? bracket.wo : bracket.wx;
            const printVal = order.data['ord-printing'];
            if (printVal) {
                const foundSurcharge = costData.commons.find(c => c.n.includes('표지' + printVal));
                if (foundSurcharge) coverCost += foundSurcharge.v;
            }
            cost += coverCost;
        }
    }
    return cost * qty;
}

// ---------------------------------------------------------
// 대시보드 및 차트 로직
// ---------------------------------------------------------
function toggleDashboard() {
    const section = document.getElementById('dashboard-section');
    const text = document.getElementById('dash-toggle-text');
    if (section.classList.contains('hidden')) {
        section.classList.remove('hidden');
        text.innerText = '닫기';
        updateChart('week'); // 기본 일주일 보기
    } else {
        section.classList.add('hidden');
        text.innerText = '보기';
    }
    if (window.lucide) lucide.createIcons();
}

function updateChart(range = 'week') {
    document.querySelectorAll('.chart-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-chart-' + range).classList.add('active');

    const ctx = document.getElementById('settlementChart').getContext('2d');
    const filteredOrders = getFilteredOrders();
    const role = (typeof currentUserRole !== 'undefined') ? currentUserRole : 'admin';
    
    const labels = [];
    const salesData = [];
    const purchaseData = [];
    const now = new Date();

    const getPoints = (dateStr) => {
        const dayOrders = filteredOrders.filter(o => o.date === dateStr);
        const sales = dayOrders.reduce((sum, o) => sum + parseInt(o.totalPrice.replace(/,/g, '')), 0);
        const purchase = dayOrders.reduce((sum, o) => sum + (computePurchaseCost(o) || 0), 0);
        return { sales, purchase };
    };

    const getMonthPoints = (monthStr) => {
        const monthOrders = filteredOrders.filter(o => o.date.startsWith(monthStr));
        const sales = monthOrders.reduce((sum, o) => sum + parseInt(o.totalPrice.replace(/,/g, '')), 0);
        const purchase = monthOrders.reduce((sum, o) => sum + (computePurchaseCost(o) || 0), 0);
        return { sales, purchase };
    };

    if (range === 'week') {
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(now.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            labels.push(dateStr.slice(5));
            const p = getPoints(dateStr);
            salesData.push(p.sales);
            purchaseData.push(p.purchase);
        }
    } else if (range === 'month') {
        for (let i = 29; i >= 0; i -= 3) {
            const d = new Date(); d.setDate(now.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            labels.push(dateStr.slice(5));
            const p = getPoints(dateStr);
            salesData.push(p.sales);
            purchaseData.push(p.purchase);
        }
    } else { // year
        for (let i = 11; i >= 0; i--) {
            const d = new Date(); d.setMonth(now.getMonth() - i);
            const monthStr = d.toISOString().slice(0, 7);
            labels.push(monthStr);
            const p = getMonthPoints(monthStr);
            salesData.push(p.sales);
            purchaseData.push(p.purchase);
        }
    }

    if (settlementChart) settlementChart.destroy();

    const datasets = [];
    if (role === 'admin' || role === 'publisher') {
        datasets.push({
            label: role === 'admin' ? '매출액(출판사청구)' : '제작비용',
            data: salesData,
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.1)',
            borderWidth: 3, fill: true, tension: 0.4, pointRadius: 4
        });
    }
    if (role === 'admin' || role === 'printer') {
        datasets.push({
            label: role === 'admin' ? '매입액(인쇄소정산)' : '정산예정액(수입)',
            data: purchaseData,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderWidth: 3, fill: role === 'admin' ? false : true, tension: 0.4, pointRadius: 4
        });
    }

    settlementChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true, position: 'top', labels: { font: { size: 10, weight: 'bold' } } } },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString() + '원', font: { size: 10 } }, grid: { color: '#f1f5f9' } },
                x: { ticks: { font: { size: 10 } }, grid: { display: false } }
            }
        }
    });
}
let currentUserRole = 'admin'; // 'admin', 'printer', 'publisher' 중 설정 가능

// 역할 전환 및 사이드바 가시성 제어 로직
function switchRole(newRole) {
    currentUserRole = newRole;
    applyRoleVisibility();
    
    // 현재 활성화된 페이지가 있으면 해당 페이지의 역할 관련 UI 갱신
    const activePageId = document.querySelector('.page-content.active')?.id?.replace('page-', '');
    if (activePageId) {
        showPage(activePageId);
    }

    // 출판사 모드로 전환 시, 첫 번째 파트너(또는 로그인된 파트너) 자동 로드
    if (newRole === 'publisher') {
        const myPartner = MASTER.partners[0]; // 실무에선 로그인 ID 매칭
        if (myPartner) selectPartner(myPartner.id);
    }
}

function applyRoleVisibility() {
    const role = currentUserRole;
    
    // 1. 사이드바 메뉴 노출 매핑
    const menuVisibility = {
        admin: ['btn-spec', 'btn-price', 'btn-order', 'btn-settlement', 'btn-partner', 'btn-printer-mgmt', 'btn-store-mgmt', 'btn-production'],
        publisher: ['btn-order', 'btn-settlement', 'btn-partner', 'btn-store-mgmt', 'btn-production'],
        printer: ['btn-production', 'btn-settlement', 'btn-printer-mgmt'],
        printer_worker: ['btn-production'] // 작업자는 생산진행만 가능
    };

    const allMenus = ['btn-spec', 'btn-price', 'btn-order', 'btn-settlement', 'btn-partner', 'btn-printer-mgmt', 'btn-store-mgmt', 'btn-production'];
    const allowed = menuVisibility[role] || allMenus;

    // 2. 사이드바 엘리먼트 노출 제어 및 명칭 치환
    allMenus.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = allowed.includes(id) ? 'flex' : 'none';
            
            if (id === 'btn-partner') {
                if (role === 'publisher') {
                    const myPartner = MASTER.partners[0];
                    el.innerHTML = `<i data-lucide="user-cog" class="w-4 h-4 mr-3"></i>${myPartner ? myPartner.name : '출판사'} 정보관리`;
                } else {
                    el.innerHTML = `<i data-lucide="users" class="w-4 h-4 mr-3"></i>파트너사관리`;
                }
            }
            if (id === 'btn-printer-mgmt') {
                if (role === 'printer' || role === 'printer_worker') {
                    const myPrinter = MASTER.printers[0];
                    el.innerHTML = `<i data-lucide="printer" class="w-4 h-4 mr-3"></i>${myPrinter ? myPrinter.name : '인쇄소'} 정보관리`;
                } else {
                    el.innerHTML = `<i data-lucide="printer" class="w-4 h-4 mr-3"></i>인쇄소관리`;
                }
            }
        }
    });

    if (window.lucide) lucide.createIcons();

    // 3. 헤더 테스트 버튼 스타일 업데이트
    ['admin', 'publisher', 'printer', 'printer-worker'].forEach(r => {
        const btn = document.getElementById('role-btn-' + r);
        if (btn) {
            if ((r === 'printer-worker' && role === 'printer_worker') || r === role) {
                btn.className = 'px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-800 text-white shadow-md';
            } else {
                btn.className = 'px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-white hover:text-slate-800 transition-all';
            }
        }
    });

    // 4. 현재 페이지 접근 권한 체크
    const activeSidebarItem = document.querySelector('.sidebar-item.active');
    if (activeSidebarItem && activeSidebarItem.style.display === 'none') {
        const firstVisibleMenuId = allowed[0];
        showPage(firstVisibleMenuId.replace('btn-', ''));
    }

    // 5. 관리자 전용 기능 제어
    const goalBtn = document.getElementById('btn-set-goal');
    if (goalBtn) {
        goalBtn.style.display = (role === 'admin') ? 'inline-flex' : 'none';
    }
    
    const adminFilter = document.getElementById('admin-only-filter');
    if (adminFilter) {
        adminFilter.style.display = (role === 'admin') ? 'block' : 'none';
    }
}

function liveFilterTable() {
    renderSettlementTable();
}

function loadSettlementData() {
    renderSettlementTable();
}

function editOrder(id) {
    const order = MASTER.orders.find(o => o.id === id);
    if (!order) return;
    
    if (order.isFinalized) {
        alert("이미 정산 마감된 주문은 수정할 수 없습니다.");
        return;
    }

    if(confirm('해당 주문 사양을 수정하시겠습니까? 주문하기 페이지로 이동합니다.')) {
        mode = order.mode;
        // 해당 모드의 영속성 데이터를 주문 데이터로 덮어쓰기
        MASTER.orderPersistence[mode] = JSON.parse(JSON.stringify(order.data));
        
        // --- 새로 추가되는 복원 로직 ---
        // 1. 출판사 찾기 및 강제 지정
        const partner = MASTER.partners.find(p => p.name === order.pubName);
        if (partner) {
            document.getElementById('order-pub-name').value = partner.name;
            setGrade(partner.grade);
            renderOrder();
            
            // 2. 담당자 복원 및 연락처 갱신
            const mgrSelect = document.getElementById('ord-manager');
            if (mgrSelect) {
                mgrSelect.value = order.managerName;
                updateManager(order.managerName);
                
                // 데이터 영속성에도 세팅
                if (!MASTER.orderPersistence[mode]) MASTER.orderPersistence[mode] = {};
                MASTER.orderPersistence[mode]['ord-manager'] = order.managerName;
            }
        }
        
        // 3. 첨부파일 복원 및 UI 반영
        currentFiles.inner = order.innerFile || null;
        currentFiles.cover = order.coverFile || null;
        
        ['inner', 'cover'].forEach(type => {
            const fileData = currentFiles[type];
            const area = document.getElementById(`file-${type}-area`);
            const status = document.getElementById(`${type}-file-status`);
            if (area && status) {
                if (fileData) {
                    area.classList.remove('bg-slate-50');
                    area.classList.add('bg-emerald-50', 'border-emerald-200');
                    status.textContent = `기존 파일 유지됨: ${fileData.name}`;
                    status.classList.remove('text-slate-400');
                    status.classList.add('text-emerald-600', 'font-bold');
                } else {
                    area.classList.remove('bg-emerald-50', 'border-emerald-200');
                    area.classList.add('bg-slate-50');
                    status.textContent = '선택된 파일 없음';
                    status.classList.remove('text-emerald-600', 'font-bold');
                    status.classList.add('text-slate-400');
                }
            }
        });
        
        // 페이지 이동 (isEdit=true 전달하여 editingOrderId 유지)
        showPage('order', true);
        editingOrderId = id; // showPage 이후에 다시 설정
        setMode(mode);
    }
}

function exportAllTransactionStatements() {
    alert('거래명세서 전체 다운로드 기능을 실행합니다.');
}

async function downloadExcel(id) {
    const order = MASTER.orders.find(o => o.id === id);
    if (!order) return alert('주문 데이터를 찾을 수 없습니다.');

    try {
        // [발주서 템플릿 Base64 데이터 내장]
        const b64Data = "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";
        const bin = atob(b64Data);
        const arrayBuffer = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
            arrayBuffer[i] = bin.charCodeAt(i);
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer.buffer);
        const worksheet = workbook.getWorksheet(1) || workbook.worksheets[0];
        if (!worksheet) throw new Error('엑셀 파일 내 시트를 찾을 수 없습니다.');

        const d = order.data || {};
        const tp = parseInt(d['ord-tp']) || 0;
        const cp = parseInt(d['ord-cp']) || 0;
        const bp = tp - cp;
        const qty = parseInt(order.qty.toString().replace(/[^0-9]/g, '')) || 0;

        // [파트너사 및 단가 데이터 안전하게 가져오기]
        const pub = MASTER.partners.find(p => p.name === order.pubName) || {};
        const gradeName = pub.grade || MASTER.currentGrade || 'A등급';
        const priceData = MASTER.pricesByGrade[gradeName] || MASTER.pricesByGrade[MASTER.currentGrade] || { commons: [], sheetSpecs: [], sheetCommons: {} };
        const spec = (priceData.sheetSpecs || []).find(s => s.n === d['ord-spec']) || {bw:0, cl:0, face:0};
        
        const getC = (n) => {
            const found = (priceData.commons || []).find(c => c.n && c.n.includes(n));
            return found ? found.v : 0;
        };
        const getSC = (group, val) => priceData.sheetCommons[group + '_' + val] || 0;

        // 1. [상단 정보 매칭]
        worksheet.getCell('C4').value = order.date;
        worksheet.getCell('F4').value = pub.bizNum || '';
        worksheet.getCell('C5').value = order.managerName;
        worksheet.getCell('F5').value = pub.name || order.pubName;
        worksheet.getCell('J5').value = pub.ceoName || '';
        worksheet.getCell('C6').value = order.qty;
        worksheet.getCell('F6').value = pub.addr ? `${pub.addr} ${pub.addrDetail || ''}` : '';
        worksheet.getCell('C7').value = d['ord-spec'] || '';
        worksheet.getCell('F7').value = pub.bizType || '';
        worksheet.getCell('J7').value = pub.bizItem || pub.bizType || '';

        const innerType = d['ord-inner-print'] || '';
        worksheet.getCell('C8').value = `${tp}P(${innerType}${cp}P/흑백페이지${bp}P)`;

        // 2. [제작 사양 및 금액 계산]
        // [표지 - 14행]
        const coverDetail = `${d['ord-cover'] || ''}/${d['ord-printing'] || ''}/${d['ord-wing'] || ''}/${d['ord-coating'] || ''}/${d['ord-binding'] || ''}`;
        worksheet.getCell('C14').value = coverDetail;
        let coverUnit = 0;
        coverUnit += getSC('표지날개', d['ord-wing']);
        coverUnit += getSC('표지인쇄', d['ord-printing']);
        coverUnit += getSC('코팅방식', d['ord-coating']);
        coverUnit += getSC('제본방식', d['ord-binding']);
        
        const coverSupply = coverUnit * qty;
        const coverVat = Math.floor(coverSupply / 10);
        worksheet.getCell('D14').value = coverUnit;
        worksheet.getCell('F14').value = qty;
        worksheet.getCell('G14').value = coverSupply;
        worksheet.getCell('I14').value = coverVat;
        worksheet.getCell('K14').value = coverSupply + coverVat;

        // [내지 - 15행]
        const innerDetail = `${d['ord-inner'] || ''}/${innerType}/용지할증`;
        worksheet.getCell('C15').value = innerDetail;
        
        let innerUnit = (bp * (spec.bw || 0)) + (cp * (spec.cl || 0));
        if (innerType.includes('단면')) {
            innerUnit = (innerUnit / 2) + (tp / 2 * getC('단면할증'));
        }
        if ((d['ord-inner'] || '').includes('100g')) innerUnit += tp * getC('100g용지할증');
        else if ((d['ord-inner'] || '').includes('120g')) innerUnit += tp * getC('120g용지할증');
        innerUnit += getSC('내지인쇄', innerType);

        const innerSupply = innerUnit * qty;
        const innerVat = Math.floor(innerSupply / 10);
        worksheet.getCell('D15').value = innerUnit;
        worksheet.getCell('F15').value = qty;
        worksheet.getCell('G15').value = innerSupply;
        worksheet.getCell('I15').value = innerVat;
        worksheet.getCell('K15').value = innerSupply + innerVat;

        // [면지 - 17행]
        if (d['ord-face'] && d['ord-face'] !== '없음') {
            const faceInsert = d['ord-face-insert'] || '';
            let mult = faceInsert.includes('4P') ? 4 : (faceInsert.includes('8P') ? 8 : 0);
            const faceUnit = (spec.face || 0) * mult;
            const faceSupply = faceUnit * qty;
            const faceVat = Math.floor(faceSupply / 10);
            
            worksheet.getCell('C17').value = `${d['ord-face']}(${d['ord-face-insert']})`;
            worksheet.getCell('D17').value = faceUnit;
            worksheet.getCell('F17').value = qty;
            worksheet.getCell('G17').value = faceSupply;
            worksheet.getCell('I17').value = faceVat;
            worksheet.getCell('K17').value = faceSupply + faceVat;
        }

        // [배송비 - 18행]
        const shipUnit = parseInt(order.shippingCost || 0) || 0;
        const boxQty = parseInt(order.boxCount || 0) || 1;
        const shipSupply = shipUnit * boxQty;
        const shipVat = Math.floor(shipSupply / 10);
        
        worksheet.getCell('D18').value = shipUnit;
        worksheet.getCell('F18').value = boxQty;
        worksheet.getCell('G18').value = shipSupply;
        worksheet.getCell('I18').value = shipVat;
        worksheet.getCell('K18').value = shipSupply + shipVat;

        // [총 합계 - 19행]
        const totalSupply = (Number(worksheet.getCell('G14').value) || 0) + (Number(worksheet.getCell('G15').value) || 0) + (Number(worksheet.getCell('G17').value) || 0) + (Number(worksheet.getCell('G18').value) || 0);
        const totalVat = (Number(worksheet.getCell('I14').value) || 0) + (Number(worksheet.getCell('I15').value) || 0) + (Number(worksheet.getCell('I17').value) || 0) + (Number(worksheet.getCell('I18').value) || 0);
        const grandTotal = totalSupply + totalVat;

        worksheet.getCell('G19').value = totalSupply;
        worksheet.getCell('I19').value = totalVat;
        worksheet.getCell('K19').value = grandTotal;
        worksheet.getCell('C10').value = grandTotal;

        // 3. [배송지 정보 - 22행부터]
        if (order.deliveries && order.deliveries.length > 0) {
            order.deliveries.forEach((dl, idx) => {
                const row = 22 + idx;
                worksheet.getCell(`B${row}`).value = `${dl.address || ''} ${dl.addressDetail || ''}`;
                worksheet.getCell(`E${row}`).value = dl.recipient || '';
                worksheet.getCell(`G${row}`).value = dl.tel || '';
                const tracking = dl.trackingList ? dl.trackingList.map(t => t.code).join(', ') : (dl.trackingNum || '');
                worksheet.getCell(`I${row}`).value = tracking;
                worksheet.getCell(`K${row}`).value = dl.courier || '';
                worksheet.getCell(`L${row}`).value = dl.boxCount || '';
            });
        }

        // 4. 저장 (파일명 특수문자 제거)
        const safeTitle = (order.bookTitle || '발주서').replace(/[\\/:*?"<>|]/g, '_');
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `발주서_${safeTitle}_${order.date}.xlsx`;
        anchor.click();
        window.URL.revokeObjectURL(url);

    } catch (error) {
        console.error('Purchase Order Export Error:', error);
        alert('발주서 생성 중 오류가 발생했습니다: ' + error.message);
    }
}


function deleteOrder(id) {
    const order = MASTER.orders.find(o => o.id === id);
    if (order && order.isFinalized) {
        alert("이미 정산 마감된 주문은 삭제할 수 없습니다.");
        return;
    }

    if(confirm('해당 주문을 삭제하시겠습니까?')) {
        MASTER.orders = MASTER.orders.filter(o => o.id !== id);
        saveMasterDataSilent();
        renderSettlementTable();
        if (settlementChart) updateChart(); // 삭제 시 차트 반영
        alert('주문이 삭제되었습니다.');
    }
}

function executeMonthlyClosing() {
    const filtered = getFilteredOrders();
    if (filtered.length === 0) return alert("마감할 주문 내역이 없습니다.");

    if (!confirm(`조회된 ${filtered.length}건의 데이터를 마감하고 확정하시겠습니까?\n마감 후에는 주문 수정 및 삭제가 불가능합니다.`)) return;
    
    // 조회된 주문들 모두 확정 상태로 변경
    filtered.forEach(o => {
        o.isFinalized = true;
    });

    const count = document.getElementById('stat-count')?.innerText || '0';
    const total = document.getElementById('stat-total')?.innerText || '0';
    
    alert(`[마감 완료] 총 ${count}건, ${total}원이 최종 정산 확정되었습니다.\n세금계산서 발행 리스트로 전송되었습니다.`);
    saveMasterDataSilent();
    renderSettlementTable();
}

function setMonthlyGoal() {
    const current = MASTER.monthlyGoal || 50000000;
    const input = prompt("월 목표 매출액을 설정하세요 (원 단위, 숫자만 입력):", current);
    if (input !== null) {
        const val = parseInt(input.replace(/,/g, ''));
        if (!isNaN(val) && val > 0) {
            MASTER.monthlyGoal = val;
            saveMasterDataSilent();
            renderSettlementTable();
            alert(`월 목표 매출액이 ${ (val / 10000).toLocaleString() }만원으로 설정되었습니다.`);
        } else {
            alert("유효한 숫자를 입력해주세요.");
        }
    }
}

// ---------------------------------------------------------
// 파트너사 관리 모듈 로직
// ---------------------------------------------------------
function resetPassword() {
    const userId = document.getElementById('u_id').value;
    if(confirm(`[${userId}] 계정의 비밀번호를 '1234'로 초기화하시겠습니까?`)) {
        alert('비밀번호가 성공적으로 초기화되었습니다.');
    }
}

// 사업자등록증 파일 처리 함수
let currentBizFileData = null; // 현재 선택된 파일 데이터 (Base64)

function handleBizFileSelect(input) {
    const file = input.files[0];
    const status = document.getElementById('biz-file-status');
    const preview = document.getElementById('biz-preview-content');
    const downloadBtn = document.getElementById('btn-biz-download');

    if (!file) return;

    status.innerText = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        currentBizFileData = e.target.result;
        
        if (file.type.startsWith('image/')) {
            preview.innerHTML = `<img src="${currentBizFileData}" class="max-h-[100px] rounded shadow-sm object-contain animate-in fade-in zoom-in duration-300">`;
        } else if (file.type === 'application/pdf') {
            preview.innerHTML = `<div class="flex flex-col items-center gap-2 text-rose-500 font-bold"><i data-lucide="file-text" class="w-8 h-8"></i>PDF 문서</div>`;
            if (window.lucide) lucide.createIcons();
        } else {
            preview.innerHTML = `<div class="flex flex-col items-center gap-2 text-slate-500 font-bold"><i data-lucide="file" class="w-8 h-8"></i>기타 문서</div>`;
            if (window.lucide) lucide.createIcons();
        }

        // 업로드 시 다운로드 버튼 숨김 (저장 전까지는 로컬 데이터이므로)
        if (downloadBtn) downloadBtn.classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

function downloadBizFile() {
    const id = document.getElementById('u_id').value;
    const partner = MASTER.partners.find(p => p.id === id);
    if (!partner || !partner.bizFile) return alert("등록된 사업자등록증이 없습니다.");

    // 실제 환경에서는 서버 URL로 다운로드 하겠으나, 여기서는 가상 시뮬레이션
    const link = document.createElement('a');
    link.href = partner.bizFile.data;
    link.download = partner.bizFile.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert(`[${partner.bizFile.name}] 파일 다운로드를 시작합니다.`);
}

function addManagerRow() {
    const tbody = document.querySelector('#managerTable tbody');
    if (!tbody) return;
    const newRow = document.createElement('tr');
    newRow.className = 'ani-in-partner';
    newRow.innerHTML = `
        <td><input type="text" class="input-partner" placeholder="성함"></td>
        <td><input type="text" class="input-partner" placeholder="부서"></td>
        <td><input type="text" class="input-partner" placeholder="연락처"></td>
        <td><input type="text" class="input-partner" placeholder="이메일"></td>
        <td style="text-align:center;"><button type="button" onclick="this.closest('tr').remove()" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:bold;">×</button></td>
    `;
    tbody.appendChild(newRow);
}

// 파트너사 목록 동적 렌더링 (페이지네이션 적용)
function renderPartners() {
    const listContainer = document.getElementById('partnerList');
    const paginationContainer = document.getElementById('partnerPagination');
    if (!listContainer) return;

    // 검색어 필터링 적용 (필요 시)
    const searchInput = document.getElementById('partnerSearch');
    const keyword = searchInput ? searchInput.value.toLowerCase() : '';
    const filtered = MASTER.partners.filter(p => p.name.toLowerCase().includes(keyword));

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / partnerItemsPerPage);
    
    // 현재 페이지가 전체 페이지보다 크면 조정
    if (partnerCurrentPage > totalPages && totalPages > 0) partnerCurrentPage = totalPages;
    if (partnerCurrentPage < 1) partnerCurrentPage = 1;

    const start = (partnerCurrentPage - 1) * partnerItemsPerPage;
    const end = start + partnerItemsPerPage;
    const pageItems = filtered.slice(start, end);

    const listSide = document.querySelector('.partner-list-side');
    const role = (typeof currentUserRole !== 'undefined') ? currentUserRole : 'admin';

    // 출판사 모드일 경우 리스트 숨김 처리 및 본인 정보 자동 로드
    if (role === 'publisher') {
        if (listSide) listSide.style.display = 'none';
        document.querySelector('.admin-container').style.gridTemplateColumns = '1fr';
        
        // 본인 데이터가 로드되지 않았다면 강제 로드
        const myPartner = MASTER.partners[0];
        if (myPartner && document.getElementById('u_id').value !== myPartner.id) {
            selectPartner(myPartner.id);
        }
        return;
    } else {
        if (listSide) listSide.style.display = 'flex';
        document.querySelector('.admin-container').style.gridTemplateColumns = '350px 1fr';
    }

    listContainer.innerHTML = pageItems.map(p => `
        <div class="partner-item ${p.id === (document.getElementById('u_id').value) ? 'active' : ''}" data-id="${p.id}" onclick="selectPartner('${p.id}')">
            <div class="name">
                ${p.name} <span class="badge-partner">${p.grade}</span>
            </div>
            <div class="info">ID: ${p.id} | 담당자: ${p.managers.length}명</div>
            <div class="btn-del-partner" onclick="deletePartner('${p.id}', event)">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </div>
        </div>
    `).join('');

    // 페이지네이션 번호 생성
    if (paginationContainer) {
        // 사용자 요청: 5개 이상 만들어 지면 페이지네이션 표시
        if (totalItems < 5) {
            paginationContainer.style.display = 'none';
        } else {
            paginationContainer.style.display = 'flex';
            let html = `<button class="pg-btn" onclick="changePartnerPage(${partnerCurrentPage - 1})" ${partnerCurrentPage === 1 ? 'disabled' : ''}>&lt;</button>`;
            for (let i = 1; i <= totalPages; i++) {
                html += `<button class="pg-btn ${i === partnerCurrentPage ? 'active' : ''}" onclick="changePartnerPage(${i})">${i}</button>`;
            }
            html += `<button class="pg-btn" onclick="changePartnerPage(${partnerCurrentPage + 1})" ${partnerCurrentPage === totalPages ? 'disabled' : ''}>&gt;</button>`;
            paginationContainer.innerHTML = html;
        }
    }

    if (window.lucide) lucide.createIcons();
}

function changePartnerPage(page) {
    partnerCurrentPage = page;
    renderPartners();
}

function deletePartner(id, event) {
    if (event) event.stopPropagation(); // 카드 클릭 이벤트 방지
    const partner = MASTER.partners.find(p => p.id === id);
    if (!partner) return;

    if (confirm(`[${partner.name}] 파트너사를 삭제(탈퇴)하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) {
        MASTER.partners = MASTER.partners.filter(p => p.id !== id);
        saveMasterDataSilent();
        renderPartners();
        alert(`[${partner.name}] 파트너사가 정상적으로 삭제되었습니다.`);
    }
}

function clearPartnerFields() {
    document.getElementById('u_id').value = '';
    document.getElementById('u_id').readOnly = false;
    document.getElementById('u_name').value = '';
    document.getElementById('gradeSearch').value = '일반등급(표준)';
    document.getElementById('gradeSearch').disabled = false;
    document.getElementById('u_bizNum').value = '';
    document.getElementById('u_ceoName').value = '';
    document.getElementById('u_bizType').value = '';
    document.getElementById('u_addr').value = '';
    document.getElementById('u_addrDetail').value = '';
    document.querySelector('#managerTable tbody').innerHTML = '';
    document.querySelectorAll('.partner-item').forEach(item => item.classList.remove('active'));
    
    // 파일 관련 필드 초기화
    document.getElementById('biz-file-input').value = '';
    document.getElementById('biz-file-status').innerText = '선택된 파일 없음';
    document.getElementById('biz-preview-content').innerHTML = `<i data-lucide="image" class="w-8 h-8 opacity-20"></i>이미지 미리보기`;
    const downloadBtn = document.getElementById('btn-biz-download');
    if (downloadBtn) downloadBtn.classList.add('hidden');
    currentBizFileData = null;
    if (window.lucide) lucide.createIcons();
}

function selectPartner(id) {
    // 다른 파트너 선택 시 수정사항 미저장 알림
    if (currentBizFileData) {
        if (document.getElementById('u_id').value !== id) {
            if (!confirm("수정사항(사업자등록증 등)이 저장되지 않았습니다. 다른 업체 정보를 보시겠습니까?")) {
                return;
            }
            currentBizFileData = null;
        }
    }

    const partner = MASTER.partners.find(p => p.id === id);
    if (!partner) return;
    
    const role = (typeof currentUserRole !== 'undefined') ? currentUserRole : 'admin';
    const isPublisher = (role === 'publisher');
    
    document.getElementById('u_id').readOnly = true;
    document.getElementById('u_name').readOnly = isPublisher;
    document.getElementById('gradeSearch').disabled = isPublisher;

    document.querySelectorAll('.partner-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === id);
    });

    document.getElementById('u_name').value = partner.name;
    document.getElementById('u_id').value = partner.id;
    if (document.getElementById('u_id_pub')) document.getElementById('u_id_pub').value = partner.id;
    document.getElementById('gradeSearch').value = partner.grade;
    document.getElementById('u_bizNum').value = partner.bizNum || '';
    document.getElementById('u_ceoName').value = partner.ceoName || '';
    document.getElementById('u_bizType').value = partner.bizType || '';
    document.getElementById('u_addr').value = partner.addr || '';
    document.getElementById('u_addrDetail').value = partner.addrDetail || '';

    // 등급/단가 확인 섹션 추가 (출판사 전용)
    const detailSide = document.querySelector('.partner-detail-side');
    let contractSection = document.getElementById('contract-verification-section');
    if (!contractSection) {
        contractSection = document.createElement('div');
        contractSection.id = 'contract-verification-section';
        detailSide.insertBefore(contractSection, detailSide.firstChild);
    }

    if (isPublisher) {
        contractSection.innerHTML = `
            <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 mb-8 flex items-center justify-between shadow-sm">
                <div>
                    <div class="text-emerald-700 font-black text-lg mb-1">🤝 계약 및 적용 단가 확인</div>
                    <p class="text-emerald-600 text-xs opacity-80">인쇄소와 합의된 계약 단가 명세서를 확인하실 수 있습니다.</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="alert('도인 날인된 계약서 원본(PDF)을 불러옵니다.')" class="bg-white text-emerald-700 border border-emerald-200 px-4 py-2.5 rounded-xl text-xs font-black hover:bg-emerald-100 transition-all shadow-sm flex items-center gap-2">
                        <i data-lucide="file-check" class="w-4 h-4"></i> 계약 문서 확인
                    </button>
                    <button onclick="openPriceTableModal('${partner.grade}')" class="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center gap-2">
                        <i data-lucide="table" class="w-4 h-4"></i> 현재 적용 단가표
                    </button>
                </div>
            </div>
        `;
        // 출판사 모드일 때 등급 설정 숨기고 비번 변경 노출
        if (document.getElementById('partner-grade-container')) document.getElementById('partner-grade-container').classList.add('hidden');
        if (document.getElementById('partner-pw-reset-container')) document.getElementById('partner-pw-reset-container').classList.add('hidden');
        if (document.getElementById('partner-pw-change-container')) document.getElementById('partner-pw-change-container').classList.remove('hidden');
    } else {
        contractSection.innerHTML = '';
        // 관리자 모드일 때 등급 설정 노출하고 비번 변경 숨김
        if (document.getElementById('partner-grade-container')) document.getElementById('partner-grade-container').classList.remove('hidden');
        if (document.getElementById('partner-pw-reset-container')) document.getElementById('partner-pw-reset-container').classList.remove('hidden');
        if (document.getElementById('partner-pw-change-container')) document.getElementById('partner-pw-change-container').classList.add('hidden');
    }
    
    // 담당자 테이블 초기화 후 렌더링
    const tbody = document.querySelector('#managerTable tbody');
    if (tbody) {
        tbody.innerHTML = '';
        partner.managers.forEach(m => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="text" class="input-partner" value="${m.name}"></td>
                <td><input type="text" class="input-partner" value="${m.dept}"></td>
                <td><input type="text" class="input-partner" value="${m.tel}"></td>
                <td><input type="text" class="input-partner" value="${m.email}"></td>
                <td style="text-align:center;"><button type="button" onclick="this.closest('tr').remove()" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:bold;">×</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    // 사업자등록증 정보 로드
    const bizStatus = document.getElementById('biz-file-status');
    const bizPreview = document.getElementById('biz-preview-content');
    const bizDownloadBtn = document.getElementById('btn-biz-download');
    
    if (partner.bizFile) {
        bizStatus.innerText = `${partner.bizFile.name} (등록됨)`;
        if (partner.bizFile.type.startsWith('image/')) {
            bizPreview.innerHTML = `<img src="${partner.bizFile.data}" class="max-h-[100px] rounded shadow-sm object-contain">`;
        } else {
            bizPreview.innerHTML = `<div class="flex flex-col items-center gap-2 text-slate-400 font-bold"><i data-lucide="file-check" class="w-8 h-8"></i>파일 등록됨</div>`;
        }
        if (bizDownloadBtn) bizDownloadBtn.classList.remove('hidden');
    } else {
        bizStatus.innerText = '선택된 파일 없음';
        bizPreview.innerHTML = `<i data-lucide="image" class="w-8 h-8 opacity-20"></i>이미지 미리보기`;
        if (bizDownloadBtn) bizDownloadBtn.classList.add('hidden');
    }

    if (window.lucide) lucide.createIcons();
}

function savePartnerData() {
    const id = document.getElementById('u_id').value;
    const name = document.getElementById('u_name').value;
    const grade = document.getElementById('gradeSearch').value;
    const bizNum = document.getElementById('u_bizNum').value;
    const ceoName = document.getElementById('u_ceoName').value;
    const bizType = document.getElementById('u_bizType').value;
    const addr = document.getElementById('u_addr').value;
    const addrDetail = document.getElementById('u_addrDetail').value;

    if (!id || !name) return alert('아이디와 업체명은 필수입니다.');
    if (!MASTER.grades.includes(grade)) return alert('존재하지 않는 등급입니다. 단가 관리에서 먼저 등급을 생성해주세요.');

    let partner = MASTER.partners.find(p => p.id === id);
    const mgrRows = document.querySelectorAll('#managerTable tbody tr');
    const managers = Array.from(mgrRows).map(row => {
        const inputs = row.querySelectorAll('input');
        return { name: inputs[0].value, dept: inputs[1].value, tel: inputs[2].value, email: inputs[3].value };
    });

    if (partner) {
        partner.name = name;
        partner.grade = grade;
        partner.bizNum = bizNum;
        partner.ceoName = ceoName;
        partner.bizType = bizType;
        partner.addr = addr;
        partner.addrDetail = addrDetail;
        partner.managers = managers;
        // 파일 정보 업데이트
        if (currentBizFileData) {
            const fileInput = document.getElementById('biz-file-input');
            const file = fileInput.files[0];
            if (file) {
                partner.bizFile = {
                    name: file.name,
                    type: file.type,
                    data: currentBizFileData
                };
            }
        }
    } else {
        const newPartner = { id, name, grade, bizNum, ceoName, bizType, addr, addrDetail, managers };
        if (currentBizFileData) {
            const fileInput = document.getElementById('biz-file-input');
            const file = fileInput.files[0];
            if (file) {
                newPartner.bizFile = {
                    name: file.name,
                    type: file.type,
                    data: currentBizFileData
                };
            }
        }
        MASTER.partners.push(newPartner);
    }

    saveMasterDataSilent();
    renderPartners();
    
    // 저장 완료 후 수정 플래그 초기화
    currentBizFileData = null;
    
    alert(`[${name}] 파트너 정보와 [${grade}] 등급 연동 설정이 성공적으로 저장되었습니다.`);
}

function clearPrinterMgmtFields() {
    document.getElementById('pr_id').value = '';
    document.getElementById('pr_id').readOnly = false;
    document.getElementById('pr_name').value = '';
    document.getElementById('pr_bizNum').value = '';
    document.getElementById('pr_ceoName').value = '';
    document.getElementById('pr_bizType').value = '';
    document.getElementById('pr_addr').value = '';
    document.getElementById('pr_addrDetail').value = '';
    document.getElementById('printerManagerTable').querySelector('tbody').innerHTML = '';
    document.querySelectorAll('.partner-item').forEach(item => item.classList.remove('active'));
    
    document.getElementById('pr-biz-file-input').value = '';
    document.getElementById('pr-biz-file-status').innerText = '없음';
    document.getElementById('pr-biz-preview-content').innerHTML = `<i data-lucide="image" class="w-8 h-8 opacity-20"></i> 미리보기`;
    if (window.lucide) lucide.createIcons();
}

function renderPrintersMgmt() {
    const listContainer = document.getElementById('printerList');
    if (!listContainer) return;

    const role = currentUserRole;
    const listSide = document.querySelector('#page-printer-mgmt .partner-list-side');

    if (role === 'printer' || role === 'printer_worker') {
        if (listSide) listSide.style.display = 'none';
        const adminContainer = document.querySelector('#page-printer-mgmt .admin-container');
        if (adminContainer) adminContainer.style.gridTemplateColumns = '1fr';
        const myPrinter = MASTER.printers[0];
        if (myPrinter) selectPrinterMgmt(myPrinter.id);
        return;
    } else {
        if (listSide) listSide.style.display = 'flex';
        document.querySelector('#page-printer-mgmt .admin-container').style.gridTemplateColumns = '350px 1fr';
    }

    const keyword = document.getElementById('printerSearch').value.toLowerCase();
    const filtered = MASTER.printers.filter(p => p.name.toLowerCase().includes(keyword));

    listContainer.innerHTML = filtered.map(p => `
        <div class="partner-item" data-id="${p.id}" onclick="selectPrinterMgmt('${p.id}')">
            <div class="name">${p.name}</div>
            <div class="info">ID: ${p.id} | 담당자: ${p.managers.length}명</div>
        </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
}

function selectPrinterMgmt(id) {
    const printer = MASTER.printers.find(p => p.id === id);
    if (!printer) return;
    
    const role = currentUserRole;
    const isMaster = (role === 'printer');

    // 계정 설정 UI 분기
    const pwReset = document.getElementById('printer-pw-reset-container');
    const pwChange = document.getElementById('printer-pw-change-container');

    if (role === 'admin') {
        pwReset.classList.remove('hidden');
        pwChange.classList.add('hidden');
        document.getElementById('pr_id').value = printer.id;
    } else {
        pwReset.classList.add('hidden');
        pwChange.classList.remove('hidden');
        document.getElementById('pr_id_view').value = printer.id;
    }

    document.getElementById('pr_id').readOnly = true;
    document.getElementById('pr_name').value = printer.name;
    document.getElementById('pr_bizNum').value = printer.bizNum || '';
    document.getElementById('pr_ceoName').value = printer.ceoName || '';
    document.getElementById('pr_bizType').value = printer.bizType || '';
    document.getElementById('pr_addr').value = printer.addr || '';
    document.getElementById('pr_addrDetail').value = printer.addrDetail || '';

    // 계약 단가 확인 섹션
    const contractArea = document.getElementById('printer-contract-section');
    if (role === 'printer') {
        contractArea.innerHTML = `
            <div class="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 mb-8 flex items-center justify-between">
                <div>
                    <div class="text-indigo-700 font-black text-lg mb-1">🤝 계약 및 협약 단가 확인</div>
                </div>
                <div class="flex gap-2">
                    <button type="button" onclick="alert('계약서 원본 PDF를 불러옵니다.')" class="bg-white text-indigo-700 border border-indigo-200 px-4 py-2.5 rounded-xl text-xs font-black shadow-sm">계약 문서 확인</button>
                    <button type="button" onclick="openPrinterPriceModal()" class="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-indigo-100">현재 협약 단가표</button>
                </div>
            </div>
        `;
    } else {
        contractArea.innerHTML = '';
    }

    // 파일 정보 동기화
    if (printer.bizFile) {
        document.getElementById('pr-biz-file-status').innerText = printer.bizFile.name;
        document.getElementById('btn-pr-biz-download').classList.remove('hidden');
        if (printer.bizFile.name.match(/\.(jpg|jpeg|png|gif)$/i)) {
            document.getElementById('pr-biz-preview-content').innerHTML = `<img src="https://via.placeholder.com/150?text=Biz+License" class="max-h-full object-contain">`;
        }
    } else {
        document.getElementById('pr-biz-file-status').innerText = '선택된 파일 없음';
        document.getElementById('btn-pr-biz-download').classList.add('hidden');
        document.getElementById('pr-biz-preview-content').innerHTML = `<i data-lucide="image" class="w-8 h-8 opacity-20"></i> 이미지 미리보기`;
    }

    // 담당자 테이블
    const tbody = document.getElementById('printerManagerTable').querySelector('tbody');
    tbody.innerHTML = '';
    printer.managers.forEach((m, idx) => {
        const tr = document.createElement('tr');
        const isSettle = m.perms && m.perms.includes('settle');
        const isProd = m.perms && m.perms.includes('prod');
        tr.innerHTML = `
            <td><input type="text" class="input-partner" value="${m.name}"></td>
            <td><input type="text" class="input-partner" value="${m.tel}"></td>
            <td><input type="text" class="input-partner" value="${m.email}"></td>
            <td><input type="password" class="input-partner" value="${m.subPw || ''}" placeholder="서브비번"></td>
            <td>
                <div class="flex gap-4">
                    <label class="flex items-center gap-1 text-[10px] font-bold"><input type="checkbox" ${isProd ? 'checked' : ''} class="perm-prod"> 생산관리</label>
                    <label class="flex items-center gap-1 text-[10px] font-bold"><input type="checkbox" ${isSettle ? 'checked' : ''} class="perm-settle"> 정산관리</label>
                </div>
            </td>
            <td style="text-align:center;"><button type="button" onclick="this.closest('tr').remove()" class="text-rose-500 font-bold">×</button></td>
        `;
        tbody.appendChild(tr);
    });
    if (window.lucide) lucide.createIcons();
}

function addPrinterManagerRow() {
    const tbody = document.getElementById('printerManagerTable').querySelector('tbody');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" class="input-partner" placeholder="성함"></td>
        <td><input type="text" class="input-partner" placeholder="연락처"></td>
        <td><input type="text" class="input-partner" placeholder="이메일"></td>
        <td><input type="password" class="input-partner" placeholder="서브비번"></td>
        <td>
            <div class="flex gap-4">
                <label class="flex items-center gap-1 text-[10px] font-bold"><input type="checkbox" class="perm-prod" checked> 생산관리</label>
                <label class="flex items-center gap-1 text-[10px] font-bold"><input type="checkbox" class="perm-settle"> 정산관리</label>
            </div>
        </td>
        <td style="text-align:center;"><button type="button" onclick="this.closest('tr').remove()" class="text-rose-500 font-bold">×</button></td>
    `;
    tbody.appendChild(tr);
}

function savePrinterMgmtData() {
    const id = document.getElementById('pr_id').value || document.getElementById('pr_id_view').value;
    const name = document.getElementById('pr_name').value;
    if (!id || !name) return alert("아이디와 업체명은 필수입니다.");

    let printer = MASTER.printers.find(p => p.id === id);
    const mgrRows = document.querySelectorAll('#printerManagerTable tbody tr');
    const managers = Array.from(mgrRows).map(row => {
        const inputs = row.querySelectorAll('input');
        const perms = [];
        if (row.querySelector('.perm-prod').checked) perms.push('prod');
        if (row.querySelector('.perm-settle').checked) perms.push('settle');
        return { 
            name: inputs[0].value, tel: inputs[1].value, email: inputs[2].value, 
            subPw: inputs[3].value, perms: perms 
        };
    });

    const printerData = {
        id,
        name,
        bizNum: document.getElementById('pr_bizNum').value,
        ceoName: document.getElementById('pr_ceoName').value,
        bizType: document.getElementById('pr_bizType').value,
        addr: document.getElementById('pr_addr').value,
        addrDetail: document.getElementById('pr_addrDetail').value,
        managers: managers,
        bizFile: currentPrinterBizFileData || (printer ? printer.bizFile : null)
    };

    if (printer) {
        Object.assign(printer, printerData);
    } else {
        MASTER.printers.push(printerData);
    }

    saveMasterDataSilent();
    renderPrintersMgmt();
    
    // 초기화
    currentPrinterBizFileData = null;
    
    alert(`[${name}] 인쇄소 마스터 정보가 저장되었습니다.`);
}

function openPrinterPriceModal() {
    const priceData = MASTER.pricesByGrade['인쇄소 협약단가']; // 협약단가 기준
    if (!priceData) return alert("협약단가 데이터가 없습니다.");

    const overlay = document.getElementById('tracking-modal-overlay');
    const container = document.getElementById('tracking-input-container');
    
    const mainTitle = document.getElementById('tracking-modal-main-title');
    const modalLabel = document.getElementById('tracking-modal-label');
    if (mainTitle) mainTitle.innerText = "인쇄 협약 매입 단가표";
    if (modalLabel) {
        modalLabel.innerText = "PRINTER BUYING PRICE";
        modalLabel.className = "text-[10px] font-bold text-indigo-600 mb-1 uppercase tracking-widest";
    }

    document.getElementById('tracking-modal-order-id').innerText = "INTERNAL";
    document.getElementById('tracking-modal-book-title').innerText = "공정별 인쇄 매입 원가 명세";
    
    const saveBtn = document.getElementById('btn-save-tracking');
    saveBtn.innerText = "단가표 닫기";
    saveBtn.onclick = closeTrackingModal;

    container.innerHTML = `
        <div class="p-4 bg-white rounded-xl border">
            <h4 class="text-xs font-black text-slate-800 mb-2">[인쇄 협약 단가 요약]</h4>
            <table class="w-full text-[10px] border-collapse mb-4">
                <thead><tr class="bg-slate-50 border-y"><th class="py-2 px-1 text-left">항목</th><th class="text-right px-1">단가</th></tr></thead>
                <tbody>
                    ${priceData.sheetSpecs.slice(0,5).map(s => `
                        <tr class="border-b"><td class="py-1.5 px-1 font-bold">${s.n} (흑백)</td><td class="text-right px-1">${s.bw}원</td></tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="p-3 bg-indigo-50 rounded-lg text-[9px] text-indigo-700 font-bold">
                * 위 단가는 인쇄소 마스터와 합의된 최종 매입 확정 단가입니다.
            </div>
        </div>
    `;
    overlay.classList.remove('hidden');
}

// ---------------------------------------------------------
// 인쇄소 파일 핸들러
// ---------------------------------------------------------
let currentPrinterBizFileData = null;

function handlePrinterBizFileSelect(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        
        reader.onload = function(e) {
            currentPrinterBizFileData = {
                name: file.name,
                type: file.type,
                size: file.size,
                data: e.target.result, // base64
                lastModified: file.lastModified
            };
            
            const bizStatus = document.getElementById('pr-biz-file-status');
            const bizPreview = document.getElementById('pr-biz-preview-content');
            
            bizStatus.innerText = `${file.name} (대기중)`;
            bizStatus.classList.add('text-sky-600', 'font-bold');
            
            if (file.type.startsWith('image/')) {
                bizPreview.innerHTML = `<img src="${e.target.result}" class="max-h-[100px] rounded shadow-sm object-contain animate-in fade-in duration-300">`;
            } else {
                bizPreview.innerHTML = `<div class="flex flex-col items-center gap-2 text-sky-600 font-bold animate-in zoom-in duration-300"><i data-lucide="file-check" class="w-8 h-8"></i>파일 준비됨</div>`;
                if (window.lucide) lucide.createIcons();
            }
        };
        reader.readAsDataURL(file);
    }
}
function initPartnerSearch() {
    const searchInput = document.getElementById('partnerSearch');
    if (searchInput) {
        searchInput.addEventListener('keyup', function(e) {
            partnerCurrentPage = 1; // 검색 시 1페이지로 리셋
            renderPartners();
        });
    }
}

// 기존 window.onload에 initPartnerSearch 및 renderPartners 추가
window.onload = () => {
    // 모든 모듈 초기 렌더링
    renderSpec();
    renderPrice();
    renderSettlementTable();
    renderPartners();
    
    // 이벤트 바인딩
    initPartnerSearch();
    
    // 아이콘 생성
    if (window.lucide) lucide.createIcons();

    // 초기 역할 가시성 적용 (사이드바 메뉴 및 필터 제어)
    applyRoleVisibility();
};

function openPriceTableModal(grade) {
    const priceData = MASTER.pricesByGrade[grade];
    if (!priceData) return;

    const overlay = document.getElementById('tracking-modal-overlay'); // 기존 모달 재활용
    const container = document.getElementById('tracking-input-container');
    
    // 모달 상단 텍스트 변경
    const mainTitle = document.getElementById('tracking-modal-main-title');
    const modalLabel = document.getElementById('tracking-modal-label');
    if (mainTitle) mainTitle.innerText = "계약 단가 명세서";
    if (modalLabel) {
        modalLabel.innerText = "CONTRACT PRICE SHEET";
        modalLabel.className = "text-[10px] font-bold text-sky-600 mb-1 uppercase tracking-widest";
    }

    document.getElementById('tracking-modal-order-id').innerText = "CONFIDENTIAL";
    document.getElementById('tracking-modal-book-title').innerText = "인쇄 내지 및 공통 가공 단가 요약표";
    
    // 모달 하단 버튼 텍스트 변경
    const saveBtn = document.getElementById('btn-save-tracking');
    saveBtn.innerText = "단가표 닫기";
    saveBtn.className = "flex-1 bg-slate-800 text-white py-3 rounded-xl font-black text-sm shadow-lg shadow-slate-100 hover:bg-slate-900 transition-all";
    saveBtn.onclick = closeTrackingModal;

    const today = new Date().toLocaleDateString();
    const myPartner = MASTER.partners[0];

    container.innerHTML = `
        <div class="relative overflow-hidden p-6 bg-white rounded-2xl border">
            <!-- 워터마크 -->
            <div class="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none rotate-[-30deg] select-none" style="font-size: 40px; font-weight: 900; white-space: nowrap;">
                CONFIDENTIAL - ${myPartner.name} - ${today}
            </div>
            
            <div class="text-[10px] font-bold text-slate-400 mb-4 flex justify-between">
                <span>계약 대상: ${myPartner.name}</span>
                <span>조회일시: ${new Date().toLocaleString()}</span>
            </div>

            <h4 class="text-xs font-black text-slate-800 mb-2">[디지털 낱장 규격 단가]</h4>
            <table class="w-full text-[10px] border-collapse mb-6">
                <thead>
                    <tr class="bg-slate-50 border-y">
                        <th class="py-2 px-1 text-left">규격명</th>
                        <th class="text-right px-1">흑백(P)</th>
                        <th class="text-right px-1">컬러(P)</th>
                        <th class="text-right px-1">면지(P)</th>
                    </tr>
                </thead>
                <tbody>
                    ${priceData.sheetSpecs.map(s => `
                        <tr class="border-b">
                            <td class="py-1.5 px-1 font-bold text-slate-600">${s.n}</td>
                            <td class="text-right px-1">${s.bw}원</td>
                            <td class="text-right px-1 text-sky-600">${s.cl}원</td>
                            <td class="text-right px-1 text-emerald-600">${s.face}원</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <h4 class="text-xs font-black text-slate-800 mb-2">[공통 가공 비용 항목]</h4>
            <div class="grid grid-cols-2 gap-2 mb-4">
                ${priceData.commons.map(c => `
                    <div class="flex justify-between p-2 bg-slate-50 rounded-lg">
                        <span class="text-[9px] text-slate-500 font-bold">${c.n}</span>
                        <span class="text-[10px] font-black text-slate-700">${c.v.toLocaleString()}원</span>
                    </div>
                `).join('')}
            </div>

            <div class="text-[9px] text-rose-500 font-bold mt-4">* 모든 단가는 부가세(VAT) 별도 기준입니다.</div>
        </div>
    `;

    overlay.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
}

function resetPassword() {
    const id = document.getElementById('u_id').value;
    const partner = MASTER.partners.find(p => p.id === id);
    if (!partner) return alert("선택된 파트너가 없습니다.");
    
    if (confirm(`[${partner.name}] 업체의 비밀번호를 초기값 '1234'로 변경하시겠습니까?`)) {
        partner.password = '1234';
        saveMasterDataSilent();
        alert("비밀번호가 '1234'로 초기화되었습니다. 해당 업체에 안내해 주세요.");
    }
}

function openChangePasswordModal() {
    const overlay = document.getElementById('tracking-modal-overlay');
    const container = document.getElementById('tracking-input-container');
    
    // 모달 상단 텍스트 변경
    const mainTitle = document.getElementById('tracking-modal-main-title');
    const modalLabel = document.getElementById('tracking-modal-label');
    if (mainTitle) mainTitle.innerText = "비밀번호 변경";
    if (modalLabel) {
        modalLabel.innerText = "ACCOUNT SECURITY";
        modalLabel.className = "text-[10px] font-bold text-rose-600 mb-1 uppercase tracking-widest";
    }

    document.getElementById('tracking-modal-order-id').innerText = "Security";
    document.getElementById('tracking-modal-book-title').innerText = "계정 보안 설정";
    
    const saveBtn = document.getElementById('btn-save-tracking');
    saveBtn.innerText = "비밀번호 저장";
    saveBtn.className = "flex-1 bg-rose-600 text-white py-3 rounded-xl font-black text-sm shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all";
    saveBtn.onclick = saveNewPassword;

    container.innerHTML = `
        <div class="p-6 space-y-4">
            <div class="form-group-pptx">
                <label class="label-pptx">현재 비밀번호</label>
                <input type="password" id="pw-current" class="input-pptx" placeholder="••••">
            </div>
            <div class="w-full h-px bg-slate-100"></div>
            <div class="form-group-pptx">
                <label class="label-pptx">신규 비밀번호</label>
                <input type="password" id="pw-new" class="input-pptx" placeholder="신규 비밀번호">
            </div>
            <div class="form-group-pptx">
                <label class="label-pptx">신규 비밀번호 확인</label>
                <input type="password" id="pw-confirm" class="input-pptx" placeholder="다시 한번 입력">
            </div>
            <p class="text-[10px] text-slate-400 font-bold">* 보안을 위해 8자 이상의 영문, 숫자 조합을 권장합니다.</p>
        </div>
    `;

    overlay.classList.remove('hidden');
}

function saveNewPassword() {
    const current = document.getElementById('pw-current').value;
    const newPw = document.getElementById('pw-new').value;
    const confirmPw = document.getElementById('pw-confirm').value;

    const myPartner = MASTER.partners[0]; // 실무에선 로그인 세션 기반
    if (!myPartner) return;

    // 기존 비밀번호 확인 (기본값 1234)
    const storedPw = myPartner.password || '1234';
    if (current !== storedPw) {
        alert("현재 비밀번호가 일치하지 않습니다.");
        return;
    }

    if (!newPw) {
        alert("신규 비밀번호를 입력해주세요.");
        return;
    }

    if (newPw !== confirmPw) {
        alert("신규 비밀번호와 확인 입력이 일치하지 않습니다.");
        return;
    }

    myPartner.password = newPw;
    saveMasterDataSilent();
    alert("비밀번호가 성공적으로 변경되었습니다. 다음 로그인부터 적용됩니다.");
    closeTrackingModal();
}

function execDaumPostcodePartner() {
    if (typeof daum === 'undefined') {
        return alert("주소 서비스 스크립트가 로드되지 않았습니다. 인터넷 연결을 확인해 주세요.");
    }
    new daum.Postcode({
        oncomplete: function(data) {
            let addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
            let extraAddr = '';
            if(data.userSelectedType === 'R'){
                if(data.bname !== '' && /[동|로|가]$/g.test(data.bname)) extraAddr += data.bname;
                if(data.buildingName !== '' && data.apartment === 'Y') extraAddr += (extraAddr !== '' ? ', ' + data.buildingName : data.buildingName);
                if(extraAddr !== '') extraAddr = ' (' + extraAddr + ')';
            }
            const target = document.getElementById('u_addr');
            if(target) target.value = addr + extraAddr;
            const detailTarget = document.getElementById('u_addrDetail');
            if(detailTarget) detailTarget.focus();
        }
    }).open();
}

function execDaumPostcodePrinterMgmt() {
    if (typeof daum === 'undefined') return alert("주소 서비스 스크립트가 로드되지 않았습니다.");
    new daum.Postcode({
        oncomplete: function(data) {
            let addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
            const target = document.getElementById('pr_addr');
            if(target) target.value = addr;
            const detailTarget = document.getElementById('pr_addrDetail');
            if(detailTarget) detailTarget.focus();
        }
    }).open();
}

function downloadPrinterBizFile() {
    alert("인쇄소 사업자등록증 파일을 다운로드합니다.");
}

function resetPrinterPassword() {
    if (confirm("인쇄소 마스터 비밀번호를 '1234'로 초기화하시겠습니까?")) {
        alert("비밀번호가 초기화되었습니다.");
    }
}

// 브라우저 종료/새로고침 시 미저장 알림
window.addEventListener('beforeunload', (e) => {
    if (currentBizFileData) {
        e.preventDefault();
        e.returnValue = ''; // 브라우저 표준 메시지 출력
    }
});

// --- 엑셀 다운로드 기능 ---
async function downloadTransactionStatementExcel() {
    if (typeof ExcelJS === 'undefined') {
        alert('엑셀 라이브러리가 로드되지 않았습니다.');
        return;
    }
    
    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('거래명세서');
    
    // Filter data
    const filteredData = getFilteredOrders();
    if (filteredData.length === 0) {
        alert('다운로드할 데이터가 없습니다.');
        return;
    }
    
    // Add Header
    worksheet.mergeCells('A1:I2');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = '거 래 명 세 서 (Transaction Statement)';
    titleCell.font = { name: 'Malgun Gothic', size: 18, bold: true };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    
    worksheet.mergeCells('A3:I3');
    worksheet.getCell('A3').value = `출력일시: ${new Date().toLocaleString()}`;
    worksheet.getCell('A3').alignment = { horizontal: 'right' };
    
    // Add columns header
    const headerRow = worksheet.addRow(['일자', '출판사명', '도서명', '담당자', '단가(원)', '수량(부)', '공급가액(원)', '세액(원)', '합계금액(원)']);
    headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FFF1F5F9'} };
        cell.font = { bold: true };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    
    // Add data rows
    let totalSupply = 0;
    filteredData.forEach(item => {
        const supply = item.totalPrice || 0;
        const tax = Math.floor(supply * 0.1);
        const total = supply + tax;
        
        const row = worksheet.addRow([
            item.date,
            item.pubName,
            item.bookTitle,
            item.managerName,
            item.unitPrice,
            item.qty,
            supply,
            tax,
            total
        ]);
        totalSupply += supply;
        row.eachCell((cell, colNumber) => {
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
            if (colNumber >= 5 && colNumber <= 9) {
                cell.numFmt = '#,##0';
            }
        });
    });
    
    // Add totals row
    const totalTax = Math.floor(totalSupply * 0.1);
    const grandTotal = totalSupply + totalTax;
    const totalRow = worksheet.addRow(['합계', '', '', '', '', '', totalSupply, totalTax, grandTotal]);
    worksheet.mergeCells(`A${totalRow.number}:F${totalRow.number}`);
    totalRow.getCell(1).alignment = { horizontal: 'center' };
    totalRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, color: {argb:'FF0369A1'} };
        cell.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FFE0F2FE'} };
        cell.border = { top: {style:'double'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        if (colNumber >= 7) cell.numFmt = '#,##0';
    });
    
    // Columns width
    worksheet.columns = [
        { width: 12 }, { width: 20 }, { width: 30 }, { width: 15 },
        { width: 15 }, { width: 10 }, { width: 15 }, { width: 15 }, { width: 15 }
    ];
    
    // Download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `거래명세서_${new Date().getTime()}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// ---------------------------------------------------------
// 판매 도서 관리 (스토어 진열장) 로직
// ---------------------------------------------------------
let currentProductImage = null;
let editingProductId = null;

function renderStoreMgmt() {
    renderProductList();
}

function openProductModal(id = null) {
    document.getElementById('product-modal-overlay').classList.remove('hidden');
    editingProductId = id;
    
    // 규격 및 사양 셀렉트 박스 초기화
    const specSelect = document.getElementById('prod-spec');
    if (specSelect) specSelect.innerHTML = MASTER.pricesByGrade['일반등급(표준)'].sheetSpecs.map(s => `<option value="${s.n}">${s.n}</option>`).join('');
    
    const populate = (selId, options) => {
        const el = document.getElementById(selId);
        if (el) el.innerHTML = options.map(o => `<option value="${o}">${o}</option>`).join('');
    };
    populate('prod-inner-paper', MASTER.innerPapers);
    populate('prod-inner-print', MASTER.innerPrinting);
    populate('prod-cover-paper', MASTER.coverPapers);
    populate('prod-cover-print', MASTER.coverPrinting);
    populate('prod-coating', MASTER.coating);
    populate('prod-binding', MASTER.binding);
    populate('prod-wing', MASTER.wing);
    populate('prod-face-paper', MASTER.facePapers);
    populate('prod-face-insert', MASTER.faceInsert);

    // 담당자 셀렉트 박스 초기화
    const mgrSelect = document.getElementById('prod-manager');
    if (mgrSelect) {
        if (currentUserRole === 'publisher') {
            const myPartner = MASTER.partners[0];
            mgrSelect.innerHTML = myPartner.managers.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
        } else {
            mgrSelect.innerHTML = `<option value="관리자">관리자</option>`;
        }
    }

    const modalTitle = document.getElementById('prod-modal-title');
    const saveBtn = document.getElementById('btn-save-product');
    
    if (id) {
        const prod = MASTER.products.find(p => p.id === id);
        if (prod) {
            if (modalTitle) modalTitle.innerText = '판매 도서 수정';
            if (saveBtn) saveBtn.innerText = '도서 정보 수정하기';
            
            document.getElementById('prod-title').value = prod.title;
            document.getElementById('prod-category').value = prod.category;
            document.getElementById('prod-manager').value = prod.manager || '';
            document.getElementById('prod-spec').value = prod.spec;
            document.getElementById('prod-pages').value = prod.pages;
            document.getElementById('prod-price').value = prod.price;
            document.getElementById('prod-desc').value = prod.desc || '';
            document.getElementById('prod-custom-size').value = prod.customSize || '';
            
            if (prod.details) {
                document.getElementById('prod-inner-paper').value = prod.details.innerPaper;
                document.getElementById('prod-inner-print').value = prod.details.innerPrint;
                document.getElementById('prod-partial-color').value = prod.details.partialColor || '0';
                document.getElementById('prod-cover-paper').value = prod.details.coverPaper;
                document.getElementById('prod-cover-print').value = prod.details.coverPrint;
                document.getElementById('prod-coating').value = prod.details.coating;
                document.getElementById('prod-binding').value = prod.details.binding;
                document.getElementById('prod-wing').value = prod.details.wing;
                document.getElementById('prod-face-paper').value = prod.details.facePaper || '선택 안함';
                document.getElementById('prod-face-insert').value = prod.details.faceInsert || '선택 안함';
            }
            
            currentProductImage = prod.image;
            const preview = document.getElementById('prod-preview-content');
            if (currentProductImage) {
                preview.innerHTML = `<img src="${currentProductImage}" class="w-full h-full object-cover">`;
            } else {
                preview.innerHTML = `
                    <div class="flex flex-col items-center p-4">
                        <i data-lucide="file-text" class="w-16 h-16 text-rose-500 mb-2"></i>
                        <span class="text-xs font-bold text-slate-700">PDF 원본 저장됨</span>
                    </div>
                `;
            }
        }
    } else {
        if (modalTitle) modalTitle.innerText = '신규 판매 도서 등록';
        if (saveBtn) saveBtn.innerText = '스토어에 도서 등록하기';
        
        // 필드 초기화
        document.getElementById('prod-title').value = '';
        document.getElementById('prod-pages').value = '200';
        document.getElementById('prod-partial-color').value = '0';
        document.getElementById('prod-price').value = '';
        document.getElementById('prod-desc').value = '';
        document.getElementById('prod-preview-content').innerHTML = `
            <i data-lucide="image" class="w-12 h-12 mb-2 opacity-20"></i>
            <p class="text-[11px] font-bold">표지 이미지 업로드<br>(JPG, PNG, PDF)</p>
            <p class="text-[9px] text-slate-400 mt-1">* PDF 업로드 시 첫 페이지만 미리보기로 저장됩니다.</p>
        `;
        currentProductImage = null;
    }
    
    if (window.lucide) lucide.createIcons();
    calcProductUnitCost();
}

function calcProductUnitCost() {
    let grade = '일반등급(표준)';
    if (currentUserRole === 'publisher') {
        grade = MASTER.partners[0].grade;
    } else {
        grade = MASTER.currentGrade;
    }
    const priceData = MASTER.pricesByGrade[grade];
    if (!priceData) return;

    const specName = document.getElementById('prod-spec')?.value || '';
    const tp = parseInt(document.getElementById('prod-pages')?.value) || 0;
    
    // 사용자 규격 노출 여부 제어
    const customSizeView = document.getElementById('prod-custom-size-view');
    if (customSizeView) {
        if (specName.includes('사용자규격') || specName.includes('변형')) {
            customSizeView.classList.remove('hidden');
        } else {
            customSizeView.classList.add('hidden');
        }
    }

    const innerPrint = document.getElementById('prod-inner-print')?.value || '';
    let cp = parseInt(document.getElementById('prod-partial-color')?.value) || 0;
    if (!innerPrint.includes('부분컬러')) {
        if (innerPrint.includes('컬러')) cp = tp;
        else if (innerPrint.includes('흑백')) cp = 0;
    }
    document.getElementById('prod-partial-color').value = cp;
    let bp = tp - cp;
    if (bp < 0) bp = 0;

    let each = 0;
    const findCommon = (n) => (priceData.commons.find(c => c.n.includes(n)) || {v:0}).v;

    const isSingleSided = innerPrint.includes('단면');
    const physicalSheets = isSingleSided ? tp : (tp / 2);

    let spec = priceData.sheetSpecs.find(s => s.n === specName);
    if (specName.includes('사용자규격') || specName.includes('변형')) {
        const customSize = document.getElementById('prod-custom-size')?.value || '';
        const [w] = customSize.split(/x|\*/i).map(Number);
        if (w && !isNaN(w)) {
            if (w <= 148) {
                spec = priceData.sheetSpecs.find(s => s.n.includes('A5국판')) || spec;
            } else if (w <= 176) {
                spec = priceData.sheetSpecs.find(s => s.n.includes('크라운판')) || spec;
            } else {
                spec = priceData.sheetSpecs.find(s => s.n.includes('국배판')) || spec;
            }
        }
    }

    if(spec) {
        let innerPrintCost = (bp * spec.bw) + (cp * spec.cl);
        if (isSingleSided) {
            innerPrintCost = innerPrintCost / 2;
            each += (tp / 2) * findCommon('단면할증');
        }
        each += innerPrintCost;

        const innerPaper = document.getElementById('prod-inner-paper')?.value || '';
        if (innerPaper.includes('100g')) each += physicalSheets * findCommon('100g용지할증');
        else if (innerPaper.includes('120g')) each += physicalSheets * findCommon('120g용지할증');

        const commonMappings = [
            { id: 'prod-cover-print', group: '표지인쇄' },
            { id: 'prod-coating', group: '코팅방식' },
            { id: 'prod-wing', group: '표지날개' },
            { id: 'prod-binding', group: '제본방식' },
            { id: 'prod-inner-print', group: '내지인쇄' }
        ];

        commonMappings.forEach(mapping => {
            const val = document.getElementById(mapping.id)?.value;
            const storageKey = mapping.group + "_" + val;
            if (val && val !== '선택 안함' && priceData.sheetCommons[storageKey] !== undefined) {
                each += priceData.sheetCommons[storageKey];
            }
        });

        // 면지 단가 합산 로직 수정 (주문 페이지의 sync() 로직과 일치시킴)
        const facePaper = document.getElementById('prod-face-paper')?.value;
        const faceInsert = document.getElementById('prod-face-insert')?.value;
        
        if (facePaper && facePaper !== '없음' && faceInsert && faceInsert !== '없음') {
            let multiplier = 0;
            if (faceInsert.includes('4P')) multiplier = 4;
            else if (faceInsert.includes('8P')) multiplier = 8;
            
            each += (spec.face || 0) * multiplier;
        }
    }

    document.getElementById('prod-calc-cost').innerText = Math.floor(each).toLocaleString();
}

function closeProductModal() {
    document.getElementById('product-modal-overlay').classList.add('hidden');
    editingProductId = null;
}

function handleProductImageSelect(input) {
    const file = input.files[0];
    if (!file) return;

    // PDF 썸네일 생성 로직은 서버 단이나 pdf.js가 필요하므로 임시로 아이콘 대체
    if (file.type === 'application/pdf') {
        currentProductImage = null; // PDF 원본은 서버로 전송한다고 가정
        const preview = document.getElementById('prod-preview-content');
        preview.innerHTML = `
            <div class="flex flex-col items-center p-4">
                <i data-lucide="file-text" class="w-16 h-16 text-rose-500 mb-2"></i>
                <span class="text-xs font-bold text-slate-700">${file.name}</span>
                <span class="text-[10px] text-slate-400 mt-1">PDF 자동 썸네일 변환 대기중</span>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        currentProductImage = e.target.result;
        const preview = document.getElementById('prod-preview-content');
        preview.innerHTML = `<img src="${currentProductImage}" class="w-full h-full object-cover">`;
    };
    reader.readAsDataURL(file);
}

function saveProductData() {
    const getValue = (id) => document.getElementById(id)?.value || '';
    const getInt = (id) => parseInt(document.getElementById(id)?.value || 0);

    const title = getValue('prod-title').trim();
    if (!title) return alert("도서명을 입력해주세요.");

    const productData = {
        title,
        category: getValue('prod-category'),
        manager: getValue('prod-manager'),
        spec: getValue('prod-spec'),
        pages: getValue('prod-pages'),
        price: getInt('prod-price'),
        desc: getValue('prod-desc').trim(),
        customSize: getValue('prod-custom-size').trim(),
        image: currentProductImage,
        details: {
            innerPaper: getValue('prod-inner-paper'),
            innerPrint: getValue('prod-inner-print'),
            partialColor: getValue('prod-partial-color'),
            coverPaper: getValue('prod-cover-paper'),
            coverPrint: getValue('prod-cover-print'),
            coating: getValue('prod-coating'),
            binding: getValue('prod-binding'),
            wing: getValue('prod-wing'),
            facePaper: getValue('prod-face-paper'),
            faceInsert: getValue('prod-face-insert')
        }
    };

    const isEditMode = !!editingProductId;

    // 1. 메모리 데이터 즉시 반영
    if (isEditMode) {
        const index = MASTER.products.findIndex(p => p.id === editingProductId);
        if (index > -1) {
            MASTER.products[index] = { ...MASTER.products[index], ...productData };
        }
    } else {
        const newProduct = {
            id: 'PROD_' + Date.now(),
            ...productData,
            pubName: currentUserRole === 'publisher' ? (MASTER.partners[0]?.name || '출판사') : '관리자 등록',
            date: new Date().toISOString().split('T')[0]
        };
        MASTER.products.unshift(newProduct);
    }

    // 2. UI 갱신을 저장보다 먼저 실행하여 '먹통' 방지
    closeProductModal();
    renderProductList();

    // 3. 비동기로 디스크 저장 (저장 실패해도 UI는 이미 갱신됨)
    setTimeout(() => {
        saveMasterDataSilent();
        alert(isEditMode ? "도서 정보가 성공적으로 수정되었습니다." : "도서가 성공적으로 스토어 진열장에 등록되었습니다.");
    }, 50);
}

function loadProductToOrder() {
    const prodId = document.getElementById('ord-load-product').value;
    if (!prodId) return alert("불러올 도서를 선택해주세요.");

    const prod = MASTER.products.find(p => p.id === prodId);
    if (!prod) return;

    // 기본 정보 매핑
    document.getElementById('ord-book-title').value = prod.title;
    const pubName = document.getElementById('order-pub-name').value;
    // 만약 관리자 모드에서 다른 출판사를 선택한 상태라면 그대로 둠, 아니라면 제품의 출판사로 셋팅
    if (!pubName || pubName === '기본출판사') {
        document.getElementById('order-pub-name').value = prod.pubName;
        // 담당자 리스트 업데이트 로직 필요 시 추가
    }
    document.getElementById('ord-manager').value = prod.manager;

    // 사양 매핑
    document.getElementById('ord-spec').value = prod.spec;
    const customSizeInput = document.getElementById('ord-custom-size');
    if (customSizeInput) customSizeInput.value = prod.customSize || '';
    
    document.getElementById('ord-tp').value = prod.pages;
    document.getElementById('ord-cp').value = prod.details.partialColor;
    
    document.getElementById('ord-inner').value = prod.details.innerPaper;
    document.getElementById('ord-inner-print').value = prod.details.innerPrint;
    
    document.getElementById('ord-cover').value = prod.details.coverPaper;
    document.getElementById('ord-printing').value = prod.details.coverPrint;
    document.getElementById('ord-coating').value = prod.details.coating;
    document.getElementById('ord-binding').value = prod.details.binding;
    document.getElementById('ord-wing').value = prod.details.wing;

    const sheetFaceView = document.getElementById('ord-face-sheet-view');
    if (sheetFaceView) {
        const faceSelects = sheetFaceView.querySelectorAll('select');
        if(faceSelects[0]) faceSelects[0].value = prod.details.facePaper;
        if(faceSelects[1]) faceSelects[1].value = prod.details.faceInsert;
    }

    calculatePages();
    sync();
    
    alert(`[${prod.title}] 도서의 제작 사양을 성공적으로 불러왔습니다.`);
}

function renderProductList() {
    const container = document.getElementById('product-list-container');
    if (!container) return;

    // 데이터 무결성 검사: 유효한 데이터만 렌더링
    const validProducts = (MASTER.products || []).filter(p => p && p.title);

    if (validProducts.length === 0) {
        container.innerHTML = `
            <div class="col-span-4 py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                <i data-lucide="info" class="w-12 h-12 text-slate-200 mx-auto mb-4"></i>
                <p class="text-slate-400 font-bold">등록된 판매 도서가 없습니다.<br>신규 도서를 등록하여 스토어를 채워주세요.</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    container.innerHTML = validProducts.map(p => `
        <div class="bg-white rounded-[24px] border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition-all group">
            <div class="aspect-[3/4] bg-slate-100 relative overflow-hidden flex items-center justify-center">
                ${p.image ? `<img src="${p.image}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">` : `<div class="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-300"><i data-lucide="file-text" class="w-12 h-12 text-rose-300 mb-2"></i><span class="text-[10px] font-bold text-slate-400">PDF 원본</span></div>`}
                <div class="absolute top-3 left-3 bg-sky-500 text-white text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-widest">RESTORED</div>
            </div>
            <div class="p-5 space-y-3">
                <div class="flex justify-between items-center">
                    <div class="text-[10px] font-black text-sky-600 uppercase tracking-widest">${p.category || ''}</div>
                    <div class="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">${p.manager || ''}</div>
                </div>
                <h3 class="font-black text-slate-800 leading-tight h-10 overflow-hidden">${p.title}</h3>
                <div class="flex justify-between items-center pt-2 border-t border-slate-50">
                    <div class="text-xs text-slate-400 font-bold">${p.spec || ''} / ${p.pages || 0}P</div>
                    <div class="text-lg font-black text-slate-900">${(p.price || 0).toLocaleString()}원</div>
                </div>
                <div class="flex gap-2 pt-2">
                    <button onclick="editProduct('${p.id}')" class="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-all">수정</button>
                    <button onclick="deleteProduct('${p.id}')" class="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </div>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
}

function deleteProduct(id) {
    if (!confirm("정말 이 도서를 스토어에서 삭제하시겠습니까?")) return;

    // 데이터 필터링 (메모리 우선)
    MASTER.products = MASTER.products.filter(p => p && p.id !== id);
    
    // UI 먼저 갱신
    renderProductList();
    
    // 비동기 저장 및 알림
    setTimeout(() => {
        saveMasterDataSilent();
        alert("도서가 정상적으로 삭제되었습니다.");
    }, 50);
}

function editProduct(id) {
    openProductModal(id);
}


