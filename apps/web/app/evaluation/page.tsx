import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading } from "@/components/ui/section-heading";
import slo from "@/lib/slo.json";

export const metadata: Metadata = {
  title: "Evaluation",
  description:
    "What Occestra guarantees, what it merely measures, and the difference between the two — with the spread published, not hidden.",
};

const TOOL_LABELS: Record<string, string> = {
  oce_write_toast: "Write a toast",
  oce_plan_occasion: "Plan an occasion",
  oce_moodboard: "Make a moodboard",
  oce_make_keepsake: "Make a keepsake",
  oce_design_invite: "Design an invitation",
  oce_launch_kit: "Launch kit",
};

export default function EvaluationPage() {
  const measuredAt = new Date(slo.measuredAt).toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-4xl px-5 py-20 sm:px-8 sm:py-28">
      <SectionHeading
        kicker="Evaluation"
        lede="Two kinds of promise live in this product, and putting them in one table would be a quiet lie. So they are in two."
      >
        What we guarantee, and what we merely measure.
      </SectionHeading>

      {/* ---------------------------------------------------------- exact */}

      <section className="mt-16">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[1.35rem] font-medium text-ink">Reproducible-exact</h2>
          <span className="text-data rounded-full bg-pass/12 px-2.5 py-1 text-[0.7rem] text-pass">
            deterministic
          </span>
        </div>

        <p className="mt-4 max-w-2xl text-[0.95rem] leading-relaxed text-ink/70">
          These are enforced by code that cannot be argued with. A budget&apos;s line items sum to
          its total, or <code className="text-data text-[0.85em]">BUDGET_SUM_MISMATCH</code> fails
          the artifact. There is no p95 here and no &ldquo;usually&rdquo; — it is arithmetic, and it
          holds every time or the pack is marked failed and says so on its own page.{" "}
          <strong className="font-medium text-ink">
            Publishing these as a percentage would imply they could come out otherwise.
          </strong>
        </p>

        <dl className="mt-8 divide-y divide-ink/8 border-y border-ink/10">
          {[
            {
              claim: "Every artifact carries its Tribunal report",
              held: slo.reproducibleExact.everyArtifactCarriesItsReport,
              why: "Pass or fail, the grade ships inside the artifact. There is no path through the code that returns work without one.",
            },
            {
              claim: "No hard check fails inside a passing pack",
              held: slo.reproducibleExact.noHardCheckFailsInsideAPassingPack,
              why: "A hard failure forces pass:false even when the critic loved it. No model can talk its way past arithmetic.",
            },
            {
              claim: "Undelivered work is declared, never dropped",
              held: slo.reproducibleExact.undeliveredDeclaredNeverDropped,
              why: "An artifact the provider refused to make ships as an undelivered stub with the reason. It is never quietly removed — a thinner pack must never score better than a complete one.",
            },
          ].map((row) => (
            <div key={row.claim} className="grid gap-2 py-5 sm:grid-cols-[1fr_5rem] sm:gap-6">
              <div>
                <dt className="text-[0.98rem] text-ink">{row.claim}</dt>
                <dd className="mt-1.5 text-[0.88rem] leading-relaxed text-ink/60">{row.why}</dd>
              </div>
              <div className="text-data text-[0.8rem] sm:text-right">
                <span className={row.held ? "text-pass" : "text-fail"}>
                  {row.held ? "HELD" : "BROKEN"}
                </span>
              </div>
            </div>
          ))}
        </dl>

        <p className="mt-6 text-[0.88rem] leading-relaxed text-ink/60">
          Enforced by {slo.reproducibleExact.hardChecks.length} hard checks:{" "}
          <span className="text-data text-[0.85em] text-ink/75">
            {slo.reproducibleExact.hardChecks.join(", ")}
          </span>
          . All of them are{" "}
          <Link href="/standard" className="text-plum underline underline-offset-4">
            published in full
          </Link>
          .
        </p>
      </section>

      {/* ------------------------------------------------------- variance */}

      <section className="mt-20">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[1.35rem] font-medium text-ink">Measured-with-variance</h2>
          <span className="text-data rounded-full bg-ink/8 px-2.5 py-1 text-[0.7rem] text-ink/60">
            a model is involved
          </span>
        </div>

        <p className="mt-4 max-w-2xl text-[0.95rem] leading-relaxed text-ink/70">
          Everything below depends on a model, four external providers, and the internet. So it gets
          a <strong className="font-medium text-ink">median and a range</strong>, with the number of
          runs printed beside it. A single figure here would claim a precision we have not earned —
          and <em>n</em> = 2 is not a distribution, so we say that rather than dress it up as one.
        </p>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-[0.9rem]">
            <thead>
              <tr className="border-b border-ink/15 text-left text-[0.78rem] uppercase tracking-wide text-ink/50">
                <th className="py-3 pr-4 font-medium">Tool</th>
                <th className="py-3 pr-4 text-right font-medium">Runs</th>
                <th className="py-3 pr-4 text-right font-medium">Latency (median)</th>
                <th className="py-3 pr-4 text-right font-medium">Range</th>
                <th className="py-3 text-right font-medium">Passed the Tribunal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {slo.measuredWithVariance.map((row) => (
                <tr key={row.tool}>
                  <td className="py-3.5 pr-4">
                    <span className="text-ink">{TOOL_LABELS[row.tool] ?? row.tool}</span>
                    <span className="text-data ml-2 text-[0.75rem] text-ink/45">{row.tool}</span>
                  </td>
                  <td className="text-data py-3.5 pr-4 text-right text-ink/70">{row.n}</td>
                  <td className="text-data py-3.5 pr-4 text-right text-ink">
                    {row.latencySeconds.median}s
                  </td>
                  <td className="text-data py-3.5 pr-4 text-right text-ink/60">
                    {row.latencySeconds.min}–{row.latencySeconds.max}s
                  </td>
                  <td className="text-data py-3.5 text-right">
                    <span className={row.passRate.median === 1 ? "text-pass" : "text-ink"}>
                      {(row.passRate.median * 100).toFixed(0)}%
                    </span>
                    {row.passRate.min !== row.passRate.max && (
                      <span className="text-ink/50">
                        {" "}
                        ({(row.passRate.min * 100).toFixed(0)}–{(row.passRate.max * 100).toFixed(0)}
                        %)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-[0.88rem] leading-relaxed text-ink/60">
          {slo.totalRuns} real runs, measured {measuredAt}, costing ${slo.totalSpentUsd.toFixed(2)} of
          genuine provider spend. Reproduce with{" "}
          <code className="text-data text-[0.85em]">node scripts/slo.mjs</code>.
        </p>

        <p className="mt-4 max-w-2xl text-[0.85rem] leading-relaxed text-ink/55">
          A low pass rate is not always the critic. The launch kit renders four images in a burst,
          and when a provider throttles one, the pack ships that piece as a declared{" "}
          <em>undelivered</em> stub rather than dropping it — so the pack is thinner, and the
          artifacts that <em>were</em> made are still graded and still pass. That is the range
          working as designed: honest about what got made, never quietly shrinking the pack to
          flatter the number.
        </p>
      </section>

      {/* -------------------------------------------------------- the critic */}

      <section className="mt-20 rounded-2xl border border-ink/10 bg-panel/60 p-7 sm:p-9">
        <h2 className="text-[1.15rem] font-medium text-ink">
          The pass rate used to be the least trustworthy number here
        </h2>

        <div className="mt-4 space-y-4 text-[0.93rem] leading-relaxed text-ink/70">
          <p>
            We measured the critic against itself: the same artifact, graded six times, no code
            changed in between. One schedule came back{" "}
            <span className="text-data text-[0.9em] text-ink">F P F F P F</span> — its grounding
            score oscillating between 62 and 72, straddling the passing floor of 70.
          </p>
          <p>
            A standard that scores the identical artifact differently on Tuesday than on Wednesday
            is not a standard. It is a mood. So it was fixed{" "}
            <em>before</em> any of the numbers above were measured — there is no point publishing a
            spread you have not first tried to shrink.
          </p>
          <p className="text-ink/85">
            The critic now runs at temperature 0 against anchored scoring bands, the question that
            was doing all the drifting was moved out of the model and into a deterministic check,
            and{" "}
            <strong className="font-medium text-ink">
              a correctness axis may only fall below its floor if the critic can quote the exact
              defect
            </strong>
            . An uncited correctness failure is discarded and the score restored.
          </p>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-ink/10 bg-ground/70 p-5">
            <div className="text-data text-[0.72rem] uppercase tracking-wide text-ink/50">
              Verdict flips, run to run
            </div>
            <div className="mt-2 text-[1.4rem] text-ink">
              <span className="text-fail">1 / 3</span>
              <span className="mx-2.5 text-ink/35">→</span>
              <span className="text-pass">0 / 3</span>
            </div>
          </div>
          <div className="rounded-xl border border-ink/10 bg-ground/70 p-5">
            <div className="text-data text-[0.72rem] uppercase tracking-wide text-ink/50">
              Widest spread on any axis
            </div>
            <div className="mt-2 text-[1.4rem] text-ink">
              <span className="text-fail">10 pts</span>
              <span className="mx-2.5 text-ink/35">→</span>
              <span className="text-pass">0</span>
            </div>
          </div>
        </div>

        <p className="mt-6 text-[0.88rem] leading-relaxed text-ink/60">
          <strong className="font-medium text-ink/80">And the bar did not move.</strong> Verified
          against known-bad work: pure slop still fails (composition 30, grounding 30), and an
          invented &ldquo;$49 per event, 12,000 hosts, 99.4% satisfaction&rdquo; still fails on
          grounding 30. Stable <em>and</em> discriminating — a critic that never fails anything would
          be worse than one that varies. Reproduce with{" "}
          <code className="text-data text-[0.85em]">node scripts/critic-variance.mjs</code>.
        </p>
      </section>

      <p className="mt-16 max-w-2xl text-[0.92rem] leading-relaxed text-ink/60">
        Everything on this page is reproducible from the repository, and every number was measured
        rather than asserted. Where a number is thin, it says so.{" "}
        <Link href="/standard" className="text-plum underline underline-offset-4">
          The standard itself
        </Link>{" "}
        is published in full, generated from the same constants the engine runs.
      </p>
    </main>
  );
}
