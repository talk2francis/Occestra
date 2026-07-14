/**
 * The REMEMBER studio. Privacy is the feature, not the disclaimer.
 *
 * Three rules are enforced in CODE here, not in a prompt and not in a policy page:
 *
 *  1. NOBODY IS IDENTIFIED. The vision pass counts people. It does not name them, recognise
 *     them, guess their relationships, or infer their age or ethnicity. If a name appears in
 *     the owner's own notes we may use it as THEIR words — but we never attach a name to a
 *     face, because we do not know and we will not pretend to.
 *  2. FACTS AND PROSE ARE SEPARATED, VISIBLY. The story page has a "What we can see" section
 *     (drawn only from the media and the owner's notes, each line traceable) and a "The story"
 *     section (written prose, labelled as such). A reader can always tell which is which.
 *  3. NOTHING PERSONAL GOES ON CHAIN. Only the manifest hash is ever anchored. That is
 *     enforced upstream by the manifest, and stated here so nobody undoes it by accident.
 */
import { z } from "zod";
import { PolicyGate, screenText } from "../policy.js";
import { newKeepsakeId } from "../ids.js";
import {
  type Artifact,
  type ArtifactKind,
  type ClockPort,
  type GradePort,
  type HouseStyle,
  type HouseStyleId,
  type ImageModelPort,
  type MediaDescription,
  type Pack,
  type RememberContract,
  type SourceTag,
  type StoragePort,
  type TextModelPort,
  type VisionPort,
} from "../types.js";
import { PolicyRefusal } from "./celebrate.js";
import {
  classifyImageFailure,
  ensureStored,
  imageQualityFor,
  isUndelivered,
  qualityOf,
  undeliveredArtifact,
} from "./delivery.js";

export interface RememberDeps {
  text: TextModelPort;
  image: ImageModelPort;
  storage: StoragePort;
  clock: ClockPort;
  vision?: VisionPort;
  grader?: GradePort;
  styleFor?: (id: HouseStyleId) => HouseStyle;
  /** Raw provider errors go here — never into a pack. See delivery.ts. */
  log?: ((message: string, detail?: unknown) => void) | undefined;
}

/* ---------------------------------------------------------------- story graph */

export const StoryGraphSchema = z.object({
  momentDate: z.string().max(40).optional(),
  chapters: z
    .array(
      z.object({
        title: z.string().min(2).max(80),
        /** ONLY what the media and the owner's notes establish. No interpretation. */
        whatHappened: z.string().min(5).max(600),
        /** Which uploads this chapter draws on, so every claim is traceable. */
        fromMedia: z.array(z.string()).default([]),
      }),
    )
    .min(1)
    .max(6),
  themes: z.array(z.string().min(2).max(60)).min(1).max(5),
  /** What we do NOT know. The owner corrects these; we never fill them in ourselves. */
  uncertainties: z.array(z.string().min(3).max(200)).default([]),
});

export type StoryGraph = z.infer<typeof StoryGraphSchema>;

const GRAPH_SYSTEM = [
  "You assemble a Story Graph from evidence about a remembered moment. You are an archivist, not a novelist.",
  "",
  "THE RULE THAT MATTERS MOST:",
  "You may state ONLY what the evidence establishes. The evidence is: factual descriptions of the owner's photographs (what is in the frame), and the owner's own written notes.",
  "",
  "- NEVER identify anyone. You do not know who is in a photograph. You may say 'two people at a table'. You may NOT say who they are, how they are related, how old they are, or what they were feeling — unless the OWNER'S OWN NOTES say so, in which case it is the owner's claim and not yours.",
  "- NEVER invent a detail to make the story better. A missing detail belongs in `uncertainties`, where the owner can correct it.",
  "- `whatHappened` is FACTS ONLY, drawn from the frame and the notes. Interpretation, feeling, and meaning do not belong here. They come later, in prose that is clearly labelled as prose.",
  "- `uncertainties` is the most valuable field you produce. Be honest and specific: 'The notes do not say where this was.' 'It is not clear from the photographs whether this was the same day.'",
  "",
  "Return EXACTLY this shape. The angle brackets are placeholders; never echo their words:",
  JSON.stringify(
    {
      momentDate: "<the date, IF the evidence gives one — otherwise omit this field entirely>",
      chapters: [
        {
          title: "<a plain title for this part of the moment>",
          whatHappened: "<only what the frame and the notes establish>",
          fromMedia: ["<the upload id this draws on>"],
        },
      ],
      themes: ["<what this moment is about, in a word or two>"],
      uncertainties: ["<what the evidence does NOT tell us>"],
    },
    null,
    2,
  ),
].join("\n");

