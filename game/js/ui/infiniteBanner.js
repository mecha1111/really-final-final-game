// 이 파일 역할: 무한모드 1층 진입 시 "새로운 방해가 추가됩니다" 1회 안내.
//
// ★ trapDialog.js(fake_btn 함정 안내)와 완전히 같은 성격의 물건이다 — 게임
//   상태를 전혀 안 건드리는 순수 UI 토스트, setTimeout으로 스스로 닫힌다.
//   ★ setTimeout을 쓰는 이유도 그쪽과 같다: 이 창은 게임 로직이 아니라 안내문일
//   뿐이라 업데이트 루프·히트스톱·일시정지에 같이 멈출 이유가 없고, 무엇보다
//   판이 끝나면 onPhaseChange가 어차피 치운다(trapDialog.js 상단 주석 참고).
//
// ★ "1층 진입 시 1회" — core/stageManager.js의 startGame()이 이번 판이 정확히
//   무한 1층(stageIndex === config.stage.finiteCount)일 때만 부른다. 세이브에
//   아무것도 안 남긴다 — "평생 한 번"이 아니라 "그 판에 들어갈 때마다"다. 무한
//   모드는 재도전이 전제(도전 기록)라, 다시 들어갈 때마다 다시 봐도 되는(오히려
//   다시 보는 게 도움이 되는) 정보다.

import { config } from '../config.js';
import { onPhaseChange } from '../core/state.js';
import { icon } from './icons.js';

let layerEl = null;
let hideTimer = 0;

/** 최초 1회(main.js). 레이어를 잡아두고 고정 마크업을 한 번만 만든다. */
export function initInfiniteBanner() {
  layerEl = document.getElementById('layer-infobanner');
  if (!layerEl) return;

  // trapDialog.js와 같은 이유로 매번 innerHTML을 새로 조립하지 않는다 —
  // 내용이 항상 같고, .open 클래스로만 여닫으면 충분하다.
  layerEl.innerHTML = `
    <div class="hz-balloon info-banner">
      <div class="hz-balloon-ico">${icon('warning', 26)}</div>
      <div class="hz-balloon-txt">
        <b>새로운 방해가 추가됩니다</b>
        <span>무한 모드부터는 모든 종류가 등장합니다</span>
      </div>
    </div>
  `;

  // 판이 'playing'을 벗어나면 즉시 치운다(trapDialog.js와 같은 이유·같은 자리 —
  // 클리어/실패 화면 위에 지난 판의 안내가 얹혀 가는 걸 막는다).
  onPhaseChange((next) => {
    if (next !== 'playing') hideInfiniteBanner();
  });
}

/** 무한 1층 판이 시작될 때 호출(core/stageManager.js의 startGame). */
export function showInfiniteBanner() {
  if (!layerEl) return;
  layerEl.classList.add('open');

  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideInfiniteBanner, config.stage.infiniteBannerHoldMs);
}

export function hideInfiniteBanner() {
  clearTimeout(hideTimer);
  hideTimer = 0;
  layerEl?.classList.remove('open');
}
