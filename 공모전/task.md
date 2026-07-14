# 태스크 리스트 — 이지퍼비터 & 이원화 프로세스 2차 구현

## 이전 완료 (1~8단계 파이프라인)
- [x] 1~8단계 자율 출판 에이전트 파이프라인 전체 구현
- [x] PDF 인코딩 안정성 확보 및 표지 PDF 다운로드 구현

---

## 이번 회차 구현 목표 (계획서 승인 기반)

### 검증: 이미 구현된 항목 확인
- [x] **에이전트 통제실 이원화 보안 가드** (`control.html` L26~30): `sessionStorage` 이중 체크(isLoggedIn + userRole=admin) 완료
- [x] **새 탭 세션 유실 결함 차단**: `index.html` 링크에 `target="_blank"` 없음 확인
- [x] **살피미 키워드 로테이션 큐** (`control.js` L50~53): `CTRL_KEYWORD_ROTATION` 배열 구현 완료
- [x] **자동 건너뛰기(Auto-skip) 가드** (`control.js` L718~751): 3회 연속 실패 시 루프 안전 차단 완료
- [x] **수요 온도 배지 렌더링** (`control.js` L398~416): 🔴🟠🟡🔵 4단계 온도 배지 완료
- [x] 스토어 (`index.html`) 최고관리자(`admin`) 권한 전용 무음 B2C 자동 로그인 처리
- [x] 스토어 (`index.html`) 최고관리자 전용 ERP/통제실 바로가기 내비게이션 노출 및 마크업 구성
- [x] 심사위원(`judge`) 권한에 대한 무음 로그인 차단 검증
- [x] 최고관리자(`admin`) 로그인 시 펀딩/투표 기능 프리패스 작동 확인
- [x] `control.html` 및 `control.js` 통제실 챗봇 UI 바인딩 및 통신 연동 (완료)
- [x] `index.html` 및 `script.js` 파일 수정 (재고관리, 용지구매, 구인구직 메뉴 권한 필터링 연동) (완료)
- [x] `control.css` 및 `style.css` 말풍선 스타일 및 모바일 반응형 보정 (완료)

### 신규 구현
- [x] **이지퍼비터 원가 최적화 제안 카드** (`control.js`): 신국판 50부 미만 주문 감지 → A5 33.3% 절감 제안 카드를 AI 헬퍼 패널에 동적 생성
  - [x] `checkPrintCostOptimization(bookData, qty)` 함수 신설 (L872~1036)
  - [x] 신국판(152x225mm) + qty < 50 조건 감지 로직 완성
  - [x] 절감액 및 연간 수익 향상 시뮬레이션 산출 (면당 12원→8원, 33.3% 절감)
  - [x] AI 헬퍼 패널 내 제안 카드 UI 렌더링 (그리드 비교표, 승인/거절 버튼)
  - [x] "A5 최적화 승인" 버튼 → `ctrlApproveA5Optimization()` → `startCtrlSimByBookData()` 자동 트리거 연동
  - [x] 파이프라인 완료 후 2.5초 뒤 자동 호출 훅 연결 (L771~774)
  - [x] 감사 로그(13번, 3번 에이전트) DB 기록 연동

