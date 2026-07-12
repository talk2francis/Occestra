/**
 * Models emit almost-JSON: fenced, prefaced with "Here's the plan:", trailing commas.
 * We strip what we safely can, validate against the schema that actually matters, and if
 * it still doesn't parse we hand the model its own error back exactly once. Two failures
 * and we stop paying for the same mistake — the caller degrades instead.
 */
import type { z } from "zod";

export class JsonRepairFailed extends Error {
  override readonly name = "JsonRepairFailed";
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
  }
}

/** Pull JSON out of prose or a ```json fence. */
export function extractJson(text: string): string {
  const trimmed = text.trim();

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) return fenced[1].trim();

  // Fall back to the outermost balanced object or array in the text.
  const start = trimmed.search(/[[{]/);
  if (start === -1) return trimmed;

  const open = trimmed[start]!;
  const close = open === "{" ? "}" : "]";
  const end = trimmed.lastIndexOf(close);
  if (end > start) return trimmed.slice(start, end + 1);

  return trimmed;
}

export function tryParse<T>(text: string, schema: z.ZodType<T>): { ok: true; value: T } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch (error) {
    return { ok: false, error: `not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; "),
    };
  }

  return { ok: true, value: result.data };
}

export interface StrictJsonArgs<T> {
  schema: z.ZodType<T>;
  /** Runs the prompt. Called twice at most: once, then once more with the parse error. */
  complete: (repairNote?: string) => Promise<string>;
}

/** Get schema-valid JSON out of a model, with exactly one repair attempt. */
export async function strictJson<T>({ schema, complete }: StrictJsonArgs<T>): Promise<T> {
  const first = await complete();
  const parsed = tryParse(first, schema);
  if (parsed.ok) return parsed.value;

  const repairNote = [
    "Your previous response could not be used. It failed validation with:",
    parsed.error,
    "",
    "Reply with ONLY the corrected JSON. No prose, no code fence, no explanation.",
  ].join("\n");

  const second = await complete(repairNote);
  const retried = tryParse(second, schema);
  if (retried.ok) return retried.value;

  throw new JsonRepairFailed(
    `model could not produce valid JSON after one repair attempt: ${retried.error}`,
    second,
  );
}
