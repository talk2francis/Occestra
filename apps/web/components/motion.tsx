"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Shared motion vocabulary. One easing, small distances, generous durations —
 * things settle like paper, they don't bounce. Every helper collapses to
 * opacity-only (or nothing) under prefers-reduced-motion.
 */

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function useRise(distance = 24): Variants {
  const reduced = useReducedMotion();
  return {
    hidden: { opacity: 0, y: reduced ? 0 : distance },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
  };
}

/** Fade+rise into view once, at a gentle stagger when it wraps children. */
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
  const reduced = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      initial={{ opacity: 0, y: reduced ? 0 : distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: EASE, delay }}
      className={className}
    >
      {children}
    </Tag>
  );
}
