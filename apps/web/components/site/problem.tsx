import { Reveal } from "@/components/motion";
import { SectionHeading } from "@/components/ui/section-heading";

const SCATTER = [
  { tool: "A chat tab", leaves: "a wall of text", rotate: "-rotate-2" },
  { tool: "A template app", leaves: "everyone else's invite", rotate: "rotate-1" },
  { tool: "A spreadsheet", leaves: "a budget nobody checks", rotate: "-rotate-1" },
  { tool: "A maps tab", leaves: "venues, unvetted", rotate: "rotate-2" },
  { tool: "A notes app", leaves: "the toast, unwritten", rotate: "-rotate-3" },
  { tool: "An image bot", leaves: "art with no standard", rotate: "rotate-1.5" },
] as const;

export function Problem() {
  return (
    <section className="border-y border-ink/8 bg-panel/50 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <Reveal>
          <SectionHeading
            kicker="The problem"
            lede={
              <>
                Every meaningful moment splits into logistics and creative work, scattered across
                tools that don&apos;t talk to each other and never check their own output. Nothing is
                grounded in real venues or real weather. Nothing is graded. Nothing is finished.
              </>
            }
          >
            Six tools, zero standards.
          </SectionHeading>
          <p className="prose-measure mt-6 text-[1.02rem] leading-relaxed text-ink/65">
            Occestra replaces the pile with one studio that delivers the finished occasion — and
            shows you the receipts proving the work was actually checked.
          </p>
        </Reveal>

        <div className="grid grid-cols-2 content-start gap-3 sm:gap-4">
          {SCATTER.map((item, i) => (
            <Reveal key={item.tool} delay={i * 0.06} className={i % 3 === 1 ? "translate-y-4" : ""}>
              <div className={`rounded-lg border border-ink/10 bg-ground p-4 shadow-lift ${item.rotate}`}>
                <p className="text-[0.85rem] font-medium text-ink/80">{item.tool}</p>
                <p className="mt-1 text-[0.78rem] text-ink/60">…leaves {item.leaves}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
