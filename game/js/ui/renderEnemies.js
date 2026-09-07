// 이 파일 역할: 방해꾼 본체·게이지, 가짜 커서, 뜬 글씨을 그린다. render.js는 조립만 하고 세부는 여기서 맡는다.

import { config } from '../config.js';
import { state } from '../core/state.js';
import { enemyImages } from '../assets.js';
import { cssColor, roundRect, text, outlinedText, quantizeStep } from './draw.js';
import { drawBaitEnemy } from './baitRender.js';
import { getFrameKey } from '../sprite/animator.js';
import { comboTier } from '../systems/combo.js';

export function drawEnemy(ctx, e, showHitbox, now) {
  if (e.isBait) {
    // bait는 예비동작/흔들림 등 다른 연출과 안 섞이는 완전 별개 연출이다
    // (모서리 고정 + 저화질→고화질 복구). 히트박스도 없어서 그릴 게 없다.
    drawBaitEnemy(ctx, e, now);
    return;
  }

  // 지금 보여줄 프레임(순환 애니/체력 단계/분열 tier 등)은 전부 sprite/animator.js가 정한다.
  const img = enemyImages[getFrameKey(e, now)];

  // 세 가지 순간 연출이 겹칠 수 있다: 클릭 맞음(flash) / 곧 공격(telegraph) / 오클릭(shake)
  const flashRatio = e.hitFlash / config.enemy.hitFlashSec;
  const telegraph = e.atkTelegraphRatio;
  const shakeRatio = e.shakeTimer / config.enemy.bodyShakeSec;

  // ★ 등장 연출이 반영된 drawW/drawH/drawX/drawY에서 출발한다 — 판정(enemies/hitbox.js)도
  //   같은 게터를 읽으므로 연출 중에 그림과 히트박스가 갈라지지 않는다.
  //   punch/telegraph 흔들림은 그 위에 얹는 아주 짧은 순간 연출이라 예전처럼 그리기에만 건다.
  // 처치 팝 — 클릭으로 잡았을 때만. 스프라이트가 확 부풀면서 옅어진다.
  // 배율은 짧고 날카롭게(popSec), 투명도는 시체가 남는 시간 전체에 걸쳐 옅어진다
  // (basic은 죽음 프레임을 더 오래 보여줘야 해서 둘의 길이가 다르다).
  let killScale = 1;
  let killAlpha = 1;
  let whiteFlash = false;
  if (!e.alive && e.deathReason === 'clicked') {
    const k = config.enemy.kill;
    const pop = k.popSec > 0 ? Math.min(1, e.deathAge / k.popSec) : 1;
    killScale = 1 + (k.popScale - 1) * pop;
    killAlpha = e.corpseTotal > 0 ? Math.max(0, e.corpseTimer / e.corpseTotal) : 1;
    whiteFlash = e.deathAge < k.whiteFlashSec;
  }

  // zombie 부활 직후 반투명→불투명 페이드(entAlpha/killAlpha와는 별개 채널 —
  // 등장 연출은 이미 끝났고 죽는 중도 아니라 그 둘은 항상 1이다).
  let reviveAlpha = 1;
  if (e.reviveFadeTimer > 0) {
    const c = config.enemy.zombie;
    const t = c.reviveFadeSec > 0 ? 1 - e.reviveFadeTimer / c.reviveFadeSec : 1;
    reviveAlpha = c.reviveStartAlpha + (1 - c.reviveStartAlpha) * t;
  }

  const punch = 1 + config.enemy.hitPunch * flashRatio + config.enemy.atkTelegraphPunch * telegraph;
  const w = e.drawW * punch * killScale;
  const h = e.drawH * punch * killScale;

  const shakeX =
    shakeRatio > 0 ? Math.sin(shakeRatio * Math.PI * 6) * config.enemy.bodyShakeAmount * shakeRatio : 0;
  const telegraphX = telegraph > 0 ? Math.sin(e.age * 40) * config.enemy.atkTelegraphShake * telegraph : 0;
  const telegraphY = telegraph > 0 ? Math.cos(e.age * 47) * config.enemy.atkTelegraphShake * telegraph : 0;

  const x = e.drawX + shakeX + telegraphX - w / 2;
  const y = e.drawY + telegraphY - h / 2;

  ctx.save();
  // 등장 연출의 투명도/블러(fade·print·blurIn)와 처치 팝의 투명도, zombie 부활
  // 페이드를 전부 곱해서 건다. 해당 없는 연출은 항상 1이라 무해하다.
  const alpha = Math.max(0, e.entAlpha) * killAlpha * reviveAlpha;
  if (alpha < 1) ctx.globalAlpha = alpha;
  const blur = e.entBlurPx > 0.1 ? `blur(${e.entBlurPx.toFixed(2)}px)` : '';
  if (whiteFlash) {
    // 죽은 첫 1~2프레임만 새하얀 실루엣으로. brightness(0)으로 색을 다 죽인 뒤
    // invert로 흰색을 만든다 — 알파(모양)는 그대로 살아있어서 실루엣이 유지된다.
    ctx.filter = `${blur} brightness(0) invert(1)`.trim();
  } else if (flashRatio > 0) ctx.filter = `${blur} brightness(${1 + 1.6 * flashRatio})`.trim();
  else if (telegraph > 0) ctx.filter = `${blur} brightness(${1 + 0.5 * telegraph})`.trim();
  else if (blur) ctx.filter = blur;

  if (img) {
    ctx.drawImage(img, x, y, w, h);
  } else {
    // PNG를 못 읽었을 때의 대체 표시
    ctx.fillStyle = cssColor('--color-enemy-fallback');
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.filter = 'none';
    text(ctx, e.id, e.drawX, e.drawY, { size: 12, align: 'center', baseline: 'middle' });
  }
  ctx.restore();

  // 죽어서 잠깐 corpseTimer만큼 남아있는 동안(basic dead 프레임)은 게이지를 안 그린다 —
  // 이미 죽은 놈의 수명 바/hp 점이 잠깐 더 보이면 헷갈린다.
  if (e.alive) drawEnemyGauges(ctx, e);

  // popup X 버튼 찾기 힌트 — 살아있는 popup에만, 판 전체 몸통 오클릭 누적이
  // threshold에 닿았을 때만(아래 함수가 직접 그 조건을 본다).
  if (e.alive && e.closeButton) drawPopupHintOutline(ctx, e, now);

  // ★ 예전엔 여기서 "정지시킨 게 이놈이다" 빨간 대시 테두리(drawBlockHighlight)를
  //   그렸다. 없앤 이유: A타입은 살아있는 내내 isBlocking이라 그 테두리가 "잠깐
  //   뜨는 강조"가 아니라 사실상 상시 표시였다 — 화면만 지저분해지고 정작
  //   "지금 막혔다"는 업로드 창의 정지 배지(ui/statusWindow.js)가 이미 더 크고
  //   명확하게 알려준다. 원인 방해꾼도 그 배지에 이름으로 같이 뜬다(blockedBy).

  if (showHitbox) {
    // popup류는 X 버튼이 실제 판정이므로 그걸 보여준다
    const r = e.closeButton ? e.closeButtonRect() : e.hitRect();
    if (r) {
      ctx.strokeStyle = cssColor('--color-hitbox');
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
    }
  }
}

