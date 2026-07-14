/**
 * REAL OUTPUT ONLY. Everything in this file is quoted verbatim from packs in
 * the production store (/var/lib/occestra/occestra.db) or from recorded
 * dev-mode runs kept in artifacts-out/. Nothing here is invented for the
 * landing page — if you change a number, you are lying to a judge.
 *
 * Pack ids:
 *   celebrate  oce_01kxbz33bb4grnd1xh0gev  (sealed + anchored on X Layer)
 *   launch     oce_01kxc1fs5t73wf0ncs18he  (sealed + anchored, repairs ran)
 *   launch     oce_01kxc0hacey7855y7gfe2q  (dogfood run — the failing draft)
 *   remember   oce_01kxc77b8etpbjrw05xsqt  (dev-mode run, our own brief)
 */

export const REGISTRY = "0x1653509df702b45d67b3eb12ca37de9f5fc21f08";
export const EXPLORER_REGISTRY = `https://www.oklink.com/x-layer/address/${REGISTRY}`;
export const API_BASE = "https://api.occestra.xyz";
export const AGENT_ID = 5213;
export const OQS_VERSION = "1.0.0";

/* ------------------------------------------------ the sealed celebrate pack */

export const CELEBRATE = {
  id: "oce_01kxbz33bb4grnd1xh0gev",
  brief: "A farewell dinner for a friend moving abroad — Lisbon, July 19, 8 people.",
  forecast: "overcast, 18–26°C, 0% chance of rain",
  forecastSource: { source: "open-meteo", retrievedAt: "2026-07-12T20:07:55.500Z" },
  venues: [
    { name: "Aqui há Peixe", detail: "18A Rua da Trindade, Lisboa" },
    { name: "Lisboà Noite", detail: "69 Rua das Gáveas, Lisboa" },
    { name: "Notalho", detail: "50 Praça da Alegria" },
    { name: "The Great American Disaster", detail: "Bairro Alto" },
  ],
  venueSource: { source: "openstreetmap", retrievedAt: "2026-07-12T20:07:55.500Z" },
  uncertainty: "No venue here is booked. Every one is a candidate you still have to call.",
  schedule: [
    { time: "18:00–18:45", title: "Arrival and welcome drinks" },
    { time: "18:50–20:40", title: "Dinner and toasts" },
  ],
  budget: { total: 320, currency: "USD", items: [
    { label: "Food and drinks", amount: 224 },
    { label: "Venue reservation", amount: 96 },
  ]},
  artifacts: [
    { kind: "plan", axes: { composition: 85, legibility: 90, grounding: 90, platform_fit: 80 } },
    { kind: "schedule", axes: { composition: 75, legibility: 85, grounding: 80, platform_fit: 70 } },
    { kind: "budget", axes: { composition: 85, legibility: 90, grounding: 80, platform_fit: 75 } },
    { kind: "contingency", axes: { composition: 85, legibility: 90, grounding: 80, platform_fit: 85 } },
    { kind: "guest_guide", axes: { composition: 85, legibility: 90, grounding: 85, platform_fit: 90 } },
  ],
  passRate: 1,
  seal: {
    manifestHash: "0x619057ca10f52bfe9e0a620bb475c224e8d1b7de1d1f93b308a6fe26983a8e25",
    leaf: "0xc814215758135400b364fbb5d4614b7e9ab50a114158a1c91e36064ab23a4adc",
    signer: "0x0d63f9EeB86813230B72017444cea16Cd4A453F2",
    anchorTx: "0xb97ec200c619fca5f589b07d65bb7aa1a31a404e50e8fe010e19abf0c4058801",
    anchoredAt: "2026-07-12T20:08:56Z",
    createdAt: "2026-07-12T20:08:04Z",
  },
} as const;

/* --------------------------------------- the Tribunal repair, before/after */

