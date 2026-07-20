const pptxgen = require('pptxgenjs');
const path = require('path');

// 1. PPT 객체 생성 및 기본 레이아웃 (16:9 와이드스크린) 설정
const pptx = new pptxgen();
pptx.layout = 'LAYOUT_16x9';

// 폰트 설정 (맑은 고딕 기본 탑재)
const FONT_TITLE = 'Malgun Gothic';
const FONT_BODY = 'Malgun Gothic';

// 색상 코드 정의
const COLOR_NAVY = '0F172A';   // 메인 네이비 텍스트
const COLOR_MUTED = '334155';  // 설명 슬레이트 그레이
const COLOR_LIGHT = '64748B';  // 옅은 회색
const COLOR_BLUE = '0284C7';   // 시안 블루
const COLOR_GREEN = '059669';  // 에메랄드 그린
const COLOR_RED = 'E11D48';    // 로즈 레드
const COLOR_ORANGE = 'EA580C'; // 오렌지
const COLOR_PURPLE = '7C3AED'; // 퍼플
const COLOR_GRAY_LINE = 'E2E8F0'; // 얇은 회색 구분선

// ==========================================
// [SLIDE 1] 표지 (시간 여행이 불가능한 이유)
// ==========================================
let slide1 = pptx.addSlide();

// 대badge
slide1.addText('PHYSICS SEMINAR', {
  x: 1.0, y: 1.8, w: 6.0, h: 0.4,
  fontFace: FONT_TITLE, fontSize: 13, bold: true, color: COLOR_BLUE,
  align: 'left'
});

// 대제목
slide1.addText('시간 여행이\n불가능한 이유', {
  x: 1.0, y: 2.3, w: 7.0, h: 1.8,
  fontFace: FONT_TITLE, fontSize: 52, bold: true, color: COLOR_NAVY,
  align: 'left', lineSpacing: 62
});

// 소제목
slide1.addText('현대 물리학과 열역학으로 파헤치는 시공간의 한계', {
  x: 1.0, y: 4.3, w: 7.0, h: 0.5,
  fontFace: FONT_BODY, fontSize: 20, color: COLOR_MUTED,
  align: 'left'
});

// 작성자
slide1.addText('[학년 / 반 / 이름 입력]', {
  x: 1.0, y: 6.0, w: 4.0, h: 0.4,
  fontFace: FONT_BODY, fontSize: 14, bold: true, color: COLOR_LIGHT,
  align: 'left'
});

// 우측 웜홀 추상 도형 그래픽들 (겹쳐진 타원 궤도)
slide1.addShape(pptx.shapes.OVAL, {
  x: 8.5, y: 1.5, w: 3.8, h: 3.8,
  fill: { color: 'FFFFFF' },
  line: { color: COLOR_BLUE, width: 1, dashType: 'dash' }
});
slide1.addShape(pptx.shapes.OVAL, {
  x: 9.1, y: 2.1, w: 2.6, h: 2.6,
  fill: { color: 'FFFFFF' },
  line: { color: COLOR_BLUE, width: 1.5 }
});
slide1.addShape(pptx.shapes.OVAL, {
  x: 10.1, y: 3.1, w: 0.6, h: 0.6,
  fill: { color: COLOR_BLUE },
  line: { color: 'FFFFFF', width: 2 }
});

// ==========================================
// [SLIDE 2] 시간 여행의 두 갈래 길
// ==========================================
let slide2 = pptx.addSlide();

// 슬라이드 타이틀
slide2.addText('시간 여행의 두 갈래 길: 미래 vs 과거', {
  x: 0.8, y: 0.6, w: 10.0, h: 0.6,
  fontFace: FONT_TITLE, fontSize: 36, bold: true, color: COLOR_NAVY
});

// 중앙 수직 구분선
slide2.addShape(pptx.shapes.LINE, {
  x: 6.66, y: 1.8, w: 0, h: 4.6,
  line: { color: COLOR_GRAY_LINE, width: 2 }
});

