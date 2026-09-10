// 이 파일 역할: 판의 시작/진행/승패를 총괄한다. 매 프레임 각 시스템을 정해진 순서로 부르는 지휘자.

import { config, gameData, createRules, getUiScaleFactor } from '../config.js';
import { state, emptyStats, setPhase } from './state.js';
import { recordStageCleared, recordGameOver, recordRunCompleted, recordEnemyEncounter } from './save.js';
import { openEnding } from '../ui/endingScreen.js';
import { resetRoverQueue } from '../ui/rover.js';
import { Spawner, buildPool, aliveHeadcount, aliveTypeSet } from '../enemies/spawner.js';
import { splitEnemy, applyExpiryEffect, triggerSelfDestruct, updateFakeCursors } from '../enemies/effects.js';
import { clearJuice } from '../systems/juice.js';
import { clearRipples } from '../systems/clickRipple.js';
import { clearShake } from '../systems/screenShake.js';
import { updateUpload, resetUploadEdges } from '../systems/upload.js';
import { resetOverloadEdges } from '../systems/overload.js';
import { updateUrgency, resetUrgencyEdges } from '../systems/urgency.js';
import { updateHazards, resetHazards } from '../systems/hazard.js';
import { grantFile } from '../systems/file.js';
import { playSfx, SFX } from '../systems/sound.js';
import { updateFloats, clearFloats } from '../systems/floats.js';
import { updateCombo, clearCombo } from '../systems/combo.js';
import { recordPointer, resetTrail } from '../systems/pointerTrail.js';
import { resetWindowPositions } from '../ui/desktop.js';
import { showInfiniteBanner } from '../ui/infiniteBanner.js';
import { bindRules } from '../debug.js';

const spawner = new Spawner();

// 제한시간 임박 똑딱의 "직전 초" 기억. 값이 바뀔 때만(1초에 1회) 내기 위한 빗장이다.
let lastTickSec = null;

/**
 * 놀이 영역 = 바탕화면에서 작업표시줄을 뺀 만큼. 방해꾼이 그 안을 활보한다.
 * HUD가 캔버스에서 HTML 창(ui/statusWindow.js)으로 옮겨가면서 위쪽을
 * 비워둘 이유가 없어졌다 — 창과 겹치면 "창이 위" 규칙으로 방해꾼이 뒤로 지나간다.
 *
 * ★ 아래쪽 작업표시줄 높이만큼은 비운다(XP 디자인 가이드 §4-1 ③). 작업표시줄이
 *   캔버스보다 위 레이어라(style.css의 .layer-taskbar, z6) 안 비우면 그 띠에 있는
 *   방해꾼이 작업표시줄 뒤에 가려 안 보이게 된다. 반대로 예전처럼 캔버스가 위였을
 *   땐 방해꾼이 작업표시줄을 덮어서 작업표시줄이 "사라진" 것처럼 보였다 —
 *   둘 중 하나는 반드시 가려지므로, 겹치지 않게 영역을 나누는 쪽으로 정리했다.
 *
 * ★ 높이 환산: config.desktop.taskbarPx는 #desktop의 1920 기준 px이고 놀이 영역은
 *   논리 해상도(config.canvas, 시트의 canvas_w/h)라 단위가 다르다. 둘을 잇는
 *   비율이 곧 getUiScaleFactor()(= canvas.width / uiBaseWidth)다 — HUD·결과 화면이
 *   1920 기준 좌표를 실제 캔버스로 옮길 때 쓰는 것과 같은 환산이라, 시트에서
 *   해상도를 바꿔도 저절로 따라온다.
 */
export function getPlayArea() {
  const taskbarWorldPx = config.desktop.taskbarPx * getUiScaleFactor();
  return { x: 0, y: 0, w: config.canvas.width, h: config.canvas.height - taskbarWorldPx };
}

/**
 * 구간 n으로 새 판을 시작한다. ★ 첫 구간이 n = 0.
 * 난이도 선택은 없어졌고, n이 오를수록 createRules의 공식이 알아서 조인다.
 *
 * @param {number} stageIndex
 * @param {{tutorial?: boolean}} [opts]
 *   tutorial — ★인게임 튜토리얼을 얹은 채로 시작한다(ui/gameOpening.js가 첫 판에만 준다).
 *     판을 정상적으로 다 차린 뒤 게이트만 켜는 것이라, 화면은 실전과 똑같고
 *     "시간이 안 흐르고 스폰이 안 되는" 것만 다르다. 게이트를 읽는 곳은
 *     core/state.js의 state.tutorial 주석에 모아뒀다.
 *     ★ 다음 구간·재도전은 opts 없이 부르므로 저절로 꺼진다(아래 대입이 매번 덮는다).
 */
