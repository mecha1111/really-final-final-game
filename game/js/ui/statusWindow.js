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
 */
function setBar(el, ratio, slotWidth) {
  if (!el) return;
  const inner = el.clientWidth - 6; // padding 제외 대략치
  const total = Math.max(1, Math.floor(inner / (slotWidth + 2)));
  const filled = Math.max(0, Math.min(total, Math.round(total * ratio)));
  if (last[el.id + ':n'] === filled && last[el.id + ':t'] === total) return;
  last[el.id + ':n'] = filled;
  last[el.id + ':t'] = total;

  el.textContent = '';
  for (let i = 0; i < filled; i++) el.appendChild(document.createElement('i'));
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
    state.blocked ? `정지 — ${state.blockedBy.join(', ')}` : state.attackWarning ? '공격 임박!' : '업로드 중…',
  );
  setBar(document.getElementById('up-bar'), file ? file.progress / 100 : 0, 19);
}
