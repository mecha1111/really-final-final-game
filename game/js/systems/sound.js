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

  // === 특수능력 방해꾼 고유 처치음(Enemy.kill의 KILL_SFX 표에서 골라 낸다) ===
  KILL_CLONE: 'sfx_kill_clone', // 복제 취소/삭제
  KILL_POPUP: 'sfx_kill_popup', // X로 창 닫힘
  KILL_UNPLUG: 'sfx_kill_unplug', // 전원 복구
  KILL_HIDDEN: 'sfx_kill_hidden', // 발각
  KILL_BOMB: 'sfx_kill_bomb', // 폭탄 처치(클릭 제거)
  // popup 몸통(X 아닌 곳) 오클릭 — "틀렸다" 오답음(fakebtn_penalty와 구분)
  POPUP_WRONG: 'sfx_popup_wrong',

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
//   - 자주 나는 소리(처치·콤보·클릭·등장)는 확 낮춰 전체 음압을 내린다.
//   - 드물고 중요한 소리(완료·시작·클리어·게임오버)만 존재감 있게.
//   - 2026-08-22 톤다운: "너무 자주·날카로워 귀에 거슬린다"는 피드백 반영 — 자주 나는
//     소리 전부 한 단계씩 내리고, 등장음은 거의 깔리는 수준으로.
//   - 2026-08-23 부분 상향: 위 톤다운 이후 "일부가 너무 작아 안 들린다"는 피드백.
//     그때 낮춘 게 잘못은 아니었다 — 처치·콤보처럼 "날카롭다"고 지적받은 것들은
//     그대로 두고, 애초에 그런 지적을 받은 적 없는데 그냥 낮게 시작한 것들만 골라
//     한두 단계 올렸다: 등장음(너무 작아 안 들리면 "때렸는데 반응이 없다"로
//     읽힌다), 경고·긴장 계열(atk_warning/time_tick/overload_end — 정보 전달이
//     본분인 소리가 안 들리면 그 역할을 못한다), bait_exit(짝인 bait_appear
//     0.5보다 너무 처져 있었다), ransom_crack_1(첫 타격에 반응이 있어야 한다).
//   - 2026-08-25 copier 재조정: "copier 소리가 다른 것보다 크다"는 피드백을 실측
//     (raw PCM RMS/peak, 같은 게인 등급끼리 비교)으로 확인 — sfx_copier_selfdestruct는
//     같은 0.55 등급(clone_split/combo_tier/unplug_stop)보다 실효 RMS가 약 2배
//     높았다(원본 mp3 자체가 더 크게 마스터링됨). entrance_print는 또래 등장음
//     대비 실측상 튀지 않았지만, copier는 등장(print) 직후 거의 바로 자폭하는
//     구조라 두 소리가 짧은 시간에 겹쳐 "copier가 시끄럽다"는 인상을 더한다 —
//     그래서 같이 한 단계 낮췄다.
const SFX_GAIN = {
  // === 자주 나는 소리 — 작게 ===
  [SFX.COMBO]: 0.3, // 이제 5콤보마다 1회로 빈도도 줄임
  [SFX.KILL_SOFT]: 0.5, // 처치음(연타) — 짧고 은은하게
  [SFX.KILL_HARD]: 0.6,
  [SFX.HIT]: 0.5,
  [SFX.ATK_WARNING]: 0.6, // 경고는 안 들리면 역할을 못한다 — 0.5→0.6
  [SFX.UI_CLICK]: 0.4,
  [SFX.CRT_KICK]: 0.45,
  [SFX.CLONE_SPLIT]: 0.55,
  [SFX.COPIER_SELFDESTRUCT]: 0.3, // 실측 실효 RMS가 같은 등급보다 2배 커서 대폭 하향: 0.55→0.3
  [SFX.COMBO_TIER]: 0.55,
  [SFX.BAIT_APPEAR]: 0.5,
  [SFX.UNPLUG_STOP]: 0.55,
  [SFX.FAKEBTN_PENALTY]: 0.6,
  [SFX.BOMB_EXPLODE]: 0.85, // 화면 최고 위협 — 만료 폭발은 임팩트 있게

  // === 특수능력 처치음(고유) — basic(KILL_SOFT)과 같은 결, 살짝만 개성 ===
  [SFX.KILL_CLONE]: 0.5,
  [SFX.KILL_POPUP]: 0.5,
  [SFX.KILL_UNPLUG]: 0.5,
  [SFX.KILL_HIDDEN]: 0.5,
  [SFX.KILL_BOMB]: 0.6, // 폭탄 처치(제거) — 존재감
  [SFX.POPUP_WRONG]: 0.45, // 가벼운 오답음

  // === 다단계 타격 ===
  [SFX.RANSOM_CRACK_1]: 0.45, // 첫 균열 — 반응은 있어야 한다: 0.4→0.45
  [SFX.RANSOM_CRACK_2]: 0.5, // 갈라짐 — 중간

  // === 등장음(스폰 잦아 존재감은 낮게 유지하되, 아예 안 들리진 않게 한 단계씩) ===
  [SFX.ENTRANCE_POP]: 0.3, // 0.2→0.3
  [SFX.ENTRANCE_SLAM]: 0.4, // 0.3→0.4
  [SFX.ENTRANCE_WINDOW]: 0.35, // 0.25→0.35
  [SFX.ENTRANCE_PRINT]: 0.3, // copier 등장 — 자폭음과 짧게 겹쳐 체감이 커서 한 단계 하향: 0.35→0.3

  // === 기타 ===
  [SFX.BAIT_EXIT]: 0.4, // 등장(0.5)과 짝인데 너무 처져 있었다: 0.35→0.4
  [SFX.OVERLOAD_START]: 0.45,
  [SFX.OVERLOAD_END]: 0.4, // 진입(0.45)과 짝이 안 맞았다: 0.35→0.4
  [SFX.TIME_TICK]: 0.4, // 마지막 5초 긴장감용인데 너무 작았다: 0.3→0.4
  [SFX.UI_OPEN]: 0.4,
  [SFX.UI_CLOSE]: 0.4,

  // === 드물고 중요한 소리 — 존재감 유지 ===
  [SFX.COMPLETE]: 0.65, // 파일 완료
  [SFX.START]: 0.85, // 게임 시작(부팅)
  [SFX.STAGE_CLEAR]: 0.85, // 구간 클리어(로그온)
  [SFX.GAMEOVER]: 0.95, // 게임오버(블루스크린)
};

