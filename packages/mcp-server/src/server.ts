/**
 * The 8 tools.
 *
 * Tool descriptions ARE the storefront: on OKX.AI another agent decides whether to spend
 * money based on nothing but these strings. Each one says what you get, what it costs, one
 * concrete example, and what is provable afterwards. None of them overclaim — a tool that
 * promises more than it does earns a bad review the first time it is called.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { verifySeal, leafOfSeal, chainFor } from "@occestra/receipts";
import { rubricAsJson } from "@occestra/tribunal";
import type { Pack } from "@occestra/studio-core";
import { PRICES, type ToolName } from "./gate.js";
import {
  PolicyRefusal,
  critique,
  designInvite,
  launchKit,
  makeKeepsake,
  moodboard,
  planOccasion,
  writeToast,
  type PipelineContext,
} from "./pipelines.js";
import type { Store } from "./store.js";

export const VERSION = "1.0.0";

const STYLE_IDS = ["amethyst_editorial", "gilded_noir", "sunprint", "atlas_ink"] as const;
const StyleId = z.enum(STYLE_IDS).describe(
  "House Style. amethyst_editorial = warm ivory editorial collage. gilded_noir = near-black + champagne gold, formal. sunprint = cyanotype blues, nostalgic (best for memories). atlas_ink = map-and-ledger, best for itineraries.",
);

/** JSON with bigints rendered as decimal strings — a seal carries them. */
export function toJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, val: unknown) => (typeof val === "bigint" ? val.toString() : val),
    2,
  );
}

export interface ServerContext extends PipelineContext {
  store: Store;
  publicBaseUrl: string;
  chainId: number;
  registry?: string;
}

/** What every paid tool returns: the work, the grade, and the receipt. */
export function packResult(ctx: ServerContext, pack: Pack, note?: string) {
  const anchor = ctx.store.anchorOf(pack.id);

  return {
    keepsakeId: pack.id,
    studio: pack.studio,
    quality: pack.quality,
    coverageGaps: pack.coverageGaps,
    artifacts: pack.artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      format: artifact.format,
      ...(artifact.data ? { content: artifact.data } : {}),
      ...(artifact.uri ? { url: ctx.store.signedUrlFor(artifact.uri, 86_400) } : {}),
      sources: artifact.sources,
      tribunal: artifact.tribunal,
      // The buyer is told what we owed and did not deliver — in the tool response,
      // not just on the web page.
      ...(artifact.undelivered ? { undelivered: artifact.undelivered } : {}),
    })),
    seal: pack.seal
      ? {
          ...pack.seal,
          leaf: leafOfSeal(pack.seal),
          anchored: Boolean(anchor?.anchoredAt),
          ...(anchor?.txHash ? { anchorTx: anchor.txHash } : {}),
        }
      : undefined,
    publicPage: `${ctx.publicBaseUrl}/k/${pack.id}`,
    verify: "Call oce_verify_keepsake with this keepsakeId — it is free, forever.",
    ...(note ? { note } : {}),
  };
}

const ok = (payload: unknown) => ({
  content: [{ type: "text" as const, text: toJson(payload) }],
});

const refusal = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

/** Wrap a pipeline so a policy refusal is a polite answer, not a stack trace. */
async function run<T>(work: () => Promise<T>, render: (value: T) => unknown) {
  try {
    return ok(render(await work()));
  } catch (error) {
    if (error instanceof PolicyRefusal) return refusal(error.politeMessage);
    throw error;
  }
}

