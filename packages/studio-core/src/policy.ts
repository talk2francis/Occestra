/**
 * PolicyGate — screens every brief before a single token is spent, and screens final copy
 * again inside the Tribunal (POLICY_VIOLATION). Conservative by design: err toward blocking.
 * These are eligibility and integrity risks, not style preferences (AGENTS.md, hard rules).
 */
import type { OccasionContract } from "./types.js";

export type PolicyCode = "POLICY_IP" | "POLICY_PERSON" | "POLICY_SAFETY";

export interface PolicyReason {
  code: PolicyCode;
  /** The matched trigger, for logging and for the polite user-facing message. */
  term: string;
  detail: string;
}

export interface PolicyVerdict {
  allowed: boolean;
  reasons: PolicyReason[];
}

export interface PolicyOptions {
  /**
   * Escape hatch for the owner's OWN brands only (env-fed, e.g. OCE_BRAND_ALLOWLIST).
   * An allowlisted term is exempt from POLICY_IP. It never exempts POLICY_SAFETY.
   */
  allowlist?: readonly string[];
}

/* Third-party IP: franchises, characters, studios, trademarked worlds. */
const IP_TERMS = [
  "disney",
  "pixar",
  "marvel",
  "avengers",
  "spider-man",
  "spiderman",
  "iron man",
  "batman",
  "superman",
  "wonder woman",
  "dc comics",
  "star wars",
  "jedi",
  "darth vader",
  "baby yoda",
  "grogu",
  "harry potter",
  "hogwarts",
  "lord of the rings",
  "gandalf",
  "pokemon",
  "pokémon",
  "pikachu",
  "nintendo",
  "super mario",
  "zelda",
  "sonic the hedgehog",
  "minecraft",
  "fortnite",
  "roblox",
  "hello kitty",
  "sanrio",
  "barbie",
  "mattel",
  "lego",
  "peppa pig",
  "paw patrol",
  "bluey",
  "frozen elsa",
  "elsa and anna",
  "mickey mouse",
  "minnie mouse",
  "winnie the pooh",
  "looney tunes",
  "studio ghibli",
  "ghibli",
  "totoro",
  "simpsons",
  "south park",
  "rick and morty",
  "game of thrones",
  "squid game",
  "stranger things",
  "coca-cola",
  "coca cola",
  "nike swoosh",
  "supreme box logo",
];

/* Real people: likeness, impersonation, deepfakes. */
const PERSON_TERMS = [
  "celebrity",
  "celebrities",
  "likeness of",
  "deepfake",
  "deep fake",
  "impersonate",
  "impersonation",
  "look-alike of",
  "lookalike of",
  "taylor swift",
  "beyonce",
  "beyoncé",
  "kanye",
  "drake",
  "rihanna",
  "elon musk",
  "donald trump",
  "joe biden",
  "obama",
  "putin",
  "cristiano ronaldo",
  "lionel messi",
  "kim kardashian",
  "mrbeast",
  "cz binance",
  "vitalik buterin",
];

const PERSON_PATTERNS: Array<{ re: RegExp; detail: string }> = [
  {
    re: /\b(photo|portrait|image|picture|render)\s+of\s+(a\s+)?(real|famous|well[- ]known)\s+(person|celebrity|politician|actor|musician)\b/i,
    detail: "requests a rendering of a real, identifiable person",
  },
  {
    re: /\b(as|dressed as|cosplaying)\s+(a\s+)?(famous|well[- ]known)\s+\w+/i,
    detail: "requests depiction as a real public figure",
  },
];

/* Hard-blocked content categories. No allowlist ever exempts these. */
const MINOR_TERMS = [
  "child",
  "children",
  "kid",
  "kids",
  "toddler",
  "infant",
  "baby",
  "minor",
  "minors",
  "underage",
  "teen",
  "teens",
  "teenage",
  "teenager",
  "preteen",
  "schoolgirl",
  "schoolboy",
  "loli",
  "shota",
];

