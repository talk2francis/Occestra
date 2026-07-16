/** Pages arrive like a sheet laid onto the Studio desk. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="route-sheet">
      <span aria-hidden className="route-cue" />
      {children}
    </div>
  );
}