/** 남은 수명 바 + 남은 클릭 수(hp) 점 */
function drawEnemyGauges(ctx, e) {
  const barH = config.enemy.lifeBarH;
  const life = e.lifeRatio();

  if (barH > 0) {
    // 게이지도 그림을 따라가야 한다 — 등장 연출로 스프라이트가 움직이는데 바만
    // 논리 위치에 남아 있으면 따로 떠 있는 것처럼 보인다(draw* 는 연출 반영값).
    const w = Math.max(e.drawW * 0.7, 40);
    const x = e.drawX - w / 2;
    const y = e.drawY + e.drawH / 2 + 4;

    // 수명이 끝날 때 벌칙이 있거나(bomb, hidden) 커서를 노리는 놈(copier)은
    // 빨갛게 — 우선순위 판단용
    const danger = e.hasExpiryPenalty;
    const blink = danger && life < 0.35 && Math.floor(e.age * 8) % 2 === 0;

    ctx.fillStyle = cssColor('--color-bar-bg');
    ctx.fillRect(x, y, w, barH);
    ctx.fillStyle = cssColor(danger || blink ? '--color-life-bar-danger' : '--color-life-bar');
    ctx.fillRect(x, y, w * life, barH);
  }

  // hp가 2 이상인 놈만 남은 클릭 수를 점으로 보여준다
  if (e.maxHp > 1) {
    const dot = 6;
    const gap = 4;
    const total = e.maxHp * dot + (e.maxHp - 1) * gap;
    let px = e.drawX - total / 2;
    const py = e.drawY - e.drawH / 2 - 10;

    for (let i = 0; i < e.maxHp; i++) {
      ctx.fillStyle = cssColor(i < e.hp ? '--color-hp-pip' : '--color-hp-pip-empty');
      ctx.beginPath();
      ctx.arc(px + dot / 2, py, dot / 2, 0, Math.PI * 2);
      ctx.fill();
      px += dot + gap;
    }
  }
}