const SEXUAL_TERMS = [
  "sexy",
  "sexual",
  "sexualized",
  "nude",
  "nudes",
  "naked",
  "erotic",
  "erotica",
  "nsfw",
  "lingerie",
  "seductive",
  "provocative",
  "fetish",
  "porn",
  "pornographic",
  "topless",
  "bikini shoot",
  "onlyfans",
];

/** Romantic framing is only a problem when it lands on a minor. */
const ROMANTIC_TERMS = [
  "romantic",
  "romance",
  "flirty",
  "flirtatious",
  "dating",
  "seduce",
  "kiss on the lips",
  "boyfriend material",
  "girlfriend material",
];

const HATE_TERMS = [
  "white power",
  "white supremacy",
  "heil hitler",
  "nazi party",
  "kkk rally",
  "ethnic cleansing",
  "genocide of",
  "gas the",
  "racial slur",
  "hate speech against",
  "kill all",
  "death to all",
];

const HARASSMENT_TERMS = [
  "harass",
  "harassment campaign",
  "dox",
  "doxx",
  "doxxing",
  "revenge porn",
  "humiliate my ex",
  "bully",
  "smear campaign",
  "blackmail",
  "extort",
];

const ILLEGAL_TERMS = [
  "how to make a bomb",
  "build a bomb",
  "pipe bomb",
  "explosive device",
  "ghost gun",
  "untraceable gun",
  "3d printed gun",
  "silencer",
  "sell meth",
  "cook meth",
  "buy cocaine",
  "sell cocaine",
  "sell heroin",
  "fentanyl for sale",
  "hire a hitman",
  "assassinate",
  "human trafficking",
  "counterfeit passport",
  "forged id",
  "steal credit card",
  "carding tutorial",
];

