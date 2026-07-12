/**
 * Tribunal verdicts, rendered exactly as the OQS colors them:
 * pass #2FA96B · repair #D9822B · fail #C24141 · info #5BA8FF.
 * Two shapes: a verdict chip ("PASS", "REPAIRED ×2") and an axis chip
 * ("composition 85") whose dot takes the verdict color for that score.
 */

export type Verdict = "pass" | "repair" | "fail" | "info";

const chipTone: Record<Verdict, string> = {
  pass: "text-pass border-pass/30 bg-pass/8",
  repair: "text-repair border-repair/30 bg-repair/8",
  fail: "text-fail border-fail/30 bg-fail/8",
  info: "text-info border-info/35 bg-info/8",
};

const dotTone: Record<Verdict, string> = {
  pass: "bg-pass",
  repair: "bg-repair",
  fail: "bg-fail",
  info: "bg-info",
};

export function GradeChip({
  verdict,
  children,
  className = "",
}: {
  verdict: Verdict;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-sans text-[0.7rem] font-semibold tracking-[0.09em] uppercase ${chipTone[verdict]} ${className}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${dotTone[verdict]}`} />
      {children}
    </span>
  );
}

/** Verdict for a single OQS axis score: >=70 passes, 55–69 would repair, below fails. */
export function axisVerdict(score: number): Verdict {
  if (score >= 70) return "pass";
  if (score >= 55) return "repair";
  return "fail";
}

export function AxisChip({
  axis,
  score,
  className = "",
}: {
  axis: string;
  score: number;
  className?: string;
}) {
  const verdict = axisVerdict(score);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-ink/12 bg-ground px-2.5 py-0.5 font-mono text-[0.7rem] text-ink/75 ${className}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${dotTone[verdict]}`} />
      {axis.replace(/_/g, " ")}
      <span className="font-medium text-ink">{score}</span>
    </span>
  );
}
