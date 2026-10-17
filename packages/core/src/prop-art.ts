/**
 * The props' artwork, as SVG. One drawing serves both renderers: the
 * kiosk shows it as an image and the compositor rasterises it with
 * sharp (librsvg), so it keeps to what both draw alike: paths, circles,
 * ellipses, gradients and `<use>`, no filters, no text, no fonts.
 *
 * Nothing in a prop may read one way only: a guest who flips the photo
 * flips the props with it.
 */

export interface Art {
  svg: string;
  /** The viewBox, which every placement is a fraction of. */
  width: number;
  height: number;
}

function art(width: number, height: number, body: string): Art {
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`, width, height };
}

const GOLD = `
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff4c9"/><stop offset=".42" stop-color="#e7c272"/><stop offset="1" stop-color="#99692a"/>
  </linearGradient>`;
const PEARL = `
  <radialGradient id="pearl" cx=".36" cy=".32" r=".72">
    <stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#f1e8da"/><stop offset="1" stop-color="#b9a68b"/>
  </radialGradient>`;
const GOLD_EDGE = "#6f4c1b";

/** A gold crown with pearls on its points and a garnet at the front. */
export const CROWN = art(
  240,
  160,
  `<defs>${GOLD}${PEARL}
    <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6dc95"/><stop offset=".5" stop-color="#c89a47"/><stop offset="1" stop-color="#82581c"/>
    </linearGradient>
    <radialGradient id="garnet" cx=".35" cy=".3" r=".8">
      <stop offset="0" stop-color="#ff9cb0"/><stop offset=".4" stop-color="#b3163f"/><stop offset="1" stop-color="#4d0315"/>
    </radialGradient>
  </defs>
  <path d="M16 150 L16 120 L26 52 L52 98 L74 38 L99 94 L120 18 L141 94 L166 38 L188 98 L214 52 L224 120 L224 150 Z"
    fill="url(#gold)" stroke="${GOLD_EDGE}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M120 30 L132 90 L120 84 L108 90 Z" fill="#fff4c9" opacity=".45"/>
  <path d="M74 50 L88 92 L76 88 Z M166 50 L152 92 L164 88 Z" fill="#fff4c9" opacity=".35"/>
  <rect x="11" y="116" width="218" height="38" rx="6" fill="url(#band)" stroke="${GOLD_EDGE}" stroke-width="3"/>
  <rect x="17" y="121" width="206" height="4" rx="2" fill="#fff4c9" opacity=".7"/>
  <ellipse cx="120" cy="135" rx="15" ry="11" fill="url(#garnet)" stroke="${GOLD_EDGE}" stroke-width="2.5"/>
  <ellipse cx="115" cy="131" rx="5" ry="3" fill="#ffffff" opacity=".55"/>
  <circle cx="44" cy="135" r="7" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="1.5"/>
  <circle cx="80" cy="135" r="7" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="1.5"/>
  <circle cx="160" cy="135" r="7" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="1.5"/>
  <circle cx="196" cy="135" r="7" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="1.5"/>
  <circle cx="26" cy="48" r="10" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="2"/>
  <circle cx="74" cy="34" r="10" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="2"/>
  <circle cx="120" cy="13" r="11" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="2"/>
  <circle cx="166" cy="34" r="10" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="2"/>
  <circle cx="214" cy="48" r="10" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="2"/>`,
);

/** Roses, ivory buds and leaves along a gentle arc, worn at the hairline. */
export const FLOWERS = (() => {
  const W = 300;
  const H = 120;
  // The arc the garland follows, a quadratic from ear to ear over the brow.
  const p0 = { x: 18, y: 92 };
  const p1 = { x: 150, y: 22 };
  const p2 = { x: 282, y: 92 };
  const at = (t: number) => ({
    x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t ** 2 * p2.x,
    y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t ** 2 * p2.y,
  });
  const slope = (t: number) => {
    const dx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
    const dy = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };
  const f = (v: number) => v.toFixed(1);

  const leaves = [0.02, 0.11, 0.21, 0.31, 0.4, 0.5, 0.6, 0.69, 0.79, 0.89, 0.98]
    .map((t, i) => {
      const p = at(t);
      const a = slope(t) + (i % 2 ? 42 : -42);
      return `<g transform="translate(${f(p.x)} ${f(p.y)}) rotate(${f(a)})">
        <ellipse cx="18" cy="0" rx="20" ry="9" fill="url(#leaf)" stroke="#263d20" stroke-width="2.5"/>
        <path d="M4 0 L32 0" stroke="#263d20" stroke-width="2" opacity=".7"/></g>`;
    })
    .join("");

  // [t, radius, palette]: big roses at the front, smaller towards the ears.
  const roses: [number, number, "blush" | "ivory" | "dusk"][] = [
    [0.06, 17, "ivory"],
    [0.17, 22, "dusk"],
    [0.29, 24, "blush"],
    [0.4, 22, "ivory"],
    [0.5, 29, "blush"],
    [0.6, 22, "ivory"],
    [0.71, 24, "blush"],
    [0.83, 22, "dusk"],
    [0.94, 17, "ivory"],
  ];
  // Each palette's dark edge, which is what makes a bloom read small.
  const edge: Record<string, string> = { blush: "#a3485d", ivory: "#a98753", dusk: "#6b2338" };
  const rose = roses
    .map(([t, r, c]) => {
      const p = at(t);
      // Five round petals behind a round bloom, and a swirl into its heart.
      const petals = Array.from({ length: 5 }, (_, i) => {
        const a = ((-90 + 72 * i) * Math.PI) / 180;
        return `<circle cx="${f(0.5 * r * Math.cos(a))}" cy="${f(0.5 * r * Math.sin(a))}" r="${f(0.55 * r)}" fill="url(#${c})" stroke="${edge[c]}" stroke-width="${f(0.08 * r)}"/>`;
      }).join("");
      return `<g transform="translate(${f(p.x)} ${f(p.y)})">
        ${petals}
        <circle r="${f(0.64 * r)}" fill="url(#${c}-in)" stroke="${edge[c]}" stroke-width="${f(0.08 * r)}"/>
        <path d="M${f(-0.4 * r)} ${f(0.12 * r)} A${f(0.4 * r)} ${f(0.4 * r)} 0 1 1 ${f(0.34 * r)} ${f(-0.1 * r)} A${f(0.24 * r)} ${f(0.24 * r)} 0 1 0 ${f(-0.04 * r)} ${f(0.22 * r)} A${f(0.1 * r)} ${f(0.1 * r)} 0 1 1 ${f(0.08 * r)} ${f(0.02 * r)}"
          fill="none" stroke="${edge[c]}" stroke-width="${f(0.09 * r)}" stroke-linecap="round"/></g>`;
    })
    .join("");

  // Baby's breath between the roses: three ivory beads, edged.
  const buds = [0.115, 0.23, 0.345, 0.45, 0.55, 0.655, 0.77, 0.885]
    .map((t, i) => {
      const p = at(t);
      const dy = i % 2 ? -24 : -18;
      return `<g fill="#fbf7ef" stroke="#b9a68b" stroke-width="1.6">
        <circle cx="${f(p.x - 5)}" cy="${f(p.y + dy)}" r="4.6"/><circle cx="${f(p.x + 5)}" cy="${f(p.y + dy - 4)}" r="4"/><circle cx="${f(p.x + 1)}" cy="${f(p.y + dy - 11)}" r="3.6"/></g>`;
    })
    .join("");

  return art(
    W,
    H,
    `<defs>
      <linearGradient id="leaf" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#9dbb7f"/><stop offset="1" stop-color="#3e5c34"/>
      </linearGradient>
      <radialGradient id="blush" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#ffe3e8"/><stop offset=".6" stop-color="#f2adbb"/><stop offset="1" stop-color="#d47d91"/></radialGradient>
      <radialGradient id="blush-in" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fff0f2"/><stop offset="1" stop-color="#e998aa"/></radialGradient>
      <radialGradient id="ivory" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fffdf6"/><stop offset=".6" stop-color="#f4e6cc"/><stop offset="1" stop-color="#d9bf93"/></radialGradient>
      <radialGradient id="ivory-in" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#efdcb6"/></radialGradient>
      <radialGradient id="dusk" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#eba6b4"/><stop offset=".6" stop-color="#c25f75"/><stop offset="1" stop-color="#88344c"/></radialGradient>
      <radialGradient id="dusk-in" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#f5bfca"/><stop offset="1" stop-color="#b35068"/></radialGradient>
    </defs>
    <path d="M${p0.x} ${p0.y} Q${p1.x} ${p1.y} ${p2.x} ${p2.y}" fill="none" stroke="#3b5230" stroke-width="5" stroke-linecap="round"/>
    ${leaves}${buds}${rose}`,
  );
})();

/** A top hat in aubergine black with a champagne band. */
export const TOP_HAT = art(
  200,
  200,
  `<defs>${GOLD}
    <linearGradient id="silk" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#140f18"/><stop offset=".3" stop-color="#3b2d44"/><stop offset=".45" stop-color="#2a1f31"/><stop offset="1" stop-color="#0e0a11"/>
    </linearGradient>
    <linearGradient id="brim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a2c42"/><stop offset="1" stop-color="#0d090f"/>
    </linearGradient>
  </defs>
  <ellipse cx="100" cy="176" rx="94" ry="17" fill="url(#brim)" stroke="#06040a" stroke-width="2"/>
  <path d="M46 174 L52 26 Q100 14 148 26 L154 174 Q100 186 46 174 Z" fill="url(#silk)" stroke="#06040a" stroke-width="2"/>
  <ellipse cx="100" cy="26" rx="48" ry="11" fill="#2e2336" stroke="#06040a" stroke-width="2"/>
  <path d="M48 134 Q100 146 152 134 L153 160 Q100 172 47 160 Z" fill="url(#gold)" stroke="${GOLD_EDGE}" stroke-width="2"/>
  <path d="M50 139 Q100 150 150 139" fill="none" stroke="#fff4c9" stroke-width="2" opacity=".7"/>
  <path d="M70 32 L66 128" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity=".08"/>`,
);

/** Heart-shaped sunglasses in rose pink. */
export const HEARTS = (() => {
  // A heart 104 wide, its middle at the origin, its point at the bottom.
  const heart =
    "M0 40 C-14 30 -52 8 -52 -20 C-52 -40 -36 -50 -22 -50 C-10 -50 -2 -42 0 -34 C2 -42 10 -50 22 -50 C36 -50 52 -40 52 -20 C52 8 14 30 0 40 Z";
  const lens = (x: number) => `<g transform="translate(${x} 58)">
      <path d="${heart}" fill="url(#lens)" stroke="#9e0f3a" stroke-width="7" stroke-linejoin="round"/>
      <path d="M-36 -28 Q-30 -40 -16 -40" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity=".6"/></g>`;
  return art(
    260,
    110,
    `<defs>
      <linearGradient id="lens" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ff7aa0" stop-opacity=".88"/><stop offset="1" stop-color="#c2185b" stop-opacity=".92"/>
      </linearGradient>
    </defs>
    <path d="M8 34 L22 40 M252 34 L238 40" stroke="#9e0f3a" stroke-width="7" stroke-linecap="round"/>
    <path d="M120 36 Q130 26 140 36" fill="none" stroke="#9e0f3a" stroke-width="7" stroke-linecap="round"/>
    ${lens(72)}${lens(188)}`,
  );
})();

/** Round gold-wire spectacles. */
export const SPECS = art(
  260,
  100,
  `<defs>${GOLD}
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff4c9"/><stop offset=".5" stop-color="#d4a955"/><stop offset="1" stop-color="#8b5f22"/>
    </linearGradient>
  </defs>
  <path d="M6 40 L28 46 M254 40 L232 46" stroke="url(#rim)" stroke-width="6" stroke-linecap="round"/>
  <path d="M118 48 Q130 34 142 48" fill="none" stroke="url(#rim)" stroke-width="6" stroke-linecap="round"/>
  <circle cx="74" cy="52" r="44" fill="#fff8e8" fill-opacity=".14" stroke="url(#rim)" stroke-width="7"/>
  <circle cx="186" cy="52" r="44" fill="#fff8e8" fill-opacity=".14" stroke="url(#rim)" stroke-width="7"/>
  <path d="M46 30 Q58 18 76 18" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity=".45"/>
  <path d="M158 30 Q170 18 188 18" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity=".45"/>`,
);

/** A curled handlebar moustache, drawn as its right half and that half flipped. */
export const MOUSTACHE = art(
  220,
  76,
  `<defs>
    <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5a3824"/><stop offset=".5" stop-color="#2d1a10"/><stop offset="1" stop-color="#140a05"/>
    </linearGradient>
    <path id="half" d="M110 22 C118 10 140 8 160 16 C176 22 188 26 196 18 C203 11 200 4 194 5 C206 2 216 12 212 24 C208 36 196 42 184 40 C170 38 156 36 144 40 C132 44 120 50 110 50 Z"
      fill="url(#hair)" stroke="#0c0604" stroke-width="2.5" stroke-linejoin="round"/>
  </defs>
  <use href="#half"/>
  <use href="#half" transform="matrix(-1 0 0 1 220 0)"/>
  <path d="M110 20 C116 14 130 12 146 16" fill="none" stroke="#a37a57" stroke-width="3" stroke-linecap="round" opacity=".5"/>
  <path d="M110 20 C104 14 90 12 74 16" fill="none" stroke="#a37a57" stroke-width="3" stroke-linecap="round" opacity=".5"/>`,
);

/** A gold tiara: a low scalloped crest with a garnet drop at its peak and pearls on its points. */
export const TIARA = art(
  320,
  150,
  `<defs>${GOLD}${PEARL}
    <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6dc95"/><stop offset=".5" stop-color="#c89a47"/><stop offset="1" stop-color="#82581c"/>
    </linearGradient>
    <radialGradient id="garnet" cx=".35" cy=".3" r=".8">
      <stop offset="0" stop-color="#ff9cb0"/><stop offset=".4" stop-color="#b3163f"/><stop offset="1" stop-color="#4d0315"/>
    </radialGradient>
  </defs>
  <path d="M14 134 Q14 114 44 104 Q66 96 50 70 Q86 92 102 54 Q116 86 160 14 Q204 86 218 54 Q234 92 270 70 Q254 96 276 104 Q306 114 306 134 Z"
    fill="url(#gold)" stroke="${GOLD_EDGE}" stroke-width="4.5" stroke-linejoin="round"/>
  <path d="M160 30 L172 92 L160 84 L148 92 Z" fill="#fff4c9" opacity=".45"/>
  <path d="M14 134 Q160 110 306 134 L306 146 Q160 122 14 146 Z" fill="url(#band)" stroke="${GOLD_EDGE}" stroke-width="3"/>
  <path d="M22 134 Q160 112 298 134" fill="none" stroke="#fff4c9" stroke-width="2.5" opacity=".7"/>
  <ellipse cx="160" cy="78" rx="13" ry="17" fill="url(#garnet)" stroke="${GOLD_EDGE}" stroke-width="2.5"/>
  <ellipse cx="156" cy="71" rx="4" ry="5" fill="#ffffff" opacity=".55"/>
  <circle cx="160" cy="12" r="9" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="2"/>
  <circle cx="102" cy="50" r="8" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="2"/>
  <circle cx="218" cy="50" r="8" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="2"/>
  <circle cx="50" cy="68" r="7" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="2"/>
  <circle cx="270" cy="68" r="7" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="2"/>
  <circle cx="80" cy="117" r="5" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="1.5"/>
  <circle cx="120" cy="112" r="5" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="1.5"/>
  <circle cx="200" cy="112" r="5" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="1.5"/>
  <circle cx="240" cy="117" r="5" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="1.5"/>`,
);

/** A garnet silk bow tie, drawn as its right wing and that wing flipped, with a knot in the middle. */
export const BOW_TIE = art(
  260,
  120,
  `<defs>
    <linearGradient id="silk" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b8405e"/><stop offset=".45" stop-color="#8e1b3a"/><stop offset="1" stop-color="#4d0a1e"/>
    </linearGradient>
    <linearGradient id="knot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c9506e"/><stop offset=".5" stop-color="#8e1b3a"/><stop offset="1" stop-color="#3f0818"/>
    </linearGradient>
    <path id="wing" d="M130 60 L226 18 Q248 10 250 32 L250 52 Q244 60 250 68 L250 88 Q248 110 226 102 L130 60 Z"
      fill="url(#silk)" stroke="#2a0510" stroke-width="3.5" stroke-linejoin="round"/>
  </defs>
  <use href="#wing"/>
  <use href="#wing" transform="matrix(-1 0 0 1 260 0)"/>
  <path d="M136 60 L226 28 M136 60 L226 92" stroke="#3f0818" stroke-width="3" stroke-linecap="round" opacity=".55"/>
  <path d="M124 60 L34 28 M124 60 L34 92" stroke="#3f0818" stroke-width="3" stroke-linecap="round" opacity=".55"/>
  <rect x="111" y="36" width="38" height="48" rx="10" fill="url(#knot)" stroke="#2a0510" stroke-width="3.5"/>
  <path d="M120 44 Q130 40 140 44" fill="none" stroke="#ffd7e0" stroke-width="3" stroke-linecap="round" opacity=".5"/>`,
);

/** A party hat: an aubergine cone with gold bands, a blush pompom and a scalloped gold brim. */
export const PARTY_HAT = (() => {
  const W = 200;
  const H = 260;
  const apex = { x: 100, y: 30 };
  const base = { y: 234, rx: 72, ry: 12 };
  const hw = (y: number) => (base.rx * (y - apex.y)) / (base.y - apex.y);
  const f = (v: number) => v.toFixed(1);
  // A gold band between two heights, its edges bowed like the brim.
  const band = (y1: number, y2: number) => {
    const a = hw(y1);
    const b = hw(y2);
    const sag = (h: number) => (2 * base.ry * h) / base.rx;
    return `<path d="M${f(100 - a)} ${y1} Q100 ${f(y1 + sag(a))} ${f(100 + a)} ${y1} L${f(100 + b)} ${y2} Q100 ${f(y2 + sag(b))} ${f(100 - b)} ${y2} Z" fill="url(#gold)" stroke="${GOLD_EDGE}" stroke-width="2"/>`;
  };
  // Scallops along the brim: small gold beads every few units of its arc.
  const beads = Array.from({ length: 9 }, (_, i) => {
    const t = (i / 8) * Math.PI;
    const x = 100 - base.rx * Math.cos(t);
    const y = base.y + base.ry * Math.sin(t);
    return `<circle cx="${f(x)}" cy="${f(y)}" r="7" fill="url(#gold)" stroke="${GOLD_EDGE}" stroke-width="2"/>`;
  }).join("");
  const fluff = Array.from({ length: 7 }, (_, i) => {
    const t = (i / 7) * 2 * Math.PI;
    return `<circle cx="${f(100 + 17 * Math.cos(t))}" cy="${f(26 + 17 * Math.sin(t))}" r="9" fill="url(#pom)"/>`;
  }).join("");
  return art(
    W,
    H,
    `<defs>${GOLD}
      <linearGradient id="cone" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#1a1220"/><stop offset=".35" stop-color="#4a3658"/><stop offset=".5" stop-color="#34253f"/><stop offset="1" stop-color="#120b16"/>
      </linearGradient>
      <radialGradient id="pom" cx=".4" cy=".35" r=".7">
        <stop offset="0" stop-color="#ffe3e8"/><stop offset=".6" stop-color="#f2adbb"/><stop offset="1" stop-color="#c8657d"/>
      </radialGradient>
    </defs>
    <path d="M${apex.x} ${apex.y} L${f(100 + base.rx)} ${base.y} A${base.rx} ${base.ry} 0 0 1 ${f(100 - base.rx)} ${base.y} Z" fill="url(#cone)" stroke="#06040a" stroke-width="3" stroke-linejoin="round"/>
    ${band(88, 104)}${band(140, 160)}${band(192, 216)}
    <path d="M${f(100 - base.rx)} ${base.y} A${base.rx} ${base.ry} 0 0 0 ${f(100 + base.rx)} ${base.y}" fill="none" stroke="#06040a" stroke-width="3"/>
    ${beads}
    <path d="M${f(apex.x - 2)} ${apex.y + 10} L${f(100 - hw(84) * 0.6)} 84" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity=".1"/>
    ${fluff}
    <circle cx="100" cy="26" r="18" fill="url(#pom)"/>`,
  );
})();

/** Bunny ears on a headband: the artwork is a stock vector (4015599_29.svg, its bottom-right pair), cropped to the pair, with a firm edge added so the ivory reads on a bright wall. */
export const BUNNY_EARS = art(
  252,
  160,
  `<g transform="translate(-232 -274)">
    <ellipse transform="matrix(0.7962 -0.605 0.605 0.7962 -145.4303 239.0012)" fill="#EAE5E5" stroke="#7d6a5a" stroke-width="3" cx="282.054" cy="335.375" rx="23.97" ry="71.561"/>
    <path fill="#EF5488" d="M274.643,356.4c18.738,24.658,44.754,36.42,48.734,33.396c4.617-3.508-0.384-31.241-19.121-55.898 c-18.738-24.658-45.39-35.936-48.734-33.396C253.133,302.316,255.905,331.742,274.643,356.4z"/>
    <path fill="#F2799E" d="M285.37,363.782c14.834,19.521,35.43,28.833,38.581,26.438c3.655-2.778-0.304-24.732-15.138-44.253 c-14.834-19.521-35.934-28.45-38.581-26.438C268.342,320.966,270.536,344.262,285.37,363.782z"/>
    <path fill="#FFFFFF" d="M303.939,329.122c0,0-30.57-34.044-54.192-46.55C249.747,282.572,276.148,288.13,303.939,329.122z" />
    <path fill="#FFFFFF" d="M319.224,383.314c0,0-27.096-16.674-40.991-36.128C278.233,347.186,288.654,375.671,319.224,383.314 z"/>
    <ellipse transform="matrix(0.605 -0.7962 0.7962 0.605 -95.899 477.4298)" fill="#EAE5E5" stroke="#7d6a5a" stroke-width="3" cx="433.268" cy="335.375" rx="71.561" ry="23.97"/>
    <path fill="#EF5488" d="M440.679,356.4c-18.738,24.658-44.754,36.42-48.734,33.396c-4.617-3.508,0.384-31.241,19.121-55.898 c18.738-24.658,45.39-35.936,48.734-33.396C462.188,302.316,459.417,331.742,440.679,356.4z"/>
    <path fill="#F2799E" d="M429.952,363.782c-14.834,19.521-35.43,28.833-38.581,26.438 c-3.655-2.778,0.304-24.732,15.138-44.253c14.834-19.521,35.934-28.45,38.581-26.438 C446.98,320.966,444.786,344.262,429.952,363.782z"/>
    <path fill="#D8D4D4" stroke="#7d6a5a" stroke-width="3" stroke-linejoin="round" d="M358.059,385.398c26.612,0,48.511,20.153,51.284,46.029c0.196-1.827,0.302-3.68,0.302-5.558 c0-28.491-23.096-51.587-51.587-51.587c-28.491,0-51.587,23.096-51.587,51.587c0,1.879,0.107,3.732,0.302,5.558 C309.547,405.551,331.447,385.398,358.059,385.398z"/>
    <path fill="#EAE5E5" d="M358.059,382.619c26.612,0,48.511,20.153,51.284,46.029c0.196-1.827,0.302-3.68,0.302-5.558 c0-28.49-23.096-51.587-51.587-51.587c-28.491,0-51.587,23.096-51.587,51.587c0,1.879,0.107,3.732,0.302,5.558 C309.547,402.772,331.447,382.619,358.059,382.619z"/>
    <path fill="#FFFFFF" d="M328.705,385.398c0,0,27.791-16.674,59.055,0C387.76,385.398,360.664,358.997,328.705,385.398z"/>
    <path fill="#FFFFFF" d="M411.382,329.122c0,0,30.57-34.044,54.192-46.55C465.574,282.572,439.173,288.13,411.382,329.122z" />
    <path fill="#FFFFFF" d="M396.098,383.314c0,0,27.096-16.674,40.991-36.128C437.089,347.186,426.667,375.671,396.098,383.314 z"/></g>`,
);

/** A gold halo, floating a little above the head. */
export const HALO = art(
  240,
  80,
  `<defs>${GOLD}</defs>
  <ellipse cx="120" cy="40" rx="104" ry="28" fill="none" stroke="#fff1c2" stroke-width="30" opacity=".16"/>
  <ellipse cx="120" cy="40" rx="104" ry="28" fill="none" stroke="${GOLD_EDGE}" stroke-width="17"/>
  <ellipse cx="120" cy="40" rx="104" ry="28" fill="none" stroke="url(#gold)" stroke-width="11"/>
  <path d="M40 24 Q120 2 200 24" fill="none" stroke="#fff4c9" stroke-width="3" stroke-linecap="round" opacity=".75"/>`,
);

/** A masquerade mask in aubergine black, edged in gold, with a pearl at the brow. */
export const MASK = art(
  300,
  130,
  `<defs>${GOLD}${PEARL}
    <linearGradient id="velvet" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3b2d44"/><stop offset=".5" stop-color="#1c1422"/><stop offset="1" stop-color="#0c080f"/>
    </linearGradient>
  </defs>
  <path fill-rule="evenodd" fill="url(#velvet)" stroke="url(#gold)" stroke-width="6" stroke-linejoin="round"
    d="M150 44 C172 22 230 10 272 30 C302 44 298 92 262 106 C236 116 206 108 180 94 C166 86 156 88 150 92 C144 88 134 86 120 94 C94 108 64 116 38 106 C2 92 -2 44 28 30 C70 10 128 22 150 44 Z
       M50 60 C64 38 110 38 122 62 C110 84 64 84 50 60 Z
       M250 60 C236 38 190 38 178 62 C190 84 236 84 250 60 Z"/>
  <path fill="none" stroke="${GOLD_EDGE}" stroke-width="2" opacity=".8"
    d="M150 44 C172 22 230 10 272 30 C302 44 298 92 262 106 C236 116 206 108 180 94 C166 86 156 88 150 92 C144 88 134 86 120 94 C94 108 64 116 38 106 C2 92 -2 44 28 30 C70 10 128 22 150 44 Z"/>
  <path d="M60 28 Q40 42 44 66 M240 28 Q260 42 256 66" fill="none" stroke="url(#gold)" stroke-width="3" stroke-linecap="round" opacity=".7"/>
  <circle cx="150" cy="38" r="8" fill="url(#pearl)" stroke="${GOLD_EDGE}" stroke-width="2"/>`,
);
