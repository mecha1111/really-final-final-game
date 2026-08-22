// 이 파일 역할: 방해꾼별 등장 연출(config.entrance)을 "이번 프레임의 오프셋/배율/투명도"로
// 바꾼다. 어떤 종류가 어떻게 등장하는지는 전부 config.entrance 표에 있고, 여기는 그 표를
// 읽어 수치를 계산하는 일만 한다 — 숫자를 직접 들고 있지 않는다.
//
// ★ 여기서 낸 값(entOffX/entOffY/entScaleX/entScaleY)은 그리기만 바꾸는 게 아니라
//   판정까지 같이 움직인다. enemies/Enemy.js의 drawX/drawY/drawW/drawH 게터가 이 값을
//   품고 있고, 그리기(ui/renderEnemies.js)와 판정(enemies/hitbox.js)이 **둘 다 그
//   게터만** 읽는다. 그래서 "보이는 자리와 눌리는 자리가 다른" 상태가 구조적으로
//   생길 수 없다 — 이 프로젝트에서 그 사고가 반복돼서 아예 못 갈라지게 묶어뒀다.
//   (entAlpha/entBlurPx는 위치·크기와 무관해서 그리기에만 쓴다.)
//
// ★ 시간 기준은 enemy.age(초) 하나다. 별도 타이머를 두지 않는다 — 이 프로젝트가
//   setInterval 없이 단일 시계로만 도는 원칙(sprite/animator.js 상단 주석)과 같다.

import { config } from '../config.js';
import { addShake } from '../systems/screenShake.js';

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeOutBack = (t) => {
  const s = 1.7;
  return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
};

/** 연출이 하나도 안 걸린 "완전 무해한" 기본 상태로 되돌린다. */
function reset(enemy) {
  enemy.entOffX = 0;
  enemy.entOffY = 0;
  enemy.entScaleX = 1;
  enemy.entScaleY = 1;
  enemy.entAlpha = 1;
  enemy.entBlurPx = 0;
}

/** 스폰 직후 1회. 이 방해꾼이 어떤 등장 연출을 쓸지 정하고 첫 프레임 값을 채운다. */
export function initEntrance(enemy) {
  reset(enemy);
  const spec = config.entrance[enemy.id];
  enemy.entranceSpec = spec ?? null;
  // 연출이 없는 종류(unplug/bait 등)는 처음부터 끝난 상태 — 매 프레임 아무 일도 안 한다.
  enemy.entranceDone = !spec;
  enemy.entranceLanded = false; // slam/drop이 착지 흔들림을 딱 한 번만 쏘게 하는 빗장
  if (spec) updateEntrance(enemy);
}

/**
 * 매 프레임. 등장 연출이 끝났으면 즉시 return하므로, 살아있는 내내 불려도
 * 끝난 뒤엔 비교 한 줄 값이다.
 */
