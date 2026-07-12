import Image from "next/image";
import { Reveal } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { GradeChip } from "@/components/ui/grade-chip";
import { SectionHeading } from "@/components/ui/section-heading";
import { SourceChip } from "@/components/ui/source-chip";
import { CELEBRATE } from "@/lib/real";

/**
 * Three studios, three different editorial compositions — deliberately not a
 * grid of identical cards. Every image is real, graded output from the store.
 */
export function Studios() {
  return (
    <section id="studios" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            kicker="Three studios"
            lede="Deliberately only three. One for what's coming, one for what happened, one for what you're shipping."
          >
            One brief in. A finished pack out.
          </SectionHeading>
        </Reveal>

        {/* CELEBRATE — image left, grounded facts right */}
        <Reveal className="mt-16 grid items-center gap-8 lg:mt-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
          <figure className="relative mx-auto w-full max-w-sm">
            <Image
              src="/artifacts/guest-guide.webp"
              alt="Real guest guide from the sealed farewell-dinner pack: schedule, weather, and honest booking notes for an evening in Lisbon"
              width={900}
              height={1200}
              sizes="(min-width: 1024px) 24rem, 90vw"
              className="deckle w-full shadow-keepsake"
            />
            <figcaption className="text-data mt-3 text-center text-ink/40">
              real artifact · guest_guide from sealed pack {CELEBRATE.id.slice(0, 12)}… · graded pass
            </figcaption>
          </figure>
          <div>
            <Badge tone="amethyst">Celebrate</Badge>
            <h3 className="text-headline mt-4">For the moment that&apos;s coming.</h3>
            <p className="prose-measure mt-4 leading-relaxed text-ink/65">
              A plan built on real venues and a real forecast — never a guess dressed up as a
              booking. Schedule, budget, contingency branches, an invitation suite, a shareable
              guest guide, a toast. Every live fact carries its source and the moment it was
              retrieved.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <SourceChip
                source={CELEBRATE.venueSource.source}
                retrievedAt={CELEBRATE.venueSource.retrievedAt}
              />
              <SourceChip
                source={CELEBRATE.forecastSource.source}
                retrievedAt={CELEBRATE.forecastSource.retrievedAt}
              />
            </div>
            <p className="text-data mt-4 max-w-md text-ink/45">“{CELEBRATE.uncertainty}”</p>
          </div>
        </Reveal>

        {/* REMEMBER — text left, art right, privacy strip beneath */}
        <Reveal className="mt-20 grid items-center gap-8 lg:mt-28 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          <div className="order-2 lg:order-1">
            <Badge tone="amethyst">Remember</Badge>
            <h3 className="text-headline mt-4">For the moment that already happened.</h3>
            <p className="prose-measure mt-4 leading-relaxed text-ink/65">
              Photos, notes, a voice memo — turned into keepsake art in a curated style and an
              editorial story page that strictly separates what your photographs establish from
              what is written as prose. It counts the people in your pictures; it never names
              them, never guesses ages or relationships.
            </p>
            <ul className="mt-5 space-y-1.5 text-[0.9rem] text-ink/60">
              <li>· Uploads private by default, EXIF and GPS stripped on arrival</li>
              <li>· “Delete my project” deletes the photographs too — verified live</li>
              <li>· Nothing personal touches the chain. Only a hash of the manifest.</li>
            </ul>
          </div>
          <figure className="relative order-1 mx-auto w-full max-w-sm lg:order-2">
            <Image
              src="/artifacts/keepsake-art.webp"
              alt="Real keepsake artwork in the Sunprint house style: a cyanotype of pressed leaves, an envelope, a key and an open hand"
              width={900}
              height={900}
              sizes="(min-width: 1024px) 24rem, 90vw"
              className="w-full rotate-1 rounded-sm border-8 border-ground shadow-keepsake"
            />
            <figcaption className="text-data mt-3 text-center text-ink/40">
              real artifact · sunprint style · repaired ×1, then pass
            </figcaption>
          </figure>
        </Reveal>

        {/* LAUNCH — full-bleed-ish hero image with overlay caption */}
        <Reveal className="mt-20 lg:mt-28">
          <div className="grid items-end gap-8 lg:grid-cols-[1fr_0.9fr] lg:gap-14">
            <figure className="relative">
              <Image
                src="/artifacts/launch-hero.webp"
                alt="Real launch-kit hero visual: an editorial paper collage of a film camera with a deep amethyst sun"
                width={1400}
                height={933}
                sizes="(min-width: 1024px) 38rem, 92vw"
                className="deckle w-full shadow-keepsake"
              />
              <figcaption className="text-data mt-3 text-ink/40">
                real artifact · og_image · palette drift 10.8 from house style — pass
              </figcaption>
            </figure>
            <div>
              <Badge tone="amethyst">Launch</Badge>
              <h3 className="text-headline mt-4">For the thing you&apos;re shipping.</h3>
              <p className="prose-measure mt-4 leading-relaxed text-ink/65">
                It reads your actual site through a headless browser — the colours a browser
                rendered, not a guess — extracts an honest brand genome, and produces a hero
                visual, announcement cards, a launch thread, a demo beat sheet and OG images.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <GradeChip verdict="pass">brand_kit · pass</GradeChip>
                <GradeChip verdict="pass">og_image · pass</GradeChip>
                <GradeChip verdict="repair">launch_thread · repaired ×2</GradeChip>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
