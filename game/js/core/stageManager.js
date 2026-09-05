// 이 파일 역할: 판의 시작/진행/승패를 총괄한다. 매 프레임 각 시스템을 정해진 순서로 부르는 지휘자.

import { config, gameData, createRules } from '../config.js';
import { state, emptyStats } from './state.js';
import { Spawner, buildPool } from '../enemies/spawner.js';
import { splitEnemy, applyExpiryEffect, triggerSelfDestruct, updateFakeCursors } from '../enemies/effects.js';
import { clearJuice } from '../systems/juice.js';
import { clearRipples } from '../systems/clickRipple.js';
import { clearShake } from '../systems/screenShake.js';
import { updateUpload, resetUploadEdges } from '../systems/upload.js';
import { resetOverloadEdges } from '../systems/overload.js';
import { updateUrgency, resetUrgencyEdges } from '../systems/urgency.js';
import { grantFile } from '../systems/file.js';
import { playSfx, SFX } from '../systems/sound.js';
import { updateFloats, clearFloats } from '../systems/floats.js';
import { updateCombo, clearCombo } from '../systems/combo.js';
import { recordPointer, resetTrail } from '../systems/pointerTrail.js';
import { resetWindowPositions } from '../ui/desktop.js';
import { bindRules } from '../debug.js';

const spawner = new Spawner();

// 제한시간 임박 똑딱의 "직전 초" 기억. 값이 바뀔 때만(1초에 1회) 내기 위한 빗장이다.
let lastTickSec = null;

/**
 * 놀이 영역 = 바탕화면 전체. 방해꾼이 화면 어디든 활보한다.
 * HUD가 캔버스에서 HTML 창(ui/statusWindow.js)으로 옮겨가면서 위쪽을
 * 비워둘 이유가 없어졌다 — 창과 겹치면 "창이 위" 규칙으로 방해꾼이 뒤로 지나간다.
 */
export function getPlayArea() {
  return { x: 0, y: 0, w: config.canvas.width, h: config.canvas.height };
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
  state.completedPictures = []; // 지난 구간에 완성한 그림 목록을 새 구간으로 안 넘긴다
  state.enemies = [];
  state.fakeCursors = [];
  state.blocked = false;
  state.blockedBy = [];
  state.attackWarning = false;
  state.hitFlash = 0;
  state.cursorDisguise = 0;
  // hourglass 조작 불능 잔여가 새 판까지 새어 들어가지 않게(부활 대기 zombie가
  // 새 판으로 안 넘어가는 것과 같은 이유 — 아래 state.enemies = [] 참고).
  state.inputFreezeSec = 0;
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
  lastTickSec = null; // 시간 임박 똑딱 빗장 리셋

  spawner.reset(rules);
  grantFile();
  state.phase = 'playing';
  playSfx(SFX.START);
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
 * 결과 화면 → 다음 판으로 넘어간다 (클리어면 승급, 실패면 처음부터).
 *
 * 예전엔 여기서 대기화면(select)을 한 번 거쳤다 — 그 구간의 할당량·스폰간격을
 * 미리 보여주려는 의도였는데, 타이틀의 "게임 시작"이 이미 바로 플레이로 들어가게
 * 바뀐 뒤로는 "다시하기"만 혼자 옛 대기화면을 띄우는 꼴이 됐다. 두 진입점의
 * 흐름을 맞춰서 여기서도 바로 시작한다.
 */
export function advanceStage() {
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

  state.timeLeft -= dt;
  state.inputFreezeSec = Math.max(0, state.inputFreezeSec - dt); // hourglass 조작 불능 카운트다운
  recordPointer(state.pointer, dt); // copier의 가짜 커서가 나중에 이 궤적을 따라간다

  // 제한시간 임박(마지막 5초) 똑딱 — 1초에 한 번만(초가 바뀔 때만) 낸다. 긴장감용이라
  // 짧게·작게(SFX_GAIN에서 낮춤). 5초를 넘는 구간엔 아무 것도 안 난다(안 시끄럽게).
  if (state.timeLeft > 0 && state.timeLeft <= 5) {
    const sec = Math.ceil(state.timeLeft);
    if (sec !== lastTickSec) {
      lastTickSec = sec;
      playSfx(SFX.TIME_TICK);
    }
  }

  // 등장 가능 목록을 매번 다시 만든다 — 디버그에서 일차를 바꾸면 바로 반영된다
  const pool = buildPool(gameData.enemies, rules.stage);
  const world = { rules, playArea, pointer: state.pointer, enemies: state.enemies, pool };
  state.enemies.push(...spawner.update(dt, world));

  for (const enemy of state.enemies) enemy.update(dt, world);

  processDeaths(rules, playArea);
  updateUpload(dt, rules);
  updateFakeCursors(dt, playArea);
  updateCombo(dt); // 콤보 연출 타이머만 — 콤보 값은 클릭으로만 바뀐다
  updateFloats(dt);
  updateUrgency(rules); // 남은 시간·할당량으로 "지금 위험한가"를 다시 계산

  checkWinLose(rules);
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
        // copier가 커서 위에 안착했다 — 잡아서 죽인 게 아니므로 killed로 안 센다
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
        if (enemy.deathReason === 'clicked') {
          born.push(...splitEnemy(enemy, rules, playArea));
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
    state.phase = 'cleared';
    playSfx(SFX.STAGE_CLEAR);
  } else if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.phase = 'failed';
    playSfx(SFX.GAMEOVER);
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
  state.hitFlash = 0;
  state.vignetteMs = 0;
  state.dmgFloatMs = 0;
  state.dmgFloatText = null;
  state.fileBarGhostMs = 0;
  // 긴박 경고도 같은 이유로 강제로 끈다 — 안 그러면 위험한 채로 판이 끝났을 때
  // 다음 화면(cleared 캔버스, failed의 HTML BSOD) 위에 빨간 펄스가 얼어붙어 남는다.
  state.urgent = false;
  state.nearGoal = false;
}
