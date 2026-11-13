import { createPublicClient, encodeFunctionData, http, type Address, type Hex } from "viem";
import { duoSafeAbi } from "./abi";
import { DUOSAFE_ADDRESS, hadrian } from "./config";
import { solanaAddressFromPubkey } from "./safes";
import type { Proposal, Safe } from "./types";

export const publicClient = createPublicClient({
  chain: hadrian,
  transport: http(),
});

export const PAGE_SIZE = 25;
const ZERO_KEY = `0x${"0".repeat(64)}`;

function requireContract() {
  if (!DUOSAFE_ADDRESS) {
    throw new Error("DuoSafe is running in preview mode. Configure NEXT_PUBLIC_DUOSAFE_ADDRESS.");
  }
  return DUOSAFE_ADDRESS;
}

type RawSafe = {
  id: bigint;
  name: string;
  threshold: number;
  createdAt: bigint;
  balance: bigint;
  owners: readonly Address[];
  solanaOwners: readonly boolean[];
  solanaPubkeys: readonly Hex[];
  proposalCount: bigint;
};

type RawProposal = {
  id: bigint;
  safeId: bigint;
  proposer: Address;
  to: Address;
  amount: bigint;
  memo: string;
  createdAt: bigint;
  expiresAt: bigint;
  approvals: number;
  status: number;
};

export function toSafe(raw: RawSafe): Safe {
  return {
    id: raw.id,
    name: raw.name,
    threshold: Number(raw.threshold),
    createdAt: Number(raw.createdAt),
    balance: raw.balance,
    owners: raw.owners.map((address, index) => {
      const solana = raw.solanaOwners[index] ?? false;
      const pubkey = raw.solanaPubkeys[index];
      return solana && pubkey && pubkey !== ZERO_KEY
        ? { address, solana, solanaPubkey: pubkey, solanaAddress: solanaAddressFromPubkey(pubkey) }
        : { address, solana: false };
    }),
    proposalCount: Number(raw.proposalCount),
  };
}

export function toProposal(raw: RawProposal): Proposal {
  return {
    id: raw.id,
    safeId: raw.safeId,
    proposer: raw.proposer,
    to: raw.to,
    amount: raw.amount,
    memo: raw.memo,
    createdAt: Number(raw.createdAt),
    expiresAt: Number(raw.expiresAt),
    approvals: Number(raw.approvals),
    rawStatus: Number(raw.status),
  };
}

export async function loadSafe(id: bigint): Promise<Safe> {
  const raw = await publicClient.readContract({
    address: requireContract(),
    abi: duoSafeAbi,
    functionName: "getSafe",
    args: [id],
  });
  return toSafe(raw);
}

export async function loadSafesOf(owner: Address): Promise<Safe[]> {
  const raw = await publicClient.readContract({
    address: requireContract(),
    abi: duoSafeAbi,
    functionName: "safesOf",
    args: [owner, 0n, BigInt(PAGE_SIZE)],
  });
  return raw.map(toSafe);
}

export async function loadProposals(safeId: bigint): Promise<Proposal[]> {
  const raw = await publicClient.readContract({
    address: requireContract(),
    abi: duoSafeAbi,
    functionName: "proposalsOf",
    args: [safeId, 0n, BigInt(PAGE_SIZE)],
  });
  return raw.map(toProposal);
}

export async function loadProposal(id: bigint): Promise<Proposal> {
  const raw = await publicClient.readContract({
    address: requireContract(),
    abi: duoSafeAbi,
    functionName: "getProposal",
    args: [id],
  });
  return toProposal(raw);
}

export async function loadApprovals(proposalIds: bigint[], owner: Address) {
  const address = requireContract();
  const entries = await Promise.all(
    proposalIds.map(
      async (id) =>
        [id.toString(), await publicClient.readContract({ address, abi: duoSafeAbi, functionName: "hasApproved", args: [id, owner] })] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<string, boolean>;
}

export async function loadStats() {
  const address = requireContract();
  const [safes, proposals, held] = await Promise.all([
    publicClient.readContract({ address, abi: duoSafeAbi, functionName: "safeCount" }),
    publicClient.readContract({ address, abi: duoSafeAbi, functionName: "proposalCount" }),
    publicClient.readContract({ address, abi: duoSafeAbi, functionName: "totalHeld" }),
  ]);
  return { safes: Number(safes), proposals: Number(proposals), held };
}

/** Finds the newest safe created with this name that lists `owner`, right after createSafe. */
export async function findNewSafe(owner: Address, name: string) {
  const safes = await loadSafesOf(owner);
  return safes.find((safe) => safe.name === name) ?? null;
}

export function encodeCreateSafe(name: string, evmOwners: Address[], solanaPubkeys: Hex[], threshold: number): Hex {
  return encodeFunctionData({
    abi: duoSafeAbi,
    functionName: "createSafe",
    args: [name, evmOwners, solanaPubkeys, threshold],
  });
}

export function encodeDeposit(safeId: bigint): Hex {
  return encodeFunctionData({ abi: duoSafeAbi, functionName: "deposit", args: [safeId] });
}

export function encodePropose(safeId: bigint, to: Address, amount: bigint, memo: string): Hex {
  return encodeFunctionData({ abi: duoSafeAbi, functionName: "propose", args: [safeId, to, amount, memo] });
}

export function encodeProposalAction(
  action: "approve" | "revokeApproval" | "cancel" | "execute",
  proposalId: bigint,
): Hex {
  return encodeFunctionData({ abi: duoSafeAbi, functionName: action, args: [proposalId] });
}
