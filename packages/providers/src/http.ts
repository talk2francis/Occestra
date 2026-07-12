/**
 * The one place network policy lives: timeout, one retry on 5xx/timeout, and typed errors.
 * Everything that leaves this process goes through here, so degradation is uniform.
 */

export class TimeoutError extends Error {
  override readonly name = "TimeoutError";
  constructor(public readonly ms: number, url: string) {
    super(`request to ${url} exceeded ${ms}ms`);
  }
}

export class UpstreamError extends Error {
  override readonly name = "UpstreamError";
  constructor(
    public readonly status: number,
    public readonly body: string,
    url: string,
  ) {
    super(`${url} responded ${status}: ${body.slice(0, 300)}`);
  }
}

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  /** Retries on 5xx and timeouts only — never on a 4xx, which will just fail again. */
  retries?: number;
  fetchImpl?: typeof fetch;
}

const RETRY_DELAY_MS = 400;

export async function fetchJson<T = unknown>(url: string, options: FetchOptions = {}): Promise<T> {
  const text = await fetchText(url, options);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError(200, `response was not JSON: ${text.slice(0, 200)}`, url);
  }
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const {
    timeoutMs = 30_000,
    retries = 1,
    fetchImpl = fetch,
    ...init
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      const body = await response.text();

      if (response.ok) return body;

      // 4xx is our fault (bad key, bad request). Retrying is a waste of a call.
      if (response.status < 500) throw new UpstreamError(response.status, body, url);

      lastError = new UpstreamError(response.status, body, url);
    } catch (error) {
      if (error instanceof UpstreamError && error.status < 500) throw error;
      lastError =
        error instanceof Error && error.name === "AbortError"
          ? new TimeoutError(timeoutMs, url)
          : error;
    } finally {
      clearTimeout(timer);
    }

    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
