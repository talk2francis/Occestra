export const dynamic = "force-dynamic";

const INTERNAL = process.env.OCE_INTERNAL_API ?? "http://127.0.0.1:8412";

export async function GET(): Promise<Response> {
  const secret = process.env.OCE_DEMO_SECRET;
  if (!secret) return Response.json({ used: 0, cap: 0, remaining: 0 });

  try {
    const upstream = await fetch(`${INTERNAL}/internal/demo/quota`, {
      headers: { "x-oce-demo-secret": secret },
      cache: "no-store",
    });
    return Response.json(await upstream.json());
  } catch {
    return Response.json({ used: 0, cap: 0, remaining: 0 });
  }
}
