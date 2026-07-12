/**
 * Looking at someone's private photograph.
 *
 * This is the most sensitive call Occestra makes, so the prompt is written like a contract
 * rather than a request. It counts people. It does not identify them, and it is told so four
 * different ways, because a model asked to "describe this photo of my family" will cheerfully
 * volunteer ages, relationships, moods, and ethnicities — none of which it knows, all of
 * which would end up in someone's keepsake as if they were facts.
 */
import { z } from "zod";
import type { MediaDescription, SourceTag, StoragePort, VisionPort } from "@occestra/studio-core";
import type { ChatCompletionsText, ChatContent } from "./router.js";
import { strictJson } from "./json.js";

const DescriptionSchema = z.object({
  summary: z.string().min(5).max(500),
  objects: z.array(z.string().min(1).max(60)).max(15),
  setting: z.string().min(2).max(200),
  peopleCount: z.number().int().min(0).max(500),
  timeOfDay: z.string().max(40).optional(),
  uncertainties: z.array(z.string().min(3).max(200)).max(6),
});

const SYSTEM = [
  "You are describing a photograph that belongs to someone. It is private. It was given to you so that a keepsake can be made of a moment they care about.",
  "",
  "You describe WHAT IS IN THE FRAME. Nothing else.",
  "",
  "ABSOLUTE, NON-NEGOTIABLE RULES:",
  "1. You do NOT identify anyone. Not by name, not by fame, not by resemblance. You have never seen these people before and you never will again.",
  "2. You COUNT people. `peopleCount` is a number and nothing more. If two people are at a table, that is 2 — not 'a couple', not 'a mother and daughter', not 'friends'.",
  "3. You do NOT state anyone's age, gender, ethnicity, or relationship to anyone else. You cannot know these things from a photograph, and guessing them puts a stranger's assumption into someone's memory forever.",
  "4. You do NOT interpret feelings as fact. Not 'a joyful family'. If a mood is genuinely visible, it belongs in `uncertainties` as something you THINK you see, not in `summary` as something that is.",
  "",
  "What you SHOULD do, and do well:",
  "- summary: the scene, plainly. 'A long table outdoors at dusk, set for a meal. Candles are lit. Plates are used.'",
  "- objects: the things actually visible. Be specific and concrete — these are what a keepsake is made from.",
  "- setting: where this appears to be, as far as the frame shows. 'An outdoor terrace, stone floor, vines overhead.'",
  "- uncertainties: what you genuinely cannot make out. This field is valuable. Use it.",
  "",
  "If the image is too dark, too blurred, or too ambiguous to describe: say that in `uncertainties` and keep `summary` short and honest. An honest 'I cannot see much here' is worth more than a confident invention.",
  "",
  'Respond with ONLY this JSON: {"summary":"","objects":[],"setting":"","peopleCount":0,"timeOfDay":"","uncertainties":[]}',
].join("\n");

export interface VisionDescriberDeps {
  vision: ChatCompletionsText;
  storage: StoragePort;
  now?: () => number;
}

export class VisionDescriber implements VisionPort {
  constructor(private readonly deps: VisionDescriberDeps) {}

  async describe(key: string): Promise<MediaDescription> {
    const object = await this.deps.storage.get(key);
    if (!object) throw new Error(`upload ${key} is not in storage`);

    const b64 = Buffer.from(object.bytes).toString("base64");

    const content: ChatContent[] = [
      {
        type: "text",
        text: "Describe this photograph under the rules you were given. Count people; identify no one.",
      },
      { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
    ];

    let model = "unknown";

    const described = await strictJson({
      schema: DescriptionSchema,
      complete: async (repairNote) => {
        const turn: ChatContent[] = repairNote
          ? [...content, { type: "text", text: repairNote }]
          : content;

        const result = await this.deps.vision.completeWithContent(
          { role: "archivist", system: SYSTEM, json: true, maxTokens: 700, temperature: 0.2 },
          turn,
        );
        model = result.model;
        return result.text;
      },
    });

    const source: SourceTag = {
      source: "occestra_vision",
      retrievedAt: new Date((this.deps.now ?? Date.now)()).toISOString(),
    };

    // A last, mechanical backstop. If the model volunteered an identification anyway, it does
    // not reach the pack — a prompt is a request, and this is not a thing we merely request.
    const scrubbed = scrubIdentification(described.summary);

    return {
      summary: scrubbed,
      objects: described.objects,
      setting: described.setting,
      peopleCount: described.peopleCount,
      ...(described.timeOfDay ? { timeOfDay: described.timeOfDay } : {}),
      uncertainties: [
        ...described.uncertainties,
        ...(scrubbed !== described.summary
          ? ["The description was edited: it named or characterised a person, which Occestra does not do."]
          : []),
        `Model: ${model}. No one in this photograph has been identified, and no face was matched against anything.`,
      ],
      source,
    };
  }
}

/**
 * Strip identification if a model volunteers it despite being told four times not to.
 *
 * This is deliberately blunt. A keepsake that says "two people at a table" is correct. One
 * that says "a mother and her daughter" is a guess about a stranger's family, printed as
 * fact, in something they intend to keep forever.
 */
export function scrubIdentification(text: string): string {
  const relationships =
    /\b(?:mother|father|mum|mom|dad|daughter|son|sister|brother|grandmother|grandfather|grandma|grandpa|wife|husband|girlfriend|boyfriend|couple|siblings|parents|family members)\b/gi;

  const demographics =
    /\b(?:a|an|the)\s+(?:young|old|elderly|middle-aged|teenage|adult)\s+(?:man|woman|boy|girl|person|lady|gentleman)\b/gi;

  return text
    .replace(relationships, "a person")
    .replace(demographics, "a person")
    // Collapse the awkward repetitions the substitution can create.
    .replace(/\ba person and a person\b/gi, "two people")
    .replace(/(\ba person\b[,\s]+){2,}/gi, "several people ");
}
