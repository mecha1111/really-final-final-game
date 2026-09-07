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

// 렉 걸린 창의 제목 — 굳는 순간 여기에 config.opening.deadSuffix가 붙는다.
// ★index.html의 초기값과 같아야 한다(첫 프레임에 잠깐 다른 제목이 보이면 안 된다).
const HANG_TITLE = '진짜_최종_final_수정_진짜최종(5).exe';

// ★튜토리얼 대본 — 조작법만이다. ★방해꾼 정보(bait는 안 죽는다, popup은 X만
// 눌러야 한다 등)는 일부러 안 준다: 직접 부딪혀 알아내는 게 이 게임의 재미라,
// 인게임 팁에서 그 둘을 걷어낸 것과 같은 판단이다(ui/rover.js 상단 주석 참고).
//
// ★쪽 하나 = { head, fig?, tx }.
//   · head — 제목 한 덩어리
//   · fig  — 그림(SVG 문자열)을 돌려주는 함수. 없으면 그림 상자 자체가 안 그려진다
//            (style.css의 .op-assist .fig:empty).
//   · tx   — 본문. ★핵심 단어는 <em>으로 감싼다(노란 형광). 기울임이 아니다.
// ★대본은 전부 이 파일 안의 고정 문자열이라 사용자 입력이 섞일 자리가 없다
//   (renderPage가 innerHTML로 넣는 근거).
const PAGES = [
  { head: '안녕하세요?', tx: '저는 <em>검색 도우미</em>예요. 이 게임을 처음 하시는 분께 잠깐 설명해 드릴게요.' },
  { head: '목표', tx: '화면 아래 <em>진행바</em>가 업데이트 상태예요. 100%까지 채우면 그 구간을 넘어갑니다.' },
  { head: '조작', tx: '방해꾼이 화면을 돌아다녀요. 마우스로 <em>클릭</em>하면 쫓아낼 수 있어요.' },
  { head: '제한시간', tx: '<em>시간</em> 안에 못 채우면 실패해요. 그럼 시작해 볼까요?' },
];

let layer = null;
let hangEl = null;
let hangTitleEl = null;
let loadEl = null;
let assistEl = null;
let headEl = null;
let figEl = null;
let textEl = null;
let pageEl = null;
let backBtn = null;
let nextBtn = null;
let skipBtn = null;

// 지금 보고 있는 튜토리얼 쪽(0-based).
let pageIndex = 0;

// 오프닝이 도는 중인가 — ESC 설정창 차단(ui/settingsPanel.js)과 main.js의
// 커서 상태가 이 값을 본다.
let active = false;

// ★"굳은 척"하는 중인가 — main.js가 이 값을 보고 커서를 모래시계로 바꾼다.
//   ★진짜로 멈추는 게 아니다: 게임 루프도 입력도 그동안 정상으로 돈다.
let frozen = false;

// 오프닝이 끝나면 부를 콜백(실제 startGame). 한 번 부르고 반드시 비운다 —
// [건너뛰기]와 마지막 쪽 [시작]이 둘 다 여기로 모이므로 두 번 불릴 여지를 없앤다.
let onDone = null;

// 오프닝이 시작한 뒤 흐른 시간(초)과 남은 단계들. config.opening의 값이 전부
// "이 시각"과 비교하는 절대 초라, 때가 된 것만 앞에서부터 꺼내 실행하면 된다
// (ui/intro.js와 완전히 같은 방식 — setTimeout을 안 쓰는 이유도 같다).
let elapsed = 0;
let steps = [];

/** 오프닝이 도는 중인가. ui/settingsPanel.js가 ESC를 막을 때 본다. */
export function isOpeningActive() {
  return active;
}

/** 렉 연출로 "굳은 척"하는 중인가 — main.js가 커서를 모래시계로 바꿀 때 본다. */
export function isOpeningFrozen() {
  return frozen;
}

