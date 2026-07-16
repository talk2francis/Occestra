"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Shared motion vocabulary: paper settles, rooms arrive, and work flows. */
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * A compositor-only reveal with one tiny observer per element. Server HTML is
 * visible, so content never disappears when JavaScript is late or unavailable.
 * Elements below the fold are hidden after hydration and settle once, in view.
 */
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
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const inView = el.getBoundingClientRect().top < window.innerHeight - 80;
    if (inView) return;
    setVisible(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -80px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const Tag = as;
  return (
    <Tag
      ref={ref as never}
      className={`reveal-flow${visible ? " is-visible" : ""} ${className}`}
      style={{ "--reveal-delay": `${delay}s`, "--reveal-distance": `${distance}px` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
