/**
 * House Styles.
 *
 * These are product, not configuration. A House Style is the difference between "an AI
 * made a picture" and "someone with taste directed this" — so each promptSystem below is
 * written the way a real art director writes a brief: medium first, then composition, then
 * light, then material, then the explicit list of things that would cheapen it.
 *
 * Styles are versioned. Changing a promptSystem or a palette bumps the version, because
 * sealed keepsakes reference the style that made them and that reference must stay honest.
 */
import type { HouseStyle, HouseStyleId } from "@occestra/studio-core";

export const AMETHYST_EDITORIAL: HouseStyle = {
  id: "amethyst_editorial",
  name: "Amethyst Editorial",
  version: "1.0.0",
  promptSystem: [
    "Medium: editorial collage on warm ivory paper stock, as though printed in a small-run art quarterly.",
    "Build the image from layered paper, engraved line-work, and photographic fragments with visible torn or cut edges. Physical materials, never digital gloss.",
    "Composition: asymmetric and confident. One clear focal element placed off-centre, generous negative space around it, and a strong implied grid the eye can feel but not see. Never centre the subject. Never fill the frame edge to edge.",
    "Light: soft, directional daylight from one side, as if from a tall window. Gentle falloff, honest shadows, no rim-lighting, no glow.",
    "Colour: warm ivory ground and near-black ink dominate. Deep amethyst appears as an accent only — a wash, a stamp, a single inked shape — and never occupies more than roughly a sixth of the frame.",
    "Texture: subtle paper grain, faint letterpress bite, the occasional engraved botanical or architectural line drawing. Texture should be felt at arm's length, not stared at.",
    "Mood: considered, literary, quietly celebratory. The image should look commissioned, not generated.",
  ].join("\n"),
  palette: ["#FAF7F2", "#F1ECE4", "#17141A", "#2D1B4E", "#6B3FA0", "#8E8A94"],
  typeDirection:
    "Editorial serif for the emotional line — high contrast, generous leading, set large and calm. A precise grotesk, small and tightly tracked, for every functional detail. Never more than two families. Never centre long copy.",
  negativePrompt: [
    "no full-screen purple gradients",
    "no neon or glow",
    "no 3D render look, no octane, no glossy plastic",
    "no robot mascots, no glowing brains, no circuit-board motifs",
    "no stock-photo smiling faces",
    "no lens flare, no bokeh spheres",
    "no drop shadows on text",
    "no watermarks, no signatures, no gibberish lettering",
  ].join(", "),
  bestFor:
    "Invitations and launch work that should look commissioned rather than generated. The default, and the safest choice when you are not sure: it is warm without being sweet, and it carries small type well.",
  wrongFor:
    "Anything that needs to feel nocturnal or black-tie — reach for Gilded Noir. It will not give you drama.",
  appliesTo: { studios: ["celebrate", "remember", "launch"] },
  seedStrategy: "contract_hash",
};

export const GILDED_NOIR: HouseStyle = {
  id: "gilded_noir",
  name: "Gilded Noir",
  version: "1.0.0",
  promptSystem: [
    "Medium: foil-blocked print on heavy near-black card, photographed at a slight angle so the foil catches the light.",
    "Build the image around a single luminous element on deep, rich darkness — champagne gold leaf, a struck match, candle-light on glass, the rim of a coupe.",
    "Composition: formal and symmetrical, or deliberately, dramatically off-balance. Nothing in between. Wide margins. The darkness is the subject as much as the light is.",
    "Light: one warm source, low and close. Deep falloff into black. Specular highlights on metal and glass are welcome; flat even lighting is not.",
    "Colour: near-black ground with champagne and antique gold. A single cold accent — deep plum or midnight blue — may appear to keep the gold from turning brassy.",
    "Texture: fine paper tooth under the foil, a faint emboss, the grain of a night photograph. Elegant, never grubby.",
    "Mood: formal celebration. Black tie, late hour, the good glassware. Restrained, expensive, warm rather than cold.",
  ].join("\n"),
  palette: ["#0C0A0E", "#17141A", "#C9A961", "#E8D5A3", "#2D1B4E", "#FAF7F2"],
  typeDirection:
    "High-contrast display serif, letterspaced, set small and centred with a great deal of air around it — the confidence of an engraved invitation. All-caps only for the shortest lines.",
  negativePrompt: [
    "no gaudy or brassy yellow",
    "no casino or Las Vegas glitz",
    "no glitter particles, no sparkles, no bokeh confetti",
    "no neon, no cyberpunk",
    "no 3D render look",
    "no stock-photo champagne splash",
    "no watermarks, no gibberish lettering",
  ].join(", "),
  bestFor:
    "Black-tie, evening, and anything with weight: galas, awards, milestone birthdays, a launch that wants to feel expensive. Champagne gold on near-black is the most formal register we have.",
  wrongFor:
    "Daytime, children's parties, or anything tender. It is a beautiful style with no warmth in it at all.",
  appliesTo: { studios: ["celebrate", "launch"] },
  seedStrategy: "contract_hash",
};

