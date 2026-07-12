/**
 * buildDeps: turn an environment into a working EngineDeps.
 *
 * The contract here is the whole reliability story. Every provider we could not wire up is
 * replaced with a deterministic fake AND recorded as a coverage gap that travels into the
 * pack. A keyless clone of this repo produces a complete pack that is honest about being
 * ungrounded — it does not crash, and it does not lie.
 */
import type { Artifact, EngineDeps, ImageModelPort, StoragePort } from "@occestra/studio-core";
import { CostGovernor, DEFAULT_LIMITS } from "./governor.js";
import { ModelCritique } from "./critique.js";
import { VisionDescriber } from "./vision.js";
import { ModelRouter } from "./router.js";
import { TtlCache } from "./cache.js";
import { OpenMeteoWeather } from "./live/weather.js";
import { GooglePlaces, OverpassPlaces } from "./live/places.js";
import { PlaywrightSite, makeLinkChecker } from "./live/site.js";
import { OkxMarket } from "./live/market.js";
import {
  FakeCritique,
  FakeImageModel,
  FakeMarket,
  FakePlaces,
  FakeSite,
  FakeTextModel,
  FakeWeather,
  MemoryStorage,
  SystemClock,
} from "./fakes.js";

export interface ProviderEnv {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  XAI_API_KEY?: string;
  OKX_API_KEY?: string;
  OKX_SECRET_KEY?: string;
  OKX_PASSPHRASE?: string;
  OCE_PLACES_KEY?: string;
  OCE_DAILY_IMAGE_CAP?: string;
  OCE_DAILY_LLM_USD_CAP?: string;
  OCE_ANTHROPIC_MODEL?: string;
  OCE_OPENAI_MODEL?: string;
  OCE_OPENAI_IMAGE_MODEL?: string;
  OCE_XAI_MODEL?: string;
  /** Set false in CI: skips launching a browser we know isn't installed. */
  OCE_ENABLE_BROWSER?: string;
}

export interface BuildDepsOptions {
  storage?: StoragePort;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface BuiltDeps {
  deps: EngineDeps;
  /** Which adapters are real. Surfaced at /health and in the docs — no quiet stubbing. */
  live: Record<string, boolean>;
  /** Recorded into every pack this process builds. */
  coverageGaps: string[];
  router: ModelRouter;
  governor: CostGovernor;
  cache: TtlCache;
  linkChecker: (url: string) => Promise<boolean>;
}

const numberOr = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function buildDeps(env: ProviderEnv, options: BuildDepsOptions = {}): BuiltDeps {
  const coverageGaps: string[] = [];
  const live: Record<string, boolean> = {};
  const cache = new TtlCache(options.now);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;

  const governor = new CostGovernor(
    {
      dailyImageCap: numberOr(env.OCE_DAILY_IMAGE_CAP, DEFAULT_LIMITS.dailyImageCap),
      dailyLlmUsdCap: numberOr(env.OCE_DAILY_LLM_USD_CAP, DEFAULT_LIMITS.dailyLlmUsdCap),
    },
    now,
  );

  const routerEnv = { ...env, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) };
  const router = new ModelRouter(routerEnv, { governor });

  const storage: StoragePort = options.storage ?? new MemoryStorage();

  const imageBytes = async (artifact: Artifact): Promise<Uint8Array | undefined> => {
    if (!artifact.uri) return undefined;
    return (await storage.get(artifact.uri))?.bytes;
  };

  /* ------------------------------------------------------------------ text */

  live["text"] = router.hasText;
  if (!router.hasText) {
    coverageGaps.push(
      "TEXT_MODEL_UNAVAILABLE: no ANTHROPIC_API_KEY or OPENAI_API_KEY — planning and copy are placeholders, not written work",
    );
  }
  const text = router.hasText ? router : new FakeTextModel();

  /* ----------------------------------------------------------------- image */

  live["image"] = Boolean(router.image);
  let image: ImageModelPort;
  if (router.image) {
    image = { generate: (request) => router.generateImage(request) };
  } else {
    coverageGaps.push("IMAGE_MODEL_UNAVAILABLE: no OPENAI_API_KEY — imagery is a placeholder, not generated art");
    image = new FakeImageModel();
  }

  /* -------------------------------------------------------------- critique */

  const vision = router.visionModel;
  live["critique"] = Boolean(vision);
  const critique = vision
    ? new ModelCritique({ vision, imageBytes })
    : (() => {
        coverageGaps.push(
          "CRITIQUE_UNAVAILABLE: no vision-capable model configured — artifacts were checked deterministically but not judged",
        );
        return new FakeCritique();
      })();

  /* ---------------------------------------------------------------- vision */

  live["vision"] = Boolean(vision);
  const media = vision
    ? new VisionDescriber({ vision, storage, now })
    : (() => {
        coverageGaps.push(
          "VISION_UNAVAILABLE: no vision-capable model — uploaded photographs cannot be read, and keepsakes are built from words alone",
        );
        return undefined;
      })();

  /* --------------------------------------------------------------- weather */

  // Open-Meteo is keyless, so weather is live unless the network itself is gone.
  live["weather"] = true;
  const weather = new OpenMeteoWeather(cache, fetchImpl, now);

  /* ---------------------------------------------------------------- places */

  live["places"] = true;
  const places = env.OCE_PLACES_KEY
    ? new GooglePlaces(env.OCE_PLACES_KEY, cache, fetchImpl, now)
    : new OverpassPlaces(cache, fetchImpl, now);
  live["places_google"] = Boolean(env.OCE_PLACES_KEY);

  /* ------------------------------------------------------------------ site */

  const browserEnabled = env.OCE_ENABLE_BROWSER !== "false";
  live["site"] = browserEnabled;
  const site = browserEnabled
    ? new PlaywrightSite({ storage, cache, now })
    : (() => {
        coverageGaps.push("SITE_INSPECTION_UNAVAILABLE: browser disabled — the site was not actually looked at");
        return new FakeSite();
      })();

  /* ---------------------------------------------------------------- market */

  const okxReady = Boolean(env.OKX_API_KEY && env.OKX_SECRET_KEY && env.OKX_PASSPHRASE);
  live["market_okx"] = okxReady;
  const market = okxReady
    ? new OkxMarket({
        apiKey: env.OKX_API_KEY!,
        secretKey: env.OKX_SECRET_KEY!,
        passphrase: env.OKX_PASSPHRASE!,
        cache,
        fetchImpl,
        now,
      })
    : (() => {
        coverageGaps.push(
          "MARKET_DATA_UNAVAILABLE: OKX credentials incomplete — token facts are not grounded",
        );
        return new FakeMarket();
      })();

  const deps: EngineDeps = {
    text,
    image,
    critique,
    storage,
    clock: new SystemClock(),
    ...(media ? { vision: media } : {}),
    weather,
    places,
    site,
    market,
    caps: {
      dailyImageCap: numberOr(env.OCE_DAILY_IMAGE_CAP, DEFAULT_LIMITS.dailyImageCap),
      dailyLlmUsdCap: numberOr(env.OCE_DAILY_LLM_USD_CAP, DEFAULT_LIMITS.dailyLlmUsdCap),
    },
  };

  return {
    deps,
    live,
    coverageGaps: [...coverageGaps, ...router.gaps.map((gap) => `MODEL_ROUTER: ${gap}`)],
    router,
    governor,
    cache,
    linkChecker: makeLinkChecker(fetchImpl),
  };
}
