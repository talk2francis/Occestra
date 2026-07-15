import { useId } from "react";

/**
 * Guilloché — engine-turned engraving linework, generated parametrically.
 *
 * Certificate engraving is Occestra's provenance language: the same class of
 * ornament that guards banknotes and share certificates, drawn faintly at
 * section corners, around the seal, and behind the hero. Everything is inline
 * SVG built from ONE ring path reused via <use> rotations, so a full rosette
 * costs a few hundred bytes, not an asset.
 *
 * Color/opacity are theme physics, set in globals.css on .guilloche:
 * Daylight = ink at 4-6% (engraved), Nocturne = lilac at 5-8% (luminous).
 */

/** r(θ) = R + a·cos(nθ): one engine-turned ring as an SVG path about (0,0). */
function ringPath(R: number, a: number, n: number, steps = 96): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = R + a * Math.cos(n * t);
    pts.push(`${(r * Math.cos(t)).toFixed(1)},${(r * Math.sin(t)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

/**
 * A full rosette: `turns` copies of one ring, each rotated — the classic
 * engine-turned moiré. size = rendered box; the drawing fills it edge to edge.
 */
export function GuillocheRosette({
  size = 480,
  petals = 12,
  turns = 9,
  amplitude = 0.16,
  crop,
  className = "",
}: {
  size?: number;
  petals?: number;
  turns?: number;
  amplitude?: number;
  /** Render only this window of the full drawing (unit fractions of the box),
      so a rosette can hug a corner WITHOUT its element leaving the viewport. */
  crop?: { x: number; y: number; w: number; h: number };
  className?: string;
}) {
  const id = useId();
  const R = 100;
  const a = R * amplitude;
  const pad = R + a + 2;
  const box = pad * 2;
  const view = crop
    ? `${-pad + crop.x * box} ${-pad + crop.y * box} ${crop.w * box} ${crop.h * box}`
    : `${-pad} ${-pad} ${box} ${box}`;
  return (
    <svg
      aria-hidden
      width={crop ? size * crop.w : size}
      height={crop ? size * crop.h : size}
      viewBox={view}
      className={`guilloche ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="0.5"
    >
      <defs>
        <path id={`${id}-r`} d={ringPath(R, a, petals)} />
      </defs>
      {Array.from({ length: turns }, (_, i) => (
        <use key={i} href={`#${id}-r`} transform={`rotate(${(i * 180) / petals / turns}) scale(${1 - i * 0.055})`} />
      ))}
      <circle r={R * 0.32} strokeWidth="0.4" />
      <circle r={R * 0.29} strokeWidth="0.4" />
    </svg>
  );
}

/**
 * A guilloché ring sized to sit AROUND the seal mark — two interleaved
 * engine-turned bands. V2-5 rotates this slowly behind the seal press.
 */
export function GuillocheRing({
  size = 160,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const id = useId();
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="-120 -120 240 240"
      className={`guilloche ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="0.6"
    >
      <defs>
        <path id={`${id}-b`} d={ringPath(104, 7, 18)} />
        <path id={`${id}-c`} d={ringPath(96, 5, 24)} />
      </defs>
      <use href={`#${id}-b`} />
      <use href={`#${id}-b`} transform="rotate(5)" />
      <use href={`#${id}-c`} />
      <use href={`#${id}-c`} transform="rotate(3.75)" />
    </svg>
  );
}

/**
 * A corner ornament: a fan of concentric arcs with radial ticks — the corner
 * of an engraved certificate border. Point it with `corner`.
 */
export function GuillocheCorner({
  size = 120,
  corner = "tl",
  className = "",
}: {
  size?: number;
  corner?: "tl" | "tr" | "bl" | "br";
  className?: string;
}) {
  const flip = {
    tl: "",
    tr: "scale(-1,1)",
    bl: "scale(1,-1)",
    br: "scale(-1,-1)",
  }[corner];
  const arcs = [100, 88, 76, 64];
  const ticks = Array.from({ length: 13 }, (_, i) => (i * Math.PI) / 2 / 12);
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 110 110"
      className={`guilloche ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="0.6"
    >
      <g transform={flip} style={{ transformOrigin: "55px 55px" }}>
        {arcs.map((r) => (
          <path key={r} d={`M 0 ${r} A ${r} ${r} 0 0 1 ${r} 0`} transform="translate(0 0)" />
        ))}
        {ticks.map((t, i) => {
          const x1 = Math.sin(t) * 64;
          const y1 = Math.cos(t) * 64;
          const x2 = Math.sin(t) * (i % 3 === 0 ? 106 : 100);
          const y2 = Math.cos(t) * (i % 3 === 0 ? 106 : 100);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="0.45" />;
        })}
        <path d={`M 0 52 A 52 52 0 0 1 52 0`} strokeWidth="0.45" strokeDasharray="1.5 2.5" />
      </g>
    </svg>
  );
}
