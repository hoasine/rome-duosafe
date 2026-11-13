"use client";

import { ArrowRight, LoaderCircle, LockKeyhole, Plus, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DUOSAFE_ADDRESS, VIA_BASE_URL, isPreviewMode, shortAddress } from "@/lib/config";
import { encodeCreateSafe, findNewSafe, loadSafesOf, loadStats } from "@/lib/contract";
import { DEMO_OWNER, demoProposals, demoSafes } from "@/lib/demo-data";
import { formatUsdc, resolveRecipient } from "@/lib/money";
import { MAX_OWNERS, parseOwners, validateSafeName } from "@/lib/safes";
import type { Safe } from "@/lib/types";
import { EvmMark, SolanaMark } from "./brand-icons";
import { UsdcAmount, openWalletMenu, useChainHealth } from "./ui";
import { useRomeWallet } from "./wallet-provider";

export function DuoSafeHome() {
  const wallet = useRomeWallet();
  const health = useChainHealth();
  const viewer = isPreviewMode ? DEMO_OWNER : wallet.activeAddress;
  const [safes, setSafes] = useState<Safe[] | null>(isPreviewMode ? demoSafes : null);
  const [stats, setStats] = useState(
    isPreviewMode
      ? { safes: demoSafes.length, proposals: demoProposals.length, held: demoSafes.reduce((sum, safe) => sum + safe.balance, 0n) }
      : null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPreviewMode) return;
    let cancelled = false;
    loadStats()
      .then((next) => !cancelled && setStats(next))
      .catch(() => undefined);
    if (!viewer) {
      void Promise.resolve().then(() => !cancelled && setSafes([]));
      return () => {
        cancelled = true;
      };
    }
    loadSafesOf(viewer)
      .then((next) => !cancelled && setSafes(next))
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Could not read safes from Hadrian.");
        setSafes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [viewer]);

  return (
    <main className="shell app">
      <div className="app-topline">
        <span className={`kicker ${health.online === false ? "offline" : ""}`} data-testid="network-health">
          <span className="dot" />
          {isPreviewMode
            ? "Preview data · read only"
            : health.online === null
              ? "Checking Hadrian…"
              : health.online
                ? `Live on Hadrian · block ${health.block?.toLocaleString("en-US")}`
                : "Hadrian RPC unreachable"}
        </span>
        <h1 className="app-title">Shared USDC safes for EVM and Solana co-signers</h1>
      </div>

      <div className="app-grid">
        <section className="wallet-panel" id="safes" aria-label="Your safes">
          <div className="balance-header">
            <div className="balance-top">
              <span className="balance-label">Held across DuoSafe</span>
              <span className="lane-badge evm">
                <ShieldCheck size={12} /> {stats ? stats.safes : "—"} safes
              </span>
            </div>
            <strong className="balance-amount">
              {stats ? formatUsdc(stats.held) : "—"} <small>USDC</small>
            </strong>
            <p className="balance-sub">
              {viewer
                ? `Safes where ${shortAddress(viewer)} is a co-signer.`
                : "Connect a wallet to see the safes you co-sign."}
            </p>
            {!viewer && (
              <button className="button button-primary" onClick={openWalletMenu}>
                Connect wallet
              </button>
            )}
          </div>
          <div className="tab-body">
            {isPreviewMode && <p className="notice">Sample safes. Deploy the contract to read live Hadrian data.</p>}
            {error && <p className="notice" role="alert">{error}</p>}
            {safes === null ? (
              <div className="empty-state"><LoaderCircle className="spin" /> Loading safes…</div>
            ) : safes.length ? (
              <ul className="safe-list">
                {safes.map((safe) => (
                  <SafeCard key={safe.id.toString()} safe={safe} />
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                {viewer ? "You are not a co-signer on any safe yet." : "No wallet connected."}
              </div>
            )}
          </div>
        </section>

        <CreateSafePanel />
      </div>

      <section className="feature-strip" id="how-it-works" aria-label="How DuoSafe works">
        <article>
          <span className="feature-icon solana"><SolanaMark size={18} /></span>
          <h3>Solana co-signers, proven</h3>
          <p>Add a Solana wallet by address. The contract stores the Rome address keccak256(pubkey)[12:], and that wallet approves from Solflare.</p>
        </article>
        <article>
          <span className="feature-icon gold"><Users size={18} /></span>
          <h3>M of N approvals</h3>
          <p>Every payment is a proposal. It leaves the safe only after enough owners approve, from either wallet world.</p>
        </article>
        <article>
          <span className="feature-icon primary"><LockKeyhole size={18} /></span>
          <h3>One guarded path out</h3>
          <p>
            Funds only move through execute. No admin key, no upgrades
            {DUOSAFE_ADDRESS ? (
              <>
                {" · "}
                <a href={`${VIA_BASE_URL}/address/${DUOSAFE_ADDRESS}`} target="_blank" rel="noreferrer">verify on Via</a>
              </>
            ) : null}
            .
          </p>
        </article>
      </section>
    </main>
  );
}

function SafeCard({ safe }: { safe: Safe }) {
  const solana = safe.owners.filter((owner) => owner.solana).length;
  return (
    <li>
      <Link className="safe-card" href={`/safe/${safe.id.toString()}`}>
        <span className="safe-card-icon"><ShieldCheck size={18} /></span>
        <span className="safe-card-main">
          <strong>{safe.name}</strong>
          <small>
            {safe.threshold} of {safe.owners.length} · {safe.owners.length - solana} EVM, {solana} Solana
          </small>
        </span>
        <span className="safe-card-balance">
          <UsdcAmount amount={safe.balance} />
        </span>
        <ArrowRight size={16} className="muted" />
      </Link>
    </li>
  );
}

function CreateSafePanel() {
  const wallet = useRomeWallet();
  const router = useRouter();
  const ownSuggestion = wallet.activeLane === "solana" ? wallet.solanaAddress : wallet.activeAddress;
  const [name, setName] = useState("");
  const [owners, setOwners] = useState<string[]>(["", ""]);
  const [threshold, setThreshold] = useState(2);
  const [error, setError] = useState<string | null>(null);

  const rows = owners.map((value) => ({ value, resolved: value.trim() ? resolveRecipient(value) : null }));
  const ownerCount = rows.filter((row) => row.value.trim()).length;
  const maxThreshold = Math.max(1, ownerCount);
  const effectiveThreshold = Math.min(threshold, maxThreshold);
  const ownerOptions = useMemo(() => Array.from({ length: maxThreshold }, (_, index) => index + 1), [maxThreshold]);

  const fillMine = () => {
    if (!ownSuggestion) return;
    setOwners((items) => {
      if (items.some((item) => item.trim().toLowerCase() === ownSuggestion.toLowerCase())) return items;
      const empty = items.findIndex((item) => !item.trim());
      if (empty === -1) return items.length < MAX_OWNERS ? [...items, ownSuggestion] : items;
      return items.map((item, index) => (index === empty ? ownSuggestion : item));
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const nameError = validateSafeName(name);
    if (nameError) return setError(nameError);
    const parsed = parseOwners(owners);
    if (!parsed.ok) return setError(parsed.error);
    if (!wallet.activeAddress) return setError("Connect a wallet to create the safe.");
    try {
      await wallet.executeCall(
        encodeCreateSafe(name.trim(), parsed.evmOwners, parsed.solanaPubkeys, effectiveThreshold),
      );
      const firstOwner = rows.find((row) => row.resolved)?.resolved?.address;
      const created = firstOwner ? await findNewSafe(firstOwner, name.trim()) : null;
      if (!created) throw new Error("The safe was created but could not be found yet. Refresh in a moment.");
      router.push(`/safe/${created.id.toString()}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The safe could not be created.");
    }
  };

  return (
    <aside className="activity-panel" id="create" aria-label="Create a safe">
      <div className="activity-head">
        <h2>Create a safe</h2>
        <span className="lane-badge solana">
          <Users size={12} /> up to {MAX_OWNERS} owners
        </span>
      </div>
      <form className="wallet-form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>Safe name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={64} placeholder="Team treasury" />
        </label>
        <div className="field">
          <span>Owners: EVM or Solana addresses</span>
          <div className="owner-inputs">
            {rows.map((row, index) => (
              <div className="owner-input" key={index}>
                <span className={`owner-kind ${row.resolved ? row.resolved.kind : row.value.trim() ? "invalid" : ""}`} aria-hidden>
                  {row.resolved?.kind === "solana" ? <SolanaMark size={14} /> : <EvmMark size={14} />}
                </span>
                <input
                  aria-label={`Owner ${index + 1}`}
                  value={row.value}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={index === 0 ? "0x… or a Solana address" : "Another owner"}
                  onChange={(event) =>
                    setOwners((items) => items.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                  }
                />
                {owners.length > 1 && (
                  <button
                    type="button"
                    className="owner-remove"
                    aria-label={`Remove owner ${index + 1}`}
                    onClick={() => setOwners((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="owner-actions">
            {owners.length < MAX_OWNERS && (
              <button type="button" className="button button-small" onClick={() => setOwners((items) => [...items, ""])}>
                <Plus size={14} /> Add owner
              </button>
            )}
            {ownSuggestion && (
              <button type="button" className="button button-small" onClick={fillMine}>
                Add my wallet
              </button>
            )}
          </div>
        </div>
        <label className="field">
          <span>Approvals needed</span>
          <select value={effectiveThreshold} onChange={(event) => setThreshold(Number(event.target.value))}>
            {ownerOptions.map((value) => (
              <option key={value} value={value}>
                {value} of {Math.max(ownerCount, 1)}
              </option>
            ))}
          </select>
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button-primary button-large button-block" disabled={wallet.isBusy}>
          <ShieldCheck size={16} /> {wallet.isBusy ? "Creating…" : "Create safe"}
        </button>
      </form>
    </aside>
  );
}
