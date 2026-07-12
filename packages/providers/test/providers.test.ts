import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  CHAIN_INDEX,
  CapExceeded,
  CostGovernor,
  FakeImageModel,
  HOUSE_STYLES,
  JsonRepairFailed,
  MemoryStorage,
  ModelRouter,
  OkxMarket,
  OpenMeteoWeather,
  OverpassPlaces,
  TTL,
  TimeoutError,
  TtlCache,
  UpstreamError,
  buildDeps,
  checkLinks,
  venueScore,
  dominantColors,
  extractJson,
  fetchJson,
  parseTokenQuery,
  strictJson,
  styleSystemPrompt,
} from "../src/index.js";

/** A fetch that returns canned responses in order, and records what it was asked for. */
function fakeFetch(responses: Array<{ status?: number; body: unknown } | Error>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let index = 0;

  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), ...(init ? { init } : {}) });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;

    if (next instanceof Error) throw next;

    const status = next?.status ?? 200;
    const body = typeof next?.body === "string" ? next.body : JSON.stringify(next?.body ?? {});
    return new Response(body, { status });
  }) as unknown as typeof fetch;

  return { impl, calls, count: () => index };
}

const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError" });

/* --------------------------------------------------------------------- http */

describe("http", () => {
  it("retries a 5xx exactly once, then gives up with a typed error", async () => {
    const { impl, count } = fakeFetch([
      { status: 503, body: "upstream is unwell" },
      { status: 503, body: "upstream is still unwell" },
    ]);

    await expect(fetchJson("https://x.test/a", { fetchImpl: impl, retries: 1 })).rejects.toBeInstanceOf(
      UpstreamError,
    );
    expect(count()).toBe(2); // the original + one retry, never more
  });

  it("does NOT retry a 4xx — a bad key will not become a good key", async () => {
    const { impl, count } = fakeFetch([{ status: 401, body: "bad key" }]);

    await expect(fetchJson("https://x.test/a", { fetchImpl: impl, retries: 1 })).rejects.toMatchObject({
      name: "UpstreamError",
      status: 401,
    });
    expect(count()).toBe(1);
  });

  it("turns an abort into a TimeoutError and retries it", async () => {
    const { impl, count } = fakeFetch([abortError(), { body: { ok: true } }]);

    const result = await fetchJson<{ ok: boolean }>("https://x.test/a", {
      fetchImpl: impl,
      retries: 1,
      timeoutMs: 50,
    });

    expect(result.ok).toBe(true);
    expect(count()).toBe(2);

    const { impl: alwaysDead } = fakeFetch([abortError(), abortError()]);
    await expect(
      fetchJson("https://x.test/a", { fetchImpl: alwaysDead, retries: 1, timeoutMs: 50 }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });
});

/* --------------------------------------------------------------- strict json */

describe("strict JSON", () => {
  it("pulls JSON out of a fence or out of prose", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('Sure! Here you go: {"a":1} — hope that helps')).toBe('{"a":1}');
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it("re-prompts ONCE with the validation error, and succeeds on the repair", async () => {
    const schema = z.object({ score: z.number() });
    const prompts: Array<string | undefined> = [];

    const value = await strictJson({
      schema,
      complete: async (repairNote) => {
        prompts.push(repairNote);
        return prompts.length === 1 ? '{"score":"ninety"}' : '{"score":90}';
      },
    });

    expect(value).toEqual({ score: 90 });
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toBeUndefined();
    expect(prompts[1]).toContain("score"); // the model is told exactly what it got wrong
  });

  it("gives up after ONE repair rather than paying for the same mistake forever", async () => {
    const schema = z.object({ score: z.number() });
    let calls = 0;

    await expect(
      strictJson({
        schema,
        complete: async () => {
          calls += 1;
          return "not json at all";
        },
      }),
    ).rejects.toBeInstanceOf(JsonRepairFailed);

    expect(calls).toBe(2);
  });
});

/* -------------------------------------------------------------------- router */

describe("model router", () => {
  it("falls back to the next provider when the first one is down", async () => {
    const impl = (async (url: string | URL) => {
      if (String(url).includes("anthropic")) return new Response("down", { status: 500 });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "the plan" } }],
          model: "gpt-4o",
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const router = new ModelRouter({
      ANTHROPIC_API_KEY: "a",
      OPENAI_API_KEY: "o",
      fetchImpl: impl,
    });

    const result = await router.complete({ role: "planner", system: "s", prompt: "p" });
    expect(result.text).toBe("the plan");
    expect(result.model).toBe("gpt-4o"); // Anthropic was first choice and it failed
  });

  it("refuses a provider URL for images — packs never hotlink an expiring asset", async () => {
    const { impl } = fakeFetch([{ body: { data: [{ url: "https://oai.test/tmp.png" }] } }]);
    const router = new ModelRouter({ OPENAI_API_KEY: "o", fetchImpl: impl });

    await expect(router.generateImage({ prompt: "p", size: "1024x1024" })).rejects.toThrow(
      /no base64 payload/,
    );
  });

  it("throws a clear error when nothing at all is configured", async () => {
    const router = new ModelRouter({});
    expect(router.hasText).toBe(false);
    await expect(router.complete({ role: "planner", system: "s", prompt: "p" })).rejects.toThrow(
      /no text model is configured/,
    );
  });
});

/* ------------------------------------------------------------------ governor */

describe("cost governor", () => {
  it("trips the image cap before the money is spent, with a polite message", () => {
    const governor = new CostGovernor({ dailyImageCap: 2, dailyLlmUsdCap: 100 });

    governor.checkImage();
    governor.recordImage();
    governor.checkImage();
    governor.recordImage();

    expect(() => governor.checkImage()).toThrow(CapExceeded);
    try {
      governor.checkImage();
    } catch (error) {
      expect((error as CapExceeded).cap).toBe("image");
      expect((error as CapExceeded).politeMessage).toContain("resets at 00:00 UTC");
    }
  });

  it("trips the spend cap and resets at the UTC day boundary", () => {
    let now = Date.parse("2026-07-12T23:59:00.000Z");
    const governor = new CostGovernor({ dailyImageCap: 100, dailyLlmUsdCap: 1 }, () => now);

    governor.recordLlmSpend(0.99);
    expect(() => governor.checkLlm(0.5)).toThrow(CapExceeded);

    now = Date.parse("2026-07-13T00:01:00.000Z");
    expect(() => governor.checkLlm(0.5)).not.toThrow();
    expect(governor.usage.usd).toBe(0);
  });
});

/* --------------------------------------------------------------------- cache */

describe("ttl cache", () => {
  it("serves a hit, then expires it exactly at the TTL", async () => {
    let now = 1_000;
    const cache = new TtlCache(() => now);
    const produce = vi.fn(async () => ({ value: 42 }));

    await cache.wrap("k", 500, produce);
    await cache.wrap("k", 500, produce);
    expect(produce).toHaveBeenCalledTimes(1);
    expect(cache.hits).toBe(1);

    now += 500; // expiry is inclusive
    await cache.wrap("k", 500, produce);
    expect(produce).toHaveBeenCalledTimes(2);
  });
});

/* --------------------------------------------------------------- live: weather */

describe("weather", () => {
  const canned = {
    daily: {
      time: ["2026-07-18"],
      temperature_2m_max: [26.4],
      temperature_2m_min: [17.1],
      precipitation_probability_max: [12],
      weather_code: [2],
    },
  };

  it("maps a real Open-Meteo payload, with a source and a retrieval time", async () => {
    const now = Date.parse("2026-07-12T10:00:00.000Z");
    const { impl } = fakeFetch([{ body: canned }]);
    const weather = new OpenMeteoWeather(new TtlCache(() => now), impl, () => now);

    const forecast = await weather.forecast(38.72, -9.14, "2026-07-18");

    expect(forecast.tempC).toEqual({ min: 17.1, max: 26.4 });
    expect(forecast.summary).toContain("partly cloudy");
    expect(forecast.precipitationChance).toBe(12);
    expect(forecast.source.source).toBe("open-meteo");
    expect(forecast.source.retrievedAt).toBe("2026-07-12T10:00:00.000Z");
  });

  it("refuses to invent a forecast beyond the real 16-day horizon", async () => {
    const now = Date.parse("2026-07-12T10:00:00.000Z");
    const { impl, count } = fakeFetch([{ body: canned }]);
    const weather = new OpenMeteoWeather(new TtlCache(() => now), impl, () => now);

    await expect(weather.forecast(38.72, -9.14, "2026-12-25")).rejects.toThrow(/no forecast exists/);
    expect(count()).toBe(0); // it does not even ask
  });

  it("throws (rather than returning nonsense) on a malformed payload", async () => {
    const now = Date.now();
    const { impl } = fakeFetch([{ body: { daily: { time: ["2026-07-18"] } } }]);
    const weather = new OpenMeteoWeather(new TtlCache(() => now), impl, () => now);

    await expect(weather.forecast(38.72, -9.14, new Date(now).toISOString())).rejects.toThrow(
      /unexpected shape/,
    );
  });
});

/* ---------------------------------------------------------------- live: places */

describe("places", () => {
  it("geocodes then maps Overpass elements, tagging every one with its OSM source", async () => {
    const now = Date.parse("2026-07-12T10:00:00.000Z");
    const { impl, calls } = fakeFetch([
      { body: [{ lat: "38.72", lon: "-9.14", display_name: "Lisbon, Portugal" }] },
      {
        body: {
          elements: [
            {
              type: "node",
              id: 42,
              lat: 38.71,
              lon: -9.13,
              tags: {
                name: "Taberna Real",
                "addr:housenumber": "12",
                "addr:street": "Rua da Prata",
                "addr:city": "Lisboa",
                website: "https://taberna.test",
              },
            },
            { type: "node", id: 43, lat: 38.7, lon: -9.12, tags: {} }, // unnamed: dropped
          ],
        },
      },
    ]);

    const places = new OverpassPlaces(new TtlCache(() => now), impl, () => now);
    const results = await places.search({ query: "dinner restaurant", city: "Lisbon", limit: 5 });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe("Taberna Real");
    expect(results[0]!.address).toBe("12 Rua da Prata, Lisboa");
    expect(results[0]!.url).toBe("https://taberna.test");
    expect(results[0]!.source.source).toBe("openstreetmap");
    expect(results[0]!.source.url).toContain("openstreetmap.org/node/42");

    // Nominatim's policy requires an identifying User-Agent — be a good citizen.
    expect((calls[0]!.init?.headers as Record<string, string>)["user-agent"]).toContain("Occestra");
    // The query was mapped onto a real OSM tag filter, not a blind text search.
    expect(String(calls[1]!.init?.body)).toContain(encodeURIComponent('["amenity"="restaurant"]'));
  });

  it("says so, rather than guessing, when a city cannot be located", async () => {
    const { impl } = fakeFetch([{ body: [] }]);
    const places = new OverpassPlaces(new TtlCache(), impl);
    await expect(places.search({ query: "dinner", city: "Nowhereton" })).rejects.toThrow(
      /could not locate/,
    );
  });
});

/* ---------------------------------------------------------------- live: market */

describe("venue ranking", () => {
  it("puts a cared-for restaurant above a Pizza Hut — order only, never invented quality", () => {
    const taberna = {
      name: "Taberna Real",
      "addr:street": "Rua da Prata",
      website: "https://taberna.test",
      phone: "+351",
      opening_hours: "19:00-23:00",
      cuisine: "portuguese",
    };
    const chain = { name: "Pizza Hut", "addr:street": "Avenida", website: "https://pizzahut.test" };
    const bare = { name: "Unnamed Grill" };

    expect(venueScore(taberna)).toBeGreaterThan(venueScore(bare));
    expect(venueScore(chain)).toBeLessThan(venueScore(bare)); // a chain is demoted, not deleted
    expect(venueScore(taberna)).toBeGreaterThan(venueScore(chain));
  });

  it("ranks the shortlist before truncating it", async () => {
    const now = Date.now();
    const { impl } = fakeFetch([
      { body: [{ lat: "38.72", lon: "-9.14", display_name: "Lisbon" }] },
      {
        body: {
          elements: [
            { type: "node", id: 1, lat: 38.7, lon: -9.1, tags: { name: "Hard Rock Cafe", website: "https://hrc.test" } },
            {
              type: "node",
              id: 2,
              lat: 38.71,
              lon: -9.13,
              tags: {
                name: "Taberna Real",
                "addr:street": "Rua da Prata",
                website: "https://t.test",
                phone: "+351",
                opening_hours: "19:00-23:00",
                cuisine: "portuguese",
              },
            },
          ],
        },
      },
    ]);

    const places = new OverpassPlaces(new TtlCache(() => now), impl, () => now);
    const results = await places.search({ query: "dinner", city: "Lisbon", limit: 1 });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe("Taberna Real"); // NOT the chain that Overpass listed first
  });
});

describe("strict json over the wire", () => {
  it("puts the word 'json' in the messages — OpenAI 400s without it", async () => {
    const { impl, calls } = fakeFetch([
      { body: { choices: [{ message: { content: "{}" } }], model: "gpt-4o", usage: { prompt_tokens: 1, completion_tokens: 1 } } },
    ]);

    const router = new ModelRouter({ OPENAI_API_KEY: "o", fetchImpl: impl });
    await router.complete({ role: "planner", system: "You are a planner.", prompt: "plan", json: true });

    const body = JSON.parse(String(calls[0]!.init?.body)) as {
      response_format?: { type: string };
      messages: Array<{ role: string; content: unknown }>;
    };

    expect(body.response_format).toEqual({ type: "json_object" });
    // The literal word must survive into the messages, or the request is rejected outright.
    expect(JSON.stringify(body.messages).toLowerCase()).toContain("json");
  });
});

describe("okx market", () => {
  it("signs with the OKX HMAC scheme and maps a token", async () => {
    const now = Date.parse("2026-07-12T10:00:00.000Z");
    const { impl, calls } = fakeFetch([
      {
        body: {
          code: "0",
          data: [{ tokenSymbol: "OKB", tokenName: "OKB", decimal: "18", chainIndex: "196" }],
        },
      },
      { body: { code: "0", data: [{ price: "48.5" }] } },
    ]);

    const market = new OkxMarket({
      apiKey: "key",
      secretKey: "secret",
      passphrase: "pass",
      cache: new TtlCache(() => now),
      fetchImpl: impl,
      now: () => now,
    });

    const info = await market.tokenInfo("0x1e4a5963abfd975d8c9021ce480b42188849d41d on xlayer");

    expect(info.symbol).toBe("OKB");
    expect(info.priceUsd).toBe(48.5);
    expect(info.chain).toBe(CHAIN_INDEX.xlayer);
    expect(info.source.source).toBe("okx_onchain_os_market");

    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers["OK-ACCESS-KEY"]).toBe("key");
    expect(headers["OK-ACCESS-PASSPHRASE"]).toBe("pass");
    expect(headers["OK-ACCESS-TIMESTAMP"]).toBe("2026-07-12T10:00:00.000Z");
    expect(headers["OK-ACCESS-SIGN"]).toMatch(/^[A-Za-z0-9+/]+=*$/); // base64 hmac
  });

  it("still returns the token when only the PRICE call fails — degrade, don't abort", async () => {
    const now = Date.now();
    const { impl } = fakeFetch([
      { body: { code: "0", data: [{ tokenSymbol: "OKB", tokenName: "OKB" }] } },
      { status: 500, body: "price service down" },
      { status: 500, body: "price service down" },
    ]);

    const market = new OkxMarket({
      apiKey: "k",
      secretKey: "s",
      passphrase: "p",
      cache: new TtlCache(() => now),
      fetchImpl: impl,
      now: () => now,
    });

    const info = await market.tokenInfo("196:0x1e4a5963abfd975d8c9021ce480b42188849d41d");
    expect(info.symbol).toBe("OKB");
    expect(info.priceUsd).toBeUndefined(); // absent, not invented
  });

  it("refuses to guess which token a vague query meant", async () => {
    const market = new OkxMarket({ apiKey: "k", secretKey: "s", passphrase: "p" });
    expect(parseTokenQuery("the good coin", "196")).toBeUndefined();
    await expect(market.tokenInfo("the good coin")).rejects.toThrow(/will not guess/);
  });
});

