// 이 파일 역할: 마우스/키 입력을 받아 게임 동작으로 옮긴다(방해꾼 클릭 판정, 난이도·재시작 버튼, 단축키).

import { config, getUiScaleFactor, getUiReferenceCanvas } from '../config.js';
import { state } from '../core/state.js';
import { startGame, advanceStage } from '../core/stageManager.js';
import { skipFile } from './file.js';
import { damageUpload } from './upload.js';
import { pointInRect } from '../ui/draw.js';
import { getStartButton, getRestartButton } from '../ui/screens.js';
import { handleDebugKey, debugState } from '../debug.js';

// pointerdown에서 "방해꾼을 못 맞혀 아래로 흘려보낸" 대상. 이어서 오는 click을
// 같은 곳으로 보내기 위해 한 입력 동안만 들고 있는다(forwardClickThrough 주석 참고).
let clickThroughTarget = null;

/**
 * 화면 좌표(clientX/Y)를 게임 월드 좌표로. CSS로 축소돼 있어도 정확하다.
 *
 * 두 단계로 나눠서 간다:
 *   1) client → 백킹스토어 px : rect(화면에 실제 보이는 CSS 크기)로 나눈다.
 *      rect에는 zoom도 dpr도 이미 반영돼 있어서 표시 배율을 따로 챙길 필요가 없다.
 *   2) 백킹스토어 px → 월드   : ui/render.js가 이번 프레임에 실제로 쓴 배율로 나눈다.
 *
 * ★ 2단계에서 config.canvas.width를 직접 읽지 않고 렌더가 적어둔 값을 쓰는 이유:
 *   그리기와 판정이 각자 config를 읽으면, 어떤 이유로든 서로 다른 config 객체를 보게
 *   됐을 때(예: 모듈이 두 벌 로드돼 한쪽은 시트 적용 전 폴백값 1920, 다른 쪽은 시트값
 *   960을 보는 경우) 배율이 갈라진다. 그러면 그리기는 멀쩡한데 클릭만, 그것도 원점에서
 *   멀수록 크게 빗나간다 — 실제로 "우하단을 눌렀는데 판정은 좌중앙"이라는 신고가 있었고
 *   960/1920 조합이 정확히 그 비율(0.8 → 0.4)을 만든다.
 *   캔버스는 DOM 노드 하나뿐이라, 렌더가 거기 적어둔 값을 읽으면 항상 같은 배율이 보장된다.
 */
/**
 * 캔버스가 화면에서 실제로 차지하는 크기(CSS px)를, 조상 체인의 배율을 직접 곱해서 구한다.
 *
 * ★ 왜 getBoundingClientRect().width를 안 쓰는가 — 그 값이 신뢰할 수 없다는 걸 실측으로
 *   확인했다. 어떤 크롬에서는 조상의 CSS zoom을 반영한 "화면 크기"를 주는데, 다른 크롬에서는
 *   zoom을 뺀 "레이아웃 크기"를 준다. 게다가 left/top은 화면 좌표인데 width/height만
 *   레이아웃 좌표인 뒤섞인 상태로 나오기도 한다:
 *     사용자 실측(zoom 0.897, dpr 1.6): rect = 1920x1080 @89,0  ← width는 레이아웃(1920),
 *       left는 화면(89, 레터박스 여백). 실제 화면 표시폭은 1920*0.897=1722.7이어야 한다.
 *     같은 조건 내 크롬:              rect = 1722.7x969 @89,0  ← 둘 다 화면 좌표(정상)
 *   width만 좌표계가 다르면 클릭이 위치에 비례해 어긋난다(원점 근처는 멀쩡하고 멀수록 커짐).
 *   그림은 브라우저가 백킹스토어를 알아서 얹으니 멀쩡해서, "그리기는 맞는데 클릭만 밀리는"
 *   형태로만 나타난다 — 원인을 찾기가 아주 어려웠다.
 *
 *   그래서 화면 크기를 rect에 묻지 않고 직접 계산한다: 캔버스의 레이아웃 크기(clientWidth,
 *   canvasFit이 지정한 값이라 우리가 정확히 아는 숫자)에 조상들의 zoom·transform 배율을
 *   곱한다. 이 둘은 어느 크롬에서도 같은 뜻이라 결과가 갈리지 않는다.
 *   (zoom 미지원 브라우저용 transform 폴백 경로도 같은 식으로 함께 잡힌다.)
 */