export const SUNPRINT: HouseStyle = {
  id: "sunprint",
  name: "Sunprint",
  version: "1.0.0",
  promptSystem: [
    "Medium: cyanotype — a camera-less sun print on cotton rag paper. Objects laid directly on treated paper and exposed to daylight, so forms appear as soft white silhouettes in a field of Prussian blue.",
    "Build the image from botanical and everyday silhouettes: pressed leaves, ferns, feathers, a hand, a key, a folded letter. Things that were physically present.",
    "Composition: a quiet, slightly irregular arrangement, as if laid by hand. Elements overlap and touch. Edges bleed. Space at the top or one side where the paper is simply blue.",
    "Light: the sun did the work. Exposure is uneven the way real sunlight is — deeper blue where the light was strong, paler where a cloud passed.",
    "Colour: Prussian and cerulean blue against paper white and the faint cream of the rag. No other hue enters the frame.",
    "Texture: cotton fibre, uneven brush strokes of emulsion at the borders, faint water-marks and hand-coated edges. The imperfection is the point.",
    "Mood: memory, tenderness, time passing. Nostalgic without sentimentality. This is the default style for keepsakes of things already gone.",
  ].join("\n"),
  palette: ["#0B2C4D", "#1E5F8C", "#5A8FB5", "#8FB8D6", "#E8F1F7", "#FBF9F4"],
  typeDirection:
    "A quiet humanist serif, small, set low and to one side like a handwritten caption beneath a photograph. Sparse. One line, rarely two.",
  negativePrompt: [
    "no colours other than blue and paper white",
    "no faces, no portraits, no likenesses",
    "no digital gradients, no vector-flat shapes",
    "no HDR, no oversaturation",
    "no 3D render look",
    "no watermarks, no gibberish lettering",
  ].join(", "),
  bestFor:
    "MEMORY. A moment that already happened. The cyanotype blues read as a photograph that has been kept, and it is the right register for a keepsake — which is why oce_make_keepsake defaults to it.",
  wrongFor:
    "Anything forward-looking. A product launch in Sunprint looks like a eulogy for the product.",
  appliesTo: { studios: ["celebrate", "remember"] },
  seedStrategy: "contract_hash",
};

export const ATLAS_INK: HouseStyle = {
  id: "atlas_ink",
  name: "Atlas Ink",
  version: "1.0.0",
  promptSystem: [
    "Medium: a working map and ledger — pen and ink on cream cartridge paper, the way a route is actually planned before it is travelled.",
    "Build the image from cartographic language: contour lines, hand-drawn coastlines, route lines with small punctuation marks at each stop, marginal notes, a compass rose tucked into a corner, a scale bar.",
    "Composition: information laid out with the calm of a good map. A dominant route line threading the frame, annotated stops, generous margin, a small legend block. It should reward being read as well as looked at.",
    "Light: none — this is a printed surface, evenly lit. Depth comes from line weight and hatching, never from shadow.",
    "Colour: cream paper, sepia and iron-gall ink, a single muted terracotta or slate accent for the route itself.",
    "Texture: fibrous paper, ink that pools slightly at the end of a stroke, faint fold lines from being carried in a pocket.",
    "Mood: anticipation and competence. The feeling of a trip that has been thought about properly. This is the default style for itineraries and anything that moves between places.",
  ].join("\n"),
  palette: ["#F4EFE2", "#E3D9C4", "#3E3428", "#8A6A4B", "#B5623C", "#5E6B6B"],
  typeDirection:
    "Small-caps grotesk for labels and stop names, tightly tracked, like map lettering. A monospace for times, distances, and any number. Copy sits in the margin, never over the route.",
  negativePrompt: [
    "no fantasy or treasure-map pastiche",
    "no aged-parchment burnt edges cliché",
    "no pirate motifs, no sea monsters",
    "no 3D render look, no glossy paper",
    "no photographic elements",
    "no watermarks, no gibberish lettering",
  ].join(", "),
  bestFor:
    "Itineraries, schedules, guest guides, anything a person has to READ and act on. Map-and-ledger: it makes a plan look like a plan, and it is why oce_plan_occasion defaults to it.",
  wrongFor:
    "Emotional work. It is a beautiful instrument and a cold one — do not send a wedding invitation in it.",
  appliesTo: { studios: ["celebrate"] },
  seedStrategy: "contract_hash",
};

