import { randomBytes } from "node:crypto";

/**
 * `did:stellar` identifiers and Multikey encoding of the holder's passkey, as
 * `docs/did-spec/did-stellar-v0.1.md` §2.3 and `docs/IMPLEMENTATION ES.md` §8
 * describe. Kept dependency-free: both encodings are a few lines.
 */

/** 16 random bytes: the on-chain `did_id` (`BytesN<16>`). */
export function newDidId(): Buffer {
  return randomBytes(16);
}

/** `did:stellar:<network>:<base32 lowercase of the 16 bytes>`, 26 chars. */
export function didFromId(didId: Uint8Array, network: "testnet" | "mainnet"): string {
  if (didId.length !== 16) throw new Error("did_id must be 16 bytes");
  return `did:stellar:${network}:${base32Lower(didId)}`;
}

/** RFC 4648 base32, lowercase, without padding. */
export function base32Lower(bytes: Uint8Array): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

/**
 * The passkey as the smart account stores it: an uncompressed P-256 point,
 * 65 bytes (`0x04 ‖ x ‖ y`). Multikey wants the compressed form: `0x02` or
 * `0x03` by the parity of `y`, then `x`.
 */
export function compressP256(uncompressed: Uint8Array): Uint8Array {
  if (uncompressed.length !== 65 || uncompressed[0] !== 0x04) {
    throw new Error("expected an uncompressed P-256 public key (65 bytes, 0x04 prefix)");
  }
  const x = uncompressed.subarray(1, 33);
  const yIsOdd = (uncompressed[64]! & 1) === 1;
  return Buffer.concat([Buffer.from([yIsOdd ? 0x03 : 0x02]), x]);
}

/** Multicodec `p256-pub` (0x1200) as an unsigned varint. */
const P256_PUB_PREFIX = Buffer.from([0x80, 0x24]);

/** `z` + base58btc(multicodec prefix ‖ compressed key). Always starts with `zDn`. */
export function multikeyP256(uncompressed: Uint8Array): string {
  return `z${base58btc(Buffer.concat([P256_PUB_PREFIX, compressP256(uncompressed)]))}`;
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58btc(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i]! << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return (
    "1".repeat(zeros) +
    digits
      .reverse()
      .map((d) => BASE58[d])
      .join("")
  );
}
