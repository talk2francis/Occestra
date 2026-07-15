import { describe, expect, it } from "vitest";
import {
  BRAND_GENOME_VERSION,
  PolicyRefusal,
  PRICE_PLACEHOLDER,
  findFabrications,
  findPlaceholderMisuse,
  findSlop,
  harmonizePalette,
  inspectCopy,
  runLaunch,
  type GradePort,
  type HouseStyle,
  type ImageModelPort,
  type LaunchContract,
  type LaunchDeps,
  type MarketDataPort,
  type SiteInspection,
  type SitePort,
  type StoragePort,
  type TextModelPort,
} from "../src/index.js";

const NOW = Date.parse("2026-07-12T10:00:00.000Z");

const style: HouseStyle = {
  id: "amethyst_editorial",
  name: "Amethyst Editorial",
  version: "1.0.0",
  promptSystem: "editorial collage on warm ivory",
  palette: ["#FAF7F2", "#F1ECE4", "#17141A", "#2D1B4E", "#6B3FA0", "#8E8A94"],
  typeDirection: "editorial serif + precise grotesk",
  negativePrompt: "no gloss, no watermarks",
  seedStrategy: "contract_hash",
  appliesTo: { studios: ["celebrate", "remember", "launch"] },
  bestFor: "test",
  wrongFor: "test",
};

/* ------------------------------------------------------------------- fakes */

const inspection = (over: Partial<SiteInspection> = {}): SiteInspection => ({
  title: "Tidepool — a calm inbox",
  description: "Tidepool batches your notifications so you read them once a day.",
  palette: ["#0F3B57", "#F7F5F0", "#C9552E", "#111111"],
  fonts: ["Inter", "Söhne"],
  screenshots: ["site/tidepool/desktop.png"],
  og: { "og:title": "Tidepool" },
  source: { source: "playwright_site_inspection", retrievedAt: "2026-07-12T09:00:00.000Z", url: "https://tidepool.test" },
  ...over,
});

