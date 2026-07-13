import { OG_SIZE, ogCard } from "@/lib/og-template";

export const alt = "Small numbers, honestly counted.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OgImage() {
  return ogCard({
    kicker: "Live counters",
    title: "Small numbers, honestly counted.",
    footer: "Computed from the store on every request — never inflated.",
    badge: "live",
  });
}
