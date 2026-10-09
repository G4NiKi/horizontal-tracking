import { StrokeSplitter, isAnalyzable, analyze, advise, avg, strokesNeeded, RECENT } from './analysis.js';

const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const ov = $('ov'), ovText = $('ovText');

const MAX_PAST = 6, MAX_STROKES = 60;
const EMPTY_STATS = '<p class="empty">まだ記録がありません。</p>';
const EMPTY_ADVICE = '<p class="empty">左右に6往復ほどすると、クセの分析が表示されます。</p>';

let W = 0, H = 0, colors = {};
// vy is the offset from the guide line (downward is positive). Not clamped, so large misses are recorded as-is
let vx = 0, vy = 0;
let mode = 'none', active = false;
let past = [], strokes = [];
let lockFails = 0, lockMsg = '';
const settings = loadSettings();

const splitter = new StrokeSplitter((pts, dir) => {
  past.push(pts);
  if (past.length > MAX_PAST) past.shift();
  if (!isAnalyzable(pts, W)) return;
  strokes.push(analyze(pts, dir));
  if (strokes.length > MAX_STROKES) strokes.shift();
  render();
});

/* ---------- settings ---------- */
function loadSettings() {
  const d = { sens: 1, hand: 'right' };
  try {
    const s = JSON.parse(localStorage.getItem('ht-settings') || '{}');
    if (typeof s.sens === 'number' && s.sens > 0) d.sens = s.sens;
    if (s.hand === 'left' || s.hand === 'right') d.hand = s.hand;
  } catch { /* ignore when storage is unavailable */ }
  return d;
}
function saveSettings() {
  try { localStorage.setItem('ht-settings', JSON.stringify(settings)); } catch { /* ignore */ }
}

/* ---------- drawing ---------- */
function readColors() {
  const s = getComputedStyle(document.documentElement);
  for (const k of ['paper', 'grid', 'ink', 'muted', 'guide', 'trace']) colors[k] = s.getPropertyValue('--' + k).trim();
}

function resize() {
  const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  W = r.width; H = r.height;
  cv.width = Math.round(W * d); cv.height = Math.round(H * d);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  if (!vx || vx > W) vx = W / 2;
  drawNow();
}

let frame = 0;
function draw() {
  if (!frame) frame = requestAnimationFrame(drawNow);
}

const clampY = y => Math.max(-H / 2 + 4, Math.min(H / 2 - 4, y));

function path(pts, cy) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, cy + clampY(pts[0].y));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, cy + clampY(pts[i].y));
  ctx.stroke();
}

function drawNow() {
  frame = 0;
  if (!W) return;
  const cy = H / 2;
  ctx.fillStyle = colors.paper; ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = colors.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = W / 2 % 40; x < W; x += 40) { ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, H); }
  for (let y = cy % 40; y < H; y += 40) { ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(W, Math.round(y) + .5); }
  ctx.stroke();

  ctx.globalAlpha = .1; ctx.fillStyle = colors.guide; ctx.fillRect(0, cy - 10, W, 20); ctx.globalAlpha = 1;
  ctx.strokeStyle = colors.guide; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();

  ctx.strokeStyle = colors.trace; ctx.lineJoin = 'round'; ctx.lineWidth = 1.5;
  past.forEach((p, i) => { ctx.globalAlpha = .12 + .07 * i; path(p, cy); });
  ctx.globalAlpha = 1; ctx.lineWidth = 2.5;
  if (splitter.points) path(splitter.points, cy);

  if (active) {
    ctx.fillStyle = colors.ink;
    ctx.beginPath(); ctx.arc(vx, cy + clampY(vy), 4, 0, Math.PI * 2); ctx.fill();
    ctx.font = '13px "IBM Plex Sans JP",sans-serif'; ctx.fillStyle = colors.muted;
    const d = Math.round(Math.abs(vy));
    ctx.fillText(d === 0 ? 'ズレ 0px' : `ズレ ${vy < 0 ? '上' : '下'} ${d}px`, 12, 22);
    // The overlay is hidden while running, so keep the controls visible on the canvas
    ctx.textAlign = 'right';
    ctx.fillText(mode === 'lock' ? 'Esc で終了 / Space で線に戻る' : '通常カーソルで計測中 / Esc で終了', W - 12, 22);
    ctx.textAlign = 'left';
  }
}

/* ---------- stats & advice ---------- */
const f1 = v => isNaN(v) ? '—' : v.toFixed(1);
const f0 = v => isNaN(v) ? '—' : Math.round(v).toString();
const sg = v => isNaN(v) ? '—' : (v > 0 ? '+' : '') + v.toFixed(1);

