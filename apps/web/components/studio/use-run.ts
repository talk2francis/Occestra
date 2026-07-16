"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DemoEvent, FinishedPack } from "@/lib/studio";

export type RunStatus = "idle" | "running" | "done" | "failed";

interface StoredRun {
  runId: string;
  recoveryToken: string;
  createdAt: number;
}

interface RecoveryPayload {
  state: "running" | "done" | "failed";
  events: DemoEvent[];
  pack?: FinishedPack;
  error?: string;
}

export interface StudioRun {
  status: RunStatus;
  events: DemoEvent[];
  pack: FinishedPack | undefined;
  error: string | undefined;
  /** True once a persisted or disconnected run has been found on the server. */
  recovered: boolean;
  start: (tool: string, args: Record<string, unknown>) => Promise<void>;
}

const ACTIVE_STORAGE_KEY = "oce-active-studio-run";
const RECENT_STORAGE_KEY = "oce-recent-studio-run";
const RECOVERY_WINDOW = 48 * 60 * 60 * 1000;

function newRun(): StoredRun {
  return {
    runId: `demo_${crypto.randomUUID().replaceAll("-", "")}`,
    recoveryToken: `${crypto.randomUUID()}${crypto.randomUUID()}`,
    createdAt: Date.now(),
  };
}

function remember(run: StoredRun): void {
  window.localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(run));
}

function rememberCompleted(run: StoredRun): void {
  window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(run));
  window.localStorage.removeItem(ACTIVE_STORAGE_KEY);
}

function parsedRun(key: string): StoredRun | undefined {
  try {
    const run = JSON.parse(window.localStorage.getItem(key) ?? "null") as Partial<StoredRun> | null;
    if (
      !run ||
      typeof run.runId !== "string" ||
      typeof run.recoveryToken !== "string" ||
      typeof run.createdAt !== "number" ||
      Date.now() - run.createdAt > RECOVERY_WINDOW
    ) {
      window.localStorage.removeItem(key);
      return undefined;
    }
    return run as StoredRun;
  } catch {
    window.localStorage.removeItem(key);
    return undefined;
  }
}

function savedRun(): StoredRun | undefined {
  return parsedRun(ACTIVE_STORAGE_KEY) ?? parsedRun(RECENT_STORAGE_KEY);
}

function discard(run: StoredRun): void {
  for (const key of [ACTIVE_STORAGE_KEY, RECENT_STORAGE_KEY]) {
    if (parsedRun(key)?.runId === run.runId) window.localStorage.removeItem(key);
  }
}

function forgetActive(): void {
  window.localStorage.removeItem(ACTIVE_STORAGE_KEY);
}

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Streams one real demo run and reconnects to its persisted server-side log when needed. */
export function useStudioRun(onFinished?: () => void): StudioRun {
  const [status, setStatus] = useState<RunStatus>("idle");
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [pack, setPack] = useState<FinishedPack>();
  const [error, setError] = useState<string>();
  const [recovered, setRecovered] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const restoredOnce = useRef(false);

  const recover = useCallback(
    async (run: StoredRun, runGeneration: number) => {
      // Polling is deliberate here: the original SSE may be gone, but the actual pipeline keeps
      // running on the ASP. Its event log is durable, and this loop simply catches the UI up.
      let missingAttempts = 0;
      while (generation.current === runGeneration) {
        try {
          const response = await fetch(`/api/demo?runId=${encodeURIComponent(run.runId)}`, {
            headers: { "x-oce-recovery-token": run.recoveryToken },
            cache: "no-store",
          });

          if (response.status === 404) {
            // A request can be accepted just as its connection drops, a few milliseconds before
            // the durable run row is visible to this second request. Give that race a short grace.
            missingAttempts += 1;
            if (missingAttempts < 4) {
              await pause(750);
              continue;
            }
            discard(run);
            busy.current = false;
            setStatus("failed");
            setError("That Studio run is no longer recoverable. Nothing was charged.");
            return;
          }
          if (!response.ok) throw new Error(`recovery unavailable (${response.status})`);

          const body = (await response.json()) as RecoveryPayload;
          missingAttempts = 0;
          setRecovered(true);
          setEvents(body.events);
          setError(undefined);

          if (body.state === "done" && body.pack) {
            setPack(body.pack);
            setStatus("done");
            busy.current = false;
            rememberCompleted(run);
            onFinished?.();
            return;
          }
          if (body.state === "failed") {
            setStatus("failed");
            setError(body.error ?? "the run failed");
            busy.current = false;
            forgetActive();
            onFinished?.();
            return;
          }

          setStatus("running");
        } catch {
          // A recovery request can itself cross a brief outage. Keep trying while this tab owns
          // the generation; the active run remains visible rather than being falsely failed.
        }

        await pause(1_500);
      }
    },
    [onFinished],
  );

  useEffect(() => {
    if (restoredOnce.current) return;
    restoredOnce.current = true;
    const stored = savedRun();
    if (!stored) return;

    busy.current = true;
    setStatus("running");
    const runGeneration = ++generation.current;
    void recover(stored, runGeneration);

    return () => {
      generation.current += 1;
    };
  }, [recover]);

  const start = useCallback(
    async (tool: string, args: Record<string, unknown>) => {
      if (busy.current) return;
      busy.current = true;
      const runGeneration = ++generation.current;
      const run = newRun();
      remember(run);

      setStatus("running");
      setEvents([]);
      setPack(undefined);
      setError(undefined);
      setRecovered(false);

      try {
        const res = await fetch("/api/demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool,
            arguments: args,
            runId: run.runId,
            recoveryToken: run.recoveryToken,
          }),
        });

        if (res.status === 429) {
          const body = (await res.json()) as { cap?: number };
          const message =
            `Today's ${body.cap ?? ""} demo credits are spent. Agents can still pay per call on OKX.AI — the paid endpoint has no such limit.`;
          forgetActive();
          busy.current = false;
          setError(message);
          setStatus("failed");
          return;
        }
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
          forgetActive();
          busy.current = false;
          setError(body.detail ?? body.error ?? `the studio declined (${res.status})`);
          setStatus("failed");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let terminal = false;

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
              terminal = true;
              setPack(event.pack);
              setStatus("done");
              busy.current = false;
              // Keep a 48-hour capability for the most recent finished run. If React, the tab,
              // or the network fails during final pack assembly, a reload can still restore it.
              rememberCompleted(run);
              onFinished?.();
            } else if (event.type === "run_failed") {
              terminal = true;
              setError(event.message);
              setStatus("failed");
              busy.current = false;
              forgetActive();
              onFinished?.();
            }
          }
        }

        // A severed SSE connection is not a failed pipeline. Switch to the persisted log.
        if (!terminal && generation.current === runGeneration) await recover(run, runGeneration);
      } catch (cause) {
        // If the server accepted the request before the network failed, recovery will find it.
        // A validation/allowance rejection has no run row, so recovery returns a clean 404.
        if (generation.current === runGeneration) {
          setError(cause instanceof Error ? cause.message : undefined);
          setStatus("running");
          await recover(run, runGeneration);
        }
      }
    },
    [onFinished, recover],
  );

  return { status, events, pack, error, recovered, start };
}
