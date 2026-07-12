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
});
export type HouseStyle = z.infer<typeof HouseStyleSchema>;

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
  "launch_thread",
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
  "launch_thread",
  "og_image",
  "moodboard",
  "carousel",
] as const;

export const CelebrateKindSchema = z.enum(CELEBRATE_KINDS);
export const RememberKindSchema = z.enum(REMEMBER_KINDS);
export const LaunchKindSchema = z.enum(LAUNCH_KINDS);

export const ArtifactFormatSchema = z.enum(["json", "md", "png", "svg", "html"]);
export type ArtifactFormat = z.infer<typeof ArtifactFormatSchema>;

export const ArtifactSchema = z.object({
  id: z.string().min(1),
  kind: ArtifactKindSchema,
  title: z.string().min(1),
  format: ArtifactFormatSchema,
  /** Inline payload for text formats. Binary artifacts use `uri` instead. */
  data: z.string().optional(),
  /** Storage key (never a provider URL — see AGENTS.md gotcha 8). */
  uri: z.string().min(1).optional(),
  styleId: HouseStyleIdSchema.optional(),
  sources: z.array(SourceTagSchema).default([]),
  /** TribunalReport — typed in @occestra/tribunal, opaque here to keep this package pure. */
  tribunal: z.unknown().optional(),
  version: z.literal(1),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

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
});
export type Seal = z.infer<typeof SealSchema>;

export const PackQualitySchema = z.object({
  oqsVersion: z.string().min(1),
  /** Fraction of artifacts whose final TribunalReport passed, 0..1. */
  passRate: z.number().min(0).max(1),
  repairedCount: z.number().int().nonnegative(),
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
}

export interface TextCompletionResult {
  text: string;
  model: string;
  usdCost: number;
}

export interface TextModelPort {
  complete(request: TextCompletionRequest): Promise<TextCompletionResult>;
}

export interface ImageGenerationRequest {
  prompt: string;
  negative?: string;
  /** "WxH" in pixels, e.g. "1024x1536". */
  size: string;
  seed?: number;
}

export interface ImageGenerationResult {
  pngBase64: string;
  model: string;
  usdCost: number;
}

export interface ImageModelPort {
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

export type CritiqueAxis =
  | "composition"
  | "legibility"
  | "style_fidelity"
  | "grounding"
  | "platform_fit";

export interface CritiqueRequest {
  artifact: Artifact;
  contract: OccasionContract;
  style: HouseStyle;
}

export interface CritiqueResult {
  axes: Record<CritiqueAxis, number>;
  issues: string[];
  /** Concrete, actionable instructions for the regeneration pass. */
  repairBrief: string;
  model: string;
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
  weather?: WeatherPort;
  places?: PlacesPort;
  site?: SitePort;
  market?: MarketDataPort;
  caps?: EngineCaps;
}
