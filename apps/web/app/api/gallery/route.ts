/** Capability-gated Gallery publishing proxy. The ASP secret stays server-side. */
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const INTERNAL = process.env.OCE_INTERNAL_API ?? "http://127.0.0.1:8412";

function configured(): string | undefined {
  return process.env.OCE_DEMO_SECRET;
}

export async function POST(request: NextRequest): Promise<Response> {
  const secret = configured();
  if (!secret) return Response.json({ error: "Gallery publishing is not configured" }, { status: 503 });

  const upstream = await fetch(`${INTERNAL}/internal/demo/gallery`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-oce-demo-secret": secret },
    body: await request.text(),
    cache: "no-store",
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" },
  });
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const secret = configured();
  if (!secret) return Response.json({ error: "Gallery publishing is not configured" }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { packId?: string; managementToken?: string } | null;
  if (!body?.packId || !body.managementToken) {
    return Response.json({ error: "No manageable Gallery submission" }, { status: 400 });
  }

  const upstream = await fetch(`${INTERNAL}/internal/demo/gallery/${encodeURIComponent(body.packId)}`, {
    method: "DELETE",
    headers: { "x-oce-demo-secret": secret, "x-oce-gallery-token": body.managementToken },
    cache: "no-store",
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" },
  });
}
