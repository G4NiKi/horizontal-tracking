import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StrokeSplitter, analyze, advise, isAnalyzable, solve3, pearson, strokesNeeded } from '../js/analysis.js';

/** Generates a horizontal stroke from x0 to x1 with y = f(u) (u ∈ [-1, 1]). */
function stroke(x0, x1, f, { n = 100, dur = 500, t0 = 0 } = {}) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const r = i / (n - 1), x = x0 + (x1 - x0) * r;
    const u = (x - (x0 + x1) / 2) / (Math.abs(x1 - x0) / 2);
    pts.push({ x, y: f(u, i), t: t0 + dur * r });
  }
  return pts;
}

/** Generates count alternating left/right strokes and returns their analysis results. */
function session(count, f, opts = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const dir = i % 2 ? -1 : 1;
    const pts = dir > 0 ? stroke(100, 700, f, opts) : stroke(700, 100, f, opts);
    out.push(analyze(pts, dir));
  }
  return out;
}

const ids = items => items.map(i => i.id);

test('solve3 solves a known system', () => {
  const [a, b, c] = solve3([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3]);
  assert.ok(Math.abs(a - 2) < 1e-9 && Math.abs(b - 3) < 1e-9 && Math.abs(c + 1) < 1e-9);
});

test('pearson: perfect correlation and fewer than 2 points', () => {
  assert.ok(Math.abs(pearson([1, 2, 3], [2, 4, 6]) - 1) < 1e-12);
  assert.equal(pearson([1], [1]), 0);
});

test('analyze: a straight stroke has tilt, bow, and jitter all near 0', () => {
  const m = analyze(stroke(100, 700, () => 0), 1);
  assert.equal(m.span, 600);
  assert.ok(Math.abs(m.tilt) < 1e-6 && Math.abs(m.bow) < 1e-6 && m.jitter < 1e-6);
  assert.ok(Math.abs(m.speed - 1200) < 1e-6);
});

test('analyze: a stroke rising to the right has positive tilt (y is downward-positive)', () => {
  // dropping 30px from the left edge to the right edge = rising to the right
  const m = analyze(stroke(100, 700, u => -15 * u), 1);
  assert.ok(Math.abs(m.tilt - Math.atan(15 / 300) * 180 / Math.PI) < 1e-6);
});

test('analyze: an arc with both ends lower (∩) has positive bow', () => {
  const m = analyze(stroke(100, 700, u => 20 * u * u - 10), 1);
  assert.ok(Math.abs(m.bow - 20) < 1e-6);
});

test('analyze: zigzag increases jitter', () => {
  const m = analyze(stroke(100, 700, (u, i) => (i % 2 ? 3 : -3)), 1);
  assert.ok(m.jitter > 2);
});

test('isAnalyzable: excludes strokes that are too narrow or have too few points', () => {
  assert.ok(isAnalyzable(stroke(100, 700, () => 0), 800));
  assert.ok(!isAnalyzable(stroke(100, 300, () => 0), 800));
  assert.ok(!isAnalyzable(stroke(100, 700, () => 0, { n: 10 }), 800));
});

test('StrokeSplitter: splits a round trip at the farthest point', () => {
  const got = [];
  const s = new StrokeSplitter((pts, dir) => got.push({ dir, first: pts[0].x, last: pts[pts.length - 1].x }));
  let t = 0;
  for (let x = 100; x <= 700; x += 10) s.push(x, 0, t++);
  for (let x = 690; x >= 100; x -= 10) s.push(x, 0, t++);
  for (let x = 110; x <= 300; x += 10) s.push(x, 0, t++);
  assert.deepEqual(got, [
    { dir: 1, first: 100, last: 700 },
    { dir: -1, first: 700, last: 100 },
  ]);
});

test('StrokeSplitter: small back-and-forth movements below REV are not split', () => {
  const got = [];
  const s = new StrokeSplitter(() => got.push(1));
  let t = 0;
  for (let x = 100; x <= 400; x += 10) s.push(x, 0, t++);
  s.push(392, 0, t++);
  for (let x = 400; x <= 700; x += 10) s.push(x, 0, t++);
  assert.equal(got.length, 0);
});

