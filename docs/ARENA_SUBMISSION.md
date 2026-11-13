# DuoSafe — Arena submission

## App name

DuoSafe

## One line

Shared USDC safes on Rome with M-of-N approvals from MetaMask and Solana co-signers

## What are you building?

A multisig treasury for teams that live in both wallet worlds. Create a safe, add owners by EVM address or Solana wallet address, and choose how many approvals a payment needs. Anyone can deposit native USDC. Owners propose payments with a memo, approve or revoke from MetaMask or Solflare, and execute once the threshold is reached.

Solana owners are proven on-chain: the contract stores the Rome address derived from each Solana public key, which only that wallet can sign for. A DAO, hackathon prize pool, or grants committee can share one treasury across EVM and Solana members without a bridge or wrapped assets.

## Kind

Both

## Why Rome

Rome gives every Solana wallet an EVM address derived from its public key and lets it sign Solidity calls from Solflare. That makes a Solana wallet a real co-signer of an EVM multisig, approving in the same contract and against the same balance as MetaMask owners.

## Completed features

- Safes with 1 to 10 owners mixing EVM and Solana addresses, M-of-N threshold
- Deposits from MetaMask or Solflare; safe link and QR code
- Proposals with memo, approve, revoke, cancel, execute; 30-day expiry
- Approval progress bars and statuses; shareable proposal pages
- Payments to EVM addresses or Solana wallets
- Live Hadrian status; labelled preview mode; one wallet menu with disconnect

## Quality

- 8 contract tests: Solana owners from a real keypair's synthetic address, configuration limits, threshold and single execution, revoke and cancel, bad proposals, overdrafts, expiry, a Solana owner approving and executing, refusing recipients, reentrancy, pagination, and a balance invariant checked after every step
- Unit tests for owner parsing, proposal status, recipient resolution, and amounts
- Playwright smoke tests on desktop and mobile with a mocked MetaMask session
- GitHub Actions: lint, typecheck, tests, build, browser tests, dependency audit

## Links

- Website: `https://rome-duosafe.vercel.app`
- GitHub: `https://github.com/hoasine/rome-duosafe`
- X: `https://x.com/HoaTranRom`
- Contract: `0xf54b190C788fCA8DD587Cdd7A7D1EfDf7D8654f8`
- Deployment transaction (for "Link a contract"): `0xc28a90652e6a3378c4c67367144fbccf428bbe99e5b1b0c23a64c1f9377405a7`
- Via Explorer: `https://via-hadrian.testnet.romeprotocol.xyz/address/0xf54b190C788fCA8DD587Cdd7A7D1EfDf7D8654f8`
- Verified source: `https://verify.testnet.romeprotocol.xyz/repo-ui/200010/0xf54b190C788fCA8DD587Cdd7A7D1EfDf7D8654f8`
- Demo video: `ADD_VIDEO_URL`

## Grant application

What is the grant for:

```
Turn DuoSafe into the shared treasury for teams that mix EVM and Solana members on Rome, in three milestones:

1. Audit and Rubicon launch (4 weeks): independent audit of the DuoSafe contract, fixes, then deploy and verify on Rubicon with a Solana mainnet RPC. No mainnet funds before the audit is approved.

2. Treasury features (4 weeks): owner changes and threshold updates by proposal, scheduled and batched payouts, and notifications to co-signers when a proposal needs their approval.

3. Pilots (4 weeks): run treasuries for 5 Rome builder teams, hackathon prize pools, and community grants, targeting 50 safes and 300 executed payments with Solana co-signers on at least half of the safes.

Funds cover the audit, Rubicon gas, a paid Solana mainnet RPC, and development time.
```

Does your app hold user funds: **Yes.** Each safe holds deposited USDC until its owners approve a payment. The contract is unaudited testnet software today; an audit is the first grant milestone and precedes any mainnet funds.
