import { describe, expect, it } from "vitest";
import { highwaysRegistry } from "./families/index.ts";
import type { Point } from "./geom.ts";
import { edgePlugs } from "./highways/stretches.ts";
import { resolvePorts, splitFrames, type Graph, type Route, type Router } from "./model.ts";
import { ROUTERS } from "./routers/index.ts";
import { WayFinder } from "./ways.ts";

const reg = highwaysRegistry();

/** The families where the search floor chose the route before the tie rule. Their edges carry no key. */
const FAMILIES = ["hub-chain", "many-groups", "escape", "two-hubs", "frame-rows", "maze", "switchbox", "walled-level"];
const SEEDS = [0, 1, 2];
/** The search floors of the law. `shared` searches at 0.5 with its default options. */
const FLOORS = [1, 0.5, 0.25];

const boards = (): { readonly id: string; readonly board: Graph }[] =>
  FAMILIES.flatMap((family) => SEEDS.map((seed) => ({ id: `${family}/${seed}`, board: reg.generate(family, seed).graph })));

/** This function gives the corner path of each edge of a board at one search floor, as exact text. */
function pathsAt(board: Graph, floor: number): Map<string, string> {
  const { graph } = splitFrames(resolvePorts(board));
  const ways = new WayFinder(graph.nodes);
  const paths = new Map<string, string>();
  for (const { edge, ps, pt } of edgePlugs(graph)) {
    paths.set(edge.id, JSON.stringify(ways.corners.path(ways.out(ps!), ways.out(pt!), undefined, floor) ?? null));
  }
  return paths;
}

/** This function gives the ids of the edges that have other bytes on the two lists. */
const differ = (a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): string[] => [...a].filter(([id, text]) => b.get(id) !== text).map(([id]) => id);

/** This function gives `true` when a point of the two lines moves over 1e-6, or when the lines have different lengths. */
const moved = (p: readonly Point[], q: readonly Point[] | undefined): boolean =>
  q === undefined || p.length !== q.length || p.some((v, i) => Math.abs(v.x - q[i]!.x) > 1e-6 || Math.abs(v.y - q[i]!.y) > 1e-6);

const lines = (routes: readonly Route[]): Map<string, readonly Point[]> => new Map(routes.map((r) => [r.edge, r.points]));

describe("the tie rule of the corner search (ROUTE-TIE)", () => {
  it("gives the same bytes at each search floor", () => {
    const found: string[] = [];
    for (const { id, board } of boards()) {
      const base = pathsAt(board, FLOORS[0]!);
      for (const floor of FLOORS.slice(1)) found.push(...differ(base, pathsAt(board, floor)).map((edge) => `${id} ${edge} at ${floor}`));
    }
    expect(found).toEqual([]);
  }, 120_000);

  it("reads a path at each floor, so the law does not hold on empty lists", () => {
    const { id, board } = boards()[0]!;
    const paths = pathsAt(board, 0.5);
    expect(paths.size, id).toBeGreaterThan(0);
    expect([...paths.values()].filter((text) => text !== "null").length, id).toBeGreaterThan(0);
  });

  it("makes `shared` with no key equal to `corners`", () => {
    const named = (name: string): Router => ROUTERS.find((r) => r.name === name)!;
    const corners = named("corners");
    const shared = named("shared");
    const found: string[] = [];
    for (const { id, board } of boards()) {
      const a = lines(corners.route(board).routes);
      const b = lines(shared.route(board).routes);
      for (const [edge, points] of a) if (moved(points, b.get(edge))) found.push(`${id} ${edge}`);
    }
    expect(found).toEqual([]);
  }, 120_000);
});
