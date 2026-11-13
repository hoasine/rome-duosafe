# DuoSafe

DuoSafe is a shared USDC safe on Rome whose co-signers can be MetaMask addresses or Solana wallets. A team, DAO, or hackathon fund keeps its USDC in one safe, and every payment out needs M of N owner approvals. Solana owners are added by their wallet address and approve straight from Solflare, so one treasury serves both communities with no bridge.

![CI](https://github.com/hoasine/rome-duosafe/actions/workflows/check.yml/badge.svg)

> Testnet software. The DuoSafe contract holds user funds and has not been audited. Use Hadrian test USDC only.

## Live deployment

- App: https://rome-duosafe.vercel.app
- DuoSafe contract: `0xf54b190C788fCA8DD587Cdd7A7D1EfDf7D8654f8` on Hadrian testnet, chain 200010 ([explorer](https://via-hadrian.testnet.romeprotocol.xyz/address/0xf54b190C788fCA8DD587Cdd7A7D1EfDf7D8654f8), [verified source](https://verify.testnet.romeprotocol.xyz/repo-ui/200010/0xf54b190C788fCA8DD587Cdd7A7D1EfDf7D8654f8))

## Why it needs Rome

- **Proven Solana co-signers.** When a safe is created with a Solana public key, the contract stores the Rome address `keccak256(pubkey)[12:]` that only that Solana wallet can sign for. The owner is labelled as a Solana wallet and approves from Solflare through Rome.
- **One treasury, two wallet worlds.** MetaMask and Solflare owners propose, approve, and execute against the same safe and the same balance.
- **Pay anyone.** A payment can go to an EVM address or a Solana wallet, which is paid at its Rome address and spends the funds from Solflare.

## Features

- Create a safe with 1 to 10 owners mixing EVM and Solana addresses, and an M-of-N threshold
- Deposit native USDC from MetaMask or Solflare; shareable safe link with QR code
- Propose a payment with a memo; the proposer's approval counts first
- Approve, revoke an approval, cancel (proposer), and execute once the threshold is met
- Approval progress bars, statuses (needs approvals, ready, executed, cancelled, expired)
- `/proposal/<id>` share pages so co-signers can review and approve
- Live Hadrian status, labelled read-only preview, one wallet menu for MetaMask and Solflare

## Contract

`contracts/DuoSafe.sol`, Solidity 0.8.28. One contract holds many safes, each with its own balance.

- `createSafe(name, evmOwners, solanaPubkeys, threshold)`
- `deposit(safeId)` payable, open to anyone
- `propose(safeId, to, amount, memo)`, `approve(id)`, `revokeApproval(id)`, `cancel(id)`, `execute(id)`
- Views: `getSafe`, `safesOf(owner, offset, limit)`, `getProposal`, `proposalsOf(safeId, offset, limit)`, `hasApproved`, `isOwner`, `syntheticAddressOf`

Rules enforced on-chain:

- 1 to 10 distinct owners, 1 ≤ threshold ≤ owners, names up to 64 bytes, memos up to 140 bytes
- Only owners propose, approve, and execute; one approval per owner; only the proposer cancels
- A proposal executes once, only with enough approvals, only before it expires (30 days), and only if the safe holds the amount
- State is written before the transfer, a reentrancy guard blocks recursive execution, and a recipient that refuses funds reverts the payment
- No admin, no upgrades. Funds leave a safe only through `execute`

The tests check after every step that the sum of all safe balances equals the contract balance.

## Local development

Node.js 22.13 or newer is required.

```bash
npm install
npm run dev
```

```bash
npm run check          # lint, typecheck, contract + unit tests, production build
npx playwright install chromium
npm run test:e2e       # desktop + mobile smoke tests against the preview build
```

## Deploy

```bash
npm run deploy:secure    # Hadrian testnet
npm run deploy:rubicon   # Rubicon mainnet, real USDC gas
```

Each command asks for the key with hidden input, deploys, prints the deployment transaction hash for Arena, writes `deployments/<network>.json`, and verifies the source on Rome's Sourcify. Then configure:

```bash
NEXT_PUBLIC_DUOSAFE_ADDRESS=0x...
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
```

See [`docs/ARENA_SUBMISSION.md`](docs/ARENA_SUBMISSION.md) and [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).
