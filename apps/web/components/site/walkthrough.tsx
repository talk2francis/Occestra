"use client";

/**
 * The hero walkthrough: a 25-second scripted replay of the real sealed pack
 * oce_01kxbz33bb4grnd1xh0gev being assembled. Every venue, forecast, grade and
 * hash is quoted from the store — this is product UI re-enacting a real run,
 * not screen capture and not invented data. Under prefers-reduced-motion it
 * renders the finished state as a single static frame.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { EASE } from "@/components/motion";
import { GradeChip } from "@/components/ui/grade-chip";
import { SealMark } from "@/components/ui/seal-mark";
import { SourceChip } from "@/components/ui/source-chip";
import { CELEBRATE } from "@/lib/real";

const DURATION = 25;

const ROLES = [
  { name: "Planner", from: 2, to: 10 },
  { name: "Cartographer", from: 3, to: 7.5 },
  { name: "Art Director", from: 10, to: 14.5 },
  { name: "Writer", from: 11, to: 15 },
  { name: "Critic", from: 15, to: 20 },
  { name: "Archivist", from: 20, to: 24.5 },
] as const;

/** What has streamed in by second t. */
const AT = {
  brief: 0.4,
  venues: 3.2, // + i * 0.9
  forecast: 6.8,
  schedule: 8.6,
  budget: 10.2,
  guide: 11.6,
  grades: 15.4, // + i * 0.7
  sealStart: 20.5,
  sealDone: 22.5,
} as const;

/**
 * A coarse clock: 4 ticks/second, not one per frame. Re-rendering this
 * component 60x/s cost 3+ seconds of main-thread time in Lighthouse; nothing
 * in the scene changes faster than a quarter second anyway.
 */
function useClock(active: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    const started = performance.now();
    const id = window.setInterval(() => {
      setT(((performance.now() - started) / 1000) % DURATION);
    }, 250);
    return () => window.clearInterval(id);
  }, [active]);
  return t;
}

const rise = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.3 } },
};