export function startGame(stageIndex = 0, opts) {
  const n = Math.max(0, Math.floor(stageIndex));
  state.stageIndex = n;

  // ★ 판을 차리기 "전"에 정한다 — 아래 grantFile()/setPhase('playing') 이후로는
  //   이미 첫 프레임이 돌 수 있는 상태라, 그때 게이트가 꺼져 있으면 한 프레임
  //   분량의 스폰·시간이 새어 들어간다.
  state.tutorial.active = !!opts?.tutorial;
  state.tutorial.uploadAuto = true;
  // 시연 단계가 열어주기 전까지는 캔버스 클릭을 안 받는다 — 렉 연출이 도는 동안
  // 아래 판이 이미 살아있기 때문이다(예전엔 판 자체가 없어서 이 문제가 없었다).
  state.tutorial.blockClicks = state.tutorial.active;

  const rules = createRules(n);
  state.rules = rules;
  bindRules(rules); // 디버그 슬라이더를 이번 판의 숫자에 연결

  state.timeLeft = rules.timeLimit;
  state.uploaded = 0;
  state.reward = 0;
  state.nextFilePenaltyMb = 0;
  state.completedPictures = []; // 지난 구간에 완성한 그림 목록을 새 구간으로 안 넘긴다
  state.newUnlockedPictures = 0; // 지난 클리어 화면의 "새 그림 해금!" 표시가 다음 판까지 새지 않게
  state.enemies = [];
  state.fakeCursors = [];
  state.blocked = false;
  state.blockedBy = [];
  state.attackWarning = false;
  state.cursorDisguise = 0;
  // hourglass 조작 불능 잔여가 새 판까지 새어 들어가지 않게(부활 대기 zombie가
  // 새 판으로 안 넘어가는 것과 같은 이유 — 아래 state.enemies = [] 참고).
  state.inputFreezeSec = 0;
  // popup 몸통 오클릭 누적도 판을 넘어 기억하면 안 된다(요구사항) — 새 판은
  // 항상 힌트 테두리가 꺼진 상태로 시작한다.
  state.popupBodyMisses = 0;
  state.urgent = false;
  state.nearGoal = false;
  // 완료 연출 홀드 중에 재도전 등으로 판이 바로 다시 시작되면, 남은 홀드가
  // 새 판까지 새어 들어가 updateUpload()가 새 판 첫 몇 프레임을 "완료 연출
  // 유지 중"으로 착각해 건너뛸 수 있다 — 여기서 확실히 끊는다.
  state.fileCompleteHoldMs = 0;
  state.stats = emptyStats();
  clearCombo(); // 지난 판의 콤보와 그 연출이 새 판 첫 프레임에 남지 않게
  clearFloats();
  clearJuice(); // 지난 판의 터진 조각·히트스톱이 새 판 첫 프레임에 남지 않게
  clearRipples(); // 지난 판의 클릭 리플이 새 판 첫 프레임에 남지 않게
  clearShake(); // 흔들리다 판이 바뀌면 그 잔여 흔들림이 새 판으로 새어 들어간다
  resetTrail(); // 지난 판의 마우스 궤적이 새 판의 가짜 커서에 섞여 들어가지 않게
  resetWindowPositions(); // 드래그로 옮긴 창·개그 팝업 위치가 다음 회차까지 남지 않게
  // 정지·공격예고 소리의 "직전 프레임 기억"을 끊는다 — 정지된 채로 판이 끝났으면
  // 그 기억이 남아 새 판의 첫 정지에서 소리가 안 난다(systems/upload.js 주석 참고).
  resetUploadEdges();
  // 과밀 지지직(overload) 엣지 기억도 끊는다 — 과밀 상태로 판이 끝났다가 새 판에서
  // 마리수가 0이 되면 "해제음"이 엉뚱하게 판 시작에 날 수 있다.
  resetOverloadEdges();
  // 긴박 경고 엣지 기억도 끊는다 — 위험 상태로 판이 끝났다가 새 판 첫 프레임에
  // 엉뚱하게 "위험!" 소리가 다시 나는 걸 막는다(위 두 resetEdges와 같은 이유).
  resetUrgencyEdges();
  // 환경 방해도 판을 넘어 남으면 안 된다 — 떠 있던 대화상자/오버레이를 DOM째 치우고
  // 스케줄러(유예·쿨타임·직전 종류 기억)까지 처음으로 되돌린다. 위 resetXxxEdges들과
  // 같은 이유·같은 자리다.
  resetHazards();
  // 튜토리얼 도우미(러버)도 판을 넘어 남으면 안 된다 — 지난 판에서 표시 중이었거나
  // 큐에 밀려 있던 팁이 새 판 첫 프레임에 뜨는 걸 막는다(위 resetHazards와 같은 자리).
  resetRoverQueue();
  lastTickSec = null; // 시간 임박 똑딱 빗장 리셋

  spawner.reset(rules);
  grantFile();
  setPhase('playing');
  // ★ 튜토리얼이 얹힌 판에서는 여기서 안 낸다 — 이 소리는 "이제 시작한다"는 신호인데,
  //   튜토리얼이 붙으면 실제 시작은 [업데이트 재개]를 누른 뒤다. 그 자리에서
  //   ui/gameOpening.js가 대신 낸다(그래서 회차와 무관하게 판당 정확히 1회).
  if (!state.tutorial.active) playSfx(SFX.START);
  // 무한 1층(정확히 그 진입 순간만) — "새로운 방해가 추가됩니다" 1회 안내
  // (ui/infiniteBanner.js). n===finiteCount라 무한 2층 이상·유한 5구간에선
  // 안 뜬다 — 1층에서 이미 18종이 전부 열리므로 그 다음부터는 더 알릴 신규가 없다.
  if (n === config.stage.finiteCount) showInfiniteBanner();

  // ★ 2026-09-07: 여기 있던 "첫 게임 시작" 팁(showTip('first_game', …))을 걷어냈다.
  //   플레이 중 좌하단에서 뜨는 안내는 방해꾼이 날뛰는 와중이라 아무도 안 읽었다 —
  //   튜토리얼로 기능하지 못했다는 뜻이다. 조작 설명은 이제 게임에 들어오기 전
  //   게임 시작 오프닝의 도우미 튜토리얼(ui/gameOpening.js, 2026-09-08 이전엔
  //   ui/intro.js였다)이 전담한다.
  //   위 resetRoverQueue()는 그대로 남는다 — ui/rover.js 모듈 자체는 살아 있고
  //   (디버그 손잡이 __game.showTip으로 여전히 부를 수 있다), 판을 넘어 큐가
  //   새는 걸 막는 이 리셋은 그 경로에서도 여전히 옳다.
}