/* ------------------------------------------------------------------- policy */

/**
 * The REMEMBER-specific hard lines, checked before any money is spent.
 *
 * The general PolicyGate already blocks sexual/romantic framing of minors, hate, and
 * third-party IP. These are the ones specific to reconstructing a memory of real people.
 */
const IDENTIFY_PATTERNS: Array<{ re: RegExp; why: string }> = [
  {
    re: /\b(?:who is|identify|recognise|recognize|name)\s+(?:the|this|that|each)?\s*(?:person|people|man|woman|face|faces|guy|girl)\b/i,
    why: "Occestra does not identify people in photographs, and will not try.",
  },
  {
    re: /\bface\s*(?:recognition|match|matching|detection|id)\b/i,
    why: "Occestra does not run face recognition on your photographs.",
  },
  {
    re: /\b(?:recreate|reconstruct|generate|make)\s+(?:a\s+)?(?:photo|image|picture|portrait)\s+of\s+(?:my|the)?\s*(?:dead|deceased|late)\b/i,
    why: "Occestra will not generate a likeness of someone who has died. A keepsake of them, gladly — a synthetic photograph of them, never.",
  },
];

export function screenRememberBrief(contract: RememberContract): {
  allowed: boolean;
  message?: string;
} {
  const general = PolicyGate.screenBrief(contract);
  if (!general.allowed) return { allowed: false, message: PolicyGate.message(general) };

  const text = [contract.title, contract.tone, contract.notes ?? ""].join("\n");

  for (const { re, why } of IDENTIFY_PATTERNS) {
    if (re.test(text)) {
      return {
        allowed: false,
        message: `${why} Tell us what the moment MEANT to you, and we will make something worth keeping.`,
      };
    }
  }

  return { allowed: true };
}

/** A memorial changes the register. It is not a failure mode; it is a different job. */
const MEMORIAL_HINTS =
  /\b(?:passed away|died|death|funeral|memorial|in memory of|rest in peace|we lost|anniversary of (?:his|her|their) death|grave)\b/i;

export function isMemorial(contract: RememberContract): boolean {
  return MEMORIAL_HINTS.test(`${contract.title} ${contract.tone} ${contract.notes ?? ""}`);
}

/* ---------------------------------------------------------------- pipeline */

const artifactOf = (
  over: Partial<Artifact> & Pick<Artifact, "id" | "kind" | "title" | "format">,
): Artifact => ({ sources: [], version: 1, ...over });

