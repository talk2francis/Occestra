/**
 * Keepsake ids: "oce_" + 22 lowercase Crockford-base32 chars.
 * First 10 chars encode the millisecond timestamp (big-endian, so ids sort by time
 * as plain strings), last 12 are random.
 */
import { randomInt } from "node:crypto";

export const CROCKFORD_LOWER = "0123456789abcdefghjkmnpqrstvwxyz";
export const KEEPSAKE_ID_PREFIX = "oce_";
export const KEEPSAKE_ID_REGEX = /^oce_[0-9a-z]{22}$/;

const TIME_CHARS = 10;
const RANDOM_CHARS = 12;

/** 10 base32 chars hold 50 bits — comfortably past year 10889. */
const MAX_TIME = 32 ** TIME_CHARS - 1;

export type KeepsakeId = string & { readonly __brand?: "KeepsakeId" };

function encodeTime(ms: number, len: number): string {
  if (!Number.isInteger(ms) || ms < 0) {
    throw new RangeError(`newKeepsakeId: timestamp must be a non-negative integer, got ${ms}`);
  }
  if (ms > MAX_TIME) {
    throw new RangeError(`newKeepsakeId: timestamp ${ms} exceeds ${len}-char base32 range`);
  }
  let out = "";
  let rest = ms;
  for (let i = 0; i < len; i++) {
    const mod = rest % 32;
    out = CROCKFORD_LOWER[mod]! + out;
    rest = (rest - mod) / 32;
  }
  return out;
}

function encodeRandom(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CROCKFORD_LOWER[randomInt(0, 32)]!;
  }
  return out;
}

/** Mint a new keepsake id. `now` is injectable so tests (and ClockPort) stay deterministic. */
export function newKeepsakeId(now: number = Date.now()): KeepsakeId {
  return KEEPSAKE_ID_PREFIX + encodeTime(now, TIME_CHARS) + encodeRandom(RANDOM_CHARS);
}

export function isKeepsakeId(value: unknown): value is KeepsakeId {
  return typeof value === "string" && KEEPSAKE_ID_REGEX.test(value);
}

/** Recover the millisecond timestamp embedded in a keepsake id. */
export function keepsakeIdTime(id: string): number {
  if (!isKeepsakeId(id)) throw new TypeError(`not a keepsake id: ${id}`);
  const time = id.slice(KEEPSAKE_ID_PREFIX.length, KEEPSAKE_ID_PREFIX.length + TIME_CHARS);
  let ms = 0;
  for (const ch of time) {
    const digit = CROCKFORD_LOWER.indexOf(ch);
    if (digit < 0) throw new TypeError(`bad base32 char in id: ${ch}`);
    ms = ms * 32 + digit;
  }
  return ms;
}
