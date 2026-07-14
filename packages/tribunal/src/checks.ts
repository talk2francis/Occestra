/**
 * Deterministic checks. These run first, on every artifact, every time. They are cheap,
 * they cannot hallucinate, and a hard failure cannot be argued away by a flattering
 * critique score. Everything that CAN be settled by arithmetic is settled here.
 */
import sharp from "sharp";
import {
  ArtifactSchema,
  BudgetPayloadSchema,
  PlanPayloadSchema,
  PolicyGate,
  SchedulePayloadSchema,
  type Artifact,
  type HouseStyle,
  type OccasionContract,
} from "@occestra/studio-core";
import { THRESHOLDS, type CheckId } from "./rubric.js";

export interface CheckResult {
  id: CheckId;
  hard: boolean;
  passed: boolean;
  /** Skipped checks pass, but say so — and the caller records a coverage gap. */
  skipped?: boolean;
  detail: string;
  evidence: string[];
}

/** Resolves an image artifact to its actual bytes. Injected — this package does no I/O. */
export type ImageLoader = (artifact: Artifact) => Promise<Uint8Array | undefined>;

/** Returns true if a URL resolves. Injected — network lives in @occestra/providers. */
export type LinkChecker = (url: string) => Promise<boolean>;

export interface CheckDeps {
  imageBytes?: ImageLoader;
  linkChecker?: LinkChecker;
  /** Owner's own brands, exempt from POLICY_IP only. */
  policyAllowlist?: readonly string[];
}

export interface CheckContext {
  artifact: Artifact;
  contract: OccasionContract;
  style?: HouseStyle;
  deps?: CheckDeps;
}

const pass = (id: CheckId, hard: boolean, detail: string): CheckResult => ({
  id,
  hard,
  passed: true,
  detail,
  evidence: [],
});

const fail = (id: CheckId, hard: boolean, detail: string, evidence: string[] = []): CheckResult => ({
  id,
  hard,
  passed: false,
  detail,
  evidence,
});

const skip = (id: CheckId, hard: boolean, detail: string): CheckResult => ({
  id,
  hard,
  passed: true,
  skipped: true,
  detail,
  evidence: [],
});

const IMAGE_KINDS = new Set([
  "keepsake_art",
  "moodboard",
  "og_image",
  "invitation",
  "carousel",
  "brand_mark",
]);

function isImage(artifact: Artifact): boolean {
  return artifact.format === "png" || (artifact.format === "svg" && IMAGE_KINDS.has(artifact.kind));
}

function parseJson(artifact: Artifact): unknown {
  if (artifact.data === undefined) return undefined;
  try {
    return JSON.parse(artifact.data) as unknown;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------- colour */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

/** WCAG 2.1 relative luminance. */
function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(hexToRgb(fg));
  const b = luminance(hexToRgb(bg));
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light! + 0.05) / (dark! + 0.05);
}

/** sRGB -> CIE L*a*b* (D65). Perceptual distance beats naive RGB euclidean here. */
function rgbToLab({ r, g, b }: Rgb): [number, number, number] {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 distance. Good enough, and stable — an exact number the rubric can publish. */
function labDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/* ------------------------------------------------------------------- checks */

export async function checkSchemaInvalid(ctx: CheckContext): Promise<CheckResult> {
  const id: CheckId = "SCHEMA_INVALID";
  const shape = ArtifactSchema.safeParse(ctx.artifact);
  if (!shape.success) {
    return fail(id, true, "Artifact does not satisfy the Artifact schema.", [
      shape.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    ]);
  }

  const payloadSchema = {
    plan: PlanPayloadSchema,
    schedule: SchedulePayloadSchema,
    budget: BudgetPayloadSchema,
  }[ctx.artifact.kind as "plan" | "schedule" | "budget"];

  if (payloadSchema && ctx.artifact.format === "json") {
    const body = parseJson(ctx.artifact);
    if (body === undefined) {
      return fail(id, true, `${ctx.artifact.kind} artifact does not contain parseable JSON.`);
    }
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return fail(id, true, `${ctx.artifact.kind} payload does not satisfy its schema.`, [
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      ]);
    }
  }

  return pass(id, true, "Artifact and payload satisfy their schemas.");
}

