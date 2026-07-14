/**
 * Reading the brand kit's markdown, so the page can render it as design rather than text.
 *
 * The bug this fixes is small and very visible: the generic renderer printed markdown
 * emphasis verbatim, so the buyer read `_Not adopted, and why:_` — underscores and all —
 * and `**The product's own colours:**` with the asterisks still attached. Six real hex
 * colours arrived as six pieces of grey punctuation.
 */

/** A 3- or 6-digit hex colour. Global: a palette line carries several. */
export const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;

export interface GenomeSection {
  title: string;
  /** The section's raw body, for colour extraction. */
  body: string;
  /** The body split into renderable lines, with list bullets normalised. */
  lines: string[];
  /**
   * A fenced code block inside the section, lifted OUT of the prose.
   *
   * The kit ends with the whole machine-readable genome in a ```json fence. Rendered as
   * prose it became a 900-line wall of JSON in the middle of the buyer's brand kit —
   * every key on its own grey line. It belongs behind a disclosure, not in the flow.
   */
  code?: string;
}

/** Strip markdown emphasis so it reads as emphasis, not as punctuation. */
export function inline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold**
    .replace(/(?<![\w`])_([^_\n]+)_(?![\w`])/g, "$1") // _italic_, but not snake_case
    .replace(/`([^`]+)`/g, "$1") // `code`
    .replace(/^[-*]\s+/, "· ") // list bullets
    .trim();
}

/** Split a brand kit into its `## Heading` sections, lifting fenced code out of the prose. */
export function sectionsOf(markdown: string): GenomeSection[] {
  const sections: GenomeSection[] = [];
  let current: GenomeSection | undefined;
  let fenced: string[] | undefined;

  for (const raw of markdown.split("\n")) {
    // A ``` fence toggles code mode. Inside it, nothing is prose — not the headings, not
    // the bullets, not the braces. Rendering the genome's own JSON as paragraphs is how a
    // brand kit turned into a wall of grey punctuation.
    if (/^\s*```/.test(raw)) {
      if (fenced) {
        if (current) current.code = fenced.join("\n").trim();
        fenced = undefined;
      } else {
        fenced = [];
      }
      continue;
    }

    if (fenced) {
      fenced.push(raw);
      continue;
    }

    const heading = /^##\s+(.*)$/.exec(raw);
    if (heading) {
      current = { title: heading[1]!.trim(), body: "", lines: [] };
      sections.push(current);
      continue;
    }

    // The `# Title` line and anything before the first `## Heading` is the preamble; the
    // page already shows the product name and the source chips, so it is not repeated.
    if (!current) continue;
    if (/^#\s/.test(raw)) continue;

    const line = raw.trim();
    if (!line) continue;

    current.body += `${raw}\n`;
    const rendered = inline(line);
    if (rendered) current.lines.push(rendered);
  }

  // An unterminated fence still belongs behind the disclosure, never in the prose.
  if (fenced && current) current.code = fenced.join("\n").trim();

  return sections;
}
