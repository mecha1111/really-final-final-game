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

// ─────────────────────────────────────────────────────────────────────────
// 설명 그림
//
// ★글만으로는 "진행바"가 뭔지 모른다. 설명하는 대상을 그려서 같이 보여준다.
//
// ★좌표계: 참조 문서(docs/xp-tutorial.html)와 같은 viewBox "0 0 280 h"로 그리고,
//   내보내는 크기만 1.75배(490px)로 준다. 문서의 도형 좌표를 한 글자도 안 고치고
//   옮기려는 것 — 배율은 바깥에서만 곱한다. 1.75는 이 프로젝트가 이미 쓰던 값이다
//   (부팅 로딩바가 문서 190x18을 330x31로 옮긴 그 배율).
//
// ★글자 크기 하한: viewBox 단위 13 아래로 내리지 말 것. 13 × 1.75(그림 배율)
//   × 0.667(가장 작은 창에서의 #desktop 축소율) ≈ 15px으로, 이 게임이 지키는
//   DGM 하한과 정확히 같다(style.css의 .dex-desc 주석 — "처치"가 "저지"로 읽힌 건).
//
// ★수치는 전부 게임 실제 값이다(참조 문서의 예시값을 그대로 베끼지 않았다):
//   · 250MB / 03:00 — 1구간의 실제 quota·time_limit(balance.csv, rules.js)
//   · +0.30MB       — config.combo.killMb 0.3, 처치 시 뜨는 글씨 형식과 같음
//                     (systems/combo.js의 `+${mb.toFixed(2)}MB`)
//   · -3%           — basic의 dps 2 × atkIntervalSec 3 × atkDamageScale 0.55
//                     = 3.3 → damageUpload이 반올림해 "-3%"로 띄운다
//   · COMBO x3      — 화면에 실제로 뜨는 표시(ui/renderEnemies.js의 drawCombo)
//   · 노란 리플     — 처치 성공 시 콤보 tier 0 색(#fdd835)으로 그려지는 각진
//                     사각형(strokeRect)이다. 원이 아니다.
// ─────────────────────────────────────────────────────────────────────────

const FIG_W = 490; // 280 × 1.75

/** viewBox는 문서와 같게 두고 내보내는 크기만 키운다. */
function svg(h, body) {
  return `<svg viewBox="0 0 280 ${h}" width="${FIG_W}" height="${Math.round((FIG_W * h) / 280)}">${body}</svg>`;
}

// 진행바 채움색 — style.css의 --xp-bar-seg와 같은 4단이다(SVG 안이라 CSS 변수를
// 못 써서 같은 값을 여기 한 번 더 적는다).
const GDEF =
  '<defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#a4f07a"/><stop offset=".46" stop-color="#4bbb1a"/>' +
  '<stop offset=".52" stop-color="#3aa010"/><stop offset="1" stop-color="#5fd02c"/>' +
  '</linearGradient></defs>';

/** 분절 진행바 — 이 게임의 바는 연속 채우기가 아니라 칸이다(ui/statusWindow.js의 setBar). */
function segbar(x, y, w, total, on) {
  let out = `<rect x="${x}" y="${y}" width="${w}" height="20" fill="#d7d3c4" stroke="#9a9584"/>`;
  const sw = (w - 6) / total;
  for (let i = 0; i < on; i++) {
    out += `<rect x="${(x + 3 + i * sw).toFixed(1)}" y="${y + 3}" width="${(sw - 2).toFixed(1)}" height="14" fill="url(#gb)"/>`;
  }
  return out;
}

const F = 'font-family="monospace"'; // 본문 폰트(DGM)를 그대로 물려받는다

/** 1 · 목표 — 할당량 분절바 + 남은 시간 */
function figGoal() {
  return svg(96, GDEF +
    `<text x="8" y="18" font-size="14" fill="#444" ${F}>할당량</text>` +
    segbar(8, 24, 180, 14, 9) +
    `<text x="194" y="39" font-size="15" fill="#0a3aa0" ${F}>250MB</text>` +
    `<text x="8" y="74" font-size="14" fill="#444" ${F}>남은 시간</text>` +
    '<rect x="84" y="56" width="82" height="26" fill="#fff" stroke="#7f9db9" stroke-width="1.6"/>' +
    `<text x="125" y="75" font-size="17" fill="#111" text-anchor="middle" ${F}>03:00</text>` +
    '<path d="M176 69h28M198 63l7 6-7 6" fill="none" stroke="#4ea832" stroke-width="2.6"/>' +
    `<text x="212" y="75" font-size="15" fill="#4ea832" ${F}>통과</text>`);
}