export async function checkPolicyViolation(ctx: CheckContext): Promise<CheckResult> {
  const id: CheckId = "POLICY_VIOLATION";
  const text = [ctx.artifact.title, ctx.artifact.data ?? ""].join("\n");
  const options = ctx.deps?.policyAllowlist ? { allowlist: ctx.deps.policyAllowlist } : {};
  const verdict = PolicyGate.screenText(text, options);
  if (!verdict.allowed) {
    return fail(
      id,
      true,
      "Final copy tripped the PolicyGate.",
      verdict.reasons.map((r) => `${r.code}: ${r.term} — ${r.detail}`),
    );
  }
  return pass(id, true, "Final copy is clean.");
}

export async function checkDateInvalid(ctx: CheckContext): Promise<CheckResult> {
  const id: CheckId = "DATE_INVALID";
  if (ctx.artifact.kind !== "plan") return pass(id, true, "Not a plan; no date to check.");

  const body = PlanPayloadSchema.safeParse(parseJson(ctx.artifact));
  if (!body.success) return pass(id, true, "Plan payload unreadable; SCHEMA_INVALID owns this.");

  const day = body.data.date.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    return fail(id, true, `Plan date "${body.data.date}" is not a real calendar date.`);
  }

  if (ctx.contract.studio === "celebrate" && day !== ctx.contract.date.slice(0, 10)) {
    return fail(
      id,
      true,
      "Plan date contradicts the occasion date the client asked for.",
      [`plan: ${day}`, `contract: ${ctx.contract.date.slice(0, 10)}`],
    );
  }

  return pass(id, true, "Plan date is real and matches the brief.");
}

export async function checkScheduleOverlap(ctx: CheckContext): Promise<CheckResult> {
  const id: CheckId = "SCHEDULE_OVERLAP";
  if (ctx.artifact.kind !== "schedule") return pass(id, true, "Not a schedule.");

  const body = SchedulePayloadSchema.safeParse(parseJson(ctx.artifact));
  if (!body.success) return pass(id, true, "Schedule payload unreadable; SCHEMA_INVALID owns this.");

  const items = [...body.data.items]
    .map((item) => ({ ...item, startMs: Date.parse(item.start), endMs: Date.parse(item.end) }))
    .sort((a, b) => a.startMs - b.startMs);

  const evidence: string[] = [];

  for (const item of items) {
    if (item.endMs <= item.startMs) {
      evidence.push(`"${item.title}" ends at or before it starts`);
    }
  }

  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]!;
    const curr = items[i]!;

    if (curr.startMs < prev.endMs) {
      evidence.push(`"${prev.title}" overlaps "${curr.title}"`);
      continue;
    }

    const gapMinutes = (curr.startMs - prev.endMs) / 60_000;
    const movingVenue =
      prev.venue !== undefined &&
      curr.venue !== undefined &&
      prev.venue.name !== curr.venue.name;

    if (movingVenue && gapMinutes < THRESHOLDS.minTravelGapMinutes) {
      evidence.push(
        `only ${gapMinutes.toFixed(0)} min to get from "${prev.venue!.name}" to "${curr.venue!.name}" — not physically honest`,
      );
    }
  }

  return evidence.length > 0
    ? fail(id, true, "The schedule is not physically possible as written.", evidence)
    : pass(id, true, "No overlaps and every venue change is achievable.");
}

export async function checkBudgetSum(ctx: CheckContext): Promise<CheckResult> {
  const id: CheckId = "BUDGET_SUM_MISMATCH";
  if (ctx.artifact.kind !== "budget") return pass(id, true, "Not a budget.");

  const body = BudgetPayloadSchema.safeParse(parseJson(ctx.artifact));
  if (!body.success) return pass(id, true, "Budget payload unreadable; SCHEMA_INVALID owns this.");

  const sum = body.data.lineItems.reduce((acc, item) => acc + item.amount, 0);
  const delta = Math.abs(sum - body.data.total);

  if (delta > THRESHOLDS.budgetToleranceUsd) {
    return fail(id, true, "Line items do not sum to the stated total.", [
      `line items: ${sum.toFixed(2)}`,
      `stated total: ${body.data.total.toFixed(2)}`,
      `difference: ${delta.toFixed(2)}`,
    ]);
  }

  return pass(id, true, `Line items sum to the stated total (${body.data.total.toFixed(2)}).`);
}

