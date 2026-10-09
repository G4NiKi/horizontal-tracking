/*
 * Two-panel pictograms for each advice item: "the current trace" on the left, "how to fix it" on the right.
 * Returns plain SVG strings. Colors come from the CSS classes (.pg-*) in style.css.
 * Top-down figures are drawn for a right-handed user and mirrored for left-handed users.
 */

// left panel: 116x74, guide line at y=37
const GUIDE = '<line class="pg-guide" x1="6" y1="37" x2="110" y2="37"/>';
const trace = d => `<path class="pg-trace" d="${d}"/>`;
const chevronR = (x, y) => `<path class="pg-trace" d="M${x - 4} ${y - 4} L${x} ${y} L${x - 4} ${y + 4}"/>`;
const chevronL = (x, y) => `<path class="pg-trace" d="M${x + 4} ${y - 4} L${x} ${y} L${x + 4} ${y + 4}"/>`;

/** Fine zigzag along y=cy, used for jitter and wobble. */
function wobble(x0, x1, cy, amp, step = 4) {
  let d = `M${x0} ${cy}`;
  for (let x = x0 + step, s = 1; x <= x1; x += step, s = -s) d += ` L${x} ${cy + amp * s}`;
  return d;
}

// right panel: 118x74
const line = (x1, y1, x2, y2, cls = 'pg-fig') => `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const label = (x, y, s, cls = 'pg-note') => `<text class="${cls}" x="${x}" y="${y}">${s}</text>`;
/** Arrow from (x1,y1) to (x2,y2). */
function arrow(x1, y1, x2, y2, cls = 'pg-good') {
  const a = Math.atan2(y2 - y1, x2 - x1), k = 5;
  const p = s => `${x2 - k * Math.cos(a + s)} ${y2 - k * Math.sin(a + s)}`;
  return `<path class="${cls}" d="M${x1} ${y1} L${x2} ${y2} M${p(0.5)} L${x2} ${y2} L${p(-0.5)}"/>`;
}

/** Top-down view: monitor, desk edge and body. Arm and pad are drawn by the caller. */
const TOP = [
  line(28, 5, 62, 5, 'pg-fig pg-thick'),
  line(4, 46, 114, 46, 'pg-muted'),
  '<ellipse class="pg-fig" cx="40" cy="62" rx="24" ry="7"/>',
  '<circle class="pg-fig" cx="40" cy="59" r="7"/>',
].join('');
const pad = (x, y, cls = 'pg-fig') => `<rect class="${cls}" x="${x}" y="${y}" width="32" height="24" rx="3"/>`;
const mouse = (x, y, cls = 'pg-fig', k = 1) => `<rect class="${cls}" x="${x - 4 * k}" y="${y - 6 * k}" width="${8 * k}" height="${12 * k}" rx="${4 * k}"/>`;
/** Right arm from the shoulder through the elbow to the hand. */
const arm = (ex, ey, hx, hy, cls = 'pg-fig') => `<path class="${cls}" d="M60 60 L${ex} ${ey} L${hx} ${hy}"/>`;

/** Side view: chair, desk and a seated person whose forearm rests on the desk. */
const SIDE = [
  `<path class="pg-muted" d="M8 18 L10 50 L38 50 M24 50 L24 72"/>`,
  `<path class="pg-muted" d="M54 40 L116 40 M110 40 L110 72"/>`,
  '<circle class="pg-fig" cx="22" cy="12" r="6"/>',
  `<path class="pg-fig" d="M20 19 L18 48 L46 48 L46 72"/>`,
  `<path class="pg-fig" d="M20 23 L34 37 L74 37"/>`,
  '<rect class="pg-fig" x="74" y="32" width="10" height="5" rx="2.5"/>',
].join('');

const PICTOS = {
  'bow-up': {
    alt: '軌跡が上向きの弧を描いている。腕全体を左右に平行移動させると直線になる',
    trace: trace('M10 50 Q58 14 106 50'),
    fixLabel: '腕ごと平行に動かす',
    mirror: true,
    fix: [
      `<rect class="pg-ghost" x="34" y="22" width="12" height="40" rx="6"/>`,
      `<rect class="pg-ghost" x="74" y="22" width="12" height="40" rx="6"/>`,
      `<rect class="pg-fig" x="54" y="22" width="12" height="40" rx="6"/>`,
      mouse(60, 14),
      arrow(50, 10, 30, 10), arrow(70, 10, 90, 10),
      label(60, 72, '支点を作らない', 'pg-note pg-mid'),
    ].join(''),
  },
  'bow-down': {
    alt: '軌跡が下向きの弧を描いている。脇を拳ひとつ分ほど開けると改善する',
    trace: trace('M10 24 Q58 60 106 24'),
    fixLabel: '脇を拳ひとつ分開ける',
    mirror: true,
    fix: TOP + pad(72, 10) + arm(86, 52, 88, 28) + mouse(88, 24) +
      '<circle class="pg-good pg-dash" cx="72" cy="56" r="5"/>' +
      label(100, 64, '拳1つ'),
  },
  tilt: {
    alt: '往復とも同じ向きに傾いている。マウス、パッド、体をモニターに対してまっすぐ揃える',
    trace: trace('M10 50 L106 30') + chevronR(106, 30) + trace('M106 40 L10 60') + chevronL(10, 60),
    fixLabel: 'マウスと体をまっすぐ',
    mirror: false,
    vflip: item => item.tilt < 0,
    fix: [
      `<g transform="rotate(-20 30 34)">${mouse(30, 34, 'pg-fig', 1.6)}</g>`,
      label(30, 64, '✕', 'pg-bad pg-mid'),
      mouse(84, 34, 'pg-good', 1.6),
      line(84, 8, 84, 22, 'pg-good pg-dash'),
      arrow(84, 52, 104, 52), arrow(84, 52, 64, 52),
      label(84, 68, '◯', 'pg-ok pg-mid'),
    ].join(''),
  },
  'creep-up': {
    alt: '往復のたびに上へずれていく。椅子に深く座り、肘を毎回同じ位置へ戻す',
    trace: trace('M8 62 L94 54 L8 46 L94 38 L8 30 L94 22') + arrow(106, 60, 106, 18, 'pg-trace'),
    fixLabel: '深く座り、肘を同じ位置へ',
    mirror: false,
    fix: SIDE + '<path class="pg-good pg-thick" d="M8 18 L10 50"/>' + '<circle class="pg-good" cx="34" cy="37" r="5"/>',
  },
  'creep-down': {
    alt: '往復のたびに下へずれていく。マウスパッドを体から少し離す',
    trace: trace('M8 12 L94 20 L8 28 L94 36 L8 44 L94 52') + arrow(106, 14, 106, 56, 'pg-trace'),
    fixLabel: 'パッドを体から離す',
    mirror: true,
    fix: TOP + pad(66, 26, 'pg-ghost') + pad(66, 12, 'pg-good') + arm(80, 46, 82, 24) + mouse(82, 22) + arrow(108, 40, 108, 20),
  },
  'side-out': {
    alt: '体の外側へ振るときだけ崩れている。マウスパッドを体の正面寄りに置く',
    trace: trace('M10 37 L58 37' + wobble(58, 106, 37, 7, 8).replace(/^M\S+ \S+/, '')),
    fixLabel: 'パッドを体の正面寄りに',
    mirror: true,
    fix: TOP + pad(78, 14, 'pg-ghost') + pad(52, 14, 'pg-good') + arm(72, 48, 68, 24) + mouse(68, 22) + arrow(108, 42, 88, 42),
  },
  'side-in': {
    alt: '体の内側へ引くときだけ崩れている。脇を少し開け、マウスパッドを利き手側へ離す',
    trace: trace(wobble(10, 58, 37, 7, 8) + ' L106 37'),
    fixLabel: 'パッドを利き手側へ',
    mirror: true,
    fix: TOP + pad(56, 14, 'pg-ghost') + pad(80, 14, 'pg-good') + arm(90, 50, 94, 24) + mouse(94, 22) + arrow(58, 42, 78, 42),
  },
  jitter: {
    alt: '軌跡が細かく震えている。前腕をデスクに乗せ、肘を約90度にしてマウスを軽く握る',
    trace: trace(wobble(10, 106, 37, 2.5)),
    fixLabel: '前腕を乗せて軽く握る',
    mirror: false,
    fix: SIDE + '<path class="pg-good" d="M34 29 A8 8 0 0 1 42 37"/>' + label(44, 28, '90°', 'pg-note pg-left') +
      line(56, 40, 74, 40, 'pg-good pg-thick'),
  },
  speed: {
    alt: 'ゆっくり振るとズレが小さく、速く振るとズレが大きい。ズレない速度まで落とす',
    trace: [
      line(6, 20, 110, 20, 'pg-guide'), trace('M10 21 L106 19'), label(4, 13, 'ゆっくり', 'pg-note pg-left'),
      line(6, 56, 110, 56, 'pg-guide'), trace(wobble(10, 106, 56, 7, 12)), label(4, 46, '速い', 'pg-note pg-left'),
    ].join(''),
    noGuide: true,
    fixLabel: 'ズレない速度まで落とす',
    mirror: false,
    fix: [
      '<path class="pg-fig" d="M24 56 A35 35 0 0 1 94 56"/>',
      '<path class="pg-good pg-thick" d="M24 56 A35 35 0 0 1 41 26"/>',
      arrow(59, 56, 38, 36, 'pg-fig'),
      '<circle class="pg-fill" cx="59" cy="56" r="3"/>',
      label(24, 70, '遅', 'pg-note pg-mid'), label(94, 70, '速', 'pg-note pg-mid'),
    ].join(''),
  },
  ok: {
    alt: '軌跡はガイド線の帯に収まっている。速度を上げるか感度を下げて負荷をかける',
    trace: '<rect class="pg-band" x="6" y="27" width="104" height="20"/>' + trace('M10 38 C40 35 70 39 106 36'),
    fixLabel: '負荷を上げる',
    mirror: false,
    fix: [
      arrow(30, 56, 30, 22), label(30, 70, '速度', 'pg-note pg-mid'),
      arrow(84, 22, 84, 56), label(84, 70, '感度', 'pg-note pg-mid'),
    ].join(''),
  },
};

const M = (a, d, e, w) => ` transform="matrix(${a} 0 0 ${d} ${e} ${w})"`;
/** Keeps text readable inside a horizontally mirrored group. */
const unflipText = s => s.replace(/<text ([^>]*?)x="([\d.-]+)" y="([\d.-]+)"/g, '<text $1transform="translate($2 $3) scale(-1 1)"');

/** Returns the pictogram SVG for an advice item, or '' if none exists. */
export function pictogram(item, hand = 'right') {
  const p = PICTOS[item.id];
  if (!p) return '';
  const h = hand === 'left' && p.mirror, v = p.vflip?.(item);
  const tr = h ? M(-1, 1, 116, 0) : v ? M(1, -1, 0, 74) : '';
  return `<svg class="pg" viewBox="0 0 260 96" role="img" aria-label="${p.alt}">` +
    `<text class="pg-cap" x="60" y="11">いまの軌跡</text>` +
    `<rect class="pg-panel" x="2" y="17" width="116" height="74" rx="4"/>` +
    `<g transform="translate(2 17)"><g${tr}>${p.noGuide ? '' : GUIDE}${p.trace}</g></g>` +
    `<path class="pg-arrow" d="M122 54 H134 M130 50 L134 54 L130 58"/>` +
    `<text class="pg-cap" x="199" y="11">${p.fixLabel}</text>` +
    `<rect class="pg-panel" x="140" y="17" width="118" height="74" rx="4"/>` +
    `<g transform="translate(140 17)">${h ? `<g${M(-1, 1, 118, 0)}>${unflipText(p.fix)}</g>` : p.fix}</g>` +
    `</svg>`;
}

export const PICTOGRAM_IDS = Object.keys(PICTOS);
