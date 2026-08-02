/**
 * The critic. This is the model half of the Tribunal — the deterministic half already ran
 * and cannot be argued with. The critic's job is the part arithmetic can't reach: is the
 * composition any good, does it look like the House Style it claims, does the copy fit.
 *
 * The prompt is tight on purpose. A critic that waffles is a critic that passes slop.
 */
import { z } from "zod";
import type {
  CritiqueAxis,
  CritiqueProfile,
  CritiquePort,
  CritiqueRequest,
  CritiqueResult,
  ImageModelPort,
} from "@occestra/studio-core";
import type { ChatContent, VisionCapable } from "./router.js";
import { strictJson } from "./json.js";
import { styleSystemPrompt } from "./styles.js";

/**
 * The critic's schema is BUILT FROM THE PROFILE it is handed — one numeric key per axis the
 * profile actually scores, and a citation enum restricted to those axes. A visual artifact and
 * a budget are never asked the same questions, and the schema makes an off-profile answer
 * impossible rather than merely discouraged.
 */
function buildSchema(profile: CritiqueProfile) {
  const axisIds = profile.axes.map((axis) => axis.id) as [CritiqueAxis, ...CritiqueAxis[]];
  const scores = Object.fromEntries(
    profile.axes.map((axis) => [axis.id, z.number().min(0).max(100)]),
  ) as Record<string, z.ZodNumber>;

  return z.object({
    ...scores,
    // BE GENEROUS ABOUT LENGTH, STRICT ABOUT MEANING.
    //
    // These were hard caps, and a critic that ran twenty words over on ONE sentence had its
    // entire critique rejected — `citations.1.why: String must contain at most 400
    // character(s)` — which surfaces as CRITIQUE_UNAVAILABLE and leaves the artifact graded on
    // deterministic checks alone, every craft axis unscored. A real paid pack came back at 40%
    // that way. Losing a whole judgement over a long sentence is a disproportion, so an
    // over-long field is trimmed and an over-long list is capped, rather than thrown away.
    // Nothing about the VERDICT is softened: the axis scores, the enum and the citation
    // requirement are all still enforced exactly as before.
    issues: z.array(z.string()).max(40).transform((list) => list.slice(0, 12)),
    // One per axis scored below its floor, quoting the exact defect. The engine DISCARDS an
    // uncited correctness failure and restores it to the floor, so a critic that cannot quote
    // the problem cannot fail the artifact for it.
    citations: z
      .array(
        z.object({
          axis: z.enum(axisIds),
          quote: z.string().min(1).max(4000).transform((value) => value.slice(0, 400)),
          why: z.string().min(1).max(4000).transform((value) => value.slice(0, 400)),
        }),
      )
      .max(40)
      .transform((list) => list.slice(0, 10))
      .default([]),
    repairBrief: z.string(),
  });
}

const PREAMBLE = [
  "You are the Tribunal critic for Occestra, an occasion studio. You grade a single artifact against a published standard. You are not the artist and you are not the client — you are the person who says whether this is good enough to send.",
  "",
  "YOU ARE A MEASURING INSTRUMENT, NOT A TASTE. Two runs of you over the same artifact must",
  "reach the same verdict. Do not re-decide the standard each time you read it: the anchors are",
  "below, and your job is to MATCH THE ARTIFACT AGAINST THEM, not to form an impression.",
  "",
  "THE FLOOR IS 70 AND IT IS A BAR, NOT A MOOD. Anything at or above 70 passes. Do not shade a",
  "68 or a 72 to express an opinion — if you cannot name the specific defect that puts it under",
  "the bar, it is not under the bar.",
  "",
  "CITATIONS ARE MANDATORY FOR EVERY CORRECTNESS AXIS YOU SCORE BELOW 70. Add an entry to",
  "`citations` quoting the EXACT text or element that is wrong and why it fails that axis. A",
  "correctness failure you cannot quote is DISCARDED — the score is restored to the floor and",
  "your judgement ignored. Quote, or do not fail it. (Craft axes may fail on judgement.)",
  "",
  "Rules you do not break:",
  "- Judge ONLY what you were given. Never invent facts about the artifact, the occasion, or the people in it.",
  "- If you genuinely cannot assess an axis from what you were given, score it 70 and say so in issues. Do not guess high, and do not punish the artifact for your own blind spot.",
  "- issues: concrete and specific. 'The date sits on a low-contrast lilac band and is hard to read' — not 'improve legibility'.",
  "- repairBrief: written TO the generator, as instructions it can act on directly. Name what to change and what to change it to. If everything passes, return an empty string.",
].join("\n");