/**
 * popup의 X 버튼(닫기 판정) 찾기 힌트 — 테두리만 그린다, 내부는 절대 안 칠한다
 * (원본 손그림 X가 그대로 보여야 한다는 요구사항). 사각형은 closeButtonRect() —
 * 클릭 판정과 정확히 같은 값이라 "보이는 자리와 눌리는 자리"가 구조적으로
 * 갈릴 수 없다(이 프로젝트의 반복 원칙, config.enemy.artHitbox 주석과 같은 이유).
 * ★ 이전엔(2026-08~09) 그림 위에 가짜 버튼을 통째로 덧그리는 방식이었는데 아트
 * 리소스가 바뀔 때마다 충돌해서 걷어냈다 — 이번엔 그리기 자체가 훨씬 가볍고
 * (스트로크 한 번), 그림을 전혀 가리지 않아 리소스 교체와 안 부딪힌다.
 */
function drawPopupHintOutline(ctx, e, now) {
  const c = config.popupHintOutline;
  if (!c.enabled || state.popupBodyMisses < c.threshold) return;

  const r = e.closeButtonRect();
  if (!r) return;

  // 0.5~1.0(minOpacity~maxOpacity) 사이를 코사인으로 매끄럽게 오간다 — 갑자기
  // 튀지 않고 XP 포커스 표시 특유의 "은은한 점멸" 느낌을 낸다.
  const cycleMs = c.blinkPeriodSec * 1000;
  const cycle = cycleMs > 0 ? (now % cycleMs) / cycleMs : 0;
  const pulseT = 0.5 - 0.5 * Math.cos(cycle * Math.PI * 2);
  const alpha = c.minOpacity + (c.maxOpacity - c.minOpacity) * pulseT;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = c.color;
  ctx.lineWidth = c.strokeWidth;
  // 다른 디버그 사각형(ui/render.js의 H키 오버레이)과 같은 관례 — +0.5로 스트로크가
  // 반픽셀 어긋나 흐려지는 걸 막는다.
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
  ctx.restore();
}

/**
 * 처치 순간 사방으로 튀는 조각들(systems/juice.js가 관리하는 state.particles).
 * 손그림/픽셀 톤에 맞춰 원이 아니라 회전하는 네모 조각으로 그린다.
 */
/** 조각 하나를 그 모양(square/triangle)대로 채운다. 좌표계는 이미
 * translate/rotate된 상태로 들어온다(중심이 원점) — 여기선 크기만 안다. */
