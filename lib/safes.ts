import { PublicKey } from "@solana/web3.js";
import { bytesToHex, hexToBytes, type Address, type Hex } from "viem";
import { resolveRecipient } from "./money";
import type { Proposal, ProposalStatus, Safe } from "./types";

export const MAX_OWNERS = 10;
export const MAX_NAME_BYTES = 64;
/** Safes seeded by scripts/seed-demo.ts carry this prefix so the UI can label them. */
export const DEMO_SAFE_PREFIX = "Demo · ";

export function isDemoSafe(name: string) {
  return name.startsWith(DEMO_SAFE_PREFIX);
}

export function solanaAddressFromPubkey(pubkey: Hex) {
  return new PublicKey(hexToBytes(pubkey)).toBase58();
}

export function proposalStatus(proposal: Proposal, safe: Pick<Safe, "threshold">, now: number): ProposalStatus {
  if (proposal.rawStatus === 1) return "executed";
  if (proposal.rawStatus === 2) return "cancelled";
  if (now >= proposal.expiresAt) return "expired";
  return proposal.approvals >= safe.threshold ? "ready" : "pending";
}

export function isOwnerOf(safe: Safe, account: Address | null | undefined) {
  if (!account) return false;
  return safe.owners.some((owner) => owner.address.toLowerCase() === account.toLowerCase());
}

export type ParsedOwners =
  | { ok: true; evmOwners: Address[]; solanaPubkeys: Hex[] }
  | { ok: false; error: string };

/** Turns one address per line (EVM or Solana) into the createSafe owner arguments. */
export function parseOwners(lines: string[]): ParsedOwners {
  const evmOwners: Address[] = [];
  const solanaPubkeys: Hex[] = [];
  const seen = new Set<string>();
  const filled = lines.map((line) => line.trim()).filter(Boolean);
  if (filled.length === 0) return { ok: false, error: "Add at least one owner." };
  if (filled.length > MAX_OWNERS) return { ok: false, error: `A safe can have at most ${MAX_OWNERS} owners.` };
  for (const line of filled) {
    const resolved = resolveRecipient(line);
    if (!resolved) return { ok: false, error: `"${line}" is not an EVM or Solana address.` };
    const key = resolved.address.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `"${line}" is listed twice.` };
    seen.add(key);
    if (resolved.kind === "solana") {
      solanaPubkeys.push(bytesToHex(new PublicKey(resolved.solanaAddress).toBytes()));
    } else {
      evmOwners.push(resolved.address);
    }
  }
  return { ok: true, evmOwners, solanaPubkeys };
}

export function validateSafeName(name: string) {
  if (!name.trim()) return "Give the safe a name.";
  if (new TextEncoder().encode(name).length > MAX_NAME_BYTES) return `The name must fit in ${MAX_NAME_BYTES} bytes.`;
  return null;
}
