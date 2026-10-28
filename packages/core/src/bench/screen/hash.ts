// The hash, the canonical JSON and the seeded random numbers of the screen. `sha256Hex`, `canonicalJson` and `RECORD_EPS` come from
// `@mark1russell7/layout-contract` (PORTFOLIO-FIT). The other functions have no equal in the contract, so they stay here.
import { canonicalJson, sha256Hex } from "@mark1russell7/layout-contract";

export { canonicalJson, RECORD_EPS, sha256Hex } from "@mark1russell7/layout-contract";

/** This function gives the bytes of a string in UTF-8. The contract does not export its own `utf8`, so the core keeps this function. */
export function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

/**
 * This function gives the hash of a JSON document: the first 16 hex characters of the SHA-256 of its canonical JSON.
 * The document does not include its own field `hash`. The function removes that field before it calculates the hash.
 * The `documentHash` of the contract puts each number on a grid first, so it is not equal to this function. The hashes of the corpus files use this function.
 */
export function documentHash(value: object): string {
  const { hash: _hash, ...rest } = value as { hash?: unknown };
  return sha256Hex(canonicalJson(rest)).slice(0, 16);
}

/** This function gives the 32-bit FNV-1a hash of the UTF-8 bytes of a text, as an unsigned integer. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of utf8(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** This function gives the seed of one step of a generator: `fnv1a32("<seed>:<step>")`. */
export function stepSeed(seed: number, step: string): number {
  return fnv1a32(`${seed}:${step}`);
}

/** This function gives the generator `mulberry32` for a seed. Each call gives the next number from 0 to below 1. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** This function rounds a number to 3 decimals (a step of `RECORD_EPS`), as the files of a corpus keep it. The value `-0` becomes `0`. */
export function round3(value: number): number {
  const r = Math.round(value * 1000) / 1000;
  return r === 0 ? 0 : r;
}
