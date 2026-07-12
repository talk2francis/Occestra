/**
 * Site inspection for the LAUNCH studio. We look at the real site with a real browser and
 * report what is actually there — the alternative is a "brand genome" invented from the
 * product's name, which is precisely the slop this product exists to refuse.
 *
 * Hard 45s budget. A slow site degrades the pack (coverage gap); it never hangs it.
 */
import { chromium, type Browser } from "playwright";
import sharp from "sharp";
import type { SiteInspection, SitePort, SourceTag, StoragePort } from "@occestra/studio-core";
import { TTL, TtlCache } from "../cache.js";

export const SITE_BUDGET_MS = 45_000;

export const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
] as const;

export interface PlaywrightSiteDeps {
  /** Screenshots are stored, never inlined — packs carry storage keys, not megabytes. */
  storage?: StoragePort;
  cache?: TtlCache;
  now?: () => number;
}

export class PlaywrightSite implements SitePort {
  private readonly cache: TtlCache;
  private readonly now: () => number;

  constructor(private readonly deps: PlaywrightSiteDeps = {}) {
    this.cache = deps.cache ?? new TtlCache();
    this.now = deps.now ?? Date.now;
  }

  async inspect(url: string): Promise<SiteInspection> {
    return this.cache.wrap(`site:${url}`, TTL.site, () => this.inspectUncached(url));
  }

  private async inspectUncached(url: string): Promise<SiteInspection> {
    let browser: Browser | undefined;
    const deadline = this.now() + SITE_BUDGET_MS;
    const remaining = (): number => Math.max(1_000, deadline - this.now());

    try {
      browser = await chromium.launch({ args: ["--no-sandbox"] });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 Occestra/0.1",
      });
      const page = await context.newPage();

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: remaining() });
      await page.waitForTimeout(600); // let webfonts and hero imagery settle

      const meta = await page.evaluate(() => {
        const attr = (selector: string, name: string): string =>
          document.querySelector(selector)?.getAttribute(name) ?? "";

        const og: Record<string, string> = {};
        for (const tag of Array.from(document.querySelectorAll("meta[property^='og:']"))) {
          const property = tag.getAttribute("property");
          const content = tag.getAttribute("content");
          if (property && content) og[property] = content;
        }

        // Fonts as the browser actually resolved them, not as the CSS wished.
        const fonts = new Set<string>();
        const sample = [
          document.body,
          document.querySelector("h1"),
          document.querySelector("h2"),
          document.querySelector("p"),
          document.querySelector("button"),
        ];
        for (const element of sample) {
          if (!element) continue;
          const family = getComputedStyle(element).fontFamily;
          if (family) fonts.add(family.split(",")[0]!.replace(/["']/g, "").trim());
        }

        return {
          title: document.title || attr("meta[property='og:title']", "content"),
          description:
            attr("meta[name='description']", "content") ||
            attr("meta[property='og:description']", "content"),
          fonts: [...fonts].filter(Boolean),
          og,
        };
      });

      const screenshots: string[] = [];
      let heroShot: Buffer | undefined;

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(250);
        const shot = await page.screenshot({ type: "png", timeout: remaining() });
        heroShot ??= shot;

        if (this.deps.storage) {
          const key = `site/${encodeURIComponent(new URL(url).hostname)}/${viewport.name}-${this.now()}.png`;
          await this.deps.storage.put(key, new Uint8Array(shot), "image/png");
          screenshots.push(key);
        }
      }

      const palette = heroShot ? await dominantColors(heroShot) : [];

      const source: SourceTag = {
        source: "playwright_site_inspection",
        retrievedAt: new Date(this.now()).toISOString(),
        url,
      };

      const inspection: SiteInspection = {
        title: meta.title,
        description: meta.description,
        palette,
        fonts: meta.fonts,
        screenshots,
        source,
      };
      if (Object.keys(meta.og).length > 0) inspection.og = meta.og;

      return inspection;
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }
}

/** The colours a visitor actually sees, sampled from the rendered page. */
export async function dominantColors(png: Buffer, count = 5): Promise<string[]> {
  const { data, info } = await sharp(png)
    .resize(48, 48, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();

  for (let i = 0; i + 2 < data.length; i += info.channels) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    // Quantise to a 32-step grid so near-identical pixels land in one bucket.
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, count)
    .map(({ count: n, r, g, b }) => {
      const hex = (value: number): string =>
        Math.round(value / n)
          .toString(16)
          .padStart(2, "0");
      return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
    });
}

/** Feeds the Tribunal's LINK_DEAD check. HEAD first, GET as a fallback for servers that refuse HEAD. */
export function makeLinkChecker(fetchImpl: typeof fetch = fetch) {
  return async (url: string): Promise<boolean> => {
    const attempt = async (method: "HEAD" | "GET"): Promise<boolean> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetchImpl(url, { method, signal: controller.signal, redirect: "follow" });
        return response.status < 400;
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      if (await attempt("HEAD")) return true;
      return await attempt("GET");
    } catch {
      return false;
    }
  };
}

export async function checkLinks(
  urls: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, boolean>> {
  const check = makeLinkChecker(fetchImpl);
  const entries = await Promise.all(urls.map(async (url) => [url, await check(url)] as const));
  return Object.fromEntries(entries);
}
