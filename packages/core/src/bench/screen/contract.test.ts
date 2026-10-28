/*
 * The fit of the input and record types of highways to the shared types of `@mark1russell7/layout-contract`.
 *
 * The type checks compile only while each claim holds. `pnpm typecheck` examines them. Each known gap has a
 * `@ts-expect-error` with its id. When the gap closes, the directive has no error, and the typecheck fails.
 * Then remove the directive, and the gap from the list in `docs/LAYOUT-RECORDS.md`.
 */
import * as C from "@mark1russell7/layout-contract";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countOverlaps } from "../links.ts";
import { TOLERANCE } from "../properties.ts";
import {
  inputGraph,
  type LayoutBox,
  type LayoutCell,
  type LayoutContainer,
  type LayoutEdge,
  type LayoutGenerator,
  type LayoutInput,
  type LayoutObstacle,
  type LayoutPort,
  type LayoutRecord,
  type LayoutSide,
  type Region,
  type RouteInput,
} from "./forms.ts";
import { compareMeasure, minEffectOf, type CompareSpec, type MeasureCompare, type MinEffect } from "./compare.ts";
import { mulberry32, RECORD_EPS, round3 } from "./hash.ts";
import { screen } from "./screen.ts";
import { screenInputs } from "./set.ts";

/** This type is `true` when the type `A` fits the type `B`. */
type Fits<A, B> = [A] extends [B] ? true : false;

/** This type is `true` when the type `T` has the key `K`. */
type Has<T, K extends PropertyKey> = K extends keyof T ? true : false;

/** This function compiles only when its type argument is `true`. It does nothing at run time. */
function holds<T extends true>(): T | undefined {
  return undefined;
}

// The parts that fit in the two directions.
holds<Fits<LayoutSide, C.Side>>();
holds<Fits<C.Side, LayoutSide>>();
holds<Fits<Region, C.Region>>();
holds<Fits<C.Region, Region>>();
holds<Fits<LayoutObstacle, C.Obstacle>>();
holds<Fits<C.Obstacle, LayoutObstacle>>();
holds<Fits<LayoutEdge, C.LayoutEdge>>();
holds<Fits<C.LayoutEdge, LayoutEdge>>();
holds<Fits<LayoutContainer, C.LayoutContainer>>();
holds<Fits<C.LayoutContainer, LayoutContainer>>();
holds<Fits<C.Port, LayoutPort>>();
holds<Fits<LayoutPort, C.Port>>();
holds<Fits<LayoutCell, C.LayoutCell>>();
holds<Fits<C.LayoutCell, LayoutCell>>();
holds<Fits<LayoutGenerator, C.LayoutGenerator>>();
holds<Fits<C.LayoutGenerator, LayoutGenerator>>();
holds<Fits<LayoutBox["locked"], C.LayoutBox["locked"]>>();
holds<Fits<C.LayoutBox["locked"], LayoutBox["locked"]>>();
holds<Fits<LayoutRecord["tolerance"], C.LayoutRecord["tolerance"]>>();
holds<Fits<C.LayoutRecord["tolerance"], LayoutRecord["tolerance"]>>();

// From highways to the contract: a file of highways, read with the contract types.
holds<Fits<LayoutRecord, C.LayoutRecord>>();
holds<Fits<LayoutBox, C.LayoutBox>>();
holds<Fits<LayoutInput, C.LayoutInput>>();
// G1 is closed: the `side` of a port is optional in the two packages.
holds<Fits<LayoutPort["side"], C.Port["side"]>>();
// G2 is closed: a contract input without a container is correct.
holds<Fits<LayoutInput["container"], C.LayoutInput["container"]>>();
// G3 is closed: the contract has the change `packed`.
holds<Fits<LayoutInput["change"], C.LayoutInput["change"]>>();

// From the contract to highways: a file of the contract, for example the result of `applyPack`, read by highways.
holds<Fits<C.LayoutBox, LayoutBox>>();
holds<Fits<C.LayoutRecord, LayoutRecord>>();
// G4 is closed: `locked` is a boolean in the two packages.
holds<Fits<C.LayoutBox["locked"], LayoutBox["locked"]>>();
// G5 is closed: `inputGraph` reads only the fields of `RouteInput`. A contract input and the result of `applyPack` fit it.
holds<Fits<C.LayoutInput, RouteInput>>();
holds<Fits<ReturnType<typeof C.applyPack>, Parameters<typeof inputGraph>[0]>>();
// G6 is closed: `ms` is necessary in the two packages.
holds<Fits<C.LayoutRecord["ms"], LayoutRecord["ms"]>>();

