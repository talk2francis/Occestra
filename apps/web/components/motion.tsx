import type { CSSProperties, ReactNode } from "react";

/** Shared motion vocabulary. Landing-page reveals are CSS so the first visit
 * does not download and evaluate an animation runtime merely to move paper
 * 24px. Studio interactions still use Framer where stateful choreography is
 * the product, and import this same easing tuple. */
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function Reveal({
  children,
  delay = 0,
  distance = 24,
  className = "",
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span" | "figure";
}) {
  const Tag = as;
  return (
    <Tag
      className={`reveal-rise ${className}`}
      style={
        {
          "--reveal-delay": `${delay}s`,
          "--reveal-distance": `${distance}px`,
        } as CSSProperties
      }
    >
      {children}
    </Tag>
  );
}
