/**
 * The pipelines. This is where Occestra actually makes something.
 *
 * v1 scope: real, grounded, Tribunal-checked work — but scoped honestly. The full Studio
 * pipelines land in Phases 7-9, and every tool description says exactly what it does today
 * rather than what it will do later. Overclaiming in a marketplace listing is the fastest
 * way to earn a one-star review you deserve.
 *
 * The shape of every paid pipeline is the same, and the ORDER matters:
 *   PolicyGate -> generate -> Tribunal (deterministic + critic, repair up to 2x) -> pack
 *   -> seal (if a sealer key exists) -> queue the leaf -> persist.
 */
import sharp from "sharp";
import {
  PolicyGate,
  newKeepsakeId,
  type Artifact,
  type CelebrateContract,
  type EngineDeps,
  type HouseStyleId,
  type LaunchContract,
  type OccasionContract,
  type Pack,
  type PackKind,
  type PlanClaim,
  type RememberContract,
  type SourceTag,
  type CelebrateDeps,
  type CelebrateKind,
  type GradePort,
  type LaunchDeps,
  type LaunchKind,
  runCelebrate,
  runLaunch,
  runRemember,
  type RememberDeps,
  type StoryGraph,
  ensureStored,
  isUndelivered,
} from "@occestra/studio-core";
import { OQS_VERSION, runTribunal, type TribunalReport } from "@occestra/tribunal";
import { HOUSE_STYLES, styleSystemPrompt, type CostGovernor } from "@occestra/providers";
import { Sealer, leafOfSeal } from "@occestra/receipts";
import type { Store } from "./store.js";

export interface PipelineContext {
  deps: EngineDeps;
  store: Store;
  /** The real Tribunal, injected into the pure pipelines. */
  grader?: GradePort;
  sealer?: Sealer;
  governor?: CostGovernor;
  coverageGaps: string[];
  linkChecker?: (url: string) => Promise<boolean>;
}

export class PolicyRefusal extends Error {
  override readonly name = "PolicyRefusal";
  constructor(public readonly politeMessage: string) {
    super(politeMessage);
  }
}

const nowIso = (ctx: PipelineContext): string => new Date(ctx.deps.clock.now()).toISOString();

/** Screen the brief BEFORE a single token is spent. Blocked briefs are never charged for. */
function screen(contract: OccasionContract): void {
  const verdict = PolicyGate.screenBrief(contract);
  if (!verdict.allowed) throw new PolicyRefusal(PolicyGate.message(verdict));
}

/* ------------------------------------------------------------------ helpers */

async function gradeAll(
  ctx: PipelineContext,
  contract: OccasionContract,
  artifacts: Artifact[],
  styleId?: HouseStyleId,
): Promise<{ artifacts: Artifact[]; reports: TribunalReport[]; gaps: string[] }> {
  const style = styleId ? HOUSE_STYLES[styleId] : undefined;
  const graded: Artifact[] = [];
  const reports: TribunalReport[] = [];
  const gaps: string[] = [];

  for (const artifact of artifacts) {
    const outcome = await runTribunal({
      artifact,
      contract,
      ...(style ? { style } : {}),
      deps: {
        critique: ctx.deps.critique,
        imageBytes: async (a) => (a.uri ? (await ctx.deps.storage.get(a.uri))?.bytes : undefined),
        ...(ctx.linkChecker ? { linkChecker: ctx.linkChecker } : {}),
      },
    });

    graded.push(outcome.artifact);
    reports.push(outcome.report);
    gaps.push(...outcome.report.coverageGaps);
  }

  return { artifacts: graded, reports, gaps };
}

async function assemble(
  ctx: PipelineContext,
  contract: OccasionContract,
  kind: PackKind,
  artifacts: Artifact[],
  reports: TribunalReport[],
  extraGaps: string[],
): Promise<Pack> {
  const passed = reports.filter((report) => report.pass).length;
  const repaired = reports.reduce((sum, report) => sum + report.repairs, 0);

  const gaps = [...new Set([...ctx.coverageGaps, ...extraGaps])];

  let pack: Pack = {
    id: newKeepsakeId(ctx.deps.clock.now()),
    contractId: contract.id,
    studio: contract.studio,
    artifacts,
    coverageGaps: gaps,
    quality: {
      oqsVersion: OQS_VERSION,
      passRate: reports.length > 0 ? passed / reports.length : 1,
      repairedCount: repaired,
      undeliveredCount: artifacts.filter(isUndelivered).length,
    },
    createdAt: nowIso(ctx),
  };

  // Seal it if we hold a key. Unsigned packs are still delivered — honestly labelled.
  if (ctx.sealer) {
    pack = await ctx.sealer.seal(pack, kind);
    if (pack.seal) ctx.store.queueSeal(leafOfSeal(pack.seal), pack.id);
  }

  ctx.store.savePack(pack);
  return pack;
}

