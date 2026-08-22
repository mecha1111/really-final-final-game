// 이 파일 역할: 방해꾼 한 마리의 상태와 판정(히트박스/클릭/수명). 이동은 behaviors.js, 그리기는 ui가 맡는다.

import { config, getScaleFactor, parseSpecialEffect } from '../config.js';
import { PATTERN_KIND, initMovement, moveEnemy, bounceInside } from './behaviors.js';
import { hitRect, bodyRect, closeButtonRect, artRect, rectContains, inflateToMin } from './hitbox.js';
import { pickBasicVariant, pickAbVariant, FRAME_SETS } from '../sprite/animator.js';

export class Enemy {
  /**
   * @param {object} spec enemies 시트의 한 행
   * @param {object} opts { x, y, rules, playArea, scale, tier, pointer }
   *   scale/tier는 clone 분열처럼 원본보다 작게 만들 때만 쓴다.
   *   pointer는 copier(homing)가 커서 근처에 스폰되기 위해서만 쓴다.
   */
  constructor(spec, opts) {
    const { x, y, rules, playArea, scale = 1, tier = 0, pointer } = opts;

    this.spec = spec;
    this.id = spec.id;
    this.effect = parseSpecialEffect(spec);
    this.scale = scale;
    this.tier = tier;

    // 시트의 size_w/hit_w/speed는 전부 기준 해상도(config.canvas.baseWidth)
    // 기준으로 짠 숫자다. 실제 캔버스가 더 크거나 작으면 이 비율만큼 같이
    // 키우거나 줄여서, 해상도를 바꿔도 화면에서 차지하는 비율이 똑같아 보이게 한다.
    this.scaleFactor = getScaleFactor();

    // 보이는 크기 (PNG를 이 크기로 그린다)
    this.w = (spec.size_w || 60) * scale * this.scaleFactor;
    this.h = (spec.size_h || 60) * scale * this.scaleFactor;

    // 클릭 판정 크기. 시트의 hit_w/hit_h를 그대로 쓴다 — 이미 그림보다
    // hitbox_padding 만큼 크게 잡혀 있으므로 여기서 또 더하지 않는다.
    // 다만 min_hitbox보다 작아지면(분열 조각 등) 맞추기가 급격히 어려워져 바닥을 깐다
    // (min_hitbox도 기준 해상도 값이라 같이 스케일한다).
    // hit이 0이면 "판정 자체가 없음"이라는 뜻이다(bait) — 바닥값을 적용하지 않는다.
    this.hasHitbox = (spec.hit_w || 0) > 0 && (spec.hit_h || 0) > 0;
    // hitRect()의 그림 기준 경로에서도 같은 바닥을 써야 해서 값을 남겨둔다.
    this.minHitbox = rules.minHitbox * this.scaleFactor;
    this.hitW = this.hasHitbox ? Math.max((spec.hit_w || 0) * scale * this.scaleFactor, this.minHitbox) : 0;
    this.hitH = this.hasHitbox ? Math.max((spec.hit_h || 0) * scale * this.scaleFactor, this.minHitbox) : 0;

    this.hp = spec.hp;
    this.maxHp = spec.hp;
    this.lifetime = (spec.lifetime || 5) * rules.lifetimeMultiplier;
    this.age = 0;

    this.alive = true;
    this.deathReason = null;
    this.hitFlash = 0;
    this.shakeTimer = 0;

    // === 애니 전용 상태(sprite/animator.js가 읽는다) ===
    // basic만 잡몹 얼굴(1/2/3)이 스폰 시 하나로 고정된다.
    this.basicVariant = spec.id === 'basic' ? pickBasicVariant() : null;
    // a/b 두 벌 그림을 가진 종류(popup의 노랑/핑크 광고)는 스폰 시 한쪽으로 고정된다.
    // ★ 이 값은 그림만 고르는 게 아니다 — popup은 a와 b의 X 버튼 위치가 서로 달라서
    //   클릭 판정(enemies/hitbox.js의 artRect)도 이걸 보고 갈라진다.
    this.abVariant = FRAME_SETS[spec.id]?.sets ? pickAbVariant() : null;
    // 그림에 실제로 그려진 클릭 대상의 위치표(config.enemy.artHitbox)를 찾는 키.
    // 같은 종류라도 그림이 갈리면(popup a/b) 키도 갈리고, clone처럼 tier마다 그림
    // 크기가 다른 놈은 tier가 키에 들어간다. 표에 없으면 null → 시트의 hit_w/hit_h를 쓴다.
    this.artHitboxKey = spec.id === 'clone' ? `clone:${tier}` : this.abVariant ? `${spec.id}:${this.abVariant}` : spec.id;
    // 죽고 나서도 잠깐 "죽은 프레임"을 보여주며 화면에 남아있는 시간(초).
    // kill()이 basic 클릭사망일 때만 채운다 — 그 외엔 0이라 기존처럼 즉시 치워진다.
    this.corpseTimer = 0;
    // 살아남는 피격(ransom 단계 전환 등) 직후 hit 프레임을 잠깐 보여주는 남은 시간(초).
    this.hitFrameTimer = 0;

    // special_effect가 "가짜커서"를 낸 놈(copier)은 클릭 대상이 아니라 진짜
    // 커서를 쫓아가 안착하면 터지는 이벤트형이다. move_pattern/dps는 무시한다.
    this.isEventType = !!this.effect.fakeCursor;
    // bait는 id로 직접 특정한다 — 돌아다니는 게 아니라 모서리 고정+화질복구
    // 연출 전용 상태기계(enemies/bait.js)를 쓰는, 다른 것과 공유 안 되는 존재다.
    this.isBait = spec.id === 'bait';
    // homing(copier)이 뿅 나타날 기준점. 없으면(디버그 등) 화면 중앙으로 대체.
    this.spawnPointer = pointer ?? { x: playArea.x + playArea.w / 2, y: playArea.y + playArea.h / 2 };

    // B타입(dps>0) 주기 공격. 이벤트형은 쫓아가는 동안 따로 공격하지 않는다.
    // config.enemy.atkIntervalSec 주석 참고(시트에 전용 컬럼 생기면 걷어낼 환산).
    this.atk =
      spec.dps > 0 && !this.isEventType
        ? {
            interval: config.enemy.atkIntervalSec,
            damage: spec.dps * config.enemy.atkIntervalSec,
            timer: config.enemy.atkIntervalSec,
          }
        : null;
    // 이번 프레임에 공격이 터졌을 때만 0보다 크다(upload.js가 읽고 바로 소비).
    this.pendingAttack = 0;

    // 행동 분류 (시트의 action/type/special_effect 조합으로 결정)
    this.clickable = spec.action === 'click' && spec.hp > 0 && !this.isEventType;
    // 시트의 action='drag'는 이제 "우상단 X 버튼으로 닫기"를 뜻한다(popup).
    this.closeButton = spec.action === 'drag';
    this.isTrap = spec.action === 'none' && this.effect.wrongClickPct > 0;

    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;

    // 이벤트형(copier)은 항상 homing, bait는 항상 bait — 둘 다 시트의
    // move_pattern/speed와 무관하게 전용 이동으로 강제 전환한다.
    this.kind = this.isEventType ? 'homing' : this.isBait ? 'bait' : (PATTERN_KIND[spec.move_pattern] ?? 'bounce');
    this.retargetTimer = 0;
    this.entering = false;
    this.targetX = x;
    this.targetY = y;

    initMovement(this, rules, playArea);
  }

