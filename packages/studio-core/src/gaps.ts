/**
 * What a buyer is allowed to read when something went wrong.
 *
 * Coverage gaps were being written with the raw provider failure pasted straight in,
 * and they are PUBLIC — they ship in the pack, on /k, in tool responses. Live packs
 * were publishing lines like:
 *
 *   og_image:failed — https://api.openai.com/v1/images/generations responded 400:
 *   { "error": { "message": "Billing hard limit has been reached." } }
 *
 * That is our vendor, our endpoint, our billing state, and our HTTP status, on a page
 * we hand to a customer. It tells them nothing they can act on and everything they
 * should never have to see.
 *
 * So every gap crossing a public boundary passes through here and comes out as a
 * STABLE CODE plus ONE PLAIN SENTENCE. The raw text stays in the server log. This runs
 * at RENDER time, not write time, so packs already in the store are cleaned up too —
 * we do not rewrite history, we stop republishing it.
 */

export interface PublicGap {
  /** Stable identifier. Clients may key off this; it is part of the contract. */
  code: string;
  /** One sentence, safe to show anyone. */
  note: string;
}

/** Anything that betrays the plumbing rather than describing the shortfall. */
function leaksInternals(text: string): boolean {
  return (
    /https?:\/\//.test(text) ||
    /responded\s+\d{3}/.test(text) ||
    /[{}]/.test(text) ||
    /\bsk-[A-Za-z0-9_-]{6,}/.test(text) ||
    /<\?xml|<!DOCTYPE|<html/i.test(text) ||
    /\b(?:ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EACCES|ENOSPC)\b/.test(text) ||
    /\bat\s+\w+\s+\(.*:\d+:\d+\)/.test(text)
  );
}

/** Exact codes we have curated words for. */
const NOTES: Record<string, string> = {
  MODEL_ROUTER: "A preferred model was unavailable, so another was used. The work was still graded.",
  TEXT_MODEL_UNAVAILABLE:
    "No writing model was configured, so the words here are placeholders rather than written work.",
  IMAGE_MODEL_UNAVAILABLE:
    "No image model was configured, so the imagery here is a placeholder rather than generated art.",
  CRITIQUE_UNAVAILABLE:
    "The model critic could not be reached, so these artifacts were checked deterministically but not judged on taste.",
  VISION_UNAVAILABLE:
    "No vision model was available, so any photographs you supplied were not read, and this was built from words alone.",
  SITE_INSPECTION_UNAVAILABLE:
    "The browser that reads your live page was unavailable, so nothing here is grounded in the real site.",
  MARKET_DATA_UNAVAILABLE:
    "On-chain market data could not be verified, so no price or supply is claimed anywhere in this pack.",
  SEALING_UNAVAILABLE:
    "No signing key was configured, so this pack is delivered unsigned and unanchored.",
  FAKE_PROVIDERS:
    "Every provider in this run was a deterministic fake. This is a rehearsal, not real work.",
  "tribunal:not-wired": "These artifacts were produced but not graded.",
  "site:not-provided":
    "No URL was given, so the brand genome is inferred from your description and is not grounded in a real page.",
  "site:inspection-failed":
    "Your live page could not be opened, so this kit is built from the description alone rather than from the real site.",
  "market:unavailable":
    "Token facts could not be verified, so this pack states no price and no supply.",
  CONTRAST_LOW: "Contrast could not be measured on this artifact, because it declares no text layer.",
};

/** Families, matched by suffix, for the long tail of per-artifact failures. */
const FAMILIES: Array<[RegExp, string]> = [
  [
    /:degraded$/,
    "The model did not return usable output for this piece, so a simpler fallback was used. It is marked here rather than hidden.",
  ],
  [
    /^places:.*failed$/,
    "A venue search did not answer, so fewer real candidates were considered than we would have liked.",
  ],
  [/^places:/, "No real venue matched this search, so none is named."],
  [/^weather:/, "No real forecast exists for this date, so the plan says so rather than inventing one."],
  [
    /:slop-survived$/,
    "A banned filler phrase survived a rewrite in this copy. Read it before you use it.",
  ],
  [/^image_provider:/, "This image could not be produced, and nothing was substituted in its place."],
  [
    // ":failed" and "-failed" both occur in the wild (og_image:failed, carousel:card-1-failed)
    /failed$/,
    "This piece could not be produced. Rather than show you something broken, it is marked undelivered.",
  ],
];

