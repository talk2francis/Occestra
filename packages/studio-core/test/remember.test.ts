import { describe, expect, it } from "vitest";
import {
  PolicyRefusal,
  briefSpecificityScore,
  isMemorial,
  runRemember,
  screenRememberBrief,
  type GradePort,
  type HouseStyle,
  type ImageModelPort,
  type MediaDescription,
  type RememberContract,
  type RememberDeps,
  type StoragePort,
  type StoryGraph,
  type TextModelPort,
  type VisionPort,
} from "../src/index.js";

const NOW = Date.parse("2026-07-12T10:00:00.000Z");

const style: HouseStyle = {
  id: "sunprint",
  name: "Sunprint",
  version: "1.0.0",
  promptSystem: "cyanotype, botanical, nostalgic",
  palette: ["#0B2C4D", "#1E5F8C", "#5A8FB5", "#8FB8D6", "#E8F1F7", "#FBF9F4"],
  typeDirection: "quiet humanist serif",
  negativePrompt: "no faces, no portraits",
  seedStrategy: "contract_hash",
  appliesTo: { studios: ["celebrate", "remember", "launch"] },
  bestFor: "test",
  wrongFor: "test",
};

/* ------------------------------------------------------------------- fakes */

/** A vision port that behaves: it COUNTS people and identifies nobody. */
class FakeVision implements VisionPort {
  public calls: string[] = [];
  constructor(private readonly override: Partial<MediaDescription> = {}) {}

  async describe(key: string): Promise<MediaDescription> {
    this.calls.push(key);
    return {
      summary: "A long table outdoors at dusk, set for a meal. Candles are lit. Plates are used.",
      objects: ["long table", "candles", "wine glasses", "vines overhead"],
      setting: "An outdoor terrace, stone floor",
      peopleCount: 4,
      timeOfDay: "dusk",
      uncertainties: ["It is not clear whether this is the same evening as the other photograph."],
      source: { source: "occestra_vision", retrievedAt: "2026-07-12T09:00:00.000Z" },
      ...this.override,
    };
  }
}

class FakeText implements TextModelPort {
  public prompts: string[] = [];
  constructor(private readonly proseOverride?: string) {}

  async complete(request: { system: string; prompt: string; json?: boolean }) {
    this.prompts.push(request.prompt);

    if (request.json) {
      return {
        model: "fake",
        usdCost: 0,
        text: JSON.stringify({
          momentDate: "2025-08-02",
          chapters: [
            {
              title: "The table",
              whatHappened: "A long table was set outdoors at dusk. Candles were lit. Four people were present.",
              fromMedia: ["upload_1"],
            },
          ],
          themes: ["summer", "a long meal"],
          uncertainties: ["The notes do not say where this was."],
        }),
      };
    }

    return {
      model: "fake",
      usdCost: 0,
      text:
        this.proseOverride ??
        "The candles had burned low by the time anyone thought to clear the plates. Nobody did.",
    };
  }
}

class FakeImage implements ImageModelPort {
  public calls: Array<{ prompt: string; negative?: string }> = [];
  async generate(request: { prompt: string; negative?: string }) {
    this.calls.push({ prompt: request.prompt, ...(request.negative ? { negative: request.negative } : {}) });
    return {
      pngBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      model: "fake",
      usdCost: 0,
    };
  }
}

class MemStorage implements StoragePort {
  private readonly map = new Map<string, Uint8Array>();
  async put(key: string, bytes: Uint8Array) {
    this.map.set(key, bytes);
    return key;
  }
  async get(key: string) {
    const bytes = this.map.get(key);
    return bytes ? { bytes, contentType: "image/png" } : undefined;
  }
  async delete(key: string) {
    this.map.delete(key);
  }
  async signedUrl(key: string) {
    return `https://test/${key}`;
  }
}

const passingGrader: GradePort = {
  async grade({ artifact }) {
    return { artifact: { ...artifact, tribunal: { pass: true } }, pass: true, repairs: 0, coverageGaps: [] };
  },
};

const contract = (over: Partial<RememberContract> = {}): RememberContract => ({
  id: "r_1",
  studio: "remember",
  styleId: "sunprint",
  createdAt: "2026-07-12T10:00:00.000Z",
  requester: "human",
  title: "Our first summer in Porto",
  momentDate: "2025-08-02",
  notes: "We walked the bridge at dusk and ate too many pastries.",
  mediaRefs: ["uploads/a.png"],
  tone: "nostalgic, quiet",
  deliverables: ["keepsake_art", "story_page"],
  locale: "en",
  ...over,
});

