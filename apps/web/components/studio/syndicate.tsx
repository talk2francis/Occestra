"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { EASE } from "@/components/motion";
import { AxisChip } from "@/components/ui/axis-chip";
import { GradeChip } from "@/components/ui/grade-chip";
import { ROLES, STUDIO_IDENTITY, roleForEvent, type DemoEvent, type StudioId } from "@/lib/studio";
import { RefusalNotice } from "./seal-moment";
import type { RunStatus } from "./use-run";

/**
 * The center pane: the syndicate roster lighting up as real events arrive,
 * and the event feed itself. A failed artifact renders in fail red with its
 * genuine repair brief, then its repaired return in repair amber — the whole
 * point of the product, happening live.
 */
export function Syndicate({ status, events, studio }: { status: RunStatus; events: DemoEvent[]; studio: StudioId }) {
  const reduced = useReducedMotion();
  const feedRef = useRef<HTMLOListElement>(null);
  const [following, setFollowing] = useState(true);
  const activeRole = status === "running" && events.length ? roleForEvent(events[events.length - 1]!) : undefined;
  const doneRoles = new Set(events.map((event) => roleForEvent(event)).filter(Boolean));

  useEffect(() => {
    if (following) feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [events.length, following, reduced]);

  const jumpToLatest = () => {
    setFollowing(true);
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* roster — the lilac glow physically travels from role to role */}
      <ul className="relative flex flex-wrap gap-x-5 gap-y-1.5 border-b border-ink/10 px-4 py-3 sm:px-5">
        {ROLES.map((role) => {
          const active = activeRole === role;
          const touched = doneRoles.has(role);
          return (
            <li key={role} className="relative flex items-center gap-2 px-1.5 py-0.5 text-[0.8rem]">
              {active && (
                <motion.span
                  layoutId="role-glow"
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-full bg-lilac/30"
                  transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <motion.span
                className={`size-1.5 rounded-full transition-all duration-300 ${
                  active ? "glow-live bg-lilac" : touched ? "bg-ink/70" : "bg-ink/15"
                }`}
                animate={active && !reduced ? { scale: [1, 1.55, 1], opacity: [1, 0.55, 1] } : { scale: 1, opacity: 1 }}
                transition={active && !reduced ? { duration: 1.35, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
              />
              <span className={active ? "font-medium text-plum" : touched ? "text-ink/80" : "text-ink/65"}>{role}</span>
            </li>
          );
        })}
      </ul>

      {/* feed */}
      <ol
        ref={feedRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 64);
        }}
        className="studio-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5"
      >
        {status === "idle" && (
          <li className="relative grid h-full min-h-[24rem] place-items-center overflow-hidden rounded-2xl px-6 text-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={studio}
                aria-hidden
                className="studio-room-portrait absolute inset-0"
                initial={reduced ? false : { opacity: 0, scale: 1.025 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? undefined : { opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.6, ease: EASE }}
              >
                <Image
                  src={STUDIO_IDENTITY[studio].image}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className={`object-cover studio-room-image-${studio}`}
                  style={{ objectPosition: STUDIO_IDENTITY[studio].imagePosition }}
                />
              </motion.div>
            </AnimatePresence>
            <motion.div
              key={`${studio}-copy`}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="studio-room-plaque relative z-10 max-w-xl rounded-2xl border border-ink/10 px-6 py-5 shadow-lift backdrop-blur-[3px]"
            >
              <p className="text-kicker mb-2 text-[0.58rem] text-[var(--studio-accent)]">
                {STUDIO_IDENTITY[studio].label} room
              </p>
              <p className="text-subhead text-ink/80">The room is quiet.</p>
              <p className="prose-measure mx-auto mt-2 text-[0.88rem] leading-relaxed text-ink/65">
                Pick a preset or write a brief. This runs the real pipelines with the real providers —
                venues get searched, forecasts get fetched, the Tribunal grades what comes back, and
                anything that fails goes visibly back for repair.
              </p>
            </motion.div>
          </li>
        )}

        <AnimatePresence initial={false}>
          {events.map((event, index) => {
            const failed = event.type === "artifact_failed";
            const repaired = event.type === "artifact_repaired";
            return (
              <motion.li
                key={index}
                initial={{ opacity: 0, y: reduced ? 0 : 10, x: reduced ? 0 : repaired ? -28 : 0, scale: failed && !reduced ? 0.98 : 1 }}
                animate={
                  reduced
                    ? { opacity: 1, y: 0, x: 0, scale: 1 }
                    : failed
                      ? { opacity: 1, y: 0, x: [0, -16, -12], scale: [0.98, 1, 0.975] }
                      : { opacity: 1, y: 0, x: 0, scale: 1 }
                }
                transition={
                  repaired
                    ? { type: "spring", stiffness: 330, damping: 25, mass: 0.85 }
                    : { duration: failed ? 0.72 : 0.4, ease: EASE }
                }
              >
                <FeedRow event={event} />
              </motion.li>
            );
          })}
        </AnimatePresence>

        {status === "running" && (
          <li className="flex items-center gap-2 pl-1 text-[0.8rem] text-plum">
            <motion.span
              aria-hidden
              className="size-1.5 rounded-full bg-lilac"
              animate={reduced ? {} : { opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
            working…
          </li>
        )}
      </ol>

      <AnimatePresence>
        {!following && events.length > 0 && (
          <motion.button
            type="button"
            onClick={jumpToLatest}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-ink/15 bg-ground/95 px-3.5 py-2 text-[0.72rem] font-medium text-ink shadow-keepsake backdrop-blur"
          >
            Jump to latest ↓
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function FeedRow({ event }: { event: DemoEvent }) {
  switch (event.type) {
    case "run_started":
      return <Line tone="plum">The {event.studio} studio takes the brief.</Line>;
    case "sourcing":
    case "writing":
    case "rendering":
      return <Line tone="dim">{event.type === "writing" ? event.detail : event.detail}</Line>;
    case "sourced":
    case "rendered":
      return <Line tone="ink">{event.detail}</Line>;
    case "grading":
      return (
        <Line tone="ink">
          The Tribunal takes <span className="text-data">{event.kind}</span> — “{event.title}”.
        </Line>
      );
    case "artifact_failed":
      return (
        <div className="rounded-xl border border-fail/30 bg-fail/5 p-3.5">
          <p className="flex flex-wrap items-center gap-2 text-[0.82rem] font-medium text-ink/85">
            <GradeChip verdict="fail">fail</GradeChip>
            <span className="text-data">{event.kind}</span> goes back to the studio.
          </p>
          <p className="mt-2 text-[0.78rem] leading-relaxed text-ink/65">
            <span className="text-kicker text-[0.58rem] text-repair">Repair brief</span>
            <span className="mt-1 block">“{event.repairBrief}”</span>
          </p>
        </div>
      );
    case "artifact_repaired":
      return (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-repair/30 bg-repair/5 p-3.5 text-[0.82rem] text-ink/85">
          <GradeChip verdict="repair">repair ×{event.attempt}</GradeChip>
          <span className="text-data">{event.kind}</span> returns, reworked. Grading again.
        </div>
      );
    case "graded":
      return (
        <div className="rounded-xl border border-ink/10 bg-panel/60 p-3.5">
          <p className="flex flex-wrap items-center gap-2 text-[0.82rem] text-ink/85">
            <GradeChip verdict={event.pass ? "pass" : "fail"}>
              {event.pass ? "pass" : "fail"}
              {event.repairs > 0 ? ` · repaired ×${event.repairs}` : ""}
            </GradeChip>
            <span className="text-data">{event.kind}</span>
          </p>
          {event.axes && (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(event.axes).map(([axis, score]) => (
                <AxisChip key={axis} axis={axis} score={score} />
              ))}
            </p>
          )}
        </div>
      );
    case "sealing":
      return <Line tone="plum">The Archivist seals the pack — EIP-712, hash queued for X Layer.</Line>;
    case "run_complete":
      return <Line tone="plum">Done. The pack is assembled on the right.</Line>;
    case "run_failed":
      // A policy refusal is an answer, not an error — keep it dignified.
      if (event.reason === "policy") return <RefusalNotice message={event.message} />;
      return (
        <div className="rounded-xl border border-fail/30 bg-fail/5 p-3.5 text-[0.82rem] text-ink/80">
          {event.message}
        </div>
      );
    default:
      return null;
  }
}

function Line({ tone, children }: { tone: "dim" | "ink" | "plum"; children: React.ReactNode }) {
  const color = tone === "plum" ? "text-plum" : tone === "ink" ? "text-ink/80" : "text-ink/60";
  return <p className={`pl-1 text-[0.82rem] leading-relaxed ${color}`}>{children}</p>;
}
