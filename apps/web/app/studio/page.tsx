import type { Metadata } from "next";
import { Workspace } from "@/components/studio/workspace";
import type { StyleSwatch } from "@/lib/studio";

export const metadata: Metadata = {
  title: "The Studio",
  description:
    "Watch the syndicate assemble a real occasion pack: grounded facts, Tribunal grades, visible repairs, and a seal on X Layer.",
};

export const dynamic = "force-dynamic";

const INTERNAL = process.env.OCE_INTERNAL_API ?? "http://127.0.0.1:8412";

/** Real style definitions from the running ASP — palettes included. */
async function fetchStyles(): Promise<StyleSwatch[]> {
  try {
    const res = await fetch(`${INTERNAL}/.well-known/occestra.json`, {
      next: { revalidate: 3600 },
    });
    const manifest = (await res.json()) as { styles?: StyleSwatch[] };
    return manifest.styles ?? [];
  } catch {
    return [];
  }
}

async function fetchQuota(): Promise<{ used: number; cap: number; remaining: number }> {
  const secret = process.env.OCE_DEMO_SECRET;
  if (!secret) return { used: 0, cap: 0, remaining: 0 };
  try {
    const res = await fetch(`${INTERNAL}/internal/demo/quota`, {
      headers: { "x-oce-demo-secret": secret },
      cache: "no-store",
    });
    return (await res.json()) as { used: number; cap: number; remaining: number };
  } catch {
    return { used: 0, cap: 0, remaining: 0 };
  }
}

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ studio?: string; style?: string }> }) {
  const query = await searchParams;
  const [styles, quota] = await Promise.all([fetchStyles(), fetchQuota()]);
  const initialStudio = ["celebrate", "remember", "launch"].includes(query.studio ?? "")
    ? query.studio as "celebrate" | "remember" | "launch"
    : "celebrate";
  const requestedStyle = styles.find((style) => style.id === query.style);
  const initialStyleId = requestedStyle && (!requestedStyle.appliesTo || requestedStyle.appliesTo.includes(initialStudio))
    ? requestedStyle.id
    : undefined;
  return <Workspace styles={styles} quota={quota} initialStudio={initialStudio} initialStyleId={initialStyleId} />;
}
