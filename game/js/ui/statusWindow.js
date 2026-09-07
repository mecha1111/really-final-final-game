// 이 파일 역할: HTML 창 두 개(상태.dat / 업로드.exe)에 게임 수치를 매 프레임 흘려 넣는다.
// 캔버스에 그리던 HUD를 대체한다 — 캔버스는 이제 방해꾼만 그린다.

import { config } from '../config.js';
import { addFloat } from '../systems/floats.js';
import { clientToWorld } from './canvasGeometry.js';
// 표시용 구간 이름의 유일한 출처(유한 "N 구간" / 무한 "무한 N층").
import { stageLabel } from '../core/stageManager.js';

// 매 프레임 DOM을 만지면 낭비라, 값이 바뀐 것만 갱신하려고 직전 값을 기억해둔다.
const last = {};
function setText(el, value) {
  if (!el) return;
  const s = String(value);
  if (last[el.id] === s) return;
  last[el.id] = s;
  el.textContent = s;
}

/**
 * id 조회 결과를 기억해둔다 — 이 창들의 엘리먼트는 index.html의 정적 마크업이라
 * 한 번 찾으면 세션 내내 같은 노드다(교체·재생성하는 코드가 없다). 매 프레임
 * 10번 넘게 getElementById를 다시 부르던 걸 없앤다.
 */
const elCache = {};
function el(id) {
  let node = elCache[id];
  if (node === undefined) {
    node = document.getElementById(id);
    elCache[id] = node;
  }
  return node;
}

/**
 * 스타일 값을 바뀔 때만 쓴다 — 같은 문자열을 매 프레임 다시 대입하면 그 자체로
 * 스타일 재계산 후보가 된다(ui/hazards/powersave.js가 --hz-dim에 쓰는 것과 같은
 * 메모 패턴).
 */
function setStyle(node, prop, value, memoKey) {
  if (!node) return;
  if (last[memoKey] === value) return;
  last[memoKey] = value;
  node.style.setProperty(prop, value);
}

// setBar가 CSS에서 읽어오는 칸 계산값(gap/padding/폭)은 레이아웃이 바뀔 때만
// 달라진다 — 매 프레임 getComputedStyle+clientWidth로 다시 재면 프레임마다
// 강제 스타일/레이아웃 플러시가 한 번씩 더 생긴다(실측으로 잡은 지점). 그래서
// 한 번 재서 기억해두고, 창 크기가 바뀔 때만 버린다.
// ★ #desktop은 transform: scale로만 줄이고 늘리므로(ui/canvasFit.js) 레이아웃
//   크기(clientWidth)는 리사이즈 말고는 안 변한다 — 이 무효화 조건으로 충분하다.
const barMetrics = new Map();
window.addEventListener('resize', () => barMetrics.clear());

// #win-upload 안의 .frame — 후손 셀렉터라 el()(id 전용) 대신 따로 기억해둔다.
let frameEl = null;

/**
 * xpbar를 칸(i) 개수로 채운다. 시안이 "칸이 늘어나는" 픽셀 게이지라
 * width %가 아니라 칸 수로 표현한다.
 *
 * ★ 칸 사이 간격(gap)·안쪽 여백(padding)을 여기서 다시 숫자로 안 박고
 *   getComputedStyle로 CSS에서 직접 읽는다. 예전엔 "padding 6px, gap 2px"를
 *   가정한 매직넘버였는데, .xpbar.big의 실제 CSS는 padding 3px×2(=6, 이건
 *   우연히 맞았다)·gap **3px**(2px 아님!)라 총 칸수(total)가 실제보다 많게
 *   잡혔다 — 칸 하나하나는 CSS가 정한 실제 폭(19px)+간격(3px)대로 그려지는데
 *   JS는 "간격 2px"로 셈해서 칸이 실제로 다 안 들어가는 걸 몰랐던 것이다.
 *   그 결과 진행률이 꽉 차도(또는 손실 잔상이 커도) 칸들이 바 오른쪽 끝까지
 *   못 닿고 빈 여백이 남았다(실측: 80% 표시에서 79px짜리 여백 확인 — 사용자가
 *   본 "정렬 안 맞음/삐져나옴"의 정체). CSS 값을 직접 읽으면 .xpbar(비-big,
 *   gap 2px)에도 그대로 맞는 함수가 된다 — 어느 변형을 쓰든 다시 안 어긋난다.
 * @returns {{filled:number, total:number}} 손실 잔상(setGhostBar)이 같은 슬롯
 *   칸수 기준으로 계산해야 두 바가 정확히 겹치므로, 계산값을 돌려준다.
 */
