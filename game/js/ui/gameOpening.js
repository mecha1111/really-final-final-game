// 이 파일 역할: ★타이틀에서 게임을 시작한 순간부터 실제 판이 돌기까지의 오프닝.
//   [새 게임]/[이어하기]/[무한 모드] → (렉 → 로딩 →) 강아지 튜토리얼 → 판 시작.
//
// ★ 2026-09-08 흐름 변경. 전에는 이랬다:
//     인트로(부팅→바탕화면→클릭) → 강아지 튜토리얼 → 타이틀 → [게임 시작] → 게임
//   설명을 듣고 나서 타이틀을 한 번 더 거쳐야 해서, 설명과 실행 사이에 한 박자가
//   떴다. 이제는 이렇다:
//     인트로 → 타이틀 → [게임 시작] → 렉 → 로딩 → 강아지 → 게임
//   설명을 "쓰기 직전"에 준다. 정본 디자인은 docs/xp-tutorial.html.
//
// ★ 시간은 dt 하나로만 잰다(setTimeout/setInterval 금지 — ui/intro.js·ui/rover.js
//   상단 주석과 같은 규칙). main.js가 매 프레임 updateGameOpening(dt)를 부른다.
//   그래서 탭을 잠깐 벗어나도 연출이 앞으로 튀지 않는다.
//
// ★ 이 동안 phase는 계속 'title'이다 — 판을 미리 시작해두고 그 위를 덮는 게
//   아니라, 판 자체를 아직 시작하지 않는다. 그래야 오프닝을 보는 동안 방해꾼이
//   스폰되거나 제한시간이 흐르는 일이 구조적으로 없다. 실제 startGame()은 이
//   모듈이 끝나면서 부르는 콜백(onDone)이 한다.

import { config } from '../config.js';
import { hasSeenIntro, markIntroSeen } from '../core/save.js';
import { playSfx, SFX } from '../systems/sound.js';

// ★튜토리얼 대본 — 조작법만이다. ★방해꾼 정보(bait는 안 죽는다, popup은 X만
// 눌러야 한다 등)는 일부러 안 준다: 직접 부딪혀 알아내는 게 이 게임의 재미라,
// 인게임 팁에서 그 둘을 걷어낸 것과 같은 판단이다(ui/rover.js 상단 주석 참고).
const PAGES = [
  { head: '안녕하세요?', lines: ['저는 검색 도우미예요.', '이 게임을 처음 하시는 분께 잠깐 설명해 드릴게요.'] },
  { head: '목표', lines: ['화면 아래 진행바가 업데이트 상태예요.', '100%까지 채우면 그 구간을 넘어갑니다.'] },
  { head: '조작', lines: ['방해꾼이 화면을 돌아다녀요.', '마우스로 클릭하면 쫓아낼 수 있어요.'] },
  { head: '제한시간', lines: ['시간 안에 못 채우면 실패해요.', '그럼 시작해 볼까요?'] },
];

let layer = null;
let assistEl = null;
let headEl = null;
let listEl = null;
let pageEl = null;
let backBtn = null;
let nextBtn = null;
let skipBtn = null;

// 지금 보고 있는 튜토리얼 쪽(0-based).
let pageIndex = 0;

// 오프닝이 도는 중인가 — ESC 설정창 차단(ui/settingsPanel.js)과 main.js의
// 커서 상태가 이 값을 본다.
let active = false;

// 오프닝이 끝나면 부를 콜백(실제 startGame). 한 번 부르고 반드시 비운다 —
// [건너뛰기]와 마지막 쪽 [시작]이 둘 다 여기로 모이므로 두 번 불릴 여지를 없앤다.
let onDone = null;

/** 오프닝이 도는 중인가. ui/settingsPanel.js가 ESC를 막을 때 본다. */
export function isOpeningActive() {
  return active;
}

/** 지금 쪽(pageIndex)의 내용을 말풍선에 그린다. */
function renderPage() {
  const p = PAGES[pageIndex];
  headEl.textContent = p.head;
  // 대본은 이 파일 안의 고정 문자열이라 사용자 입력이 섞일 자리가 없다.
  listEl.innerHTML = p.lines.map((line) => `<li>${line}</li>`).join('');
  pageEl.textContent = `${pageIndex + 1} / ${PAGES.length}`;
  // ★1쪽에선 [뒤로]가 비활성 — 갈 데가 없다(#desktop .settings-btn:disabled가 그린다).
  backBtn.disabled = pageIndex === 0;
  // 마지막 쪽의 [다음]은 [시작] — 누르면 곧장 판이 시작된다.
  nextBtn.textContent = pageIndex === PAGES.length - 1 ? '시작' : '다음';
}

