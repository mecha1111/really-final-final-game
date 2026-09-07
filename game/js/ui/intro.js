// 이 파일 역할: ★첫 실행에만 도는 인트로 연출 — 타이틀 화면보다 "앞"에 온다.
//   부팅 → 바탕화면(가짜 파일 더미) → 커서가 우리 게임을 찾아 클릭 →
//   강아지 튜토리얼 → ★기존 타이틀 화면(setPhase('title')).
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

// ★바탕화면에 까는 가짜 파일들. "게임 이름을 찾기 어렵게" 하는 게 목적이라
// 비슷비슷한 이름을 잔뜩 깐다 — 그래야 커서가 두 번 헛짚은 뒤에야 우리 게임에
// 도달하는 연출이 성립하고, 마지막에 이름이 펼쳐지는 순간이 산다.
// 아이콘 이름은 ui/icons.js 카탈로그의 키다(psd/zip은 이 연출 때문에 새로 넣었다).
const FILES = [
  { name: '새 폴더', icon: 'folder' },
  { name: '수정본.psd', icon: 'psd' },
  { name: '진짜수정1.psd', icon: 'psd' },
  { name: '최종.psd', icon: 'psd' },
  { name: '최종_수정.psd', icon: 'psd' },
  { name: '진짜_최종_2.psd', icon: 'psd' },
  { name: '진짜 수정 222.psd', icon: 'psd' },
  { name: '진짜_최종_final.psd', icon: 'psd' },
  { name: '제출용_최종.hwp', icon: 'file' },
  { name: '백업(지우지마).zip', icon: 'zip' },
  { name: '새 폴더 (2)', icon: 'folder' },
  { name: '진짜_최종_final_수정_진짜최종(5).exe', icon: 'game' }, // ★우리 게임
  { name: '안쓰는거.zip', icon: 'zip' },
  { name: '휴지통', icon: 'recycle' },
];
// FILES에서 우리 게임의 자리와, 커서가 먼저 들르는 엉뚱한 파일 두 곳.
// 헛짚는 둘은 이름이 제일 헷갈리는 것으로 골랐다(최종.psd / 진짜_최종_final.psd).
const TARGET_INDEX = 11;
const DECOY1_INDEX = 3;
const DECOY2_INDEX = 7;

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
let bootEl = null;
let deskEl = null;
let iconsEl = null;
let taskbarEl = null;
let taskBtnEl = null;
let cursorEl = null;
let assistEl = null;
let headEl = null;
let listEl = null;
let pageEl = null;
let backBtn = null;
let nextBtn = null;

// 지금 보고 있는 튜토리얼 쪽(0-based).
let pageIndex = 0;

// 커서 누름 표시를 되돌릴 남은 시간(초). 0 이하면 대기 중이 아니다. 누름은
// 0.11초짜리라 단계 목록에 넣기엔 잗달아서 여기서 따로 센다.
let pressLeft = 0;

// 인트로가 시작한 뒤 흐른 시간(초). config.intro의 값은 전부 "이 시각"과 비교하는
// 절대 초라, 남은 단계 목록에서 때가 된 것만 꺼내 실행하면 된다.
let elapsed = 0;
let steps = []; // [{ at, run }] — 시각 오름차순. 실행한 건 앞에서부터 빠진다.
let running = false;

/** 가짜 파일 아이콘 14개를 만든다(최초 1회).
 * 아이콘 SVG는 ui/icons.js의 icon()이 준다 — 정적 마크업이 아니라 여기서 직접
 * 부르는 쪽이다(icons.js 상단 주석의 두 갈래 중 "JS가 만드는 자리"). */
function buildIcons(icon) {
  iconsEl.innerHTML = FILES.map(
    (f) => `<div class="intro-deico"><div class="g">${icon(f.icon, 62)}</div><div class="lb">${f.name}</div></div>`,
  ).join('');
}

/** 아이콘 하나만 선택 상태로 만든다(-1이면 전부 해제).
 * ★선택하면 잘렸던 이름이 전부 펼쳐진다 — 그 펼침은 CSS가 한다
 *   (.intro-deico.sel .lb의 -webkit-line-clamp 2→4). */
function selectOnly(index) {
  const kids = iconsEl.children;
  for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('sel', i === index);
}

/**
 * 가짜 커서를 아이콘 위로 옮긴다.
 * ★ 좌표는 offsetLeft/offsetTop만 쓴다 — getBoundingClientRect()를 쓰면 #desktop의
 *   transform 배율을 되돌리는 계산이 또 필요해지고, 이 프로젝트가 반복해서 겪은
 *   "그리기와 판정이 다른 좌표" 부류에 그대로 들어간다. offset*은 배율과 무관한
 *   부모 좌표계(여기서는 1920x1080 그대로)라 나눗셈이 아예 필요 없다.
 *   .intro-deico의 offsetParent가 .intro-icons(absolute)이고 그 offsetParent가
 *   .intro-desk(absolute, left:0/top:0)이며 커서도 같은 .layer-intro 안에 있으므로,
 *   둘을 더하면 그대로 커서 좌표가 된다.
 */
