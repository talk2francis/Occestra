/**
 * SSRF guard for anything that fetches a caller-supplied URL — the launch studio's site reader
 * and its link checker.
 *
 * A launch brief hands us a URL and we open it with a real browser. Without a guard, that URL
 * could be `http://169.254.169.254/latest/meta-data/` (cloud credentials), `http://localhost:8412`
 * (our own ASP), `http://10.0.0.5` (the private network), or `file:///etc/passwd`. The threat is
 * not hypothetical: "read my site" is a feature, and the feature is a confused deputy unless the
 * target is proven to be a real, public host BEFORE we connect — and again on every redirect,
 * because a public URL that 302s into the metadata service is the classic bypass.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Parse an IPv4 dotted quad into its 32-bit integer, or undefined if it is not one. */
function v4ToInt(ip: string): number | undefined {
  const parts = ip.split(".");
  if (parts.length !== 4) return undefined;
  let value = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return undefined;
    value = value * 256 + n;
  }
  return value >>> 0;
}

const V4_BLOCKS: ReadonlyArray<{ net: number; bits: number; why: string }> = [
  { net: v4ToInt("0.0.0.0")!, bits: 8, why: "this-network" },
  { net: v4ToInt("10.0.0.0")!, bits: 8, why: "private" },
  { net: v4ToInt("100.64.0.0")!, bits: 10, why: "cgnat" },
  { net: v4ToInt("127.0.0.0")!, bits: 8, why: "loopback" },
  { net: v4ToInt("169.254.0.0")!, bits: 16, why: "link-local / cloud metadata" },
  { net: v4ToInt("172.16.0.0")!, bits: 12, why: "private" },
  { net: v4ToInt("192.0.0.0")!, bits: 24, why: "ietf-reserved" },
  { net: v4ToInt("192.168.0.0")!, bits: 16, why: "private" },
  { net: v4ToInt("198.18.0.0")!, bits: 15, why: "benchmarking" },
  { net: v4ToInt("224.0.0.0")!, bits: 4, why: "multicast" },
  { net: v4ToInt("240.0.0.0")!, bits: 4, why: "reserved" },
];

function blockedV4(ip: string): string | undefined {
  const value = v4ToInt(ip);
  if (value === undefined) return undefined;
  for (const block of V4_BLOCKS) {
    const mask = block.bits === 0 ? 0 : (0xffffffff << (32 - block.bits)) >>> 0;
    // `>>> 0` on the AND is load-bearing: bitwise `&` yields a SIGNED int32, so for any address
    // at or above 128.0.0.0 the result is negative and would never equal the unsigned `net`.
    if (((value & mask) >>> 0) === block.net) return block.why;
  }
  return undefined;
}

function blockedV6(ip: string): string | undefined {
  const addr = ip.toLowerCase().split("%")[0]!; // drop any zone id
  if (addr === "::1" || addr === "::") return "loopback";
  if (addr.startsWith("fe80") || addr.startsWith("fe9") || addr.startsWith("fea") || addr.startsWith("feb")) {
    return "link-local";
  }
  if (addr.startsWith("fc") || addr.startsWith("fd")) return "unique-local";
  // IPv4-mapped (::ffff:a.b.c.d) — unwrap and check as v4.
  const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)/.exec(addr);
  if (mapped) return blockedV4(mapped[1]!);
  return undefined;
}

/** Why this literal IP is blocked, or undefined if it is a public address. */
export function blockedIp(ip: string): string | undefined {
  const version = isIP(ip);
  if (version === 4) return blockedV4(ip);
  if (version === 6) return blockedV6(ip);
  return undefined;
}

/**
 * A CHEAP, synchronous refusal — no DNS. Used inside the browser's per-request hook, where a
 * DNS round-trip per subresource would be untenable. It catches the literal-IP and obvious-name
 * vectors (metadata IPs, localhost, *.local, non-http schemes). The async assertPublicUrl below
 * is the thorough check, run on every document navigation.
 */
export function blockedHostSync(rawUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "unparseable url";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return `scheme ${url.protocol} not allowed`;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return "localhost";
  if (host.endsWith(".local") || host.endsWith(".internal")) return "internal hostname";
  if (host === "metadata" || host === "metadata.google.internal") return "cloud metadata";

  const literal = blockedIp(host);
  if (literal) return literal;

  return undefined;
}

/**
 * The thorough guard: scheme is http(s), and EVERY address the hostname resolves to is public.
 * Resolving all addresses (not just the first) closes the door on a name that returns one public
 * and one private A record. Throws with a redacted reason on refusal.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  const cheap = blockedHostSync(rawUrl);
  if (cheap) throw new SsrfError(`refusing to fetch a non-public URL (${cheap})`);

  const host = new URL(rawUrl).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return; // a literal already passed blockedHostSync

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new SsrfError("refusing to fetch a URL whose host does not resolve");
  }

  for (const { address } of addresses) {
    const why = blockedIp(address);
    if (why) throw new SsrfError(`refusing to fetch a URL that resolves to a non-public address (${why})`);
  }
}

export class SsrfError extends Error {
  override readonly name = "SsrfError";
}

/**
 * A fetch that guards the initial URL and every redirect hop against the SSRF ranges. Used by
 * the link checker, which follows redirects — and a redirect into a private range is the whole
 * game. Caps hops so a redirect loop cannot hang the check.
 */
export async function guardedFetch(
  url: string,
  init: RequestInit & { maxRedirects?: number } = {},
  fetchImpl: typeof fetch = fetch,
  guard: (url: string) => Promise<void> = assertPublicUrl,
): Promise<Response> {
  const maxRedirects = init.maxRedirects ?? 5;
  let current = url;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await guard(current);
    const response = await fetchImpl(current, { ...init, redirect: "manual" });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return response;
      current = new URL(location, current).toString();
      continue;
    }
    return response;
  }

  throw new SsrfError("too many redirects");
}
