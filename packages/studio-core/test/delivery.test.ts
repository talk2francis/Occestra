/**
 * The integrity invariant: a pack may never report a score it did not earn.
 *
 * The bug: when the image provider failed, the artifact was DROPPED from the pack and
 * only a coverage gap remained. Pass rate is `passed / delivered`, so dropping the
 * failures shrank the denominator — a launch kit that made one image out of four could
 * still report passRate 1.0. The thinner the pack, the better it scored.
 */
import { describe, expect, it } from "vitest";
import {
  classifyImageFailure,
  ensureStored,
  runLaunch,
  UNDELIVERED_CODES,
  type GradePort,
  type HouseStyle,
  type ImageModelPort,
  type LaunchContract,
  type LaunchDeps,
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
  negativePrompt: "no gloss",
  seedStrategy: "contract_hash",
  appliesTo: { studios: ["celebrate", "remember", "launch"] },
  bestFor: "test",
  wrongFor: "test",
};

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Generates `ok` images, then fails forever. Mirrors a provider running out of quota mid-pack. */
class QuotaImage implements ImageModelPort {
  public calls = 0;
  constructor(private readonly ok: number) {}
  async generate() {
    this.calls += 1;
    if (this.calls > this.ok) {
      throw new Error("429 You exceeded your current quota, please check your plan and billing details");
    }
    return { pngBase64: PNG_1PX, model: "fake", usdCost: 0 };
  }
}

