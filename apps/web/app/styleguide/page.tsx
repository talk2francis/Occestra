import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AxisChip, GradeChip } from "@/components/ui/grade-chip";
import { SealMark } from "@/components/ui/seal-mark";
import { SectionHeading } from "@/components/ui/section-heading";
import { SourceChip } from "@/components/ui/source-chip";

export const metadata: Metadata = {
  title: "Styleguide",
  robots: { index: false },
};

const TOKENS = [
  ["ground", "#FAF7F2"],
  ["panel", "#F1ECE4"],
  ["ink", "#17141A"],
  ["plum", "#2D1B4E"],
  ["amethyst", "#6B3FA0"],
  ["lilac", "#C8B4FF"],
  ["silver", "#8E8A94"],
  ["pass", "#2FA96B"],
  ["repair", "#D9822B"],
  ["fail", "#C24141"],
  ["info", "#5BA8FF"],
] as const;

export default function Styleguide() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 space-y-16">
      <SectionHeading
        kicker="Amethyst Daylight"
        lede="The working set: tokens, type, and every primitive the product pages compose from. Internal page — not linked, not indexed."
      >
        Design system
      </SectionHeading>

      <section className="space-y-4">
        <h3 className="text-kicker text-ink/50">Tokens</h3>
        <div className="flex flex-wrap gap-3">
          {TOKENS.map(([name, hex]) => (
            <div key={name} className="flex items-center gap-2 rounded-full border border-ink/10 bg-panel/60 py-1 pr-3 pl-1">
              <span className="size-6 rounded-full border border-ink/10" style={{ background: hex }} />
              <span className="text-data text-ink/70">
                {name} {hex}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-kicker text-ink/50">Type scale</h3>
        <p className="text-display">Every moment, made monumental.</p>
        <p className="text-headline">The syndicate at work</p>
        <p className="text-subhead">A failed artifact visibly returns, and comes back repaired.</p>
        <p className="prose-measure text-ink/70">
          Body — Instrument Sans. Grounded facts always carry a source and a retrieval
          timestamp; a booking is never claimed as confirmed unless it actually is.
        </p>
        <p className="text-data text-ink/60">data — 0xa8894cd2233bf3b5f7c2f5b6acddfa62 · 2026-07-12 20:51 UTC</p>
      </section>

      <section className="space-y-4">
        <h3 className="text-kicker text-ink/50">Buttons</h3>
        <div className="flex flex-wrap items-center gap-4">
          <Button size="lg">Open the Studio</Button>
          <Button variant="outline">Read the standard</Button>
          <Button variant="ghost" size="sm">
            Verify on X Layer
          </Button>
          <ButtonLink href="/" variant="outline" size="sm">
            Link button
          </ButtonLink>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-kicker text-ink/50">Chips &amp; badges</h3>
        <div className="flex flex-wrap items-center gap-3">
          <GradeChip verdict="pass">pass</GradeChip>
          <GradeChip verdict="repair">repaired ×2</GradeChip>
          <GradeChip verdict="fail">fail</GradeChip>
          <GradeChip verdict="info">coverage gap</GradeChip>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AxisChip axis="composition" score={85} />
          <AxisChip axis="legibility" score={90} />
          <AxisChip axis="style_fidelity" score={68} />
          <AxisChip axis="grounding" score={42} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>OQS v1.0.0</Badge>
          <Badge tone="amethyst">Agent #5213</Badge>
          <Badge tone="active">generating</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-6">
          <SourceChip source="openstreetmap" retrievedAt="2026-07-12T19:12:45.096Z" url="https://www.openstreetmap.org/node/489793044" />
          <SourceChip source="open-meteo" retrievedAt="2026-07-12T19:12:45.642Z" />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-kicker text-ink/50">Seal &amp; card</h3>
        <div className="flex flex-wrap items-start gap-8">
          <SealMark />
          <Card className="max-w-sm p-6">
            <p className="text-subhead">A quiet paper panel.</p>
            <p className="mt-2 text-sm leading-relaxed text-ink/60">
              Hairline border, warm tone, no uniform drop shadow. Never rendered as a grid
              of identical siblings.
            </p>
          </Card>
        </div>
      </section>
    </main>
  );
}
