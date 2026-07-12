import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/section-heading";
import { API_BASE, TOOLS } from "@/lib/real";

export const metadata: Metadata = {
  title: "The Studio",
  description: "The Occestra studio workspace — watch the syndicate assemble your occasion pack.",
};

/**
 * Honest placeholder until Phase 11 ships the full workspace: the tools are
 * live and callable today; the in-browser composer arrives next.
 */
export default function StudioPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-24">
      <Link href="/" className="text-[0.85rem] text-ink/60 transition-colors hover:text-ink">
        ← Occestra
      </Link>
      <div className="mt-8">
        <Badge tone="active">the workspace is being fitted</Badge>
      </div>
      <SectionHeading
        kicker="The Studio"
        className="mt-6"
        lede={
          <>
            The in-browser workspace — brief composer, the syndicate working live, the Tribunal
            grading in front of you — opens here within days. The studio itself is already open
            for business: every tool below is live on X&nbsp;Layer right now, callable by any
            agent with a wallet.
          </>
        }
      >
        The room is real. We&apos;re still hanging the lights.
      </SectionHeading>

      <ul className="mt-10 divide-y divide-ink/8 border-y border-ink/10">
        {TOOLS.map((tool) => (
          <li key={tool.name} className="flex items-baseline justify-between gap-6 py-3">
            <span className="text-data text-[0.8rem] text-ink/85">{tool.name}</span>
            <span className="text-data text-ink/65">
              {tool.price === 0 ? "free" : `${tool.price.toFixed(2)} USDT`}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-[0.9rem] leading-relaxed text-ink/65">
        Endpoint: <span className="text-data">{API_BASE}/mcp</span> · manifest at{" "}
        <a href={`${API_BASE}/.well-known/occestra.json`} className="text-amethyst underline decoration-amethyst/30 underline-offset-4">
          .well-known/occestra.json
        </a>
      </p>
    </main>
  );
}
