/**
 * The model router. Roles, not model names, are what the studios ask for — so swapping a
 * provider is a config change, never a code change.
 *
 * Raw fetch rather than vendor SDKs: three SDKs to keep three ports honest is a bad trade,
 * and everything we need from each is one POST.
 */
import type {
  ImageGenerationRequest,
  ImageQuality,
  ImageGenerationResult,
  ImageModelPort,
  StudioRole,
  TextCompletionRequest,
  TextCompletionResult,
  TextModelPort,
} from "@occestra/studio-core";
import { fetchJson, type FetchOptions } from "./http.js";
import { CostGovernor } from "./governor.js";

export const TEXT_TIMEOUT_MS = 30_000;
export const IMAGE_TIMEOUT_MS = 90_000;

/** Rough per-million-token prices, only ever used for the spend governor's estimate. */
const PRICING: Record<string, { inUsdPerM: number; outUsdPerM: number }> = {
  "claude-sonnet-4-6": { inUsdPerM: 3, outUsdPerM: 15 },
  "gpt-4o": { inUsdPerM: 2.5, outUsdPerM: 10 },
  "gpt-4o-mini": { inUsdPerM: 0.15, outUsdPerM: 0.6 },
  "grok-2-latest": { inUsdPerM: 2, outUsdPerM: 10 },
};

/**
 * What an image ACTUALLY costs, per gpt-image-1's published rates.
 *
 * This used to be a single flat `0.04` for every call, which meant the daily USD cap
 * was metering a number we had invented: a high-tier landscape really costs ~6x that,
 * and a medium square costs about the same. A governor that mis-prices its own spend
 * cannot protect the budget it exists to protect.
 *
 * Keyed by quality, then by whether the frame is square or oblong (the provider prices
 * 1024x1024 below 1024x1536 / 1536x1024).
 */
const IMAGE_USD: Record<ImageQuality, { square: number; oblong: number }> = {
  low: { square: 0.011, oblong: 0.016 },
  medium: { square: 0.042, oblong: 0.063 },
  high: { square: 0.167, oblong: 0.25 },
};

const DEFAULT_IMAGE_QUALITY: ImageQuality = "high";

export function imageCostUsd(size: string, quality: ImageQuality = DEFAULT_IMAGE_QUALITY): number {
  const [width, height] = size.split("x").map(Number);
  const row = IMAGE_USD[quality] ?? IMAGE_USD[DEFAULT_IMAGE_QUALITY]!;
  return width === height ? row.square : row.oblong;
}

