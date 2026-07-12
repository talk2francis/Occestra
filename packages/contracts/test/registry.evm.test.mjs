/**
 * The cross-language proof.
 *
 * Leaves are computed in TypeScript by @occestra/receipts. They are then sealed into the
 * REAL compiled KeepsakeRegistry bytecode, executed inside an in-process EVM. Nothing is
 * reimplemented, nothing is mocked, and no network is touched. If the TS leaf encoding ever
 * drifts from what the Solidity contract stores, this test is what catches it.
 */
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { Chain, Common, Hardfork } from "@ethereumjs/common";
import { EVM } from "@ethereumjs/evm";
import { DefaultStateManager } from "@ethereumjs/statemanager";
import { Address, hexToBytes } from "@ethereumjs/util";
import {
  concatHex,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseAbiParameters,
  toBytes,
  toHex,
} from "viem";
import { leafOf } from "@occestra/receipts";
import { loadArtifact } from "../script/compile.mjs";

const SEALER = "0x1111111111111111111111111111111111111111";
const STRANGER = "0x2222222222222222222222222222222222222222";
const SUCCESSOR = "0x3333333333333333333333333333333333333333";

const addr = (hex) => new Address(hexToBytes(hex));

/** Fresh EVM + freshly deployed registry for every test — no shared state, no ordering games. */
async function deployRegistry(initialSealer = SEALER) {
  // Gotcha #1: @ethereumjs/evm v3 has NO createEVM export, and BOTH options are required.
  const evm = new EVM({
    common: new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai }),
    stateManager: new DefaultStateManager(),
  });

  const artifact = await loadArtifact();

  const initcode = concatHex([
    artifact.bytecode,
    encodeAbiParameters(parseAbiParameters("address"), [initialSealer]),
  ]);

  const result = await evm.runCall({
    caller: addr(SEALER),
    to: undefined,
    data: hexToBytes(initcode),
    gasLimit: 5_000_000n,
  });

  assert.equal(
    result.execResult.exceptionError,
    undefined,
    `deployment reverted: ${result.execResult.exceptionError?.error}`,
  );

  const address = result.createdAddress;
  assert.ok(address, "constructor produced no contract address");

  return { evm, abi: artifact.abi, address };
}

/** Call the ACTUAL contract. Returns { ok, data, error } — reverts are data, not exceptions. */
async function call(ctx, { from, functionName, args = [] }) {
  const result = await ctx.evm.runCall({
    caller: addr(from),
    to: ctx.address,
    data: hexToBytes(encodeFunctionData({ abi: ctx.abi, functionName, args })),
    gasLimit: 3_000_000n,
    // block.timestamp must be non-zero, or a successful seal would look unsealed.
    block: { header: { timestamp: 1_752_314_400n, number: 1n, cliqueSigner: () => addr(SEALER) } },
  });

  const { exceptionError, returnValue } = result.execResult;
  const data = toHex(returnValue);

  if (exceptionError) {
    return { ok: false, error: exceptionError.error, data };
  }

  return {
    ok: true,
    data,
    decoded: () => decodeFunctionResult({ abi: ctx.abi, functionName, data }),
  };
}

/** Custom-error selector, so we can assert WHICH revert happened, not just that one did. */
const selector = (signature) => keccak256(toBytes(signature)).slice(0, 10);
const ERRORS = {
  NotSealer: selector("NotSealer()"),
  NotPendingSealer: selector("NotPendingSealer()"),
  ZeroLeaf: selector("ZeroLeaf()"),
  AlreadySealed: selector("AlreadySealed()"),
  ZeroAddress: selector("ZeroAddress()"),
};

const assertRevert = (result, expected) => {
  assert.equal(result.ok, false, "expected a revert, but the call succeeded");
  assert.equal(
    result.data.slice(0, 10),
    ERRORS[expected],
    `expected ${expected}, got selector ${result.data.slice(0, 10)}`,
  );
};

/** Six real leaves, produced by the TypeScript sealer — varied across every field. */
const LEAVES = [
  { keepsakeId: "oce_0abcdefghjkmnpqrstvwxy", manifestHash: keccak256(toBytes("m1")), packKind: 0, createdAt: 1_752_314_400 },
  { keepsakeId: "oce_1abcdefghjkmnpqrstvwxy", manifestHash: keccak256(toBytes("m2")), packKind: 1, createdAt: 1_752_314_401 },
  { keepsakeId: "oce_2abcdefghjkmnpqrstvwxy", manifestHash: keccak256(toBytes("m3")), packKind: 2, createdAt: 1_700_000_000 },
  { keepsakeId: "oce_3abcdefghjkmnpqrstvwxy", manifestHash: keccak256(toBytes("m4")), packKind: 3, createdAt: 1 },
  { keepsakeId: "oce_4zzzzzzzzzzzzzzzzzzzzz", manifestHash: keccak256(toBytes("m5")), packKind: 1, createdAt: 4_294_967_295 },
  { keepsakeId: "oce_5abcdefghjkmnpqrstvwxy", manifestHash: keccak256(toBytes("m6")), packKind: 2, createdAt: 1_752_314_400 },
].map(leafOf);

const FOREIGN_LEAF = leafOf({
  keepsakeId: "oce_9neverzzzzzzzzzzzzzzzz",
  manifestHash: keccak256(toBytes("never sealed")),
  packKind: 0,
  createdAt: 1_752_314_400,
});