function fillParticleShape(ctx, shape, s) {
  switch (shape) {
    case 'triangle': // 작은 도형
      ctx.beginPath();
      ctx.moveTo(0, -s / 2);
      ctx.lineTo(s / 2, s / 2);
      ctx.lineTo(-s / 2, s / 2);
      ctx.closePath();
      ctx.fill();
      break;
    default: // 'square' — 종이 조각
      ctx.fillRect(-s / 2, -s / 2, s, s);
  }
}

/** 처치 파편(잉크 방울/종이 조각/세모, systems/juice.js가 만든다). 방해꾼 종류색이
 * 살짝 섞여 있으면(p.color) 그 색, 아니면 기본 잉크색 — 매 파티클마다 결정돼 있어
 * 여기선 그냥 읽기만 한다(config.enemy.kill.particleColorMix). */
export function drawKillParticles(ctx, particles) {
  if (!particles || particles.length === 0) return;

  ctx.save();
  const baseColor = cssColor('--color-kill-particle');
  for (const p of particles) {
    // 수명이 다할수록 옅어지고 작아진다 — 딱 끊기지 않고 사그라들게.
    const t = p.maxLife > 0 ? Math.max(0, p.life / p.maxLife) : 0;
    ctx.globalAlpha = quantizeStep(Math.min(1, t * 1.6), config.fx.alphaSteps);
    ctx.fillStyle = p.color || baseColor;
    const s = p.size * (0.35 + 0.65 * t);
    ctx.save();
    // ★ 좌표·크기·회전을 전부 정수/직각으로 반올림 — 손그림 펜선 톤은 안티에일리어싱으로
    // 가장자리가 흐려지면 안 된다. 회전은 물리(juice.js가 연속으로 갱신)는 그대로 두고
    // 그리는 각만 가장 가까운 90도로 스냅한다 — square가 45도 근처(마름모)로 그려질 때
    // 생기는 대각선 안티에일리어싱이 사라진다.
    ctx.translate(Math.round(p.x), Math.round(p.y));
    ctx.rotate(Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2));
    fillParticleShape(ctx, p.shape, Math.round(s));
    ctx.restore();
  }
  ctx.restore();
}

/** 클릭 리플(systems/clickRipple.js) — 눌린 자리에서 커지며 옅어지는 테두리.
 * 채워진 도형이 아니라 테두리만 그려서 처치 파편과 겹쳐도 화면이 안 빽빽해 보인다.
 * 2026-09-07: 원형 링(arc) → 각진 사각 테두리(strokeRect)로 바꿨다 — 낙서
 * 방해꾼 톤에 원보다 각진 모양이 맞고, 곡선이 없어 안티에일리어싱도 덜 생긴다. */
export function drawClickRipples(ctx, ripples) {
  if (!ripples || ripples.length === 0) return;
  const c = config.fx.clickRipple;

  ctx.save();
  ctx.lineWidth = c.lineWidth;
  for (const r of ripples) {
    const t = r.maxLife > 0 ? 1 - Math.max(0, r.life) / r.maxLife : 1; // 0(막 생김)→1(다 됨)
    // 확대도 알파와 같은 이유로 계단식으로 끊는다(연속 확대는 매끄러워서
    // 손그림 톤과 안 맞는다) — sizeSteps는 alphaSteps와 별도 값이라 따로 조절된다.
    const radius = c.startRadius + (c.endRadius - c.startRadius) * quantizeStep(t, c.sizeSteps);
    ctx.globalAlpha = quantizeStep(1 - t, config.fx.alphaSteps) * c.maxAlpha;
    ctx.strokeStyle = r.color;
    const half = Math.round(radius);
    ctx.strokeRect(Math.round(r.x) - half, Math.round(r.y) - half, half * 2, half * 2);
  }
  ctx.restore();
}

/**
 * 가짜 커서와 위장한 진짜 커서는 반드시 같은 모양이어야 한다(구분 불가가 핵심) —
 * 그래서 이 함수 하나만 부르면 어느 쪽이든 항상 같은 그림이 나온다.
 * assets/enemies/cursor/cursor.png(손그림 낙서체 커서)를 쓰고, 못 읽었을 때만
 * 예전 벡터 그림으로 대신한다(이미지 하나 없다고 안 보이면 더 이상하다).
 */