export const SOLSTICE_BLOOM: HouseStyle = {
  id: "solstice_bloom",
  name: "Solstice Bloom",
  version: "1.0.0",
  promptSystem: [
    "Medium: pressed-flower botanicals and cut-paper collage on warm cream stock, as though from a summer almanac.",
    "Build the image from real pressed petals, translucent leaf skeletons, and torn hand-painted paper. Layer them with faint drop-shadows so each element sits just above the page. Physical, tactile, sun-warmed — never flat vector clip-art.",
    "Composition: an off-centre bloom or spray as the focal element, with a loose asymmetric scatter of smaller botanicals trailing to one edge and generous cream space on the other. Never a symmetrical wreath. Never fill the frame.",
    "Light: high, warm midsummer sun. Long soft shadows, honest falloff, a faint golden cast at the edges. No glow, no rim light.",
    "Colour: cream and soft sage ground, with coral, marigold and a single deep rose doing the singing. Warm and outdoor, never pastel-nursery.",
    "Texture: paper tooth, the fine veining of a real petal, faint watercolour bleed at the edges of the painted shapes.",
    "Mood: generous, sunlit, celebratory without being loud. The image should feel like the first warm evening of the year.",
  ].join("\n"),
  palette: ["#FBF6EC", "#E7EBD3", "#F4A259", "#E76F51", "#C44536", "#6A7B53"],
  typeDirection:
    "A humanist serif with a little warmth for the headline, set large and airy. A clean grotesk for details. Let the botanicals frame the type; never overlap them onto small copy.",
  negativePrompt: [
    "no symmetrical wreaths, no clip-art flowers",
    "no neon, no glow, no gradients",
    "no 3D render, no glossy plastic",
    "no nursery pastels, no baby-shower cuteness",
    "no stock-photo faces",
    "no watermarks, no signatures, no gibberish lettering",
  ].join(", "),
  bestFor:
    "Summer and daytime celebrations — garden parties, warm-season weddings, birthdays that want warmth over formality. A brighter, sunnier alternative to Amethyst Editorial for the celebrate studio.",
  wrongFor:
    "Anything nocturnal or formal (Gilded Noir), or a memory that wants stillness (Sunprint). It runs warm and awake.",
  appliesTo: { studios: ["celebrate", "remember"] },
  seedStrategy: "contract_hash",
};

export const JAZZ_AGE: HouseStyle = {
  id: "jazz_age",
  name: "Jazz Age",
  version: "1.0.0",
  promptSystem: [
    "Medium: art-deco poster art, as though screen-printed for a 1920s theatre bill in gold ink on deep lacquer.",
    "Build the image from hard geometric forms — sunburst fans, stepped ziggurats, chevrons, concentric arcs — in flat metallic gold over emerald and ink. Draughtsman-precise line-work, no painterly softness.",
    "Composition: strong vertical symmetry OR a single bold diagonal, always anchored on a central axis. A commanding focal motif framed by radiating geometry. Deliberate, architectural, theatrical.",
    "Light: not naturalistic — light is implied by the metallic sheen of the gold against the dark ground. Crisp, high-contrast, lacquered.",
    "Colour: deep emerald and near-black ink ground; champagne and antique gold for the geometry. One optional accent of oxblood. Rich and jewel-toned, never garish.",
    "Texture: fine screen-print grain, a faint sheen on the gold, the flat matte of the dark ground. Nothing distressed — this is opulent, not vintage-worn.",
    "Mood: glamorous, formal, electric with the confidence of the 1920s. The image should feel like an invitation you would keep.",
  ].join("\n"),
  palette: ["#0E1F1A", "#123A2E", "#C9A227", "#E8D08B", "#7A1F2B", "#F3EEE0"],
  typeDirection:
    "A geometric deco display face for the headline — high-waisted, all-caps, tightly kerned, ideally with a subtle inline or a hairline gold rule beneath. A clean geometric sans for details. Symmetry is welcome here.",
  negativePrompt: [
    "no distressed or grungy vintage textures",
    "no neon, no modern gradients",
    "no 3D render, no glossy plastic",
    "no painterly softness, no watercolour",
    "no stock-photo faces",
    "no watermarks, no signatures, no gibberish lettering",
  ].join(", "),
  bestFor:
    "Formal and glamorous occasions — galas, milestone anniversaries, black-tie parties, a launch that wants theatrical confidence. Deco geometry where Gilded Noir is more restrained.",
  wrongFor:
    "Tender or quiet moments, and daytime warmth. It is bold and architectural, not intimate.",
  appliesTo: { studios: ["celebrate", "launch"] },
  seedStrategy: "contract_hash",
};

