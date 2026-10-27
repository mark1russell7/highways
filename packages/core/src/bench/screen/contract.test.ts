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
    // G9: highways has no constant for the epsilon of a file. `round3` rounds to 0.001, the value of `RECORD_EPS`.
    expect(C.RECORD_EPS).toBe(1e-3);
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

  it("takes the joint floors from the contract and matches their packer twins in `docs/PROMOTION.md`", () => {
    const floors = promotionFloors();
    expect(floors.size).toBeGreaterThan(0);
    // `JOINT_MEASURES` is the one source of each joint floor, so `docs/PROMOTION.md` has no `joint.*` row.
    expect([...floors.keys()].filter((id) => id.startsWith("joint."))).toEqual([]);
    let matched = 0;
    for (const spec of C.JOINT_MEASURES) {
      if (spec.floor !== 0) continue;
      // A joint measure with a packer twin, for example `joint.aspectError` and `pack.aspectError`, has the floor and the tolerance of the twin.
      const row = floors.get(spec.id.replace(/^joint\./, "pack."));
      if (row === undefined) continue;
      expect({ id: spec.id, floor: spec.floor, tol: spec.tol }).toEqual({ id: spec.id, floor: row.floor, tol: row.tol });
      matched++;
    }
    expect(matched).toBeGreaterThanOrEqual(3);
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
