// 이 파일 역할: 배경음악(BGM) — 화면(state.phase)에 따라 곡을 자동으로 바꾸고
// 짧게 크로스페이드한다. systems/sound.js(효과음)와 완전히 다른 볼륨 채널이다.
//
// ★ AudioContext는 sound.js 것을 그대로 재사용한다(getAudioContext()) — 자동재생
//   잠금 해제(첫 입력에서 resume())를 SFX와 따로 걸 이유가 없고, 컨텍스트를 두 개
//   만들면 브라우저 자원만 두 배로 든다. 하지만 게인 노드 체인은 완전히 별도다 —
//   SFX의 masterGain(+로우패스 soften)과는 무관한 새 체인(bgmMasterGain)이라
//   두 볼륨(마스터×효과음 vs 마스터×배경음)이 서로 안 섞인다.
//
// ★ 두 겹 게인 구조:
//     트랙별 gain(크로스페이드 진행도, 0~1) → bgmMasterGain(마스터×배경음) → destination
//   이렇게 나눠야 슬라이더를 움직여도 지금 진행 중인 페이드 곡선을 안 건드리고,
//   페이드가 끝나도 슬라이더로 낸 볼륨이 그대로 유지된다. 하나로 합쳤다면 슬라이더
//   조작이 setTargetAtTime을 걸 때마다 크로스페이드용 linearRamp와 서로 값을
//   덮어써서 곡선이 깨졌을 것이다.

import { config } from '../config.js';
import { state } from '../core/state.js';
import { getAudioContext } from './sound.js';

const BGM_DIR = './assets/sfx/';
const TRACKS = { title: 'bgm_title', main: 'bgm_main' };

// 요구사항 범위(0.3~0.5s)의 중간값 — 뚝 끊기지도, 너무 늘어지지도 않는다.
const FADE_SEC = 0.4;

let ctx = null;
let bgmMasterGain = null;
const buffers = {}; // 트랙 키('title'|'main') -> AudioBuffer
let current = null; // { name, src, gain } — 지금 재생 중인 트랙(크로스페이드 중엔 새 트랙으로 이미 교체돼 있다)
let prevPhase = null;

// refreshBgmVolume()이 마지막으로 실제 반영한 볼륨. systems/sound.js의
// refreshSfxVolume()과 같은 이유로 값이 그대로면 자동화 이벤트를 또 안 건다
// (재생 직전마다 매번 다시 걸면 판이 길어질수록 쌓여 문제가 됐던 전례가 있다).
let lastAppliedVolume = -1;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function bgmVolume() {
  const s = state.settings;
  return clamp01(s.soundMaster / 100) * clamp01(s.soundBgm / 100);
}

/** 설정창 배경음 슬라이더가 부른다(ui/settingsPanel.js) — 재생 중인 곡의 체감
 * 볼륨을 그 자리에서 바로 바꾼다. refreshSfxVolume()과 완전히 같은 패턴. */
export function refreshBgmVolume() {
  if (!bgmMasterGain || !ctx) return;
  const v = bgmVolume();
  if (v === lastAppliedVolume) return;
  lastAppliedVolume = v;

  const now = ctx.currentTime;
  bgmMasterGain.gain.cancelScheduledValues(now);
  if (v <= 0) {
    bgmMasterGain.gain.value = 0;
  } else {
    bgmMasterGain.gain.setTargetAtTime(v, now, 0.05);
  }
}

async function loadBuffer(name) {
  try {
    const res = await fetch(`${BGM_DIR}${name}.mp3`);
    if (!res.ok) return null;
    const raw = await res.arrayBuffer();
    return await ctx.decodeAudioData(raw);
  } catch {
    return null;
  }
}

/** 두 곡을 병렬로 미리 읽어둔다. 실패해도(파일 없음 등) 그 곡만 조용히 빠진다 —
 * systems/sound.js의 preloadAll()과 같은 방침. */
async function preloadAll() {
  const results = await Promise.all(
    Object.entries(TRACKS).map(async ([key, file]) => ({ key, buf: await loadBuffer(file) })),
  );
  const missing = [];
  for (const { key, buf } of results) {
    if (buf) buffers[key] = buf;
    else missing.push(key);
  }
  if (missing.length) {
    console.warn(`[bgm] 못 읽어서 이 곡은 안 납니다: ${missing.join(', ')}`);
  }
}

/**
 * 최초 1회(main.js, initSound() 다음에 부른다). sound.js가 만들어둔 AudioContext를
 * 그대로 받아 쓰고, 배경음 전용 게인 체인만 새로 세운다.
 *
 * ★ await하지 않는다 — 프리로드가 끝나기를 기다리느라 게임 시작이 늦어질 이유가
 *   없다(sound.js의 initSound()와 같은 이유). 아직 안 들어온 곡은 startTrack이
 *   그냥 건너뛴다.
 */