function canvasDisplaySize(canvas) {
  let sx = 1;
  let sy = 1;
  for (let el = canvas; el && el.nodeType === 1; el = el.parentElement) {
    const cs = getComputedStyle(el);
    const z = parseFloat(cs.zoom);
    if (Number.isFinite(z) && z > 0) {
      sx *= z;
      sy *= z;
    }
    if (cs.transform && cs.transform !== 'none') {
      try {
        const m = new DOMMatrix(cs.transform);
        if (m.a) sx *= Math.abs(m.a);
        if (m.d) sy *= Math.abs(m.d);
      } catch {
        /* 파싱 못 하면 그냥 배율 1로 둔다 — 아래 폴백이 받아준다 */
      }
    }
  }
  return { w: canvas.clientWidth * sx, h: canvas.clientHeight * sy };
}

function canvasPoint(canvas, evt) {
  // 첫 프레임이 그려지기 전에 클릭이 들어오는 극단적인 경우만 config로 폴백한다.
  const worldToBacking = canvas.__worldToBacking || canvas.width / config.canvas.width;
  const rect = canvas.getBoundingClientRect();

  // 원점(left/top)은 rect에서 받는다 — 이 둘은 어느 크롬에서도 화면 좌표로 일치했다.
  // 크기만 위 함수로 직접 구한다(rect.width/height를 못 믿는 이유는 그쪽 주석 참고).
  // 계산이 안 되는 이상한 상황(크기 0 등)에서는 rect 값으로 되돌아간다.
  const disp = canvasDisplaySize(canvas);
  const dispW = disp.w > 0 ? disp.w : rect.width;
  const dispH = disp.h > 0 ? disp.h : rect.height;

  const backingX = (evt.clientX - rect.left) * (canvas.width / dispW);
  const backingY = (evt.clientY - rect.top) * (canvas.height / dispH);
  return { x: backingX / worldToBacking, y: backingY / worldToBacking };
}

export function initInput(canvas) {
  canvas.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    onPointerDown(canvas, canvasPoint(canvas, evt), evt);
  });

  // pointerdown에서 아래로 흘려보낸 클릭은 click까지 같이 흘려보내야 한다.
  // 합성 pointerdown은 click을 만들어내지 않기 때문에, 이게 없으면 click으로
  // 동작하는 것들(개그팝업 X·버튼)이 마우스로는 영영 안 눌린다.
  canvas.addEventListener('click', (evt) => onCanvasClick(evt));

  // move는 window에 붙여 캔버스 밖으로 나가도 커서 위치를 계속 추적한다
  // (copier가 커서를 쫓아가야 하므로 중요).
  window.addEventListener('pointermove', (evt) => {
    state.pointer = canvasPoint(canvas, evt);
  });

  window.addEventListener('keydown', (evt) => onKeyDown(evt));

  // 우클릭 메뉴는 클릭 게임에 방해만 된다
  canvas.addEventListener('contextmenu', (evt) => evt.preventDefault());
}