const GENERIC = "Part of this run did not complete. It is recorded here rather than hidden.";

/**
 * Split "CODE — sentence" or "CODE: sentence" into its parts.
 *
 * Both separators are in use AND codes contain colons themselves, so neither can simply
 * win by position. "MODEL_ROUTER: ANTHROPIC_API_KEY absent — planner falls back" contains
 * both, and taking the first em-dash yields the nonsense code
 * "MODEL_ROUTER: ANTHROPIC_API_KEY absent".
 *
 * The rule that actually holds: a CODE IS ONE TOKEN, never containing a space. So an
 * em-dash split is only accepted when what precedes it is a single token; otherwise the
 * first colon wins.
 */
function split(raw: string): { code: string; rest: string } {
  const dash = /^(\S+)\s+—\s+([\s\S]+)$/.exec(raw);
  if (dash) return { code: dash[1]!, rest: dash[2]!.trim() };

  const colon = /^(\S+?):\s+([\s\S]+)$/.exec(raw);
  if (colon) return { code: colon[1]!, rest: colon[2]!.trim() };

  return { code: raw.trim(), rest: "" };
}

function familyNote(code: string): string | undefined {
  for (const [pattern, note] of FAMILIES) {
    if (pattern.test(code)) return note;
  }
  return undefined;
}

/**
 * One raw gap in, one publishable gap out. Never throws; never leaks.
 *
 * The precedence matters, and it is not "curated always wins":
 *
 * 1. An EXACT code in NOTES is infrastructure — "ANTHROPIC_API_KEY absent", "no vision
 *    model configured". The written text is about OUR plumbing and names OUR env vars,
 *    so the curated sentence replaces it, always.
 * 2. Otherwise, a written sentence that is already clean is BETTER than anything generic,
 *    because it is specific: "the occasion is 20 days out and no real forecast exists that
 *    far ahead" tells the buyer something a canned line never could. Keep it.
 * 3. If that sentence leaks internals (a URL, an HTTP status, a JSON body), fall back to
 *    the family's curated line.
 * 4. Failing everything, say the honest generic thing.
 */
export function sanitizeGap(raw: string): PublicGap {
  const { code, rest } = split(raw);

  if (NOTES[code]) return { code, note: NOTES[code]! };
  if (rest && !leaksInternals(rest)) return { code, note: rest };
  return { code, note: familyNote(code) ?? GENERIC };
}

/**
 * The same scrub, applied inside a TribunalReport.
 *
 * The report is opaque here (it is typed in @occestra/tribunal, which depends on this
 * package), so it is reached structurally. Its gaps ship as flat strings to keep the
 * report's public shape stable for clients already parsing it.
 */
export function sanitizeTribunal(report: unknown): unknown {
  if (!report || typeof report !== "object") return report;
  const held = report as { coverageGaps?: unknown };
  if (!Array.isArray(held.coverageGaps)) return report;

  return {
    ...held,
    coverageGaps: sanitizeGaps(held.coverageGaps as string[]).map(
      (gap) => `${gap.code} — ${gap.note}`,
    ),
  };
}

/** Sanitize a pack's gaps, dropping duplicates that collapse to the same code + note. */
export function sanitizeGaps(raw: string[]): PublicGap[] {
  const seen = new Map<string, PublicGap>();
  for (const gap of raw) {
    const clean = sanitizeGap(gap);
    seen.set(`${clean.code}|${clean.note}`, clean);
  }
  return [...seen.values()];
}
