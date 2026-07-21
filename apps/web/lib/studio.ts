/**
 * The Studio's client-side vocabulary. DemoEvent mirrors the server shape in
 * packages/mcp-server/src/demo.ts — events arrive over SSE from the real
 * pipelines and are rendered, never invented.
 */

export type StudioId = "celebrate" | "remember" | "launch";

export interface StyleSwatch {
  id: string;
  name: string;
  version: number;
  palette: string[];
  /** Which studios this style is appropriate for — drives the picker's grouping. */
  appliesTo?: string[];
  bestFor?: string;
}

export type DemoEvent =
  | { type: "run_started"; tool: string; studio: string }
  | { type: "sourcing"; what: "venues" | "weather" | "site"; detail: string }
  | { type: "sourced"; what: "venues" | "weather" | "site"; detail: string }
  | { type: "writing"; detail: string }
  | { type: "rendering"; detail: string }
  | { type: "rendered"; detail: string }
  | { type: "grading"; kind: string; title: string }
  | { type: "artifact_failed"; kind: string; title: string; repairBrief: string }
  | { type: "artifact_repaired"; kind: string; title: string; attempt: number }
  | {
      type: "graded";
      kind: string;
      title: string;
      pass: boolean;
      repairs: number;
      axes?: Record<string, number>;
      issues?: string[];
    }
  | { type: "sealing" }
  | { type: "run_complete"; pack: FinishedPack }
  | { type: "run_failed"; message: string; reason?: "policy" | "error" };

export interface FinishedArtifact {
  id: string;
  kind: string;
  title: string;
  format: string;
  styleId?: string;
  content?: string;
  url?: string;
  sources: Array<{ source: string; retrievedAt: string; url?: string }>;
  tribunal?: {
    pass: boolean;
    repairs: number;
    axes?: Record<string, number>;
    issues?: string[];
    coverageGaps?: string[];
  };
  /** Set when the studio could not produce it. Never graded, never counted. */
  undelivered?: { code: string; reason: string };
}

/**
 * Public boundaries return structured gaps, but older deployments returned one flat string.
 * Keep the reader tolerant during rolling deploys; both shapes are safe, buyer-facing text.
 */
export type FinishedGap = { code: string; note: string } | string;

export interface FinishedPack {
  keepsakeId: string;
  studio: StudioId;
  /** Remember packs expose only provenance at /k unless their owner makes a separate showcase. */
  private?: boolean;
  quality: {
    oqsVersion: string;
    passRate: number;
    repairedCount: number;
    undeliveredCount?: number;
  };
  coverageGaps: FinishedGap[];
  artifacts: FinishedArtifact[];
  seal?: {
    keepsakeId: string;
    manifestHash: string;
    signer: string;
    leaf: string;
    anchored: boolean;
    anchorTx?: string;
  };
  publicPage: string;
}

export const ROLES = ["Planner", "Cartographer", "Art Director", "Writer", "Critic", "Archivist"] as const;
export type Role = (typeof ROLES)[number];

/** Which member of the syndicate a live event belongs to. */
export function roleForEvent(event: DemoEvent): Role | undefined {
  switch (event.type) {
    case "run_started":
      return "Planner";
    case "sourcing":
    case "sourced":
      return "Cartographer";
    case "writing":
      return "Writer";
    case "rendering":
    case "rendered":
      return "Art Director";
    case "grading":
    case "graded":
    case "artifact_failed":
    case "artifact_repaired":
      return "Critic";
    case "sealing":
    case "run_complete":
      return "Archivist";
    default:
      return undefined;
  }
}

/* ------------------------------------------------------------- the presets */

export interface Preset {
  label: string;
  studio: StudioId;
  fields: Record<string, string>;
}

function nextSaturday(): string {
  const date = new Date();
  date.setDate(date.getDate() + ((6 - date.getDay() + 7) % 7 || 7));
  return date.toISOString().slice(0, 10);
}

export const PRESETS: Preset[] = [
  {
    label: "Birthday dinner in Lagos",
    studio: "celebrate",
    fields: {
      occasion: "My best friend's 30th birthday dinner",
      city: "Lagos",
      date: nextSaturday(),
      headcount: "10",
      vibe: "warm, rooftop at dusk, a lot of laughing, small chops",
    },
  },
  {
    label: "Launch my hackathon project",
    studio: "launch",
    fields: {
      productName: "Occestra",
      url: "https://occestra.xyz",
      audience: "builders shipping for the OKX.AI hackathon",
    },
  },
  {
    label: "Our trip to Abuja",
    studio: "remember",
    fields: {
      title: "Our trip to Abuja",
      description:
        "Three days in March. Aso Rock at sunset from the car window, suya at Wuse market at midnight, and the long drive home with everyone asleep except the driver and me.",
      momentDate: "2026-03-14",
      tone: "nostalgic, warm",
    },
  },
];

/* --------------------------------------------------------- composer fields */

export interface FieldSpec {
  name: string;
  label: string;
  placeholder: string;
  kind: "text" | "textarea" | "number" | "date" | "url";
  required?: boolean;
}

export interface StudioIdentity {
  label: string;
  promise: string;
  accent: string;
  accentSoft: string;
  /** Atmospheric room portrait shown only while the live feed is quiet. */
  image: string;
  imagePosition: string;
}

