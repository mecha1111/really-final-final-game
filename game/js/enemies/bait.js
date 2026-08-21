// 이 파일 역할: bait(시선 강탈) 전용 상태기계 — 모서리 등장, 슬라이드 인/아웃, 화질 복구 타이밍.
// 다른 방해꾼의 이동 로직(behaviors.js)과 완전히 분리되어 있고, 그리기는 ui/baitRender.js가 맡는다.

import { config } from '../config.js';

const rand = (min, max) => min + Math.random() * (max - min);
const easeOut = (t) => 1 - (1 - t) ** 3;

/**
 * 스폰 시 1회. 네 모서리(0=좌상 1=우상 2=좌하 3=우하) 중 하나를 골라
 * "쉴 자리"(화면 안쪽)와 "시작/퇴장 자리"(화면 밖)를 정하고, lifetime을
 * 슬라이드인/화질복구/정지/슬라이드아웃 네 구간으로 나눈다.
 */
export function initBait(enemy, playArea) {
  const corner = Math.floor(rand(0, 4));
  enemy.baitCorner = corner;
  // 어떤 그림(a/b)으로 나올지는 Enemy 생성자가 이미 enemy.abVariant에 정해뒀다.

  const s = enemy.scaleFactor;
  const insetX = config.bait.insetX * s;
  const insetY = config.bait.insetY * s;
  const halfW = enemy.w / 2;
  const halfH = enemy.h / 2;

  const left = corner === 0 || corner === 2;
  const top = corner === 0 || corner === 1;

  enemy.baitRestX = left ? playArea.x + insetX : playArea.x + playArea.w - insetX;
  enemy.baitRestY = top ? playArea.y + insetY : playArea.y + playArea.h - insetY;
  enemy.baitOffX = left ? playArea.x - halfW : playArea.x + playArea.w + halfW;
  enemy.baitOffY = top ? playArea.y - halfH : playArea.y + playArea.h + halfH;

  enemy.x = enemy.baitOffX;
  enemy.y = enemy.baitOffY;
  enemy.baitRevealRatio = 0;

  // 생애주기 구간(초). lifetime이 너무 짧아도(디버그로 수명 배율을 확 줄이는 등)
  // 뒤에서부터 순서대로 눌러 담아 항상 enterEnd <= revealEnd <= exitStart <= lifetime을 지킨다.
  const slide = config.bait.slideSec;
  const enterEnd = Math.min(slide, enemy.lifetime);
  const revealEnd = Math.min(enterEnd + config.bait.revealSec, enemy.lifetime);
  const exitStart = Math.max(revealEnd, enemy.lifetime - slide);
  enemy.baitPhases = { enterEnd, revealEnd, exitStart };
}

/** 매 프레임. bait는 물리 이동을 전혀 안 하고 이 상태기계로만 위치/화질을 정한다. */
export function updateBait(enemy) {
  const { enterEnd, revealEnd, exitStart } = enemy.baitPhases;
  const age = enemy.age;

  if (age < enterEnd) {
    // 모서리 밖에서 쉴 자리까지 슥 들어온다
    const t = enterEnd > 0 ? easeOut(age / enterEnd) : 1;
    enemy.x = enemy.baitOffX + (enemy.baitRestX - enemy.baitOffX) * t;
    enemy.y = enemy.baitOffY + (enemy.baitRestY - enemy.baitOffY) * t;
    enemy.baitRevealRatio = 0;
  } else if (age < revealEnd) {
    // 자리 고정, 위→아래로 천천히 화질 복구
    enemy.x = enemy.baitRestX;
    enemy.y = enemy.baitRestY;
    const span = revealEnd - enterEnd;
    enemy.baitRevealRatio = span > 0 ? (age - enterEnd) / span : 1;
  } else if (age < exitStart) {
    // 화질 복구 완료, 그대로 정지
    enemy.x = enemy.baitRestX;
    enemy.y = enemy.baitRestY;
    enemy.baitRevealRatio = 1;
  } else {
    // 왔던 모서리 방향으로 슥 빠져나간다
    const span = enemy.lifetime - exitStart;
    const t = span > 0 ? easeOut((age - exitStart) / span) : 1;
    enemy.x = enemy.baitRestX + (enemy.baitOffX - enemy.baitRestX) * t;
    enemy.y = enemy.baitRestY + (enemy.baitOffY - enemy.baitRestY) * t;
    enemy.baitRevealRatio = 1;
  }
}
