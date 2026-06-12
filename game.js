'use strict';

// ════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════
const GW   = 480;
const GH   = 270;
const T    = 4;
const TILE = T * 4;        // 16 px
const LW   = 100 * TILE;   // 1600 px
const GY   = 14 * TILE;    // ground top y = 224

const GRAVITY = 0.28;
const JUMP_V  = -8.0;
const SPEED   = 1.5;

// Player hitbox: 14×26, matched to actual boy art (measured: x=3–22, y=22–47 in 48×48 frame)
const PW = 14, PH = 26;
const P_SW = 48, P_SH = 48;
// P_OY: positions sprite so art bottom (frame y=47) aligns with hitbox bottom (P.y+PH=GY)
// P_ART_CX: art horizontal centre in the unflipped frame (measured: (3+22)/2 ≈ 12)
const P_OY = 21, P_ART_CX = 12;

// ════════════════════════════════════════════
//  CANVAS
// ════════════════════════════════════════════
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
let S = 1, cssS = 1;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  cssS = Math.min(window.innerWidth / GW, window.innerHeight / GH);
  S    = cssS * dpr;
  canvas.width  = Math.round(GW * S);
  canvas.height = Math.round(GH * S);
  canvas.style.width  = Math.round(GW * cssS) + 'px';
  canvas.style.height = Math.round(GH * cssS) + 'px';
  ctx.imageSmoothingEnabled = false;
}
resize();
window.addEventListener('resize', resize);

// ════════════════════════════════════════════
//  SPRITE LOADER
// ════════════════════════════════════════════
const imgs = {};
let loaded = 0, total = 0;

function img(key, src) {
  total++;
  const el = new Image();
  el.onload  = () => loaded++;
  el.onerror = () => { loaded++; console.warn('Missing:', src); };
  el.src = src;
  imgs[key] = el;
}

img('boyIdle',         'sprites/hero/boy_idle.png');
img('boyWalk',         'sprites/hero/boy_walk.png');
img('boyHurt',         'sprites/hero/boy_hurt.png');
img('boyDeath',        'sprites/hero/boy_death.png');

img('pinkWalk',        'sprites/enemies/pink_walk.png');
img('pinkIdle',        'sprites/enemies/pink_idle.png');
img('dudeWalk',        'sprites/enemies/dude_walk.png');
img('dudeIdle',        'sprites/enemies/dude_idle.png');
img('snakeWalk',       'sprites/enemies/snake_walk.png');
img('snakeIdle',       'sprites/enemies/snake_idle.png');
img('snakeAttack',     'sprites/enemies/snake_attack.png');
img('scorpioWalk',     'sprites/enemies/scorpio_walk.png');
img('scorpioIdle',     'sprites/enemies/scorpio_idle.png');
img('scorpioAttack',   'sprites/enemies/scorpio_attack.png');

img('centIdle',        'sprites/boss/centipede_idle.png');
img('centWalk',        'sprites/boss/centipede_walk.png');
img('centAttack',      'sprites/boss/centipede_attack.png');
img('centDeath',       'sprites/boss/centipede_death.png');

img('bg1',             'sprites/world/bg_1.png');
img('bg2',             'sprites/world/bg_2.png');
img('bg3',             'sprites/world/bg_3.png');
img('bg4',             'sprites/world/bg_4.png');
img('bg5',             'sprites/world/bg_5.png');
img('tileTop',         'sprites/world/tile_top.png');
img('tileBody',        'sprites/world/tile_body.png');
img('coin',            'sprites/world/coin.png');

// ════════════════════════════════════════════
//  DRAW PRIMITIVES
// ════════════════════════════════════════════
function wr(x, y, w, h, col) {
  ctx.fillStyle = col;
  ctx.fillRect(Math.round((x - camX) * S), Math.round(y * S), Math.ceil(w * S), Math.ceil(h * S));
}
function sr(x, y, w, h, col) {
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x * S), Math.round(y * S), Math.ceil(w * S), Math.ceil(h * S));
}
function txtP(str, x, y, col, px, align = 'center') {
  ctx.fillStyle = col; ctx.textAlign = align;
  ctx.font = `${Math.round(px * S)}px 'Press Start 2P'`;
  ctx.fillText(str, Math.round(x * S), Math.round(y * S));
}
function txtF(str, x, y, col, px, align = 'center') {
  ctx.fillStyle = col; ctx.textAlign = align;
  ctx.font = `400 ${Math.round(px * S)}px 'Pixelify Sans'`;
  ctx.fillText(str, Math.round(x * S), Math.round(y * S));
}

// Sprite from horizontal strip — world-space (camera-relative)
function drawSW(key, frame, frames, gx, gy, gw, gh, flipX = false) {
  const el = imgs[key];
  if (!el || !el.naturalWidth) return;
  const fw = el.width / frames;
  const dx = Math.round((gx - camX) * S);
  const dy = Math.round(gy * S);
  const dw = Math.ceil(gw * S);
  const dh = Math.ceil(gh * S);
  if (dx + dw < 0 || dx > canvas.width) return;
  if (flipX) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(el, Math.floor(frame) * fw, 0, fw, el.height, -(dx + dw), dy, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(el, Math.floor(frame) * fw, 0, fw, el.height, dx, dy, dw, dh);
  }
}

// Sprite — screen-space (HUD)
function drawSS(key, frame, frames, sx, sy, sw, sh) {
  const el = imgs[key];
  if (!el || !el.naturalWidth) return;
  const fw = el.width / frames;
  ctx.drawImage(el, Math.floor(frame) * fw, 0, fw, el.height,
    Math.round(sx * S), Math.round(sy * S), Math.ceil(sw * S), Math.ceil(sh * S));
}

function aframe(t, frames, fps = 5) {
  return Math.floor(t / Math.max(1, Math.round(60 / fps))) % frames;
}

// ════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════
let STATE = 'LOADING';
let gameLang = 'en';
let _lbEN = {x:0,y:0,w:0,h:0}, _lbPT = {x:0,y:0,w:0,h:0};
let tick = 0, score = 0, camX = 0, lives = 5;
let bannerTick = 0;
let dying = { active: false, tick: 0 };
let fadeAlpha = 0;