/** Generate one image through the router and store the bytes. Never inlines a provider URL. */
async function makeImage(
  ctx: PipelineContext,
  args: { subject: string; styleId: HouseStyleId; size: string; key: string },
): Promise<{ uri: string; bytes: Uint8Array }> {
  const style = HOUSE_STYLES[args.styleId];

  const result = await ctx.deps.image.generate({
    prompt: `${styleSystemPrompt(style)}\n\nSUBJECT:\n${args.subject}`,
    negative: style.negativePrompt,
    size: args.size,
  });

  // gotcha #8: base64 in, sharp out.
  const png = await sharp(Buffer.from(result.pngBase64, "base64")).png().toBuffer();
  const bytes = new Uint8Array(png);
  await ctx.deps.storage.put(args.key, bytes, "image/png");
  // A resolved put is not proof. If the bytes can't be read back, this artifact does
  // not exist, and it must never reach a pack wearing a PASS.
  await ensureStored(ctx.deps.storage, args.key);

  return { uri: args.key, bytes };
}

const artifact = (over: Partial<Artifact> & Pick<Artifact, "id" | "kind" | "title" | "format">): Artifact => ({
  sources: [],
  version: 1,
  ...over,
});

/* -------------------------------------------------------- oce_plan_occasion */

export interface PlanOccasionInput {
  occasion: string;
  city: string;
  date: string;
  headcount: number;
  vibe: string;
  budgetUsd?: number | undefined;
  constraints?: string[] | undefined;
  styleId?: HouseStyleId | undefined;
  deliverables?: CelebrateKind[] | undefined;
}

/**
 * The full CELEBRATE studio (Phase 7). The pipeline itself lives in studio-core and is pure;
 * everything that touches the world — models, places, weather, storage, and the Tribunal
 * itself — is injected here.
 */
export async function planOccasion(ctx: PipelineContext, input: PlanOccasionInput): Promise<Pack> {
  const contract: CelebrateContract = {
    id: `c_${ctx.deps.clock.now()}`,
    studio: "celebrate",
    styleId: input.styleId ?? "atlas_ink",
    createdAt: nowIso(ctx),
    requester: "agent",
    occasion: input.occasion,
    city: input.city,
    date: input.date,
    headcount: input.headcount,
    vibe: input.vibe,
    constraints: input.constraints ?? [],
    deliverables: input.deliverables ?? ["plan", "schedule", "budget", "contingency", "guest_guide"],
    locale: "en",
    ...(input.budgetUsd !== undefined ? { budgetUsd: input.budgetUsd } : {}),
  };

  const celebrateDeps: CelebrateDeps = {
    text: ctx.deps.text,
    image: ctx.deps.image,
    storage: ctx.deps.storage,
    clock: ctx.deps.clock,
    styleFor: (id) => HOUSE_STYLES[id],
    ...(ctx.deps.log ? { log: ctx.deps.log } : {}),
    ...(ctx.deps.places ? { places: ctx.deps.places } : {}),
    ...(ctx.deps.weather ? { weather: ctx.deps.weather } : {}),
    ...(ctx.grader ? { grader: ctx.grader } : {}),
  };

  const { pack } = await runCelebrate(contract, celebrateDeps);

  // The pipeline is pure and does not know about sealing or the store — that is this layer's
  // job, and it must behave exactly as it did before (seal, queue the leaf, persist).
  let sealed: Pack = { ...pack, coverageGaps: [...new Set([...ctx.coverageGaps, ...pack.coverageGaps])] };

  if (ctx.sealer) {
    sealed = await ctx.sealer.seal(sealed, "celebrate");
    if (sealed.seal) ctx.store.queueSeal(leafOfSeal(sealed.seal), sealed.id);
  }

  ctx.store.savePack(sealed);
  return sealed;
}

