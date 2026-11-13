import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { syntheticAddress } from "@rome-protocol/sdk";
import { Keypair, PublicKey } from "@solana/web3.js";
import hardhat from "hardhat";
import { bytesToHex, createWalletClient, custom, formatEther, getAddress, parseEther, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { duoSafeAbi } from "../lib/abi";
import { hadrian } from "../lib/config";
import { encodeCreateSafe, encodeDeposit, encodeProposalAction, encodePropose } from "../lib/contract";
import { DEMO_SAFE_PREFIX } from "../lib/safes";

const HADRIAN_DUOSAFE = "0xf54b190C788fCA8DD587Cdd7A7D1EfDf7D8654f8" as const;
const STATE_FILE = ".demo-seed.json";
// Hadrian charges for Solana compute, so even small calls reserve several million gas.
const GAS_BUFFER = parseEther("0.2");

const evmPersonas = ["anh", "bao", "chi", "dung", "elena", "farid"] as const;
const solanaPersonas = ["sol-kai", "sol-mira", "sol-noor"] as const;
type EvmPersona = (typeof evmPersonas)[number];
type SolanaPersona = (typeof solanaPersonas)[number];
/** "you" is the wallet that runs the script, so it can approve and execute from MetaMask. */
type Owner = EvmPersona | SolanaPersona | "you";
type Wallet = ReturnType<typeof createWalletClient> & { address: Address };

type Step =
  | { kind: "approve" | "execute" | "cancel"; by: EvmPersona; proposal: string }
  | { kind: "propose"; key: string; by: EvmPersona; to: EvmPersona | SolanaPersona; amount: string; memo: string };

interface Scenario {
  key: string;
  name: string;
  owners: Owner[];
  threshold: number;
  deposits: [EvmPersona, string][];
  steps: Step[];
}

const scenarios: Scenario[] = [
  {
    key: "grants",
    name: "Builder grants pool",
    owners: ["anh", "bao", "sol-kai", "you"],
    threshold: 2,
    deposits: [["anh", "3"], ["bao", "2"]],
    steps: [
      { kind: "propose", key: "guide", by: "anh", to: "elena", amount: "1.2", memo: "Grant: dual-wallet onboarding guide" },
      { kind: "approve", by: "bao", proposal: "guide" },
      { kind: "execute", by: "bao", proposal: "guide" },
      { kind: "propose", key: "bounty", by: "bao", to: "sol-mira", amount: "0.6", memo: "Bounty: Solflare approval tutorial" },
      { kind: "approve", by: "anh", proposal: "bounty" },
      { kind: "propose", key: "venue", by: "anh", to: "farid", amount: "0.8", memo: "Workshop venue deposit" },
    ],
  },
  {
    key: "hackathon",
    name: "Hackathon prize safe",
    owners: ["chi", "dung", "elena", "sol-noor"],
    threshold: 3,
    deposits: [["chi", "2.5"], ["dung", "1"]],
    steps: [
      { kind: "propose", key: "first", by: "chi", to: "farid", amount: "1", memo: "1st place: team Lumen" },
      { kind: "approve", by: "dung", proposal: "first" },
      { kind: "approve", by: "elena", proposal: "first" },
      { kind: "execute", by: "elena", proposal: "first" },
      { kind: "propose", key: "dinner", by: "dung", to: "bao", amount: "0.4", memo: "Judges' dinner" },
      { kind: "cancel", by: "dung", proposal: "dinner" },
      { kind: "propose", key: "second", by: "chi", to: "sol-kai", amount: "0.75", memo: "2nd place: team Orbit (Solana)" },
      { kind: "approve", by: "elena", proposal: "second" },
    ],
  },
  {
    key: "ops",
    name: "Community ops wallet",
    owners: ["farid", "anh"],
    threshold: 1,
    deposits: [["farid", "1"]],
    steps: [
      { kind: "propose", key: "hosting", by: "farid", to: "anh", amount: "0.25", memo: "Hosting renewal" },
      { kind: "execute", by: "farid", proposal: "hosting" },
    ],
  },
];

interface SeedState {
  keys: Partial<Record<EvmPersona, Hex>>;
  solana: Partial<Record<SolanaPersona, string>>;
  safes: Record<string, { id?: string; deposited: string[]; proposals: Record<string, string>; done: number }>;
}

async function main() {
  const connection = await hardhat.network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [funder] = await viem.getWalletClients();
  if (!funder) throw new Error("Set PRIVATE_KEY to the funded deployer wallet.");

  const isHadrian = (await publicClient.getChainId()) === hadrian.id;
  let duosafe: Address = HADRIAN_DUOSAFE;
  let state: SeedState = { keys: {}, solana: {}, safes: {} };
  if (isHadrian && existsSync(STATE_FILE)) state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  const save = () => {
    if (isHadrian) writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
  };
  if (!isHadrian) {
    console.log("Local dry run: deploying a throwaway DuoSafe contract.");
    duosafe = (await viem.deployContract("DuoSafe")).address;
  }

  const wallets = {} as Record<EvmPersona, Wallet>;
  for (const persona of evmPersonas) {
    state.keys[persona] ??= generatePrivateKey();
    const account = privateKeyToAccount(state.keys[persona]!);
    wallets[persona] = Object.assign(
      createWalletClient({ account, chain: publicClient.chain, transport: custom(connection.provider) }),
      { address: account.address },
    );
  }
  // Solana co-signers and recipients only need public keys: they are stored and paid, never used to sign here.
  const solanaKeys = {} as Record<SolanaPersona, PublicKey>;
  for (const persona of solanaPersonas) {
    state.solana[persona] ??= Keypair.generate().publicKey.toBase58();
    solanaKeys[persona] = new PublicKey(state.solana[persona]!);
  }
  save();

  const addressOf = (who: EvmPersona | SolanaPersona): Address =>
    (solanaPersonas as readonly string[]).includes(who)
      ? getAddress(syntheticAddress(solanaKeys[who as SolanaPersona]))
      : wallets[who as EvmPersona].address;

  let spent = 0n;
  async function topUp(address: Address, needed: bigint) {
    const balance = await publicClient.getBalance({ address });
    if (balance >= needed) return;
    const value = needed - balance + GAS_BUFFER;
    const available = await publicClient.getBalance({ address: funder!.account.address });
    if (available < value + GAS_BUFFER * 4n) {
      throw new Error(
        `The funder wallet has ${formatEther(available)} USDC left. ` +
          "Bridge more test USDC to it, then run `npm run seed:demo` again to resume.",
      );
    }
    const hash = await funder!.sendTransaction({ to: address, value });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async function send(wallet: Wallet, data: Hex, value = 0n) {
    const gas = await publicClient.estimateGas({ account: wallet.account!, to: duosafe, data, value });
    const gasPrice = await publicClient.getGasPrice();
    await topUp(wallet.address, (gas * gasPrice * 12n) / 10n + value);
    const before = await publicClient.getBalance({ address: wallet.address });
    const hash = await wallet.sendTransaction({ account: wallet.account!, chain: publicClient.chain, to: duosafe, data, value, gas });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Transaction reverted (${hash})`);
    spent += before - (await publicClient.getBalance({ address: wallet.address })) - value;
    return receipt;
  }

  console.log(`Funder ${funder.account.address}: ${formatEther(await publicClient.getBalance({ address: funder.account.address }))} gas`);

  for (const scenario of scenarios) {
    const progress = (state.safes[scenario.key] ??= { deposited: [], proposals: {}, done: 0 });
    const name = `${DEMO_SAFE_PREFIX}${scenario.name}`;
    const creator = wallets[scenario.owners.find((owner): owner is EvmPersona => (evmPersonas as readonly string[]).includes(owner))!];

    if (!progress.id) {
      const evmOwners = scenario.owners
        .filter((owner) => !(solanaPersonas as readonly string[]).includes(owner))
        .map((owner) => (owner === "you" ? getAddress(funder.account.address) : wallets[owner as EvmPersona].address));
      const solanaPubkeys = scenario.owners
        .filter((owner): owner is SolanaPersona => (solanaPersonas as readonly string[]).includes(owner))
        .map((owner) => bytesToHex(solanaKeys[owner].toBytes()));
      await send(creator, encodeCreateSafe(name, evmOwners, solanaPubkeys, scenario.threshold));
      const [newest] = await publicClient.readContract({
        address: duosafe,
        abi: duoSafeAbi,
        functionName: "safesOf",
        args: [creator.address, 0n, 1n],
      });
      if (!newest || newest.name !== name) throw new Error(`Created "${name}" but could not find its id.`);
      progress.id = newest.id.toString();
      save();
      console.log(`Safe #${progress.id}: ${name} (${scenario.threshold} of ${scenario.owners.length})`);
    }
    const safeId = BigInt(progress.id);

    for (const [persona, amount] of scenario.deposits) {
      const tag = `${persona}:${amount}`;
      if (progress.deposited.includes(tag)) continue;
      await send(wallets[persona], encodeDeposit(safeId), parseEther(amount));
      progress.deposited.push(tag);
      save();
      console.log(`  #${progress.id} deposit ${amount} USDC from ${persona}`);
    }

    for (const [index, step] of scenario.steps.entries()) {
      if (index < progress.done) continue;
      if (step.kind === "propose") {
        await send(wallets[step.by], encodePropose(safeId, addressOf(step.to), parseEther(step.amount), step.memo));
        const [newest] = await publicClient.readContract({
          address: duosafe,
          abi: duoSafeAbi,
          functionName: "proposalsOf",
          args: [safeId, 0n, 1n],
        });
        progress.proposals[step.key] = newest.id.toString();
        console.log(`  #${progress.id} proposal #${newest.id}: ${step.memo} (${step.amount} USDC -> ${step.to})`);
      } else {
        const proposalId = BigInt(progress.proposals[step.proposal]);
        await send(wallets[step.by], encodeProposalAction(step.kind, proposalId));
        console.log(`  #${progress.id} proposal #${proposalId} ${step.kind} by ${step.by}`);
      }
      progress.done = index + 1;
      save();
    }
  }

  console.log(`\nDemo wallets spent ${formatEther(spent)} gas on this run.`);
  console.log(`Funder balance: ${formatEther(await publicClient.getBalance({ address: funder.account.address }))} gas`);
  const grants = state.safes.grants?.id;
  if (grants) {
    console.log(`\nYou co-sign safe #${grants}. Open it with MetaMask to approve and execute the waiting proposals:`);
    console.log(`${isHadrian ? "https://rome-duosafe.vercel.app" : "http://localhost:3000"}/safe/${grants}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
