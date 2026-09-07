// 이 파일 역할: 캔버스 한 프레임을 조립한다(방해꾼 → 커서 → 뜬 글씨 → 대기/결과 오버레이).
// HUD·창·개그요소는 이제 캔버스가 아니라 HTML이 그린다(ui/statusWindow.js, ui/desktop.js).

import { config, getUiScaleFactor, getUiReferenceCanvas, getRenderScale } from '../config.js';
import { debugState } from '../debug.js';
import {
  drawEnemy,
  drawCursorGlyph,
  drawFloats,
  drawCombo,
  drawClickMarkers,
  drawKillParticles,
  drawClickRipples,
} from './renderEnemies.js';
import { drawLoadingOverlay } from './screens.js';
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
  // ★ playing이 아닐 땐 마릿수를 세지 않고 0으로 넘긴다 — 타이틀·결과·엔딩
  //   화면에서까지 매 프레임 배열을 훑고 오버레이 CSS 변수를 쓰고 있었다(그
  //   화면들엔 과밀이라는 개념 자체가 없다). 0을 넘겨서 부르는 건 유지한다 —
  //   판을 벗어나는 순간 오버레이를 확실히 꺼야 잔상이 안 남는다(updateOverload가
  //   0에서 --ovl-level을 0으로 되돌린다).
  const aliveCount =
    state.phase === 'playing' ? state.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0) : 0;
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
  if (state.phase !== 'loading' && state.phase !== 'title') {
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
    // 클릭 리플도 같은 층 — 링이라 조각과 겹쳐도 서로 안 가린다(테두리만 그림).
    drawClickRipples(ctx, state.ripples);
    drawFloats(ctx, state.floats);
    // playing에서만 의미가 있다(select/cleared 등은 이 if 블록 밖 — 콤보가 없다).
    if (state.phase === 'playing') drawCombo(ctx, state);

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
  // 로딩 오버레이(시트 받아오는 동안)만 이 기준 공간에 그린다. failed·cleared는
  // 이제 캔버스가 아니라 HTML 오버레이(.layer-bsod/.layer-cleared, ui/bsodScreen.js·
  // ui/clearScreen.js)가 전담한다 — title과 같은 방식.
  // ★ 예전엔 여기서 대기 화면(select)도 그렸는데, advanceStage()가 항상 곧장
  //   startGame()으로 가게 바뀐 뒤로 그 단계에 도달할 길이 아예 없어졌다(어디서도
  //   setPhase('select')를 안 한다) — 죽은 분기와 그것만을 위해 매 프레임 계산하던
  //   uiScale·refPointer까지 같이 걷어냈다. 로딩일 때만 save/scale/restore 한다.
  if (gameData.loading) {
    ctx.save();
    ctx.scale(getUiScaleFactor(), getUiScaleFactor());
    drawLoadingOverlay(ctx, getUiReferenceCanvas());
    ctx.restore();
  }

  // 위장 중(copier)이거나 시스템 커서를 숨겨야 하는 환경 방해(driver, 지연 커서)
  // 중엔 브라우저 기본 커서를 숨긴다 — 어느 쪽이든 캔버스가 그린 커서(들)만 보여야
  // 한다. state.hideSystemCursor는 cursorDisguise와 달리 "진짜 위치에 커서를 또
  // 그리는" 부작용이 없다(state.js 주석 참고, driver는 늦게 따라오는 하나만 보여야
  // 해서 그 부작용이 있으면 안 된다).
  // ★ 값이 바뀔 때만 쓴다 — 평소엔 계속 ''라, 예전엔 같은 값을 매 프레임 다시
  //   대입하고 있었다(ui/cursor.js가 이미 쓰는 메모 패턴과 같다).
  const wantCursor = state.cursorDisguise > 0 || state.hideSystemCursor ? 'none' : '';
  if (lastCanvasCursor !== wantCursor) {
    lastCanvasCursor = wantCursor;
    canvas.style.cursor = wantCursor;
  }
}

// 캔버스에 직전에 쓴 cursor 값(바뀔 때만 쓰기 위한 메모).
let lastCanvasCursor = null;
