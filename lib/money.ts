import { syntheticAddress } from "@rome-protocol/sdk";
import { PublicKey } from "@solana/web3.js";
import { formatUnits, getAddress, isAddress, parseUnits, type Address } from "viem";

/** Rome's native USDC uses 18 decimals on the EVM side; Solana USDC has 6. */
export const NATIVE_DECIMALS = 18;
export const MAX_INPUT_DECIMALS = 6;
export const MAX_TEXT_BYTES = 140;

export type Recipient =
  | { kind: "evm"; address: Address }
  | { kind: "solana"; address: Address; solanaAddress: string };

/** Accepts an EVM address or a Solana wallet address and returns the Rome address to pay. */
export function resolveRecipient(input: string): Recipient | null {
  const value = input.trim();
  // Accept any 0x address regardless of checksum casing, then normalize it.
  if (isAddress(value, { strict: false })) return { kind: "evm", address: getAddress(value.toLowerCase()) };
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return null;
  try {
    const key = new PublicKey(value);
    if (key.toBytes().length !== 32) return null;
    return { kind: "solana", address: getAddress(syntheticAddress(key)), solanaAddress: key.toBase58() };
  } catch {
    return null;
  }
}

/**
 * Parses a USDC amount typed by a user. At most 6 decimals are allowed, so every amount is a
 * whole number of Solana-side micro-USDC and a Solflare top-up of the same value is accepted.
 */
export function parseUsdc(input: string): bigint | null {
  const value = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(value)) return null;
  const amount = parseUnits(value, NATIVE_DECIMALS);
  return amount > 0n ? amount : null;
}

export function formatUsdc(amount: bigint, maximumFractionDigits = 2) {
  const [whole, fraction = ""] = formatUnits(amount, NATIVE_DECIMALS).split(".");
  const trimmed = fraction.slice(0, maximumFractionDigits).replace(/0+$/, "");
  const grouped = Number(whole).toLocaleString("en-US");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

export function textError(value: string, label: string) {
  return new TextEncoder().encode(value).length > MAX_TEXT_BYTES
    ? `${label} must fit in ${MAX_TEXT_BYTES} bytes.`
    : null;
}

export function formatDate(seconds: number) {
  return new Date(seconds * 1000).toUTCString().replace("GMT", "UTC");
}
