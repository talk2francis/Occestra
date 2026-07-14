/**
 * The CELEBRATE studio, at depth.
 *
 * The discipline that makes this different from "an LLM wrote a party plan":
 *
 *  - The SCHEDULE is not written by a model. A model proposes blocks; the schedule is LAID
 *    OUT arithmetically, with real travel estimates between real coordinates. It satisfies
 *    the Tribunal's overlap check by construction, not by luck.
 *  - The BUDGET is not written by a model either. A model proposes weights; the line items
 *    are computed and the remainder is forced into the last item so it sums exactly.
 *  - Every model step is strict JSON against a zod schema. A parse failure repairs once and
 *    then degrades THAT ARTIFACT with a coverage gap — it never sinks the pack.
 *  - Every fact about the world (a venue, a forecast) carries its source and retrieval time,
 *    and nothing is ever described as booked.
 *
 * Pure orchestration: everything that touches the world arrives as a port.
 */
import { z } from "zod";
import { PolicyGate } from "../policy.js";
import { newKeepsakeId } from "../ids.js";
import {
  type Artifact,
  type ArtifactKind,
  type CelebrateContract,
  type ClockPort,
  type GradePort,
  type HouseStyle,
  type HouseStyleId,
  type ImageModelPort,
  type Pack,
  type Place,
  type PlacesPort,
  type PlanClaim,
  type SourceTag,
  type StoragePort,
  type TextModelPort,
  type WeatherPort,
} from "../types.js";
import { estimateTravel, layOutSchedule, type Block, type TimedBlock } from "./travel.js";
import {
  classifyImageFailure,
  ensureStored,
  imageQualityFor,
  isUndelivered,
  qualityOf,
  undeliveredArtifact,
} from "./delivery.js";

/* --------------------------------------------------------------------- deps */

export interface CelebrateDeps {
  text: TextModelPort;
  image: ImageModelPort;
  storage: StoragePort;
  clock: ClockPort;
  places?: PlacesPort;
  weather?: WeatherPort;
  /** Injected Tribunal. Absent = artifacts ship ungraded, and the pack says so. */
  grader?: GradePort;
  /** Resolves a House Style id to its definition (lives in @occestra/providers). */
  styleFor?: (id: HouseStyleId) => HouseStyle;
  /** Raw provider errors go here — never into a pack. See delivery.ts. */
  log?: ((message: string, detail?: unknown) => void) | undefined;
}

export class PolicyRefusal extends Error {
  override readonly name = "PolicyRefusal";
  constructor(public readonly politeMessage: string) {
    super(politeMessage);
  }
}

/* ------------------------------------------------------- strict json (pure) */

/**
 * Ask a model for JSON, validate it, and repair exactly once. Two failures and we give up
 * on that artifact rather than paying for the same mistake forever. Returns undefined so the
 * caller degrades instead of throwing.
 */
