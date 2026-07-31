/**
 * The promise the sound toggle makes: nothing plays, and nothing is even DOWNLOADED, until a
 * visitor asks for it. Verified against the live site, in a real browser.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "https://occestra.xyz";
const AUDIO = "/audio/ambience.mp3";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const audioRequests = [];
page.on("request", (r) => {
  if (r.url().includes(AUDIO)) audioRequests.push(r.url());
});

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

await page.goto(BASE, { waitUntil: "networkidle" });

// 1. A first visit must be silent AND must not spend a byte on the track.
check("first visit fetches no audio", audioRequests.length === 0, `${audioRequests.length} request(s)`);
check(
  "no audio element is playing on load",
  await page.evaluate(() => [...document.querySelectorAll("audio")].every((a) => a.paused)),
);

// 2. The toggle exists and reports itself as off.
const toggle = page.locator('button[aria-label*="studio sound" i]').first();
await toggle.waitFor({ state: "visible", timeout: 15_000 });
check("toggle starts in the off state", (await toggle.getAttribute("aria-pressed")) === "false");

// 3. Turning it on is the gesture that starts playback and the fetch.
await toggle.click();
await page.waitForTimeout(4_000);

check("toggle now reports on", (await toggle.getAttribute("aria-pressed")) === "true");
check("audio was fetched only after the click", audioRequests.length > 0);

const state = await page.evaluate(() => {
  const el = document.querySelector('audio[data-oce-ambience]');
  return el
    ? { found: true, paused: el.paused, loop: el.loop, volume: Number(el.volume.toFixed(3)), t: el.currentTime }
    : { found: false };
});

check("the ambience element exists once turned on", state.found === true);
check("it is actually playing", state.paused === false && state.t > 0, `paused=${state.paused} t=${state.t}`);
check("it loops, so 11:48 is not a hard stop", state.loop === true);
check("it is quiet (0 < volume <= 0.25)", state.volume > 0 && state.volume <= 0.25, `volume=${state.volume}`);

// 4. Turning it off stops it.
await toggle.click();
await page.waitForTimeout(2_000);
check("toggle returns to off", (await toggle.getAttribute("aria-pressed")) === "false");

// 5. THE RETURNING VISITOR. A remembered "on" is a stored preference, not a user gesture —
//    the browser will refuse playback without one, and we must not try to force it. So a
//    reload stays silent until the visitor touches the page, then picks the ambience back up.
const returning = await context.newPage();
const returningRequests = [];
returning.on("request", (r) => {
  if (r.url().includes(AUDIO)) returningRequests.push(r.url());
});

await returning.addInitScript(() => localStorage.setItem("oce-sound", "on"));
await returning.goto(BASE, { waitUntil: "networkidle" });
await returning.waitForTimeout(1_500);

check(
  "a remembered 'on' does NOT autoplay before a gesture",
  await returning.evaluate(() => {
    const el = document.querySelector("audio[data-oce-ambience]");
    return !el || el.paused;
  }),
);

await returning.mouse.click(5, 5);
await returning.waitForTimeout(4_000);

const resumed = await returning.evaluate(() => {
  const el = document.querySelector("audio[data-oce-ambience]");
  return el ? { paused: el.paused, t: el.currentTime } : { paused: true, t: 0 };
});
check("it resumes after the first gesture", resumed.paused === false, `t=${resumed.t}`);
check("and only then is the file fetched", returningRequests.length > 0);

await browser.close();
console.log(failures === 0 ? "\n  sound is opt-in, quiet, and looping.\n" : `\n  ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
