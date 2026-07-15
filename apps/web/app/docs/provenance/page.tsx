import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Callout, DocTitle, InlineCode, ParamTable, PrevNext, Section } from "@/components/docs/doc";
import { CodeBlock } from "@/components/docs/code-block";

export const metadata: Metadata = { title: "Provenance" };

// Baked at build time — the snippet is read from the repo, not at runtime.
export const dynamic = "force-static";

// Embedded at build time from the repo's own runnable example — the docs can
// never show a snippet that differs from the file we actually execute in CI.
const SNIPPET = readFileSync(join(process.cwd(), "..", "..", "examples", "verify-seal.mjs"), "utf8");

export default function Provenance() {
  return (
    <>
      <DocTitle
        kicker="Provenance"
        lede={
          <>
            A sealed pack can be verified by anyone, forever, without asking Occestra anything.
            This page specifies the exact constructions — canonical hashing, the leaf encoding, the
            EIP-712 types — and ends with a standalone script that verifies a{" "}
            <strong>real production seal</strong> end to end. We ran it; the output is shown; run
            it yourself.
          </>
        }
      >
        Trust that survives our servers going away.
      </DocTitle>

      <Section id="manifest" title="1 · Canonical manifest hashing">
        <p>
          The pack manifest (its artifacts, grades, gaps, and metadata) is serialized with{" "}
          <InlineCode>canonicalJson</InlineCode>: object keys recursively sorted, no extra
          whitespace, bigints as decimal strings. Then:
        </p>
        <CodeBlock lang="text" title="manifest hash (public packs)">{`manifestHash = keccak256(utf8Bytes(canonicalJson(manifest)))`}</CodeBlock>
        <p>
          Personal content never touches the chain — the hash is the only thing that leaves the
          store. Two manifests differing by one character produce unrelated hashes, so the seal
          binds the <em>exact</em> delivered work.
        </p>

        <Callout tone="info">
          <strong>Private keepsakes are salted.</strong>{" "}
          A public pack&apos;s hash is deterministic, which is fine when the pack is public: anyone
          can recompute it. But a <em>private</em> keepsake — every Remember pack — needs more.
          A deterministic hash is confirmable by anyone who obtains the pack, and identical
          manifests commit to identical leaves, which is linkable. So a private keepsake commits
          to a <strong>salted</strong> hash instead:
          <CodeBlock lang="text" title="manifest commitment (private packs)">{`commitment = keccak256(salt || canonicalJson(manifest))   // salt = 32 random bytes`}</CodeBlock>
          The salt is stored with the pack, never on chain and never in the public page, and is
          released only to the owner (who presents their owner token). The anchored leaf then
          proves the keepsake <em>exists</em> and was sealed — while revealing nothing about it and
          linking to nothing. The owner, holding the salt, can still verify the commitment opens to
          their pack; a stranger can verify the signature and the anchor, but not the contents. A
          memory can be proven without being published.
        </Callout>
      </Section>

      <Section id="leaf" title="2 · The leaf">
        <p>What actually lands on-chain is a single 32-byte leaf:</p>
        <CodeBlock lang="text" title="leaf encoding (Solidity abi.encode, mirrored in TS + viem)">{`leaf = keccak256(abi.encode(
  keccak256(bytes(keepsakeId)),  // bytes32
  manifestHash,                  // bytes32
  packKind,                      // uint8 — celebrate=0, remember=1, launch=2, tool=3
  createdAt                      // uint64 — unix seconds
))`}</CodeBlock>
        <p>
          The same construction is implemented three times — Solidity, TypeScript
          (<InlineCode>@occestra/receipts</InlineCode>), and the browser (viem on{" "}
          <InlineCode>/k</InlineCode> pages) — and a cross-language test in the repo executes the
          real contract bytecode in an in-process EVM to prove all three agree.
        </p>
      </Section>

      <Section id="eip712" title="3 · The EIP-712 signature">
        <ParamTable
          rows={[
            { name: "domain.name", type: '"Occestra"', desc: "With version \"1\", chainId 196, and the registry as verifyingContract." },
            { name: "Keepsake.keepsakeId", type: "string", desc: "The oce_… id." },
            { name: "Keepsake.manifestHash", type: "bytes32", desc: "From step 1." },
            { name: "Keepsake.packKind", type: "uint8", desc: "The studio enum." },
            { name: "Keepsake.createdAt", type: "uint64", desc: "Seal time, unix seconds." },
          ]}
        />
        <p>
          Signer: <InlineCode>0x0d63f9EeB86813230B72017444cea16Cd4A453F2</InlineCode> — also
          published in the manifest at <InlineCode>/.well-known/occestra.json</InlineCode>, and
          readable on-chain as <InlineCode>KeepsakeRegistry.sealer()</InlineCode>. Sealer rotation
          is a two-step on-chain handover, so the authority trail is itself verifiable.
        </p>
      </Section>

      <Section id="registry" title="4 · The registry">
        <ParamTable
          rows={[
            { name: "contract", type: "X Layer · 196", desc: "0x1653509df702b45d67b3eb12ca37de9f5fc21f08 — KeepsakeRegistry, Solidity ^0.8.24." },
            { name: "seal(leaf)", type: "onlySealer", desc: "Rejects zero and double-seals; records block.timestamp; emits Sealed(leaf, timestamp)." },
            { name: "sealBatch(leaves)", type: "onlySealer", desc: "The anchor worker drains queued leaves in batches (default every 30 min) — a seal can briefly be 'signed, anchoring queued', and everything reports exactly that state." },
            { name: "anchoredAt(leaf)", type: "view → uint64", desc: "0 = not anchored. This is the only read verification needs." },
          ]}
        />
      </Section>

      <Section id="verify" title="5 · Verify a real seal — standalone, runnable">
        <p>
          This is <InlineCode>examples/verify-seal.mjs</InlineCode> from the repository, embedded
          at build time. Its only dependency is viem. The values in it are a real production pack —
          not a fixture.
        </p>
        <CodeBlock title="examples/verify-seal.mjs — npm i viem && node verify-seal.mjs" lang="js">{SNIPPET}</CodeBlock>
        <CodeBlock title="output, when we ran it against X Layer mainnet" lang="text">{`signature valid : true
leaf            : 0xc814215758135400b364fbb5d4614b7e9ab50a114158a1c91e36064ab23a4adc
anchored        : yes — 2026-07-12T20:08:52.000Z

Both checks passed. This pack is exactly what Occestra says it is.`}</CodeBlock>
        <Callout tone="good">
          Note what was <strong>not</strong> required: an Occestra API, an Occestra key, or
          Occestra being online. The public pack JSON plus a public RPC is enough — that is the
          point.
        </Callout>
      </Section>

      <PrevNext slug="provenance" />
    </>
  );
}
