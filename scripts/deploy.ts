import { mkdir, writeFile } from "node:fs/promises";
import hardhat from "hardhat";
import { formatEther } from "viem";

const explorers: Record<string, string> = {
  hadrian: "https://via-hadrian.testnet.romeprotocol.xyz",
  rubicon: "https://via-rubicon.mainnet.romeprotocol.xyz",
};

async function main() {
  const connection = await hardhat.network.create();
  const { viem, networkName } = connection;
  const client = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();
  if (!deployer) throw new Error("No deployment account. Set PRIVATE_KEY first.");

  const chainId = await client.getChainId();
  const balance = await client.getBalance({ address: deployer.account.address });
  console.log(`Network: ${networkName} (chain ${chainId})`);
  console.log(`Deployer: ${deployer.account.address} (${formatEther(balance)} gas)`);
  if (balance === 0n) throw new Error(`The deployer has no ${networkName} gas balance.`);

  const { contract: duosafe, deploymentTransaction } =
    await viem.sendDeploymentTransaction("DuoSafe");
  const receipt = await client.waitForTransactionReceipt({ hash: deploymentTransaction.hash });
  if (receipt.status !== "success") throw new Error("Deployment transaction reverted");
  const code = await client.getCode({ address: duosafe.address });
  if (!code) throw new Error("Deployment completed without bytecode");

  const explorer = explorers[networkName] ?? explorers.hadrian;
  console.log(`DuoSafe deployed: ${duosafe.address}`);
  console.log(`Deployment transaction: ${deploymentTransaction.hash}`);
  console.log(`Explorer: ${explorer}/address/${duosafe.address}`);
  console.log(`NEXT_PUBLIC_DUOSAFE_ADDRESS=${duosafe.address}`);

  await mkdir("deployments", { recursive: true });
  await writeFile(
    `deployments/${networkName}.json`,
    `${JSON.stringify(
      {
        chainId,
        duosafe: duosafe.address,
        deploymentTransaction: deploymentTransaction.hash,
        deployer: deployer.account.address,
        deployedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