export function setBar(el, ratio, slotWidth) {
  if (!el) return { filled: 0, total: 1, changed: false };
  // ★ 이 세 값(gap/padding/안쪽 폭)만 CSS에서 읽어오는데, 매 프레임 다시 읽으면
  //   프레임마다 강제 스타일·레이아웃 플러시가 생긴다 — 리사이즈 때만 다시 잰다
  //   (위 barMetrics 주석 참고). 계산식과 그 근거는 아래 그대로다.
  let m = barMetrics.get(el);
  if (!m) {
    const cs = getComputedStyle(el);
    const gap = parseFloat(cs.columnGap || cs.gap) || 0;
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const inner = el.clientWidth - padX;
    // ★ 아직 레이아웃이 안 잡혔으면(숨겨져 있거나 첫 프레임이라 clientWidth가 0)
    //   그 값을 캐시에 굳히면 안 된다 — 굳히는 순간 칸 수가 영영 1로 박힌다.
    //   재보면 되는 값이라, 유효할 때까지는 캐시하지 않고 매번 다시 잰다
    //   (예전 코드가 매 프레임 재던 덕에 저절로 낫던 자리라 놓치기 쉬운 함정이다).
    m = { gap, inner };
    if (inner > 0) barMetrics.set(el, m);
  }
  const { gap, inner } = m;
  // N칸의 총 폭 = N*slotWidth + (N-1)*gap이므로, inner에 맞는 N은
  // floor((inner+gap) / (slotWidth+gap))이다(칸 사이에만 gap이 끼고 마지막 칸
  // 뒤엔 안 낀다는 걸 식에 반영 — 그냥 inner/(slotWidth+gap)만 하면 마지막 한
  // 칸분의 gap을 이미 빼놓고 나눈 셈이라 실제보다 살짝 적게 잡힌다).
  const total = Math.max(1, Math.floor((inner + gap) / (slotWidth + gap)));
  const filled = Math.max(0, Math.min(total, Math.round(total * ratio)));
  let changed = false;
  if (last[el.id + ':n'] !== filled || last[el.id + ':t'] !== total) {
    last[el.id + ':n'] = filled;
    last[el.id + ':t'] = total;
    el.textContent = '';
    for (let i = 0; i < filled; i++) el.appendChild(document.createElement('i'));
    changed = true;
  }
  // changed = 이번에 칸을 다시 만들었나. 선두 반짝임(markLeadSegment)이 이 값을
  // 보고 "다시 만든 프레임"에만 클래스를 얹는다 — 안 바뀐 프레임엔 이미 붙어
  // 있으므로 매 프레임 전체 칸을 훑을 이유가 없다.
  return { filled, total, changed };
}

/**
 * 손실 잔상 — 방금 깎이기 직전 값(ghostRatio)이 지금 값(realFilled)보다 클 때만,
 * 그 사이 칸을 빨간 칸으로 그린다(위 xpbar-stack에서 진짜 바 바로 뒤에 겹친다).
 * 칸은 style.css의 @keyframes ghostFade로 스스로 옅어지다 사라진다 — 여기서는
 * "몇 칸을 새로 켜는지"만 정하고 애니는 CSS에 맡긴다.
 * ★ realFilled/total은 setBar()가 방금 계산한 값을 그대로 받는다 — 잔상 바를
 *   따로 다시 재면(예: ghost 요소의 clientWidth로 별도 계산) 반올림이 갈려서
 *   두 바의 칸 경계가 안 맞을 수 있다(그리기와 판정이 같은 출처를 써야 한다는
 *   이 프로젝트의 원칙과 같은 이유 — 여긴 클릭 판정은 아니지만 "두 바가 같은
 *   칸 기준을 쓴다"는 동일한 문제라 같은 해법을 썼다).
 */
