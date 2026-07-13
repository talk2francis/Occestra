import type { Metadata } from "next";
import { Callout, DocTitle, InlineCode, ParamTable, PrevNext, Section } from "@/components/docs/doc";
import { CodeBlock } from "@/components/docs/code-block";

export const metadata: Metadata = { title: "Payments (x402)" };

export default function Payments() {
  return (
    <>
      <DocTitle
        kicker="Payments"
        lede={
          <>
            Occestra settles per call with x402 v2, scheme <InlineCode>exact</InlineCode>, on
            X&nbsp;Layer mainnet (<InlineCode>eip155:196</InlineCode>). No facilitator, no trusted
            third party, no API key: the buyer signs an EIP-3009 transfer authorization, and
            Occestra submits it on-chain itself. This page documents the flow{" "}
            <strong>exactly as the gate implements it</strong> — the shapes below are the shapes on
            the wire.
          </>
        }
      >
        Pay per call. Keep the receipt.
      </DocTitle>

      <Section id="flow" title="The whole flow in four steps">
        <ParamTable
          rows={[
            { name: "1 · call", type: "POST /mcp", desc: "Call a paid tool with no payment attached." },
            { name: "2 · 402", type: "challenge", desc: "HTTP 402. The challenge is the JSON body AND base64 in the PAYMENT-REQUIRED response header." },
            { name: "3 · retry", type: "PAYMENT-SIGNATURE", desc: "Sign an EIP-3009 transferWithAuthorization for the exact amount, replay the same request with the proof header." },
            { name: "4 · receipt", type: "PAYMENT-RESPONSE", desc: "Occestra verifies the signature itself, claims the nonce, settles on-chain, runs the tool, and returns the result with a settlement receipt header." },
          ]}
        />
      </Section>

      <Section id="challenge" title="Step 2 — the 402 challenge">
        <CodeBlock title="HTTP 402 body (and base64 of it in the PAYMENT-REQUIRED header)" lang="json">{`{
  "x402Version": 2,
  "resource": {
    "url": "https://api.occestra.xyz/mcp",
    "description": "oce_critique",
    "mimeType": "application/json"
  },
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:196",
    "asset": "0x779ded0c9e1022225f8e0630b35a9b54be713736",
    "amount": "10000",
    "payTo": "0x0d63f9EeB86813230B72017444cea16Cd4A453F2",
    "maxTimeoutSeconds": 300,
    "extra": { "name": "USD₮0", "version": "1" }
  }]
}`}</CodeBlock>
        <ParamTable
          rows={[
            { name: "asset", type: "address", desc: "USD₮0 on X Layer — 6 decimals. Its EIP-712 domain (name/version in `extra`) is verified against the token's on-chain DOMAIN_SEPARATOR." },
            { name: "amount", type: "string, atomic", desc: "Price in atomic units: 0.01 USDT → \"10000\"." },
            { name: "payTo", type: "address", desc: "Occestra's treasury. Your authorization must name exactly this payee." },
            { name: "maxTimeoutSeconds", type: "number", desc: "Your validBefore must fall inside this window." },
          ]}
        />
      </Section>

      <Section id="sign" title="Step 3 — sign and retry">
        <p>
          Sign the token&apos;s <InlineCode>TransferWithAuthorization</InlineCode> type (EIP-3009),
          base64 the proof, retry with the <InlineCode>PAYMENT-SIGNATURE</InlineCode> header:
        </p>
        <CodeBlock title="pay.mjs — the ~30 lines that answer any Occestra 402" lang="js">{`import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.AGENT_KEY);
const challenge = /* the 402 body's accepts[0] */;

const authorization = {
  from: account.address,
  to: challenge.payTo,
  value: BigInt(challenge.amount),
  validAfter: 0n,
  validBefore: BigInt(Math.floor(Date.now() / 1000) + challenge.maxTimeoutSeconds),
  nonce: \`0x\${crypto.getRandomValues(new Uint8Array(32)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "")}\`,
};

const signature = await account.signTypedData({
  domain: {
    name: challenge.extra.name,        // "USD₮0"
    version: challenge.extra.version,  // "1"
    chainId: 196,
    verifyingContract: challenge.asset,
  },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" },
      { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: authorization,
});

const proof = Buffer.from(JSON.stringify({
  x402Version: 2, scheme: "exact", network: "eip155:196",
  payload: { signature, authorization: {
    ...authorization,
    value: authorization.value.toString(),
    validAfter: authorization.validAfter.toString(),
    validBefore: authorization.validBefore.toString(),
  }},
})).toString("base64");

// replay the identical tools/call request, plus:
//   PAYMENT-SIGNATURE: <proof>`}</CodeBlock>
        <Callout>
          Legacy v1 buyers sending the proof as <InlineCode>X-PAYMENT</InlineCode> are accepted
          too — the gate reads both headers.
        </Callout>
      </Section>

      <Section id="settlement" title="Step 4 — what the gate does with your proof">
        <p>In order, before any model is touched:</p>
        <ul className="!mt-2 list-none space-y-2">
          <li><strong>1. Verifies the EIP-712 signature itself</strong> against the token&apos;s real domain — not against what the proof claims.</li>
          <li><strong>2. Checks payee, amount, and time window</strong> — the authorization must name Occestra&apos;s treasury for the exact price, valid now.</li>
          <li><strong>3. Claims the nonce</strong> — single-use, persisted; two concurrent requests can never both spend it.</li>
          <li><strong>4. Settles</strong> — submits <InlineCode>transferWithAuthorization</InlineCode> on X Layer with its own gas key and waits for inclusion.</li>
          <li><strong>5. Runs the tool</strong> and returns the result with the receipt header:</li>
        </ul>
        <CodeBlock title="PAYMENT-RESPONSE header (base64-decoded)" lang="json">{`{
  "status": "settled",
  "transaction": "0x5266b761d94c8e7c83a6f711784b07d79d107111ee00c01f0133fb5d4b7ac5a4",
  "amount": "0.05",
  "payer": "0x…"
}`}</CodeBlock>
        <Callout tone="good">
          <strong>If settlement reverts, your nonce is released.</strong> The nonce is claimed
          before settling (double-spend safety), but if no money moved — insufficient balance, a
          bad RPC minute — your signed authorization is still perfectly good, and burning it would
          force you to re-sign for a payment we merely failed to collect. Retry with the same
          proof.
        </Callout>
        <p>
          That transaction hash above is a <strong>real production settlement</strong> — the first
          paid call Occestra ever served. Look it up on the explorer.
        </p>
      </Section>

      <Section id="errors" title="Failure modes, honestly">
        <ParamTable
          rows={[
            { name: "402", type: "no/invalid proof", desc: "The challenge. Sign and retry." },
            { name: "400", type: "bad authorization", desc: "Wrong payee, wrong amount, expired window, malformed payload — the body says which." },
            { name: "409", type: "nonce spent", desc: "That authorization was already used. Sign a fresh one." },
            { name: "502", type: "settlement failed", desc: "No money moved; nonce released; retry safe." },
            { name: "PolicyRefusal", type: "before payment", desc: "Blocked briefs are screened BEFORE the paywall — a refused brief is never charged." },
          ]}
        />
      </Section>

      <PrevNext slug="payments" />
    </>
  );
}
