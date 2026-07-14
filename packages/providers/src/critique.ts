/**
 * The critic. This is the model half of the Tribunal — the deterministic half already ran
 * and cannot be argued with. The critic's job is the part arithmetic can't reach: is the
 * composition any good, does it look like the House Style it claims, does the copy fit.
 *
 * The prompt is tight on purpose. A critic that waffles is a critic that passes slop.
 */
import { z } from "zod";
import type {
  CritiquePort,
  CritiqueRequest,
  CritiqueResult,
  ImageModelPort,
} from "@occestra/studio-core";
import type { ChatContent, VisionCapable } from "./router.js";
import { strictJson } from "./json.js";
import { styleSystemPrompt } from "./styles.js";

const CritiqueSchema = z.object({
  composition: z.number().min(0).max(100),
  legibility: z.number().min(0).max(100),
  style_fidelity: z.number().min(0).max(100),
  grounding: z.number().min(0).max(100),
  platform_fit: z.number().min(0).max(100),
  issues: z.array(z.string()).max(12),
  /**
   * One per axis scored below 70, quoting the exact thing that is wrong.
   *
   * A failing score without a citable cause is an opinion, and opinions do not reproduce.
   * The engine DISCARDS an uncited correctness failure and restores the score to the floor —
   * so a critic that cannot quote the defect cannot fail the artifact for it.
   */
  citations: z
    .array(
      z.object({
        axis: z.enum(["composition", "legibility", "style_fidelity", "grounding", "platform_fit"]),
        quote: z.string().min(1).max(400),
        why: z.string().min(1).max(400),
      }),
    )
    .max(8)
    .default([]),
  repairBrief: z.string(),
});

const SYSTEM = [
  "You are the Tribunal critic for Occestra, an occasion studio. You grade a single artifact against a published standard. You are not the artist and you are not the client — you are the person who says whether this is good enough to send.",
  "",
  "YOU ARE A MEASURING INSTRUMENT, NOT A TASTE. Two runs of you over the same artifact must",
  "reach the same verdict. Do not re-decide the standard each time you read it: the standard is",
  "below, and your job is to MATCH THE ARTIFACT AGAINST IT, not to form an impression. Work",
  "through the anchors literally, in order, and take the first one that fits.",
  "",
  "SCORING ANCHORS. Pick the band the artifact actually sits in. Do not interpolate a feeling.",
  "",
  "  composition (craft) — structure and hierarchy of the thing in front of you.",
  "    85+  a clear focal point or entry point, deliberate ordering, nothing competing for attention",
  "    70   a reader can find what they need without hunting; sections/blocks are distinguishable",
  "    50   flat: an undifferentiated wall of text, a centred blob, or a bare list with no ordering",
  "    30   actively disordered — the reader cannot tell what matters",
  "",
  "  legibility (CORRECTNESS) — can every word be READ, and does it say the right thing?",
  "    85+  every word readable at its intended size; times, dates and numbers are unambiguous",
  "    70   readable; nothing clipped, crushed, or below 4.5:1 contrast; no ambiguous units or timezones",
  "    <70  ONLY IF you can quote the specific text that is unreadable, clipped, crushed, or ambiguous",
  "",
  "  style_fidelity (craft) — faithful to the declared House Style.",
  "    85+  the palette, type direction and material language are unmistakably this House Style",
  "    70   recognisably in the style, with minor drift",
  "    40   generic AI-default rendering, however pretty",
  "",
  "  grounding (CORRECTNESS) — is every factual claim TRUE, SOURCED, and honestly hedged?",
  "    THIS IS THE AXIS PEOPLE GET WRONG. It is not a measure of how thorough or well-evidenced",
  "    the work FEELS. It asks one question: does the artifact assert something it has not earned?",
  "    85+  every factual claim carries a source, and every unknown is stated as unknown",
  "    70   no unsourced factual claim, and nothing is presented as more certain than it is.",
  "         An artifact that says plainly 'this is not booked' or 'no forecast exists yet' is",
  "         GROUNDED — honesty about a gap is grounding, not a deduction.",
  "    <70  ONLY IF you can quote a specific claim that is invented, unsourced, or overclaimed.",
  "    DO NOT deduct for: information you merely WISH were there; a source you personally cannot",
  "    verify; or a claim the artifact has already flagged as uncertain. 'Could be better evidenced'",
  "    is not a grounding failure. 'Asserts X with no source' is.",
  "",
  "  platform_fit (craft) — right for where this will actually live.",
  "    85+  dimensions, length and tone are exactly right for the medium and audience",
  "    70   usable in its medium without rework",
  "    50   wrong shape, wrong length, or wrong register for where it must go",
  "",
  "THE FLOOR IS 70 AND IT IS A BAR, NOT A MOOD. Anything at or above 70 passes. Do not shade a",
  "68 or a 72 to express an opinion — if you cannot name the specific defect that puts it under",
  "the bar, it is not under the bar.",
  "",
  "CITATIONS ARE MANDATORY FOR EVERY FAILING SCORE. For each axis you score below 70, you must",
  "add an entry to `citations` quoting the EXACT text or element that is wrong and why it fails",
  "that axis. A failure you cannot quote is a failure you cannot justify, and it will be",
  "DISCARDED — the score will be restored to the floor and your judgement ignored. Quote, or do",
  "not fail it.",
  "",
  "THE SUBSTITUTION TEST — apply it to every piece of COPY before you score anything:",
  "  Could this sentence be pasted, unchanged, into a thread about a completely different product?",
  "  If yes, it is filler. It carries no information and it fails.",
  "  Copy built from filler scores BELOW 45 on composition and BELOW 50 on platform_fit, no matter how clean the grammar is.",
  "  These are all failures, and you must catch them: 'People often overlook the importance of...', 'Moreover, authenticity is paramount.', 'Elevate your special occasions.', 'In today's world...', 'Discover the power of...'.",
  "  A polished sentence that says nothing is WORSE than a rough one that says something. Score it accordingly. Do not be charitable to fluent emptiness.",
  "",
  "Rules you do not break:",
  "- Judge ONLY what you were given. Never invent facts about the artifact, the occasion, or the people in it.",
  "- If you cannot assess an axis from what you were given, score it 70 and say so in issues. Do not guess high, and do not punish the artifact for your own blind spot.",
  "- issues: concrete and specific. 'The date sits on a low-contrast lilac band and is hard to read' — not 'improve legibility'.",
  "- repairBrief: written TO the generator, as instructions it can act on directly. Name what to change and what to change it to. If everything passes, return an empty string.",
  "",
  "Respond with ONLY this JSON object. `citations` must contain one entry for EVERY axis you scored below 70, and nothing else:",
  '{"composition":0,"legibility":0,"style_fidelity":0,"grounding":0,"platform_fit":0,"issues":[],"citations":[{"axis":"grounding","quote":"<the exact text that is wrong>","why":"<why it fails that axis>"}],"repairBrief":""}',
].join("\n");

