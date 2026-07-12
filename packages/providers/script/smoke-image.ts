/**
 * Manual smoke. NOT a test — it spends real money and touches the real network.
 *
 *   npm run smoke:image --workspace @occestra/providers
 *
 * Generates one image in a House Style, runs it through the same sharp pipeline the packs
 * use, and drops it in ./artifacts-out for eyeballing. If OPENAI_API_KEY is absent it says
 * so and exits 0 — the whole point of the fakes is that a keyless clone still works.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { FakeImageModel, HOUSE_STYLES, OpenAiImage, styleSystemPrompt } from "../src/index.js";

const styleId = (process.argv[2] ?? "amethyst_editorial") as keyof typeof HOUSE_STYLES;
const style = HOUSE_STYLES[styleId];
if (!style) {
  console.error(`unknown style "${styleId}". Try: ${Object.keys(HOUSE_STYLES).join(", ")}`);
  process.exit(1);
}

const SUBJECT = [
  "An invitation card for a thirtieth birthday dinner for twelve people in Lisbon, on a warm",
  "evening in July. A long table, candles low, the last of the light. No text, no lettering —",
  "the artwork only; type will be set separately.",
].join(" ");

const outDir = join(process.cwd(), "artifacts-out");
await mkdir(outDir, { recursive: true });

const apiKey = process.env["OPENAI_API_KEY"];
const size = "1024x1536";

const model = apiKey
  ? new OpenAiImage({ apiKey, model: process.env["OCE_OPENAI_IMAGE_MODEL"] ?? "gpt-image-1" })
  : undefined;

if (!model) {
  console.log("OPENAI_API_KEY is not set — generating the deterministic FAKE instead.");
  console.log("This is exactly what a keyless clone of the repo produces: honest, not broken.\n");
}

const generator = model ?? new FakeImageModel(style.palette);

console.log(`style:   ${style.name} v${style.version}`);
console.log(`size:    ${size}`);
console.log(`subject: ${SUBJECT.slice(0, 70)}...`);
console.log("generating...");

const started = Date.now();
const result = await generator.generate({
  prompt: `${styleSystemPrompt(style)}\n\nSUBJECT:\n${SUBJECT}`,
  negative: style.negativePrompt,
  size,
});
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

// Gotcha #8: base64 in, sharp out. A provider URL never enters a pack.
const png = Buffer.from(result.pngBase64, "base64");
const meta = await sharp(png).metadata();

const path = join(outDir, `${styleId}-${Date.now()}.png`);
await writeFile(path, png);

console.log("");
console.log(`model:   ${result.model}`);
console.log(`cost:    ~$${result.usdCost.toFixed(3)}`);
console.log(`elapsed: ${elapsed}s`);
console.log(`png:     ${meta.width}x${meta.height}, ${(png.byteLength / 1024).toFixed(0)} KB`);
console.log(`saved:   ${path}`);