/* ------------------------------------------------------------------ live: site */

describe("site helpers", () => {
  it("samples the dominant colours a visitor actually sees", async () => {
    const png = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 250, g: 247, b: 242 } },
    })
      .png()
      .toBuffer();

    const palette = await dominantColors(png, 3);
    expect(palette[0]).toMatch(/^#[0-9A-F]{6}$/);
    expect(palette[0]).toBe("#FAF7F2");
  });

  it("reports a dead link as dead, and a network failure as dead (never as alive)", async () => {
    const impl = (async (url: string | URL) =>
      String(url).includes("dead")
        ? new Response("", { status: 404 })
        : new Response("", { status: 200 })) as unknown as typeof fetch;

    const results = await checkLinks(["https://x.test/alive", "https://x.test/dead"], impl);
    expect(results).toEqual({ "https://x.test/alive": true, "https://x.test/dead": false });

    const exploding = (async () => {
      throw new Error("DNS is on fire");
    }) as unknown as typeof fetch;
    expect(await checkLinks(["https://x.test/a"], exploding)).toEqual({ "https://x.test/a": false });
  });
});

/* ------------------------------------------------------------------- fakes */

describe("fake image model", () => {
  it("produces a REAL png at exactly the requested size, deterministically", async () => {
    const model = new FakeImageModel();

    const first = await model.generate({ prompt: "a quiet dinner", size: "512x640" });
    const second = await model.generate({ prompt: "a quiet dinner", size: "512x640" });

    expect(first.pngBase64).toBe(second.pngBase64); // same prompt, same bytes

    const meta = await sharp(Buffer.from(first.pngBase64, "base64")).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(640);
  });
});

