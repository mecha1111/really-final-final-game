// 이 파일 역할: 밸런스를 게임 도중에 실시간으로 만져보기 위한 디버그 패널.
// config.debug.enabled 하나로 완전히 꺼진다 — false면 DOM도 안 만들고,
// 아래 함수들은 전부 즉시 return한다.

import { config } from './config.js';
// ★ 순환 참조: core/stageManager.js도 debug.js의 bindRules를 가져다 쓴다.
//   둘 다 모듈 최상단이 아니라 함수 안(클릭 핸들러/startGame 호출 시점)에서만
//   서로를 쓰므로 문제없다 — ES 모듈 순환참조는 "당장 평가 시점에 값이 필요한지"만
//   문제가 된다.
import { startGame } from './core/stageManager.js';
import { buildPool } from './enemies/spawner.js';
import { eligibleHazardIds } from './systems/hazard.js';

const DEBUG = config.debug.enabled;

// 구간 즉시 이동 버튼 — 밸런스 확인용. 표시는 1구간부터(사람이 읽는 번호),
// startGame()에 넘기는 n은 0부터(코드 규칙, progression.js 주석 참고).
// ★ 유한 구간 전부 + 무한모드 첫 구간 하나. config.stage.finiteCount에서 뽑으므로
//   구간 수를 늘려도 여기는 안 고친다(그게 finiteCount를 둔 이유다).
const STAGE_JUMPS = [...Array(config.stage.finiteCount).keys(), config.stage.finiteCount];

// 슬라이더로 조절할 값들. key는 rules 객체의 속성 이름과 같아야 한다.
// live=false인 항목은 이미 시작된 판에는 영향이 없고 다음 판부터 적용된다.
//
// 주의: 이 슬라이더들은 "이번 판의 rules"를 직접 덮어쓴다. 구간 공식
// (balance/progression.js)이 계산해 넣은 값 위에 손으로 덧쓰는 것이라,
// 다음 판이 시작되면 다시 공식 값으로 되돌아간다(의도된 동작).
// 공식 자체의 상수를 바꾸려면 balance/progression.js를 고칠 것.
const FIELDS = [
  { key: 'spawnInterval', label: '스폰 간격(초)', min: 0.2, max: 6, step: 0.05, live: true },
  { key: 'maxAlive', label: '동시 최대(마리)', min: 1, max: 20, step: 1, live: true },
  { key: 'dpsMultiplier', label: '피해 배율', min: 0, max: 3, step: 0.1, live: true },
  { key: 'lifetimeMultiplier', label: '수명 배율', min: 0.25, max: 3, step: 0.05, live: true },
  // 구간이 오르면 공식이 200 → 240 → 288 … 으로 키운다. 상한을 넉넉히 잡아둔다.
  { key: 'quota', label: '할당량(MB)', min: 50, max: 3000, step: 10, live: true },
  // rules.stage = 구간n + 1 (enemies 시트 min_stage가 1부터라 한 칸 밀린 값).
  // 이 슬라이더를 올리면 아직 해금 안 된 방해꾼도 강제로 등장시켜 볼 수 있다.
  { key: 'stage', label: '해금 단계(min_stage≤)', min: 1, max: 10, step: 1, live: true },
  { key: 'timeLimit', label: '제한시간(초)', min: 30, max: 400, step: 10, live: false },
];

/** 게임 쪽에서 읽는 디버그 옵션 */
export const debugState = {
  showHitbox: false,
};

let panel = null;
let statsEl = null;
let boundRules = null;
const controls = new Map();

export function initDebugPanel() {
  if (!DEBUG || panel) return;

  panel = document.createElement('div');
  panel.id = 'debug-panel';

  const title = document.createElement('h2');
  title.textContent = 'DEBUG — 밸런스 조절';
  panel.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'debug-hint';
  hint.textContent = 'D키 패널 접기 · H키 히트박스 · 판을 시작하면 시트 값으로 초기화됨';
  panel.appendChild(hint);

  // 구간 즉시 이동 — 누르면 그 구간 n으로 startGame()을 다시 불러 처음부터
  // 시작한다(진행도·타이머·할당량 전부 그 구간의 시작값 — startGame()이 매판
  // 시작 때 하는 리셋을 그대로 재사용하므로 여기서 따로 뭘 안 맞춰도 된다).
  const jumpHint = document.createElement('p');
  jumpHint.className = 'debug-hint';
  jumpHint.textContent = '구간 즉시 이동 (그 구간 시작값으로 재시작)';
  panel.appendChild(jumpHint);

  const jumpRow = document.createElement('div');
  jumpRow.className = 'debug-stagejump';
  for (const n of STAGE_JUMPS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    // 무한모드 첫 구간은 번호만 쓰면 유한 구간과 구분이 안 된다.
    btn.textContent = n >= config.stage.finiteCount ? `무한(${n + 1})` : `${n + 1}구간`;
    btn.addEventListener('click', () => startGame(n));
    jumpRow.appendChild(btn);
  }
  panel.appendChild(jumpRow);

  for (const field of FIELDS) {
    const row = document.createElement('div');
    row.className = 'debug-row';

    const label = document.createElement('label');
    label.textContent = field.live ? field.label : `${field.label} *`;
    label.htmlFor = `debug-${field.key}`;

    const out = document.createElement('output');

    const input = document.createElement('input');
    input.type = 'range';
    input.id = `debug-${field.key}`;
    input.min = String(field.min);
    input.max = String(field.max);
    input.step = String(field.step);

    input.addEventListener('input', () => {
      const value = Number(input.value);
      out.textContent = String(value);
      // rules를 직접 고친다. 게임 로직이 매 프레임 rules를 다시 읽으므로
      // 슬라이더를 움직이는 순간 바로 반영된다.
      if (boundRules) boundRules[field.key] = value;
    });

    row.append(label, out, input);
    panel.appendChild(row);
    controls.set(field.key, { input, out });
  }

  const footnote = document.createElement('p');
  footnote.className = 'debug-hint';
  footnote.textContent = '* 표시는 다음 판부터 적용';
  panel.appendChild(footnote);

  statsEl = document.createElement('div');
  statsEl.className = 'debug-stats';
  panel.appendChild(statsEl);

  document.body.appendChild(panel);
}

