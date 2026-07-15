/**
 * A sheet-settle route transition with no client runtime. It is transform-only
 * on first paint (never opacity:0), so LCP text is visible immediately; reduced
 * motion disables it in CSS.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="route-sheet">
      <span aria-hidden className="route-cue" />
      {children}
    </div>
  );
}
