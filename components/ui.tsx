"use client";

import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  LoaderCircle,
  LogOut,
  CircleCheck,
  Wallet,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { VIA_BASE_URL, shortAddress } from "@/lib/config";
import { publicClient } from "@/lib/contract";
import { formatUsdc } from "@/lib/money";
import { DEMO_SAFE_PREFIX, isDemoSafe } from "@/lib/safes";
import type { SafeOwner } from "@/lib/types";
import { EvmMark, SolanaMark } from "./brand-icons";
import { useRomeWallet } from "./wallet-provider";

export function useChainHealth() {
  const [health, setHealth] = useState<{ online: boolean | null; block?: number }>({
    online: null,
  });
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      publicClient
        .getBlockNumber()
        .then((block) => !cancelled && setHealth({ online: true, block: Number(block) }))
        .catch(() => !cancelled && setHealth({ online: false }));
    void check();
    const interval = window.setInterval(check, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);
  return health;
}

/** Opens the header wallet menu from anywhere on the page. */
export const OPEN_WALLET_MENU = "duosafe:open-wallet-menu";

export function openWalletMenu() {
  window.dispatchEvent(new Event(OPEN_WALLET_MENU));
}

type Lane = "evm" | "solana";

function WalletMenu({ onError }: { onError(message: string | null): void }) {
  const wallet = useRomeWallet();
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState<Lane | null>(null);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const connected = Boolean(wallet.evmAddress || wallet.syntheticAddress);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_WALLET_MENU, show);
    return () => window.removeEventListener(OPEN_WALLET_MENU, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const connect = async (lane: Lane) => {
    onError(null);
    setConnecting(lane);
    try {
      if (lane === "evm") await wallet.connectEvm();
      else await wallet.connectSolana();
      setOpen(false);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Wallet connection failed.");
    } finally {
      setConnecting(null);
    }
  };

  const shareable = wallet.activeLane === "solana" ? wallet.solanaAddress : wallet.activeAddress;
  const copy = async () => {
    if (!shareable) return;
    await navigator.clipboard.writeText(shareable);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const rows: { lane: Lane; name: string; network: string; address: string | null; icon: ReactNode }[] = [
    { lane: "evm", name: "MetaMask", network: "EVM wallet", address: wallet.evmAddress, icon: <EvmMark size={17} /> },
    {
      lane: "solana",
      name: "Solflare",
      network: "Solana wallet · Devnet",
      address: wallet.solanaAddress,
      icon: <SolanaMark size={17} />,
    },
  ];

  return (
    <div className="wallet-menu" ref={ref}>
      {connected && wallet.activeLane ? (
        <button
          className={`wallet-trigger ${wallet.activeLane}`}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Wallet menu"
        >
          <span className={`wallet-dot ${wallet.activeLane}`} />
          <span>{shortAddress(shareable ?? "", 4)}</span>
          <ChevronDown size={14} />
        </button>
      ) : (
        <button
          className="button button-primary button-small"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <Wallet size={14} /> Connect wallet
        </button>
      )}

      {open && (
        <div className="wallet-popover" role="menu" aria-label="Choose a wallet">
          <p className="wallet-popover-title">{connected ? "Your wallets" : "Connect a wallet"}</p>
          {rows.map((row) => {
            const isActive = wallet.activeLane === row.lane && row.address !== null;
            return (
              <div className={`wallet-option ${isActive ? "active" : ""}`} key={row.lane}>
                {row.address ? (
                  <button
                    className="wallet-option-main"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => {
                      wallet.selectLane(row.lane);
                      setOpen(false);
                    }}
                    aria-label={`Use ${row.name} address ${row.lane === "evm" ? row.address : wallet.syntheticAddress}`}
                  >
                    <span className={`wallet-option-icon ${row.lane}`}>{row.icon}</span>
                    <span className="wallet-option-text">
                      <strong>{row.name}</strong>
                      <small>{shortAddress(row.address, 5)}</small>
                    </span>
                    {isActive && <Check size={15} className="wallet-option-check" />}
                  </button>
                ) : (
                  <button
                    className="wallet-option-main"
                    role="menuitem"
                    disabled={connecting !== null}
                    onClick={() => void connect(row.lane)}
                    aria-label={`Connect ${row.name}`}
                  >
                    <span className={`wallet-option-icon ${row.lane}`}>{row.icon}</span>
                    <span className="wallet-option-text">
                      <strong>{row.name}</strong>
                      <small>{connecting === row.lane ? "Connecting…" : row.network}</small>
                    </span>
                  </button>
                )}
                {row.address && (
                  <button
                    className="wallet-option-action"
                    onClick={row.lane === "evm" ? wallet.disconnectEvm : wallet.disconnectSolana}
                    disabled={wallet.isBusy}
                    aria-label={`Disconnect ${row.name}`}
                    title={`Disconnect ${row.name}`}
                  >
                    <LogOut size={14} />
                  </button>
                )}
              </div>
            );
          })}
          {connected && wallet.activeAddress && (
            <div className="wallet-popover-footer">
              <button onClick={() => void copy()}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy address"}
              </button>
              <Link href="/#safes" onClick={() => setOpen(false)}>
                <ArrowUpRight size={14} /> My safes
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SiteHeader() {
  const wallet = useRomeWallet();
  const [error, setError] = useState<string | null>(null);

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/">
          <Image src="/duosafe-mark.svg" alt="" width={34} height={34} priority />
          DuoSafe
        </Link>
        <nav className="nav" aria-label="Primary navigation">
          <Link href="/#safes">{wallet.activeAddress ? "My safes" : "Safes"}</Link>
          <Link href="/#create">Create safe</Link>
          <Link href="/#how-it-works">How it works</Link>
          <a href="https://docs.rome.builders" target="_blank" rel="noreferrer">
            Rome docs
          </a>
        </nav>
        <WalletMenu onError={setError} />
      </div>
      {error && (
        <div className="wallet-alert" role="alert">
          {error}
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <span>DuoSafe · shared USDC safes for EVM and Solana co-signers · built on Rome Hadrian</span>
        <a href="https://github.com/hoasine/rome-duosafe" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </div>
    </footer>
  );
}

export function AddressLink({ address }: { address: Address }) {
  return (
    <a
      className="address-link"
      href={`${VIA_BASE_URL}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      title={address}
    >
      {shortAddress(address)}
    </a>
  );
}

/** A safe owner with its wallet type; Solana owners show their Solflare address. */
export function OwnerChip({ owner, you }: { owner: SafeOwner; you?: boolean }) {
  return (
    <li className="owner-chip">
      <span className={`wallet-option-icon ${owner.solana ? "solana" : "evm"}`}>
        {owner.solana ? <SolanaMark size={15} /> : <EvmMark size={15} />}
      </span>
      <span className="owner-text">
        <strong>
          {owner.solana && owner.solanaAddress ? shortAddress(owner.solanaAddress, 5) : shortAddress(owner.address, 5)}
          {you && <span className="you-pill">You</span>}
        </strong>
        <small>
          {owner.solana ? `Solana · Rome ${shortAddress(owner.address)}` : "EVM wallet"}
        </small>
      </span>
    </li>
  );
}

export function ApprovalBar({ approvals, threshold }: { approvals: number; threshold: number }) {
  const share = Math.min(100, Math.round((approvals / threshold) * 100));
  return (
    <div className="approval">
      <div className="approval-track" role="img" aria-label={`${approvals} of ${threshold} approvals`}>
        <span style={{ width: `${share}%` }} />
      </div>
      <small>
        {approvals}/{threshold} approvals
      </small>
    </div>
  );
}

export function SafeName({ name }: { name: string }) {
  if (!isDemoSafe(name)) return <>{name}</>;
  return (
    <>
      {name.slice(DEMO_SAFE_PREFIX.length)}{" "}
      <span className="demo-pill" title="Seeded with throwaway demo wallets">Demo</span>
    </>
  );
}

export function UsdcAmount({ amount, digits = 2 }: { amount: bigint; digits?: number }) {
  return (
    <>
      {formatUsdc(amount, digits)} <span className="unit">USDC</span>
    </>
  );
}

export function QrCode({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 1, width: 640, errorCorrectionLevel: "M" })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [value]);
  if (!src) return <div className="qr-placeholder" aria-label={label} />;
  // A data URL generated in the browser cannot go through next/image optimization.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="qr-image" src={src} alt={label} width={320} height={320} />;
}

export function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose(): void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, textarea, select, button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        <p>{description}</p>
        {children}
      </section>
    </div>
  );
}

export function TransactionToast() {
  const wallet = useRomeWallet();
  const state = wallet.transaction;
  if (state.status === "idle") return null;
  const hash = "hash" in state ? state.hash : undefined;
  return (
    <div className={`toast ${state.status === "error" ? "toast-error" : ""}`} role="status">
      {state.status === "error" ? (
        <CircleAlert size={18} />
      ) : state.status === "success" ? (
        <CircleCheck size={18} />
      ) : (
        <LoaderCircle size={18} className="spin" />
      )}
      <div style={{ flex: 1 }}>
        <p>{state.message}</p>
        {hash && (
          <a href={`${VIA_BASE_URL}/tx/${hash}`} target="_blank" rel="noreferrer">
            View on Via Explorer
          </a>
        )}
      </div>
      {!wallet.isBusy && (
        <button
          className="button button-small"
          onClick={wallet.resetTransaction}
          aria-label="Dismiss transaction status"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
