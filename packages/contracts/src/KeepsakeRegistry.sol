// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// KeepsakeRegistry
//
// The on-chain half of Occestra's provenance. It stores exactly one thing per keepsake: a
// 32-byte leaf, and the block timestamp at which it was anchored. No content, no personal
// data, no media, no names ever touch this contract - only the hash of a manifest that the
// holder of the pack can recompute for themselves. That is a deliberate, permanent design
// constraint, not an optimisation.
//
// The leaf is computed off chain, identically, in TypeScript (see packages/receipts):
//
//   leaf = keccak256(
//       abi.encode(
//           keccak256(bytes(keepsakeId)),  // bytes32
//           manifestHash,                  // bytes32
//           packKind,                      // uint8   celebrate=0 remember=1 launch=2 tool=3
//           createdAt                      // uint64  unix seconds
//       )
//   )
//
// Anyone holding the pack can recompute that leaf and call anchoredAt() to see, without
// trusting Occestra's servers at all, whether and when it was sealed.
//
// The sealer is a single hot key that the Occestra anchor worker holds. Handover is
// two-step on purpose: a fat-fingered address in a one-step transfer would brick the
// registry permanently, and there is no admin to recover it.
contract KeepsakeRegistry {
    // The only address permitted to anchor leaves.
    address public sealer;

    // Nominated successor. Must call acceptSealerHandover() itself to take the role.
    address public pendingSealer;

    // leaf => block timestamp at which it was anchored. 0 means never sealed.
    mapping(bytes32 => uint64) private _anchoredAt;

    event Sealed(bytes32 indexed leaf, uint64 at);
    event SealerHandoverStarted(address indexed from, address indexed to);
    event SealerHandoverCompleted(address indexed from, address indexed to);

    error NotSealer();
    error NotPendingSealer();
    error ZeroLeaf();
    error AlreadySealed();
    error ZeroAddress();

    modifier onlySealer() {
        if (msg.sender != sealer) revert NotSealer();
        _;
    }

    constructor(address initialSealer) {
        if (initialSealer == address(0)) revert ZeroAddress();
        sealer = initialSealer;
    }

    // Anchor a single leaf. Idempotence is deliberately NOT allowed: a second seal of the
    // same leaf reverts, so the anchored timestamp can never be quietly rewritten.
    function seal(bytes32 leaf) external onlySealer {
        _seal(leaf);
    }

    // Anchor many leaves in one transaction. Same rules per leaf - if any one of them is
    // zero or already sealed, the whole batch reverts, so a batch is all-or-nothing.
    function sealBatch(bytes32[] calldata leaves) external onlySealer {
        uint256 length = leaves.length;
        for (uint256 i = 0; i < length; ++i) {
            _seal(leaves[i]);
        }
    }

    function _seal(bytes32 leaf) private {
        if (leaf == bytes32(0)) revert ZeroLeaf();
        if (_anchoredAt[leaf] != 0) revert AlreadySealed();

        uint64 sealedAt = uint64(block.timestamp);
        _anchoredAt[leaf] = sealedAt;

        emit Sealed(leaf, sealedAt);
    }

    // Returns the unix second at which the leaf was anchored, or 0 if it never was.
    function anchoredAt(bytes32 leaf) external view returns (uint64) {
        return _anchoredAt[leaf];
    }

    function isSealed(bytes32 leaf) external view returns (bool) {
        return _anchoredAt[leaf] != 0;
    }

    // Step one of handover: the current sealer nominates a successor. Nothing changes yet,
    // and the nomination can be overwritten or cancelled (by nominating address(0) is NOT
    // allowed - use a re-nomination) until it is accepted.
    function startSealerHandover(address next) external onlySealer {
        if (next == address(0)) revert ZeroAddress();
        pendingSealer = next;
        emit SealerHandoverStarted(sealer, next);
    }

    // Step two: the nominated successor claims the role. Only they can do this, which is
    // what proves the new key actually exists and can sign.
    function acceptSealerHandover() external {
        if (msg.sender != pendingSealer) revert NotPendingSealer();

        address previous = sealer;
        sealer = pendingSealer;
        pendingSealer = address(0);

        emit SealerHandoverCompleted(previous, sealer);
    }
}
