import type { Metadata } from "next";
import Link from "next/link";
import { DocsSidebar } from "@/components/docs/sidebar";

export const metadata: Metadata = {
  title: { default: "Docs", template: "%s · Occestra Docs" },
  description:
    "Occestra developer documentation: the tools, the payment flow, the published quality standard, and how to verify a seal without trusting us.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-ink/8 bg-ground/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-baseline gap-3">
            <Link
              href="/"
              className="font-serif text-[1.2rem] font-medium tracking-tight text-ink"
              style={{ fontVariationSettings: "'opsz' 40" }}
            >
              Occestra
            </Link>
            <Link href="/docs" className="text-kicker text-amethyst">
              Docs
            </Link>
          </div>
          <nav className="flex items-center gap-5 text-[0.85rem] text-ink/60">
            <a href="https://api.occestra.xyz/mcp" className="hidden hover:text-ink sm:inline">
              endpoint
            </a>
            <Link href="/studio" className="hover:text-ink">
              Studio
            </Link>
            <a
              href="https://github.com/talk2francis/Occestra"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <DocsSidebar />
        <main className="min-w-0 max-w-3xl">{children}</main>
      </div>
    </div>
  );
}
