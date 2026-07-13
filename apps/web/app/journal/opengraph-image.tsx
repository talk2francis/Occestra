import { OG_SIZE, ogCard } from "@/lib/og-template";

export const alt = "The Occasions Journal — the week's best sealed packs";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OgImage() {
  return ogCard({
    kicker: "The Occasions Journal",
    title: "Real runs, worth keeping.",
    footer: "A weekly selection of sealed packs — grades shown, seals verifiable.",
    badge: "Issue No. 1",
  });
}