/**
 * ★튜토리얼을 걷고 실전을 시작한다 — [업데이트 재개]와 [건너뛰기]가 둘 다 여기로 모인다
 * (ui/gameOpening.js의 finish). 판은 이미 돌고 있으므로 "시작"이 아니라 "해제"다.
 *
 * ★나가는 길이 여럿이라 한 함수에 모은다 — 게이트가 세 개(state.tutorial)에
 *   마리별 동결(enemy.tutorialFrozen)까지 있어서, 한 군데라도 빠뜨리면 실전이
 *   시작됐는데 시간이 안 흐르거나 방해꾼이 영영 안 때리는 상태로 굳는다.
 *   그런 종류의 사고를 이 프로젝트는 이미 겪었다(resetHazards가 startGame에만
 *   걸려 있어서 판이 끝날 때 아무도 안 치우던 그 건 — initHazards 주석).
 */
export function releaseTutorial() {
  if (!state.tutorial.active) return;

  state.tutorial.active = false;
  state.tutorial.uploadAuto = true;
  state.tutorial.blockClicks = false;
  // 시연용으로 동결해둔 놈들을 전부 푼다 — 이 프레임부터 수명이 흐르고 때리기
  // 시작한다. 남겨두기로 한 놈(마지막 단계의 bait)도 여기서 같이 풀려, 실전에
  // 들어간 뒤에는 평범한 bait와 완전히 같아진다.
  for (const enemy of state.enemies) enemy.tutorialFrozen = false;

  // ★제한시간을 꽉 채워 되돌린다. 튜토리얼 동안 시간은 애초에 안 흘렀으므로
  //   (update()의 게이트) 보통은 이미 timeLimit 그대로고, 이 줄은 "튜토리얼에
  //   시간을 한 톨도 안 쓴다"를 값으로 못박는 보증이다.
  //   ★깎인 진행바는 일부러 안 되돌린다 — "놔두면 되돌아간다"를 실제로 당해서
  //   배우는 게 그 단계의 전부인데, 조용히 복구해버리면 교훈이 무효가 된다.
  //   대신 그 손해가 실전 성적에 남지 않도록 시간만 온전히 돌려준다.
  state.timeLeft = state.rules ? state.rules.timeLimit : state.timeLeft;
  lastTickSec = null; // 임박 똑딱 빗장도 새 시간 기준으로 되돌린다

  // ★스포너는 안 건드린다 — 튜토리얼 동안 update를 통째로 건너뛰었으므로 타이머가
  //   startGame()의 첫 간격 그대로 남아 있다. 여기서 reset하면 오히려 한 간격을
  //   더 기다리게 된다.
}