// 좌측: 미래 여행
slide2.addText('🚀 미래 여행 (Future)', {
  x: 1.0, y: 2.0, w: 4.8, h: 0.5,
  fontFace: FONT_TITLE, fontSize: 28, bold: true, color: COLOR_GREEN
});
slide2.addText('[ 조건부 가능 ]', {
  x: 1.0, y: 2.5, w: 4.8, h: 0.4,
  fontFace: FONT_TITLE, fontSize: 15, bold: true, color: COLOR_GREEN
});
slide2.addText('움직이는 대상의 시간은 느리게 흐릅니다(상대성 이론).\n이 시간 지연을 이용해 미래로 도약하는 편도선 여행은 물리학적으로 이미 검증된 사실입니다.', {
  x: 1.0, y: 3.2, w: 4.8, h: 2.0,
  fontFace: FONT_BODY, fontSize: 17, color: COLOR_MUTED,
  lineSpacing: 26
});

// 우측: 과거 여행
slide2.addText('↩️ 과거 여행 (Past)', {
  x: 7.2, y: 2.0, w: 4.8, h: 0.5,
  fontFace: FONT_TITLE, fontSize: 28, bold: true, color: COLOR_RED
});
slide2.addText('[ 절대 불가능 ]', {
  x: 7.2, y: 2.5, w: 4.8, h: 0.4,
  fontFace: FONT_TITLE, fontSize: 15, bold: true, color: COLOR_RED
});
slide2.addText("시간을 뒤로 감는 것은 우주의 근본 논리 체계를 뒤흔듭니다. 원인이 결과보다 항상 앞서야 하는 '인과율'이 과거행 경로를 영구 차단합니다.", {
  x: 7.2, y: 3.2, w: 4.8, h: 2.0,
  fontFace: FONT_BODY, fontSize: 17, color: COLOR_MUTED,
  lineSpacing: 26
});

// 작성자 / 페이지 정보
slide2.addText('[학년 / 반 / 이름 입력]', { x: 0.8, y: 6.6, w: 3.0, h: 0.3, fontFace: FONT_BODY, fontSize: 11, color: COLOR_LIGHT });
slide2.addText('02', { x: 12.0, y: 6.6, w: 0.5, h: 0.3, fontFace: FONT_TITLE, fontSize: 13, bold: true, color: COLOR_LIGHT, align: 'right' });


// ==========================================
// [SLIDE 3] 미래 여행: 시간 지연과 광속의 한계
// ==========================================
let slide3 = pptx.addSlide();

slide3.addText('미래 여행: 시간 지연과 광속의 한계', {
  x: 0.8, y: 0.6, w: 10.0, h: 0.6,
  fontFace: FONT_TITLE, fontSize: 36, bold: true, color: COLOR_NAVY
});

// 좌측: 손목시계 비유
slide3.addText('🏃‍♂️ 달리기 시합과 손목시계', {
  x: 1.0, y: 1.8, w: 5.0, h: 0.4,
  fontFace: FONT_TITLE, fontSize: 24, bold: true, color: COLOR_BLUE
});

// 우주선 궤도선 비주얼 라인
slide3.addShape(pptx.shapes.LINE, {
  x: 1.0, y: 2.6, w: 4.5, h: 0,
  line: { color: COLOR_BLUE, width: 2, dashType: 'dash' }
});
slide3.addText('🚀', { x: 3.0, y: 2.2, w: 0.5, h: 0.4, fontSize: 24 });

slide3.addText("광속 우주선을 탄 친구는 겨우 '하루' 동안 달렸을 뿐인데, 지구의 달력은 이미 '일주일'이 지나 있습니다. 친구는 지구 기준 미래의 영역으로 혼자 튀어 올라온 셈입니다.", {
  x: 1.0, y: 3.3, w: 4.8, h: 2.2,
  fontFace: FONT_BODY, fontSize: 17, color: COLOR_MUTED,
  lineSpacing: 26
});

