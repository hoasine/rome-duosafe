"use client";

import "@/lib/browser-buffer";
import { getWallets } from "@wallet-standard/app";
import {
  isSyntheticProvisioned,
  provisionSynthetic,
  submitRomeTx,
  submitRomeTxSolanaLane,
  fundSyntheticGas,
  submitRomeTxV1,
  syntheticAddress as deriveSyntheticAddress,
  type LaneSigner,
} from "@rome-protocol/sdk";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getAddress, type Address, type Hex } from "viem";
import {
  DUOSAFE_ADDRESS,
  ROME_PROGRAM_ID,
  SOLANA_RPC,
  hadrian,
} from "@/lib/config";
import { publicClient } from "@/lib/contract";
import type { TransactionState } from "@/lib/types";

type WalletLane = "evm" | "solana";

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: never[]) => void): void;
  removeListener?(event: string, listener: (...args: never[]) => void): void;
}

interface StandardAccount {
  address: string;
}

interface StandardWallet {
  name: string;
  accounts: readonly StandardAccount[];
  features: Record<string, unknown>;
}

interface ConnectFeature {
  connect(): Promise<{ accounts: readonly StandardAccount[] }>;
}

interface SignMessageFeature {
  signMessage(input: {
    account: StandardAccount;
    message: Uint8Array;
  }): Promise<readonly { signature: Uint8Array }[]>;
}

interface SignTransactionFeature {
  supportedTransactionVersions?: readonly (string | number)[];
  signTransaction(input: {
    account: StandardAccount;
    transaction: Uint8Array;
    chain: string;
  }): Promise<readonly { signedTransaction: Uint8Array }[]>;
}

interface EventsFeature {
  on(
    event: "change",
    listener: (properties: { accounts?: readonly StandardAccount[] }) => void,
  ): () => void;
}

interface WalletContextValue {
  evmAddress: Address | null;
  solanaAddress: string | null;
  syntheticAddress: Address | null;
  activeAddress: Address | null;
  activeLane: WalletLane | null;
  transaction: TransactionState;
  isBusy: boolean;
  connectEvm(): Promise<void>;
  connectSolana(): Promise<void>;
  selectLane(lane: WalletLane): void;
  disconnect(): void;
  disconnectEvm(): void;
  disconnectSolana(): void;
  executeCall(data: Hex, target?: Address, value?: bigint): Promise<void>;
  fundFromSolana(amountWei: bigint): Promise<void>;
  balance: bigint | null;
  refreshBalance(): Promise<void>;
  resetTransaction(): void;
}

const WalletContext = createContext<WalletContextValue | null>(null);
const connection = new Connection(SOLANA_RPC, "confirmed");

