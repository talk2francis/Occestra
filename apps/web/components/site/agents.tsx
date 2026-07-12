"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Reveal } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/section-heading";
import { AGENT_ID, API_BASE } from "@/lib/real";

const EXAMPLE = `curl -X POST ${API_BASE}/mcp \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{
    "jsonrpc": "2.0", "id": 1, "method": "tools/call",
    "params": {
      "name": "oce_critique",
      "arguments": { "kind": "launch_thread", "content": "<your artifact>" }
    }
  }'
# → HTTP 402 with an x402 challenge; sign, retry with PAYMENT-SIGNATURE, get graded.`;

export function Agents() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(EXAMPLE);
    setCopied(true);
    toast.success("Example copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="agents" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
        <Reveal className="min-w-0">
          <SectionHeading
            kicker="For agents"
            lede="Occestra is an MCP server behind x402 payments — any agent with a wallet can buy a graded artifact, a validated plan, or an honest critique of its own output. No API key, no signup."
          >
            Machines are customers here too.
          </SectionHeading>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Badge tone="amethyst">OKX.AI Agent #{AGENT_ID}</Badge>
            <Badge>x402 v2 · eip155:196</Badge>
            <Badge>streamable HTTP</Badge>
          </div>
          <dl className="text-data mt-8 space-y-3 text-ink/60">
            <div>
              <dt className="text-ink/60">endpoint</dt>
              <dd className="mt-0.5">{API_BASE}/mcp</dd>
            </div>
            <div>
              <dt className="text-ink/60">manifest</dt>
              <dd className="mt-0.5">
                <a
                  href={`${API_BASE}/.well-known/occestra.json`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-ink/20 underline-offset-2 hover:text-ink"
                >
                  {API_BASE}/.well-known/occestra.json
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-ink/60">published standard</dt>
              <dd className="mt-0.5">
                <a
                  href={`${API_BASE}/standard`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-ink/20 underline-offset-2 hover:text-ink"
                >
                  {API_BASE}/standard
                </a>
              </dd>
            </div>
          </dl>
        </Reveal>

        <Reveal delay={0.12} className="min-w-0">
          <div className="min-w-0 overflow-hidden rounded-2xl border border-ink/70 bg-ink shadow-keepsake">
            <div className="flex items-center justify-between border-b border-ground/10 px-4 py-2.5">
              <p className="text-data text-ground/70">one paid call, end to end</p>
              <button
                onClick={copy}
                className="rounded-full border border-ground/20 px-3 py-1 text-[0.72rem] font-medium text-ground/70 transition-colors hover:border-ground/50 hover:text-ground"
              >
                {copied ? "copied" : "copy"}
              </button>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[0.74rem] leading-relaxed text-ground/85">
              <code>{EXAMPLE}</code>
            </pre>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
