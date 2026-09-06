// 이 파일 역할: 되돌릴 수 없는 동작을 묻는 공용 XP 확인 대화상자(.layer-confirm).
// ui/settingsPanel.js·ui/titleScreen.js와 똑같은 패턴이다 — index.html에 이미 있는
// 정적 마크업에 핸들러만 붙이고, .open 클래스로 여닫는다. 새 창 장치를 만들지
// 않는 게 요구사항이라, 생김새는 "나가기" 개그 대화상자가 쓰던 클래스
// (.win/.tbar/.cleared-dlg-*/.settings-btn)를 그대로 물려받는다.
//
// 쓰는 곳: 타이틀 [새 게임](세이브 덮어쓰기), 설정 [저장 데이터 초기화].
// 둘 다 "누르면 진행이 사라진다"는 같은 성격이라 창을 따로 둘 이유가 없었다.
//
// ★ ESC로는 안 닫는다 — ESC는 systems/input.js가 설정창 토글로 이미 쓰고 있어서,
//   여기서 또 받으면 대화상자가 닫히면서 동시에 설정창이 열린다. 닫는 길은
//   [취소]와 창의 ×로 충분하다(index.html의 같은 자리 주석 참고).

import { playSfx, SFX } from '../systems/sound.js';

let layer = null;
let titleEl = null;
let subEl = null;
let okEl = null;

// 지금 열려 있는 대화상자가 [확인]에서 실행할 동작. 닫을 때 반드시 null로 되돌려서
// 다음에 열린 대화상자가 지난 동작을 물려받지 않게 한다.
let pendingConfirm = null;

function close() {
  if (!layer || !layer.classList.contains('open')) return;
  playSfx(SFX.UI_CLOSE, { ui: true });
  pendingConfirm = null;
  layer.classList.remove('open');
}

/**
 * 확인 대화상자를 연다.
 * @param {{ title: string, sub: string, okLabel?: string, onConfirm: () => void }} opts
 */
export function openConfirm({ title, sub, okLabel = '확인', onConfirm }) {
  if (!layer) return;
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;
  if (okEl) okEl.textContent = okLabel;
  pendingConfirm = onConfirm;
  // ui:true — 설정창이 열려 있으면 게임이 멈춰 있어서 일반 SFX가 막힌다.
  // 사용자가 직접 누른 결과로 뜨는 창이므로 그 와중에도 소리는 나야 한다.
  playSfx(SFX.UI_OPEN, { ui: true });
  layer.classList.add('open');
}

/** 최초 1회(main.js). 버튼에 핸들러를 붙인다. */
export function initConfirmDialog() {
  layer = document.getElementById('layer-confirm');
  if (!layer) return;

  titleEl = document.getElementById('confirm-dlg-title');
  subEl = document.getElementById('confirm-dlg-sub');
  okEl = document.getElementById('confirm-dlg-ok');

  okEl?.addEventListener('click', () => {
    // 동작을 먼저 챙긴 뒤 닫는다 — close()가 pendingConfirm을 비우므로 순서가 중요하다.
    const run = pendingConfirm;
    playSfx(SFX.UI_CLICK, { ui: true });
    close();
    run?.();
  });

  document.getElementById('confirm-dlg-cancel')?.addEventListener('click', close);
  document.getElementById('confirm-dlg-close')?.addEventListener('click', close);
}
