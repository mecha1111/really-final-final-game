// 이 파일 역할: ESC로 여닫는 설정 팝업(.layer-settings) — 사운드 슬라이더(값은
// state.settings에 저장하고, systems/sound.js·systems/bgm.js의 볼륨 노드에 실시간
// 반영), CRT 효과 on/off·강도(config.crt와 실시간 연결), 전체화면 토글, 조작법
// 안내, 저장 데이터 초기화, 하단 계속하기/메인으로/기본값복원.
//
// ★ 영속화되는 설정은 사운드 셋 + 환경 방해 토글뿐이다(core/save.js의 스키마).
//   저장은 슬라이더의 input이 아니라 change에서 한다 — 드래그 도중 수십 번 쓰지
//   않으려고. CRT/전체화면은 저장 항목이 아니라 매 실행 기본값으로 돌아간다.
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
import { getSave, saveSettings, clearSave, resetSeenTips } from '../core/save.js';
import { playSfx, refreshSfxVolume, SFX } from '../systems/sound.js';
import { refreshBgmVolume } from '../systems/bgm.js';
import { applyCrtSteadyVars } from './crtTransition.js';
import { clearActiveHazards } from '../systems/hazard.js';
import { resetRoverQueue } from './rover.js';
import { openConfirm } from './confirmDialog.js';
import { isOpeningActive, startGameOpening } from './gameOpening.js';
import { startGame } from '../core/stageManager.js';

// ESC로 "열 수" 있는 phase. 이미 열려 있으면 phase와 무관하게 항상 닫을 수 있다
// (아래 handleSettingsKey). failed(BSOD)는 뺐다 — 그 화면은 이미 자기 버튼
// 3개로 흐름이 끝나 있어서 그 위에 또 모달을 얹으면 오히려 헷갈린다.
const ESC_OPENABLE_PHASES = new Set(['title', 'playing', 'cleared']);

