// 이 파일 역할: ★타이틀에서 게임을 시작한 순간부터 실제 판이 돌기까지의 오프닝.
//   [새 게임]/[무한 모드] → (렉 → 로딩 →) 강아지 튜토리얼 → 판 시작.
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
// ★ 2026-09-09 흐름 재전환 — ★튜토리얼이 붙는 회차에서는 판을 ★먼저 시작한다.
//
//   여기 오래 붙어 있던 문장은 이랬다: "판을 미리 시작해두고 그 위를 덮는 게
//   아니라, 판 자체를 아직 시작하지 않는다. 그래야 오프닝을 보는 동안 방해꾼이
//   스폰되거나 제한시간이 흐르는 일이 구조적으로 없다."
//   그건 튜토리얼이 말풍선 5쪽이던 시절에 옳았다. 지금 튜토리얼은 진행바가
//   실제로 차오르고 실제 방해꾼을 실제로 클릭해서 없애는 시연이라, 판이 돌고
//   있지 않으면 보여줄 것 자체가 없다.
//
//   그래서 구조가 대신 지켜주던 것(스폰 안 됨·시간 안 흐름)을 게이트로 옮겼다 —
//   state.tutorial(core/state.js)이고, 실제로 막는 곳은 core/stageManager.js·
//   systems/upload.js·systems/input.js다. ★게이트를 켜는 건 startGame(n, {tutorial:true})
//   한 곳뿐이고, 다음 구간·재도전은 opts 없이 부르므로 저절로 꺼진다.
//
//   ★튜토리얼을 안 보는 회차(2회차 이후)는 예전 그대로다 — 렉·로딩이 타이틀 위에서
//   돌고, 그게 끝난 뒤에야 onDone(=startGame)이 판을 시작한다. 굳이 둘을 통일하지
//   않은 이유: 그 회차엔 게이트를 켤 이유가 없는데 판만 먼저 시작하면, 렉 연출
//   3초 동안 실제로 방해꾼이 쏟아지고 시간이 흐른다(순수한 손해다).
//   판 시작음(SFX.START)도 그래서 회차마다 나는 자리가 다르다 — 아래 finish() 주석 참고.

import { config } from '../config.js';
import { state } from '../core/state.js';
import { hasSeenIntro, markIntroSeen } from '../core/save.js';
import { playSfx, SFX } from '../systems/sound.js';
import { releaseTutorial } from '../core/stageManager.js';
import { spotOff } from './tutorialSpotlight.js';
import { initTutorial, startTutorial, stopTutorial, tutorialNext, clearDemoEnemies } from './tutorial.js';

// 렉 걸린 창의 제목 — 굳는 순간 여기에 config.opening.deadSuffix가 붙는다.
// ★index.html의 초기값과 같아야 한다(첫 프레임에 잠깐 다른 제목이 보이면 안 된다).
const HANG_TITLE = '진짜_최종_final_수정_진짜최종(5).exe';

let layer = null;
let hangEl = null;
let hangTitleEl = null;
let loadEl = null;
let assistEl = null;
let headEl = null;
let textEl = null;
let nextBtn = null;
let skipBtn = null;

// 오프닝이 도는 중인가 — ESC 설정창 차단(ui/settingsPanel.js)과 main.js의
// 커서 상태가 이 값을 본다.
let active = false;

// ★"굳은 척"하는 중인가 — main.js가 이 값을 보고 커서를 모래시계로 바꾼다.
//   ★진짜로 멈추는 게 아니다: 게임 루프도 입력도 그동안 정상으로 돈다.
let frozen = false;

// 오프닝이 끝나면 부를 콜백(실제 startGame). 한 번 부르고 반드시 비운다 —
// [건너뛰기]와 마지막 쪽 [시작]이 둘 다 여기로 모이므로 두 번 불릴 여지를 없앤다.
// ★튜토리얼이 붙는 회차에서는 이 값이 처음부터 null이다 — 판을 시작하는 일을
//   startGameOpening()이 맨 앞에서 이미 해버렸기 때문이다(위 파일 상단 주석).
let onDone = null;

// 이번 오프닝에 튜토리얼이 붙었나. finish()가 "판을 지금 시작해야 하나(2회차)"와
// "게이트를 풀어야 하나(1회차)"를 가르는 데 쓴다 — 두 회차의 끝맺음이 다르다.
let tutorialRun = false;

// ★2026-09-10 신설 — 2회차 이상(seenIntro=true)이라 config.opening.fast
// (단축 시간표)를 쓰는 중인가. startGameOpening()이 그때그때 정하고,
// finish()가 exit 시간(outAssistSec/outDimSec)을 같은 기준으로 고르는 데
// 쓴다 — 시작할 때 쓴 시간표와 끝낼 때 쓰는 시간표가 갈리면 안 된다.
let shortMode = false;

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

