"use client";

import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Check, Copy, FileText, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { isPreviewMode, shortAddress } from "@/lib/config";
import { encodeDeposit, encodePropose, loadApprovals, loadProposals, loadSafe } from "@/lib/contract";
import { DEMO_OWNER, demoApprovedByOwner, demoProposals, demoSafes } from "@/lib/demo-data";
import { formatDate, parseUsdc, resolveRecipient, textError } from "@/lib/money";
import { isOwnerOf } from "@/lib/safes";
import type { Proposal, Safe } from "@/lib/types";
import { ProposalCard } from "./proposal-card";
import { OwnerChip, QrCode, UsdcAmount, openWalletMenu } from "./ui";
import { useRomeWallet } from "./wallet-provider";

type Tab = "proposals" | "propose" | "deposit";

export function SafeDetail({ safeId }: { safeId: bigint }) {
  const wallet = useRomeWallet();
  const [safe, setSafe] = useState<Safe | null>(
    isPreviewMode ? (demoSafes.find((item) => item.id === safeId) ?? null) : null,
  );
  const [proposals, setProposals] = useState<Proposal[]>(
    isPreviewMode ? demoProposals.filter((item) => item.safeId === safeId) : [],
  );
  const [approved, setApproved] = useState<Record<string, boolean>>(
    isPreviewMode ? demoApprovedByOwner : {},
  );
  const [missing, setMissing] = useState(isPreviewMode && !safe);
  const [tab, setTab] = useState<Tab>("proposals");
  const viewer = isPreviewMode ? DEMO_OWNER : wallet.activeAddress;

  const refresh = useCallback(async () => {
    if (isPreviewMode) return;
    const [nextSafe, nextProposals] = await Promise.all([loadSafe(safeId), loadProposals(safeId)]);
    setSafe(nextSafe);
    setProposals(nextProposals);
    if (wallet.activeAddress) {
      setApproved(await loadApprovals(nextProposals.map((item) => item.id), wallet.activeAddress));
    }
  }, [safeId, wallet.activeAddress]);

  useEffect(() => {
    if (isPreviewMode) return;
    let cancelled = false;
    Promise.all([loadSafe(safeId), loadProposals(safeId)])
      .then(async ([nextSafe, nextProposals]) => {
        if (cancelled) return;
        setSafe(nextSafe);
        setProposals(nextProposals);
        if (wallet.activeAddress) {
          const map = await loadApprovals(nextProposals.map((item) => item.id), wallet.activeAddress);
          if (!cancelled) setApproved(map);
        }
      })
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
  }, [safeId, wallet.activeAddress]);

  if (missing) {
    return (
      <main className="shell claim">
        <div className="claim-card">
          <h1>Safe not found.</h1>
          <p className="detail-description">Safe #{safeId.toString()} does not exist on this contract.</p>
          <Link className="button" href="/"><ArrowLeft size={15} /> Back to DuoSafe</Link>
        </div>
      </main>
    );
  }
  if (!safe) {
    return (
      <main className="shell claim">
        <p><LoaderCircle className="spin" /> Loading safe…</p>
      </main>
    );
  }

  const owner = isOwnerOf(safe, viewer);
  const open = proposals.filter((item) => item.rawStatus === 0);
  const done = proposals.filter((item) => item.rawStatus !== 0);

  return (
    <main className="shell app">
      <Link className="back-link" href="/"><ArrowLeft size={15} /> All safes</Link>
      <div className="app-grid">
        <section className="wallet-panel" aria-label="Safe">
          <div className="balance-header">
            <div className="balance-top">
              <span className="balance-label">{safe.name}</span>
              <span className="lane-badge evm">
                <ShieldCheck size={12} /> {safe.threshold} of {safe.owners.length}
              </span>
            </div>
            <strong className="balance-amount" data-testid="safe-balance">
              <UsdcAmount amount={safe.balance} />
            </strong>
            <p className="balance-sub">
              Safe #{safe.id.toString()} · created {formatDate(safe.createdAt)}
              {owner ? " · you are a co-signer" : ""}
            </p>
          </div>
          <div className="action-tabs three" role="tablist" aria-label="Safe actions">
            {(
              [
                ["proposals", "Proposals", <FileText key="i" size={18} />],
                ["propose", "New payment", <ArrowUpRight key="i" size={19} />],
                ["deposit", "Deposit", <ArrowDownToLine key="i" size={18} />],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={`action-tab ${tab === id ? "active" : ""}`}
                onClick={() => setTab(id)}
              >
                <span className="action-tab-icon">{icon}</span>
                {label}
              </button>
            ))}
          </div>
          <div className="tab-body" role="tabpanel">
            {tab === "proposals" && (
              <>
                {isPreviewMode && <p className="notice">Sample proposals. Deploy the contract to read live Hadrian data.</p>}
                {proposals.length === 0 ? (
                  <div className="empty-state">No payment proposals yet.</div>
                ) : (
                  <ul className="proposal-list">
                    {[...open, ...done].map((proposal) => (
                      <ProposalCard
                        key={proposal.id.toString()}
                        proposal={proposal}
                        safe={safe}
                        approvedByMe={approved[proposal.id.toString()] ?? false}
                        onChanged={refresh}
                        viewer={viewer}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
            {tab === "propose" && <ProposeForm safe={safe} owner={owner} onDone={async () => { await refresh(); setTab("proposals"); }} />}
            {tab === "deposit" && <DepositForm safe={safe} onDone={refresh} />}
          </div>
        </section>

        <aside className="activity-panel" aria-label="Owners">
          <div className="activity-head">
            <h2>Co-signers</h2>
            <span className="lane-badge solana">{safe.owners.filter((item) => item.solana).length} Solana</span>
          </div>
          <ul className="owner-list">
            {safe.owners.map((item) => (
              <OwnerChip key={item.address} owner={item} you={viewer?.toLowerCase() === item.address.toLowerCase()} />
            ))}
          </ul>
          <p className="tab-hint" style={{ marginTop: 14 }}>
            Every payment needs {safe.threshold} of these {safe.owners.length} approvals. Solana co-signers approve from
            Solflare at the Rome address their key controls.
          </p>
        </aside>
      </div>
    </main>
  );
}

function ProposeForm({ safe, owner, onDone }: { safe: Safe; owner: boolean; onDone(): Promise<void> }) {
  const wallet = useRomeWallet();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recipient = to.trim() ? resolveRecipient(to) : null;

  if (!wallet.activeAddress && !isPreviewMode) {
    return (
      <div className="empty-state">
        <button className="button button-primary" onClick={openWalletMenu}>Connect a co-signer wallet</button>
      </div>
    );
  }
  if (!owner) return <p className="tab-hint">Only this safe&apos;s co-signers can propose payments.</p>;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!recipient) return setError("Enter an EVM address (0x…) or a Solana wallet address.");
    const value = parseUsdc(amount);
    if (!value) return setError("Enter a positive amount with at most 6 decimals.");
    if (value > safe.balance) return setError("The safe does not hold that much USDC yet.");
    const memoError = textError(memo, "The memo");
    if (memoError) return setError(memoError);
    try {
      await wallet.executeCall(encodePropose(safe.id, recipient.address, value, memo.trim()));
      setTo("");
      setAmount("");
      setMemo("");
      await onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The proposal could not be created.");
    }
  };

  return (
    <form className="wallet-form" onSubmit={(event) => void submit(event)}>
      <p className="tab-hint">Your proposal counts as the first approval. It expires after 30 days.</p>
      <label className="field">
        <span>Pay to</span>
        <input value={to} onChange={(event) => setTo(event.target.value)} placeholder="0x… or a Solana address" spellCheck={false} />
      </label>
      {to.trim() && (
        <p className={`resolved ${recipient ? "" : "invalid"}`} data-testid="resolved-recipient">
          {!recipient
            ? "Not a valid EVM or Solana address."
            : recipient.kind === "solana"
              ? `Solana wallet · pays Rome address ${shortAddress(recipient.address)}`
              : `EVM address · ${shortAddress(recipient.address)}`}
        </p>
      )}
      <label className="field amount-field">
        <span>Amount</span>
        <div className="amount-input">
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" />
          <span className="amount-unit">USDC</span>
        </div>
      </label>
      <label className="field">
        <span>What is it for?</span>
        <input value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={140} placeholder="Grant: wallet onboarding" />
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="button button-primary button-large button-block" disabled={wallet.isBusy}>
        <ArrowUpRight size={16} /> {wallet.isBusy ? "Proposing…" : "Propose payment"}
      </button>
    </form>
  );
}

function DepositForm({ safe, onDone }: { safe: Safe; onDone(): Promise<void> }) {
  const wallet = useRomeWallet();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => setLink(window.location.href.split("#")[0]));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setDone(false);
    const value = parseUsdc(amount);
    if (!value) return setError("Enter a positive amount with at most 6 decimals.");
    if (!wallet.activeAddress) return openWalletMenu();
    try {
      await wallet.executeCall(encodeDeposit(safe.id), undefined, value);
      setAmount("");
      setDone(true);
      await onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The deposit failed.");
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="deposit">
      <form className="wallet-form" onSubmit={(event) => void submit(event)}>
        <p className="tab-hint">Anyone can fund this safe from MetaMask or Solflare. Only owners can move funds out.</p>
        <label className="field amount-field">
          <span>Amount</span>
          <div className="amount-input">
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" aria-label="Deposit amount" />
            <span className="amount-unit">USDC</span>
          </div>
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        {done && <div className="ballot-note" role="status">Deposit confirmed.</div>}
        <button className="button button-primary button-large button-block" disabled={wallet.isBusy}>
          <ArrowDownToLine size={16} /> {wallet.isBusy ? "Depositing…" : "Deposit USDC"}
        </button>
      </form>
      {link && (
        <div className="deposit-share">
          <QrCode value={link} label={`Link to safe ${safe.id.toString()}`} />
          <button className="button button-small" onClick={() => void copy()}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy safe link"}
          </button>
        </div>
      )}
    </div>
  );
}
