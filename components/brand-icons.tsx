import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/** Ethereum-style diamond for the EVM lane (MetaMask). */
export function EvmMark({ size = 16, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M12 2.5 5.5 12.3 12 16l6.5-3.7L12 2.5Z" fill="currentColor" opacity="0.9" />
      <path d="M12 17.4 5.5 13.7 12 21.5l6.5-7.8-6.5 3.7Z" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

/** Three-bar Solana mark for the Solana lane (Solflare). */
export function SolanaMark({ size = 16, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M6.6 6h13.6l-2.8 3H3.8l2.8-3Z" fill="currentColor" />
      <path d="M6.6 15h13.6l-2.8 3H3.8l2.8-3Z" fill="currentColor" />
      <path d="M17.4 10.5H3.8l2.8 3h13.6l-2.8-3Z" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

/** Rome USDC coin glyph used for amounts and balances. */
export function UsdcMark({ size = 16, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        d="M14.6 9.4c-.4-.9-1.4-1.4-2.6-1.4-1.6 0-2.7.8-2.7 2 0 2.9 5.6 1.5 5.6 4.1 0 1.2-1.2 2-2.9 2-1.3 0-2.4-.6-2.8-1.6M12 6.5V8m0 8.1v1.4"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
