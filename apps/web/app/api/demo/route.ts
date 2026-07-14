/**
 * The demo proxy: the browser talks to us; we talk to the mcp-server's
 * internal SSE route with the shared secret. The secret never reaches the
 * client, and the stream passes through untouched — real events only.
 */
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const INTERNAL = process.env.OCE_INTERNAL_API ?? "http://127.0.0.1:8412";

/**
 * Carry the visitor's address across the loopback hop to the ASP.
 *
 * Caddy sets x-forwarded-for; we pass it through unchanged so the ASP's first entry is
 * still the real client. If it is absent (a direct local call), we send nothing rather
 * than inventing an address — the ASP falls back to its own view of the peer.
 */
function forwardedFor(request: NextRequest): Record<string, string> {
  const chain = request.headers.get("x-forwarded-for");
  return chain ? { "x-forwarded-for": chain } : {};
}

export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.OCE_DEMO_SECRET;
  if (!secret) {
    return Response.json({ error: "demo is not configured" }, { status: 503 });
  }

  const body = await request.text();

  const upstream = await fetch(`${INTERNAL}/internal/demo/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-oce-demo-secret": secret,
      // WITHOUT THIS, THE PER-IP DEMO CAP LOCKS OUT THE WORLD.
      //
      // The browser never talks to the ASP directly — it talks to us, and we call the
      // ASP over loopback. So every visitor arrives at the ASP as 127.0.0.1, and a cap
      // that counts free runs per caller would count them all as ONE caller: two runs
      // and the Studio button is dead for everyone. The visitor's real address has to
      // be carried across this hop deliberately.
      ...forwardedFor(request),
    },
    body,
    // @ts-expect-error -- undici needs duplex for streaming request bodies
    duplex: "half",
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(detail || JSON.stringify({ error: "demo run refused" }), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
