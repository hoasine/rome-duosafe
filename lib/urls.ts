const IPFS_GATEWAY = "https://ipfs.io/ipfs/";
const IPFS_PATH = /^[A-Za-z0-9]+(\/[A-Za-z0-9._~\-/]*)?$/;

export function safeExternalUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("ipfs://")) {
    const path = trimmed.slice("ipfs://".length);
    return IPFS_PATH.test(path) ? `${IPFS_GATEWAY}${path}` : null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function validExternalUri(value: string) {
  return safeExternalUrl(value) !== null;
}

export function validateUtf8(value: string, maxBytes: number, label: string) {
  return new TextEncoder().encode(value).length <= maxBytes
    ? null
    : `${label} exceeds the ${maxBytes}-byte on-chain limit.`;
}
