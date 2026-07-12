/**
 * Places, grounded in OpenStreetMap (free, keyless) with an optional Google Places upgrade.
 *
 * Two rules that come straight from the hard rules in AGENTS.md:
 *  - Every place carries the source it came from and when. No exceptions.
 *  - A place existing is NOT a booking. Nothing here ever says "reserved" or "confirmed".
 */
import { z } from "zod";
import type { Place, PlaceQuery, PlacesPort, SourceTag } from "@occestra/studio-core";
import { fetchJson } from "../http.js";
import { TTL, TtlCache } from "../cache.js";

/** Nominatim's usage policy requires a real, identifying User-Agent. Be a good citizen. */
const USER_AGENT = "Occestra/0.1 (occasion studio; https://occestra.xyz)";

const NominatimSchema = z.array(
  z.object({
    lat: z.string(),
    lon: z.string(),
    display_name: z.string(),
  }),
);

const OverpassSchema = z.object({
  elements: z.array(
    z.object({
      type: z.string(),
      id: z.number(),
      lat: z.number().optional(),
      lon: z.number().optional(),
      center: z.object({ lat: z.number(), lon: z.number() }).optional(),
      tags: z.record(z.string()).optional(),
    }),
  ),
});

export interface Geocode {
  lat: number;
  lng: number;
  displayName: string;
}

/** Map a plain-language query onto OSM tags. Anything unmatched falls back to a name search. */
const CATEGORY_TAGS: Array<{ match: RegExp; filter: string }> = [
  { match: /\b(restaurant|dinner|dining|eat|food|meal)\b/i, filter: '["amenity"="restaurant"]' },
  { match: /\b(bar|cocktail|drinks|pub|wine)\b/i, filter: '["amenity"="bar"]' },
  { match: /\b(cafe|coffee|brunch|breakfast|pastry|bakery)\b/i, filter: '["amenity"="cafe"]' },
  { match: /\b(park|garden|picnic|green)\b/i, filter: '["leisure"="park"]' },
  { match: /\b(museum|gallery|exhibition|art)\b/i, filter: '["tourism"="museum"]' },
  { match: /\b(viewpoint|view|lookout|sunset|panorama)\b/i, filter: '["tourism"="viewpoint"]' },
  { match: /\b(hotel|stay|accommodation)\b/i, filter: '["tourism"="hotel"]' },
  { match: /\b(venue|hall|event|party)\b/i, filter: '["amenity"="events_venue"]' },
  { match: /\b(club|dancing|nightlife)\b/i, filter: '["amenity"="nightclub"]' },
  { match: /\b(florist|flowers)\b/i, filter: '["shop"="florist"]' },
];

function filterFor(query: string): string {
  return CATEGORY_TAGS.find(({ match }) => match.test(query))?.filter ?? '["amenity"="restaurant"]';
}

/**
 * OpenStreetMap has no ratings, so we cannot rank by quality — and we will not invent a
 * score we do not have. What we CAN do is rank by the signals actually present in the data:
 *
 *  - A venue whose owner filled in the address, website, phone, cuisine and opening hours is
 *    a venue someone cares about. Tag completeness is a real, honest proxy for that.
 *  - A global fast-food chain is almost never the answer to "warm, candlelit, a long table",
 *    and Overpass will happily hand you a Pizza Hut. Demote them.
 *
 * This changes the ORDER we present real venues in. It never invents one, and never claims
 * a quality judgement we have no basis for.
 */
const CHAINS = [
  "mcdonald",
  "burger king",
  "kfc",
  "pizza hut",
  "domino",
  "subway",
  "starbucks",
  "hard rock cafe",
  "tgi friday",
  "papa john",
  "taco bell",
  "wendy",
  "dunkin",
  "costa coffee",
  "five guys",
  "chipotle",
  "nando",
  "wagamama",
];

const QUALITY_TAGS = [
  "addr:street",
  "website",
  "phone",
  "opening_hours",
  "cuisine",
  "outdoor_seating",
  "reservation",
  "wheelchair",
];

export function venueScore(tags: Record<string, string>): number {
  const name = (tags["name"] ?? "").toLowerCase();

  // A chain is still a real place — it just goes to the bottom, not off the list.
  const chainPenalty = CHAINS.some((chain) => name.includes(chain)) ? -20 : 0;

  const completeness = QUALITY_TAGS.reduce(
    (score, tag) => score + (tags[tag] ? 1 : 0),
    0,
  );

  return completeness + chainPenalty;
}

function addressOf(tags: Record<string, string>): string {
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"],
    tags["addr:postcode"],
  ].filter((part) => part && part.length > 0);
  return parts.length > 0 ? parts.join(", ") : "address not listed in OpenStreetMap";
}

