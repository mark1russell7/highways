/*
 * The fit of the input and record types of highways to the shared types of `@mark1russell7/layout-contract`.
 *
 * The type checks compile only while each claim holds. `pnpm typecheck` examines them. Each known gap has a
 * `@ts-expect-error` with its id. When the gap closes, the directive has no error, and the typecheck fails.
 * Then remove the directive, and the gap from the list in `docs/LAYOUT-RECORDS.md`.
 */
import * as C from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { countOverlaps } from "../links.ts";
import { TOLERANCE } from "../properties.ts";
import { inputGraph, type LayoutBox, type LayoutContainer, type LayoutEdge, type LayoutInput, type LayoutObstacle, type LayoutPort, type LayoutRecord, type LayoutSide, type Region } from "./forms.ts";
import { round3 } from "./hash.ts";
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
holds<Fits<LayoutRecord["tolerance"], C.LayoutRecord["tolerance"]>>();
holds<Fits<C.LayoutRecord["tolerance"], LayoutRecord["tolerance"]>>();

// From highways to the contract: a file of highways, read with the contract types.
holds<Fits<LayoutRecord, C.LayoutRecord>>();
holds<Fits<LayoutPort & { readonly side: LayoutSide }, C.Port>>();
holds<Fits<Omit<LayoutBox, "ports">, C.LayoutBox>>();
// @ts-expect-error G1: the `side` of a port is optional in highways, because the router picks a side. The contract needs it.
holds<Fits<LayoutPort, C.Port>>();
// @ts-expect-error G2: highways has no `container` in a router input. The contract needs one.
holds<Fits<LayoutInput["container"], C.LayoutInput["container"]>>();
// @ts-expect-error G3: highways has the change `packed`. The contract does not.
holds<Fits<LayoutInput["change"], C.LayoutInput["change"]>>();

// From the contract to highways: a file of the contract, for example the result of `applyPack`, read by highways.
holds<Fits<Omit<C.LayoutBox, "locked">, LayoutBox>>();
holds<Fits<Omit<C.LayoutRecord, "ms"> & { readonly ms: number }, LayoutRecord>>();
// @ts-expect-error G4: `locked` is a boolean in the contract and only `true` in highways.
holds<Fits<C.LayoutBox["locked"], LayoutBox["locked"]>>();
// @ts-expect-error G5: `set`, `family`, `seed`, `source`, `hash` and `edges` are optional in the contract and necessary in highways.
holds<Fits<Pick<C.LayoutInput, "set" | "family" | "seed" | "source" | "hash" | "edges">, Pick<LayoutInput, "set" | "family" | "seed" | "source" | "hash" | "edges">>>();
// @ts-expect-error G6: `ms` is optional in the contract and necessary in highways.
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
// @ts-expect-error G8: the contract has no `data` on a box.
holds<Has<C.LayoutBox, "data">>();
// @ts-expect-error G8: the contract has no `generator` on an input.
holds<Has<C.LayoutInput, "generator">>();
// @ts-expect-error G8: the contract has no `cell` on an input.
holds<Has<C.LayoutInput, "cell">>();
// @ts-expect-error G8: the contract has no `step` on an input.
holds<Has<C.LayoutInput, "step">>();
// @ts-expect-error G8: the contract has no `skipped` on a record.
holds<Has<C.LayoutRecord, "skipped">>();

/** This function gives the boxes of an input as contract boxes. A port without a side (G1) is an error. */
function contractBoxes(input: LayoutInput): C.LayoutBox[] {
  return input.boxes.map(({ ports, ...box }) => ({
    ...box,
    ...(ports
      ? {
          ports: ports.map(({ side, ...p }) => {
            if (side === undefined) throw new Error(`The port "${p.id}" of the input "${input.id}" has no side.`);
            return { ...p, side };
          }),
        }
      : {}),
  }));
}

/**
 * This function gives an input as a contract input, with a free container (G2).
 * The change `packed` (G3) is an error.
 */
function contractInput(input: LayoutInput): C.LayoutInput {
  const { change, ...rest } = input;
  if (change === "packed") throw new Error(`The input "${input.id}" has the change "packed".`);
  return { ...rest, ...(change === undefined ? {} : { change }), boxes: contractBoxes(input), container: input.container ?? { fixed: "none" } };
}

const inputs = screenInputs();

describe("the fit of highways to layout-contract", () => {
  it("keeps the tolerance of the shared rule `through`", () => {
    expect(TOLERANCE).toBe(C.DEFAULT_TOLERANCE.through);
    expect(TOLERANCE).toBe(0.5);
  });

  it("rounds the numbers of a file within `RECORD_EPS`", () => {
    // G9: highways has no constant for the epsilon of a file. `round3` rounds to 0.001, the value of `RECORD_EPS`.
    expect(C.RECORD_EPS).toBe(1e-3);
    for (const v of [0, 0.0004, 0.0005, 1.23456, -7.8999, 123.4565, 1e6 / 3]) expect(Math.abs(round3(v) - v)).toBeLessThanOrEqual(C.RECORD_EPS / 2 + 1e-12);
  });

  it("gives screen-v1 inputs that pass the rules of the contract", () => {
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      const boxes = contractBoxes(input);
      expect(boxes.every((b) => C.placedRect(b) !== undefined)).toBe(true);
      expect(C.countPortsOffBorder(boxes)).toBe(0);
      // The two counts of the overlaps agree at the same tolerance.
      expect(C.countOverlaps(boxes, TOLERANCE)).toBe(countOverlaps(inputGraph(input).nodes.map((n) => n.box)));
      const own = contractInput(input);
      expect(C.toPackInput(own).items.map((b) => b.id)).toEqual(input.boxes.map((b) => b.id));
      // A pack that keeps each position gives the same boxes.
      const placements = boxes.map((b) => ({ id: b.id, x: b.x!, y: b.y! }));
      const packed = C.applyPack(own, { placements, overflow: [], size: { w: 0, h: 0 }, moved: [] });
      expect(packed.boxes).toEqual(boxes);
    }
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
