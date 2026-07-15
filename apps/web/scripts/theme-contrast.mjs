/**
 * WCAG contrast proof for the Amethyst Nocturne palette.
 *
 * The dark grade colors were brightened until every one holds >= 4.5:1 against
 * the panel AND against its own 8% chip fill over the panel (the worst surface
 * a grade ever renders text on). Run after ANY token change:
 *
 *   node scripts/theme-contrast.mjs   # exits 1 if a pair falls below AA
 */
const lum = (hex) => {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const mix = (fg, bg, a) => {
  const p = (h) => [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16));
  const [f, g2] = [p(fg), p(bg)];
  return "#" + f.map((v, i) => Math.round(v * a + g2[i] * (1 - a)).toString(16).padStart(2, "0")).join("");
};

const NOCTURNE = {
  ground: "#17131C",
  panel: "#201A28",
  ink: "#F2EDE6",
  plum: "#D6C5F0",
  amethyst: "#9D6FD8",
  lilac: "#C8B4FF",
  silver: "#8E8A94",
  pass: "#4CC98A",
  repair: "#EA9E52",
  fail: "#E76A6A",
  info: "#7DBCFF",
};

const AA = 4.5;
let failures = 0;
const check = (label, fg, bg, floor = AA) => {
  const r = ratio(fg, bg);
  const ok = r >= floor;
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${label.padEnd(38)} ${r.toFixed(2)}:1 (needs ${floor})`);
};

const { ground, panel, ink, plum, amethyst, silver, lilac } = NOCTURNE;

check("ink (body) on ground", ink, ground);
check("ink (body) on panel", ink, panel);
check("ink at 65% on ground", mix(ink, ground, 0.65), ground);
check("plum (emphasis) on ground", plum, ground);
check("amethyst (kicker) on ground", amethyst, ground);
check("amethyst (kicker) on panel", amethyst, panel);
check("lilac (live) on panel", lilac, panel);
check("silver on panel", silver, panel);
// primary button inverts: dark text on the light ink-token fill
check("ground text on ink button", ground, ink);
check("ground text on plum hover", ground, plum);

for (const grade of ["pass", "repair", "fail", "info"]) {
  const c = NOCTURNE[grade];
  check(`${grade} on panel`, c, panel);
  check(`${grade} on its 8% chip over panel`, c, mix(c, panel, 0.08));
}

if (failures) {
  console.error(`\n${failures} contrast pair(s) below AA — fix the tokens before shipping.`);
  process.exit(1);
}
console.log("\nAll Nocturne pairs hold WCAG AA.");
