// 이 파일 역할: 한 판의 모든 런타임 상태를 담는 단일 객체. 아무것도 import하지 않는다(순환참조 방지의 뿌리).

/** 통계는 판마다 새로 만든다. 결과 화면과 디버그 패널이 읽는다. */
export function emptyStats() {
  return {
    clicks: 0, // 놀이 영역을 클릭한 횟수
    hits: 0, // 그중 방해꾼에 맞은 횟수
    trapClicks: 0, // 함정(fake_btn)을 누른 횟수
    killed: 0,
    filesDone: 0,
    blockedSec: 0,
    drainedPct: 0,
  };
}

export const state = {
  // 'loading' | 'title' | 'select' | 'playing' | 'cleared' | 'failed'
  // ('select'는 이제 난이도 선택이 아니라 "시작/다음 구간" 대기 화면이다)
  // 'title'은 HTML 오버레이(.layer-title, ui/titleScreen.js)가 전담한다 — 캔버스는
  // 아무것도 안 그리고 클릭도 안 받는다(ui/render.js·systems/input.js의 title 가드).
  // main.js가 최초 로드 완료 시 여기로 착지시킨다(loading → title).
  phase: 'loading',
  rules: null, // 이번 판에 적용 중인 숫자 묶음 (config.createRules 결과)

  // 지금 몇 번째 구간인가. ★ 첫 구간이 0 (config.progression 주석과 같은 규칙).
  // 클리어하면 +1, 실패하면 0으로 리셋된다(core/stageManager.js).
  stageIndex: 0,

  timeLeft: 0,
  uploaded: 0, // 누적 업로드 용량(MB)
  reward: 0, // 크레딧
  file: null, // 지금 올리는 중인 파일
  nextFilePenaltyMb: 0, // hidden이 남긴 "다음 파일 -15MB" 빚
  skipsLeft: 0,

  enemies: [],
  fakeCursors: [],
  floats: [],

  pointer: { x: 0, y: 0 },

  blocked: false, // A타입 때문에 업로드가 멈춰 있나
  blockedBy: [],
  attackWarning: false, // 예비동작 중인 방해꾼이 있나(곧 얻어맞는다)
  hitFlash: 0, // 방금 주기 공격을 맞아 업로드 바가 번쩍이는 남은 시간
  cursorDisguise: 0, // copier 안착 후 진짜 커서가 가짜와 똑같이 위장되는 남은 시간(초)

  stats: emptyStats(),
};
