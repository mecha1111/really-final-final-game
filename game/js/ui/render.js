// 이 파일 역할: 캔버스 한 프레임을 조립한다(방해꾼 → 커서 → 뜬 글씨 → 대기/결과 오버레이).
// HUD·창·개그요소는 이제 캔버스가 아니라 HTML이 그린다(ui/statusWindow.js, ui/desktop.js).

import { config, getUiScaleFactor, getUiReferenceCanvas, getRenderScale, createRules } from '../config.js';
import { debugState } from '../debug.js';
import { drawEnemy, drawCursorGlyph, drawFloats, drawClickMarkers, drawKillParticles } from './renderEnemies.js';
import { drawSelectScreen, drawResultScreen, drawLoadingOverlay } from './screens.js';
import { getCrtShakeOffset } from './crtTransition.js';
import { getShakeOffset } from '../systems/screenShake.js';
import { updateOverload, getOverloadJitter } from '../systems/overload.js';

/**
 * 캔버스를 비운다. 배경(Bliss·언덕·구름)은 이제 캔버스가 아니라 그 아래 깔린
 * HTML(.layer-bg)이 그리므로, 여기서는 투명하게 지우기만 한다 —
 * 색을 칠하면 뒤 배경을 덮어버린다.
 */
export function drawBackground(ctx) {
  // 논리 좌표계 기준으로 지운다 — 백킹스토어는 이보다 클 수 있지만(getRenderScale)
  // 이 시점엔 ctx에 그 배율이 걸려 있어서 논리 크기만 지우면 화면 전체가 지워진다.
  ctx.clearRect(0, 0, config.canvas.width, config.canvas.height);
}

/**
 * 한 프레임 전체를 그린다.
 * @param {object} deps { ctx, canvas, state, gameData, now }
 *   now: 이번 프레임의 렌더루프 시계(ms, requestAnimationFrame timestamp) —
 *   방해꾼 스프라이트 애니(sprite/animator.js)가 프레임 전환을 계산하는 유일한 시간 기준이다.
 */
