// 이 파일 역할: ★첫 실행에만 도는 인트로 연출 — 타이틀 화면보다 "앞"에 온다.
//   부팅 → 바탕화면(가짜 파일 더미) → 커서가 우리 게임을 찾아 클릭 →
//   강아지 튜토리얼 → ★기존 타이틀 화면(setPhase('title')).
//   (지금 커밋에는 "부팅"까지만 들어 있다 — 나머지는 다음 두 커밋에서 이어 붙인다.)
//
// 정본 디자인은 docs/xp-design-system.html의 "1 · 인트로 연출" 섹션이다. 그 문서의
// playIntro() 타임라인을 그대로 옮겼고, 숫자는 전부 config.intro에 있다(여기 박지
// 않는다 — 이 프로젝트의 하드코딩 금지 원칙).
//
// ★ 시간은 dt 하나로만 잰다(setTimeout/setInterval 금지 — ui/rover.js 상단 주석과
//   같은 규칙). main.js가 phase==='intro'인 프레임에만 updateIntro(dt)를 부른다.
//   그래서 탭을 잠깐 벗어나도 연출이 앞으로 튀지 않고, 게임 루프 하나가 이 화면의
//   유일한 시계가 된다.
//
// ★ 이 동안 게임은 한 프레임도 안 돈다 — main.js의 update가 phase==='intro'면
//   통째로 건너뛴다(stageManager의 playing 가드에만 기대지 않는다).
//
// ★ 부팅~클릭 구간엔 건너뛰기가 없다(요구사항). 건너뛰기는 튜토리얼에만 붙는다.

import { config } from '../config.js';
import { setPhase } from '../core/state.js';
import { hasSeenIntro, markIntroSeen } from '../core/save.js';
import { playSfx, SFX } from '../systems/sound.js';

let layer = null;
let bootEl = null;

// 인트로가 시작한 뒤 흐른 시간(초). config.intro의 값은 전부 "이 시각"과 비교하는
// 절대 초라, 남은 단계 목록에서 때가 된 것만 꺼내 실행하면 된다.
let elapsed = 0;
let steps = []; // [{ at, run }] — 시각 오름차순. 실행한 건 앞에서부터 빠진다.
let running = false;

/**
 * ★인트로의 끝 — 게임의 기존 타이틀 화면으로 넘긴다.
 * 끝나는 길이 여럿(지금은 하나뿐이지만 곧 [시작]/[닫기]가 붙는다)이라 한 곳에
 * 모아둔다 — ui/settingsPanel.js의 closeSettings와 같은 이유.
 */
function toTitle() {
  if (!layer?.classList.contains('on')) return; // 연타·중복 진입 방지
  playSfx(SFX.UI_CLOSE, { ui: true });
  markIntroSeen(); // ★끝까지 온 지금에서야 "봤다"고 찍는다(도중 새로고침은 다시 본다)
  layer.classList.remove('on', 'nocursor');
  steps = [];
  running = false;
  setPhase('title');
}

/** config.intro의 절대 시각표를 그대로 단계 목록으로 편다. */
function buildSteps() {
  const c = config.intro;
  return [
    // 부팅 끝 — 화면이 밝아지며 바탕화면으로 넘어간다.
    { at: c.bootHoldSec, run: () => bootEl.classList.add('out') },
    { at: c.bootHoldSec + c.bootFadeSec, run: () => bootEl.classList.add('gone') },
    // ★임시 — 다음 커밋에서 이 자리에 바탕화면·커서·튜토리얼이 들어오고,
    //   타이틀로 넘기는 건 튜토리얼의 [시작]/[닫기]가 맡게 된다.
    { at: c.bootHoldSec + c.bootFadeSec, run: toTitle },
  ];
}

/**
 * 최초 1회(main.js). DOM을 잡는다.
 *
 * ★ 첫 실행이면 여기서 곧바로 부팅 화면을 띄운다(타임라인은 아직 안 돈다).
 *   밸런스 CSV를 받아오는 동안 캔버스의 "밸런스 불러오는 중..." 오버레이가 보이는데,
 *   그 위에 검은 부팅 화면을 미리 덮어두면 첫 실행의 첫 프레임부터 인트로가
 *   시작된 것처럼 이어진다. 실제 타임라인은 로딩이 끝나 phase가 'intro'로
 *   착지한 뒤 startIntro()가 돌린다 — 그래야 "로딩이 늦게 끝나 뒤늦게 도착한
 *   착지"가 이미 끝난 인트로를 되감는 사고가 구조적으로 안 생긴다.
 */
export function initIntro() {
  layer = document.getElementById('layer-intro');
  if (!layer) return;
  bootEl = document.getElementById('intro-boot');

  // 전환 시간의 유일한 출처는 config다 — CSS는 변수만 참조한다
  // (ui/rover.js의 --rover-slide-sec, ui/crtTransition.js의 --crt-*와 같은 패턴).
  layer.style.setProperty('--intro-boot-fade', `${config.intro.bootFadeSec}s`);

  // ★첫 실행이면 지금 당장 커튼을 올린다(위 주석 참고).
  if (!hasSeenIntro()) layer.classList.add('on', 'nocursor');
}

/** 타임라인을 돌리기 시작한다 — main.js가 phase를 'intro'로 착지시킨 그 자리에서만 부른다. */
export function startIntro() {
  if (!layer) return;
  layer.classList.add('on', 'nocursor');
  elapsed = 0;
  steps = buildSteps();
  running = true;
}

/** 매 프레임(main.js, phase==='intro'일 때만). 때가 된 단계를 순서대로 실행한다. */
export function updateIntro(dt) {
  if (!running) return;

  elapsed += dt;
  // 한 프레임에 여러 단계가 걸릴 수 있다(더블클릭 두 번은 0.18초 차이라, 프레임이
  // 한 번 밀리면 같은 프레임에 둘 다 때가 된다) — while로 밀린 만큼 전부 소화한다.
  while (steps.length > 0 && elapsed >= steps[0].at) steps.shift().run();

  // 남은 단계가 없으면 타임라인은 할 일이 없다 — 이제부터는 사용자가 버튼을
  // 누를 때까지 기다린다(자동 진행 없음).
  if (steps.length === 0) running = false;
}
