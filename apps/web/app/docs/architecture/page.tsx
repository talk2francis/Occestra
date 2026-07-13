import type { Metadata } from "next";
import { ArchitectureDiagram } from "@/components/docs/architecture-diagram";
import { Callout, DocTitle, InlineCode, ParamTable, PrevNext, Section } from "@/components/docs/doc";

export const metadata: Metadata = { title: "Architecture" };

export default function ArchitectureDoc() {
  return (
    <>
      <DocTitle
        kicker="Architecture"
        lede={
          <>
            An npm-workspaces monorepo, dependency-ordered, TypeScript strict everywhere
            (<InlineCode>exactOptionalPropertyTypes</InlineCode> included), 185 tests across the
            packages. The design rule that shapes everything: the pipelines are pure, and the
            world arrives through injected ports.
          </>
        }
      >
        Pure pipelines. Injected world. Checkable output.
      </DocTitle>

      <Section id="diagram" title="The system">
        <div className="my-4 rounded-2xl border border-ink/10 bg-ground p-4 sm:p-6">
          <ArchitectureDiagram />
        </div>
      </Section>

      <Section id="packages" title="The packages">
        <ParamTable
          rows={[
            { name: "studio-core", type: "pure", desc: "Domain types, zod schemas, OccasionContract, the three pipelines, PolicyGate, ids. No I/O — everything worldly is a port (TextModelPort, PlacesPort, GradePort…)." },
            { name: "tribunal", type: "pure-ish", desc: "The OQS rubric as executable constants, 12 deterministic validators, the critique + repair engine, rubricAsMarkdown()/Json() — the same source that renders /standard and these docs." },
            { name: "receipts", type: "crypto", desc: "Canonical JSON hashing, seal-leaf encoding, EIP-712 signing, the KeepsakeRegistry client." },
            { name: "contracts", type: "solidity", desc: "KeepsakeRegistry.sol, compiler pipeline, and a cross-language test that runs the REAL bytecode in an in-process EVM to prove TS and Solidity encode identical leaves." },
            { name: "providers", type: "adapters", desc: "Model router (OpenAI live; Anthropic/xAI wired), image generation, House Styles, weather/places/site/market adapters, cache, and a daily cost governor." },
            { name: "mcp-server", type: "the ASP", desc: "The 8 tools behind the x402 gate, the store, the anchor worker, the A2A negotiation module, public endpoints, and the internal demo SSE that drives the Studio." },
            { name: "client", type: "sdk", desc: "@occestra/client — a tiny typed SDK with the payment flow built in." },
            { name: "apps/web", type: "next 15", desc: "This site: landing, Studio, /k verify pages, gallery, standard, stats, docs. Self-hosted standalone behind Caddy." },
          ]}
        />
      </Section>

      <Section id="decisions" title="Five decisions that carry the weight">
        <ul className="!mt-2 list-none space-y-3">
          <li>
            <strong>1. The Tribunal is injected, not imported.</strong> studio-core cannot depend
            on tribunal (cycle, and purity), so pipelines ask for grades through a{" "}
            <InlineCode>GradePort</InlineCode> and the server hands them the real engine — repair
            loop and all. Tests hand them fakes. Same pipeline, both worlds.
          </li>
          <li>
            <strong>2. Deterministic checks outrank the model.</strong> A hard failure cannot be
            argued away by a high score. This ordering is why our own marketing copy failed its
            own grading — and why that story is credible.
          </li>
          <li>
            <strong>3. Degrade honestly, never silently.</strong> Every provider call can fail
            without aborting a pack; the failure becomes a recorded coverage gap. During a real
            OpenAI billing outage the pipelines kept delivering — smaller, disclosed, true.
          </li>
          <li>
            <strong>4. No facilitator in payments.</strong> The gate verifies EIP-3009 signatures
            itself and settles with its own gas key. Fewer moving parts, no third party to trust,
            and refunds-by-construction: a failed settlement releases the nonce.
          </li>
          <li>
            <strong>5. Hash-only chain.</strong> The contract stores 32-byte leaves and
            timestamps. Nothing personal, nothing revocable, nothing to leak — and verification
            works from public data alone.
          </li>
        </ul>
      </Section>

      <Section id="ops" title="Operations">
        <ParamTable
          rows={[
            { name: "hosting", type: "self-hosted", desc: "Plain Node 22 + systemd + Caddy (auto-HTTPS) on a VPS. No Docker, no platform lock-in." },
            { name: "services", type: "2 units", desc: "occestra-mcp (the ASP) and occestra-web (Next standalone), isolated ports, shared secrets via env files (0600)." },
            { name: "reliability", type: "boring on purpose", desc: "Health checks every 5 min with auto-restart, nightly backups (14-day retention), log rotation, anchor worker with retry + backoff that never takes the server down." },
            { name: "budget", type: "governed", desc: "Daily image and LLM-USD caps enforced by the cost governor; the Studio demo is separately metered and its runs are recorded as status 'demo', never as revenue." },
          ]}
        />
      </Section>

      <Callout tone="good">
        Definition of done, enforced every phase: typecheck + build + full test suite green at
        every checkpoint, live smoke against real providers before anything ships, and every
        expensive lesson recorded in <InlineCode>AGENTS.md</InlineCode>&apos;s deviations log — the
        repo carries its own honest history.
      </Callout>

      <PrevNext slug="architecture" />
    </>
  );
}