let ctx = null; // AudioContext. null이면 이 브라우저에서 사운드를 못 쓴다는 뜻(아래 initSound)
let masterGain = null;
/** 파일 키(예: 'sfx_kill_soft_2') -> AudioBuffer. 로드/디코드에 실패한 건 아예 안 들어온다. */
const buffers = {};
/** SFX 이름 -> 실제로 로드된 파일 키 배열(변주 풀). playSfx가 여기서 하나를 무작위로 고른다. */
const pools = {};

// ── 재생 관리: "중요한 소리는 절대 안 끊긴다" ──────────────────────────────────
// 이 배열 밖에서 만들어지는 BufferSource(=IMPORTANT_SFX)는 이 파일 어디서도 stop()을
// 부르지 않는다 — 즉 한 번 시작하면 반드시 끝까지 튼다. 아래는 그 나머지("자주,
// 짧게" 나는 소리)에만 적용되는 상한이다.
//
// ★ 왜 상한이 필요한가: 처치가 몰리거나(콤보 연속킬) 과밀 글리치 같은 순간엔 짧은
//   소리가 한 프레임에 여러 개씩, 짧은 시간 동안 수십 개까지 겹칠 수 있다. 이 게임은
//   막을 방법이 원래 없었다(BufferSource는 만들 때마다 새로 붙고 알아서 GC된다) —
//   그런데 하필 게임오버/클리어처럼 "중요한 소리"가 나는 순간이 바로 그런 혼란
//   직후인 경우가 많다(시간 임박·연속 피격·마무리 러시). 짧은 소리가 순간적으로
//   너무 많이 겹치면 오디오 그래프에 부담이 걸려 마침 재생 중이던 중요한 소리의
//   체감이 묻히거나 끊기는 것처럼 들릴 수 있다 — 그 부담 자체를 상한으로 없앤다.
//   중요한 소리는 이 상한 풀에 아예 들어가지 않으므로 그 영향을 원천적으로 안 받는다.
const IMPORTANT_SFX = new Set(); // initSound 이후 SFX 값으로 채운다(아래)
const MAX_ACTIVE_MINOR = 28; // 평범한 플레이에선 절대 안 걸리는, 처치음을 뺀 나머지용 상한

