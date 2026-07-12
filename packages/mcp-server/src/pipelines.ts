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
  runCelebrate,
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
  description: string;
  momentDate?: string | undefined;
  tone?: string | undefined;
  styleId?: HouseStyleId | undefined;
}

export async function makeKeepsake(ctx: PipelineContext, input: MakeKeepsakeInput): Promise<Pack> {
  const styleId = input.styleId ?? "sunprint";

  const contract: RememberContract = {
    id: `r_${ctx.deps.clock.now()}`,
    studio: "remember",
    styleId,
    createdAt: nowIso(ctx),
    requester: "agent",
    title: input.title,
    tone: input.tone ?? "nostalgic, quiet, tender",
    notes: input.description,
    mediaRefs: [],
    deliverables: ["keepsake_art", "story_page"],
    locale: "en",
    ...(input.momentDate ? { momentDate: input.momentDate } : {}),
  };

  screen(contract);

  const keepsakeId = newKeepsakeId(ctx.deps.clock.now());
  const size = "1024x1024";

  const { uri } = await makeImage(ctx, {
    subject: [
      `A keepsake artwork for a remembered moment: ${input.title}.`,
      `The moment, in the owner's words: ${input.description}`,
      "Render the FEELING and the OBJECTS of the memory — never a recognisable human face.",
      "No text, no lettering.",
    ].join(" "),
    styleId,
    size,
    key: `keepsakes/${keepsakeId}.png`,
  });

  const art = artifact({
    id: "keepsake_art",
    kind: "keepsake_art",
    title: input.title,
    format: "png",
    uri,
    styleId,
    spec: { size },
  });

  const written = await ctx.deps.text.complete({
    role: "writer",
    system: [
      "You write the short prose that sits beside a keepsake — the caption on the back of a photograph, not an essay.",
      "",
      "Rules you do not break:",
      "- Use ONLY what you were told. Invent nothing about the people, the place, or what it meant.",
      "- Separate what is known from what is felt. Never dress up a guess as a fact.",
      "- 120 words at most. Plain, unsentimental, specific.",
      "",
      "Return markdown with '## The moment' (what happened, from what you were told) and '## Why it stays' (one short paragraph).",
    ].join("\n"),
    prompt: [
      `Title: ${input.title}`,
      input.momentDate ? `When: ${input.momentDate}` : "",
      `Tone: ${contract.tone}`,
      `What the owner told us:\n${input.description}`,
    ]
      .filter(Boolean)
      .join("\n"),
    maxTokens: 500,
    temperature: 0.7,
  });

  const story = artifact({
    id: "story_page",
    kind: "story_page",
    title: `${input.title} — the story`,
    format: "md",
    data: written.text,
  });

  const { artifacts, reports, gaps } = await gradeAll(ctx, contract, [art, story], styleId);
  return assemble(ctx, contract, "remember", artifacts, reports, gaps);
}

/* ------------------------------------------------------------ oce_launch_kit */

export interface LaunchKitInput {
  productName: string;
  url?: string | undefined;
  description?: string | undefined;
  audience?: string | undefined;
  styleId?: HouseStyleId | undefined;
}

