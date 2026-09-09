// 이 파일 역할: "환경 방해(hazard)"의 공통 프레임워크 — 등록표, 스케줄러(언제 터질지),
// 해제 처리, 판 종료 정리. 각 방해의 실제 생김새·연출은 ui/hazards/*.js가 맡는다.
//
// ── 방해꾼(적)과 무엇이 다른가 ──────────────────────────────────────────────
// 방해꾼은 "클릭해서 없애는 대상"이고 캔버스(z5)에 그려진다. 환경 방해는 화면·조작
// 자체를 망가뜨리는 장치라 HTML 레이어(.layer-hazard, z7)에 얹힌다 — XP 대화상자·
// 스크린세이버·전원관리처럼 "진짜 그 시절 시스템 UI"의 외형을 그대로 흉내 내려면
// 캔버스에 벡터로 그리는 것보다 DOM+CSS가 훨씬 정직하게 나온다(기존 XP 창 스타일을
// 그대로 재사용할 수 있다는 점도 크다).
//
// ★ 절대 규칙: 환경 방해는 업로드 진행을 멈추지 않는다(config.hazard 주석 참고).
//   여기 어디에도 state.blocked나 upload 관련 값을 건드리는 코드가 없어야 한다.
//
// ── pointer-events 규칙 (이 프로젝트가 가장 자주 터뜨린 지점) ────────────────
// .layer-hazard 컨테이너 자체는 항상 pointer-events:none이다. "해제 조작을 받아야
// 하는 요소"만 자기 CSS에서 pointer-events:auto로 연다(.layer-win > * / .layer-bsod
// 버튼이 이미 쓰는 관례 그대로).
//   · auto인 요소 위 클릭 → 브라우저가 그 요소에게 직접 보낸다. 캔버스(z5)는 아예
//     이벤트를 못 받으므로 "해제 클릭이 방해꾼을 잘못 죽이는" 일이 구조적으로 없다.
//   · none인 요소 위 클릭 → 히트테스트에서 통째로 빠져 그대로 캔버스로 내려간다.
//     방해꾼 판정도 평소와 100% 같다(elementsFromPoint도 none인 건 애초에 안 준다).
// ★ 캔버스의 pointer-events를 잠깐 껐다 켜는 식의 "임시 상태 변경"은 절대 금지다 —
//   중간에 무슨 일이 나면 영영 꺼진 채로 굳어 게임이 먹통이 된다(systems/input.js의
//   forwardClickThrough 주석에 그 사고 기록이 있다). 여기선 상태를 바꾸지 않고,
//   각 요소가 처음부터 정해진 pointer-events 값을 갖는 것만으로 해결한다.

import { config } from '../config.js';
import { state, onPhaseChange } from '../core/state.js';
import { recordHazardEncounter } from '../core/save.js';

/** id -> 정의. ui/hazards/*.js가 모듈 로드 시점에 registerHazard()로 채운다. */
const DEFS = new Map();

let layerEl = null;

// ── 스케줄러 상태 ────────────────────────────────────────────────────────────
// 전부 모듈 지역 변수 + resetHazards()로 초기화하는 패턴이다(systems/upload.js의
// resetUploadEdges, systems/overload.js의 resetOverloadEdges와 같은 결) — 판을
// 넘어 기억이 새어 들어가면 "새 판 첫 프레임에 엉뚱한 게 터진다"가 된다.
let fireTimer = 0; // 0이 되는 순간 발동을 시도한다(초)
let lastFiredId = null; // 같은 종류 연속 금지
let lastPointer = null; // 해제 조건이 '이동'인 방해가 쓰는 직전 프레임 커서 위치

const rand = (min, max) => min + Math.random() * (max - min);

