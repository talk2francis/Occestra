import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
const INTERNAL = process.env.OCE_INTERNAL_API ?? "http://127.0.0.1:8412";

/** Same-origin bridge: forwards the browser's pack capability, never a deployment secret. */
export async function POST(request: NextRequest): Promise<Response> {
  const runId = request.headers.get("x-oce-run-id");
  const recoveryToken = request.headers.get("x-oce-recovery-token");
  if (!runId || !recoveryToken) {
    return Response.json({ error: "this browser does not hold the owner capability for that pack" }, { status: 403 });
  }
  const upstream = await fetch(`${INTERNAL}/genlayer/reviews`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-oce-run-id": runId,
      "x-oce-recovery-token": recoveryToken,
    },
    body: await request.text(),
    cache: "no-store",
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
  });
}
