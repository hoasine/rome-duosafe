import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { syntheticAddress } from "@rome-protocol/sdk";
import { Keypair } from "@solana/web3.js";
import { bytesToHex, getAddress, parseEther } from "viem";
import { formatUsdc, parseUsdc, resolveRecipient, textError } from "../lib/money";
import {
  MAX_OWNERS,
  isOwnerOf,
  parseOwners,
  proposalStatus,
  solanaAddressFromPubkey,
  validateSafeName,
} from "../lib/safes";
import type { Proposal, Safe } from "../lib/types";

const evmA = "0x7fe694a5f7ef358db37525802e63751432e0d5af";
const evmB = "0x3Fa6E34B41DC1Ce583F64F7B495AD35DdE76E813";

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 1n,
    safeId: 1n,
    proposer: getAddress(evmA),
    to: getAddress(evmB),
    amount: 1n,
    memo: "",
    createdAt: 0,
    expiresAt: 100,
    approvals: 1,
    rawStatus: 0,
    ...overrides,
  };
}

describe("owner parsing", () => {
  it("splits EVM and Solana owners and stores Solana keys as bytes32", () => {
    const keypair = Keypair.generate();
    const parsed = parseOwners([evmA, "", ` ${keypair.publicKey.toBase58()} `]);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.evmOwners, [getAddress(evmA)]);
    assert.deepEqual(parsed.solanaPubkeys, [bytesToHex(keypair.publicKey.toBytes())]);
    assert.equal(solanaAddressFromPubkey(parsed.solanaPubkeys[0]), keypair.publicKey.toBase58());
  });

  it("rejects empty lists, bad addresses, duplicates and too many owners", () => {
    const keypair = Keypair.generate();
    assert.deepEqual(parseOwners(["", "  "]), { ok: false, error: "Add at least one owner." });
    assert.match((parseOwners(["nope"]) as { error: string }).error, /not an EVM or Solana address/);
    assert.match((parseOwners([evmA, evmA.toUpperCase().replace("0X", "0x")]) as { error: string }).error, /twice/);
    const synthetic = getAddress(syntheticAddress(keypair.publicKey));
    assert.match((parseOwners([keypair.publicKey.toBase58(), synthetic]) as { error: string }).error, /twice/);
    const many = Array.from({ length: MAX_OWNERS + 1 }, () => Keypair.generate().publicKey.toBase58());
    assert.match((parseOwners(many) as { error: string }).error, /at most 10/);
  });

  it("validates safe names in UTF-8 bytes", () => {
    assert.equal(validateSafeName("Team treasury"), null);
    assert.match(validateSafeName("   ") ?? "", /name/);
    assert.match(validateSafeName("Đ".repeat(33)) ?? "", /64 bytes/);
  });
});

describe("proposal status", () => {
  const safe = { threshold: 2 };

  it("needs approvals until the threshold, then is ready", () => {
    assert.equal(proposalStatus(proposal({ approvals: 1 }), safe, 10), "pending");
    assert.equal(proposalStatus(proposal({ approvals: 2 }), safe, 10), "ready");
  });

  it("reports executed, cancelled and expired", () => {
    assert.equal(proposalStatus(proposal({ rawStatus: 1, approvals: 2 }), safe, 500), "executed");
    assert.equal(proposalStatus(proposal({ rawStatus: 2 }), safe, 10), "cancelled");
    assert.equal(proposalStatus(proposal({ approvals: 2 }), safe, 100), "expired");
  });

  it("matches owners regardless of address casing", () => {
    const owned: Safe = {
      id: 1n,
      name: "t",
      threshold: 1,
      createdAt: 0,
      balance: 0n,
      owners: [{ address: getAddress(evmA), solana: false }],
      proposalCount: 0,
    };
    assert.equal(isOwnerOf(owned, evmA), true);
    assert.equal(isOwnerOf(owned, getAddress(evmB)), false);
    assert.equal(isOwnerOf(owned, null), false);
  });
});

describe("money helpers", () => {
  it("resolves Solana wallets to the SDK synthetic address", () => {
    const keypair = Keypair.generate();
    const result = resolveRecipient(keypair.publicKey.toBase58());
    assert.equal(result?.address, getAddress(syntheticAddress(keypair.publicKey)));
    assert.equal(resolveRecipient("0x1234"), null);
  });

  it("parses and formats USDC amounts", () => {
    assert.equal(parseUsdc("0.000001"), 10n ** 12n);
    assert.equal(parseUsdc("0.0000001"), null);
    assert.equal(parseUsdc("0"), null);
    assert.equal(formatUsdc(parseEther("1234.5678")), "1,234.56");
    assert.match(textError("Đ".repeat(71), "Memo") ?? "", /140 bytes/);
  });
});
