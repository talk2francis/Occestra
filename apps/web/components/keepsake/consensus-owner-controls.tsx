"use client";

import { useEffect, useState } from "react";

interface StoredRun { runId: string; recoveryToken: string; createdAt: number }

export function ConsensusOwnerControls({ keepsakeId, artifactId, hasReview }: {
  keepsakeId: string; artifactId: string; hasReview: boolean;
}) {
  const [capability, setCapability] = useState<StoredRun>();
  const [state, setState] = useState<"idle" | "consent" | "sending" | "queued" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem("oce-recent-studio-run") ?? "null") as StoredRun | null;
      if (value?.runId && value.recoveryToken && Date.now() - value.createdAt < 48 * 60 * 60 * 1000) setCapability(value);
    } catch { /* A malformed local value grants nothing. */ }
  }, []);

  if (hasReview || !capability) return null;
  const request = async () => {
    setState("sending"); setMessage("");
    const response = await fetch("/api/consensus", {
      method: "POST",
      headers: { "content-type": "application/json", "x-oce-run-id": capability.runId, "x-oce-recovery-token": capability.recoveryToken },
      body: JSON.stringify({ keepsakeId, artifactId, publicForConsensus: true }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { setState("error"); setMessage(body.error ?? "The review could not be requested."); return; }
    setState("queued"); setMessage("Review queued. Reload this page to follow its persisted on-chain status.");
  };

  return <div className="mt-3 rounded-xl border border-amethyst/20 bg-amethyst/5 p-4">
    <p className="text-kicker text-amethyst">Independent GenLayer review</p>
    {state === "idle" && <button className="mt-2 rounded-full border border-amethyst/30 px-4 py-2 text-[0.85rem] font-semibold text-amethyst" onClick={() => setState("consent")}>Ask GenLayer</button>}
    {state === "consent" && <div className="mt-2 text-[0.82rem] leading-relaxed text-ink/65">
      <p>This permanently publishes this artifact, its Tribunal verdict, and a frozen evidence snapshot for independent validators.</p>
      <div className="mt-3 flex gap-2"><button className="rounded-full bg-amethyst px-4 py-2 font-semibold text-white" onClick={() => void request()}>I consent — request review</button><button onClick={() => setState("idle")}>Cancel</button></div>
    </div>}
    {state === "sending" && <p className="mt-2 text-[0.82rem] text-ink/60">Authenticating ownership and freezing evidence…</p>}
    {(state === "queued" || state === "error") && <p className={`mt-2 text-[0.82rem] ${state === "error" ? "text-fail" : "text-ink/65"}`}>{message}</p>}
  </div>;
}
