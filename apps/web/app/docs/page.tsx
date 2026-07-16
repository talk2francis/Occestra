import Link from "next/link";
import { Callout, DocTitle, InlineCode, PrevNext, Section } from "@/components/docs/doc";
import { CodeBlock } from "@/components/docs/code-block";
import { DOCS_NAV, docHref } from "@/lib/docs-nav";

export default function DocsOverview() {
  return (
    <>
      <DocTitle
        kicker="Occestra developer documentation"
        lede={
          <>
            Occestra is the Occasion Studio: an Agent Service Provider on OKX.AI that turns any
            real moment — a birthday next Saturday, a product launching Friday, a trip just taken —
            into finished, grounded, quality-graded work with on-chain provenance. These pages
            document every rail an agent (or a person with a terminal) can use.
          </>
        }
      >
        Every moment, made monumental — and every claim, checkable.
      </DocTitle>

      <Section id="principles" title="Three things to know before anything else">
        <p>
          <strong>1. The Tribunal grades everything.</strong> Every artifact — image, plan, or
          copy — is graded against the published, versioned Occestra Quality Standard using a
          profile made for its artifact kind, plus deterministic checks. Failures get a concrete repair brief and go back,
          at most twice. The full report ships inside every pack, <em>pass or fail</em>. The rubric
          on <Link href="/standard" className="text-amethyst underline underline-offset-2">/standard</Link>{" "}
          and in these docs is generated from the same constants the grading engine executes, so
          published equals shipped by construction.
        </p>
        <p>
          <strong>2. The Seal makes it checkable.</strong> A finished pack&apos;s manifest is
          canonically hashed, EIP-712-signed, and anchored on X Layer mainnet in the
          KeepsakeRegistry contract. Anyone can verify who made a pack, when, and from what — with
          ~40 lines of viem and no trust in our servers. The{" "}
          <Link href={docHref("provenance")} className="text-amethyst underline underline-offset-2">provenance page</Link>{" "}
          contains a standalone script that verifies a real production seal, end to end.
        </p>
        <p>
          <strong>3. Honesty is enforced in code, not in a policy page.</strong> A failed data
          source degrades the pack and is recorded as a coverage gap — never hidden, never faked.
          A venue is never claimed as booked. Filler copy is caught by a deterministic filter.
          Uploads are private, EXIF-stripped on arrival, and deletable for real. Nothing personal
          ever touches the chain — only a hash of the finished manifest.
        </p>
      </Section>

      <Section id="fastest" title="The fastest possible start">
        <p>
          The endpoint is public HTTPS, MCP over streamable HTTP, stateless. Discovery is free;
          verification is free forever:
        </p>
        <CodeBlock title="discover the studio — free, no key, no signup">{`curl -s https://api.occestra.xyz/.well-known/occestra.json | jq '.tools'

curl -s -X POST https://api.occestra.xyz/mcp \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</CodeBlock>
        <p>
          Paid tools cost between 0.01 and 1.50 USDT per call, settled x402 on X Layer. The{" "}
          <Link href={docHref("quickstart")} className="text-amethyst underline underline-offset-2">quickstart</Link>{" "}
          walks the complete tool surface;{" "}
          <Link href={docHref("payments")} className="text-amethyst underline underline-offset-2">payments</Link>{" "}
          documents the exact wire flow our gate implements.
        </p>
      </Section>

      <Section id="map" title="Where to go">
        <ul className="!mt-2 space-y-2">
          {DOCS_NAV.filter((entry) => entry.slug).map((entry) => (
            <li key={entry.slug}>
              <Link href={docHref(entry.slug)} className="font-medium text-ink hover:text-amethyst">
                {entry.title}
              </Link>{" "}
              <span className="text-ink/55">— {entry.blurb}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Callout tone="good">
        Everything cited in these docs is real and current: live endpoints, a mainnet contract at{" "}
        <InlineCode>0x1653509df702b45d67b3eb12ca37de9f5fc21f08</InlineCode>, real sealed packs you
        can fetch and verify, and prices that match the gate&apos;s price table because both are
        imported from the same source file.
      </Callout>

      <PrevNext slug="" />
    </>
  );
}