// The fields that only one side has. An assignment keeps them, but the other side does not read them.
// @ts-expect-error G7: highways has no `margin` on a box.
holds<Has<LayoutBox, "margin">>();
// @ts-expect-error G7: highways has no `turnable` on a box.
holds<Has<LayoutBox, "turnable">>();
// @ts-expect-error G7: highways has no `inset` on a container.
holds<Has<LayoutContainer, "inset">>();
// @ts-expect-error G7: highways has no `aspectWeight` on a container.
holds<Has<LayoutContainer, "aspectWeight">>();
// G10 is closed: the contract has `compareMeasure` and `minEffectOf` from 0.2.2. highways keeps its own copy in `compare.ts`.
// The label of a compare is the `Verdict` of the contract.
holds<Fits<MeasureCompare, C.Verdict>>();
holds<Fits<C.Verdict, MeasureCompare>>();
// The spec of a compare of highways is the part of `MeasureSpec` that the contract reads.
holds<Fits<CompareSpec, Parameters<typeof C.compareMeasure>[2]>>();
holds<Fits<Parameters<typeof C.compareMeasure>[2], CompareSpec>>();
holds<Fits<MinEffect, NonNullable<C.MeasureSpec["minEffect"]>>>();
holds<Fits<NonNullable<C.MeasureSpec["minEffect"]>, MinEffect>>();
// The two functions have the same types.
holds<Fits<typeof compareMeasure, typeof C.compareMeasure>>();
holds<Fits<typeof C.compareMeasure, typeof compareMeasure>>();
holds<Fits<typeof minEffectOf, typeof C.minEffectOf>>();
holds<Fits<typeof C.minEffectOf, typeof minEffectOf>>();
// G8 is closed: the contract has `data` on a box, `generator`, `cell` and `step` on an input, and `skipped` on a record.
holds<Has<C.LayoutBox, "data">>();
holds<Has<C.LayoutInput, "generator">>();
holds<Has<C.LayoutInput, "cell">>();
holds<Has<C.LayoutInput, "step">>();
holds<Has<C.LayoutRecord, "skipped">>();

/** The floor and the tolerance of each row of the table "The floors" in `docs/PROMOTION.md`, by the name of the measure. */
function promotionFloors(): Map<string, { floor: number; tol: number }> {
  const text = readFileSync(new URL("../../../../../docs/PROMOTION.md", import.meta.url), "utf8");
  const rows = new Map<string, { floor: number; tol: number }>();
  for (const m of text.matchAll(/^\| `([\w.]+)\.floor` = ([\d.]+) \| `\1\.tol` = ([\d.]+)/gm)) rows.set(m[1]!, { floor: Number(m[2]), tol: Number(m[3]) });
  return rows;
}

const inputs = screenInputs();