const DEFAULTS = {
  sound: { soundMaster: 100, soundSfx: 100, soundBgm: 100 },
  crtEnabled: true,
  crtIntensity: 'mid',
  hazardEnabled: true,
  tutorialEnabled: true,
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

/** 환경 방해 체크박스를 지금 config 값에 맞춘다(열 때, 기본값 복원 시 공용). */
function syncHazardControl() {
  const box = document.getElementById('set-hazard-on');
  if (box) box.checked = config.hazard.enabled;
  // 튜토리얼(러버)은 [환경 방해]와 독립적으로 맞춘다 — 아예 다른 축(안내 vs
  // 방해)이라 서로의 값에 영향을 안 받는다.
  const tut = document.getElementById('set-tutorial-on');
  if (tut) tut.checked = config.tutorial.enabled;
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

/**
 * 심사용 구간 선택 그룹(index.html의 #settings-judge-grp)의 노출을 정한다.
 * ★ 타이틀에서 연 설정에서만 보이고, 플레이 중 ESC로 연 설정에서는 숨긴다 —
 *   진행 중인 판이 버튼 한 번에 사라지는 사고를 막기 위해서다(요구사항).
 * openSettings()는 여러 phase(title/playing/cleared)에서 열릴 수 있는데,
 * 그중 'title'일 때만 보여준다는 뜻이라 phase 하나만 보면 충분하다 — 패널
 * 자체엔 "어디서 열렸는지" 기억하는 별도 플래그가 없고(조사 결과), 열릴 때마다
 * 그 순간의 state.phase를 다시 읽는 이 방식이 새 플래그를 안 만들어도 된다.
 * ★ 노출 조건은 이 함수(state.phase)뿐이다 — config.debug.enabled를 여기 끼워
 *   넣지 말 것. 이 그룹은 debug와 무관하게 제출본에 항상 남는다(아래 버튼
 *   배선의 ★★ 주석 참고).
 */
function syncJudgeSection() {
  const grp = document.getElementById('settings-judge-grp');
  if (grp) grp.hidden = state.phase !== 'title';
}

function syncAllControls() {
  syncSoundRow('soundMaster', 'set-sound-master', 'set-sound-master-out');
  syncSoundRow('soundSfx', 'set-sound-sfx', 'set-sound-sfx-out');
  syncSoundRow('soundBgm', 'set-sound-bgm', 'set-sound-bgm-out');
  syncCrtControls();
  syncHazardControl();
  syncFullscreenControl();
  syncJudgeSection();
}

/**
 * 저장된 설정을 지금 게임에 입힌다(main.js가 부팅 때 1회, 저장 데이터 초기화 때 1회).
 *
 * ★ initSound()/initBgm() 뒤에 불러야 한다 — 아래 refresh*Volume()이 그때 만들어진
 *   볼륨 노드에 값을 흘려보내기 때문이다. 값 자체는 state.settings에 먼저 들어가므로
 *   순서가 어긋나도 조용히 틀리지는 않지만, 그 세션 내내 볼륨만 반영이 안 된다.
 *
 * CRT(config.crt)는 일부러 안 넣었다 — 이번에 영속화하기로 한 항목이 사운드 셋과
 * 환경 방해 토글뿐이라, 저장 스키마에 없는 값을 여기서 몰래 건드리지 않는다.
 */
export function applySavedSettings() {
  const saved = getSave().settings;
  state.settings.soundMaster = saved.soundMaster;
  state.settings.soundSfx = saved.soundSfx;
  state.settings.soundBgm = saved.soundBgm;
  refreshSfxVolume();
  refreshBgmVolume();
  config.hazard.enabled = saved.hazardEnabled;
  config.tutorial.enabled = saved.tutorialEnabled;
}

// ★ 여닫는 소리를 버튼 핸들러가 아니라 이 두 함수 안에 둔다 — 팝업을 여는 길이
//   여러 갈래(타이틀의 설정 버튼, ESC)고 닫는 길은 더 많다(닫기 X, 계속하기,
//   메인으로, ESC). 각 핸들러에 하나씩 붙이면 새 진입점이 생길 때마다 빠뜨리게 된다.
// ★ ui:true — 팝업이 열려 있는 동안은 게임이 멈춰 있어서 일반 SFX가 막힌다.
//   설정창 조작음은 그 와중에 사용자가 직접 누른 것이므로 나야 한다.
export function openSettings() {
  if (!layer || !ESC_OPENABLE_PHASES.has(state.phase)) return;
  // ★게임 시작 오프닝이 도는 중이면 안 연다(2026-09-08). 설정창(z11)이 오프닝(z15)
  //   뒤에 가려진 채 열려 "화면엔 안 보이는데 입력만 먹는" 상태가 되기 때문이다.
  //   인트로가 ESC_OPENABLE_PHASES에 'intro'를 안 넣어 막은 것과 같은 취지를,
  //   phase만으로는 못 가르는 이 경우에 이렇게 건다.
  // ★2026-09-09: 이 가드가 더 중요해졌다. 예전엔 오프닝이 phase 'title'인 채로
  //   돌았지만, 튜토리얼이 붙는 회차는 이제 판을 먼저 시작해 phase가 ★'playing'이다
  //   (ui/gameOpening.js 상단 주석) — 그건 ESC_OPENABLE_PHASES에 들어 있는 값이라
  //   위 검사를 그냥 통과한다. 즉 지금은 이 한 줄만이 튜토리얼 중 ESC를 막는다.
  if (isOpeningActive()) return;
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
  // 저장은 input이 아니라 change에서 한다 — input은 드래그하는 동안 수십 번 나므로
  // 그때마다 localStorage에 쓰면 쓸데없는 직렬화/쓰기가 쏟아진다. change는 손을
  // 뗄 때 한 번만 난다(키보드 조작·트랙 클릭도 마찬가지).
  input?.addEventListener('change', saveSettings);
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

  // 심사용 구간 선택(index.html의 #settings-judge-grp, syncJudgeSection이
  // 'title'에서만 보여준다). 버튼마다 data-judge-stage(0~5, 0부터인 이 게임의
  // 구간 규칙 그대로)를 달아뒀다 — 값 하나로 갈래를 나눈다.
  // ★★ config.debug.enabled와 완전히 별개다 — 절대 그 플래그(또는 새 환경변수·
  //   빌드 분기)로 묶지 말 것. debug는 제출 전 반드시 false로 되돌리는 임시
  //   개발 스위치(config.js의 그 필드 주석 — "다시 켤 일이 있으면 이 값만
  //   true로, 끝나면 반드시 여기로 되돌릴 것"가 몇 번이나 반복된 이력 참고)지만,
  //   이 심사용 구간 선택은 그 반대다 — 최종 제출본에 항상 켜진 채로 남아있어야
  //   하는 기능이다(요구사항 원문: "최종 제출본에 그대로 남긴다. 제거용
  //   분기·환경변수 만들지 말 것"). 실제로 config.debug.enabled=false인 채로
  //   (배포 기본값 그대로) 클릭까지 전부 동작함을 Playwright로 확인했다 —
  //   syncJudgeSection이 보는 건 오직 state.phase뿐, config.debug는 이 파일
  //   어디에서도 안 읽는다.
  // ★ 1구간(n=0)만 타이틀 [새 게임]과 완전히 같은 경로(startGameOpening)를
  //   탄다 — seenIntro가 false면 튜토리얼이 정상적으로 뜬다(요구사항: "1구간을
  //   골랐고 seenIntro가 false인 경우에만 평소대로 실행"). 나머지(n=1~5)는
  //   startGame(n)을 직접 불러 오프닝 자체를 건너뛴다 — opts가 없으므로
  //   state.tutorial.active가 항상 false로 떨어져 튜토리얼이 절대 안 뜬다
  //   (core/stageManager.js의 startGame 시그니처 주석 참고, debug.js의 구간
  //   즉시 이동 버튼과 같은 호출 패턴).
  // ★ 무한 모드(n=5=config.stage.finiteCount)도 hasCompletedRun() 같은 해금
  //   조건을 전혀 안 거친다 — 조사 결과 그 조건은 타이틀 버튼의 노출 여부에만
  //   쓰이고(save.completed을 다른 어디서도 안 읽는다) 판 규칙은 오직
  //   stageIndex로만 정해지므로, 그냥 startGame(5)를 부르는 것만으로 해금
  //   상태와 무관하게 정확히 같은 규칙(무한 전용 방해꾼·quota 곡선)으로
  //   들어간다. 영구 업그레이드 같은 걸 임시로 채워줄 필요도 없다 — 애초에
  //   save.upgrades/coins는 어디서도 안 읽는 자리표시 필드다.
  document.querySelectorAll('[data-judge-stage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const n = Number(btn.dataset.judgeStage);
      closeSettings();
      if (n === 0) {
        startGameOpening((opts) => startGame(0, opts));
      } else {
        startGame(n);
      }
    });
  });

  document.getElementById('settings-reset')?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    Object.assign(state.settings, DEFAULTS.sound);
    refreshSfxVolume(); // 슬라이더를 안 거치고 값이 바뀌는 경로라 여기서 직접 알려준다
    refreshBgmVolume();
    config.crt.enabled = DEFAULTS.crtEnabled;
    config.crt.intensity = DEFAULTS.crtIntensity;
    applyCrtSteadyVars();
    config.hazard.enabled = DEFAULTS.hazardEnabled;
    config.tutorial.enabled = DEFAULTS.tutorialEnabled;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    syncAllControls();
    // 복원한 기본값도 저장해야 새로고침 후에 되돌아오지 않는다(슬라이더를 거치지
    // 않고 값이 바뀌는 경로라 여기서 직접 부른다 — 위 refresh*Volume과 같은 이유).
    saveSettings();
  });

  // 저장 데이터 초기화 — 되돌릴 수 없으므로 공용 확인 대화상자를 반드시 거친다
  // (ui/confirmDialog.js, 타이틀 [새 게임]과 같은 창을 재사용한다).
  document.getElementById('settings-wipe')?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    openConfirm({
      title: '저장 데이터를 지울까요?',
      sub: '이어할 구간, 완성한 그림, 최고 기록, 설정이 모두 사라집니다. 되돌릴 수 없습니다.',
      okLabel: '모두 삭제',
      onConfirm: () => {
        clearSave();
        // "모두"라고 했으니 설정도 같이 초기값으로 되돌린다 — 세이브만 비우고 지금
        // 켜져 있는 설정을 남기면 다음 저장 때 그 값이 그대로 다시 쓰여서, 사용자가
        // 본 것과 실제 결과가 어긋난다.
        applySavedSettings();
        syncAllControls();
      },
    });
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

  // 환경 방해 on/off — 끄는 순간 이미 떠 있는 것도 같이 치운다(접근성 설정이
  // "다음 판부터"만 듣는 건 끄는 이유와 안 맞는다). 켜면 스케줄러가 알아서 다시 돈다.
  document.getElementById('set-hazard-on')?.addEventListener('change', (evt) => {
    config.hazard.enabled = evt.target.checked;
    if (!config.hazard.enabled) clearActiveHazards();
    saveSettings();
  });

  // [시작 시 튜토리얼 보기] 끄기 — [환경 방해]와 독립. 끄면 다음
  // [게임 시작]의 오프닝에서 강아지 튜토리얼(스포트라이트 시연 5단계)만
  // 건너뛴다 — 렉·로딩 연출은 그대로 나오고, 판도 예전처럼 그 연출이 끝난
  // 뒤에 시작된다(config.tutorial / ui/gameOpening.js 상단 주석). resetRoverQueue()는
  // 러버 사이드바 몫이라 지금 인게임에서 실제로 뭘 치울 일은 없지만, 그 모듈이
  // 아직 살아있고(__game.showTip 디버그 손잡이) 이 토글이 여전히 그 게이트라
  // 그대로 둔다.
  document.getElementById('set-tutorial-on')?.addEventListener('change', (evt) => {
    config.tutorial.enabled = evt.target.checked;
    if (!config.tutorial.enabled) resetRoverQueue();
    saveSettings();
  });

  // 튜토리얼 다시 보기 — 본 기록(seenTips·seenIntro)을 지운다.
  // ★ seenIntro 하나가 "인게임 튜토리얼을 끝까지 봤다"의 기준이다(ui/gameOpening.js의
  //   finish가 찍는다) — 그래서 이 버튼은 내용이 5쪽 말풍선에서 스포트라이트 시연
  //   5단계로 통째로 바뀐 뒤에도 배선을 하나도 안 바꾸고 그대로 새 튜토리얼을 부른다.
  // 진행·해금 등
  // 실제 진행에 영향이 없는 되돌릴 수 있는 조작이라 [저장 데이터 초기화]와
  // 달리 확인 대화상자를 안 거친다(눌러도 잃을 게 없다).
  // ★ [시작 시 튜토리얼 보기]가 꺼져 있으면 여기서 강제로 다시 켠다 — "다시
  //   보기"를 누르는 행위 자체가 "튜토리얼을 다시 보고 싶다"는 뜻이라, 토글이
  //   꺼진 채로 두면 눌러도 다음 [게임 시작]에 조용히 안 뜨는 버튼이 되어버린다.
  document.getElementById('settings-tips-reset')?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    resetSeenTips();
    config.tutorial.enabled = true;
    syncHazardControl(); // 체크박스를 켜진 상태로 되비춘다(그 함수가 이 토글도 맞춘다)
    saveSettings();
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
