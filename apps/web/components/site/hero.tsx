"use client";

import { motion, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { EASE } from "@/components/motion";
import { Walkthrough } from "./walkthrough";

/**
 * The SVG prism: the fallback face of the 3D stone — reduced motion, missing
 * WebGL, and the beat before the lazy chunk lands.
 */
function Prism() {
  const reduced = useReducedMotion();
  return (
    <motion.svg
      viewBox="0 0 120 140"
      className="h-24 w-auto sm:h-32"
      aria-hidden
      animate={reduced ? {} : { rotate: [0, 4, 0, -4, 0], y: [0, -6, 0] }}
      transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
    >
      <g strokeLinejoin="round">
        <polygon points="60,4 112,52 60,136 8,52" fill="#6B3FA0" opacity="0.16" />
        <polygon points="60,4 112,52 60,78" fill="#6B3FA0" opacity="0.5" />
        <polygon points="60,4 8,52 60,78" fill="#2D1B4E" opacity="0.55" />
        <polygon points="8,52 60,78 60,136" fill="#6B3FA0" opacity="0.75" />
        <polygon points="112,52 60,78 60,136" fill="#2D1B4E" opacity="0.8" />
        <polygon points="60,4 84,30 60,42 36,30" fill="#C8B4FF" opacity="0.55" />
        <polygon points="60,4 112,52 60,78 8,52" fill="none" stroke="#2D1B4E" strokeWidth="1" opacity="0.35" />
        <polygon points="8,52 60,136 112,52" fill="none" stroke="#2D1B4E" strokeWidth="1" opacity="0.35" />
      </g>
    </motion.svg>
  );
}

const PrismCanvas = dynamic(() => import("./prism-3d"), {
  ssr: false,
  loading: () => <Prism />,
});

function supportsWebgl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * The real stone when the machine can afford it; the drawing when it can't.
 * The three.js chunk waits for post-load idle — eagerly evaluating it during
 * hydration cost 1.4s of main-thread time on a throttled phone.
 */
function HeroPrism() {
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (reduced) return;
    // Arm on the first real user input (or a long fallback) — the chunk is
    // heavy enough to dent a throttled phone's main thread if it evaluates
    // during load, and nobody misses the stone before they've even moved.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      if (supportsWebgl()) setReady(true);
      cleanup();
    };
    const cleanup = () => {
      for (const type of ["pointermove", "scroll", "touchstart", "keydown"]) {
        window.removeEventListener(type, arm);
      }
      if (timer) clearTimeout(timer);
    };
    for (const type of ["pointermove", "scroll", "touchstart", "keydown"]) {
      window.addEventListener(type, arm, { once: true, passive: true });
    }
    timer = setTimeout(arm, 8000);
    return cleanup;
  }, [reduced]);

  return ready && !reduced ? <PrismCanvas /> : <Prism />;
}

export function Hero() {
  const reduced = useReducedMotion();
  // Transform-only entrance for the text: fading the headline/subline from 0
  // pushes the LCP paint out by a full second. The rise still reads as an
  // entrance; the words are just never invisible.
  const enter = (delay: number) => ({
    initial: { y: reduced ? 0 : 26 },
    animate: { y: 0 },
    transition: { duration: 0.85, ease: EASE, delay },
  });
  const fade = (delay: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 26 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.85, ease: EASE, delay },
  });

  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex items-end justify-between gap-8">
          <div className="max-w-3xl">
            <motion.p {...enter(0)} className="text-kicker flex items-center gap-3 text-amethyst">
              <span aria-hidden className="h-px w-8 bg-amethyst/50" />
              The Occasion Studio · Agent #5213 on X Layer
            </motion.p>
            <motion.h1 {...enter(0.08)} className="text-display mt-6 text-balance">
              Every moment, made&nbsp;monumental.
            </motion.h1>
            <motion.p {...enter(0.18)} className="prose-measure mt-6 text-[1.08rem] leading-relaxed text-ink/65">
              Give it a birthday next Saturday, a product launching Friday, a trip just taken. A
              syndicate of studio roles plans it, designs it, writes it — then grades every artifact
              against a published standard, repairs what fails, and seals the finished pack on
              X&nbsp;Layer.
            </motion.p>
            <motion.div {...enter(0.28)} className="mt-9 flex flex-wrap items-center gap-4">
              <ButtonLink
                href="/studio"
                size="lg"
                onMouseEnter={() => window.dispatchEvent(new Event("oce-cta-press"))}
                onMouseLeave={() => window.dispatchEvent(new Event("oce-cta-release"))}
              >
                Open the Studio
              </ButtonLink>
              <a
                href="#tribunal"
                className="text-[0.92rem] font-medium text-ink/60 underline decoration-ink/25 underline-offset-4 transition-colors hover:text-ink"
              >
                See how work gets graded
              </a>
            </motion.div>
          </div>
          <motion.div {...fade(0.3)} className="hidden shrink-0 pb-4 md:block" aria-hidden>
            <HeroPrism />
          </motion.div>
        </div>

        <motion.div {...fade(0.42)} className="mt-16 sm:mt-20 md:ml-[8%] lg:ml-[14%]">
          <Walkthrough />
        </motion.div>
      </div>
    </section>
  );
}