/** 2 · 파일과 그림 — 끝까지 올린 것만 갤러리에 모인다 */
function figFile() {
  return svg(96, GDEF +
    // 올라가는 중인 그림(위쪽이 아직 가려져 있다)
    '<rect x="8" y="6" width="56" height="56" fill="#fff" stroke="#9a9584" stroke-width="1.6"/>' +
    '<rect x="12" y="10" width="48" height="48" fill="#c9d8e8"/>' +
    '<rect x="12" y="34" width="48" height="24" fill="#8fb8dc"/>' +
    '<rect x="12" y="10" width="48" height="24" fill="rgba(120,120,120,.55)"/>' +
    segbar(8, 68, 56, 8, 4) +
    '<path d="M74 36h24M92 30l7 6-7 6" fill="none" stroke="#4ea832" stroke-width="2.6"/>' +
    // 완성된 그림
    '<rect x="106" y="6" width="56" height="56" fill="#fff" stroke="#9a9584" stroke-width="1.6"/>' +
    '<rect x="110" y="10" width="48" height="48" fill="#c9d8e8"/>' +
    '<rect x="110" y="34" width="48" height="24" fill="#8fb8dc"/>' +
    '<circle cx="139" cy="22" r="7" fill="#fdd835"/>' +
    `<text x="110" y="82" font-size="14" fill="#4ea832" ${F}>완료!</text>` +
    '<path d="M172 36h22M188 30l7 6-7 6" fill="none" stroke="#4ea832" stroke-width="2.6"/>' +
    // 갤러리
    '<rect x="202" y="12" width="70" height="46" fill="#fff" stroke="#5a86c9" stroke-width="1.6"/>' +
    '<rect x="207" y="17" width="18" height="16" fill="#e0a0a0"/><rect x="228" y="17" width="18" height="16" fill="#a0c8e0"/>' +
    '<rect x="249" y="17" width="18" height="16" fill="#b8dca0"/>' +
    '<rect x="207" y="36" width="18" height="16" fill="#d8c0e8"/><rect x="228" y="36" width="18" height="16" fill="#e8d8a0"/>' +
    '<rect x="249" y="36" width="18" height="16" fill="#dcdcdc"/>' +
    `<text x="237" y="82" font-size="14" fill="#0a3aa0" text-anchor="middle" ${F}>갤러리</text>`);
}

/** 3 · 방해꾼 — 클릭하면 각진 리플이 퍼지고 업데이트가 오른다.
 * ★viewBox 높이를 다른 쪽과 같은 96으로 맞춘다 — 이 쪽만 86이면 그림 상자가
 *   그만큼 낮아져 [다음] 버튼 줄이 위로 7px 튄다(실측). 쪽을 넘길 때 버튼이
 *   움직이면 연타가 빗나가므로, 도형을 5만큼 내려 세로 가운데를 맞췄다. */
function figEnemy() {
  return svg(96,
    '<circle cx="62" cy="49" r="23" fill="#8fd07f" stroke="#12161f" stroke-width="2.6"/>' +
    '<circle cx="54" cy="44" r="3.2" fill="#12161f"/><circle cx="70" cy="44" r="3.2" fill="#12161f"/>' +
    '<path d="M53 58q9 7 18 0" fill="none" stroke="#12161f" stroke-width="2.6"/>' +
    // ★각진 클릭 리플 2겹 — 원이 아니라 strokeRect다(systems/clickRipple.js).
    //   색은 처치 성공 시 쓰이는 콤보 tier 0 색(#fdd835).
    '<rect x="40" y="27" width="44" height="44" fill="none" stroke="#fdd835" stroke-width="3"/>' +
    '<rect x="31" y="18" width="62" height="62" fill="none" stroke="#fdd835" stroke-width="2" opacity=".5"/>' +
    // 커서(게임의 화살표와 같은 형태)
    '<path d="M78 55l9 20 2.9-8.2L100 64z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M116 49h30M140 43l7 6-7 6" fill="none" stroke="#4ea832" stroke-width="2.8"/>' +
    `<text x="180" y="56" font-size="18" fill="#4ea832" ${F}>+0.30MB</text>`);
}

/** 4 · 놔두면 손해 — 빨간 잔상이 뒤로 밀린다 */
function figDamage() {
  return svg(96, GDEF +
    // 바 위에 올라앉은 방해꾼 셋
    '<circle cx="30" cy="22" r="14" fill="#e08f8f" stroke="#12161f" stroke-width="2.2"/>' +
    '<circle cx="25" cy="19" r="2.2" fill="#12161f"/><circle cx="35" cy="19" r="2.2" fill="#12161f"/>' +
    '<path d="M24 28q6 4 12 0" fill="none" stroke="#12161f" stroke-width="2.2"/>' +
    '<circle cx="82" cy="22" r="14" fill="#e0b08f" stroke="#12161f" stroke-width="2.2"/>' +
    '<circle cx="77" cy="19" r="2.2" fill="#12161f"/><circle cx="87" cy="19" r="2.2" fill="#12161f"/>' +
    '<path d="M76 28q6 4 12 0" fill="none" stroke="#12161f" stroke-width="2.2"/>' +
    '<circle cx="134" cy="22" r="14" fill="#c8a0d8" stroke="#12161f" stroke-width="2.2"/>' +
    '<circle cx="129" cy="19" r="2.2" fill="#12161f"/><circle cx="139" cy="19" r="2.2" fill="#12161f"/>' +
    '<path d="M128 28q6 4 12 0" fill="none" stroke="#12161f" stroke-width="2.2"/>' +
    // 진행바 + ★빨간 손실 잔상(state.fileBarGhostRatio가 그리는 그것)
    segbar(8, 48, 180, 14, 6) +
    '<rect x="82" y="51" width="50" height="14" fill="#d9382a" opacity=".8"/>' +
    '<path d="M130 42h-14M120 37l-6 5 6 5" fill="none" stroke="#d9382a" stroke-width="2.6"/>' +
    `<text x="196" y="63" font-size="18" fill="#d9382a" ${F}>-3%</text>` +
    `<text x="8" y="88" font-size="13" fill="#666" ${F}>놔두면 진행도가 되돌아갑니다</text>`);
}

