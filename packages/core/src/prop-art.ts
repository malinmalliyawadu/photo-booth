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

  const leaves = [0.03, 0.12, 0.2, 0.3, 0.38, 0.47, 0.55, 0.63, 0.71, 0.8, 0.88, 0.97]
    .map((t, i) => {
      const p = at(t);
      const a = slope(t) + (i % 2 ? 38 : -38);
      return `<g transform="translate(${f(p.x)} ${f(p.y)}) rotate(${f(a)})">
        <ellipse cx="17" cy="0" rx="18" ry="7.5" fill="url(#leaf)"/>
        <path d="M0 0 L32 0" stroke="#2f4a28" stroke-width="1.4" opacity=".6"/></g>`;
    })
    .join("");

  // [t, radius, palette]: big roses at the front, smaller towards the ears.
  const roses: [number, number, "blush" | "ivory" | "dusk"][] = [
    [0.07, 16, "ivory"],
    [0.18, 20, "blush"],
    [0.29, 18, "dusk"],
    [0.4, 23, "ivory"],
    [0.5, 27, "blush"],
    [0.6, 23, "ivory"],
    [0.71, 18, "dusk"],
    [0.82, 20, "blush"],
    [0.93, 16, "ivory"],
  ];
  const petal: Record<string, string> = { blush: "#b55a6c", ivory: "#b89b74", dusk: "#7d3346" };
  const rose = roses
    .map(([t, r, c]) => {
      const p = at(t);
      // Two rings of round petals, each edged and shaded, around a curled bud.
      const ring = (n: number, d: number, size: number, turn: number, fill: string) =>
        Array.from({ length: n }, (_, i) => {
          const a = ((turn + (360 / n) * i) * Math.PI) / 180;
          return `<circle cx="${f(d * r * Math.cos(a))}" cy="${f(d * r * Math.sin(a))}" r="${f(size * r)}" fill="${fill}" stroke="${petal[c]}" stroke-width="${f(0.05 * r)}" stroke-opacity=".7"/>`;
        }).join("");
      return `<g transform="translate(${f(p.x)} ${f(p.y)})">
        ${ring(5, 0.44, 0.56, -90, `url(#${c})`)}
        ${ring(3, 0.2, 0.44, -30, `url(#${c}-in)`)}
        <path d="M${f(-0.2 * r)} ${f(0.06 * r)} Q${f(-0.02 * r)} ${f(-0.3 * r)} ${f(0.2 * r)} ${f(-0.02 * r)} Q${f(0.06 * r)} ${f(0.22 * r)} ${f(-0.08 * r)} ${f(0.06 * r)}"
          fill="none" stroke="${petal[c]}" stroke-width="${f(0.08 * r)}" stroke-linecap="round"/></g>`;
    })
    .join("");

  // Baby's breath between the roses.
  const buds = [0.13, 0.24, 0.345, 0.45, 0.55, 0.655, 0.76, 0.87]
    .map((t, i) => {
      const p = at(t);
      const dy = i % 2 ? -20 : -15;
      return `<circle cx="${f(p.x - 3)}" cy="${f(p.y + dy)}" r="3.8" fill="#fbf7ef"/><circle cx="${f(p.x + 5)}" cy="${f(p.y + dy - 5)}" r="3.1" fill="#fbf7ef"/>`;
    })
    .join("");

  return art(
    W,
    H,
    `<defs>
      <linearGradient id="leaf" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#8fae72"/><stop offset="1" stop-color="#3e5c34"/>
      </linearGradient>
      <radialGradient id="blush" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#ffe6ea"/><stop offset=".65" stop-color="#f3b3c0"/><stop offset="1" stop-color="#d98698"/></radialGradient>
      <radialGradient id="blush-in" cx=".45" cy=".35" r=".7"><stop offset="0" stop-color="#fff1f3"/><stop offset="1" stop-color="#eda2b2"/></radialGradient>
      <radialGradient id="ivory" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#fffbf3"/><stop offset=".65" stop-color="#f3e5cb"/><stop offset="1" stop-color="#dac29a"/></radialGradient>
      <radialGradient id="ivory-in" cx=".45" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eedcb9"/></radialGradient>
      <radialGradient id="dusk" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#eaa9b6"/><stop offset=".65" stop-color="#c26277"/><stop offset="1" stop-color="#8e3a52"/></radialGradient>
      <radialGradient id="dusk-in" cx=".45" cy=".35" r=".7"><stop offset="0" stop-color="#f6c4ce"/><stop offset="1" stop-color="#b8566d"/></radialGradient>
    </defs>
    <path d="M${p0.x} ${p0.y} Q${p1.x} ${p1.y} ${p2.x} ${p2.y}" fill="none" stroke="#4d6b3d" stroke-width="4" stroke-linecap="round"/>
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
      <stop offset="0" stop-color="#4a2e1d"/><stop offset="1" stop-color="#160c07"/>
    </linearGradient>
    <path id="half" d="M110 30 C117 17 137 12 156 19 C172 25 183 33 195 27 C203 23 206 14 200 7 C213 11 215 30 201 41 C186 52 160 52 140 47 C126 44 116 43 110 47 Z"
      fill="url(#hair)" stroke="#0c0604" stroke-width="2" stroke-linejoin="round"/>
  </defs>
  <use href="#half"/>
  <use href="#half" transform="matrix(-1 0 0 1 220 0)"/>
  <path d="M122 25 C134 18 150 18 162 24" fill="none" stroke="#8a6448" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>
  <path d="M98 25 C86 18 70 18 58 24" fill="none" stroke="#8a6448" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>`,
);
