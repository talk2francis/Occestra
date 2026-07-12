/**
 * Compile KeepsakeRegistry.sol with the solc JS binding. No Hardhat, no Foundry — the
 * contract is small enough that a 40-line compile script is the honest amount of machinery.
 * Output lands in artifacts/KeepsakeRegistry.json (gitignored) and feeds both the deploy
 * script and the in-process EVM test.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const SOURCE = "KeepsakeRegistry.sol";
const CONTRACT = "KeepsakeRegistry";

export async function compile() {
  const source = await readFile(join(root, "src", SOURCE), "utf8");

  const input = {
    language: "Solidity",
    sources: { [SOURCE]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 10_000 },
      evmVersion: "paris",
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "metadata"] },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length > 0) {
    for (const error of errors) console.error(error.formattedMessage);
    throw new Error(`solc failed with ${errors.length} error(s)`);
  }
  for (const warning of output.errors ?? []) {
    console.warn(`solc: ${warning.formattedMessage.trim()}`);
  }

  const compiled = output.contracts?.[SOURCE]?.[CONTRACT];
  if (!compiled) throw new Error(`solc produced no output for ${CONTRACT}`);

  const artifact = {
    contractName: CONTRACT,
    solcVersion: solc.version(),
    settings: { optimizer: input.settings.optimizer, evmVersion: input.settings.evmVersion },
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}`,
    deployedBytecode: `0x${compiled.evm.deployedBytecode.object}`,
    compiledAt: new Date().toISOString(),
  };

  const outDir = join(root, "artifacts");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, `${CONTRACT}.json`), `${JSON.stringify(artifact, null, 2)}\n`);

  return artifact;
}

export async function loadArtifact() {
  const path = join(root, "artifacts", `${CONTRACT}.json`);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return compile();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const artifact = await compile();
  const size = (artifact.deployedBytecode.length - 2) / 2;
  console.log(`compiled ${CONTRACT} with ${artifact.solcVersion}`);
  console.log(`  deployed size: ${size} bytes (limit 24576)`);
  console.log(`  artifacts/${CONTRACT}.json`);
}
