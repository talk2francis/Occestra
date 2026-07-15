/**
 * The brand genome, rendered as the designed thing it is.
 *
 * It used to be dumped through the generic markdown path, which knows about paragraphs
 * and headings and nothing else. So the buyer's most valuable artifact — the one they
 * paid for the site inspection to get — arrived as a wall of grey text with the raw
 * markdown still in it: `_Not adopted, and why:_` with the underscores showing, `**bold**`
 * with the asterisks showing, and six real hex colours rendered as six pieces of punctuation.
 *
 * Colours are shown as colours. The raw source is still one click away, because the
 * artifact we deliver and the artifact we display must be the same artifact.
 */
import { HEX, inline, sectionsOf } from "@/lib/genome";

function Chip({ hex }: { hex: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-ink/10 bg-ground px-2 py-1">
      <span
        className="h-4 w-4 shrink-0 rounded border border-ink/15"
        style={{ backgroundColor: hex }}
        aria-hidden="true"
      />
      <span className="text-data text-ink/70">{hex}</span>
    </span>
  );
}

/**
 * One line of the palette.
 *
 * A line is one of two things, and they must not be rendered the same way. Either it is a
 * ROW of colours behind a label ("House Style: #A #B #C") — or it is a single colour with
 * a REASON attached ("#F7F4F0 — already in the House Style"). Treating the second like the
 * first tears the colour away from the sentence explaining it, and the buyer reads an
 * orphaned bullet: "· — already effectively in the House Style palette".
 */
function PaletteLine({ line }: { line: string }) {
  const hexes = line.match(HEX) ?? [];

  if (hexes.length === 0) {
    return <p className="text-[0.88rem] leading-relaxed text-ink/70">{line}</p>;
  }

  const rest = inline(line.replace(HEX, "").replace(/^[·\s—-]+|[·\s]+$/g, "").trim());

  if (hexes.length === 1) {
    // Where the colour SITS in the line tells you what the words are. "Adopted into the
    // kit: #B0ADAB" is a label followed by its colour; "#F7F4F0 — already in the House
    // Style" is a colour followed by its reason. Rendering both the same way puts the
    // label after the swatch, and it reads backwards.
    const labelFirst = line.search(new RegExp(HEX.source)) > 0;

    return (
      <div className="flex flex-wrap items-center gap-2">
        {labelFirst && rest && (
          <span className="text-data text-ink/55">{rest.replace(/:$/, "")}</span>
        )}
        <Chip hex={hexes[0]!} />
        {!labelFirst && rest && (
          <span className="text-[0.85rem] leading-relaxed text-ink/65">{rest}</span>
        )}
      </div>
    );
  }

  return (
    <div>
      {rest && <p className="text-data text-ink/55">{rest.replace(/:$/, "")}</p>}
      <div className="mt-1.5 flex flex-wrap gap-2">
        {hexes.map((hex) => (
          <Chip key={hex} hex={hex} />
        ))}
      </div>
    </div>
  );
}

export function BrandGenome({ markdown }: { markdown: string }) {
  const sections = sectionsOf(markdown);

  return (
    <div className="mt-4 space-y-5">
      {sections.map((section) => {
        const hexes = section.body.match(HEX) ?? [];
        const isPalette = /palette|colour|color/i.test(section.title) && hexes.length > 0;

        return (
          <section key={section.title} className="rounded-xl border border-ink/10 bg-panel/40 p-4">
            <h4 className="text-kicker text-[0.6rem] text-amethyst">{section.title}</h4>

            {isPalette ? (
              <div className="mt-2 space-y-2.5">
                {section.lines.map((line, index) => (
                  <PaletteLine key={index} line={line} />
                ))}
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {section.lines.map((line, index) => (
                  <p key={index} className="text-[0.92rem] leading-relaxed text-ink/80">
                    {inline(line)}
                  </p>
                ))}
              </div>
            )}

            {/* The machine-readable genome — behind a disclosure, never in the prose. */}
            {section.code && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[0.8rem] font-medium text-ink/60 hover:text-ink">
                  The genome as JSON
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-night p-3 font-mono text-[0.7rem] leading-relaxed text-night-fg/85">
                  {section.code}
                </pre>
              </details>
            )}
          </section>
        );
      })}

      {/* The delivered artifact, verbatim. What we render and what we ship must agree. */}
      <details className="rounded-xl border border-ink/10 bg-ground">
        <summary className="cursor-pointer px-4 py-3 text-[0.85rem] font-medium text-ink/70 hover:text-ink">
          The brand kit, exactly as delivered
        </summary>
        <pre className="max-h-80 overflow-auto px-4 pb-4 font-mono text-[0.72rem] leading-relaxed text-ink/70">
          {markdown}
        </pre>
      </details>
    </div>
  );
}