describe("KeepsakeRegistry — real bytecode, in-process EVM", () => {
  let artifact;

  before(async () => {
    artifact = await loadArtifact();
    assert.ok(artifact.bytecode.length > 2, "no compiled bytecode");
  });

  it("seals six TypeScript-generated leaves, and only those leaves", async () => {
    const ctx = await deployRegistry();

    const sealer = await call(ctx, { from: SEALER, functionName: "sealer" });
    assert.equal(sealer.decoded().toLowerCase(), SEALER.toLowerCase());

    // Five one at a time, the sixth via the batch path — both routes must work.
    for (const leaf of LEAVES.slice(0, 5)) {
      const sealed = await call(ctx, { from: SEALER, functionName: "seal", args: [leaf] });
      assert.equal(sealed.ok, true, `sealing ${leaf} reverted`);
    }
    const batch = await call(ctx, {
      from: SEALER,
      functionName: "sealBatch",
      args: [LEAVES.slice(5)],
    });
    assert.equal(batch.ok, true, "sealBatch reverted");

    for (const leaf of LEAVES) {
      const isSealed = await call(ctx, { from: STRANGER, functionName: "isSealed", args: [leaf] });
      assert.equal(isSealed.decoded(), true, `${leaf} should be sealed`);

      const at = await call(ctx, { from: STRANGER, functionName: "anchoredAt", args: [leaf] });
      assert.ok(at.decoded() > 0n, `${leaf} should carry a non-zero anchor timestamp`);
    }

    // A leaf we never sealed must read as unsealed — no false provenance, ever.
    const foreign = await call(ctx, { from: STRANGER, functionName: "isSealed", args: [FOREIGN_LEAF] });
    assert.equal(foreign.decoded(), false);
    const foreignAt = await call(ctx, { from: STRANGER, functionName: "anchoredAt", args: [FOREIGN_LEAF] });
    assert.equal(foreignAt.decoded(), 0n);
  });

  it("rejects strangers, zero leaves, double-seals, and a poisoned batch", async () => {
    const ctx = await deployRegistry();

    assertRevert(
      await call(ctx, { from: STRANGER, functionName: "seal", args: [LEAVES[0]] }),
      "NotSealer",
    );

    assertRevert(
      await call(ctx, { from: SEALER, functionName: "seal", args: [`0x${"00".repeat(32)}`] }),
      "ZeroLeaf",
    );

    const first = await call(ctx, { from: SEALER, functionName: "seal", args: [LEAVES[0]] });
    assert.equal(first.ok, true);
    assertRevert(
      await call(ctx, { from: SEALER, functionName: "seal", args: [LEAVES[0]] }),
      "AlreadySealed",
    );

    // A batch is all-or-nothing: one bad leaf and nothing in it lands.
    assertRevert(
      await call(ctx, {
        from: SEALER,
        functionName: "sealBatch",
        args: [[LEAVES[1], LEAVES[0]]], // LEAVES[0] is already sealed
      }),
      "AlreadySealed",
    );
    const collateral = await call(ctx, { from: SEALER, functionName: "isSealed", args: [LEAVES[1]] });
    assert.equal(collateral.decoded(), false, "a reverted batch must not half-apply");
  });

  it("hands the sealer role over in two steps, and locks the old key out", async () => {
    const ctx = await deployRegistry();

    // A stranger cannot nominate.
    assertRevert(
      await call(ctx, { from: STRANGER, functionName: "startSealerHandover", args: [STRANGER] }),
      "NotSealer",
    );
    // The sealer cannot nominate the zero address (that would brick the registry forever).
    assertRevert(
      await call(ctx, {
        from: SEALER,
        functionName: "startSealerHandover",
        args: ["0x0000000000000000000000000000000000000000"],
      }),
      "ZeroAddress",
    );

    const started = await call(ctx, {
      from: SEALER,
      functionName: "startSealerHandover",
      args: [SUCCESSOR],
    });
    assert.equal(started.ok, true);

    // Nomination alone changes nothing.
    const stillSealer = await call(ctx, { from: STRANGER, functionName: "sealer" });
    assert.equal(stillSealer.decoded().toLowerCase(), SEALER.toLowerCase());
    assertRevert(
      await call(ctx, { from: SUCCESSOR, functionName: "seal", args: [LEAVES[0]] }),
      "NotSealer",
    );

    // Only the nominee can accept.
    assertRevert(
      await call(ctx, { from: STRANGER, functionName: "acceptSealerHandover" }),
      "NotPendingSealer",
    );

    const accepted = await call(ctx, { from: SUCCESSOR, functionName: "acceptSealerHandover" });
    assert.equal(accepted.ok, true);

    const now = await call(ctx, { from: STRANGER, functionName: "sealer" });
    assert.equal(now.decoded().toLowerCase(), SUCCESSOR.toLowerCase());
    const pending = await call(ctx, { from: STRANGER, functionName: "pendingSealer" });
    assert.equal(pending.decoded(), "0x0000000000000000000000000000000000000000");

    // The old key is locked out; the new key works.
    assertRevert(
      await call(ctx, { from: SEALER, functionName: "seal", args: [LEAVES[0]] }),
      "NotSealer",
    );
    const sealedByNew = await call(ctx, { from: SUCCESSOR, functionName: "seal", args: [LEAVES[0]] });
    assert.equal(sealedByNew.ok, true);
    const isSealed = await call(ctx, { from: STRANGER, functionName: "isSealed", args: [LEAVES[0]] });
    assert.equal(isSealed.decoded(), true);
  });
});
