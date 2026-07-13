import { OG_SIZE, ogCard } from "@/lib/og-template";

export const alt = "Real runs, kept honest.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OgImage() {
  return ogCard({
    kicker: "Gallery · Occestra",
    title: "Real runs, kept honest.",
    footer: "Our own briefs through the real pipelines — grades shown as graded.",
    badge: "16 real packs",
  });
}
