// 이 파일 역할: 방해꾼 한 마리의 상태와 판정(히트박스/클릭/수명). 이동은 behaviors.js, 그리기는 ui가 맡는다.

import { config, getScaleFactor, parseSpecialEffect } from '../config.js';
import { PATTERN_KIND, initMovement, moveEnemy, bounceInside } from './behaviors.js';
import { hitRect, bodyRect, closeButtonRect, artRect, rectContains, inflateToMin } from './hitbox.js';
import { initEntrance, updateEntrance } from './entrance.js';
import { burstOnKill } from '../systems/juice.js';
import { playSfx, SFX } from '../systems/sound.js';
import { pickBasicVariant, pickAbVariant, FRAME_SETS } from '../sprite/animator.js';

// 시트의 stops_upload를 무시하고 "절대 업로드를 멈추지 않는다"고 못박는 id들.
// 왜 필요한지는 아래 Enemy.stopsUpload 게터 주석 참고 — 시트 쪽 분류가 고쳐지면
// 여기서 그 id를 빼면 된다(비면 이 Set째로 지워도 된다).
const NEVER_BLOCKS = new Set(['bomb']);

// 클릭으로 잡았을 때 낼 소리. 여기 없는 종류는 전부 기본값(KILL_SOFT, 잡몹)이다 —
// 특수능력이 있는 놈은 처치 순간 그 정체성이 드러나는 고유 소리로 갈아 끼운다.
//   · ransom: hp3 다단계 — 마지막 한 방이 "드디어 깨졌다"(중간 타격은 takeHit의 균열음)
//   · clone: 복제 취소/삭제 · popup: X로 창 닫힘 · unplug: 전원 복구
//   · hidden: 발각 · bomb: 폭탄 제거
// ★ 여기 안 오는 종류들: fake_btn(함정이라 clickable이 아니다 — 밟으면 아래
//   FAKEBTN_PENALTY가 따로 난다), copier(클릭이 아니라 커서에 안착해 자폭한다 —
//   enemies/effects.js의 triggerSelfDestruct, COPIER_SELFDESTRUCT가 이미 고유), bait(히트박스 자체가 없다).
const KILL_SFX = {
  ransom: SFX.KILL_HARD,
  clone: SFX.KILL_CLONE,
  popup: SFX.KILL_POPUP,
  unplug: SFX.KILL_UNPLUG,
  hidden: SFX.KILL_HIDDEN,
  bomb: SFX.KILL_BOMB,
};

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
    // 죽은 뒤 흐른 시간(초). 처치 팝/흰 번쩍임 진행도가 전부 이 값 기준이다.
    this.deathAge = 0;
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
    // 이 팝업 하나에서만 X를 못 맞히고 몸통을 잘못 누른 횟수 — 방해꾼별로 각자
    // 센다(전역이 아니다). systems/input.js가 올리고, ui/renderEnemies.js의
    // drawPopupCloseButton이 이 값만 보고 강조 X를 켠다 — "여러 마리가 떠 있을 때
    // 헤맨 그 한 마리만" 강조돼야 한다는 요구사항 그대로.
    this.closeMisses = 0;
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
    // 등장 연출은 이동 초기화 뒤에 잡는다 — enterStop처럼 initMovement가 시작 위치를
    // 화면 밖으로 옮기는 종류가 있어서, 그 결과 위에 연출 오프셋이 얹혀야 한다.
    initEntrance(this);
  }

  /** 시트의 speed(기준 해상도 px/s)에 해상도 비율을 곱한다 — 화면을 가로지르는 체감 속도가 같아진다. */
  get speed() {
    return (this.spec.speed || 0) * this.scaleFactor;
  }

  // === 등장 연출이 반영된 "실제로 보이는" 위치·크기 ===
  // ★ 그리기(ui/renderEnemies.js)와 판정(enemies/hitbox.js)이 **둘 다 이 네 개만**
  //   읽는다. 그래서 등장 연출로 스프라이트가 움직이거나 작아져도 히트박스가 정확히
  //   같이 따라가고, "보이는 자리와 눌리는 자리가 다른" 상태가 구조적으로 못 생긴다
  //   (이 프로젝트에서 그 사고가 반복돼서 아예 한 출처로 묶었다).
  //   물리(이동·벽 튕김)는 연출과 무관해야 하므로 계속 x/y/w/h(논리값)를 쓴다.
  get drawX() {
    return this.x + this.entOffX;
  }

  get drawY() {
    return this.y + this.entOffY;
  }

  get drawW() {
    return this.w * this.entScaleX;
  }

  get drawH() {
    return this.h * this.entScaleY;
  }

  /**
   * 업로드를 완전히 멈추는 A타입인가 — "업데이트 중단됨!" 배지(index.html의
   * pause-badge)와 진행 정지가 전부 이 한 값에서 갈린다(systems/upload.js).
   *
   * ★ bomb 예외: 시트가 bomb을 stops_upload=TRUE로 분류해 놨는데, 이건 bomb의
   *   실제 역할과 안 맞는다. bomb은 dps=0이고 special_effect가 "수명만료시 -20%"인
   *   손실형 — 터지면서 한 방 깎는 놈이지 업로드를 멈춰 세우는 놈이 아니다.
   *   그런데 그 컬럼 때문에 bomb이 떠 있는 4초 내내 업로드가 멈추고 중단 배지까지
   *   떠서, 정작 진짜 정지형인 unplug와 구분이 안 됐다(둘 다 "중단됨!"만 보임).
   *   근본 해결은 시트에서 bomb의 stops_upload를 FALSE로 고치는 것이고, 그러면
   *   아래 NEVER_BLOCKS는 지워도 그대로 동작한다. 시트 값이 그대로인 동안에도
   *   게임이 의도대로 돌게 여기서 바로잡는다.
   *
   * ★ 스폰 직후 config.enemy.blockDelaySec만큼은 A타입이어도 false다 — 유예를
   *   두는 이유는 그 상수 주석 참고. 이 게터가 age를 같이 보므로 "정지 중인가"를
   *   묻는 모든 곳이 자동으로 유예를 존중한다(판정과 표시가 갈릴 여지를 안 만든다).
   */
  get stopsUpload() {
    if (NEVER_BLOCKS.has(this.id)) return false;
    if (this.spec.stops_upload !== true) return false;
    return this.age >= config.enemy.blockDelaySec;
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
      this.deathAge += dt; // 처치 팝(부풀며 사라지기)이 이 시간으로 진행된다
      return;
    }

    this.age += dt;
    updateEntrance(this); // 끝났으면 내부에서 즉시 return한다(살아있는 내내 불려도 싸다)
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

    // 다단계(hp>1) 방해꾼은 때릴 때마다 "점점 부서진다"는 진행감을 준다. 최종타는
    // kill()이 KILL_HARD(완전히 부서짐)를 내므로, 여기서는 살아남은 중간 타격만 낸다.
    // hitsTaken = maxHp - hp (1 = 첫 타, 2 = 둘째 타 ...). 균열음은 2종이라 그 이상
    // 깊이는 두 번째 균열음으로 클램프한다(지금 다단계는 ransom hp3뿐이라 정확히 맞는다).
    if (this.maxHp > 1) {
      const hitsTaken = this.maxHp - this.hp;
      playSfx(hitsTaken === 1 ? SFX.RANSOM_CRACK_1 : SFX.RANSOM_CRACK_2);
    }
    return false;
  }

  kill(reason) {
    if (!this.alive) return;
    this.alive = false;
    this.deathReason = reason;
    this.deathAge = 0;

    // basic 클릭사망만 dead 프레임을 잠깐 보여주고 치운다.
    const basicLinger = reason === 'clicked' && this.id === 'basic' ? config.anim.basicDeathLingerSec : 0;

    if (reason === 'clicked') {
      // 클릭으로 잡았을 때만 타격감을 준다 — 수명만료(expired)나 copier 자폭
      // (triggered)까지 터뜨리면 "잡았다"는 신호가 흐려지고 화면만 시끄러워진다.
      // 팝이 끝날 때까지는 배열에 남아있어야 그 연출이 보인다(basic은 원래 더 길다).
      this.corpseTimer = Math.max(basicLinger, config.enemy.kill.popSec);
      burstOnKill(this.drawX, this.drawY, this.id);
      // 타격감(히트스톱+흔들림+조각)을 켜는 바로 그 자리에서 같이 낸다 — 눈에 보이는
      // 타격과 소리가 갈라질 수 없게. 수명만료(expired)나 copier 자폭(triggered)은
      // 이 분기에 안 들어오므로 "잡았다" 소리가 거기 섞이지 않는다.
      // varyCents: 처치 연타 때 같은 소리가 딱딱 겹치지 않게 피치를 살짝 흩는다.
      playSfx(KILL_SFX[this.id] ?? SFX.KILL_SOFT, { varyCents: 130 });
    } else {
      this.corpseTimer = basicLinger;
    }
    // 옅어지는 진행도를 재려면 "원래 얼마였는지"가 있어야 한다. basic은 죽음 프레임을
    // 오래(0.35s) 보여주고 나머지는 팝 길이(0.16s)만 남으므로 종류마다 다르다.
    this.corpseTotal = this.corpseTimer;
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
