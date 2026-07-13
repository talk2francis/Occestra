"use client";

/**
 * Route transition: pages arrive like a sheet laid on the desk. CRITICAL:
 * the very first paint must never be animated — SSR'ing opacity:0 hides the
 * whole page until hydration and destroys LCP. Only client-side navigations
 * (template remounts after the first) get the entrance.
 */
import { motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";

declare global {
  interface Window {
    __oceNavigated?: boolean;
  }
}

export default function Template({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const isClientNav = typeof window !== "undefined" && window.__oceNavigated === true;

  useEffect(() => {
    window.__oceNavigated = true;
  }, []);

  return (
    <motion.div
      initial={isClientNav && !reduced ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
