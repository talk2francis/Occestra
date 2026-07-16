import type { Metadata } from "next";
import { Callout, DocTitle, PrevNext, Section } from "@/components/docs/doc";

export const metadata: Metadata = { title: "House Styles" };
const styles = [
  ["amethyst_editorial", "Amethyst Editorial", "warm editorial, broad default", "#6B3FA0"],
  ["gilded_noir", "Gilded Noir", "formal black-tie occasions", "#C9A44E"],
  ["sunprint", "Sunprint", "nostalgic memories", "#1E5F8C"],
  ["atlas_ink", "Atlas Ink", "travel and itinerary work", "#805B3B"],
  ["solstice_bloom", "Solstice Bloom", "warm celebrations", "#E06D4F"],
  ["jazz_age", "Jazz Age", "art-deco formality", "#0B5D4B"],
  ["paper_lantern", "Paper Lantern", "communal festivals", "#C4322B"],
  ["porcelain_garden", "Porcelain Garden", "delicate keepsakes", "#315E9A"],
  ["neon_reverie", "Neon Reverie", "luminous launches", "#D24BCE"],
  ["terra_fresco", "Terra Fresco", "earthy travel and rustic work", "#B96845"],
] as const;

export default function StylesDocs() {
  return <>
    <DocTitle kicker="Ten House Styles" lede="A House Style is a versioned production system: palette, material, light, composition, typography, negatives, seed strategy, and where it may be used.">Style is treatment. The brief remains the subject.</DocTitle>
    <Section id="catalog" title="The catalog">
      <div className="grid gap-3 sm:grid-cols-2">{styles.map(([id,name,use,hex]) => <div key={id} className="rounded-xl border border-ink/10 bg-panel/45 p-4"><span className="block h-1.5 w-12 rounded-full" style={{background:hex}} /><p className="mt-3 font-medium text-ink">{name}</p><p className="text-data text-[0.7rem] text-ink/45">{id}</p><p className="mt-2 text-[0.82rem] text-ink/65">{use}</p></div>)}</div>
      <Callout tone="info"><strong>Call <code>oce_style_catalog</code> first.</strong> It is free and returns the live definitions plus real passing examples. A style without passing work is never illustrated with a failed artifact.</Callout>
    </Section>
    <Section id="gates" title="Subject fidelity and studio gates"><p>Image prompts lead with the commissioned subject and apply style second. Studio gates prevent Atlas Ink, for example, from turning a software mark into a map. The Tribunal independently scores subject fidelity, so generation prevention and evaluation are separate safeguards.</p></Section>
    <PrevNext slug="styles" />
  </>;
}