/** 이 구간이 무한모드인가(유한 구간을 넘어선 인덱스인가). */
export function isInfiniteStage(stageIndex = state.stageIndex) {
  return stageIndex >= config.stage.finiteCount;
}

/**
 * 무한모드의 층 번호(1부터). 유한 구간에서 부르면 의미가 없다 — 부르는 쪽이
 * isInfiniteStage()로 먼저 갈라야 한다(아래 stageLabel이 그 예다).
 */
export function infiniteLayer(stageIndex = state.stageIndex) {
  return stageIndex - config.stage.finiteCount + 1;
}

/**
 * ★사람에게 보여줄 구간 이름 — 화면에 구간 번호를 쓰는 곳은 전부 이 함수만 쓴다.
 *
 * 유한 5구간까지는 "1 구간" … "5 구간"이고, 그 뒤는 ★"무한 1층"부터다.
 * 예전엔 표시부마다 `stageIndex + 1 구간`을 각자 계산해서, 무한모드에 들어가면
 * "6 구간 / 7 구간 / 8 구간"으로 셌다 — 유한이 5구간까지뿐이라 "6구간"은 이
 * 게임 어디에도 없는 말인데, 정작 타이틀 메뉴와 세이브(best.infiniteStage)는
 * "무한"이라 부르고 있어서 같은 것을 두 이름으로 부르는 상태였다.
 *
 * ★변환을 여기 한 곳에만 두는 게 요점이다. HUD·클리어 창 제목·클리어 대화상자가
 *   각자 계산하면 언젠가 한쪽만 고쳐져 갈라진다(이 프로젝트가 색·좌표에서 반복해
 *   겪은 그 부류다).
 */
export function stageLabel(stageIndex = state.stageIndex) {
  return isInfiniteStage(stageIndex) ? `무한 ${infiniteLayer(stageIndex)}층` : `${stageIndex + 1} 구간`;
}

/**
 * 방금 클리어한 판이 "마지막 유한 구간"인가 = 전체 완주인가.
 * 무한모드에는 끝이 없으므로 여기선 항상 false다(위 isInfiniteStage 참고).
 */
export function isRunCompleted() {
  return state.phase === 'cleared' && state.stageIndex === config.stage.finiteCount - 1;
}

/**
 * 결과 화면에서 "계속" 눌렀을 때 다음에 시작할 구간.
 * 클리어 → 다음 구간(n+1) / 실패 → 처음(0)으로 리셋.
 * 그리기(ui/screens.js)와 클릭 처리(systems/input.js)가 같은 답을 보게
 * 여기 한 곳에서만 정한다 — 갈라지면 "버튼엔 다음 구간인데 실제론 리셋" 류 버그가 난다.
 *
 * ★ 유한 구간에는 상한이 있다(예전엔 없어서 무한히 올라갔다). 마지막 유한 구간을
 *   깬 경우는 애초에 여기로 오지 않고 advanceStage()가 완주로 처리하지만, 혹시
 *   다른 경로로 불려도 구간이 유한 범위를 넘지 않게 여기서도 한 번 더 막는다.
 *   무한모드(stageIndex >= finiteCount)는 일부러 상한을 안 둔다 — 그게 정의다.
 */
export function nextStageIndex() {
  if (state.phase !== 'cleared') return 0;
  const next = state.stageIndex + 1;
  if (isInfiniteStage()) return next; // 무한모드는 그대로 계속 오른다
  return Math.min(next, config.stage.finiteCount - 1);
}

