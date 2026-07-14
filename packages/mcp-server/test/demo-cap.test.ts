/**
 * The free Studio allowance, and who is allowed to spend it.
 *
 * The daily cap is a SHARED pool. On its own, one visitor — or one script — drains the
 * whole day's free runs in a minute: we pay for every real model call, and every later
 * visitor finds a dead button. That has already happened once here, when our own gallery
 * seeding ate the owner's allowance and he found his own Studio button disabled.
 *
 * The per-caller cap fixes that. But it introduces a trap of its own, and the second
 * suite below is the one that matters: the browser never reaches the ASP directly — it
 * talks to the Next server, which calls the ASP over loopback. If the visitor's address
 * is not carried across that hop, EVERY visitor arrives as 127.0.0.1, the per-caller cap
 * counts them all as one person, and two runs kill the Studio for the entire internet.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { callerIp } from "../src/demo.js";
import { Store } from "../src/store.js";

let dir: string;
let store: Store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oce-demo-"));
  store = new Store({ dataDir: dir, baseUrl: "http://test" });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Just enough of Express's Request for callerIp(). */
const fakeReq = (headers: Record<string, string>, ip?: string) =>
  ({
    get: (name: string) => headers[name.toLowerCase()],
    ip,
  }) as never;

describe("per-caller demo credits", () => {
  it("counts each caller's free runs separately", () => {
    const since = Date.now() - 60_000;

    store.recordDemoHit("1.1.1.1");
    store.recordDemoHit("1.1.1.1");
    store.recordDemoHit("2.2.2.2");

    expect(store.demoRunsByIpSince("1.1.1.1", since)).toBe(2);
    expect(store.demoRunsByIpSince("2.2.2.2", since)).toBe(1);
    // A caller who has never been here has spent nothing.
    expect(store.demoRunsByIpSince("3.3.3.3", since)).toBe(0);
  });

  it("forgets runs that fall outside the window, so the allowance actually resets", () => {
    const dayAgo = Date.now() - 25 * 60 * 60 * 1000;
    store.recordDemoHit("1.1.1.1", dayAgo);

    const since = Date.now() - 24 * 60 * 60 * 1000;
    expect(store.demoRunsByIpSince("1.1.1.1", since)).toBe(0);
  });

  it("one caller exhausting their share leaves the shared pool for everyone else", () => {
    const since = Date.now() - 60_000;
    store.recordDemoHit("1.1.1.1");
    store.recordDemoHit("1.1.1.1");

    // The greedy caller is spent...
    expect(store.demoRunsByIpSince("1.1.1.1", since)).toBeGreaterThanOrEqual(2);
    // ...and the next visitor still has their full share.
    expect(store.demoRunsByIpSince("9.9.9.9", since)).toBe(0);
  });
});

describe("callerIp — the loopback trap", () => {
  it("reads the VISITOR from x-forwarded-for, not the proxy that relayed them", () => {
    // Caddy -> Next -> ASP. Without this, every visitor is 127.0.0.1 and the per-caller
    // cap would lock out the whole internet after two runs.
    const req = fakeReq({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }, "127.0.0.1");
    expect(callerIp(req)).toBe("203.0.113.7");
  });

  it("takes the first entry — later ones are the proxies, not the person", () => {
    const req = fakeReq({ "x-forwarded-for": "198.51.100.4, 203.0.113.9, 10.0.0.1" });
    expect(callerIp(req)).toBe("198.51.100.4");
  });

  it("falls back to the peer when nothing was forwarded, rather than inventing an address", () => {
    expect(callerIp(fakeReq({}, "192.0.2.55"))).toBe("192.0.2.55");
    expect(callerIp(fakeReq({}))).toBe("unknown");
  });
});
