// HOME-COPIES: the functions of the home packages give the same bits as the copies that they replace.
// The old copies stay in this test only, so that a change of a home shows here first.
import { fnv1a32 as homeFnv1a32, mulberry32 as homeMulberry32 } from "@mark1russell7/rigor-generators";
import { median as homeMedian, quantile } from "@mark1russell7/rigor-statistics";
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

/** The old `fnv1a32` of `hash.ts`: FNV-1a over the UTF-8 bytes of each code point. A lone surrogate gives its own 3 bytes. */
function oldWtf8Fnv1a32(text: string): number {
  const bytes: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  let h = 0x811c9dc5;
  for (const byte of bytes) {
    h ^= byte;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The old `fnv1a` of `corridors`: FNV-1a over the UTF-16 code units. */
function oldUtf16Fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The old upper median of `manifolds`, `fdeb` and `levels.ts`: the value at `Math.floor(n / 2)` of the sorted list, or 0 for none. */
function oldUpperMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
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

/** This function gives 1000 strings from a seed, with lone surrogates, surrogate pairs and the other ranges of code units. */
function surrogateStrings(): string[] {
  const r = oldRng(13);
  const ranges: [number, number][] = [[0x20, 0x7f], [0x80, 0x7ff], [0x800, 0xd7ff], [0xd800, 0xdbff], [0xdc00, 0xdfff], [0xe000, 0xffff]];
  return Array.from({ length: 1000 }, (_, i) => {
    let s = i % 4 === 0 ? `${i}:edge` : "";
    const n = Math.floor(r() * 12);
    for (let k = 0; k < n; k++) {
      if (r() < 0.2) s += String.fromCodePoint(0x10000 + Math.floor(r() * 0x100000));
      else {
        const [lo, hi] = ranges[Math.floor(r() * ranges.length)]!;
        s += String.fromCharCode(lo + Math.floor(r() * (hi - lo + 1)));
      }
    }
    return s;
  });
}

/** The hand-made strings of the hash tests: lone high and low surrogates, two high surrogates, one pair and the empty string. */
const EDGE_TEXTS = ["\uD800", "\uDFFF", "a\uDC00b", "\uD800\uD800", "\uDBFF\uDFFF", ""];

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

  it("gives another fnv1a32 for a lone surrogate with the default input, so hash.ts uses the input wtf8", () => {
    expect(homeFnv1a32("\uD800")).not.toBe(fnv1a32("\uD800"));
    expect(fnv1a32("\uD800")).toBe(1973925784);
  });

  it("gives the old fnv1a32 of hash.ts with the input wtf8, for 1000 strings with lone surrogates", () => {
    for (const s of [...surrogateStrings(), ...EDGE_TEXTS]) {
      const old = oldWtf8Fnv1a32(s);
      expect([homeFnv1a32(s, { input: "wtf8" }), fnv1a32(s)]).toEqual([old, old]);
    }
  });

  it("gives the old fnv1a of corridors with the input utf16, for 1000 strings with lone surrogates", () => {
    for (const s of [...surrogateStrings(), ...EDGE_TEXTS]) expect(homeFnv1a32(s, { input: "utf16" })).toBe(oldUtf16Fnv1a(s));
  });

  it("gives the old upper median with quantile and the method higher, for 1000 lists of 1 to 40 values", () => {
    const r = oldRng(17);
    for (let i = 0; i < 1000; i++) {
      const n = 1 + Math.floor(r() * 40);
      const xs = Array.from({ length: n }, () => (r() < 0.05 ? Infinity : (r() - 0.3) * 10 ** Math.floor(r() * 12)));
      expect(Object.is(quantile(xs, 0.5, "higher"), oldUpperMedian(xs))).toBe(true);
    }
    for (const xs of [[1, 2], [4, 3, 2, 1], [5, 1, 3, 2, 4, 6], [-0, 0], [0, -0]]) expect(Object.is(quantile(xs, 0.5, "higher"), oldUpperMedian(xs))).toBe(true);
    expect(oldUpperMedian([])).toBe(0);
  });

  it("gives the same first 5 numbers of mulberry32 for the seeds 0, 1 and 12345", () => {
    for (const seed of [0, 1, 12345]) {
      const [a, b, c] = [oldRng(seed), homeMulberry32(seed), rng(seed)];
      for (let k = 0; k < 5; k++) {
        const x = a();
        expect([b(), c()]).toEqual([x, x]);
      }
    }
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
