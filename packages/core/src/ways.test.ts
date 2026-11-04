import { describe, expect, it } from "vitest";
import { inputGraph } from "./bench/screen/forms.ts";
import { SCREEN_SETS, screenInputs } from "./bench/screen/index.ts";
import { highwaysRegistry } from "./families/index.ts";
import type { Node } from "./model.ts";
import type { Plug } from "./plugs.ts";
import { cornersRouter, sectionsRouter, sharedRouter } from "./routers/index.ts";
import { OUT_STEPS, WayFinder } from "./ways.ts";

const box = (id: string, x: number, y: number, w: number, h: number): Node => ({ id, box: { x, y, w, h } }) as Node;
const up = (x: number, y: number): Plug => ({ point: { x, y }, normal: { x: 0, y: -1 } });

/** A wide box with a thin box above it. The gap between them is `gap`, and the margin is 5. */
const board = (gap: number): Node[] => [box("low", 0, 100, 200, 40), box("lid", 40, 100 - gap - 4, 120, 4), box("far", 300, 40, 40, 40)];

describe("the first step of a plug", () => {
  it("keeps the whole margin when the point at the margin is free", () => {
    const ways = new WayFinder(board(20));
    expect(ways.outStep(up(100, 100))).toBe(0);
    expect(ways.out(up(100, 100))).toEqual({ x: 100, y: 95 });
  });

  it("takes a part of the margin when the point at the margin is in a box", () => {
    const ways = new WayFinder(board(4));
    const step = ways.outStep(up(100, 100));
    expect(step).toBeGreaterThan(0);
    const q = ways.out(up(100, 100));
    expect(q.y).toBe(100 - 5 * OUT_STEPS[step]!);
    expect(ways.obstacles.inside(q, 0)).toBe(false);
  });

  it("does not step past a box that is thinner than the margin", () => {
    const thin = [box("low", 0, 100, 200, 40), box("lid", 90, 97, 20, 1), box("far", 300, 40, 40, 40)];
    const ways = new WayFinder(thin);
    const q = ways.out(up(100, 100));
    expect(q.y).toBeGreaterThan(98);
  });

  it("keeps the margin with `outSteps` off, so the option is a way back", () => {
    const ways = new WayFinder(board(4), { outSteps: false });
    expect(ways.outStep(up(100, 100))).toBe(0);
    expect(ways.out(up(100, 100))).toEqual({ x: 100, y: 95 });
  });

  it("gives a way around the lid, where the option off gives the straight line", () => {
    const nodes = board(4);
    const ends = new Set<Node>([nodes[0]!, nodes[2]!]);
    const target: Plug = { point: { x: 300, y: 60 }, normal: { x: -1, y: 0 } };
    const off = new WayFinder(nodes, { outSteps: false }).between(up(100, 100), target, ends);
    const on = new WayFinder(nodes).between(up(100, 100), target, ends);
    expect(off).toHaveLength(2);
    expect(on.length).toBeGreaterThan(2);
    const ways = new WayFinder(nodes);
    expect(ways.obstacles.clearPath(on, 0, ends)).toBe(true);
  });

  it("keeps the straight line between two plugs that face each other across a closed gap", () => {
    const nodes = [box("a", 0, 0, 40, 40), box("b", 46, 0, 40, 40), box("far", 300, 300, 40, 40)];
    const ends = new Set<Node>([nodes[0]!, nodes[1]!]);
    const ps: Plug = { point: { x: 40, y: 20 }, normal: { x: 1, y: 0 } };
    const pt: Plug = { point: { x: 46, y: 20 }, normal: { x: -1, y: 0 } };
    const off = new WayFinder(nodes, { outSteps: false }).between(ps, pt, ends);
    expect(new WayFinder(nodes).between(ps, pt, ends)).toEqual(off);
  });

  it("finds the way of a closed family in a lower graph, with no route through a box", () => {
    const { graph } = highwaysRegistry().generate("escape", 0, { gap: 4, nets: 60 } as never);
    const lower = cornersRouter({ name: "on" }).route(graph).routes;
    const off = cornersRouter({ name: "off", outSteps: false }).route(graph).routes;
    expect(lower.filter((r) => r.through !== undefined)).toEqual([]);
    expect(off.filter((r) => r.through !== undefined).length).toBeGreaterThan(0);
  });

  it("holds the counts of the record on the three sets of `escape`", () => {
    const sets = [{ dims: { nets: 60 }, off: 45 }, { dims: { gap: 40, nets: 100 }, off: 123 }, { dims: { gap: 4, nets: 60 }, off: 535 }];
    for (const { dims, off } of sets) {
      let before = 0;
      for (let seed = 0; seed < 10; seed++) {
        const { graph } = highwaysRegistry().generate("escape", seed, dims as never);
        before += cornersRouter({ name: "off", outSteps: false }).route(graph).routes.filter((r) => r.through !== undefined).length;
        expect(cornersRouter({ name: "on" }).route(graph).routes.filter((r) => r.through !== undefined)).toEqual([]);
      }
      expect(before).toBe(off);
    }
  });

  it("changes only the routes through a box on `screen-v3`, and each one loses its box", { timeout: 60_000 }, () => {
    const on = [cornersRouter({ name: "corners" }), sharedRouter({ name: "shared" }), sectionsRouter({ name: "sections", maxNodes: 100_000 })];
    const off = [cornersRouter({ name: "corners", outSteps: false }), sharedRouter({ name: "shared", outSteps: false }), sectionsRouter({ name: "sections", maxNodes: 100_000, outSteps: false })];
    const inputs = screenInputs(SCREEN_SETS["screen-v3"]!).filter((i) => i.id.includes("packed-grid"));
    expect(inputs).toHaveLength(10);
    on.forEach((router, n) => {
      let changed = 0;
      for (const input of inputs) {
        const graph = inputGraph(input);
        const before = off[n]!.route(graph).routes;
        const after = router.route(graph).routes;
        expect(after.filter((r) => r.through !== undefined), router.name).toEqual([]);
        before.forEach((r, i) => {
          if (JSON.stringify(r.points) === JSON.stringify(after[i]!.points)) return;
          changed++;
          expect(r.through).toBeDefined();
        });
      }
      expect(changed, router.name).toBe(924);
    });
  });

  it("has no two equal points in a row when the step is 0", () => {
    const nodes = [box("low", 0, 100, 200, 40), box("lid", 40, 99.5, 120, 0.25), box("far", 300, 40, 40, 40)];
    const ways = new WayFinder(nodes);
    const way = ways.between(up(100, 100), { point: { x: 300, y: 60 }, normal: { x: -1, y: 0 } }, new Set<Node>([nodes[0]!, nodes[2]!]));
    for (let i = 1; i < way.length; i++) expect(way[i]).not.toEqual(way[i - 1]);
  });
});
