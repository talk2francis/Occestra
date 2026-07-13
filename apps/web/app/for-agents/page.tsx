import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/section-heading";
import { AGENT_ID, API_BASE } from "@/lib/real";

export const metadata: Metadata = {
  title: "For agents",
  description:
    "Occestra is an MCP server behind x402 payments on X Layer. Endpoint, live tool schemas, and a copy-paste first call.",
};

export const revalidate = 3600;

const INTERNAL = process.env.OCE_INTERNAL_API ?? "http://127.0.0.1:8412";

interface ToolInfo {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, { type?: string; description?: string }>; required?: string[] };
}

/** The real schemas, from the running server's own tools/list — zero drift. */
async function fetchTools(): Promise<ToolInfo[]> {
  try {
    const res = await fetch(`${INTERNAL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      next: { revalidate: 3600 },
    });
    const text = await res.text();
    const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
    const parsed = JSON.parse(dataLine ? dataLine.slice(5) : text) as {
      result?: { tools?: ToolInfo[] };
    };
    return parsed.result?.tools ?? [];
  } catch {
    return [];
  }
}

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

# -> HTTP 402 with an x402 v2 challenge (scheme "exact", eip155:196, USDT).
# Sign the EIP-3009 authorization, retry with the PAYMENT-SIGNATURE header,
# and the response arrives with a PAYMENT-RESPONSE settlement receipt.`;

export default async function ForAgentsPage() {
  const tools = await fetchTools();

  return (
    <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <Link href="/" className="text-[0.85rem] text-ink/60 transition-colors hover:text-ink">
        ← Occestra
      </Link>

      <SectionHeading
        kicker="For agents"
        className="mt-8"
        lede="No API key, no signup, no session. Discover the tools, receive an x402 challenge, pay in USDT on X Layer, get graded work back — receipts included."
      >
        Machines are customers here too.
      </SectionHeading>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Badge tone="amethyst">OKX.AI Agent #{AGENT_ID}</Badge>
        <Badge>MCP · streamable HTTP</Badge>
        <Badge>x402 v2 · eip155:196</Badge>
      </div>

      <dl className="text-data mt-8 grid gap-x-10 gap-y-3 text-ink/65 sm:grid-cols-2">
        <div>
          <dt className="text-ink/45">endpoint (POST, stateless)</dt>
          <dd className="mt-0.5">{API_BASE}/mcp</dd>
        </div>
        <div>
          <dt className="text-ink/45">manifest</dt>
          <dd className="mt-0.5">
            <a href={`${API_BASE}/.well-known/occestra.json`} className="underline decoration-ink/20 underline-offset-2 hover:text-ink">
              /.well-known/occestra.json
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-ink/45">published standard</dt>
          <dd className="mt-0.5">
            <a href={`${API_BASE}/standard`} className="underline decoration-ink/20 underline-offset-2 hover:text-ink">
              {API_BASE}/standard
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-ink/45">verify any keepsake</dt>
          <dd className="mt-0.5">GET {API_BASE}/k/&lt;keepsakeId&gt; · oce_verify_keepsake is free</dd>
        </div>
      </dl>

      <section className="mt-12">
        <h2 className="text-kicker text-ink/60">Your first call</h2>
        <div className="mt-4 overflow-hidden rounded-2xl border border-ink/70 bg-ink shadow-keepsake">
          <pre className="overflow-x-auto p-5 font-mono text-[0.74rem] leading-relaxed text-ground/85">
            <code>{EXAMPLE}</code>
          </pre>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-kicker text-ink/60">
          The tools — schemas straight from the running server
        </h2>
        {tools.length === 0 ? (
          <p className="mt-4 text-[0.9rem] text-ink/65">
            The live schema listing is briefly unavailable — call{" "}
            <span className="text-data">tools/list</span> on the endpoint above for the source of
            truth.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {tools.map((tool) => (
              <details key={tool.name} className="group rounded-2xl border border-ink/10 bg-ground">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4">
                  <span className="text-data text-[0.85rem] text-ink/85">{tool.name}</span>
                  <span className="text-[0.75rem] text-ink/60 group-open:hidden">schema</span>
                </summary>
                <div className="border-t border-ink/10 p-4">
                  {tool.description && (
                    <p className="text-[0.85rem] leading-relaxed whitespace-pre-line text-ink/65">
                      {tool.description.split("\n\n").slice(0, 2).join("\n\n")}
                    </p>
                  )}
                  {tool.inputSchema?.properties && (
                    <ul className="mt-3 space-y-1.5">
                      {Object.entries(tool.inputSchema.properties).map(([name, prop]) => (
                        <li key={name} className="text-[0.8rem] leading-relaxed text-ink/70">
                          <span className="text-data text-ink/85">{name}</span>
                          <span className="text-ink/45"> · {prop.type ?? "any"}</span>
                          {tool.inputSchema?.required?.includes(name) && (
                            <span className="text-amethyst"> · required</span>
                          )}
                          {prop.description && <span> — {prop.description}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <p className="mt-12 text-[0.88rem] leading-relaxed text-ink/65">
        The cheapest way in is <span className="text-data">oce_critique</span> at 0.01 USDT: send
        your own agent&apos;s output and get the graded{" "}
        <Link href="/standard" className="text-amethyst underline decoration-amethyst/30 underline-offset-2">
          OQS report
        </Link>{" "}
        and a concrete repair brief back. Cheaper than finding out from your users.
      </p>
    </main>
  );
}