  /** 시트의 speed(기준 해상도 px/s)에 해상도 비율을 곱한다 — 화면을 가로지르는 체감 속도가 같아진다. */
  get speed() {
    return (this.spec.speed || 0) * this.scaleFactor;
  }

  /** 업로드를 완전히 멈추는 A타입인가 */
  get stopsUpload() {
    return this.spec.stops_upload === true;
  }

  /** 다음 공격까지 남은 시간 대비 예비동작 진행도(0~1, 1이 발동 직전) */
  get atkTelegraphRatio() {
    if (!this.atk) return 0;
    const t = this.atk.timer;
    const w = config.enemy.atkTelegraphSec;
    if (t > w || t <= 0) return 0;
    return 1 - t / w;
  }

  update(dt, world) {
    if (!this.alive) {
      // 죽은 뒤 잠깐 "죽은 프레임"을 보여주는 동안(corpseTimer)만 여기 남는다 —
      // 그 사이엔 움직이거나 공격하지 않고 그냥 시간만 깎는다. 실제로 배열에서
      // 치우는 건 core/stageManager.js의 processDeaths가 corpseTimer<=0일 때 한다.
      this.corpseTimer = Math.max(0, this.corpseTimer - dt);
      return;
    }

    this.age += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    this.hitFrameTimer = Math.max(0, this.hitFrameTimer - dt);
    this.pendingAttack = 0;

    if (this.atk) {
      this.atk.timer -= dt;
      if (this.atk.timer <= 0) {
        this.pendingAttack = this.atk.damage;
        this.atk.timer += this.atk.interval;
      }
    }

    if (this.age >= this.lifetime) {
      this.kill('expired');
      return;
    }

    moveEnemy(this, dt, world);
  }

