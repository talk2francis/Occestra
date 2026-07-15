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
import { sanitizeGaps, sanitizeTribunal, type Pack } from "@occestra/studio-core";
import { PACK_TOOLS, PRICES, type PackToolName, type ToolName } from "./gate.js";
import { HOUSE_STYLES } from "@occestra/providers";
import type { JobQueue } from "./jobs.js";
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
  "House Style. Call oce_style_catalog (FREE) to see the real palette of each one, what it is for, and a real passing example. Short version: amethyst_editorial = warm ivory editorial collage, the safe default. gilded_noir = near-black + champagne gold, black-tie. sunprint = cyanotype blues, the right register for a MEMORY. atlas_ink = map-and-ledger, for anything a person has to read and act on.",
);

/** JSON with bigints rendered as decimal strings — a seal carries them. */
export function toJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, val: unknown) => (typeof val === "bigint" ? val.toString() : val),
    2,
  );
}

/**
 * THE TOOL INPUT SCHEMAS, LIFTED OUT OF THE TOOL DEFINITIONS.
 *
 * They have a second reader now. `oce_create_pack_job` takes the arguments of another tool
 * as an opaque object, and the paywall has to know whether those arguments are VALID before
 * it settles a payment — otherwise a typo in a field name is a charge, a job, a crash, and a
 * refund, instead of a 400 that costs nobody anything.
 *
 * One shape, two readers. A schema that lived only inside registerTool could not be checked
 * at the door, and a second copy of it at the door would drift from the first by Thursday.
 */