/** 말풍선을 띄우고 ★대본(ui/tutorial.js)을 돌린다.
 * ★이 파일은 "언제 띄우나"(렉 연출 타임라인)와 "어떻게 보이나"(.on/.tip 클래스)만
 *   맡고, 내용과 진행은 전부 대본이 맡는다 — 예전엔 쪽 데이터까지 여기 있었지만,
 *   시연이 들어오면서 소환·게이트 조작·스포트라이트가 붙어 성격이 완전히 달라졌다. */
function showTutorial() {
  // ★렉 연출을 여기서 걷는다 — 굳은 창과 로딩 오버레이(0.72 어둠)를 그대로 두면
  //   튜토리얼이 가리키는 화면 자체가 안 보인다. 예전엔 이 어둠 위에서 말풍선
  //   5쪽을 읽는 게 전부라 걷을 이유가 없었지만(오히려 배경을 죽여야 글이 읽혔다),
  //   이제는 진행바·할당량·방해꾼을 실제로 봐야 한다.
  //   ★어둠의 역할은 스포트라이트가 이어받는다 — 화면 전체가 어둡던 것이, 볼 곳
  //   하나만 뚫린 어둠으로 바뀐다. .op-load.dim의 0.5초 transition이 그 사이를
  //   부드럽게 잇는다(구멍이 "열리는" 것처럼 보인다).
  hangEl.classList.remove('on', 'dead');
  loadEl.classList.remove('on', 'dim', 'low');

  // .tip = 캐릭터 위 노란 전구 깜빡임(참조 문서의 .xp-assist.tip).
  assistEl.classList.add('on', 'tip');
  playSfx(SFX.UI_OPEN, { ui: true });
  startTutorial(finish); // 대본이 끝나면([업데이트 재개]) 오프닝의 마무리로 돌아온다
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
  // ★단축판(2회차)이면 exit 시간도 단축판 표를 그대로 쓴다 — 시작할 때 쓴
  //   시간표와 끝낼 때 시간표가 갈리면 "빠르게 시작해놓고 천천히 끝나는"
  //   어색한 비대칭이 생긴다.
  const c = shortMode ? config.opening.fast : config.opening;

  // ★여기서야 "봤다"고 찍는다 — 튜토리얼 본체가 이제 이 오프닝이라, 인트로가
  //   아니라 이 지점이 "첫 실행 안내를 끝까지 봤다"의 기준이다. 그래서 도중에
  //   새로고침하면 다음 [게임 시작]에 다시 나온다(인트로도 같은 규칙이었다).
  markIntroSeen();

  // 대본을 걷는다(스포트라이트·말풍선 위치 클래스까지 여기서 원복된다).
  stopTutorial();
  spotOff();

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

        // ★두 회차가 "실전이 시작되는 순간"을 여기 한 프레임으로 맞춘다 —
        //   오버레이가 걷히는 바로 이 프레임이다. 그래야 어느 회차든 "화면이
        //   열리는 순간부터 시간이 흐른다"가 같다.
        //   · 튜토리얼 회차: 판은 이미 돌고 있으므로 시작이 아니라 게이트 해제다.
        //     ★걷어내는 연출(0.66초) 동안 미리 풀면 아직 어두운 화면 뒤에서 시간이
        //     흐르고 방해꾼이 스폰된다 — 눌렀는데 안 보이는 손해가 된다.
        //   · 2회차 이후: 여기서 비로소 startGame()이 불린다(예전 그대로).
        if (tutorialRun) {
          tutorialRun = false;
          releaseTutorial();
          // ★판 시작음. startGame()은 튜토리얼이 얹힌 판에서 이걸 건너뛴다
          //   (core/stageManager.js) — "이제 시작한다"는 신호가 실제 시작보다
          //   한참 앞서 나면 신호가 아니게 되기 때문이다. 두 회차 다 판당 정확히 1회.
          playSfx(SFX.START);
        }
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
  textEl = document.getElementById('op-assist-text');
  nextBtn = document.getElementById('op-assist-next');
  skipBtn = document.getElementById('op-assist-skip');

  // 대본이 말풍선 내용을 직접 채운다 — 이 파일은 DOM을 잡아 넘겨주기만 한다.
  initTutorial({ assist: assistEl, head: headEl, text: textEl, next: nextBtn });

  // ★[다음]/[업데이트 재개] — 진행은 전적으로 대본(ui/tutorial.js)이 정한다.
  //   시연 단락에서는 이 버튼이 아예 안 보인다(행동이 곧 진행이라 누를 것이
  //   보이면 안 된다) — 그 숨김도 대본이 한다.
  //   ★클릭음을 안 낸다(요구사항) — 한 번의 튜토리얼에서 여러 번 눌리는 버튼이라
  //   누를 때마다 같은 소리가 나면 그 소리가 곧 소음이 된다. 튜토리얼에서 나는
  //   소리는 "무슨 일이 일어났다"를 뜻하는 것만 남긴다.
  nextBtn.addEventListener('click', tutorialNext);
  // ★[건너뛰기]는 항상 노출된다(요구사항) — 숨기거나 비활성하지 않는다.
  //   ★남아 있는 시연 적을 먼저 치운다: 설명을 못 들은 놈을 실전으로 데려가면
  //   "이건 뭔데 안 죽지"가 된다(끝까지 본 경우의 bait는 설명을 들었으므로 남긴다).
  skipBtn.addEventListener('click', () => {
    clearDemoEnemies();
    finish();
  });
}

