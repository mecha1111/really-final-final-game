// 이 파일 역할: 판의 시작/진행/승패를 총괄한다. 매 프레임 각 시스템을 정해진 순서로 부르는 지휘자.

import { config, gameData, createRules, getUiScaleFactor } from '../config.js';
import { state, emptyStats } from './state.js';
import { Spawner, buildPool } from '../enemies/spawner.js';
import { splitEnemy, applyExpiryEffect, triggerSelfDestruct, updateFakeCursors } from '../enemies/effects.js';
import { updateUpload } from '../systems/upload.js';
import { grantFile } from '../systems/file.js';
import { updateFloats, clearFloats } from '../systems/floats.js';
import { recordPointer, resetTrail } from '../systems/pointerTrail.js';
import { bindRules } from '../debug.js';

const spawner = new Spawner();

/** 놀이 영역 = HUD 아래 전체. 방해꾼은 이 안에서만 논다.
 * config.hud.height는 1920 기준 값이라 getUiScaleFactor()를 곱해 실제
 * 캔버스에서 HUD가 차지하는 물리 픽셀 높이로 바꾼다 — 이렇게 안 하면
 * (실제 캔버스가 1920보다 작을 때) 화면에 그려지는 HUD 띠는 얇아졌는데
 * 방해꾼이 못 들어오는 영역은 그대로 96px이라 그 사이에 빈 틈이 생긴다. */
export function getPlayArea() {
  const hudHeight = config.hud.height * getUiScaleFactor();
  return {
    x: 0,
    y: hudHeight,
    w: config.canvas.width,
    h: config.canvas.height - hudHeight,
  };
}

/**
 * 구간 n으로 새 판을 시작한다. ★ 첫 구간이 n = 0.
 * 난이도 선택은 없어졌고, n이 오를수록 createRules의 공식이 알아서 조인다.
 */
export function startGame(stageIndex = 0) {
  const n = Math.max(0, Math.floor(stageIndex));
  state.stageIndex = n;

  const rules = createRules(n);
  state.rules = rules;
  bindRules(rules); // 디버그 슬라이더를 이번 판의 숫자에 연결

  state.timeLeft = rules.timeLimit;
  state.uploaded = 0;
  state.reward = 0;
  state.nextFilePenaltyMb = 0;
  state.skipsLeft = rules.skipLimit;
  state.enemies = [];
  state.fakeCursors = [];
  state.blocked = false;
  state.blockedBy = [];
  state.attackWarning = false;
  state.hitFlash = 0;
  state.cursorDisguise = 0;
  state.stats = emptyStats();
  clearFloats();
  resetTrail(); // 지난 판의 마우스 궤적이 새 판의 가짜 커서에 섞여 들어가지 않게

  spawner.reset(rules);
  grantFile();
  state.phase = 'playing';
}

export function goToSelect() {
  state.phase = 'select';
}

/**
 * 결과 화면에서 "계속" 눌렀을 때 다음에 시작할 구간.
 * 클리어 → 다음 구간(n+1) / 실패 → 처음(0)으로 리셋.
 * 그리기(ui/screens.js)와 클릭 처리(systems/input.js)가 같은 답을 보게
 * 여기 한 곳에서만 정한다 — 갈라지면 "버튼엔 다음 구간인데 실제론 리셋" 류 버그가 난다.
 */
export function nextStageIndex() {
  return state.phase === 'cleared' ? state.stageIndex + 1 : 0;
}

/**
 * 결과 화면 → 다음 구간으로 넘어간다 (클리어면 승급, 실패면 처음부터).
 * 바로 시작하지 않고 대기화면으로 보내는 이유: 대기화면이 그 구간의 할당량·
 * 스폰간격·동시최대를 미리 보여줘서 "구간이 올라 빡세졌다"가 눈에 보이게 하려는 것.
 */
export function advanceStage() {
  state.stageIndex = nextStageIndex();
  state.phase = 'select';
}

/** 매 프레임. phase가 playing일 때만 세상이 돌아간다. */
export function update(dt) {
  if (state.phase !== 'playing') {
    updateFloats(dt);
    return;
  }

  const { rules } = state;
  const playArea = getPlayArea();

  state.timeLeft -= dt;
  recordPointer(state.pointer, dt); // copier의 가짜 커서가 나중에 이 궤적을 따라간다

  // 등장 가능 목록을 매번 다시 만든다 — 디버그에서 일차를 바꾸면 바로 반영된다
  const pool = buildPool(gameData.enemies, rules.stage);
  const world = { rules, playArea, pointer: state.pointer, enemies: state.enemies, pool };
  state.enemies.push(...spawner.update(dt, world));

  for (const enemy of state.enemies) enemy.update(dt, world);

  processDeaths(rules, playArea);
  updateUpload(dt, rules);
  updateFakeCursors(dt, playArea);
  updateFloats(dt);

  checkWinLose(rules);
}

/** 죽은 방해꾼 뒤처리 — 수명만료 벌칙, 분열, copier 안착 폭발 */
function processDeaths(rules, playArea) {
  if (state.enemies.every((e) => e.alive)) return;

  const survivors = [];
  const born = [];

  for (const enemy of state.enemies) {
    if (enemy.alive) {
      survivors.push(enemy);
      continue;
    }

    if (enemy.deathReason === 'expired') {
      applyExpiryEffect(enemy);
    } else if (enemy.deathReason === 'triggered') {
      // copier가 커서 위에 안착했다 — 잡아서 죽인 게 아니므로 killed로 안 센다
      triggerSelfDestruct(enemy);
    } else {
      state.stats.killed += 1;
      if (enemy.deathReason === 'clicked') {
        born.push(...splitEnemy(enemy, rules, playArea));
      }
    }
  }

  state.enemies = survivors.concat(born);
}

function checkWinLose(rules) {
  if (state.uploaded >= rules.quota) {
    state.phase = 'cleared';
  } else if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.phase = 'failed';
  }
}
