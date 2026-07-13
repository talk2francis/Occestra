/**
 * The negotiation skill, v1.0.0 — deterministic on purpose. Quotes, floors,
 * scope handling and refusals are business policy; policy should not vary
 * with model temperature. Every reply is a complete sentence a human operator
 * can send verbatim (no auto-bidding — a person approves every message).
 *
 * State machine: intake -> quoted -> agreed -> delivered -> revising -> closed
 */
import { PolicyGate } from "@occestra/studio-core";
import {
  A2A_VERSION,
  DELIVERY_SPEC,
  PRICING,
  TASK_TYPES,
  type TaskType,
  type TaskTypeSpec,
  type Tier,
} from "./capability.js";

export type Stage = "intake" | "quoted" | "agreed" | "delivered" | "revising" | "closed";

export interface Quote {
  taskType: TaskType;
  tier: Tier;
  quoteUsdt: number;
  rush: boolean;
  scope: Record<string, string>;
  deliverables: string[];
  includes: string;
}

export interface NegotiationState {
  version: string;
  stage: Stage;
  taskType?: TaskType;
  params: Record<string, string>;
  quote?: Quote;
  revisionUsed: boolean;
  declined?: boolean;
}

export interface NegotiationReply {
  reply: string;
  state: NegotiationState;
  /** Set when the operator should run a pipeline: which tool + arguments. */
  action?: { run: "oce_plan_occasion" | "oce_make_keepsake" | "oce_launch_kit"; args: Record<string, unknown> } | { deliver: true };
}

export function freshState(): NegotiationState {
  return { version: A2A_VERSION, stage: "intake", params: {}, revisionUsed: false };
}

/* ------------------------------------------------------------- detectors */

