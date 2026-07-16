"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Archive, ClipboardPenLine, PackageCheck, PartyPopper, Radio, Rocket } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Wordmark } from "@/components/site/wordmark";
import { ThemeToggle } from "@/components/ui/theme";
import { STUDIO_IDENTITY, type StudioId, type StyleSwatch } from "@/lib/studio";
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
  const [studio, setStudio] = useState<StudioId>("celebrate");
  const [mobilePane, setMobilePane] = useState<"brief" | "feed" | "pack">("brief");
  const identity = STUDIO_IDENTITY[studio];

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
  const recoveryNotified = useRef(false);
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
    setMobilePane("feed");
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

  useEffect(() => {
    if (!run.recovered) return;
    const start = run.events.find((event) => event.type === "run_started");
    if (start?.type === "run_started" && ["celebrate", "remember", "launch"].includes(start.studio)) {
      setStudio(start.studio as StudioId);
    }
    setMobilePane("feed");
    if (!recoveryNotified.current) {
      recoveryNotified.current = true;
      toast.success("Your Studio run is back", {
        description: run.status === "running" ? "The pipeline kept working while the connection was away." : "Its finished pack has been restored.",
      });
    }
  }, [run.recovered, run.events, run.status]);

  return (
    <div
      className="studio-room flex h-dvh min-h-0 flex-col overflow-hidden"
      style={{
        "--studio-accent": identity.accent,
        "--studio-accent-soft": identity.accentSoft,
      } as CSSProperties}
    >
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
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-ink/10 bg-panel/80 px-5 py-3 backdrop-blur-sm sm:px-8">
        <div className="flex items-center gap-4">
          <Wordmark height={26} priority />
          <span className="text-kicker hidden text-amethyst sm:inline">The Studio</span>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-data hidden text-ink/60 md:block">
            real pipelines · real grades · sealed on X Layer
          </p>
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile control deck stays reachable even when another pane is open. */}
      <div className="z-20 shrink-0 border-b border-ink/10 bg-ground/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <StudioRoomButton studio={studio} onChange={setStudio} />
          <p className="line-clamp-1 text-[0.66rem] text-ink/50">{identity.promise}</p>
        </div>
        <div className="grid grid-cols-3 border-t border-ink/8">
          {([
            ["brief", ClipboardPenLine, "Brief"],
            ["feed", Radio, "Live feed"],
            ["pack", PackageCheck, "Pack"],
          ] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMobilePane(id)}
              className={`relative flex items-center justify-center gap-1.5 py-2 text-[0.72rem] font-medium transition-colors ${mobilePane === id ? "text-ink" : "text-ink/45"}`}
            >
              <Icon aria-hidden className="size-3.5" />
              {label}
              {mobilePane === id && <motion.span layoutId="mobile-pane" className="absolute inset-x-5 bottom-0 h-0.5 bg-[var(--studio-accent)]" />}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)_minmax(0,21rem)]">
        <aside className={`${mobilePane === "brief" ? "block" : "hidden"} studio-scroll min-h-0 overflow-y-auto border-ink/10 p-4 sm:p-5 lg:block lg:border-r`}>
          <RoomHeading studio={studio} />
          <Composer
            styles={styles}
            running={run.status === "running"}
            remaining={remaining}
            cap={cap}
            studio={studio}
            onStudioChange={setStudio}
            onRun={handleRun}
          />
        </aside>

        <section className={`${mobilePane === "feed" ? "block" : "hidden"} min-h-0 overflow-hidden lg:block`}>
          <Syndicate status={run.status} events={run.events} studio={studio} />
        </section>

        <aside className={`${mobilePane === "pack" ? "block" : "hidden"} min-h-0 overflow-hidden bg-panel/40 lg:block lg:border-l lg:border-ink/10`}>
          <PackPanel status={run.status} events={run.events} pack={run.pack} />
        </aside>
      </div>
    </div>
  );
}

const ROOM_ICON = { celebrate: PartyPopper, remember: Archive, launch: Rocket } as const;

function RoomHeading({ studio }: { studio: StudioId }) {
  const Icon = ROOM_ICON[studio];
  const room = STUDIO_IDENTITY[studio];
  return (
    <motion.div key={studio} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="mb-5 rounded-xl border border-ink/10 bg-[var(--studio-accent-soft)]/25 p-3.5">
      <p className="flex items-center gap-2 text-[0.82rem] font-semibold" style={{ color: room.accent }}>
        <Icon aria-hidden className="size-4" strokeWidth={1.7} />
        {room.label} room
      </p>
      <p className="mt-1 text-[0.72rem] leading-relaxed text-ink/55">{room.promise}</p>
    </motion.div>
  );
}

function StudioRoomButton({ studio, onChange }: { studio: StudioId; onChange: (studio: StudioId) => void }) {
  const order: StudioId[] = ["celebrate", "remember", "launch"];
  return (
    <div className="flex shrink-0 rounded-full border border-ink/10 bg-panel p-0.5" aria-label="Choose a studio">
      {order.map((id) => {
        const Icon = ROOM_ICON[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-label={STUDIO_IDENTITY[id].label}
            aria-pressed={studio === id}
            className={`rounded-full p-1.5 transition-all ${studio === id ? "bg-ground shadow-lift" : "text-ink/35"}`}
          >
            <Icon aria-hidden className={`size-3.5 ${studio === id ? "text-[var(--studio-accent)]" : ""}`} />
          </button>
        );
      })}
    </div>
  );
}
