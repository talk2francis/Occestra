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
import type { ChatCompletionsText, ChatContent } from "./router.js";
import { strictJson } from "./json.js";
import { styleSystemPrompt } from "./styles.js";

const CritiqueSchema = z.object({
  composition: z.number().min(0).max(100),
  legibility: z.number().min(0).max(100),
  style_fidelity: z.number().min(0).max(100),
  grounding: z.number().min(0).max(100),
  platform_fit: z.number().min(0).max(100),
  issues: z.array(z.string()).max(12),
  repairBrief: z.string(),
});

const SYSTEM = [
  "You are the Tribunal critic for Occestra, an occasion studio. You grade a single artifact against a published standard. You are not the artist and you are not the client — you are the person who says whether this is good enough to send.",
  "",
  "Score each axis 0-100. 70 is the passing floor, and it means 'a discerning person would be happy to receive this', not 'no obvious errors'.",
  "  composition   — deliberate structure and hierarchy, a real focal point, breathing room. A centred blob or an undifferentiated wall of text is below 50.",
  "  legibility    — every word readable at its intended size on its intended surface.",
  "  style_fidelity— faithful to the House Style's palette, type direction, material and texture language. Generic AI-default rendering is below 40 no matter how pretty.",
  "  grounding     — factual claims are sourced and honest. Invented specifics, or confidence the evidence does not support, is below 40.",
  "  platform_fit  — correct dimensions, length, and tone for where this will actually live.",
  "",
  "Rules you do not break:",
  "- Judge ONLY what you were given. Never invent facts about the artifact, the occasion, or the people in it.",
  "- If you cannot assess an axis from what you were given, score it 70 and say so in issues. Do not guess high, and do not punish the artifact for your own blind spot.",
  "- issues: concrete and specific. 'The date sits on a low-contrast lilac band and is hard to read' — not 'improve legibility'.",
  "- repairBrief: written TO the generator, as instructions it can act on directly. Name what to change and what to change it to. If everything passes, return an empty string.",
  "",
  "Respond with ONLY this JSON object:",
  '{"composition":0,"legibility":0,"style_fidelity":0,"grounding":0,"platform_fit":0,"issues":[],"repairBrief":""}',
].join("\n");

export interface ModelCritiqueDeps {
  /** A vision-capable chat model. Images are sent inline as base64 data URLs. */
  vision: ChatCompletionsText;
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
    const system =
      blind.length === 0
        ? SYSTEM
        : [
            SYSTEM,
            "",
            `THIS ARTIFACT IS ${artifact.format.toUpperCase()}, NOT AN IMAGE. It has no palette, no typography, and no material surface.`,
            `You therefore CANNOT assess: ${blind.join(", ")}. Score ${blind.join(" and ")} EXACTLY 70 and note in issues that the axis does not apply to a ${artifact.format} artifact. Do not invent a visual judgement about something you cannot see, and do not fail correct work for lacking a surface it was never meant to have.`,
            "Judge composition as the structure and hierarchy of the DOCUMENT, and legibility as whether a human can read and act on it.",
          ].join("\n");

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
            maxTokens: 900,
            temperature: 0.2,
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