// 2026-08-25: 처치음(kill 계열)을 상한 풀에서 완전히 빼낸다 — IMPORTANT_SFX와
// 똑같이 "이 파일의 그 무엇도 다시 안 건드리는" 취급으로 승격했다.
//
// ★ 왜 "우선순위 보호"만으로는 부족했나: 예전엔 activeMinor 안에 그대로 두고
//   evictOldestMinor()가 "가장 오래된 비-처치음부터" 정리하게만 해뒀다. 그런데
//   콤보 연속킬처럼 짧은 시간에 처치음만 28개(상한) 넘게 몰리면 — 흔한 상황이다,
//   처치음 하나가 ~1초짜리라 채 안 끝난 게 계속 쌓인다 — 보호 대상 자체가 상한을
//   넘겨버리니 "가장 오래된 처치음"부터 정리 대상이 됐다. 실측(합성 40연타)으로
//   확인: 40개 중 12개가 시작 15~35ms 만에 강제 페이드아웃-정지됐다 — 시작은
//   했지만 거의 안 들리게 잘린 것이라, 사용자에게는 "처치음이 한 번씩 안 난다"로
//   들렸다. 상한 안에서의 우선순위로는 "상한 자체를 넘는 폭주"를 못 막는다.
//
// ★ 상한 없이 둬도 괜찮은 이유: 처치음은 ~1초짜리로 스스로 곧 끝난다(무한정
//   쌓이는 종류가 아니다 — 볼륨 자동화 이벤트가 무한히 쌓이던 그 버그와는 성격이
//   다르다, 그건 별도로 고쳐졌다). 콤보 연속킬이 아무리 빨라도 사람 손이나
//   게임 로직이 낼 수 있는 처치 속도는 초당 수십 회를 못 넘으므로, 동시에
//   떠 있는 처치음 소스 수는 자연히 자기 제한된다.
//
// enemies/Enemy.js의 KILL_SFX 표(종류별 고유 처치음)와 정확히 같은 집합이어야
// 한다 — 표에 새 종류가 늘면 여기도 같이 늘려야 그 처치음도 보호받는다.
// POPUP_WRONG은 처치가 아니라 "틀렸다" 오답음이라 여기 안 넣는다(상한 대상 그대로).
const KILL_SFX_NAMES = new Set([
  SFX.KILL_SOFT,
  SFX.KILL_HARD,
  SFX.KILL_CLONE,
  SFX.KILL_POPUP,
  SFX.KILL_UNPLUG,
  SFX.KILL_HIDDEN,
  SFX.KILL_BOMB,
]);

/** 지금 재생 중인 "중요하지도, 처치음도 아닌" 소리들(콤보·피격·등장·경고 등) —
 *  오래된 순서(push만 하고 앞에서 뺀다). {src, gain} — evict할 때 gain을 짧게
 *  0으로 내린 뒤 멈춰야 "뚝" 끊기는 클릭음이 안 난다(끝까지 놔둔 채 그냥
 *  stop()하면 그 순간 파형이 갑자기 잘려 클릭이 난다). */
const activeMinor = [];

/** 상한을 넘겼을 때 가장 오래된 하나를 짧게 페이드아웃하며 정리한다. */
function evictOldestMinor() {
  const oldest = activeMinor.shift();
  if (!oldest) return;
  const now = ctx.currentTime;
  try {
    oldest.gain.gain.cancelScheduledValues(now);
    oldest.gain.gain.setValueAtTime(oldest.gain.gain.value, now);
    oldest.gain.gain.linearRampToValueAtTime(0, now + 0.015);
    oldest.src.stop(now + 0.02);
  } catch {
    // 이미 끝난 소스에 stop을 부르면 예외가 난다 — 어차피 정리하려던 상태이므로 무시한다.
  }
}

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

