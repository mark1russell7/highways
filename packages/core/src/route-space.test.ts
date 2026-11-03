import { createHash } from "node:crypto";
import { canonicalConfig, checkConfig, checkSpace, configId, spaceSize } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { CASES } from "./cases.ts";
import { FIXTURES, makeFixture } from "./fixtures.ts";
import { gateStrategy } from "./highways/gates/model.ts";
import { stretchGate } from "./highways/gates/stretch/index.ts";
import { highwayRouterStrategy } from "./highways/router.ts";
import { sharedStretchStrategy } from "./lane-orders/stretch/router.ts";
import type { Graph, Result } from "./model.ts";
import { ROUTE_SPACE_LEFT_OUT, ROUTE_SPACE_MISFITS, routeConfig, routeSpace } from "./route-space.ts";
import { ROUTERS } from "./routers/index.ts";
import { laneRoutes, runKey, segmentsOf } from "./segments.ts";
import { highwayStrategies } from "./strategies/builtins.ts";
import { asRouter, type Strategy } from "./strategies/model.ts";

// STAGE-DATA: the routers of today as named points of `routeSpace`. Made-up boards only.

const named = routeSpace.named!;

/** The router table of today: the routers of `ROUTERS`, then each highway strategy through `follow`, then the opt-in router `shared-stretch`. */
const TABLE: ReadonlyMap<string, (graph: Graph) => Result> = new Map([
  ...ROUTERS.map((r) => [r.name, (g: Graph) => r.route(g)] as const),
  ...Object.values(highwayStrategies).map((s) => [s.name, (g: Graph) => asRouter(highwayRouterStrategy(s as Strategy<"highway", object>)).route(g)] as const),
  [sharedStretchStrategy.name, (g: Graph) => asRouter(sharedStretchStrategy).route(g)] as const,
]);

const graphs: readonly (readonly [string, () => Graph])[] = [
  ...CASES.map((c) => [c.name, c.make] as const),
  ["small-clustered", () => makeFixture(FIXTURES.find((f) => f.name === "small-clustered")!)],
];

/** This function gives the digest of the routes, the run keys and the lane routes of a result: the hash of the digest tests. */
function digest(result: Result): string {
  const segments = segmentsOf(result);
  const keys = segments.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges));
  const lanes = laneRoutes(segments, new Set(keys), 2.4, 16);
  return createHash("sha256").update(JSON.stringify({ result, keys, lanes })).digest("hex");
}

describe("routeSpace (STAGE-DATA)", () => {
  it("is a good space with 7 stages, and checkConfig accepts each named point", () => {
    expect(checkSpace(routeSpace)).toEqual([]);
    expect(Object.isFrozen(routeSpace)).toBe(true);
    expect(routeSpace.stages.map((s) => s.name)).toEqual(["grouping", "plugs", "routing", "gate", "lane-order", "smoothing", "levels"]);
    for (const [name, config] of Object.entries(named)) expect(checkConfig(routeSpace, config), name).toEqual([]);
  });

  it("has each row of the router table as a named point or a misfit, and no portfolio", () => {
    const rows = [...TABLE.keys()];
    expect(rows.filter((r) => !(r in named) && !(r in ROUTE_SPACE_MISFITS))).toEqual([]);
    expect(Object.keys(named).filter((n) => !TABLE.has(n))).toEqual([]);
    expect(Object.keys(ROUTE_SPACE_MISFITS)).toEqual([]);
    expect(routeSpace.stages.find((s) => s.name === "routing")!.options.some((o) => o.id === "portfolio")).toBe(false);
  });

  // The 3 numbers of layout-stack: the base size, the rows that share a configId and the misfits.
  it("has 31 717 809 875 base configs with 3 levels, and no two rows share a configId", { timeout: 120_000 }, () => {
    expect(spaceSize(routeSpace, { levels: 3 }).base).toBe(31_717_809_875n);
    const ids = new Set(Object.values(named).map((c) => configId(routeSpace, c)));
    expect(ids.size).toBe(Object.keys(named).length);
  });

  it("gives one id for two spellings of one config", () => {
    const short = { space: "highways", stages: { routing: { option: "corridors" } } };
    expect(configId(routeSpace, short)).toBe(configId(routeSpace, named["corridors"]!));
    const long = { space: "highways", stages: { routing: { option: "sections", params: { limitStretch: true, stretch: 2 } }, grouping: { option: "quadtree" }, "lane-order": { option: "run" }, levels: { option: "depths" }, gate: null } };
    expect(canonicalConfig(routeSpace, long)).toEqual(canonicalConfig(routeSpace, named["sections"]!));
  });

  it("refuses a config with a break, and routes a gate after a plan", { timeout: 60_000 }, () => {
    const bad = { space: "highways", stages: { routing: { option: "straight" }, "lane-order": { option: "run" } } };
    expect(() => routeConfig(CASES[0]!.make(), bad)).toThrow(RangeError);
    expect(() => routeConfig(CASES[0]!.make(), { space: "highways", stages: { routing: { option: "shared-ways" }, gate: { option: "stretch" } } })).toThrow(/not grouping=null/);
    const gated = { ...named["shared-ways"]!, stages: { ...named["shared-ways"]!.stages, gate: { option: "stretch" } } };
    expect(digest(routeConfig(CASES[0]!.make(), gated))).toBe(digest(asRouter(highwayRouterStrategy(gateStrategy(highwayStrategies["shared-ways"], stretchGate))).route(CASES[0]!.make())));
  });

  it("lists the options that the space does not hold, with a reason", () => {
    expect(Object.keys(ROUTE_SPACE_LEFT_OUT).sort()).toEqual(["keys.key", "keys.split", "soft-keys.attributes"]);
  });

  it("gives the route hash of the router of today for each named point and each board", { timeout: 600_000 }, () => {
    const differ: string[] = [];
    for (const [board, make] of graphs) {
      for (const [name, config] of Object.entries(named)) {
        if (digest(routeConfig(make(), config)) !== digest(TABLE.get(name)!(make()))) differ.push(`${board}/${name}`);
      }
    }
    expect(differ).toEqual([]);
  });
});