export function render({ ctx, canvas, state, gameData, now }) {
  // 백킹스토어는 device px, 게임 좌표는 논리 px — 이 변환 하나가 둘을 잇는다.
  // 매 프레임 다시 거는 이유: 창 크기가 바뀌면 canvas.width가 다시 대입되고,
  // 그 순간 컨텍스트 상태(변환·imageSmoothingEnabled)가 전부 초기화되기 때문이다.
  const renderScale = getRenderScale(canvas);
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.imageSmoothingEnabled = false; // 방해꾼 스프라이트가 확대돼도 뭉개지지 않게

  // ★ 이번 프레임에 실제로 쓴 "월드 1px = 백킹 몇 px" 배율을 캔버스 엘리먼트에 적어둔다.
  //   클릭을 월드 좌표로 되돌릴 때(systems/input.js) 이 값을 그대로 쓰게 하려는 것 —
  //   양쪽이 각자 config.canvas.width를 읽으면, 어떤 이유로든 서로 다른 config 객체를
  //   보게 됐을 때 배율이 갈라져서 클릭이 원점에서 멀수록 크게 빗나간다(그리기는
  //   멀쩡한데 판정만 밀리는 형태라 원인을 찾기가 매우 어렵다).
  //   캔버스는 DOM 노드 하나뿐이라 여기 적어두면 누가 읽어도 같은 값이 보장된다.
  canvas.__worldToBacking = renderScale;

  drawBackground(ctx);

  // ★ 화면 전환 CRT 킥의 흔들림. DOM(#desktop/#stage) transform이 아니라 여기,
  // 그리기 원점 자체를 미는 방식으로만 구현한다 — 이유는 ui/crtTransition.js 상단의
  // 큰 주석(canvas 조상에 transform 애니를 걸면 크롬이 canvas의
  // getBoundingClientRect()를 영구히 망가뜨리는 실측 버그) 참고. phase-change가
  // 없으면 {0,0}이라 평소엔 완전히 무해하다.
  //
  // 디버그 십자선(drawClickMarkers)만은 이 안에 넣지 않는다 — 그건 "실제 클릭이
  // 어디로 계산됐는지"를 있는 그대로 보여주는 진단 도구라, 여기서 흔들어버리면
  // 클릭은 안 흔들렸는데 십자선만 흔들려 보여서 좌표가 어긋난 것처럼 오해하게
  // 만든다(이 프로젝트가 그런 자체 오진단으로 여러 번 헛짚었다).
  // 화면 전환 CRT 흔들림 + 게임 중 흔들림(ransom 착지·처치 타격감)을 합친다.
  // 둘 다 DOM이 아니라 그리기 원점만 미는 방식이라 그냥 더하면 된다.
  // 과밀 지지직: 강도를 갱신하고(오버레이 CSS 변수) 그 미세 떨림도 같이 받는다.
  // 살아있는 놈만 센다 — 시체(corpseTimer로 잠깐 남는 것)까지 세면 처치할수록
  // 과부하가 심해지는 거꾸로 된 신호가 된다.
  const aliveCount = state.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  updateOverload(aliveCount); // 판마다 다른 maxAlive와 무관하게 고정 마릿수 기준(config.overload)
  const overloadJitter = getOverloadJitter();

  const crtShake = getCrtShakeOffset(now);
  const gameShake = getShakeOffset();
  const shake = {
    x: crtShake.x + gameShake.x + overloadJitter.x,
    y: crtShake.y + gameShake.y + overloadJitter.y,
  };

  // 방해꾼/가짜커서/뜬 글씨는 물리(실제) 캔버스 좌표 그대로 그린다 — 이미
  // getScaleFactor()(baseWidth=1280)로 스케일된 값들이라 여기서 또 손대면 안 된다.
  // title도 여기서 제외한다 — 타이틀은 HTML 오버레이(.layer-title, z-index 6)가
  // 캔버스보다 위에서 전담하므로 캔버스는 아무것도 안 그린다. state.enemies가
  // (디버그 콘솔 등으로) 비어있지 않더라도 그릴 필요가 없다.
  if (state.phase !== 'select' && state.phase !== 'loading' && state.phase !== 'title') {
    ctx.save();
    ctx.translate(shake.x, shake.y);

    // bait(시선강탈)는 항상 다른 방해꾼보다 아래 레이어에 그린다 — 진짜 목표물을
    // 가리면 안 되는 미끼라서다. 두 패스로 나눠 그린다: bait 먼저(바닥), 나머지
    // 나중(위). state.enemies 배열 자체의 순서는 안 건드린다 — 클릭 판정
    // (systems/input.js)이나 분열(effects.js) 같은 다른 로직이 그 순서에 기대고
    // 있을 수 있어서, 여기 그리기 순서만 두 번 훑어 해결한다(bait는 클릭 판정이
    // 아예 없으므로 — hasHitbox=false — 이 재정렬이 판정 우선순위에 영향 없다).
    for (const enemy of state.enemies) if (enemy.isBait) drawEnemy(ctx, enemy, debugState.showHitbox, now);
    for (const enemy of state.enemies) if (!enemy.isBait) drawEnemy(ctx, enemy, debugState.showHitbox, now);

    for (const c of state.fakeCursors) drawCursorGlyph(ctx, c.x, c.y);
    // 위장 중이면 진짜 커서도 가짜와 똑같이 그린다
    if (state.cursorDisguise > 0) drawCursorGlyph(ctx, state.pointer.x, state.pointer.y);

    // 조각은 방해꾼 위에 그린다 — 터진 파편이 스프라이트에 가리면 안 보인다.
    drawKillParticles(ctx, state.particles);
    drawFloats(ctx, state.floats);

    ctx.restore();

    // H키를 켰을 때만: 최근 클릭이 "월드 좌표 어디로 계산됐는지"를 십자선으로 찍는다.
    // 화면에서 실제로 누른 자리와 십자선이 어긋나면 그 어긋난 방향·거리가 곧
    // 클릭→월드 변환의 오차다. 히트박스 사각형과 같이 보면 "왜 안 맞는지"가 한눈에
    // 보인다 — 위 흔들림 블록 밖에서 그려서(un-shaken) 흔들림이 진단을 오염시키지 않는다.
    if (debugState.showHitbox) drawClickMarkers(ctx, state.debugClicks, now);
  }

  // 대기/결과 화면은 1920 기준(uiBaseWidth)으로 그려져 있다. 실제 캔버스가
  // 그보다 작거나 크면 이 변환 하나로 그 안의 모든 그리기가 비례를 유지한 채
  // 줄어들거나 커진다. 클릭 판정(systems/input.js)도 같은 기준 공간
  // (getUiReferenceCanvas)을 써야 그리기와 어긋나지 않는다.
  //
  // ★ 여기는 흔들림(shake)을 안 넣는다 — 시작/다시하기 버튼의 클릭 판정
  // (systems/input.js의 select/cleared/failed 분기)이 이 흔들림을 모르는 별도
  // 계산이라, 버튼만 흔들어 그리면 "버튼은 저기 보이는데 눌리는 자리는 여기"가
  // 된다. 방해꾼 쪽은 그 순간(phase 전환 직후) 살아있는 놈이 사실상 없어서
  // 흔들어도 안전하지만, 버튼은 전환 직후에도 바로 누를 수 있는 진짜 클릭
  // 대상이라 위험을 감수할 이유가 없다.
  const uiScale = getUiScaleFactor();
  const refCanvas = getUiReferenceCanvas();
  const refPointer = { x: state.pointer.x / uiScale, y: state.pointer.y / uiScale };

  ctx.save();
  ctx.scale(uiScale, uiScale);

  if (state.phase === 'select') {
    // 대기 화면은 "앞으로 시작할 구간"의 숫자를 미리 보여준다 — 게임 로직과
    // 같은 createRules를 써야 표시와 실제가 갈라지지 않는다(공식 이중구현 금지).
    drawSelectScreen(ctx, refCanvas, state.stageIndex, createRules(state.stageIndex), refPointer);
  }
  // failed는 이제 캔버스가 아니라 HTML 오버레이(.layer-bsod, ui/bsodScreen.js)가
  // 전담한다 — title과 같은 방식. cleared(클리어 축하 화면)는 그대로 캔버스에 남는다.
  if (state.phase === 'cleared') {
    drawResultScreen(ctx, refCanvas, state, refPointer);
  }
  if (gameData.loading) drawLoadingOverlay(ctx, refCanvas);

  ctx.restore();

  // 위장 중엔 브라우저 기본 커서를 숨겨야 캔버스가 그린 커서만 보인다
  canvas.style.cursor = state.cursorDisguise > 0 ? 'none' : '';
}
