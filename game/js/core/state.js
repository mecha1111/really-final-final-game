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
  // 'loading' | 'title' | 'playing' | 'cleared' | 'failed' | 'ending'
  // (예전엔 'select'(시작/다음 구간 대기 화면)가 하나 더 있었는데, advanceStage()가
  //  곧장 startGame()으로 가게 바뀌면서 도달할 수 없게 돼 2026-09-07에 걷어냈다)
  // 'title'은 HTML 오버레이(.layer-title, ui/titleScreen.js)가 전담한다 — 캔버스는
  // 아무것도 안 그리고 클릭도 안 받는다(ui/render.js·systems/input.js의 title 가드).
  // main.js가 최초 로드 완료 시 여기로 착지시킨다(loading → title).
  // 'ending'은 유한 5구간을 전부 깼을 때만 들어간다(core/stageManager.js의
  // advanceStage() → ui/endingScreen.js의 openEnding()) — title/failed/cleared와
  // 같은 자리(HTML 오버레이가 전담, systems/input.js가 캔버스 클릭을 막는다).
  //
  // ★ 이 값은 직접 대입하지 말고 아래 setPhase()/settlePhase()로만 바꾼다 —
  //   "누가 언제 phase를 바꾸나"를 한 곳으로 모아야 아래 정착 가드가 의미를 갖는다.
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
  // 이번 구간에서 완성한 파일의 그림들 — {src, label}. systems/file.js의
  // completeFile()이 완성 순간마다 밀어 넣는다. ui/clearScreen.js가 구간 클리어
  // 화면에서 이 순서 그대로 폴라로이드로 보여준다(완성한 순서 = 등장 순서).
  completedPictures: [],
  // 방금 클리어한 판에서 "갤러리 기준 처음으로" 해금된 그림 수(core/save.js의
  // recordStageCleared 반환값을 core/stageManager.js가 여기 찍는다). 위
  // completedPictures와 다른 값이다 — 이번 판에 완성한 파일 중에는 진작
  // 해금돼 있던 그림(재획득)도 섞일 수 있어서, "진짜 새로 갤러리에 추가된
  // 것"만 세려면 세이브와 대조가 필요하다(그 대조를 하는 곳이 save.js다).
  // ui/clearScreen.js가 "새 그림 해금!" 한 줄을 보여줄지 판단하는 값.
  newUnlockedPictures: 0,

  enemies: [],
  fakeCursors: [],
  floats: [],
  // 처치 순간 사방으로 튀는 조각들(systems/juice.js가 넣고 지운다, 월드 좌표).
  particles: [],
  // 클릭할 때마다 커서 자리에 퍼지는 잔물결(systems/clickRipple.js가 넣고 지운다).
  ripples: [],

  pointer: { x: 0, y: 0 },

  // === 설정 팝업(ui/settingsPanel.js) ===
  // true인 동안 main.js의 루프가 update(dt)/updateParticles(dt)를 통째로 건너뛴다
  // (일시정지) — phase는 안 건드린다. 열려 있던 phase 그대로 돌아온다.
  settingsOpen: false,
  // 마스터/효과음/배경음 슬라이더 값(0~100). systems/sound.js·systems/bgm.js가
  // 매 프레임이 아니라 슬라이더가 바뀌는 순간에만 이 값을 읽어 각자의 볼륨 노드에
  // 반영한다(refreshSfxVolume/refreshBgmVolume).
  //
  // ★ 2026-09-06 전제 정정 — 여기 오래 붙어 있던 "localStorage는 안 쓴다(Verse8
  //   iframe/artifact 환경에서 못 쓰거나 세션마다 초기화될 수 있어 기대를 못
  //   지킨다)"는 문장은 이제 거짓이다. 제출·배포처가 Netlify(일반 도메인)로 바뀌었고
  //   Verse8 배포는 보류다 — 그래서 이 프로젝트는 localStorage를 채택했다
  //   (core/save.js가 유일한 영속 계층이다).
  //   옛 주석이 경고하던 환경 자체가 사라진 건 아니라서, 그 경우는 없애지 않고
  //   save.js가 흡수한다: 저장소가 막혀 있으면 조용히 메모리 세이브로 강등하고
  //   게임은 그대로 진행된다(그 브라우저에서만 옛 동작대로 새로고침 시 초기값).
  //   ★ 이 판단을 다시 하게 되면 "지금 어디에 배포하나"부터 확인할 것.
  //   그래서 아래 세 값은 이제 실제로 저장된다 — ui/settingsPanel.js가 조작이
  //   확정될 때마다 core/save.js에 찍고, 부팅 때 applySavedSettings()가 되돌린다.
  settings: {
    soundMaster: 100,
    soundSfx: 100,
    soundBgm: 100,
  },

  blocked: false, // A타입 때문에 업로드가 멈춰 있나
  blockedBy: [],
  attackWarning: false, // 예비동작 중인 방해꾼이 있나(곧 얻어맞는다)

  // hourglass(모래시계 함정) 발동으로 클릭 자체가 통째로 무시되는 남은 시간(초).
  // core/stageManager.js의 update()가 매 프레임 깎고, systems/input.js의
  // onPointerDown이 이 값이 남아있으면 클릭을 아예 처리하지 않는다(다른 방해꾼도
  // 전부 무시됨). 발동할 때마다 "더하지 않고 대입"만 하므로 중첩 연장되지 않는다
  // (config.enemy.hourglass.freezeSec 주석 참고).
  inputFreezeSec: 0,

  // 지금 발동 중인 환경 방해(systems/hazard.js가 넣고 뺀다). 방해꾼(state.enemies)과
  // 완전히 다른 축이다 — 클릭해서 없애는 대상이 아니라 화면·조작을 망가뜨리는 장치라,
  // 배열도 갱신 경로도 따로 둔다. 판이 끝나면 resetHazards()가 DOM째 전부 치운다
  // (core/stageManager.js의 startGame — 판을 넘어 잔존하면 안 된다).
  hazards: [],

  // popup 몸통(= X가 아닌 곳)을 잘못 누른 누적 횟수 — 개체별이 아니라 판 전체
  // 하나로 센다(systems/input.js가 올린다). config.popupHintOutline.threshold에
  // 닿으면 ui/renderEnemies.js가 살아있는 모든 popup의 X 버튼 판정 영역에 테두리
  // 힌트를 켠다 — 한 번 켜지면 그 판이 끝날 때까지 안 꺼진다(요구사항: 켜졌다
  // 꺼졌다 하면 더 헷갈린다). core/stageManager.js의 startGame()이 새 판마다 0으로
  // 되돌린다(판을 넘어 기억하지 않는다).
  popupBodyMisses: 0,

  // === 긴박 경고(systems/urgency.js, config.urgency) ===
  // 남은 시간이 얼마 없는데 할당량이 한참 못 미치면 true — ui/statusWindow.js가
  // 이 값만 보고 화면 전체(비네트·남은시간 깜빡임)의 CSS 클래스를 토글한다.
  urgent: false,
  // 반대로 할당량을 거의 다 채웠으면 true(긍정 신호, 선택 요구사항).
  nearGoal: false,
  hitFlash: 0, // 방금 피해를 입어 업로드 바가 번쩍이는 남은 시간(초) — systems/upload.js의 triggerHitFeedback
  cursorDisguise: 0, // copier 안착 후 진짜 커서가 가짜와 똑같이 위장되는 남은 시간(초)
  // ★ cursorDisguise와 다른 것 — 저건 "진짜 위치에도 가짜와 똑같은 글자를 그려서
  //   헷갈리게" 하는 copier 전용 연출이라, ui/render.js가 cursorDisguise>0이면
  //   state.pointer 자리에도 커서 글자를 하나 더 그린다. driver 환경 방해(지연
  //   커서)는 정반대로 "진짜 위치엔 아무것도 안 보이고, 늦게 따라오는 것 하나만"
  //   이어야 해서 그 그리기를 같이 타면 안 된다 — 그래서 "시스템 커서를 숨긴다"만
  //   따로 뗀 플래그를 뒀다(ui/hazards/driver.js가 켜고 끈다). ui/render.js는 이
  //   값을 cursorDisguise와 OR로 묶어 캔버스 네이티브 커서만 같이 숨긴다.
  hideSystemCursor: false,

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
  // 화면 표시는 ui/renderEnemies.js의 drawCombo가 커서 위를 따라다니며 캔버스에
  // 직접 그린다(DOM 아님) — 0/1일 땐 아예 안 그린다("x0" 표시 금지 요구사항).
  combo: 0,
  // 잡을 때마다 켜지는 "팝" 연출 남은 시간(ms) — drawCombo가 이 값으로 글자를
  // 살짝 키웠다 가라앉힌다. 끊김 전용 연출은 따로 없다(위 combo 주석 참고).
  comboPopMs: 0,

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

