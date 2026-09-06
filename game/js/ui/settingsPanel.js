// 이 파일 역할: ESC로 여닫는 설정 팝업(.layer-settings) — 사운드 슬라이더(값은
// state.settings에 저장하고, systems/sound.js·systems/bgm.js의 볼륨 노드에 실시간
// 반영), CRT 효과 on/off·강도(config.crt와 실시간 연결), 전체화면 토글, 조작법
// 안내, 하단 계속하기/메인으로/기본값복원.
//
// ui/titleScreen.js·ui/bsodScreen.js와 같은 패턴이다 — index.html에 이미 있는
// 정적 마크업에 핸들러만 붙인다(debug.js처럼 DOM을 직접 만들지 않는다. 이건 dev
// 도구가 아니라 실제 게임 UI라 이 프로젝트의 다른 화면들과 같은 결로 짠다).
//
// ★ "일시정지"는 이 파일이 아니라 main.js가 한다 — state.settingsOpen이 true인
//   동안 main.js의 루프가 update(dt)/updateParticles(dt)를 통째로 건너뛴다. 여기는
//   그 플래그만 켜고 끈다. 렌더는 계속 돌아서 멈춘 화면이 그대로 보인다.
//
// ★ 클릭 차단도 별도 로직이 없다 — .layer-settings가 열리면(.open) 캔버스(z5)보다
//   물리적으로 위(z11)에서 pointer-events:auto로 클릭을 그냥 다 받아버린다.
//   .layer-title이 이미 같은 방식으로 캔버스 클릭을 막고 있다(systems/input.js
//   상단 주석) — 새 장치를 만들 필요가 없었다.

import { config } from '../config.js';
import { state, setPhase } from '../core/state.js';
import { playSfx, refreshSfxVolume, SFX } from '../systems/sound.js';
import { refreshBgmVolume } from '../systems/bgm.js';
import { applyCrtSteadyVars } from './crtTransition.js';

// ESC로 "열 수" 있는 phase. 이미 열려 있으면 phase와 무관하게 항상 닫을 수 있다
// (아래 handleSettingsKey). failed(BSOD)는 뺐다 — 그 화면은 이미 자기 버튼
// 3개로 흐름이 끝나 있어서 그 위에 또 모달을 얹으면 오히려 헷갈린다.
const ESC_OPENABLE_PHASES = new Set(['title', 'select', 'playing', 'cleared']);

const DEFAULTS = {
  sound: { soundMaster: 100, soundSfx: 100, soundBgm: 100 },
  crtEnabled: true,
  crtIntensity: 'mid',
};

let layer = null;

function syncSoundRow(key, inputId, outId) {
  const input = document.getElementById(inputId);
  const out = document.getElementById(outId);
  if (input) input.value = String(state.settings[key]);
  if (out) out.textContent = String(state.settings[key]);
}

/** CRT 체크박스/현재 config.crt를 화면 컨트롤에 반영한다(열 때, 기본값 복원 시 공용).
 * 강도 세그먼트는 라디오의 :checked만으로는 안 보인다 — 라디오 자체가 투명하게
 * 숨겨져 있고(style.css의 .segset-btn input), 눈에 보이는 건 감싼 label(.segset-btn)
 * 이므로 그 label에 .active/.disabled를 직접 얹어야 실제로 반영된다. */
function syncCrtControls() {
  const onBox = document.getElementById('set-crt-on');
  if (onBox) onBox.checked = config.crt.enabled;

  const radios = document.querySelectorAll('input[name="set-crt-intensity"]');
  radios.forEach((r) => {
    r.checked = r.value === config.crt.intensity;
    // CRT 자체가 꺼져 있으면 강도 선택은 의미가 없다 — 눈으로도 그렇게 보이게.
    r.disabled = !config.crt.enabled;
    const btn = r.closest('.segset-btn');
    btn?.classList.toggle('active', r.checked);
    btn?.classList.toggle('disabled', r.disabled);
  });
}

function syncFullscreenControl() {
  const box = document.getElementById('set-fullscreen');
  if (!box) return;
  box.checked = !!document.fullscreenElement;
  // 애초에 브라우저가 전체화면을 허용 안 하면(예: Verse8 iframe에 allow="fullscreen"이
  // 없는 경우 — index.html 상단 주석의 "Verse8 iframe에서 API가 막힌다" 전례와 같은
  // 종류의 제약) 켜봐야 실패만 하므로 미리 비활성 표시한다. document.fullscreenEnabled는
  // 시도 없이 바로 물어볼 수 있는 동기 값이라 여기서 확인해도 부작용이 없다.
  if (!document.fullscreenEnabled) {
    box.disabled = true;
    box.parentElement.title = '이 화면에서는 전체화면을 지원하지 않습니다';
  }
}

function syncAllControls() {
  syncSoundRow('soundMaster', 'set-sound-master', 'set-sound-master-out');
  syncSoundRow('soundSfx', 'set-sound-sfx', 'set-sound-sfx-out');
  syncSoundRow('soundBgm', 'set-sound-bgm', 'set-sound-bgm-out');
  syncCrtControls();
  syncFullscreenControl();
}