// ════════════════════════════════════════════
//  PLAYER
// ════════════════════════════════════════════
const P = {
  x: 2 * TILE, y: GY - PH,
  vx: 0, vy: 0,
  onGround: false,
  face: 1,
  walk: false, wt: 0, wf: 0,
  invincible: 0,
  airborne: false,
  health: 3,
  hurtTick: -999,
};

// ════════════════════════════════════════════
//  INPUT
// ════════════════════════════════════════════
const K = { left: false, right: false, jump: false, jumpUsed: false };

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Escape') { closeModal(); return; }
  if (e.code === 'ArrowLeft'  || e.code === 'KeyA') K.left  = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') K.right = true;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    if (STATE === 'INTRO') { beginPlay(); return; }
    K.jump = true;
  }
  if (['Space','ArrowUp','ArrowLeft','ArrowRight','ArrowDown'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'ArrowLeft'  || e.code === 'KeyA') K.left  = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') K.right = false;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    K.jump = false; K.jumpUsed = false;
  }
});

canvas.addEventListener('touchend', e => {
  if (STATE !== 'INTRO') return;
  const t = e.changedTouches[0];
  introClick(t.clientX, t.clientY);
}, { passive: false });
canvas.addEventListener('click', e => { if (STATE === 'INTRO') introClick(e.clientX, e.clientY); });

function setupTouch() {
  if (!('ontouchstart' in window) && !navigator.maxTouchPoints) return;
  document.getElementById('tc').style.display = 'flex';
  function hold(id, key) {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', e => {
      e.stopPropagation(); e.preventDefault();
      K[key] = true;
      if (STATE === 'INTRO') beginPlay();
    }, { passive: false });
    el.addEventListener('touchend', e => {
      e.stopPropagation(); e.preventDefault();
      K[key] = false;
      if (key === 'jump') K.jumpUsed = false;
    }, { passive: false });
    el.addEventListener('touchcancel', e => {
      e.stopPropagation(); e.preventDefault();
      K[key] = false;
      if (key === 'jump') K.jumpUsed = false;
    }, { passive: false });
  }
  hold('bl', 'left'); hold('br', 'right'); hold('bj', 'jump');
}
setupTouch();

// ════════════════════════════════════════════
//  LEVEL DATA
// ════════════════════════════════════════════
const ground = { x: 0, y: GY, w: LW, h: GH - GY };

const platforms = [
  { x:  6*TILE, y: 12*TILE, w: 4*TILE, h: TILE },
  { x: 13*TILE, y: 11*TILE, w: 3*TILE, h: TILE },
  { x: 19*TILE, y: 10*TILE, w: 4*TILE, h: TILE },
  { x: 27*TILE, y: 12*TILE, w: 3*TILE, h: TILE },
  { x: 33*TILE, y: 10*TILE, w: 5*TILE, h: TILE },
  { x: 42*TILE, y: 12*TILE, w: 3*TILE, h: TILE },
  { x: 48*TILE, y: 10*TILE, w: 4*TILE, h: TILE },
  { x: 54*TILE, y: 11*TILE, w: 3*TILE, h: TILE },
  { x: 61*TILE, y: 10*TILE, w: 5*TILE, h: TILE },
  { x: 70*TILE, y: 12*TILE, w: 4*TILE, h: TILE },
  { x: 77*TILE, y: 10*TILE, w: 3*TILE, h: TILE },
  { x: 83*TILE, y: 12*TILE, w: 4*TILE, h: TILE },
];

const COIN_XY = [
  ...[3,4,5].map(x => [x*TILE+4, GY-3*TILE]),
  ...[6,7,8,9].map(x => [x*TILE+4, 11*TILE]),
  ...[13,14,15].map(x => [x*TILE+4, 10*TILE]),
  ...[19,20,21,22].map(x => [x*TILE+4, 9*TILE]),
  ...[27,28,29].map(x => [x*TILE+4, 11*TILE]),
  ...[33,34,35,36,37].map(x => [x*TILE+4, 9*TILE]),
  ...[42,43,44].map(x => [x*TILE+4, 11*TILE]),
  ...[48,49,50,51].map(x => [x*TILE+4, 9*TILE]),
  ...[54,55,56].map(x => [x*TILE+4, 10*TILE]),
  ...[61,62,63,64,65].map(x => [x*TILE+4, 9*TILE]),
  ...[70,71,72,73].map(x => [x*TILE+4, 11*TILE]),
  ...[77,78,79].map(x => [x*TILE+4, 9*TILE]),
  ...[83,84,85,86].map(x => [x*TILE+4, 11*TILE]),
  ...[90,91,92,93,94,95].map(x => [x*TILE+4, GY-3*TILE]),
];
let coins = COIN_XY.map(([x, y]) => ({ x, y, alive: true }));

// ── ? Block — further right, near end of level, always shows "?" ──
const QB_X = 96 * TILE;        // x=1536 (96% of level)
const QB_Y = GY - 7 * TILE;    // floating 112px above ground — clears boss head (72px)
const QB_W = 2 * TILE;
const QB_H = 2 * TILE;
let qblock = { hitTick: -999, bounceTick: -999 };

// ── Enemy type definitions ──
// Hitboxes match actual pixel-art content area within each sprite frame.
// snake/scorpio: body is in the LOWER portion of their 48×48 frame (art y≈36–48),
//   so hby is raised high to only cover the visible creature.
// pink/dude: art ~16×22 centred in 32×32 frame.
// Boss centipede: body at y≈30–62 in 72×72 frame.
const ETYPES = {
  // fo = visual foot offset from sprite top. Snapping uses fo so visible feet
  // land on the surface, not the transparent bottom padding of the sprite frame.
  // pink/dude art fills to the frame bottom → fo = sh. snake body fills bottom → fo = sh.
  // scorpio art fills to y=47 in 48px frame → fo = 48 (1px transparent below).
  pink:    { imgW:'pinkWalk',    imgI:'pinkIdle',    fw:6, fi:4, sw:32, sh:32, hbx:7,  hby:5,  hbw:14, hbh:24, fo:32, spd:0.38, pts:100, facesLeft:false, groundOnly:false },
  dude:    { imgW:'dudeWalk',    imgI:'dudeIdle',    fw:6, fi:4, sw:32, sh:32, hbx:7,  hby:5,  hbw:14, hbh:24, fo:32, spd:0.40, pts:100, facesLeft:false, groundOnly:false },
  snake:   { imgW:'snakeWalk',   imgI:'snakeIdle',   imgA:'snakeAttack',   fa:6, fw:4, fi:4, sw:48, sh:48, hbx:16, hby:33, hbw:28, hbh:14, fo:48, spd:0.32, pts:150, facesLeft:true,  groundOnly:true,  atkRange:88, atkHitRange:44 },
  scorpio: { imgW:'scorpioWalk', imgI:'scorpioIdle', imgA:'scorpioAttack', fa:4, fw:4, fi:4, sw:48, sh:48, hbx:15, hby:28, hbw:26, hbh:18, fo:48, spd:0.42, pts:150, facesLeft:true,  groundOnly:true,  atkRange:84, atkHitRange:42 },
};