export class OverpassPlaces implements PlacesPort {
  constructor(
    private readonly cache: TtlCache = new TtlCache(),
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** Geocode a city name. Cached hard — city coordinates do not move. */
  async geocode(city: string): Promise<Geocode> {
    return this.cache.wrap(`geocode:${city.toLowerCase()}`, TTL.places, async () => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
      const raw = await fetchJson(url, {
        timeoutMs: 10_000,
        retries: 1,
        fetchImpl: this.fetchImpl,
        headers: { "user-agent": USER_AGENT, accept: "application/json" },
      });

      const parsed = NominatimSchema.safeParse(raw);
      if (!parsed.success || parsed.data.length === 0) {
        throw new Error(`could not locate "${city}" in OpenStreetMap`);
      }

      const hit = parsed.data[0]!;
      return {
        lat: Number.parseFloat(hit.lat),
        lng: Number.parseFloat(hit.lon),
        displayName: hit.display_name,
      };
    });
  }

  async search(query: PlaceQuery): Promise<Place[]> {
    const limit = query.limit ?? 8;

    let lat = query.lat;
    let lng = query.lng;
    if (lat === undefined || lng === undefined) {
      const geo = await this.geocode(query.city);
      lat = geo.lat;
      lng = geo.lng;
    }

    const filter = filterFor(query.query);
    const key = `places:${lat.toFixed(2)},${lng.toFixed(2)}:${filter}:${limit}`;

    return this.cache.wrap(key, TTL.places, async () => {
      // 4km around the city centre is a walkable-to-short-taxi radius — the honest scope
      // for "a dinner in Lisbon", and small enough to be courteous to a free API.
      const overpass = `[out:json][timeout:20];(node${filter}(around:4000,${lat},${lng});way${filter}(around:4000,${lat},${lng}););out center ${limit * 3};`;

      const raw = await fetchJson("https://overpass-api.de/api/interpreter", {
        timeoutMs: 25_000,
        retries: 1,
        fetchImpl: this.fetchImpl,
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT },
        body: `data=${encodeURIComponent(overpass)}`,
      });

      const parsed = OverpassSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Overpass returned an unexpected shape: ${parsed.error.issues[0]?.message}`);
      }

      const retrievedAt = new Date(this.now()).toISOString();

      return parsed.data.elements
        .filter((element) => element.tags?.["name"])
        // Rank before we truncate, or the shortlist is just whatever Overpass returned first.
        .sort((a, b) => venueScore(b.tags ?? {}) - venueScore(a.tags ?? {}))
        .slice(0, limit)
        .map((element) => {
          const tags = element.tags ?? {};
          const position = element.center ?? { lat: element.lat, lon: element.lon };

          const source: SourceTag = {
            source: "openstreetmap",
            retrievedAt,
            url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
          };

          const place: Place = {
            name: tags["name"] ?? "unnamed",
            address: addressOf(tags),
            source,
          };

          if (position.lat !== undefined) place.lat = position.lat;
          if (position.lon !== undefined) place.lng = position.lon;
          if (tags["website"]) place.url = tags["website"];

          return place;
        });
    });
  }
}

/* ---------------------------------------------------------------- google (optional) */

const GoogleSchema = z.object({
  places: z
    .array(
      z.object({
        displayName: z.object({ text: z.string() }).optional(),
        formattedAddress: z.string().optional(),
        location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
        rating: z.number().optional(),
        priceLevel: z.string().optional(),
        websiteUri: z.string().optional(),
      }),
    )
    .optional(),
});

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/** Better data (ratings, price levels) when OCE_PLACES_KEY is set. Same port, same promises. */
export class GooglePlaces implements PlacesPort {
  constructor(
    private readonly apiKey: string,
    private readonly cache: TtlCache = new TtlCache(),
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async search(query: PlaceQuery): Promise<Place[]> {
    const limit = query.limit ?? 8;
    const text = `${query.query} in ${query.city}`;

    return this.cache.wrap(`google:${text}:${limit}`, TTL.places, async () => {
      const raw = await fetchJson("https://places.googleapis.com/v1/places:searchText", {
        timeoutMs: 15_000,
        retries: 1,
        fetchImpl: this.fetchImpl,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask":
            "places.displayName,places.formattedAddress,places.location,places.rating,places.priceLevel,places.websiteUri",
        },
        body: JSON.stringify({ textQuery: text, maxResultCount: limit }),
      });

      const parsed = GoogleSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Google Places returned an unexpected shape: ${parsed.error.issues[0]?.message}`);
      }

      const retrievedAt = new Date(this.now()).toISOString();

      return (parsed.data.places ?? []).map((hit) => {
        const source: SourceTag = { source: "google_places", retrievedAt };
        const place: Place = {
          name: hit.displayName?.text ?? "unnamed",
          address: hit.formattedAddress ?? "address not listed",
          source,
        };
        if (hit.location) {
          place.lat = hit.location.latitude;
          place.lng = hit.location.longitude;
        }
        if (hit.rating !== undefined) place.rating = hit.rating;
        const priceLevel = hit.priceLevel ? PRICE_LEVELS[hit.priceLevel] : undefined;
        if (priceLevel !== undefined) place.priceLevel = priceLevel;
        if (hit.websiteUri) place.url = hit.websiteUri;
        return place;
      });
    });
  }
}
