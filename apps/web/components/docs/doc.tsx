import Link from "next/link";
import type { ReactNode } from "react";
import { DOCS_NAV, docHref, neighbors } from "@/lib/docs-nav";

/** The shared vocabulary of every docs page — one voice, one rhythm. */

export function DocTitle({ kicker, children, lede }: { kicker: string; children: ReactNode; lede: ReactNode }) {
  return (
    <header className="mb-10">
      <p className="text-kicker text-amethyst">{kicker}</p>
      <h1 className="text-headline mt-3 text-balance">{children}</h1>
      <p className="mt-4 max-w-2xl text-[1.02rem] leading-relaxed text-ink/65">{lede}</p>
    </header>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-24 first:mt-0">
      <h2 className="group flex items-baseline gap-2">
        <a href={`#${id}`} className="text-subhead hover:underline hover:decoration-ink/20 hover:underline-offset-4">
          {title}
        </a>
      </h2>
      <div className="mt-4 space-y-4 text-[0.95rem] leading-relaxed text-ink/70 [&_strong]:font-semibold [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}

export function InlineCode({ children }: { children: ReactNode }) {
  return <code className="rounded bg-panel px-1.5 py-0.5 font-mono text-[0.82em] break-all text-ink">{children}</code>;
}

export function ParamTable({
  rows,
}: {
  rows: Array<{ name: string; type: string; required?: boolean; desc: string }>;
}) {
  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-ink/10">
      <table className="w-full text-left text-[0.85rem]">
        <thead>
          <tr className="border-b border-ink/10 bg-panel/60">
            <th className="text-kicker px-4 py-2.5 text-[0.6rem] text-ink/60">field</th>
            <th className="text-kicker px-4 py-2.5 text-[0.6rem] text-ink/60">type</th>
            <th className="text-kicker px-4 py-2.5 text-[0.6rem] text-ink/60">notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-ink/6 last:border-0">
              <td className="px-4 py-2.5 align-top font-mono text-[0.78rem] whitespace-nowrap text-ink">
                {row.name}
                {row.required && <span className="text-amethyst"> *</span>}
              </td>
              <td className="px-4 py-2.5 align-top font-mono text-[0.75rem] whitespace-nowrap text-ink/55">{row.type}</td>
              <td className="px-4 py-2.5 align-top text-ink/70">{row.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Callout({ tone = "info", children }: { tone?: "info" | "warn" | "good"; children: ReactNode }) {
  const border = tone === "warn" ? "border-repair/40" : tone === "good" ? "border-pass/40" : "border-info/40";
  return (
    <div className={`my-4 rounded-xl border ${border} bg-panel/50 px-4 py-3 text-[0.88rem] leading-relaxed text-ink/75`}>
      {children}
    </div>
  );
}

export function PrevNext({ slug }: { slug: string }) {
  const { prev, next } = neighbors(slug);
  return (
    <nav className="mt-16 flex justify-between gap-4 border-t border-ink/8 pt-6">
      {prev ? (
        <Link href={docHref(prev.slug)} className="group max-w-[45%]">
          <p className="text-data text-ink/45">← previous</p>
          <p className="mt-0.5 text-[0.9rem] font-medium text-ink/75 group-hover:text-ink">{prev.title}</p>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={docHref(next.slug)} className="group max-w-[45%] text-right">
          <p className="text-data text-ink/45">next →</p>
          <p className="mt-0.5 text-[0.9rem] font-medium text-ink/75 group-hover:text-ink">{next.title}</p>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export { DOCS_NAV, docHref };