const TOOL_INPUTS = {
  oce_plan_occasion: {
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
  oce_design_invite: {
      occasion: z.string().min(2).max(200).describe("What the invitation is for."),
      date: z.string().min(4).max(60).describe("The date, as it should read."),
      city: z.string().max(120).optional().describe("Where it happens."),
      detail: z.string().max(600).optional().describe("Anything that should shape the art. e.g. 'olive trees, late sun, long table'"),
      styleId: StyleId.optional(),
  },
  oce_write_toast: {
      subject: z.string().min(1).max(200).describe("Who or what the toast is for."),
      relationship: z.string().max(120).optional().describe("Who you are to them."),
      tone: z.string().max(200).optional().describe("e.g. 'funny but sincere', 'quiet and warm'"),
      details: z.string().max(4000).optional().describe("REAL things about them. The more specific, the better the toast."),
      lengthSeconds: z.number().int().min(20).max(180).optional().describe("Spoken length. Default 60."),
  },
  oce_moodboard: {
      subject: z.string().min(2).max(300).describe("What the mood is for."),
      notes: z.string().max(1000).optional().describe("Anything that should steer it."),
      styleId: StyleId.optional(),
  },
  oce_make_keepsake: {
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
  oce_launch_kit: {
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
  oce_critique: {
      kind: z.string().min(2).max(40).describe("What the artifact is: 'invitation', 'plan', 'budget', 'schedule', 'toast', 'og_image', 'launch_thread', ..."),
      brief: z.string().min(5).max(2000).describe("What it was SUPPOSED to be. The Tribunal grades against intent."),
      text: z.string().max(40_000).optional().describe("The artifact, if it is text or JSON."),
      imageBase64: z.string().max(8_000_000).optional().describe("The artifact, if it is an image (base64 PNG)."),
      size: z.string().regex(/^\d{2,5}x\d{2,5}$/).optional().describe("The size the image was SUPPOSED to be. Enables the hard dimension check."),
      styleId: StyleId.optional(),
  },
} as const;

/** The arguments an async job may be created with — validated before a cent moves. */
export function packToolSchema(tool: PackToolName): z.ZodTypeAny {
  return z.object(TOOL_INPUTS[tool]);
}

export interface ServerContext extends PipelineContext {
  store: Store;
  publicBaseUrl: string;
  chainId: number;
  registry?: string;
  jobs?: JobQueue;
  /**
   * The order this request was paid under, if money actually moved.
   *
   * Set per-request by the paywall. It is here so that a tool which takes payment and then
   * FAILS can book what it owes: x402 settles before the work runs, so a pipeline that throws
   * leaves the money in our treasury and nothing in the buyer's hands. That debt gets written
   * down, every time, in a place the buyer can read.
   */
  order?: { id: string; tool: string; priceUsdt: number; payerRef: string };
  /** Per-request tap: the payload this call answered with, for the idempotency store. */
  onResult?: (result: ToolResult) => void;
}

export interface ToolResult {
  payload: unknown;
  isError: boolean;
}

/** What every paid tool returns: the work, the grade, and the receipt. */
export function packResult(ctx: ServerContext, pack: Pack, note?: string) {
  const anchor = ctx.store.anchorOf(pack.id);

  return {
    keepsakeId: pack.id,
    studio: pack.studio,
    quality: pack.quality,
    // Every public boundary sanitizes. A raw provider error must never reach a buyer.
    coverageGaps: sanitizeGaps(pack.coverageGaps),
    artifacts: pack.artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      format: artifact.format,
      ...(artifact.data ? { content: artifact.data } : {}),
      ...(artifact.uri ? { url: ctx.store.signedUrlFor(artifact.uri, 86_400) } : {}),
      sources: artifact.sources,
      tribunal: sanitizeTribunal(artifact.tribunal),
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

export function buildServer(ctx: ServerContext): McpServer {
  /**
   * Every answer this server gives, handed to whoever is listening.
   *
   * The idempotency layer needs a copy of what the buyer received, and it cannot get one by
   * watching the socket: the MCP transport hands the response to a web-standard bridge that
   * writes it below the level of `res.write`. So the result is tapped HERE, at the only place
   * that certainly knows it.
   *
   * That turns out to be the better answer anyway. A replay rebuilt from the payload carries
   * the RETRY's own JSON-RPC id; a replay of the original bytes would carry the id of a
   * request the client has long since given up on, and a client that cannot match the id to
   * anything it is waiting for will simply drop it on the floor.
   */
  const ok = (payload: unknown) => {
    ctx.onResult?.({ payload, isError: false });
    return { content: [{ type: "text" as const, text: toJson(payload) }] };
  };

  const refusal = (message: string) => {
    ctx.onResult?.({ payload: message, isError: true });
    return { content: [{ type: "text" as const, text: message }], isError: true };
  };

  /**
   * Wrap a pipeline so a policy refusal is a polite answer, not a stack trace — and so that a
   * paid call which delivers nothing books what it owes.
   */
  const run = async <T>(work: () => Promise<T>, render: (value: T) => unknown) => {
    try {
      return ok(render(await work()));
    } catch (error) {
      const refused = error instanceof PolicyRefusal;

      // We were paid, and we are about to hand back nothing. Say so, and write it down.
      if (ctx.order) {
        ctx.store.oweRefund({
          orderId: ctx.order.id,
          payerRef: ctx.order.payerRef,
          amountUsdt: ctx.order.priceUsdt,
          tool: ctx.order.tool,
          reason: refused ? "refused after payment" : "the run failed",
        });
      }

      if (refused) return refusal((error as PolicyRefusal).politeMessage);
      throw error;
    }
  };

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
        "3. THE JOB QUEUE. Anything long — a launch kit especially — should be run with oce_create_pack_job: same price as the tool it runs, no timeout, and polling, collecting and cancelling are free. Send an Idempotency-Key on any paid call and a retry can never charge you twice; if you send none, the nonce inside your x402 payment is used as the key, so a plain retry is already safe.",
        "",
        "START WITH oce_style_catalog. It is free, it shows you the real palette of every House Style with a real passing example, and choosing one blind means paying for a render you did not want.",
        "",
        "Occestra never claims a booking is confirmed, never invents a fact about a real person, and records every gap in its own coverage rather than hiding it.",
        "",
        "AND WHEN IT FAILS: x402 settles before the work runs, so a call that delivers nothing has taken your money and given you nothing. Occestra books that as a refund against your address, publishes the total at /stats, and returns it on chain. We would rather show you the number than hide it.",
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
      inputSchema: TOOL_INPUTS.oce_plan_occasion,
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
      inputSchema: TOOL_INPUTS.oce_design_invite,
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
      inputSchema: TOOL_INPUTS.oce_write_toast,
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
      inputSchema: TOOL_INPUTS.oce_moodboard,
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
      inputSchema: TOOL_INPUTS.oce_make_keepsake,
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
        "RUN THIS AS A JOB. It is the longest thing Occestra does — a real browser render, four images, seven pieces of copy, and a Tribunal pass over every one of them. Call oce_create_pack_job with tool='oce_launch_kit' instead of calling this directly: same price, no timeout, and you can watch the run. If you do call it synchronously and your client times out, send an Idempotency-Key so your retry cannot be charged twice.",
        "",
        "BUILDERS: if you are shipping something this week, this is the tool. The result is sealed on X Layer, so 'made by Occestra, graded, verifiable' is checkable by anyone.",
      ].join("\n"),
      inputSchema: TOOL_INPUTS.oce_launch_kit,
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
        `FOR OTHER BUILDERS: you made an image, a plan, or a piece of copy with your own agent. Is it actually any good? This grades it against the Occestra Quality Standard (OQS v${rubricAsJson().oqsVersion}), a rubric published in full at /standard — the same code that runs here.`,
        "",
        "THE GRADE IS REPRODUCIBLE. The critic runs at temperature 0 against anchored scoring bands, and a correctness axis may only fall below its floor if the critic can QUOTE the exact defect — an uncited correctness failure is discarded and the score restored. Run it twice on the same artifact and you get the same verdict. A standard that scores the identical thing 62 one day and 72 the next is not a standard, it is a mood.",
        "",
        "YOU GET: five scored axes (composition, legibility, style fidelity, grounding, platform fit — 70 is the passing floor), every deterministic check with its evidence (does the budget sum? is the schedule physically possible? does the image match its declared size? does body text clear 4.5:1 contrast? do the links resolve?), and an ACTIONABLE repair brief written to your generator, not to you.",
        "",
        "EXAMPLE: kind='invitation', imageBase64=<your png>, brief='a formal wedding invitation', size='1024x1536' -> scores, hard failures with evidence, and exactly what to change.",
        "",
        "WHY IT IS A CENT: because we want you to use it on everything. A marketplace where output is checkable is a better marketplace for everyone in it, including us.",
      ].join("\n"),
      inputSchema: TOOL_INPUTS.oce_critique,
    },
    async (input) =>
      run(() => critique(ctx, input),
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

  /* --------------------------------------------------- oce_create_pack_job */

  server.registerTool(
    "oce_create_pack_job",
    {
      title: "Start any pack as a background job",
      description: [
        "Run ANY Occestra pack tool asynchronously. Costs EXACTLY what the tool it runs costs — not a cent more. Watching it is free.",
        "",
        "USE THIS FOR ANYTHING LONG. oce_launch_kit reads your site in a real browser, derives a brand genome, renders four images and writes seven pieces of copy — then grades every one of them against the standard and repairs what fails. That is minutes, not seconds. If you call it synchronously and your client times out, your client will retry, and you will have paid twice for a pack that was already being built. Start a job instead: you get an id immediately, and the work continues whether you are holding a connection or not.",
        "",
        "IT SURVIVES US. The job is written to disk before you get the id back. If Occestra restarts mid-render, the job is still there when it comes back, and it is finished — you paid for it, and our crash is not your problem.",
        "",
        "EXAMPLE: tool=\'oce_launch_kit\', arguments={productName:\'Tidepool\', url:\'https://tidepool.example\'} -> {jobId} -> poll oce_job_status -> oce_job_result.",
        "",
        "PAID ONCE. Send an Idempotency-Key header and a retry can never double-charge you. If you do not send one, the nonce inside your x402 payment is used as the key instead — so a plain retry of the identical request is already safe, with no change on your side.",
        "",
        "IF IT FAILS, YOU ARE OWED THE MONEY BACK. x402 settles before the work runs, so a job that delivers nothing has taken your payment and given you nothing. That debt is recorded against your address, published at /stats, and returned on chain. We would rather show you the number than hide it.",
      ].join("\n"),
      inputSchema: {
        tool: z.enum(PACK_TOOLS).describe("Which pack tool to run. Priced exactly as that tool."),
        arguments: z
          .object({})
          .passthrough()
          .describe("The arguments you would have passed to that tool. Validated BEFORE you are charged."),
      },
    },
    async ({ tool, arguments: args }) => {
      const jobId = `job_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

      ctx.store.createJob({
        id: jobId,
        tool,
        args,
        payerRef: ctx.order?.payerRef ?? "free",
        priceUsdt: ctx.order?.priceUsdt ?? 0,
        ...(ctx.order ? { orderId: ctx.order.id } : {}),
      });

      // Start it now rather than on the next poll tick — the buyer is waiting.
      ctx.jobs?.kick();

      return ok({
        jobId,
        tool,
        state: "queued",
        poll: "Call oce_job_status with this jobId. It is free.",
        collect: "When state is 'done', call oce_job_result. Also free.",
        publicPage: `${ctx.publicBaseUrl}/j/${jobId}`,
      });
    },
  );

  /* -------------------------------------------------------- oce_job_status */

  server.registerTool(
    "oce_job_status",
    {
      title: "Check a job (free)",
      description: [
        "Where a job has got to. FREE — charging you to ask whether the thing you already paid for is ready yet would be indefensible.",
        "",
        "YOU GET: the state (queued, running, done, failed, cancelled), how long it has been going, and the REAL event feed of the run — the venue search that actually fired, the forecast that actually came back, the image that actually rendered, the Tribunal grading each artifact and repairing the ones that failed. Nothing in that feed is invented for the look of it; every line is a port call that really happened.",
        "",
        "EXAMPLE: jobId=\'job_abc123\' -> {state:\'running\', elapsedSeconds:74, progress:[...]}.",
      ].join("\n"),
      inputSchema: {
        jobId: z.string().min(4).max(64).describe("The id oce_create_pack_job gave you."),
      },
    },
    async ({ jobId }) => {
      const job = ctx.store.getJob(jobId);
      if (!job) return ok({ found: false, jobId, note: "No job with that id." });

      const owed = job.orderId ? ctx.store.refundFor(job.orderId) : undefined;

      return ok({
        found: true,
        jobId,
        tool: job.tool,
        state: job.state,
        attempts: job.attempts,
        elapsedSeconds: Math.round(((job.finishedAt ?? Date.now()) - job.createdAt) / 1000),
        progress: job.progress,
        ...(job.packId ? { keepsakeId: job.packId, result: "Call oce_job_result to collect it." } : {}),
        ...(job.error ? { error: job.error } : {}),
        ...(owed && !owed.paidAt
          ? {
              refundOwed: {
                amountUsdt: owed.amountUsdt,
                to: owed.payerRef,
                reason: owed.reason,
                note: "We took payment and delivered nothing. This is recorded against us, in public, at /stats — and it is returned on chain.",
              },
            }
          : {}),
      });
    },
  );

  /* -------------------------------------------------------- oce_job_result */

  server.registerTool(
    "oce_job_result",
    {
      title: "Collect a finished job (free)",
      description: [
        "The finished pack — the work, the grade, and the receipt. FREE: you already paid when you started the job, and you will not be charged twice for collecting it.",
        "",
        "Identical in shape to what the synchronous tool would have returned: every artifact, its Tribunal report, the coverage gaps, the seal, and the public page.",
        "",
        "EXAMPLE: jobId=\'job_abc123\' -> the same result oce_launch_kit would have handed you, if you had been able to wait.",
      ].join("\n"),
      inputSchema: {
        jobId: z.string().min(4).max(64).describe("The id oce_create_pack_job gave you."),
      },
    },
    async ({ jobId }) => {
      const job = ctx.store.getJob(jobId);
      if (!job) return ok({ found: false, jobId, note: "No job with that id." });

      if (job.state !== "done" || !job.packId) {
        return ok({
          found: true,
          jobId,
          ready: false,
          state: job.state,
          ...(job.error ? { error: job.error } : {}),
          note:
            job.state === "failed" || job.state === "cancelled"
              ? "This job produced no pack, and never will."
              : "Not finished yet. Call oce_job_status.",
        });
      }

      const pack = ctx.store.getPack(job.packId);
      if (!pack) {
        return ok({ found: true, jobId, ready: false, error: "the pack for this job is gone" });
      }

      return ok({ ready: true, jobId, ...packResult(ctx, pack) });
    },
  );

  /* ------------------------------------------------------- oce_cancel_job */

  server.registerTool(
    "oce_cancel_job",
    {
      title: "Cancel a job (free)",
      description: [
        "Stop a job. FREE.",
        "",
        "A QUEUED job stops instantly and is refunded in full — nothing had been spent on it yet.",
        "",
        "A RUNNING job is asked to stop, and stops at its next provider call — we will not tear a render down halfway and leave half a file behind. It is NOT refunded: the money has already gone to real providers doing real work on your behalf, and asking us to stop does not un-spend it. We are telling you that before you call it, not after.",
        "",
        "EXAMPLE: jobId=\'job_abc123\' -> {outcome:\'cancelling\'}.",
      ].join("\n"),
      inputSchema: {
        jobId: z.string().min(4).max(64).describe("The id oce_create_pack_job gave you."),
      },
    },
    async ({ jobId }) => {
      const job = ctx.store.getJob(jobId);
      const outcome = ctx.store.requestCancel(jobId);

      if (outcome === "unknown") return ok({ found: false, jobId, note: "No job with that id." });

      // Queued means nothing was spent. Nothing spent means the money goes back, in full.
      if (outcome === "cancelled" && job?.orderId && job.priceUsdt > 0) {
        ctx.store.oweRefund({
          orderId: job.orderId,
          payerRef: job.payerRef,
          amountUsdt: job.priceUsdt,
          tool: job.tool,
          reason: "cancelled before it started — nothing had been spent",
        });
      }

      return ok({
        jobId,
        outcome,
        ...(outcome === "cancelled"
          ? { refunded: job?.priceUsdt ?? 0, note: "It had not started. You are owed the full price back." }
          : {}),
        ...(outcome === "cancelling"
          ? { note: "It will stop at its next provider call. It is not refunded — the money is already spent." }
          : {}),
        ...(outcome === "not_cancellable" ? { note: "This job has already finished." } : {}),
      });
    },
  );

  /* ------------------------------------------------------ oce_style_catalog */

  server.registerTool(
    "oce_style_catalog",
    {
      title: "The House Styles, in full (free)",
      description: [
        "Every House Style Occestra can render in, with the actual palette, the type direction, what each one is FOR, what it is WRONG for — and a link to a real, finished, Tribunal-PASSED artifact made in it. FREE.",
        "",
        "CALL THIS FIRST. A styleId is an argument on almost every paid tool, and choosing one blind means paying for a render you did not want. A wrong style is not a refund — it is just a bad invitation.",
        "",
        "YOU GET, per style: the exact hex palette (which is not a suggestion — PALETTE_DRIFT is a deterministic Tribunal check, and an image that wanders out of its palette fails on arithmetic, not on taste), the type direction, the version (styles are versioned; a palette change bumps it), what the style refuses to draw, and a signed link to the most recent artifact that actually passed in it. If a style has never produced a passing artifact, it shows you nothing rather than borrowing one from a style that did.",
        "",
        "THE SHORT VERSION: sunprint for a memory. atlas_ink for anything anyone has to read and act on. gilded_noir for black-tie. amethyst_editorial when you are not sure.",
        "",
        "EXAMPLE: (no arguments) -> four styles, four palettes, four real examples, and the rule that enforces them.",
      ].join("\n"),
      inputSchema: {},
    },
    async () => {
      const examples = ctx.store.styleExamples();

      return ok({
        styles: Object.values(HOUSE_STYLES).map((style) => {
          const example = examples[style.id];

          return {
            id: style.id,
            name: style.name,
            version: style.version,
            appliesTo: style.appliesTo.studios,
            bestFor: style.bestFor,
            wrongFor: style.wrongFor,
            palette: style.palette,
            typeDirection: style.typeDirection,
            refuses: style.negativePrompt,
            example: example
              ? {
                  kind: example.kind,
                  image: ctx.store.signedUrlFor(example.uri, 86_400),
                  keepsake: `${ctx.publicBaseUrl}/k/${example.keepsakeId}`,
                  note: "A real artifact that passed the Tribunal in this style. Not a mock-up.",
                }
              : { note: "Nothing has been rendered in this style yet, so there is nothing honest to show you." },
          };
        }),
        enforcement:
          "The palette is checked, not trusted: PALETTE_DRIFT is a deterministic check in the Occestra Quality Standard. An image that wanders out of its declared palette fails on arithmetic — no model can talk its way past it.",
        rubric: `${ctx.publicBaseUrl}/standard`,
        defaults: {
          oce_plan_occasion: "atlas_ink",
          oce_make_keepsake: "sunprint",
          oce_design_invite: "amethyst_editorial",
          oce_moodboard: "amethyst_editorial",
          oce_launch_kit: "amethyst_editorial",
        },
      });
    },
  );

  return server;
}