const IMPERSONATION_TERMS = [
  "fake id",
  "forge a signature",
  "phishing page",
  "phishing email",
  "fake invoice",
  "fake certificate",
  "pretend to be the ceo",
  "pose as a bank",
  "clone the official site",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_*~`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function containsTerm(haystack: string, term: string): boolean {
  const t = term.toLowerCase();
  // Word-boundary match for single alphanumeric words; plain substring for phrases,
  // which already carry their own boundaries.
  if (/^[a-z0-9]+$/.test(t)) {
    return new RegExp(`\\b${t}\\b`).test(haystack);
  }
  return haystack.includes(t);
}

function findTerms(haystack: string, terms: readonly string[]): string[] {
  return terms.filter((term) => containsTerm(haystack, term));
}

function positionsOf(haystack: string, terms: readonly string[]): number[] {
  const out: number[] = [];
  for (const term of terms) {
    const t = term.toLowerCase();
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(t, from);
      if (at < 0) break;
      out.push(at);
      from = at + t.length;
    }
  }
  return out;
}

/**
 * Romantic language and a mention of a child are each innocuous alone — an anniversary
 * keepsake whose notes mention the kids is a real, common brief. It is the two landing in
 * the same breath that is disqualifying, so we require them to be near each other.
 */
const PROXIMITY_CHARS = 60;

function co_occurNear(haystack: string, a: readonly string[], b: readonly string[]): boolean {
  const left = positionsOf(haystack, a);
  const right = positionsOf(haystack, b);
  return left.some((x) => right.some((y) => Math.abs(x - y) <= PROXIMITY_CHARS));
}

/** Every free-text field a user can influence. Structured/enum fields are safe by construction. */
export function briefText(contract: OccasionContract): string {
  const parts: string[] = [];
  switch (contract.studio) {
    case "celebrate":
      parts.push(contract.occasion, contract.city, contract.vibe, ...contract.constraints);
      if (contract.country) parts.push(contract.country);
      break;
    case "remember":
      parts.push(contract.title, contract.tone);
      if (contract.notes) parts.push(contract.notes);
      break;
    case "launch":
      parts.push(contract.productName);
      if (contract.description) parts.push(contract.description);
      if (contract.audience) parts.push(contract.audience);
      if (contract.url) parts.push(contract.url);
      break;
  }
  return parts.join(" \n ");
}

/** Screen arbitrary text (a brief, or generated copy on its way out of the Tribunal). */
export function screenText(text: string, options: PolicyOptions = {}): PolicyVerdict {
  const hay = normalize(text);
  const allowlist = (options.allowlist ?? []).map((term) => term.toLowerCase());
  const reasons: PolicyReason[] = [];

  // --- SAFETY (hard, never exemptible) ---
  const minors = findTerms(hay, MINOR_TERMS);
  const sexual = findTerms(hay, SEXUAL_TERMS);
  const romantic = findTerms(hay, ROMANTIC_TERMS);

  if (sexual.length > 0 && minors.length > 0) {
    reasons.push({
      code: "POLICY_SAFETY",
      term: `${minors[0]!} + ${sexual[0]!}`,
      detail: "sexual content involving a minor — hard block, no exceptions",
    });
  } else if (
    romantic.length > 0 &&
    minors.length > 0 &&
    co_occurNear(hay, MINOR_TERMS, ROMANTIC_TERMS)
  ) {
    reasons.push({
      code: "POLICY_SAFETY",
      term: `${minors[0]!} + ${romantic[0]!}`,
      detail: "romantic framing involving a minor — hard block, no exceptions",
    });
  } else if (sexual.length > 0) {
    reasons.push({
      code: "POLICY_SAFETY",
      term: sexual[0]!,
      detail: "sexual or adult content is out of scope for Occestra",
    });
  }

  for (const term of findTerms(hay, HATE_TERMS)) {
    reasons.push({ code: "POLICY_SAFETY", term, detail: "hate or extremist content" });
  }
  for (const term of findTerms(hay, HARASSMENT_TERMS)) {
    reasons.push({ code: "POLICY_SAFETY", term, detail: "harassment or targeted abuse" });
  }
  for (const term of findTerms(hay, ILLEGAL_TERMS)) {
    reasons.push({ code: "POLICY_SAFETY", term, detail: "weapons, drugs, or other illegal activity" });
  }

  // --- PERSON (likeness / impersonation) ---
  for (const term of findTerms(hay, PERSON_TERMS)) {
    reasons.push({
      code: "POLICY_PERSON",
      term,
      detail: "likeness or impersonation of a real person",
    });
  }
  for (const { re, detail } of PERSON_PATTERNS) {
    const match = re.exec(hay);
    if (match) reasons.push({ code: "POLICY_PERSON", term: match[0], detail });
  }
  for (const term of findTerms(hay, IMPERSONATION_TERMS)) {
    reasons.push({ code: "POLICY_PERSON", term, detail: "impersonation of a person or institution" });
  }

  // --- IP (third-party franchises; allowlist applies here and only here) ---
  for (const term of findTerms(hay, IP_TERMS)) {
    if (allowlist.includes(term)) continue;
    reasons.push({
      code: "POLICY_IP",
      term,
      detail: "third-party intellectual property or franchise character",
    });
  }

  return { allowed: reasons.length === 0, reasons };
}

export const PolicyGate = {
  screenBrief(contract: OccasionContract, options: PolicyOptions = {}): PolicyVerdict {
    return screenText(briefText(contract), options);
  },
  screenText,
  /** Polite, non-preachy refusal copy for the MCP/API surface. */
  message(verdict: PolicyVerdict): string {
    if (verdict.allowed) return "";
    const codes = [...new Set(verdict.reasons.map((r) => r.code))];
    if (codes.includes("POLICY_SAFETY")) {
      return "Occestra can't take this brief — it falls outside what we're able to make. Try describing the moment itself, and we'll take it from there.";
    }
    if (codes.includes("POLICY_PERSON")) {
      return "Occestra can't depict or impersonate real public figures. Describe the feeling or the scene instead, and we'll design something original.";
    }
    return "Occestra only makes original work, so we can't use third-party characters or franchises. Tell us the vibe and we'll create something that's yours.";
  },
} as const;