// 8 enemies — snake/scorpio ground-only, pink/dude platform-aware
const EDEFS = [
  ['snake',    9*TILE,  -1,  5*TILE,  18*TILE],
  ['scorpio', 22*TILE,  -1, 17*TILE,  31*TILE],
  ['pink',    31*TILE,  -1, 27*TILE,  40*TILE],
  ['dude',    44*TILE,   1, 40*TILE,  55*TILE],
  ['snake',   56*TILE,  -1, 51*TILE,  66*TILE],
  ['pink',    67*TILE,  -1, 62*TILE,  76*TILE],
  ['dude',    78*TILE,   1, 74*TILE,  88*TILE],
  ['scorpio', 84*TILE,  -1, 80*TILE,  93*TILE],
];

function makeEnemies() {
  return EDEFS.map(([type, x, dir, px0, px1]) => {
    const tp = ETYPES[type];
    return { type, tp, x, y: GY - tp.fo, vx: 0, vy: 0, dir, px0, px1,
             onGround: false, alive: true, dead: false, deathTick: -1, wt: 0,
             attacking: false, attackTick: 0, attackCd: 0 };
  });
}
let enemies = makeEnemies();

// Boss: centipede faces LEFT by default → flip when dir > 0
let boss = {
  x: 92*TILE, y: GY-72, vx:0, vy:0, dir:-1,
  alive:true, dead:false, deathTick:-1, wt:0,
  onGround: false,
  px0:88*TILE, px1:100*TILE,
  attacking:false, attackTick:0, attackCd:0,
};

// ════════════════════════════════════════════
//  PARTICLES & SCORE POPUPS
// ════════════════════════════════════════════
let particles = [], popups = [];

function spawnSparkle(wx, wy) {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, sp = 0.5 + Math.random() * 0.9;
    particles.push({ x: wx, y: wy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 22, col: ['#f8c000','#ffe860','#fff','#80ffaa'][i % 4] });
  }
}
function spawnConfetti() {
  const cols = ['#f8c000','#ff2040','#7ecfff','#1db31d','#ff80c0','#fff'];
  for (let i = 0; i < 100; i++) {
    const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 4;
    particles.push({ x: P.x + PW / 2, y: P.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
      life: 80 + Math.random() * 60, col: cols[i % cols.length] });
  }
}
function spawnPopup(wx, wy, val) {
  popups.push({ x: wx, y: wy, vy: -0.55, life: 55, val: '+' + val });
}
function spawnSquish(wx, wy) {
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + i * (Math.PI / 4);
    particles.push({ x: wx, y: wy, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5 - 0.5,
      life: 16, col: '#804000' });
  }
}

// ════════════════════════════════════════════
//  MODAL / RSVP
// ════════════════════════════════════════════
function openModal()  { document.getElementById('modal').classList.add('open'); }
function closeModal() { document.getElementById('modal').classList.remove('open'); }

function setGameLang(lang) {
  gameLang = lang;
  const card = document.getElementById('card');
  card.classList.toggle('lang-en', lang === 'en');
  card.classList.toggle('lang-pt', lang === 'pt');
  const btn = document.getElementById('lang-btn');
  if (btn) btn.textContent = lang === 'en' ? 'PT' : 'EN';
}

function introClick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const gx = (clientX - rect.left) / cssS;
  const gy = (clientY - rect.top)  / cssS;
  if (gx >= _lbEN.x && gx <= _lbEN.x + _lbEN.w && gy >= _lbEN.y && gy <= _lbEN.y + _lbEN.h) {
    setGameLang('en'); return;
  }
  if (gx >= _lbPT.x && gx <= _lbPT.x + _lbPT.w && gy >= _lbPT.y && gy <= _lbPT.y + _lbPT.h) {
    setGameLang('pt'); return;
  }
  beginPlay();
}

document.getElementById('modal-close').addEventListener('click', closeModal);

(function initRSVP() {
  const form       = document.getElementById('rsvp-form');
  const fields     = document.getElementById('rsvp-fields');
  const attendVal  = document.getElementById('attend-val');
  const submitBtn  = document.getElementById('rsvp-submit');
  const thanksYes  = document.getElementById('rsvp-thanks-yes');
  const thanksNo   = document.getElementById('rsvp-thanks-no');

  function isPt() {
    return document.getElementById('card').classList.contains('lang-pt');
  }

  // Both YES and NO reveal the name fields — only the button label differs
  document.querySelectorAll('input[name="attend-radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      attendVal.value = radio.value;
      fields.style.display = 'flex';
      if (radio.value === 'yes') {
        submitBtn.textContent = isPt() ? '[ ENVIAR RSVP ]' : '[ SEND RSVP ]';
        submitBtn.className = 'px-btn btn-grn';
      } else {
        submitBtn.textContent = isPt() ? '[ OBRIGADO, NAO POSSO ]' : "[ THANKS, CAN'T COME ]";
        submitBtn.className = 'px-btn btn-red';
      }
    });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    submitBtn.textContent = isPt() ? '[ A ENVIAR... ]' : '[ SENDING... ]';
    submitBtn.disabled = true;
    const data = Object.fromEntries(new FormData(form));
    const isYes = data.attend === 'yes';
    data._subject = isYes
      ? "RSVP: Attending Madis' 8th Birthday!"
      : "RSVP: NOT attending Madis' 8th Birthday";
    const ok = await sendRSVP(data);
    if (ok) {
      form.style.display = 'none';
      (isYes ? thanksYes : thanksNo).style.display = 'block';
    } else {
      submitBtn.textContent = isPt() ? '[ TENTAR NOVAMENTE ]' : '[ TRY AGAIN ]';
      submitBtn.disabled = false;
    }
  });

  async function sendRSVP(data) {
    try {
      const res = await fetch('https://formspree.io/f/xnjyblaz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.ok;
    } catch { return false; }
  }
})();

