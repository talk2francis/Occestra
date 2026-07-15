import type { CSSProperties } from "react";
import { ButtonLink } from "@/components/ui/button";
import { GuillocheRosette } from "@/components/ui/guilloche";
import { SealMark } from "@/components/ui/seal-mark";
import { CELEBRATE } from "@/lib/real";
import { HeroStone, HeroWalkthrough } from "./hero-enhancements";

function ClusterFallback() {
  return (
    <svg viewBox="0 0 170 160" className="hero-prism-fallback h-28 w-auto sm:h-36" aria-hidden>
      <defs>
        <linearGradient id="cluster-amethyst" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-lilac)" stopOpacity="0.9" />
          <stop offset="0.48" stopColor="var(--color-amethyst)" stopOpacity="0.82" />
          <stop offset="1" stopColor="var(--color-plum)" stopOpacity="0.92" />
        </linearGradient>
        <radialGradient id="cluster-warm">
          <stop offset="0" stopColor="#FFD0A8" stopOpacity="0.82" />
          <stop offset="1" stopColor="var(--color-amethyst)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="84" cy="136" rx="54" ry="14" fill="url(#cluster-warm)" opacity="0.22" />
      <g stroke="var(--color-plum)" strokeWidth="1" strokeLinejoin="round">
        <polygon points="80,14 99,42 94,124 69,126 63,43" fill="url(#cluster-amethyst)" />
        <polygon points="80,14 81,110 63,43" fill="var(--color-lilac)" opacity="0.34" />
        <polygon points="35,39 58,55 74,124 55,132 29,65" fill="url(#cluster-amethyst)" opacity="0.88" />
        <polygon points="35,39 55,117 29,65" fill="#FFD0A8" opacity="0.28" />
        <polygon points="133,42 141,69 111,131 93,124 113,57" fill="url(#cluster-amethyst)" opacity="0.9" />
        <polygon points="133,42 112,118 113,57" fill="var(--color-lilac)" opacity="0.34" />
        <polygon points="16,76 38,79 58,132 42,140 13,99" fill="url(#cluster-amethyst)" opacity="0.72" />
        <polygon points="154,75 158,99 126,140 111,132 137,80" fill="url(#cluster-amethyst)" opacity="0.76" />
        <polygon points="55,54 69,70 70,129 55,132 43,76" fill="var(--color-amethyst)" opacity="0.7" />
        <polygon points="111,56 124,77 112,132 95,126 98,72" fill="var(--color-amethyst)" opacity="0.64" />
        <path d="M34 137 56 119 82 126 109 120 136 138 111 150 58 150Z" fill="var(--color-plum)" opacity="0.75" />
      </g>
      <path d="M38 56 52 67" stroke="#FFF4DD" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

function WalkthroughPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink/12 bg-ground shadow-keepsake">
      <div className="flex items-center justify-between border-b border-ink/10 bg-panel/80 px-4 py-2.5 sm:px-5">
        <div className="min-w-0">
          <span className="text-kicker text-amethyst">Celebrate studio</span>
          <span className="text-data ml-3 hidden text-ink/60 sm:inline">{CELEBRATE.id}</span>
        </div>
        <span className="rounded-full border border-pass/30 bg-pass/8 px-2.5 py-0.5 text-[0.68rem] font-semibold tracking-[0.1em] text-pass-ink uppercase">
          sealed
        </span>
      </div>
      <div className="grid min-h-[20rem] sm:grid-cols-[10.5rem_1fr]">
        <div className="border-b border-ink/10 px-4 py-4 sm:border-r sm:border-b-0 sm:px-5">
          <p className="text-kicker text-[0.6rem] text-ink/70">The syndicate</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 sm:block sm:space-y-2">
            {["Planner", "Cartographer", "Art Director", "Writer", "Critic", "Archivist"].map((role) => (
              <p key={role} className="flex items-center gap-2 text-[0.78rem] text-ink/65">
                <span className="size-1.5 rounded-full bg-pass" />
                {role}
              </p>
            ))}
          </div>
        </div>
        <div className="relative p-5 sm:p-6">
          <p className="text-subhead max-w-[27em]">“{CELEBRATE.brief}”</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-ink/10 bg-panel/60 p-4">
              <p className="text-kicker text-[0.6rem] text-ink/70">Grounded research</p>
              <p className="mt-2 text-[0.82rem] leading-relaxed text-ink/70">
                {CELEBRATE.venues.length} real venues · live forecast · schedule · exact budget
              </p>
            </div>
            <div className="rounded-xl border border-ink/10 bg-panel/60 p-4">
              <p className="text-kicker text-[0.6rem] text-ink/70">Tribunal</p>
              <p className="mt-2 text-[0.82rem] leading-relaxed text-ink/70">
                {CELEBRATE.artifacts.length} artifacts graded · provenance anchored on X Layer
              </p>
            </div>
          </div>
          <SealMark size={78} className="absolute right-5 bottom-5 text-amethyst/80" />
        </div>
      </div>
    </div>
  );
}

const heroDelay = (value: string) => ({ "--hero-delay": value }) as CSSProperties;

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-24">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="vignette-warm absolute inset-0"
          style={{ "--vig-size": "48% 65%", "--vig-pos": "50% 18%" } as CSSProperties}
        />
        <GuillocheRosette
          size={640}
          crop={{ x: 0, y: 0.42, w: 0.58, h: 0.58 }}
          className="absolute top-0 right-0 hidden md:block"
        />
      </div>
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex items-end justify-between gap-8">
          <div className="max-w-3xl">
            <p className="hero-enter text-kicker flex items-center gap-3 text-amethyst" style={heroDelay("0s")}>
              <span aria-hidden className="h-px w-8 bg-amethyst/50" />
              The Occasion Studio · Agent #5213 on X Layer
            </p>
            <h1 className="hero-enter text-display mt-6 text-balance" style={heroDelay("0.08s")}>
              Every moment, made&nbsp;monumental.
            </h1>
            <p className="hero-enter prose-measure mt-6 text-[1.08rem] leading-relaxed text-ink/65" style={heroDelay("0.18s")}>
              Give it a birthday next Saturday, a product launching Friday, a trip just taken. A
              syndicate of studio roles plans it, designs it, writes it — then grades every artifact
              against a published standard, repairs what fails, and seals the finished pack on
              X&nbsp;Layer.
            </p>
            <div className="hero-enter mt-9 flex flex-wrap items-center gap-4" style={heroDelay("0.28s")}>
              <ButtonLink href="/studio" size="lg">Open the Studio</ButtonLink>
              <a
                href="#tribunal"
                className="text-[0.92rem] font-medium text-ink/60 underline decoration-ink/25 underline-offset-4 transition-colors hover:text-ink"
              >
                See how work gets graded
              </a>
            </div>
          </div>
          <div className="hero-enter hero-enter-fade hidden shrink-0 pb-4 md:block" style={heroDelay("0.3s")} aria-hidden>
            <HeroStone fallback={<ClusterFallback />} />
          </div>
        </div>

        <div className="hero-enter hero-enter-fade mt-16 sm:mt-20 md:ml-[8%] lg:ml-[14%]" style={heroDelay("0.42s")}>
          <HeroWalkthrough fallback={<WalkthroughPreview />} />
        </div>
      </div>
    </section>
  );
}