/* ------------------------------------------------------------------ buildDeps */

describe("buildDeps", () => {
  it("wires live adapters where credentials exist and records EVERY substitution as a gap", () => {
    const { live, coverageGaps, deps } = buildDeps({
      OKX_API_KEY: "k",
      OKX_SECRET_KEY: "s",
      OKX_PASSPHRASE: "p",
      OCE_ENABLE_BROWSER: "false",
    });

    // No model keys at all: the pack still builds, and says loudly that it is not real work.
    expect(live["text"]).toBe(false);
    expect(live["image"]).toBe(false);
    expect(live["market_okx"]).toBe(true);
    expect(live["weather"]).toBe(true);

    const gaps = coverageGaps.join(" | ");
    expect(gaps).toContain("TEXT_MODEL_UNAVAILABLE");
    expect(gaps).toContain("IMAGE_MODEL_UNAVAILABLE");
    expect(gaps).toContain("SITE_INSPECTION_UNAVAILABLE");
    expect(gaps).not.toContain("MARKET_DATA_UNAVAILABLE"); // OKX is live

    // Every port is still present — degraded, never missing.
    expect(deps.text).toBeDefined();
    expect(deps.image).toBeDefined();
    expect(deps.critique).toBeDefined();
    expect(deps.weather).toBeDefined();
  });

  it("goes fully live when the keys are there, with no gaps at all", () => {
    const { live, coverageGaps } = buildDeps({
      OPENAI_API_KEY: "o",
      ANTHROPIC_API_KEY: "a",
      OKX_API_KEY: "k",
      OKX_SECRET_KEY: "s",
      OKX_PASSPHRASE: "p",
    });

    expect(live["text"]).toBe(true);
    expect(live["image"]).toBe(true);
    expect(live["critique"]).toBe(true);
    expect(live["site"]).toBe(true);
    expect(coverageGaps).toEqual([]);
  });

  it("honours the caps from the environment", () => {
    const { governor } = buildDeps({ OCE_DAILY_IMAGE_CAP: "3", OCE_DAILY_LLM_USD_CAP: "2" });
    expect(governor.usage.dailyImageCap).toBe(3);
    expect(governor.usage.dailyLlmUsdCap).toBe(2);
  });
});