/**
 * 클릭 라우팅. 우선순위는 딱 한 줄로 요약된다: **방해꾼이 항상 창보다 먼저다.**
 *
 * 캔버스가 레이어 중 맨 위(z-index, style.css)에 있어서 모든 클릭이 일단 캔버스로
 * 들어온다. 여기서 방해꾼을 맞히면 그걸로 끝 — 창 위에 떠 있는 방해꾼도 반드시
 * 클릭이 먹힌다(요구사항). 못 맞히면(방해꾼이 없는 자리를 눌렀으면) forwardClickThrough로
 * 캔버스 아래(HTML 창 → 개그팝업 → 장식 → 배경) 있는 실제 엘리먼트로 클릭을 그대로
 * 넘겨서 창 드래그·닫기 버튼·개그팝업이 예전처럼 동작하게 한다.
 *
 *  (1) 캔버스 층 — 위 가드. select/cleared/failed 단계에서는 화면 전체가
 *      캔버스 오버레이(UI)라, 방해꾼이 배열에 남아 그려지고 있어도 클릭 대상이
 *      아니다. 이 return을 지우면 "버튼 눌렀는데 뒤 방해꾼도 맞는" 버그가 된다.
 *
 *  (2) HTML 층 — 캔버스가 못 맞혔을 때만 내려간다. 개그아이콘·작업표시줄(.layer-deco)은
 *      pointer-events:none이라 애초에 캔버스 자체가 클릭을 계속 받으므로(=방해꾼에게 감),
 *      이 통과 로직과는 무관하다(의도: 장식은 클릭 안 훔침).
 */
function onPointerDown(canvas, pt, evt) {
  state.pointer = pt;
  // 새 입력이 시작됐다 — 지난번에 기억해둔 통과 대상은 여기서 무효가 된다.
  // (방해꾼을 맞힌 경우에도 null로 남아야 그 클릭이 창으로 새어나가지 않는다)
  clickThroughTarget = null;

  // H키 오버레이가 켜져 있을 때만, 이 클릭이 월드 좌표 어디로 계산됐는지 남긴다.
  // 화면에서 누른 자리와 십자선이 어긋나면 그게 곧 좌표 변환 오차다(ui/renderEnemies.js).
  // t를 같이 남겨서 잠깐만 보이게 한다 — 오래된 마커는 창 크기가 바뀌면 엉뚱한 자리에
  // 그려져 오해를 부른다(core/state.js의 debugClicks 주석 참고).
  //
  // ★ 변환에 관여하는 값들을 그 순간 그대로 같이 담는다. 십자선이 커서에서 벗어날 때
  //   "어느 변수가 튀었나"를 스크린샷 한 장으로 알 수 있게 하려는 것 — 화면 배율은
  //   CSS zoom·브라우저 페이지줌(dpr에 반영)·트랙패드 핀치줌(visualViewport)이 겹칠 수
  //   있고, 어느 것이 rect에 반영되고 어느 것이 안 되는지가 브라우저/버전마다 다르다.
  if (debugState.showHitbox) {
    const rect = canvas.getBoundingClientRect();
    const disp = canvasDisplaySize(canvas);
    const vv = window.visualViewport;
    state.debugClicks.push({
      x: pt.x,
      y: pt.y,
      t: performance.now(),
      env: {
        client: [Math.round(evt.clientX), Math.round(evt.clientY)],
        offset: [Math.round(evt.offsetX), Math.round(evt.offsetY)],
        rect: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
        // 판정에 실제로 쓰는 표시 크기(레이아웃 크기 × 조상 배율). rect.width와 갈리면
        // 그 브라우저의 rect가 zoom을 반영하지 않는다는 뜻이고, 그래도 판정은 이 값으로 맞는다.
        disp: [Math.round(disp.w), Math.round(disp.h)],
        box: [canvas.clientWidth, canvas.clientHeight],
        backing: [canvas.width, canvas.height],
        cfg: [config.canvas.width, config.canvas.height],
        w2b: canvas.__worldToBacking,
        dpr: window.devicePixelRatio,
        zoom: getComputedStyle(document.getElementById('desktop')).zoom,
        vv: vv ? [Number(vv.scale.toFixed(3)), Math.round(vv.offsetLeft), Math.round(vv.offsetTop)] : null,
        // 두 방식이 갈리면 그 차이가 곧 "rect가 배율을 잘못 반영하고 있다"는 증거다.
        // 지금 판정에 실제로 쓰는 건 offset 쪽(위 canvasPoint 1순위).
        viaRect: [
          Math.round(((evt.clientX - rect.left) * (canvas.width / rect.width)) / (canvas.__worldToBacking || 1)),
          Math.round(((evt.clientY - rect.top) * (canvas.height / rect.height)) / (canvas.__worldToBacking || 1)),
        ],
      },
    });
    if (state.debugClicks.length > 6) state.debugClicks.shift();
  }

  // [가드 0] title 단계는 캔버스가 아무 것도 안 그리고(ui/render.js) 클릭도 안 받는다
  // — 타이틀 버튼은 HTML(.layer-title, z-index 6)이 캔버스보다 위라 애초에 이
  // 핸들러까지 안 온다(브라우저가 버튼에서 이벤트를 끝낸다). 이 return이 없어도
  // 아래 [가드 1]엔 안 걸리고 그다음 `phase !== 'playing'` return에서 결국 막히긴
  // 하지만, "title엔 캔버스가 할 일이 없다"를 명시적으로 남겨서 나중에
  // select/cleared/failed 분기가 늘어나도 title이 실수로 거기 묶여 들어가는 걸 막는다.
  if (state.phase === 'title') return;

  // [가드 1] 시작/다음구간 버튼은 ui/render.js가 1920 기준(getUiReferenceCanvas)으로
  // 그리고 ctx.scale(getUiScaleFactor())로 실제 캔버스에 맞춰 줄이거나 키운다.
  // 클릭 판정도 같은 기준 공간으로 좌표를 옮겨야 그리기와 어긋나지 않는다.
  if (state.phase === 'select' || state.phase === 'cleared' || state.phase === 'failed') {
    const uiScale = getUiScaleFactor();
    const refPt = { x: pt.x / uiScale, y: pt.y / uiScale };
    const refCanvas = getUiReferenceCanvas();

    if (state.phase === 'select') {
      // 대기 화면의 시작 버튼 — state.stageIndex 구간으로 들어간다
      if (pointInRect(refPt, getStartButton(refCanvas))) startGame(state.stageIndex);
    } else if (pointInRect(refPt, getRestartButton(refCanvas))) {
      // 결과 화면 — 클리어면 다음 구간, 실패면 처음부터(판단은 stageManager가 한다)
      advanceStage();
    }
    return;
  }

  if (state.phase !== 'playing') return;

  // 방해꾼은 바탕화면 전체를 쓴다. 맞혔으면 여기서 끝 — 캔버스가 클릭을 가져간 것이다.
  state.stats.clicks += 1;
  const hitEnemy = hitTestEnemies(pt);
  if (!hitEnemy) clickThroughTarget = forwardClickThrough(canvas, evt);
}