/* -------------------------------------------------------- oce_design_invite */

export interface DesignInviteInput {
  occasion: string;
  date: string;
  city?: string | undefined;
  styleId?: HouseStyleId | undefined;
  detail?: string | undefined;
}

export async function designInvite(ctx: PipelineContext, input: DesignInviteInput): Promise<Pack> {
  const styleId = input.styleId ?? "amethyst_editorial";

  const contract: CelebrateContract = {
    id: `c_${ctx.deps.clock.now()}`,
    studio: "celebrate",
    styleId,
    createdAt: nowIso(ctx),
    requester: "agent",
    occasion: input.occasion,
    city: input.city ?? "unspecified",
    date: input.date,
    headcount: 1,
    vibe: input.detail ?? input.occasion,
    constraints: [],
    deliverables: ["invitation"],
    locale: "en",
  };

  screen(contract);

  const keepsakeId = newKeepsakeId(ctx.deps.clock.now());
  const size = "1024x1536";

  const { uri } = await makeImage(ctx, {
    subject: [
      `An invitation artwork for: ${input.occasion}.`,
      input.detail ? `Detail: ${input.detail}.` : "",
      input.city ? `Setting: ${input.city}.` : "",
      "No text, no lettering, no numerals anywhere in the image — the type is set separately.",
    ]
      .filter(Boolean)
      .join(" "),
    styleId,
    size,
    key: `invites/${keepsakeId}.png`,
  });

  const style = HOUSE_STYLES[styleId];

  const invitation = artifact({
    id: "invitation",
    kind: "invitation",
    title: `${input.occasion} — invitation`,
    format: "png",
    uri,
    styleId,
    spec: {
      size,
      // Declared so CONTRAST_LOW is checkable without OCR: ink on the style's ground.
      layers: [
        { role: "body", fg: style.palette[2] ?? "#17141A", bg: style.palette[0] ?? "#FAF7F2", body: true },
      ],
    },
  });

  /* --- three copy variants: the same invitation in three registers --- */

  const copy = artifact({
    id: "copy",
    kind: "invitation",
    title: "Invitation copy — three variants",
    format: "md",
    data: [
      "### Warm",
      `You're invited to ${input.occasion}.`,
      `${input.date}${input.city ? `, ${input.city}` : ""}. Come hungry, stay late.`,
      "",
      "### Formal",
      `The pleasure of your company is requested at ${input.occasion}.`,
      `${input.date}${input.city ? ` — ${input.city}` : ""}.`,
      "",
      "### Plain",
      `${input.occasion}. ${input.date}${input.city ? `, ${input.city}` : ""}. Please let us know if you can make it.`,
    ].join("\n"),
  });

  const { artifacts, reports, gaps } = await gradeAll(ctx, contract, [invitation, copy], styleId);
  return assemble(ctx, contract, "celebrate", artifacts, reports, gaps);
}

/* ---------------------------------------------------------- oce_write_toast */

export interface WriteToastInput {
  subject: string;
  relationship?: string | undefined;
  tone?: string | undefined;
  details?: string | undefined;
  lengthSeconds?: number | undefined;
}

