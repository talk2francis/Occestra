/**
 * Deploy KeepsakeRegistry to X Layer.
 *
 *   PRIVATE_KEY=0x... node script/deploy.mjs testnet
 *   PRIVATE_KEY=0x... SEALER=0x... node script/deploy.mjs mainnet
 *
 * SEALER defaults to the deployer. RPC_URL overrides the default endpoint.
 * Prints the address, the explorer link, and the OCE_REGISTRY line to paste into .env.
 */
import { createPublicClient, createWalletClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { X_LAYER_MAINNET, X_LAYER_TESTNET } from "@occestra/receipts";
import { compile } from "./compile.mjs";

const NETWORKS = {
  testnet: X_LAYER_TESTNET,
  mainnet: X_LAYER_MAINNET,
};

const network = process.argv[2];
const chain = NETWORKS[network];

if (!chain) {
  console.error("usage: node script/deploy.mjs <testnet|mainnet>");
  process.exit(1);
}

const privateKey = process.env.PRIVATE_KEY ?? process.env.OCE_SEALER_KEY;
if (!privateKey) {
  console.error("PRIVATE_KEY (or OCE_SEALER_KEY) is required");
  process.exit(1);
}

const account = privateKeyToAccount(privateKey);
const sealer = process.env.SEALER ?? account.address;
const transport = http(process.env.RPC_URL ?? chain.rpcUrls.default.http[0]);

const publicClient = createPublicClient({ chain, transport });
const walletClient = createWalletClient({ account, chain, transport });

console.log(`network:  ${chain.name} (chainId ${chain.id})`);
console.log(`deployer: ${account.address}`);
console.log(`sealer:   ${sealer}`);

const balance = await publicClient.getBalance({ address: account.address });
console.log(`balance:  ${formatEther(balance)} OKB`);
if (balance === 0n) {
  console.error("deployer has no OKB — fund it before deploying");
  process.exit(1);
}

const artifact = await compile();
console.log(`compiled: ${artifact.solcVersion}`);

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [sealer],
});
console.log(`tx:       ${hash}`);
console.log("waiting for confirmation...");

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress) {
  console.error(`deployment failed: status ${receipt.status}`);
  process.exit(1);
}

const address = receipt.contractAddress;
const explorer = chain.blockExplorers.default.url;

// Read it back — a deploy that cannot be read is not a deploy.
const onChainSealer = await publicClient.readContract({
  address,
  abi: artifact.abi,
  functionName: "sealer",
});

console.log("");
console.log(`deployed: ${address}`);
console.log(`explorer: ${explorer}/address/${address}`);
console.log(`gas used: ${receipt.gasUsed}`);
console.log(`sealer confirmed on chain: ${onChainSealer}`);
console.log("");
console.log("Add to .env:");
console.log(`OCE_REGISTRY=${address}`);
console.log(`OCE_CHAIN_ID=${chain.id}`);
