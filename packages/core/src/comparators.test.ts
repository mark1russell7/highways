import { describe, expect, it } from "vitest";
import { byHash, byText, type Hashed } from "./compare.ts";
import { rng } from "./fixtures.ts";
import type { Point } from "./geom.ts";
import { byBundle, byEdge, byRun, hasCycle, mergeSort, observeLanes, type Placed } from "./lane-order.ts";
import type { Route } from "./model.ts";
import { orderLanes } from "./segments.ts";

// LANE-ORDER: a comparator of `Array.prototype.sort` must be a total order, so that the sort gives the same result on each engine.
// The JavaScript specification does not define the result of a sort with a compare function that is not consistent.
// The relations of the lane order are not total orders. Thus `orderLanes` sorts with the merge sort of the package.

/** A pair or a triple of values that breaks a rule of a total order, with the name of the rule. */
interface Counterexample<T> {
  readonly rule: "reflexive" | "antisymmetric" | "transitive";
  readonly values: readonly T[];
}

/**
 * This function looks for a counterexample to a total order on random values of `make`.
 * The rules: `c(a, a) = 0`, `sign(c(a, b)) = -sign(c(b, a))`, and `c(a, b) <= 0` with `c(b, c) <= 0` gives `c(a, c) <= 0`.
 */
function counterexample<T>(compare: (a: T, b: T) => number, make: (r: () => number) => T, trials = 2000, seed = 1): Counterexample<T> | undefined {
  const r = rng(seed);
  const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);
  for (let t = 0; t < trials; t++) {
    const a = make(r);
    const b = make(r);
    const c = make(r);
    if (sign(compare(a, a)) !== 0) return { rule: "reflexive", values: [a] };
    for (const [x, y] of [
      [a, b],
      [b, c],
      [a, c],
    ] as const)
      if (sign(compare(x, y)) !== -sign(compare(y, x))) return { rule: "antisymmetric", values: [x, y] };
    for (const [x, y, z] of [
      [a, b, c],
      [a, c, b],
      [b, a, c],
      [b, c, a],
      [c, a, b],
      [c, b, a],
    ] as const)
      if (compare(x, y) <= 0 && compare(y, z) <= 0 && !(compare(x, z) <= 0)) return { rule: "transitive", values: [x, y, z] };
  }
  return undefined;
}

const RUN: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

/** A route through `RUN`, with the points before the run (the nearest first) and the points after the run. */
function through(edge: string, before: readonly [number, number][], after: readonly [number, number][]): Placed {
  const p = [...[...before].reverse().map(([x, y]) => ({ x, y })), ...RUN, ...after.map(([x, y]) => ({ x, y }))];
  return { edge, p, s: before.length, e: before.length + RUN.length - 1 };
}

/** This function makes a random route through `RUN`. The points are on a coarse grid, so two routes often go on together. */
function randomPlaced(r: () => number, edge: string): Placed {
  const ys = [-100, -50, 0, 50, 100];
  const tail = (xs: readonly number[]): [number, number][] => xs.slice(0, Math.floor(r() * (xs.length + 1))).map((x) => [x, ys[Math.floor(r() * ys.length)]!]);
  return through(edge, tail([-100, -200]), tail([200, 300]));
}

/** This function gives the route of a placed route, in the direction of the run or in the other direction. */
const routeOf = (P: Placed, reverse: boolean): Route => ({ edge: P.edge, points: reverse ? [...P.p].reverse() : [...P.p] });