export async function writeToast(ctx: PipelineContext, input: WriteToastInput): Promise<Pack> {
  const contract: RememberContract = {
    id: `r_${ctx.deps.clock.now()}`,
    studio: "remember",
    styleId: "sunprint",
    createdAt: nowIso(ctx),
    requester: "agent",
    title: `A toast for ${input.subject}`,
    tone: input.tone ?? "warm, specific, unsentimental",
    mediaRefs: [],
    deliverables: ["story_page"],
    locale: "en",
    ...(input.details ? { notes: input.details } : {}),
  };

  screen(contract);

  const seconds = Math.min(Math.max(input.lengthSeconds ?? 60, 20), 180);

  const system = [
    "You write toasts that people actually give out loud, at a table, to someone they know.",
    "",
    "Rules:",
    "- Specific beats grand. One true detail is worth ten adjectives.",
    "- Never invent facts about the person. If you were not told it, do not say it.",
    "- No cliches: no 'without further ado', no 'raise a glass to', no 'little did we know'.",
    "- It must be sayable. Short sentences. Room to breathe. A landing you can hear coming.",
    `- Roughly ${seconds} seconds spoken, which is about ${Math.round(seconds * 2.4)} words.`,
    "",
    "Return three sections in markdown: '## The toast', '## The short version' (one sentence), and '## If you get emotional' (a single line to fall back on).",
  ].join("\n");

  const prompt = [
    `Subject: ${input.subject}`,
    input.relationship ? `Your relationship to them: ${input.relationship}` : "",
    input.tone ? `Tone: ${input.tone}` : "",
    input.details ? `What you know about them (use ONLY this):\n${input.details}` : "You were given no specific details — write something warm that does not pretend to know them, and say plainly in one line that the speaker should add one real memory here.",
  ]
    .filter(Boolean)
    .join("\n");

  const written = await ctx.deps.text.complete({
    role: "writer",
    system,
    prompt,
    maxTokens: 900,
    temperature: 0.8,
  });

  const toast = artifact({
    id: "toast",
    kind: "toast",
    title: `A toast for ${input.subject}`,
    format: "md",
    data: written.text,
  });

  const { artifacts, reports, gaps } = await gradeAll(ctx, contract, [toast]);
  return assemble(ctx, contract, "remember", artifacts, reports, gaps);
}

/* ------------------------------------------------------------ oce_moodboard */

export interface MoodboardInput {
  subject: string;
  styleId?: HouseStyleId | undefined;
  notes?: string | undefined;
}

export async function moodboard(ctx: PipelineContext, input: MoodboardInput): Promise<Pack> {
  const styleId = input.styleId ?? "amethyst_editorial";
  const style = HOUSE_STYLES[styleId];

  const contract: CelebrateContract = {
    id: `c_${ctx.deps.clock.now()}`,
    studio: "celebrate",
    styleId,
    createdAt: nowIso(ctx),
    requester: "agent",
    occasion: input.subject,
    city: "unspecified",
    date: new Date(ctx.deps.clock.now()).toISOString().slice(0, 10),
    headcount: 1,
    vibe: input.notes ?? input.subject,
    constraints: [],
    deliverables: ["moodboard"],
    locale: "en",
  };

  screen(contract);

  const keepsakeId = newKeepsakeId(ctx.deps.clock.now());

  // One image call, composited into a 2x2 board — four tiles for the price of one
  // generation, which is why this tool can be five cents and still be worth making.
  const tile = await makeImage(ctx, {
    subject: [
      `A moodboard sheet for: ${input.subject}.`,
      input.notes ? `Notes: ${input.notes}.` : "",
      "Four distinct vignettes arranged in a 2x2 grid, each a different facet of the mood:",
      "a material or texture close-up, a wider scene, a detail of light, and an object.",
      "No text, no lettering anywhere.",
    ]
      .filter(Boolean)
      .join(" "),
    styleId,
    size: "1024x1024",
    key: `moodboards/${keepsakeId}-tiles.png`,
  });

  /* --- composite: the board, plus a palette strip that is TRUE to the House Style --- */

  const boardWidth = 1024;
  const stripHeight = 96;
  const swatch = Math.floor(boardWidth / style.palette.length);

  const strip = await sharp({
    create: { width: boardWidth, height: stripHeight, channels: 3, background: "#FFFFFF" },
  })
    .composite(
      style.palette.map((hex, index) => ({
        input: {
          create: {
            width: index === style.palette.length - 1 ? boardWidth - swatch * index : swatch,
            height: stripHeight,
            channels: 3,
            background: hex,
          },
        },
        left: swatch * index,
        top: 0,
      })),
    )
    .png()
    .toBuffer();

  const tiles = await ctx.deps.storage.get(tile.uri);
  const board = await sharp({
    create: { width: boardWidth, height: 1024 + stripHeight, channels: 3, background: "#FFFFFF" },
  })
    .composite([
      { input: Buffer.from(tiles!.bytes), left: 0, top: 0 },
      { input: strip, left: 0, top: 1024 },
    ])
    .png()
    .toBuffer();

  const boardKey = `moodboards/${keepsakeId}.png`;
  await ctx.deps.storage.put(boardKey, new Uint8Array(board), "image/png");

  const boardArtifact = artifact({
    id: "moodboard",
    kind: "moodboard",
    title: `${input.subject} — moodboard`,
    format: "png",
    uri: boardKey,
    styleId,
    spec: { size: `${boardWidth}x${1024 + stripHeight}` },
  });

  const direction = artifact({
    id: "direction",
    kind: "moodboard",
    title: "Art direction",
    format: "md",
    data: [
      `## ${style.name} — for "${input.subject}"`,
      "",
      `**Palette.** ${style.palette.join("  ·  ")}`,
      "",
      `**Typography.** ${style.typeDirection}`,
      "",
      "**Direction.**",
      style.promptSystem,
      "",
      `**Avoid.** ${style.negativePrompt}`,
    ].join("\n"),
  });

  const { artifacts, reports, gaps } = await gradeAll(
    ctx,
    contract,
    [boardArtifact, direction],
    styleId,
  );
  return assemble(ctx, contract, "celebrate", artifacts, reports, gaps);
}

