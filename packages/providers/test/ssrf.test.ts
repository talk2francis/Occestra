/**
 * The SSRF guard. "Read my site" is a confused deputy unless the target is proven public.
 */
import { describe, expect, it } from "vitest";
import { assertPublicUrl, blockedHostSync, blockedIp, guardedFetch, SsrfError } from "../src/live/ssrf.js";

describe("literal private addresses are blocked", () => {
  it("blocks the cloud metadata address, loopback, and every private range", () => {
    expect(blockedIp("169.254.169.254")).toBeTruthy(); // AWS/GCP metadata
    expect(blockedIp("127.0.0.1")).toBeTruthy();
    expect(blockedIp("10.1.2.3")).toBeTruthy();
    expect(blockedIp("172.16.5.5")).toBeTruthy();
    expect(blockedIp("192.168.0.1")).toBeTruthy();
    expect(blockedIp("100.64.0.1")).toBeTruthy(); // CGNAT
    expect(blockedIp("::1")).toBeTruthy();
    expect(blockedIp("fd00::1")).toBeTruthy(); // unique-local v6
    expect(blockedIp("fe80::1")).toBeTruthy(); // link-local v6
    expect(blockedIp("::ffff:169.254.169.254")).toBeTruthy(); // v4-mapped metadata
  });

  it("allows real public addresses", () => {
    expect(blockedIp("93.184.216.34")).toBeUndefined(); // example.com
    expect(blockedIp("1.1.1.1")).toBeUndefined();
    expect(blockedIp("2606:4700:4700::1111")).toBeUndefined(); // public v6
  });
});

describe("the cheap synchronous host check", () => {
  it("refuses non-http schemes, localhost, and internal names", () => {
    expect(blockedHostSync("file:///etc/passwd")).toBeTruthy();
    expect(blockedHostSync("http://localhost:8412/")).toBeTruthy();
    expect(blockedHostSync("http://foo.local/")).toBeTruthy();
    expect(blockedHostSync("http://metadata.google.internal/")).toBeTruthy();
    expect(blockedHostSync("http://169.254.169.254/latest/meta-data/")).toBeTruthy();
    expect(blockedHostSync("gopher://evil/")).toBeTruthy();
  });

  it("passes a normal public URL", () => {
    expect(blockedHostSync("https://example.com/path")).toBeUndefined();
  });
});

describe("assertPublicUrl resolves DNS and blocks private results", () => {
  it("throws on a literal metadata IP", async () => {
    await expect(assertPublicUrl("http://169.254.169.254/")).rejects.toBeInstanceOf(SsrfError);
  });

  it("throws on file:// and localhost", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicUrl("http://localhost/")).rejects.toBeInstanceOf(SsrfError);
  });

  it("throws on a hostname that resolves to a private address", async () => {
    // localtest.me and similar resolve to 127.0.0.1 by design — a real rebinding-style name.
    await expect(assertPublicUrl("http://127.0.0.1.nip.io/")).rejects.toBeInstanceOf(SsrfError);
  });
});

describe("guardedFetch follows redirects but re-checks every hop", () => {
  it("blocks a redirect INTO a private range", async () => {
    const fakeFetch = (async (url: string) =>
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } })) as unknown as typeof fetch;

    await expect(
      guardedFetch("https://example.com/redirect", {}, fakeFetch),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it("returns the response when every hop is public", async () => {
    const fakeFetch = (async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    const response = await guardedFetch("https://example.com/", {}, fakeFetch);
    expect(response.status).toBe(200);
  });
});