// ════════════════════════════════════════════
//  COLLISION
// ════════════════════════════════════════════
function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Player physics:
//  - Ground: true solid (all sides)
//  - Platforms: one-sided (land from above only), require ≥ PW/2 horizontal overlap to prevent corner-catch
//  - Gravity only accumulates when airborne (fixes ground-jitter / sprite vibration)
function resolvePlayer() {
  P.x += P.vx;
  P.x = Math.max(0, Math.min(LW - PW, P.x));

  const prevBottom = P.y + PH;
  const wasOnGround = P.onGround;
  P.onGround = false;

  // Only apply gravity when truly airborne — eliminates sub-pixel oscillation on surfaces
  if (!wasOnGround) P.vy = Math.min(P.vy + GRAVITY, 10);
  P.y += P.vy;

  // Ground: true solid — use >= (not aabb >) so exact snap position still registers as grounded
  if (P.y + PH >= ground.y) {
    if (P.vy >= 0) { P.y = ground.y - PH; P.vy = 0; P.onGround = true; }
    else           { P.y = ground.y + ground.h; P.vy = 1; }
  }

  // Platforms: one-sided. Falls off when hitbox centre crosses the edge —
  // matches the visual body centre so sprite never visibly overhangs mid-air.
  for (const p of platforms) {
    if (P.vy >= 0 && prevBottom <= p.y + 2) {
      const cx = P.x + PW / 2;
      if (cx >= p.x && cx <= p.x + p.w && P.y + PH >= p.y) {
        P.y = p.y - PH; P.vy = 0; P.onGround = true;
      }
    }
  }

  // ? Block: bump head from below → trigger; land on top
  if (P.vy < 0 && aabb(P.x, P.y, PW, PH, QB_X, QB_Y, QB_W, QB_H)) {
    P.y = QB_Y + QB_H; P.vy = 2;
    hitBlock();
  } else if (P.vy >= 0 && prevBottom <= QB_Y + 2) {
    const cx = P.x + PW / 2;
    if (cx >= QB_X && cx <= QB_X + QB_W && P.y + PH >= QB_Y) {
      P.y = QB_Y - PH; P.vy = 0; P.onGround = true;
    }
  }
}

// Enemy physics: same gravity fix — only accumulate when airborne
function resolveEnemy(e) {
  const tp = e.tp;
  e.x += e.dir * tp.spd;
  e.x = Math.max(0, Math.min(LW - tp.sw, e.x));

  const wasOnGround = e.onGround;
  e.onGround = false;
  const prevFeet = e.y + tp.fo; // visual foot position before movement

  if (!wasOnGround) e.vy = Math.min(e.vy + GRAVITY, 10);
  e.y += e.vy;

  if (e.y + tp.fo >= GY) { e.y = GY - tp.fo; e.vy = 0; e.onGround = true; }

  if (!tp.groundOnly) {
    for (const p of platforms) {
      if (e.vy >= 0) {
        // prevFeet: stable grounding when already on platform.
        // AABB: initial detection — lets ground-level enemies step up onto low platforms.
        const lands = (prevFeet <= p.y + 2) ||
                      aabb(e.x + tp.hbx, e.y + tp.hby, tp.hbw, tp.hbh, p.x, p.y, p.w, p.h);
        if (lands) {
          const ox = Math.min(e.x + tp.sw, p.x + p.w) - Math.max(e.x, p.x);
          if (ox > 0 && e.y + tp.fo >= p.y) {
            e.y = p.y - tp.fo; e.vy = 0; e.onGround = true;
          }
        }
      }
    }
  }
}

// ════════════════════════════════════════════
//  DAMAGE & DEATH
// ════════════════════════════════════════════
function takeDamage() {
  if (P.invincible > 0 || dying.active) return;
  P.health--;
  P.hurtTick = tick;
  if (P.health > 0) {
    P.invincible = 80;
  } else {
    startDying();
  }
}

function startDying() {
  dying.active = true;
  dying.tick = 0;
  P.vx = 0; P.vy = -3;
}

// ════════════════════════════════════════════
//  GAME LOGIC
// ════════════════════════════════════════════
function beginPlay() {
  STATE = 'PLAY';
  P.x = 2*TILE; P.y = GY-PH;
  P.vx = 0; P.vy = 0; P.onGround = false;
  P.invincible = 0; P.walk = false; P.wf = 0; P.wt = 0;
  P.health = 3; P.hurtTick = -999;
  dying = { active: false, tick: 0 };
  fadeAlpha = 0;
  camX = 0; score = 0; lives = 5;
  coins = COIN_XY.map(([x, y]) => ({ x, y, alive: true }));
  enemies = makeEnemies();
  boss = { x:92*TILE, y:GY-72, vx:0, vy:0, dir:-1,
           alive:true, dead:false, deathTick:-1, wt:0, onGround:false,
           px0:88*TILE, px1:100*TILE, attacking:false, attackTick:0, attackCd:0 };
  qblock = { hitTick: -999, bounceTick: -999 };
  bannerTick = 0;
  const form      = document.getElementById('rsvp-form');
  const fields    = document.getElementById('rsvp-fields');
  const thanksYes = document.getElementById('rsvp-thanks-yes');
  const thanksNo  = document.getElementById('rsvp-thanks-no');
  if (form)      { form.style.display = ''; form.reset(); }
  if (fields)    fields.style.display = 'none';
  if (thanksYes) thanksYes.style.display = 'none';
  if (thanksNo)  thanksNo.style.display  = 'none';
}