export function drawCursorGlyph(ctx, x, y) {
  const cc = config.cursor;
  const img = enemyImages['cursor/cursor'];

  if (img) {
    const w = cc.spriteSize;
    const h = (img.height / img.width) * w;
    ctx.drawImage(img, x - w * cc.hotspotXRatio, y - h * cc.hotspotYRatio, w, h);
    return;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1.4, 1.4);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 17);
  ctx.lineTo(4.5, 13);
  ctx.lineTo(7, 19);
  ctx.lineTo(10, 17.5);
  ctx.lineTo(7.5, 12);
  ctx.lineTo(13, 11.5);
  ctx.closePath();
  ctx.fillStyle = cssColor('--color-cursor-fake');
  ctx.fill();
  ctx.strokeStyle = cssColor('--color-cursor-fake-outline');
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/**
 * 디버그 전용(H키). systems/input.js가 계산한 "클릭의 월드 좌표"에 십자선을 찍는다.
 * 화면에서 누른 자리 위에 십자선이 정확히 얹히면 좌표 변환이 맞는 것이고,
 * 한쪽으로 밀려 있으면 그 방향·거리가 그대로 오차다 — 히트박스 사각형과 겹쳐 보면
 * "판정이 왜 안 맞는지"를 숫자 없이 한 번에 알 수 있다.
 * 가장 최근 클릭만 진하게, 이전 것들은 옅게 그려서 흐름도 보이게 한다.
 */
