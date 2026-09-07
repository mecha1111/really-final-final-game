// 이 파일 역할: 환경 방해 E — "화면 깨짐". CRT 모니터가 손상된 느낌의 깨진 픽셀
// 블록 3~5개가 화면 여기저기에 뜬다. 시야만 가리고(그 아래 방해꾼이 안 보임)
// 클릭 판정은 그대로 캔버스로 통과한다 — 드래그로 블록 위를 지나가면 그 블록만
// 지워지고, 전부 지우면 그 자리에서 끝난다. 다 못 지워도 durationSec 뒤 자동 종료.
//
// ★ 시야만 가리고 클릭을 안 막는 핵심 트릭: 이 방해의 DOM(.hz-cracked)이
//   pointer-events:none이다(screenshot의 hz-saver와 반대) — 그래서 이 위 어디를
//   눌러도 이벤트가 캔버스(z5)로 그대로 통과해 방해꾼 판정이 평소와 똑같이
//   된다(systems/hazard.js 상단의 pointer-events 규칙 그대로). 문제는 그러면 이
//   DOM 요소 자신은 마우스 이벤트를 하나도 못 받는다는 것 — "드래그로 문질러
//   지운다"를 pointer-events:auto 없이 구현해야 한다. 그래서 이 파일은 window에
//   직접 pointerdown/pointerup만 걸어(캔버스의 기존 클릭 판정과 안 겹친다 —
//   preventDefault도 stopPropagation도 안 하므로 그냥 "지금 눌려있나"만 곁다리로
//   본다) "지금 드래그 중인가"만 추적하고, 실제 위치는 매 프레임 이미 갱신되는
//   state.pointer(systems/input.js가 모든 pointermove에서 채운다)를 그대로 읽는다.
//   좌표 변환을 또 하지 않는다 — 새 장치를 최소로 줄인 결과다.
//
// 블록은 캔버스 2D로 그린다(요구사항) — screensaver(ui/hazards/screensaver.js)와
// 같은 방식(DOM에 <canvas> 하나를 얹고 논리 해상도로 그린다).

import { config } from '../../config.js';
import { registerHazard, dismissHazard } from '../../systems/hazard.js';
import { state } from '../../core/state.js';
import { playSfx, SFX } from '../../systems/sound.js';

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// 손상된 CRT의 색 어긋남을 흉내내는 팔레트 — 이모지/그라데이션 없이 단색 사각형만.
const NOISE_COLORS = ['#000000', '#0a0a0a', '#3a0033', '#00393f', '#1a3a12', '#3a3a3a'];
const NOISE_COLS = 6;
const NOISE_ROWS = 4;

/** 블록 하나 — 화면 안쪽에 잡히게 x/y 범위를 크기만큼 줄인다. */
function spawnBlock(c) {
  const w = rand(c.blockSizeMin, c.blockSizeMax);
  const h = rand(c.blockSizeMin, c.blockSizeMax);
  return {
    x: rand(0, config.canvas.width - w),
    y: rand(0, config.canvas.height - h),
    w, h,
    cells: null, // update()가 flicker 주기마다 채운다
  };
}

/** 블록 하나의 노이즈 무늬를 다시 뽑는다(flickerIntervalSec마다). */
function reflickerBlock(block) {
  const cells = [];
  for (let r = 0; r < NOISE_ROWS; r++) {
    for (let col = 0; col < NOISE_COLS; col++) {
      cells.push(NOISE_COLORS[Math.floor(Math.random() * NOISE_COLORS.length)]);
    }
  }
  block.cells = cells;
}

function drawBlock(ctx, block) {
  const cw = block.w / NOISE_COLS;
  const ch = block.h / NOISE_ROWS;
  for (let r = 0; r < NOISE_ROWS; r++) {
    for (let col = 0; col < NOISE_COLS; col++) {
      ctx.fillStyle = block.cells[r * NOISE_COLS + col];
      // 1px 여유를 남겨 셀 사이가 살짝 갈라져 보이게(완전히 이어붙은 사각형보다
      // "깨진 픽셀" 느낌이 난다).
      ctx.fillRect(block.x + col * cw, block.y + r * ch, Math.ceil(cw) - 1, Math.ceil(ch) - 1);
    }
  }
  // 테두리 — 어디까지가 이 블록인지 눈에 띄게(문질러 지울 대상임을 알려준다).
  ctx.strokeStyle = '#ff2fd8';
  ctx.lineWidth = 2;
  ctx.strokeRect(block.x + 1, block.y + 1, block.w - 2, block.h - 2);
}

function containsPoint(block, x, y) {
  return x >= block.x && x <= block.x + block.w && y >= block.y && y <= block.y + block.h;
}

