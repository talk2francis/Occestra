import type { ReactNode } from "react";

/**
 * The serif/grotesk pairing every section opens with: a tracked grotesk
 * kicker with a short rule, then the serif line. Left-aligned by default —
 * long editorial copy is never centered.
 */
export function SectionHeading({
  kicker,
  children,
  lede,
  align = "left",
  className = "",
}: {
  kicker: string;
  children: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  const centered = align === "center";
  return (
    <header className={`${centered ? "mx-auto flex flex-col items-center text-center" : ""} ${className}`}>
      <p className="text-kicker flex items-center gap-3 text-amethyst">
        {!centered && <span aria-hidden className="h-px w-8 bg-amethyst/50" />}
        {kicker}
      </p>
      <h2 className="text-headline mt-4 max-w-[18em] text-balance">{children}</h2>
      {lede && <p className="prose-measure mt-5 text-[1.02rem] leading-relaxed text-ink/65">{lede}</p>}
    </header>
  );
}
