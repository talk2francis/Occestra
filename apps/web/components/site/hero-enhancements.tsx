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
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) return false;
    const debug = context.getExtension("WEBGL_debug_renderer_info");
    const renderer = debug
      ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)).toLowerCase()
      : "";
    // A software renderer can technically create WebGL while delivering a
    // single-digit frame rate. That is not a capability; use the art-directed
    // SVG cluster instead.
    const software = /(swiftshader|llvmpipe|software rasterizer)/.test(renderer);
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return !software;
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
  const [performanceFailed, setPerformanceFailed] = useState(false);

  useEffect(() => {
    if (intended && !reduced) setWebgl(supportsWebgl());
  }, [intended, reduced]);

  return intended && webgl && !reduced && !performanceFailed
    ? <PrismCanvas onPerformanceFail={() => setPerformanceFailed(true)} />
    : fallback;
}

/** The real animated replay is enhancement, not first-paint tax. Its detailed
 * static preview arrives from the server and is permanent under reduced motion. */
export function HeroWalkthrough({ fallback }: { fallback: ReactNode }) {
  const reduced = useReducedMotionPreference();
  const intended = useIntentArm(!reduced);
  return intended && !reduced ? <AnimatedWalkthrough /> : fallback;
}
