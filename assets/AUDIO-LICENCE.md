# Studio ambience — provenance and licence

The site's optional ambience track. It is opt-in, default OFF, and never fetched unless a
visitor turns it on.

## Files

| Path | Role | Detail |
| --- | --- | --- |
| `assets/Occestra Audio.MP3` | master, as supplied | 192 kbps stereo, 44.1 kHz, 11:48, 17.0 MB |
| `apps/web/public/audio/ambience.mp3` | derived, what the site serves | 96 kbps stereo, 44.1 kHz, 11:48, 8.5 MB |

The derived file is regenerated with `node scripts/audio-assets.mjs` — never hand-edited. It is
half the size at a bitrate that is transparent for a room tone played at 18% volume, and it
carries a 1.5s fade in and a 3s fade out so the loop seam is a breath rather than a cut.

## Licence

Supplied by the project owner (2026-07-31), who states:

- it was downloaded from a site that publishes its MP3s as free to download and use;
- they ran it through a copyright review themselves before supplying it, and it passed —
  it is not patented, licensed to, or owned by any party requiring attribution or payment.

**Owner action, one line:** add the source URL and the site's licence wording below, so the
claim above is checkable by anyone reviewing this repository rather than resting on memory.

- Source URL: _(to be filled in by the owner)_
- Licence as published by that source: _(to be filled in by the owner)_

Nothing in the build depends on this file; it exists so the provenance travels with the asset.
