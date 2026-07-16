"use client";

import { RotateCcw } from "lucide-react";
import { Wordmark } from "@/components/site/wordmark";

/**
 * A Studio render fault must never strand the buyer behind Next's generic white error page.
 * The run capability is kept in localStorage, so a hard reload can reattach to the durable log.
 */
export default function StudioError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reopen = () => {
    reset();
    window.location.reload();
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ground px-5 py-16 text-ink">
      <section className="w-full max-w-xl rounded-2xl border border-ink/12 bg-panel/70 p-7 shadow-keepsake sm:p-10">
        <Wordmark height={28} priority />
        <p className="text-kicker mt-9 text-amethyst">The Studio can reconnect</p>
        <h1 className="mt-3 font-serif text-3xl leading-tight sm:text-4xl">The room lost its canvas, not your work.</h1>
        <p className="mt-4 max-w-[55ch] text-[0.92rem] leading-relaxed text-ink/65">
          If a run was underway, the pipeline and its event log remain on the ASP. Reopen the room
          and this browser will restore the latest progress or finished pack from its private
          recovery capability.
        </p>
        <button
          type="button"
          onClick={reopen}
          className="glow-cta mt-7 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[0.85rem] font-medium text-ground transition-colors hover:bg-plum"
        >
          <RotateCcw aria-hidden className="size-4" />
          Reopen this run
        </button>
      </section>
    </main>
  );
}