export async function checkSourceMissing(ctx: CheckContext): Promise<CheckResult> {
  const id: CheckId = "SOURCE_MISSING";

  /**
   * A SCHEDULE THAT NAMES A VENUE IS MAKING A CLAIM ABOUT THE REAL WORLD.
   *
   * This check only looked at plans. So a schedule could name "Aqui há Peixe" at
   * 38.7119452, -9.1417003 with no receipt at all, and the only thing standing between that
   * and a buyer was the LLM critic's *feeling* about grounding — which oscillated 62 to 72
   * across the pass line on identical input, flipping the artifact between PASS and FAIL.
   *
   * "Does this venue carry a source?" is not a matter of taste. It is a yes/no question, and
   * every judgment moved out of the critic and into arithmetic is a judgment that stops
   * varying forever.
   */
  if (ctx.artifact.kind === "schedule") {
    const body = SchedulePayloadSchema.safeParse(parseJson(ctx.artifact));
    if (!body.success) return pass(id, true, "Schedule payload unreadable; SCHEMA_INVALID owns this.");

    const named = body.data.items.filter((item) => item.venue?.name);
    if (named.length === 0) {
      return pass(id, true, "The schedule names no venue, so it claims nothing about the world.");
    }

    if (ctx.artifact.sources.length === 0) {
      return fail(
        id,
        true,
        "The schedule names real venues but carries no source. A place with coordinates and no receipt is an assertion, not a finding.",
        named.map((item) => item.venue!.name).slice(0, 5),
      );
    }

    return pass(id, true, "Every venue the schedule names is backed by a retrieved source.");
  }

  if (ctx.artifact.kind !== "plan") return pass(id, true, "Not a plan; no grounded claims.");

  const body = PlanPayloadSchema.safeParse(parseJson(ctx.artifact));
  if (!body.success) return pass(id, true, "Plan payload unreadable; SCHEMA_INVALID owns this.");

  const unsourced = body.data.claims.filter((claim) => claim.grounded && claim.source === undefined);
  if (unsourced.length > 0) {
    return fail(
      id,
      true,
      "A claim about the real world ships without a source and a retrieval time.",
      unsourced.map((claim) => claim.text),
    );
  }

  return pass(id, true, "Every grounded claim carries its source and retrieval time.");
}

