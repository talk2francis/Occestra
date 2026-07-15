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

export const HOUSE_STYLES: Readonly<Record<HouseStyleId, HouseStyle>> = Object.freeze({
  amethyst_editorial: AMETHYST_EDITORIAL,
  gilded_noir: GILDED_NOIR,
  sunprint: SUNPRINT,
  atlas_ink: ATLAS_INK,
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