export function updateEntrance(enemy) {
  // entranceSpec까지 같이 본다 — 연출이 없는 종류(spec=null)인데 어떤 이유로든
  // entranceDone이 false로 되돌려지면 아래에서 null을 벗기다 터진다. 게임이 연출
  // 하나 때문에 죽는 건 말이 안 되므로 여기서 막는다.
  if (enemy.entranceDone || !enemy.entranceSpec) return;

  const spec = enemy.entranceSpec;
  const dur = spec.durSec;
  const t = dur > 0 ? clamp01(enemy.age / dur) : 1;
  const s = enemy.scaleFactor; // 표의 px 값은 기준 해상도(baseWidth) 기준이라 같이 스케일한다

  switch (spec.kind) {
    case 'hop': {
      // 아래에서 튀어올라 자리에 안착. 올라오는 동안 세로로 늘어났다가(stretch)
      // 도착 즈음 납작해졌다(squash) 돌아온다.
      const e = easeOutBack(t);
      enemy.entOffY = spec.risePx * s * (1 - e);
      // t가 0.6을 넘어서면서 스쿼시가 들어갔다 빠진다(sin 한 봉우리)
      const sq = t > 0.6 ? Math.sin(((t - 0.6) / 0.4) * Math.PI) : 0;
      enemy.entScaleX = 1 + spec.squash * sq;
      enemy.entScaleY = 1 - spec.squash * sq;
      break;
    }

    case 'slam': {
      // 위에서 가속하며 떨어진다(제곱 = 중력 느낌). 착지 순간 화면을 한 번 흔든다.
      enemy.entOffY = -spec.dropPx * s * (1 - t) ** 2;
      if (!enemy.entranceLanded && t >= 1) {
        enemy.entranceLanded = true;
        addShake(spec.landShakePx * s, spec.landShakeMs);
      }
      // 착지 직후 살짝 납작해졌다 펴진다
      const sq = t > 0.85 ? Math.sin(((t - 0.85) / 0.15) * Math.PI) : 0;
      enemy.entScaleX = 1 + 0.18 * sq;
      enemy.entScaleY = 1 - 0.18 * sq;
      break;
    }

    case 'pop': {
      // 뿅 — from에서 overshoot까지 넘쳤다가 1로 정착
      const e = easeOutBack(t);
      const scale = spec.from + (1 - spec.from) * e * (1 + (spec.overshoot - 1) * (1 - t));
      enemy.entScaleX = scale;
      enemy.entScaleY = scale;
      break;
    }

    case 'window': {
      // 창 열림 — 먼저 가로로 쫙(xPhase까지), 그다음 세로로 열린다.
      const xp = spec.xPhase;
      enemy.entScaleX = easeOutCubic(clamp01(t / xp));
      enemy.entScaleY = t <= xp ? 0.04 : easeOutCubic((t - xp) / (1 - xp));
      break;
    }

    case 'drop': {
      // 투하 후 한 번 통통. t<1 구간을 낙하와 바운스로 나눈다.
      const hit = 1 - spec.bounce; // 이 시점에 바닥에 닿는다
      if (t < hit) {
        enemy.entOffY = -spec.dropPx * s * (1 - t / hit) ** 2;
      } else {
        // 튀어올랐다 다시 내려오는 반원 — 낙하 높이의 일부만큼만 튄다
        const bt = (t - hit) / spec.bounce;
        enemy.entOffY = -spec.dropPx * s * 0.16 * Math.sin(bt * Math.PI);
        if (!enemy.entranceLanded) {
          enemy.entranceLanded = true;
          addShake(spec.dropPx * s * 0.02, 180);
        }
      }
      break;
    }

    case 'fade': {
      // 시스템 알림처럼 살짝 떠오르며 스윽 나타난다
      enemy.entAlpha = easeOutCubic(t);
      enemy.entOffY = spec.risePx * s * (1 - easeOutCubic(t));
      break;
    }

    case 'print': {
      // 인쇄되듯 위아래로 지지직 떨면서 나타난다. 떨림은 끝날수록 잦아든다.
      enemy.entAlpha = clamp01(t * 1.4);
      enemy.entOffY = spec.jitterPx * s * (1 - t) * Math.sin(2 * Math.PI * spec.jitterHz * enemy.age);
      break;
    }

    case 'blurIn': {
      // 위장한 놈 — 흐릿하게 있다가 아주 천천히 또렷해진다
      enemy.entBlurPx = spec.blurPx * s * (1 - easeOutCubic(t));
      enemy.entAlpha = 0.35 + 0.65 * t;
      break;
    }

    default:
      break;
  }

  if (t >= 1) {
    // 끝나는 순간 잔여값을 확실히 0/1로 되돌린다 — 부동소수 찌꺼기가 남으면
    // 판정 사각형이 아주 미세하게 어긋난 채로 평생 간다.
    reset(enemy);
    enemy.entranceDone = true;
  }
}
