/**
 * Occestra domain model. Zod-first: every schema is the single source of truth and the
 * TypeScript type is inferred from it. Pure — nothing here touches the network or disk.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ studios */

export const StudioKindSchema = z.enum(["celebrate", "remember", "launch"]);
export type StudioKind = z.infer<typeof StudioKindSchema>;

/** On-chain pack kind codes. Must match KeepsakeRegistry leaf encoding. */
export const PackKindCode = {
  celebrate: 0,
  remember: 1,
  launch: 2,
  tool: 3,
} as const satisfies Record<StudioKind | "tool", number>;
export type PackKind = keyof typeof PackKindCode;
export type PackKindCodeValue = (typeof PackKindCode)[PackKind];

/* -------------------------------------------------------------- house styles */

export const HouseStyleIdSchema = z.enum([
  "amethyst_editorial",
  "gilded_noir",
  "sunprint",
  "atlas_ink",
]);
export type HouseStyleId = z.infer<typeof HouseStyleIdSchema>;

/** A House Style is a versioned prompt system. Concrete definitions live in @occestra/providers. */
export const HouseStyleSchema = z.object({
  id: HouseStyleIdSchema,
  name: z.string().min(1),
  version: z.string().min(1),
  promptSystem: z.string().min(1),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2),
  typeDirection: z.string().min(1),
  negativePrompt: z.string(),
  seedStrategy: z.enum(["fixed", "contract_hash", "random"]),
  /**
   * What this style is FOR, and what it is wrong for.
   *
   * It lives on the style rather than in the tool that lists them, because it is part of the
   * style's definition and is versioned with it. A buyer choosing blind pays for a render they
   * did not want — and a wrong style is not a refund, it is just a bad invitation.
   */
  bestFor: z.string().min(1),
  wrongFor: z.string().min(1),
  /**
   * Where this style may be applied.
   *
   * A House Style is not universally appropriate. atlas_ink is map-and-ledger — right for an
   * itinerary, wrong for a software launch, where its motifs would try to BECOME the subject
   * (this is exactly how a brand mark once came back as a map). `studios` gates a style to the
   * work it suits; the launch pipeline substitutes a launch-appropriate style rather than let
   * atlas_ink render a compass where a wordmark was asked for.
   */
  appliesTo: z.object({
    studios: z.array(StudioKindSchema).min(1),
  }),
});
export type HouseStyle = z.infer<typeof HouseStyleSchema>;

/** Is this style appropriate for this studio's work? */
export function styleAppliesToStudio(style: HouseStyle, studio: StudioKind): boolean {
  return style.appliesTo.studios.includes(studio);
}

/**
 * The image prompt, SUBJECT-FIRST.
 *
 * The subject leads and the House Style follows as a TREATMENT of it — not the other way round.
 * When the style led, its recurring motifs (maps, ledgers, botanicals) drifted into becoming the
 * subject: a software brand mark rendered as a map, and it passed, because nothing said the
 * subject was load-bearing and the style was not. Leading with the subject, and naming the style
 * explicitly as a treatment that must not replace it, is prevention at generation.
 */
export function composeImagePrompt(subject: string, style: HouseStyle): string {
  return [
    "SUBJECT — render THIS, and only this. It is the subject of the image, not a suggestion:",
    subject,
    "",
    "TREATMENT — depict the subject above in the following House Style. The style is a TREATMENT of the subject, never a replacement for it. Do NOT let the style's recurring motifs (maps, ledgers, compasses, botanical plates, and the like) become the subject when they are not what was asked for.",
    `HOUSE STYLE: ${style.name} (v${style.version})`,
    style.promptSystem,
    `PALETTE (stay inside it): ${style.palette.join(", ")}`,
    `TYPOGRAPHY: ${style.typeDirection}`,
    `NEVER: ${style.negativePrompt}`,
  ].join("\n");
}

/* ------------------------------------------------------------------ sources */

/** Every grounded fact carries where it came from and when. Never optional in practice. */
export const SourceTagSchema = z.object({
  source: z.string().min(1),
  retrievedAt: z.string().datetime(),
  url: z.string().url().optional(),
});
export type SourceTag = z.infer<typeof SourceTagSchema>;

/* ---------------------------------------------------------------- artifacts */

