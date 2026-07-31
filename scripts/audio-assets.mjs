#!/usr/bin/env node
/**
 * Derive the web ambience from the master, the way brand-assets.mjs derives the logos.
 *
 *   node scripts/audio-assets.mjs
 *
 * The master is what the owner supplied and is never edited. What the site serves is derived
 * from it, so the transform is written down here rather than living in one person's shell
 * history:
 *
 *   - 192 -> 96 kbps. It is a room tone played at 18% volume under body copy; 96 kbps stereo
 *     is transparent at that level and halves what a visitor who opts in has to download.
 *   - a 1.5s fade in and a 3s fade out, because the track loops. MP3 cannot loop truly
 *     gaplessly, so the seam is made into a breath instead of a cut. At 11:48 most visits
 *     never reach it at all.
 *
 * Requires ffmpeg. Provenance and licence: assets/AUDIO-LICENCE.md.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const master = join(root, "assets", "Occestra Audio.MP3");
const out = join(root, "apps", "web", "public", "audio", "ambience.mp3");

/** Fade-out lead-in, in seconds, measured back from the end of the track. */
const FADE_OUT_SECONDS = 3;

if (!existsSync(master)) {
  console.error(`\n  master not found: ${master}\n`);
  process.exit(1);
}

const duration = Number(
  execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1",
    master,
  ]).toString().trim(),
);

if (!Number.isFinite(duration) || duration <= FADE_OUT_SECONDS) {
  console.error(`\n  could not read a usable duration from the master (got ${duration})\n`);
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });

execFileSync("ffmpeg", [
  "-v", "error", "-y",
  "-i", master,
  "-af", `afade=t=in:st=0:d=1.5,afade=t=out:st=${(duration - FADE_OUT_SECONDS).toFixed(2)}:d=${FADE_OUT_SECONDS}`,
  "-c:a", "libmp3lame",
  "-b:a", "96k",
  "-ar", "44100",
  "-ac", "2",
  "-metadata", "title=Occestra studio ambience",
  "-metadata", "comment=Royalty-free track supplied and licence-cleared by the site owner. See assets/AUDIO-LICENCE.md.",
  out,
]);

const mb = (path) => (statSync(path).size / 1_048_576).toFixed(1);
console.log(`  ${mb(master)} MB master -> ${mb(out)} MB served  (${Math.round(duration)}s, looped)`);