export async function checkImage(ctx: CheckContext): Promise<CheckResult[]> {
  const dim: CheckId = "DIM_ASPECT_MISMATCH";
  const size: CheckId = "FILE_TOO_LARGE";
  const drift: CheckId = "PALETTE_DRIFT";

  if (!isImage(ctx.artifact)) {
    return [
      pass(dim, true, "Not an image."),
      pass(size, false, "Not an image."),
      pass(drift, false, "Not an image."),
    ];
  }

  const bytes = await ctx.deps?.imageBytes?.(ctx.artifact);
  if (!bytes) {
    return [
      skip(dim, true, "Image bytes unavailable — cannot verify dimensions."),
      skip(size, false, "Image bytes unavailable — cannot verify file size."),
      skip(drift, false, "Image bytes unavailable — cannot verify palette."),
    ];
  }

  const buffer = Buffer.from(bytes);
  const image = sharp(buffer);
  const meta = await image.metadata();

  // --- dimensions vs what was asked for ---
  let dimResult: CheckResult;
  const requested = ctx.artifact.spec?.size;
  if (!requested) {
    dimResult = skip(dim, true, "Artifact declares no target size; nothing to compare against.");
  } else {
    const [wantW, wantH] = requested.split("x").map(Number) as [number, number];
    const gotW = meta.width ?? 0;
    const gotH = meta.height ?? 0;
    dimResult =
      gotW === wantW && gotH === wantH
        ? pass(dim, true, `Rendered at the requested ${requested}.`)
        : fail(dim, true, "Rendered dimensions do not match the requested size.", [
            `requested: ${requested}`,
            `rendered: ${gotW}x${gotH}`,
          ]);
  }

  // --- file weight ---
  const sizeResult =
    buffer.byteLength > THRESHOLDS.maxPngBytes
      ? fail(size, false, "Image is heavier than 4 MB and will be painful to share.", [
          `${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`,
        ])
      : pass(size, false, `${(buffer.byteLength / 1024).toFixed(0)} KB — comfortable to share.`);

  // --- palette drift against the House Style ---
  let driftResult: CheckResult;
  const palette = ctx.style?.palette;
  if (!palette || palette.length === 0) {
    driftResult = skip(drift, false, "No House Style palette supplied; nothing to drift from.");
  } else {
    const paletteLab = palette.map((hex) => rgbToLab(hexToRgb(hex)));
    const { data } = await sharp(buffer)
      .resize(16, 16, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let total = 0;
    let samples = 0;
    for (let i = 0; i + 2 < data.length; i += 3) {
      const lab = rgbToLab({ r: data[i]!, g: data[i + 1]!, b: data[i + 2]! });
      const nearest = Math.min(...paletteLab.map((p) => labDistance(lab, p)));
      total += nearest;
      samples += 1;
    }
    const mean = samples > 0 ? total / samples : 0;

    driftResult =
      mean > THRESHOLDS.maxPaletteDistance
        ? fail(drift, false, `Dominant colours have drifted off the ${ctx.style?.id} palette.`, [
            `mean distance ${mean.toFixed(1)} (limit ${THRESHOLDS.maxPaletteDistance})`,
          ])
        : pass(drift, false, `Colours sit on the ${ctx.style?.id} palette (mean distance ${mean.toFixed(1)}).`);
  }

  return [dimResult, sizeResult, driftResult];
}

/**
 * The published rubric scopes CONTRAST_LOW to "invites/cards" — things with a surface that
 * a human reads type off. A JSON budget has no surface. Running the check against one and
 * recording a "not checkable" coverage gap is the code disagreeing with the rubric it
 * publishes, and it fills honest packs with noise that means nothing.
 */
const SURFACE_KINDS = new Set([
  "invitation",
  "guest_guide",
  "carousel",
  "og_image",
  "story_page",
  "keepsake_art",
  "moodboard",
  "brand_mark",
]);

/** Formats that actually carry type a human reads off a surface. */
const TEXT_SURFACE_FORMATS = new Set(["html", "svg"]);

export async function checkContrast(ctx: CheckContext): Promise<CheckResult> {
  const id: CheckId = "CONTRAST_LOW";

  const layers = ctx.artifact.spec?.layers;

  // Declared layers are always checkable, whatever the artifact is.
  if (layers && layers.length > 0) {
    // fall through to the real check below
  } else if (!SURFACE_KINDS.has(ctx.artifact.kind)) {
    return pass(id, false, `A ${ctx.artifact.kind} has no text surface; contrast does not apply.`);
  } else if (!TEXT_SURFACE_FORMATS.has(ctx.artifact.format)) {
    // A generated PNG carries no type at all — Occestra forbids lettering in its imagery,
    // precisely because generated text is unreliable. There is nothing to measure, and
    // calling that a coverage gap fills honest packs with noise that means nothing.
    return pass(
      id,
      false,
      `A generated ${ctx.artifact.format} carries no lettering (Occestra never renders type into imagery), so there is no contrast to measure.`,
    );
  } else {
    return skip(id, false, "Artifact declares no text layers; contrast is not checkable.");
  }

  const evidence = layers
    .filter((layer) => layer.body)
    .map((layer) => ({ layer, ratio: contrastRatio(layer.fg, layer.bg) }))
    .filter(({ ratio }) => ratio < THRESHOLDS.minContrastRatio)
    .map(
      ({ layer, ratio }) =>
        `${layer.role}: ${layer.fg} on ${layer.bg} is ${ratio.toFixed(2)}:1 (needs ${THRESHOLDS.minContrastRatio}:1)`,
    );

  return evidence.length > 0
    ? fail(id, false, "Body text does not clear the 4.5:1 legibility floor.", evidence)
    : pass(id, false, "All body text clears 4.5:1.");
}

export async function checkTextOverflow(ctx: CheckContext): Promise<CheckResult> {
  const id: CheckId = "TEXT_OVERFLOW_RISK";
  const budgets = THRESHOLDS.textBudgets as Record<string, number | undefined>;
  const budget = budgets[ctx.artifact.kind];
  if (budget === undefined) return pass(id, false, "No copy budget applies to this kind.");

  const length = (ctx.artifact.data ?? "").length;
  return length > budget
    ? fail(id, false, "Copy is long enough to overflow its layout slot.", [
        `${length} characters (budget ${budget} for ${ctx.artifact.kind})`,
      ])
    : pass(id, false, `${length}/${budget} characters — fits.`);
}

export async function checkLinks(ctx: CheckContext): Promise<CheckResult> {
  const id: CheckId = "LINK_DEAD";
  const links = ctx.artifact.spec?.links ?? [];
  if (links.length === 0) return pass(id, false, "No links asserted.");

  const checker = ctx.deps?.linkChecker;
  if (!checker) {
    return skip(id, false, "No link checker supplied — links were not verified.");
  }

  const dead: string[] = [];
  for (const url of links) {
    try {
      if (!(await checker(url))) dead.push(url);
    } catch (error) {
      dead.push(`${url} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  return dead.length > 0
    ? fail(id, false, "A link this artifact asserts is live does not resolve.", dead)
    : pass(id, false, `All ${links.length} link(s) resolve.`);
}

/** Severity-first ordering: hard failures, then soft failures, then skips, then passes. */
export function sortFindings(results: CheckResult[]): CheckResult[] {
  const rank = (r: CheckResult): number => {
    if (!r.passed && r.hard) return 0;
    if (!r.passed) return 1;
    if (r.skipped) return 2;
    return 3;
  };
  return [...results].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}

/**
 * A placeholder that survived into finished copy.
 *
 * Two real failures put this here. The model invented "Starting at $49 per event" for a
 * product whose tools cost cents, and the fabrication filter swapped the number for
 * [YOUR PRICE HERE] — so the *pack* then shipped carrying a bracket. And once, told to
 * write that placeholder where a price belongs, the model dropped it into a call to
 * action: "Visit us at [YOUR PRICE HERE]".
 *
 * Both are the same defect: unfinished text, delivered. It reads as deliberate, which is
 * why it is worse than simply saying less. HARD — no critic score can argue it away.
 */
const PLACEHOLDER_PATTERNS: ReadonlyArray<{ re: RegExp; what: string }> = [
  // A bracket is only a placeholder if it CONTAINS a placeholder word.
  //
  // The first version of this rule fired on any bracketed capitals — and hard-failed a
  // real, good plan on its first live run, because the JSON it was scanning contained
  // `[{"text":"Aqui há Peixe — 18A Rua da Trindade..."`. Brackets are syntax in JSON and
  // links in markdown; "shouting" is not evidence of anything.
  {
    re: /\[[^\]\n]{0,60}?(?:your|insert|add|todo|tbd|tbc|placeholder|name here|price here|xxx)[^\]\n]{0,60}?\]/gi,
    what: "a bracketed placeholder",
  },
  // YOUR ___ HERE, without brackets
  { re: /\byour\s+\w+(?:\s+\w+)?\s+here\b/gi, what: "a 'your … here' placeholder" },
  { re: /\b(?:TBD|TBC|TODO|FIXME|XXX+)\b/g, what: "an editing marker" },
  { re: /\blorem\s+ipsum\b/i, what: "lorem ipsum" },
  { re: /\b(?:coming soon|placeholder text)\b/i, what: "filler standing in for real copy" },
];

/** Every string a human will actually read — JSON *values*, never JSON *syntax*. */
function readableText(artifact: CheckContext["artifact"]): string | undefined {
  const data = artifact.data;
  if (data === undefined || data.length === 0) return undefined;
  if (artifact.format !== "json") return data;

  // Scan what the plan SAYS, not the braces and brackets it is made of.
  const strings: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };

  try {
    walk(JSON.parse(data));
  } catch {
    return data; // unparseable: SCHEMA_INVALID owns that, and we still scan the raw text
  }
  return strings.join("\n");
}

export async function checkPlaceholderText(ctx: CheckContext): Promise<CheckResult> {
  const id: CheckId = "PLACEHOLDER_TEXT";
  const hard = true;

  const text = readableText(ctx.artifact);
  if (text === undefined || text.length === 0) {
    return skip(id, hard, "Not a copy artifact; there is no text to check.");
  }

  const found: string[] = [];
  for (const { re, what } of PLACEHOLDER_PATTERNS) {
    for (const match of text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))) {
      found.push(`${what}: “${match[0].trim().slice(0, 60)}”`);
    }
  }

  if (found.length === 0) {
    return pass(id, hard, "No placeholder text survives in the finished copy.");
  }

  return fail(
    id,
    hard,
    `Finished copy still contains ${found.length} placeholder(s). Remove them — if the fact is unknown, drop the claim rather than standing something in for it.`,
    [...new Set(found)].slice(0, 5),
  );
}

/** Run every deterministic check that applies to this artifact. */
export async function runChecks(ctx: CheckContext): Promise<CheckResult[]> {
  const [schema, policy, date, schedule, budget, source, contrast, overflow, links, images, placeholder] =
    await Promise.all([
      checkSchemaInvalid(ctx),
      checkPolicyViolation(ctx),
      checkDateInvalid(ctx),
      checkScheduleOverlap(ctx),
      checkBudgetSum(ctx),
      checkSourceMissing(ctx),
      checkContrast(ctx),
      checkTextOverflow(ctx),
      checkLinks(ctx),
      checkImage(ctx),
      checkPlaceholderText(ctx),
    ]);

  return sortFindings([
    schema,
    policy,
    date,
    schedule,
    budget,
    source,
    contrast,
    overflow,
    links,
    placeholder,
    ...images,
  ]);
}