function ethereumProvider() {
  return (window as typeof window & { ethereum?: Eip1193Provider }).ethereum;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes("User rejected")) return "Signature request was rejected.";
    return error.message;
  }
  return "The transaction could not be completed.";
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [evmAddress, setEvmAddress] = useState<Address | null>(null);
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
  const [syntheticAddress, setSyntheticAddress] = useState<Address | null>(null);
  const [solanaSigner, setSolanaSigner] = useState<LaneSigner | null>(null);
  const [signLegacyTransaction, setSignLegacyTransaction] = useState<
    ((transaction: Transaction) => Promise<Transaction>) | null
  >(null);
  const [solanaSupportsV1, setSolanaSupportsV1] = useState(false);
  const [activeLane, setActiveLane] = useState<WalletLane | null>(null);
  const [transaction, setTransaction] = useState<TransactionState>({ status: "idle" });
  const busyRef = useRef(false);
  const stopSolanaEvents = useRef<(() => void) | null>(null);

  useEffect(() => {
    const provider = ethereumProvider();
    if (!provider?.on) return;

    const handleAccountsChanged = (accounts: string[]) => {
      const account = accounts[0];
      setEvmAddress(account ? getAddress(account) : null);
      setTransaction({ status: "idle" });
      if (!account) {
        setActiveLane((lane) => (lane === "evm" ? null : lane));
      }
    };
    const handleChainChanged = () => {
      setTransaction({ status: "idle" });
    };

    provider.on("accountsChanged", handleAccountsChanged as (...args: never[]) => void);
    provider.on("chainChanged", handleChainChanged);
    return () => {
      provider.removeListener?.(
        "accountsChanged",
        handleAccountsChanged as (...args: never[]) => void,
      );
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  const connectEvm = useCallback(async () => {
    const provider = ethereumProvider();
    if (!provider) throw new Error("Install MetaMask or another EVM wallet to continue.");

    try {
      // Opens MetaMask's account picker even when the site is already connected.
      await provider.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && Number(error.code) === 4001) {
        throw error;
      }
    }
    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    if (!accounts[0]) throw new Error("No EVM account was returned.");
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${hadrian.id.toString(16)}` }],
      });
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? Number(error.code)
          : undefined;
      if (code !== 4902) throw error;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${hadrian.id.toString(16)}`,
            chainName: hadrian.name,
            nativeCurrency: hadrian.nativeCurrency,
            rpcUrls: hadrian.rpcUrls.default.http,
            blockExplorerUrls: [hadrian.blockExplorers.default.url],
          },
        ],
      });
    }
    setEvmAddress(getAddress(accounts[0]));
    setActiveLane("evm");
  }, []);

  const connectSolana = useCallback(async () => {
    const registry = getWallets();
    const isSolflare = (candidate: StandardWallet) =>
      candidate.name.toLowerCase().includes("solflare") &&
      "standard:connect" in candidate.features &&
      "solana:signMessage" in candidate.features &&
      "solana:signTransaction" in candidate.features;
    let wallet = (registry.get() as readonly StandardWallet[]).find(isSolflare);

    if (!wallet) {
      wallet = await new Promise<StandardWallet | undefined>((resolve) => {
        let stop = () => {};
        const timeout = window.setTimeout(() => {
          stop();
          resolve((registry.get() as readonly StandardWallet[]).find(isSolflare));
        }, 1500);
        stop = registry.on("register", () => {
          const found = (registry.get() as readonly StandardWallet[]).find(isSolflare);
          if (!found) return;
          window.clearTimeout(timeout);
          stop();
          resolve(found);
        });
      });
    }
    if (!wallet) {
      const detected = (registry.get() as readonly StandardWallet[]).map((item) => item.name);
      throw new Error(
        detected.length
          ? `Solflare was not detected. Available wallets: ${detected.join(", ")}.`
          : "Solflare did not respond. Unlock it, allow the extension on this site, then reload DuoSafe.",
      );
    }

    const connect = wallet.features["standard:connect"] as ConnectFeature;
    const result = await connect.connect();
    const account = result.accounts[0];
    if (!account) throw new Error("Solflare did not return an account.");

    const signMessage = wallet.features["solana:signMessage"] as SignMessageFeature;
    const signTransaction = wallet.features["solana:signTransaction"] as SignTransactionFeature;
    const versions = signTransaction.supportedTransactionVersions ?? [];
    const supportsV1 = versions.some((version) => version === 1 || version === "1");
    const supportsLegacy = versions.some(
      (version) => version === "legacy" || version === 0 || version === "0",
    );
    if (!supportsV1 && !supportsLegacy) {
      throw new Error(
        `Solflare cannot sign a Rome transaction. Reported versions: ${versions.join(", ") || "none"}.`,
      );
    }

    const payer = new PublicKey(account.address);
    const signer: LaneSigner = {
      payer,
      signAuthHash: async (message) => {
        const output = await signMessage.signMessage({ account, message });
        if (!output[0]?.signature) throw new Error("Solflare returned no message signature.");
        return output[0].signature;
      },
      signV1Wire: async (transaction) => {
        const output = await signTransaction.signTransaction({
          account,
          transaction,
          chain: "solana:devnet",
        });
        const signed = output[0]?.signedTransaction;
        if (!signed || signed.length < 64) {
          throw new Error("Solflare returned an invalid signed transaction.");
        }
        return signed.slice(-64);
      },
    };

    setSolanaAddress(account.address);
    setSyntheticAddress(getAddress(deriveSyntheticAddress(payer)));
    setSolanaSupportsV1(supportsV1);
    setSolanaSigner(supportsV1 ? signer : null);
    setSignLegacyTransaction(() => {
      if (!supportsLegacy) return null;
      return async (transaction: Transaction) => {
        const output = await signTransaction.signTransaction({
          account,
          transaction: transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
          }),
          chain: "solana:devnet",
        });
        const signed = output[0]?.signedTransaction;
        if (!signed) throw new Error("Solflare returned no signed activation transaction.");
        return Transaction.from(signed);
      };
    });
    stopSolanaEvents.current?.();
    const events = wallet.features["standard:events"] as EventsFeature | undefined;
    stopSolanaEvents.current =
      events?.on("change", ({ accounts }) => {
        const next = accounts?.[0];
        if (!next || next.address !== account.address) {
          setSolanaAddress(null);
          setSyntheticAddress(null);
          setSolanaSigner(null);
          setSignLegacyTransaction(null);
          setSolanaSupportsV1(false);
          setActiveLane((lane) => (lane === "solana" ? null : lane));
        }
      }) ?? null;
    setActiveLane("solana");
  }, []);

  const disconnectEvm = useCallback(() => {
    void ethereumProvider()
      ?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] })
      .catch(() => undefined);
    setEvmAddress(null);
    setTransaction({ status: "idle" });
    setActiveLane((lane) => (lane === "evm" ? null : lane));
  }, []);

  const disconnectSolana = useCallback(() => {
    stopSolanaEvents.current?.();
    stopSolanaEvents.current = null;
    setSolanaAddress(null);
    setSyntheticAddress(null);
    setSolanaSigner(null);
    setSignLegacyTransaction(null);
    setSolanaSupportsV1(false);
    setTransaction({ status: "idle" });
    setActiveLane((lane) => (lane === "solana" ? null : lane));
  }, []);

  const disconnect = useCallback(() => {
    disconnectEvm();
    disconnectSolana();
  }, [disconnectEvm, disconnectSolana]);

  const executeCall = useCallback(
    async (data: Hex, target?: Address, value?: bigint): Promise<void> => {
      const destination = target ?? DUOSAFE_ADDRESS;
      if (!destination) {
        throw new Error("Preview mode is read-only. Deploy DuoSafe and configure its address first.");
      }
      if (busyRef.current) {
        throw new Error("Another transaction is already in progress.");
      }
      busyRef.current = true;
      try {
        setTransaction({ status: "preparing", message: "Preparing your Rome transaction…" });
        if (activeLane === "evm" && evmAddress) {
          const provider = ethereumProvider();
          if (!provider) throw new Error("The connected EVM wallet is unavailable.");
          const chainId = await provider.request({ method: "eth_chainId" });
          if (Number(chainId) !== hadrian.id) {
            throw new Error("Switch your EVM wallet to Rome Hadrian before signing.");
          }
          const balance = await publicClient.getBalance({ address: evmAddress });
          if (balance === 0n) {
            throw new Error("This Rome address has no Hadrian gas balance.");
          }
          if (value && balance <= value) {
            throw new Error("This wallet does not hold enough USDC for the amount plus gas.");
          }
          setTransaction({ status: "signing", message: "Confirm this action in your EVM wallet." });
          const hash = await submitRomeTx(provider, {
            from: evmAddress,
            to: destination,
            data,
            value,
          });
          setTransaction({
            status: "confirming",
            message: "Your transaction is settling through Rome on Solana.",
            hash,
          });
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error("The contract call reverted.");
          setTransaction({ status: "success", message: "On-chain record confirmed.", hash });
          return;
        }

        if (activeLane === "solana" && syntheticAddress && solanaAddress) {
          const laneDeps = {
            connection,
            proxyUrl: hadrian.rpcUrls.default.http[0],
            chainId: hadrian.id,
            programId: ROME_PROGRAM_ID,
          };
          if (value) {
            const balance = await publicClient.getBalance({ address: syntheticAddress });
            if (balance <= value) {
              throw new Error("Your Solana wallet's Rome balance is too low. Top up from Solflare first.");
            }
          }
          if (solanaSupportsV1 && solanaSigner) {
            if (signLegacyTransaction) {
              const provisioned = await isSyntheticProvisioned(
                connection,
                ROME_PROGRAM_ID,
                syntheticAddress,
              );
              if (!provisioned) {
                setTransaction({
                  status: "signing",
                  message: "Activate your Rome synthetic address in Solflare.",
                });
                await provisionSynthetic({
                  ...laneDeps,
                  payer: solanaSigner.payer,
                  signTransaction: signLegacyTransaction,
                });
              }
            }
            setTransaction({
              status: "signing",
              message: "Solflare will ask for an authorization and transaction signature.",
            });
            const result = await submitRomeTxV1(
              { ...laneDeps, signer: solanaSigner },
              { to: destination, data, value },
            );
            if (result.receipt?.status !== "0x1") {
              throw new Error("The Rome transaction was not confirmed successfully.");
            }
            setTransaction({
              status: "success",
              message: `Confirmed through the ${result.route} Solana route.`,
              hash: result.hash,
            });
            return;
          }

          if (signLegacyTransaction) {
            setTransaction({
              status: "signing",
              message: "Confirm the Rome transaction in Solflare. A new wallet signs twice.",
            });
            const payer = new PublicKey(solanaAddress);
            const result = await submitRomeTxSolanaLane(
              { ...laneDeps, payer, signTransaction: signLegacyTransaction },
              { to: destination, data, value },
            );
            setTransaction({
              status: "success",
              message: `Confirmed through Solana legacy route: ${result.signature}`,
            });
            return;
          }
        }
        throw new Error("Connect an EVM or Solana wallet first.");
      } catch (error) {
        setTransaction({ status: "error", message: errorMessage(error) });
        throw error;
      } finally {
        busyRef.current = false;
      }
    },
    [
      activeLane,
      evmAddress,
      signLegacyTransaction,
      solanaAddress,
      solanaSigner,
      solanaSupportsV1,
      syntheticAddress,
    ],
  );

  const activeAddress = activeLane === "evm" ? evmAddress : syntheticAddress;
  const [balance, setBalance] = useState<bigint | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!activeAddress) {
      setBalance(null);
      return;
    }
    try {
      setBalance(await publicClient.getBalance({ address: activeAddress }));
    } catch {
      setBalance(null);
    }
  }, [activeAddress]);

  useEffect(() => {
    if (!activeAddress) {
      void Promise.resolve().then(() => setBalance(null));
      return;
    }
    let cancelled = false;
    const load = () =>
      publicClient
        .getBalance({ address: activeAddress })
        .then((next) => !cancelled && setBalance(next))
        .catch(() => !cancelled && setBalance(null));
    void load();
    const interval = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeAddress, transaction.status]);

  const fundFromSolana = useCallback(
    async (amountWei: bigint): Promise<void> => {
      if (!solanaSigner || !syntheticAddress) {
        throw new Error("Connect Solflare with Solana v1 transaction support to top up.");
      }
      if (amountWei <= 0n || amountWei % 10n ** 12n !== 0n) {
        throw new Error("Top-up amounts must use at most 6 decimal places.");
      }
      if (busyRef.current) throw new Error("Another transaction is already in progress.");
      busyRef.current = true;
      const laneDeps = {
        connection,
        proxyUrl: hadrian.rpcUrls.default.http[0],
        chainId: hadrian.id,
        programId: ROME_PROGRAM_ID,
      };
      try {
        const before = await publicClient.getBalance({ address: syntheticAddress });
        if (signLegacyTransaction) {
          const provisioned = await isSyntheticProvisioned(connection, ROME_PROGRAM_ID, syntheticAddress);
          if (!provisioned) {
            setTransaction({ status: "signing", message: "Activate your Rome synthetic address in Solflare." });
            await provisionSynthetic({
              ...laneDeps,
              payer: solanaSigner.payer,
              signTransaction: signLegacyTransaction,
            });
          }
        }
        setTransaction({
          status: "signing",
          message: "Approve moving devnet USDC from Solflare into your Rome balance.",
        });
        const { signature } = await fundSyntheticGas({ ...laneDeps, signer: solanaSigner }, amountWei);
        setTransaction({ status: "confirming", message: "Waiting for Rome to credit your balance…" });
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
          const current = await publicClient.getBalance({ address: syntheticAddress });
          if (current > before) {
            setTransaction({ status: "success", message: `Top-up confirmed on Solana: ${signature.slice(0, 12)}…` });
            return;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 3_000));
        }
        throw new Error("The Solana top-up was sent but Rome has not credited it yet. Refresh in a minute.");
      } catch (error) {
        setTransaction({ status: "error", message: errorMessage(error) });
        throw error;
      } finally {
        busyRef.current = false;
      }
    },
    [signLegacyTransaction, solanaSigner, syntheticAddress],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      evmAddress,
      solanaAddress,
      syntheticAddress,
      activeAddress,
      activeLane,
      transaction,
      isBusy: ["preparing", "signing", "confirming"].includes(transaction.status),
      connectEvm,
      connectSolana,
      selectLane: setActiveLane,
      disconnect,
      disconnectEvm,
      disconnectSolana,
      executeCall,
      fundFromSolana,
      balance,
      refreshBalance,
      resetTransaction: () => setTransaction({ status: "idle" }),
    }),
    [
      activeAddress,
      activeLane,
      balance,
      connectEvm,
      connectSolana,
      disconnect,
      disconnectEvm,
      disconnectSolana,
      evmAddress,
      executeCall,
      fundFromSolana,
      refreshBalance,
      solanaAddress,
      syntheticAddress,
      transaction,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useRomeWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useRomeWallet must be used inside WalletProvider");
  return context;
}