/** 5 · 연속 처치 — 연달아 잡으면 배율, 빗나가면 처음부터 */
function figCombo() {
  let out = '';
  const xs = [22, 60, 98];
  for (let i = 0; i < 3; i++) {
    const op = (0.4 + i * 0.3).toFixed(2);
    out += `<circle cx="${xs[i]}" cy="28" r="13" fill="#8fd07f" stroke="#12161f" stroke-width="2.2" opacity="${op}"/>`;
    out += `<path d="M${xs[i] - 6} 27l4.5 4.5 7.5-7.5" fill="none" stroke="#12161f" stroke-width="2.4" opacity="${op}"/>`;
  }
  out += '<path d="M38 28h8M76 28h8" stroke="#4ea832" stroke-width="2.2" stroke-dasharray="3 3"/>';
  // ★화면에 실제로 뜨는 표시 그대로 — "COMBO" 위, "x3" 아래(ui/renderEnemies.js).
  out += `<text x="130" y="20" font-size="13" fill="#fdd835" stroke="#12161f" stroke-width="2.5" paint-order="stroke" ${F}>COMBO</text>`;
  out += `<text x="130" y="46" font-size="26" fill="#fdd835" stroke="#12161f" stroke-width="3" paint-order="stroke" ${F}>x3</text>`;
  // 끊기면
  out += '<circle cx="22" cy="72" r="13" fill="#8fd07f" stroke="#12161f" stroke-width="2.2"/>';
  out += '<path d="M42 66l12 12M54 66l-12 12" stroke="#d9382a" stroke-width="3"/>';
  out += `<text x="64" y="78" font-size="14" fill="#d9382a" ${F}>빗나가면 처음부터</text>`;
  return svg(96, out);
}

// ★튜토리얼 대본 — ★"알려주지 않으면 모르는 것"만 넣었다. 부딪혀서 알 수 있는 건
// 뺐다: 방해꾼 12종의 개별 동작(bait가 안 죽는 것, popup은 X만 눌러야 하는 것,
// fake_btn이 함정인 것)도, 환경 방해 6종의 해제법도 안 알려준다 — 직접 당해봐야
// 재미다(인게임 팁에서 그 둘을 걷어낸 것과 같은 판단, ui/rover.js 상단 주석).
//
// ★쪽 하나 = { head, fig?, tx }.
//   · head — 제목 한 덩어리
//   · fig  — 그림(SVG 문자열)을 돌려주는 함수. 없으면 그림 상자 자체가 안 그려진다
//            (style.css의 .op-assist .fig:empty).
//   · tx   — 본문. ★핵심 단어는 <em>으로 감싼다(노란 형광). 기울임이 아니다.
// ★대본은 전부 이 파일 안의 고정 문자열이라 사용자 입력이 섞일 자리가 없다
//   (renderPage가 innerHTML로 넣는 근거).
//
// ★4·5쪽이 이번 확장의 핵심이다:
//   4 — "방해만 한다"고 생각하면 급할 이유가 없다. 실제로는 dps가 진행도를
//       되돌린다(손익분기가 2~4마리인 그 메커니즘). 이게 빠져 있었다.
//   5 — 콤보가 보통 실력에서 총수입의 37~46%다(config.combo 실측 주석).
//       UI에 뜨긴 하지만 "왜" 뜨는지는 안 알려줬다.
const PAGES = [
  {
    head: '목표',
    fig: figGoal,
    tx: '<em>제한시간</em> 안에 이번 구간의 <em>할당량</em>을 채우면 다음 구간으로 넘어갑니다.',
  },
  {
    head: '파일과 그림',
    fig: figFile,
    tx: '파일은 한 번에 하나씩 올라갑니다. <em>끝까지</em> 올린 파일만 그림이 완성되어 <em>갤러리</em>에 모여요.',
  },
  {
    head: '방해꾼',
    fig: figEnemy,
    tx: '화면을 돌아다니는 방해꾼을 <em>클릭</em>해서 쫓아내세요. 쫓아낼 때마다 업데이트가 조금씩 올라갑니다.',
  },
  {
    head: '놔두면 손해',
    fig: figDamage,
    tx: '방해꾼을 그냥 두면 업데이트를 <em>갉아먹습니다</em>. 화면에 오래 남을수록 진행도가 되돌아가요.',
  },
  {
    head: '연속 처치',
    fig: figCombo,
    tx: '빗나가지 않고 <em>연달아</em> 잡으면 배율이 올라 더 많이 오릅니다. <em>5연속</em>부터 붙고, 한 번 빗나가면 처음부터예요.',
  },
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