/**
 * 오프닝을 시작한다. 타이틀의 게임 시작 버튼들(ui/titleScreen.js)이 부른다.
 *
 * @param {() => void} done 오프닝이 끝나면 부를 것 — 실제 startGame(n)이 여기 들어온다.
 *   ★반드시 이 콜백으로 받는다: "어느 구간으로 시작하는가"는 타이틀 버튼마다 다르고
 *   (새 게임 0 / 무한 모드 finiteCount), 그 판단은 이 모듈이
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

  // ★2026-09-10 신설 — 단축판 여부는 seenIntro 하나로만 정한다(wantTutorial과
  //   다른 축이다). "1회차(seenIntro=false)는 현행 그대로"가 요구사항 원문이라,
  //   설정에서 튜토리얼을 꺼놨어도(그래서 wantTutorial=false여도) 아직 seenIntro가
  //   false인 1회차라면 본표(전체 길이)를 그대로 쓴다. seenIntro=true는 항상
  //   wantTutorial=false를 뜻하므로(hasSeenIntro()가 true면 !hasSeenIntro()가
  //   false) 이 둘이 동시에 어긋날 일은 없다.
  shortMode = hasSeenIntro();
  const c = shortMode ? config.opening.fast : config.opening;
  tutorialRun = wantTutorial;
  active = true;
  frozen = false;
  elapsed = 0;

  if (wantTutorial) {
    // ★판을 먼저 시작한다 — 튜토리얼이 진행바·할당량·실제 방해꾼 위에서 돌아야 하므로,
    //   설명할 대상이 이 시점에 이미 화면에 있어야 한다. 게이트({tutorial:true})가
    //   함께 켜져서 제한시간·일반 스폰·환경 방해는 멈춘 채다.
    // ★렉 연출이 이 위를 덮는다 — 즉 "인게임 화면에 들어와서 그 화면이 굳는" 그림이다.
    //   예전처럼 타이틀 위에서 굳는 것보다 이쪽이 정직하다(굳는 대상이 실제로 그 게임이다).
    onDone = null;
    done?.({ tutorial: true });
  } else {
    // 2회차 이후 — 예전 그대로. 렉·로딩이 끝난 뒤에야 판이 시작된다.
    onDone = done;
  }

  // 시작 상태로 되돌린다 — 두 번째 [게임 시작]에도 같은 자리에서 다시 시작해야 한다.
  hangEl.classList.remove('dead');
  hangTitleEl.textContent = HANG_TITLE;
  loadEl.classList.remove('on', 'dim', 'low');
  assistEl.classList.remove('on', 'tip');
  layer.classList.add('on');

  // ★loadLowSec은 본표(1회차)에만 있다 — 단축판(fast)엔 강아지가 절대 안 떠서
  //   (그건 wantTutorial=false일 때만 fast를 쓰고, wantTutorial은 seenIntro=false
  //   일 때만 켜지므로 둘이 동시에 참일 수 없다) 로딩바를 하단으로 비킬 이유가
  //   없다. .at으로 정렬해두므로 배열에 넣는 순서는 상관없다.
  steps = [
    // 0.0s — 창이 뜬다. "프로그램을 실행한 것처럼"
    { at: c.hangSec, run: () => hangEl.classList.add('on') },
    // 0.5s(단축판 0.1s) — ★굳는다. 제목에 (응답 없음) + 타이틀바 채도 죽음 +
    //        흰 고스트 + 모래시계 커서. ★진짜로 멈추는 게 아니다 — 클래스와
    //        플래그만 바꾼다.
    {
      at: c.deadSec,
      run: () => {
        hangEl.classList.add('dead');
        hangTitleEl.textContent = HANG_TITLE + config.opening.deadSuffix;
        frozen = true;
      },
    },
    // 로딩 레이어를 붙인다(아직 투명, transition이 이어받게).
    { at: c.loadOnSec, run: () => loadEl.classList.add('on') },
    // 어두워지고 분절 로딩바·안내문이 떠오른다.
    { at: c.loadDimSec, run: () => loadEl.classList.add('dim') },
    // 로딩바가 하단 중앙으로 비켜난다(강아지 자리를 비운다) — ★본표(1회차) 전용.
    ...(shortMode ? [] : [{ at: c.loadLowSec, run: () => loadEl.classList.add('low') }]),
    // 강아지가 뿅(본표) / 단축판은 강아지 없이 이 시점이 곧 마무리 시작점이다.
    // 튜토리얼을 안 볼 상황이면 여기서 곧장 마무리로 넘어간다.
    {
      at: c.assistSec,
      run: () => {
        frozen = false; // 강아지 버튼을 눌러야 하므로 커서를 돌려준다
        if (wantTutorial) showTutorial();
        else finish();
      },
    },
  ].sort((a, b) => a.at - b.at);
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
