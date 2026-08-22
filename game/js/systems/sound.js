// 이 파일 역할: 효과음(SFX) 재생. mp3를 미리 읽어 디코드해두고, 이름 하나로 즉시 틀어준다.
// BGM은 아직 없다(state.settings.soundBgm은 슬라이더 값만 보관 중) — 여기는 SFX 전용이다.
//
// ★ Web Audio API를 쓰는 이유(HTMLAudio 풀링 대신):
//   - 같은 소리를 연타로 겹쳐 트는 게 공짜다. 디코드된 AudioBuffer 하나를 두고 재생할
//     때마다 BufferSource를 새로 만들어 붙이면 되므로, "처치 연타 시 소리가 겹쳐야
//     한다"는 요구사항에 풀(pool) 크기 같은 상한이 아예 안 생긴다. HTMLAudio는
//     엘리먼트를 몇 개 복제해둘지 미리 정해야 하고 그 수를 넘으면 소리가 끊긴다.
//   - 볼륨을 노드 하나(masterGain)로 묶을 수 있어서, 설정창 슬라이더를 움직이면
//     "이미 재생 중인 소리까지" 그 자리에서 같이 바뀐다(실시간 반영 요구사항).
//     HTMLAudio는 재생 중인 엘리먼트를 전부 찾아다니며 volume을 다시 써야 한다.
//
// ★ 시계: 게임 로직 쪽 "지금"은 전부 rAF now / dt 한 줄기를 쓴다(main.js). 여기서는
//   그 시계에 맞춰 예약 재생하는 게 하나도 없다 — playSfx()는 항상 "지금 당장"
//   (start(0)) 틀기만 하므로 AudioContext 내부 시계가 게임 시계와 어긋날 여지가 없다.
//   소리를 언제 트느냐는 부르는 쪽(게임 로직)이 이미 단일 시계 위에서 정한다.

import { config } from '../config.js';
import { state } from '../core/state.js';

const SFX_DIR = './assets/sfx/';

/**
 * 쓸 수 있는 효과음 이름표 = 그대로 프리로드 목록이다(아래 preloadAll이 이 값들을 읽는다).
 * 파일명은 `{값}.mp3`. 부르는 쪽이 문자열을 직접 적지 않고 이 상수를 쓰면, 오타가
 * "조용히 아무 소리도 안 남"이 아니라 undefined로 바로 드러난다.
 */
export const SFX = Object.freeze({
  KILL_SOFT: 'sfx_kill_soft',
  KILL_HARD: 'sfx_kill_hard',
  CLONE_SPLIT: 'sfx_clone_split',
  COPIER_SELFDESTRUCT: 'sfx_copier_selfdestruct',

  HIT: 'sfx_hit',
  BOMB_EXPLODE: 'sfx_bomb_explode',
  FAKEBTN_PENALTY: 'sfx_fakebtn_penalty',
  UNPLUG_STOP: 'sfx_unplug_stop',
  ATK_WARNING: 'sfx_atk_warning',

  COMBO: 'sfx_combo',
  COMBO_TIER: 'sfx_combo_tier',

  COMPLETE: 'sfx_complete',
  START: 'sfx_start',
  STAGE_CLEAR: 'sfx_stage_clear',
  GAMEOVER: 'sfx_gameover',

  CRT_KICK: 'sfx_crt_kick',
  UI_CLICK: 'sfx_ui_click',

  // bait(시선 강탈) 등장음. "화려하고 정신없게" 시선을 끌어당기는 놈이라, 등장 순간에
  // 소리로도 확 튀어야 그 역할이 산다(enemies/bait.js의 initBait에서 낸다).
  BAIT_APPEAR: 'sfx_bait_appear',

  // === 다단계 방해꾼(ransom hp3)의 "점점 부서지는" 중간 타격음 ===
  // Enemy.takeHit()이 hp 남은 수로 골라 낸다(최종타는 KILL_HARD).
  RANSOM_CRACK_1: 'sfx_ransom_crack_1', // 1타(hp3→2): 가벼운 첫 균열
  RANSOM_CRACK_2: 'sfx_ransom_crack_2', // 2타(hp2→1): 더 크게 갈라짐

  // === 방해꾼 등장음(입장 연출별 — enemies/entrance.js가 kind로 골라 낸다) ===
  ENTRANCE_POP: 'sfx_entrance_pop', // hop(basic)/pop(clone) — 뿅
  ENTRANCE_SLAM: 'sfx_entrance_slam', // slam(ransom)/drop(bomb) — 쿵
  ENTRANCE_WINDOW: 'sfx_entrance_window', // window(popup)/fade(fake_btn) — XP 창 열림
  ENTRANCE_PRINT: 'sfx_entrance_print', // print(copier) — 인쇄 지지직

  // === bait 퇴장 / 과밀 글리치 진입·해제 / 시간 임박 / UI·기타 ===
  BAIT_EXIT: 'sfx_bait_exit',
  OVERLOAD_START: 'sfx_overload_start',
  OVERLOAD_END: 'sfx_overload_end',
  TIME_TICK: 'sfx_time_tick',
  UI_OPEN: 'sfx_ui_open',
  UI_CLOSE: 'sfx_ui_close',
  SKIP: 'sfx_skip',
});

