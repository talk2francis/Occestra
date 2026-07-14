import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const INTERNAL = process.env.OCE_INTERNAL_API ?? "http://127.0.0.1:8412";

/**
 * The quota the BUTTON reads.
 *
 * The visitor's address has to cross the loopback hop, exactly as it does for the run
 * itself (see ../route.ts). Without it every visitor arrives at the ASP as 127.0.0.1,
 * and the quota we report back is somebody else's: the button would offer runs to a
 * person who has none left, and refuse someone who has never been here.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const secret = process.env.OCE_DEMO_SECRET;
  if (!secret) return Response.json({ used: 0, cap: 0, remaining: 0 });

  const chain = request.headers.get("x-forwarded-for");

  try {
    const upstream = await fetch(`${INTERNAL}/internal/demo/quota`, {
      headers: {
        "x-oce-demo-secret": secret,
        ...(chain ? { "x-forwarded-for": chain } : {}),
      },
      cache: "no-store",
    });
    return Response.json(await upstream.json());
  } catch {
    return Response.json({ used: 0, cap: 0, remaining: 0 });
  }
}
