"use client";

import { Ban, Check, Link2, Send, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Address } from "viem";
import { encodeProposalAction } from "@/lib/contract";
import { formatDate } from "@/lib/money";
import { isOwnerOf, proposalStatus } from "@/lib/safes";
import type { Proposal, Safe } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { AddressLink, ApprovalBar, UsdcAmount } from "./ui";
import { useRomeWallet } from "./wallet-provider";

const STATUS_COPY = {
  pending: "Needs approvals",
  ready: "Ready to execute",
  executed: "Executed",
  cancelled: "Cancelled",
  expired: "Expired",
} as const;

export function ProposalCard({
  proposal,
  safe,
  approvedByMe,
  onChanged,
  showShare = true,
  viewer,
}: {
  proposal: Proposal;
  safe: Safe;
  approvedByMe: boolean;
  onChanged(): Promise<void> | void;
  showShare?: boolean;
  /** The account whose permissions decide which actions show; defaults to the active wallet. */
  viewer?: Address | null;
}) {
  const wallet = useRomeWallet();
  const now = useNow();
  const [error, setError] = useState<string | null>(null);
  const account = viewer === undefined ? wallet.activeAddress : viewer;
  const status = now === null ? null : proposalStatus(proposal, safe, now);
  const owner = isOwnerOf(safe, account);
  const open = status === "pending" || status === "ready";
  const isProposer = account?.toLowerCase() === proposal.proposer.toLowerCase();

  const act = async (action: "approve" | "revokeApproval" | "cancel" | "execute") => {
    setError(null);
    try {
      await wallet.executeCall(encodeProposalAction(action, proposal.id));
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action failed.");
    }
  };

  return (
    <li className="proposal-card" data-testid={`proposal-${proposal.id.toString()}`}>
      <div className="proposal-top">
        <div className="proposal-main">
          <strong>{proposal.memo || `Payment #${proposal.id.toString()}`}</strong>
          <small>
            To <AddressLink address={proposal.to} /> · proposed by <AddressLink address={proposal.proposer} /> ·{" "}
            {formatDate(proposal.createdAt)}
          </small>
        </div>
        <span className="proposal-amount">
          <UsdcAmount amount={proposal.amount} />
        </span>
      </div>
      <div className="proposal-bottom">
        <ApprovalBar approvals={proposal.approvals} threshold={safe.threshold} />
        {status && <span className={`status status-proposal-${status}`}>{STATUS_COPY[status]}</span>}
      </div>
      {open && owner && (
        <div className="proposal-actions">
          {!approvedByMe && (
            <button className="button button-small button-primary" onClick={() => void act("approve")} disabled={wallet.isBusy}>
              <Check size={14} /> Approve
            </button>
          )}
          {status === "ready" && (
            <button className="button button-small button-primary" onClick={() => void act("execute")} disabled={wallet.isBusy}>
              <Send size={14} /> Execute payment
            </button>
          )}
          {approvedByMe && (
            <button className="button button-small" onClick={() => void act("revokeApproval")} disabled={wallet.isBusy}>
              <Undo2 size={14} /> Revoke approval
            </button>
          )}
          {isProposer && (
            <button className="button button-small" onClick={() => void act("cancel")} disabled={wallet.isBusy}>
              <Ban size={14} /> Cancel
            </button>
          )}
        </div>
      )}
      {open && !owner && account && (
        <p className="proposal-hint">Only this safe&apos;s owners can approve or execute.</p>
      )}
      {showShare && (
        <Link className="proposal-share" href={`/proposal/${proposal.id.toString()}`}>
          <Link2 size={13} /> Share with co-signers
        </Link>
      )}
      {error && <div className="form-error" role="alert">{error}</div>}
    </li>
  );
}