export async function launchKit(ctx: PipelineContext, input: LaunchKitInput): Promise<Pack> {
  const styleId = input.styleId ?? "amethyst_editorial";

  const contract: LaunchContract = {
    id: `l_${ctx.deps.clock.now()}`,
    studio: "launch",
    styleId,
    createdAt: nowIso(ctx),
    requester: "agent",
    productName: input.productName,
    deliverables: ["brand_kit", "launch_thread", "og_image"],
    locale: "en",
    ...(input.url ? { url: input.url } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.audience ? { audience: input.audience } : {}),
  };

  screen(contract);

  const gaps: string[] = [];
  const sources: SourceTag[] = [];

  /* --- look at the REAL site, if there is one --- */

  let genome = input.description ?? "";
  let palette: string[] = [];

  if (input.url && ctx.deps.site) {
    try {
      const inspection = await ctx.deps.site.inspect(input.url);
      palette = inspection.palette;
      sources.push(inspection.source);
      genome = [
        `Title: ${inspection.title}`,
        `Description: ${inspection.description}`,
        inspection.palette.length > 0 ? `Colours actually used on the site: ${inspection.palette.join(", ")}` : "",
        inspection.fonts.length > 0 ? `Fonts: ${inspection.fonts.join(", ")}` : "",
        input.description ? `What the maker says: ${input.description}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    } catch (error) {
      gaps.push(
        `SITE_UNAVAILABLE: could not inspect ${input.url} (${error instanceof Error ? error.message : String(error)}) — the kit is built from the description alone, not from the real site`,
      );
    }
  } else if (!input.url) {
    gaps.push("NO_URL: no site was given, so the brand genome is not grounded in a real product page");
  }

  const keepsakeId = newKeepsakeId(ctx.deps.clock.now());
  const heroSize = "1536x1024";

  const { uri } = await makeImage(ctx, {
    subject: [
      `A launch hero image for "${input.productName}".`,
      genome ? `What the product actually is:\n${genome}` : "",
      palette.length > 0 ? `Echo the product's own colours where it does not fight the House Style: ${palette.join(", ")}.` : "",
      "No text, no lettering, no UI mockups, no fake screenshots.",
    ]
      .filter(Boolean)
      .join("\n"),
    styleId,
    size: heroSize,
    key: `launch/${keepsakeId}-hero.png`,
  });

  const hero = artifact({
    id: "og_image",
    kind: "og_image",
    title: `${input.productName} — hero`,
    format: "png",
    uri,
    styleId,
    spec: { size: heroSize },
    sources,
  });

  const thread = await ctx.deps.text.complete({
    role: "writer",
    system: [
      "You write launch threads for people who build things, and who can smell marketing from a mile away.",
      "",
      "Rules:",
      "- Use ONLY what you were given about the product. Invent no features, no metrics, no users, no funding.",
      "- No hype words: not 'revolutionary', not 'game-changing', not 'excited to announce'.",
      "- Post 1 says what it IS in one sentence a stranger understands. Post 2 says who it's for and what it replaces. Post 3 is the ask (try it / tell me what's broken).",
      "- Short lines. No hashtag soup. At most one emoji in the whole thread, and only if it earns its place.",
      "",
      "Return markdown: '## Post 1', '## Post 2', '## Post 3'.",
    ].join("\n"),
    prompt: [
      `Product: ${input.productName}`,
      input.url ? `URL: ${input.url}` : "",
      input.audience ? `Audience: ${input.audience}` : "",
      genome ? `What we found:\n${genome}` : "We were given nothing but the name — say so rather than inventing.",
    ]
      .filter(Boolean)
      .join("\n"),
    maxTokens: 800,
    temperature: 0.7,
  });

  const launchThread = artifact({
    id: "launch_thread",
    kind: "launch_thread",
    title: `${input.productName} — launch thread`,
    format: "md",
    data: thread.text,
    sources,
    ...(input.url ? { spec: { links: [input.url] } } : {}),
  });

  const brandKit = artifact({
    id: "brand_kit",
    kind: "brand_kit",
    title: `${input.productName} — brand genome`,
    format: "md",
    sources,
    data: [
      `## ${input.productName}`,
      "",
      input.url ? `Inspected: ${input.url}` : "_No site was inspected — this is built from the description alone._",
      "",
      "### What we actually found",
      genome || "_Nothing but the name._",
      "",
      palette.length > 0 ? `### The product's real colours\n${palette.join("  ·  ")}` : "",
      "",
      `### House Style applied\n${HOUSE_STYLES[styleId].name} — ${HOUSE_STYLES[styleId].typeDirection}`,
    ]
      .filter(Boolean)
      .join("\n"),
    ...(input.url ? { spec: { links: [input.url] } } : {}),
  });

  const {
    artifacts,
    reports,
    gaps: tribunalGaps,
  } = await gradeAll(ctx, contract, [hero, launchThread, brandKit], styleId);

  return assemble(ctx, contract, "launch", artifacts, reports, [...gaps, ...tribunalGaps]);
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
