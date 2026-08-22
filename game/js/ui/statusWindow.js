// 이 파일 역할: HTML 창 두 개(상태.dat / 업로드.exe)에 게임 수치를 매 프레임 흘려 넣는다.
// 캔버스에 그리던 HUD를 대체한다 — 캔버스는 이제 방해꾼만 그린다.

import { config } from '../config.js';

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
function setBar(el, ratio, slotWidth) {
  if (!el) return { filled: 0, total: 1 };
  const cs = getComputedStyle(el);
  const gap = parseFloat(cs.columnGap || cs.gap) || 0;
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const inner = el.clientWidth - padX;
  // N칸의 총 폭 = N*slotWidth + (N-1)*gap이므로, inner에 맞는 N은
  // floor((inner+gap) / (slotWidth+gap))이다(칸 사이에만 gap이 끼고 마지막 칸
  // 뒤엔 안 낀다는 걸 식에 반영 — 그냥 inner/(slotWidth+gap)만 하면 마지막 한
  // 칸분의 gap을 이미 빼놓고 나눈 셈이라 실제보다 살짝 적게 잡힌다).
  const total = Math.max(1, Math.floor((inner + gap) / (slotWidth + gap)));
  const filled = Math.max(0, Math.min(total, Math.round(total * ratio)));
  if (last[el.id + ':n'] !== filled || last[el.id + ':t'] !== total) {
    last[el.id + ':n'] = filled;
    last[el.id + ':t'] = total;
    el.textContent = '';
    for (let i = 0; i < filled; i++) el.appendChild(document.createElement('i'));
  }
  return { filled, total };
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

/** 매 프레임 호출. playing이 아닐 땐 창이 숨겨져 있으므로 건너뛴다. */
export function updateStatusWindows(state) {
  if (state.phase !== 'playing' || !state.rules) return;

  // ── 상태.dat ──
  // 표시 구간은 사람이 읽기 쉽게 n+1 ("1 구간"부터). 내부 n은 0부터.
  // ★ 리뉴얼로 구간명 옆 "START/공격!/정지!" 라벨(st-tag)을 없앴다 — 그 정보는
  //   업로드 창의 up-caption + 일시정지 오버레이(아래)가 이미 더 명확하게 보여준다.
  setText(document.getElementById('st-stage'), `${state.stageIndex + 1} 구간`);

  const uploadedFloor = Math.floor(state.uploaded);
  const uploadedEl = document.getElementById('st-uploaded');
  setText(uploadedEl, uploadedFloor);
  setText(document.getElementById('st-quota'), state.rules.quota);
  // xpbar.big(19px 슬롯, style.css)로 키웠으므로 슬롯 폭도 그것과 맞춘다.
  const quotaRatio = state.rules.quota > 0 ? state.uploaded / state.rules.quota : 0;
  setBar(document.getElementById('st-quotabar'), quotaRatio, 19);

  // 2026-08-24: "구간 전체 할당량 대비 얼마나 왔나"가 게임 중엔 안 보이고
  // 클리어/게임오버 화면이 떠야 비로소 드러난다는 피드백 — 그게 사실 제일 중요한
  // 지표다. 현재/목표 MB(위 두 숫자)를 암산해야 알던 것을 진행률(%)로 바로
  // 보여준다. 100을 넘는 프레임(막 완료해 uploaded가 quota를 스쳐 지나가는
  // 순간)은 100%로 눌러서 "101%" 같은 어색한 숫자가 안 뜨게 한다.
  const quotaPct = Math.max(0, Math.min(100, Math.floor(quotaRatio * 100)));
  const pctEl = document.getElementById('st-progress-pct');
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

  const timeEl = document.getElementById('st-time');
  setText(timeEl, mmss(state.timeLeft));
  if (timeEl) timeEl.style.color = state.timeLeft <= config.desktop.timeWarnSec ? '#c0281a' : '#111';

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
  const upSizeEl = document.getElementById('up-size');
  setText(upSizeEl, file ? `${doneMb} / ${file.sizeMb}MB` : '—');
  if (upSizeEl && last.upSizeMb !== doneMb) {
    last.upSizeMb = doneMb;
    // 새 파일로 넘어가는 첫 프레임(0/…)까지 펄스가 튀면 "방금 올랐다"는 신호가
    // 파일이 막 배정된 순간에도 오해를 부른다 — 0일 때는 재생하지 않는다.
    if (doneMb > 0) {
      upSizeEl.classList.remove('tick');
      void upSizeEl.offsetWidth;
      upSizeEl.classList.add('tick');
    }
  }
  setText(document.getElementById('up-pct'), `${Math.floor(file ? file.progress : 0)}%`);
  // 그림 자체(#up-thumb)는 이제 캔버스라 텍스트를 안 쓴다 — ui/uploadPicture.js가
  // 매 프레임 진행률에 맞춰 모자이크→원본으로 직접 그린다.
  setText(
    document.getElementById('up-caption'),
    state.blocked ? `정지 — ${state.blockedBy.join(', ')}` : state.attackWarning ? '공격 임박!' : '업데이트 중…',
  );
  const { filled, total } = setBar(document.getElementById('up-bar'), file ? file.progress / 100 : 0, 19);
  setGhostBar(document.getElementById('up-bar-ghost'), state.fileBarGhostRatio, state.fileBarGhostMs, filled, total);

  // A타입 정지 라벨 — .frame에 클래스만 토글하면 style.css가 나머지(배지 표시,
  // 썸네일 회색조)를 전부 처리한다.
  const frame = document.querySelector('#win-upload .frame');
  if (frame) frame.classList.toggle('blocked', state.blocked);

  // 피해 순간 번쩍임 + 피해 수치 텍스트 — 둘 다 state.hitSeq가 바뀔 때만 CSS
  // 애니를 재시작한다(remove→reflow→add, ui/crtTransition.js와 같은 트릭 —
  // 그냥 클래스만 add하면 이미 있는 애니가 재시작을 안 해서 연타로 맞아도
  // 처음 한 번만 번쩍이고 끝난다).
  if (last.hitSeq !== state.hitSeq) {
    last.hitSeq = state.hitSeq;

    const winB = document.getElementById('win-upload');
    if (winB) {
      winB.classList.remove('hit-flash');
      void winB.offsetWidth;
      winB.classList.add('hit-flash');
    }

    const dmgEl = document.getElementById('dmg-float');
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
  const vignetteRatio = config.hud.vignettePulseSec > 0 ? state.vignetteMs / (config.hud.vignettePulseSec * 1000) : 0;
  const vignetteLevel = Math.max(0, Math.min(1, vignetteRatio)) * config.hud.vignetteMaxOpacity;
  document.getElementById('layer-vignette')?.style.setProperty('--vig-level', vignetteLevel.toFixed(3));
}