/**
 * 방해 하나를 등록표에 올린다. 모듈 로드 시점에 한 번씩 부른다.
 *
 * @param {object} def
 *   id          {string}  고유 id. __game.hazard(id)와 같은 값.
 *   minStage    {number}  이 구간(rules.stage, 1부터)부터 등장.
 *   durationSec {number}  이 시간이 지나면 자동 종료(해제 안 해도 끝난다).
 *   dismiss     {'click'|'drag'|'move'|'button'|'timeout'} 해제 방식.
 *                 · click / timeout — 이 프레임워크가 직접 처리한다.
 *                 · button / move / drag — 언제 풀렸는지는 방해 자신만 알 수 있어서
 *                   def가 직접 dismissHazard(inst, ...)를 부른다. 이 값은 "무엇으로
 *                   푸는 놈인지"를 한눈에 보여주는 표기 겸 기본 배선 스위치다.
 *   mount(inst)  {function} 레이어에 넣을 DOM을 만들어 inst.el에 대입한다.
 *   update(inst, dt) {function=} 매 프레임(카운트다운·연출).
 *   onEnd(inst, reason) {function=} 끝날 때 1회. reason: 'dismissed'|'timeout'|'reset'
 *   telegraph  {object=} 본 효과 직전에 config.hazard.telegraphSec만큼 재생할 "축소판".
 *                 { mount(t), update(t, dt), unmount(t) } — 전부 선택.
 *                 t.el에 DOM을 대입하면 프레임워크가 레이어에 넣고 끝나면 지운다.
 *                 ★t.el에는 pointer-events:none이 강제로 박힌다(클릭 판정 불변).
 *                 ★unmount는 mount가 건드린 것을 반드시 전부 되돌려야 한다 —
 *                   DOM 밖(예: #stage 클래스)을 만졌다면 특히.
 */
export function registerHazard(def) {
  DEFS.set(def.id, def);
}

/** 최초 1회(main.js). 레이어 엘리먼트를 잡아두고, 판이 끝날 때의 뒷정리를 건다. */
export function initHazards() {
  layerEl = document.getElementById('layer-hazard');

  // ★ 판이 'playing'을 벗어나는 순간 떠 있는 방해를 전부 치운다.
  //
  //   예전엔 resetHazards()가 startGame()에만 걸려 있었다. 그래서 할당량을 채운
  //   순간(또는 시간이 다한 순간) 마침 방해가 떠 있으면, 그게 클리어 화면·BSOD·
  //   엔딩·타이틀 위에 그대로 얹혀 갔다 — .layer-hazard(z7)가 그 화면들(z6)보다
  //   위라 통계 숫자와 버튼까지 가렸고(플레이스루에서 4번 걸렸다), 게다가
  //   update()가 playing이 아니면 통째로 return하는 탓에 durationSec 자동 종료도
  //   못 돌아 "다음 구간"을 누를 때까지 영영 안 사라졌다.
  //
  //   ★ 나가는 길이 여럿이라(클리어·실패·엔딩·BSOD의 [로비]·리로드 버튼) 각
  //     지점에 흩뿌리면 또 놓친다. 그래서 전이 자체를 한 곳에서 듣는다
  //     (core/state.js의 onPhaseChange).
  //   ★ 되돌리기는 각 방해의 onEnd가 맡는다 — 화면 반전(flip), 가짜 커서와
  //     커서 숨김(driver), window 리스너(cracked)가 전부 거기서 풀린다.
  //     --hz-dim과 캔버스 오버레이는 방해 자신의 엘리먼트에만 걸려 있어서
  //     endHazard()의 el.remove()로 같이 사라진다. 스크린세이버(screensaver)는
  //     onEnd()가 state.uploadDamageDisabled를 직접 되돌린다 — DOM 밖 값이라
  //     el.remove()가 못 건드리는 유일한 경우다.
  //   ★ 사유는 'reset'이라 벌칙이 안 나간다(reboot의 PENALTY_REASONS 참고) —
  //     판이 끝나서 치우는 것이지 플레이어가 방치한 게 아니다.
  onPhaseChange((next) => {
    if (next !== 'playing') resetHazards();
  });
}

/** 등록된 id 목록 — 디버그 핸들(__game.hazard)이 "뭘 부를 수 있나" 보여줄 때 쓴다. */
export function hazardIds() {
  return [...DEFS.keys()];
}

/**
 * 그 구간(rules.stage, 1부터)에 해금돼 있는 환경 방해 id 목록.
 * 실제 발동 후보를 고르는 pickEligible()과 정확히 같은 조건을 쓴다 — 디버그
 * 패널이 "지금 구간에 뭐가 활성인가"를 보여줄 때 그 목록이 실제와 갈리면
 * 확인 자체가 무의미해지므로, 판정을 여기 한 곳에서만 한다.
 */
