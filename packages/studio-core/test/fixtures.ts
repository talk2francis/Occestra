import type { Artifact, CelebrateContract, LaunchContract, Pack, RememberContract } from "../src/index.js";

export const celebrate = (over: Partial<CelebrateContract> = {}): CelebrateContract => ({
  id: "c_1",
  studio: "celebrate",
  styleId: "amethyst_editorial",
  createdAt: "2026-07-12T10:00:00.000Z",
  requester: "human",
  occasion: "My sister's 30th birthday dinner",
  city: "Lisbon",
  country: "Portugal",
  date: "2026-07-18",
  headcount: 12,
  budgetUsd: 600,
  vibe: "warm, editorial, candlelit",
  constraints: ["one guest is vegan"],
  deliverables: ["plan", "schedule", "budget", "invitation"],
  locale: "en",
  ...over,
});

export const remember = (over: Partial<RememberContract> = {}): RememberContract => ({
  id: "r_1",
  studio: "remember",
  styleId: "sunprint",
  createdAt: "2026-07-12T10:00:00.000Z",
  requester: "human",
  title: "Our first summer in Porto",
  momentDate: "2025-08-02",
  notes: "We walked the bridge at dusk and ate too many pastries.",
  mediaRefs: ["upload_abc123"],
  tone: "nostalgic, quiet, tender",
  deliverables: ["keepsake_art", "story_page"],
  locale: "en",
  ...over,
});

export const launch = (over: Partial<LaunchContract> = {}): LaunchContract => ({
  id: "l_1",
  studio: "launch",
  styleId: "gilded_noir",
  createdAt: "2026-07-12T10:00:00.000Z",
  requester: "agent",
  productName: "Tidepool",
  url: "https://example.com",
  description: "A calm inbox for indie makers.",
  audience: "solo founders",
  deliverables: ["brand_kit", "launch_thread"],
  locale: "en",
  ...over,
});

export const artifact = (over: Partial<Artifact> = {}): Artifact => ({
  id: "a_1",
  kind: "plan",
  title: "The plan",
  format: "json",
  data: '{"steps":["arrive","eat","toast"]}',
  sources: [],
  version: 1,
  ...over,
});

export const pack = (over: Partial<Pack> = {}): Pack => ({
  id: "oce_0abcdefghjkmnpqrstvwxy",
  contractId: "c_1",
  studio: "celebrate",
  artifacts: [artifact()],
  coverageGaps: [],
  quality: { oqsVersion: "1.0.0", passRate: 1, repairedCount: 0 },
  createdAt: "2026-07-12T10:00:00.000Z",
  ...over,
});