export function Walkthrough() {
  const reduced = useReducedMotion();
  const [inView, setInView] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Only run the clock while visible — no work while scrolled away.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || reduced) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false), {
      threshold: 0.25,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const t = useClock(inView && !reduced);
  // Static frame for reduced motion: everything visible, seal applied.
  const now = reduced ? DURATION - 0.1 : t;

  const gradeCount = Math.max(0, Math.min(CELEBRATE.artifacts.length, Math.floor((now - AT.grades) / 0.7) + 1));
  const venueCount = Math.max(0, Math.min(CELEBRATE.venues.length, Math.floor((now - AT.venues) / 0.9) + 1));
  const sealed = now >= AT.sealDone;

  return (
    <div ref={rootRef} className="relative">
      <div className="overflow-hidden rounded-2xl border border-ink/12 bg-ground shadow-keepsake">
        {/* console header */}
        <div className="flex items-center justify-between gap-3 border-b border-ink/10 bg-panel/80 px-4 py-2.5 sm:px-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-kicker text-amethyst">Celebrate studio</span>
            <span className="text-data hidden truncate text-ink/60 sm:inline">{CELEBRATE.id}</span>
          </div>
          <div className="flex items-center gap-2">
            {sealed ? (
              <GradeChip verdict="pass">sealed</GradeChip>
            ) : now >= AT.grades ? (
              <GradeChip verdict="info">grading</GradeChip>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-lilac bg-lilac/25 px-2.5 py-0.5 text-[0.68rem] font-semibold tracking-[0.1em] text-plum uppercase">
                <motion.span
                  aria-hidden
                  className="size-1.5 rounded-full bg-plum"
                  animate={reduced ? {} : { opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                />
                working
              </span>
            )}
          </div>
        </div>

        {/* progress hairline */}
        {!reduced && (
          <div className="h-px bg-ink/8">
            <div
              className="h-px bg-amethyst/70 transition-[width] duration-300 ease-linear"
              style={{ width: `${(now / DURATION) * 100}%` }}
            />
          </div>
        )}

        <div className="grid gap-0 sm:grid-cols-[10.5rem_1fr]">
          {/* the syndicate roster */}
          <ul className="flex flex-row flex-wrap gap-x-4 gap-y-1 border-b border-ink/10 px-4 py-3 sm:flex-col sm:gap-y-2.5 sm:border-r sm:border-b-0 sm:px-5 sm:py-5">
            {ROLES.map((role) => {
              const active = now >= role.from && now < role.to;
              const done = now >= role.to;
              return (
                <li key={role.name} className="flex items-center gap-2 text-[0.8rem]">
                  <span
                    className={`size-1.5 rounded-full transition-colors duration-300 ${
                      active ? "bg-lilac ring-3 ring-lilac/40" : done ? "bg-ink/70" : "bg-ink/15"
                    }`}
                  />
                  <span className={`transition-colors duration-300 ${active ? "font-medium text-plum" : done ? "text-ink/80" : "text-ink/65"}`}>
                    {role.name}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* the work, streaming in */}
          <div className="relative min-h-[21rem] p-4 sm:min-h-[23rem] sm:p-5">
            <AnimatePresence>
              {now >= AT.brief && (
                <motion.p key="brief" {...rise} className="text-subhead max-w-[26em] text-ink/90">
                  “{CELEBRATE.brief}”
                </motion.p>
              )}
            </AnimatePresence>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <AnimatePresence>
                {CELEBRATE.venues.slice(0, venueCount).map((venue) => (
                  <motion.span
                    key={venue.name}
                    {...rise}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink/12 bg-panel/70 px-2.5 py-1 text-[0.75rem] text-ink/80"
                  >
                    {venue.name}
                    <span className="text-data text-ink/60">osm</span>
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {now >= AT.forecast && (
                <motion.div key="forecast" {...rise} className="mt-3 flex flex-wrap items-center gap-2 text-[0.82rem] text-ink/65">
                  {CELEBRATE.forecast}
                  <SourceChip source={CELEBRATE.forecastSource.source} retrievedAt={CELEBRATE.forecastSource.retrievedAt} />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <AnimatePresence>
                {now >= AT.schedule && (
                  <motion.div key="schedule" {...rise} className="rounded-xl border border-ink/10 bg-panel/60 p-3">
                    <p className="text-kicker mb-2 text-[0.6rem] text-ink/60">Schedule</p>
                    {CELEBRATE.schedule.map((item) => (
                      <p key={item.time} className="flex gap-2 text-[0.78rem] leading-6 text-ink/80">
                        <span className="text-data pt-0.5 text-ink/60">{item.time}</span>
                        {item.title}
                      </p>
                    ))}
                  </motion.div>
                )}
                {now >= AT.budget && (
                  <motion.div key="budget" {...rise} className="rounded-xl border border-ink/10 bg-panel/60 p-3">
                    <p className="text-kicker mb-2 text-[0.6rem] text-ink/60">Budget — {CELEBRATE.budget.total} {CELEBRATE.budget.currency}</p>
                    {CELEBRATE.budget.items.map((item) => (
                      <p key={item.label} className="flex justify-between text-[0.78rem] leading-6 text-ink/80">
                        {item.label}
                        <span className="text-data text-ink/65">{item.amount}</span>
                      </p>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {now >= AT.guide && (
                <motion.div key="guide" {...rise} className="mt-3 flex items-center gap-3">
                  <Image
                    src="/artifacts/guest-guide.webp"
                    alt="Shareable guest guide produced for the farewell dinner"
                    width={44}
                    height={59}
                    className="rounded-md border border-ink/15 shadow-lift"
                  />
                  <div>
                    <p className="text-[0.82rem] font-medium text-ink/85">Guest guide — shareable page</p>
                    <p className="text-[0.72rem] text-ink/60">invite suite · toast · contingency plan</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* the Tribunal grades each artifact */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              <AnimatePresence>
                {CELEBRATE.artifacts.slice(0, gradeCount).map((artifact) => (
                  <motion.span key={artifact.kind} {...rise}>
                    <GradeChip verdict="pass">{artifact.kind.replace("_", " ")} · pass</GradeChip>
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>

            {/* the seal stamps down */}
            <AnimatePresence>
              {now >= AT.sealStart && (
                <motion.div
                  key="seal"
                  initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 1.5 }}
                  animate={{ opacity: 1, scale: 1, transition: { duration: 0.55, ease: EASE } }}
                  exit={{ opacity: 0 }}
                  className="absolute right-4 bottom-4 sm:right-6 sm:bottom-5"
                >
                  <SealMark size={84} className="text-amethyst/85" />
                </motion.div>
              )}
              {sealed && (
                <motion.p key="anchor" {...rise} className="text-data mt-4 max-w-[24rem] break-all text-ink/60">
                  anchored on X Layer · {CELEBRATE.seal.anchorTx.slice(0, 26)}… · {CELEBRATE.seal.anchoredAt}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <p className="text-data mt-3 text-ink/60">
        A replay of sealed pack {CELEBRATE.id} — real venues, real forecast, real grades, real anchor
        transaction. Product UI, not a screen recording.
      </p>
    </div>
  );
}