export function eligibleHazardIds(stage) {
  // canFire()는 선택 사항이다 — 구간 해금(minStage) 말고 "지금 이 방해를 낼 수
  // 있는 다른 조건"이 있는 방해만 정의한다(지금은 화면 회전 접근성 토글을 보는
  // flip 하나뿐). 없으면 늘 낼 수 있는 것으로 친다.
  return [...DEFS.values()]
    .filter((d) => (d.minStage ?? 1) <= stage && d.canFire?.() !== false)
    .map((d) => d.id);
}

/**
 * 지금 떠 있는 것 전부를 정리하고 스케줄러도 처음으로 되돌린다.
 * 부르는 곳은 둘이다:
 *   1) core/stageManager.js의 startGame() — 판을 넘어 잔존하면 새 판이 시작하자마자
 *      지난 판의 대화상자가 화면 한가운데 남아있게 된다.
 *   2) 위 initHazards()가 건 phase 구독 — 판이 'playing'을 벗어나는 그 순간.
 *      (1)만 있던 시절엔 클리어/실패 화면 위에 방해가 얹혀 갔다. 자세한 근거는
 *      initHazards()의 주석 참고.
 * 두 번 불려도 안전하다(이미 빈 배열이면 아무 일도 안 한다).
 */
export function resetHazards() {
  // ★전조도 같이 끊는다 — 판이 끝나는 순간 "곧 터질 것"의 예고만 화면에 남으면
  //   그것도 잔존이다(본 효과가 영영 안 오므로 더 이상하다).
  endTelegraph();
  for (const inst of [...state.hazards]) endHazard(inst, 'reset');
  state.hazards.length = 0; // endHazard가 이미 빼지만, 혹시 모를 잔여까지 확실히
  fireTimer = config.hazard.graceSec + rand(config.hazard.intervalMinSec, config.hazard.intervalMaxSec);
  lastFiredId = null;
  lastPointer = null;
}

/**
 * 지금 당장 하나 발동시킨다. 스케줄러와 디버그 핸들(__game.hazard) 공용 진입점.
 * @returns {object|null} 만들어진 인스턴스(못 만들면 null)
 */
export function triggerHazard(id) {
  const def = DEFS.get(id);
  if (!def || !layerEl) return null;

  const inst = {
    id: def.id,
    def,
    age: 0,
    el: null,
    /** 이번 프레임에 커서가 움직인 거리(px, 월드 좌표) — 해제가 '이동'인 방해가 읽는다. */
    pointerDelta: 0,
    /** 방해가 자기 상태를 담아두는 자리(카운트다운 남은 값, 별 목록 등). */
    data: {},
  };

  def.mount(inst);
  if (inst.el) layerEl.appendChild(inst.el);

  // 해제가 '클릭'인 방해는 여기서 배선한다 — 그 요소가 클릭을 삼키는 것 자체가
  // "이 클릭은 방해꾼 판정에 안 들어간다"는 보장이다(위 pointer-events 주석).
  if (def.dismiss === 'click' && inst.el) {
    inst.el.addEventListener('pointerdown', (evt) => {
      evt.preventDefault();
      dismissHazard(inst, 'dismissed');
    });
  }

  state.hazards.push(inst);
  lastFiredId = def.id;
  // 도감(ui/dexPanel.js의 환경 방해 구획) 해금 — "한 번 이상 발동을 겪으면"이
  // 조건이라, 실제로 뜬 이 자리가 유일한 신호다. 전조는 여기 안 온다(예고만
  // 보고 열리면 "겪었다"가 아니다). 스케줄러가 부르든 디버그 손잡이
  // (__game.hazard)가 부르든 화면에 뜬 건 마찬가지라 둘 다 센다.
  recordHazardEncounter(def.id);
  return inst;
}

/** 해제됐다(사용자가 조건을 만족시켰다). def가 직접 부르기도 한다. */
export function dismissHazard(inst, reason = 'dismissed') {
  endHazard(inst, reason);
}

/** 공통 종료 처리 — DOM 제거, onEnd 통지, 배열에서 빼기, 다음 발동 예약. */
function endHazard(inst, reason) {
  const i = state.hazards.indexOf(inst);
  if (i === -1) return; // 이미 끝난 것(중복 호출 방어)
  state.hazards.splice(i, 1);

  inst.def.onEnd?.(inst, reason);
  inst.el?.remove();

  // 판 리셋으로 치우는 경우엔 다음 발동 예약을 여기서 하지 않는다 —
  // resetHazards()가 유예 시간까지 포함해서 새로 잡는다.
  if (reason !== 'reset') {
    fireTimer = config.hazard.cooldownSec + rand(config.hazard.intervalMinSec, config.hazard.intervalMaxSec);
  }
}