/** 말풍선을 띄운다. */
function showTutorial() {
  pageIndex = 0;
  renderPage();
  // .tip = 캐릭터 위 노란 전구 깜빡임(참조 문서의 .xp-assist.tip).
  assistEl.classList.add('on', 'tip');
  playSfx(SFX.UI_OPEN, { ui: true });
}

/**
 * ★오프닝의 끝 — 실제 판을 시작한다.
 * [시작]과 [건너뛰기] 둘 다 여기로 모인다(끝나는 길이 여럿이라 한 곳에 모아둔다 —
 * ui/settingsPanel.js의 closeSettings와 같은 이유).
 */
function finish() {
  if (!active) return; // 연타·중복 진입 방지
  active = false;
  playSfx(SFX.UI_CLOSE, { ui: true });
  // ★여기서야 "봤다"고 찍는다 — 튜토리얼 본체가 이제 이 오프닝이라, 인트로가
  //   아니라 이 지점이 "첫 실행 안내를 끝까지 봤다"의 기준이다. 그래서 도중에
  //   새로고침하면 다음 [게임 시작]에 다시 나온다(인트로도 같은 규칙이었다).
  markIntroSeen();
  assistEl.classList.remove('on', 'tip');
  layer.classList.remove('on');

  const done = onDone;
  onDone = null;
  done?.();
}

/** 최초 1회(main.js). DOM을 잡고 버튼을 배선한다. */
export function initGameOpening() {
  layer = document.getElementById('layer-opening');
  if (!layer) return;
  assistEl = document.getElementById('op-assist');
  headEl = document.getElementById('op-assist-head');
  listEl = document.getElementById('op-assist-list');
  pageEl = document.getElementById('op-assist-page');
  backBtn = document.getElementById('op-assist-back');
  nextBtn = document.getElementById('op-assist-next');
  skipBtn = document.getElementById('op-assist-skip');

  backBtn.addEventListener('click', () => {
    // disabled라 1쪽에선 여기까지 안 오지만, 값의 하한은 여기서도 지킨다.
    if (pageIndex === 0) return;
    pageIndex -= 1;
    playSfx(SFX.UI_CLICK, { ui: true });
    renderPage();
  });
  nextBtn.addEventListener('click', () => {
    if (pageIndex >= PAGES.length - 1) {
      finish(); // 마지막 쪽의 [시작]
      return;
    }
    pageIndex += 1;
    playSfx(SFX.UI_CLICK, { ui: true });
    renderPage();
  });
  // ★[건너뛰기]는 항상 노출된다(요구사항) — 숨기거나 비활성하지 않는다.
  skipBtn.addEventListener('click', finish);
}

/**
 * 오프닝을 시작한다. 타이틀의 게임 시작 버튼들(ui/titleScreen.js)이 부른다.
 *
 * @param {() => void} done 오프닝이 끝나면 부를 것 — 실제 startGame(n)이 여기 들어온다.
 *   ★반드시 이 콜백으로 받는다: "어느 구간으로 시작하는가"는 타이틀 버튼마다 다르고
 *   (새 게임 0 / 이어하기 저장구간 / 무한 모드 finiteCount), 그 판단은 이 모듈이
 *   알 바가 아니다.
 */
export function startGameOpening(done) {
  if (!layer) {
    // 마크업이 없는 극단적인 경우에도 게임은 시작돼야 한다.
    done?.();
    return;
  }

  // ★튜토리얼을 보여줄 조건 — 둘 다 만족해야 한다.
  //   · 설정의 [시작 시 튜토리얼 보기](config.tutorial.enabled)가 켜져 있고
  //   · 아직 끝까지 본 적이 없다(세이브의 seenIntro)
  //   ★첫 [게임 시작]에만 나온다는 뜻이다. 두 번째부터는 이 함수가 곧장 done()을
  //     부른다 — 지금은 앞에 붙일 렉·로딩 연출이 없어서 정말 바로 시작한다.
  //     (그 연출은 다음 커밋에서 이 자리에 들어오고, 그때는 튜토리얼 여부와
  //      무관하게 항상 재생된다 — 오프닝이지 튜토리얼이 아니라서.)
  const wantTutorial = config.tutorial.enabled && !hasSeenIntro();
  if (!wantTutorial) {
    done?.();
    return;
  }

  onDone = done;
  active = true;
  layer.classList.add('on');
  showTutorial();
}

/** 매 프레임(main.js). 지금은 시간으로 진행하는 단계가 없다 — 다음 커밋에서
 * 렉·로딩 타임라인이 여기로 들어온다. 배선을 먼저 깔아둔다. */
export function updateGameOpening(dt) {
  if (!active) return;
  void dt;
}
