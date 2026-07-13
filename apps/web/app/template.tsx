"use client";

/**
 * Route transition: pages arrive like a sheet laid on the desk — a short
 * rise-and-settle, nothing sliding around. Remounts on every navigation.
 */
import { motion, useReducedMotion } from "framer-motion";

export default function Template({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
