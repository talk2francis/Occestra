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
}

export interface FinishedPack {
  keepsakeId: string;
  studio: StudioId;
  quality: { oqsVersion: string; passRate: number; repairedCount: number };
  coverageGaps: string[];
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