/**
 * 결과 화면 → 다음 판으로 넘어간다 (클리어면 승급, 실패면 처음부터).
 *
 * 예전엔 여기서 대기화면(select)을 한 번 거쳤다 — 그 구간의 할당량·스폰간격을
 * 미리 보여주려는 의도였는데, 타이틀의 "게임 시작"이 이미 바로 플레이로 들어가게
 * 바뀐 뒤로는 "다시하기"만 혼자 옛 대기화면을 띄우는 꼴이 됐다. 두 진입점의
 * 흐름을 맞춰서 여기서도 바로 시작한다.
 *
 * ★ 마지막 유한 구간을 깼으면 다음 구간이 없다 — 전체 완주다. 엔딩 화면
 *   (ui/endingScreen.js)을 연다. 완주 기록 자체는 이미 클리어 순간에 세이브에
 *   찍혀 있다(checkWinLose) — 여기는 화면 전환만 담당한다.
 *   ★ 이 함수는 [다음 구간] 버튼(ui/clearScreen.js)과 R키 단축키
 *   (systems/input.js) 둘 다의 공용 진입점이다 — 여기 한 곳만 고치면 두 경로가
 *   같이 엔딩으로 간다.
 */
export function advanceStage() {
  if (isRunCompleted()) {
    openEnding();
    return;
  }
  startGame(nextStageIndex());
}

/** 매 프레임. phase가 playing일 때만 세상이 돌아간다. */
export function update(dt) {
  if (state.phase !== 'playing') {
    updateFloats(dt);
    return;
  }

  const { rules } = state;
  const playArea = getPlayArea();
  // ★인게임 튜토리얼 게이트 — 왜 필요한지는 core/state.js의 state.tutorial 주석 참고.
  //   여기 한 지역변수로 받아두고 아래 네 군데가 같은 값을 본다(프레임 중간에
  //   갈리면 "시간은 멈췄는데 스폰은 됐다" 같은 어긋난 프레임이 나온다).
  const tut = state.tutorial.active;

  // ★제한시간 — 튜토리얼 중엔 안 흐른다. 설명을 읽는 데 걸린 시간이 실전 시간을
  //   깎아먹으면, 천천히 읽은 사람이 손해를 보는 튜토리얼이 된다.
  if (!tut) state.timeLeft -= dt;
  state.inputFreezeSec = Math.max(0, state.inputFreezeSec - dt); // hourglass 조작 불능 카운트다운
  recordPointer(state.pointer, dt); // copier의 가짜 커서가 나중에 이 궤적을 따라간다

  // 제한시간 임박(마지막 5초) 똑딱 — 1초에 한 번만(초가 바뀔 때만) 낸다. 긴장감용이라
  // 짧게·작게(SFX_GAIN에서 낮춤). 5초를 넘는 구간엔 아무 것도 안 난다(안 시끄럽게).
  // (튜토리얼 중엔 위에서 시간이 안 줄었으므로 여기도 저절로 조용하다)
  if (state.timeLeft > 0 && state.timeLeft <= 5) {
    const sec = Math.ceil(state.timeLeft);
    if (sec !== lastTickSec) {
      lastTickSec = sec;
      playSfx(SFX.TIME_TICK);
    }
  }

  // 등장 가능 목록을 매번 다시 만든다 — 디버그에서 일차를 바꾸면 바로 반영된다
  const pool = buildPool(gameData.enemies, rules.stage);
  // 구간 시작 후 흐른 시간(초) — spawner의 신규 종류 단독 등장 마감 판정용
  // (config.enemy.soloIntroSec, enemies/spawner.js 참고).
  const elapsed = rules.timeLimit - state.timeLeft;
  const world = { rules, playArea, pointer: state.pointer, enemies: state.enemies, pool, elapsed };
  // ★일반 스폰 정지 — 튜토리얼이 소환하는 시연용 말고는 한 마리도 안 나온다.
  //   spawner의 타이머는 안 건드린다: 실전이 시작될 때 어차피 첫 간격을 새로
  //   기다려야 하고(reset은 startGame에서 이미 했다), 여기서 timer만 안 깎으면
  //   튜토리얼이 길어져도 해제 직후 우르르 쏟아지는 일이 없다.
  if (!tut) state.enemies.push(...spawner.update(dt, world));

  for (const enemy of state.enemies) enemy.update(dt, world);

  processDeaths(rules, playArea);
  updateUpload(dt, rules);
  updateFakeCursors(dt, playArea);
  updateCombo(dt); // 콤보 연출 타이머만 — 콤보 값은 클릭으로만 바뀐다
  updateFloats(dt);
  // ★긴박 경고 — 튜토리얼 중엔 안 잰다. 시간이 안 흐르니 실제로 켜질 일도 거의
  //   없지만, 이 함수는 상태 진입 순간에 소리를 내므로(TIME_TICK/COMBO_TIER)
  //   "혹시"를 남겨두지 않는다. 튜토리얼 중 나는 소리는 전부 의도된 것이어야 한다.
  if (!tut) updateUrgency(rules); // 남은 시간·할당량으로 "지금 위험한가"를 다시 계산
  // 환경 방해(화면·조작 방해). ★ 여기서 업로드 진행을 건드리는 일은 절대 없다 —
  // 진행 정지는 unplug 전담(config.hazard 주석의 절대 규칙).
  // ★튜토리얼 중엔 통째로 막는다 — 화면·조작을 망가뜨리는 장치가 설명 위에 겹치면
  //   설명이 그냥 안 읽힌다. 해제법은 일부러 안 알려주기도 하고(직접 당해봐야 재미다).
  if (!tut) updateHazards(dt, rules);

  checkWinLose(rules);
}

