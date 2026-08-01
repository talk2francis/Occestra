/**
 * WHAT TIME DOES THIS OCCASION START?
 *
 * Every schedule anchored at 18:00. For a dinner that is right, which is exactly why it
 * survived so long — nobody looks twice at a dinner starting at six. But the same anchor put
 * an anniversary LUNCH at 18:00–21:25 and an 80th birthday AFTERNOON TEA at 18:00, and in
 * Trieste it silently contradicted two constraints the buyer had typed into the brief: eleven
 * guests arriving from Ljubljana who could not be there before 12:30, and a family who needed
 * to finish by 19:30 so the older guests could travel home.
 *
 * Two different failures wearing the same clothes:
 *
 *   1. THE DEFAULT WAS SEMANTIC, NOT JUST NUMERIC. "Lunch" tells you when it starts. So does
 *      "brunch", "tea", "breakfast". The occasion says so in plain words and we ignored it.
 *
 *   2. AN EXPLICIT CONSTRAINT WAS TREATED AS PROSE. "Nobody can arrive before 12:30" is not
 *      colour, it is a bound. A plan that crosses it is wrong no matter how well it reads,
 *      and it is worse than a vague plan because the buyer supplied the very fact it broke.
 *
 * So the start is derived, in this order of authority:
 *
 *   an explicit start in the brief  >  the earliest-arrival bound  >  the meal in the occasion
 *   >  18:00
 *
 * and the whole schedule is then pulled earlier if it would otherwise run past a stated
 * finish time. When it cannot fit at all we do NOT quietly overrun: the bounds travel with
 * the plan so the Tribunal can fail it and say why.
 *
 * Everything here is deterministic and reads only what the buyer wrote. No model is asked to
 * guess a time, because a guessed time is the same class of mistake as a guessed timezone.
 */

/** 18:00 — still right for a dinner, a party, a reception, and anything unstated. */
export const DEFAULT_START_MINUTES = 18 * 60;

export interface TimingBounds {
  /** Nothing may begin before this (minutes from local midnight). */
  earliestStartMinutes?: number;
  /** Nothing may still be running after this. */
  latestEndMinutes?: number;
  /** An explicitly stated start, which outranks the occasion's own shape. */
  explicitStartMinutes?: number;
  /** The buyer's own words, kept verbatim so a failure can quote them back. */
  evidence: string[];
}

export interface ResolvedStart {
  minutes: number;
  bounds: TimingBounds;
  /** Plain-language account of why this time, for the schedule's notes. */
  reason: string;
}

/* --------------------------------------------------------------- meal shapes */

/**
 * When a named occasion conventionally begins. Ordered: the FIRST match wins, so the more
 * specific phrases sit above the looser ones ("afternoon tea" before "tea", which would
 * otherwise catch "tea party" and, worse, "steak").
 */
const OCCASION_TIMES: ReadonlyArray<{ re: RegExp; minutes: number; label: string }> = [
  { re: /\b(breakfast|morning\s+meeting)\b/i, minutes: 8 * 60 + 30, label: "a breakfast" },
  { re: /\bbrunch\b/i, minutes: 11 * 60, label: "a brunch" },
  { re: /\b(afternoon\s+tea|high\s+tea|cream\s+tea)\b/i, minutes: 15 * 60 + 30, label: "an afternoon tea" },
  { re: /\b(lunch|luncheon|midday\s+meal)\b/i, minutes: 12 * 60 + 30, label: "a lunch" },
  { re: /\bmatin(é|e)e\b/i, minutes: 14 * 60, label: "a matinée" },
  { re: /\b(tea\s+party|tea)\b/i, minutes: 15 * 60 + 30, label: "a tea" },
  { re: /\b(cocktails?|aperitivo|drinks\s+reception)\b/i, minutes: 17 * 60 + 30, label: "a drinks occasion" },
  { re: /\b(dinner|supper|banquet)\b/i, minutes: 18 * 60, label: "a dinner" },
  { re: /\b(late[-\s]night|after[-\s]party|club\s+night)\b/i, minutes: 21 * 60, label: "a late-night occasion" },
];

