"use client";

import { useEffect, useRef, useState } from "react";
import { axisVerdict } from "./grade-chip";

const dotTone = {
  pass: "bg-pass",
  repair: "bg-repair",
  fail: "bg-fail",
  info: "bg-info",
} as const;

export function AxisChip({ axis, score, className = "" }: { axis: string; score: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  const verdict = axisVerdict(score);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(score);
      return;
    }
    let frame = 0;
    let started = 0;
    const run = (at: number) => {
      if (!started) started = at;
      const t = Math.min(1, (at - started) / 680);
      setShown(Math.round(score * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(run);
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      frame = requestAnimationFrame(run);
    }, { threshold: 0.5 });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [score]);

  return (
    <span
      ref={ref}
      aria-label={`${axis.replace(/_/g, " ")} score ${score}`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-ink/12 bg-ground px-2.5 py-0.5 font-mono text-[0.7rem] text-ink/75 ${className}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${dotTone[verdict]}`} />
      {axis.replace(/_/g, " ")}
      <span aria-hidden className="min-w-[2ch] font-medium text-ink tabular-nums">{shown}</span>
    </span>
  );
}