/**
 * The system prompt for ONE profile: the invariant preamble, then this profile's axis anchors
 * verbatim from the published standard (axis.guidance), then the exact JSON shape to return.
 * The buyer reads the same anchors at /standard that the model reads here.
 */
function buildSystem(profile: CritiqueProfile): string {
  const anchors = profile.axes
    .map((axis) => {
      const kind = axis.class === "correctness" ? "CORRECTNESS" : "craft";
      return `  ${axis.id} (${kind}) — ${axis.description}\n    ${axis.guidance ?? ""}`.trimEnd();
    })
    .join("\n\n");

  const example = {
    ...Object.fromEntries(profile.axes.map((axis) => [axis.id, 0])),
    issues: [],
    citations: [
      {
        axis: profile.axes.find((a) => a.class === "correctness")?.id ?? profile.axes[0]!.id,
        quote: "<the exact text or element that is wrong>",
        why: "<why it fails that axis>",
      },
    ],
    repairBrief: "",
  };

  return [
    PREAMBLE,
    "",
    `YOU ARE GRADING A "${profile.id.toUpperCase()}" ARTIFACT. Score ONLY these axes, each 0–100. Pick the band the artifact actually sits in; do not interpolate a feeling.`,
    "",
    anchors,
    "",
    "Respond with ONLY this JSON object. `citations` must contain one entry for EVERY correctness axis you scored below 70, and nothing else:",
    JSON.stringify(example),
  ].join("\n");
}

export interface ModelCritiqueDeps {
  /** A vision-capable chat model. Images are sent inline as base64 data URLs. */
  vision: VisionCapable;
  /** Resolves an image artifact to bytes so the critic can actually look at it. */
  imageBytes?: (artifact: CritiqueRequest["artifact"]) => Promise<Uint8Array | undefined>;
}

export class ModelCritique implements CritiquePort {
  constructor(private readonly deps: ModelCritiqueDeps) {}

  async judge(request: CritiqueRequest): Promise<CritiqueResult> {
    const { artifact, contract, style, profile } = request;

    // The sources the artifact actually carries. Without this the critic scores source_coverage
    // and factual_support against what it can see INLINE — and flags a venue's coordinates or a
    // price as "unsourced" when the source is attached to the artifact, just not printed in the
    // body. The deterministic SOURCE_MISSING check already reads these; the critic must too.
    const sourcesBlock =
      artifact.sources && artifact.sources.length > 0
        ? [
            "",
            "SOURCES ATTACHED TO THIS ARTIFACT (these back its grounded claims — do NOT call a claim unsourced if it is covered here):",
            ...artifact.sources.map(
              (s) => `- ${s.source}${s.retrievedAt ? ` @ ${s.retrievedAt}` : ""}${s.url ? ` (${s.url})` : ""}`,
            ),
          ].join("\n")
        : "";

    const brief = [
      `ARTIFACT KIND: ${artifact.kind} (${artifact.format})`,
      `TITLE: ${artifact.title}`,
      artifact.spec?.size ? `SPECIFIED SIZE: ${artifact.spec.size}` : "",
      "",
      "THE BRIEF IT WAS MADE FOR:",
      JSON.stringify(contract, null, 2),
      sourcesBlock,
      "",
      style ? styleSystemPrompt(style) : "(no House Style declared)",
      "",
      artifact.data
        ? `THE ARTIFACT:\n${artifact.data.slice(0, 12_000)}`
        : "THE ARTIFACT IS THE IMAGE ATTACHED BELOW.",
    ]
      .filter(Boolean)
      .join("\n");

    const schema = buildSchema(profile);
    const system = buildSystem(profile);

    const content: ChatContent[] = [{ type: "text", text: brief }];

    const bytes = await this.deps.imageBytes?.(artifact);
    if (bytes) {
      const b64 = Buffer.from(bytes).toString("base64");
      content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } });
    }

    let model = "unknown";

    const scores = (await strictJson({
      schema,
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
    })) as Record<string, unknown>;

    // Pull out exactly the profile's axes — nothing more, nothing less.
    const axes: Partial<Record<CritiqueAxis, number>> = {};
    for (const axis of profile.axes) {
      const value = scores[axis.id];
      if (typeof value === "number") axes[axis.id] = value;
    }

    const citations = scores["citations"] as CritiqueResult["citations"];

    return {
      axes,
      issues: (scores["issues"] as string[]) ?? [],
      ...(citations && citations.length > 0 ? { citations } : {}),
      repairBrief: (scores["repairBrief"] as string) ?? "",
      model,
      profileId: profile.id,
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