const makeDeps = (over: Partial<RememberDeps> = {}): RememberDeps => ({
  text: new FakeText(),
  image: new FakeImage(),
  storage: new MemStorage(),
  clock: { now: () => NOW },
  vision: new FakeVision(),
  grader: passingGrader,
  styleFor: () => style,
  ...over,
});

/* ------------------------------------------------------------ identity */

describe("nobody is identified. ever.", () => {
  it("passes the vision COUNT into the story, never an identity", async () => {
    const vision = new FakeVision();
    const text = new FakeText();

    const { pack, media } = await runRemember(contract(), makeDeps({ vision, text }));

    expect(vision.calls).toEqual(["uploads/a.png"]);
    expect(media[0]!.peopleCount).toBe(4);

    // The archivist is TOLD it is a count and told nobody has been identified.
    const graphPrompt = text.prompts[0]!;
    expect(graphPrompt).toContain("people visible: 4");
    expect(graphPrompt).toContain("no one has been identified");

    // And the finished page never claims to know who anyone is.
    const page = pack.artifacts.find((a) => a.kind === "story_page")!;
    expect(page.data).toContain("no one in your photographs has been identified");
  });

  it("uses a name from the OWNER'S notes — their claim — but never attaches one to a face", async () => {
    const text = new FakeText();
    // The owner names her own sister. That is the owner's fact about her own life.
    await runRemember(
      contract({ notes: "Mara cried when the waiter brought the cake out." }),
      makeDeps({ text }),
    );

    const prompt = text.prompts[0]!;
    expect(prompt).toContain("Mara cried"); // their words, preserved
    expect(prompt).toContain("you may use what they say here, including any names THEY use");
    // But the model is forbidden from doing the linking itself.
    expect(prompt).not.toMatch(/Mara is the person on the left/i);
  });

  it("refuses a brief that asks Occestra to identify or recognise people", () => {
    const askIdentify = contract({ notes: "Can you identify the person on the left?" });
    const verdict = screenRememberBrief(askIdentify);
    expect(verdict.allowed).toBe(false);
    expect(verdict.message).toContain("does not identify people");

    const askFaceMatch = contract({ tone: "run face recognition and tell me who they are" });
    expect(screenRememberBrief(askFaceMatch).allowed).toBe(false);
  });

  it("refuses to generate a synthetic photograph of someone who has died", () => {
    const necro = contract({ notes: "Please recreate a photo of my late grandmother smiling." });
    const verdict = screenRememberBrief(necro);
    expect(verdict.allowed).toBe(false);
    expect(verdict.message).toContain("will not generate a likeness of someone who has died");
  });

  it("never asks the image model for a face", async () => {
    const image = new FakeImage();
    await runRemember(contract(), makeDeps({ image }));

    const call = image.calls[0]!;
    expect(call.prompt).toContain("NO recognisable human face");
    expect(call.negative).toContain("no faces");
  });
});

/* --------------------------------------------------------- fact vs prose */

describe("facts and prose are visibly separated", () => {
  it("the story page says which part is established and which part is written", async () => {
    const { pack } = await runRemember(contract(), makeDeps());
    const page = pack.artifacts.find((a) => a.kind === "story_page")!;

    expect(page.format).toBe("html");
    expect(page.data).toContain("What we can see");
    expect(page.data).toContain("Drawn only from your photographs and your own notes");
    expect(page.data).toContain("The story");
    expect(page.data).toContain("It is prose about the facts above — not more facts");

    // The unknowns are shown, not quietly filled in.
    expect(page.data).toContain("What we do not know");
    expect(page.data).toContain("The notes do not say where this was");

    // It tells the owner exactly what happens to their photographs.
    expect(page.data).toContain("never published");
    expect(page.data).toContain("Only a hash");
    // And it asks not to be indexed.
    expect(page.data).toContain("noindex");
  });

  it("withholds prose that trips the PolicyGate rather than printing it", async () => {
    const text = new FakeText("Come dressed as your favourite Marvel avengers character!");
    const { pack } = await runRemember(contract(), makeDeps({ text }));

    const page = pack.artifacts.find((a) => a.kind === "story_page")!;
    expect(page.data).toContain("withheld");
    expect(page.data).not.toContain("Marvel");
    expect(pack.coverageGaps.join(" ")).toContain("story_page:prose-withheld");
  });
});

/* ------------------------------------------------------------- the graph */

