/**
 * Per-keepsake OG image: warm ground, serif headline, the seal state — so a
 * shared /k link unfurls like the keepsake it is.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { fetchPack } from "@/lib/pack";

export const alt = "A sealed Occestra keepsake";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ASSETS = join(process.cwd(), "assets", "og");

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pack, fraunces, instrument] = await Promise.all([
    fetchPack(id),
    readFile(join(ASSETS, "fraunces-600.ttf")),
    readFile(join(ASSETS, "instrument-500.ttf")),
  ]);

  const title = pack?.artifacts[0]?.title ?? "A keepsake";
  const studio = pack?.studio ?? "occasion";
  const sealed = Boolean(pack?.seal);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: "#FAF7F2",
          color: "#17141A",
          fontFamily: "Instrument",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 34, height: 2, backgroundColor: "#6B3FA0" }} />
          <div style={{ fontSize: 24, letterSpacing: 5, color: "#6B3FA0", textTransform: "uppercase" }}>
            {`${studio} studio · Occestra`}
          </div>
        </div>

        <div
          style={{
            fontFamily: "Fraunces",
            fontSize: title.length > 60 ? 56 : 72,
            lineHeight: 1.06,
            letterSpacing: -1.5,
            maxWidth: 980,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 26, color: "#8E8A94" }}>
            {sealed ? "Sealed on X Layer — verify it yourself" : "Graded against the published OQS"}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              border: "2px solid #6B3FA0",
              borderRadius: 999,
              padding: "12px 28px",
              color: "#6B3FA0",
              fontSize: 24,
            }}
          >
            {sealed ? "sealed" : "graded"}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Fraunces", data: fraunces, weight: 600 },
        { name: "Instrument", data: instrument, weight: 500 },
      ],
    },
  );
}