// 세로 구분선
slide3.addShape(pptx.shapes.LINE, {
  x: 6.66, y: 1.8, w: 0, h: 4.6,
  line: { color: COLOR_GRAY_LINE, width: 1.5 }
});

// 우측: 특수 상대성 이론 공식
slide3.addText('⚛️ 특수 상대성 이론 공식', {
  x: 7.2, y: 1.8, w: 5.0, h: 0.4,
  fontFace: FONT_TITLE, fontSize: 24, bold: true, color: COLOR_NAVY
});

// 거대 공식 텍스트
slide3.addText("t'  =  t   /   √(1 - v²/c²)", {
  x: 7.2, y: 2.5, w: 5.0, h: 0.8,
  fontFace: 'Orbitron', fontSize: 34, bold: true, color: COLOR_BLUE,
  align: 'center'
});

// 공식 요약 텍스트
slide3.addText("⚡ 속도(v)가 빛의 속도(c)에 근접할수록 우주선 내부 시간(t')은 지구(t)보다 정체됩니다.\n\n⚡ 단, 광속에 도달하려면 우주선에 무한한 에너지(기름값)가 소모되므로 현실적 한계가 존재합니다.", {
  x: 7.2, y: 3.7, w: 4.8, h: 2.2,
  fontFace: FONT_BODY, fontSize: 15.5, color: COLOR_MUTED,
  lineSpacing: 23
});

slide3.addText('[학년 / 반 / 이름 입력]', { x: 0.8, y: 6.6, w: 3.0, h: 0.3, fontFace: FONT_BODY, fontSize: 11, color: COLOR_LIGHT });
slide3.addText('03', { x: 12.0, y: 6.6, w: 0.5, h: 0.3, fontFace: FONT_TITLE, fontSize: 13, bold: true, color: COLOR_LIGHT, align: 'right' });


// ==========================================
// [SLIDE 4] 과거 여행이 물리적으로 불가한 이유 (타임라인)
// ==========================================
let slide4 = pptx.addSlide();

slide4.addText('과거 여행이 물리적으로 불가한 이유', {
  x: 0.8, y: 0.6, w: 10.0, h: 0.6,
  fontFace: FONT_TITLE, fontSize: 36, bold: true, color: COLOR_NAVY
});

// 수평 타임라인 가로 축선 (y = 4.2 지점)
slide4.addShape(pptx.shapes.LINE, {
  x: 1.0, y: 4.2, w: 11.3, h: 0,
  line: { color: COLOR_GRAY_LINE, width: 4 },
  lineHead: 'arrow'
});

// 노드 1 (쏟아진 우유 - 주황색 원, y축선 상에 정확히 박힘)
slide4.addShape(pptx.shapes.OVAL, {
  x: 3.8, y: 4.08, w: 0.24, h: 0.24,
  fill: { color: COLOR_ORANGE },
  line: { color: 'FFFFFF', width: 2 }
});
// 수직 연결 점선 (동그라미 위로 연장)
slide4.addShape(pptx.shapes.LINE, {
  x: 3.92, y: 3.0, w: 0, h: 1.0,
  line: { color: COLOR_ORANGE, width: 1.5, dashType: 'dash' }
});
// 상단 카드 설명 (y = 1.0)
slide4.addText('🧹 쏟아진 우유와 엔트로피', {
  x: 1.0, y: 0.9, w: 5.0, h: 0.4,
  fontFace: FONT_TITLE, fontSize: 21, bold: true, color: COLOR_ORANGE,
  align: 'center'
});
slide4.addText('우유를 바닥에 쏟으면 사방으로 퍼지지만, 가만히 둔다고 스스로 다시 컵에 담기지는 않습니다. 우주도 똑같이 무질서도가 늘어나는 한 방향으로만 흐릅니다 (열역학 제2법칙).', {
  x: 1.0, y: 1.4, w: 5.0, h: 1.4,
  fontFace: FONT_BODY, fontSize: 15, color: COLOR_MUTED,
  align: 'center', lineSpacing: 22
});


