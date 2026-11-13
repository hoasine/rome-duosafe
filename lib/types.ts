import type { Address, Hex } from "viem";

export interface SafeOwner {
  address: Address;
  solana: boolean;
  /** Base58 Solana wallet address for proven Solana owners. */
  solanaAddress?: string;
  solanaPubkey?: Hex;
}

export interface Safe {
  id: bigint;
  name: string;
  threshold: number;
  createdAt: number;
  balance: bigint;
  owners: SafeOwner[];
  proposalCount: number;
}

export type ProposalStatus = "pending" | "ready" | "executed" | "cancelled" | "expired";

export interface Proposal {
  id: bigint;
  safeId: bigint;
  proposer: Address;
  to: Address;
  amount: bigint;
  memo: string;
  createdAt: number;
  expiresAt: number;
  approvals: number;
  /** 0 pending, 1 executed, 2 cancelled, as stored on-chain. */
  rawStatus: number;
}

export type TransactionState =
  | { status: "idle" }
  | { status: "preparing"; message: string }
  | { status: "signing"; message: string }
  | { status: "confirming"; message: string; hash?: `0x${string}` }
  | { status: "success"; message: string; hash?: `0x${string}` }
  | { status: "error"; message: string };
