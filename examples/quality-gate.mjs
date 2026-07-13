/**
 * The one-cent quality gate: Vercel AI SDK middleware that runs everything
 * your model generates through Occestra's Tribunal (oce_critique, 0.01 USDT)
 * before your agent ships it. Failures come back with the graded report and a
 * concrete repair brief — regenerate with the brief appended, once, and take
 * the better of the two.
 *
 *   npm i ai @occestra/client
 *
 *   import { wrapLanguageModel } from "ai";
 *   const model = wrapLanguageModel({ model: yourModel, middleware: occestraQualityGate({
 *     endpoint: "https://api.occestra.xyz",
 *     payment: { privateKey: process.env.AGENT_KEY },   // x402, signed locally
 *     kind: "launch_thread",
 *   })});
 *
 * Works with any provider the AI SDK supports — the gate doesn't care who
 * wrote the draft, only whether it clears the published standard.
 */
import { Occestra } from "@occestra/client";

export function occestraQualityGate({ endpoint, payment, kind = "copy", maxRepairs = 1 }) {
  const studio = new Occestra({ endpoint, ...(payment ? { payment } : {}) });

  return {
    // AI SDK LanguageModelV2 middleware: post-process non-streaming generations.
    wrapGenerate: async ({ doGenerate, params }) => {
      let result = await doGenerate();
      const brief =
        params.prompt?.at(-1)?.content?.find?.((part) => part.type === "text")?.text?.slice(0, 500) ??
        "the user's last request";

      for (let attempt = 0; attempt <= maxRepairs; attempt++) {
        const text = result.content?.find((part) => part.type === "text")?.text ?? "";
        if (!text) return result;

        const graded = await studio.critique({ kind, brief, text });
        const report = graded.artifacts[0]?.tribunal;
        if (!report || report.pass) return result; // clears the bar — ship it

        if (attempt === maxRepairs) {
          // Honest failure beats silent shipping: attach the report.
          return {
            ...result,
            providerMetadata: {
              ...result.providerMetadata,
              occestra: { pass: false, issues: report.issues, repairBrief: report.repairBrief },
            },
          };
        }

        // One repair round, exactly like Occestra's own pipelines do it.
        result = await doGenerate({
          ...params,
          prompt: [
            ...params.prompt,
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `A quality review found these problems — fix them and rewrite:\n${report.repairBrief ?? report.issues.join("\n")}`,
                },
              ],
            },
          ],
        });
      }
      return result;
    },
  };
}
