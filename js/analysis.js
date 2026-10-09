// Pure logic only (no DOM dependencies). Tested with node --test.

/** Distance (px) the cursor must travel back from the farthest point before a reversal is recognized. */
export const REV = 12;
/** Strokes narrower than this fraction of the canvas width are not analyzed. */
export const MIN_SPAN_RATIO = 0.3;
/** Strokes with fewer points than this are not analyzed. */
export const MIN_POINTS = 15;
/** Number of most recent strokes advise() uses. */
export const RECENT = 20;

/**
 * Accumulates point samples and splits them into one stroke per left/right reversal.
 * onStroke(pts, dir) is called with dir = +1 (rightward) or -1 (leftward).
 */
export class StrokeSplitter {
  constructor(onStroke, { rev = REV, maxPoints = 6000 } = {}) {
    this.onStroke = onStroke;
    this.rev = rev;
    this.maxPoints = maxPoints;
    this.cur = null;
  }

  reset() {
    this.cur = null;
  }

  /** Points of the stroke in progress (for drawing). */
  get points() {
    return this.cur ? this.cur.pts : null;
  }

  push(x, y, t) {
    const p = { x, y, t };
    const cur = this.cur;
    if (!cur) {
      this.cur = { dir: 0, pts: [p], ext: x, extI: 0 };
      return;
    }
    cur.pts.push(p);
    if (cur.pts.length > this.maxPoints) {
      cur.pts.shift();
      cur.extI = Math.max(0, cur.extI - 1);
    }
    if (cur.dir === 0) {
      const d = x - cur.pts[0].x;
      if (Math.abs(d) > this.rev) {
        cur.dir = Math.sign(d);
        cur.ext = x;
        cur.extI = cur.pts.length - 1;
      }
      return;
    }
    if ((x - cur.ext) * cur.dir > 0) {
      cur.ext = x;
      cur.extI = cur.pts.length - 1;
    } else if ((cur.ext - x) * cur.dir > this.rev) {
      const seg = cur.pts.slice(0, cur.extI + 1);
      const rest = cur.pts.slice(cur.extI);
      const dir = cur.dir;
      this.cur = { dir: -dir, pts: rest, ext: x, extI: rest.length - 1 };
      this.onStroke(seg, dir);
    }
  }
}

export function spanOf(pts) {
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) {
    if (p.x < lo) lo = p.x;
    if (p.x > hi) hi = p.x;
  }
  return { lo, hi, span: hi - lo };
}

/** Whether the stroke should be analyzed. */
export function isAnalyzable(pts, canvasWidth) {
  return pts.length >= MIN_POINTS && spanOf(pts).span >= canvasWidth * MIN_SPAN_RATIO;
}

/** Solves a 3x3 system using Gaussian elimination with partial pivoting. Returns [0,0,0] when singular. */
export function solve3(A, b) {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    if (Math.abs(M[i][i]) < 1e-9) return [0, 0, 0];
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const f = M[r][i] / M[i][i];
      for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/**
 * Computes the metrics for one stroke. y is the offset from the guide line (downward is positive).
 * Normalizes x to u ∈ [-1, 1] and fits y = a + b·u + c·u² by least squares.
 */
export function analyze(pts, dir) {
  const n = pts.length;
  const { lo, span } = spanOf(pts);
  const half = span / 2, xmid = lo + half;
  let sAbs = 0, max = 0;
  const S = [0, 0, 0, 0, 0], T = [0, 0, 0];
  for (const p of pts) {
    const a = Math.abs(p.y);
    sAbs += a;
    if (a > max) max = a;
    const u = (p.x - xmid) / half;
    let uk = 1;
    for (let k = 0; k < 5; k++) {
      S[k] += uk;
      if (k < 3) T[k] += p.y * uk;
      uk *= u;
    }
  }
  const [, b, c] = solve3([[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]], T);
  // y is downward-positive, so negate it to get "positive means rising to the right"
  const tilt = Math.atan(-b / half) * 180 / Math.PI;

  // jitter: RMS of residuals from the moving average over ±3 neighboring points
  const w = 3;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    let s = 0, m = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) { s += pts[j].y; m++; }
    sq += (pts[i].y - s / m) ** 2;
  }

  const dur = (pts[n - 1].t - pts[0].t) / 1000;
  const dy = pts[n - 1].y - pts[0].y;
  return {
    dir, span, mean: sAbs / n, max, tilt,
    bow: c, bowR: c / span,
    jitter: Math.sqrt(sq / n),
    speed: dur > 0 ? span / dur : 0,
    dyR: dy / span,
  };
}

export const avg = (a, k) => a.length ? a.reduce((s, o) => s + o[k], 0) / a.length : NaN;

export function pearson(a, b) {
  const n = a.length;
  if (n < 2) return 0;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    sab += x * y; saa += x * x; sbb += y * y;
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
}

/** Direction (+1/-1) of swinging toward the outside of the body. */
export const outwardDir = hand => (hand === 'left' ? -1 : 1);

