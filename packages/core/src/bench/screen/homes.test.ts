// HOME-COPIES: the functions of the home packages give the same bits as the copies that they replace.
// The old copies stay in this test only, so that a change of a home shows here first.
import { fnv1a32 as homeFnv1a32, mulberry32 as homeMulberry32 } from "@mark1russell7/rigor-generators";
import { median as homeMedian } from "@mark1russell7/rigor-statistics";
import { describe, expect, it } from "vitest";
import { rng } from "../../fixtures.ts";
import { fnv1a32, mulberry32 } from "./hash.ts";

/** The old `mulberry32` of `hash.ts`. */
function oldMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The old `rng` of `fixtures.ts` and the other copies of `mulberry32` in the repository. */
function oldRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The old median of the scripts and the site: the middle value, or the midpoint of the two middle values. */
function oldMedian(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** The 1000 seeds of the test: small, negative, large, above 32 bits and not whole. */
const SEEDS: number[] = Array.from({ length: 1000 }, (_, i) => [i, -i, i * 2654435761, 2 ** 32 + i * 7919, i + 0.5, -i - 0.25, 2 ** 53 - i][i % 7]!);

/** This function gives 1000 well-formed strings from a seed: ASCII, two-byte, three-byte and four-byte characters. */
function strings(): string[] {
  const r = oldRng(7);
  const ranges: [number, number][] = [[0x20, 0x7f], [0x80, 0x7ff], [0x800, 0xd7ff], [0xe000, 0xffff], [0x10000, 0x10ffff]];
  return Array.from({ length: 1000 }, (_, i) => {
    let s = i % 3 === 0 ? `${i}:container` : "";
    const n = Math.floor(r() * 12);
    for (let k = 0; k < n; k++) {
      const [lo, hi] = ranges[Math.floor(r() * ranges.length)]!;
      s += String.fromCodePoint(lo + Math.floor(r() * (hi - lo + 1)));
    }
    return s;
  });
}

describe("HOME-COPIES: the home functions give the bits of the old copies", () => {
  it("gives the same 64 numbers of mulberry32 for each of 1000 seeds", () => {
    for (const seed of SEEDS) {
      const [a, b, c, d] = [oldMulberry32(seed), oldRng(seed), homeMulberry32(seed), mulberry32(seed)];
      const e = rng(seed);
      for (let k = 0; k < 64; k++) {
        const x = a();
        expect([b(), c(), d(), e()]).toEqual([x, x, x, x]);
      }
    }
  });

  it("gives the same fnv1a32 for 1000 well-formed strings", () => {
    for (const s of strings()) expect(homeFnv1a32(s)).toBe(fnv1a32(s));
  });

  it("gives another fnv1a32 for a lone surrogate, so the copy of fnv1a32 stays in hash.ts", () => {
    expect(homeFnv1a32("\uD800")).not.toBe(fnv1a32("\uD800"));
    expect(fnv1a32("\uD800")).toBe(1973925784);
  });

  it("gives the same median for 1000 lists of 1 to 40 values, with Infinity in some lists", () => {
    const r = oldRng(11);
    for (let i = 0; i < 1000; i++) {
      const n = 1 + Math.floor(r() * 40);
      const xs = Array.from({ length: n }, () => (r() < 0.05 ? Infinity : (r() - 0.3) * 10 ** Math.floor(r() * 12)));
      expect(Object.is(homeMedian(xs), oldMedian(xs))).toBe(true);
    }
  });
});