function cursorTo(index) {
  const el = iconsEl.children[index];
  if (!el) return;
  cursorEl.style.left = `${iconsEl.offsetLeft + el.offsetLeft + el.offsetWidth * 0.42}px`;
  cursorEl.style.top = `${iconsEl.offsetTop + el.offsetTop + el.offsetHeight * 0.38}px`;
}

/** 커서를 한 번 "누른다" — 살짝 줄었다 돌아온다(CSS transition). */
function press() {
  cursorEl.classList.add('press');
  pressLeft = config.intro.pressSec;
  playSfx(SFX.UI_CLICK, { ui: true });
}

/** 작업표시줄 시계 — 분위기용이라 인트로가 시작할 때 한 번만 찍는다.
 * 인트로 전체가 10초 남짓이라 도중에 분이 바뀌어도 볼 사람이 없다 —
 * ui/desktop.js의 startClock처럼 setInterval을 또 걸 이유가 없다. */
function setClock() {
  const el = document.getElementById('intro-clock');
  if (!el) return;
  const d = new Date();
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  el.textContent = `${h < 12 ? '오전' : '오후'} ${h12}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  // 마지막 쪽의 [다음]은 [시작] — 누르면 곧장 타이틀로 넘어간다.
  nextBtn.textContent = pageIndex === PAGES.length - 1 ? '시작' : '다음';
}

/** 커서 연출이 끝난 자리에서 말풍선을 띄운다(타임라인의 마지막 단계). */
function showTutorial() {
  pageIndex = 0;
  renderPage();
  // ★진짜 커서를 돌려준다 — 여기서부터는 사용자가 직접 버튼을 눌러야 한다.
  layer.classList.remove('nocursor');
  // .tip = 캐릭터 위 노란 전구 깜빡임(참조 문서의 .xp-assist.tip).
  assistEl.classList.add('on', 'tip');
  playSfx(SFX.UI_OPEN, { ui: true });
}

/**
 * ★인트로의 끝 — 게임의 기존 타이틀 화면으로 넘긴다.
 * [시작]과 [닫기] 둘 다 여기로 모인다 — 끝나는 길이 여럿이라 한 곳에 모아둔다
 * (ui/settingsPanel.js의 closeSettings와 같은 이유).
 */
function toTitle() {
  if (!layer?.classList.contains('on')) return; // 연타·중복 진입 방지
  playSfx(SFX.UI_CLOSE, { ui: true });
  markIntroSeen(); // ★끝까지 온 지금에서야 "봤다"고 찍는다(도중 새로고침은 다시 본다)
  assistEl.classList.remove('on', 'tip');
  layer.classList.remove('on', 'nocursor');
  steps = [];
  running = false;
  setPhase('title');
}

/** config.intro의 절대 시각표를 그대로 단계 목록으로 편다. */
function buildSteps() {
  const c = config.intro;
  return [
    {
      at: c.bootHoldSec,
      run: () => {
        // 부팅 끝 — 바탕화면과 작업표시줄이 함께 떠오른다.
        bootEl.classList.add('out');
        deskEl.classList.add('show');
        taskbarEl.classList.add('show');
      },
    },
    { at: c.bootHoldSec + c.bootFadeSec, run: () => bootEl.classList.add('gone') },
    { at: c.cursorOnSec, run: () => cursorEl.classList.add('on') },
    // 엉뚱한 파일을 두 번 헛짚는다 — 이름이 비슷해서 헷갈린다는 게 이 연출의 농담이다.
    { at: c.decoy1Sec, run: () => { cursorTo(DECOY1_INDEX); selectOnly(DECOY1_INDEX); } },
    { at: c.decoy2Sec, run: () => { cursorTo(DECOY2_INDEX); selectOnly(DECOY2_INDEX); } },
    // ★우리 게임 — 고르는 순간 잘렸던 긴 이름이 전부 펼쳐진다(CSS의 .sel .lb).
    { at: c.targetSec, run: () => { cursorTo(TARGET_INDEX); selectOnly(TARGET_INDEX); } },
    { at: c.click1Sec, run: press }, // 더블클릭
    { at: c.click2Sec, run: press },
    {
      at: c.launchSec,
      run: () => {
        // 실행됐다 — 작업표시줄에 앱 버튼이 등록되고 가짜 커서는 할 일을 마친다.
        taskBtnEl.classList.add('on');
        cursorEl.classList.remove('on');
        selectOnly(-1);
      },
    },
    // 강아지 튜토리얼. ★설정 [시작 시 튜토리얼 보기](config.tutorial.enabled)가
    // 꺼져 있으면 이 페이지들을 건너뛰고 곧장 타이틀로 넘어간다 — 단, 그 앞의
    // 부팅·바탕화면·클릭 연출(오프닝)은 이 토글과 무관하게 항상 재생된다. 그건
    // 튜토리얼이 아니라 오프닝이라 끄는 대상이 아니다(요구사항).
    // 켜져 있으면 타임라인은 여기서 끝나고, 이후 진행은 전적으로 사용자의
    // [뒤로]/[다음]/[닫기]에 달렸다(자동으로 넘어가지 않는다).
    { at: c.tutorialSec, run: () => (config.tutorial.enabled ? showTutorial() : toTitle()) },
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
 *
 * @param {(name: string, size?: number) => string} icon ui/icons.js의 icon().
 *   이 모듈이 아이콘 카탈로그를 직접 알 필요가 없어서 주입받는다 — main.js가
 *   이미 그 모듈을 들고 있다.
 */
export function initIntro(icon) {
  layer = document.getElementById('layer-intro');
  if (!layer) return;
  bootEl = document.getElementById('intro-boot');
  deskEl = document.getElementById('intro-desk');
  iconsEl = document.getElementById('intro-icons');
  taskbarEl = document.getElementById('intro-taskbar');
  taskBtnEl = document.getElementById('intro-taskbtn');
  cursorEl = document.getElementById('intro-cursor');
  assistEl = document.getElementById('intro-assist');
  headEl = document.getElementById('intro-assist-head');
  listEl = document.getElementById('intro-assist-list');
  pageEl = document.getElementById('intro-assist-page');
  backBtn = document.getElementById('intro-assist-back');
  nextBtn = document.getElementById('intro-assist-next');

  // 전환 시간의 유일한 출처는 config다 — CSS는 변수만 참조한다
  // (ui/rover.js의 --rover-slide-sec, ui/crtTransition.js의 --crt-*와 같은 패턴).
  layer.style.setProperty('--intro-boot-fade', `${config.intro.bootFadeSec}s`);
  layer.style.setProperty('--intro-cursor-sec', `${config.intro.cursorMoveSec}s`);
  layer.style.setProperty('--intro-press-sec', `${config.intro.pressSec}s`);

  buildIcons(icon);

  backBtn.addEventListener('click', () => {
    // disabled라 1쪽에선 여기까지 안 오지만, 값의 하한은 여기서도 지킨다.
    if (pageIndex === 0) return;
    pageIndex -= 1;
    playSfx(SFX.UI_CLICK, { ui: true });
    renderPage();
  });
  nextBtn.addEventListener('click', () => {
    if (pageIndex >= PAGES.length - 1) {
      toTitle(); // 마지막 쪽의 [시작]
      return;
    }
    pageIndex += 1;
    playSfx(SFX.UI_CLICK, { ui: true });
    renderPage();
  });
  document.getElementById('intro-assist-close')?.addEventListener('click', toTitle);

  // ★첫 실행이면 지금 당장 커튼을 올린다(위 주석 참고).
  if (!hasSeenIntro()) layer.classList.add('on', 'nocursor');
}

/** 타임라인을 돌리기 시작한다 — main.js가 phase를 'intro'로 착지시킨 그 자리에서만 부른다. */
export function startIntro() {
  if (!layer) return;
  layer.classList.add('on', 'nocursor');
  setClock();
  elapsed = 0;
  pressLeft = 0;
  steps = buildSteps();
  running = true;
}

/** 매 프레임(main.js, phase==='intro'일 때만). 때가 된 단계를 순서대로 실행한다. */
export function updateIntro(dt) {
  if (!running) return;

  if (pressLeft > 0) {
    pressLeft -= dt;
    if (pressLeft <= 0) cursorEl.classList.remove('press');
  }

  elapsed += dt;
  // 한 프레임에 여러 단계가 걸릴 수 있다(더블클릭 두 번은 0.18초 차이라, 프레임이
  // 한 번 밀리면 같은 프레임에 둘 다 때가 된다) — while로 밀린 만큼 전부 소화한다.
  while (steps.length > 0 && elapsed >= steps[0].at) steps.shift().run();

  // 남은 단계가 없으면 타임라인은 할 일이 없다 — 이제부터는 사용자가 버튼을
  // 누를 때까지 기다린다(자동 진행 없음).
  if (steps.length === 0) running = false;
}
