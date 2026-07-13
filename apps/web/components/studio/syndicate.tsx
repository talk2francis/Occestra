"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import { EASE } from "@/components/motion";
import { AxisChip, GradeChip } from "@/components/ui/grade-chip";
import { ROLES, roleForEvent, type DemoEvent } from "@/lib/studio";
import { RefusalNotice } from "./seal-moment";
import type { RunStatus } from "./use-run";

/**
 * The center pane: the syndicate roster lighting up as real events arrive,
 * and the event feed itself. A failed artifact renders in fail red with its
 * genuine repair brief, then its repaired return in repair amber — the whole
 * point of the product, happening live.
 */
export function Syndicate({ status, events }: { status: RunStatus; events: DemoEvent[] }) {
  const reduced = useReducedMotion();
  const feedRef = useRef<HTMLOListElement>(null);
  const activeRole = status === "running" && events.length ? roleForEvent(events[events.length - 1]!) : undefined;
  const doneRoles = new Set(events.map((event) => roleForEvent(event)).filter(Boolean));

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [events.length, reduced]);

  return (
    <div className="flex h-full min-h-0 flex-col">
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
              <span
                className={`size-1.5 rounded-full transition-all duration-300 ${
                  active ? "bg-plum" : touched ? "bg-ink/70" : "bg-ink/15"
                }`}
              />
              <span className={active ? "font-medium text-plum" : touched ? "text-ink/80" : "text-ink/65"}>{role}</span>
            </li>
          );
        })}
      </ul>

      {/* feed */}
      <ol ref={feedRef} className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
        {status === "idle" && (
          <li className="grid h-full place-items-center px-6 text-center">
            <div>
              <p className="text-subhead text-ink/75">The room is quiet.</p>
              <p className="prose-measure mx-auto mt-2 text-[0.88rem] leading-relaxed text-ink/60">
                Pick a preset or write a brief. This runs the real pipelines with the real providers —
                venues get searched, forecasts get fetched, the Tribunal grades what comes back, and
                anything that fails goes visibly back for repair.
              </p>
            </div>
          </li>
        )}

        <AnimatePresence initial={false}>
          {events.map((event, index) => (
            <motion.li
              key={index}
              initial={{ opacity: 0, y: reduced ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              <FeedRow event={event} />
            </motion.li>
          ))}
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