/** The meal the occasion names, if it names one. Reads the buyer's words, nothing else. */
export function occasionStartMinutes(...text: Array<string | undefined>): { minutes: number; label: string } | undefined {
  const haystack = text.filter(Boolean).join(" • ");
  const hit = OCCASION_TIMES.find((entry) => entry.re.test(haystack));
  return hit ? { minutes: hit.minutes, label: hit.label } : undefined;
}

/* ------------------------------------------------------------- time literals */

/**
 * Minutes from midnight for a written clock time.
 *
 * Handles "12:30", "12.30", "2pm", "2 pm", "7.30pm", "19:30", "noon", "midday", "midnight".
 * Deliberately conservative: an unrecognised shape returns undefined rather than a guess, and
 * a bare "7" is NOT a time — "7 guests" would otherwise become 07:00.
 */
export function parseClockMinutes(raw: string): number | undefined {
  const text = raw.trim().toLowerCase();

  if (/^(noon|midday)$/.test(text)) return 12 * 60;
  if (/^midnight$/.test(text)) return 0;

  const match = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/.exec(text);
  if (!match) return undefined;

  let hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3];

  if (hour > 23 || minute > 59) return undefined;
  // No meridiem and no minutes means a bare number, which is only a time if it cannot be
  // anything else — and it usually can be. Require either ":30" or "pm" to commit.
  if (!meridiem && match[2] === undefined) return undefined;

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  return hour * 60 + minute;
}

const TIME = String.raw`(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?|noon|midday|midnight)`;

/** Phrasings that put a floor under the start. */
const EARLIEST_PATTERNS: readonly RegExp[] = [
  new RegExp(String.raw`(?:can(?:'|’)?t|cannot|can not|unable to|won(?:'|’)?t be able to)[^.;]*?\b(?:arrive|get there|be there|make it|attend)[^.;]*?\bbefore\s+${TIME}`, "i"),
  new RegExp(String.raw`\b(?:no\s+earlier\s+than|not\s+before|nothing\s+before|earliest\s+(?:is|start)?)\s+${TIME}`, "i"),
  new RegExp(String.raw`\barriv\w*\s+(?:from\s+\w+\s+)?(?:after|from)\s+${TIME}`, "i"),
  new RegExp(String.raw`\bguests?\s+arriv\w*[^.;]*?\bafter\s+${TIME}`, "i"),
  // "nobody can arrive before 12:30" — the negation sits on the subject, not the verb, so the
  // can't/cannot patterns above walk straight past it.
  new RegExp(String.raw`\b(?:nobody|no\s?one|none)\b[^.;]*?\bbefore\s+${TIME}`, "i"),
  // "the restaurant can only seat us from 14:00", "the room is available from 2pm".
  new RegExp(String.raw`\b(?:only|available|free|open|seat\w*|host\w*|use\s+the\s+\w+)\b[^.;]*?\bfrom\s+${TIME}`, "i"),
];

/** Phrasings that put a ceiling on the end. */
const LATEST_PATTERNS: readonly RegExp[] = [
  new RegExp(String.raw`\b(?:finish\w*|end\w*|done|over|wrap\w*|out|conclude\w*)[^.;]*?\b(?:by|before|no\s+later\s+than)\s+${TIME}`, "i"),
  new RegExp(String.raw`\b(?:by|before|no\s+later\s+than)\s+${TIME}[^.;]*?\b(?:at\s+the\s+latest|so\s+(?:the|they|we|everyone))`, "i"),
  new RegExp(String.raw`\beveryone\s+out\s+by\s+${TIME}`, "i"),
  new RegExp(String.raw`\bmust\s+(?:be\s+)?(?:finish\w*|end\w*|over|done)\s+(?:by|before)\s+${TIME}`, "i"),
];