export const PAPER_LANTERN: HouseStyle = {
  id: "paper_lantern",
  name: "Paper Lantern",
  version: "1.0.0",
  promptSystem: [
    "Medium: layered paper-cut art (jianzhi / kirigami feel), as though lit from behind by festival lanterns.",
    "Build the image from stacked cut-paper layers with clean scissored edges, each casting a soft shadow on the one beneath, so depth comes from real overlapping paper. Silhouette-forward.",
    "Composition: a warm central glow — a lantern, a moon, a doorway of light — with cut-paper motifs (blossoms, cranes, foliage, figures) radiating outward in symmetrical or gently mirrored arrangement. Communal, welcoming.",
    "Light: warm lantern-light from within the scene, glowing through the translucent paper layers. Soft haloed edges where the light bleeds through; deep shadow where the paper stacks.",
    "Colour: festival reds and vermilion, warm gold, with pockets of deep indigo night behind the glow. Celebratory and warm, never fluorescent.",
    "Texture: the fibrous edge of torn and cut mulberry paper, a faint grain in the flat colours, the soft gradient of backlight through paper.",
    "Mood: communal, festive, generous — the feeling of a street of lanterns on a warm night. Made to gather people.",
  ].join("\n"),
  palette: ["#2A1213", "#C1272D", "#E8452B", "#F2A63B", "#F6E7C1", "#3B2F6B"],
  typeDirection:
    "A warm humanist serif or a softly brushed display face for the headline; a clean sans for details. Center-weighted layouts suit the symmetry. Keep type clear of the busiest cut-paper areas.",
  negativePrompt: [
    "no photographic realism, no 3D render",
    "no neon or electric glow (the light is warm paper-light)",
    "no gradients that look digital",
    "no clip-art, no flat vector sterility",
    "no stock-photo faces",
    "no watermarks, no signatures, no gibberish lettering",
  ].join(", "),
  bestFor:
    "Communal celebrations — festivals, big family gatherings, reunions, cultural occasions, housewarmings. Warmth and togetherness for the celebrate studio.",
  wrongFor:
    "Corporate launches and formal black-tie work. It is warm and folk-rooted, not sleek.",
  appliesTo: { studios: ["celebrate", "remember"] },
  seedStrategy: "contract_hash",
};

