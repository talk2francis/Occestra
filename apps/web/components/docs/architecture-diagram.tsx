/**
 * The system, drawn by hand in the house palette. One SVG, no library —
 * boxes are the real package names, arrows are the real data flow.
 */
// token-driven so the diagram redraws itself in both themes
const INK = "var(--color-ink)";
const AMETHYST = "var(--color-amethyst)";
const SILVER = "var(--color-silver)";
const PANEL = "var(--color-panel)";
const PASS = "var(--color-pass)";
const REPAIR = "var(--color-repair)";

function Box({
  x, y, w, h, title, sub, accent,
}: { x: number; y: number; w: number; h: number; title: string; sub?: string; accent?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={accent ? "var(--color-ground)" : PANEL}
        stroke={accent ? AMETHYST : "color-mix(in srgb, var(--color-ink) 18%, transparent)"} strokeWidth={accent ? 1.6 : 1} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 4 : h / 2 + 4)} textAnchor="middle"
        fontSize="12.5" fontWeight="600" fill={INK} style={{ fontFamily: "var(--font-sans)" }}>
        {title}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" fontSize="9.5" fill={SILVER}
          style={{ fontFamily: "var(--font-mono)" }}>
          {sub}
        </text>
      )}
    </g>
  );
}

function Arrow({ d, color = SILVER, dash }: { d: string; color?: string; dash?: boolean }) {
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={1.4}
      strokeDasharray={dash ? "4 4" : undefined} markerEnd="url(#arr)" />
  );
}

export function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 880 560" className="w-full" role="img"
      aria-label="Occestra architecture: three entry rails feed the policy gate, studio pipelines, the Tribunal repair loop, sealing, the store, and the anchor worker writing to X Layer">
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8" fill="none" stroke={SILVER} strokeWidth="1.2" />
        </marker>
      </defs>

      {/* rails */}
      <text x="20" y="28" fontSize="10" fill={AMETHYST} letterSpacing="2" style={{ fontFamily: "var(--font-sans)", fontWeight: 600 }}>HOW WORK ARRIVES</text>
      <Box x={20} y={40} w={180} h={46} title="MCP · x402 per call" sub="POST /mcp · 13 tools" accent />
      <Box x={220} y={40} w={180} h={46} title="A2A packages" sub="negotiated · escrowed" accent />
      <Box x={420} y={40} w={180} h={46} title="The Studio (web)" sub="SSE · demo-metered" accent />

      <Arrow d="M110,86 L110,124" />
      <Arrow d="M310,86 Q310,105 200,124" />
      <Arrow d="M510,86 Q510,105 260,126" />

      {/* gate + pipeline */}
      <Box x={20} y={128} w={240} h={46} title="PolicyGate" sub="screened BEFORE payment or tokens" />
      <Arrow d="M140,174 L140,210" />
      <Box x={20} y={214} w={240} h={64} title="Studio pipelines" sub="celebrate · remember · launch (pure)" />
      <text x="140" y="266" textAnchor="middle" fontSize="9" fill={SILVER} style={{ fontFamily: "var(--font-mono)" }}>@occestra/studio-core</text>

      {/* grounded world */}
      <Box x={310} y={200} w={200} h={40} title="Grounding" sub="OSM · Open-Meteo · headless browser" />
      <Box x={310} y={252} w={200} h={40} title="Models" sub="router: OpenAI live · Claude/Grok wired" />
      <Arrow d="M310,222 L264,230" dash />
      <Arrow d="M310,270 L264,248" dash />

      {/* tribunal loop */}
      <Arrow d="M140,278 L140,314" />
      <Box x={20} y={318} w={240} h={64} title="The Tribunal" sub="OQS v1.2 profiles + hard checks" />
      <path d="M264,338 Q330,338 330,362 Q330,386 264,376" fill="none" stroke={REPAIR} strokeWidth={1.4} markerEnd="url(#arr)" />
      <text x="352" y="356" fontSize="10" fill={REPAIR} style={{ fontFamily: "var(--font-mono)" }}>fail → repair brief</text>
      <text x="352" y="370" fontSize="10" fill={REPAIR} style={{ fontFamily: "var(--font-mono)" }}>regenerate · ×2 max</text>
      <text x="140" y="398" textAnchor="middle" fontSize="9.5" fill={SILVER} style={{ fontFamily: "var(--font-mono)" }}>report ships in every pack — pass or fail</text>

      {/* seal + store */}
      <Arrow d="M140,382 L140,424" />
      <Box x={20} y={428} w={240} h={46} title="Sealer" sub='EIP-712 · domain "Occestra"' accent />
      <Arrow d="M260,451 L318,451" />
      <Box x={322} y={428} w={190} h={46} title="Store" sub="SQLite + signed URLs" />
      <Arrow d="M512,451 L570,451" />
      <Box x={574} y={428} w={130} h={46} title="Anchor worker" sub="sealBatch · 30 min" />
      <Arrow d="M704,451 L748,451" color={PASS} />
      <Box x={752} y={420} w={112} h={62} title="X Layer" sub="KeepsakeRegistry" accent />
      <text x="808" y="500" textAnchor="middle" fontSize="9" fill={PASS} style={{ fontFamily: "var(--font-mono)" }}>0x1653…1f08</text>

      {/* public surfaces */}
      <Box x={560} y={200} w={300} h={40} title="Public, free" sub="/k/:id · /standard · /stats · verify" />
      <Arrow d="M512,445 Q560,340 620,242" dash />
      <text x="700" y="262" fontSize="9.5" fill={SILVER} style={{ fontFamily: "var(--font-mono)" }}>anyone verifies — no trust in us</text>

      {/* packages strip */}
      <text x="20" y="530" fontSize="10" fill={AMETHYST} letterSpacing="2" style={{ fontFamily: "var(--font-sans)", fontWeight: 600 }}>THE MONOREPO</text>
      <text x="20" y="548" fontSize="10" fill={SILVER} style={{ fontFamily: "var(--font-mono)" }}>
        studio-core · tribunal · receipts · contracts · providers · mcp-server · client — apps/web · docs
      </text>
    </svg>
  );
}
