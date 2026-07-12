import sharp from "sharp";
import type {
  Artifact,
  CelebrateContract,
  CritiqueAxis,
  CritiquePort,
  CritiqueResult,
  HouseStyle,
} from "@occestra/studio-core";

export const contract = (over: Partial<CelebrateContract> = {}): CelebrateContract => ({
  id: "c_1",
  studio: "celebrate",
  styleId: "amethyst_editorial",
  createdAt: "2026-07-12T10:00:00.000Z",
  requester: "human",
  occasion: "A 30th birthday dinner",
  city: "Lisbon",
  country: "Portugal",
  date: "2026-07-18",
  headcount: 12,
  budgetUsd: 600,
  vibe: "warm, editorial, candlelit",
  constraints: [],
  deliverables: ["plan", "schedule", "budget", "invitation"],
  locale: "en",
  ...over,
});

export const sunprint: HouseStyle = {
  id: "sunprint",
  name: "Sunprint",
  version: "1.0.0",
  promptSystem: "cyanotype-inspired, botanical, nostalgic",
  palette: ["#0B2C4D", "#1E5F8C", "#8FB8D6", "#E8F1F7", "#FFFFFF"],
  typeDirection: "editorial serif",
  negativePrompt: "no neon, no gradients",
  seedStrategy: "contract_hash",
};

export const artifact = (over: Partial<Artifact> = {}): Artifact => ({
  id: "a_1",
  kind: "plan",
  title: "The plan",
  format: "json",
  data: JSON.stringify({
    date: "2026-07-18",
    summary: "Dinner, then a walk to the viewpoint.",
    claims: [],
    uncertainties: [],
  }),
  sources: [],
  version: 1,
  ...over,
});

export const jsonArtifact = (kind: Artifact["kind"], body: unknown, over: Partial<Artifact> = {}): Artifact =>
  artifact({ kind, format: "json", data: JSON.stringify(body), ...over });

/** A solid-colour PNG at an exact size — enough to exercise every image check honestly. */
export async function png(
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: color },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

export const PASSING_AXES: Record<CritiqueAxis, number> = {
  composition: 88,
  legibility: 91,
  style_fidelity: 84,
  grounding: 95,
  platform_fit: 87,
};

/** Scripted critic: yields the next queued verdict, or throws if constructed to. */
export class FakeCritique implements CritiquePort {
  public calls = 0;
  constructor(
    private readonly queue: Array<Partial<CritiqueResult> | Error>,
    private readonly fallback: Partial<CritiqueResult> = {},
  ) {}

  async judge(): Promise<CritiqueResult> {
    const next = this.queue[this.calls] ?? this.fallback;
    this.calls += 1;
    if (next instanceof Error) throw next;
    return {
      axes: { ...PASSING_AXES, ...(next.axes ?? {}) },
      issues: next.issues ?? [],
      repairBrief: next.repairBrief ?? "",
      model: next.model ?? "fake-critic-1",
    };
  }
}