/**
 * 유한 구간에서 분열(enemies/effects.js의 splitEnemy)이 지킬 마릿수·종류·
 * 종류별 개별 상한 스냅샷을 만든다. 2026-09-10 신설 — 그 함수의 cap 인자 주석에
 * 각 필드의 기준과 왜 서로 다른지 적어뒀다. processDeaths()가 프레임마다 한 번
 * 떠서 넘겨준다.
 *
 * ★ occupancy·types는 enemies/spawner.js의 aliveHeadcount·aliveTypeSet을
 *   그대로 가져다 쓴다 — 그 파일의 스폰 게이트(마릿수 상한)·filterByTypeCap
 *   (종류 상한)과 정확히 같은 기준이어야 "같은 상한을 두 곳이 다르게 읽는다"는
 *   문제가 재발하지 않는다(2026-09-10, 실제로 이 프로젝트가 그 문제를 겪었다 —
 *   그 파일의 aliveHeadcount 주석 참고). byId만 예외로 여기서 직접 센다 —
 *   countsForConcurrency 기준이고, spawner.js엔 이 기준의 "종류별 합계"를
 *   미리 만들어주는 공용 함수가 없어서(filterByConcurrencyCap은 종류 하나씩
 *   그때그때 세지, 표 전체를 한 번에 만들지 않는다) 새로 만들 이유가 아직
 *   없다 — clone이 maxConcurrentById 표에 없어 지금은 어차피 무동작이다.
 */
function buildSplitCap(enemies) {
  const byId = new Map();
  for (const e of enemies) {
    if (!e.countsForConcurrency) continue;
    byId.set(e.id, (byId.get(e.id) ?? 0) + 1);
  }
  return { occupancy: aliveHeadcount(enemies), types: aliveTypeSet(enemies), byId };
}

/**
 * 죽은 방해꾼 뒤처리 — 수명만료 벌칙, 분열, copier 안착 폭발.
 * basic 클릭사망은 죽는 순간 바로 안 치우고 Enemy.corpseTimer만큼 dead 프레임을
 * 보여주며 잠깐 더 남아있는다(sprite/animator.js) — 그래서 이 함수는 죽은 프레임마다
 * 다시 불릴 수 있고, 효과(통계/분열 등)는 죽은 첫 프레임에 딱 한 번만 적용해야 한다
 * (enemy._deathEffectsApplied로 막는다). 실제로 배열에서 빼는 건 corpseTimer가
 * 다 닳았을 때뿐이다.
 */
