import type { Metadata } from "next";
import { DM_Sans, Libre_Caslon_Display } from "next/font/google";
import { WalletProvider } from "@/components/wallet-provider";
import { SiteFooter, SiteHeader, TransactionToast } from "@/components/ui";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const caslon = Libre_Caslon_Display({
  variable: "--font-caslon",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DuoSafe - Shared USDC safes for EVM and Solana co-signers",
  description:
    "Multi-signature USDC safes on Rome where MetaMask and Solflare owners approve every payment together.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} ${caslon.variable}`}>
      <body>
        <WalletProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
          <TransactionToast />
        </WalletProvider>
      </body>
    </html>
  );
}