/**
 * 이번 구간에 뽑을 수 있는 후보 중 하나. min_stage로 거르고 같은 종류 연속은 피한다.
 * ★ 연속 금지 때문에 후보가 0이 되면(예: 그 구간에 해금된 종류가 하나뿐) 금지를
 *   풀고 그거라도 낸다 — 안 그러면 종류가 적은 초반 구간에서 환경 방해가 영영
 *   안 나오는 조용한 고장이 된다.
 */
function pickEligible(stage) {
  // 해금 판정은 eligibleHazardIds() 한 곳에만 둔다(디버그 표시와 실제 발동이
  // 갈리지 않게) — 여기선 그 결과로 def 객체를 다시 집어올 뿐이다.
  const ids = new Set(eligibleHazardIds(stage));
  const eligible = [...DEFS.values()].filter((d) => ids.has(d.id));
  if (eligible.length === 0) return null;

  const fresh = eligible.filter((d) => d.id !== lastFiredId);
  const relaxed = fresh.length === 0;
  // 완화가 실제로 걸린 순간만 한 줄 남긴다 — 나중에 밸런스를 볼 때 "같은 게 두 번
  // 연속 나왔다"가 의도된 완화인지 스케줄러 버그인지 로그로 바로 갈린다.
  // config.debug.enabled일 때만 — 배포본 콘솔을 더럽히지 않는다.
  if (relaxed && config.debug.enabled) {
    console.debug(`[hazard] 이 구간(stage ${stage})에 해금된 종류가 ${eligible.length}개뿐이라 연속 허용 — ${lastFiredId} 재발동`);
  }
  const pool = relaxed ? eligible : fresh;
  return pickWeighted(pool);
}

/**
 * config.hazard.weights를 가중치로 하나 고른다(enemies의 weight 추첨과 같은 방식).
 * ★표에 없는 id는 1로 친다 — 새 방해를 등록하고 표에 올리는 걸 잊어도 "아예 안
 *   나오는" 조용한 고장이 되지 않게. 0으로 두면 그 사고가 그대로 난다.
 */
function pickWeighted(pool) {
  const table = config.hazard.weights ?? {};
  const weightOf = (d) => Math.max(0, table[d.id] ?? 1);
  const total = pool.reduce((sum, d) => sum + weightOf(d), 0);
  if (total <= 0) return pool[Math.floor(Math.random() * pool.length)] ?? null;

  let roll = Math.random() * total;
  for (const d of pool) {
    roll -= weightOf(d);
    if (roll <= 0) return d;
  }
  return pool[pool.length - 1];
}

/**
 * 매 프레임(core/stageManager.js의 update, playing일 때만).
 * 살아있는 방해를 갱신하고, 조건이 되면 새로 하나 발동시킨다.
 */
