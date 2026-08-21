// 이 파일 역할: 마우스/키 입력을 받아 게임 동작으로 옮긴다(방해꾼 클릭 판정, 난이도·재시작 버튼, 단축키).

import { config, getUiScaleFactor, getUiReferenceCanvas } from '../config.js';
import { state } from '../core/state.js';
import { startGame, goToSelect, advanceStage } from '../core/stageManager.js';
import { skipFile } from './file.js';
import { damageUpload } from './upload.js';
import { pointInRect } from '../ui/draw.js';
import { getStartButton, getRestartButton } from '../ui/screens.js';
import { handleDebugKey } from '../debug.js';

/** 화면 좌표(clientX/Y)를 캔버스 논리 좌표로. CSS로 축소돼 있어도 정확하다. */
function canvasPoint(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (canvas.width / rect.width),
    y: (evt.clientY - rect.top) * (canvas.height / rect.height),
  };
}

export function initInput(canvas) {
  canvas.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    onPointerDown(canvas, canvasPoint(canvas, evt), evt);
  });

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
  if (!hitEnemy) forwardClickThrough(canvas, evt);
}

/** 위에 그려진 놈부터 검사한다. 하나라도 판정을 소비했으면(맞았든 헛클릭이든) true. */
function hitTestEnemies(pt) {
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];

    if (enemy.closeButton) {
      // popup류: 우상단 X 버튼만 죽는다. 몸통은 흔들리기만 하고 클릭을 소비한다.
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
 * 닫기 버튼·개그팝업이 전부 죽는다. 표준 "클릭-통과" 트릭: 캔버스를 잠깐
 * pointer-events:none으로 만들어 elementFromPoint로 진짜 대상을 찾고, 그 대상에
 * 원본 이벤트와 같은 속성(좌표/버튼 등)을 가진 새 PointerEvent를 재발사한다.
 */
function forwardClickThrough(canvas, evt) {
  if (!evt) return;

  canvas.style.pointerEvents = 'none';
  const target = document.elementFromPoint(evt.clientX, evt.clientY);
  canvas.style.pointerEvents = '';

  if (!target || target === canvas) return;
  target.dispatchEvent(new PointerEvent(evt.type, evt));
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