describe("the fit of highways to layout-contract", () => {
  it("keeps the tolerance of the shared rule `through`", () => {
    expect(TOLERANCE).toBe(C.DEFAULT_TOLERANCE.through);
    expect(TOLERANCE).toBe(0.5);
  });

  it("rounds the numbers of a file within `RECORD_EPS`", () => {
    // G9: the epsilon of highways is the epsilon of the contract.
    expect(RECORD_EPS).toBe(C.RECORD_EPS);
    for (const v of [0, 0.0004, 0.0005, 1.23456, -7.8999, 123.4565, 1e6 / 3]) expect(Math.abs(round3(v) - v)).toBeLessThanOrEqual(C.RECORD_EPS / 2 + 1e-12);
  });

  it("gives screen-v1 inputs that pass the rules of the contract", () => {
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      const own: C.LayoutInput = input;
      const boxes = own.boxes;
      expect(boxes.every((b) => C.placedRect(b) !== undefined)).toBe(true);
      expect(C.countPortsOffBorder(boxes)).toBe(0);
      // The two counts of the overlaps agree at the same tolerance.
      expect(C.countOverlaps(boxes, TOLERANCE)).toBe(countOverlaps(inputGraph(input).nodes.map((n) => n.box)));
      // G2: an input without a container gets a free container.
      expect(C.toPackInput(own).container).toEqual(input.container ?? { fixed: "none" });
      expect(C.toPackInput(own).items.map((b) => b.id)).toEqual(input.boxes.map((b) => b.id));
      // A pack that keeps each position gives the same boxes.
      const placements = boxes.map((b) => ({ id: b.id, x: b.x!, y: b.y! }));
      const packed = C.applyPack(own, { placements, overflow: [], size: { w: 0, h: 0 }, moved: [] });
      expect(packed.boxes).toEqual(boxes);
      // G5: the router reads the result of `applyPack` as the same graph.
      expect(inputGraph(packed)).toEqual(inputGraph(input));
    }
  });

  it("reads a contract input without edges as a graph without edges", () => {
    const tiny = inputs.find((i) => i.id === "screen-v1/tiny-uniform/s0")!;
    const own: C.LayoutInput = { schema: "layout-input/1", id: tiny.id, boxes: tiny.boxes };
    expect(inputGraph(own).edges).toEqual([]);
    expect(inputGraph(own).nodes).toEqual(inputGraph(tiny).nodes);
  });

  it("keeps a box with `locked: false` as a box of the graph", () => {
    const tiny = inputs.find((i) => i.id === "screen-v1/tiny-uniform/s0")!;
    const open = { ...tiny, boxes: tiny.boxes.map((b) => ({ ...b, locked: false })) };
    expect(inputGraph(open)).toEqual(inputGraph(tiny));
  });

  it("keeps the floors of the packer and the joint measures out of `docs/PROMOTION.md`", () => {
    const floors = promotionFloors();
    expect([...floors.keys()].sort()).toEqual(["B6", "R1"]);
    // `MEASURE_SPECS` of `packing` and `JOINT_MEASURES` of the contract are the one source of the other floors.
    expect(C.JOINT_MEASURES.length).toBeGreaterThan(0);
    for (const spec of C.JOINT_MEASURES) expect(floors.has(spec.id)).toBe(false);
  });

  it("gives a record of screen-v1 that is a contract record", () => {
    const tiny = inputs.find((i) => i.id === "screen-v1/tiny-uniform/s0")!;
    const { records } = screen("router", ["corners"], { inputs: [tiny], baseline: false });
    expect(records.length).toBeGreaterThan(0);
    for (const own of records) {
      const record: C.LayoutRecord = own;
      expect(record.schema).toBe("layout-record/1");
      expect(record.stage).toBe("route");
      expect(record.inputHash).toBe(tiny.hash);
      expect(record.tolerance?.through).toBe(C.DEFAULT_TOLERANCE.through);
      for (const n of Object.values(record.hard)) expect(Number.isInteger(n) && n >= 0).toBe(true);
      // The contract names the measures of a router `route.*`.
      for (const key of Object.keys(record.measures)) expect(key.startsWith("route.")).toBe(true);
    }
  });
});

/** The result of a call, or the name of its error. */
function outcome<T>(f: () => T): T | string {
  try {
    return f();
  } catch (e) {
    return e instanceof Error ? e.name : "error";
  }
}

/** The cases of `compare.test.ts`: the values `a` and `b` and a spec. */
const COMPARE_CASES: readonly [number, number, CompareSpec][] = (() => {
  const lower: CompareSpec = { direction: "lower" };
  const higher: CompareSpec = { direction: "higher" };
  const rel: CompareSpec = { direction: "lower", minEffect: { rel: 0.01 } };
  const cases: [number, number, CompareSpec][] = [
    [1.152043, 1.152046, lower],
    [1, 1 + RECORD_EPS, lower],
    [100, 101, rel],
    [1.148957, 1.152046, lower],
    [1.148957, 1.152046, higher],
    [0.22239, 0.209678, higher],
    [0.22239, 0.209678, lower],
    [100, 102.5, rel],
    [Infinity, Infinity, lower],
    [-Infinity, -Infinity, higher],
    [5, Infinity, lower],
    [Infinity, 5, rel],
    [Number.NaN, 1, lower],
    [1, Number.NaN, lower],
  ];
  const specs: CompareSpec[] = [lower, higher, rel, { direction: "higher", minEffect: 0.2 }];
  const pairs: [number, number][] = [[1, 1.0005], [1, 1.5], [100, 101], [100, 103], [0, 0.3], [-2, 2]];
  for (const spec of specs) for (const [a, b] of pairs) cases.push([a, b, spec], [b, a, spec]);
  return cases;
})();

/** The cases of `minEffectOf` in `compare.test.ts`: a spec and the values `a` and `b`. */
const MIN_EFFECT_CASES: readonly [CompareSpec["minEffect"], number, number][] = [
  [undefined, 0, 0],
  [0, 0, 0],
  [0.0001, 0, 0],
  [0.5, 3, 4],
  [{ rel: 0.01 }, 100, 200],
  [{ rel: 0.01 }, 200, 100],
  [{ rel: 0.01 }, -300, 10],
  [{ rel: 0.01 }, 0.01, 0.02],
  [{ rel: 0.01 }, Infinity, 1],
  [{ rel: 0.01 }, 1, Number.NaN],
];

