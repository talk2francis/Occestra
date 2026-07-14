"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Wordmark } from "@/components/site/wordmark";
import type { StyleSwatch } from "@/lib/studio";
import { Composer } from "./composer";
import { PackPanel } from "./pack-panel";
import { SealMoment, type SealMomentData } from "./seal-moment";
import { Syndicate } from "./syndicate";
import { useStudioRun } from "./use-run";

export function Workspace({
  styles,
  quota,
}: {
  styles: StyleSwatch[];
  quota: { used: number; cap: number; remaining: number };
}) {
  const [remaining, setRemaining] = useState(quota.remaining);
  const [cap] = useState(quota.cap);

  const refreshQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/demo/quota", { cache: "no-store" });
      const body = (await res.json()) as { remaining?: number };
      if (typeof body.remaining === "number") setRemaining(body.remaining);
    } catch {
      // the label is cosmetic; the server enforces the cap regardless
    }
  }, []);

  const run = useStudioRun(refreshQuota);
  const [moment, setMoment] = useState<SealMomentData>();
  const [folding, setFolding] = useState<string>();
  const reduced = useReducedMotion();

  // The brief physically leaves the composer and folds into the syndicate.
  const handleRun = (tool: string, args: Record<string, unknown>) => {
    const summary = String(args["occasion"] ?? args["title"] ?? args["productName"] ?? "the brief");
    if (!reduced) {
      setFolding(summary);
      setTimeout(() => setFolding(undefined), 1000);
    }
    void run.start(tool, args);
  };

  useEffect(() => {
    // Policy refusals render as a dignified notice in the feed — no toast.
    const policy = run.events.some((event) => event.type === "run_failed" && event.reason === "policy");
    if (run.status === "failed" && run.error && !policy) toast.error(run.error);
    if (run.status === "done" && run.pack) {
      setMoment({
        passRate: run.pack.quality.passRate,
        repairedCount: run.pack.quality.repairedCount,
        sealed: Boolean(run.pack.seal),
        keepsakeId: run.pack.keepsakeId,
      });
    }
  }, [run.status, run.error, run.pack, run.events]);

  return (
    <div className="flex min-h-screen flex-col">
      {moment && <SealMoment data={moment} onDone={() => setMoment(undefined)} />}

      {/* the brief folding into the room — desktop only, where the geometry reads */}
      <AnimatePresence>
        {folding && (
          <motion.div
            key="fold"
            aria-hidden
            className="pointer-events-none fixed top-1/2 left-[10rem] z-40 hidden max-w-56 rounded-xl border border-ink/15 bg-ground p-3 shadow-keepsake lg:block"
            initial={{ opacity: 0, scale: 1, x: 0, y: 0, rotate: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              x: ["0%", "10%", "160%"],
              y: ["0%", "-8%", "-30%"],
              scale: [1, 1, 0.55],
              rotate: [0, -1.5, 2],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.95, times: [0, 0.25, 0.8, 1], ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="font-serif text-[0.9rem] leading-snug text-ink/85">“{folding}”</p>
          </motion.div>
        )}
      </AnimatePresence>
      <header className="flex items-center justify-between gap-4 border-b border-ink/10 bg-panel/60 px-5 py-3 sm:px-8">
        <div className="flex items-center gap-4">
          <Wordmark height={26} priority />
          <span className="text-kicker hidden text-amethyst sm:inline">The Studio</span>
        </div>
        <p className="text-data hidden text-ink/60 md:block">
          real pipelines · real grades · sealed on X Layer
        </p>
      </header>

      <div className="grid flex-1 lg:h-[calc(100vh-57px)] lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)_minmax(0,21rem)]">
        <aside className="no-scrollbar border-b border-ink/10 p-4 sm:p-5 lg:overflow-y-auto lg:border-r lg:border-b-0">
          <Composer
            styles={styles}
            running={run.status === "running"}
            remaining={remaining}
            cap={cap}
            onRun={handleRun}
          />
        </aside>

        <section className="min-h-[24rem] border-b border-ink/10 lg:min-h-0 lg:border-b-0">
          <Syndicate status={run.status} events={run.events} />
        </section>

        <aside className="bg-panel/40 lg:overflow-y-auto lg:border-l lg:border-ink/10">
          <PackPanel status={run.status} events={run.events} pack={run.pack} />
        </aside>
      </div>
    </div>
  );
}