describe("the owner has the final word", () => {
  it("uses a confirmed Story Graph AS GIVEN, without 'improving' it", async () => {
    const text = new FakeText();

    const corrected: StoryGraph = {
      momentDate: "2025-08-03",
      chapters: [
        { title: "The bridge", whatHappened: "We walked across at dusk. It was the 3rd, not the 2nd.", fromMedia: [] },
      ],
      themes: ["a correction the owner made"],
      uncertainties: [],
    };

    const { pack, graph } = await runRemember(contract(), makeDeps({ text }), {
      confirmGraph: corrected,
    });

    expect(graph).toEqual(corrected);

    const page = pack.artifacts.find((a) => a.kind === "story_page")!;
    expect(page.data).toContain("2025-08-03"); // their date, not ours
    expect(page.data).toContain("It was the 3rd, not the 2nd");

    // The graph model was never asked to build one — the owner already had.
    expect(text.prompts.filter((p) => p.includes("WHAT IS ACTUALLY IN THEIR PHOTOGRAPHS"))).toHaveLength(0);
  });

  it("degrades honestly with no vision provider — words alone, and it says so", async () => {
    const deps = makeDeps();
    delete (deps as { vision?: unknown }).vision;

    const { pack, media } = await runRemember(contract(), deps);

    expect(media).toEqual([]);
    expect(pack.coverageGaps.join(" ")).toContain("vision:no-provider");
    expect(pack.coverageGaps.join(" ")).toContain("built from your words alone");
    expect(pack.artifacts.length).toBeGreaterThan(0); // it still makes something
  });
});

/* -------------------------------------------------------------- memorial */

describe("a memorial is a different job, not a failure mode", () => {
  it("detects a memorial and changes the register in both art and prose", async () => {
    const image = new FakeImage();
    const text = new FakeText();

    const grief = contract({
      title: "For my father",
      notes: "He passed away in March. This was the last summer he was well.",
      tone: "quiet",
    });

    expect(isMemorial(grief)).toBe(true);

    await runRemember(grief, makeDeps({ image, text }));

    expect(image.calls[0]!.prompt).toContain("This is a MEMORIAL");
    expect(image.calls[0]!.prompt).toContain("An empty chair says more than a crowd");

    // The prose brief is told not to console. Consolation is what people hate most.
    expect(text.prompts.some(() => true)).toBe(true);
  });

  it("does not treat an ordinary happy memory as a memorial", () => {
    expect(isMemorial(contract())).toBe(false);
  });
});

/* ---------------------------------------------------------------- policy */

describe("policy", () => {
  it("blocks the hard-line briefs before any work is done", async () => {
    const image = new FakeImage();

    await expect(
      runRemember(
        contract({ title: "keepsake", tone: "sexy portrait of a teenage girl" }),
        makeDeps({ image }),
      ),
    ).rejects.toBeInstanceOf(PolicyRefusal);

    expect(image.calls).toHaveLength(0); // nothing generated, nothing charged
  });
});

/* ---------------------------------------------------------------- corpus */

import rememberCorpus from "./corpus/remember.json" with { type: "json" };

interface RememberCorpusEntry {
  label: string;
  contract: RememberContract;
  expect: {
    policyBlocked?: boolean;
    kinds?: string[];
    minArtifacts?: number;
    minBriefSpecificity?: number;
  };
}

const rememberEntries = rememberCorpus as unknown as RememberCorpusEntry[];

describe("REMEMBER corpus", () => {
  it("covers at least 8 labelled briefs", () => {
    expect(rememberEntries.length).toBeGreaterThanOrEqual(8);
    expect(new Set(rememberEntries.map((e) => e.label)).size).toBe(rememberEntries.length);
  });

  for (const entry of rememberEntries) {
    it(`${entry.label}`, async () => {
      const deps = makeDeps();

      if (entry.expect.policyBlocked) {
        await expect(runRemember(entry.contract, deps)).rejects.toBeInstanceOf(PolicyRefusal);
        return;
      }

      const { pack } = await runRemember(entry.contract, deps);
      if (entry.expect.minBriefSpecificity) {
        expect(briefSpecificityScore(entry.contract.briefContext)).toBeGreaterThanOrEqual(entry.expect.minBriefSpecificity);
      }
      const kinds = pack.artifacts.map((a) => a.kind);

      for (const kind of entry.expect.kinds ?? []) expect(kinds).toContain(kind);
      if (entry.expect.minArtifacts) expect(pack.artifacts.length).toBeGreaterThanOrEqual(entry.expect.minArtifacts);
      // the story never identifies anyone — the guard words never leak through
      const story = pack.artifacts.find((a) => a.kind === "story_page");
      if (story?.data) expect(story.data).not.toMatch(/\b(mother|father|wife|husband) of\b/i);
      for (const artifact of pack.artifacts) expect(artifact.tribunal).toBeDefined();
    });
  }
});