export const PORCELAIN_GARDEN: HouseStyle = {
  id: "porcelain_garden",
  name: "Porcelain Garden",
  version: "1.0.0",
  promptSystem: [
    "Medium: blue-and-white chinaware painting, as though glazed onto fine porcelain — the tradition of delft and qinghua.",
    "Build the image from fine cobalt brushwork on a warm white glaze: florals, vines, birds, and scrolling borders, painted with the controlled bleed of pigment into wet glaze. Hand-painted, never printed-flat.",
    "Composition: a central floral spray or vignette framed by a delicate scrolling border, with calm white space between motifs. Balanced, unhurried, gently symmetrical.",
    "Light: even, diffuse studio light on a glazed surface — a faint sheen across the white, the cobalt reading darker where the brush pooled. No harsh shadow.",
    "Colour: warm porcelain white ground and cobalt blue, in every value from pale wash to deep indigo. Optionally the faintest crackle-glaze warmth. Restrained and cool; blue is the only hue.",
    "Texture: the soft bleed of cobalt into glaze, hairline crackle in the white, the smooth sheen of fired porcelain.",
    "Mood: delicate, heirloom, quietly precious. The image should feel like something kept in a cabinet and handed down.",
  ].join("\n"),
  palette: ["#F7F5EF", "#EDF1F5", "#2B4C8C", "#1B2E5A", "#6E93C4", "#B9C9DE"],
  typeDirection:
    "A fine transitional serif with delicate hairlines for the headline; keep it small and precise, never bold. Let the cobalt borders do the framing. A quiet sans for functional detail.",
  negativePrompt: [
    "no colours other than the blue/white family",
    "no neon, no glow, no gradients that look digital",
    "no 3D render, no glossy plastic",
    "no heavy or grungy textures",
    "no stock-photo faces",
    "no watermarks, no signatures, no gibberish lettering",
  ].join(", "),
  bestFor:
    "Delicate keepsakes and heirloom-feeling memories — a christening, an anniversary of someone gone, a quiet family milestone. An alternative to Sunprint for the remember studio when the feeling is fine rather than nostalgic-warm.",
  wrongFor:
    "Loud celebrations and launches. It is hushed and precious, and it uses only blue.",
  appliesTo: { studios: ["remember", "celebrate"] },
  seedStrategy: "contract_hash",
};

export const NEON_REVERIE: HouseStyle = {
  id: "neon_reverie",
  name: "Neon Reverie",
  version: "1.0.0",
  promptSystem: [
    "Medium: luminous minimalism — a single glowing form in a deep dark field, as though a neon sign photographed in a night studio.",
    "Build the image from one or two clean luminous shapes (a line, an arc, a simple geometric mark) glowing against near-black. Restraint is the whole point: one light source, vast dark space, nothing cluttering it.",
    "Composition: a single off-centre luminous focal element with enormous negative space of deep colour around it. Calm, confident, modern. Never busy, never a collage.",
    "Light: the glow IS the light — soft electric bloom radiating from the luminous form into the dark, a gentle falloff, a faint reflection beneath. This is the one style where glow belongs.",
    "Colour: deep aubergine and midnight-violet ground; electric magenta, violet, and a cool cyan edge for the glow. Saturated but disciplined — two or three luminous hues, no rainbow.",
    "Texture: near-none — a clean matte dark field, a faint grain, the soft bloom of the light. Minimal and premium.",
    "Mood: nocturnal, modern, quietly electric. The image should feel like a product launched at midnight — assured, not loud.",
  ].join("\n"),
  palette: ["#120A1F", "#1E1036", "#C724B1", "#7A2FF2", "#38BDF8", "#F4EBFF"],
  typeDirection:
    "A clean geometric sans, light or medium weight, generously spaced — set small and calm against the dark so the glow carries the drama. Never a script, never a serif. Let the luminous form be the hero.",
  negativePrompt: [
    "no clutter, no collage, no busy backgrounds",
    "no daylight or warm paper tones",
    "no skeuomorphic 3D render, no glossy plastic bevels",
    "no rainbow of neon — keep to two or three hues",
    "no stock-photo faces",
    "no watermarks, no signatures, no gibberish lettering",
  ].join(", "),
  bestFor:
    "Launch-native and nocturnal work — a software or product launch that wants a modern, premium, after-dark feel; the hero image and the mark. Built for the launch studio.",
  wrongFor:
    "Warm, tactile, heirloom occasions. It is cool, dark, and digital by design — the opposite of a pressed flower.",
  appliesTo: { studios: ["launch", "celebrate"] },
  seedStrategy: "contract_hash",
};

