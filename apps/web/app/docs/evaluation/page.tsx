import type { Metadata } from "next";
import Link from "next/link";
import slo from "@/lib/slo.json";
import { Callout, DocTitle, PrevNext, Section } from "@/components/docs/doc";

export const metadata: Metadata = { title: "Benchmarks & SLOs" };

export default function EvaluationDocs() {
  return <>
    <DocTitle kicker="Benchmarks & SLOs" lede="Deterministic guarantees and provider-dependent measurements are published separately. Combining them would overstate what the data can prove.">Exact where code is exact. A range where the world varies.</DocTitle>
    <Section id="exact" title="Reproducible-exact"><ul><li>Every delivered artifact carries its Tribunal report: <strong>{String(slo.reproducibleExact.everyArtifactCarriesItsReport)}</strong>.</li><li>No hard check can fail inside a passing pack: <strong>{String(slo.reproducibleExact.noHardCheckFailsInsideAPassingPack)}</strong>.</li><li>Undelivered work is declared, never silently dropped: <strong>{String(slo.reproducibleExact.undeliveredDeclaredNeverDropped)}</strong>.</li></ul></Section>
    <Section id="measured" title={`Measured-with-variance · ${slo.totalRuns} real runs`}><div className="overflow-x-auto"><table className="w-full text-left text-[0.82rem]"><thead><tr className="border-b border-ink/15"><th className="py-2">tool</th><th>n</th><th>median</th><th>range</th><th>pass median</th></tr></thead><tbody>{slo.measuredWithVariance.map(row => <tr key={row.tool} className="border-b border-ink/8"><td className="py-2 font-mono">{row.tool}</td><td>{row.n}</td><td>{row.latencySeconds.median}s</td><td>{row.latencySeconds.min}–{row.latencySeconds.max}s</td><td>{Math.round(row.passRate.median*100)}%</td></tr>)}</tbody></table></div><p>Measured {new Date(slo.measuredAt).toISOString().slice(0,10)} with ${slo.totalSpentUsd.toFixed(2)} in real provider spend. Reproduce with <code>node scripts/slo.mjs</code>.</p><Callout tone="info">Small samples remain labelled small. The fuller explanation, including critic variance, is on the public <Link href="/evaluation" className="underline">evaluation page</Link>.</Callout></Section>
    <PrevNext slug="evaluation" />
  </>;
}
