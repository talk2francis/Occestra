import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { GradeChip, type Verdict } from "@/components/ui/grade-chip";

/**
 * The consensus panel on a public pack or artifact page.
 *
 * Restrained on purpose. Occestra is an occasion studio, not a block explorer, and a panel
 * that shouts about chains would make the quality claim feel like a crypto feature rather than
 * what it is — somebody independent checking our homework. So this sits in the same paper as
 * the Tribunal report, in the same type, with the chain metadata present but quiet.
 *
 * The hardest state to get right is FAILED. It must not read as a verdict. A review that could
 * not complete tells you nothing about the artifact, and a panel that implies otherwise would
 * be claiming verification we do not have.
 */

export type ConsensusStatus =
  | "NOT_REQUESTED"
  | "QUEUED"
  | "SUBMITTED"
  | "ACCEPTED"
  | "FINALIZED"
  | "FAILED";

export type ConsensusDecision = "UPHELD" | "OVERTURNED" | "UNDETERMINED";

export interface ConsensusReviewView {
  reviewId: string;
  status: ConsensusStatus;
  decision?: ConsensusDecision;
  scoreBand?: string;
  criticalFailure?: string;
  failureCodes?: string[];
  localVerdict: "PASS" | "FAIL";
  oqsVersion: string;
  network: string;
  intelligentContractAddress?: string;
  transactionHash?: string;
  artifactVersion?: number;
  repairedFrom?: string;
  createdAt?: string;
  finalizedAt?: string;
  explorerUrl?: string;
}

/** Headline and supporting line for each state. Plain language, no hedging in either direction. */
function headline(review: ConsensusReviewView): { title: string; note: string; verdict: Verdict } {
  if (review.status === "FAILED") {
    return {
      title: "Consensus review unavailable",
      // Deliberately says nothing about the artifact. It was not reviewed.
      note: "The review could not complete, so it makes no claim about this work either way.",
      verdict: "info",
    };
  }
  if (review.status === "NOT_REQUESTED") {
    return {
      title: "Independent review not requested",
      note: "This artifact has been graded by our own Tribunal only.",
      verdict: "info",
    };
  }
  if (review.status === "QUEUED") {
    return { title: "Waiting to submit", note: "Preparing the frozen evidence snapshot.", verdict: "info" };
  }
  if (review.status === "SUBMITTED") {
    return {
      title: "Submitted to GenLayer",
      note: "Independent validators are reading the evidence.",
      verdict: "info",
    };
  }
  // ACCEPTED with a decision is a real ruling — validators agreed and the contract state is
  // written. Finality is the stronger guarantee that follows, and on Bradbury it trails by a
  // long way, so hiding a decided review behind it would show pending for hours. The verdict
  // is shown, and the weaker guarantee is stated rather than glossed.
  if (review.status === "ACCEPTED" && !review.decision) {
    return {
      title: "Consensus accepted · awaiting finality",
      note: "Validators have agreed. Reading back the ruling.",
      verdict: "info",
    };
  }
  switch (review.decision) {
    case "UPHELD":
      return {
        title: "Independent review upheld the Tribunal",
        note: `Validators agreed our ${review.localVerdict} was supported by the evidence.`,
        verdict: "pass",
      };
    case "OVERTURNED":
      return {
        title: "Independent review disagreed with the Tribunal",
        note: `Validators found our ${review.localVerdict} unsupported under OQS v${review.oqsVersion}.`,
        verdict: "repair",
      };
    default:
      return {
        title: "Validators could not reach a reliable determination",
        note: "The evidence did not support a confident ruling either way.",
        verdict: "info",
      };
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // Stacked on narrow screens, aligned columns from sm. Mixing the two — which is what
    // wrapping gives you by default — makes a long review id look like a rendering bug next
    // to the short rows that stay inline.
    <div className="flex flex-col gap-x-3 gap-y-0.5 py-1.5 sm:flex-row sm:items-baseline">
      <dt className="text-[0.7rem] tracking-[0.1em] text-ink/45 uppercase sm:min-w-[8.5rem] sm:shrink-0">
        {label}
      </dt>
      <dd className="min-w-0 font-mono text-[0.8rem] break-all text-ink/75">{children}</dd>
    </div>
  );
}

