"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";

const PrismCanvas = dynamic(() => import("./prism-3d"), { ssr: false, loading: () => null });
const AnimatedWalkthrough = dynamic(
  () => import("./walkthrough").then((module) => module.Walkthrough),
  { ssr: false, loading: () => null },
);

function supportsWebgl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function useReducedMotionPreference() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useIntentArm(enabled = true) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const arm = () => {
      setArmed(true);
      cleanup();
    };
    const cleanup = () => {
      for (const type of ["pointermove", "scroll", "touchstart", "keydown"]) {
        window.removeEventListener(type, arm);
      }
    };
    for (const type of ["pointermove", "scroll", "touchstart", "keydown"]) {
      window.addEventListener(type, arm, { once: true, passive: true });
    }
    return cleanup;
  }, [enabled]);
  return armed;
}

/** Only this tiny switch hydrates; the fallback SVG is server-rendered. */
export function HeroStone({ fallback }: { fallback: ReactNode }) {
  const reduced = useReducedMotionPreference();
  const intended = useIntentArm(!reduced);
  const [webgl, setWebgl] = useState(false);

  useEffect(() => {
    if (intended && !reduced) setWebgl(supportsWebgl());
  }, [intended, reduced]);

  return intended && webgl && !reduced ? <PrismCanvas /> : fallback;
}

/** The real animated replay is enhancement, not first-paint tax. Its detailed
 * static preview arrives from the server and is permanent under reduced motion. */
export function HeroWalkthrough({ fallback }: { fallback: ReactNode }) {
  const reduced = useReducedMotionPreference();
  const intended = useIntentArm(!reduced);
  return intended && !reduced ? <AnimatedWalkthrough /> : fallback;
}
