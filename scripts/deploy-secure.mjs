import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSecret(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("This command must run in an interactive terminal.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();

    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stdout.write("\n");
    };

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish();
          reject(new Error("Deployment cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };

    process.stdin.on("data", onData);
  });
}

const script = process.argv[2] ?? "scripts/deploy.ts";
const network = process.argv[3] ?? "hadrian";
const isDeployment = script === "scripts/deploy.ts";
const isMainnet = network === "rubicon";
const sourcify = isMainnet
  ? "https://verify.mainnet.romeprotocol.xyz"
  : "https://verify.testnet.romeprotocol.xyz";

console.log(isDeployment ? `DuoSafe ${network} deployment` : `DuoSafe ${network}: ${script}`);
console.log(
  isMainnet
    ? "Rubicon is MAINNET: gas is real USDC. Paste the private key of the funded deployer. Input is hidden."
    : "Paste the private key for your funded TEST wallet. Input is hidden.",
);

let privateKey;
try {
  privateKey = await readSecret("Private key: ");
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("Expected a 32-byte private key beginning with 0x.");
  }

  const hardhatCli = fileURLToPath(
    new URL("../node_modules/hardhat/dist/src/cli.js", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [hardhatCli, "run", script, "--network", network],
    {
      cwd: process.cwd(),
      env: { ...process.env, PRIVATE_KEY: privateKey },
      stdio: "inherit",
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else if (isDeployment) {
    const deployment = JSON.parse(readFileSync(`deployments/${network}.json`, "utf8"));
    console.log("\nVerifying DuoSafe on Sourcify…");
    const verify = spawnSync(
      process.execPath,
      [hardhatCli, "--network", network, "verify", deployment.duosafe],
      {
        cwd: process.cwd(),
        env: { ...process.env, SOURCIFY_URL: sourcify },
        stdio: "inherit",
      },
    );
    if (verify.status !== 0) {
      console.log("Verification can be retried without a private key:");
      console.log(
        `$env:SOURCIFY_URL="${sourcify}"; npx hardhat verify --network ${network} ${deployment.duosafe}`,
      );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  privateKey = undefined;
}
