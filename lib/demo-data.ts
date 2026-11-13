import { parseEther } from "viem";
import type { Proposal, Safe } from "./types";

const base = Math.floor(Date.UTC(2026, 10, 10) / 1000);
const far = 4102444800;

export const DEMO_OWNER = "0x7f2D39e2a45D7484aA65f6B63F1f94E2a851D5Af" as const;

export const demoSafes: Safe[] = [
  {
    id: 2n,
    name: "Builder grants pool",
    threshold: 2,
    createdAt: base - 3 * 86400,
    balance: parseEther("1250"),
    owners: [
      { address: DEMO_OWNER, solana: false },
      {
        address: "0x99235f50A5F0E9345cfA83a99aBDF3FaD754C9a1",
        solana: true,
        solanaAddress: "4tvUqEQHCjmV4giShmAFTe3raqHqaceVQi2RBXAqbFap",
      },
      { address: "0x3Fa6E34B41DC1Ce583F64F7B495AD35DdE76E813", solana: false },
    ],
    proposalCount: 3,
  },
  {
    id: 1n,
    name: "Hackathon prize safe",
    threshold: 2,
    createdAt: base - 10 * 86400,
    balance: parseEther("300"),
    owners: [
      { address: DEMO_OWNER, solana: false },
      {
        address: "0xA8642Fd55193D34FD987D4DeFA60F3a55f7919b0",
        solana: true,
        solanaAddress: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
      },
    ],
    proposalCount: 0,
  },
];

/** Which demo proposals DEMO_OWNER has approved; #2 was approved by the two other owners. */
export const demoApprovedByOwner: Record<string, boolean> = { "1": true, "2": false, "3": true };

export const demoProposals: Proposal[] = [
  {
    id: 3n,
    safeId: 2n,
    proposer: DEMO_OWNER,
    to: "0xA8642Fd55193D34FD987D4DeFA60F3a55f7919b0",
    amount: parseEther("400"),
    memo: "Grant: dual-lane wallet onboarding",
    createdAt: base - 3600,
    expiresAt: far,
    approvals: 1,
    rawStatus: 0,
  },
  {
    id: 2n,
    safeId: 2n,
    proposer: "0x99235f50A5F0E9345cfA83a99aBDF3FaD754C9a1",
    to: "0x3Fa6E34B41DC1Ce583F64F7B495AD35DdE76E813",
    amount: parseEther("150"),
    memo: "Workshop venue",
    createdAt: base - 7200,
    expiresAt: far,
    approvals: 2,
    rawStatus: 0,
  },
  {
    id: 1n,
    safeId: 2n,
    proposer: DEMO_OWNER,
    to: "0x3Fa6E34B41DC1Ce583F64F7B495AD35DdE76E813",
    amount: parseEther("250"),
    memo: "Audit retainer",
    createdAt: base - 2 * 86400,
    expiresAt: far,
    approvals: 2,
    rawStatus: 1,
  },
];