// 변주(바리에이션) 개수. 이 표에 있는 소리는 프리로드/재생 시 `이름_1.mp3`~`이름_N.mp3`
// 중 하나를 무작위로 골라 낸다(그 위에 detune 피치 변주가 더해진다). 없는 소리는
// 단일 파일 `이름.mp3` 하나만 쓴다 — 자주 나서 단조로움이 드러나는 소리만 여기 둔다.
const VARIANT_COUNTS = {
  [SFX.KILL_SOFT]: 4, // 처치음 — 제일 자주 남
  [SFX.ATK_WARNING]: 3, // 공격 임박 경고 — 긴박함 유지
  [SFX.COMBO]: 3, // 콤보 틱
  [SFX.HIT]: 2, // 공통 피격음
  [SFX.UI_CLICK]: 2, // UI 클릭
};

// 소리별 상대 볼륨(0~1, masterGain 위에 곱해진다). 생성된 mp3의 절대 음량이
// 제각각이라 "체감 크기"를 여기 한 곳에서 맞춘다. 원칙:
//   - 자주 나는 소리(처치·콤보·클릭)는 작게, 드물고 중요한 소리(시작·클리어·게임오버)는
//     존재감 있게.
//   - 여기 값은 "서로 간의 상대"만 정하면 된다. 최종 볼륨은 masterGain(마스터×효과음
//     슬라이더)이 한 번 더 곱해 누른다.
const SFX_GAIN = {
  [SFX.COMBO]: 0.45, // 처치마다 나서 가장 잦음
  [SFX.UI_CLICK]: 0.5,
  [SFX.CRT_KICK]: 0.5,
  [SFX.ATK_WARNING]: 0.6,
  [SFX.HIT]: 0.65,
  [SFX.KILL_SOFT]: 0.7,
  [SFX.CLONE_SPLIT]: 0.7,
  [SFX.COPIER_SELFDESTRUCT]: 0.7,
  [SFX.COMPLETE]: 0.7,
  [SFX.COMBO_TIER]: 0.7,
  [SFX.BAIT_APPEAR]: 0.7,
  [SFX.UNPLUG_STOP]: 0.75,
  [SFX.KILL_HARD]: 0.8,
  [SFX.FAKEBTN_PENALTY]: 0.8,
  [SFX.BOMB_EXPLODE]: 0.85,
  [SFX.START]: 0.9,
  [SFX.STAGE_CLEAR]: 0.9,
  [SFX.GAMEOVER]: 1.0,

  // === 다단계 타격 ===
  [SFX.RANSOM_CRACK_1]: 0.55, // 첫 균열 — 약하게
  [SFX.RANSOM_CRACK_2]: 0.65, // 갈라짐 — 중간

  // === 등장음(자주 스폰되므로 확 낮게) ===
  [SFX.ENTRANCE_POP]: 0.35,
  [SFX.ENTRANCE_SLAM]: 0.45,
  [SFX.ENTRANCE_WINDOW]: 0.4,
  [SFX.ENTRANCE_PRINT]: 0.4,

  // === 기타 ===
  [SFX.BAIT_EXIT]: 0.5,
  [SFX.OVERLOAD_START]: 0.6,
  [SFX.OVERLOAD_END]: 0.5,
  [SFX.TIME_TICK]: 0.45,
  [SFX.UI_OPEN]: 0.5,
  [SFX.UI_CLOSE]: 0.5,
  [SFX.SKIP]: 0.5,
};

let ctx = null; // AudioContext. null이면 이 브라우저에서 사운드를 못 쓴다는 뜻(아래 initSound)
let masterGain = null;
/** 파일 키(예: 'sfx_kill_soft_2') -> AudioBuffer. 로드/디코드에 실패한 건 아예 안 들어온다. */
const buffers = {};
/** SFX 이름 -> 실제로 로드된 파일 키 배열(변주 풀). playSfx가 여기서 하나를 무작위로 고른다. */
const pools = {};