test('StrokeSplitter: splits at the correct position even when maxPoints trims points', () => {
  const got = [];
  const s = new StrokeSplitter((pts, dir) => got.push({ dir, last: pts[pts.length - 1].x }), { maxPoints: 20 });
  let t = 0;
  for (let x = 100; x <= 700; x += 10) s.push(x, 0, t++);
  for (let x = 690; x >= 600; x -= 10) s.push(x, 0, t++);
  assert.deepEqual(got, [{ dir: 1, last: 700 }]);
});

test('strokesNeeded / advise: returns null without at least 6 strokes and 2 per side', () => {
  assert.equal(strokesNeeded([]), 6);
  const five = session(5, () => 0);
  assert.equal(advise(five), null);
  const rightOnly = session(7, () => 0).filter(s => s.dir > 0).concat(session(1, () => 0));
  assert.ok(strokesNeeded(rightOnly) > 0);
});

test('advise: a clean stroke produces only the "no issues" item', () => {
  assert.deepEqual(ids(advise(session(8, () => 0))), ['ok']);
});

test('advise: detects ∩ and ∪ arcs', () => {
  assert.ok(ids(advise(session(8, u => 20 * u * u - 10))).includes('bow-up'));
  assert.ok(ids(advise(session(8, u => -20 * u * u + 10))).includes('bow-down'));
});

test('advise: detects tilt in the same direction both ways', () => {
  assert.ok(ids(advise(session(8, u => -15 * u))).includes('tilt'));
});

test('advise: detects collapse on the outward side, flipping by handedness', () => {
  // only rightward strokes (dir > 0) are offset by 6px
  const strokes = [];
  for (let i = 0; i < 8; i++) {
    const dir = i % 2 ? -1 : 1;
    const f = dir > 0 ? () => 6 : () => 0;
    strokes.push(analyze(dir > 0 ? stroke(100, 700, f) : stroke(700, 100, f), dir));
  }
  assert.ok(ids(advise(strokes, 'right')).includes('side-out'));
  assert.ok(ids(advise(strokes, 'left')).includes('side-in'));
});

test('advise: detects deviation that increases with speed', () => {
  const strokes = [];
  for (let i = 0; i < 10; i++) {
    const dir = i % 2 ? -1 : 1, dur = 1000 - i * 80, off = i * 0.5;
    const f = u => off * (1 - u * u);
    strokes.push(analyze(dir > 0 ? stroke(100, 700, f, { dur }) : stroke(700, 100, f, { dur }), dir));
  }
  assert.ok(ids(advise(strokes)).includes('speed'));
});

test('every advice id has a pictogram', async () => {
  const { PICTOGRAM_IDS, pictogram } = await import('../js/pictograms.js');
  const ids = ['bow-up', 'bow-down', 'tilt', 'creep-up', 'creep-down', 'side-out', 'side-in', 'jitter', 'speed', 'ok'];
  assert.deepEqual([...PICTOGRAM_IDS].sort(), [...ids].sort());
  for (const id of ids) for (const hand of ['right', 'left']) {
    const svg = pictogram({ id, tilt: -2 }, hand);
    assert.match(svg, /^<svg [^>]*>.*<\/svg>$/s);
    assert.doesNotMatch(svg, /NaN|undefined/);
  }
});

test('VALORANT sensitivity converts to pixels per count', async () => {
  const { pxPerCount, parseSens } = await import('../js/sensitivity.js');
  // half the screen width corresponds to tan(51.5°) radians at the center: 39.6° of yaw
  const W = 1000, k = pxPerCount(1, W);
  const deg = (W / 2) / k * 0.07;
  assert.ok(Math.abs(deg - Math.tan(51.5 * Math.PI / 180) * 180 / Math.PI) < 1e-9);
  assert.ok(Math.abs(pxPerCount(0.5, W) - k / 2) < 1e-12);
  assert.equal(parseSens('0,35'), 0.35);
  assert.equal(parseSens(''), null);
  assert.equal(parseSens(0), null);
  assert.equal(parseSens(11), null);
});