/** Number of strokes still needed before analysis can start. Returns 0 if analysis is ready. */
export function strokesNeeded(recent) {
  const r = recent.filter(s => s.dir > 0).length, l = recent.length - r;
  return Math.max(6 - recent.length, Math.max(0, 2 - r) + Math.max(0, 2 - l));
}

/**
 * Infers the user's habits from recent strokes and returns advice items.
 * Returns null when there are too few strokes.
 * @returns {{id:string,t:string,b:string,ok?:boolean,tilt?:number}[]|null}
 */
export function advise(recent, hand = 'right') {
  if (strokesNeeded(recent) > 0) return null;
  const all = recent;
  const outDir = outwardDir(hand);
  const out = [];

  const bowR = avg(all, 'bowR');
  if (bowR > 0.015) out.push({ id: 'bow-up', t: '軌跡が上向きの弧(∩)になっています',
    b: '手首や肘を支点にして腕を「振って」いるときの典型的な形です。支点を固定せず、腕全体を左右に平行移動させる意識で動かしてみてください。肘がデスクの縁に当たって支点になっている場合は、椅子を少し上げるか、マウスパッドを手前に寄せて前腕をデスクに乗せると直線を引きやすくなります。' });
  else if (bowR < -0.015) out.push({ id: 'bow-down', t: '軌跡が下向きの弧(∪)になっています',
    b: '振りの途中で腕を手前に引き込んでいます。脇を締めすぎて腕が体に当たっている可能性があります。脇を拳ひとつ分ほど開け、マウスパッドを少し利き手側に寄せてみてください。' });

  const tilt = avg(all, 'tilt');
  if (Math.abs(tilt) > 1.5) out.push({ id: 'tilt', tilt, t: `往復とも${tilt > 0 ? '右上がり' : '右下がり'}に約 ${Math.abs(tilt).toFixed(1)}° 傾いています`,
    b: '左右どちらに振っても同じ向きに傾くのは、腕の動く方向と画面の横軸が揃っていないサインです。手の中でマウスが斜めに回っていないか、マウスパッドの向き、体がモニターの正面を向いているかを確認してください。椅子をモニター正面に戻すだけで直ることもあります。' });

  // tilt cancels out across round trips, so look at the drift between the start and end points separately
  const creep = avg(all, 'dyR');
  if (Math.abs(creep) > 0.02) out.push(creep < 0
    ? { id: 'creep-up', t: '往復するたびに上へずれていきます', b: '手が少しずつ奥へ出ていく癖です。上体が前のめりになると起こりやすいので、椅子に深く座り、往復のたびに肘を同じ位置へ戻す意識を持ってください。' }
    : { id: 'creep-down', t: '往復するたびに下へずれていきます', b: '手が少しずつ体の側へ戻ってくる癖です。腕を引き寄せる力が入っています。脇を締めすぎていないか、マウスパッドが体に近すぎないかを確認してください。' });

  const O = all.filter(s => s.dir === outDir), I = all.filter(s => s.dir !== outDir);
  const eo = avg(O, 'mean') + avg(O, 'jitter'), ei = avg(I, 'mean') + avg(I, 'jitter');
  if (eo > ei * 1.4 && eo - ei > 2) out.push({ id: 'side-out', t: '体の外側へ振るときに崩れています',
    b: '腕が伸びきったり、肘が浮いたりすると起こりやすい崩れです。マウスパッドを体の正面寄りに置き、外側へ振っても肘が体から離れすぎない位置関係にしてみてください。椅子が低いと外側で肩が上がりやすいので、肘とデスクがほぼ同じ高さになるよう調整するのも有効です。' });
  else if (ei > eo * 1.4 && ei - eo > 2) out.push({ id: 'side-in', t: '体の内側へ引くときに崩れています',
    b: '腕が体や椅子のアームレストに当たって軌道が曲がっている可能性があります。脇を少し開ける、マウスパッドを利き手側へ少し離す、アームレストを下げるか外す、を試してください。' });

  const jit = avg(all, 'jitter');
  if (jit > 1.8) out.push({ id: 'jitter', t: '軌跡が細かく震えています',
    b: '握りが強すぎるか、腕が宙に浮いて支えがないと起こりやすい症状です。マウスは軽く包む程度に握り、前腕をデスクかパッドに乗せて動かしてみてください。椅子の高さは、肘を90°前後に曲げたとき前腕がデスクと水平になる位置が目安です。' });

  if (all.length >= 8) {
    const r = pearson(all.map(s => s.speed), all.map(s => s.mean));
    if (r > 0.5) out.push({ id: 'speed', t: '速く振るほどズレが大きくなっています',
      b: 'まずはズレが帯(±10px)の中に収まる速度まで落として往復し、安定してから少しずつ速度を上げていくのが近道です。' });
  }

  if (!out.length) out.push({ id: 'ok', ok: true, t: '目立ったクセはありません',
    b: `平均ズレは ${avg(all, 'mean').toFixed(1)}px です。速度を上げるか、感度倍率を下げて振り幅を大きくし、負荷をかけてみてください。` });
  return out;
}