/** 콘솔로 "이 순간 무슨 소리가 불렸나"를 확인할 때 켠다 — window.__sfx.log = true */
const sfxDebug = { log: false };

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * 지금 SFX에 걸려야 할 볼륨(0~1). 마스터와 효과음 슬라이더를 곱한다 —
 * 마스터가 0이면 효과음이 100이어도 0이 되어 완전 무음이 된다(요구사항).
 * state.settings는 0~100 정수라 100으로 나눠 배율로 바꾼다.
 */
function sfxVolume() {
  const s = state.settings;
  return clamp01(s.soundMaster / 100) * clamp01(s.soundSfx / 100);
}

/**
 * masterGain에 지금 설정값을 다시 흘려보낸다. 설정창에서 슬라이더를 움직일 때마다
 * ui/settingsPanel.js가 부른다 — 재생 중인 소리까지 즉시 같이 바뀐다.
 *
 * 0일 때만 곧바로 대입하고 그 외엔 setTargetAtTime으로 아주 짧게 미끄러뜨린다.
 * 슬라이더를 드래그하면 값이 프레임마다 들어오는데, 매번 gain을 딱딱 끊어 바꾸면
 * 지직거리는 잡음(zipper noise)이 난다. 반대로 0은 점근적으로 다가가기만 해서
 * 영영 정확히 0이 안 되므로, "무음"만은 예약을 지우고 직접 0을 박는다.
 */
export function refreshSfxVolume() {
  if (!masterGain || !ctx) return;
  const v = sfxVolume();
  if (v <= 0) {
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.value = 0;
  } else {
    masterGain.gain.setTargetAtTime(v, ctx.currentTime, 0.01);
  }
}

/**
 * 브라우저 자동재생 정책 때문에 AudioContext는 사용자가 화면을 한 번 건드리기 전까지
 * 'suspended'로 시작한다. 첫 입력에서 깨운다 — 게임은 타이틀의 "게임 시작" 버튼을
 * 반드시 누르고 들어오므로 실제로는 그 클릭에서 깨어난다.
 * 이미 running이면 아무 일도 안 한다(리스너를 떼지 않고 그냥 두는 이유).
 */
function unlockAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

/**
 * mp3 하나를 읽어 디코드한다. 실패하면(파일 없음/네트워크/디코드 불가) 예외를 안 던지고
 * null을 돌려준다 — assets.js의 loadImage()와 같은 방침이다. 소리 파일 하나가
 * 없다고 게임이 멈추면 안 된다.
 */
async function loadBuffer(name) {
  try {
    const res = await fetch(`${SFX_DIR}${name}.mp3`);
    if (!res.ok) return null;
    const raw = await res.arrayBuffer();
    // decodeAudioData는 브라우저에 따라 콜백형만 있는 옛 시그니처도 있지만,
    // 지금 지원 대상(Chromium/Safari 최신)은 전부 Promise를 돌려준다.
    return await ctx.decodeAudioData(raw);
  } catch {
    return null;
  }
}

/** SFX 전부를 병렬로 미리 읽어둔다. 실패한 것만 모아 한 번 경고한다(assets.js와 같은 결).
 *  변주가 있는 소리는 `이름_N.mp3`를 모두 읽어 그 이름의 풀(pools[name])로 묶는다. */
async function preloadAll() {
  const names = Object.values(SFX);
  // 이름 하나 → 실제 파일 키 목록으로 펼친다. 변주 개수가 1이면 그냥 이름 그대로.
  const files = [];
  for (const name of names) {
    const n = VARIANT_COUNTS[name] ?? 1;
    for (let i = 1; i <= n; i++) files.push({ key: n === 1 ? name : `${name}_${i}`, name });
  }

  const results = await Promise.all(files.map(async (f) => ({ f, buf: await loadBuffer(f.key) })));

  const missing = [];
  for (const { f, buf } of results) {
    if (buf) {
      buffers[f.key] = buf;
      (pools[f.name] ??= []).push(f.key);
    } else {
      missing.push(f.key);
    }
  }

  if (missing.length) {
    console.warn(`[sfx] 못 읽어서 이 소리는 안 납니다: ${missing.join(', ')}`);
  }
  return buffers;
}

/**
 * 최초 1회(main.js). AudioContext와 볼륨 노드를 세우고 프리로드를 시작한다.
 *
 * ★ await하지 않는다 — 프리로드가 끝나기를 기다리느라 게임 시작이 늦어질 이유가 없다.
 *   아직 안 들어온 소리는 playSfx가 그냥 건너뛰므로(버퍼가 없으면 조용히 return),
 *   최악의 경우 부팅 직후 몇 초 동안 일부 효과음이 빠질 뿐 게임은 정상으로 돈다.
 */
