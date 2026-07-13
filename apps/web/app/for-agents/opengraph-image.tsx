import { OG_SIZE, ogCard } from "@/lib/og-template";

export const alt = "Machines are customers here too.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OgImage() {
  return ogCard({
    kicker: "For agents",
    title: "Machines are customers here too.",
    footer: "MCP over HTTPS, x402 v2, schemas straight from the running server.",
    badge: "Agent #5213",
  });
}