function processDeaths(rules, playArea) {
  if (state.enemies.every((e) => e.alive)) return;

  const keep = [];
  const born = [];
  // ★ 2026-09-10 — 분열 자식도 마릿수·종류·종류별 개별 상한을 지키게 한다
  //   (위 buildSplitCap·enemies/effects.js의 splitEnemy() cap 인자 주석 참고).
  //   이 프레임에 이미 정해진 점유를 여기서 스냅샷으로 떠 두고, 분열이 일어날
  //   때마다 splitEnemy에 넘겨 결과를 그대로 되돌려받는다 — 한 프레임에 clone이
  //   여러 마리 동시에 죽어도(멀티 클릭 등) 순서대로 정확히 반영된다.
  //   무한모드는 cap을 아예 안 만든다(undefined) — splitEnemy는 그러면 예전
  //   그대로 무제한으로 돈다(요구사항: 무한모드 분열은 이번 변경 범위 밖).
  const cap = isInfiniteStage(rules.stageIndex) ? undefined : buildSplitCap(state.enemies);

  for (const enemy of state.enemies) {
    if (enemy.alive) {
      keep.push(enemy);
      continue;
    }

    if (!enemy._deathEffectsApplied) {
      enemy._deathEffectsApplied = true;

      if (enemy.deathReason === 'expired') {
        applyExpiryEffect(enemy);
      } else if (enemy.deathReason === 'triggered') {
        // copier가 커서 위에 안착했다 — 잡아서 죽인 게 아니므로 killed로 안 센다.
        // ★ 도감 해금은 예외다(config.dex 주석) — copier는 클릭 자체가 안 먹혀서
        //   (isEventType) 'clicked'로 죽는 일이 구조적으로 없다. 이 자폭이 유일한
        //   "정리됐다" 신호라 여기서 해금 카운트를 센다. 여기서 안 세면 copier
        //   항목은 영원히 안 열린다.
        recordEnemyEncounter(enemy.id);
        triggerSelfDestruct(enemy);
      } else if (enemy.deathReason === 'trapped') {
        // fake_btn(당첨/확인 함정)에 낚여 사라졌다(systems/input.js) — 방해꾼을
        // "잡은" 게 아니라 플레이어가 속은 것이므로 killed 통계에 안 넣는다.
        // 페널티(업로드 손실+함정음)는 이미 input.js가 그 자리에서 줬으니 여기선
        // 할 일이 없다 — 그냥 배열에서 빠지게 둔다.
      } else if (enemy.id === 'zombie' && enemy.reviveCount < config.enemy.zombie.maxRevives) {
        // 아직 부활권이 남은 zombie — "완전히 잡았다"가 아니라 "한 번 쓰러뜨렸다"이므로
        // killed 통계·분열 둘 다 여기서는 안 건드린다(최종 처치 때만 센다, 아래 참고).
        // 처치음(kill_soft)·타격 팝 연출은 이미 Enemy.kill()이 일반 처치와 똑같이
        // 냈다 — "쓰러뜨렸다"는 반응 자체는 매번 있어야 한다.
        enemy._zombiePendingRevive = true;
      } else {
        state.stats.killed += 1;
        // 방해꾼 도감 해금 — 보통은 여기(클릭으로 실제 처치된 순간)가 곧 "처음
        // 처치"다. zombie는 부활을 다 쓰고 진짜로 끝난 이때만 여기 온다(부활
        // 대기 중인 소프트킬은 위 분기에서 걸러진다) — killed 통계와 같은 기준이라
        // 자연히 같이 맞는다.
        recordEnemyEncounter(enemy.id);
        if (enemy.deathReason === 'clicked') {
          born.push(...splitEnemy(enemy, rules, playArea, cap));
        }
      }
    }

    // 부활 대기 중인 zombie — corpseTimer(짧은 처치 팝)가 다 닳아 안 보이게 된
    // 뒤에도 계속 배열에 남아 reviveDelaySec을 채운다. 다 채우면 그 자리에서 되살린다.
    if (enemy._zombiePendingRevive) {
      if (enemy.deathAge >= config.enemy.zombie.reviveDelaySec) reviveZombie(enemy);
      keep.push(enemy);
      continue;
    }

    // corpseTimer가 남아있는 동안(죽음 연출 중)은 배열에 그대로 둔다.
    if (enemy.corpseTimer > 0) keep.push(enemy);
  }

  state.enemies = keep.concat(born);
}

/**
 * zombie를 같은 자리에서 되살린다. 위치(x/y)는 안 건드린다 — "같은 자리에서
 * 부활"이 요구사항이고, 물리 이동은 죽어있는 동안 멈춰 있었으므로(Enemy.update의
 * !alive 가드) 자리도 그대로다. 등장 연출(entrance)은 다시 안 튼다 — 이미
 * entranceDone이라 손대지 않으면 그리기가 그대로 정상 크기/위치를 쓴다. 대신
 * reviveFadeTimer로 반투명→불투명 페이드만 새로 건다(ui/renderEnemies.js가 읽는다).
 */
