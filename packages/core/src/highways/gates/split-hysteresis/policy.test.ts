// The split policy at its limits, on made-up readings: the forced split, the split conditions, the exact press and merge timers,
// the merge size and relief, the demand rule, one relief for each end, `forgetLink` and stale timers, the input order, purity and determinism.
// Then the ends by id, the timers that count evaluations, a ranking with no unit and the option checks.
import { describe, expect, it } from "vitest";
import { SPLIT_DEFAULTS, decideSplits, forgetLink, newSplitMemory, type EndReading, type LinkReading, type Reading, type SplitMemory } from "./policy.ts";

const Y = 0.4;
const P = SPLIT_DEFAULTS.pressEvaluations;
const H = SPLIT_DEFAULTS.mergeEvaluations;

const end = (id: string, size: number, restSize: number, minSize: number, pressure: number): EndReading => ({ id, size, restSize, minSize, pressure });
/** An end with a high pressure, below its least size. */
const crushed = (id: string): EndReading => end(id, 0.05, 0.13, 0.08, 0.9);
/** A calm end at its rest size. */
const calm = (id: string): EndReading => end(id, 0.13, 0.13, 0.08, 0.05);
const link = (id: string, a: string, b: string, order: number, value: number, need: number, extra: Partial<LinkReading> = {}): LinkReading => ({
  id,
  a,
  b,
  order,
  closure: { value, need },
  ...extra,
});
const memJSON = (m: SplitMemory): string => JSON.stringify([m.evaluations, [...m.pressed], [...m.relaxed], [...m.split]]);

/** This function evaluates `count` readings. It gives the memory and the evaluation indices of each split and merge of `id`. */
function drive(memory: SplitMemory, count: number, readingAt: (i: number) => Reading, id: string): { memory: SplitMemory; split: number[]; merged: number[] } {
  const split: number[] = [];
  const merged: number[] = [];
  let m = memory;
  for (let i = 0; i < count; i++) {
    const at = m.evaluations;
    const r = decideSplits(readingAt(i), m);
    m = r.memory;
    if (r.decision.split.some((x) => x.id === id)) split.push(at);
    if (r.decision.merged.includes(id)) merged.push(at);
  }
  return { memory: m, split, merged };
}