/* ------------------------------------------------------------------- styles */

describe("house styles", () => {
  it("ships four versioned styles, each with a real palette and negative prompt", () => {
    const ids = Object.keys(HOUSE_STYLES);
    expect(ids).toEqual(["amethyst_editorial", "gilded_noir", "sunprint", "atlas_ink"]);

    for (const style of Object.values(HOUSE_STYLES)) {
      expect(style.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(style.palette.length).toBeGreaterThanOrEqual(5);
      expect(style.palette.every((hex) => /^#[0-9A-F]{6}$/i.test(hex))).toBe(true);
      expect(style.promptSystem.length).toBeGreaterThan(400); // art direction, not a vibe word
      expect(style.negativePrompt).toContain("no watermarks");
    }
  });

  it("renders a style into a prompt the image model can actually follow", () => {
    const prompt = styleSystemPrompt(HOUSE_STYLES.sunprint);
    expect(prompt).toContain("HOUSE STYLE: Sunprint");
    expect(prompt).toContain("cyanotype");
    expect(prompt).toContain("#0B2C4D");
    expect(prompt).toContain("NEVER:");
  });
});

/* ------------------------------------------------------------------ storage */

describe("memory storage", () => {
  it("stores, retrieves, signs, and genuinely deletes — delete-my-project must actually work", async () => {
    const storage = new MemoryStorage();
    await storage.put("uploads/a.png", new Uint8Array([1, 2, 3]), "image/png");

    expect((await storage.get("uploads/a.png"))?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(await storage.signedUrl("uploads/a.png", 60)).toContain("expires=");

    await storage.delete("uploads/a.png");
    expect(await storage.get("uploads/a.png")).toBeUndefined();
    expect(storage.size).toBe(0);
  });
});

describe("cache ttls", () => {
  it("pins the published TTLs", () => {
    expect(TTL).toEqual({ weather: 1_800_000, places: 86_400_000, site: 3_600_000, token: 600_000 });
  });
});
