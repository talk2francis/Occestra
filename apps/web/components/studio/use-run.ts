"use client";

import { useCallback, useRef, useState } from "react";
import type { DemoEvent, FinishedPack } from "@/lib/studio";

export type RunStatus = "idle" | "running" | "done" | "failed";

export interface StudioRun {
  status: RunStatus;
  events: DemoEvent[];
  pack: FinishedPack | undefined;
  error: string | undefined;
  start: (tool: string, args: Record<string, unknown>) => Promise<void>;
}

/** Streams one real demo run. Events are appended exactly as they arrive. */
export function useStudioRun(onFinished?: () => void): StudioRun {
  const [status, setStatus] = useState<RunStatus>("idle");
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [pack, setPack] = useState<FinishedPack>();
  const [error, setError] = useState<string>();
  const busy = useRef(false);

  const start = useCallback(
    async (tool: string, args: Record<string, unknown>) => {
      if (busy.current) return;
      busy.current = true;
      setStatus("running");
      setEvents([]);
      setPack(undefined);
      setError(undefined);

      try {
        const res = await fetch("/api/demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool, arguments: args }),
        });

        if (res.status === 429) {
          const body = (await res.json()) as { cap?: number };
          throw new Error(
            `Today's ${body.cap ?? ""} demo credits are spent. Agents can still pay per call on OKX.AI — the paid endpoint has no such limit.`,
          );
        }
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
          throw new Error(body.detail ?? body.error ?? `the studio declined (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let cut: number;
          while ((cut = buffer.indexOf("\n\n")) !== -1) {
            const chunk = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            if (!chunk.startsWith("data: ")) continue;

            const event = JSON.parse(chunk.slice(6)) as DemoEvent;
            setEvents((previous) => [...previous, event]);

            if (event.type === "run_complete") {
              setPack(event.pack);
              setStatus("done");
            } else if (event.type === "run_failed") {
              setError(event.message);
              setStatus("failed");
            }
          }
        }

        setStatus((current) => (current === "running" ? "failed" : current));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "the run failed");
        setStatus("failed");
      } finally {
        busy.current = false;
        onFinished?.();
      }
    },
    [onFinished],
  );

  return { status, events, pack, error, start };
}