function hitBlock() {
  if (tick - qblock.hitTick <= 90) return; // cooldown prevents accidental re-trigger
  qblock.hitTick = tick;
  qblock.bounceTick = tick;
  spawnSparkle(QB_X + QB_W / 2, QB_Y);
  setTimeout(openModal, 300);
}

function updateDying() {
  dying.tick++;
  const dt = dying.tick;

  P.vy = Math.min(P.vy + GRAVITY, 10);
  P.y += P.vy;
  if (P.y + PH >= GY) { P.y = GY - PH; P.vy = 0; }

  const targetX = P.x + PW / 2 - GW / 2;
  camX += (targetX - camX) * 0.1;
  camX = Math.max(0, Math.min(LW - GW, camX));

  if (dt >= 40 && dt <= 80)  fadeAlpha = (dt - 40) / 40;

  if (dt === 80) {
    lives--;
    if (lives <= 0) { beginPlay(); return; }
    P.x = Math.max(2*TILE, camX + TILE);
    P.y = GY - PH;
    P.vx = 0; P.vy = 0;
    P.health = 3; P.hurtTick = -999;
    P.invincible = 60;
  }

  if (dt > 80 && dt <= 120) fadeAlpha = 1 - (dt - 80) / 40;

  if (dt > 120) {
    dying.active = false;
    dying.tick = 0;
    fadeAlpha = 0;
  }
}

function update() {
  if (dying.active) { updateDying(); return; }

  bannerTick++;

  // ── Player input ──
  if (K.left)        { P.vx = -SPEED; P.face = -1; P.walk = true; }
  else if (K.right)  { P.vx =  SPEED; P.face =  1; P.walk = true; }
  else               { P.vx = 0; P.walk = false; }

  if (K.jump && !K.jumpUsed && P.onGround) {
    P.vy = JUMP_V; P.onGround = false; K.jumpUsed = true;
  }
  if (P.walk && P.onGround) { if (++P.wt >= 7) { P.wt = 0; P.wf = (P.wf + 1) % 6; } }
  else if (!P.walk) P.wf = 0;
  if (P.invincible > 0) P.invincible--;
  P.airborne = !P.onGround;

  resolvePlayer();

  // ── Coins ──
  coins.forEach(c => {
    if (!c.alive) return;
    if (aabb(P.x, P.y, PW, PH, c.x - 2, c.y - 2, 20, 20)) {
      c.alive = false; score += 10;
      spawnSparkle(c.x + 8, c.y + 8);
      spawnPopup(c.x + 8, c.y, 100);
    }
  });

  // ── Enemies ──
  enemies.forEach(e => {
    if (!e.alive || e.dead) return;
    e.wt++;
    const tp = e.tp;
    let attacking = false;

    if (tp.imgA) {
      if (e.attackCd > 0) e.attackCd--;
      const distH = Math.abs((P.x + PW / 2) - (e.x + tp.sw / 2));
      // 20px tolerance: same surface = ~0px, adjacent platforms (16px gap) = fine,
      // platform-to-ground (32px gap) = blocked — prevents attacks through floor/ceiling.
      const sameLevel = Math.abs((P.y + PH) - (e.y + tp.sh)) < 20;

      if (!e.attacking && e.attackCd <= 0 && distH < tp.atkRange && sameLevel) {
        e.attacking = true;
        e.attackTick = 0;
        e.dir = (P.x + PW / 2 > e.x + tp.sw / 2) ? 1 : -1;
      }

      if (e.attacking) {
        attacking = true;
        e.attackTick++;
        const strikeFrame = Math.floor(tp.fa * 0.55);
        if (Math.floor(e.attackTick / 10) === strikeFrame && e.attackTick % 10 === 0) {
          if (distH < tp.atkHitRange && sameLevel && P.invincible <= 0) takeDamage();
        }
        if (e.attackTick >= tp.fa * 10) { e.attacking = false; e.attackCd = 110; }
        // Stay grounded while attacking
        if (!e.onGround) e.vy = Math.min(e.vy + GRAVITY, 10);
        e.y += e.vy;
        if (e.y + tp.fo >= GY) { e.y = GY - tp.fo; e.vy = 0; e.onGround = true; }
      }
    }

    if (!attacking) {
      resolveEnemy(e);
      if (e.x <= e.px0 || e.x + tp.sw >= e.px1) e.dir *= -1;
    }

    // Stomp / hurt (always active)
    if (P.invincible <= 0 && aabb(P.x, P.y, PW, PH, e.x + tp.hbx, e.y + tp.hby, tp.hbw, tp.hbh)) {
      if (P.vy > 0 && P.y + PH < e.y + tp.hby + tp.hbh * 0.6) {
        e.alive = false; e.dead = true; e.deathTick = tick;
        if (e.attacking) e.attacking = false;
        score += tp.pts;
        spawnSquish(e.x + tp.sw / 2, e.y + tp.hby);
        spawnPopup(e.x + tp.sw / 2, e.y, tp.pts);
        P.vy = JUMP_V * 0.5;
      } else {
        takeDamage();
      }
    }
  });

  // ── Boss ──
  if (boss.alive) {
    boss.wt++;
    if (boss.attackCd > 0) boss.attackCd--;
    const bDist = Math.abs((P.x + PW / 2) - (boss.x + 36));
    // boss body ends at y+62 in the 72px frame — same 20px tolerance as snake/scorpio
    const bossSameLevel = Math.abs((P.y + PH) - (boss.y + 72)) < 20;

    if (!boss.attacking && boss.attackCd <= 0 && bDist < 120 && bossSameLevel) {
      boss.attacking = true;
      boss.attackTick = 0;
      boss.dir = (P.x + PW / 2 > boss.x + 36) ? 1 : -1;
    }

    if (boss.attacking) {
      boss.attackTick++;
      if (boss.attackTick === 24 && bDist < 90 && bossSameLevel && P.invincible <= 0) takeDamage();
      if (boss.attackTick >= 4 * 12) { boss.attacking = false; boss.attackCd = 140; }
      if (!boss.onGround) boss.vy = Math.min(boss.vy + GRAVITY, 10);
      boss.y += boss.vy;
      if (boss.y + 72 >= GY) { boss.y = GY - 72; boss.vy = 0; boss.onGround = true; }
    } else {
      const wasOn = boss.onGround;
      boss.onGround = false;
      if (!wasOn) boss.vy = Math.min(boss.vy + GRAVITY, 10);
      boss.x += boss.dir * 0.8;
      boss.y += boss.vy;
      if (boss.y + 72 >= GY) { boss.y = GY - 72; boss.vy = 0; boss.onGround = true; }
      if (boss.x <= boss.px0 || boss.x + 72 >= boss.px1) boss.dir *= -1;
    }

    // Boss hitbox tightened to match visible centipede body (y+30, 48×32 in 72×72 frame)
    if (P.invincible <= 0 && aabb(P.x, P.y, PW, PH, boss.x + 12, boss.y + 30, 48, 32)) {
      if (P.vy > 0 && P.y + PH < boss.y + 46) {
        boss.alive = false; boss.dead = true; boss.deathTick = tick;
        score += 500;
        spawnConfetti();
        spawnPopup(boss.x + 36, boss.y + 16, 500);
        P.vy = JUMP_V * 0.55;
        // Boss kill: celebrate with confetti only — ? block is the only way to open party info
      } else {
        takeDamage();
      }
    }
  }

  // ── Particles / popups ──
  particles = particles.filter(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.life--; return p.life > 0;
  });
  popups = popups.filter(p => { p.y += p.vy; p.life--; return p.life > 0; });

  // ── Camera ──
  const targetX = P.x + PW / 2 - GW / 2;
  camX += (targetX - camX) * 0.1;
  camX = Math.max(0, Math.min(LW - GW, camX));

  // ── Fall off ──
  if (P.y > GH + 60) { P.health = 1; takeDamage(); }
}

