/**
 * The demo proxy: the browser talks to us; we talk to the mcp-server's
 * internal SSE route with the shared secret. The secret never reaches the
 * client, and the stream passes through untouched — real events only.
 */
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const INTERNAL = process.env.OCE_INTERNAL_API ?? "http://127.0.0.1:8412";

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