/* --------------------------------------------------------- oce_make_keepsake */

export interface MakeKeepsakeInput {
  title: string;
  description?: string | undefined;
  momentDate?: string | undefined;
  tone?: string | undefined;
  styleId?: HouseStyleId | undefined;
  /** Private upload keys from POST /uploads. EXIF-stripped on ingest, never public. */
  mediaRefs?: string[] | undefined;
  /** The owner's corrected Story Graph. When given, it is used AS-IS. */
  confirmGraph?: StoryGraph | undefined;
}

/** The full REMEMBER studio (Phase 9). Privacy is enforced in code, not in a policy page. */
export async function makeKeepsake(ctx: PipelineContext, input: MakeKeepsakeInput): Promise<Pack> {
  const contract: RememberContract = {
    id: `r_${ctx.deps.clock.now()}`,
    studio: "remember",
    styleId: input.styleId ?? "sunprint",
    createdAt: nowIso(ctx),
    requester: "agent",
    title: input.title,
    tone: input.tone ?? "nostalgic, quiet, tender",
    mediaRefs: input.mediaRefs ?? [],
    deliverables: ["keepsake_art", "story_page"],
    locale: "en",
    ...(input.description ? { notes: input.description } : {}),
    ...(input.momentDate ? { momentDate: input.momentDate } : {}),
  };

  const rememberDeps: RememberDeps = {
    text: ctx.deps.text,
    image: ctx.deps.image,
    storage: ctx.deps.storage,
    clock: ctx.deps.clock,
    styleFor: (id) => HOUSE_STYLES[id],
    ...(ctx.deps.log ? { log: ctx.deps.log } : {}),
    ...(ctx.deps.vision ? { vision: ctx.deps.vision } : {}),
    ...(ctx.grader ? { grader: ctx.grader } : {}),
  };

  const { pack } = await runRemember(
    contract,
    rememberDeps,
    input.confirmGraph ? { confirmGraph: input.confirmGraph } : {},
  );

  let sealed: Pack = {
    ...pack,
    coverageGaps: [...new Set([...ctx.coverageGaps, ...pack.coverageGaps])],
  };

  if (ctx.sealer) {
    sealed = await ctx.sealer.seal(sealed, "remember");
    if (sealed.seal) ctx.store.queueSeal(leafOfSeal(sealed.seal), sealed.id);
  }

  ctx.store.savePack(sealed);

  // Remember WHICH private uploads this pack was built from, so "delete my project" can
  // actually destroy them. Without this link the photographs would survive the delete.
  if (contract.mediaRefs.length > 0) {
    ctx.store.linkUploads(sealed.id, contract.mediaRefs);
  }

  return sealed;
}

/* ------------------------------------------------------------ oce_launch_kit */

export interface LaunchKitInput {
  productName: string;
  url?: string | undefined;
  description?: string | undefined;
  audience?: string | undefined;
  styleId?: HouseStyleId | undefined;
  deliverables?: LaunchKind[] | undefined;
}