export interface ModelCritiqueDeps {
  /** A vision-capable chat model. Images are sent inline as base64 data URLs. */
  vision: VisionCapable;
  /** Resolves an image artifact to bytes so the critic can actually look at it. */
  imageBytes?: (artifact: CritiqueRequest["artifact"]) => Promise<Uint8Array | undefined>;
}

const VISUAL_FORMATS = new Set(["png", "svg"]);

/**
 * An axis you cannot see is an axis you cannot score.
 *
 * A budget in JSON has no palette, no type direction, and no material language — grading it
 * on style_fidelity against a cyanotype House Style is meaningless, and a critic left to its
 * own devices will happily score it 30 and fail an artifact that is perfectly correct.
 *
 * The published rubric already covers this ("if you cannot assess an axis, score it 70 and
 * say so — do not punish the artifact for your own blind spot"). This makes that instruction
 * impossible to ignore rather than merely advisory. The rubric itself is unchanged.
 */
function inapplicableAxes(format: string): string[] {
  if (VISUAL_FORMATS.has(format)) return [];
  // Text/data artifacts have structure and legibility, but no visual style to be faithful to.
  return ["style_fidelity"];
}

/**
 * EVERY OCCESTRA IMAGE IS AN ART PLATE. IT CARRIES NO LETTERING, BY DESIGN.
 *
 * Generated text inside an image is unreliable — misspelt names, invented dates, gibberish
 * where a word should be — so Occestra refuses to ship it, and every image generator is told
 * "no text, no lettering, no numerals anywhere in the image; the type is set separately." The
 * tool descriptions say so to the buyer in as many words.
 *
 * The critic did not know this, and it was quietly catastrophic. Measured across real runs,
 * `oce_design_invite` failed 50–100% of the time — because the critic graded the artwork as a
 * FINISHED invitation and, finding no names, no date and no city inside the image, scored
 * legibility 30 and platform_fit 30 every time. It was failing the artifact for obeying its
 * own brief. That is the exact shape of the `inapplicableAxes` bug, one layer up: an axis
 * measured against a surface the artifact was deliberately built without.
 *
 * So for an image artifact, the critic is told what the image IS — a plate, with the type set
 * separately — and told plainly not to deduct for the absence of copy. It still judges the
 * ART: composition, style fidelity, and whether the plate leaves room for the type it will
 * carry. It simply stops failing a wedding plate for not having "Mara & Sam" printed on it.
 */
