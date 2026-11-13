"use client";

import { ArrowLeft, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { isPreviewMode } from "@/lib/config";
import { loadApprovals, loadProposal, loadSafe } from "@/lib/contract";
import { DEMO_OWNER, demoApprovedByOwner, demoProposals, demoSafes } from "@/lib/demo-data";
import type { Proposal, Safe } from "@/lib/types";
import { ProposalCard } from "./proposal-card";
import { OwnerChip } from "./ui";
import { useRomeWallet } from "./wallet-provider";

export function ProposalDetail({ proposalId }: { proposalId: bigint }) {
  const wallet = useRomeWallet();
  const demo = isPreviewMode ? demoProposals.find((item) => item.id === proposalId) : undefined;
  const [proposal, setProposal] = useState<Proposal | null>(demo ?? null);
  const [safe, setSafe] = useState<Safe | null>(demo ? (demoSafes.find((item) => item.id === demo.safeId) ?? null) : null);
  const [approvedByMe, setApprovedByMe] = useState(demoApprovedByOwner[proposalId.toString()] ?? false);
  const viewer = isPreviewMode ? DEMO_OWNER : wallet.activeAddress;
  const [missing, setMissing] = useState(isPreviewMode && !demo);

  const load = useCallback(async () => {
    const nextProposal = await loadProposal(proposalId);
    const nextSafe = await loadSafe(nextProposal.safeId);
    const approvals = wallet.activeAddress ? await loadApprovals([proposalId], wallet.activeAddress) : {};
    return { nextProposal, nextSafe, mine: approvals[proposalId.toString()] ?? false };
  }, [proposalId, wallet.activeAddress]);

  useEffect(() => {
    if (isPreviewMode) return;
    let cancelled = false;
    load()
      .then(({ nextProposal, nextSafe, mine }) => {
        if (cancelled) return;
        setProposal(nextProposal);
        setSafe(nextSafe);
        setApprovedByMe(mine);
      })
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = async () => {
    if (isPreviewMode) return;
    const { nextProposal, nextSafe, mine } = await load();
    setProposal(nextProposal);
    setSafe(nextSafe);
    setApprovedByMe(mine);
  };

  if (missing) {
    return (
      <main className="shell claim">
        <div className="claim-card">
          <h1>Proposal not found.</h1>
          <p className="detail-description">Proposal #{proposalId.toString()} does not exist on this contract.</p>
          <Link className="button" href="/"><ArrowLeft size={15} /> Back to DuoSafe</Link>
        </div>
      </main>
    );
  }
  if (!proposal || !safe) {
    return (
      <main className="shell claim">
        <p><LoaderCircle className="spin" /> Loading proposal…</p>
      </main>
    );
  }

  return (
    <main className="shell app">
      <Link className="back-link" href={`/safe/${safe.id.toString()}`}>
        <ArrowLeft size={15} /> {safe.name}
      </Link>
      <div className="app-grid">
        <section className="wallet-panel" aria-label="Proposal">
          <div className="balance-header">
            <div className="balance-top">
              <span className="balance-label">Payment proposal #{proposal.id.toString()}</span>
              <span className="lane-badge evm"><ShieldCheck size={12} /> {safe.threshold} of {safe.owners.length}</span>
            </div>
            <p className="balance-sub">From safe “{safe.name}”. Share this page with the other co-signers so they can approve.</p>
          </div>
          <div className="tab-body">
            <ul className="proposal-list">
              <ProposalCard
                proposal={proposal}
                safe={safe}
                approvedByMe={approvedByMe}
                onChanged={refresh}
                showShare={false}
                viewer={viewer}
              />
            </ul>
          </div>
        </section>
        <aside className="activity-panel" aria-label="Co-signers">
          <div className="activity-head">
            <h2>Co-signers</h2>
          </div>
          <ul className="owner-list">
            {safe.owners.map((owner) => (
              <OwnerChip key={owner.address} owner={owner} you={viewer?.toLowerCase() === owner.address.toLowerCase()} />
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
