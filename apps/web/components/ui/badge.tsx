import type { ReactNode } from "react";

type Tone = "neutral" | "amethyst" | "active";

const tones: Record<Tone, string> = {
  neutral: "border-ink/15 text-ink/70",
  amethyst: "border-amethyst/30 text-amethyst",
  // Lilac is reserved for live/generating states only. glow-live blooms on Nocturne.
  active: "border-lilac bg-lilac/25 text-plum glow-live",
};

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-sans text-[0.68rem] font-semibold tracking-[0.12em] uppercase ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
