import { checkInput } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { graphInput, inputGraph } from "./bench/screen/forms.ts";
import { fixedPortPoint, resolvePorts, type Graph, type Port, type Router, type Side } from "./model.ts";
import { plugsRouter, straightRouter } from "./routers/index.ts";
import { routersOf } from "./strategies/model.ts";
import { STRATEGIES } from "./strategies/builtins.ts";

const SIDES: readonly Side[] = ["north", "east", "south", "west"];
const ALONGS = [0, 0.5, 1] as const;

/** This function gives a made-up graph: the node `a` has the plug `p`, and an edge goes from `p` to the node `b`. */
function graphOf(port: Port, h = 40): Graph {
  return {
    nodes: [
      { id: "a", box: { x: 200, y: 200, w: 80, h }, ports: [port] },
      { id: "b", box: { x: 600, y: 520, w: 60, h: 30 } },
      { id: "c", box: { x: 20, y: 40, w: 50, h: 50 } },
    ],
    edges: [
      { id: "e", source: { node: "a", port: "p" }, target: { node: "b" } },
      { id: "f", source: { node: "c" }, target: { node: "a", port: "p" } },
    ],
  };
}

/** This function gives the absolute point of a plug with `side` and `along` on the box of `graphOf`. */
function expected(side: Side, along: number, h = 40): { x: number; y: number } {
  const b = { x: 200, y: 200, w: 80, h };
  if (side === "north") return { x: b.x + along * b.w, y: b.y };
  if (side === "south") return { x: b.x + along * b.w, y: b.y + b.h };
  if (side === "west") return { x: b.x, y: b.y + along * b.h };
  return { x: b.x + b.w, y: b.y + along * b.h };
}

const ROUTERS: readonly Router[] = [straightRouter, plugsRouter, ...routersOf(STRATEGIES)];

describe("resolvePorts", () => {
  it("gives the same object for a graph without along", () => {
    const g = graphOf({ id: "p", at: { x: 0, y: 10 }, side: "west" });
    expect(resolvePorts(g)).toBe(g);
  });

  it("gives a plug with side and along a fixed at, and keeps its side", () => {
    for (const side of SIDES)
      for (const along of ALONGS) {
        const g = resolvePorts(graphOf({ id: "p", side, along }));
        const p = g.nodes[0]!.ports![0]!;
        expect(p.side).toBe(side);
        expect(p.along).toBeUndefined();
        expect(fixedPortPoint(g.nodes[0]!, { node: "a", port: "p" })).toEqual(expected(side, along));
        expect(fixedPortPoint(graphOf({ id: "p", side, along }).nodes[0]!, { node: "a", port: "p" })).toEqual(expected(side, along));
      }
  });

  it("throws a RangeError for each bad along", () => {
    const bad: Port[] = [
      { id: "p", side: "east", along: 1.5 },
      { id: "p", side: "east", along: -0.1 },
      { id: "p", side: "east", along: Number.NaN },
      { id: "p", side: "east", along: Number.POSITIVE_INFINITY },
      { id: "p", along: 0.5 },
      { id: "p", side: "east", along: 0.5, at: { x: 80, y: 20 } },
    ];
    for (const port of bad) {
      expect(() => resolvePorts(graphOf(port))).toThrow(RangeError);
      for (const r of [straightRouter, ...routersOf(STRATEGIES).slice(0, 3)]) expect(() => r.route(graphOf(port))).toThrow(RangeError);
    }
  });
});

describe("each router", () => {
  for (const router of ROUTERS) {
    it(`${router.name}: routes a plug with side and along as the same plug with at`, () => {
      for (const side of SIDES)
        for (const along of ALONGS) {
          const withAlong = router.route(graphOf({ id: "p", side, along }));
          const withAt = router.route(resolvePorts(graphOf({ id: "p", side, along })));
          expect(withAlong.routes, `${side} ${along}`).toEqual(withAt.routes);
        }
    });
  }

  for (const router of [straightRouter, plugsRouter, ...routersOf(STRATEGIES).filter((r) => ["corners", "trunks", "shared", "sections"].includes(r.name))]) {
    it(`${router.name}: starts the edge at the point of side and along`, () => {
      for (const side of SIDES)
        for (const along of ALONGS) {
          const routes = router.route(graphOf({ id: "p", side, along })).routes;
          const e = routes.find((r) => r.edge === "e")!;
          const f = routes.find((r) => r.edge === "f")!;
          expect(e.points[0], `${side} ${along}`).toEqual(expected(side, along));
          expect(f.points.at(-1), `${side} ${along}`).toEqual(expected(side, along));
        }
    });
  }

  it("keeps the plug on its fraction of the side when the box gets taller", () => {
    for (const router of [straightRouter, plugsRouter]) {
      const short = router.route(graphOf({ id: "p", side: "east", along: 0.25 }, 40)).routes[0]!.points[0]!;
      const tall = router.route(graphOf({ id: "p", side: "east", along: 0.25 }, 120)).routes[0]!.points[0]!;
      expect(short).toEqual({ x: 280, y: 210 });
      expect(tall).toEqual({ x: 280, y: 230 });
    }
  });
});

describe("the file form", () => {
  it("writes side and along, and reads them back", () => {
    const g = graphOf({ id: "p", side: "south", along: 0.75 });
    const input = graphInput(g, { id: "test/along/s1", set: "test", family: "along", seed: 1 });
    expect(input.boxes[0]!.ports).toEqual([{ id: "p", side: "bottom", along: 0.75 }]);
    expect(checkInput(input)).toEqual([]);
    expect(inputGraph(input).nodes[0]!.ports).toEqual([{ id: "p", side: "south", along: 0.75 }]);
    expect(graphInput(inputGraph(input), input)).toEqual(input);
  });

  it("keeps the form of a plug with at", () => {
    const input = graphInput(graphOf({ id: "p", at: { x: 80, y: 10 } }), { id: "test/at/s1", set: "test", family: "at", seed: 1 });
    expect(input.boxes[0]!.ports).toEqual([{ id: "p", side: "right", x: 80, y: 10 }]);
  });
});
