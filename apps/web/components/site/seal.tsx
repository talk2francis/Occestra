import { Reveal } from "@/components/motion";
import { GuillocheCorner, GuillocheRing } from "@/components/ui/guilloche";
import { SealMark } from "@/components/ui/seal-mark";
import { SectionHeading } from "@/components/ui/section-heading";
import { API_BASE, CELEBRATE, EXPLORER_REGISTRY, REGISTRY } from "@/lib/real";

/**
 * A real sealed pack, presented as the keepsake card it is: EIP-712 signed,
 * hash anchored on X Layer mainnet. Every hex string is the real one.
 */
export function Seal() {
  const { seal } = CELEBRATE;

  return (
    <section id="seal" className="relative scroll-mt-20 overflow-hidden py-20 sm:py-28">
      <div aria-hidden className="vignette-warm absolute inset-0" style={{ "--vig-size": "44% 55%", "--vig-pos": "50% 50%" } as React.CSSProperties} />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <Reveal>
          <SectionHeading
            kicker="The Seal"
            lede={
              <>
                Any finished pack can be sealed: a canonical hash of its manifest is anchored on
                X&nbsp;Layer via the KeepsakeRegistry contract, beside an EIP-712 provenance
                signature. Anyone can verify who made it, when, from what — without trusting our
                servers.
              </>
            }
          >
            Finished work, with provenance almost no AI output has.
          </SectionHeading>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href={EXPLORER_REGISTRY}
              target="_blank"
              rel="noopener noreferrer"
              className="glow-cta inline-flex h-11 items-center rounded-full bg-ink px-6 text-[0.93rem] font-medium text-ground shadow-lift transition-colors hover:bg-plum"
            >
              Verify on X Layer
            </a>
            <a
              href={`${API_BASE}/k/${CELEBRATE.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center rounded-full border border-ink/20 px-6 text-[0.93rem] font-medium text-ink transition-colors hover:border-ink/50 hover:bg-panel"
            >
              Read the raw manifest
            </a>
          </div>
          <p className="text-data mt-6 text-ink/60">
            KeepsakeRegistry · {REGISTRY} · X Layer mainnet (196)
          </p>
        </Reveal>

        {/* the keepsake certificate card */}
        <Reveal delay={0.12}>
          <div className="relative mx-auto max-w-md">
            <div className="relative overflow-hidden rotate-[0.6deg] rounded-2xl border border-ink/12 bg-ground p-7 shadow-keepsake sm:p-9">
              {/* certificate engraving in the corners of the keepsake card */}
              <GuillocheCorner size={104} corner="tl" className="absolute -top-1 -left-1" />
              <GuillocheCorner size={104} corner="br" className="absolute -right-1 -bottom-1" />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-kicker text-amethyst">Occasion Pack · Celebrate</p>
                  <p className="text-subhead mt-3">A farewell dinner for a friend moving abroad</p>
                  <p className="mt-2 text-[0.85rem] text-ink/65">Lisbon · sealed {seal.createdAt.slice(0, 10)}</p>
                </div>
                <span className="relative shrink-0">
                  <GuillocheRing size={104} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  <SealMark size={72} className="relative text-amethyst/90" />
                </span>
              </div>

              <dl className="text-data mt-8 space-y-3 border-t border-ink/10 pt-6 text-ink/60">
                <div>
                  <dt className="text-ink/60">keepsake id</dt>
                  <dd className="mt-0.5 break-all">{CELEBRATE.id}</dd>
                </div>
                <div>
                  <dt className="text-ink/60">manifest hash · keccak256</dt>
                  <dd className="mt-0.5 break-all">{seal.manifestHash}</dd>
                </div>
                <div>
                  <dt className="text-ink/60">signed by · EIP-712</dt>
                  <dd className="mt-0.5 break-all">{seal.signer}</dd>
                </div>
                <div>
                  <dt className="text-ink/60">anchored</dt>
                  <dd className="mt-0.5">
                    <a
                      href={`https://www.oklink.com/x-layer/tx/${seal.anchorTx}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all underline decoration-ink/20 underline-offset-2 hover:text-ink"
                    >
                      {seal.anchorTx.slice(0, 34)}…
                    </a>{" "}
                    · {seal.anchoredAt}
                  </dd>
                </div>
              </dl>
            </div>
            <p className="text-data mt-4 text-center text-ink/60">
              a real seal — follow the transaction; the chain agrees
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