function setGhostBar(el, ghostRatio, ghostMs, realFilled, total) {
  if (!el) return;
  const ghostFilled = ghostMs > 0 ? Math.max(0, Math.min(total, Math.round(total * ghostRatio))) : 0;
  const need = Math.max(0, ghostFilled - realFilled); // 진짜 바를 이미 따라잡았으면 0
  if (need <= 0) {
    if (last[el.id + ':k'] !== '') {
      last[el.id + ':k'] = '';
      el.textContent = '';
    }
    return;
  }
  // 칸 배치가 바뀔 때만 다시 그린다. realFilled가 바뀔 때도 다시 그려야 한다 —
  // 진짜 바가 진행돼서 따라잡은 만큼 빨간 칸이 오른쪽으로 밀리며 줄어들어야
  // "따라잡히고 있다"가 보이기 때문이다(다시 그릴 때마다 옅어짐 애니가 새로
  // 시작되는 건 의도한 부작용이다 — 옅어지다가 뒤에서 진짜 바가 따라잡으면
  // 그 자리부터 없어지는 게 자연스럽다).
  const key = `${realFilled}:${need}`;
  if (last[el.id + ':k'] === key) return;
  last[el.id + ':k'] = key;

  el.textContent = '';
  // 진짜 바가 채운 자리만큼은 투명 스페이서로 밀어내고(안 그러면 빨간 칸이
  // 왼쪽 끝부터 시작해서 진짜 바 밑에 깔려 하나도 안 보인다), 그 뒤(realFilled~
  // ghostFilled)에만 실제 빨간 칸을 놓는다.
  for (let i = 0; i < realFilled; i++) {
    const spacer = document.createElement('i');
    spacer.className = 'spacer';
    el.appendChild(spacer);
  }
  for (let i = 0; i < need; i++) el.appendChild(document.createElement('i'));
}