/** Accepts writes and silently loses them — a full disk, a bad key. */
class BlackHoleStorage implements StoragePort {
  async put(key: string) {
    return key;
  }
  async get() {
    return undefined;
  }
  async delete() {}
  async signedUrl(key: string) {
    return `https://test/${key}`;
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

class FakeText implements TextModelPort {
  async complete(request: { system: string }) {
    if (request.system.includes("brand genome")) {
      return {
        model: "fake",
        usdCost: 0,
        text: JSON.stringify({
          positioning: "Tidepool batches notifications so you read them once a day instead of all day.",
          audience: "People who work in focus blocks.",
          voice: "Plain, quiet, technical.",
          messages: ["Read them once.", "Nothing is lost.", "It works with what you have."],
          bannedCliches: ["revolutionary"],
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
            // Every `purpose` must clear the schema's 10-character floor. An earlier draft of
            // this fixture had "Show it." (8 chars), so the landing spec never validated —
            // and the suite passed anyway, because the old code silently DROPPED a degraded
            // artifact instead of reporting it. The bug was hiding a broken fixture.
            { name: "Hero", purpose: "Earn the next four seconds.", headline: "Read them once.", body: "Tidepool batches notifications.", cta: "Try it" },
            { name: "Problem", purpose: "Name the pain plainly.", headline: "74 interruptions", body: "None urgent.", cta: "" },
            { name: "How", purpose: "Show the mechanism.", headline: "It waits", body: "Nothing is lost, only delayed.", cta: "" },
            { name: "Price", purpose: "Say the number out loud.", headline: "Free in beta", body: "No card, no trial timer.", cta: "Start" },
          ],
        }),
      };
    }
    return {
      model: "fake",
      usdCost: 0,
      text: JSON.stringify({
        beats: [
          { seconds: "0-8", beat: "cold open", onScreen: "A quiet inbox.", saying: "Nothing." },
          { seconds: "8-20", beat: "problem", onScreen: "Badges piling up.", saying: "A normal Tuesday." },
          { seconds: "20-55", beat: "live magic", onScreen: "One batch arriving.", saying: "Once a day." },
          { seconds: "55-70", beat: "trust", onScreen: "Nothing deleted.", saying: "It only waits." },
          { seconds: "70-90", beat: "cta", onScreen: "The URL.", saying: "Try it." },
        ],
      }),
    };
  }
}

class FakeSite implements SitePort {
  async inspect(url: string): Promise<SiteInspection> {
    return {
      title: "Tidepool",
      description: "Tidepool batches your notifications.",
      palette: ["#0F3B57", "#F7F5F0", "#C9552E", "#111111"],
      fonts: ["Inter"],
      screenshots: [],
      og: {},
      source: { source: "playwright_site_inspection", retrievedAt: "2026-07-12T09:00:00.000Z", url },
    };
  }
}

/** Passes everything it is given — so any imperfect pass rate is the delivery math, not grading. */
const allPass: GradePort = {
  async grade({ artifact }) {
    return {
      artifact: { ...artifact, tribunal: { pass: true } },
      pass: true,
      repairs: 0,
      coverageGaps: [],
    };
  },
};

const contract = (): LaunchContract => ({
  id: "l_1",
  studio: "launch",
  styleId: "amethyst_editorial",
  createdAt: "2026-07-12T10:00:00.000Z",
  requester: "agent",
  productName: "Tidepool",
  url: "https://tidepool.test",
  description: "A calm inbox.",
  audience: "indie makers",
  deliverables: ["brand_kit", "og_image", "brand_mark", "carousel", "launch_thread", "landing_spec", "demo_script"],
  locale: "en",
});

const deps = (over: Partial<LaunchDeps> = {}): LaunchDeps => ({
  text: new FakeText(),
  image: new QuotaImage(1),
  storage: new MemStorage(),
  clock: { now: () => NOW },
  site: new FakeSite(),
  grader: allPass,
  styleFor: () => style,
  ...over,
});

describe("classifyImageFailure", () => {
  it("maps a provider's raw error to a stable public code", () => {
    expect(classifyImageFailure(new Error("429 You exceeded your current quota")).code).toBe(
      UNDELIVERED_CODES.quota,
    );
    expect(classifyImageFailure(new Error("content_policy_violation")).code).toBe(
      UNDELIVERED_CODES.refused,
    );
    expect(classifyImageFailure(new Error("socket hang up: ETIMEDOUT")).code).toBe(
      UNDELIVERED_CODES.timeout,
    );
  });

  it("never leaks the raw provider text into what a buyer reads", () => {
    const raw = "401 Incorrect API key provided: sk-proj-abc123. https://platform.openai.com/keys";
    const { reason, code } = classifyImageFailure(new Error(raw));
    expect(reason).not.toContain("sk-proj");
    expect(reason).not.toContain("https://");
    expect(code).not.toContain("sk-proj");
  });
});

describe("ensureStored", () => {
  it("throws when a resolved put did not actually stick", async () => {
    await expect(ensureStored(new BlackHoleStorage(), "k.png")).rejects.toThrow(/not readable back/);
  });

  it("passes when the bytes are readable back", async () => {
    const storage = new MemStorage();
    await storage.put("k.png", new Uint8Array([1, 2, 3]));
    await expect(ensureStored(storage, "k.png")).resolves.toBeUndefined();
  });
});

describe("a pack whose image provider dies mid-run", () => {
  it("still completes, and marks the images it could not make as undelivered", async () => {
    const { pack } = await runLaunch(contract(), deps());

    // The pack is delivered, not aborted.
    expect(pack.artifacts.length).toBeGreaterThan(0);

    const undelivered = pack.artifacts.filter((a) => a.undelivered);
    // og_image succeeds (the 1 allowed call); brand_mark + 2 carousel cards fail.
    expect(undelivered.map((a) => a.id).sort()).toEqual(["brand_mark", "social_1", "social_2"]);
    expect(undelivered.every((a) => a.undelivered?.code === UNDELIVERED_CODES.quota)).toBe(true);
  });

  it("NEVER grades an artifact it did not produce — no undelivered artifact wears a PASS", async () => {
    const { pack } = await runLaunch(contract(), deps());

    for (const artifact of pack.artifacts.filter((a) => a.undelivered)) {
      expect(artifact.tribunal).toBeUndefined();
      expect(artifact.uri).toBeUndefined();
    }
  });

  it("excludes undelivered work from the pass rate instead of shrinking the denominator", async () => {
    const { pack } = await runLaunch(contract(), deps());

    const delivered = pack.artifacts.filter((a) => !a.undelivered);
    const undelivered = pack.artifacts.filter((a) => a.undelivered);

    // Every DELIVERED artifact passed, so the rate is 1 — but the pack cannot hide
    // behind it: the shortfall is counted, in the open, right next to it.
    expect(pack.quality.passRate).toBe(1);
    expect(pack.quality.undeliveredCount).toBe(undelivered.length);
    expect(pack.quality.undeliveredCount).toBe(3);
    expect(delivered.length + undelivered.length).toBe(pack.artifacts.length);
  });

  it("says why, in one sentence, without the provider's error text", async () => {
    const { pack } = await runLaunch(contract(), deps());

    const gap = pack.coverageGaps.find((g) => g.startsWith(UNDELIVERED_CODES.quota));
    expect(gap).toBeDefined();
    expect(gap).not.toMatch(/429|billing details|plan and billing/);
  });

  it("marks COPY that could not be written as undelivered too — not just pictures", async () => {
    // The image fix was only half the bug. When a WRITER failed, the artifact was dropped
    // exactly the same way, leaving a bare `launch_thread:degraded` gap — so a launch kit
    // with no thread, no landing spec and no beat sheet still reported passRate 1.0 over
    // the images that happened to survive. Text vanishing is no better than a picture
    // vanishing. Found by watching a fake-mode run's event feed, not by a test.
    class MuteWriter implements TextModelPort {
      async complete() {
        return { model: "fake", usdCost: 0, text: "{}" }; // never validates, twice
      }
    }

    const { pack } = await runLaunch(contract(), deps({ text: new MuteWriter(), image: new QuotaImage(99) }));

    // The three the WRITER owed. (The brand kit still ships — it is assembled from a
    // fallback genome rather than written, so it is degraded, not absent.)
    const owed = ["launch_thread", "landing_spec", "demo_script"];

    for (const id of owed) {
      const artifact = pack.artifacts.find((a) => a.id === id);
      expect(artifact, `${id} vanished from the pack instead of being marked undelivered`).toBeDefined();
      expect(artifact!.undelivered).toBeDefined();
      expect(artifact!.tribunal).toBeUndefined(); // never graded — there is nothing to grade
    }

    expect(pack.quality.undeliveredCount).toBeGreaterThanOrEqual(owed.length);
  });

  it("treats bytes that do not survive the write as undelivered, not as a pass", async () => {
    // The provider succeeds every time; the DISK is the liar.
    const { pack } = await runLaunch(
      contract(),
      deps({ image: new QuotaImage(99), storage: new BlackHoleStorage() }),
    );

    const images = pack.artifacts.filter((a) => a.format === "png");
    expect(images.length).toBeGreaterThan(0);
    // Not one of them may claim to be delivered, because not one of them is readable.
    expect(images.every((a) => a.undelivered)).toBe(true);
    expect(images.every((a) => a.tribunal === undefined)).toBe(true);
    expect(pack.quality.undeliveredCount).toBe(images.length);
  });
});