/** This function gives each order of a list. */
function permutations<T>(list: readonly T[]): T[][] {
  if (list.length <= 1) return [[...list]];
  return list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/** This function gives true when the relation `compare` on the lanes, in the order of their edges, has no cycle. */
function acyclic(lanes: readonly Placed[], compare: (P: Placed, Q: Placed) => number): boolean {
  const sorted = [...lanes].sort(byEdge);
  return !hasCycle(sorted.length, (i, j) => compare(sorted[i]!, sorted[j]!));
}

describe("the named comparators", () => {
  it("byText is a total order", () => {
    const alphabet = ["a", "b", "B", "e1", "e10", "e2", ""];
    expect(counterexample(byText, (r) => alphabet[Math.floor(r() * alphabet.length)]! + alphabet[Math.floor(r() * alphabet.length)]!)).toBeUndefined();
  });

  it("byHash is a total order", () => {
    const make = (r: () => number): Hashed => ({ h: Math.floor(r() * 4), e: { id: `e${Math.floor(r() * 6)}` } });
    expect(counterexample(byHash, make)).toBeUndefined();
  });

  it("byEdge is a total order", () => {
    expect(counterexample(byEdge, (r) => randomPlaced(r, `e${Math.floor(r() * 6)}`))).toBeUndefined();
  });

  it("byRun and byBundle are antisymmetric on the routes of one run", () => {
    for (const compare of [byRun, byBundle]) {
      const found = counterexample(compare, (r) => randomPlaced(r, `e${Math.floor(r() * 1e6)}`));
      expect(found?.rule === "antisymmetric" || found?.rule === "reflexive" ? found : undefined).toBeUndefined();
    }
  });

  // The item LANE-STRETCH is to give one order to each stretch, and thus to remove the cycles.
  it("byRun and byBundle are not transitive, so orderLanes does not give them to the sort of the engine", () => {
    for (const compare of [byRun, byBundle]) expect(counterexample(compare, (r) => randomPlaced(r, `e${Math.floor(r() * 1e6)}`))?.rule).toBe("transitive");
  });
});

describe("mergeSort and hasCycle", () => {
  it("give the order of the sort of the engine, and no cycle, for a total order", () => {
    const r = rng(5);
    for (let t = 0; t < 500; t++) {
      const list = Array.from({ length: Math.floor(r() * 12) }, () => ({ key: Math.floor(r() * 5), id: Math.floor(r() * 1e6) }));
      const compare = (a: (typeof list)[number], b: (typeof list)[number]): number => a.key - b.key || a.id - b.id;
      expect(mergeSort(list, compare)).toEqual([...list].sort(compare));
      expect(hasCycle(list.length, (i, j) => compare(list[i]!, list[j]!))).toBe(false);
    }
  });

  it("keep the input order of equal items", () => {
    const list = [3, 1, 2, 1, 3, 2].map((key, id) => ({ key, id }));
    expect(mergeSort(list, (a, b) => a.key - b.key).map((x) => x.id)).toEqual([1, 3, 2, 5, 0, 4]);
  });

  it("give one result for a cycle of 3, with the pairs in the order of the list", () => {
    // 0 before 1, 1 before 2, 2 before 0.
    const before = (a: number, b: number): number => ((a + 1) % 3 === b ? -1 : 1);
    const pairs: string[] = [];
    expect(mergeSort([0, 1, 2], (a, b) => (pairs.push(`${a}${b}`), before(a, b)))).toEqual([0, 1, 2]);
    expect(pairs).toEqual(["12", "01"]);
    expect(hasCycle(3, before)).toBe(true);
  });
});

describe("orderLanes as a whole", () => {
  // p ends at the run and comes from y = -50. q comes from y = 50 and goes up after the run. r comes from y = -100 and goes down after the run.
  // The relation: p before q (before the run), q before r (after the run), and r before p (before the run). Thus the three lanes make a cycle.
  const p = through("p", [[-100, -50]], []);
  const q = through("q", [[-100, 50]], [[200, -100]]);
  const r = through("r", [[-100, -100]], [[200, 100]]);

  it("finds the cycle of three lanes in the relation of the order `run`", () => {
    expect(byRun(p, q)).toBeLessThan(0);
    expect(byRun(q, r)).toBeLessThan(0);
    expect(byRun(r, p)).toBeLessThan(0);
  });

  it("gives a cyclic run a fixed order for each order of the input routes, without the sort of the engine", () => {
    // The order on a cyclic run depends on the order of the input routes: the first route stays first. The merge sort gives these orders on each engine.
    const expected: Record<string, string> = { pqr: "p,q,r", prq: "p,q,r", qpr: "q,r,p", qrp: "q,r,p", rpq: "r,p,q", rqp: "r,p,q" };
    const seen: boolean[] = [];
    observeLanes((start, compare, lanes) => seen.push(lanes.length === 3 && hasCycle(3, (i, j) => compare(start[i]!, start[j]!))));
    const sort = Array.prototype.sort;
    // The sort of the engine with a compare function must not run. The default sort of strings is a total order.
    Array.prototype.sort = function (this: unknown[], compare?: (a: unknown, b: unknown) => number) {
      if (compare !== undefined && compare !== byEdge) throw new Error("orderLanes called the sort of the engine");
      return sort.call(this, compare);
    } as typeof sort;
    try {
      for (const list of permutations([p, q, r])) {
        const name = list.map((x) => x.edge).join("");
        expect(orderLanes(RUN, list.map((x, i) => routeOf(x, i === 1)), "run").join(","), name).toBe(expected[name]);
      }
      // The order `bundle` starts from the order of the edges, so each order of the input routes gives one result. Its relation has no cycle here.
      const bundle = new Set(permutations([p, q, r]).map((list) => orderLanes(RUN, list.map((x) => routeOf(x, false)), "bundle").join(",")));
      expect([...bundle]).toEqual(["r,p,q"]);
    } finally {
      Array.prototype.sort = sort;
      observeLanes(undefined);
    }
    expect(seen).toEqual([true, true, true, true, true, true, false, false, false, false, false, false]);
  });

  it("gives the same order for each order of the input routes, on random runs with no cycle", () => {
    const rand = rng(11);
    let checked = 0;
    for (let t = 0; t < 300; t++) {
      const n = 2 + Math.floor(rand() * 5);
      const lanes = Array.from({ length: n }, (_, i) => randomPlaced(rand, `e${i}${Math.floor(rand() * 100)}`));
      for (const [order, compare] of [
        ["run", byRun],
        ["bundle", byBundle],
      ] as const) {
        if (!acyclic(lanes, compare)) continue;
        checked++;
        const first = orderLanes(RUN, lanes.map((x) => routeOf(x, false)), order);
        for (let k = 0; k < 4; k++) {
          const shuffled = lanes.map((x) => ({ x, key: rand() })).sort((a, b) => a.key - b.key).map((a) => a.x);
          expect(orderLanes(RUN, shuffled.map((x) => routeOf(x, rand() < 0.5)), order)).toEqual(first);
        }
      }
    }
    expect(checked).toBeGreaterThan(400);
  });

  it("gives the order of the sort of before LANE-ORDER on each random run with no cycle", () => {
    const rand = rng(13);
    let checked = 0;
    for (let t = 0; t < 600; t++) {
      const n = 2 + Math.floor(rand() * 6);
      const lanes = Array.from({ length: n }, (_, i) => randomPlaced(rand, `e${i}${Math.floor(rand() * 100)}`));
      for (const [order, compare] of [
        ["run", byRun],
        ["bundle", byBundle],
      ] as const) {
        if (!acyclic(lanes, compare)) continue;
        checked++;
        // The sort of before LANE-ORDER: `run` sorted the routes in their input order, and `bundle` sorted them first by their edges.
        const start = order === "run" ? [...lanes] : [...lanes].sort(byEdge);
        const before = start.sort(compare).map((x) => x.edge);
        expect(orderLanes(RUN, lanes.map((x) => routeOf(x, false)), order)).toEqual(before);
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});