export const TRIBUNAL_CASE = {
  tool: "oce_launch_kit",
  artifact: "launch_thread",
  // The failing draft, dogfood run oce_01kxc0hacey7855y7gfe2q — quoted verbatim.
  before: {
    posts: [
      "Make moments monumental. Transform them with Occestra’s trusted, high-standard processes.",
      "Bring your moments to life with work that's both grounded and verified. See Occestra's quality for yourself.",
    ],
    axes: { composition: 60, legibility: 85, grounding: 60, platform_fit: 50 },
    pass: false,
    issues: [
      "Several posts contain filler phrases that could apply to any product.",
      "Claims about 'authenticity verified on chain' are not substantiated with specific examples.",
      "Platform fit is low due to the generic nature of the posts.",
    ],
    repairBrief:
      "Remove or replace filler phrases with specific, informative content that highlights unique aspects of Occestra. Provide concrete examples or evidence to support claims about authenticity and quality standards.",
  },
  // After two repair passes, sealed pack oce_01kxc1fs5t73wf0ncs18he — verbatim.
  after: {
    posts: [
      "Occestra turns your real moments into finished, quality-graded works. Each piece is backed by on-chain provenance, ensuring authenticity and trust.",
      "Our quality grading system ensures each piece meets exacting standards. See the criteria and judge for yourself at Occestra.",
    ],
    axes: { composition: 65, legibility: 85, grounding: 60, platform_fit: 50 },
    pass: false,
    repairs: 2,
  },
  // The repair that ended in a pass: the remember keepsake art (dev-mode run).
  passCase: {
    artifact: "keepsake_art",
    packId: "oce_01kxc77b8etpbjrw05xsqt",
    repairs: 1,
    axesAfter: { composition: 85, legibility: 70, style_fidelity: 90, platform_fit: 85 },
  },
} as const;

/* ----------------------------------------------------------------- pricing */

/**
 * The price list, mirrored from the ASP's own PRICES table.
 *
 * A mirror can drift, and a website quoting a price the server will not honour is worse than
 * no price at all — so `node scripts/check-prices.mjs` (run by `pretest`) fails the build if
 * this list and the ASP's manifest ever disagree.
 */
export const TOOLS = [
  { name: "oce_plan_occasion", price: 0.3, gives: "A grounded plan: real venues, real forecast, schedule, budget, contingencies" },
  { name: "oce_design_invite", price: 0.75, gives: "An invitation suite in a curated House Style" },
  { name: "oce_make_keepsake", price: 0.75, gives: "Keepsake artwork + a story page from a moment that already happened" },
  { name: "oce_write_toast", price: 0.1, gives: "A toast written for the room, not for the internet" },
  { name: "oce_moodboard", price: 0.3, gives: "A directed moodboard on a versioned style system" },
  { name: "oce_launch_kit", price: 1.5, gives: "Hero visual, brand genome, launch thread, demo beat sheet, OG image" },
  { name: "oce_critique", price: 0.01, gives: "Your artifact, graded against the published OQS — repair brief included" },
  { name: "oce_verify_keepsake", price: 0, gives: "Verify any seal against X Layer. Free forever" },
  { name: "oce_create_pack_job", price: null, gives: "Run any of the above as a background job — costs exactly what that tool costs" },
  { name: "oce_job_status", price: 0, gives: "Where your job has got to, with the real event feed. Free" },
  { name: "oce_job_result", price: 0, gives: "Collect the finished pack. Free — you already paid" },
  { name: "oce_cancel_job", price: 0, gives: "Stop a job. Free. Queued cancels refund in full" },
  { name: "oce_style_catalog", price: 0, gives: "Every House Style, its real palette, and a real passing example. Free — call it first" },
] as const;

export const OQS_AXES = ["composition", "legibility", "style_fidelity", "grounding", "platform_fit"] as const;

export const HOUSE_STYLE_NAMES = [
  { id: "amethyst_editorial", name: "Amethyst Editorial" },
  { id: "gilded_noir", name: "Gilded Noir" },
  { id: "sunprint", name: "Sunprint" },
  { id: "atlas_ink", name: "Atlas Ink" },
] as const;
