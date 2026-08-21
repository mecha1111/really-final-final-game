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
    onPointerDown(canvas, canvasPoint(canvas, evt));
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
 * 클릭 라우팅. 우선순위는 딱 한 줄로 요약된다: **UI가 방해꾼보다 항상 먼저다.**
 *
 * 지금은 두 층에서 이 원칙이 지켜진다:
 *
 *  (1) HTML 층 — 브라우저가 알아서 해준다. HTML 창(.layer-win)·개그팝업(.layer-gag)은
 *      캔버스보다 위(z-index)라 그 위를 누르면 이벤트가 창에서 끝나고 캔버스의
 *      pointerdown은 아예 안 뜬다 = 뒤 방해꾼이 안 맞는다(의도: 창 우선).
 *      반대로 개그아이콘·작업표시줄(.layer-deco)은 pointer-events:none이라
 *      클릭이 그대로 통과해 방해꾼에게 간다(의도: 장식은 클릭 안 훔침).
 *
 *  (2) 캔버스 층 — 아래 가드. select/cleared/failed 단계에서는 화면 전체가
 *      캔버스 오버레이(UI)라, 방해꾼이 배열에 남아 그려지고 있어도 클릭 대상이
 *      아니다. 이 return을 지우면 "버튼 눌렀는데 뒤 방해꾼도 맞는" 버그가 된다.
 *
 * (자동 테스트가 이 규칙을 지킨다 — pwtest run.mjs의 "경계 클릭 라우팅" 항목)
 */
function onPointerDown(canvas, pt) {
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

  // 예전엔 여기서 "HUD 띠 위 클릭"을 걸렀지만, HUD가 캔버스에서 HTML 창으로
  // 옮겨가면서 캔버스에는 더 이상 UI가 없다 — 이제 창 위 클릭은 브라우저가
  // 캔버스까지 내려보내지도 않으므로(위 주석 (1)) 별도 가드가 필요 없다.
  // 방해꾼은 바탕화면 전체를 쓴다.
  state.stats.clicks += 1;
  hitTestEnemies(pt);
}

/** 위에 그려진 놈부터 검사한다. 하나만 맞는다. */
function hitTestEnemies(pt) {
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];

    if (enemy.closeButton) {
      // popup류: 우상단 X 버튼만 죽는다. 몸통은 흔들리기만 하고 클릭을 소비한다.
      const btn = enemy.closeButtonRect();
      if (btn && pointInRect(pt, btn)) {
        enemy.kill('clicked');
        state.stats.hits += 1;
        return;
      }
      if (enemy.containsBody(pt.x, pt.y)) {
        enemy.triggerShake();
        return;
      }
      continue; // 이 놈은 안 맞았다 — 뒤에 깔린 놈을 계속 검사
    }

    if (!enemy.containsPoint(pt.x, pt.y)) continue;

    if (enemy.clickable) {
      enemy.takeHit();
      state.stats.hits += 1;
      return;
    }

    if (enemy.isTrap) {
      // 누르면 안 되는 버튼을 눌렀다
      state.stats.trapClicks += 1;
      damageUpload(enemy.effect.wrongClickPct, enemy.x, enemy.y);
      enemy.hitFlash = config.enemy.hitFlashSec;
      return;
    }

    // action=none이면서 함정도 아닌 놈(bait, copier)은 눌러도 아무 일 없다
    return;
  }
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