export function ConsensusPanel({
  review,
  canRequest = false,
  requestHref,
}: {
  review: ConsensusReviewView;
  /** Absent by default. A private artifact never shows an invitation to publish it. */
  canRequest?: boolean;
  requestHref?: string;
}) {
  const { title, note, verdict } = headline(review);
  const decided = Boolean(review.decision) && (review.status === "FINALIZED" || review.status === "ACCEPTED");
  const pending =
    review.status === "QUEUED" || review.status === "SUBMITTED" || (review.status === "ACCEPTED" && !decided);
  const finalized = decided;

  return (
    <section
      aria-labelledby="consensus-heading"
      className="rounded-2xl border border-ink/10 bg-panel/70 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="amethyst">independent review</Badge>
        <Badge>GenLayer</Badge>
      </div>

      <h3 id="consensus-heading" className="mt-4 font-serif text-[1.15rem] leading-snug text-balance">
        {title}
      </h3>
      <p className="mt-2 max-w-[46ch] text-[0.9rem] leading-relaxed text-ink/65">{note}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <GradeChip verdict={review.localVerdict === "PASS" ? "pass" : "fail"}>
          Tribunal {review.localVerdict}
        </GradeChip>
        {finalized && review.decision && (
          <GradeChip verdict={verdict}>GenLayer {review.decision}</GradeChip>
        )}
        {pending && (
          <span
            className="inline-flex items-center gap-1.5 text-[0.75rem] text-ink/50"
            // Motion is a nicety; the words carry the state on their own.
            aria-live="polite"
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-info motion-safe:animate-pulse"
            />
            in progress
          </span>
        )}
      </div>

      {finalized && review.failureCodes && review.failureCodes.length > 0 && (
        <div className="mt-4">
          <p className="text-[0.7rem] tracking-[0.1em] text-ink/45 uppercase">What they found</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {review.failureCodes.map((code) => (
              <li key={code}>
                <GradeChip verdict={code === review.criticalFailure ? "fail" : "repair"}>
                  {code.toLowerCase().replace(/_/g, " ")}
                </GradeChip>
              </li>
            ))}
          </ul>
        </div>
      )}

      {review.repairedFrom && (
        <p className="mt-4 text-[0.85rem] leading-relaxed text-ink/60">
          This is version {review.artifactVersion ?? 2}, made after an earlier version was
          overturned. The earlier review still stands, unchanged.
        </p>
      )}

      {decided && review.status === "ACCEPTED" && (
        <p className="mt-4 text-[0.85rem] leading-relaxed text-ink/60">
          Validators have agreed and this ruling is recorded on chain. It is not yet final —
          finality follows, and does not change what they decided.
        </p>
      )}

      {review.status !== "NOT_REQUESTED" && (
        <dl className="mt-5 border-t border-ink/8 pt-4">
          <Row label="Network">{review.network}</Row>
          <Row label="Review id">{review.reviewId}</Row>
          <Row label="OQS">v{review.oqsVersion}</Row>
          {review.scoreBand && <Row label="Score band">{review.scoreBand}</Row>}
          {review.artifactVersion && <Row label="Artifact version">{review.artifactVersion}</Row>}
          {review.intelligentContractAddress && (
            <Row label="Contract">{review.intelligentContractAddress}</Row>
          )}
          {review.transactionHash && (
            <Row label="Transaction">
              {review.explorerUrl ? (
                <a
                  className="text-amethyst underline decoration-amethyst/30 underline-offset-2"
                  href={review.explorerUrl}
                  rel="noreferrer"
                >
                  {review.transactionHash}
                </a>
              ) : (
                review.transactionHash
              )}
            </Row>
          )}
          {review.finalizedAt && <Row label="Finalized">{review.finalizedAt}</Row>}
        </dl>
      )}

      {review.status === "NOT_REQUESTED" && canRequest && requestHref && (
        <div className="mt-5">
          <Link
            href={requestHref}
            className="inline-flex items-center gap-2 rounded-full border border-amethyst/30 px-4 py-2 text-[0.85rem] font-semibold text-amethyst transition-colors hover:bg-amethyst/8"
          >
            Ask GenLayer
          </Link>
          <p className="mt-2 max-w-[46ch] text-[0.8rem] leading-relaxed text-ink/50">
            This publishes a redacted evidence snapshot — the brief, the rubric, our scores and
            this artifact — permanently and publicly. Your originals never leave Occestra.
          </p>
        </div>
      )}

      <p className="mt-5 text-[0.8rem] leading-relaxed text-ink/50">
        Occestra grades its own work, so it can be challenged.{" "}
        <Link href="/consensus" className="text-amethyst underline decoration-amethyst/30 underline-offset-2">
          How independent review works
        </Link>
      </p>
    </section>
  );
}
