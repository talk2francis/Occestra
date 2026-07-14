/**
 * What time it actually is, where the occasion actually happens.
 *
 * THE BUG THIS EXISTS TO KILL. The schedule anchored every occasion at
 * `${date}T18:00:00.000Z` — while the comment beside it said "18:00 local-ish". Those are
 * not the same thing and the code knew it. For a dinner in Lisbon in August (UTC+1), an
 * 18:00Z start renders as 19:00 local: every guest who read the schedule would have
 * arrived an hour early. The Tribunal caught it on a paid run:
 *
 *   "times are stored in UTC (Z suffix). The event is in Lisbon, which in August is UTC+1.
 *    18:00Z renders as 19:00 local. A guest reading the raw JSON will see the wrong hour."
 *
 * A plan whose times are wrong is not a plan. So the start is now anchored to 18:00 IN THE
 * CITY'S OWN TIMEZONE, using the platform's real IANA database (Intl — no I/O, no network,
 * so studio-core stays pure), and the artifact says which zone it used.
 *
 * When we do not know the city's zone we say SO, and fall back to UTC. Guessing a zone is
 * the same class of mistake as guessing an exchange rate.
 */

/** Cities we serve, and the zone the clock on their wall is in. */
const CITY_ZONES: ReadonlyArray<{ re: RegExp; zone: string }> = [
  { re: /\b(lisbon|lisboa)\b/i, zone: "Europe/Lisbon" },
  { re: /\b(porto)\b/i, zone: "Europe/Lisbon" },
  { re: /\b(london|manchester|edinburgh|glasgow|bristol)\b/i, zone: "Europe/London" },
  { re: /\b(dublin)\b/i, zone: "Europe/Dublin" },
  { re: /\b(paris|lyon|marseille)\b/i, zone: "Europe/Paris" },
  { re: /\b(madrid|barcelona|valencia|seville)\b/i, zone: "Europe/Madrid" },
  { re: /\b(berlin|munich|hamburg|cologne)\b/i, zone: "Europe/Berlin" },
  { re: /\b(rome|milan|florence|naples)\b/i, zone: "Europe/Rome" },
  { re: /\b(amsterdam|rotterdam)\b/i, zone: "Europe/Amsterdam" },
  { re: /\b(brussels)\b/i, zone: "Europe/Brussels" },
  { re: /\b(vienna)\b/i, zone: "Europe/Vienna" },
  { re: /\b(athens)\b/i, zone: "Europe/Athens" },
  { re: /\b(lagos|abuja|ibadan|enugu|kano|port harcourt|benin city)\b/i, zone: "Africa/Lagos" },
  { re: /\b(accra|kumasi)\b/i, zone: "Africa/Accra" },
  { re: /\b(nairobi|mombasa)\b/i, zone: "Africa/Nairobi" },
  { re: /\b(johannesburg|cape town|durban|pretoria)\b/i, zone: "Africa/Johannesburg" },
  { re: /\b(cairo)\b/i, zone: "Africa/Cairo" },
  { re: /\b(new york|brooklyn|nyc)\b/i, zone: "America/New_York" },
  { re: /\b(boston|philadelphia|atlanta|miami|washington)\b/i, zone: "America/New_York" },
  { re: /\b(chicago|austin|dallas|houston)\b/i, zone: "America/Chicago" },
  { re: /\b(denver)\b/i, zone: "America/Denver" },
  { re: /\b(los angeles|san francisco|seattle|portland|san diego)\b/i, zone: "America/Los_Angeles" },
  { re: /\b(toronto|ottawa|montreal)\b/i, zone: "America/Toronto" },
  { re: /\b(vancouver)\b/i, zone: "America/Vancouver" },
  { re: /\b(são paulo|sao paulo|rio de janeiro)\b/i, zone: "America/Sao_Paulo" },
  { re: /\b(mexico city)\b/i, zone: "America/Mexico_City" },
  { re: /\b(dubai|abu dhabi)\b/i, zone: "Asia/Dubai" },
  { re: /\b(mumbai|delhi|bangalore|bengaluru|chennai|kolkata)\b/i, zone: "Asia/Kolkata" },
  { re: /\b(singapore)\b/i, zone: "Asia/Singapore" },
  { re: /\b(hong kong)\b/i, zone: "Asia/Hong_Kong" },
  { re: /\b(tokyo|osaka|kyoto)\b/i, zone: "Asia/Tokyo" },
  { re: /\b(seoul)\b/i, zone: "Asia/Seoul" },
  { re: /\b(sydney|melbourne|brisbane|canberra)\b/i, zone: "Australia/Sydney" },
  { re: /\b(perth)\b/i, zone: "Australia/Perth" },
  { re: /\b(auckland|wellington)\b/i, zone: "Pacific/Auckland" },
];

export function zoneFor(city: string): string | undefined {
  return CITY_ZONES.find((entry) => entry.re.test(city))?.zone;
}

/** How far a zone is from UTC at a given instant — DST included, because the platform knows. */
function offsetMsAt(zone: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));

  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // What the wall clock in `zone` reads, expressed as if it were UTC.
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - at;
}

/**
 * The UTC instant at which the clock in `zone` reads `date` at `hour`:00.
 *
 * Solved rather than assumed: take the naive guess, ask the zone what it would call that
 * instant, and correct by the difference. Once more, because on a DST boundary the first
 * correction can land in the other side of the transition.
 */
export function localTimeToInstant(dateIso: string, hour: number, zone: string): number {
  const naive = Date.parse(`${dateIso.slice(0, 10)}T${String(hour).padStart(2, "0")}:00:00.000Z`);

  let instant = naive - offsetMsAt(zone, naive);
  instant = naive - offsetMsAt(zone, instant);
  return instant;
}

/** "19:00" as the people in that city would read it. */
export function wallClock(instant: string | number, zone: string): string {
  const at = typeof instant === "string" ? Date.parse(instant) : instant;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at));
}
