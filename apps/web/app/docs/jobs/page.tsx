import type { Metadata } from "next";
import { Callout, DocTitle, InlineCode, PrevNext, Section } from "@/components/docs/doc";
import { CodeBlock } from "@/components/docs/code-block";

export const metadata: Metadata = { title: "Async jobs" };

export default function JobsDocs() {
  return <>
    <DocTitle kicker="Async jobs" lede="Pack-scale work survives marketplace timeouts. Payment happens once; polling and collection are free.">Long work should outlive the connection.</DocTitle>
    <Section id="lifecycle" title="The lifecycle">
      <p><InlineCode>oce_create_pack_job</InlineCode> validates the target tool arguments before settlement and returns a job id immediately. The durable state machine is <InlineCode>queued → running → delivering → done</InlineCode>, with <InlineCode>failed</InlineCode> and <InlineCode>cancelled</InlineCode> terminal paths.</p>
      <CodeBlock lang="json" title="create a grounded occasion job">{`{"tool":"oce_create_pack_job","arguments":{"tool":"oce_plan_occasion","arguments":{"occasion":"Graduation lunch","city":"Lagos","date":"2026-07-25","headcount":18,"vibe":"sunlit and intimate"}}}`}</CodeBlock>
    </Section>
    <Section id="follow" title="Follow, collect, cancel">
      <p><InlineCode>oce_job_status</InlineCode> is free and returns state plus artifact progress. <InlineCode>oce_job_result</InlineCode> is free and returns the completed pack and its public <InlineCode>/k</InlineCode> link. <InlineCode>oce_cancel_job</InlineCode> is free; queued jobs cancel immediately and running jobs stop at the next safe boundary.</p>
    </Section>
    <Section id="idempotency" title="Retries cannot double-charge">
      <p>Send an <InlineCode>Idempotency-Key</InlineCode> on a paid call. The same key with the same arguments within 24 hours returns the original result. Reusing it with different arguments is rejected. When the header is absent, the payment nonce is the fallback key.</p>
      <Callout tone="good">Jobs live in SQLite and survive restarts. A process restart recovers queued work and safely requeues interrupted work; tests exercise restart-mid-job.</Callout>
    </Section>
    <PrevNext slug="jobs" />
  </>;
}
