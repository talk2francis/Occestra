import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocTitle, InlineCode, ParamTable, PrevNext, Section } from "@/components/docs/doc";
import { CodeBlock } from "@/components/docs/code-block";
import { docHref } from "@/lib/docs-nav";
import { TOOLS } from "@/lib/real";

export const metadata: Metadata = { title: "Quickstart" };

const ENDPOINT = "https://api.occestra.xyz/mcp";

function call(tool: string, args: string): string {
  return `curl -s -X POST ${ENDPOINT} \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{
    "jsonrpc": "2.0", "id": 1, "method": "tools/call",
    "params": { "name": "${tool}", "arguments": ${args} }
  }'`;
}

export default function Quickstart() {
  return (
    <>
      <DocTitle
        kicker="Quickstart"
        lede={
          <>
            Thirteen tools behind one stateless MCP endpoint: eight creative/verification capabilities,
            four durable job controls, and the free style catalog. Everything below is copy-paste against
            production. Paid calls return HTTP 402 first — that is the payment challenge, and the{" "}
            <Link href={docHref("payments")} className="text-amethyst underline underline-offset-2">payments page</Link>{" "}
            shows the ~30 lines that answer it. Verification never costs anything.
          </>
        }
      >
        The complete tool surface, end to end.
      </DocTitle>

      <Section id="endpoint" title="The endpoint">
        <ParamTable
          rows={[
            { name: "endpoint", type: "POST only", desc: `${ENDPOINT} — MCP streamable HTTP, stateless: a fresh server per request, no session to manage.` },
            { name: "manifest", type: "GET", desc: "https://api.occestra.xyz/.well-known/occestra.json — tools, prices, payment standard, House Styles, provenance constants." },
            { name: "rate limit", type: "60/min/IP", desc: "429 beyond that. Paid settlement is your throughput ceiling in practice." },
          ]}
        />
        <p>Prices, from the same table the gate enforces:</p>
        <ParamTable
          rows={TOOLS.map((tool) => ({
            name: tool.name,
            type:
              tool.price === null
                ? "at cost"
                : tool.price === 0
                  ? "free"
                  : `${tool.price.toFixed(2)} USDT`,
            desc: tool.gives,
          }))}
        />
      </Section>

      <Section id="response-shape" title="What every paid tool returns">
        <p>
          One shape, everywhere. The pack is the product; the report and the seal are the proof:
        </p>
        <CodeBlock title="response — the result content, parsed" lang="json">{`{
  "keepsakeId": "oce_01kxbz33bb4grnd1xh0gev",   // stable id, /^oce_[0-9a-z]{22}$/
  "studio": "celebrate",
  "quality": {
    "oqsVersion": "1.2.0",                       // the rubric version that graded this
    "passRate": 1,                               // artifacts passing / artifacts graded
    "repairedCount": 0                           // Tribunal repair passes that ran
  },
  "coverageGaps": [],                            // honest list of what degraded, if anything
  "artifacts": [{
    "id": "plan", "kind": "plan", "title": "…", "format": "json",
    "content": "…",                              // inline for text; images get:
    "url": "https://api.occestra.xyz/a/…?exp=…&tok=…",  // signed, expiring
    "sources": [{ "source": "openstreetmap", "retrievedAt": "…", "url": "…" }],
    "tribunal": { "pass": true, "repairs": 0, "axes": { "composition": 85, … },
                  "deterministic": [ … ], "issues": [], "coverageGaps": [] }
  }],
  "seal": {                                      // present when the sealer key is live
    "keepsakeId": "…", "manifestHash": "0x…", "packKind": 0, "createdAt": 1783886884,
    "signature": "0x…", "signer": "0x0d63f9EeB86813230B72017444cea16Cd4A453F2",
    "chainId": 196, "verifyingContract": "0x1653509df702b45d67b3eb12ca37de9f5fc21f08",
    "leaf": "0x…", "anchored": true, "anchorTx": "0x…"
  },
  "publicPage": "https://occestra.xyz/k/oce_01kxbz33bb4grnd1xh0gev"
}`}</CodeBlock>
        <Callout>
          That example is a <strong>real pack</strong>. Fetch it yourself:{" "}
          <InlineCode>curl https://api.occestra.xyz/k/oce_01kxbz33bb4grnd1xh0gev</InlineCode> — or
          see it rendered at{" "}
          <Link href="/k/oce_01kxbz33bb4grnd1xh0gev" className="text-amethyst underline underline-offset-2">
            /k/oce_01kxbz33bb4grnd1xh0gev
          </Link>
          .
        </Callout>
      </Section>

      <Section id="plan" title="oce_plan_occasion — 0.30 USDT">
        <p>
          The full CELEBRATE studio: a plan grounded in real venues (OpenStreetMap, ranked and
          chain-demoted) and a real forecast (Open-Meteo), plus schedule, budget, contingency
          branches and a shareable guest guide. Every grounded claim carries its source and
          retrieval timestamp. <strong>No venue is ever claimed as booked.</strong>
        </p>
        <ParamTable
          rows={[
            { name: "occasion", type: "string", required: true, desc: "What is being celebrated, in your words." },
            { name: "city", type: "string", required: true, desc: "Where. Geocoded against real places." },
            { name: "date", type: "string", required: true, desc: "ISO date. Forecasts only exist ~10 days out; beyond that the plan says so instead of guessing." },
            { name: "headcount", type: "number", required: true, desc: "1–500." },
            { name: "vibe", type: "string", required: true, desc: "The register: 'warm, candlelit, unhurried'." },
            { name: "budgetUsd", type: "number", desc: "Optional. Budget artifact must sum to it (BUDGET_SUM_MISMATCH is a hard check)." },
            { name: "styleId", type: "HouseStyleId", desc: "amethyst_editorial · gilded_noir · sunprint · atlas_ink. Default: atlas_ink." },
            { name: "deliverables", type: "CelebrateKind[]", desc: "Subset of plan · schedule · budget · contingency · guest_guide. Default: all five." },
          ]}
        />
        <CodeBlock title="request">{call("oce_plan_occasion", `{
      "occasion": "A farewell dinner for a friend moving abroad",
      "city": "Lisbon", "date": "2026-07-19", "headcount": 8,
      "vibe": "warm, unhurried, a long table, good wine"
    }`)}</CodeBlock>
      </Section>

      <Section id="invite" title="oce_design_invite — 0.75 USDT">
        <p>An invitation suite rendered in a versioned House Style, contrast-checked and dimension-checked by the Tribunal.</p>
        <ParamTable
          rows={[
            { name: "occasion", type: "string", required: true, desc: "What the invite is for." },
            { name: "date", type: "string", required: true, desc: "Printed on the invite; DATE_INVALID is a hard check." },
            { name: "city", type: "string", desc: "Optional location line." },
            { name: "styleId", type: "HouseStyleId", desc: "Visual system for the render." },
            { name: "detail", type: "string", desc: "Anything the design should honor." },
          ]}
        />
        <CodeBlock title="request">{call("oce_design_invite", `{
      "occasion": "Amara's graduation dinner", "date": "2026-08-02",
      "city": "Lagos", "styleId": "gilded_noir"
    }`)}</CodeBlock>
      </Section>

      <Section id="keepsake" title="oce_make_keepsake — 0.75 USDT">
        <p>
          The REMEMBER studio: keepsake artwork in a curated style plus a story page that strictly
          separates what your photographs establish from what is written as prose. People in your
          photos are <strong>counted, never identified</strong>. Uploads (optional) go to{" "}
          <InlineCode>POST /uploads</InlineCode> first — EXIF and GPS are stripped on arrival, the
          original bytes are never written to disk, and <InlineCode>DELETE /projects/:id</InlineCode>{" "}
          removes pack, artifacts <em>and</em> photographs, verified.
        </p>
        <ParamTable
          rows={[
            { name: "title", type: "string", required: true, desc: "What you call this memory." },
            { name: "description", type: "string", desc: "What happened, in your words. Names you use are treated as your facts about your own life." },
            { name: "momentDate", type: "string", desc: "When it happened." },
            { name: "tone", type: "string", desc: "'nostalgic, quiet'." },
            { name: "mediaRefs", type: "string[]", desc: "Private upload keys from POST /uploads (max 8)." },
            { name: "confirmGraph", type: "StoryGraph", desc: "Your corrected story graph — used exactly as given, no re-inference." },
            { name: "styleId", type: "HouseStyleId", desc: "Default sunprint — cyanotype is the right register for memory." },
          ]}
        />
        <CodeBlock title="request">{call("oce_make_keepsake", `{
      "title": "Our first summer in Porto",
      "description": "We walked the bridge at dusk and ate too many pastries.",
      "tone": "nostalgic, quiet"
    }`)}</CodeBlock>
      </Section>

      <Section id="toast" title="oce_write_toast — 0.10 USDT">
        <p>A toast written for the room, not for the internet — the anti-slop filters hit copy hardest.</p>
        <ParamTable
          rows={[
            { name: "subject", type: "string", required: true, desc: "Who or what the toast is to." },
            { name: "relationship", type: "string", desc: "Your relationship to the subject." },
            { name: "tone", type: "string", desc: "'funny but ends sincere'." },
            { name: "details", type: "string", desc: "The specific memories only you could supply — this is what makes it yours." },
            { name: "lengthSeconds", type: "number", desc: "Spoken length target." },
          ]}
        />
        <CodeBlock title="request">{call("oce_write_toast", `{
      "subject": "Mara", "relationship": "my older sister",
      "tone": "funny, ends sincere",
      "details": "she taught me to drive, badly, in a borrowed Corolla"
    }`)}</CodeBlock>
      </Section>

      <Section id="moodboard" title="oce_moodboard — 0.30 USDT">
        <ParamTable
          rows={[
            { name: "subject", type: "string", required: true, desc: "What the board is for." },
            { name: "styleId", type: "HouseStyleId", desc: "The versioned style system to direct it." },
            { name: "notes", type: "string", desc: "Constraints and references." },
          ]}
        />
        <CodeBlock title="request">{call("oce_moodboard", `{
      "subject": "a rooftop birthday dinner at dusk", "styleId": "amethyst_editorial"
    }`)}</CodeBlock>
      </Section>

      <Section id="launch" title="oce_launch_kit — 1.50 USDT">
        <p>
          The LAUNCH studio: give it a URL and it reads your <em>actual</em> site in a headless
          browser — the colours a browser rendered, not a guess — extracts an honest brand genome,
          then produces a hero visual, announcement cards, a launch thread, a 90-second demo beat
          sheet and OG images. Fabricated prices, invented user counts, and placeholder copy are
          caught deterministically and rejected or repaired — never shipped as fill-in-the-blank text.
        </p>
        <ParamTable
          rows={[
            { name: "productName", type: "string", required: true, desc: "The product." },
            { name: "url", type: "string", desc: "Live URL. Without it the genome is description-only and the pack discloses that gap." },
            { name: "description", type: "string", desc: "One honest paragraph." },
            { name: "audience", type: "string", desc: "Who this is for." },
            { name: "styleId", type: "HouseStyleId", desc: "Visual system for the renders." },
            { name: "deliverables", type: "LaunchKind[]", desc: "Subset of the kit." },
          ]}
        />
        <CodeBlock title="request">{call("oce_launch_kit", `{
      "productName": "YourProject", "url": "https://yourproject.xyz",
      "audience": "builders shipping this week"
    }`)}</CodeBlock>
      </Section>

      <Section id="critique" title="oce_critique — 0.01 USDT · the wedge">
        <p>
          Run <strong>your own</strong> artifact — text or image, ours or yours — through the
          Occestra Tribunal and get back the graded OQS report plus a concrete repair brief. One
          cent. This is the cheapest way any builder in the ecosystem can find out whether their
          output clears a published standard before their users do.
        </p>
        <ParamTable
          rows={[
            { name: "kind", type: "string", required: true, desc: "What the artifact is: 'launch_thread', 'invitation', 'plan'… — selects which deterministic checks apply." },
            { name: "brief", type: "string", required: true, desc: "What the artifact was supposed to achieve. Grading is always against intent." },
            { name: "text", type: "string", desc: "The artifact, if it is copy." },
            { name: "imageBase64", type: "string", desc: "The artifact, if it is an image." },
            { name: "styleId", type: "HouseStyleId", desc: "Style to grade fidelity against, for images." },
            { name: "size", type: "string", desc: "Declared dimensions, for the DIM_ASPECT_MISMATCH check." },
          ]}
        />
        <CodeBlock title="request">{call("oce_critique", `{
      "kind": "launch_thread",
      "brief": "announce a CLI tool to senior engineers without hype",
      "text": "Post 1: We are thrilled to announce our revolutionary…"
    }`)}</CodeBlock>
        <p>
          Response: the full TribunalReport — axes, deterministic results, issues, and{" "}
          <InlineCode>repairBrief</InlineCode> when it fails. That example fails; the report will
          tell you exactly why.
        </p>
      </Section>

      <Section id="verify" title="oce_verify_keepsake — free, forever">
        <p>
          Verification is deliberately outside the paywall: trust that costs money is not trust.
        </p>
        <ParamTable
          rows={[{ name: "keepsakeId", type: "string", required: true, desc: "Any Occestra keepsake id." }]}
        />
        <CodeBlock title="request">{call("oce_verify_keepsake", `{ "keepsakeId": "oce_01kxbz33bb4grnd1xh0gev" }`)}</CodeBlock>
        <CodeBlock title="response" lang="json">{`{
  "found": true,
  "keepsakeId": "oce_01kxbz33bb4grnd1xh0gev",
  "studio": "celebrate",
  "quality": { "oqsVersion": "1.2.0", "passRate": 1, "repairedCount": 0 },
  "seal": {
    "…": "the full seal fields, plus:",
    "leaf": "0xc814215758135400b364fbb5d4614b7e9ab50a114158a1c91e36064ab23a4adc",
    "signatureValid": true
  },
  "anchored": true,
  "anchorTx": "0xb97ec200c619fca5f589b07d65bb7aa1a31a404e50e8fe010e19abf0c4058801",
  "explorer": "https://www.oklink.com/x-layer/tx/0xb97ec2…",
  "publicPage": "https://api.occestra.xyz/k/oce_01kxbz33bb4grnd1xh0gev"
}`}</CodeBlock>
        <p>
          Or skip our servers entirely — the{" "}
          <Link href={docHref("provenance")} className="text-amethyst underline underline-offset-2">
            provenance page
          </Link>{" "}
          has a standalone script that performs both checks against the chain directly.
        </p>
      </Section>

      <Section id="sdk" title="The SDK, and the drop-in quality gate">
        <p>
          <InlineCode>@occestra/client</InlineCode> wraps all of the above with types and automatic
          x402 payment (your key signs locally; it is never sent):
        </p>
        <CodeBlock title="five lines, whole integration" lang="ts">{`import { Occestra } from "@occestra/client";

const studio = new Occestra({ endpoint: "https://api.occestra.xyz",
  payment: { privateKey: process.env.AGENT_KEY } });
const toast = await studio.writeToast({ subject: "Mara", details: "she taught me to drive, badly" });
console.log(toast.publicPage); // graded, sealed, verifiable`}</CodeBlock>
        <p>
          And for any agent built on the Vercel AI SDK,{" "}
          <InlineCode>examples/quality-gate.mjs</InlineCode> in the repo is a drop-in middleware
          that runs every generation through <InlineCode>oce_critique</InlineCode> before your
          agent ships it — one repair round on failure, exactly like our own pipelines, for one
          cent a check:
        </p>
        <CodeBlock title="quality-gate for any AI SDK model" lang="ts">{`import { wrapLanguageModel } from "ai";
import { occestraQualityGate } from "./quality-gate.mjs";

const model = wrapLanguageModel({
  model: yourModel, // any provider
  middleware: occestraQualityGate({
    endpoint: "https://api.occestra.xyz",
    payment: { privateKey: process.env.AGENT_KEY },
    kind: "launch_thread",
  }),
});
// generations that fail the published standard are repaired once with the
// Tribunal's brief; persistent failures ship WITH the report attached.`}</CodeBlock>
      </Section>

      <PrevNext slug="quickstart" />
    </>
  );
}
