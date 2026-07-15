"use client";

/**
 * THE SEAL MOMENT — the brand, as an animation. An amethyst wax press:
 * the stamp comes down (1.15 -> 1 with a small rotational settle), a lilac
 * bloom ripples out, the grain flashes like pressed paper, the grade chips
 * stagger in, and the pass rate counts up. Everything eases like weight,
 * nothing bounces like a toy.
 *
 * Reduced motion: the finished card, a plain fade, the final number.
 */
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useState } from "react";
import { GradeChip } from "@/components/ui/grade-chip";
import { GuillocheRing } from "@/components/ui/guilloche";
import { SealMark } from "@/components/ui/seal-mark";

const NOISE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const PRESS_EASE: [number, number, number, number] = [0.34, 1.3, 0.42, 1];
const SETTLE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export interface SealMomentData {
  passRate: number;
  repairedCount: number;
  sealed: boolean;
  keepsakeId: string;
}

function CountUp({ to, reduced }: { to: number; reduced: boolean }) {
  const value = useMotionValue(reduced ? to : 0);
  const [shown, setShown] = useState(reduced ? to : 0);

  useEffect(() => {
    if (reduced) return;
    const controls = animate(value, to, {
      duration: 0.9,
      delay: 0.85,
      ease: SETTLE,
      onUpdate: (latest) => setShown(Math.round(latest)),
    });
    return () => controls.stop();
  }, [to, reduced, value]);

  return <>{shown}</>;
}

export function SealMoment({
  data,
  onDone,
}: {
  data: SealMomentData;
  onDone: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const [open, setOpen] = useState(true);

  useEffect(() => {
    window.dispatchEvent(new Event("oce-seal-press"));
  }, []);

  // The moment holds the stage briefly, then yields to the pack itself.
  useEffect(() => {
    const timer = setTimeout(() => setOpen(false), reduced ? 2200 : 3400);
    return () => clearTimeout(timer);
  }, [reduced]);

  const chips: Array<{ verdict: "pass" | "repair" | "info"; label: string }> = [
    {
      verdict: data.passRate === 1 ? "pass" : "repair",
      label: `pass rate ${Math.round(data.passRate * 100)}%`,
    },
    ...(data.repairedCount > 0
      ? [{ verdict: "repair" as const, label: `repaired ×${data.repairedCount}` }]
      : []),
    ...(data.sealed
      ? [{ verdict: "info" as const, label: "sealed · anchoring queued" }]
      : []),
  ];

  return (
    <AnimatePresence onExitComplete={onDone}>
      {open && (
        <motion.div
          key="seal-veil"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.45, ease: SETTLE } }}
          transition={{ duration: 0.3 }}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 grid cursor-pointer place-items-center bg-ground/75 p-6 backdrop-blur-[6px]"
          role="status"
          aria-label={`Pack complete. Pass rate ${Math.round(data.passRate * 100)} percent.${data.sealed ? " Sealed on X Layer." : ""}`}
        >
          <div className="relative flex flex-col items-center text-center">
            {/* the lilac bloom — two rings, offset, like wax spreading */}
            {!reduced && (
              <>
                <motion.span
                  aria-hidden
                  className="absolute top-[72px] size-40 rounded-full border-2 border-lilac"
                  initial={{ scale: 0.35, opacity: 0 }}
                  animate={{ scale: 2.4, opacity: [0, 0.8, 0] }}
                  transition={{ duration: 1.1, delay: 0.38, ease: "easeOut" }}
                />
                <motion.span
                  aria-hidden
                  className="absolute top-[72px] size-40 rounded-full bg-lilac/25"
                  initial={{ scale: 0.3, opacity: 0 }}
                  animate={{ scale: 1.9, opacity: [0, 0.6, 0] }}
                  transition={{ duration: 0.9, delay: 0.32, ease: "easeOut" }}
                />
              </>
            )}

            {/* grain flash — pressed paper */}
            {!reduced && (
              <motion.span
                aria-hidden
                className="absolute top-0 size-[290px] rounded-full mix-blend-multiply"
                style={{ backgroundImage: NOISE, backgroundSize: "160px 160px" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.35, 0] }}
                transition={{ duration: 0.5, delay: 0.3 }}
              />
            )}

            {/* the stamp comes down */}
            <motion.div
              className="relative"
              initial={reduced ? { opacity: 0 } : { scale: 1.15, rotate: -7, opacity: 0, y: -14 }}
              animate={reduced ? { opacity: 1 } : { scale: 1, rotate: 0, opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12, ease: PRESS_EASE }}
            >
              {/* the engraving plate the stamp presses into */}
              <motion.span
                aria-hidden
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                initial={reduced ? undefined : { rotate: -14 }}
                animate={reduced ? undefined : { rotate: 0 }}
                transition={{ duration: 1.1, delay: 0.12, ease: PRESS_EASE }}
              >
                <span className="guilloche-drift block">
                  <GuillocheRing size={248} />
                </span>
              </motion.span>
              <SealMark size={176} className="relative text-amethyst drop-shadow-[0_10px_28px_rgba(45,27,78,0.28)]" />
            </motion.div>

            <motion.p
              className="text-headline mt-8 max-w-md text-balance"
              initial={{ opacity: 0, y: reduced ? 0 : 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: reduced ? 0.1 : 0.7, ease: SETTLE }}
            >
              {data.sealed ? "Sealed." : "Assembled."}
            </motion.p>

            <motion.p
              className="mt-2 font-serif text-[1.15rem] text-ink/65"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: reduced ? 0.1 : 0.85 }}
            >
              <span className="font-medium text-ink tabular-nums">
                <CountUp to={Math.round(data.passRate * 100)} reduced={reduced} />%
              </span>{" "}
              of the work cleared the standard
              {data.repairedCount > 0 ? ", after repairs" : ""}.
            </motion.p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {chips.map((chip, index) => (
                <motion.span
                  key={chip.label}
                  initial={{ opacity: 0, y: reduced ? 0 : 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: (reduced ? 0.15 : 1.0) + index * 0.12, ease: SETTLE }}
                >
                  <GradeChip verdict={chip.verdict}>{chip.label}</GradeChip>
                </motion.span>
              ))}
            </div>

            <motion.p
              className="text-data mt-7 text-ink/45"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduced ? 0.3 : 1.6, duration: 0.5 }}
            >
              {data.keepsakeId} · click anywhere to continue
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * A refusal is not a failure state to flash red at — someone asked for
 * something we don't make, and the answer is a quiet, complete sentence.
 */
export function RefusalNotice({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-ink/15 bg-panel/70 p-5">
      <p className="text-kicker text-[0.6rem] text-ink/50">The studio declines this brief</p>
      <p className="mt-2 font-serif text-[1.05rem] leading-relaxed text-ink/80">{message}</p>
      <p className="mt-3 text-[0.78rem] leading-relaxed text-ink/55">
        Nothing was charged. The policy that produced this answer is part of the published
        standard — it applies to every brief, including our own.
      </p>
    </div>
  );
}
