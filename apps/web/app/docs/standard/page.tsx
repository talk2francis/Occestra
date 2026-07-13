import type { Metadata } from "next";
import Link from "next/link";
import { marked } from "marked";
import { OQS_VERSION, rubricAsMarkdown } from "@occestra/tribunal";
import { Callout, DocTitle, InlineCode, PrevNext, Section } from "@/components/docs/doc";

export const metadata: Metadata = { title: `The Quality Standard (OQS v${OQS_VERSION})` };

export default function StandardDoc() {
  const html = marked.parse(rubricAsMarkdown(), { async: false });

  return (
    <>
      <DocTitle
        kicker={`The Occestra Quality Standard · v${OQS_VERSION}`}
        lede={
          <>
            Most AI creative services have no standard at all; the rest have a standard you cannot
            read. Occestra&apos;s is published, versioned, and generated from the exact constants
            the grading engine executes — this page is rendered at build time from{" "}
            <InlineCode>rubricAsMarkdown()</InlineCode> in <InlineCode>@occestra/tribunal</InlineCode>,
            so it cannot drift from the shipped code.
          </>
        }
      >
        The rubric that grades every artifact — including ours.
      </DocTitle>

      <Section id="philosophy" title="Philosophy: deterministic first">
        <p>
          <strong>Cheap checks run first, on everything, every time.</strong> Budget sums, schedule
          overlaps, real calendar dates, pixel dimensions, WCAG contrast, dead links, file weight,
          policy violations — deterministic code that never hallucinates and cannot be argued with.
          A hard failure cannot be rescued by a good score.
        </p>
        <p>
          <strong>Model critique is versioned and constrained.</strong> The critic scores five
          axes against the published thresholds. It applies a substitution test to copy — if a
          sentence could be pasted into a thread about a different product, it is filler and
          scores accordingly. Its identity and rubric version ship in every report.
        </p>
        <p>
          <strong>Failures go back.</strong> A failing artifact receives a concrete repair brief
          and is regenerated — at most two passes. And when repair isn&apos;t enough, the artifact
          ships <em>marked fail</em>, report included. We have real packs in the{" "}
          <Link href="/gallery" className="text-amethyst underline underline-offset-2">gallery</Link>{" "}
          whose pass rate is 60% — kept, because the alternative is a standard that bends.
        </p>
        <p>
          <strong>Reports always ship.</strong> Every pack carries the full TribunalReport for
          every artifact: axes, checks, issues, repairs, gaps. Grading that hides its results is
          decoration.
        </p>
      </Section>

      <Callout tone="good">
        The Tribunal graded Occestra&apos;s own launch thread <strong>fail</strong>, twice, during
        our dogfooding — and that story is on our landing page. A standard that spares its owner
        is not a standard.
      </Callout>

      <Section id="rubric" title="The rubric, verbatim">
        <div className="rubric-prose" dangerouslySetInnerHTML={{ __html: html }} />
      </Section>

      <Section id="machine" title="Machine-readable">
        <p>
          <InlineCode>GET https://api.occestra.xyz/standard</InlineCode> returns the same rubric —
          JSON with an <InlineCode>Accept: application/json</InlineCode> header, markdown
          otherwise. Version changes bump <InlineCode>oqsVersion</InlineCode>, and every pack
          records the version that graded it.
        </p>
      </Section>

      <PrevNext slug="standard" />
    </>
  );
}
