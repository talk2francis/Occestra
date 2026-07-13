import { OG_SIZE, ogCard } from "@/lib/og-template";

export const alt = "Watch the syndicate work, live.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OgImage() {
  return ogCard({
    kicker: "The Studio · Occestra",
    title: "Watch the syndicate work, live.",
    footer: "Real pipelines, real grades, visible repairs — sealed on X Layer.",
    badge: "open now",
  });
}