function mmss(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 2026-08-23 VFX: 업로드 진행바(#up-bar)의 맨 앞칸(방금 채워진 칸)에 반짝임
 * 클래스를 준다 — "차오르는 선두가 빛난다" 요구사항. 다른 바(퀘스트 진행률 등)엔
 * 안 걸어 이 요구사항이 말한 "업로드 진행바"에만 반짝임이 붙는다.
 * ★ setBar()가 칸을 "다시 만든" 프레임에만 부른다(setBar의 changed) — 새로 만든
 *   칸들은 클래스가 없는 상태라 마지막 하나에 붙이면 끝이고, 안 바뀐 프레임엔
 *   이미 제대로 붙어 있다. 예전엔 매 프레임 자식 전체(진행도에 따라 30칸 넘게)를
 *   훑으며 classList.toggle을 걸었는데, 그게 프레임마다 하는 일 중 가장 큰
 *   DOM 작업이었다(실측). */
function markLeadSegment(barEl) {
  if (!barEl) return;
  const kids = barEl.children;
  if (kids.length > 0) kids[kids.length - 1].classList.add('lead');
}

/** 2026-08-23 VFX: 업로드 MB 숫자(#up-size) 옆에 "+N" 플로팅 팝. 새 텍스트 연출을
 * 또 안 만들고 기존 floats 시스템(systems/floats.js, DungGeunMo+외곽선)을 그대로
 * 재활용한다 — 화면 좌표(anchorEl 위치)를 월드 좌표로 바꿔야 캔버스 floats와
 * 같은 자리에 뜬다(systems/input.js의 canvasPoint와 같은 변환, ui/canvasGeometry.js
 * 한 곳만 쓴다는 원칙 그대로). */
function spawnMbPop(delta, anchorEl) {
  if (delta <= 0 || !anchorEl) return;
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;
  const r = anchorEl.getBoundingClientRect();
  const worldToBacking = canvas.__worldToBacking || canvas.width / config.canvas.width;
  const pt = clientToWorld(canvas, r.right, r.top, worldToBacking);
  addFloat(`+${delta}`, pt.x, pt.y, true);
}

/** 매 프레임 호출. playing이 아닐 땐 창이 숨겨져 있으므로 건너뛴다. */
export function updateStatusWindows(state) {
  if (state.phase !== 'playing' || !state.rules) return;

  // ── 상태.dat ──
  // 표시 이름은 core/stageManager.js의 stageLabel() 하나만 쓴다 — 유한은 "1 구간",
  // 무한모드는 ★"무한 1층"이다(예전엔 여기서 n+1을 직접 계산해 "6 구간"으로 셌다).
  // ★ 리뉴얼로 구간명 옆 "START/공격!/정지!" 라벨(st-tag)을 없앴다 — 그 정보는
  //   업로드 창의 up-caption + 일시정지 오버레이(아래)가 이미 더 명확하게 보여준다.
  setText(el('st-stage'), stageLabel(state.stageIndex));

  const uploadedFloor = Math.floor(state.uploaded);
  const uploadedEl = el('st-uploaded');
  setText(uploadedEl, uploadedFloor);
  setText(el('st-quota'), state.rules.quota);
  // xpbar.big(19px 슬롯, style.css)로 키웠으므로 슬롯 폭도 그것과 맞춘다.
  const quotaRatio = state.rules.quota > 0 ? state.uploaded / state.rules.quota : 0;
  setBar(el('st-quotabar'), quotaRatio, 19);

  // 2026-08-24: "구간 전체 할당량 대비 얼마나 왔나"가 게임 중엔 안 보이고
  // 클리어/게임오버 화면이 떠야 비로소 드러난다는 피드백 — 그게 사실 제일 중요한
  // 지표다. 현재/목표 MB(위 두 숫자)를 암산해야 알던 것을 진행률(%)로 바로
  // 보여준다. 100을 넘는 프레임(막 완료해 uploaded가 quota를 스쳐 지나가는
  // 순간)은 100%로 눌러서 "101%" 같은 어색한 숫자가 안 뜨게 한다.
  const quotaPct = Math.max(0, Math.min(100, Math.floor(quotaRatio * 100)));
  const pctEl = el('st-progress-pct');
  setText(pctEl, `${quotaPct}%`);

  // 진행량 MB·진행률 둘 다, 정수값이 실제로 오른 프레임에만 짧은 펄스(.tick)를
  // 튼다 — ui/uploadPicture.js 없이도 "방금 올랐다"가 눈에 들어오게 한다
  // (style.css의 upSizeTick과 같은 키프레임을 공유— up-size에서 쓴 패턴 재사용).
  // 판이 막 시작한 0%/0MB에서는 안 튄다(그 순간까지 펄스가 뜨면 "시작하자마자
  // 뭔가 올랐다"로 오해한다).
  if (uploadedEl && last.stUploadedFloor !== uploadedFloor) {
    last.stUploadedFloor = uploadedFloor;
    if (uploadedFloor > 0) {
      uploadedEl.classList.remove('tick');
      void uploadedEl.offsetWidth;
      uploadedEl.classList.add('tick');
    }
  }
  if (pctEl && last.stQuotaPct !== quotaPct) {
    last.stQuotaPct = quotaPct;
    if (quotaPct > 0) {
      pctEl.classList.remove('tick');
      void pctEl.offsetWidth;
      pctEl.classList.add('tick');
    }
  }

  const timeEl = el('st-time');
  setText(timeEl, mmss(state.timeLeft));
  // 같은 색 문자열을 매 프레임 다시 대입하지 않는다(바뀔 때만 — setStyle 메모).
  setStyle(timeEl, 'color', state.timeLeft <= config.desktop.timeWarnSec ? '#c0281a' : '#111', 'st-time:color');

  // 긴박 경고(systems/urgency.js가 매 프레임 state.urgent/state.nearGoal을
  // 다시 계산해둔다) — 여기서는 그 값을 읽어 CSS 클래스만 토글한다. 감쇠하는
  // 연속값이 아니라 참/거짓 상태라 .frame.blocked 같은 boolean 토글 패턴이지,
  // hitSeq류의 "한 번만 재생" 트리거가 아니다 — 매 프레임 그대로 다시 토글해도
  // 값이 안 바뀌면 classList가 알아서 아무 일도 안 한다.
  el('layer-urgent')?.classList.toggle('urgent', state.urgent);
  if (timeEl) timeEl.classList.toggle('urgent', state.urgent);
  if (pctEl) {
    pctEl.classList.toggle('urgent', state.urgent);
    pctEl.classList.toggle('near-goal', state.nearGoal);
  }

  // ── 진짜_최종…exe (업로드 창) ──
  // 2026-08-24: 예전엔 이 자리에 파일 목표 용량만 고정 텍스트로 떠 있었다
  // ("60MB") — 그림·진행바에 눈이 안 간다는 피드백이라, "지금까지 올라간 MB"를
  // 목표와 나란히 보여주는 살아있는 숫자로 바꿨다. progress(0~100)에 비례해서
  // 매 프레임 계산만 하고 별도 상태는 안 둔다(다른 값들과 같은 원칙 — 진행률이
  // 이미 유일한 출처다). 정수부가 실제로 바뀐 프레임에만(예: 35→36) 아래
  // upSizeSeq를 올려 살짝 튀는 펄스를 재생한다 — 소리 없이도 "숫자가 방금
  // 올랐다"가 눈에 들어오게(요구사항: 화질복구 소리는 뺐으니 시각으로 유도).
  const file = state.file;
  const doneMb = file ? Math.floor((file.progress / 100) * file.sizeMb) : 0;
  const upSizeEl = el('up-size');
  setText(upSizeEl, file ? `${doneMb} / ${file.sizeMb}MB` : '—');
  if (upSizeEl && last.upSizeMb !== doneMb) {
    const prevDoneMb = last.upSizeMb; // ★ VFX: 덮어쓰기 전에 델타 계산용으로 챙겨둔다
    last.upSizeMb = doneMb;
    // 새 파일로 넘어가는 첫 프레임(0/…)까지 펄스가 튀면 "방금 올랐다"는 신호가
    // 파일이 막 배정된 순간에도 오해를 부른다 — 0일 때는 재생하지 않는다.
    if (doneMb > 0) {
      upSizeEl.classList.remove('tick');
      void upSizeEl.offsetWidth;
      upSizeEl.classList.add('tick');

      // ★ VFX: "+N" 플로팅 팝(숫자 옆). prevDoneMb가 숫자일 때만 — 파일이 막
      // 배정된 직후(0에서 처음 오른 그 프레임엔 prevDoneMb가 undefined이거나 이전
      // 파일의 완성치라 델타가 의미 없다) 어색한 값이 안 뜨게 한다.
      if (config.fx.mbPop.enabled && typeof prevDoneMb === 'number' && prevDoneMb <= doneMb) {
        spawnMbPop(doneMb - prevDoneMb, upSizeEl);
      }
    }
  }
  setText(el('up-pct'), `${Math.floor(file ? file.progress : 0)}%`);
  // 그림 자체(#up-thumb)는 이제 캔버스라 텍스트를 안 쓴다 — ui/uploadPicture.js가
  // 매 프레임 진행률에 맞춰 모자이크→원본으로 직접 그린다.
  setText(
    el('up-caption'),
    state.blocked ? `정지 — ${state.blockedBy.join(', ')}` : state.attackWarning ? '공격 임박!' : '업데이트 중…',
  );
  const upBarEl = el('up-bar');
  const { filled, total, changed } = setBar(upBarEl, file ? file.progress / 100 : 0, 19);
  setGhostBar(el('up-bar-ghost'), state.fileBarGhostRatio, state.fileBarGhostMs, filled, total);
  // ★ VFX: 차오르는 선두 반짝임(업로드 진행바 전용, 요구사항 그대로).
  //   칸을 새로 만든 프레임에만 얹는다(markLeadSegment 주석 참고).
  if (config.fx.progressShine.enabled && filled > 0 && changed) markLeadSegment(upBarEl);

  // A타입 정지 라벨 — .frame에 클래스만 토글하면 style.css가 나머지(배지 표시,
  // 썸네일 회색조)를 전부 처리한다.
  // ★ 후손 셀렉터(querySelector)를 매 프레임 다시 돌리지 않는다 — 정적 마크업이라
  //   한 번 찾아두면 그만이다(위 el() 캐시와 같은 이유).
  if (!frameEl) frameEl = document.querySelector('#win-upload .frame');
  if (frameEl) frameEl.classList.toggle('blocked', state.blocked);

  // 피해 순간 번쩍임 + 피해 수치 텍스트 — 둘 다 state.hitSeq가 바뀔 때만 CSS
  // 애니를 재시작한다(remove→reflow→add, ui/crtTransition.js와 같은 트릭 —
  // 그냥 클래스만 add하면 이미 있는 애니가 재시작을 안 해서 연타로 맞아도
  // 처음 한 번만 번쩍이고 끝난다).
  if (last.hitSeq !== state.hitSeq) {
    last.hitSeq = state.hitSeq;

    const winB = el('win-upload');
    if (winB) {
      winB.classList.remove('hit-flash');
      void winB.offsetWidth;
      winB.classList.add('hit-flash');
    }

    const dmgEl = el('dmg-float');
    if (dmgEl) {
      dmgEl.textContent = state.dmgFloatText ?? '';
      dmgEl.classList.remove('show');
      void dmgEl.offsetWidth;
      dmgEl.classList.add('show');
    }
  }

  // 콤보 카운터는 이제 캔버스에서 그린다(ui/renderEnemies.js의 drawCombo,
  // ui/render.js가 매 프레임 호출) — 여기서 더 할 일이 없다.

  // 화면 가장자리 비네트 — 값 자체가 매 프레임 감쇠하는 연속값이라 재시작
  // 트릭이 필요 없다(CSS 애니가 아니라 opacity를 직접 CSS 변수로 미는 방식).
  // ★ 값이 실제로 바뀔 때만 쓴다 — 피해가 없는 대부분의 프레임은 계속 "0.000"이라,
  //   예전엔 같은 문자열을 매 프레임 다시 대입하고 있었다(setStyle 메모로 정리).
  const vignetteRatio = config.hud.vignettePulseSec > 0 ? state.vignetteMs / (config.hud.vignettePulseSec * 1000) : 0;
  const vignetteLevel = Math.max(0, Math.min(1, vignetteRatio)) * config.hud.vignetteMaxOpacity;
  setStyle(el('layer-vignette'), '--vig-level', vignetteLevel.toFixed(3), 'vig');
}