function estimateUsd(model: string, inTokens: number, outTokens: number): number {
  const price = PRICING[model] ?? { inUsdPerM: 3, outUsdPerM: 15 };
  return (inTokens / 1_000_000) * price.inUsdPerM + (outTokens / 1_000_000) * price.outUsdPerM;
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const shared = (config: ProviderConfig): FetchOptions => ({
  timeoutMs: TEXT_TIMEOUT_MS,
  retries: 1,
  ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
});

/* ---------------------------------------------------------------- anthropic */

/**
 * What the Tribunal's critic needs: a model that can be handed an image alongside
 * the prompt. Both adapters implement it, so the critic is no longer pinned to one
 * vendor — the router picks, and the pack records which one actually graded it.
 */
export interface VisionCapable {
  completeWithContent(
    request: Omit<TextCompletionRequest, "prompt">,
    content: ChatContent[],
  ): Promise<TextCompletionResult>;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

export class AnthropicText implements TextModelPort, VisionCapable {
  constructor(private readonly config: ProviderConfig) {}

  async complete(request: TextCompletionRequest): Promise<TextCompletionResult> {
    return this.completeWithContent(request, [{ type: "text", text: request.prompt }]);
  }

  /**
   * The same call, with images allowed in the user turn — this is what lets the
   * Tribunal's critic run on Claude rather than being pinned to OpenAI.
   *
   * The critic speaks in OpenAI's `ChatContent` shape (data-URI `image_url`), so
   * translate it: Anthropic wants `{type:"image", source:{type:"base64", media_type, data}}`.
   */
  async completeWithContent(
    request: Omit<TextCompletionRequest, "prompt">,
    content: ChatContent[],
  ): Promise<TextCompletionResult> {
    const blocks = content.map((part) => {
      if (part.type === "text") return { type: "text" as const, text: part.text ?? "" };

      const url = part.image_url?.url ?? "";
      const match = /^data:([^;]+);base64,(.+)$/.exec(url);
      if (!match) {
        throw new Error("Anthropic vision needs a base64 data URI, not a remote image URL");
      }
      return {
        type: "image" as const,
        source: { type: "base64" as const, media_type: match[1]!, data: match[2]! },
      };
    });

    const body = {
      model: this.config.model,
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.7,
      // Anthropic has no response_format switch — JSON is asked for, then parsed
      // defensively by parseJson(). Saying it twice is cheaper than a failed pack.
      system: request.json
        ? `${request.system}\n\nRespond with ONLY valid JSON. No prose, no code fence.`
        : request.system,
      messages: [{ role: "user", content: blocks }],
    };

    const response = await fetchJson<AnthropicResponse>(
      `${this.config.baseUrl ?? "https://api.anthropic.com"}/v1/messages`,
      {
        ...shared(this.config),
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      },
    );

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");

    return {
      text,
      model: response.model,
      usdCost: estimateUsd(response.model, response.usage.input_tokens, response.usage.output_tokens),
    };
  }
}

/* ------------------------------------------------- openai / xai (same shape) */

interface ChatResponse {
  choices: Array<{ message: { content: string | null } }>;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface ChatContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

/** OpenAI-compatible chat completions — covers OpenAI and xAI Grok unchanged. */
export class ChatCompletionsText implements TextModelPort {
  constructor(
    private readonly config: ProviderConfig,
    private readonly endpoint = "https://api.openai.com/v1/chat/completions",
  ) {}

  async complete(request: TextCompletionRequest): Promise<TextCompletionResult> {
    return this.completeWithContent(request, [{ type: "text", text: request.prompt }]);
  }

  /** Same call, but the user turn may carry images — this is what the critic uses. */
  async completeWithContent(
    request: Omit<TextCompletionRequest, "prompt">,
    content: ChatContent[],
  ): Promise<TextCompletionResult> {
    // OpenAI rejects response_format:json_object unless the word "json" actually appears in
    // the messages ("'messages' must contain the word 'json' in some form"). Without this the
    // call 400s, the pipeline degrades to its fallback, and the product is quietly worse while
    // every test still passes. Found by a live smoke, not by a unit test.
    const system = request.json
      ? `${request.system}\n\nRespond with a single valid JSON object and nothing else.`
      : request.system;

    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    };

    if (request.json) body["response_format"] = { type: "json_object" };

    const response = await fetchJson<ChatResponse>(this.config.baseUrl ?? this.endpoint, {
      ...shared(this.config),
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const text = response.choices[0]?.message.content ?? "";

    return {
      text,
      model: response.model,
      usdCost: estimateUsd(
        response.model,
        response.usage?.prompt_tokens ?? 0,
        response.usage?.completion_tokens ?? 0,
      ),
    };
  }
}

export class XaiText extends ChatCompletionsText {
  constructor(config: ProviderConfig) {
    super(config, "https://api.x.ai/v1/chat/completions");
  }
}

/* -------------------------------------------------------------------- image */

interface ImageResponse {
  data: Array<{ b64_json?: string; url?: string }>;
}

/**
 * OpenAI image generation. Gotcha #8: the response is base64, and we keep it that way —
 * a provider URL expires and must never be hotlinked into a pack that claims permanence.
 */
export class OpenAiImage implements ImageModelPort {
  constructor(private readonly config: ProviderConfig) {}

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const prompt = request.negative
      ? `${request.prompt}\n\nAvoid entirely: ${request.negative}`
      : request.prompt;

    const quality = request.quality ?? DEFAULT_IMAGE_QUALITY;

    const response = await fetchJson<ImageResponse>(
      `${this.config.baseUrl ?? "https://api.openai.com"}/v1/images/generations`,
      {
        timeoutMs: IMAGE_TIMEOUT_MS,
        retries: 1,
        ...(this.config.fetchImpl ? { fetchImpl: this.config.fetchImpl } : {}),
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt,
          size: request.size,
          n: 1,
          // Never omit this: the provider's default is its most expensive tier, so a
          // missing field is a silent 4x on every thumbnail and every repair draft.
          quality,
        }),
      },
    );

    const b64 = response.data[0]?.b64_json;
    if (!b64) {
      throw new Error("image provider returned no base64 payload (a URL is not acceptable)");
    }

    return {
      pngBase64: b64,
      model: this.config.model,
      usdCost: imageCostUsd(request.size, quality),
    };
  }
}

/* ------------------------------------------------------------------- router */

export interface RouterEnv {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  XAI_API_KEY?: string;
  OCE_ANTHROPIC_MODEL?: string;
  OCE_OPENAI_MODEL?: string;
  OCE_OPENAI_IMAGE_MODEL?: string;
  OCE_XAI_MODEL?: string;
  fetchImpl?: typeof fetch;
}

export interface RouterOptions {
  governor?: CostGovernor;
}

/**
 * Routes a studio role to a provider. Every role has a second choice, because a hackathon
 * judge clicking "generate" while one provider is having an outage should still get a pack.
 */
export class ModelRouter implements TextModelPort {
  readonly available: string[] = [];
  readonly gaps: string[] = [];
  private readonly governor: CostGovernor;
  private readonly anthropic?: AnthropicText;
  private readonly openai?: ChatCompletionsText;
  private readonly xai?: XaiText;
  readonly image?: OpenAiImage;

  constructor(env: RouterEnv, options: RouterOptions = {}) {
    this.governor = options.governor ?? new CostGovernor();

    if (env.ANTHROPIC_API_KEY) {
      this.anthropic = new AnthropicText({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.OCE_ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
        ...(env.fetchImpl ? { fetchImpl: env.fetchImpl } : {}),
      });
      this.available.push("anthropic");
    } else {
      this.gaps.push("ANTHROPIC_API_KEY absent — planner/writer/critic fall back to OpenAI");
    }

    if (env.OPENAI_API_KEY) {
      this.openai = new ChatCompletionsText({
        apiKey: env.OPENAI_API_KEY,
        model: env.OCE_OPENAI_MODEL ?? "gpt-4o",
        ...(env.fetchImpl ? { fetchImpl: env.fetchImpl } : {}),
      });
      this.image = new OpenAiImage({
        apiKey: env.OPENAI_API_KEY,
        model: env.OCE_OPENAI_IMAGE_MODEL ?? "gpt-image-1",
        ...(env.fetchImpl ? { fetchImpl: env.fetchImpl } : {}),
      });
      this.available.push("openai");
    } else {
      this.gaps.push("OPENAI_API_KEY absent — no image generation is possible");
    }

    if (env.XAI_API_KEY) {
      this.xai = new XaiText({
        apiKey: env.XAI_API_KEY,
        model: env.OCE_XAI_MODEL ?? "grok-2-latest",
        ...(env.fetchImpl ? { fetchImpl: env.fetchImpl } : {}),
      });
      this.available.push("xai");
    }
  }

  get hasText(): boolean {
    return Boolean(this.anthropic ?? this.openai ?? this.xai);
  }

  /** Preference order per role, best first. */
  private chain(role: StudioRole): TextModelPort[] {
    const anthropic = this.anthropic;
    const openai = this.openai;
    const xai = this.xai;

    const order: Array<TextModelPort | undefined> =
      role === "art_director"
        ? // "punch-up" work: Grok first when present, then the usual suspects.
          [xai, anthropic, openai]
        : [anthropic, openai, xai];

    return order.filter((port): port is TextModelPort => port !== undefined);
  }

  /** The TextModelPort the studios see. Tries each provider in turn; degrades, never guesses. */
  async complete(request: TextCompletionRequest): Promise<TextCompletionResult> {
    const chain = this.chain(request.role);
    if (chain.length === 0) {
      throw new Error("no text model is configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY");
    }

    this.governor.checkLlm();

    let lastError: unknown;
    for (const port of chain) {
      try {
        const result = await port.complete(request);
        this.governor.recordLlmSpend(result.usdCost);
        return result;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    if (!this.image) throw new Error("no image model is configured — set OPENAI_API_KEY");

    this.governor.checkImage();
    const result = await this.image.generate(request);
    this.governor.recordImage();
    this.governor.recordLlmSpend(result.usdCost);
    return result;
  }

  /**
   * The vision-capable model the Tribunal's critic runs on.
   *
   * Claude first, per the router's design — it was previously hard-wired to OpenAI
   * because the Anthropic adapter could not see images, so wiring ANTHROPIC_API_KEY
   * moved the writer to Claude but left the CRITIC on gpt-4o regardless. Both
   * adapters take images now, so the preference is real.
   */
  get visionModel(): VisionCapable | undefined {
    const model = this.anthropic ?? this.openai;
    if (!model) return undefined;

    // METERED. The critic used to reach the adapter DIRECTLY, so every critique — one per
    // artifact, plus one more per repair pass — was invisible to the cost governor. The daily
    // USD cap was guarding the writers and silently ignoring the judge, which on a launch kit
    // is a dozen calls a run. A cap that cannot see half the spend is not a cap.
    const governor = this.governor;
    return {
      async completeWithContent(request, content) {
        const result = await model.completeWithContent(request, content);
        governor.recordLlmSpend(result.usdCost);
        return result;
      },
    };
  }

  get costGovernor(): CostGovernor {
    return this.governor;
  }
}