// 노드 2 (빛의 한계 - 로즈 레드 원, y축선 상에 정확히 박힘)
slide4.addShape(pptx.shapes.OVAL, {
  x: 9.0, y: 4.08, w: 0.24, h: 0.24,
  fill: { color: COLOR_RED },
  line: { color: 'FFFFFF', width: 2 }
});
// 수직 연결 점선 (동그라미 아래로 연장)
slide4.addShape(pptx.shapes.LINE, {
  x: 9.12, y: 4.38, w: 0, h: 1.0,
  line: { color: COLOR_RED, width: 1.5, dashType: 'dash' }
});
// 하단 카드 설명 (y = 5.4)
slide4.addText('👤 그림자 잡기와 빛의 한계', {
  x: 6.8, y: 5.4, w: 5.0, h: 0.4,
  fontFace: FONT_TITLE, fontSize: 21, bold: true, color: COLOR_RED,
  align: 'center'
});
slide4.addText('거울에 반사되어 도망치는 내 그림자보다 내가 더 빨리 뛸 순 없듯이, 우주의 그 어떤 물질과 정보도 우주 최고 한계선인 빛의 속도(c)보다 빨라질 순 없습니다.', {
  x: 6.8, y: 5.9, w: 5.0, h: 1.2,
  fontFace: FONT_BODY, fontSize: 15, color: COLOR_MUTED,
  align: 'center', lineSpacing: 22
});

slide4.addText('[학년 / 반 / 이름 입력]', { x: 0.8, y: 6.6, w: 3.0, h: 0.3, fontFace: FONT_BODY, fontSize: 11, color: COLOR_LIGHT });
slide4.addText('04', { x: 12.0, y: 6.6, w: 0.5, h: 0.3, fontFace: FONT_TITLE, fontSize: 13, bold: true, color: COLOR_LIGHT, align: 'right' });


// ==========================================
// [SLIDE 5] 논리적 모순: 할아버지 역설과 보호막
// ==========================================
let slide5 = pptx.addSlide();

slide5.addText('논리적 모순: 할아버지 역설과 보호막', {
  x: 0.8, y: 0.6, w: 10.0, h: 0.6,
  fontFace: FONT_TITLE, fontSize: 36, bold: true, color: COLOR_NAVY
});

// 좌측: 치킨 역설
slide5.addText('🍗 치킨 역설 (할아버지 역설)', {
  x: 1.0, y: 1.8, w: 5.0, h: 0.4,
  fontFace: FONT_TITLE, fontSize: 24, bold: true, color: COLOR_ORANGE
});
slide5.addText('어제 치킨 가게 사장님의 개업을 막기 위해 과거로 돌아가 훼방을 놓았습니다. 그렇다면 오늘 내가 맛있게 먹은 치킨은 어디서 온 것일까요?\n\n이처럼 내가 태어나기 전 과거의 원인을 바꾸려 할 때 발생하는 모순이며, 우주는 원인이 결과를 앞서야 한다는 인과율(Causality)을 보호합니다.', {
  x: 1.0, y: 2.5, w: 4.8, h: 3.5,
  fontFace: FONT_BODY, fontSize: 16, color: COLOR_MUTED,
  lineSpacing: 26
});

// 세로 구분선
slide5.addShape(pptx.shapes.LINE, {
  x: 6.66, y: 1.8, w: 0, h: 4.6,
  line: { color: COLOR_GRAY_LINE, width: 1.5 }
});

// 우측: 시간 순서 보호 가설
slide5.addText('🛡️ 시간 순서 보호 가설 (우주의 모순 방어막)', {
  x: 7.2, y: 1.8, w: 5.0, h: 0.4,
  fontFace: FONT_TITLE, fontSize: 24, bold: true, color: COLOR_PURPLE
});
slide5.addText('스티븐 호킹 박사는 우주가 논리 오류(시간 모순)를 감지하고 스스로를 지키는 방패를 작동한다고 주장했습니다.\n\n과거로 가는 웜홀이 만들어지려는 찰나의 순간, 가상 입자와 빛이 통로를 돌며 마이크 하울링처럼 무한 폭주하여 웜홀 장치 자체가 폭발해 붕괴한다는 이론입니다.', {
  x: 7.2, y: 2.5, w: 4.8, h: 3.5,
  fontFace: FONT_BODY, fontSize: 16, color: COLOR_MUTED,
  lineSpacing: 26
});

