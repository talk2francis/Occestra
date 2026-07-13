/**
 * The A2A capability declaration — what Occestra takes on, for how much, and
 * what delivery means. Served publicly at GET /a2a/capabilities and used by
 * the negotiation skill, so the declaration and the behaviour cannot drift.
 *
 * Per the OKX.AI A2A guide (how-to-become-a2a, read 2026-07-13): capability
 * declaration + pricing strategy + delivery spec, explicitly declared.
 */

export const A2A_VERSION = "1.0.0";

export type TaskType = "occasion_pack" | "launch_pack" | "keepsake_commission";
export type Tier = "essential" | "signature" | "monumental";

export interface TaskTypeSpec {
  id: TaskType;
  name: string;
  studio: "celebrate" | "remember" | "launch";
  triggers: string[];
  /** Intake parameters. Required ones gate any quote. */
  parameters: Array<{ name: string; required: boolean; ask: string }>;
  deliverables: string[];
}

export const TASK_TYPES: TaskTypeSpec[] = [
  {
    id: "occasion_pack",
    name: "Complete Occasion Pack",
    studio: "celebrate",
    triggers: ["plan", "party", "dinner", "event", "birthday", "anniversary", "farewell", "reunion", "wedding", "celebration"],
    parameters: [
      { name: "occasion", required: true, ask: "What is the occasion, in your words?" },
      { name: "city", required: true, ask: "Which city? The plan grounds itself in real venues there." },
      { name: "date", required: true, ask: "What date? Forecasts only exist ~10 days out — beyond that the plan says so honestly." },
      { name: "headcount", required: true, ask: "How many guests?" },
      { name: "vibe", required: false, ask: "What should it feel like?" },
      { name: "budgetUsd", required: false, ask: "Is there a budget the plan must respect?" },
    ],
    deliverables: ["plan", "schedule", "budget", "contingency", "guest_guide", "invitation", "toast", "moodboard"],
  },
  {
    id: "launch_pack",
    name: "Complete Launch Pack",
    studio: "launch",
    triggers: ["launch", "ship", "announce", "brand", "go-to-market", "marketing kit", "hero image", "thread"],
    parameters: [
      { name: "productName", required: true, ask: "What is the product called?" },
      { name: "url", required: false, ask: "Is there a live URL? We read the real page in a headless browser — the genome is far stronger with one." },
      { name: "audience", required: true, ask: "Who is this for?" },
      { name: "deadline", required: false, ask: "When do you need it?" },
    ],
    deliverables: ["brand_kit", "og_image", "brand_mark", "launch_thread", "demo_script", "landing_spec"],
  },
  {
    id: "keepsake_commission",
    name: "Custom Keepsake Commission",
    studio: "remember",
    triggers: ["keepsake", "memory", "memento", "tribute", "trip", "gift", "remember", "photos into"],
    parameters: [
      { name: "title", required: true, ask: "What do you call this memory?" },
      { name: "description", required: true, ask: "What happened, in your words? Names you use are treated as your own facts." },
      { name: "tone", required: false, ask: "What register — nostalgic, celebratory, quiet?" },
    ],
    deliverables: ["keepsake_art", "story_page"],
  },
];

/** Pricing: floors are floors. Below the floor we point at the per-call tools. */
export const PRICING = {
  currency: "USDT",
  floor: 2,
  ceiling: 15,
  rushMultiplier: 1.5,
  rushThresholdHours: 2,
  tiers: {
    essential: { range: [2, 4] as const, scope: "core deliverables, one style, standard turnaround" },
    signature: { range: [5, 9] as const, scope: "full deliverable set, style direction honored, grounded research" },
    monumental: { range: [10, 15] as const, scope: "everything, multiple style explorations, rush-eligible, extended revision" },
  },
} as const;

export const DELIVERY_SPEC = {
  format: "a public pack page (/k/:id) with every artifact + the full TribunalReport, plus the sealed manifest JSON",
  qualityBar: `graded against the published Occestra Quality Standard; the report ships with the pack, pass or fail`,
  revisions: "1 structured revision round included; further rounds quoted as change orders",
  acceptanceTemplate: [
    "deliverables list agreed at quote time",
    "House Style id agreed at quote time",
    "grounding requirements stated (city/date or live URL)",
    "deadline stated",
    "delivery = the /k link; buyer can verify the seal on X Layer before accepting",
  ],
} as const;

export function capabilities() {
  return {
    version: A2A_VERSION,
    agent: "Occestra — the Occasion Studio",
    agentId: 5213,
    taskTypes: TASK_TYPES,
    pricing: PRICING,
    delivery: DELIVERY_SPEC,
    standard: "https://occestra.xyz/standard",
    docs: "https://occestra.xyz/docs/a2a",
  };
}
