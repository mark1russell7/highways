// The parity test of the local copy of the portfolio combinator against `@mark1russell7/layout-contract` 0.2.6.
// Each case runs the copy and the contract on the same seeded members, levels and clock. The test compares the winner, the output,
// the trace, the kept sets, the errors and the reads of the clock.
import * as C from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "./hash.ts";
import { pickMoves, portfolio, selectBest, type Member, type PortfolioKey, type PortfolioOptions, type SelectCandidate, type SelectLevel } from "./portfolio-pick.ts";

type Out = { readonly id: string; readonly v: readonly number[] };
type Lib = { readonly portfolio: typeof portfolio; readonly selectBest: typeof selectBest };
const LOCAL: Lib = { portfolio, selectBest };
const CONTRACT: Lib = { portfolio: C.portfolio as unknown as typeof portfolio, selectBest: C.selectBest as unknown as typeof selectBest };

/** One seeded case: the members, the key and the options, with a log of each read of the clock. */
interface Case {
  readonly members: Member<number, Out>[];
  readonly key: PortfolioKey<number, Out>;
  readonly options: PortfolioOptions;
  readonly reads: number[];
}

/** This function picks one value of a list with the generator `r`. */
const one = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

/**
 * This function makes the case of a seed. The values come from a small set, so ties within the `minEffect` are frequent.
 * Some values are `NaN` or `Infinity`, and some members, levels and hashes throw. The clock steps by 0 to 3 ms at each read.
 */
