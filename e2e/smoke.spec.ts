import { expect, test, type Page } from "@playwright/test";

const mockEvmAccount = "0x1111111111111111111111111111111111111111";
// The public key of the System Program: a valid 32-byte Solana address.
const solanaAddress = "11111111111111111111111111111111";

async function installMockMetaMask(page: Page) {
  await page.addInitScript((account) => {
    Object.defineProperty(window, "ethereum", {
      value: {
        isMetaMask: true,
        async request({ method }: { method: string }) {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
          if (method === "eth_chainId") return "0x30d4a";
          if (
            method === "wallet_switchEthereumChain" ||
            method === "wallet_requestPermissions" ||
            method === "wallet_revokePermissions"
          ) {
            return null;
          }
          throw new Error(`Unsupported mock method ${method}`);
        },
        on() {},
        removeListener() {},
      },
    });
  }, mockEvmAccount);
}

async function connectMetaMask(page: Page) {
  await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("menuitem", { name: "Connect MetaMask" }).click();
  await expect(page.getByRole("button", { name: "Wallet menu" })).toBeVisible();
}

test("home lists sample safes and explains the product", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Shared USDC safes");
  await expect(page.getByTestId("network-health")).toContainText("Preview");
  await expect(page.locator(".safe-list .safe-card")).toHaveCount(2);
  await expect(page.getByText("Builder grants pool")).toBeVisible();
  await expect(page.getByText("2 of 3 · 2 EVM, 1 Solana")).toBeVisible();
});

test("the create form marks owner kinds and validates input", async ({ page }) => {
  await installMockMetaMask(page);
  await page.goto("/");
  const create = page.getByRole("complementary", { name: "Create a safe" });
  await create.getByRole("button", { name: "Create safe" }).click();
  await expect(create.locator(".form-error")).toContainText("Give the safe a name");

  await create.getByPlaceholder("Team treasury").fill("Ops");
  await create.getByRole("textbox", { name: "Owner 1", exact: true }).fill(mockEvmAccount);
  await create.getByRole("textbox", { name: "Owner 2", exact: true }).fill(solanaAddress);
  await expect(create.locator(".owner-kind.evm")).toHaveCount(1);
  await expect(create.locator(".owner-kind.solana")).toHaveCount(1);
  await expect(create.getByRole("combobox")).toHaveValue("2");

  await create.getByRole("button", { name: "Add owner" }).click();
  await create.getByRole("textbox", { name: "Owner 3", exact: true }).fill("not-an-address");
  await expect(create.locator(".owner-kind.invalid")).toHaveCount(1);
  await create.getByRole("button", { name: "Create safe" }).click();
  await expect(create.locator(".form-error")).toContainText("not an EVM or Solana address");

  await create.getByRole("button", { name: "Remove owner 3" }).click();
  await connectMetaMask(page);
  await create.getByRole("button", { name: "Create safe" }).click();
  await expect(create.locator(".form-error")).toContainText(/read-only/);
});

test("a safe page shows proposals, approvals, and the right actions", async ({ page }) => {
  await page.goto("/safe/2");
  await expect(page.getByTestId("safe-balance")).toContainText("1,250");
  const pending = page.getByTestId("proposal-3");
  await expect(pending).toContainText("1/2 approvals");
  await expect(pending).toContainText("Needs approvals");
  await expect(pending.getByRole("button", { name: "Revoke approval" })).toBeVisible();
  await expect(pending.getByRole("button", { name: "Cancel" })).toBeVisible();

  const ready = page.getByTestId("proposal-2");
  await expect(ready).toContainText("Ready to execute");
  await expect(ready.getByRole("button", { name: "Approve" })).toBeVisible();
  await expect(ready.getByRole("button", { name: "Execute payment" })).toBeVisible();

  const executed = page.getByTestId("proposal-1");
  await expect(executed).toContainText("Executed");
  await expect(executed.getByRole("button")).toHaveCount(0);

  const owners = page.getByRole("complementary", { name: "Owners" });
  await expect(owners.locator(".owner-chip")).toHaveCount(3);
  await expect(owners.getByText(/^4tvUq/)).toBeVisible();
  await expect(owners.locator(".you-pill")).toHaveCount(1);
});

test("proposing validates the recipient and the safe balance", async ({ page }) => {
  await page.goto("/safe/2");
  await page.getByRole("tab", { name: "New payment" }).click();
  const recipient = page.getByPlaceholder("0x… or a Solana address");
  await recipient.fill(solanaAddress);
  await expect(page.getByTestId("resolved-recipient")).toContainText("Solana wallet · pays Rome address 0x");
  await page.getByPlaceholder("0.00").fill("5000");
  await page.getByRole("button", { name: "Propose payment" }).click();
  await expect(page.locator(".form-error")).toContainText("does not hold that much");

  await page.getByRole("tab", { name: "Deposit" }).click();
  await expect(page.getByRole("img", { name: "Link to safe 2" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy safe link" })).toBeVisible();
});

test("a proposal page can be shared with co-signers", async ({ page }) => {
  await page.goto("/proposal/2");
  await expect(page.getByText("Payment proposal #2")).toBeVisible();
  await expect(page.getByTestId("proposal-2")).toContainText("Workshop venue");
  await expect(page.getByRole("link", { name: "Builder grants pool" })).toHaveAttribute("href", "/safe/2");
});

test("unknown safes and proposals render their states", async ({ page }) => {
  await page.goto("/safe/99");
  await expect(page.getByRole("heading", { name: "Safe not found." })).toBeVisible();
  await page.goto("/proposal/99");
  await expect(page.getByRole("heading", { name: "Proposal not found." })).toBeVisible();
  await page.goto("/safe/abc");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("the wallet menu switches and disconnects in one place", async ({ page }) => {
  await installMockMetaMask(page);
  await page.goto("/");
  await connectMetaMask(page);

  await page.getByRole("button", { name: "Wallet menu" }).click();
  const menu = page.getByRole("menu", { name: "Choose a wallet" });
  await expect(menu.getByRole("menuitemradio", { name: `Use MetaMask address ${mockEvmAccount}` })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(menu.getByRole("menuitem", { name: "Connect Solflare" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  await page.getByRole("button", { name: "Wallet menu" }).click();
  await page.getByRole("button", { name: "Disconnect MetaMask" }).click();
  await expect(page.getByRole("banner").getByRole("button", { name: "Connect wallet" })).toBeVisible();
});

test("responses carry security headers", async ({ request }) => {
  const headers = (await request.get("/")).headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
});