function reviveZombie(enemy) {
  const c = config.enemy.zombie;
  enemy.reviveCount += 1;
  enemy.alive = true;
  enemy.hp = enemy.maxHp;
  enemy.age = 0; // 되살아난 것도 "새 위협"이라 수명을 다시 꽉 채워 준다
  enemy.deathReason = null;
  enemy.deathAge = 0;
  enemy.corpseTimer = 0;
  enemy.killSlotHoldTimer = 0;
  enemy.hitFlash = 0;
  enemy.shakeTimer = 0;
  enemy._deathEffectsApplied = false; // 다음 죽음(최종 처치일 수도 있다)이 다시 효과를 타게
  enemy._zombiePendingRevive = false;
  enemy.reviveFadeTimer = c.reviveFadeSec;
  // "부활" 전용 사운드 에셋은 없다 — 요구사항의 "hidden 등장음 계열"에 가장 가까운
  // 기존 소리(발각/KILL_HIDDEN, "숨어있던 게 다시 드러난다"는 결)를 재사용했다.
  playSfx(SFX.KILL_HIDDEN);
}

function checkWinLose(rules) {
  // ★ 여기 두 소리는 "판이 끝나는 그 프레임"에만 난다 — 아래 else의 return이
  //   판이 안 끝난 프레임을 전부 걸러내고, 끝난 뒤로는 update() 맨 위 가드에
  //   막혀 이 함수 자체가 다시 안 불린다. 그래서 별도의 엣지 추적이 필요 없다.
  if (state.uploaded >= rules.quota) {
    setPhase('cleared');
    playSfx(SFX.STAGE_CLEAR);
    // ★ 세이브 기록을 [다음 구간] 버튼(advanceStage)이 아니라 여기서 한다 — 판이
    //   끝나는 바로 그 프레임이라 advanceStage보다 확실히 앞서면서, 클리어 화면을
    //   보다가 브라우저를 껐다 켠 경우까지 덮는다(버튼을 눌러야만 저장되면 방금
    //   깬 구간이 통째로 날아간다). 여기서 state.completedPictures는 아직 그대로다
    //   — 비우는 건 다음 startGame()이라, 해금 목록 합치기도 이 자리가 맞다.
    state.newUnlockedPictures = recordStageCleared().newUnlocks;
    // 마지막 유한 구간을 깼으면 "전체 완주"를 여기서 못박는다 — 무한모드 해금
    // 조건이라, [다음 구간] 버튼을 누르지 않고 나가도 남아야 한다(세이브 기록을
    // 버튼이 아니라 판이 끝나는 프레임에 두는 위 원칙과 같은 이유).
    if (isRunCompleted()) recordRunCompleted();
  } else if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    setPhase('failed');
    playSfx(SFX.GAMEOVER);
    // 실패도 최고 기록과 해금은 남긴다(이어할 구간은 안 건드린다 — core/save.js).
    recordGameOver();
  } else {
    return; // 판이 안 끝났다 — 아래 정리는 phase가 실제로 바뀔 때만 필요하다
  }

  // ★ phase가 방금 바뀌는 이 프레임에, 아직 안 가라앉은 피해 피드백 타이머를
  // 강제로 끈다. updateUpload()는 phase가 'playing'을 벗어나면 더는 호출되지
  // 않으므로(update() 맨 위의 가드), 여기서 안 끄면 그 순간의 값이 그대로
  // 얼어붙어 다음 화면(cleared 캔버스, failed의 HTML BSOD) 위에 계속 남는다 —
  // 비네트(.layer-vignette, z8)는 title/failed의 HTML 오버레이(z6)보다도 위라
  // 특히 눈에 띈다. 실제로 벌어지려면 "제한시간이 다 됨 == 마침 그 프레임에
  // 공격을 맞음"이 겹쳐야 해서 드물지만, 새 화면 첫인상에 남는 빨간 잔광이라
  // 눈에 띄면 어색하다.
  state.vignetteMs = 0;
  state.dmgFloatMs = 0;
  state.dmgFloatText = null;
  state.fileBarGhostMs = 0;
  // 긴박 경고도 같은 이유로 강제로 끈다 — 안 그러면 위험한 채로 판이 끝났을 때
  // 다음 화면(cleared 캔버스, failed의 HTML BSOD) 위에 빨간 펄스가 얼어붙어 남는다.
  state.urgent = false;
  state.nearGoal = false;
}