/** 지금 쪽(pageIndex)의 내용을 말풍선에 그린다. */
function renderPage() {
  const p = PAGES[pageIndex];
  headEl.textContent = p.head;
  // 그림이 없는 쪽은 빈 문자열 — CSS의 :empty가 상자를 통째로 숨긴다.
  figEl.innerHTML = p.fig ? p.fig() : '';
  textEl.innerHTML = p.tx;
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
 * ★오프닝의 끝 — 역순으로 걷어낸 뒤 실제 판을 시작한다.
 * [시작]과 [건너뛰기] 둘 다 여기로 모인다(끝나는 길이 여럿이라 한 곳에 모아둔다 —
 * ui/settingsPanel.js의 closeSettings와 같은 이유).
 *
 * ★걷어내는 것도 dt 타임라인으로 한다(setTimeout 금지). steps를 새로 깔고
 *   elapsed를 0으로 되돌려, 남은 두 단계(어둠 풀기 → 레이어 내리고 시작)를
 *   updateGameOpening이 순서대로 소화하게 한다.
 */
function finish() {
  if (!active) return; // 연타·중복 진입 방지
  const c = config.opening;

  // ★여기서야 "봤다"고 찍는다 — 튜토리얼 본체가 이제 이 오프닝이라, 인트로가
  //   아니라 이 지점이 "첫 실행 안내를 끝까지 봤다"의 기준이다. 그래서 도중에
  //   새로고침하면 다음 [게임 시작]에 다시 나온다(인트로도 같은 규칙이었다).
  markIntroSeen();
  playSfx(SFX.UI_CLOSE, { ui: true });

  // 강아지가 먼저 사라진다(말풍선은 CSS transition으로 스르륵 빠진다).
  assistEl.classList.remove('on', 'tip');

  elapsed = 0;
  steps = [
    // 어둠을 푼다 — 아래(타이틀)가 다시 드러난다.
    { at: c.outAssistSec, run: () => loadEl.classList.remove('dim') },
    // 레이어를 통째로 내리고 그제서야 진짜 판을 시작한다.
    {
      at: c.outAssistSec + c.outDimSec,
      run: () => {
        active = false;
        frozen = false;
        loadEl.classList.remove('on', 'low');
        hangEl.classList.remove('on', 'dead');
        layer.classList.remove('on');
        const done = onDone;
        onDone = null;
        done?.();
      },
    },
  ];
}

/** 최초 1회(main.js). DOM을 잡고 버튼을 배선한다. */
export function initGameOpening() {
  layer = document.getElementById('layer-opening');
  if (!layer) return;
  hangEl = document.getElementById('op-hang');
  hangTitleEl = document.getElementById('op-hang-title');
  loadEl = document.getElementById('op-load');
  assistEl = document.getElementById('op-assist');
  headEl = document.getElementById('op-assist-head');
  figEl = document.getElementById('op-assist-fig');
  textEl = document.getElementById('op-assist-text');
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

  // ★튜토리얼(강아지)을 보여줄 조건 — 둘 다 만족해야 한다.
  //   · 설정의 [시작 시 튜토리얼 보기](config.tutorial.enabled)가 켜져 있고
  //   · 아직 끝까지 본 적이 없다(세이브의 seenIntro)
  //   ★첫 [게임 시작]에만 나온다는 뜻이다.
  // ★반면 렉·로딩은 이 조건과 무관하게 항상 재생된다 — 그건 튜토리얼이 아니라
  //   오프닝이라 끄는 대상이 아니다(요구사항). 튜토리얼이 없으면 로딩이 끝나는
  //   그 자리에서 곧바로 판이 시작된다.
  const wantTutorial = config.tutorial.enabled && !hasSeenIntro();

  const c = config.opening;
  onDone = done;
  active = true;
  frozen = false;
  elapsed = 0;

  // 시작 상태로 되돌린다 — 두 번째 [게임 시작]에도 같은 자리에서 다시 시작해야 한다.
  hangEl.classList.remove('dead');
  hangTitleEl.textContent = HANG_TITLE;
  loadEl.classList.remove('on', 'dim', 'low');
  assistEl.classList.remove('on', 'tip');
  layer.classList.add('on');

  steps = [
    // 0.0s — 창이 뜬다. "프로그램을 실행한 것처럼"
    { at: c.hangSec, run: () => hangEl.classList.add('on') },
    // 0.5s — ★굳는다. 제목에 (응답 없음) + 타이틀바 채도 죽음 + 흰 고스트 + 모래시계 커서.
    //        ★진짜로 멈추는 게 아니다 — 클래스와 플래그만 바꾼다.
    {
      at: c.deadSec,
      run: () => {
        hangEl.classList.add('dead');
        hangTitleEl.textContent = HANG_TITLE + c.deadSuffix;
        frozen = true;
      },
    },
    // 1.5s — 로딩 레이어를 붙인다(아직 투명, transition이 이어받게).
    { at: c.loadOnSec, run: () => loadEl.classList.add('on') },
    // 1.6s — 어두워지고 분절 로딩바·안내문이 떠오른다.
    { at: c.loadDimSec, run: () => loadEl.classList.add('dim') },
    // 2.82s — 로딩바가 하단 중앙으로 비켜난다(강아지 자리를 비운다).
    { at: c.loadLowSec, run: () => loadEl.classList.add('low') },
    // 3.0s — ★강아지가 뿅. 튜토리얼을 안 볼 상황이면 여기서 곧장 마무리로 넘어간다.
    {
      at: c.assistSec,
      run: () => {
        frozen = false; // 강아지 버튼을 눌러야 하므로 커서를 돌려준다
        if (wantTutorial) showTutorial();
        else finish();
      },
    },
  ];
}

/** 매 프레임(main.js). 때가 된 단계를 순서대로 실행한다.
 * ★ 한 프레임에 여러 단계가 걸릴 수 있어(loadOn 1.5s와 loadDim 1.6s는 0.1초
 *   차이라 프레임이 한 번 밀리면 같이 때가 된다) while로 밀린 만큼 전부 소화한다
 *   — ui/intro.js의 updateIntro와 같은 구조다. */
export function updateGameOpening(dt) {
  if (!active || steps.length === 0) return;
  elapsed += dt;
  while (steps.length > 0 && elapsed >= steps[0].at) steps.shift().run();
}
