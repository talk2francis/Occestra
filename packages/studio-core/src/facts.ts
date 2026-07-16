/**
 * The facts a run is allowed to state — handed to the writer before it writes.
 *
 * The failure this exists to stop is a real one, from our own dogfooding: asked to write
 * a launch thread for Occestra, the model invented "Starting at $49 per event" for a
 * product whose tools cost cents. `findFabrications()` caught the number and replaced it
 * with [YOUR PRICE HERE] — which is a bandage, not a cure. The model reached for a price
 * because it had none, and a placeholder in delivered copy is itself a defect.
 *
 * So the writer is now GIVEN the facts. It does not have to guess the price, the URL, or
 * the product's name, because they are in the prompt. And it is told, in the plainest
 * language available, that these are the only ones it may state — and that if a fact it
 * wants is not here, it must leave the claim out rather than invent it OR placeholder it.
 */

import type { BriefContext } from "./types.js";

export interface RunFacts {
  /** What the thing is actually called. */
  productName: string;
  /** Its real address, if there is one. */
  url?: string | undefined;
  /** Our marketplace identity, when the copy is about us. */
  agentId?: string | undefined;
  /** The REAL price list — passed in, never guessed. */
  prices?: ReadonlyArray<{ name: string; usdt: number }> | undefined;
  /** Anything else established by evidence (a real headline, a real audience). */
  established?: readonly string[] | undefined;
  /** Optional first-party depth from the Detailed Brief. */
  briefContext?: BriefContext | undefined;
}

/** Stable, labelled facts from the Detailed Brief. Never flatten these into
 * untrusted prose without their labels: "avoid X" must never become "do X". */
export function briefContextFacts(context?: BriefContext): string[] {
  if (!context) return [];
  const lines: string[] = [];
  if (context.honoreeDetails) lines.push(`Owner-established context: ${context.honoreeDetails}`);
  if (context.dietaryNotes) lines.push(`Dietary requirements: ${context.dietaryNotes}`);
  if (context.accessibilityNotes) lines.push(`Accessibility requirements: ${context.accessibilityNotes}`);
  if (context.doList?.length) lines.push(`Must include: ${context.doList.join("; ")}`);
  if (context.dontList?.length) lines.push(`Must avoid: ${context.dontList.join("; ")}`);
  if (context.referenceLinks?.length) lines.push(`Owner-provided references: ${context.referenceLinks.join(", ")}`);
  if (context.tonePreference) lines.push(`Tone requested: ${context.tonePreference}`);
  return lines;
}

/** A deterministic input-quality measure used by the corpus. It rewards usable,
 * bounded context—not verbosity—and gives the three detailed fixtures a measurable
 * claim without pretending it is an output-quality benchmark. */
export function briefSpecificityScore(context?: BriefContext): number {
  if (!context) return 20;
  const facts = briefContextFacts(context);
  const boundaries = (context.doList?.length ?? 0) + (context.dontList?.length ?? 0);
  const sources = context.referenceLinks?.length ?? 0;
  return Math.min(100, 20 + facts.length * 10 + Math.min(boundaries, 6) * 4 + Math.min(sources, 3) * 5);
}

/**
 * Render the facts into a prompt block.
 *
 * Deliberately blunt. The instruction that matters is the last one: a missing fact is not
 * an invitation to write a placeholder — it is an instruction to say less.
 */
export function factsBlock(facts: RunFacts): string {
  const lines: string[] = [
    "ESTABLISHED FACTS. These are true. Use them exactly as written.",
    "",
    `- Product name: ${facts.productName}`,
  ];

  lines.push(facts.url ? `- URL: ${facts.url}` : "- URL: none was provided.");

  if (facts.agentId) lines.push(`- Marketplace agent id: ${facts.agentId}`);

  if (facts.prices?.length) {
    lines.push("- Real prices, in USDT per call. These are the ONLY prices that exist:");
    for (const price of facts.prices) {
      lines.push(`    ${price.name}: ${price.usdt === 0 ? "free" : `${price.usdt} USDT`}`);
    }
  }

  for (const fact of facts.established ?? []) lines.push(`- ${fact}`);
  for (const fact of briefContextFacts(facts.briefContext)) lines.push(`- ${fact}`);

  lines.push(
    "",
    "RULES ABOUT THESE FACTS — these override anything else you have been told:",
    "1. NEVER invent a price, a user count, a percentage, a funding round, a customer, or a metric. If it is not listed above, it does not exist.",
    "2. NEVER write a placeholder. Not [YOUR PRICE HERE], not [BRACKETS] of any kind, not TBD, not XXX, not lorem ipsum. A placeholder in finished copy is worse than an omission, because it ships looking deliberate.",
    "3. If you want to make a claim and the fact for it is not above, LEAVE THE CLAIM OUT. Writing less is always allowed. Writing something untrue is never allowed.",
  );

  return lines.join("\n");
}