registerHazard({
  id: 'cracked',
  get minStage() {
    return config.hazard.cracked.minStage;
  },
  get durationSec() {
    return config.hazard.cracked.durationSec;
  },
  dismiss: 'drag',

  mount(inst) {
    const c = config.hazard.cracked;

    const el = document.createElement('div');
    el.className = 'hz-cracked';
    const canvas = document.createElement('canvas');
    canvas.width = config.canvas.width;
    canvas.height = config.canvas.height;
    el.appendChild(canvas);
    inst.el = el;

    inst.data.ctx = canvas.getContext('2d');
    inst.data.blocks = Array.from({ length: randInt(c.blockCountMin, c.blockCountMax) }, () => spawnBlock(c));
    for (const b of inst.data.blocks) reflickerBlock(b);
    inst.data.flickerTimer = c.flickerIntervalSec;
    inst.data.dragging = false;
    // 첫 프레임에 한 번은 반드시 그려야 한다(아래 update의 dirty 검사 참고).
    inst.data.dirty = true;

    // ★ 위 파일 상단 주석 참고 — .hz-cracked 자체는 pointer-events:none이라
    //   이 요소로는 드래그를 못 받는다. window에 직접 걸어 "지금 눌려있나"만
    //   본다(preventDefault/stopPropagation 없음 — 캔버스의 기존 클릭 판정과
    //   완전히 무관하게 곁다리로 동작한다).
    inst.data.onDown = () => { inst.data.dragging = true; };
    inst.data.onUp = () => { inst.data.dragging = false; };
    window.addEventListener('pointerdown', inst.data.onDown);
    window.addEventListener('pointerup', inst.data.onUp);

    // 전용 소리가 없어 화면이 지지직거리며 손상되는 느낌의 기존 소리를 재사용한다.
    playSfx(SFX.OVERLOAD_START);
  },

  update(inst, dt) {
    const c = config.hazard.cracked;
    const blocks = inst.data.blocks;

    // 드래그 중이면 실제 위치(state.pointer, 월드 좌표 — 캔버스와 같은 좌표계라
    // 별도 변환이 필요 없다)가 걸치는 블록을 지운다.
    if (inst.data.dragging && blocks.length) {
      const p = state.pointer;
      const before = blocks.length;
      inst.data.blocks = blocks.filter((b) => !containsPoint(b, p.x, p.y));
      if (inst.data.blocks.length < before) {
        playSfx(SFX.KILL_SOFT); // 문질러 지운 손맛
        inst.data.dirty = true; // 블록이 하나 사라졌다 — 다시 그려야 한다
      }
      if (inst.data.blocks.length === 0) {
        dismissHazard(inst, 'dismissed'); // 전부 지웠다 — 즉시 종료
        return;
      }
    }

    // 노이즈 무늬는 flickerIntervalSec마다만 다시 뽑는다(매 프레임이면 발작
    // 유발 수준으로 어지럽다 — config.hazard.cracked.flickerIntervalSec 주석 참고).
    inst.data.flickerTimer -= dt;
    if (inst.data.flickerTimer <= 0) {
      inst.data.flickerTimer = c.flickerIntervalSec;
      for (const b of inst.data.blocks) reflickerBlock(b);
      inst.data.dirty = true; // 무늬가 바뀌었다 — 다시 그려야 한다
    }

    // ★ 그림이 실제로 바뀐 프레임에만 다시 그린다. 무늬는 위처럼
    //   flickerIntervalSec(0.15초)마다만 바뀌고 블록은 지울 때만 없어지는데,
    //   예전엔 매 프레임 1920×1080 clearRect + 블록당 24개씩(총 70~120개)
    //   fillRect를 다시 돌리고 있었다 — 10프레임 중 9프레임은 똑같은 그림을
    //   다시 그리는 순수한 낭비였다(실측으로 잡았다). 눈에 보이는 결과는 완전히
    //   같다: 바뀔 때는 그 프레임에 바로 다시 그린다.
    if (!inst.data.dirty) return;
    inst.data.dirty = false;

    const ctx = inst.data.ctx;
    ctx.clearRect(0, 0, config.canvas.width, config.canvas.height);
    for (const b of inst.data.blocks) drawBlock(ctx, b);
  },

  onEnd(inst) {
    window.removeEventListener('pointerdown', inst.data.onDown);
    window.removeEventListener('pointerup', inst.data.onUp);
    playSfx(SFX.OVERLOAD_END);
  },

  // ★전조 — 세로선 하나가 잠깐 번쩍했다 사라진다(참조 문서의 crackTelegraph()).
  //   본 효과가 "세로 열 고장"이라 그중 한 줄만 미리 보여주는 축소판이다.
  //   x는 매번 다르게 — 같은 자리면 "저기 온다"를 외워버려 전조가 아니라 예고가 된다.
  telegraph: {
    mount(t) {
      const el = document.createElement('div');
      el.className = 'hz-tele-col';
      const line = document.createElement('i');
      line.style.left = `${8 + Math.random() * 84}%`;
      el.appendChild(line);
      t.el = el;
    },
  },
});