slide5.addText('[학년 / 반 / 이름 입력]', { x: 0.8, y: 6.6, w: 3.0, h: 0.3, fontFace: FONT_BODY, fontSize: 11, color: COLOR_LIGHT });
slide5.addText('05', { x: 12.0, y: 6.6, w: 0.5, h: 0.3, fontFace: FONT_TITLE, fontSize: 13, bold: true, color: COLOR_LIGHT, align: 'right' });


// ==========================================
// [SLIDE 6] 피날레
// ==========================================
let slide6 = pptx.addSlide();

// 장표 중앙 대제목
slide6.addText('시간 여행은 기술의 한계 때문이 아닙니다.', {
  x: 1.0, y: 2.0, w: 11.3, h: 0.8,
  fontFace: FONT_TITLE, fontSize: 40, bold: true, color: COLOR_BLUE,
  align: 'center'
});

// 쏟아진 우유 인용 수미상관 마무리 멘트
slide6.addText("앞서 살펴본 '쏟아진 우유의 법칙(열역학 법칙)'과 '원인과 결과의 규칙(인과율)'이 과거로 가는 문을 꽁꽁 닫아 두었기 때문입니다.\n\n결국 우리가 할 수 있는 진짜 가장 멋진 시간 여행은, 바로 지금 이 순간인 '현재'를 열심히 살아가는 거라고 생각합니다.", {
  x: 1.5, y: 3.2, w: 10.3, h: 2.0,
  fontFace: FONT_BODY, fontSize: 21, color: COLOR_MUTED,
  align: 'center', lineSpacing: 32
});

// 감사 인사
slide6.addText('경청해 주셔서 감사합니다. 질문이 있으시면 말씀해 주세요!', {
  x: 1.0, y: 5.6, w: 11.3, h: 0.5,
  fontFace: FONT_BODY, fontSize: 19, bold: true, color: COLOR_LIGHT,
  align: 'center'
});

slide6.addText('[학년 / 반 / 이름 입력]', { x: 0.8, y: 6.6, w: 3.0, h: 0.3, fontFace: FONT_BODY, fontSize: 11, color: COLOR_LIGHT });
slide6.addText('06', { x: 12.0, y: 6.6, w: 0.5, h: 0.3, fontFace: FONT_TITLE, fontSize: 13, bold: true, color: COLOR_LIGHT, align: 'right' });


// ==========================================
// [SLIDE 7] Q&A (2x2 그리드)
// ==========================================
let slide7 = pptx.addSlide();

slide7.addText('자주 묻는 질문 & 모범 답변 (Q&A)', {
  x: 0.8, y: 0.6, w: 10.0, h: 0.6,
  fontFace: FONT_TITLE, fontSize: 36, bold: true, color: COLOR_NAVY
});

// 가로 구분 점선 (y = 4.35)
slide7.addShape(pptx.shapes.LINE, {
  x: 1.0, y: 4.35, w: 11.3, h: 0,
  line: { color: COLOR_GRAY_LINE, width: 1.5, dashType: 'dash' }
});

// 세로 구분 점선 (x = 6.66)
slide7.addShape(pptx.shapes.LINE, {
  x: 6.66, y: 1.6, w: 0, h: 4.8,
  line: { color: COLOR_GRAY_LINE, width: 1.5, dashType: 'dash' }
});