// ★ 여닫는 소리를 버튼 핸들러가 아니라 이 두 함수 안에 둔다 — 팝업을 여는 길이
//   여러 갈래(타이틀의 설정 버튼, ESC)고 닫는 길은 더 많다(닫기 X, 계속하기,
//   메인으로, ESC). 각 핸들러에 하나씩 붙이면 새 진입점이 생길 때마다 빠뜨리게 된다.
// ★ ui:true — 팝업이 열려 있는 동안은 게임이 멈춰 있어서 일반 SFX가 막힌다.
//   설정창 조작음은 그 와중에 사용자가 직접 누른 것이므로 나야 한다.
export function openSettings() {
  if (!layer || !ESC_OPENABLE_PHASES.has(state.phase)) return;
  playSfx(SFX.UI_OPEN, { ui: true });
  syncAllControls();
  state.settingsOpen = true;
  layer.classList.add('open');
}

export function closeSettings() {
  if (!layer) return;
  playSfx(SFX.UI_CLOSE, { ui: true });
  state.settingsOpen = false;
  layer.classList.remove('open');
}

/** 사운드 슬라이더 하나를 state.settings[key]에 연결한다.
 *
 * 값을 저장한 뒤 refreshSfxVolume()·refreshBgmVolume()을 둘 다 불러 실제 볼륨
 * 노드에 바로 흘려보낸다 — 지금 재생 중인 소리·곡까지 그 자리에서 같이 바뀐다.
 * 마스터 슬라이더는 SFX·BGM 둘 다에 영향을 주므로 항상 둘 다 불러야 한다.
 * 효과음/배경음 각각의 슬라이더는 반대쪽 함수를 불러도 해가 없다 — 두 함수 다
 * "값이 실제로 바뀌었을 때만" 반영하므로(systems/sound.js·systems/bgm.js
 * 참고), 무관한 슬라이더가 움직여도 그냥 조용히 아무 일도 안 한다. */
function wireSoundSlider(key, inputId, outId) {
  const input = document.getElementById(inputId);
  const out = document.getElementById(outId);
  input?.addEventListener('input', () => {
    const v = Number(input.value);
    state.settings[key] = v;
    if (out) out.textContent = String(v);
    refreshSfxVolume();
    refreshBgmVolume();
  });
}

/** 최초 1회. 버튼·슬라이더·체크박스에 핸들러를 붙인다. */
export function initSettingsPanel() {
  layer = document.getElementById('layer-settings');
  if (!layer) return;

  document.getElementById('settings-close')?.addEventListener('click', closeSettings);
  document.getElementById('settings-resume')?.addEventListener('click', closeSettings);

  // 메인으로 — bsodScreen.js의 "로비"와 완전히 같은 동작(phase만 title로 바꾼다).
  // playing 중 남아있던 방해꾼·상태는 startGame()이 매판 새로 초기화하므로 여기서
  // 따로 안 치워도 된다(같은 전례, bsodScreen.js 주석 참고) — title 단계에선
  // 캔버스가 애초에 아무것도 안 그린다(ui/render.js).
  document.getElementById('settings-title')?.addEventListener('click', () => {
    setPhase('title');
    closeSettings();
  });

  document.getElementById('settings-reset')?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    Object.assign(state.settings, DEFAULTS.sound);
    refreshSfxVolume(); // 슬라이더를 안 거치고 값이 바뀌는 경로라 여기서 직접 알려준다
    refreshBgmVolume();
    config.crt.enabled = DEFAULTS.crtEnabled;
    config.crt.intensity = DEFAULTS.crtIntensity;
    applyCrtSteadyVars();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    syncAllControls();
  });

  wireSoundSlider('soundMaster', 'set-sound-master', 'set-sound-master-out');
  wireSoundSlider('soundSfx', 'set-sound-sfx', 'set-sound-sfx-out');
  wireSoundSlider('soundBgm', 'set-sound-bgm', 'set-sound-bgm-out');

  document.getElementById('set-crt-on')?.addEventListener('change', (evt) => {
    config.crt.enabled = evt.target.checked;
    applyCrtSteadyVars();
    syncCrtControls(); // 강도 라디오 disabled 상태도 같이 갱신
  });

  document.querySelectorAll('input[name="set-crt-intensity"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      config.crt.intensity = radio.value;
      applyCrtSteadyVars();
      syncCrtControls(); // .segset-btn의 .active를 새로 고른 쪽으로 옮긴다
    });
  });

  const fsBox = document.getElementById('set-fullscreen');
  fsBox?.addEventListener('change', () => {
    if (fsBox.checked) {
      // 실패(예: 사용자 제스처 밖에서 호출됐거나 iframe이 허용을 안 한 경우)하면
      // 체크만 되돌린다 — fullscreenchange가 안 오므로 여기서 직접 되돌려야 한다.
      document.documentElement.requestFullscreen().catch(() => {
        fsBox.checked = false;
      });
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });
  // 전체화면을 F11이나 브라우저 자체 ESC로 빠져나가는 경우까지 체크박스를 맞게
  // 유지하려고 실제 상태(document.fullscreenElement)를 진실의 원천으로 삼는다.
  document.addEventListener('fullscreenchange', () => {
    if (fsBox) fsBox.checked = !!document.fullscreenElement;
  });
}

/** 디버그 전용 키를 처리하는 debug.js의 handleDebugKey와 같은 자리 — systems/input.js가
 * 부른다. 처리했으면 true. */
export function handleSettingsKey(code) {
  if (code !== 'Escape') return false;

  if (state.settingsOpen) {
    closeSettings();
  } else {
    if (!ESC_OPENABLE_PHASES.has(state.phase)) return false;
    openSettings();
  }
  return true;
}
