import Link from "next/link";
import { AGENT_ID, API_BASE, EXPLORER_REGISTRY, OQS_VERSION, REGISTRY } from "@/lib/real";

export function Footer() {
  return (
    <footer className="border-t border-ink/8 bg-panel/60">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-10">
          <div className="max-w-xs">
            <p className="font-serif text-2xl font-medium tracking-tight" style={{ fontVariationSettings: "'opsz' 40" }}>
              Occestra
            </p>
            <p className="mt-3 text-[0.9rem] leading-relaxed text-ink/65">
              The Occasion Studio. Every moment, made monumental — and every artifact graded,
              repaired, and sealed with provenance you can check yourself.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-14 gap-y-2 text-[0.88rem] sm:grid-cols-3">
            <div className="space-y-2">
              <p className="text-kicker mb-3 text-ink/60">Product</p>
              <a href="#studios" className="block text-ink/60 hover:text-ink">Studios</a>
              <a href="#pricing" className="block text-ink/60 hover:text-ink">Pricing</a>
              <Link href="/studio" className="block text-ink/60 hover:text-ink">Open the Studio</Link>
            </div>
            <div className="space-y-2">
              <p className="text-kicker mb-3 text-ink/60">Trust</p>
              <a href={`${API_BASE}/standard`} className="block text-ink/60 hover:text-ink">
                Quality standard (OQS v{OQS_VERSION})
              </a>
              <a href="#tribunal" className="block text-ink/60 hover:text-ink">The Tribunal</a>
              <a href={EXPLORER_REGISTRY} target="_blank" rel="noopener noreferrer" className="block text-ink/60 hover:text-ink">
                KeepsakeRegistry ↗
              </a>
            </div>
            <div className="space-y-2">
              <p className="text-kicker mb-3 text-ink/60">Agents</p>
              <a href="#agents" className="block text-ink/60 hover:text-ink">Endpoint &amp; tools</a>
              <a href={`${API_BASE}/.well-known/occestra.json`} className="block text-ink/60 hover:text-ink">
                Manifest
              </a>
              <a
                href="https://web3.okx.com/onchainos"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-ink/60 hover:text-ink"
              >
                OKX.AI Agent #{AGENT_ID} ↗
              </a>
            </div>
          </nav>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-ink/8 pt-6">
          <p className="text-data text-ink/60">
            © 2026 Occestra · X Layer mainnet · {REGISTRY.slice(0, 10)}…{REGISTRY.slice(-4)}
          </p>
          <p className="text-data max-w-md text-ink/60">
            Everything shown on this page is real, graded output. No fabricated volume, no fake
            reviews — coverage gaps are recorded, not hidden.
          </p>
        </div>
      </div>
    </footer>
  );
}