class FakeSite implements SitePort {
  public calls: string[] = [];
  constructor(private readonly result: SiteInspection | Error = inspection()) {}
  async inspect(url: string): Promise<SiteInspection> {
    this.calls.push(url);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeText implements TextModelPort {
  constructor(private readonly broken = false) {}
  async complete(request: { system: string; json?: boolean }) {
    if (this.broken) return { model: "fake", usdCost: 0, text: "no." };

    if (request.system.includes("brand genome")) {
      return {
        model: "fake",
        usdCost: 0,
        text: JSON.stringify({
          positioning: "Tidepool batches notifications so you read them once a day instead of all day.",
          audience: "People who work in focus blocks and resent being interrupted.",
          voice: "Plain, quiet, technical. No exclamation marks.",
          messages: ["Read them once.", "Nothing is lost, only delayed.", "It works with what you already use."],
          bannedCliches: ["revolutionary", "game-changing", "seamless", "unlock"],
        }),
      };
    }
    if (request.system.includes("launch threads")) {
      return {
        model: "fake",
        usdCost: 0,
        text: JSON.stringify({
          posts: [
            "You check your inbox 74 times a day. None of it was urgent.",
            "Tidepool holds your notifications and hands them over once.",
            "It does not delete anything. It just waits.",
            "Works with the tools you already have.",
            "Free while it is in beta.",
            "Try it: https://tidepool.test",
          ],
        }),
      };
    }
    if (request.system.includes("landing page")) {
      return {
        model: "fake",
        usdCost: 0,
        text: JSON.stringify({
          sections: [
            { name: "Hero", purpose: "Earn the next four seconds.", headline: "Read them once.", body: "Tidepool batches your notifications.", cta: "Try it" },
            { name: "Problem", purpose: "Name the pain.", headline: "74 interruptions", body: "None of them urgent.", cta: "" },
            { name: "How", purpose: "Show the mechanism.", headline: "It waits", body: "Nothing is lost, only delayed.", cta: "" },
            { name: "Price", purpose: "Say the number.", headline: "Free in beta", body: "Free while it is in beta. No card, no trial timer.", cta: "Start" },
          ],
        }),
      };
    }
    // demo beats
    return {
      model: "fake",
      usdCost: 0,
      text: JSON.stringify({
        beats: [
          { seconds: "0-8", beat: "cold open", onScreen: "A quiet inbox at 9am.", saying: "Nothing." },
          { seconds: "8-20", beat: "problem", onScreen: "Badges piling up.", saying: "This is a normal Tuesday." },
          { seconds: "20-55", beat: "live magic", onScreen: "One batch arriving.", saying: "Once a day." },
          { seconds: "55-70", beat: "trust", onScreen: "Nothing deleted.", saying: "It only waits." },
          { seconds: "70-90", beat: "cta", onScreen: "The URL.", saying: "Try it." },
        ],
      }),
    };
  }
}

class FakeImage implements ImageModelPort {
  public calls: Array<{ size: string; prompt: string }> = [];
  async generate(request: { size: string; prompt: string }) {
    this.calls.push({ size: request.size, prompt: request.prompt });
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

class FakeMarket implements MarketDataPort {
  async tokenInfo() {
    return {
      symbol: "OKB",
      name: "OKB",
      priceUsd: 48.2,
      chain: "196",
      address: "0x1e4a5963abfd975d8c9021ce480b42188849d41d",
      source: { source: "okx_onchain_os_market", retrievedAt: "2026-07-12T09:00:00.000Z" },
    };
  }
}

/** Records every artifact it grades, and can be told to fail one. */
function recordingGrader(fail: (kind: string) => boolean = () => false) {
  const seen: string[] = [];
  const port: GradePort = {
    async grade({ artifact }) {
      seen.push(artifact.kind);
      const passed = !fail(artifact.kind);
      return {
        artifact: { ...artifact, tribunal: { pass: passed } },
        pass: passed,
        repairs: 0,
        coverageGaps: passed ? [] : [`LINK_DEAD: ${artifact.kind}`],
      };
    },
  };
  return { port, seen };
}

const contract = (over: Partial<LaunchContract> = {}): LaunchContract => ({
  id: "l_1",
  studio: "launch",
  styleId: "amethyst_editorial",
  createdAt: "2026-07-12T10:00:00.000Z",
  requester: "agent",
  productName: "Tidepool",
  url: "https://tidepool.test",
  description: "A calm inbox for people who work in focus blocks.",
  audience: "indie makers",
  deliverables: ["brand_kit", "og_image", "brand_mark", "carousel", "launch_thread", "landing_spec", "demo_script"],
  locale: "en",
  ...over,
});

const makeDeps = (over: Partial<LaunchDeps> = {}): LaunchDeps => ({
  text: new FakeText(),
  image: new FakeImage(),
  storage: new MemStorage(),
  clock: { now: () => NOW },
  site: new FakeSite(),
  market: new FakeMarket(),
  grader: recordingGrader().port,
  styleFor: () => style,
  ...over,
});

/* --------------------------------------------------------- palette harmony */

describe("palette harmonization", () => {
  it("adopts the product's usable accents and keeps the House Style intact", () => {
    // #C9552E (terracotta) is far enough from the amethyst palette to be an accent, close
    // enough not to fight it. #F7F5F0 is effectively the ivory ground already.
    const result = harmonizePalette(["#0F3B57", "#F7F5F0", "#C9552E", "#111111"], style);

    // The House Style survives whole — PALETTE_DRIFT stays meaningful.
    for (const hex of style.palette) expect(result.palette).toContain(hex);

    expect(result.adopted.length).toBeGreaterThan(0);
    expect(result.adopted.length).toBeLessThanOrEqual(2);

    const ivory = result.rejected.find((r) => r.hex === "#F7F5F0");
    expect(ivory?.reason).toContain("already effectively in the House Style");

    const ink = result.rejected.find((r) => r.hex === "#111111");
    expect(ink?.reason).toContain("already effectively in the House Style"); // ~= #17141A
  });

  it("refuses a colour that would fight the style, and caps adoption at two", () => {
    const loud = harmonizePalette(["#00FF00", "#FF00FF", "#FF6600", "#0099FF", "#CC0000"], style);

    expect(loud.adopted.length).toBeLessThanOrEqual(2);
    expect(loud.rejected.length).toBeGreaterThan(0);
    expect(loud.rejected.some((r) => r.reason.includes("fight it") || r.reason.includes("at most two"))).toBe(true);

    // Even with a garish site, the output still looks like Occestra made it.
    for (const hex of style.palette) expect(loud.palette).toContain(hex);
  });

  it("rejects malformed colours instead of passing them to an image model", () => {
    const result = harmonizePalette(["rgb(1,2,3)", "#GGGGGG", ""], style);
    expect(result.adopted).toEqual([]);
    expect(result.rejected.every((r) => r.reason === "not a valid hex colour")).toBe(true);
  });

  it("with no extracted colours, the House Style is simply the palette", () => {
    const result = harmonizePalette([], style);
    expect(result.palette).toEqual(style.palette);
    expect(result.adopted).toEqual([]);
  });
});

/* ------------------------------------------------------------------ genome */

describe("brand genome", () => {
  it("is grounded in what the REAL page renders, and ships as a deliverable", async () => {
    const site = new FakeSite();
    const { pack, genome } = await runLaunch(contract(), makeDeps({ site }));

    expect(site.calls).toEqual(["https://tidepool.test"]); // it actually looked
    expect(genome.version).toBe(BRAND_GENOME_VERSION);
    expect(genome.palette.extracted).toEqual(["#0F3B57", "#F7F5F0", "#C9552E", "#111111"]);
    expect(genome.fonts).toEqual(["Inter", "Söhne"]);
    expect(genome.sources[0]!.source).toBe("playwright_site_inspection");
    expect(genome.messages).toHaveLength(3);
    expect(genome.bannedCliches).toContain("revolutionary");

    // The genome is in the pack, not hidden in internals.
    const kit = pack.artifacts.find((a) => a.kind === "brand_kit")!;
    expect(kit.data).toContain("## Positioning");
    expect(kit.data).toContain("Read from the live page");
    expect(kit.data).toContain(BRAND_GENOME_VERSION);
    // It shows its working: what it did NOT adopt, and why.
    expect(kit.data).toContain("Not adopted, and why");
  });

  it("degrades honestly with no URL — it never invents a brand and charges for it", async () => {
    const site = new FakeSite();
    const { pack, genome } = await runLaunch(
      contract({ url: undefined, deliverables: ["brand_kit"] }),
      makeDeps({ site }),
    );

    expect(site.calls).toEqual([]); // nothing to look at, so it did not pretend to look
    expect(pack.coverageGaps.join(" ")).toContain("site:not-provided");
    expect(genome.palette.extracted).toEqual([]);
    expect(genome.unknowns.join(" ")).toContain("No site was provided");

    const kit = pack.artifacts.find((a) => a.kind === "brand_kit")!;
    expect(kit.data).toContain("NOT grounded in a real page");
  });

  it("records a gap when the site is unreachable, rather than silently guessing", async () => {
    const { pack } = await runLaunch(
      contract({ deliverables: ["brand_kit"] }),
      makeDeps({ site: new FakeSite(new Error("net::ERR_CONNECTION_REFUSED")) }),
    );

    expect(pack.coverageGaps.join(" ")).toContain("site:inspection-failed");
    expect(pack.coverageGaps.join(" ")).toContain("ERR_CONNECTION_REFUSED");
  });

  it("enriches a token subject over the OKX rails, and tags the source", async () => {
    const { genome } = await runLaunch(
      contract({
        productName: "OKB",
        description: "the token at 0x1e4a5963abfd975d8c9021ce480b42188849d41d on X Layer",
        deliverables: ["brand_kit"],
      }),
      makeDeps(),
    );

    expect(genome.sources.some((s) => s.source === "okx_onchain_os_market")).toBe(true);
  });
});

/* --------------------------------------------------------------- artifacts */

describe("the kit", () => {
  it("produces every deliverable at the right size, and grades all of them", async () => {
    const image = new FakeImage();
    const { port, seen } = recordingGrader();

    const { pack } = await runLaunch(contract(), makeDeps({ image, grader: port }));

    const kinds = pack.artifacts.map((a) => a.kind);
    expect(kinds).toContain("brand_kit");
    expect(kinds).toContain("og_image");
    expect(kinds).toContain("brand_mark");
    expect(kinds.filter((k) => k === "carousel")).toHaveLength(2);
    expect(kinds).toContain("launch_thread");
    expect(kinds).toContain("landing_spec");
    expect(kinds).toContain("demo_script");

    // The hero is OG-shaped; the mark is square and must read at 32px.
    const hero = pack.artifacts.find((a) => a.kind === "og_image")!;
    expect(hero.spec?.size).toBe("1536x1024");
    const mark = pack.artifacts.find((a) => a.kind === "brand_mark")!;
    expect(mark.spec?.size).toBe("1024x1024");

    // Every single artifact went through the Tribunal.
    expect(seen.length).toBe(pack.artifacts.length);
    expect(pack.quality.passRate).toBe(1);

    // No image prompt ever asks for lettering or a fake screenshot.
    for (const call of image.calls) {
      expect(call.prompt).toContain("No text, no lettering");
    }
  });

  it("keeps every thread post inside the platform limit", async () => {
    const { pack } = await runLaunch(contract({ deliverables: ["launch_thread"] }), makeDeps());

    const thread = pack.artifacts.find((a) => a.kind === "launch_thread")!;
    const posts = thread.data!.split(/## Post \d+/).slice(1).map((p) => p.trim());

    expect(posts.length).toBeGreaterThanOrEqual(6);
    for (const post of posts) expect(post.length).toBeLessThanOrEqual(280);

    // It asserts the URL is live — so LINK_DEAD has something to check.
    expect(thread.spec?.links).toEqual(["https://tidepool.test"]);
  });

  it("surfaces a dead link as a real finding through the Tribunal", async () => {
    // The grader stands in for the Tribunal; LINK_DEAD fires on the artifacts that carry links.
    const { port } = recordingGrader((kind) => kind === "launch_thread");

    const { pack } = await runLaunch(
      contract({ deliverables: ["launch_thread"] }),
      makeDeps({ grader: port }),
    );

    expect(pack.coverageGaps.join(" ")).toContain("LINK_DEAD");
    expect(pack.quality.passRate).toBe(0);
  });

  it("degrades artifact-by-artifact when the writer breaks — the pack still ships", async () => {
    const { pack } = await runLaunch(contract(), makeDeps({ text: new FakeText(true) }));

    const gaps = pack.coverageGaps.join(" ");
    expect(gaps).toContain("genome:degraded");
    expect(gaps).toContain("launch_thread:degraded");

    // The images and the kit still made it — one dead model does not sink the pack.
    expect(pack.artifacts.some((a) => a.kind === "og_image")).toBe(true);
    expect(pack.artifacts.some((a) => a.kind === "brand_kit")).toBe(true);
  });

  it("catches corporate slop mechanically — the exact copy our own critic once PASSED", () => {
    // This is verbatim from the first dogfood run of Occestra's LAUNCH studio on its own
    // site. The model critic scored it 80/100 and passed it. A quality standard that cannot
    // catch this is decoration, so it is no longer left to a model's judgement.
    const realFailure = [
      "People often overlook the importance of preserving genuine moments.",
      "Moreover, authenticity is paramount.",
      "Elevate your special occasions with work grounded in reality.",
    ].join("\n");

    const found = findSlop(realFailure);
    const phrases = found.map((f) => f.phrase);

    expect(phrases).toContain("people often overlook");
    expect(phrases).toContain("moreover");
    expect(phrases).toContain("elevate your");
    expect(found[0]!.where).toContain("overlook"); // it shows you WHERE, not just that

    // Copy that says something concrete passes untouched.
    expect(findSlop("Your budget spreadsheet does not add up. Ours does — we check it first.")).toEqual([]);
  });

  it("honours the brand's OWN banned words, not just the built-in list", () => {
    const copy = "Tidepool is a calm inbox that batches notifications.";
    expect(findSlop(copy)).toEqual([]);
    expect(findSlop(copy, ["calm inbox"]).map((f) => f.phrase)).toContain("calm inbox");
  });

  it("rewrites a slop-filled thread, and says so out loud if slop survives", async () => {
    // A writer that ALWAYS produces slop: the rewrite cannot save it, so the pack must warn.
    class SlopWriter implements TextModelPort {
      public threadCalls = 0;
      async complete(request: { system: string }) {
        if (request.system.includes("brand genome")) return new FakeText().complete(request);
        if (request.system.includes("launch threads")) {
          this.threadCalls += 1;
          return {
            model: "fake",
            usdCost: 0,
            text: JSON.stringify({
              posts: [
                "People often overlook the importance of a calm inbox.",
                "Moreover, focus is paramount for modern makers today.",
                "Elevate your workflow with a tool that respects you.",
                "Discover the power of batching every notification once.",
                "It is free while in beta, with no card required today.",
                "Try it now and take it to the next level of focus.",
              ],
            }),
          };
        }
        return new FakeText().complete(request);
      }
    }

    const writer = new SlopWriter();
    const { pack } = await runLaunch(
      contract({ deliverables: ["launch_thread"] }),
      makeDeps({ text: writer }),
    );

    expect(writer.threadCalls).toBe(2); // it tried again rather than shipping the first draft
    expect(pack.coverageGaps.join(" ")).toContain("launch_thread:slop-survived");
    expect(pack.coverageGaps.join(" ")).toContain("read it before you use it");
  });

  it("catches an INVENTED PRICE — the exact fabrication our first dogfood run shipped", () => {
    // Verbatim from the first real run: the demo beat sheet specced "$49 per event" for a
    // product whose tools cost between one and twenty-five cents. Nobody asked for a price.
    const evidence = "Occestra is the Occasion Studio. It grades every artifact it makes.";

    const fabricated = findFabrications("Simple text overlay: 'Starting at $49 per event'.", evidence);
    expect(fabricated).toHaveLength(1);
    expect(fabricated[0]!.kind).toBe("a price");
    expect(fabricated[0]!.claim).toContain("49");

    // A number the evidence DOES contain is not a fabrication.
    expect(findFabrications("It costs $49.", "Our price is $49 per event.")).toEqual([]);

    // Invented user counts and percentages are caught too.
    expect(findFabrications("Trusted by 10,000 users.", evidence)[0]!.kind).toBe("a user count");
    expect(findFabrications("Saves you 40% of your week.", evidence)[0]!.kind).toBe("a percentage");
  });

  it("inspectCopy fails copy that is either sloppy OR fabricated, and passes copy that is neither", () => {
    const evidence = "Occestra grades every artifact against a published standard.";

    expect(inspectCopy("Moreover, it is seamless.", evidence, []).clean).toBe(false);
    expect(inspectCopy("Trusted by 9,000 teams.", evidence, []).clean).toBe(false);
    expect(
      inspectCopy("Every artifact is graded against a standard you can read.", evidence, []).clean,
    ).toBe(true);
  });

  it("catches the price placeholder ending up in a URL slot — the Sigil showcase failure", () => {
    // Verbatim from the second dogfood run (Sigil's launch thread): told to write the
    // placeholder where a price belongs, the model wrote "Visit us at [YOUR PRICE HERE]".
    // An instruction that leaks out of its context ships looking deliberate.
    expect(findPlaceholderMisuse(`Visit us at ${PRICE_PLACEHOLDER}`)).toHaveLength(1);
    expect(findPlaceholderMisuse(`Learn more. Go to ${PRICE_PLACEHOLDER}`)).toHaveLength(1);

    // Used correctly — in a price beat — it is exactly right and must NOT be flagged.
    expect(findPlaceholderMisuse(`| 70-80 | price | overlay | ${PRICE_PLACEHOLDER} |`)).toEqual([]);
    expect(inspectCopy(`The price beat says ${PRICE_PLACEHOLDER}.`, "evidence", []).clean).toBe(true);
    expect(inspectCopy(`Visit us at ${PRICE_PLACEHOLDER}.`, "evidence", []).clean).toBe(false);
  });

  it("ACTUALLY repairs a failing artifact — the Tribunal's brief is acted on, not just filed", async () => {
    // Until this was wired, every pipeline graded artifacts, received a repair brief, and
    // shipped the failing artifact unrepaired (repairs:0 on a live paid pack). The repair
    // loop is the product's headline claim; it has to actually run.
    let graded = 0;
    const briefs: string[] = [];

    const repairingGrader: GradePort = {
      async grade({ artifact, regenerate }) {
        graded += 1;
        // Fail the hero the first time it is seen, and offer a brief.
        if (artifact.kind === "og_image" && regenerate && graded === 1) {
          const repaired = await regenerate("The focal point is lost against the ground.", artifact);
          briefs.push("used");
          return { artifact: repaired, pass: true, repairs: 1, coverageGaps: [] };
        }
        return { artifact, pass: true, repairs: 0, coverageGaps: [] };
      },
    };

    const image = new FakeImage();
    const { pack } = await runLaunch(
      contract({ deliverables: ["og_image"] }),
      makeDeps({ image, grader: repairingGrader }),
    );

    expect(briefs).toEqual(["used"]); // the pipeline handed the Tribunal a way to remake it
    expect(pack.quality.repairedCount).toBe(1);

    // The image was generated TWICE: once, then again carrying the repair brief.
    expect(image.calls).toHaveLength(2);
    expect(image.calls[1]!.prompt).toContain("THE TRIBUNAL REJECTED YOUR PREVIOUS ATTEMPT");
    expect(image.calls[1]!.prompt).toContain("focal point is lost");
  });

  it("refuses a policy-violating launch brief before any money is spent", async () => {
    const image = new FakeImage();
    await expect(
      runLaunch(
        contract({ productName: "GunPrint", description: "3d printed gun files, untraceable" }),
        makeDeps({ image }),
      ),
    ).rejects.toBeInstanceOf(PolicyRefusal);

    expect(image.calls).toHaveLength(0); // nothing was generated, nothing was charged
  });
});

/* ---------------------------------------------------------------- corpus */

import launchCorpus from "./corpus/launch.json" with { type: "json" };

interface LaunchCorpusEntry {
  label: string;
  contract: LaunchContract;
  expect: {
    policyBlocked?: boolean;
    siteDown?: boolean;
    kinds?: string[];
    minArtifacts?: number;
    gapsInclude?: string[];
  };
}

const launchEntries = launchCorpus as unknown as LaunchCorpusEntry[];

describe("LAUNCH corpus", () => {
  it("covers at least 8 labelled briefs", () => {
    expect(launchEntries.length).toBeGreaterThanOrEqual(8);
    expect(new Set(launchEntries.map((e) => e.label)).size).toBe(launchEntries.length);
  });

  for (const entry of launchEntries) {
    it(`${entry.label}`, async () => {
      const deps = makeDeps(
        entry.expect.siteDown ? { site: new FakeSite(new Error("net::ERR_CONNECTION_REFUSED")) } : {},
      );

      if (entry.expect.policyBlocked) {
        await expect(runLaunch(entry.contract, deps)).rejects.toBeInstanceOf(PolicyRefusal);
        return;
      }

      const { pack } = await runLaunch(entry.contract, deps);
      const kinds = pack.artifacts.map((a) => a.kind);

      for (const kind of entry.expect.kinds ?? []) expect(kinds).toContain(kind);
      if (entry.expect.minArtifacts) expect(pack.artifacts.length).toBeGreaterThanOrEqual(entry.expect.minArtifacts);
      for (const needle of entry.expect.gapsInclude ?? []) {
        expect(pack.coverageGaps.some((gap) => gap.includes(needle))).toBe(true);
      }
      // every artifact in every corpus pack carries its report
      for (const artifact of pack.artifacts) expect(artifact.tribunal).toBeDefined();
    });
  }
});
