import type { Metadata } from "next";
import { Callout, DocTitle, InlineCode, PrevNext, Section } from "@/components/docs/doc";

export const metadata: Metadata = { title: "Privacy & security" };
export default function PrivacyDocs() { return <>
  <DocTitle kicker="Privacy & security" lede="Remember is private by construction, and the site reader treats the public internet as hostile input.">Proof without publication.</DocTitle>
  <Section id="keepsakes" title="Private keepsakes"><p>Every Remember pack is private. Its chain commitment is <InlineCode>keccak256(salt || canonicalManifest)</InlineCode> with a fresh 32-byte salt. The owner receives the salt and owner token; neither appears on the public page or chain. Strangers can verify seal status without learning the manifest.</p></Section>
  <Section id="uploads" title="Uploads and deletion"><p>Images are size-capped, decoded with pixel limits, re-encoded through Sharp, and written without EXIF or GPS. Signed links expire. <InlineCode>DELETE /projects/:id</InlineCode> requires the owner token and removes the pack, artifacts, and linked uploads. Abandoned private uploads are purged by retention policy.</p></Section>
  <Section id="reader" title="The site reader"><p>URLs are resolved before access. Private, loopback, link-local, metadata, benchmarking, and file ranges are blocked; redirects are checked again. Crawled text is wrapped as untrusted data and may never become model instructions.</p><Callout tone="good">Security-sensitive access, deletion, and seal events are audit logged without private content. The repository tests SSRF redirects, image bombs, prompt injection, ownership, deletion, and salted commitments offline.</Callout></Section>
  <PrevNext slug="privacy" />
  </>; }