function render() {
  if (!strokes.length) {
    $('stats').innerHTML = EMPTY_STATS;
    $('advice').innerHTML = EMPTY_ADVICE;
    return;
  }
  const recent = strokes.slice(-RECENT);
  const last = strokes[strokes.length - 1];
  const R = recent.filter(s => s.dir > 0), L = recent.filter(s => s.dir < 0);
  const right = settings.hand === 'right';
  const rl = right ? '右へ(外側)' : '右へ(内側)', ll = right ? '左へ(内側)' : '左へ(外側)';
  const rows = [
    ['平均ズレ (px)', 'mean', f1], ['最大ズレ (px)', 'max', f1],
    ['傾き (°、+は右上がり)', 'tilt', sg], ['弧 (px、+は上に凸)', 'bow', sg],
    ['震え (px)', 'jitter', f1], ['速度 (px/秒)', 'speed', f0],
  ];
  let h = `<table><thead><tr><th></th><th>直前の1本</th><th>${rl}</th><th>${ll}</th></tr></thead><tbody>`;
  for (const [lab, k, fmt] of rows) h += `<tr><td>${lab}</td><td>${fmt(last[k])}</td><td>${fmt(avg(R, k))}</td><td>${fmt(avg(L, k))}</td></tr>`;
  h += `</tbody></table><p class="note">直近 ${recent.length} 本の平均(全 ${strokes.length} 本)</p>`;
  $('stats').innerHTML = h;

  const items = advise(recent, settings.hand);
  $('advice').innerHTML = items
    ? '<ul class="advice">' + items.map(i => `<li class="${i.ok ? 'ok' : ''}"><strong>${i.t}</strong><span>${i.b}</span></li>`).join('') + '</ul>'
    : `<p class="empty">分析にはあと ${strokesNeeded(recent)} 本ほど必要です。左右に大きく往復してください。</p>`;
}

/* ---------- input ---------- */
function setOverlay() {
  if (active) { ov.classList.add('hidden'); return; }
  ov.classList.remove('hidden');
  if (!matchMedia('(pointer: fine)').matches) { ovText.textContent = 'マウスを接続した PC で開いてください'; return; }
  ovText.innerHTML = (lockMsg ? `${lockMsg}<br>` : '') + 'クリックして開始<br>Space で線に戻る / Esc で終了';
}

function start(m) {
  mode = m; active = true; lockMsg = '';
  vx = W / 2; vy = 0; splitter.reset();
  setOverlay(); draw();
}
function stop() {
  active = false; splitter.reset();
  setOverlay(); draw();
}

/** Wraps requestPointerLock as a Promise that resolves or rejects via the pointerlockchange / pointerlockerror events (also handles older browsers that do not return a Promise). */
function requestLock(opts) {
  return new Promise((resolve, reject) => {
    const done = ok => () => {
      document.removeEventListener('pointerlockchange', onChange);
      document.removeEventListener('pointerlockerror', onError);
      ok ? resolve() : reject(new Error('pointer lock failed'));
    };
    const onChange = done(true), onError = done(false);
    document.addEventListener('pointerlockchange', onChange);
    document.addEventListener('pointerlockerror', onError);
    try {
      const r = opts ? cv.requestPointerLock(opts) : cv.requestPointerLock();
      if (r && r.catch) r.catch(onError);
    } catch { onError(); }
  });
}

async function lock() {
  try {
    // unadjustedMovement: disables OS cursor acceleration (Chromium only)
    await requestLock({ unadjustedMovement: true });
  } catch {
    try { await requestLock(); } catch {
      // Chrome rejects re-locking for about 1 second after exiting with Esc, so only fall back to free mode after repeated failures
      if (++lockFails >= 2) start('free');
      else { lockMsg = 'マウスをロックできませんでした。少し待ってからもう一度クリックしてください。'; setOverlay(); }
      return;
    }
  }
  lockFails = 0;
}

cv.addEventListener('click', () => {
  if (active) return;
  if (cv.requestPointerLock) lock(); else start('free');
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === cv) start('lock');
  else if (mode === 'lock' && active) stop();
});

document.addEventListener('mousemove', e => {
  if (!active) return;
  if (mode === 'lock' && document.pointerLockElement === cv) {
    vx = Math.max(0, Math.min(W, vx + e.movementX * settings.sens));
    vy += e.movementY * settings.sens;
  } else if (mode === 'free' && e.target === cv) {
    vx = e.offsetX; vy = e.offsetY - H / 2;
  } else return;
  splitter.push(vx, vy, e.timeStamp);
  draw();
});

document.addEventListener('keydown', e => {
  if (!active) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (mode === 'lock') { vy = 0; splitter.reset(); draw(); }
  }
  if (e.code === 'Escape' && mode === 'free') stop();
});

/* ---------- controls ---------- */
const sensEl = $('sens'), handEl = $('hand');
sensEl.value = settings.sens; $('sensOut').textContent = settings.sens.toFixed(1);
handEl.value = settings.hand;

sensEl.addEventListener('input', () => {
  settings.sens = parseFloat(sensEl.value);
  $('sensOut').textContent = settings.sens.toFixed(1);
  saveSettings();
});
handEl.addEventListener('change', () => {
  settings.hand = handEl.value;
  saveSettings();
  render();
});
$('reset').addEventListener('click', () => {
  strokes = []; past = []; splitter.reset();
  render(); draw();
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });
window.addEventListener('resize', resize);
readColors(); resize(); setOverlay();