export const ArtifactKindSchema = z.enum([
  "plan",
  "schedule",
  "budget",
  "contingency",
  "invitation",
  "guest_guide",
  "toast",
  "moodboard",
  "keepsake_art",
  "story_page",
  "carousel",
  "brand_kit",
  "brand_mark",
  "launch_thread",
  "landing_spec",
  "demo_script",
  "og_image",
  "critique_report",
]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

/** Which artifact kinds each studio is allowed to deliver. */
export const CELEBRATE_KINDS = [
  "plan",
  "schedule",
  "budget",
  "contingency",
  "invitation",
  "guest_guide",
  "toast",
  "moodboard",
] as const;
export const REMEMBER_KINDS = ["keepsake_art", "story_page", "carousel", "moodboard"] as const;
export const LAUNCH_KINDS = [
  "brand_kit",
  "brand_mark",
  "launch_thread",
  "landing_spec",
  "demo_script",
  "og_image",
  "moodboard",
  "carousel",
] as const;

export const CelebrateKindSchema = z.enum(CELEBRATE_KINDS);
export type CelebrateKind = z.infer<typeof CelebrateKindSchema>;
export const RememberKindSchema = z.enum(REMEMBER_KINDS);
export const LaunchKindSchema = z.enum(LAUNCH_KINDS);
export type LaunchKind = z.infer<typeof LaunchKindSchema>;

export const ArtifactFormatSchema = z.enum(["json", "md", "png", "svg", "html"]);
export type ArtifactFormat = z.infer<typeof ArtifactFormatSchema>;

/**
 * What the artifact was ASKED to be — the Tribunal grades the rendered artifact against
 * this, so it must be recorded at generation time, not inferred afterwards.
 */
export const ArtifactSpecSchema = z.object({
  /** "WxH" in pixels, for image artifacts. */
  size: z.string().regex(/^\d{2,5}x\d{2,5}$/).optional(),
  /** Declared text-on-background pairs, so contrast is checkable without OCR. */
  layers: z
    .array(
      z.object({
        role: z.string().min(1),
        fg: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        bg: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        /** Body copy is held to 4.5:1; large display type is exempt. */
        body: z.boolean().default(true),
      }),
    )
    .optional(),
  /** Links the artifact asserts are live (launch kits). */
  links: z.array(z.string().url()).optional(),
});
export type ArtifactSpec = z.infer<typeof ArtifactSpecSchema>;

/**
 * Why an artifact isn't here.
 *
 * `code` is a stable, public identifier (e.g. "image_provider:quota"); `reason` is
 * one plain sentence a buyer can read. The raw provider error never appears in
 * either — it goes to the server log. See sanitizeGap().
 */
export const UndeliveredSchema = z.object({
  code: z.string().min(1),
  reason: z.string().min(1),
});
export type Undelivered = z.infer<typeof UndeliveredSchema>;

export const ArtifactSchema = z.object({
  id: z.string().min(1),
  kind: ArtifactKindSchema,
  title: z.string().min(1),
  format: ArtifactFormatSchema,
  spec: ArtifactSpecSchema.optional(),
  /** Inline payload for text formats. Binary artifacts use `uri` instead. */
  data: z.string().optional(),
  /** Storage key (never a provider URL — see AGENTS.md gotcha 8). */
  uri: z.string().min(1).optional(),
  styleId: HouseStyleIdSchema.optional(),
  sources: z.array(SourceTagSchema).default([]),
  /** TribunalReport — typed in @occestra/tribunal, opaque here to keep this package pure. */
  tribunal: z.unknown().optional(),
  /**
   * Set when the artifact could not be produced (provider quota, unwritable bytes).
   *
   * It stays IN the pack — vanishing would shrink the pass-rate denominator and let
   * the pack report a score it never earned. It is never graded, never counted in
   * passRate, and renders as an honest "not delivered" card.
   */
  undelivered: UndeliveredSchema.optional(),
  version: z.literal(1),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

/* --------------------------------------------------- artifact JSON payloads */

/**
 * The JSON bodies the Tribunal can check arithmetically. A claim is "grounded" when it
 * asserts something about the real world (a venue, an opening time, the weather) — those
 * MUST carry a source, or SOURCE_MISSING fires. Interpretive prose is not a grounded claim.
 */
export const PlanClaimSchema = z.object({
  text: z.string().min(1),
  grounded: z.boolean().default(false),
  source: SourceTagSchema.optional(),
});
export type PlanClaim = z.infer<typeof PlanClaimSchema>;

export const PlanPayloadSchema = z.object({
  date: z.string().min(4),
  summary: z.string().min(1),
  claims: z.array(PlanClaimSchema).default([]),
  /** Explicitly stated unknowns. Honesty about coverage is part of the product. */
  uncertainties: z.array(z.string()).default([]),
  /** What the host has to actually do, and by when. */
  prepChecklist: z.array(z.string()).default([]),
});
export type PlanPayload = z.infer<typeof PlanPayloadSchema>;

export const ScheduleItemSchema = z.object({
  title: z.string().min(1),
  start: z.string().datetime(),
  end: z.string().datetime(),
  /** What a guest reads on a clock in that city — e.g. "19:00". The ISO fields are instants. */
  startLocal: z.string().optional(),
  endLocal: z.string().optional(),
  venue: z
    .object({
      name: z.string().min(1),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .optional(),
});
export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;

export const SchedulePayloadSchema = z.object({
  /**
   * The envelope that makes the file READABLE ON ITS OWN.
   *
   * A schedule that is a bare array of items forces whoever opens it to go and find the
   * brief before they can tell which event it even describes. And `timezone` is not a
   * nicety: times used to ship as UTC for an event on the other side of an offset, which
   * would have sent every guest to dinner an hour early.
   */
  occasion: z.string().optional(),
  date: z.string().optional(),
  city: z.string().optional(),
  headcount: z.number().int().positive().optional(),
  timezone: z.string().optional(),
  notes: z.array(z.string()).default([]),
  items: z.array(ScheduleItemSchema).min(1),
});
export type SchedulePayload = z.infer<typeof SchedulePayloadSchema>;

export const BudgetPayloadSchema = z.object({
  currency: z.string().default("USD"),
  total: z.number().nonnegative(),
  lineItems: z
    .array(z.object({ label: z.string().min(1), amount: z.number() }))
    .min(1),
  /** total / headcount. A budget you cannot read per person is a budget you cannot check. */
  perHead: z.number().nonnegative().optional(),
  /**
   * What the reader has to know to USE the number: which currency it is in, why, and what
   * it does not cover. A budget for a Lisbon dinner denominated in USD is not wrong — the
   * buyer asked for USD — but shipping it without saying so is.
   */
  notes: z.array(z.string()).default([]),
});
export type BudgetPayload = z.infer<typeof BudgetPayloadSchema>;

/* ---------------------------------------------------------- occasion contract */

const ContractBase = {
  id: z.string().min(1),
  styleId: HouseStyleIdSchema,
  createdAt: z.string().datetime(),
  requester: z.enum(["human", "agent"]),
};

/** ISO calendar date, validated as a real date (rejects 2026-02-31). */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, "must be an ISO date (YYYY-MM-DD)")
  .refine((value) => {
    const day = value.slice(0, 10);
    const parsed = new Date(`${day}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
  }, "not a real calendar date");

export const CelebrateContractSchema = z.object({
  ...ContractBase,
  studio: z.literal("celebrate"),
  occasion: z.string().min(2).max(200),
  city: z.string().min(1).max(120),
  country: z.string().min(1).max(120).optional(),
  date: IsoDateSchema,
  headcount: z.number().int().min(1).max(10_000),
  budgetUsd: z.number().nonnegative().max(10_000_000).optional(),
  vibe: z.string().min(2).max(400),
  constraints: z.array(z.string().min(1).max(300)).max(30).default([]),
  deliverables: z.array(CelebrateKindSchema).min(1).max(CELEBRATE_KINDS.length),
  locale: z.string().min(2).max(12).default("en"),
});
export type CelebrateContract = z.infer<typeof CelebrateContractSchema>;

export const RememberContractSchema = z.object({
  ...ContractBase,
  studio: z.literal("remember"),
  title: z.string().min(2).max(200),
  momentDate: IsoDateSchema.optional(),
  notes: z.string().max(8000).optional(),
  /** Opaque upload ids. Never raw media, never a public URL — privacy is structural. */
  mediaRefs: z.array(z.string().min(1).max(200)).max(50).default([]),
  tone: z.string().min(2).max(200),
  deliverables: z.array(RememberKindSchema).min(1).max(REMEMBER_KINDS.length),
  locale: z.string().min(2).max(12).default("en"),
});
export type RememberContract = z.infer<typeof RememberContractSchema>;

export const LaunchContractSchema = z.object({
  ...ContractBase,
  studio: z.literal("launch"),
  productName: z.string().min(1).max(120),
  url: z.string().url().optional(),
  description: z.string().max(4000).optional(),
  audience: z.string().max(400).optional(),
  deliverables: z.array(LaunchKindSchema).min(1).max(LAUNCH_KINDS.length),
  locale: z.string().min(2).max(12).default("en"),
});
export type LaunchContract = z.infer<typeof LaunchContractSchema>;

export const OccasionContractSchema = z.discriminatedUnion("studio", [
  CelebrateContractSchema,
  RememberContractSchema,
  LaunchContractSchema,
]);
export type OccasionContract = z.infer<typeof OccasionContractSchema>;

/* --------------------------------------------------------------------- pack */

export const SealSchema = z.object({
  keepsakeId: z.string().regex(/^oce_[0-9a-z]{22}$/),
  manifestHash: z.string().regex(/^0x[0-9a-f]{64}$/),
  packKind: z.number().int().min(0).max(3),
  createdAt: z.number().int().nonnegative(),
  /** EIP-712 signature over the Keepsake struct. */
  signature: z.string().regex(/^0x[0-9a-f]+$/),
  signer: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  chainId: z.number().int().positive(),
  verifyingContract: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  /** Set once the anchor worker lands the leaf on chain. */
  txHash: z.string().regex(/^0x[0-9a-f]{64}$/).optional(),
  anchoredAt: z.number().int().nonnegative().optional(),
  /**
   * True when `manifestHash` is a SALTED commitment — keccak256(salt || canonicalManifest) —
   * not the bare manifest hash. Private keepsakes are salted so that the on-chain leaf reveals
   * nothing and cannot be linked back to the pack by anyone who does not hold the salt. The salt
   * is stored with the pack and shown only to its owner; verifying the manifest match requires
   * it. An unsalted seal (a public pack) is verifiable by anyone against the pack alone, exactly
   * as before — this field defaults to absent/false and existing seals are unaffected.
   */
  salted: z.boolean().optional(),
});
export type Seal = z.infer<typeof SealSchema>;

export const PackQualitySchema = z.object({
  oqsVersion: z.string().min(1),
  /**
   * Fraction of DELIVERED artifacts whose final TribunalReport passed, 0..1.
   *
   * Undelivered artifacts are excluded from both sides of this fraction — grading
   * something that does not exist is meaningless. They are counted separately in
   * `undeliveredCount` precisely so a high pass rate can never hide a thin pack.
   */
  passRate: z.number().min(0).max(1),
  repairedCount: z.number().int().nonnegative(),
  /** Artifacts the studio owed you and could not produce. Read this next to passRate. */
  undeliveredCount: z.number().int().nonnegative().default(0),
  /**
   * The pack graded as a WHOLE, under the pack profile — computed, not model-judged. A set of
   * individually-passing artifacts is not automatically a good pack: it can be missing a
   * deliverable, or contradict itself on the date. These three axes catch that.
   */
  packGrade: z
    .object({
      completeness: z.number().min(0).max(100),
      cross_artifact_consistency: z.number().min(0).max(100),
      brief_satisfaction: z.number().min(0).max(100),
      pass: z.boolean(),
      notes: z.array(z.string()).default([]),
    })
    .optional(),
});
export type PackQuality = z.infer<typeof PackQualitySchema>;

export const PackSchema = z.object({
  /** keepsakeId */
  id: z.string().regex(/^oce_[0-9a-z]{22}$/),
  contractId: z.string().min(1),
  studio: StudioKindSchema,
  artifacts: z.array(ArtifactSchema),
  /** Honest record of what we could not ground. Never hidden, never silently dropped. */
  coverageGaps: z.array(z.string()).default([]),
  quality: PackQualitySchema,
  seal: SealSchema.optional(),
  createdAt: z.string().datetime(),
});
export type Pack = z.infer<typeof PackSchema>;

/* -------------------------------------------------------------------- ports */

export type StudioRole =
  | "planner"
  | "researcher"
  | "art_director"
  | "writer"
  | "critic"
  | "archivist";

export interface TextCompletionRequest {
  role: StudioRole;
  system: string;
  prompt: string;
  /** Ask the router for strict JSON back. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /**
   * WHAT this call is producing ("the launch thread", "the brand genome").
   *
   * Purely for the live event feed. Without it every model beat surfaced as the same
   * sentence — "drafting with the model router", over and over — which told a watching
   * buyer nothing about what was being made for them.
   */
  producing?: string;
}

export interface TextCompletionResult {
  text: string;
  model: string;
  usdCost: number;
}

export interface TextModelPort {
  complete(request: TextCompletionRequest): Promise<TextCompletionResult>;
}

/**
 * How much to spend on one image.
 *
 * The provider's top tier costs roughly 4x its middle tier, and we were paying it for
 * EVERYTHING — including moodboard tiles the buyer sees at thumbnail size and repair
 * drafts that may be thrown away on the next pass. "high" is reserved for the pieces
 * a person actually keeps: the hero, the keepsake, the invitation.
 */
export type ImageQuality = "low" | "medium" | "high";

export interface ImageGenerationRequest {
  prompt: string;
  negative?: string;
  /** "WxH" in pixels, e.g. "1024x1536". */
  size: string;
  seed?: number;
  /** Omitted = the provider's default, which is its most expensive tier. Always set it. */
  quality?: ImageQuality;
}

export interface ImageGenerationResult {
  pngBase64: string;
  model: string;
  usdCost: number;
}

export interface ImageModelPort {
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

/**
 * Every axis any profile can score.
 *
 * The standard used to grade EVERYTHING on the same five axes, and it produced nonsense at the
 * edges: a map rendered as a software brand mark passed, because "is the content what was
 * commissioned?" was not a question the five axes asked. So the axes are now grouped into
 * PROFILES (visual / written / plan / pack), and an artifact is graded only on the axes that
 * mean something for what it is. This union is the full pool; a profile draws its own subset.
 *
 * The map incident lives here as `subject_fidelity`: an axis that asks, independent of how
 * beautiful the rendering is, whether the artifact depicts the thing the brief asked for.
 */
export type CritiqueAxis =
  // visual — images
  | "composition"
  | "legibility"
  | "style_fidelity"
  | "subject_fidelity"
  | "platform_fit"
  | "defects"
  // written — copy and documents
  | "voice"
  | "specificity"
  | "factual_support"
  | "structure"
  // plan — grounded, structured occasion work
  | "source_coverage"
  | "date_validity"
  | "schedule_feasibility"
  | "budget_consistency"
  | "contingency"
  | "uncertainty_disclosure"
  // pack — the whole delivery, graded once
  | "completeness"
  | "cross_artifact_consistency"
  | "brief_satisfaction";

/** Truth vs. taste. A correctness failure must be quotable; a craft failure is allowed to be a judgement. */
export type AxisClass = "correctness" | "craft";

/**
 * One axis, as the standard defines it. This is plain data on purpose: it crosses the port
 * from the Tribunal (which owns the standard) to the critic (which owns nothing), so the critic
 * can build its schema and its prompt from the profile it is handed WITHOUT importing the
 * standard. Published == shipped survives, because the same specs render `/standard`.
 */
export interface CritiqueAxisSpec {
  id: CritiqueAxis;
  title: string;
  class: AxisClass;
  description: string;
  threshold: number;
  /** Scoring-anchor guidance shown to the critic. Keeps the judge a measuring instrument. */
  guidance?: string;
}

/** The set of axes an artifact is graded on, chosen by what the artifact IS. */
export interface CritiqueProfile {
  id: string;
  title: string;
  axes: readonly CritiqueAxisSpec[];
}

export interface CritiqueRequest {
  artifact: Artifact;
  contract: OccasionContract;
  style?: HouseStyle;
  /** Which axes to score, and how. The engine chooses it from the artifact; the critic obeys. */
  profile: CritiqueProfile;
}

/**
 * The receipt for a failing score.
 *
 * A correctness axis may not fail on a feeling. If the critic scores grounding below the
 * floor, it must be able to QUOTE the thing that is wrong — the unsourced claim, the number
 * that does not add up. A failure with a citable cause is reproducible even when the number
 * attached to it is not, and reproducible causes are what a standard is actually made of.
 */
export interface CritiqueCitation {
  axis: CritiqueAxis;
  /** The exact text or element in the artifact that is wrong. */
  quote: string;
  /** Why that specific thing fails the axis. */
  why: string;
}

export interface CritiqueResult {
  /** Only the profile's axes are present — an artifact carries scores for what it IS, nothing else. */
  axes: Partial<Record<CritiqueAxis, number>>;
  issues: string[];
  /** One per axis scored below its floor. See CritiqueCitation. */
  citations?: CritiqueCitation[];
  /** Concrete, actionable instructions for the regeneration pass. */
  repairBrief: string;
  model: string;
  /** Which profile these scores were produced against, recorded so a report is self-describing. */
  profileId?: string;
}

export interface CritiquePort {
  judge(request: CritiqueRequest): Promise<CritiqueResult>;
}

export interface WeatherForecast {
  summary: string;
  tempC: { min: number; max: number };
  precipitationChance: number;
  source: SourceTag;
}

export interface WeatherPort {
  forecast(lat: number, lng: number, dateISO: string): Promise<WeatherForecast>;
}

export interface PlaceQuery {
  query: string;
  city: string;
  lat?: number;
  lng?: number;
  limit?: number;
}

export interface Place {
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  rating?: number;
  priceLevel?: number;
  url?: string;
  source: SourceTag;
}

export interface PlacesPort {
  search(query: PlaceQuery): Promise<Place[]>;
}

export interface SiteInspection {
  title: string;
  description: string;
  palette: string[];
  fonts: string[];
  /** Storage keys for captured screenshots — never remote URLs. */
  screenshots: string[];
  og?: Record<string, string>;
  source: SourceTag;
}

export interface SitePort {
  inspect(url: string): Promise<SiteInspection>;
}

export interface TokenInfo {
  symbol: string;
  name: string;
  priceUsd?: number;
  chain?: string;
  address?: string;
  source: SourceTag;
}

export interface MarketDataPort {
  tokenInfo(query: string): Promise<TokenInfo>;
}

export interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
}

export interface StoragePort {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<string>;
  get(key: string): Promise<StoredObject | undefined>;
  delete(key: string): Promise<void>;
  /** Time-limited URL. Uploads are private by default. */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
}

export interface ClockPort {
  now(): number;
}

/**
 * Looking at a user's private photograph.
 *
 * The hard rule of this port, and it is not negotiable: it describes WHAT IS THERE. It counts
 * people; it never names them, never guesses their relationships, never infers their age,
 * ethnicity, or mood as fact, and never claims to recognise anyone. A memory is not an
 * identification exercise, and a keepsake studio that quietly does face recognition on family
 * photos is a surveillance product wearing a nice font.
 */
export interface MediaDescription {
  /** Plainly what is in the frame. Objects and setting, not interpretation. */
  summary: string;
  objects: string[];
  setting: string;
  /** How many people are visible. A COUNT. Never an identity, never a name. */
  peopleCount: number;
  timeOfDay?: string;
  /** Anything the model could not make out. Stated, not smoothed over. */
  uncertainties: string[];
  source: SourceTag;
}

export interface VisionPort {
  /** `key` is a private storage key. The bytes never leave our storage except to the model. */
  describe(key: string): Promise<MediaDescription>;
}

/**
 * The Tribunal, as a port.
 *
 * @occestra/tribunal depends on this package, so this package cannot import it back without
 * a cycle — and studio-core must stay pure anyway. So the grader is injected: the pipeline
 * calls grade(), and mcp-server hands it the real runTribunal. Studio-core stays pure, and
 * every artifact still gets graded and repaired.
 */
export interface GradeRequest {
  artifact: Artifact;
  contract: OccasionContract;
  styleId?: HouseStyleId;
  /** Regenerate the artifact from a repair brief. Omit for artifacts that cannot be redone. */
  regenerate?: (repairBrief: string, previous: Artifact) => Promise<Artifact>;
}

export interface GradeResult {
  /** The final artifact, repaired if repairs happened, with its report attached. */
  artifact: Artifact;
  pass: boolean;
  repairs: number;
  coverageGaps: string[];
}

export interface GradePort {
  grade(request: GradeRequest): Promise<GradeResult>;
}

/** Optional cost/rate ceilings; the governor in @occestra/providers enforces them. */
export interface EngineCaps {
  dailyImageCap?: number;
  dailyLlmUsdCap?: number;
  maxRepairs?: number;
}

export interface EngineDeps {
  text: TextModelPort;
  image: ImageModelPort;
  critique: CritiquePort;
  storage: StoragePort;
  clock: ClockPort;
  /** Reads private uploads. Counts people; identifies no one. */
  vision?: VisionPort;
  weather?: WeatherPort;
  places?: PlacesPort;
  site?: SitePort;
  market?: MarketDataPort;
  caps?: EngineCaps;
  /**
   * Where the RAW truth of a failure goes: provider error strings, URLs, stack
   * detail. None of it may reach a pack — buyers get a stable code and one plain
   * sentence. Optional so this package stays pure; mcp-server passes console.error.
   */
  log?: (message: string, detail?: unknown) => void;
}
