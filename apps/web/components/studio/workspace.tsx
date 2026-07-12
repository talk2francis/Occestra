"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { StyleSwatch } from "@/lib/studio";
import { Composer } from "./composer";
import { PackPanel } from "./pack-panel";
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

  useEffect(() => {
    if (run.status === "failed" && run.error) toast.error(run.error);
    if (run.status === "done") toast.success("Pack assembled, graded, and sealed.");
  }, [run.status, run.error]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-ink/10 bg-panel/60 px-5 py-3 sm:px-8">
        <div className="flex items-baseline gap-4">
          <Link
            href="/"
            className="font-serif text-[1.2rem] font-medium tracking-tight text-ink"
            style={{ fontVariationSettings: "'opsz' 40" }}
          >
            Occestra
          </Link>
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
            onRun={(tool, args) => void run.start(tool, args)}
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