function isArtPlate(format: string): boolean {
  return VISUAL_FORMATS.has(format);
}

export class ModelCritique implements CritiquePort {
  constructor(private readonly deps: ModelCritiqueDeps) {}

  async judge(request: CritiqueRequest): Promise<CritiqueResult> {
    const { artifact, contract, style } = request;

    const brief = [
      `ARTIFACT KIND: ${artifact.kind} (${artifact.format})`,
      `TITLE: ${artifact.title}`,
      artifact.spec?.size ? `SPECIFIED SIZE: ${artifact.spec.size}` : "",
      "",
      "THE BRIEF IT WAS MADE FOR:",
      JSON.stringify(contract, null, 2),
      "",
      style ? styleSystemPrompt(style) : "(no House Style declared)",
      "",
      artifact.data
        ? `THE ARTIFACT:\n${artifact.data.slice(0, 12_000)}`
        : "THE ARTIFACT IS THE IMAGE ATTACHED BELOW.",
    ]
      .filter(Boolean)
      .join("\n");

    const blind = inapplicableAxes(artifact.format);
    const augments: string[] = [];

    if (blind.length > 0) {
      augments.push(
        `THIS ARTIFACT IS ${artifact.format.toUpperCase()}, NOT AN IMAGE. It has no palette, no typography, and no material surface.`,
        `You therefore CANNOT assess: ${blind.join(", ")}. Score ${blind.join(" and ")} EXACTLY 70 and note in issues that the axis does not apply to a ${artifact.format} artifact. Do not invent a visual judgement about something you cannot see, and do not fail correct work for lacking a surface it was never meant to have.`,
        "Judge composition as the structure and hierarchy of the DOCUMENT, and legibility as whether a human can read and act on it.",
      );
    }

    if (isArtPlate(artifact.format)) {
      augments.push(
        "THIS IMAGE IS AN ART PLATE, AND IT CARRIES NO LETTERING ON PURPOSE.",
        "Occestra never renders text inside an image — names, dates, cities and copy are set separately in real type, because generated lettering is unreliable and we will not ship it. So this plate is SUPPOSED to have no words on it.",
        "DO NOT deduct on legibility or platform_fit for the absence of names, dates, a city, an occasion word, or any copy. An invitation plate with no 'Mara & Sam' printed on it is CORRECT, not broken — it is the artwork the type will sit beside, not a finished flyer.",
        "Legibility here means: is any text that IS present readable? There is none, so legibility is not applicable — score it EXACTLY 70 and say so. Judge the rest as ART: composition (is there a clear focal element, deliberate ordering, room left for type), style_fidelity (is it unmistakably the House Style), platform_fit (is it the right size, shape and register to be the plate for this occasion). Fail those honestly. Just do not fail the plate for obeying its brief.",
      );
    }

    const system = augments.length === 0 ? SYSTEM : [SYSTEM, "", ...augments].join("\n");

    const content: ChatContent[] = [{ type: "text", text: brief }];

    const bytes = await this.deps.imageBytes?.(artifact);
    if (bytes) {
      const b64 = Buffer.from(bytes).toString("base64");
      content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } });
    }

    let model = "unknown";

    const scores = await strictJson({
      schema: CritiqueSchema,
      complete: async (repairNote) => {
        const turn: ChatContent[] = repairNote
          ? [...content, { type: "text", text: repairNote }]
          : content;

        const result = await this.deps.vision.completeWithContent(
          {
            role: "critic",
            system,
            json: true,
            maxTokens: 1100,
            // ZERO, DELIBERATELY. The generator is creative; the judge must not be. A standard
            // that scores the same artifact 62 on one run and 72 on the next is not a standard,
            // it is a mood — and a judge who re-runs oce_critique and gets PASS then FAIL will
            // never trust the grade again.
            temperature: 0,
          },
          turn,
        );
        model = result.model;
        return result.text;
      },
    });

    return {
      axes: {
        composition: scores.composition,
        legibility: scores.legibility,
        style_fidelity: scores.style_fidelity,
        grounding: scores.grounding,
        platform_fit: scores.platform_fit,
      },
      issues: scores.issues,
      ...(scores.citations ? { citations: scores.citations } : {}),
      repairBrief: scores.repairBrief,
      model,
    };
  }
}

/** Image generation wired to a House Style, so studios never hand-roll a style prompt. */
export function styledImagePrompt(subject: string, style: Parameters<typeof styleSystemPrompt>[0]): {
  prompt: string;
  negative: string;
} {
  return {
    prompt: `${styleSystemPrompt(style)}\n\nSUBJECT:\n${subject}`,
    negative: style.negativePrompt,
  };
}

export type { ImageModelPort };