export function initSound() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    console.warn('[sfx] 이 브라우저는 Web Audio를 지원하지 않습니다 — 효과음 없이 진행합니다.');
    return;
  }

  try {
    ctx = new AudioCtor();
  } catch {
    console.warn('[sfx] AudioContext를 만들지 못했습니다 — 효과음 없이 진행합니다.');
    return;
  }

  masterGain = ctx.createGain();
  masterGain.gain.value = sfxVolume();
  masterGain.connect(ctx.destination);

  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  preloadAll();

  if (config.debug.enabled) window.__sfx = { sfxDebug, buffers, pools, playSfx, volume: sfxVolume };
}

/**
 * 효과음 하나를 지금 당장 튼다. 같은 소리를 연달아 불러도 서로 겹쳐서 난다
 * (재생마다 BufferSource를 새로 만들어 붙였다가 끝나면 브라우저가 알아서 치운다).
 *
 * @param {string} name SFX 상수 중 하나
 * @param {{ui?: boolean, varyCents?: number, detune?: number}} [opts]
 *   ui:true면 일시정지(설정 팝업) 중에도 난다 — 설정창 버튼·닫기음처럼 "멈춰 있는
 *   동안 사용자가 직접 누른 것"이 여기 해당한다. 게임 쪽 소리는 기본값(false)이라
 *   일시정지 중엔 안 난다.
 *   varyCents: 이 값(센트)만큼 피치를 무작위로 비껴 연타 시 딱딱 겹치는 걸 흩는다.
 *   detune: 고정 피치 오프셋(센트) — 콤보가 오를수록 음정이 올라가게 하는 등 "상승"
 *     느낌을 줄 때 쓴다(varyCents와 합쳐진다).
 */
export function playSfx(name, opts) {
  if (!ctx || !masterGain) return;

  // 일시정지 중엔 게임 소리를 막는다. main.js가 update()를 통째로 건너뛰므로 대부분의
  // 게임 소리는 애초에 안 불리지만, 렌더 경로에서 불리는 것(CRT 킥 등)도 있어서
  // 부르는 쪽마다 따지지 않고 여기 한 곳에서 막는다.
  if (!opts?.ui && state.settingsOpen) return;

  // 변주 풀에서 하나를 무작위로 고른다(풀에 1개뿐이면 그걸 그대로).
  const pool = pools[name];
  if (!pool || pool.length === 0) return; // 아직 프리로드 전이거나 파일이 없다 — 조용히 넘어간다
  const buf = buffers[pool.length === 1 ? pool[0] : pool[(Math.random() * pool.length) | 0]];

  // 무음이면 아예 안 튼다. gain을 0으로 두는 것만으로도 안 들리긴 하지만, 노드를
  // 만들고 디코드된 버퍼를 계속 돌리는 낭비가 없어지고 "마스터 0 = 완전 무음"이
  // 볼륨 곡선의 근사치가 아니라 확정이 된다.
  if (sfxVolume() <= 0) return;

  unlockAudio(); // 첫 소리가 사용자 제스처와 같은 프레임에 불릴 수 있다(버튼 클릭 등)

  // 슬라이더 변경은 settingsPanel이 refreshSfxVolume()으로 알려주지만, 기본값 복원처럼
  // 다른 경로로 state.settings가 바뀌었을 수도 있어 재생 직전에 한 번 더 맞춘다.
  refreshSfxVolume();

  if (sfxDebug.log) console.log(`[sfx] ${name}`);

  const src = ctx.createBufferSource();
  src.buffer = buf;

  // 피치: 고정 오프셋(detune, 콤보 상승 등) + 연타를 흩는 무작위 변주(varyCents).
  // detune은 길이를 안 바꾸므로 리듬이 밀리지 않는다.
  const baseDetune = opts?.detune ?? 0;
  const vary = opts?.varyCents ? (Math.random() * 2 - 1) * opts.varyCents : 0;
  if (baseDetune || vary) src.detune.value = baseDetune + vary;

  // 소리별 상대 볼륨을 곱해 준다(SFX_GAIN). 소스별 게인 노드를 하나 끼우는 이유는
  // masterGain은 슬라이더가 공유하는 노드라 소리마다 다르게 곱할 수 없기 때문이다.
  const g = ctx.createGain();
  g.gain.value = SFX_GAIN[name] ?? 1;
  src.connect(g);
  g.connect(masterGain);
  src.start(0);
}