export const TERRA_FRESCO: HouseStyle = {
  id: "terra_fresco",
  name: "Terra Fresco",
  version: "1.0.0",
  promptSystem: [
    "Medium: fresco painting on a plaster wall, as though a sun-faded mural in a Mediterranean courtyard.",
    "Build the image from matte pigment worked into rough plaster — earthy, chalky, with the faint texture of the wall showing through. Painterly and warm, with the soft edges of pigment absorbed into damp lime.",
    "Composition: a grounded, calm arrangement — a horizon, an arch, a still-life of the land — with a strong sense of place and generous warm space. Rustic but composed, never cluttered.",
    "Light: high dry Mediterranean sun, warm and even, with the gentle bleaching of a fresco that has faced south for a century. Soft shadows, no gloss.",
    "Colour: terracotta, ochre, warm sand and olive, with a chalky sky-blue accent. Sun-baked, earthy, faded rather than saturated.",
    "Texture: the tooth of plaster, the chalk of dry pigment, hairline age-cracks, a faint uneven wash where the colour soaked in.",
    "Mood: warm, grounded, unhurried — the feeling of a long lunch in the shade. Made for places and journeys.",
  ].join("\n"),
  palette: ["#F0E4D0", "#E4C59E", "#C97B4A", "#A8482B", "#7C8A4E", "#4E7C8A"],
  typeDirection:
    "A warm old-style serif with a hand-cut feel for the headline; a simple humanist sans for details. Let the plaster texture sit behind, and keep type in the calmer areas so the tooth does not fight the letters.",
  negativePrompt: [
    "no neon, no glow, no digital gradients",
    "no 3D render, no glossy plastic",
    "no cold or corporate palettes",
    "no heavy grunge — this is faded, not dirty",
    "no stock-photo faces",
    "no watermarks, no signatures, no gibberish lettering",
  ].join(", "),
  bestFor:
    "Travel keepsakes and rustic, place-rooted occasions — a trip remembered, a countryside wedding, a harvest supper. Warm and grounded for the remember and celebrate studios.",
  wrongFor:
    "Sleek launches and formal black-tie. It is earthy and sun-faded, not sharp.",
  appliesTo: { studios: ["remember", "celebrate"] },
  seedStrategy: "contract_hash",
};

export const HOUSE_STYLES: Readonly<Record<HouseStyleId, HouseStyle>> = Object.freeze({
  amethyst_editorial: AMETHYST_EDITORIAL,
  gilded_noir: GILDED_NOIR,
  sunprint: SUNPRINT,
  atlas_ink: ATLAS_INK,
  solstice_bloom: SOLSTICE_BLOOM,
  jazz_age: JAZZ_AGE,
  paper_lantern: PAPER_LANTERN,
  porcelain_garden: PORCELAIN_GARDEN,
  neon_reverie: NEON_REVERIE,
  terra_fresco: TERRA_FRESCO,
});

export function styleFor(id: HouseStyleId): HouseStyle {
  const style = HOUSE_STYLES[id];
  if (!style) throw new Error(`unknown House Style: ${id}`);
  return style;
}

/** The style a studio reaches for when the client expresses no preference. */
export const STUDIO_DEFAULT_STYLE = {
  celebrate: "amethyst_editorial",
  remember: "sunprint",
  launch: "amethyst_editorial",
} as const satisfies Record<string, HouseStyleId>;

/**
 * Resolve a requested style against the studio it will be used in.
 *
 * A style is only applied where it belongs. If the client asks for atlas_ink on a launch — a
 * map-and-ledger style on a software product — its motifs would try to become the subject, so
 * the studio's default is substituted instead and the substitution is RECORDED, not silent.
 * The buyer asked for a feeling, not for a compass where their wordmark should be.
 */
export function resolveStyleForStudio(
  requestedId: HouseStyleId | undefined,
  studio: "celebrate" | "remember" | "launch",
): { style: HouseStyle; substituted?: { from: HouseStyleId; reason: string } } {
  const fallbackId = STUDIO_DEFAULT_STYLE[studio];
  const requested = requestedId ? HOUSE_STYLES[requestedId] : undefined;

  if (!requested) return { style: HOUSE_STYLES[fallbackId] };
  if (requested.appliesTo.studios.includes(studio)) return { style: requested };

  return {
    style: HOUSE_STYLES[fallbackId],
    substituted: {
      from: requestedId!,
      reason:
        `${requested.name} is not applied to ${studio} work — it suits ${requested.appliesTo.studios.join("/")} — ` +
        `so ${HOUSE_STYLES[fallbackId].name} was used instead. On a ${studio}, ${requested.name}'s motifs would compete with the subject rather than dress it.`,
    },
  };
}

/** Render a style into the system prompt an image model actually receives. */
export function styleSystemPrompt(style: HouseStyle): string {
  return [
    `HOUSE STYLE: ${style.name} (v${style.version})`,
    "",
    style.promptSystem,
    "",
    `PALETTE (stay inside it): ${style.palette.join(", ")}`,
    `TYPOGRAPHY: ${style.typeDirection}`,
    `NEVER: ${style.negativePrompt}`,
  ].join("\n");
}