describe("the split policy of the gate split-hysteresis", () => {
  it("changes nothing for an empty reading or a link without its ends, and its merge is harder than its split", () => {
    const r = decideSplits({ ends: [], links: [], yieldPressure: Y }, newSplitMemory());
    expect(r.decision).toEqual({ split: [], merged: [] });
    expect(memJSON(r.memory)).toBe(JSON.stringify([1, [], [], []]));
    const d = drive(newSplitMemory(), 100, () => ({ ends: [crushed("e0")], links: [link("l", "e0", "missing", 0, -1, 0.03)], yieldPressure: Y }), "l");
    expect(d.split).toEqual([]);
    expect(d.memory.pressed.size).toBe(0);
    expect(SPLIT_DEFAULTS.mergeEvaluations).toBeGreaterThan(SPLIT_DEFAULTS.pressEvaluations);
    expect(SPLIT_DEFAULTS.relief < 1 && SPLIT_DEFAULTS.mergeSize < 1).toBe(true);
    expect(SPLIT_DEFAULTS.unclosed).toBe(0);
  });

  it("splits a forced link at its first evaluation, one time, with no merge, and forgetLink resets it", () => {
    const forced = link("f", "e0", "missing", 0, 0, 0, { forced: true });
    const d = drive(newSplitMemory(), 300, (i) => ({ ends: [calm("e0")], links: [forced], yieldPressure: Y, demand: 10 - i / 100 }), "f");
    expect(d.split).toEqual([0]);
    expect(d.merged).toEqual([]);
    expect(d.memory.split.get("f")).toEqual({ since: 0, forced: true, reason: "forced" });
    const m = forgetLink(d.memory, "f");
    expect(m.split.has("f")).toBe(false);
    expect(m.evaluations).toBe(d.memory.evaluations);
    const again = decideSplits({ ends: [calm("e0")], links: [forced], yieldPressure: Y }, m);
    expect(again.decision.split.length).toBe(1);
    expect(again.decision.split[0]!.forced).toBe(true);
  });

  it("needs all the parts of a condition, and each condition alone splits at the pressEvaluations-th evaluation", () => {
    const run1 = (a: EndReading, b: EndReading, l: LinkReading): number[] => drive(newSplitMemory(), 120, () => ({ ends: [a, b], links: [l], yieldPressure: Y }), l.id).split;
    const closed = link("k", "e0", "e1", 0, 0.02, 0.01);
    const none: [string, EndReading, LinkReading][] = [
      ["no least size", end("e0", 0.05, 0.13, 0, 0.9), closed],
      ["size at the least size", end("e0", 0.08, 0.13, 0.08, 0.9), closed],
      ["pressure at the yield", end("e0", 0.05, 0.13, 0.08, Y), closed],
      ["no closure", calm("e0"), { id: "k", a: "e0", b: "e1", order: 0 }],
      ["closure need of 0", calm("e0"), link("k", "e0", "e1", 0, -0.01, 0)],
      ["closure value of 0 (touching)", calm("e0"), link("k", "e0", "e1", 0, 0, 0.03)],
    ];
    for (const [name, a, l] of none) expect(run1(a, calm("e1"), l), name).toEqual([]);
    expect(run1(crushed("e0"), calm("e1"), closed)).toEqual([P - 1]);
    expect(run1(calm("e0"), crushed("e1"), closed)).toEqual([P - 1]);
    expect(run1(calm("e0"), calm("e1"), link("k", "e0", "e1", 0, -1e-9, 0.03))).toEqual([P - 1]);
  });

  it("does not split after pressEvaluations - 1 pressed evaluations and one relief, and the timer starts again from 0", () => {
    const st = (on: boolean): Reading => ({ ends: [on ? crushed("e0") : calm("e0"), calm("e1")], links: [link("t", "e0", "e1", 0, 0.02, 0.01)], yieldPressure: Y });
    const a = drive(newSplitMemory(), P - 1, () => st(true), "t");
    const b = drive(a.memory, 1, () => st(false), "t");
    expect([...a.split, ...b.split]).toEqual([]);
    expect(b.memory.pressed.has("t")).toBe(false);
    const c = drive(b.memory, 2 * P, () => st(true), "t");
    expect(c.split).toEqual([2 * P - 1]);
    expect(c.memory.pressed.has("t")).toBe(false);
    expect(c.memory.split.get("t")?.reason).toBe("undersize");
  });

  it("merges on the mergeEvaluations-th calm evaluation exactly, starts again after a break, and needs the size, the relief and the demand", () => {
    const l = link("m", "e0", "e1", 0, 0.02, 0.01);
    const splitAt = (): SplitMemory => {
      const d = drive(newSplitMemory(), P, () => ({ ends: [crushed("e0"), calm("e1")], links: [l], yieldPressure: Y, demand: 2 }), "m");
      expect(d.memory.split.has("m"), "setup: no split").toBe(true);
      return d.memory;
    };
    const relief = (size: number, pressure: number, demand: number | undefined): Reading => ({
      ends: [end("e0", size, 0.13, 0.08, pressure), calm("e1")],
      links: [l],
      yieldPressure: Y,
      ...(demand === undefined ? {} : { demand }),
    });
    let d = drive(splitAt(), 2 * H, () => relief(0.13, 0.05, 1), "m");
    expect(d.merged).toEqual([P + H - 1]);
    expect(!d.memory.split.has("m") && !d.memory.relaxed.has("m") && !d.memory.pressed.has("m")).toBe(true);

    const part = drive(splitAt(), H - 1, () => relief(0.13, 0.05, 1), "m");
    const bump = drive(part.memory, 1, () => relief(0.13, 0.9, 1), "m");
    d = drive(bump.memory, 2 * H, () => relief(0.13, 0.05, 1), "m");
    expect(d.merged).toEqual([P + H + H - 1]);

    const none: [string, Reading][] = [
      ["size below mergeSize", relief(SPLIT_DEFAULTS.mergeSize * 0.13 - 1e-6, 0.05, 1)],
      ["pressure at relief times yield", relief(0.13, SPLIT_DEFAULTS.relief * Y, 1)],
      ["demand the same as at the split", relief(0.13, 0.05, 2)],
      ["demand higher than at the split", relief(0.13, 0.05, 3)],
    ];
    for (const [name, r] of none) expect(drive(splitAt(), 4 * H, () => r, "m").merged, name).toEqual([]);

    const edge = relief(SPLIT_DEFAULTS.mergeSize * 0.13, SPLIT_DEFAULTS.relief * Y - 1e-9, undefined);
    d = drive(splitAt(), 2 * H, () => edge, "m");
    expect(d.merged.length, "a merge at exactly mergeSize, just under relief, without a demand").toBe(1);

    const re = drive(d.memory, 2 * P, () => ({ ends: [crushed("e0"), calm("e1")], links: [l], yieldPressure: Y, demand: 2 }), "m");
    expect(re.split).toEqual([d.memory.evaluations + P - 1]);
  });

  it("gives no end two splits in one evaluation, puts unclosed before undersize, and splits pairs with no common end together", () => {
    const ends = ["e0", "e1", "e2", "e3", "e4"].map(crushed);
    const links = [0, 1, 2, 3].map((i) => link(`c${i}`, `e${i}`, `e${i + 1}`, i, 0.02, 0.01));
    let m = newSplitMemory();
    const all: string[] = [];
    for (let t = 0; t < P + 3; t++) {
      const r = decideSplits({ ends, links, yieldPressure: Y }, m);
      m = r.memory;
      const used = new Set<string>();
      for (const x of r.decision.split) {
        const l = links.find((z) => z.id === x.id)!;
        expect(!used.has(l.a) && !used.has(l.b), `evaluation ${t}: an end got two splits`).toBe(true);
        used.add(l.a);
        used.add(l.b);
        all.push(x.id);
      }
    }
    expect(all.length).toBe(4);
    expect(new Set(all).size).toBe(4);

    const st: Reading = {
      ends: [crushed("e0"), calm("e1"), calm("e2"), crushed("e3"), calm("e4")],
      links: [link("size", "e0", "e1", 5, 0.02, 0.01), link("band", "e1", "e2", 0, -0.01, 0.03), link("far", "e3", "e4", 1, 0.02, 0.01)],
      yieldPressure: Y,
    };
    let last = decideSplits(st, newSplitMemory());
    for (let t = 1; t < P; t++) last = decideSplits(st, last.memory);
    expect(last.decision.split.map((x) => x.id).sort()).toEqual(["band", "far"]);
    expect(last.decision.split.find((x) => x.id === "band")?.reason).toBe("unclosed");
  });

  it("drops the timer of a link that is absent for one evaluation, and forgetLink clears only its id", () => {
    const l = link("s", "e0", "e1", 0, 0.02, 0.01);
    const pressed: Reading = { ends: [crushed("e0"), calm("e1")], links: [l], yieldPressure: Y };
    const gone: Reading = { ends: [crushed("e0"), calm("e1")], links: [], yieldPressure: Y };
    const a = drive(newSplitMemory(), 30, () => pressed, "s");
    const b = decideSplits(gone, a.memory);
    expect(b.memory.pressed.has("s")).toBe(false);
    const c = drive(b.memory, 2 * P, () => pressed, "s");
    expect(c.split).toEqual([31 + P - 1]);

    const m: SplitMemory = {
      evaluations: 4,
      pressed: new Map([
        ["x", 1],
        ["y", 3],
      ]),
      relaxed: new Map([["x", 2]]),
      split: new Map([["x", { since: 0, forced: false, reason: "undersize" }]]),
    };
    const f = forgetLink(m, "x");
    expect(!f.split.has("x") && !f.pressed.has("x") && !f.relaxed.has("x")).toBe(true);
    expect(f.pressed.get("y")).toBe(3);
    expect(m.split.has("x"), "forgetLink changed its input").toBe(true);
  });

  it("gives the same result for a schedule of 300 evaluations two times and for any order of the links, and does not change its inputs", () => {
    const N = 7;
    const links = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
    ].map(([a, b], i) => link(`t${i}`, `e${a}`, `e${b}`, i, i === 2 ? -0.01 : 0.02, 0.01 + 0.005 * i));
    links.push(link("x", "e6", "missing", 6, 0, 0, { forced: true }));
    const at = (t: number, order: readonly number[]): Reading => ({
      ends: Array.from({ length: N }, (_, i) => ((t + 23 * i) % 140 < 70 ? crushed(`e${i}`) : calm(`e${i}`))),
      links: order.map((i) => links[i]!),
      yieldPressure: Y,
      demand: 10 - Math.floor(t / 60),
    });
    const play = (order: readonly number[]): string => {
      let m = newSplitMemory();
      const log: unknown[] = [];
      for (let t = 0; t < 300; t++) {
        const r = decideSplits(at(t, order), m);
        m = r.memory;
        log.push(r.decision);
      }
      return JSON.stringify(log) + memJSON(m);
    };
    const first = [0, 1, 2, 3, 4, 5, 6];
    const once = play(first);
    expect(play(first)).toBe(once);
    expect(play([6, 3, 0, 5, 1, 4, 2])).toBe(once);
    expect(once.includes("undersize") && once.includes("forced") && once.includes("unclosed")).toBe(true);

    const st = at(5, [6, 3, 0, 5, 1, 4, 2]);
    const before = JSON.stringify(st);
    const mem = drive(newSplitMemory(), 50, (i) => at(i, first), "t0").memory;
    const memBefore = memJSON(mem);
    decideSplits(st, mem);
    expect(JSON.stringify(st), "the reading changed").toBe(before);
    expect(memJSON(mem), "the memory changed").toBe(memBefore);
  });

  it("finds the ends by id, not by their place in the list", () => {
    const ids = ["north", "a-7", "z", "0042", "mid"];
    const links = [link("p", "north", "a-7", 0, 0.02, 0.01), link("q", "z", "0042", 1, -0.01, 0.03), link("r", "0042", "mid", 2, 0.02, 0.01)];
    const endsOf = (t: number): EndReading[] => ids.map((id, i) => ((t + 11 * i) % 90 < 50 ? crushed(id) : calm(id)));
    const play = (shuffle: (e: EndReading[]) => EndReading[]): string => {
      let m = newSplitMemory();
      const log: unknown[] = [];
      for (let t = 0; t < 200; t++) {
        const r = decideSplits({ ends: shuffle(endsOf(t)), links, yieldPressure: Y }, m);
        m = r.memory;
        log.push(r.decision);
      }
      return JSON.stringify(log) + memJSON(m);
    };
    const plain = play((e) => e);
    expect(play((e) => [...e].reverse())).toBe(plain);
    expect(play((e) => [e[3]!, e[0]!, e[4]!, e[1]!, e[2]!])).toBe(plain);
    expect(play((e) => [calm("unrelated"), ...e, calm("other")])).toBe(plain);
    expect(plain.includes('"p"') && plain.includes('"q"'), "the schedule did not split").toBe(true);
    expect(() => decideSplits({ ends: [calm("x"), calm("x")], links: [], yieldPressure: Y }, newSplitMemory())).toThrow(RangeError);
    expect(() => decideSplits({ ends: [], links: [link("d", "a", "b", 0, 0, 0), link("d", "a", "b", 1, 0, 0)], yieldPressure: Y }, newSplitMemory())).toThrow(RangeError);
  });

  it("counts evaluations in its timers, so a caller on any clock needs the same count of evaluations", () => {
    const l = link("c", "e0", "e1", 0, 0.02, 0.01);
    const reading: Reading = { ends: [crushed("e0"), calm("e1")], links: [l], yieldPressure: Y };
    // A caller that evaluates on the frames 0, 7, 14 and on. A timer of frame numbers splits after approximately P / 7 evaluations.
    let m = newSplitMemory();
    const frames: number[] = [];
    for (let k = 0; k < 2 * P; k++) {
      const r = decideSplits(reading, m);
      m = r.memory;
      if (r.decision.split.length > 0) frames.push(7 * k);
    }
    expect(frames).toEqual([7 * (P - 1)]);
    expect(m.evaluations).toBe(2 * P);
    expect(m.split.get("c")?.since).toBe(P - 1);
    // The same count with a different press option: the policy reads no clock.
    let q = newSplitMemory();
    let at = -1;
    for (let k = 0; k < 10 && at < 0; k++) {
      const r = decideSplits(reading, q, { pressEvaluations: 3, mergeEvaluations: 4 });
      q = r.memory;
      if (r.decision.split.length > 0) at = k;
    }
    expect(at).toBe(2);
  });

  it("ranks the candidates with no unit, so large sizes do not put undersize before unclosed", () => {
    // These sizes are in large units: an undersize gap of 300 units. A rank by the raw size puts it before the unclosed link.
    const big = (id: string): EndReading => end(id, 100, 500, 400, 0.9);
    const st: Reading = {
      ends: [big("e0"), end("e1", 500, 500, 400, 0.05), end("e2", 500, 500, 400, 0.05)],
      links: [link("size", "e0", "e1", 9, 10, 5), link("band", "e1", "e2", 0, -1, 30)],
      yieldPressure: Y,
    };
    let last = decideSplits(st, newSplitMemory());
    for (let t = 1; t < P; t++) last = decideSplits(st, last.memory);
    expect(last.decision.split.map((x) => x.id)).toEqual(["band"]);
  });

  it("throws a RangeError for a bad option, and the merge must take more evaluations than the split", () => {
    const r: Reading = { ends: [], links: [], yieldPressure: Y };
    expect(() => decideSplits(r, newSplitMemory(), { pressEvaluations: 0 })).toThrow(RangeError);
    expect(() => decideSplits(r, newSplitMemory(), { pressEvaluations: 10, mergeEvaluations: 10 })).toThrow(RangeError);
    expect(() => decideSplits(r, newSplitMemory(), { mergeSize: 1.5 })).toThrow(RangeError);
    expect(() => decideSplits(r, newSplitMemory(), { relief: 0 })).toThrow(RangeError);
    expect(() => decideSplits(r, newSplitMemory(), { unclosed: -1 })).toThrow(RangeError);
    expect(() => decideSplits(r, newSplitMemory(), { pressEvaluations: 2, mergeEvaluations: 3 })).not.toThrow();
  });
});
