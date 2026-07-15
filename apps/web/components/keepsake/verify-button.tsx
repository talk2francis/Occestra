"use client";

/**
 * The trustless bit: the browser itself computes the seal leaf and reads
 * anchoredAt(leaf) straight from KeepsakeRegistry on X Layer — our servers are
 * not in the loop. Green means the chain agrees; "queued" means the seal is
 * signed but the anchor batch hasn't landed yet, and we say so.
 */
import { useState } from "react";
import { createPublicClient, http } from "viem";
import { EXPLORER_ADDR, X_LAYER_RPC, leafOfSeal, type PublicSeal } from "@/lib/pack";

const ABI = [
  {
    name: "anchoredAt",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "leaf", type: "bytes32" }],
    outputs: [{ type: "uint64" }],
  },
] as const;

type State =
  | { step: "idle" }
  | { step: "checking" }
  | { step: "verified"; anchoredAt: Date }
  | { step: "queued" }
  | { step: "error"; message: string };

export function VerifyButton({ seal }: { seal: PublicSeal }) {
  const [state, setState] = useState<State>({ step: "idle" });

  const verify = async () => {
    setState({ step: "checking" });
    try {
      const client = createPublicClient({ transport: http(X_LAYER_RPC) });
      const stamp = await client.readContract({
        address: seal.verifyingContract,
        abi: ABI,
        functionName: "anchoredAt",
        args: [leafOfSeal(seal)],
      });
      setState(
        stamp > 0n
          ? { step: "verified", anchoredAt: new Date(Number(stamp) * 1000) }
          : { step: "queued" },
      );
    } catch {
      setState({ step: "error", message: "The RPC could not be reached from your browser — try the explorer link instead." });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={verify}
          disabled={state.step === "checking"}
          className={`inline-flex h-11 items-center gap-2 rounded-full px-6 text-[0.9rem] font-medium shadow-lift transition-colors ${
            state.step === "verified"
              ? "bg-pass text-night"
              : "bg-ink text-ground hover:bg-plum disabled:opacity-60"
          }`}
        >
          {state.step === "verified" ? (
            <>
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Verified on X Layer
            </>
          ) : state.step === "checking" ? (
            "Reading the chain…"
          ) : (
            "Verify on X Layer"
          )}
        </button>
        <a
          href={`${EXPLORER_ADDR}${seal.verifyingContract}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.85rem] font-medium text-ink/65 underline decoration-ink/25 underline-offset-4 hover:text-ink"
        >
          KeepsakeRegistry on the explorer ↗
        </a>
      </div>

      {state.step === "verified" && (
        <p className="text-data text-pass">
          anchoredAt = {state.anchoredAt.toISOString()} — read by your browser, straight from the
          contract. Our servers were not consulted.
        </p>
      )}
      {state.step === "queued" && (
        <p className="text-data text-info">
          The seal is signed, and its anchor is queued — the worker batches leaves onto X Layer
          every half hour. Check back shortly; the chain will agree.
        </p>
      )}
      {state.step === "error" && <p className="text-data text-fail">{state.message}</p>}
    </div>
  );
}
