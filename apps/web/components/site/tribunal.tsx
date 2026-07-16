import { Reveal } from "@/components/motion";
import { GuillocheCorner } from "@/components/ui/guilloche";
import { AxisChip } from "@/components/ui/axis-chip";
import { GradeChip } from "@/components/ui/grade-chip";
import { SectionHeading } from "@/components/ui/section-heading";
import { API_BASE, OQS_VERSION, TRIBUNAL_CASE } from "@/lib/real";

/**
 * The anti-slop mechanism, shown on our own work: a launch thread Occestra
 * wrote about itself, graded fail, repaired twice — and honestly still marked
 * fail when the repairs weren't enough. The grade is not for sale.
 */
export function Tribunal() {
  const { before, after, passCase } = TRIBUNAL_CASE;

  return (
    <section id="tribunal" className="relative scroll-mt-20 overflow-hidden border-y border-ink/8 bg-panel/50 py-20 sm:py-28">
      <GuillocheCorner size={130} corner="tr" className="absolute top-0 right-0 hidden lg:block" />
      <GuillocheCorner size={130} corner="bl" className="absolute bottom-0 left-0 hidden lg:block" />
      <div aria-hidden className="vignette-warm absolute inset-0" style={{ "--vig-size": "42% 34%", "--vig-pos": "50% 10%" } as React.CSSProperties} />
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            kicker={`The Tribunal · OQS v${OQS_VERSION}`}
            lede={
              <>
                Every artifact — image, plan, or copy — is graded against the published Occestra
                Quality Standard with kind-specific profiles and deterministic checks. Failures get a
                concrete repair brief and go back, up to twice. The full report ships inside every
                pack, pass or fail.
              </>
            }
          >
            Work that grades its own work.
          </SectionHeading>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-2 lg:gap-8">
          {/* the failing draft */}
          <Reveal>
            <div className="flex h-full flex-col rounded-2xl border border-fail/25 bg-ground p-6 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <p className="text-kicker text-ink/60">first draft · {TRIBUNAL_CASE.artifact}</p>
                <GradeChip verdict="fail">fail</GradeChip>
              </div>
              <blockquote className="mt-5 space-y-3 border-l-2 border-fail/30 pl-4 font-serif text-[1.02rem] leading-relaxed text-ink/75 italic">
                {before.posts.map((post) => (
                  <p key={post.slice(0, 24)}>“{post}”</p>
                ))}
              </blockquote>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {Object.entries(before.axes).map(([axis, score]) => (
                  <AxisChip key={axis} axis={axis} score={score} />
                ))}
              </div>
              <ul className="mt-5 space-y-2 text-[0.86rem] leading-relaxed text-ink/60">
                {before.issues.map((issue) => (
                  <li key={issue.slice(0, 24)} className="flex gap-2">
                    <span aria-hidden className="mt-[0.55em] size-1 shrink-0 rounded-full bg-fail/70" />
                    {issue}
                  </li>
                ))}
              </ul>
              <p className="mt-auto pt-5">
                <span className="text-kicker text-repair">Repair brief</span>
                <span className="mt-2 block text-[0.86rem] leading-relaxed text-ink/60">
                  “{before.repairBrief}”
                </span>
              </p>
            </div>
          </Reveal>

          {/* after two repairs */}
          <Reveal delay={0.12}>
            <div className="flex h-full flex-col rounded-2xl border border-repair/30 bg-ground p-6 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <p className="text-kicker text-ink/60">shipped · after the repair loop</p>
                <GradeChip verdict="repair">repaired ×{after.repairs}</GradeChip>
              </div>
              <blockquote className="mt-5 space-y-3 border-l-2 border-pass/40 pl-4 font-serif text-[1.02rem] leading-relaxed text-ink/85 italic">
                {after.posts.map((post) => (
                  <p key={post.slice(0, 24)}>“{post}”</p>
                ))}
              </blockquote>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {Object.entries(after.axes).map(([axis, score]) => (
                  <AxisChip key={axis} axis={axis} score={score} />
                ))}
              </div>
              <div className="mt-auto space-y-3 pt-5">
                <p className="rounded-xl border border-ink/10 bg-panel/70 p-4 text-[0.86rem] leading-relaxed text-ink/65">
                  The filler is gone — and the Tribunal <em>still</em> marked this one fail, because
                  the grades didn&apos;t clear the bar. It shipped inside the pack saying exactly
                  that. The standard does not bend for our own marketing.
                </p>
                <p className="text-[0.86rem] leading-relaxed text-ink/60">
                  When repair works, it shows: the keepsake artwork above failed once on
                  legibility, came back at{" "}
                  {Object.entries(passCase.axesAfter)
                    .slice(0, 2)
                    .map(([axis, score]) => `${axis.replace("_", " ")} ${score}`)
                    .join(", ")}{" "}
                  — <GradeChip verdict="pass" className="align-text-bottom">repaired ×1 · pass</GradeChip>
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <p className="mt-10 text-[0.92rem] text-ink/65">
            The rubric is public and versioned — published from the same code that runs it, so what
            you read is what grades you.{" "}
            <a
              href={`${API_BASE}/standard`}
              className="font-medium text-amethyst underline decoration-amethyst/30 underline-offset-4 hover:decoration-amethyst"
            >
              Read the Occestra Quality Standard
            </a>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