export function updateHazards(dt, rules) {
  // 커서 이동량 — 해제가 '이동'인 방해(절전 모드)가 이 값을 읽는다.
  // state.pointer는 systems/input.js가 pointermove마다 갱신한다.
  const p = state.pointer;
  const moved = lastPointer ? Math.hypot(p.x - lastPointer.x, p.y - lastPointer.y) : 0;
  lastPointer = { x: p.x, y: p.y };

  // 1) 떠 있는 것 갱신 — 배열을 복사해서 돈다(update 중에 스스로 해제될 수 있다).
  for (const inst of [...state.hazards]) {
    inst.age += dt;
    inst.pointerDelta = moved;
    inst.def.update?.(inst, dt);

    // 자동 종료. 해제 방식과 무관하게 durationSec은 항상 마지막 안전장치다 —
    // 사용자가 해제 조작을 못 찾아도 판이 그것 때문에 망가지진 않게.
    if (inst.age >= inst.def.durationSec && state.hazards.includes(inst)) {
      endHazard(inst, 'timeout');
    }
  }

  // 1-b) 전조 진행 — 다 되면 그 자리에서 본 효과로 넘어간다.
  if (pending) {
    pending.age += dt;
    pending.def.telegraph?.update?.(pending, dt);
    if (pending.age >= config.hazard.telegraphSec) {
      const id = pending.id;
      endTelegraph();
      triggerHazard(id);
    }
    return; // 전조 중엔 새 스케줄을 돌리지 않는다
  }

  // 2) 스케줄 — 꺼져 있으면 발동만 멈춘다(이미 뜬 건 위에서 계속 갱신·종료된다).
  if (!config.hazard.enabled) return;
  // 뭔가 떠 있는 동안은 타이머를 안 깎는다 — "끝난 뒤부터 쿨타임"이 되게.
  if (state.hazards.length >= config.hazard.maxConcurrent) return;
  // ★ 구간 종료 임박 가드(config.hazard.endGuardSec, 2026-09-09 승인분) — 남은
  //   시간이 이 이하면 새로 시작하지 않는다. 막판에 환경 방해가 겹치면 정직하게
  //   채운 할당량을 시간 안에 못 내는 억울함이 생긴다. 이미 떠 있는 것과 진행
  //   중인 전조는 그대로 끝까지 간다 — 여기서 막는 건 "새로" 거는 것뿐이다.
  //   state.timeLeft는 튜토리얼에선 이 함수 자체가 안 불려서(core/stageManager.js
  //   의 `if (!tut) updateHazards(...)`) 항상 실제 판의 값이다.
  if (state.timeLeft <= config.hazard.endGuardSec) return;

  fireTimer -= dt;
  if (fireTimer > 0) return;

  const pick = pickEligible(rules?.stage ?? 1);
  if (!pick) {
    // 아직 아무 종류도 해금 안 된 구간 — 곧 다시 본다(매 프레임 재시도는 낭비).
    fireTimer = config.hazard.intervalMinSec;
    return;
  }
  // ★바로 터뜨리지 않는다 — 먼저 전조를 띄우고, 그게 끝나면 위 1-b가 본 효과를 부른다.
  //   전조를 안 만든 방해도 그대로 돌아간다(startTelegraph가 telegraphSec만큼
  //   기다렸다 넘길 뿐이라, 정의가 없으면 "아무것도 안 보이는 유예"가 된다).
  startTelegraph(pick);
}

// ── 전조 ──────────────────────────────────────────────────────────────────────
// 본 효과 직전에 config.hazard.telegraphSec만큼 재생되는 "축소판".
// ★ 왜 프레임워크에 두나 — 종류마다 각자 setTimeout으로 흉내 내면 (1) 판이 끝나도
//   안 멈추고(이 프로젝트가 방금 고친 hazard 잔존과 같은 부류), (2) 시계가 rAF와
//   갈라지고, (3) "전조 중엔 다음 스케줄을 멈춘다" 같은 규칙을 매번 다시 짜야 한다.
//   여기 한 곳에서 수명·정리·클릭 차단을 전부 보장한다.
let pending = null; // { id, def, age, el, data }

function startTelegraph(def) {
  const tele = { id: def.id, def, age: 0, el: null, data: {} };
  def.telegraph?.mount?.(tele);
  if (tele.el && layerEl) {
    // ★클릭 판정에 절대 영향을 주지 않는다 — 각 방해의 CSS에만 맡기지 않고
    //   프레임워크가 못박는다(이 파일 상단 pointer-events 주석의 그 함정).
    tele.el.style.pointerEvents = 'none';
    tele.el.classList.add('hz-tele');
    layerEl.appendChild(tele.el);
  }
  pending = tele;
}

/** 전조를 끝낸다(정상 종료·판 리셋 공용). 되돌리기는 각 정의의 unmount가 맡는다. */
function endTelegraph() {
  if (!pending) return;
  pending.def.telegraph?.unmount?.(pending);
  pending.el?.remove();
  pending = null;
}

/**
 * 설정창에서 [환경 방해]를 껐을 때 — 지금 떠 있는 것도 즉시 치운다.
 * (다음 판부터만 듣게 하면 "지금 당장 힘들다"는 끄는 이유와 안 맞는다)
 */
export function clearActiveHazards() {
  for (const inst of [...state.hazards]) endHazard(inst, 'dismissed');
}

/**
 * 특정 종류만 지금 즉시 치운다 — 설정창의 [화면 회전] 토글처럼 "이 방해 하나만"
 * 끄는 접근성 스위치가 쓴다(clearActiveHazards는 전부 치우므로 너무 세다).
 * 안 떠 있으면 아무 일도 안 한다.
 */
export function dismissHazardById(id) {
  for (const inst of [...state.hazards]) {
    if (inst.id === id) endHazard(inst, 'dismissed');
  }
}
