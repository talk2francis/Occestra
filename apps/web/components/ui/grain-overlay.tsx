/**
 * The subtle paper grain over everything. Pure SVG turbulence in a data URI —
 * no image request, no animation, no scroll cost. Kept faint on purpose:
 * texture you feel rather than see.
 */
const NOISE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

export function GrainOverlay() {
  return (
    <div
      aria-hidden
      className="grain-overlay pointer-events-none fixed inset-0 z-50 opacity-[0.04] mix-blend-multiply"
      style={{ backgroundImage: NOISE, backgroundSize: "160px 160px" }}
    />
  );
}