  // --- 판정 사각형들 (계산은 hitbox.js) ---

  /**
   * 이 방해꾼의 실제 클릭 판정. 그림 기준 실측표에 있으면 그걸 쓰고(artRect),
   * 없으면 시트의 hit_w/hit_h(hitRect)로 폴백한다 — 그림이 캔버스를 거의 꽉 채우는
   * 종류(basic/ransom/unplug 등)는 시트 값으로 충분해서 표에 안 올려뒀다.
   */
  hitRect() {
    const art = artRect(this);
    if (!art) return hitRect(this);

    // ★ 분열 조각만 min_hitbox 바닥을 깐다.
    // 시트가 크기를 줄이고(대100→중70→소50) 그림 자체도 캔버스 안에서 더 작게
    // 그려져 있어서(비율 0.98→0.63→0.38) 두 축소가 곱해진다. 그 결과 소 조각의
    // 판정이 16x14까지 내려가 사실상 못 누른다. 위 hitW/hitH에는 이미 바닥이
    // 깔려 있는데 그림 기준 경로(artRect)만 그걸 안 거쳐서 생긴 구멍이다.
    //
    // 조각(tier>0)에만 거는 이유: popup의 X 버튼과 fake_btn은 "작고 정확한
    // 표적"인 게 설계다. 거기까지 넓히면 X 대신 창 아무 데나 눌러도 닫히고,
    // 밟으면 안 되는 함정이 더 잘 밟히게 된다.
    return this.tier > 0 ? inflateToMin(art, this.minHitbox, this.minHitbox) : art;
  }

  bodyRect() {
    return bodyRect(this);
  }

  closeButtonRect() {
    return closeButtonRect(this);
  }

  containsPoint(px, py) {
    return rectContains(this.hitRect(), px, py);
  }

  containsBody(px, py) {
    return rectContains(bodyRect(this), px, py);
  }

  /** X 버튼이 아닌 몸통을 잘못 눌렀을 때 — 흔들리기만 하고 죽지 않는다. */
  triggerShake() {
    this.shakeTimer = config.enemy.bodyShakeSec;
  }

  /** 클릭이 실제로 맞았을 때. hp가 0 이하가 되면 죽는다. */
  takeHit() {
    this.hitFlash = config.enemy.hitFlashSec;
    if (!this.clickable) return false;

    this.hp -= 1;
    if (this.hp <= 0) {
      this.kill('clicked');
      return true;
    }
    // 안 죽고 살아남았다(예: ransom 단계 전환) — hit 프레임을 잠깐 끼워 보여준다.
    // 이 프레임을 실제로 쓰는 종류(ransom)가 아니면 sprite/animator.js가 그냥 무시한다.
    this.hitFrameTimer = config.anim.ransomHitFlashSec;
    return false;
  }

  kill(reason) {
    if (!this.alive) return;
    this.alive = false;
    this.deathReason = reason;
    // basic 클릭사망만 dead 프레임을 잠깐 보여주고 치운다 — 그 외 타입은 기존처럼 즉시 치워진다.
    this.corpseTimer = reason === 'clicked' && this.id === 'basic' ? config.anim.basicDeathLingerSec : 0;
  }

  /** 남은 수명 비율 0~1. 이벤트형은 이 시간 안에 커서에 못 닿으면 그냥 사라진다. */
  lifeRatio() {
    return Math.max(0, 1 - this.age / this.lifetime);
  }

  /** 수명이 다했을 때/터질 때 지켜볼 이유가 있는가 (UI에서 위험 표시용) */
  get hasExpiryPenalty() {
    return this.effect.expirePct > 0 || this.effect.expireNextFileMb > 0 || this.isEventType;
  }

  /** 분열 조각이 서로 반대로 튀게 할 때 쓴다(effects.js). */
  clampInside(playArea) {
    bounceInside(this, playArea);
  }
}
