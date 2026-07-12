"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ButtonLink } from "@/components/ui/button";
import { EASE } from "@/components/motion";
import { Walkthrough } from "./walkthrough";

/**
 * The one deliberate 3D-feeling element on the site: a faceted amethyst,
 * drawn as SVG, turning very slowly. Static under reduced motion.
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

export function Hero() {
  const reduced = useReducedMotion();
  const enter = (delay: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 28 },
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
              The Occasion Studio · live on OKX.AI, X Layer
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
              <ButtonLink href="/studio" size="lg">
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
          <motion.div {...enter(0.3)} className="hidden shrink-0 pb-4 md:block" aria-hidden>
            <Prism />
          </motion.div>
        </div>

        <motion.div {...enter(0.42)} className="mt-16 sm:mt-20 md:ml-[8%] lg:ml-[14%]">
          <Walkthrough />
        </motion.div>
      </div>
    </section>
  );
}
