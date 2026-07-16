import type { Metadata } from "next";
import { DocTitle, PrevNext, Section } from "@/components/docs/doc";

export const metadata: Metadata = { title: "For judges" };
const claims = [
  ["ASP is publicly reachable", "curl -fsS https://api.occestra.xyz/health", "https://api.occestra.xyz/health"],
  ["Machine manifest lists current tools, prices, jobs, styles and chain", "curl -fsS https://api.occestra.xyz/.well-known/occestra.json | jq", "https://api.occestra.xyz/.well-known/occestra.json"],
  ["Published rubric equals shipped code", "npm test --workspace @occestra/tribunal", "https://occestra.xyz/standard"],
  ["Live product counters are not inflated", "curl -fsS https://api.occestra.xyz/stats | jq", "https://occestra.xyz/stats"],
  ["A production seal verifies independently", "node examples/verify-seal.mjs", "https://occestra.xyz/docs/provenance"],
  ["Contract exists on X Layer mainnet", "cast call 0x1653509df702b45d67b3eb12ca37de9f5fc21f08 'sealer()(address)' --rpc-url https://rpc.xlayer.tech", "https://www.oklink.com/x-layer/address/0x1653509df702b45d67b3eb12ca37de9f5fc21f08"],
  ["Async jobs survive restart and retries do not double-charge", "npm test --workspace @occestra/mcp-server -- jobs.test.ts", "https://occestra.xyz/docs/jobs"],
  ["Both visual themes and mobile routes are audited", "AUDIT_BASE=https://occestra.xyz node apps/web/scripts/audit.mjs", "https://occestra.xyz/styleguide"],
  ["The V2-6 checkpoint passes 418 automated tests", "npm test", "https://github.com/talk2francis/Occestra"],
] as const;
export default function JudgesDocs() { return <><DocTitle kicker="For judges" lede="Every material claim below has a command or live URL beside it. The product asks to be inspected, not trusted.">A verification map, not a pitch deck.</DocTitle><Section id="claims" title="Claims → proof"><div className="overflow-x-auto rounded-xl border border-ink/10"><table className="w-full min-w-[44rem] text-left text-[0.8rem]"><thead><tr className="border-b border-ink/10 bg-panel/60"><th className="p-3">claim</th><th className="p-3">exact proof</th><th className="p-3">live</th></tr></thead><tbody>{claims.map(([claim,command,url])=><tr key={claim} className="border-b border-ink/8 align-top last:border-0"><td className="p-3 font-medium">{claim}</td><td className="p-3 font-mono text-[0.72rem] text-ink/65">{command}</td><td className="p-3"><a className="text-amethyst underline" href={url}>open</a></td></tr>)}</tbody></table></div></Section><PrevNext slug="judges" /></>; }