// ---------------------------------------------------------------------------
// phase 전이의 유일한 진입점
//
// 왜 함수로 감쌌나 — phase를 여기저기서 직접 대입하면 "늦게 도착한 대입이 이미
// 진행 중인 판을 덮어쓰는" 사고를 막을 자리가 없다. 실제로 그 구멍이 있었다:
// main.js의 applyLoadedData()는 밸런스 fetch와 이미지 프리로드를 await한 뒤에야
// 'title'을 찍는데, 그 await가 끝나기 전에 누군가 startGame()을 부르면(지금은
// 정상 흐름에 그런 경로가 없지만, 세이브 [이어하기]가 붙으면 로드 직후 바로
// startGame()을 부르게 되어 실제로 겹친다) 뒤늦은 'title' 대입이 'playing'을
// 조용히 덮어써 방해꾼 갱신이 통째로 멈춘다(update()가 playing에서만 도므로).
// ---------------------------------------------------------------------------

/** 명시적 전이 — 부르는 쪽이 "지금 이 화면으로 간다"를 확실히 아는 경우. */
export function setPhase(next) {
  state.phase = next;
}

/**
 * "아직 아무 판도 시작 안 했을 때만" 착지시킨다(단일 정착 가드).
 * 비동기 로딩이 끝나고 나서야 도착하는 'title' 착지 전용 — 그 사이에 판이
 * 이미 시작됐으면(playing/cleared/failed) 조용히 무시한다. 되돌아갈 의도가
 * 분명한 경로(리로드 버튼·메인으로·로비)는 setPhase()를 그대로 쓴다.
 * @returns {boolean} 실제로 적용됐으면 true
 */
export function settlePhase(next) {
  if (state.phase !== 'loading' && state.phase !== 'title') return false;
  state.phase = next;
  return true;
}