/** 위에 그려진 놈부터 검사한다. 하나라도 판정을 소비했으면(맞았든 헛클릭이든) true. */
function hitTestEnemies(pt) {
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];

    if (enemy.closeButton) {
      // popup류: 창 안에 그려진 닫기 버튼만 죽인다(위치는 config.enemy.closeButtonOffset*).
      // 몸통은 흔들리기만 하고 클릭을 소비한다.
      const btn = enemy.closeButtonRect();
      if (btn && pointInRect(pt, btn)) {
        enemy.kill('clicked');
        state.stats.hits += 1;
        return true;
      }
      if (enemy.containsBody(pt.x, pt.y)) {
        enemy.triggerShake();
        return true;
      }
      continue; // 이 놈은 안 맞았다 — 뒤에 깔린 놈을 계속 검사
    }

    if (!enemy.containsPoint(pt.x, pt.y)) continue;

    if (enemy.clickable) {
      enemy.takeHit();
      state.stats.hits += 1;
      return true;
    }

    if (enemy.isTrap) {
      // 누르면 안 되는 버튼을 눌렀다
      state.stats.trapClicks += 1;
      damageUpload(enemy.effect.wrongClickPct, enemy.x, enemy.y);
      enemy.hitFlash = config.enemy.hitFlashSec;
      return true;
    }

    // action=none이면서 함정도 아닌 놈(bait, copier)은 눌러도 아무 일 없다 —
    // 그래도 방해꾼 자리를 누른 거라 클릭은 소비한다(창까지 통과시키지 않는다).
    return true;
  }

  return false; // 어떤 방해꾼도 이 자리에 없었다
}

