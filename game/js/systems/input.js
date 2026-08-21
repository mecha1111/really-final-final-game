// 이 파일 역할: 마우스/키 입력을 받아 게임 동작으로 옮긴다(방해꾼 클릭 판정, 난이도·재시작 버튼, 단축키).

import { config, getUiScaleFactor, getUiReferenceCanvas } from '../config.js';
import { state } from '../core/state.js';
import { startGame, goToSelect, advanceStage } from '../core/stageManager.js';
import { skipFile } from './file.js';
import { damageUpload } from './upload.js';
import { pointInRect } from '../ui/draw.js';
import { getStartButton, getRestartButton } from '../ui/screens.js';
import { isPointOverHud } from '../ui/hud.js';
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
 * 방해꾼(baseWidth=1280)과 UI(uiBaseWidth=1920)는 스케일 기준이 달라서 한 클릭이
 * 양쪽에 동시에 걸리는 경계 구간이 실제로 존재한다(ui/hud.js의 isPointOverHud
 * 주석에 실측값). 그래서 아래 두 가드가 "UI가 먼저 잡으면 거기서 return" 하도록
 * 명시적으로 배치돼 있다 — 각 가드는 클릭을 소비하며, 방해꾼 히트 테스트로
 * 절대 흘려보내지 않는다(= 한 클릭이 두 번 처리되는 일 없음).
 *   1) select/cleared/failed 단계: 화면 전체가 UI다. 방해꾼은 아직/여전히 배열에
 *      남아 그려지고 있을 수 있지만 클릭 대상이 아니다.
 *   2) playing 단계: HUD 띠 위 클릭.
 * 이 두 return을 지우면 "버튼 눌렀는데 뒤 방해꾼도 맞는" 버그가 되살아난다.
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

  // [가드 2] HUD 띠 위 클릭은 UI가 가져간다. 방해꾼 히트박스가 이 띠 안으로
  // 삐져 들어와 있어도(실측 3.75px) 방해꾼에게 넘기지 않는다 — UI 우선 원칙.
  // 겸사겸사 정확도 통계(stats.clicks)도 오염되지 않는다.
  if (isPointOverHud(pt)) return;

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
