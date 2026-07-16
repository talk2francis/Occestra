import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";
import { DocTitle, PrevNext } from "@/components/docs/doc";

export const metadata: Metadata = { title: "Changelog" };
export const dynamic = "force-static";
const source = readFileSync(join(process.cwd(), "..", "..", "CHANGELOG.md"), "utf8");
const html = marked.parse(source, { gfm: true }) as string;
export default function ChangelogDocs() { return <><DocTitle kicker="Changelog" lede="Rendered at build time from the repository root. The deployed history and the committed history cannot quietly drift.">What changed, and why.</DocTitle><article className="docs-markdown" dangerouslySetInnerHTML={{__html:html}} /><PrevNext slug="changelog" /></>; }
