import type { Metadata } from "next";
import Link from "next/link";
import { marked } from "marked";
import { OQS_VERSION, rubricAsMarkdown } from "@occestra/tribunal";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: `The Occestra Quality Standard (OQS v${OQS_VERSION})`,
  description:
    "The published, versioned rubric every Occestra artifact is graded against — generated at build time from the same constants the grading engine runs.",
};

/**
 * Rendered AT BUILD TIME from @occestra/tribunal's own rubricAsMarkdown(), so
 * the published standard can never drift from the shipped code: if the rubric
 * changes, this page changes in the same commit.
 */
export default function StandardPage() {
  const html = marked.parse(rubricAsMarkdown(), { async: false });

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <Link href="/" className="text-[0.85rem] text-ink/60 transition-colors hover:text-ink">
        ← Occestra
      </Link>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <Badge tone="amethyst">published standard</Badge>
        <Badge>generated from the grading engine at build time</Badge>
      </div>

      <article
        className="rubric-prose mt-6"
        // Our own build-time markdown from the tribunal package — not user input.
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <footer className="mt-12 border-t border-ink/8 pt-6">
        <p className="text-[0.88rem] leading-relaxed text-ink/65">
          This page is generated from <span className="text-data">rubricAsMarkdown()</span> in{" "}
          <span className="text-data">@occestra/tribunal</span> when the site is built — published
          equals shipped, by construction. The machine-readable version lives at{" "}
          <a
            href="https://api.occestra.xyz/standard"
            className="text-amethyst underline decoration-amethyst/30 underline-offset-2"
          >
            api.occestra.xyz/standard
          </a>
          . Run your own artifact against it with <span className="text-data">oce_critique</span>{" "}
          for 0.01 USDT — see{" "}
          <Link href="/for-agents" className="text-amethyst underline decoration-amethyst/30 underline-offset-2">
            for agents
          </Link>
          .
        </p>
      </footer>
    </main>
  );
}
