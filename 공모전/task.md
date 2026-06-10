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

### 신규 구현
- [x] **이지퍼비터 원가 최적화 제안 카드** (`control.js`): 신국판 50부 미만 주문 감지 → A5 33.3% 절감 제안 카드를 AI 헬퍼 패널에 동적 생성
  - [x] `checkPrintCostOptimization(bookData, qty)` 함수 신설 (L872~1036)
  - [x] 신국판(152x225mm) + qty < 50 조건 감지 로직 완성
  - [x] 절감액 및 연간 수익 향상 시뮬레이션 산출 (면당 12원→8원, 33.3% 절감)
  - [x] AI 헬퍼 패널 내 제안 카드 UI 렌더링 (그리드 비교표, 승인/거절 버튼)
  - [x] "A5 최적화 승인" 버튼 → `ctrlApproveA5Optimization()` → `startCtrlSimByBookData()` 자동 트리거 연동
  - [x] 파이프라인 완료 후 2.5초 뒤 자동 호출 훅 연결 (L771~774)
  - [x] 감사 로그(13번, 3번 에이전트) DB 기록 연동

- [x] **task.md 업데이트**
- [x] **walkthrough.md 업데이트**
