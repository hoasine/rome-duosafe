import { Buffer as StandardBuffer } from "buffer";

type ByteWriter = Uint8Array & {
  writeBigUInt64LE?: (value: bigint, offset?: number) => number;
};

function writeBigUInt64LE(this: Uint8Array, value: bigint, offset = 0) {
  new DataView(this.buffer, this.byteOffset, this.byteLength).setBigUint64(
    offset,
    BigInt(value),
    true,
  );
  return offset + 8;
}

function ensureWriter(prototype: object | null) {
  while (prototype && prototype !== Object.prototype) {
    const current = prototype as ByteWriter;
    if (typeof current.writeBigUInt64LE !== "function") {
      // Wallet extensions bundle their own Buffer and assign this method too, so it must stay writable.
      Object.defineProperty(current, "writeBigUInt64LE", {
        value: writeBigUInt64LE,
        writable: true,
        configurable: true,
      });
    }
    prototype = Object.getPrototypeOf(prototype);
  }
}

function install(factory: { alloc(size: number): ByteWriter } | undefined) {
  if (!factory) return;
  ensureWriter(Object.getPrototypeOf(factory.alloc(0)));
}

install(StandardBuffer);
install(globalThis.Buffer);
globalThis.Buffer = StandardBuffer;