/**
 * 캔버스가 방해꾼을 못 맞혔을 때, 그 자리에 실제로 있는(캔버스 아래) HTML 엘리먼트로
 * 클릭을 그대로 넘긴다 — 안 그러면 캔버스가 레이어 맨 위를 통째로 덮어써서 창 드래그·
 * 닫기 버튼·개그팝업이 전부 죽는다. elementsFromPoint(복수형)가 그 자리의 엘리먼트를
 * 위에서 아래 순서로 다 주므로, 그중 캔버스가 아닌 첫 번째가 곧 "캔버스 밑에 있던 것"이다.
 *
 * ★ 예전엔 캔버스를 잠깐 pointer-events:none으로 껐다가 elementFromPoint(단수)로 찾고
 *   다시 켜는 방식이었다. 그런데 그 사이에 무엇이든 끼어들어 "다시 켜는" 줄에 도달하지
 *   못하면 캔버스가 영영 클릭을 못 받는 상태로 굳는다 — 그러면 방해꾼은 하나도 안 죽는데
 *   창 드래그는 멀쩡하고 좌표·히트박스 오버레이도 정상으로 보인다(강제로 그 상태를 만들어
 *   실측 확인: 방해꾼 클릭 시 clicks=0으로 핸들러 자체가 안 불리고, 창 드래그는 정상).
 *   원인을 찾기 어려운 데다 한 번 굳으면 새로고침 전까지 게임이 먹통이 되므로,
 *   "잠깐 껐다 켠다"는 상태 변경 자체를 없앴다. 지금은 캔버스를 건드리지 않으므로
 *   중간에 무슨 일이 나도 굳을 수가 없다.
 *
 * ★ pointerdown 하나만 넘기면 부족하다. 합성 pointerdown은 브라우저가 click으로
 *   이어주지 않으므로, click 리스너로 동작하는 것들(개그팝업의 X와 버튼)이 마우스로는
 *   전혀 안 눌린다. 그래서 여기서 찾은 대상을 clickThroughTarget에 기억해뒀다가
 *   이어서 오는 canvas의 click도 같은 대상에게 넘긴다(onCanvasClick).
 *   창 드래그(ui/desktop.js)는 pointerdown으로 시작하고 이후 pointermove/pointerup은
 *   window에 붙어 있어 그대로 도착하므로, 이 둘만 넘겨주면 기존 동작이 전부 산다.
 *
 * @returns {Element|null} 이어지는 click을 넘겨줄 대상
 */
function forwardClickThrough(canvas, evt) {
  if (!evt) return null;

  // 위에서 아래 순서. pointer-events:none인 것들은 애초에 목록에 안 들어오므로,
  // 캔버스만 건너뛰면 그게 "캔버스가 없었다면 클릭을 받았을" 엘리먼트다.
  const stack = document.elementsFromPoint(evt.clientX, evt.clientY);
  const target = stack.find((el) => el !== canvas);

  if (!target) return null;
  target.dispatchEvent(new PointerEvent(evt.type, evt));
  return target;
}

/**
 * 위에서 아래로 흘려보낸 그 클릭의 마무리. pointerdown 때 기억해둔 대상에게만
 * click을 넘긴다 — 방해꾼을 맞힌 클릭은 clickThroughTarget이 null이라 여기서 걸러진다.
 */
function onCanvasClick(evt) {
  const target = clickThroughTarget;
  clickThroughTarget = null;
  if (!target) return;

  target.dispatchEvent(new MouseEvent('click', evt));
}

function onKeyDown(evt) {
  if (handleDebugKey(evt.code)) {
    evt.preventDefault();
    return;
  }

  if (evt.code === 'KeyS') skipFile();

  // 결과 화면: R = 다음 구간(클리어) / 처음부터(실패). 화면 버튼과 같은 동작.
  if (evt.code === 'KeyR' && (state.phase === 'cleared' || state.phase === 'failed')) {
    advanceStage();
  }

  // 대기 화면: Enter = 시작
  if ((evt.code === 'Enter' || evt.code === 'NumpadEnter') && state.phase === 'select') {
    startGame(state.stageIndex);
  }
}