/** This function gives `count` seeded random pairs with a spec. The pairs include ties, values at the threshold, infinite values and integers. */
function randomCompareCases(seed: number, count: number): [number, number, CompareSpec][] {
  const r = mulberry32(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const value = (): number => {
    const u = r();
    if (u < 0.1) return pick([0, Infinity, -Infinity, RECORD_EPS, -RECORD_EPS, 1]);
    if (u < 0.3) return Math.floor(r() * 11) - 5;
    const v = (r() < 0.2 ? -1 : 1) * 10 ** (r() * 10 - 4);
    return r() < 0.5 ? round3(v) : v;
  };
  const minEffect = (): MinEffect | undefined => {
    const u = r();
    if (u < 0.15) return undefined;
    if (u < 0.25) return pick([0, 1, 2, Infinity, -1, Number.NaN, RECORD_EPS]);
    if (u < 0.55) return 10 ** (r() * 7 - 5);
    if (u < 0.65) return { rel: pick([0, 1, Infinity, -0.01]) };
    return { rel: 10 ** (r() * 4 - 4) };
  };
  const cases: [number, number, CompareSpec][] = [];
  for (let i = 0; i < count; i++) {
    const m = minEffect();
    const direction = r() < 0.5 ? "lower" : "higher";
    const spec: CompareSpec = m === undefined ? { direction } : { direction, minEffect: m };
    const a = value();
    const u = r();
    let b: number;
    if (u < 0.15) b = a;
    else if (u < 0.5) {
      // A value near the threshold of the compare, on one of the two sides.
      const t = minEffectOf(spec, a, a);
      b = a + (r() < 0.5 ? -1 : 1) * t * pick([0.5, 0.999, 1, 1.001, 2]);
    } else b = value();
    cases.push([a, b, spec]);
  }
  return cases;
}

describe("the copy of compareMeasure and minEffectOf in highways agrees with layout-contract (G10)", () => {
  it("gives the results of the contract for the cases of compare.test.ts", () => {
    for (const [a, b, spec] of COMPARE_CASES) {
      expect(outcome(() => compareMeasure(a, b, spec)), `compareMeasure(${a}, ${b}, ${JSON.stringify(spec)})`).toBe(outcome(() => C.compareMeasure(a, b, spec)));
    }
    for (const [m, a, b] of MIN_EFFECT_CASES) {
      const spec = m === undefined ? {} : { minEffect: m };
      expect(minEffectOf(spec, a, b), `minEffectOf(${JSON.stringify(spec)}, ${a}, ${b})`).toBe(C.minEffectOf(spec, a, b));
    }
    expect(minEffectOf({})).toBe(C.minEffectOf({}));
  });

  it("gives the results of the contract for 5000 seeded random pairs, in the two directions and after a swap", () => {
    const seen = new Map<string, number>();
    const differences: string[] = [];
    for (const [a, b, spec] of randomCompareCases(20261027, 5000)) {
      for (const direction of ["lower", "higher"] as const) {
        const s: CompareSpec = { ...spec, direction };
        for (const [x, y] of [[a, b], [b, a]] as const) {
          const own = outcome(() => compareMeasure(x, y, s));
          const theirs = outcome(() => C.compareMeasure(x, y, s));
          seen.set(String(own), (seen.get(String(own)) ?? 0) + 1);
          if (own !== theirs) differences.push(`compareMeasure(${x}, ${y}, ${JSON.stringify(s)}): ${String(own)} and ${String(theirs)}`);
          if (!Object.is(minEffectOf(s, x, y), C.minEffectOf(s, x, y))) differences.push(`minEffectOf(${JSON.stringify(s)}, ${x}, ${y})`);
        }
      }
    }
    expect(differences).toEqual([]);
    // The pairs reach each result.
    for (const label of ["better", "worse", "tie"]) expect(seen.get(label) ?? 0).toBeGreaterThan(1000);
  });

  it("refuses NaN in the two functions", () => {
    for (const [a, b] of [[Number.NaN, 1], [1, Number.NaN], [Number.NaN, Number.NaN]] as const) {
      expect(() => compareMeasure(a, b, { direction: "lower" })).toThrow(RangeError);
      expect(() => C.compareMeasure(a, b, { direction: "lower" })).toThrow(RangeError);
    }
  });
});