export function buildServer(ctx: ServerContext): McpServer {
  const server = new McpServer(
    { name: "occestra", version: VERSION },
    {
      instructions: [
        "Occestra — the Occasion Studio. Every moment, made monumental.",
        "",
        "Give Occestra any real moment (a birthday next Saturday, a product launching Friday, a trip just taken) and it returns finished work: a grounded plan, a designed invitation, a keepsake, a launch kit.",
        "",
        "Two things make it different from every other creative agent you can call:",
        "1. THE TRIBUNAL. Every artifact is graded against a published, versioned rubric (the Occestra Quality Standard) before you get it — five scored axes plus deterministic checks that no model can talk its way past: budgets must sum, schedules must be physically possible, images must match their spec, grounded claims must carry a source. Failures are repaired, up to twice. The full report ships with your result, pass or fail.",
        "2. THE SEAL. Any result can be hash-anchored on X Layer with an EIP-712 provenance certificate. Nothing personal goes on chain — only a hash. Anyone can verify it without trusting us.",
        "",
        "Occestra never claims a booking is confirmed, never invents a fact about a real person, and records every gap in its own coverage rather than hiding it.",
      ].join("\n"),
    },
  );

  const price = (tool: ToolName): string => `${PRICES[tool]} USDT per call.`;

  /* ------------------------------------------------------- oce_plan_occasion */

  server.registerTool(
    "oce_plan_occasion",
    {
      title: "Plan an occasion (grounded)",
      description: [
        `Plan a real occasion, grounded in real data. ${price("oce_plan_occasion")}`,
        "",
        "YOU GET: a plan with a shortlist of REAL candidate venues (each carrying its OpenStreetMap source and the timestamp we retrieved it), a live weather forecast for the date, a running order whose timings are physically possible — travel between venues is measured from real coordinates, so nobody is asked to cross town in five minutes — a budget whose line items actually sum to the total, contingencies keyed to the ACTUAL forecast (if rain is likely, the indoor plan becomes the primary plan, not a footnote), a host prep checklist, and a self-contained guest guide page you can send to everyone.",
        "",
        "EXAMPLE: occasion='30th birthday dinner', city='Lisbon', date='2026-07-18', headcount=12, vibe='warm, candlelit, long table' -> venue shortlist with sources, forecast, schedule, budget, contingencies.",
        "",
        "HONESTY: nothing here is booked. Occestra never claims a reservation it did not make. If the weather or the venue data could not be retrieved, the plan says so instead of inventing it.",
        "",
        "PROVABLE: the result is sealed and can be verified on X Layer.",
      ].join("\n"),
      inputSchema: {
        occasion: z.string().min(2).max(200).describe("What is happening. e.g. 'my sister's 30th birthday dinner'"),
        city: z.string().min(1).max(120).describe("City the occasion happens in."),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).describe("ISO date, YYYY-MM-DD."),
        headcount: z.number().int().min(1).max(2000).describe("How many people."),
        vibe: z.string().min(2).max(400).describe("The feeling you want. e.g. 'warm, editorial, candlelit'"),
        budgetUsd: z.number().nonnegative().optional().describe("Total budget in USD. Omitted = estimated per head."),
        constraints: z.array(z.string()).max(20).optional().describe("Real constraints. e.g. ['one guest is vegan', 'no stairs']"),
        styleId: StyleId.optional(),
        deliverables: z
          .array(z.enum(["plan", "schedule", "budget", "contingency", "invitation", "guest_guide", "toast", "moodboard"]))
          .min(1)
          .optional()
          .describe(
            "What to produce. Defaults to plan + schedule + budget + contingency + guest_guide. Add 'invitation' or 'moodboard' for artwork, 'toast' for words to say.",
          ),
      },
    },
    async (input) => run(() => planOccasion(ctx, input), (pack) => packResult(ctx, pack)),
  );

  /* ------------------------------------------------------- oce_design_invite */

  server.registerTool(
    "oce_design_invite",
    {
      title: "Design an invitation",
      description: [
        `An original invitation artwork in a named House Style, plus copy. ${price("oce_design_invite")}`,
        "",
        "YOU GET: one generated invitation image (1024x1536, ready to print or send), graded by the Tribunal for composition, legibility, style fidelity and platform fit — and deterministically checked for correct dimensions, 4.5:1 text contrast, and palette fidelity to the House Style. Plus three copy variants: warm, formal, and plain.",
        "",
        "EXAMPLE: occasion='Mara & Sam are getting married', date='2026-09-05', styleId='gilded_noir' -> a foil-and-black invitation with three ways to word it.",
        "",
        "HONESTY: the artwork carries no lettering — type is yours to set, because generated text in images is unreliable and we will not ship it as if it were not.",
        "",
        "NEVER: no third-party characters, no celebrity likenesses. The PolicyGate refuses those briefs before any money is spent.",
      ].join("\n"),
      inputSchema: {
        occasion: z.string().min(2).max(200).describe("What the invitation is for."),
        date: z.string().min(4).max(60).describe("The date, as it should read."),
        city: z.string().max(120).optional().describe("Where it happens."),
        detail: z.string().max(600).optional().describe("Anything that should shape the art. e.g. 'olive trees, late sun, long table'"),
        styleId: StyleId.optional(),
      },
    },
    async (input) => run(() => designInvite(ctx, input), (pack) => packResult(ctx, pack)),
  );

  /* --------------------------------------------------------- oce_write_toast */

  server.registerTool(
    "oce_write_toast",
    {
      title: "Write a toast",
      description: [
        `A toast someone can actually stand up and give. ${price("oce_write_toast")}`,
        "",
        "YOU GET: the toast, a one-sentence short version for when the room is loud, and a single line to fall back on if the speaker gets emotional. Written to be SAID, not read — short sentences, a landing you can hear coming.",
        "",
        "EXAMPLE: subject='my sister Mara', relationship='younger brother', details='she taught me to drive, badly. she never once said I told you so.' -> ~60 seconds of speakable, specific, unsentimental toast.",
        "",
        "HONESTY: Occestra uses ONLY the details you give it. It will not invent a memory, a nickname, or a shared joke that did not happen. Give it one true detail and it will do more with that than any amount of adjectives.",
      ].join("\n"),
      inputSchema: {
        subject: z.string().min(1).max(200).describe("Who or what the toast is for."),
        relationship: z.string().max(120).optional().describe("Who you are to them."),
        tone: z.string().max(200).optional().describe("e.g. 'funny but sincere', 'quiet and warm'"),
        details: z.string().max(4000).optional().describe("REAL things about them. The more specific, the better the toast."),
        lengthSeconds: z.number().int().min(20).max(180).optional().describe("Spoken length. Default 60."),
      },
    },
    async (input) => run(() => writeToast(ctx, input), (pack) => packResult(ctx, pack)),
  );

  /* ----------------------------------------------------------- oce_moodboard */

  server.registerTool(
    "oce_moodboard",
    {
      title: "Make a moodboard",
      description: [
        `A four-tile moodboard plus the art direction behind it. ${price("oce_moodboard")}`,
        "",
        "YOU GET: a 2x2 board of four vignettes (texture, scene, light, object) with a true palette strip from the House Style beneath it, and a written art-direction sheet — palette hexes, type direction, what to do, what to avoid. Usable as a brief for a human designer.",
        "",
        "EXAMPLE: subject='a winter supper club in a converted garage', styleId='gilded_noir' -> board + directions you could hand to a photographer.",
      ].join("\n"),
      inputSchema: {
        subject: z.string().min(2).max(300).describe("What the mood is for."),
        notes: z.string().max(1000).optional().describe("Anything that should steer it."),
        styleId: StyleId.optional(),
      },
    },
    async (input) => run(() => moodboard(ctx, input), (pack) => packResult(ctx, pack)),
  );

  /* -------------------------------------------------------- oce_make_keepsake */

  server.registerTool(
    "oce_make_keepsake",
    {
      title: "Make a keepsake from a memory",
      description: [
        `Turn a moment that already happened into something you can keep. ${price("oce_make_keepsake")}`,
        "",
        "YOU GET: an original keepsake artwork in a curated style (sunprint — cyanotype blues — by default, because it is the right register for memory), and a short written page that separates what you told us from what it meant.",
        "",
        "EXAMPLE: title='Our first summer in Porto', description='we walked the bridge at dusk and ate too many pastries' -> a cyanotype-style artwork and a page you would actually frame.",
        "",
        "UPLOAD YOUR PHOTOS: POST them to /uploads first (multipart, up to 8 images, 10MB each). Every file is re-encoded on arrival, which STRIPS EXIF — including the GPS coordinates of your home. The originals are never written to disk. Pass the returned keys as mediaRefs.",
        "",
        "NOBODY IS IDENTIFIED. Occestra COUNTS the people in your photographs. It does not name them, recognise them, guess their ages, or infer their relationships — not ever, not even if asked. If YOU name someone in your notes, that is your fact about your own life and we use it as yours.",
        "",
        "FACTS AND PROSE ARE SEPARATED. The story page has a 'What we can see' section (only what your photographs and your notes establish) and a 'The story' section (written prose, labelled as prose). A 'What we do not know' section lists what we could NOT establish — we do not fill those in. Call the tool again with confirmGraph to correct them; your version is used exactly as given.",
        "",
        "PRIVACY IS THE FEATURE: your uploads are private, never indexed, served only through expiring links, and DELETE /projects/:keepsakeId destroys the pack, the artifacts, AND the photographs, from disk, for real. Nothing personal ever goes on chain — only a hash of the finished manifest.",
      ].join("\n"),
      inputSchema: {
        title: z.string().min(2).max(200).describe("What you call this memory."),
        description: z.string().max(4000).optional().describe("What happened, in your words. Names YOU use are treated as your own facts."),
        momentDate: z.string().max(40).optional().describe("When it happened."),
        tone: z.string().max(200).optional().describe("e.g. 'nostalgic, quiet'"),
        styleId: StyleId.optional(),
        mediaRefs: z
          .array(z.string().min(1).max(200))
          .max(8)
          .optional()
          .describe("Private upload keys from POST /uploads. EXIF (and GPS) already stripped on ingest."),
        confirmGraph: z
          .object({
            momentDate: z.string().max(40).optional(),
            chapters: z
              .array(
                z.object({
                  title: z.string().min(2).max(80),
                  whatHappened: z.string().min(5).max(600),
                  fromMedia: z.array(z.string()).optional(),
                }),
              )
              .min(1)
              .max(6),
            themes: z.array(z.string().min(2).max(60)).min(1).max(5),
            uncertainties: z.array(z.string().min(3).max(200)).optional(),
          })
          .optional()
          .describe(
            "YOUR corrected Story Graph. Call once without it, read the 'What we do not know' section, fix it, and call again with this. It is used exactly as you give it — we do not 'improve' your memory.",
          ),
      },
    },
    async (input) => run(() => makeKeepsake(ctx, input as never), (pack) => packResult(ctx, pack)),
  );

  /* ----------------------------------------------------------- oce_launch_kit */

  server.registerTool(
    "oce_launch_kit",
    {
      title: "Launch kit from a real URL",
      description: [
        `Everything you need to launch, built from your ACTUAL site. ${price("oce_launch_kit")}`,
        "",
        "YOU GET: Occestra opens your URL in a real headless browser and reads what is ACTUALLY there — the title, the meta, the colours the page really renders, the fonts it really resolves. That evidence becomes a versioned Brand Genome (positioning, audience, voice, three supportable messages, and the cliches this product must never use). Then the kit: a hero/OG image (1536x1024), a square mark concept that reads at 32px, two social announcement cards, a 6-8 post launch thread with every post inside the platform limit, a section-by-section landing page spec with the copy actually written, and a 90-second demo beat sheet (cold open, problem, live magic, trust beat, price, CTA).",
        "",
        "EXAMPLE: productName='Tidepool', url='https://tidepool.example', audience='solo founders' -> hero + thread + genome, with the site's real palette echoed in the art.",
        "",
        "HONESTY: it uses only what is on your page and what you tell it. It invents no features, no metrics, no users, no funding. If your site cannot be reached, that is recorded as a coverage gap and the kit says, in writing, that it was built from the description alone. The genome even shows which of your colours it adopted and which it rejected, and why.",
        "",
        "BUILDERS: if you are shipping something this week, this is the tool. The result is sealed on X Layer, so 'made by Occestra, graded, verifiable' is checkable by anyone.",
      ].join("\n"),
      inputSchema: {
        productName: z.string().min(1).max(120).describe("What it is called."),
        url: z.string().url().optional().describe("The real, live URL. Strongly recommended — this is what makes the kit grounded."),
        description: z.string().max(2000).optional().describe("What it does, in your words."),
        audience: z.string().max(400).optional().describe("Who it is for."),
        styleId: StyleId.optional(),
        deliverables: z
          .array(z.enum(["brand_kit", "brand_mark", "launch_thread", "landing_spec", "demo_script", "og_image", "carousel", "moodboard"]))
          .min(1)
          .optional()
          .describe("What to produce. Defaults to the full kit: genome, hero, mark, 2 social cards, thread, landing spec, demo beat sheet."),
      },
    },
    async (input) => run(() => launchKit(ctx, input), (pack) => packResult(ctx, pack)),
  );

  /* -------------------------------------------------------------- oce_critique */

  server.registerTool(
    "oce_critique",
    {
      title: "Grade ANY artifact against a published standard",
      description: [
        `Run your own work — not just ours — through the Occestra Tribunal. ${price("oce_critique")}`,
        "",
        "FOR OTHER BUILDERS: you made an image, a plan, or a piece of copy with your own agent. Is it actually any good? This grades it against the Occestra Quality Standard (OQS v1.0.0), a rubric published in full at /standard — the same code that runs here.",
        "",
        "YOU GET: five scored axes (composition, legibility, style fidelity, grounding, platform fit — 70 is the passing floor), every deterministic check with its evidence (does the budget sum? is the schedule physically possible? does the image match its declared size? does body text clear 4.5:1 contrast? do the links resolve?), and an ACTIONABLE repair brief written to your generator, not to you.",
        "",
        "EXAMPLE: kind='invitation', imageBase64=<your png>, brief='a formal wedding invitation', size='1024x1536' -> scores, hard failures with evidence, and exactly what to change.",
        "",
        "WHY IT IS A CENT: because we want you to use it on everything. A marketplace where output is checkable is a better marketplace for everyone in it, including us.",
      ].join("\n"),
      inputSchema: {
        kind: z.string().min(2).max(40).describe("What the artifact is: 'invitation', 'plan', 'budget', 'schedule', 'toast', 'og_image', 'launch_thread', ..."),
        brief: z.string().min(5).max(2000).describe("What it was SUPPOSED to be. The Tribunal grades against intent."),
        text: z.string().max(40_000).optional().describe("The artifact, if it is text or JSON."),
        imageBase64: z.string().max(8_000_000).optional().describe("The artifact, if it is an image (base64 PNG)."),
        size: z.string().regex(/^\d{2,5}x\d{2,5}$/).optional().describe("The size the image was SUPPOSED to be. Enables the hard dimension check."),
        styleId: StyleId.optional(),
      },
    },
    async (input) =>
      run(
        () => critique(ctx, input),
        ({ pack, report }) => ({
          ...packResult(ctx, pack),
          verdict: report.pass ? "PASS" : "FAIL",
          oqsVersion: report.oqsVersion,
          axes: report.axes,
          hardFailures: report.deterministic.filter((check) => !check.passed && check.hard),
          softFailures: report.deterministic.filter((check) => !check.passed && !check.hard),
          repairBrief: report.repairBrief,
          rubric: `${ctx.publicBaseUrl}/standard`,
        }),
      ),
  );

  /* -------------------------------------------------------- oce_verify_keepsake */

  server.registerTool(
    "oce_verify_keepsake",
    {
      title: "Verify a keepsake on X Layer (free, forever)",
      description: [
        "Verify any Occestra keepsake. FREE, forever, no payment required — trust that costs money is not trust.",
        "",
        "YOU GET: the EIP-712 seal, whether its signature actually recovers to the Occestra sealer, the leaf that was anchored, whether it is on chain yet, the anchoring transaction, and an explorer link you can click.",
        "",
        "EXAMPLE: keepsakeId='oce_0abc...' -> {found, signatureValid, leaf, anchored, anchorTx, explorer}.",
        "",
        "You do not have to trust Occestra's servers for any of this: the manifest hash is recomputable from the pack itself, and the anchor is on X Layer whether we are online or not.",
      ].join("\n"),
      inputSchema: {
        keepsakeId: z.string().regex(/^oce_[0-9a-z]{22}$/).describe("The keepsake id returned with any Occestra result."),
      },
    },
    async ({ keepsakeId }) => {
      const pack = ctx.store.getPack(keepsakeId);
      if (!pack) {
        return ok({
          found: false,
          keepsakeId,
          note: "No keepsake with that id. Occestra only knows the ones it made.",
        });
      }

      const anchor = ctx.store.anchorOf(keepsakeId);
      const explorer = chainFor(ctx.chainId).blockExplorers.default.url;

      return ok({
        found: true,
        keepsakeId,
        studio: pack.studio,
        createdAt: pack.createdAt,
        quality: pack.quality,
        seal: pack.seal
          ? {
              ...pack.seal,
              leaf: leafOfSeal(pack.seal),
              signatureValid: await verifySeal(pack.seal),
            }
          : undefined,
        anchored: Boolean(anchor?.anchoredAt),
        ...(anchor?.txHash
          ? { anchorTx: anchor.txHash, explorer: `${explorer}/tx/${anchor.txHash}` }
          : {}),
        ...(anchor && !anchor.anchoredAt
          ? { note: "Sealed and queued — the anchor worker batches leaves on chain every 30 minutes." }
          : {}),
        ...(pack.seal ? {} : { note: "This pack was produced without a sealer key and is unsigned." }),
        publicPage: `${ctx.publicBaseUrl}/k/${keepsakeId}`,
        registry: ctx.registry,
        rubric: rubricAsJson().oqsVersion,
      });
    },
  );

  return server;
}
