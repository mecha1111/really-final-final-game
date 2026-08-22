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
 * @returns {{filled:number, total:number}} 손실 잔상(setGhostBar)이 같은 슬롯
 *   칸수 기준으로 계산해야 두 바가 정확히 겹치므로, 계산값을 돌려준다.
 */
function setBar(el, ratio, slotWidth) {
  if (!el) return { filled: 0, total: 1 };
  const inner = el.clientWidth - 6; // padding 제외 대략치
  const total = Math.max(1, Math.floor(inner / (slotWidth + 2)));
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
  setText(document.getElementById('st-stage'), `${state.stageIndex + 1} 구간`);
  setText(document.getElementById('st-tag'), state.blocked ? '정지!' : state.attackWarning ? '공격!' : 'UPLOAD');

  setText(document.getElementById('st-uploaded'), Math.floor(state.uploaded));
  setText(document.getElementById('st-quota'), state.rules.quota);
  setBar(document.getElementById('st-quotabar'), state.uploaded / state.rules.quota, 13);

  const timeEl = document.getElementById('st-time');
  setText(timeEl, mmss(state.timeLeft));
  if (timeEl) timeEl.style.color = state.timeLeft <= config.desktop.timeWarnSec ? '#c0281a' : '#111';

  // 남은 스킵을 칸으로. 다 쓴 칸은 × 로 회색 처리(시안 그대로).
  const skips = document.getElementById('st-skips');
  if (skips && last['skips'] !== `${state.skipsLeft}/${state.rules.skipLimit}`) {
    last['skips'] = `${state.skipsLeft}/${state.rules.skipLimit}`;
    skips.textContent = '';
    for (let i = 0; i < state.rules.skipLimit; i++) {
      const s = document.createElement('span');
      const used = i >= state.skipsLeft;
      s.className = used ? 's used' : 's';
      // ○/× 로 표시한다. 시안의 ↷ 는 DungGeunMo(둥근모) 폰트에 글리프가 없어서
      // 엉뚱한 문자로 렌더된다("q"로 보임) — 폰트에 있는 글자만 쓴다.
      s.textContent = used ? '×' : '○';
      skips.appendChild(s);
    }
  }

  // ── 진짜_최종…exe (업로드 창) ──
  const file = state.file;
  setText(document.getElementById('up-size'), file ? `${file.sizeMb}MB` : '—');
  setText(document.getElementById('up-pct'), `${Math.floor(file ? file.progress : 0)}%`);
  setText(document.getElementById('up-thumb'), file ? file.label : '그림');
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

  // 화면 가장자리 비네트 — 값 자체가 매 프레임 감쇠하는 연속값이라 재시작
  // 트릭이 필요 없다(CSS 애니가 아니라 opacity를 직접 CSS 변수로 미는 방식).
  const vignetteRatio = config.hud.vignettePulseSec > 0 ? state.vignetteMs / (config.hud.vignettePulseSec * 1000) : 0;
  const vignetteLevel = Math.max(0, Math.min(1, vignetteRatio)) * config.hud.vignetteMaxOpacity;
  document.getElementById('layer-vignette')?.style.setProperty('--vig-level', vignetteLevel.toFixed(3));
}