function detectTaskType(text: string): TaskTypeSpec | undefined {
  const lower = text.toLowerCase();
  let best: { spec: TaskTypeSpec; hits: number } | undefined;
  for (const spec of TASK_TYPES) {
    const hits = spec.triggers.filter((t) => lower.includes(t)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { spec, hits };
  }
  return best?.spec;
}

function detectBudget(text: string): number | undefined {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(usdt|usd|dollars?|\$|bucks)/i) ?? text.match(/\$\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : undefined;
}

function detectRush(text: string): boolean {
  return /\b(asap|urgent|right now|immediately|within the hour|in an hour|rush|tonight)\b/i.test(text.toLowerCase());
}

/** Out-of-policy asks reuse the SAME gate the studios run — one policy, everywhere. */
function policyScreen(text: string): string | undefined {
  const verdict = PolicyGate.screenText(text);
  return verdict.allowed ? undefined : PolicyGate.message(verdict);
}

function missingParams(spec: TaskTypeSpec, params: Record<string, string>): TaskTypeSpec["parameters"] {
  return spec.parameters.filter((p) => p.required && !params[p.name]?.trim());
}

/* ---------------------------------------------------------------- pricing */

function tierFor(spec: TaskTypeSpec, params: Record<string, string>, budget: number | undefined): Tier {
  if (budget !== undefined) {
    if (budget >= PRICING.tiers.monumental.range[0]) return "monumental";
    if (budget >= PRICING.tiers.signature.range[0]) return "signature";
    return "essential";
  }
  // No budget named: quote signature by default — the honest middle.
  return spec.id === "keepsake_commission" ? "essential" : "signature";
}

function priceFor(tier: Tier, rush: boolean, budget?: number): number {
  const [low, high] = PRICING.tiers[tier].range;
  // A budget the buyer named, sitting inside the tier, is the quote — meeting
  // a stated number beats anchoring games.
  const base = budget !== undefined && budget >= low && budget <= high ? budget : Math.round((low + high) / 2);
  return rush ? Math.min(PRICING.ceiling, Math.round(base * PRICING.rushMultiplier)) : base;
}

/** "can you do it for 4?" — a bare number in a haggling turn is a budget. */
function detectBareNumber(text: string): number | undefined {
  const match = text.match(/\b(?:for|at|do|pay|price of)\s+(\d{1,2}(?:\.\d+)?)\s*\??$/i) ?? text.match(/^\s*(\d{1,2}(?:\.\d+)?)\s*\??\s*$/);
  return match ? Number(match[1]) : undefined;
}

function buildQuote(spec: TaskTypeSpec, params: Record<string, string>, budget: number | undefined, rush: boolean): Quote {
  const tier = tierFor(spec, params, budget);
  return {
    taskType: spec.id,
    tier,
    quoteUsdt: priceFor(tier, rush, budget),
    rush,
    scope: { ...params },
    deliverables: spec.deliverables.slice(0, tier === "essential" ? 4 : spec.deliverables.length),
    includes: `${DELIVERY_SPEC.revisions} · full TribunalReport · sealed manifest + on-chain verify link`,
  };
}

function quoteMessage(quote: Quote): string {
  const scope = Object.entries(quote.scope)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
  return (
    `Here is the structured quote. ${TASK_TYPES.find((t) => t.id === quote.taskType)!.name}, ` +
    `${quote.tier} tier: ${quote.quoteUsdt} USDT${quote.rush ? " (rush premium included)" : ""}. ` +
    `Scope — ${scope}. Deliverables — ${quote.deliverables.join(", ")}. ` +
    `Included — ${quote.includes}. Delivery is a public pack page whose seal you can verify on X Layer before accepting. ` +
    `Say "agreed" and we start.`
  );
}

/* ------------------------------------------------------------ the skill */

export function negotiate(state: NegotiationState, message: string): NegotiationReply {
  const text = message.trim();

  // Policy screen runs at every stage — an out-of-policy turn ends politely.
  const refusal = policyScreen(text);
  if (refusal) {
    return {
      reply:
        `${refusal} That rule applies to every brief, including our own, so this one we must decline — ` +
        `nothing has been charged. If you can rework the ask around your own people and your own story, we would genuinely like to take it.`,
      state: { ...state, stage: "closed", declined: true },
    };
  }

  switch (state.stage) {
    case "intake": {
      const spec = state.taskType ? TASK_TYPES.find((t) => t.id === state.taskType)! : detectTaskType(text);
      if (!spec) {
        return {
          reply:
            "We take three kinds of work: a Complete Occasion Pack (planning a real event, grounded in real venues and weather), " +
            "a Complete Launch Pack (brand kit from your live site), or a Custom Keepsake Commission (art and story from a real memory). " +
            "Which is closest to what you need?",
          state,
        };
      }

      // Harvest simple params heuristically; a human operator refines them.
      const params = { ...state.params };
      if (!params["brief"]) params["brief"] = text.slice(0, 400);
      const budget = detectBudget(text);
      const rush = detectRush(text);

      const missing = missingParams(spec, params).filter((p) => p.name !== "brief");
      const harvest = harvestParams(spec, text, params);
      const stillMissing = missingParams(spec, harvest).filter((p) => !harvest[p.name]);

      if (stillMissing.length > 0) {
        return {
          reply:
            `Happy to quote this properly — a number without a scope would be a guess, and we don't sell guesses. ` +
            `Three quick things first: ${stillMissing.map((p) => p.ask).join(" ")}`.trim(),
          state: { ...state, taskType: spec.id, params: harvest },
        };
      }

      // Lowball below floor: hold the line once, offer the honest alternatives.
      if (budget !== undefined && budget < PRICING.floor) {
        return {
          reply:
            `${budget} USDT is below our floor of ${PRICING.floor} — the floor exists because the Tribunal grading, repairs and on-chain sealing ` +
            `cost real work on every job, and we would rather decline than cut them. Two honest options: the essential tier at ` +
            `${PRICING.tiers.essential.range[0]}–${PRICING.tiers.essential.range[1]} USDT, or the per-call tools at api.occestra.xyz ` +
            `(a full grounded plan is 0.05 USDT; a Tribunal critique of your own work is 0.01). Either is an honest place to start.`,
          state: { ...state, taskType: spec.id, params: harvest },
        };
      }

      const quote = buildQuote(spec, harvest, budget, rush);
      return {
        reply:
          (rush ? `Under ~${PRICING.rushThresholdHours} hours is genuinely feasible for this scope, and rush carries a ${PRICING.rushMultiplier}× premium — reflected below. ` : "") +
          quoteMessage(quote),
        state: { ...state, taskType: spec.id, params: harvest, quote, stage: "quoted" },
      };
    }

    case "quoted": {
      if (/\b(agreed?|deal|accept|let'?s (do it|go)|yes)\b/i.test(text)) {
        const quote = state.quote!;
        const spec = TASK_TYPES.find((t) => t.id === quote.taskType)!;
        return {
          reply:
            `Agreed — ${quote.quoteUsdt} USDT, ${quote.tier} tier, escrowed per the marketplace flow. The studio starts now; ` +
            `you will receive the pack link and its seal, and you can verify it on X Layer before accepting delivery.`,
          state: { ...state, stage: "agreed" },
          action: { run: toolFor(spec), args: argsFor(spec, state.params) },
        };
      }
      const budget = detectBudget(text) ?? detectBareNumber(text);
      if (budget !== undefined && budget < PRICING.floor) {
        return {
          reply:
            `We hold at the floor — below ${PRICING.floor} USDT the honest product is the per-call tools, not a thinner package. ` +
            `The essential tier stands at ${state.quote?.tier === "essential" ? state.quote.quoteUsdt : PRICING.tiers.essential.range[0]}–${PRICING.tiers.essential.range[1]} USDT if useful.`,
          state,
        };
      }
      if (budget !== undefined && state.quote && budget < state.quote.quoteUsdt) {
        const spec = TASK_TYPES.find((t) => t.id === state.quote!.taskType)!;
        const counter = buildQuote(spec, state.params, budget, state.quote.rush);
        return {
          reply:
            `We can meet ${budget} USDT at the ${counter.tier} tier — the scope adjusts with the number: ${counter.deliverables.join(", ")}. ` +
            quoteMessage(counter),
          state: { ...state, quote: counter },
        };
      }
      return { reply: "The quote stands as sent — say “agreed” to start, or tell me what in the scope should change.", state };
    }

    case "agreed": {
      // Scope creep after agreement: the agreement stands; new asks are change orders.
      return {
        reply:
          `The agreed scope is locked and in production. What you're describing is new scope — happily quoted as a change order ` +
          `on top of the ${state.quote?.quoteUsdt} USDT agreement, so neither of us renegotiates mid-job. Want the change-order quote?`,
        state,
      };
    }

    case "delivered": {
      if (state.revisionUsed) {
        return {
          reply:
            `The included revision round has been used. Further changes are a change order — send the itemized list and we will quote it. ` +
            `The delivered pack and its report remain verifiable at the same link.`,
          state,
        };
      }
      return {
        reply:
          `Understood — this is your included revision round. Please itemize the changes against specific artifacts ` +
          `(e.g. "launch_thread post 3: name the audience"), and the studio will rework and re-grade them.`,
        state: { ...state, stage: "revising", revisionUsed: true },
      };
    }

    case "revising": {
      return {
        reply: `Revision received and in the studio. The reworked artifacts will be re-graded and the pack re-delivered at the same link.`,
        state: { ...state, stage: "delivered" },
        action: { deliver: true },
      };
    }

    case "closed":
      return { reply: "This negotiation is closed. Start a fresh one any time — the capability sheet is at /a2a/capabilities.", state };
  }
}

/** Mark a run delivered (operator calls this after the pipeline finishes). */
export function delivered(state: NegotiationState, packUrl: string): NegotiationReply {
  return {
    reply:
      `Delivered: ${packUrl} — every artifact with its Tribunal grades, and the seal. ` +
      `Verify it on X Layer from that page before accepting; the chain, not us, is the referee. ` +
      `One structured revision round is included if anything misses.`,
    state: { ...state, stage: "delivered" },
  };
}

/* ------------------------------------------------------- param harvesting */

function harvestParams(spec: TaskTypeSpec, text: string, params: Record<string, string>): Record<string, string> {
  const out = { ...params };
  const lower = text.toLowerCase();

  if (spec.id === "occasion_pack") {
    const city = text.match(/\bin ([A-Z][a-zA-ZÀ-ɏ]+(?: [A-Z][a-zA-ZÀ-ɏ]+)?)\b/)?.[1];
    if (city && !out["city"]) out["city"] = city;
    const date = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
    if (date && !out["date"]) out["date"] = date;
    const heads = lower.match(/\b(\d{1,3})\s*(people|guests|of us|persons|pax)\b/)?.[1];
    if (heads && !out["headcount"]) out["headcount"] = heads;
    if (!out["occasion"]) out["occasion"] = text.slice(0, 200);
  }
  if (spec.id === "launch_pack") {
    const url = text.match(/https?:\/\/\S+/)?.[0];
    if (url && !out["url"]) out["url"] = url;
    const name = text.match(/(?:called|named|for)\s+["“]?([A-Z][\w-]+)["”]?/)?.[1];
    if (name && !out["productName"]) out["productName"] = name;
    const audienceMatch = lower.match(/\bfor ((?:indie |senior |early |new )?(?:builder|developer|founder|team|engineer|hacker|creator|designer|maker|user|customer)s?\b[^.,;]*)/);
    if (audienceMatch && !out["audience"]) out["audience"] = audienceMatch[1] ?? "";
  }
  if (spec.id === "keepsake_commission") {
    if (!out["title"]) out["title"] = text.slice(0, 120);
    if (text.length > 60 && !out["description"]) out["description"] = text.slice(0, 800);
  }
  return out;
}

function toolFor(spec: TaskTypeSpec): "oce_plan_occasion" | "oce_make_keepsake" | "oce_launch_kit" {
  return spec.studio === "celebrate" ? "oce_plan_occasion" : spec.studio === "remember" ? "oce_make_keepsake" : "oce_launch_kit";
}

function argsFor(spec: TaskTypeSpec, params: Record<string, string>): Record<string, unknown> {
  if (spec.id === "occasion_pack") {
    return {
      occasion: params["occasion"] ?? params["brief"],
      city: params["city"],
      date: params["date"],
      headcount: Number(params["headcount"] ?? 8),
      vibe: params["vibe"] ?? "warm, considered",
    };
  }
  if (spec.id === "launch_pack") {
    return {
      productName: params["productName"],
      ...(params["url"] ? { url: params["url"] } : {}),
      ...(params["audience"] ? { audience: params["audience"] } : {}),
    };
  }
  return {
    title: params["title"],
    ...(params["description"] ? { description: params["description"] } : {}),
    ...(params["tone"] ? { tone: params["tone"] } : {}),
  };
}
