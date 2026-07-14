/**
 * The style catalog.
 *
 * A styleId is an argument on almost every paid tool, and until now the only guidance a buyer
 * had was a one-line hint in a zod `.describe()`. Choosing blind means paying for a render you
 * did not want — and a wrong style is not a refund, it is just a bad invitation. So the catalog
 * is free, and it is the tool we tell buyers to call first.
 *
 * The line these tests hold: **a catalog illustrated with work that failed is an advert.** It
 * shows the most recent artifact that ACTUALLY PASSED the Tribunal in that style, or it shows
 * nothing and says so. It never borrows an example from a style that worked to flatter one that
 * did not.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, describe, expect, it } from "vitest";
import { HOUSE_STYLES } from "@occestra/providers";
import type { Pack } from "@occestra/studio-core";
import { PRICES } from "../src/gate.js";
import { buildServer, type ServerContext } from "../src/server.js";
import { Store } from "../src/store.js";

const dirs: string[] = [];

function makeCtx(): ServerContext & { store: Store } {
  const dataDir = mkdtempSync(join(tmpdir(), "occestra-styles-"));
  dirs.push(dataDir);

  const store = new Store({ dataDir, urlSecret: "test-secret", baseUrl: "http://test.local" });

  return {
    store,
    coverageGaps: [],
    publicBaseUrl: "http://test.local",
    chainId: 196,
  } as unknown as ServerContext & { store: Store };
}

async function catalog(ctx: ServerContext) {
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), buildServer(ctx).connect(serverTransport)]);

  const result = await client.callTool({ name: "oce_style_catalog", arguments: {} });
  const content = (result as { content: Array<{ text: string }> }).content;
  return JSON.parse(content[0]!.text) as {
    styles: Array<{
      id: string;
      bestFor: string;
      palette: string[];
      example: { image?: string; keepsake?: string; note: string };
    }>;
    enforcement: string;
    defaults: Record<string, string>;
  };
}

/** A pack carrying one PNG in a style, which passed or failed the Tribunal. */
const packWith = (id: string, styleId: string, pass: boolean, createdAt: string): Pack =>
  ({
    id,
    studio: "celebrate",
    contractId: "c_1",
    createdAt,
    quality: { oqsVersion: "1.1.0", passRate: pass ? 1 : 0, repairedCount: 0, undeliveredCount: 0 },
    coverageGaps: [],
    artifacts: [
      {
        id: "art",
        kind: "invitation",
        title: "An invitation",
        format: "png",
        styleId,
        uri: `artifacts/${id}.png`,
        sources: [],
        tribunal: { pass },
      },
    ],
  }) as unknown as Pack;

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("oce_style_catalog", () => {
  it("is free, and always will be", () => {
    expect(PRICES.oce_style_catalog).toBe(0);
  });

  it("lists every House Style with its real palette and what it is FOR", async () => {
    const ctx = makeCtx();
    const result = await catalog(ctx);

    expect(result.styles).toHaveLength(Object.keys(HOUSE_STYLES).length);

    for (const style of result.styles) {
      const real = HOUSE_STYLES[style.id as keyof typeof HOUSE_STYLES];
      expect(style.palette).toEqual(real.palette); // the ACTUAL hexes the renderer is held to
      expect(style.bestFor.length).toBeGreaterThan(40);
    }

    // The palette is a deterministic check, not a promise. Say so where the buyer reads it.
    expect(result.enforcement).toContain("PALETTE_DRIFT");
    expect(result.defaults["oce_make_keepsake"]).toBe("sunprint");
  });

  it("shows a REAL passing artifact as the example", async () => {
    const ctx = makeCtx();
    ctx.store.savePack(packWith("oce_pass1", "sunprint", true, "2026-07-14T10:00:00.000Z"));

    const result = await catalog(ctx);
    const sunprint = result.styles.find((style) => style.id === "sunprint")!;

    expect(sunprint.example.image).toContain("/a/artifacts%2Foce_pass1.png");
    expect(sunprint.example.keepsake).toBe("http://test.local/k/oce_pass1");
  });

  it("NEVER illustrates a style with an artifact that FAILED the Tribunal", async () => {
    const ctx = makeCtx();
    // The only gilded_noir artifact we have ever made is one that failed.
    ctx.store.savePack(packWith("oce_fail1", "gilded_noir", false, "2026-07-14T10:00:00.000Z"));

    const result = await catalog(ctx);
    const noir = result.styles.find((style) => style.id === "gilded_noir")!;

    // Showing it would be an advert. Showing nothing is the truth.
    expect(noir.example.image).toBeUndefined();
    expect(noir.example.note).toContain("nothing honest to show you");
  });

  it("says plainly when a style has never been rendered, rather than borrowing an example", async () => {
    const ctx = makeCtx();
    ctx.store.savePack(packWith("oce_pass2", "sunprint", true, "2026-07-14T10:00:00.000Z"));

    const result = await catalog(ctx);
    const atlas = result.styles.find((style) => style.id === "atlas_ink")!;

    expect(atlas.example.image).toBeUndefined();
    expect(atlas.example.note).toContain("nothing honest");
  });
});
