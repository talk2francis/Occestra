import type { CSSProperties } from "react";
import { ButtonLink } from "@/components/ui/button";
import { GuillocheRosette } from "@/components/ui/guilloche";
import { Walkthrough } from "./walkthrough";

export function Hero() {
  return (
    <section data-audit-clip className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-24">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="vignette-warm absolute inset-0"
          style={{ "--vig-size": "58% 72%", "--vig-pos": "62% 16%" } as CSSProperties}
        />
        <GuillocheRosette
          size={720}
          crop={{ x: 0, y: 0.36, w: 0.62, h: 0.64 }}
          className="guilloche-ambient absolute -top-12 right-0 hidden md:block"
        />
      </div>

      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="max-w-4xl">
          <p className="hero-flow hero-flow-0 text-kicker flex items-center gap-3 text-amethyst">
            <span aria-hidden className="hero-rule h-px bg-amethyst/50" />
            The Occasion Studio · Agent #5213 on X Layer
          </p>
          <h1 className="hero-flow hero-flow-1 text-display mt-6 max-w-[13ch] text-balance">
            Every moment, made&nbsp;monumental.
          </h1>
          <p className="hero-flow hero-flow-2 prose-measure mt-6 text-[1.08rem] leading-relaxed text-ink/65">
            Give it a birthday next Saturday, a product launching Friday, a trip just taken. A
            syndicate of studio roles plans it, designs it, writes it — then grades every artifact
            against a published standard, repairs what fails, and seals the finished pack on
            X&nbsp;Layer.
          </p>
          <div className="hero-flow hero-flow-3 mt-9 flex flex-wrap items-center gap-4">
            <ButtonLink href="/studio" size="lg">Open the Studio</ButtonLink>
            <a
              href="#tribunal"
              className="text-[0.92rem] font-medium text-ink/60 underline decoration-ink/25 underline-offset-4 transition-colors hover:text-ink"
            >
              See how work gets graded
            </a>
          </div>
        </div>

        <div className="hero-flow hero-flow-stage mt-16 sm:mt-20 md:ml-[8%] lg:ml-[14%]">
          <Walkthrough />
        </div>
      </div>
    </section>
  );
}