/** An outright stated start. */
const EXPLICIT_START_PATTERNS: readonly RegExp[] = [
  new RegExp(String.raw`\b(?:start|begin|kick\s*off|doors)\w*\s+(?:at|from)\s+${TIME}`, "i"),
  new RegExp(String.raw`\b(?:starts?|beginning)\s+${TIME}`, "i"),
];

function firstMatch(lines: readonly string[], patterns: readonly RegExp[]): { minutes: number; source: string } | undefined {
  for (const line of lines) {
    for (const pattern of patterns) {
      const found = pattern.exec(line);
      const minutes = found?.[1] === undefined ? undefined : parseClockMinutes(found[1]);
      if (minutes !== undefined) return { minutes, source: line.trim() };
    }
  }
  return undefined;
}

/**
 * Read every hard timing bound the buyer stated.
 *
 * Only their own words are searched — constraints, vibe, do/don't lists. Nothing is inferred
 * from the model's output, because the point of a bound is that it came from the person paying.
 */
export function parseTimingBounds(lines: ReadonlyArray<string | undefined>): TimingBounds {
  const clean = lines.filter((line): line is string => Boolean(line && line.trim()));
  const evidence: string[] = [];

  const earliest = firstMatch(clean, EARLIEST_PATTERNS);
  const latest = firstMatch(clean, LATEST_PATTERNS);
  const explicit = firstMatch(clean, EXPLICIT_START_PATTERNS);

  if (earliest) evidence.push(earliest.source);
  if (latest && latest.source !== earliest?.source) evidence.push(latest.source);
  if (explicit && explicit.source !== earliest?.source && explicit.source !== latest?.source) {
    evidence.push(explicit.source);
  }

  return {
    ...(earliest ? { earliestStartMinutes: earliest.minutes } : {}),
    ...(latest ? { latestEndMinutes: latest.minutes } : {}),
    ...(explicit ? { explicitStartMinutes: explicit.minutes } : {}),
    evidence,
  };
}

/* ------------------------------------------------------------------ resolve */

const clock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * The start time this occasion actually deserves, and why.
 *
 * `totalMinutes` is how long the running order is, so a stated finish time can pull the whole
 * thing earlier rather than being discovered as a violation after the fact. If it still cannot
 * fit, the start is left honest and the bounds go with it — the Tribunal fails it and quotes
 * the buyer's own sentence back, which is a far better outcome than a schedule that silently
 * disagrees with the brief.
 */
export function resolveStartMinutes(args: {
  occasion?: string;
  vibe?: string;
  lines: ReadonlyArray<string | undefined>;
  totalMinutes: number;
}): ResolvedStart {
  const bounds = parseTimingBounds(args.lines);
  const meal = occasionStartMinutes(args.occasion, args.vibe);

  let minutes: number;
  let reason: string;

  if (bounds.explicitStartMinutes !== undefined) {
    minutes = bounds.explicitStartMinutes;
    reason = `Starts at ${clock(minutes)} because the brief says so.`;
  } else if (meal) {
    minutes = meal.minutes;
    reason = `Starts at ${clock(minutes)} because this is ${meal.label}.`;
  } else {
    minutes = DEFAULT_START_MINUTES;
    reason = `Starts at ${clock(minutes)}, the default for an occasion that does not name a mealtime.`;
  }

  // A stated finish can only pull the start EARLIER, never later.
  if (bounds.latestEndMinutes !== undefined) {
    const latestPossibleStart = bounds.latestEndMinutes - args.totalMinutes;
    if (minutes > latestPossibleStart) {
      minutes = latestPossibleStart;
      reason += ` Pulled earlier so everything is finished by ${clock(bounds.latestEndMinutes)}, as the brief requires.`;
    }
  }

  // An arrival floor outranks both — it is a fact about the guests, not a preference.
  if (bounds.earliestStartMinutes !== undefined && minutes < bounds.earliestStartMinutes) {
    minutes = bounds.earliestStartMinutes;
    reason += ` Held to ${clock(bounds.earliestStartMinutes)} at the earliest, because the brief says nobody can be there before then.`;
  }

  return { minutes: Math.max(0, minutes), bounds, reason };
}

export const formatClock = clock;