/** The full LAUNCH studio (Phase 8). Pipeline is pure; the world arrives through ports. */
export async function launchKit(ctx: PipelineContext, input: LaunchKitInput): Promise<Pack> {
  const contract: LaunchContract = {
    id: `l_${ctx.deps.clock.now()}`,
    studio: "launch",
    styleId: input.styleId ?? "amethyst_editorial",
    createdAt: nowIso(ctx),
    requester: "agent",
    productName: input.productName,
    deliverables:
      input.deliverables ?? [
        "brand_kit",
        "og_image",
        "brand_mark",
        "carousel",
        "launch_thread",
        "landing_spec",
        "demo_script",
      ],
    locale: "en",
    ...(input.url ? { url: input.url } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.audience ? { audience: input.audience } : {}),
  };

  const launchDeps: LaunchDeps = {
    text: ctx.deps.text,
    image: ctx.deps.image,
    storage: ctx.deps.storage,
    clock: ctx.deps.clock,
    styleFor: (id) => HOUSE_STYLES[id],
    ...(ctx.deps.log ? { log: ctx.deps.log } : {}),
    ...(ctx.deps.site ? { site: ctx.deps.site } : {}),
    ...(ctx.deps.market ? { market: ctx.deps.market } : {}),
    ...(ctx.grader ? { grader: ctx.grader } : {}),
  };

  const { pack } = await runLaunch(contract, launchDeps);

  let sealed: Pack = {
    ...pack,
    coverageGaps: [...new Set([...ctx.coverageGaps, ...pack.coverageGaps])],
  };

  if (ctx.sealer) {
    sealed = await ctx.sealer.seal(sealed, "launch");
    if (sealed.seal) ctx.store.queueSeal(leafOfSeal(sealed.seal), sealed.id);
  }

  ctx.store.savePack(sealed);
  return sealed;
}

/* -------------------------------------------------------------- oce_critique */

export interface CritiqueInput {
  kind: string;
  brief: string;
  text?: string | undefined;
  imageBase64?: string | undefined;
  styleId?: HouseStyleId | undefined;
  size?: string | undefined;
}

/**
 * The b2b tool: run ANY artifact — ours or yours — through the Tribunal. This is the one
 * other builders can use on their own output, which is exactly why it is priced at a cent.
 */
export async function critique(
  ctx: PipelineContext,
  input: CritiqueInput,
): Promise<{ pack: Pack; report: TribunalReport }> {
  const styleId = input.styleId ?? "amethyst_editorial";

  const contract: LaunchContract = {
    id: `t_${ctx.deps.clock.now()}`,
    studio: "launch",
    styleId,
    createdAt: nowIso(ctx),
    requester: "agent",
    productName: "submitted artifact",
    description: input.brief,
    deliverables: ["brand_kit"],
    locale: "en",
  };

  const verdict = PolicyGate.screenText(input.brief + (input.text ?? ""));
  if (!verdict.allowed) throw new PolicyRefusal(PolicyGate.message(verdict));

  const keepsakeId = newKeepsakeId(ctx.deps.clock.now());
  let uri: string | undefined;

  if (input.imageBase64) {
    const png = await sharp(Buffer.from(input.imageBase64, "base64")).png().toBuffer();
    uri = `critiques/${keepsakeId}.png`;
    await ctx.deps.storage.put(uri, new Uint8Array(png), "image/png");
  }

  const submitted = artifact({
    id: "submitted",
    kind: (input.kind as Artifact["kind"]) ?? "critique_report",
    title: "Submitted artifact",
    format: input.imageBase64 ? "png" : "md",
    styleId,
    ...(uri ? { uri } : {}),
    ...(input.text ? { data: input.text } : {}),
    ...(input.size ? { spec: { size: input.size } } : {}),
  });

  const outcome = await runTribunal({
    artifact: submitted,
    contract,
    style: HOUSE_STYLES[styleId],
    deps: {
      critique: ctx.deps.critique,
      imageBytes: async (a) => (a.uri ? (await ctx.deps.storage.get(a.uri))?.bytes : undefined),
      ...(ctx.linkChecker ? { linkChecker: ctx.linkChecker } : {}),
    },
  });

  const report = artifact({
    id: "critique_report",
    kind: "critique_report",
    title: "Tribunal report",
    format: "json",
    data: JSON.stringify(outcome.report),
  });

  const pack = await assemble(
    ctx,
    contract,
    "tool",
    [outcome.artifact, report],
    [outcome.report],
    outcome.report.coverageGaps,
  );

  return { pack, report: outcome.report };
}
