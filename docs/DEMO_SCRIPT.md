# DuoSafe demo script

Target length: about 2 minutes.

## Preparation

1. Open the deployed DuoSafe app.
2. Have MetaMask on Rome Hadrian with a few test USDC, and Solflare on Devnet with a little devnet SOL and devnet USDC.
3. Copy your Solflare address.

## Recording

### 1. The idea (15 s)

"DuoSafe is a shared USDC treasury on Rome. Co-signers can be MetaMask addresses or Solana wallets, and every payment needs M of N approvals."

### 2. Create a 2-of-2 safe (30 s)

Connect MetaMask. In Create a safe, name it, click "Add my wallet", and paste the Solflare address as the second owner. Point at the EVM and Solana marks, keep 2 of 2, and sign. The app opens the new safe; show the co-signer list with one Solana owner.

### 3. Deposit and propose (25 s)

In Deposit, add 5 USDC. In New payment, pay 2 USDC to any address with a memo. The proposal shows 1/2 approvals: "MetaMask approved by proposing."

### 4. Approve from Solflare and execute (35 s)

Open the proposal's share link, switch to Solflare in the wallet menu, and approve, signing the Rome authorization in Solflare. The bar fills to 2/2 and the status turns "Ready to execute". Execute the payment; the safe balance drops by 2 USDC.

### 5. Proof (15 s)

Open the transaction on Via Explorer and the verified contract. "A Solana wallet co-signed an EVM multisig, no bridge."
