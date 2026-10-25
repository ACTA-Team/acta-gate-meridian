import { describe, expect, it } from "vitest";

import {
  base32Lower,
  base58btc,
  compressP256,
  didFromId,
  multikeyP256,
  newDidId,
} from "../src/did.js";

describe("did:stellar identifiers", () => {
  it("encodes the spec's vector-1 did_id", () => {
    // docs/did-spec/test-vectors/vectors.json, vector-1.
    const bytes = Buffer.from("000102030405060708090a0b0c0d0e0f", "hex");
    expect(base32Lower(bytes)).toBe("aaaqeayeaudaocajbifqydiob4");
    expect(didFromId(bytes, "testnet")).toBe("did:stellar:testnet:aaaqeayeaudaocajbifqydiob4");
  });

  it("makes 26-char lowercase ids from 16 random bytes", () => {
    const did = didFromId(newDidId(), "testnet");
    expect(did).toMatch(/^did:stellar:testnet:[a-z2-7]{26}$/);
  });

  it("refuses the wrong length", () => {
    expect(() => didFromId(Buffer.alloc(15), "testnet")).toThrow();
  });
});

describe("Multikey for the passkey", () => {
  const x = Buffer.alloc(32, 0xab);
  const even = Buffer.concat([
    Buffer.from([0x04]),
    x,
    Buffer.concat([Buffer.alloc(31, 0x11), Buffer.from([0x10])]),
  ]);
  const odd = Buffer.concat([
    Buffer.from([0x04]),
    x,
    Buffer.concat([Buffer.alloc(31, 0x11), Buffer.from([0x11])]),
  ]);

  it("compresses by the parity of y and keeps x", () => {
    expect(Buffer.from(compressP256(even))).toEqual(Buffer.concat([Buffer.from([0x02]), x]));
    expect(Buffer.from(compressP256(odd))).toEqual(Buffer.concat([Buffer.from([0x03]), x]));
  });

  it("refuses anything that is not an uncompressed P-256 point", () => {
    expect(() => compressP256(Buffer.alloc(33, 0x02))).toThrow();
    expect(() => compressP256(Buffer.concat([Buffer.from([0x05]), Buffer.alloc(64)]))).toThrow();
  });

  it("prefixes p256-pub and base58btc-encodes: a P-256 Multikey starts with zDn", () => {
    const key = multikeyP256(even);
    expect(key).toMatch(/^zDn[1-9A-HJ-NP-Za-km-z]+$/);
    // 2 prefix bytes + 33 key bytes → 35 bytes → 48 base58 chars (+ "z").
    expect(key.length).toBe(49);
  });

  it("base58btc matches known vectors", () => {
    expect(base58btc(Buffer.from("hello world"))).toBe("StV1DL6CwTryKyV");
    expect(base58btc(Buffer.from([0, 0, 1]))).toBe("112");
    expect(base58btc(Buffer.alloc(0))).toBe("");
  });
});