// refreshSfxVolume()이 마지막으로 실제 반영한 볼륨. playSfx()가 "혹시 몰라"
// 재생 직전마다 이 함수를 부르는데(아래 playSfx 주석 참고), 그때마다 값이
// 똑같은데도 매번 setTargetAtTime을 새로 걸면 masterGain.gain 파라미터의
// 자동화 타임라인에 이벤트가 판이 길어질수록 끝없이 쌓인다 — 오디오 렌더
// 스레드가 매 렌더 퀀텀마다 그 누적된 이벤트들을 다시 훑어야 해서, 오래
// 플레이할수록 처리 부담이 늘어 재생이 점점 밀리는 것처럼 느껴질 수 있다
// ("누적 밀림" 증상과 정확히 들어맞는다 — 실측: 연타 시 소리가 한 번씩
// 늦게 나는 감각). 값이 실제로 안 바뀌었으면 아예 아무 것도 안 걸어서
// 이 누적 자체를 없앤다.
let lastAppliedVolume = -1;

/**
 * masterGain에 지금 설정값을 다시 흘려보낸다. 설정창에서 슬라이더를 움직일 때마다
 * ui/settingsPanel.js가 부른다 — 재생 중인 소리까지 즉시 같이 바뀐다.
 *
 * 0일 때만 곧바로 대입하고 그 외엔 setTargetAtTime으로 아주 짧게 미끄러뜨린다.
 * 슬라이더를 드래그하면 값이 프레임마다 들어오는데, 매번 gain을 딱딱 끊어 바꾸면
 * 지직거리는 잡음(zipper noise)이 난다. 반대로 0은 점근적으로 다가가기만 해서
 * 영영 정확히 0이 안 되므로, "무음"만은 예약을 지우고 직접 0을 박는다.
 *
 * ★ 값이 바뀔 때마다 cancelScheduledValues부터 부른다 — 슬라이더를 빠르게
 *   드래그하면 이 함수가 프레임마다 다른 값으로 연달아 불리는데, 이전 곡선을
 *   안 지우고 새 곡선을 또 걸면 여러 setTargetAtTime 곡선이 동시에 쌓인다.
 *   먼저 지우면 항상 "지금부터 목표까지" 곡선 하나만 유지된다.
 */