/** Three rooms, one building: each room has its own emotional register. */
export const STUDIO_IDENTITY: Record<StudioId, StudioIdentity> = {
  celebrate: {
    label: "Celebrate",
    promise: "Plan what is ahead — grounded, generous, ready for real people.",
    accent: "#B95735",
    accentSoft: "#F4D5C7",
    image: "/celebrate.jpg",
    imagePosition: "50% 48%",
  },
  remember: {
    label: "Remember",
    promise: "Keep what already happened — private, faithful, beautifully held.",
    accent: "#39779A",
    accentSoft: "#D8EAF2",
    image: "/remember.jpg",
    imagePosition: "31% 48%",
  },
  launch: {
    label: "Launch",
    promise: "Put the work into the world — specific, coherent, impossible to mistake.",
    accent: "#7D4BA6",
    accentSoft: "#E6D9F2",
    image: "/launch.jpg",
    imagePosition: "53% 50%",
  },
};

export const STUDIO_FIELDS: Record<StudioId, FieldSpec[]> = {
  celebrate: [
    { name: "occasion", label: "The occasion", placeholder: "My sister's graduation dinner", kind: "text", required: true },
    { name: "city", label: "City", placeholder: "Lagos", kind: "text", required: true },
    { name: "date", label: "Date", placeholder: "", kind: "date", required: true },
    { name: "headcount", label: "Guests", placeholder: "10", kind: "number", required: true },
    { name: "vibe", label: "The vibe", placeholder: "warm, candlelit, unhurried", kind: "text", required: true },
    { name: "budgetUsd", label: "Budget (USD, optional)", placeholder: "300", kind: "number" },
  ],
  remember: [
    { name: "title", label: "The memory", placeholder: "Our first summer in Porto", kind: "text", required: true },
    { name: "description", label: "What happened, in your words", placeholder: "We walked the bridge at dusk and ate too many pastries…", kind: "textarea" },
    { name: "momentDate", label: "When", placeholder: "2026-03-14", kind: "text" },
    { name: "tone", label: "Tone", placeholder: "nostalgic, quiet", kind: "text" },
  ],
  launch: [
    { name: "productName", label: "Product name", placeholder: "Your project", kind: "text", required: true },
    { name: "url", label: "Live URL (read in a real browser)", placeholder: "https://…", kind: "url" },
    { name: "description", label: "What it is", placeholder: "One honest paragraph", kind: "textarea" },
    { name: "audience", label: "Audience", placeholder: "builders shipping this week", kind: "text" },
  ],
};

/** Optional depth shared by all rooms. Values are carried as structured briefContext. */
export const DETAILED_FIELDS: Record<StudioId, FieldSpec[]> = {
  celebrate: [
    { name: "honoreeDetails", label: "Who this is really for", placeholder: "What matters to them; what the room should know", kind: "textarea" },
    { name: "dietaryNotes", label: "Dietary notes", placeholder: "vegan, allergies, halal, no alcohol…", kind: "textarea" },
    { name: "accessibilityNotes", label: "Accessibility", placeholder: "step-free access, quiet room, transport needs…", kind: "textarea" },
    { name: "doList", label: "Please do", placeholder: "One item per line", kind: "textarea" },
    { name: "dontList", label: "Please avoid", placeholder: "surprise speeches\nlate-night venues", kind: "textarea" },
    { name: "referenceLinks", label: "Reference links", placeholder: "One https:// link per line", kind: "textarea" },
    { name: "tonePreference", label: "Tone preference", placeholder: "joyful, intimate, never sentimental", kind: "text" },
  ],
  remember: [
    { name: "honoreeDetails", label: "People and details you establish", placeholder: "Names and relationships only you can truthfully provide", kind: "textarea" },
    { name: "doList", label: "Details to hold onto", placeholder: "One true detail per line", kind: "textarea" },
    { name: "dontList", label: "Do not infer or mention", placeholder: "Anything private, uncertain, or off-limits", kind: "textarea" },
    { name: "referenceLinks", label: "Private reference links", placeholder: "One https:// link per line", kind: "textarea" },
    { name: "tonePreference", label: "Editorial tone", placeholder: "clear-eyed, warm, not saccharine", kind: "text" },
  ],
  launch: [
    { name: "honoreeDetails", label: "Founder / product context", placeholder: "Why it exists; the one thing buyers should understand", kind: "textarea" },
    { name: "doList", label: "Messages to land", placeholder: "One supportable message per line", kind: "textarea" },
    { name: "dontList", label: "Claims and clichés to avoid", placeholder: "revolutionary\n10x\nindustry-leading", kind: "textarea" },
    { name: "referenceLinks", label: "Reference links", placeholder: "Docs, listing, contract — one https:// link per line", kind: "textarea" },
    { name: "tonePreference", label: "Voice", placeholder: "precise, confident, no hype", kind: "text" },
  ],
};

export const STUDIO_TOOL: Record<StudioId, string> = {
  celebrate: "oce_plan_occasion",
  remember: "oce_make_keepsake",
  launch: "oce_launch_kit",
};

export const STUDIO_BLURB: Record<StudioId, string> = {
  celebrate: "A grounded plan: real venues, a real forecast, schedule, budget, contingencies, guest guide.",
  remember: "Keepsake art in a curated style + a story page that separates fact from prose.",
  launch: "Brand genome from your real site, hero visual, launch thread, demo beat sheet.",
};
