/**
 * Deterministic fakes. Exported, not test-only: they are what buildDeps() falls back to
 * when a key or a binary is missing, so CI and a keyless clone of the repo still produce a
 * complete (if honestly-degraded) pack rather than an exception.
 *
 * Every fake is deterministic — same input, same bytes — which is what makes downstream
 * tests about hashing and sealing possible at all.
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import type {
  ClockPort,
  CritiquePort,
  CritiqueResult,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageModelPort,
  MarketDataPort,
  Place,
  PlaceQuery,
  PlacesPort,
  SiteInspection,
  SitePort,
  SourceTag,
  StoragePort,
  StoredObject,
  TextCompletionRequest,
  TextCompletionResult,
  TextModelPort,
  TokenInfo,
  WeatherForecast,
  WeatherPort,
} from "@occestra/studio-core";

const derived = (source: string, retrievedAt = "1970-01-01T00:00:00.000Z"): SourceTag => ({
  source,
  retrievedAt,
});

function seedFrom(text: string): number {
  return Number.parseInt(createHash("sha256").update(text).digest("hex").slice(0, 8), 16);
}

export class FakeTextModel implements TextModelPort {
  public calls: TextCompletionRequest[] = [];
  constructor(private readonly reply: (request: TextCompletionRequest) => string = () => "{}") {}

  async complete(request: TextCompletionRequest): Promise<TextCompletionResult> {
    this.calls.push(request);
    return { text: this.reply(request), model: "fake-text-1", usdCost: 0 };
  }
}

/**
 * Real PNGs, generated with sharp, at exactly the requested size — so DIM_ASPECT_MISMATCH,
 * FILE_TOO_LARGE and PALETTE_DRIFT all exercise their real code paths against real bytes.
 */
export class FakeImageModel implements ImageModelPort {
  public calls: ImageGenerationRequest[] = [];

  constructor(private readonly palette: string[] = ["#FAF7F2", "#6B3FA0", "#17141A"]) {}

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    this.calls.push(request);

    const [width, height] = request.size.split("x").map(Number) as [number, number];
    const seed = request.seed ?? seedFrom(request.prompt);
    const background = this.palette[seed % this.palette.length]!;
    const accent = this.palette[(seed + 1) % this.palette.length]!;

    // A ground with an off-centre block: enough structure that palette sampling is meaningful.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="${background}"/>
      <rect x="${Math.round(width * 0.12)}" y="${Math.round(height * 0.18)}" width="${Math.round(width * 0.4)}" height="${Math.round(height * 0.32)}" fill="${accent}"/>
    </svg>`;

    const png = await sharp(Buffer.from(svg)).png().toBuffer();

    return {
      pngBase64: png.toString("base64"),
      model: "fake-image-1",
      usdCost: 0,
    };
  }
}

/** Always passes. The critic of last resort — its scores are honest about being fake. */
export class FakeCritique implements CritiquePort {
  constructor(private readonly axes = 75) {}

  async judge(): Promise<CritiqueResult> {
    return {
      axes: {
        composition: this.axes,
        legibility: this.axes,
        style_fidelity: this.axes,
        grounding: this.axes,
        platform_fit: this.axes,
      },
      issues: ["No model critic was configured; this artifact was not judged by a model."],
      repairBrief: "",
      model: "fake-critic-1",
    };
  }
}

export class FakeWeather implements WeatherPort {
  async forecast(lat: number, lng: number, dateISO: string): Promise<WeatherForecast> {
    const seed = seedFrom(`${lat},${lng},${dateISO}`);
    const max = 16 + (seed % 12);
    return {
      summary: `derived estimate — not a live forecast (${max - 7}–${max}°C)`,
      tempC: { min: max - 7, max },
      precipitationChance: seed % 40,
      source: derived("derived_estimate"),
    };
  }
}

export class FakePlaces implements PlacesPort {
  async search(query: PlaceQuery): Promise<Place[]> {
    return Array.from({ length: Math.min(query.limit ?? 3, 3) }, (_unused, index) => ({
      name: `${query.city} venue ${index + 1}`,
      address: `not a real address — no places provider was configured`,
      source: derived("derived_estimate"),
    })) satisfies Place[];
  }
}

export class FakeSite implements SitePort {
  async inspect(url: string): Promise<SiteInspection> {
    return {
      title: new URL(url).hostname,
      description: "the site was not inspected — no browser was available",
      palette: [],
      fonts: [],
      screenshots: [],
      source: derived("derived_estimate"),
    };
  }
}

export class FakeMarket implements MarketDataPort {
  async tokenInfo(query: string): Promise<TokenInfo> {
    return {
      symbol: "UNKNOWN",
      name: `no market provider was configured (asked about "${query}")`,
      source: derived("derived_estimate"),
    };
  }
}

/** In-memory storage. Private by default — signedUrl is a local, expiring path, not a CDN. */
export class MemoryStorage implements StoragePort {
  private readonly objects = new Map<string, StoredObject>();

  constructor(private readonly baseUrl = "http://localhost:8402") {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
    this.objects.set(key, { bytes, contentType });
    return key;
  }

  async get(key: string): Promise<StoredObject | undefined> {
    return this.objects.get(key);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    return `${this.baseUrl}/files/${encodeURIComponent(key)}?expires=${expires}`;
  }

  get size(): number {
    return this.objects.size;
  }

  keys(): string[] {
    return [...this.objects.keys()];
  }
}

export class SystemClock implements ClockPort {
  now(): number {
    return Date.now();
  }
}

export class FixedClock implements ClockPort {
  constructor(private readonly fixed: number) {}
  now(): number {
    return this.fixed;
  }
}