export function drawClickMarkers(ctx, clicks, now) {
  if (!clicks || clicks.length === 0) return;

  // ★ 방금 찍은 것만 보여준다. 마커는 월드 좌표라 창 크기가 바뀌면 같은 월드 자리가
  //   다른 화면 자리에 다시 그려지는데, 그걸 지금 커서와 견주면 "판정이 밀린다"로
  //   오해하게 된다(core/state.js 주석 참고). 오래된 건 아예 안 그려서 그 함정을 막는다.
  const fresh = clicks.filter((c) => now - c.t <= config.enemy.debugClickTtlMs);
  if (fresh.length === 0) return;

  const R = 14;
  ctx.save();
  ctx.lineWidth = 1.5;
  fresh.forEach((c, i) => {
    const newest = i === fresh.length - 1;
    // 시간이 지날수록 옅어져서 "언제 찍힌 것인지"가 눈에 보인다.
    const age = (now - c.t) / config.enemy.debugClickTtlMs;
    ctx.globalAlpha = (newest ? 1 : 0.3) * (1 - age * 0.8);
    ctx.strokeStyle = cssColor(newest ? '--color-danger' : '--color-hitbox');
    ctx.beginPath();
    ctx.moveTo(c.x - R, c.y);
    ctx.lineTo(c.x + R, c.y);
    ctx.moveTo(c.x, c.y - R);
    ctx.lineTo(c.x, c.y + R);
    ctx.stroke();
    if (newest) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  ctx.restore();

  drawClickEnv(ctx, fresh[fresh.length - 1]);
}

/**
 * 디버그 전용(H키). 마지막 클릭 때의 "화면 배율에 관여하는 값"들을 화면 왼쪽 위에
 * 글씨로 찍는다. 십자선이 커서에서 벗어날 때 어느 변수가 튀었는지 스크린샷 한 장으로
 * 알 수 있게 하려는 것이다.
 *
 * 왜 이렇게까지 하나: 화면 배율은 한 겹이 아니다 — CSS zoom(#desktop), 브라우저
 * 페이지줌(Cmd +/-, devicePixelRatio에 반영), 트랙패드 핀치줌(visualViewport)이
 * 겹칠 수 있고, 그중 어느 것이 getBoundingClientRect()에 반영되고 어느 것이 안 되는지가
 * 브라우저·버전마다 다르다(크롬은 128 언저리에서 zoom 처리가 바뀌었다). 변환식이
 * 맞는지는 이 값들을 실제 환경에서 같이 봐야 판단할 수 있다.
 *
 * 읽는 법: rect의 폭이 "화면에 실제 보이는 캔버스 CSS 폭"이고, 여기에 zoom·페이지줌이
 * 이미 반영돼 있어야 정상이다. vv(visualViewport) scale이 1이 아니면 핀치줌 상태다.
 * 십자선이 밀렸는데 vv scale이 1이 아니라면 그게 유력한 원인이다.
 */
function drawClickEnv(ctx, c) {
  if (!c?.env) return;
  const e = c.env;

  // 왕복 오차 = 화면→월드→화면. 두 방향이 같은 기하값을 쓰므로 정상이면 0이다.
  // 0이 아니면 변환 쌍이 깨진 것이고, 이 숫자가 곧 십자선이 커서에서 벗어난 거리다.
  const rt = e.roundTrip ? Math.max(Math.abs(e.roundTrip[0]), Math.abs(e.roundTrip[1])) : 0;
  // rect는 판정에 안 쓴다(진단용). disp와 갈리면 이 브라우저의 rect가 zoom을
  // 안 반영한다는 뜻 — 갈려도 좌표는 맞다. 예전엔 이걸 후보로 투표에 넣었다가
  // 틀린 후보가 이기는 일이 있었다.
  const rectW = e.rect ? e.rect[0] : null;
  const dispW = e.disp ? e.disp[0] : null;
  const rectSplit = rectW != null && dispW != null && Math.abs(rectW - dispW) > 3;

  const lines = [
    `client ${e.client[0]},${e.client[1]}  →  world ${Math.round(c.x)},${Math.round(c.y)}`,
    `왕복오차 ${e.roundTrip ? e.roundTrip.join(',') : '-'}px ${rt > 2 ? '★ 변환 쌍이 깨짐' : '(정상 — 십자선이 커서에 얹힘)'}`,
    `disp ${e.disp ? e.disp.join('x') : '-'} @${e.origin ? e.origin.join(',') : '-'}  = box × zoom누적 ${e.zoomChain ?? '-'}`,
    `rect ${e.rect ? e.rect.join('x') : '-'} ${rectSplit ? '★ disp와 갈림 = 이 크롬의 rect는 zoom 미반영(판정엔 안 씀)' : '(disp와 일치)'}`,
    `box ${e.box[0]}x${e.box[1]}   backing ${e.backing[0]}x${e.backing[1]}   cfg ${e.cfg[0]}x${e.cfg[1]}`,
    `w2b ${e.w2b}  zoom ${e.zoom}  dpr ${e.dpr}  vv ${e.vv ? e.vv[0] : '-'}`,
  ];

  const size = 11;
  const pad = 6;
  const lineH = size + 4;
  const w = 470;
  const h = lines.length * lineH + pad * 2;

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = cssColor('--color-debug-bg');
  ctx.fillRect(6, 6, w, h);
  ctx.strokeStyle = cssColor('--color-hitbox');
  ctx.lineWidth = 1;
  ctx.strokeRect(6.5, 6.5, w, h);
  ctx.globalAlpha = 1;
  lines.forEach((ln, i) => {
    text(ctx, ln, 6 + pad, 6 + pad + lineH * (i + 0.8), { size, color: '--color-debug-text' });
  });
  ctx.restore();
}

/**
 * 콤보 카운터 — 화면에 고정하지 않고 커서 바로 위를 따라다닌다(요구사항).
 * config.combo.showFrom(2) 미만이면 아예 안 그린다 — "COMBO x0"·"x1" 같은
 * 무의미한 표시는 절대 안 뜬다. comboTier()가 config.combo.tiers에서 지금
 * 콤보의 계단을 찾아 크기/색을 주므로, 오를수록 커지고 뜨거운 색(노랑→주황→
 * 짙은주황→빨강)으로 옮겨간다 — MB 배율이 갈리는 기준과 완전히 같은 표라 "몇
 * 콤보부터 강해지나"가 절대 어긋나지 않는다. 색만으로는 배경(하늘/잔디/사진)에
 * 따라 인접 tier가 뭉칠 수 있어 크기 간격도 함께 벌려뒀다(config.combo.tiers
 * 주석 참고) — 배경과 무관한 크기가 최종 구분선이다.
 * 잡을 때마다 comboPopMs(systems/combo.js의 registerKill)가 켜지고 여기서
 * 그 값을 스케일로 바꿔 살짝 부풀었다 가라앉는 "팝"을 낸다.
 * 2026-09-07: 외곽선을 lineJoin:'miter'로 — 플로트(drawFloats)에 이미 적용한
 * 것과 같은 이유(둥근 이음매가 손그림 낙서 톤과 안 어울리게 "말랑"하다). ★두께
 * (strokeWidth 3/4)는 그대로 뒀다 — 시인성을 담당하는 값이라 줄이면 안 된다.
 * miterLimit도 플로트와 같은 8 — 기본값 2는 대부분의 모서리를 베벨로 깎아
 * 각짐이 실제로 안 보인다(draw.js의 outlinedText 주석 참고).
 */
export function drawCombo(ctx, state) {
  if (state.combo < config.combo.showFrom) return;

  const tier = comboTier(state.combo);
  const popT = config.combo.popMs > 0 ? state.comboPopMs / config.combo.popMs : 0;
  const popScale = 1 + 0.25 * popT; // 막 오른 순간 1.25배로 부풀었다 다음 프레임들에 걸쳐 1로 가라앉는다

  ctx.save();
  ctx.translate(state.pointer.x, state.pointer.y - config.combo.followOffsetY);
  ctx.scale(popScale, popScale);
  outlinedText(ctx, 'COMBO', 0, -tier.size * 0.72, {
    size: Math.round(tier.size * 0.42),
    color: tier.color,
    strokeWidth: 3,
    lineJoin: 'miter',
    miterLimit: 8,
  });
  outlinedText(ctx, `x${state.combo}`, 0, 0, {
    size: tier.size,
    color: tier.color,
    strokeWidth: 4,
    lineJoin: 'miter',
    miterLimit: 8,
  });
  ctx.restore();
}

/** "+60MB" / "-10%" 처럼 위로 떠오르며 사라지는 글씨.
 * ★ DGM(픽셀폰트) + 외곽선(outlinedText) — 밝은 XP 배경이나 화질복구된 그림
 * 위에서도 잘 읽히게(요구사항: 폰트 통일 + 시인성). 색 의미(손실 빨강/획득
 * 초록)는 그대로 --color-float-plus/minus를 그대로 넘겨 유지한다.
 * 2026-09-07: 외곽선을 얇고 각지게(strokeWidth 3 + lineJoin:'miter') 바꿨다 —
 * 기존 기본값(4 + round)은 손그림 낙서 방해꾼 톤과 안 어울리게 말랑해 보였다.
 * 콤보 카운터(drawCombo)는 이 옵션을 안 넘기므로 outlinedText 기본값(round)을
 * 그대로 쓴다 — 이번 변경은 플로트 글씨에만 닿는다. */
export function drawFloats(ctx, floats) {
  for (const f of floats) {
    const t = f.age / config.fx.floatSec;
    ctx.save();
    ctx.globalAlpha = quantizeStep(1 - t, config.fx.alphaSteps);
    outlinedText(ctx, f.text, f.x, f.y - config.fx.floatRise * t, {
      size: 22,
      color: f.positive ? '--color-float-plus' : '--color-float-minus',
      strokeWidth: 3,
      lineJoin: 'miter',
      miterLimit: 8, // round보다 각지게 보이려면 miterLimit을 넉넉히 줘야 실제로 뾰족한 모서리가 나온다(기본 2는 대부분 베벨로 깎인다)
    });
    ctx.restore();
  }
}
