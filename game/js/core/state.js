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
    // 이번 판에 찍은 최고 콤보와, 콤보로 벌어들인 누적 용량(MB).
    // 밸런스를 맞출 때 "콤보가 실제로 구간당 몇 MB를 보태고 있나"를 눈으로
    // 확인하려고 둔다(debug.js가 찍는다) — config.combo.killMb를 조절하는 근거.
    comboBest: 0,
    killMb: 0,
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
  // 처치 순간 사방으로 튀는 조각들(systems/juice.js가 넣고 지운다, 월드 좌표).
  particles: [],

  pointer: { x: 0, y: 0 },

  blocked: false, // A타입 때문에 업로드가 멈춰 있나
  blockedBy: [],
  attackWarning: false, // 예비동작 중인 방해꾼이 있나(곧 얻어맞는다)
  hitFlash: 0, // 방금 피해를 입어 업로드 바가 번쩍이는 남은 시간(초) — systems/upload.js의 triggerHitFeedback
  cursorDisguise: 0, // copier 안착 후 진짜 커서가 가짜와 똑같이 위장되는 남은 시간(초)

  // === 피해 피드백(systems/upload.js의 triggerHitFeedback, config.hud) ===
  vignetteMs: 0, // 화면 가장자리 빨간 비네트가 남아있는 시간(ms)
  dmgFloatText: null, // 업로드 바 옆에 뜨는 "-20%" 같은 텍스트. null이면 안 뜬다
  dmgFloatMs: 0, // 그 텍스트가 남아있는 시간(ms)
  // 매번 triggerHitFeedback()이 켤 때마다 1씩 증가. ui/statusWindow.js가 이 값이
  // "바뀌었는지"만 보고 CSS 애니를 재시작한다(remove→reflow→add) — dmgFloatMs
  // 숫자 자체는 매 프레임 감쇠하므로 "새로 켜졌다"를 값 크기로는 구분 못 한다.
  hitSeq: 0,
  fileBarGhostRatio: 0, // 방금 깎이기 직전 진행률(0~1) — 빨간 손실분으로 잠깐 남는다
  fileBarGhostMs: 0,

  // === 콤보 (systems/combo.js, config.combo) ===
  // 클릭으로 잡을 때마다 +1, 허공/bait 클릭에 끊겨 0. 피격으로는 안 끊긴다
  // (이미 진행도가 깎이는데 콤보까지 뺏으면 이중처벌 — systems/combo.js 주석 참고).
  combo: 0,
  // 콤보가 오른 순간을 알리는 신호. hitSeq와 같은 idiom이다 — 값 자체가 아니라
  // "바뀌었는지"만 보고 ui/statusWindow.js가 숫자 팝 애니를 재시작한다
  // (combo 값으로는 못 한다: 5→6→7처럼 매번 다르지만 5에서 끊겼다 다시 5가 되면
  //  값이 같아서 "새로 올랐다"를 구분 못 하는 경우가 생긴다).
  comboPopSeq: 0,
  // 배율 구간에 새로 진입한 순간의 신호 + 그때 띄울 문구("x1.5!").
  comboTierSeq: 0,
  comboTierText: null,
  comboTierMs: 0,
  // 끊긴 직후 "끊김" 연출이 남은 시간(ms). 0보다 크면 카운터가 아직 화면에
  // 남아 끊김을 보여주고, 0이 되면 사라진다.
  comboBreakMs: 0,
  comboBreakSeq: 0,

  // 파일 100% 완성 순간의 "해냈다" 연출(systems/file.js의 completeFile,
  // ui/uploadPicture.js가 소비). holdMs가 0보다 큰 동안은 다음 파일로 안
  // 넘어가고 방금 완성된 그림을 그대로 붙잡아 보여준다.
  fileCompleteHoldMs: 0,
  // triggerHitFeedback의 hitSeq와 같은 패턴 — "새로 완성됐다"는 신호. 값 자체가
  // 아니라 "바뀌었는지"만 보고 CSS 애니를 재시작(remove→reflow→add)한다.
  fileCompleteSeq: 0,

  // H키 히트박스 오버레이가 켜져 있을 때만 쌓이는 "최근 클릭 자리"({x, y, t}, 월드 좌표).
  // systems/input.js가 클릭을 월드 좌표로 바꾼 그 값을 그대로 넣고, ui/renderEnemies.js가
  // 십자선으로 그린다 — 화면에서 실제로 누른 지점과 게임이 계산한 지점이 어긋나는지
  // 한 번의 클릭으로 눈에 보이게 하려는 것이다.
  //
  // ★ 반드시 "방금 찍은 것"만 봐야 한다. 마커는 월드 좌표라, 창 크기가 바뀌면 같은
  //   월드 자리가 다른 화면 자리로 다시 그려진다 — 창을 키우면 오른쪽으로, 줄이면
  //   왼쪽으로 옮겨간 것처럼 보인다. 그건 마커가 제 할 일을 한 것이지 좌표 버그가
  //   아닌데, 리사이즈 전에 찍힌 마커를 지금 커서와 견주면 "판정이 밀린다"로 오해하기
  //   딱 좋다(실제로 그렇게 오진할 뻔했다). 그래서 t(찍힌 시각)를 같이 넣어 잠깐만
  //   보이게 하고, 창 크기가 바뀌면 ui/canvasFit.js가 통째로 비운다.
  debugClicks: [],

  stats: emptyStats(),
};