/** 새 판이 시작될 때 호출. 슬라이더를 이번 판의 rules 객체에 연결한다. */
export function bindRules(rules) {
  if (!DEBUG) return;
  boundRules = rules;

  for (const field of FIELDS) {
    const control = controls.get(field.key);
    if (!control) continue;
    const value = rules[field.key];
    control.input.value = String(value);
    control.out.textContent = String(value);
  }
}

/** 디버그 전용 키를 처리한다. 처리했으면 true. */
export function handleDebugKey(code) {
  if (!DEBUG) return false;

  if (code === 'KeyD') {
    if (panel) panel.hidden = !panel.hidden;
    return true;
  }
  if (code === 'KeyH') {
    debugState.showHitbox = !debugState.showHitbox;
    return true;
  }
  return false;
}

/** 지금 구간에 스폰 후보인 방해꾼 id 목록(스폰이 실제로 쓰는 buildPool 그대로). */
function activeEnemyIds(state, gameData) {
  if (!state.rules) return '-';
  const ids = buildPool(gameData.enemies, state.rules.stage).map((s) => s.id);
  return ids.length ? `${ids.length}종 ${ids.join(',')}` : '없음';
}

/** 지금 구간에 해금된 환경 방해 id 목록(발동이 실제로 쓰는 판정 그대로). */
function activeHazardIds(state) {
  if (!state.rules) return '-';
  const ids = eligibleHazardIds(state.rules.stage);
  const off = config.hazard.enabled ? '' : ' (설정에서 끔)';
  return (ids.length ? `${ids.length}종 ${ids.join(',')}` : '없음') + off;
}

/** 매 프레임 호출. 현재 수치를 패널 아래쪽에 찍는다. */
export function updateDebugStats(state, gameData, fps) {
  if (!DEBUG || !statsEl || panel.hidden) return;

  const s = state.stats;
  const acc = s.clicks > 0 ? Math.round((s.hits / s.clicks) * 100) : 0;
  const alive = state.enemies.length;

  statsEl.textContent = [
    `fps        ${fps}`,
    `balance    ${gameData.loading ? 'loading' : gameData.source}`,
    `phase      ${state.phase}`,
    `구간       n=${state.stageIndex} (표시 ${state.stageIndex + 1}구간)${state.stageIndex >= config.stage.finiteCount ? ' [무한]' : ''}`,
    // ★ 해금 배치 확인용 — 지금 구간에 "실제로 스폰 후보인" 목록을 그대로 보여준다.
    //   설정값을 다시 읽어 계산하는 게 아니라 스폰이 쓰는 buildPool()과 환경 방해가
    //   쓰는 eligibleHazardIds()를 그대로 부른다. 표시와 실제가 갈리면 확인 자체가
    //   무의미해지므로, 판정은 언제나 그 한 곳에서만 한다.
    `활성적    ${activeEnemyIds(state, gameData)}`,
    `활성방해  ${activeHazardIds(state)}`,
    `살아있음   ${alive} / ${state.rules?.maxAlive ?? '-'}`,
    `공격임박   ${state.attackWarning ? 'YES' : 'no'}`,
    `누적피해   ${state.stats.drainedPct.toFixed(1)}%`,
    `정지       ${state.blocked ? 'YES' : 'no'}`,
    `정확도     ${acc}% (${s.hits}/${s.clicks})`,
    `파일       ${s.filesDone}개 완료`,
    `제거       ${s.killed}마리`,
    // 콤보가 실제로 구간당 몇 MB를 보태는지 — config.combo.killMb를 조절할 때
    // 눈으로 볼 근거다(설계 목표: 구간당 +40~60MB).
    `콤보       ${state.combo} (최고 ${s.comboBest})`,
    `콤보MB     ${s.killMb.toFixed(1)} / 누적 ${state.uploaded.toFixed(1)}MB`,
  ].join('\n');
}
