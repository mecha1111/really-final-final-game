// 이 파일 역할: fake_btn(업데이트 취소 버튼) 함정을 밟았을 때 뜨는 XP 시스템
// 대화상자 한 장. 벌칙 자체는 전혀 안 건드린다 — 이 파일은 "방금 무슨 일이
// 일어났는지"를 글자로 알려주는 역할만 한다.
//
// 왜 필요했나: fake_btn을 누르면 진행도가 -10% 깎이는데, 화면에는 공통 피해
// 연출(번쩍임·비네트·"-10%")만 떠서 "내가 뭘 잘못했는지"가 안 보였다. 방해꾼을
// 잡다가 깎인 건지, 함정을 밟아서 깎인 건지 구분이 안 됐다는 뜻이다.
//
// ★ 게임을 멈추지 않는다. 이 창은 state를 전혀 안 건드리고(설정 팝업의
//   state.settingsOpen 같은 일시정지 플래그가 없다) DOM 한 장만 얹었다 치운다 —
//   업로드 진행바도 방해꾼도 그대로 돈다.
//
// ★ pointer-events (이 프로젝트가 가장 자주 터뜨린 지점, systems/hazard.js 상단
//   주석과 같은 규칙) — 레이어도 창도 전부 pointer-events:none이다.
//   이 창은 플레이 도중 화면 한복판에 뜨는데, 조금이라도 클릭을 받으면 그 아래
//   방해꾼을 못 누르게 된다. 그래서 아예 "클릭을 받지 않는 그림"으로 두고,
//   "클릭하면 닫힌다"는 요구사항은 window에서 클릭을 엿듣는 것으로 만족시킨다
//   (아래 onAnyPointerDown — 이벤트를 소비하지 않으므로 그 클릭은 평소대로
//   캔버스의 방해꾼 판정까지 그대로 간다). [확인] 버튼도 같은 이유로 "누르면
//   닫히긴 하지만 클릭을 가로채지는 않는" 그림이다.
//
// ★ 판이 끝나면 같이 사라진다(onPhaseChange) — 환경 방해가 클리어/BSOD 화면 위에
//   얹혀 가던 사고(systems/hazard.js의 initHazards 주석)와 같은 부류를 미리 막는다.

import { config } from '../config.js';
import { onPhaseChange } from '../core/state.js';
import { icon } from './icons.js';

let layerEl = null;
let winEl = null;
let hideTimer = 0;
// 이 창을 띄운 그 클릭이 곧바로 자기를 닫아버리지 않게 하는 빗장(아래 주석).
let shownAt = 0;

/** 최초 1회(main.js). 레이어를 잡아두고 닫기 배선을 건다. */
export function initTrapDialog() {
  layerEl = document.getElementById('layer-trapdlg');
  if (!layerEl) return;

  // 창 자체는 한 번만 만들어 두고 .open 클래스로 여닫는다 — 매번 innerHTML을
  // 새로 조립하면 함정을 연달아 밟을 때 DOM이 깜빡인다(내용이 항상 같아서
  // 다시 만들 이유도 없다).
  winEl = document.createElement('div');
  winEl.className = 'win trap-dlg';
  winEl.innerHTML = `
    <div class="tbar">
      <div class="ico">!</div>
      <div class="t">시스템</div>
    </div>
    <div class="trap-dlg-body">
      <div class="trap-dlg-ico">${icon('warning', 40)}</div>
      <div class="trap-dlg-msg">
        <p>업데이트가 취소되었습니다.</p>
        <p class="trap-dlg-sub">진행 중이던 작업의 일부가 취소되었습니다.</p>
      </div>
    </div>
    <div class="trap-dlg-foot">
      <button type="button" class="settings-btn settings-btn-primary" tabindex="-1">확인</button>
    </div>
  `;
  layerEl.appendChild(winEl);

  // "클릭으로도 닫힘" — 창이 클릭을 안 받으므로(위 pointer-events 주석) window에서
  // 엿듣는다. 이벤트를 소비하지 않는 게 핵심이다: preventDefault도 stopPropagation도
  // 안 하므로 그 클릭은 평소대로 캔버스까지 내려가 방해꾼 판정에 그대로 쓰인다.
  window.addEventListener('pointerdown', onAnyPointerDown, true);

  // 판이 'playing'을 벗어나면 즉시 치운다(파일 상단 주석).
  onPhaseChange((next) => {
    if (next !== 'playing') hideTrapDialog();
  });
}

function onAnyPointerDown() {
  if (!isOpen()) return;
  // ★ 이 창을 띄운 바로 그 클릭(= fake_btn을 밟은 클릭)이 자기 자신을 닫는 걸
  //   막는다. 지금 배선(캔버스 pointerdown 핸들러 안에서 show가 불린다)에서는
  //   이 window 캡처 리스너가 이미 지나간 뒤라 실제로는 안 겹치지만, 나중에
  //   호출 지점이 바뀌면 조용히 "떴다가 즉시 사라지는" 창이 된다 — 시간으로
  //   못박아 두면 그 경로가 생겨도 안 깨진다.
  if (performance.now() - shownAt < 120) return;
  hideTrapDialog();
}

function isOpen() {
  return !!layerEl?.classList.contains('open');
}

/**
 * 함정을 밟은 그 순간 호출(systems/input.js). 이미 떠 있으면 시간만 다시 잰다 —
 * 연달아 밟아도 창이 쌓이지 않고 마지막 것 기준으로 1.5초를 다시 센다.
 */
export function showTrapDialog() {
  if (!layerEl) return;
  layerEl.classList.add('open');
  shownAt = performance.now();

  // ★ setTimeout을 쓴다 — 이 프로젝트가 게임 연출 타이밍을 rAF now(ms)로만 재는
  //   것과 다른 선택이라 이유를 남긴다: 이 창은 게임 상태가 아니라 순수 UI라
  //   업데이트 루프에 붙을 자리가 없고(멈추지 않는 게 요구사항이라 히트스톱·
  //   설정 일시정지에 같이 멈출 이유도 없다), 무엇보다 판이 끝나면 위
  //   onPhaseChange가 어차피 치운다.
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideTrapDialog, config.enemy.trapDialog.holdMs);
}

export function hideTrapDialog() {
  clearTimeout(hideTimer);
  hideTimer = 0;
  layerEl?.classList.remove('open');
}
