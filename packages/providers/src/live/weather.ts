/**
 * Open-Meteo: free, keyless, and honest about its own uncertainty.
 *
 * A forecast beyond ~16 days does not exist, and we say so rather than inventing one — a
 * plan that quietly makes up the weather for a party three months out is exactly the kind
 * of confident nonsense Occestra exists to not do.
 */
import { z } from "zod";
import type { SourceTag, WeatherForecast, WeatherPort } from "@occestra/studio-core";
import { fetchJson } from "../http.js";
import { TTL, TtlCache } from "../cache.js";

const ResponseSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: z.array(z.number().nullable()),
    temperature_2m_min: z.array(z.number().nullable()),
    precipitation_probability_max: z.array(z.number().nullable()).optional(),
    weather_code: z.array(z.number().nullable()).optional(),
  }),
});

/** WMO weather codes, in the words a human would actually use. */
const WMO: Record<number, string> = {
  0: "clear",
  1: "mostly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "foggy",
  48: "freezing fog",
  51: "light drizzle",
  53: "drizzle",
  55: "heavy drizzle",
  61: "light rain",
  63: "rain",
  65: "heavy rain",
  71: "light snow",
  73: "snow",
  75: "heavy snow",
  80: "light showers",
  81: "showers",
  82: "violent showers",
  95: "thunderstorms",
  96: "thunderstorms with hail",
  99: "severe thunderstorms with hail",
};

export const FORECAST_HORIZON_DAYS = 16;

export class OpenMeteoWeather implements WeatherPort {
  constructor(
    private readonly cache: TtlCache = new TtlCache(),
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async forecast(lat: number, lng: number, dateISO: string): Promise<WeatherForecast> {
    const day = dateISO.slice(0, 10);

    const daysOut = Math.round((Date.parse(`${day}T12:00:00Z`) - this.now()) / 86_400_000);
    if (daysOut > FORECAST_HORIZON_DAYS) {
      throw new Error(
        `no forecast exists ${daysOut} days out (horizon is ${FORECAST_HORIZON_DAYS} days) — say so in the plan rather than inventing one`,
      );
    }

    const key = `weather:${lat.toFixed(2)},${lng.toFixed(2)}:${day}`;

    return this.cache.wrap(key, TTL.weather, async () => {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code" +
        `&timezone=auto&start_date=${day}&end_date=${day}`;

      const raw = await fetchJson(url, { timeoutMs: 10_000, retries: 1, fetchImpl: this.fetchImpl });
      const parsed = ResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Open-Meteo returned an unexpected shape: ${parsed.error.issues[0]?.message}`);
      }

      const { daily } = parsed.data;
      const index = daily.time.indexOf(day);
      if (index === -1) throw new Error(`Open-Meteo returned no row for ${day}`);

      const max = daily.temperature_2m_max[index];
      const min = daily.temperature_2m_min[index];
      if (max === null || max === undefined || min === null || min === undefined) {
        throw new Error(`Open-Meteo returned no temperature for ${day}`);
      }

      const code = daily.weather_code?.[index] ?? undefined;
      const precipitation = daily.precipitation_probability_max?.[index] ?? 0;

      const source: SourceTag = {
        source: "open-meteo",
        retrievedAt: new Date(this.now()).toISOString(),
        url,
      };

      const conditions = code === null || code === undefined ? "unsettled" : (WMO[code] ?? "unsettled");

      return {
        summary: `${conditions}, ${Math.round(min)}–${Math.round(max)}°C, ${Math.round(precipitation ?? 0)}% chance of rain`,
        tempC: { min, max },
        precipitationChance: precipitation ?? 0,
        source,
      } satisfies WeatherForecast;
    });
  }
}
