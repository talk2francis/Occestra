/**
 * The shared OG card: warm ground, amethyst kicker, serif line — one system
 * for every core route, generated here, no external service.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

const ASSETS = join(process.cwd(), "assets", "og");

export async function ogCard(options: {
  kicker: string;
  title: string;
  footer: string;
  badge?: string;
}): Promise<ImageResponse> {
  const [fraunces, instrument] = await Promise.all([
    readFile(join(ASSETS, "fraunces-600.ttf")),
    readFile(join(ASSETS, "instrument-500.ttf")),
  ]);

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
            {options.kicker}
          </div>
        </div>

        <div
          style={{
            fontFamily: "Fraunces",
            fontSize: options.title.length > 42 ? 60 : 76,
            lineHeight: 1.05,
            letterSpacing: -1.5,
            maxWidth: 1000,
          }}
        >
          {options.title}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 26, color: "#8E8A94", maxWidth: 760 }}>{options.footer}</div>
          <div
            style={{
              display: "flex",
              border: "2px solid #6B3FA0",
              borderRadius: 999,
              padding: "12px 28px",
              color: "#6B3FA0",
              fontSize: 24,
            }}
          >
            {options.badge ?? "Occestra"}
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Fraunces", data: fraunces, weight: 600 },
        { name: "Instrument", data: instrument, weight: 500 },
      ],
    },
  );
}