export function initBgm() {
  ctx = getAudioContext();
  if (!ctx) return; // sound.js가 Web Audio를 못 쓰는 환경이면 BGM도 같이 포기

  bgmMasterGain = ctx.createGain();
  bgmMasterGain.gain.value = bgmVolume();
  bgmMasterGain.connect(ctx.destination);

  preloadAll();

  if (config.debug.enabled) {
    window.__bgm = {
      buffers,
      volume: bgmVolume,
      currentTrack: () => current?.name ?? null,
      contextState: () => ctx.state,
    };
  }
}

/** 새 트랙을 무음(0)에서 시작해 fadeInSec 동안 끌어올린다. 루프 재생. */
function startTrack(key, fadeInSec) {
  const buf = buffers[key];
  if (!buf || !ctx) return null;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true; // 자연스러운 루프 요구사항 — mp3 자체가 이음새 없이 만들어졌다는 전제

  const g = ctx.createGain();
  const now = ctx.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(1, now + fadeInSec);

  src.connect(g);
  g.connect(bgmMasterGain);
  src.start(0);

  return { name: key, src, gain: g };
}

/** 지금 재생 중인 트랙을 fadeOutSec 동안 내리고 멈춘다. */
function stopCurrent(fadeOutSec) {
  if (!current || !ctx) {
    current = null;
    return;
  }
  const { src, gain } = current;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now); // 지금 값에서부터 자연스럽게 이어서 내린다
  gain.gain.linearRampToValueAtTime(0, now + fadeOutSec);
  try {
    src.stop(now + fadeOutSec + 0.05); // 페이드가 끝난 뒤 살짝 여유를 두고 정지
  } catch {
    // 이미 끝난 소스면 예외 — 어차피 정리하려던 상태이므로 무시한다.
  }
  current = null;
}

/** key로 크로스페이드 전환한다 — 옛 트랙은 페이드아웃, 새 트랙은 동시에 페이드인. */
function switchTo(key) {
  if (current?.name === key) return;
  stopCurrent(FADE_SEC);
  current = startTrack(key, FADE_SEC);
}

/**
 * 구간 클리어 순간 stage_clear 팡파레가 묻히지 않게, 트랙 전환 없이 지금 재생
 * 중인 곡의 게인만 잠깐 죽였다 되돌린다("더킹"). 0.3초 만에 40%까지 낮췄다가
 * 1초 유지, 0.6초에 걸쳐 원래대로 — 팡파레(약 1~1.5초 안팎)가 지나갈 시간을 준다.
 * ★ 클리어했다고 곡을 완전히 끄지 않는 이유: 클리어 화면은 "계속하기"를 누르면
 *   곧장 다음 구간(playing)으로 이어지므로, 여기서 껐다 다음 구간에서 다시 켜면
 *   몇 초 사이에 페이드가 두 번 왕복해 오히려 부산해진다. bgm_main을 그대로
 *   깔아두면 다음 구간으로 넘어갈 때도 끊김이 아예 없다(사용자 판단 요청 항목 —
 *   "유지 or 잠깐 줄여" 중 후자를 택하되 정지는 안 함).
 */
function duckCurrent() {
  if (!current || !ctx) return;
  const { gain } = current;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(1, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.3);
  gain.gain.setValueAtTime(0.4, now + 1.3);
  gain.gain.linearRampToValueAtTime(1, now + 1.9);
}

/**
 * phase → 이 순간 재생돼야 할 트랙 키. null이면 무음.
 * ★ failed(BSOD)는 일부러 무음으로 뺐다 — 게임오버 크래시 연출은 정적이 어울리고,
 *   BGM이 깔려 있으면 GAMEOVER 효과음이 묻힌다(사용자 판단 요청 항목 — "정지 권장"
 *   쪽을 택함). 'cleared'는 'playing'과 같은 트랙(main)을 그대로 써서 트랙 전환
 *   자체가 안 일어나게 한다 — 위 duckCurrent()가 그 경우의 연출을 대신 맡는다.
 */
function desiredTrackFor(phase) {
  if (phase === 'title') return 'title';
  if (phase === 'playing' || phase === 'cleared') return 'main';
  return null; // failed / loading / 기타
}

/**
 * 매 렌더 프레임(main.js) 호출. phase 전환에 맞춰 곡을 자동으로 바꾼다.
 *
 * ★ 오디오가 아직 잠겨 있으면(브라우저 자동재생 정책, sound.js의 unlockAudio가
 *   첫 입력에서 풀어준다) 재생을 시도하지 않고 그냥 넘어간다 — ctx가 running이
 *   되는 바로 다음 프레임에 desired 트랙과 current(아직 null)가 다르다는 것만
 *   보고 자연히 이어서 시작하므로, 잠긴 동안의 phase 변화를 따로 기억해둘
 *   필요가 없다(항상 "지금 phase" 기준으로 다시 판단한다).
 */
export function updateBgm(phase, now) {
  if (!ctx) return;
  if (ctx.state !== 'running') {
    prevPhase = phase;
    return;
  }

  const enteringCleared = phase !== prevPhase && phase === 'cleared';
  prevPhase = phase;

  const desired = desiredTrackFor(phase);
  if (desired !== (current?.name ?? null)) {
    if (desired) switchTo(desired);
    else stopCurrent(FADE_SEC);
  } else if (enteringCleared) {
    duckCurrent();
  }
}
