import { OG_SIZE, ogCard } from "@/lib/og-template";

export const alt = "Priced in cents. Graded like it costs more.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OgImage() {
  return ogCard({
    kicker: "Pricing",
    title: "Priced in cents. Graded like it costs more.",
    footer: "x402 per call in USDT on X Layer, plus negotiated A2A packages.",
    badge: "13 tools",
  });
}
