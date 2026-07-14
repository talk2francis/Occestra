/**
 * The shared OG card: warm ground, the logo, an amethyst kicker, serif line —
 * one system for every core route, generated here, no external service.
 *
 * The logo is embedded as a data URI: satori has no filesystem and will try to
 * fetch a bare path over the network (blocked in prod → 500).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

const ASSETS = join(process.cwd(), "assets", "og");
const BRAND = join(process.cwd(), "public", "brand");

const dataUri = async (file: string) =>
  `data:image/png;base64,${(await readFile(join(BRAND, file))).toString("base64")}`;

export async function ogCard(options: {
  kicker: string;
  title: string;
  footer: string;
  badge?: string;
}): Promise<ImageResponse> {
  const [fraunces, instrument, wordmark] = await Promise.all([
    readFile(join(ASSETS, "fraunces-600.ttf")),
    readFile(join(ASSETS, "instrument-500.ttf")),
    dataUri("logo-horizontal.png"),
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wordmark} width={175} height={47} alt="Occestra" />
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
          <div style={{ display: "flex", fontSize: 26, color: "#8E8A94", maxWidth: 780 }}>
            {options.footer}
          </div>
          {options.badge ? (
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
              {options.badge}
            </div>
          ) : null}
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
