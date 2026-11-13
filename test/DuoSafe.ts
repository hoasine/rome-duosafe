import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { syntheticAddress } from "@rome-protocol/sdk";
import { Keypair } from "@solana/web3.js";
import { bytesToHex, getAddress, parseEther, type Address, type Hex } from "viem";
import { network } from "hardhat";

const DAY = 24 * 60 * 60;
const ZERO = "0x0000000000000000000000000000000000000000";

describe("DuoSafe", async () => {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const testClient = await viem.getTestClient();
  const [alice, bob, carol, outsider] = await viem.getWalletClients();

  async function deploy() {
    return viem.deployContract("DuoSafe");
  }
  type Contract = { address: Address; abi: readonly unknown[]; read: Record<string, (...args: never[]) => Promise<unknown>> };

  async function write(
    contract: { address: Address; abi: readonly unknown[] },
    from: Address,
    functionName: string,
    args: readonly unknown[] = [],
    value = 0n,
  ) {
    const wallet = await viem.getWalletClient(from);
    const hash = await wallet.writeContract({
      address: contract.address,
      abi: contract.abi,
      functionName,
      args,
      value,
    } as never);
    return publicClient.waitForTransactionReceipt({ hash });
  }

  async function solanaOwner() {
    const keypair = Keypair.generate();
    const address = getAddress(syntheticAddress(keypair.publicKey));
    await testClient.impersonateAccount({ address });
    await testClient.setBalance({ address, value: parseEther("10") });
    return { address, pubkey: bytesToHex(keypair.publicKey.toBytes()) as Hex };
  }

  type SafeView = {
    name: string;
    threshold: number;
    balance: bigint;
    owners: readonly Address[];
    solanaOwners: readonly boolean[];
    solanaPubkeys: readonly Hex[];
    proposalCount: bigint;
  };
  type ProposalView = { approvals: number; status: number; amount: bigint; to: Address };

  async function assertInvariant(duo: Contract) {
    const count = Number(await duo.read.safeCount());
    let sum = 0n;
    for (let id = 1; id <= count; id++) {
      sum += ((await (duo.read.getSafe as (args: [bigint]) => Promise<SafeView>)([BigInt(id)])) as SafeView).balance;
    }
    assert.equal(await duo.read.totalHeld(), sum);
    assert.equal(await publicClient.getBalance({ address: duo.address }), sum);
  }

  async function createTwoOfThree(duo: Contract, solanaPubkey?: Hex) {
    await write(duo, alice.account.address, "createSafe", [
      "Team treasury",
      solanaPubkey ? [alice.account.address, bob.account.address] : [alice.account.address, bob.account.address, carol.account.address],
      solanaPubkey ? [solanaPubkey] : [],
      2,
    ]);
    await write(duo, outsider.account.address, "deposit", [1n], parseEther("10"));
  }

  it("creates a safe with EVM and proven Solana owners", async () => {
    const duo = (await deploy()) as unknown as Contract;
    const solana = await solanaOwner();
    await createTwoOfThree(duo, solana.pubkey);

    const safe = (await (duo.read.getSafe as (args: [bigint]) => Promise<SafeView>)([1n])) as SafeView;
    assert.equal(safe.name, "Team treasury");
    assert.equal(safe.threshold, 2);
    assert.equal(safe.owners.length, 3);
    assert.equal(getAddress(safe.owners[2]), solana.address);
    assert.deepEqual(safe.solanaOwners, [false, false, true]);
    assert.equal(safe.solanaPubkeys[2], solana.pubkey);
    assert.equal(await (duo.read.isOwner as (args: [bigint, Address]) => Promise<boolean>)([1n, solana.address]), true);
    const listed = (await (duo.read.safesOf as (args: [Address, bigint, bigint]) => Promise<readonly SafeView[]>)([
      solana.address,
      0n,
      5n,
    ])) as readonly SafeView[];
    assert.equal(listed.length, 1);
    await assertInvariant(duo);
  });

  it("validates safe configuration", async () => {
    const duo = await deploy();
    const many = Array.from({ length: 11 }, (_, index) => getAddress(`0x${(index + 1).toString(16).padStart(40, "0")}`));
    const cases: [unknown[], RegExp][] = [
      [["", [alice.account.address], [], 1], /EmptyValue|reverted/],
      [["x".repeat(65), [alice.account.address], [], 1], /TextTooLong|reverted/],
      [["Safe", [], [], 1], /InvalidOwnerCount|reverted/],
      [["Safe", many, [], 1], /InvalidOwnerCount|reverted/],
      [["Safe", [alice.account.address], [], 0], /InvalidThreshold|reverted/],
      [["Safe", [alice.account.address], [], 2], /InvalidThreshold|reverted/],
      [["Safe", [alice.account.address, alice.account.address], [], 1], /DuplicateOwner|reverted/],
      [["Safe", [ZERO], [], 1], /InvalidRecipient|reverted/],
      [["Safe", [alice.account.address], [`0x${"0".repeat(64)}`], 1], /InvalidRecipient|reverted/],
    ];
    for (const [args, pattern] of cases) {
      await assert.rejects(() => write(duo, alice.account.address, "createSafe", args), pattern);
    }
    await assert.rejects(() => write(duo, alice.account.address, "deposit", [1n], 1n), /SafeNotFound|reverted/);
  });

  it("needs the threshold of approvals before paying out exactly once", async () => {
    const duo = (await deploy()) as unknown as Contract;
    await createTwoOfThree(duo);
    const amount = parseEther("3");

    await assert.rejects(
      () => write(duo, outsider.account.address, "propose", [1n, outsider.account.address, amount, ""]),
      /NotOwner|reverted/,
    );
    await write(duo, alice.account.address, "propose", [1n, outsider.account.address, amount, "Design invoice"]);
    let proposal = (await (duo.read.getProposal as (args: [bigint]) => Promise<ProposalView>)([1n])) as ProposalView;
    assert.equal(proposal.approvals, 1);

    await assert.rejects(() => write(duo, alice.account.address, "approve", [1n]), /AlreadyApproved|reverted/);
    await assert.rejects(() => write(duo, alice.account.address, "execute", [1n]), /NotEnoughApprovals|reverted/);
    await assert.rejects(() => write(duo, outsider.account.address, "approve", [1n]), /NotOwner|reverted/);

    await write(duo, bob.account.address, "approve", [1n]);
    const before = await publicClient.getBalance({ address: outsider.account.address });
    await write(duo, carol.account.address, "execute", [1n]);
    assert.equal((await publicClient.getBalance({ address: outsider.account.address })) - before, amount);

    proposal = (await (duo.read.getProposal as (args: [bigint]) => Promise<ProposalView>)([1n])) as ProposalView;
    assert.equal(proposal.status, 1);
    assert.equal(((await (duo.read.getSafe as (args: [bigint]) => Promise<SafeView>)([1n])) as SafeView).balance, parseEther("7"));
    await assert.rejects(() => write(duo, alice.account.address, "execute", [1n]), /ProposalClosed|reverted/);
    await assertInvariant(duo);
  });

  it("lets owners revoke approvals and proposers cancel", async () => {
    const duo = (await deploy()) as unknown as Contract;
    await createTwoOfThree(duo);
    await write(duo, alice.account.address, "propose", [1n, outsider.account.address, 1n, ""]);
    await write(duo, bob.account.address, "approve", [1n]);
    await write(duo, bob.account.address, "revokeApproval", [1n]);
    await assert.rejects(() => write(duo, bob.account.address, "revokeApproval", [1n]), /NotApproved|reverted/);
    await assert.rejects(() => write(duo, alice.account.address, "execute", [1n]), /NotEnoughApprovals|reverted/);

    await assert.rejects(() => write(duo, bob.account.address, "cancel", [1n]), /NotProposer|reverted/);
    await write(duo, alice.account.address, "cancel", [1n]);
    await assert.rejects(() => write(duo, bob.account.address, "approve", [1n]), /ProposalClosed|reverted/);
    await assertInvariant(duo);
  });

  it("rejects bad proposals, overdrafts, and expired proposals", async () => {
    const duo = (await deploy()) as unknown as Contract;
    await createTwoOfThree(duo);
    const bad: [unknown[], RegExp][] = [
      [[1n, outsider.account.address, 0n, ""], /InvalidAmount|reverted/],
      [[1n, ZERO, 1n, ""], /InvalidRecipient|reverted/],
      [[1n, duo.address, 1n, ""], /InvalidRecipient|reverted/],
      [[1n, outsider.account.address, 1n, "x".repeat(141)], /TextTooLong|reverted/],
      [[9n, outsider.account.address, 1n, ""], /SafeNotFound|reverted/],
    ];
    for (const [args, pattern] of bad) {
      await assert.rejects(() => write(duo, alice.account.address, "propose", args), pattern);
    }

    await write(duo, alice.account.address, "propose", [1n, outsider.account.address, parseEther("11"), "Too much"]);
    await write(duo, bob.account.address, "approve", [1n]);
    await assert.rejects(() => write(duo, alice.account.address, "execute", [1n]), /InsufficientBalance|reverted/);

    await write(duo, alice.account.address, "propose", [1n, outsider.account.address, 1n, "Late"]);
    await testClient.increaseTime({ seconds: 30 * DAY });
    await testClient.mine({ blocks: 1 });
    await assert.rejects(() => write(duo, bob.account.address, "approve", [2n]), /ProposalExpired|reverted/);
    await assertInvariant(duo);
  });

  it("lets a Solana owner approve from its Rome synthetic address", async () => {
    const duo = (await deploy()) as unknown as Contract;
    const solana = await solanaOwner();
    await createTwoOfThree(duo, solana.pubkey);
    await write(duo, alice.account.address, "propose", [1n, outsider.account.address, parseEther("2"), "Cross-VM payout"]);
    await write(duo, solana.address, "approve", [1n]);
    assert.equal(await (duo.read.hasApproved as (args: [bigint, Address]) => Promise<boolean>)([1n, solana.address]), true);
    await write(duo, solana.address, "execute", [1n]);
    assert.equal(((await (duo.read.getProposal as (args: [bigint]) => Promise<ProposalView>)([1n])) as ProposalView).status, 1);
    await assertInvariant(duo);
  });

  it("reverts when the recipient refuses funds and blocks re-entry", async () => {
    const duo = (await deploy()) as unknown as Contract;
    const rejecting = await viem.deployContract("RejectingReceiver");
    const reentrant = await viem.deployContract("ReentrantReceiver", [duo.address]);
    await write(duo, alice.account.address, "createSafe", ["Guarded", [alice.account.address, reentrant.address], [], 1]);
    await write(duo, alice.account.address, "deposit", [1n], parseEther("5"));

    await write(duo, alice.account.address, "propose", [1n, rejecting.address, parseEther("1"), ""]);
    await assert.rejects(() => write(duo, alice.account.address, "execute", [1n]), /TransferFailed|reverted/);

    await write(duo, alice.account.address, "propose", [1n, reentrant.address, parseEther("1"), ""]);
    await write(reentrant, alice.account.address, "setProposal", [2n]);
    await assert.rejects(() => write(duo, alice.account.address, "execute", [2n]), /TransferFailed|ReentrantCall|reverted/);

    assert.equal(((await (duo.read.getSafe as (args: [bigint]) => Promise<SafeView>)([1n])) as SafeView).balance, parseEther("5"));
    await assertInvariant(duo);
  });

  it("pages proposals and safes newest first", async () => {
    const duo = (await deploy()) as unknown as Contract;
    await createTwoOfThree(duo);
    for (const memo of ["one", "two", "three"]) {
      await write(duo, alice.account.address, "propose", [1n, outsider.account.address, 1n, memo]);
    }
    const page = (await (duo.read.proposalsOf as (args: [bigint, bigint, bigint]) => Promise<readonly { id: bigint }[]>)([
      1n,
      0n,
      2n,
    ])) as readonly { id: bigint }[];
    assert.deepEqual(page.map((item) => item.id), [3n, 2n]);
    await assert.rejects(
      () => (duo.read.proposalsOf as (args: [bigint, bigint, bigint]) => Promise<unknown>)([1n, 0n, 26n]),
      /LimitTooLarge|reverted/,
    );
    await assert.rejects(() => (duo.read.getProposal as (args: [bigint]) => Promise<unknown>)([9n]), /ProposalNotFound|reverted/);
  });
});
