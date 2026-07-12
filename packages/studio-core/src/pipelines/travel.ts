/**
 * Travel feasibility. Pure geometry and honest arithmetic.
 *
 * The whole point: a plan that says "drinks at 19:00 across town, dinner at 19:05" is not a
 * plan, it is a lie with timestamps on it. We compute a conservative estimate of how long a
 * hop actually takes, and we label it an ESTIMATE — we are not a routing engine and we do
 * not pretend to be one. The Tribunal's SCHEDULE_OVERLAP check then enforces it.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance. Straight-line — real streets are longer, which is why we pad below. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Streets are not straight. A detour factor of 1.35 is the standard urban approximation:
 * the walked/driven distance between two points is ~35% longer than the crow flies.
 */
export const DETOUR_FACTOR = 1.35;

export type TravelMode = "walk" | "transit" | "drive";

/** Deliberately conservative speeds. Being early is not a failure; being late is. */
const SPEED_KMH: Record<TravelMode, number> = {
  walk: 4.5,
  transit: 16,
  drive: 22, // city driving, with traffic and parking reality baked in
};

/** Fixed overhead: finding the door, waiting for the car, parking, the stairs. */
const OVERHEAD_MIN: Record<TravelMode, number> = {
  walk: 3,
  transit: 8,
  drive: 7,
};

export function modeFor(distanceKm: number): TravelMode {
  if (distanceKm <= 1.2) return "walk";
  if (distanceKm <= 8) return "transit";
  return "drive";
}

export interface TravelEstimate {
  distanceKm: number;
  mode: TravelMode;
  minutes: number;
  /** Always true. Said out loud so no caller can quietly present this as a routed fact. */
  isEstimate: true;
  note: string;
}

export function estimateTravel(from: LatLng, to: LatLng): TravelEstimate {
  const straight = haversineKm(from, to);
  const distanceKm = straight * DETOUR_FACTOR;
  const mode = modeFor(distanceKm);

  const minutes = Math.ceil((distanceKm / SPEED_KMH[mode]) * 60 + OVERHEAD_MIN[mode]);

  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    mode,
    minutes,
    isEstimate: true,
    note: `about ${minutes} min by ${mode} (${distanceKm.toFixed(1)} km) — an estimate, not a routed journey`,
  };
}

/** Buffer between blocks at the same venue: people do not teleport between rooms either. */
export const SAME_VENUE_BUFFER_MIN = 5;

export interface Block {
  title: string;
  minutes: number;
  venue?: { name: string; lat?: number; lng?: number };
}

export interface TimedBlock {
  title: string;
  start: string;
  end: string;
  venue?: { name: string; lat?: number; lng?: number };
  /** Present when the guest has to physically get somewhere before this block starts. */
  travel?: TravelEstimate;
}

/**
 * Lay blocks out in real time, inserting the travel each hop actually needs.
 *
 * The result satisfies the Tribunal's SCHEDULE_OVERLAP check by construction: no two blocks
 * overlap, and no venue change is given less time than the estimate says it takes. That is
 * the point — the schedule is correct because it was BUILT correct, not because a model was
 * asked nicely.
 */
export function layOutSchedule(startIso: string, blocks: Block[]): TimedBlock[] {
  const out: TimedBlock[] = [];
  let cursor = Date.parse(startIso);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const previous = blocks[i - 1];

    let travel: TravelEstimate | undefined;

    if (previous) {
      const moved =
        previous.venue !== undefined &&
        block.venue !== undefined &&
        previous.venue.name !== block.venue.name;

      if (
        moved &&
        previous.venue?.lat !== undefined &&
        previous.venue.lng !== undefined &&
        block.venue?.lat !== undefined &&
        block.venue.lng !== undefined
      ) {
        travel = estimateTravel(
          { lat: previous.venue.lat, lng: previous.venue.lng },
          { lat: block.venue.lat, lng: block.venue.lng },
        );
        cursor += travel.minutes * 60_000;
      } else if (moved) {
        // A venue change we cannot measure still is not instantaneous. Assume a transit hop.
        cursor += 20 * 60_000;
      } else {
        cursor += SAME_VENUE_BUFFER_MIN * 60_000;
      }
    }

    const start = cursor;
    const end = start + block.minutes * 60_000;

    out.push({
      title: block.title,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      ...(block.venue ? { venue: block.venue } : {}),
      ...(travel ? { travel } : {}),
    });

    cursor = end;
  }

  return out;
}