export function refreshSfxVolume() {
  if (!masterGain || !ctx) return;
  const v = sfxVolume();
  if (v === lastAppliedVolume) return; // 값 그대로면 자동화 이벤트를 또 안 쌓는다
  lastAppliedVolume = v;

  const now = ctx.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  if (v <= 0) {
    masterGain.gain.value = 0;
  } else {
    masterGain.gain.setTargetAtTime(v, now, 0.01);
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
  primeAudio(); // 콜드 스타트 지연 대비 — 첫 입력에서 딱 한 번만 예열한다(내부에서 스스로 막는다)
}

// primeAudio()가 이미 예열을 걸었는지 — 게임 내내 딱 한 번만 하면 된다.
let warmedUp = false;

/**
 * 무음 1샘플 버퍼를 즉시 재생시켜 오디오 렌더 파이프라인을 미리 깨운다("콜드 스타트
 * 워밍업"). AudioContext가 막 만들어졌거나 resume() 직후엔 브라우저가 실제 오디오
 * 스레드를 아직 안 돌리고 있을 수 있어, 그 상태에서 첫 "진짜" 효과음을 재생하면
 * 초기화 오버헤드가 그 소리의 체감 지연으로 그대로 드러난다. 아무도 안 듣는 무음
 * 버퍼로 그 초기화 비용을 먼저 치러두면, 실제로 처치음이 나야 하는 순간엔 파이프라인이
 * 이미 돌고 있어 지연이 없다. 실패해도(오래된 브라우저 등) 그냥 넘어간다 — 있으면
 * 좋은 최적화지 없다고 게임이 멈출 이유는 아니다.
 */
function primeAudio() {
  if (warmedUp || !ctx) return;
  warmedUp = true;
  try {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    warmedUp = false; // 실패했으면 다음 입력에서 다시 시도할 기회를 남겨둔다
  }
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
    // latencyHint:'interactive' — 브라우저에게 "이건 배경음악이 아니라 클릭에
    // 즉시 반응해야 하는 소리"라고 알려준다. 기본값(미지정)도 대개 'interactive'로
    // 해석되지만 그건 브라우저 구현에 맡겨진 값이라 명시해두는 편이 안전하다 —
    // 명시하면 브라우저가 출력 버퍼를 더 작게 잡아 하드웨어 왕복 지연 자체를
    // 줄인다(playback 위주인 'playback'/'balanced'보다 지연이 짧다).
    ctx = new AudioCtor({ latencyHint: 'interactive' });
  } catch {
    console.warn('[sfx] AudioContext를 만들지 못했습니다 — 효과음 없이 진행합니다.');
    return;
  }

  masterGain = ctx.createGain();
  masterGain.gain.value = sfxVolume();

  // 날카로운 고음을 전역에서 부드럽게 눌러주는 로우패스 — "삑삑거림/귀 찌름"을
  // 한 곳에서 한 번에 완화하는 안전망이다(소리 파일 자체를 부드럽게 만든 것에 더해).
  // 8kHz는 체감 음색을 흐리지 않으면서 최상단의 날 선 대역만 깎는 값 — 너무 낮추면
  // XP 차임 같은 "또렷함"까지 뭉개지므로 이 선을 지킨다.
  const soften = ctx.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 8000;
  soften.Q.value = 0.5;
  masterGain.connect(soften);
  soften.connect(ctx.destination);

  // "절대 안 끊기는" 소리들 — 게임의 큰 매듭에서만 나는, 화면 전체가 바뀌는 순간의
  // 소리다. 나머지 전부(처치·콤보·등장·경고 등)는 activeMinor 상한의 대상이다.
  IMPORTANT_SFX.add(SFX.START);
  IMPORTANT_SFX.add(SFX.GAMEOVER);
  IMPORTANT_SFX.add(SFX.STAGE_CLEAR);
  IMPORTANT_SFX.add(SFX.COMPLETE);

  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  preloadAll();

  if (config.debug.enabled) {
    window.__sfx = {
      sfxDebug,
      buffers,
      pools,
      playSfx,
      volume: sfxVolume,
      activeMinorCount: () => activeMinor.length,
      isImportant: (name) => IMPORTANT_SFX.has(name),
      isKillSfx: (name) => KILL_SFX_NAMES.has(name),
      // 지연 진단용 — 콘솔에서 __sfx.latency()로 바로 확인할 수 있게.
      latency: () => ({
        baseLatency: ctx.baseLatency, // 하드웨어 왕복 지연(초) — latencyHint가 낮출 수 있는 값
        outputLatency: ctx.outputLatency, // 실측 출력 지연(초, 지원 브라우저만)
        sampleRate: ctx.sampleRate,
        warmedUp,
      }),
      lastAppliedVolume: () => lastAppliedVolume,
    };
  }
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
  // 시작을 아주 짧게(≈8ms) 페이드인해 "딱" 끊기는 어택·클릭 잡음을 부드럽게 만든다 —
  // 날카로운 어택이 귀에 거슬린다는 지적에 대한 대응(짧아서 리듬감은 안 죽는다).
  const g = ctx.createGain();
  const g0 = SFX_GAIN[name] ?? 1;
  const t0 = ctx.currentTime;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(g0, t0 + 0.008);
  src.connect(g);
  g.connect(masterGain);

  // 중요한 소리(IMPORTANT_SFX)와 처치음(KILL_SFX_NAMES)은 여기서 끝 — 추적도,
  // 상한도 안 걸린다. 한 번 start()하면 이 파일의 그 무엇도 이 소스를 다시
  // 건드리지 않으므로 반드시 끝까지 튼다. 나머지("minor")만 activeMinor로
  // 추적해 상한을 지킨다.
  if (IMPORTANT_SFX.has(name) || KILL_SFX_NAMES.has(name)) {
    src.start(0);
    return;
  }

  if (activeMinor.length >= MAX_ACTIVE_MINOR) evictOldestMinor();

  const entry = { src, gain: g };
  activeMinor.push(entry);
  src.onended = () => {
    const i = activeMinor.indexOf(entry);
    if (i !== -1) activeMinor.splice(i, 1);
  };

  src.start(0);
}