// ════════════════════════════════════════════
//  BACKGROUND
// ════════════════════════════════════════════
function drawBgLayer(key, parallax) {
  const el = imgs[key];
  if (!el || !el.naturalWidth) return;
  const scale = GH / el.height;
  const iw = el.width * scale;
  const offset = (camX * parallax) % iw;
  const reps = Math.ceil(GW / iw) + 1;
  for (let r = 0; r <= reps; r++) {
    const dx = Math.round((r * iw - offset) * S);
    if (dx > canvas.width || dx + Math.ceil(iw * S) < 0) continue;
    ctx.drawImage(el, dx, 0, Math.ceil(iw * S), Math.ceil(GH * S));
  }
}

// ════════════════════════════════════════════
//  TERRAIN
// ════════════════════════════════════════════
function drawTileRect(key, rx, ry, rw, rh) {
  const el = imgs[key];
  if (!el || !el.naturalWidth) return;
  for (let ty = ry; ty < ry + rh; ty += TILE) {
    for (let tx = rx; tx < rx + rw; tx += TILE) {
      const dx = Math.round((tx - camX) * S);
      if (dx + Math.ceil(TILE * S) < 0 || dx > canvas.width) continue;
      ctx.drawImage(el, dx, Math.round(ty * S), Math.ceil(TILE * S), Math.ceil(TILE * S));
    }
  }
}

function drawGround() {
  drawTileRect('tileTop',  ground.x, ground.y,        ground.w, TILE);
  drawTileRect('tileBody', ground.x, ground.y + TILE, ground.w, ground.h - TILE);
}

function drawPlatform(p) {
  drawTileRect('tileTop', p.x, p.y, p.w, TILE);
}