- [x] **RAG 이원화 지식 기지 구축 & API 패치**: Supabase HNSW 인덱스 기반 RAG 구축 및 임베딩 15개 적재 완료. Vercel API 3대 크래시 및 JSON 챗봇 노출 버그 정밀 타격 해결.
- [x] **11번 알리미 AI 마케팅 에셋 실물 UI 완공**: 통제실(`control.html`)에 카드뉴스(5장 캐러셀) 및 숏폼 비디오(성우 나레이션 + 자막 + 실시간 댄싱 오디오 이퀄라이저 애니메이션) 3단 다중 탭 연동 완료.
- [x] **베타테스트 시나리오 가이드 계획서 수립**: 실증 도서 1종 기반 [제안 승인 ➔ 자동 가조판 ➔ 유튜브 숏폼 실물 API 배포 ➔ 50부 달성 1클릭 ➔ ERP 칸반 대기]로 이어지는 모의테스트 시나리오 수립 및 마크다운 문서([베타테스트_시나리오_가이드.md](file:///c:/Users/seo%20sang%20won/001.작업파일/004. 출판친구/018. 안티그래비티/공모전/베타테스트_시나리오_가이드.md)) 신규 빌드 완료.
- [x] **task.md / walkthrough.md / 일일_업무보고서.md 업데이트**

---

## 3차 추가 구현 고도화 (마녀 실증 숏폼/카드뉴스 및 유튜브 연동)

- [x] 11번 알리미 마케팅 슬라이드 드로어 내 실증도서 '마녀' 전용 카드뉴스 5장 캐러셀 이미지 바인딩 (`control.html`/`control.js` 동적 매핑)
- [x] 11번 알리미 마케팅 슬라이드 드로어 내 실증도서 '마녀' 전용 숏폼 비디오(mp4/오디오 EQ 연동) 마크업 추가 (`control.html`/`control.js` 동적 매핑)
- [x] `control.js` 내 가조판/펀딩 단계에서 7번 그림이(삽화 창작) & 11번 알리미(쇼츠 제작) AI 로그 출력 및 LED 상태 점멸 트리거 구현
- [x] 백엔드 유튜브 업로드 API (`api/upload-shorts.js`) 연동 완성 및 Quota/에러 방어용 Mocking 폴백 장치 이식

## 4차 추가 구현 고도화 (Vercel API Limits Bypass / API 병합 리팩토링)
- [x] `api/store.js` 신설 및 `store-propose.js`, `store-vote.js` 통합 병합
- [x] `api/heal.js` 신설 및 `send-error.js`, `self-heal.js` 통합 병합
- [x] `api/store-propose.js`, `api/store-vote.js`, `api/send-error.js`, `api/self-heal.js` 물리적 삭제
- [x] `index.html` 의 제안/투표/펀딩 fetch 엔드포인트 `/api/store` 로 수정 및 body action 분기 탑재
- [x] `control.js` 의 에러유입/자가치유 fetch 엔드포인트 `/api/heal` 로 수정 및 body action 분기 탑재

## 5차 추가 구현 고도화 (실전 상용화 대량 에셋 파이프라인 및 대시보드 리뉴얼)
- [x] [1단계] 데이터베이스 기초 공사 및 RLS 보안 정책 구축 (`supabase_setup.sql` 갱신 완료, 익명 SELECT 완전 차단)
- [x] [2단계] 300종 에셋 배치 생성기 스크립트 작성 및 자막 각인 파이프라인 (`generate_assets_factory.js` 구축 완료)
- [x] [3단계] B2C 스토어 상세 팝업 개편 및 뉴스카드 책소개 캐러셀 연동 (`index.html` 모달 및 클릭 이벤트 리팩토링 완료, Vercel API 보안 프록시 경유 적용)
- [x] [4단계] B2B 관리자 통제실 대시보드 전략 관제판 리뉴얼 복원 (`control.html` 6대 지표 개편, 수집 도서 목록 팝업 창 추가 완료)
- [x] [5단계] 3번 계산이 등급별 단가 실시간 조회 공식 연동 및 예상 원화 금액 제안서 폼 적용 (`control.js` 리팩토링 완료)

## 6차 추가 구현 고도화 (방어 가드 이식 및 실전 배치 가동)
- [x] [1단계] `control.js` 내 로컬스토리지 레거시 마녀 캐시 만료 클린업 가드 장착
- [x] [2단계] `api/upload-shorts.js` 내 유튜브 API Quota 초과 예외 감시 및 12번 눈치왕 경고 감사 로그 Supabase DB 연동 가드 장착
- [ ] [3단계] 20종 대량 적재 배치 사전 기동 UAT 테스트 및 검증
