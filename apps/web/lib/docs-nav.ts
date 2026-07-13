export interface DocEntry {
  slug: string;
  title: string;
  blurb: string;
}

export const DOCS_NAV: DocEntry[] = [
  { slug: "", title: "Overview", blurb: "What Occestra is, and why the receipts matter" },
  { slug: "quickstart", title: "Quickstart", blurb: "Call all 8 tools, copy-paste, exact response shapes" },
  { slug: "payments", title: "Payments (x402)", blurb: "The challenge, the signature, the settlement — as implemented" },
  { slug: "standard", title: "The Quality Standard", blurb: "The OQS rubric, verbatim from the grading engine" },
  { slug: "provenance", title: "Provenance", blurb: "Hashing, the leaf, EIP-712 — verify a real seal yourself" },
  { slug: "studios", title: "Studios reference", blurb: "Inputs, outputs, artifact kinds, gaps, privacy" },
  { slug: "a2a", title: "A2A packages", blurb: "Negotiated end-to-end occasions: scopes, pricing, revisions" },
  { slug: "architecture", title: "Architecture", blurb: "The monorepo, the pipeline, and where trust comes from" },
] as const;

export function docHref(slug: string): string {
  return slug ? `/docs/${slug}` : "/docs";
}

export function neighbors(slug: string): { prev?: DocEntry; next?: DocEntry } {
  const index = DOCS_NAV.findIndex((entry) => entry.slug === slug);
  return {
    ...(index > 0 ? { prev: DOCS_NAV[index - 1] } : {}),
    ...(index >= 0 && index < DOCS_NAV.length - 1 ? { next: DOCS_NAV[index + 1] } : {}),
  };
}