function makeCase(seed: number): Case {
  const r = mulberry32(seed);
  const n = 1 + Math.floor(r() * 7);
  const levelCount = Math.floor(r() * 4);
  const odd = r() < 0.5;
  const value = (): number => (odd && r() < 0.06 ? one(r, [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) : one(r, [0, 0.002, 0.004, 0.008, 0.01, 0.5, 1, 2, -1]));
  const table = Array.from({ length: n }, () => ({
    hard: one(r, [0, 0, 0, 1, 2]),
    levels: Array.from({ length: levelCount }, value),
    runThrows: odd && r() < 0.12,
    hardThrows: odd && r() < 0.05,
    levelThrows: odd && r() < 0.05,
    hashThrows: odd && r() < 0.04,
    hashOf: one(r, ["h0", "h1", "h2"]),
  }));
  const members: Member<number, Out>[] = table.map((t, i) => ({
    id: `m${i}`,
    run: (input: number): Out => {
      if (t.runThrows) throw new Error(`member m${i} fails on ${input}`);
      return { id: `m${i}`, v: t.levels };
    },
  }));
  const at = (o: Out): (typeof table)[number] => table[Number(o.id.slice(1))]!;
  const key: PortfolioKey<number, Out> = {
    hard: (_i, o) => {
      if (at(o).hardThrows) throw new TypeError(`hard of ${o.id}`);
      return at(o).hard;
    },
    levels: Array.from({ length: levelCount }, (_, l) => ({
      id: `L${l}`,
      spec: { direction: one(r, ["lower", "higher"] as const), minEffect: one(r, [0, 0.005, { rel: 0.01 }, { rel: 0.5 }]) },
      value: (_i: number, o: Out): number => {
        if (l === levelCount - 1 && at(o).levelThrows) throw new Error(`level L${l} of ${o.id}`);
        return o.v[l]!;
      },
    })),
    ...(r() < 0.7
      ? {
          hash: (o: Out): string => {
            if (at(o).hashThrows) throw new Error(`hash of ${o.id}`);
            return at(o).hashOf;
          },
        }
      : {}),
  };
  const reads: number[] = [];
  let t = 1000 * r();
  const steps = Array.from({ length: 64 }, () => Math.floor(r() * 4));
  const now = (): number => {
    reads.push(t);
    t += steps[reads.length % steps.length]!;
    return t;
  };
  const options: PortfolioOptions = {
    now,
    ...(r() < 0.5 ? { budgetMs: one(r, [0, 1, 3, 6, 12]) } : {}),
    ...(r() < 0.35 ? { maxMembers: 1 + Math.floor(r() * n) } : {}),
  };
  return { members, key, options, reads };
}

/** The outcome of one pick: the pick, or the class, message and cause of its error, with the reads of the clock. */
function outcome(lib: Lib, seed: number, input: number, listForm: boolean): { readonly pick?: unknown; readonly error?: unknown; readonly reads: readonly number[] } {
  const c = makeCase(seed);
  try {
    const p = lib.portfolio(`p${seed}`, listForm ? c.members : () => c.members, c.key, c.options);
    return { pick: p.pick(input), reads: c.reads };
  } catch (e) {
    const err = e as { name?: string; message?: string; cause?: { message?: string } };
    return { error: { name: err.name, message: err.message, cause: err.cause?.message }, reads: c.reads };
  }
}

describe("the local copy of portfolio (layout-contract 0.2.6)", () => {
  it("gives the same pick, trace, errors and clock reads as the contract on 2000 seeded cases", () => {
    let budgetCuts = 0;
    let countCuts = 0;
    let errors = 0;
    let throws = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const listForm = seed % 3 !== 0;
      const a = outcome(LOCAL, seed, seed % 17, listForm);
      const b = outcome(CONTRACT, seed, seed % 17, listForm);
      expect(a, `seed ${seed}`).toEqual(b);
      const trace = (a.pick as { trace?: { deterministic: boolean; members: { status: string }[]; maxMembers?: number; cut: number } } | undefined)?.trace;
      if (trace && !trace.deterministic) budgetCuts++;
      if (trace?.maxMembers !== undefined && trace.cut > 0) countCuts++;
      if (trace?.members.some((m) => m.status === "error")) errors++;
      if (a.error !== undefined) throws++;
    }
    // Each kind of case occurs, so the parity covers it.
    expect(budgetCuts).toBeGreaterThan(50);
    expect(countCuts).toBeGreaterThan(50);
    expect(errors).toBeGreaterThan(50);
    expect(throws).toBeGreaterThan(5);
  });

  it("throws the same errors for bad options, bad levels and bad members", () => {
    const m: Member<number, Out> = { id: "a", run: () => ({ id: "m0", v: [] }) };
    const key: PortfolioKey<number, Out> = { hard: () => 0, levels: [] };
    const bad: [readonly Member<number, Out>[], PortfolioKey<number, Out>, PortfolioOptions][] = [
      [[], key, {}],
      [[m, m], key, {}],
      [[m], { ...key, levels: [{ id: "hard", spec: { direction: "lower" }, value: () => 0 }] }, {}],
      [[m], { ...key, levels: [{ id: "x", spec: { direction: "lower" }, value: () => 0 }, { id: "x", spec: { direction: "higher" }, value: () => 0 }] }, {}],
      [[m], key, { budgetMs: -1 }],
      [[m], key, { budgetMs: Number.NaN }],
      [[m], key, { maxMembers: 0 }],
      [[m], key, { maxMembers: 1.5 }],
    ];
    for (const [members, k, o] of bad) {
      const run = (lib: Lib): string => {
        try {
          lib.portfolio("p", members, k, o);
          return "no error";
        } catch (e) {
          return `${(e as Error).name}: ${(e as Error).message}`;
        }
      };
      expect(run(LOCAL)).toEqual(run(CONTRACT));
      expect(run(LOCAL)).toMatch(/^RangeError/);
    }
  });

  it("gives the same selection as the contract, also for the example of the drift", () => {
    const levels: SelectLevel[] = [
      { id: "a", spec: { direction: "lower", minEffect: 0.005 } },
      { id: "b", spec: { direction: "higher" } },
    ];
    const drift: SelectCandidate[] = [
      { id: "A", values: { a: 0, b: 1 } },
      { id: "B", values: { a: 0.004, b: 2 } },
      { id: "C", values: { a: 0.008, b: 3 } },
    ];
    expect(selectBest(drift, levels)).toEqual(C.selectBest(drift, levels));
    expect(selectBest(drift, levels).winner).toBe("B");
    const r = mulberry32(7);
    for (let n = 0; n < 500; n++) {
      const ls: SelectLevel[] = Array.from({ length: Math.floor(r() * 4) }, (_, l) => ({ id: `L${l}`, spec: { direction: r() < 0.5 ? "lower" : "higher", minEffect: one(r, [0, 0.005, { rel: 0.2 }]) } }));
      const cs: SelectCandidate[] = Array.from({ length: 1 + Math.floor(r() * 6) }, (_, i) => ({
        id: `c${i}`,
        values: Object.fromEntries(ls.map((l) => [l.id, r() < 0.03 ? Number.NaN : one(r, [0, 0.003, 0.006, 1, 1.004])])),
      }));
      const run = (lib: Lib): unknown => {
        try {
          return lib.selectBest(cs, ls);
        } catch (e) {
          return `${(e as Error).name}: ${(e as Error).message}`;
        }
      };
      expect(run(LOCAL)).toEqual(run(CONTRACT));
    }
    expect(() => selectBest([], levels)).toThrow(RangeError);
  });

  it("counts the move pick as the contract does", () => {
    expect(pickMoves({ picked: true })).toEqual(C.pickMoves({ picked: true }));
    expect(pickMoves({ picked: false })).toEqual(C.pickMoves({ picked: false }));
  });
});