// ════════════════════════════════════════════
//  ? BLOCK — always shows golden "?" (never changes state visually)
// ════════════════════════════════════════════
function drawQBlock() {
  let byOff = 0;
  const elapsed = tick - qblock.bounceTick;
  if (elapsed >= 0 && elapsed < 22) {
    byOff = -Math.sin(elapsed / 22 * Math.PI) * 8;
  }
  const bx = QB_X, bw = QB_W;
  const by = QB_Y + byOff, bh = QB_H;

  const pulse = Math.floor(tick / 9) % 2;
  wr(bx,     by,     bw,     bh,     '#7a5500');
  wr(bx + 2, by + 2, bw - 4, bh - 4, pulse ? '#f8c000' : '#ffda40');
  wr(bx + 2, by + 2, bw - 4, 2,      '#ffe860');
  wr(bx + 2, by + 2, 2,      bh - 4, '#ffe860');
  wr(bx + 2, by + bh - 4, bw - 4, 2, '#b08000');
  wr(bx + bw - 4, by + 2,  2, bh - 4, '#b08000');
  ctx.save();
  ctx.fillStyle = '#5a3800';
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.round(13 * S)}px 'Press Start 2P'`;
  ctx.fillText('?',
    Math.round((bx + bw / 2 - camX) * S),
    Math.round((by + bh * 0.72) * S));
  ctx.restore();
}

function drawQBHint() {
  const sx = QB_X + QB_W / 2 - camX;
  if (sx >= 8 && sx <= GW - 8) {
    const ay = QB_Y + QB_H + 10 + Math.sin(tick * 0.08) * 2;
    txtP('▲', QB_X + QB_W / 2, ay, '#ffe040', 7);
  } else if (sx > GW - 8) {
    sr(GW - 82, 16, 80, 14, '#000');
    sr(GW - 80, 18, 76, 10, '#00006a');
    txtF('PARTY INFO >', GW - 42, 27, '#ffe040', 9);
  }
}

// ════════════════════════════════════════════
//  COINS
// ════════════════════════════════════════════
function drawCoins() {
  const f = aframe(tick, 4, 3); // slow coin spin: 3 fps
  coins.forEach(c => {
    if (!c.alive) return;
    drawSW('coin', f, 4, c.x, c.y, 16, 16);
  });
}

// ════════════════════════════════════════════
//  PLAYER DRAW
// ════════════════════════════════════════════
function drawHeart(hx, hy, full) {
  const px = Math.max(1, Math.round(S));
  function dot(dx, dy) {
    ctx.fillRect(Math.round((hx + dx) * S), Math.round((hy + dy) * S), px, px);
  }
  ctx.fillStyle = full ? '#dd2020' : '#3a1010';
  [1,2,4,5].forEach(x => dot(x, 0));
  for (let x = 0; x <= 6; x++) dot(x, 1);
  for (let x = 0; x <= 6; x++) dot(x, 2);
  [1,2,3,4,5].forEach(x => dot(x, 3));
  [2,3,4].forEach(x => dot(x, 4));
  dot(3, 5);
  if (full) { ctx.fillStyle = '#ff8080'; dot(1, 1); dot(2, 1); dot(1, 2); }
}

function drawPlayer() {
  // Anchor sprite so art centre always sits at hitbox centre regardless of flip direction.
  // Facing right: art centre is at frame x=P_ART_CX; facing left (flipped): at P_SW-P_ART_CX.
  const artCX = P.face > 0 ? P_ART_CX : P_SW - P_ART_CX;
  const sx = P.x + PW / 2 - artCX;
  const sy = P.y - P_OY;
  const flip = P.face < 0;

  if (dying.active) {
    const f = Math.min(3, Math.floor(dying.tick / 10));
    drawSW('boyDeath', f, 4, sx, sy, P_SW, P_SH, flip);
    return;
  }

  const justHurt = tick - P.hurtTick < 18;
  if (P.airborne) {
    drawSW('boyWalk', 2, 6, sx, sy, P_SW, P_SH, flip);
  } else if (justHurt) {
    drawSW('boyHurt', 0, 2, sx, sy, P_SW, P_SH, flip);
  } else if (P.walk) {
    drawSW('boyWalk', P.wf, 6, sx, sy, P_SW, P_SH, flip);
  } else {
    drawSW('boyIdle', aframe(tick, 4, 4), 4, sx, sy, P_SW, P_SH, flip);
  }
}

// ════════════════════════════════════════════
//  ENEMY DRAW
// ════════════════════════════════════════════
function drawEnemy(e) {
  if (!e.alive && !e.dead) return;
  const tp = e.tp;

  if (e.dead) {
    const elapsed = tick - e.deathTick;
    if (elapsed > 28) return;
    ctx.globalAlpha = Math.max(0, 1 - elapsed / 28);
    const el = imgs[tp.imgW];
    if (el && el.naturalWidth) {
      const fw = el.width / tp.fw;
      const dx = Math.round((e.x - camX) * S);
      const dw = Math.ceil(tp.sw * S);
      ctx.drawImage(el, 0, 0, fw, el.height, dx,
        Math.round((e.y + tp.sh - 6) * S), dw, Math.ceil(6 * S));
    }
    ctx.globalAlpha = 1;
    return;
  }

  const flip = tp.facesLeft ? e.dir > 0 : e.dir < 0;

  if (e.attacking && tp.imgA) {
    const f = Math.min(tp.fa - 1, Math.floor(e.attackTick / 10));
    drawSW(tp.imgA, f, tp.fa, e.x, e.y, tp.sw, tp.sh, flip);
  } else {
    const f = aframe(e.wt, tp.fw, 4); // 4 fps walk animation
    drawSW(tp.imgW, f, tp.fw, e.x, e.y, tp.sw, tp.sh, flip);
  }
}

// ════════════════════════════════════════════
//  BOSS DRAW
// ════════════════════════════════════════════
function drawBoss() {
  if (!boss.alive && !boss.dead) return;
  const flip = boss.dir > 0; // centipede naturally faces LEFT

  if (boss.dead) {
    const elapsed = tick - boss.deathTick;
    if (elapsed > 60) return;
    ctx.globalAlpha = Math.max(0, 1 - elapsed / 60);
    const f = aframe(elapsed, 4, 6);
    drawSW('centDeath', f, 4, boss.x, boss.y, 72, 72, flip);
    ctx.globalAlpha = 1;
    return;
  }

  if (boss.attacking) {
    const f = Math.min(3, Math.floor(boss.attackTick / 12));
    drawSW('centAttack', f, 4, boss.x, boss.y, 72, 72, flip);
  } else {
    const f = aframe(boss.wt, 4, 4);
    drawSW('centWalk', f, 4, boss.x, boss.y, 72, 72, flip);
  }
}

// ════════════════════════════════════════════
//  PARTICLES & POPUPS
// ════════════════════════════════════════════
function drawParticles() {
  particles.forEach(p => {
    ctx.fillStyle = p.col;
    const r = Math.max(1, Math.round(2 * S));
    ctx.fillRect(Math.round((p.x - camX) * S - r / 2), Math.round(p.y * S - r / 2), r, r);
  });
}
function drawPopups() {
  popups.forEach(p => txtP(p.val, p.x - camX, p.y, '#ffe040', 5));
}

// ════════════════════════════════════════════
//  HUD
// ════════════════════════════════════════════
function drawHUD() {
  sr(0, 0, GW, 15, '#0a0f08');

  txtP(String(score * 10).padStart(6, '0'), 6, 11, '#fff', 6, 'left');
  txtP(`\xD7${lives}`, GW / 2 - 30, 11, '#fff', 6, 'left');
  for (let i = 0; i < 3; i++) drawHeart(GW / 2 - 10 + i * 10, 2, i < P.health);
  drawSS('coin', aframe(tick, 4, 3), 4, GW - 40, 2, 12, 12);
  txtP(`\xD7${coins.filter(c => !c.alive).length}`, GW - 26, 11, '#f8c000', 6, 'left');

  const prog = Math.min(1, P.x / QB_X);
  sr(4, 13, GW - 8, 2, '#1a1a1a');
  sr(4, 13, (GW - 8) * prog, 2, '#f8c000');
}

function drawBanner() {
  if (bannerTick > 200) return;
  const alpha = bannerTick < 160 ? 1 : 1 - (bannerTick - 160) / 40;
  ctx.globalAlpha = Math.max(0, alpha);
  const bw = 200, bh = 44, bx = (GW - bw) / 2, by = (GH - bh) / 2 - 20;
  sr(bx, by, bw, bh, '#000a00');
  ctx.strokeStyle = '#f8c000';
  ctx.lineWidth = Math.max(1, Math.round(2 * S));
  ctx.strokeRect(Math.round((bx + 2) * S), Math.round((by + 2) * S),
    Math.round((bw - 4) * S), Math.round((bh - 4) * S));
  txtP("MADIS' BIRTHDAY", GW / 2, by + 17, '#ffe040', 7);
  txtF('Find the ? block — stomp the boss!', GW / 2, by + 32, '#7ecfff', 9);
  ctx.globalAlpha = 1;
}

// ════════════════════════════════════════════
//  DRAW GAME WORLD
// ════════════════════════════════════════════
function drawGame() {
  drawBgLayer('bg1', 0);
  drawBgLayer('bg2', 0.04);
  drawBgLayer('bg3', 0.12);
  drawBgLayer('bg4', 0.28);
  drawBgLayer('bg5', 0.55);

  drawGround();
  platforms.forEach(drawPlatform);

  drawCoins();
  drawQBlock();

  enemies.forEach(drawEnemy);
  drawBoss();
  drawPlayer();

  drawParticles();
  drawPopups();
  drawQBHint();
  drawHUD();
  drawBanner();

  if (fadeAlpha > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fadeAlpha)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// ════════════════════════════════════════════
//  INTRO SCREEN
// ════════════════════════════════════════════
function drawIntro() {
  drawBgLayer('bg1', 0);
  drawBgLayer('bg2', 0);
  drawBgLayer('bg3', tick * 0.0002);
  drawBgLayer('bg4', tick * 0.0004);
  drawBgLayer('bg5', tick * 0.0008);

  const savedCam = camX; camX = 0;
  const numTiles = Math.ceil(GW / TILE) + 1;
  for (let i = 0; i < numTiles; i++) {
    drawSW('tileTop', 0, 1, i * TILE, GY, TILE, TILE);
    for (let row = 1; GY + row * TILE < GH + TILE; row++) {
      drawSW('tileBody', 0, 1, i * TILE, GY + row * TILE, TILE, TILE);
    }
  }
  const bx = ((tick * 1.2) % (GW + 64)) - 64;
  drawSW('boyWalk', aframe(tick, 6, 7), 6, bx, GY - 47, 48, 48);
  camX = savedCam;

  const pw = GW - 52, ph = GH - 92, px = 26, py = 16, cx = GW / 2;
  const pt = gameLang === 'pt';

  sr(px, py, pw, ph, 'rgba(0,5,0,0.90)');
  sr(px,      py,      pw, 3, '#f8c000');
  sr(px,      py+ph-3, pw, 3, '#f8c000');
  sr(px,      py,      3,  ph, '#f8c000');
  sr(px+pw-3, py,      3,  ph, '#f8c000');

  // Title: two lines
  txtF(pt ? 'ESTAS CONVIDADO PARA' : "YOU'RE INVITED TO", cx, py + 14, '#aad4ff', 9);
  txtP("MADIS'", cx, py + 28, '#ffe040', 10);
  txtP(pt ? 'ANIVERSARIO' : 'BIRTHDAY', cx, py + 42, '#ff8888', 10);

  sr(px + 12, py + 52, pw - 24, 1, '#444');

  txtF(pt ? 'Pisa os inimigos e encontra'      : 'Stomp the enemies and find',         cx, py + 63, '#7ecfff', 9);
  txtF(pt ? 'a caixa com os detalhes da festa' : 'the box with the party information', cx, py + 75, '#7ecfff', 9);

  sr(px + 12, py + 85, pw - 24, 1, '#333');

  txtF(pt ? '← →  mover   /   ↑  saltar' : '← →  move   /   ↑  jump', cx, py + 96, '#aaa', 9);

  sr(px + 12, py + 107, pw - 24, 1, '#333');

  // Language selector
  txtF('LANGUAGE', cx, py + 117, '#888', 8);
  const bw = 52, bh = 14, bgap = 10;
  const enX = cx - bw - bgap / 2, ptX = cx + bgap / 2;
  const btnY = py + 128;
  _lbEN = { x: enX, y: btnY, w: bw, h: bh };
  _lbPT = { x: ptX, y: btnY, w: bw, h: bh };

  const enSel = !pt;
  sr(enX, btnY, bw, bh, enSel ? '#005500' : '#111');
  sr(enX, btnY, bw, 2, enSel ? '#44dd44' : '#333');
  sr(enX, btnY, 2, bh, enSel ? '#44dd44' : '#333');
  sr(enX+bw-2, btnY, 2, bh, enSel ? '#003300' : '#1a1a1a');
  sr(enX, btnY+bh-2, bw, 2, enSel ? '#003300' : '#1a1a1a');
  txtF('EN', enX + bw / 2, btnY + 10, enSel ? '#88ff88' : '#555', 9);

  const ptSel = pt;
  sr(ptX, btnY, bw, bh, ptSel ? '#005500' : '#111');
  sr(ptX, btnY, bw, 2, ptSel ? '#44dd44' : '#333');
  sr(ptX, btnY, 2, bh, ptSel ? '#44dd44' : '#333');
  sr(ptX+bw-2, btnY, 2, bh, ptSel ? '#003300' : '#1a1a1a');
  sr(ptX, btnY+bh-2, bw, 2, ptSel ? '#003300' : '#1a1a1a');
  txtF('PT', ptX + bw / 2, btnY + 10, ptSel ? '#88ff88' : '#555', 9);

  // Start prompt — lower, with clear gap below language buttons
  if (Math.floor(tick / 28) % 2 === 0) {
    txtF(pt ? '►  PRIME ESPACO OU TOCA  ◄' : '►  PRESS SPACE OR TAP TO START  ◄',
         cx, py + 158, '#fff', 9);
  }
}

// ════════════════════════════════════════════
//  LOADING SCREEN
// ════════════════════════════════════════════
function drawLoading() {
  sr(0, 0, GW, GH, '#030a03');
  txtP('LOADING...', GW / 2, GH / 2 - 8, '#ffe040', 8);
  const pct = total > 0 ? loaded / total : 0;
  sr(GW / 2 - 64, GH / 2 + 6, 128, 8, '#222');
  sr(GW / 2 - 64, GH / 2 + 6, 128 * pct, 8, '#f8c000');
}

// ════════════════════════════════════════════
//  MAIN LOOP
// ════════════════════════════════════════════
function loop() {
  tick++;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (STATE === 'LOADING') {
    drawLoading();
    if (loaded >= total) STATE = 'INTRO';
  } else if (STATE === 'INTRO') {
    drawIntro();
  } else {
    update();
    drawGame();
  }

  requestAnimationFrame(loop);
}

document.fonts.ready.then(loop);