// 1. 좌상 Q1
slide7.addText('Q1. 웜홀이나 워프 등 공간 도약으로 과거로 갈 수 없나요?', {
  x: 1.0, y: 1.7, w: 5.0, h: 0.4,
  fontFace: FONT_TITLE, fontSize: 17, bold: true, color: COLOR_BLUE
});
slide7.addText('답변: 공간을 접는 웜홀 통로 자체는 열릴 수 있으나 통과는 불가합니다. 웜홀이 생성되려는 찰나 미세 에너지가 통로를 타고 무한 하울링되어 웜홀 장치 자체가 스스로 폭발해 자멸하게 되기 때문입니다 (시간 순서 보호 가설).', {
  x: 1.0, y: 2.2, w: 5.0, h: 1.8,
  fontFace: FONT_BODY, fontSize: 14.5, color: COLOR_MUTED,
  lineSpacing: 22
});

// 2. 우상 Q2
slide7.addText('Q2. 에어컨으로 방이 정돈되면 시간이 되돌아간 건가요?', {
  x: 7.2, y: 1.7, w: 5.0, h: 0.4,
  fontFace: FONT_TITLE, fontSize: 17, bold: true, color: COLOR_BLUE
});
slide7.addText('답변: 내 방 안의 분자가 정돈(엔트로피 감소)되더라도, 실외기가 바깥 우주로 훨씬 더 많은 뜨거운 열(무질서)을 방출했습니다. 우주 전체의 무질서도는 언제나 늘어나므로 시간의 방향은 뒤집히지 않습니다.', {
  x: 7.2, y: 2.2, w: 5.0, h: 1.8,
  fontFace: FONT_BODY, fontSize: 14.5, color: COLOR_MUTED,
  lineSpacing: 22
});

// 3. 좌하 Q3
slide7.addText('Q3. 과거 여행은 안 되는데 미래 여행은 왜 역설이 없나요?', {
  x: 1.0, y: 4.5, w: 5.0, h: 0.4,
  fontFace: FONT_TITLE, fontSize: 17, bold: true, color: COLOR_BLUE
});
slide7.addText('답변: 미래 여행(시간 지연)은 단순히 시간의 흐름 속도를 다르게 조정했을 뿐, 지구의 과거 역사를 훼손하지 않습니다. 원인이 결과를 앞선다는 우주 고유의 인과율 규칙을 깨뜨리지 않아 안전합니다.', {
  x: 1.0, y: 5.0, w: 5.0, h: 1.8,
  fontFace: FONT_BODY, fontSize: 14.5, color: COLOR_MUTED,
  lineSpacing: 22
});

// 4. 우하 Q4
slide7.addText('Q4. 광속을 넘으면 공식상 허수 시간이 되는데 무슨 뜻인가요?', {
  x: 7.2, y: 4.5, w: 5.0, h: 0.4,
  fontFace: FONT_TITLE, fontSize: 17, bold: true, color: COLOR_BLUE
});
slide7.addText('답변: 허수 시간(i)은 현실 세계에서는 측정하거나 느낄 수 없는 가상의 값입니다. 이는 질량을 가진 물질(우리)이 우주의 물리적인 절대 한계선인 빛의 속도를 돌파할 수 없음을 말해 줍니다.', {
  x: 7.2, y: 5.0, w: 5.0, h: 1.8,
  fontFace: FONT_BODY, fontSize: 14.5, color: COLOR_MUTED,
  lineSpacing: 22
});

slide7.addText('[학년 / 반 / 이름 입력]', { x: 0.8, y: 6.6, w: 3.0, h: 0.3, fontFace: FONT_BODY, fontSize: 11, color: COLOR_LIGHT });
slide7.addText('07', { x: 12.0, y: 6.6, w: 0.5, h: 0.3, fontFace: FONT_TITLE, fontSize: 13, bold: true, color: COLOR_LIGHT, align: 'right' });


// ==========================================
// 2. 파일 저장 실행
// ==========================================
const outputFilePath = path.join(__dirname, '시간여행이_불가능한_이유.pptx');
pptx.writeFile({ fileName: outputFilePath })
  .then(() => {
    console.log(`PPTX 파일 빌드 성공: ${outputFilePath}`);
  })
  .catch(err => {
    console.error('PPTX 파일 빌드 실패:', err);
  });
