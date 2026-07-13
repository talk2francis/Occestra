import { OG_SIZE, ogCard } from "@/lib/og-template";

export const alt = "The Occestra Quality Standard.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OgImage() {
  return ogCard({
    kicker: "Published standard",
    title: "The Occestra Quality Standard.",
    footer: "Generated from the same constants the grading engine runs.",
    badge: "OQS v1.0.0",
  });
}