async function askJson<T>(
  deps: CelebrateDeps,
  args: {
    role: "planner" | "researcher" | "art_director" | "writer" | "critic" | "archivist";
    system: string;
    prompt: string;
    /** Input is `unknown` on purpose: schemas here transform, so T must be the OUTPUT type. */
    schema: z.ZodType<T, z.ZodTypeDef, unknown>;
    maxTokens?: number;
    temperature?: number;
  },
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  const call = async (repairNote?: string): Promise<string> => {
    const result = await deps.text.complete({
      role: args.role,
      system: args.system,
      prompt: repairNote ? `${args.prompt}\n\n${repairNote}` : args.prompt,
      json: true,
      maxTokens: args.maxTokens ?? 1200,
      temperature: args.temperature ?? 0.6,
    });
    return result.text;
  };

  const parse = (text: string): { ok: true; value: T } | { ok: false; error: string } => {
    // Models fence, preface, and apologise. Take the outermost object.
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
    const body = (fenced ?? text).trim();
    const start = body.search(/[[{]/);
    const open = body[start];
    const close = open === "[" ? "]" : "}";
    const end = body.lastIndexOf(close);
    const candidate = start >= 0 && end > start ? body.slice(start, end + 1) : body;

    try {
      const parsed = args.schema.safeParse(JSON.parse(candidate));
      if (parsed.success) return { ok: true, value: parsed.data };
      return {
        ok: false,
        error: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; "),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  try {
    const first = parse(await call());
    if (first.ok) return first;

    const second = parse(
      await call(
        `Your previous reply could not be used. It failed validation with: ${first.error}\n\nReply with ONLY the corrected JSON. No prose, no code fence.`,
      ),
    );
    if (second.ok) return second;

    return { ok: false, error: `after one repair: ${second.error}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/* ------------------------------------------------------------- 1. work order */

const WorkOrderSchema = z.object({
  /** How the host should think about the whole thing, in one line. */
  throughline: z.string().min(4).max(240),
  /** What kind of place this occasion actually needs. Drives the venue search. */
  venueQueries: z.array(z.string().min(2).max(60)).min(1).max(3),
  /** Ordered blocks. Durations in minutes; the SCHEDULE is laid out from these, not by the model. */
  blocks: z
    .array(
      z.object({
        title: z.string().min(2).max(80),
        minutes: z.number().int().min(10).max(360),
        /** 0-based index into the venue shortlist, or null to stay where we are. */
        venueIndex: z.number().int().min(0).max(9).nullable(),
      }),
    )
    .min(2)
    .max(8),
  /**
   * Budget weights by label. Normalised and forced to sum — the model never does arithmetic.
   *
   * Accepts BOTH shapes models actually emit: a list of {label, weight}, or the plain map
   * {"Food": 0.6, "Drinks": 0.25} they reach for instinctively. Fighting that instinct just
   * burns a repair round-trip to arrive at the same information.
   */
  budgetWeights: z
    .union([
      z.array(z.object({ label: z.string().min(2).max(60), weight: z.number().min(0).max(1) })),
      z.record(z.string(), z.number()),
    ])
    .transform((value) =>
      Array.isArray(value)
        ? value
        : Object.entries(value).map(([label, weight]) => ({ label, weight })),
    )
    .refine((value) => value.length >= 2 && value.length <= 8, "give between 2 and 8 budget lines"),
  prepChecklist: z.array(z.string().min(4).max(160)).min(2).max(10),
  /** What could actually go wrong for THIS occasion, not generic advice. */
  risks: z.array(z.string().min(4).max(200)).min(1).max(5),
});

export type WorkOrder = z.infer<typeof WorkOrderSchema>;

const WORK_ORDER_SYSTEM = [
  "You are the planner in an occasion studio. You turn a brief into an internal work order that other specialists execute. You are not writing prose for the client — you are writing instructions.",
  "",
  "Rules:",
  "- venueQueries: what KIND of place is needed, in the words a local would use ('wine bar', 'rooftop terrace', 'park with shade'). Not names of specific places — you do not know any.",
  "- blocks: the real shape of the occasion in order. Durations must be humane: people need to arrive, eat, and say goodbye. Do not schedule the toast before the food.",
  "- budgetWeights: fractions of the total (they will be normalised). Reflect what this occasion actually costs — a picnic is not a plated dinner.",
  "- risks: what could genuinely go wrong for THIS occasion in THIS place at THIS time of year. Not 'people might be late'. Something a host would actually lose sleep over.",
  "- prepChecklist: what the host must DO, in the order they must do it.",
  "",
  "Invent no facts about specific venues, prices, or weather. You will be given real ones.",
  "",
  "Return EXACTLY this JSON SHAPE. Every key is required.",
  "",
  "The angle brackets below are placeholders describing what belongs there. They are NOT",
  "example content: never echo these words back, and never reuse a phrase from this template.",
  "Everything you return must be about the specific occasion you were given.",
  JSON.stringify(
    {
      throughline: "<one sentence: how the host should think about this whole occasion>",
      venueQueries: ["<kind of place, as a local would say it>", "<a second kind, if needed>"],
      blocks: [
        { title: "<what happens in this stretch>", minutes: 45, venueIndex: 0 },
        { title: "<the next stretch>", minutes: 110, venueIndex: 1 },
      ],
      budgetWeights: [
        { label: "<what the money goes on>", weight: 0.6 },
        { label: "<the next thing>", weight: 0.4 },
      ],
      prepChecklist: ["<what the host must do first>", "<and next>"],
      risks: ["<what could genuinely go wrong for THIS occasion, in THIS place, at THIS time of year>"],
    },
    null,
    2,
  ),
].join("\n");

/* --------------------------------------------------------------- 2. research */

export interface Research {
  venues: Place[];
  weather?: {
    summary: string;
    tempC: { min: number; max: number };
    precipitationChance: number;
    source: SourceTag;
  };
  /** True when the date is past any real forecast horizon and we said so instead of guessing. */
  beyondForecastHorizon: boolean;
  claims: PlanClaim[];
  sources: SourceTag[];
  gaps: string[];
}

const FORECAST_HORIZON_DAYS = 14;

async function research(
  deps: CelebrateDeps,
  contract: CelebrateContract,
  queries: string[],
): Promise<Research> {
  const claims: PlanClaim[] = [];
  const sources: SourceTag[] = [];
  const gaps: string[] = [];
  const venues: Place[] = [];

  /* --- venues: category-aware, deduplicated, each carrying its source --- */

  if (deps.places) {
    for (const query of queries.slice(0, 3)) {
      try {
        const found = await deps.places.search({
          query,
          city: contract.city,
          limit: 4,
        });

        for (const place of found) {
          if (venues.some((existing) => existing.name === place.name)) continue;
          venues.push(place);

          claims.push({
            text: `${place.name} — ${place.address}. A candidate for "${query}". NOT booked, NOT confirmed: call them yourself.`,
            grounded: true,
            source: place.source,
          });
          sources.push(place.source);
        }
      } catch (error) {
        gaps.push(
          `places:${query.replace(/\s+/g, "-")}-failed — ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } else {
    gaps.push("places:no-provider — this plan is not grounded in real venues");
  }

  if (venues.length === 0 && deps.places) {
    gaps.push(`places:none-found — nothing matched in ${contract.city}; the plan names no real venue`);
  }

  /* --- weather: only if a forecast can HONESTLY exist for that date --- */

  const daysOut = Math.round(
    (Date.parse(`${contract.date.slice(0, 10)}T12:00:00Z`) - deps.clock.now()) / 86_400_000,
  );
  const beyondForecastHorizon = daysOut > FORECAST_HORIZON_DAYS;

  let weather: Research["weather"];

  if (beyondForecastHorizon) {
    gaps.push(
      `weather:beyond-horizon — the occasion is ${daysOut} days out and no real forecast exists that far ahead; the plan says so rather than inventing one`,
    );
  } else {
    const anchor = venues.find((venue) => venue.lat !== undefined && venue.lng !== undefined);

    if (!anchor || !deps.weather) {
      gaps.push("weather:no-anchor — no venue coordinates were available to anchor a forecast");
    } else {
      try {
        const forecast = await deps.weather.forecast(anchor.lat!, anchor.lng!, contract.date);
        weather = forecast;
        claims.push({
          text: `Forecast for ${contract.date} near ${anchor.name}: ${forecast.summary}.`,
          grounded: true,
          source: forecast.source,
        });
        sources.push(forecast.source);
      } catch (error) {
        gaps.push(
          `weather:unavailable — ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return { venues, ...(weather ? { weather } : {}), beyondForecastHorizon, claims, sources, gaps };
}

/* -------------------------------------------------------------- 3. artifacts */

const artifactOf = (
  over: Partial<Artifact> & Pick<Artifact, "id" | "kind" | "title" | "format">,
): Artifact => ({ sources: [], version: 1, ...over });

/** Rain is likely enough to plan around at 40%. Below that it is a note, not a branch. */
const RAIN_THRESHOLD = 40;

function buildSchedule(
  contract: CelebrateContract,
  order: WorkOrder,
  venues: Place[],
): { artifact: Artifact; timed: TimedBlock[] } {
  const blocks: Block[] = order.blocks.map((block) => {
    const venue = block.venueIndex !== null ? venues[block.venueIndex] : undefined;
    return {
      title: block.title,
      minutes: block.minutes,
      ...(venue
        ? {
            venue: {
              name: venue.name,
              ...(venue.lat !== undefined ? { lat: venue.lat } : {}),
              ...(venue.lng !== undefined ? { lng: venue.lng } : {}),
            },
          }
        : {}),
    };
  });

  // 18:00 local-ish is the honest default for an evening occasion; a model guessing a start
  // time adds nothing and can contradict the date.
  const timed = layOutSchedule(`${contract.date.slice(0, 10)}T18:00:00.000Z`, blocks);

  return {
    timed,
    artifact: artifactOf({
      id: "schedule",
      kind: "schedule",
      title: "Running order",
      format: "json",
      data: JSON.stringify({
        items: timed.map((block) => ({
          title: block.title,
          start: block.start,
          end: block.end,
          ...(block.venue ? { venue: block.venue } : {}),
        })),
      }),
    }),
  };
}

function buildBudget(contract: CelebrateContract, order: WorkOrder): Artifact {
  const total = contract.budgetUsd ?? contract.headcount * 45;

  const weightSum = order.budgetWeights.reduce((sum, item) => sum + item.weight, 0) || 1;

  const items = order.budgetWeights.map((item) => ({
    label: item.label,
    amount: Math.round(((item.weight / weightSum) * total * 100)) / 100,
  }));

  // Rounding always leaves a few cents. Force the remainder into the last line so the
  // budget sums EXACTLY — the Tribunal hard-fails a mismatch, and it is right to.
  const running = items.slice(0, -1).reduce((sum, item) => sum + item.amount, 0);
  const last = items[items.length - 1];
  if (last) last.amount = Math.round((total - running) * 100) / 100;

  return artifactOf({
    id: "budget",
    kind: "budget",
    title: "Budget",
    format: "json",
    data: JSON.stringify({ currency: "USD", total, lineItems: items }),
  });
}

function buildContingency(
  contract: CelebrateContract,
  order: WorkOrder,
  research: Research,
  venues: Place[],
): Artifact {
  const lines: string[] = ["## If it goes wrong", ""];

  /* --- the weather branch is keyed to the REAL forecast, not to a generic worry --- */

  if (research.beyondForecastHorizon) {
    lines.push(
      `- **The weather.** ${contract.date} is too far out for any real forecast to exist, so this plan does not pretend to know. Check it about ten days before, and hold an indoor option until you do.`,
    );
  } else if (research.weather) {
    const rain = research.weather.precipitationChance;
    if (rain >= RAIN_THRESHOLD) {
      lines.push(
        `- **Rain is likely (${rain}%).** This is not a footnote — plan for it. Make the indoor space the PRIMARY plan and treat outdoors as the upgrade if the day is kind. Confirm the venue has covered seating for ${contract.headcount} before you commit.`,
      );
    } else {
      lines.push(
        `- **The weather looks workable (${rain}% chance of rain, ${Math.round(research.weather.tempC.min)}–${Math.round(research.weather.tempC.max)}°C).** Keep an indoor table held until the morning of; do not cancel it early.`,
      );
    }
  } else {
    lines.push(
      "- **The weather could not be retrieved**, so this plan is not weather-informed. Check it yourself before you commit to anything outdoors.",
    );
  }

  /* --- venue fallback, in the order to actually call them --- */

  if (venues.length > 1) {
    lines.push(
      `- **The venue cannot take you.** Nothing here is booked. Call in this order: ${venues
        .slice(0, 4)
        .map((venue, index) => `${index + 1}. ${venue.name}`)
        .join("  ")}. If the first three are gone, move the time before you move the place.`,
    );
  } else {
    lines.push(
      "- **The venue cannot take you.** We could not build a real shortlist, so you have no fallback — find a second option before you rely on the first.",
    );
  }

  lines.push(
    `- **People do not show.** You are planning for ${contract.headcount}. Confirm heads 48 hours out; most venues will let you drop a couple of covers that late, and none of them will let you add six.`,
  );

  if (contract.constraints.length > 0) {
    lines.push(
      `- **The constraints you gave us.** ${contract.constraints.join("; ")}. Say this to the kitchen when you book, not when you arrive.`,
    );
  }

  for (const risk of order.risks) {
    lines.push(`- **${risk}**`);
  }

  return artifactOf({
    id: "contingency",
    kind: "contingency",
    title: "If it goes wrong",
    format: "md",
    data: lines.join("\n"),
  });
}

/** A self-contained page a host can send to guests. No scripts, no tracking, no CDN. */
function buildGuestGuide(
  contract: CelebrateContract,
  timed: TimedBlock[],
  research: Research,
  style: HouseStyle | undefined,
): Artifact {
  const ground = style?.palette[0] ?? "#FAF7F2";
  const ink = style?.palette[2] ?? "#17141A";
  const accent = style?.palette[4] ?? "#6B3FA0";

  const time = (iso: string): string => iso.slice(11, 16);

  const rows = timed
    .map((block) => {
      const mapLink = block.venue?.lat
        ? ` &middot; <a href="https://www.openstreetmap.org/?mlat=${block.venue.lat}&mlon=${block.venue.lng}#map=18/${block.venue.lat}/${block.venue.lng}">map</a>`
        : "";
      const travel = block.travel
        ? `<div class="travel">${escapeHtml(block.travel.note)}</div>`
        : "";
      return `      <tr>
        <td class="t">${time(block.start)}–${time(block.end)}</td>
        <td><div class="what">${escapeHtml(block.title)}</div>${
          block.venue ? `<div class="where">${escapeHtml(block.venue.name)}${mapLink}</div>` : ""
        }${travel}</td>
      </tr>`;
    })
    .join("\n");

  const weatherLine = research.beyondForecastHorizon
    ? "The forecast does not reach this far ahead yet — we will not guess it."
    : research.weather
      ? escapeHtml(research.weather.summary)
      : "The forecast could not be retrieved.";

  const html = `<!doctype html>
<html lang="${contract.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(contract.occasion)}</title>
<style>
  :root { --ground:${ground}; --ink:${ink}; --accent:${accent}; }
  *{box-sizing:border-box}
  body{margin:0;background:var(--ground);color:var(--ink);font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.55;padding:6vh 6vw}
  main{max-width:36rem;margin:0 auto}
  h1{font-family:ui-serif,Georgia,serif;font-weight:400;font-size:clamp(2rem,6vw,3rem);line-height:1.1;margin:0 0 .4rem}
  .sub{color:var(--accent);font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;margin:0 0 2rem}
  table{width:100%;border-collapse:collapse;margin:0 0 2rem}
  td{padding:.85rem 0;border-top:1px solid rgba(0,0,0,.1);vertical-align:top}
  td.t{width:7.5rem;font-variant-numeric:tabular-nums;color:var(--accent);white-space:nowrap}
  .what{font-weight:600}
  .where{font-size:.9rem;opacity:.75}
  .travel{font-size:.8rem;opacity:.6;margin-top:.25rem}
  h2{font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin:2rem 0 .6rem}
  p,li{font-size:.95rem}
  a{color:var(--accent)}
  footer{margin-top:3rem;font-size:.8rem;opacity:.55}
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(contract.occasion)}</h1>
  <p class="sub">${escapeHtml(contract.date.slice(0, 10))} &middot; ${escapeHtml(contract.city)}</p>

  <table>
${rows}
  </table>

  <h2>Weather</h2>
  <p>${weatherLine}</p>

  <h2>What to wear</h2>
  <p>${escapeHtml(contract.vibe)}. Dress for the room, not for the photo.</p>

  ${
    contract.constraints.length > 0
      ? `<h2>Good to know</h2>\n  <ul>${contract.constraints
          .map((c) => `<li>${escapeHtml(c)}</li>`)
          .join("")}</ul>`
      : ""
  }

  <h2>Questions</h2>
  <ul>
    <li><strong>Am I late?</strong> Arrive at the first time above. The schedule has slack, but not much.</li>
    <li><strong>Is it booked?</strong> The host is confirming venues — nothing on this page is a reservation.</li>
  </ul>

  <footer>Made by Occestra. Times and travel are estimates, not routed journeys.</footer>
</main>
</body>
</html>`;

  return artifactOf({
    id: "guest_guide",
    kind: "guest_guide",
    title: `${contract.occasion} — guest guide`,
    format: "html",
    data: html,
    // We chose these colours, so the Tribunal can check their contrast for real rather than
    // recording a "not checkable" gap. Declaring what we actually did is free honesty.
    spec: {
      layers: [
        { role: "body", fg: ink, bg: ground, body: true },
        { role: "accent", fg: accent, bg: ground, body: false },
      ],
    },
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------ the pipeline */

export interface CelebrateResult {
  pack: Pack;
  workOrder?: WorkOrder;
}

export async function runCelebrate(
  contract: CelebrateContract,
  deps: CelebrateDeps,
): Promise<CelebrateResult> {
  /* --- policy first. A refused brief costs the caller nothing. --- */

  const verdict = PolicyGate.screenBrief(contract);
  if (!verdict.allowed) throw new PolicyRefusal(PolicyGate.message(verdict));

  const gaps: string[] = [];
  const wanted = new Set<ArtifactKind>(contract.deliverables);
  const style = deps.styleFor?.(contract.styleId);

  /* --- 1. work order --- */

  const orderResult = await askJson(deps, {
    role: "planner",
    system: WORK_ORDER_SYSTEM,
    schema: WorkOrderSchema,
    maxTokens: 1200,
    prompt: [
      `Occasion: ${contract.occasion}`,
      `City: ${contract.city}${contract.country ? `, ${contract.country}` : ""}`,
      `Date: ${contract.date}`,
      `Headcount: ${contract.headcount}`,
      `Vibe: ${contract.vibe}`,
      contract.budgetUsd !== undefined ? `Budget: $${contract.budgetUsd} total` : "Budget: not stated — assume modest",
      contract.constraints.length > 0 ? `Constraints: ${contract.constraints.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  // Without a work order there is no occasion. Fall back to a defensible default rather
  // than failing the caller's paid call outright.
  const order: WorkOrder = orderResult.ok
    ? orderResult.value
    : {
        throughline: contract.vibe,
        venueQueries: [contract.vibe],
        blocks: [
          { title: "Arrival", minutes: 45, venueIndex: 0 },
          { title: "The main event", minutes: 120, venueIndex: 0 },
          { title: "Goodbyes", minutes: 30, venueIndex: 0 },
        ],
        budgetWeights: [
          { label: "Food", weight: 0.6 },
          { label: "Drinks", weight: 0.25 },
          { label: "Everything else", weight: 0.15 },
        ],
        prepChecklist: ["Call the venue", "Confirm the headcount", "Confirm dietary needs"],
        risks: ["The venue is not booked yet."],
      };

  if (!orderResult.ok) {
    gaps.push(
      `planner:degraded — the planning model did not return usable JSON (${orderResult.error}); this plan uses a generic shape rather than one designed for your occasion`,
    );
  }

  /* --- 2. grounded research --- */

  const found = await research(deps, contract, order.venueQueries);
  gaps.push(...found.gaps);

  /* --- 3. artifacts --- */

  const artifacts: Artifact[] = [];
  const { artifact: scheduleArtifact, timed } = buildSchedule(contract, order, found.venues);

  if (wanted.has("plan")) {
    const summary = [
      order.throughline,
      "",
      `${contract.occasion} — ${contract.city}, ${contract.date.slice(0, 10)}, ${contract.headcount} people.`,
      found.venues.length > 0
        ? `${found.venues.length} real candidate venues are shortlisted below, each with the source we found it in. None of them is booked.`
        : "No real venues could be shortlisted, so this plan does not name any.",
      found.weather
        ? `Forecast: ${found.weather.summary}.`
        : found.beyondForecastHorizon
          ? "The date is beyond any real forecast horizon, so this plan does not claim to know the weather."
          : "The forecast could not be retrieved.",
    ].join("\n");

    artifacts.push(
      artifactOf({
        id: "plan",
        kind: "plan",
        title: `${contract.occasion} — the plan`,
        format: "json",
        sources: found.sources,
        data: JSON.stringify({
          date: contract.date.slice(0, 10),
          summary,
          claims: found.claims,
          uncertainties: [
            "No venue here is booked. Every one is a candidate you still have to call.",
            ...(found.beyondForecastHorizon
              ? ["The weather for this date cannot be known yet."]
              : []),
            ...(found.venues.length === 0 ? ["This plan names no real place."] : []),
          ],
          prepChecklist: order.prepChecklist,
        }),
      }),
    );
  }

  if (wanted.has("schedule")) artifacts.push(scheduleArtifact);
  if (wanted.has("budget")) artifacts.push(buildBudget(contract, order));
  if (wanted.has("contingency")) {
    artifacts.push(buildContingency(contract, order, found, found.venues));
  }
  if (wanted.has("guest_guide")) {
    artifacts.push(buildGuestGuide(contract, timed, found, style));
  }

  /* --- the invitation suite --- */

  const keepsakeId = newKeepsakeId(deps.clock.now());

  /** Artifact id -> how to remake it from a repair brief. */
  const regenerators = new Map<string, (brief: string, previous: Artifact) => Promise<Artifact>>();
  const repairSuffix = (brief: string): string =>
    `\n\nTHE TRIBUNAL REJECTED YOUR PREVIOUS ATTEMPT. Fix exactly this, then produce it again:\n${brief}`;

  if (wanted.has("invitation")) {
    const size = "1024x1536";
    try {
      const styleSystem = style
        ? [
            `HOUSE STYLE: ${style.name} (v${style.version})`,
            style.promptSystem,
            `PALETTE (stay inside it): ${style.palette.join(", ")}`,
            `NEVER: ${style.negativePrompt}`,
          ].join("\n")
        : "";

      const inviteSubject = [
        styleSystem,
        "",
        "SUBJECT:",
        `An invitation artwork for: ${contract.occasion}, in ${contract.city}.`,
        `The feeling: ${contract.vibe}.`,
        "No text, no lettering, no numerals anywhere in the image — the type is set separately.",
      ].join("\n");

      const generated = await deps.image.generate({
        prompt: inviteSubject,
        ...(style ? { negative: style.negativePrompt } : {}),
        size,
        quality: imageQualityFor("invitation"),
      });

      const uri = `invites/${keepsakeId}.png`;
      await deps.storage.put(uri, Buffer.from(generated.pngBase64, "base64"), "image/png");
      await ensureStored(deps.storage, uri);

      regenerators.set("invitation", async (brief, previous) => {
        const redone = await deps.image.generate({
          prompt: inviteSubject + repairSuffix(brief),
          ...(style ? { negative: style.negativePrompt } : {}),
          size,
          quality: imageQualityFor("invitation", { repair: true }),
        });
        await deps.storage.put(uri, Buffer.from(redone.pngBase64, "base64"), "image/png");
        return { ...previous };
      });

      artifacts.push(
        artifactOf({
          id: "invitation",
          kind: "invitation",
          title: `${contract.occasion} — invitation`,
          format: "png",
          uri,
          styleId: contract.styleId,
          spec: {
            size,
            layers: [
              {
                role: "body",
                fg: style?.palette[2] ?? "#17141A",
                bg: style?.palette[0] ?? "#FAF7F2",
                body: true,
              },
            ],
          },
        }),
      );
    } catch (error) {
      deps.log?.("invitation image failed", error);
      const undelivered = classifyImageFailure(error);
      artifacts.push(
        undeliveredArtifact(
          {
            id: "invitation",
            kind: "invitation",
            title: `${contract.occasion} — invitation`,
            format: "png",
          },
          undelivered,
        ),
      );
      gaps.push(`${undelivered.code} — ${undelivered.reason} The copy below ships without artwork.`);
    }

    /* --- three copy variants + a plain-text version that survives any email client --- */

    const when = `${contract.date.slice(0, 10)}${contract.city ? `, ${contract.city}` : ""}`;

    const CopySchema = z.object({
      warm: z.string().min(10).max(400),
      formal: z.string().min(10).max(400),
      plain: z.string().min(10).max(400),
    });

    const copy = await askJson(deps, {
      role: "writer",
      system: [
        "You write invitation copy in three registers for the same occasion. Warm (how a friend would say it), Formal (how it would be engraved), Plain (how you would text it).",
        "Each is at most three short lines. No cliches: no 'join us as we', no 'the pleasure of your company is requested' unless the formal one earns it, no 'save the date' filler.",
        "State the date and place. Do not invent a dress code, a gift registry, or a time you were not given.",
        'Return {"warm":"...","formal":"...","plain":"..."}',
      ].join("\n"),
      schema: CopySchema,
      temperature: 0.85,
      maxTokens: 600,
      prompt: `Occasion: ${contract.occasion}\nWhen and where: ${when}\nVibe: ${contract.vibe}\nHeadcount: ${contract.headcount}`,
    });

    if (copy.ok) {
      artifacts.push(
        artifactOf({
          id: "invitation_copy",
          kind: "invitation",
          title: "Invitation copy — three variants",
          format: "md",
          data: [
            "### Warm",
            copy.value.warm,
            "",
            "### Formal",
            copy.value.formal,
            "",
            "### Plain",
            copy.value.plain,
            "",
            "### Plain text (paste anywhere)",
            "```",
            `${contract.occasion}`,
            `${when}`,
            "",
            copy.value.plain,
            "```",
          ].join("\n"),
        }),
      );
    } else {
      gaps.push(`invitation:copy-degraded — ${copy.error}`);
    }
  }

  /* --- toast --- */

  if (wanted.has("toast")) {
    try {
      const written = await deps.text.complete({
        role: "writer",
        system: [
          "You write a short toast that can be said out loud at this occasion. Sayable, specific, unsentimental. Short sentences. A landing you can hear coming.",
          "Use ONLY what you were told. Invent no memories, no names, no shared jokes.",
          "Return markdown with '## The toast' and '## The short version'.",
        ].join("\n"),
        prompt: `Occasion: ${contract.occasion}\nCity: ${contract.city}\nVibe: ${contract.vibe}\nHeadcount: ${contract.headcount}`,
        maxTokens: 600,
        temperature: 0.8,
      });

      artifacts.push(
        artifactOf({
          id: "toast",
          kind: "toast",
          title: "A toast",
          format: "md",
          data: written.text,
        }),
      );
    } catch (error) {
      gaps.push(`toast:failed — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* --- moodboard --- */

  if (wanted.has("moodboard") && style) {
    try {
      const generated = await deps.image.generate({
        prompt: [
          `HOUSE STYLE: ${style.name}`,
          style.promptSystem,
          `PALETTE: ${style.palette.join(", ")}`,
          "",
          "SUBJECT:",
          `A moodboard sheet for ${contract.occasion} in ${contract.city}. Four vignettes in a 2x2 grid: a material close-up, a wider scene, a detail of light, and an object. The feeling: ${contract.vibe}.`,
          "No text, no lettering anywhere.",
        ].join("\n"),
        negative: style.negativePrompt,
        size: "1024x1024",
        quality: imageQualityFor("moodboard"),
      });

      const uri = `moodboards/${keepsakeId}.png`;
      await deps.storage.put(uri, Buffer.from(generated.pngBase64, "base64"), "image/png");
      await ensureStored(deps.storage, uri);

      artifacts.push(
        artifactOf({
          id: "moodboard",
          kind: "moodboard",
          title: `${contract.occasion} — moodboard`,
          format: "png",
          uri,
          styleId: contract.styleId,
          spec: { size: "1024x1024" },
        }),
      );
    } catch (error) {
      deps.log?.("moodboard image failed", error);
      const undelivered = classifyImageFailure(error);
      artifacts.push(
        undeliveredArtifact(
          {
            id: "moodboard",
            kind: "moodboard",
            title: `${contract.occasion} — moodboard`,
            format: "png",
          },
          undelivered,
        ),
      );
      gaps.push(`${undelivered.code} — ${undelivered.reason}`);
    }
  }

  /* --- 4. the Tribunal, over EVERY artifact --- */

  const graded: Artifact[] = [];
  let passed = 0;
  let repairs = 0;
  let gradedCount = 0;

  for (const artifact of artifacts) {
    // Undelivered work is absent, not failing. It rides along so the shortfall is
    // visible, and it is counted on neither side of the pass rate.
    if (isUndelivered(artifact) || !deps.grader) {
      graded.push(artifact);
      continue;
    }

    // Hand the Tribunal a way to ACT on its own repair brief. Without this the loop is
    // inert: it grades, fails, writes a brief, and ships the artifact unrepaired anyway.
    const regenerate = regenerators.get(artifact.id);

    const result = await deps.grader.grade({
      artifact,
      contract,
      ...(contract.styleId ? { styleId: contract.styleId } : {}),
      ...(regenerate ? { regenerate } : {}),
    });

    graded.push(result.artifact);
    gradedCount += 1;
    if (result.pass) passed += 1;
    repairs += result.repairs;
    gaps.push(...result.coverageGaps);
  }

  if (!deps.grader) {
    gaps.push("tribunal:not-wired — these artifacts were produced but NOT graded");
  }

  /* --- 5. the pack --- */

  const pack: Pack = {
    id: keepsakeId,
    contractId: contract.id,
    studio: "celebrate",
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

  return { pack, ...(orderResult.ok ? { workOrder: order } : {}) };
}

export { estimateTravel, layOutSchedule };