async function askJson<T>(
  deps: RememberDeps,
  args: {
    system: string;
    prompt: string;
    schema: z.ZodType<T, z.ZodTypeDef, unknown>;
    maxTokens?: number;
    temperature?: number;
  },
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  const call = async (repair?: string): Promise<string> =>
    (
      await deps.text.complete({
        role: "archivist",
        system: args.system,
        prompt: repair ? `${args.prompt}\n\n${repair}` : args.prompt,
        json: true,
        maxTokens: args.maxTokens ?? 1200,
        temperature: args.temperature ?? 0.4,
      })
    ).text;

  const parse = (text: string): { ok: true; value: T } | { ok: false; error: string } => {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
    const body = (fenced ?? text).trim();
    const start = body.search(/[[{]/);
    const close = body[start] === "[" ? "]" : "}";
    const end = body.lastIndexOf(close);
    const candidate = start >= 0 && end > start ? body.slice(start, end + 1) : body;

    try {
      const parsed = args.schema.safeParse(JSON.parse(candidate));
      if (parsed.success) return { ok: true, value: parsed.data };
      return {
        ok: false,
        error: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  try {
    const first = parse(await call());
    if (first.ok) return first;
    const second = parse(
      await call(`Your previous reply failed validation: ${first.error}\n\nReply with ONLY corrected JSON.`),
    );
    return second.ok ? second : { ok: false, error: `after one repair: ${second.error}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface RememberResult {
  pack: Pack;
  graph: StoryGraph;
  /** What the vision pass actually saw. Surfaced so the owner can correct it. */
  media: MediaDescription[];
}

export interface RememberOptions {
  /**
   * The owner's corrected Story Graph. When present it is used AS GIVEN — we do not
   * "improve" it. The whole point of showing someone their own memory back is that they get
   * the final word on it.
   */
  confirmGraph?: StoryGraph;
}

export async function runRemember(
  contract: RememberContract,
  deps: RememberDeps,
  options: RememberOptions = {},
): Promise<RememberResult> {
  const verdict = screenRememberBrief(contract);
  if (!verdict.allowed) throw new PolicyRefusal(verdict.message!);

  const gaps: string[] = [];
  const sources: SourceTag[] = [];
  const wanted = new Set<ArtifactKind>(contract.deliverables);

  const styleId = contract.styleId;
  const style = deps.styleFor?.(styleId);
  const memorial = isMemorial(contract);

  /* --- 1. look at the media. FACTUALLY. --- */

  const media: MediaDescription[] = [];

  for (const ref of contract.mediaRefs.slice(0, 8)) {
    if (!deps.vision) {
      gaps.push("vision:no-provider — your photographs were NOT looked at; this keepsake is built from your words alone");
      break;
    }
    try {
      const description = await deps.vision.describe(ref);
      media.push(description);
      sources.push(description.source);
    } catch (error) {
      gaps.push(
        `vision:failed:${ref} — that upload could not be read (${error instanceof Error ? error.message : String(error)}); it is not part of this keepsake`,
      );
    }
  }

  /* --- 2. the Story Graph --- */

  const evidence = [
    `Title the owner gave this moment: ${contract.title}`,
    contract.momentDate ? `When they say it happened: ${contract.momentDate}` : "The owner did not give a date.",
    `The tone they asked for: ${contract.tone}`,
    "",
    contract.notes
      ? `THE OWNER'S OWN NOTES (their words — you may use what they say here, including any names THEY use):\n${contract.notes}`
      : "The owner wrote no notes.",
    "",
    media.length > 0
      ? [
          "WHAT IS ACTUALLY IN THEIR PHOTOGRAPHS (described factually; nobody has been identified):",
          ...media.map((m, i) => {
            const ref = contract.mediaRefs[i] ?? `upload_${i + 1}`;
            return [
              `- ${ref}: ${m.summary}`,
              `  setting: ${m.setting}`,
              `  people visible: ${m.peopleCount} (a count — no one has been identified, and no one will be)`,
              m.objects.length ? `  objects: ${m.objects.join(", ")}` : "",
              m.uncertainties.length ? `  could not make out: ${m.uncertainties.join("; ")}` : "",
            ]
              .filter(Boolean)
              .join("\n");
          }),
        ].join("\n")
      : "NO PHOTOGRAPHS WERE READ. Do not pretend to know what any image shows.",
  ].join("\n");

  let graph: StoryGraph;

  if (options.confirmGraph) {
    // The owner corrected it. Their version wins, untouched.
    graph = options.confirmGraph;
  } else {
    const built = await askJson(deps, {
      system: GRAPH_SYSTEM,
      schema: StoryGraphSchema,
      prompt: evidence,
      maxTokens: 1200,
    });

    if (built.ok) {
      graph = built.value;
    } else {
      gaps.push(`graph:degraded — ${built.error}; this keepsake uses a minimal graph built from your title alone`);
      graph = {
        chapters: [
          {
            title: contract.title,
            whatHappened: contract.notes ?? "The owner gave no notes.",
            fromMedia: [...contract.mediaRefs],
          },
        ],
        themes: [contract.tone],
        uncertainties: ["The story graph could not be assembled; almost nothing here is established."],
        ...(contract.momentDate ? { momentDate: contract.momentDate } : {}),
      };
    }
  }

  /* --- 3. artifacts --- */

  const keepsakeId = newKeepsakeId(deps.clock.now());
  const artifacts: Artifact[] = [];
  const regenerators = new Map<string, (brief: string, previous: Artifact) => Promise<Artifact>>();
  const repairSuffix = (brief: string): string =>
    `\n\nTHE TRIBUNAL REJECTED YOUR PREVIOUS ATTEMPT. Fix exactly this, then produce it again:\n${brief}`;

  /* --- keepsake art: the SCENE and the OBJECTS. Never a recognisable face. --- */

  if (wanted.has("keepsake_art") && style) {
    const artSubject = [
      `HOUSE STYLE: ${style.name} (v${style.version})`,
      style.promptSystem,
      `PALETTE (stay inside it): ${style.palette.join(", ")}`,
      `NEVER: ${style.negativePrompt}`,
      "",
      "SUBJECT — a keepsake artwork for a remembered moment.",
      `The moment, as the owner titled it: ${contract.title}`,
      `What it is about: ${graph.themes.join(", ")}`,
      media.length > 0
        ? `What was actually there: ${media.map((m) => `${m.setting}; ${m.objects.slice(0, 6).join(", ")}`).join(" / ")}`
        : contract.notes
          ? `In the owner's words: ${contract.notes.slice(0, 400)}`
          : "",
      "",
      "ABSOLUTE RULES FOR THIS IMAGE:",
      "- Render the PLACE, the LIGHT, and the OBJECTS of this memory.",
      "- NO recognisable human face. No portrait. If people appear at all they are distant, turned away, or suggested — a silhouette, a hand, a coat over a chair.",
      "- This is not a reconstruction of a photograph. It is an artwork ABOUT a memory.",
      "- No text, no lettering, no numerals anywhere in the image.",
      memorial
        ? "- This is a MEMORIAL. Restraint. Stillness. Nothing celebratory, nothing sentimental, nothing that performs grief. An empty chair says more than a crowd."
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const artKey = `keepsakes/${keepsakeId}.png`;
    const size = "1024x1024";

    try {
      const generated = await deps.image.generate({
        prompt: artSubject,
        negative: `${style.negativePrompt}, no faces, no portraits, no recognisable people`,
        size,
        quality: imageQualityFor("keepsake_art"),
      });
      await deps.storage.put(artKey, Buffer.from(generated.pngBase64, "base64"), "image/png");
      await ensureStored(deps.storage, artKey);

      regenerators.set("keepsake_art", async (brief, previous) => {
        const redone = await deps.image.generate({
          prompt: artSubject + repairSuffix(brief),
          negative: `${style.negativePrompt}, no faces, no portraits, no recognisable people`,
          size,
          quality: imageQualityFor("keepsake_art", { repair: true }),
        });
        await deps.storage.put(artKey, Buffer.from(redone.pngBase64, "base64"), "image/png");
        return { ...previous };
      });

      artifacts.push(
        artifactOf({
          id: "keepsake_art",
          kind: "keepsake_art",
          title: contract.title,
          format: "png",
          uri: artKey,
          styleId,
          sources,
          spec: { size },
        }),
      );
    } catch (error) {
      deps.log?.("keepsake_art failed", error);
      const undelivered = classifyImageFailure(error);
      artifacts.push(
        undeliveredArtifact(
          { id: "keepsake_art", kind: "keepsake_art", title: contract.title, format: "png" },
          undelivered,
        ),
      );
      gaps.push(`${undelivered.code} — ${undelivered.reason}`);
    }
  }

  /* --- the story page: facts and prose, VISIBLY separated --- */

  if (wanted.has("story_page")) {
    const written = await deps.text.complete({
      role: "writer",
      system: [
        "You write the prose that sits beside a keepsake. Short. Plain. Unsentimental.",
        "",
        "You will be given FACTS (what is in the photographs, and the owner's own notes). Your prose may be ABOUT those facts. It may not add to them.",
        "",
        "- Invent nothing. No names you were not given, no relationships, no feelings you were not told about, no weather, no dialogue.",
        "- Do not describe anyone's face, age, or appearance.",
        "- 140 words at most. If you have little to work with, write little. A short true paragraph beats a long invented one.",
        memorial
          ? "- This is a MEMORIAL. Do not comfort, do not console, do not say they live on. State what was, plainly. That is the only thing that helps."
          : "",
        "",
        "Return prose only. No headings, no markdown.",
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: [
        `Title: ${contract.title}`,
        `Tone asked for: ${contract.tone}`,
        "",
        "THE FACTS (all you may work from):",
        ...graph.chapters.map((c) => `- ${c.title}: ${c.whatHappened}`),
        "",
        graph.uncertainties.length ? `NOT KNOWN: ${graph.uncertainties.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      maxTokens: 400,
      temperature: 0.7,
    });

    // Re-screen the FINAL prose. A model can wander somewhere the brief did not.
    const proseVerdict = screenText(written.text);
    const prose = proseVerdict.allowed
      ? written.text.trim()
      : "_The written passage was withheld: it did not pass Occestra's content check._";

    if (!proseVerdict.allowed) {
      gaps.push(
        `story_page:prose-withheld — the generated prose tripped the PolicyGate (${proseVerdict.reasons
          .map((r) => r.code)
          .join(", ")}) and was NOT included`,
      );
    }

    const ground = style?.palette[4] ?? "#E8F1F7";
    const ink = style?.palette[0] ?? "#0B2C4D";
    const accent = style?.palette[1] ?? "#1E5F8C";

    const html = `<!doctype html>
<html lang="${contract.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, noimageindex">
<title>${escapeHtml(contract.title)}</title>
<style>
  :root { --ground:${ground}; --ink:${ink}; --accent:${accent}; }
  *{box-sizing:border-box}
  body{margin:0;background:var(--ground);color:var(--ink);font-family:ui-serif,Georgia,serif;line-height:1.6;padding:7vh 6vw}
  main{max-width:34rem;margin:0 auto}
  h1{font-weight:400;font-size:clamp(2rem,6vw,3rem);line-height:1.1;margin:0 0 .3rem}
  .date{color:var(--accent);font-family:ui-sans-serif,system-ui,sans-serif;font-size:.75rem;letter-spacing:.18em;text-transform:uppercase;margin:0 0 2.5rem}
  h2{font-family:ui-sans-serif,system-ui,sans-serif;font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin:2.5rem 0 .8rem;padding-top:1.2rem;border-top:1px solid rgba(0,0,0,.12)}
  .note{font-family:ui-sans-serif,system-ui,sans-serif;font-size:.78rem;opacity:.7;margin:.2rem 0 1rem}
  ul{padding-left:1.1rem;margin:0}
  li{margin:.4rem 0}
  .prose{font-size:1.05rem}
  .unknown li{opacity:.8}
  footer{margin-top:3rem;font-family:ui-sans-serif,system-ui,sans-serif;font-size:.75rem;opacity:.6}
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(contract.title)}</h1>
  <p class="date">${escapeHtml(graph.momentDate ?? contract.momentDate ?? "date not recorded")}</p>

  <h2>What we can see</h2>
  <p class="note">Drawn only from your photographs and your own notes. Nothing here is inferred, and no one in your photographs has been identified.</p>
  <ul>
${graph.chapters.map((c) => `    <li><strong>${escapeHtml(c.title)}.</strong> ${escapeHtml(c.whatHappened)}</li>`).join("\n")}
  </ul>

  <h2>The story</h2>
  <p class="note">This part is written. It is prose about the facts above — not more facts.</p>
  <div class="prose">${escapeHtml(prose)
    .split(/\n\n+/)
    .map((p) => `<p>${p}</p>`)
    .join("\n  ")}</div>

${
  graph.uncertainties.length > 0
    ? `  <h2>What we do not know</h2>
  <p class="note">We did not fill these in. Only you can.</p>
  <ul class="unknown">
${graph.uncertainties.map((u) => `    <li>${escapeHtml(u)}</li>`).join("\n")}
  </ul>
`
    : ""
}
  <footer>Made by Occestra. Your photographs are private, were never published, and are deletable at any time. Only a hash of this keepsake is ever recorded on chain — never the images, never the words.</footer>
</main>
</body>
</html>`;

    artifacts.push(
      artifactOf({
        id: "story_page",
        kind: "story_page",
        title: `${contract.title} — the story`,
        format: "html",
        data: html,
        sources,
        spec: {
          layers: [
            { role: "body", fg: ink, bg: ground, body: true },
            { role: "accent", fg: accent, bg: ground, body: false },
          ],
        },
      }),
    );
  }

  /* --- 4. the Tribunal --- */

  const graded: Artifact[] = [];
  let passed = 0;
  let repairs = 0;
  let gradedCount = 0;

  for (const artifact of artifacts) {
    // Absent, not failing: never graded, never counted, always visible.
    if (isUndelivered(artifact) || !deps.grader) {
      graded.push(artifact);
      continue;
    }

    const regenerate = regenerators.get(artifact.id);
    const result = await deps.grader.grade({
      artifact,
      contract,
      ...(styleId ? { styleId } : {}),
      ...(regenerate ? { regenerate } : {}),
    });

    graded.push(result.artifact);
    gradedCount += 1;
    if (result.pass) passed += 1;
    repairs += result.repairs;
    gaps.push(...result.coverageGaps);
  }

  if (!deps.grader) gaps.push("tribunal:not-wired — these artifacts were produced but NOT graded");

  const pack: Pack = {
    id: keepsakeId,
    contractId: contract.id,
    studio: "remember",
    artifacts: graded,
    coverageGaps: [...new Set(gaps)],
    quality: qualityOf({
      artifacts: graded,
      passed,
      graded: gradedCount,
      repairs,
      oqsVersion: "1.0.0",
      graderWired: Boolean(deps.grader),
    }),
    createdAt: new Date(deps.clock.now()).toISOString(),
  };

  return { pack, graph, media };
}
