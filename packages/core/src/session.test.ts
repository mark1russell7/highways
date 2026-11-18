import { mulberry32 } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { highwaysRegistry } from "./families/index.ts";
import { makeFixture, type FixtureKind } from "./fixtures.ts";
import type { Edge, End, Graph, Node, Port, Result, Router } from "./model.ts";
import { withStableOrder } from "./order/index.ts";
import { withRepair } from "./repair/index.ts";
import { byCollection, cornersRouter, plugsRouter, straightRouter, trunksRouter, type CornersOptions } from "./routers/index.ts";
import { routerSession } from "./session.ts";
import { STAMP_END, STAMPS } from "./stamps.ts";
import { plugStrategies } from "./strategies/builtins.ts";
import { defineStrategy } from "./strategies/model.ts";
import type { WayFinder } from "./ways.ts";
import { WORK } from "./work.ts";

const KINDS: readonly FixtureKind[] = ["uniform", "clustered", "grid", "hubs", "collections"];

/** The routers `corners` of the property: the fast way of the facing plugs, and each other way of the plugs. */
const CORNERS: readonly CornersOptions[] = [
  { name: "corners" },
  { name: "corners-smooth", smooth: true },
  { name: "corners-side", plugs: "side" },
  { name: "corners-gap", plugGap: 6 },
  { name: "corners-side-gap", plugs: "side", plugGap: 6 },
  { name: "corners-rule-side", plug: plugStrategies.side },
  { name: "corners-rule-spread", plug: plugStrategies.spread },
  { name: "corners-rule-escape", plug: plugStrategies.escape },
  { name: "corners-no-steps", outSteps: false },
  { name: "corners-no-join", joinWork: 0 },
];

/** This function gives `count` edges of the graph, in a random order. */
function someEdges(graph: Graph, count: number, random: () => number): Edge[] {
  const pool = [...graph.edges];
  const out: Edge[] = [];
  while (out.length < count && pool.length > 0) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]!);
  return out;
}

/** This function gives `count` new edges between random nodes of the graph. About half of the ends at a node with plugs name a plug. */
function madeEdges(graph: Graph, count: number, random: () => number, tag: string): Edge[] {
  const node = (): Node => graph.nodes[Math.floor(random() * graph.nodes.length)]!;
  const end = (n: Node): End => {
    const ports = n.ports ?? [];
    return ports.length > 0 && random() < 0.5 ? { node: n.id, port: ports[Math.floor(random() * ports.length)]!.id } : { node: n.id };
  };
  const out: Edge[] = [];
  while (out.length < count) {
    const s = node();
    const t = node();
    if (s !== t) out.push({ id: `${tag}-${out.length}`, source: end(s), target: end(t) });
  }
  return out;
}

/**
 * This function gives the sets of edges of one session, in the order of the routes.
 * The list has small sets, the empty set, each edge of the graph, new edges, and one set two times: as the same array and as a copy.
 */
function edgeSets(graph: Graph, random: () => number, unknown = true): (readonly Edge[])[] {
  const two = someEdges(graph, 2, random);
  const five = someEdges(graph, 5, random);
  // An edge to a node that the graph does not have gets no route.
  const lost: Edge[] = unknown ? [{ id: "lost", source: { node: graph.nodes[0]!.id }, target: { node: "no-such-node" } }] : [];
  const mixed = [...someEdges(graph, 3, random), ...madeEdges(graph, 3, random, "made"), ...lost];
  return [two, five, two, [], graph.edges, mixed, [...two]];
}

/** This function compares each route of one session with the plain route of the same edges. It gives the number of the routes of the results. */
function sameAsPlain(router: Router, graph: Graph, sets: readonly (readonly Edge[])[], label: string): number {
  const session = routerSession(router, graph);
  let routes = 0;
  sets.forEach((edges, i) => {
    const plain: Result = router.route({ ...graph, edges });
    const got = session.route(edges);
    expect(got, `${label} set ${i}`).toStrictEqual(plain);
    expect(JSON.stringify(got), `${label} set ${i} (bytes)`).toBe(JSON.stringify(plain));
    routes += got.routes.length;
  });
  session.dispose();
  return routes;
}

// A card with rows inside it, as in `routers/frames.test.ts`. The plugs of the card have `along`, so `resolvePorts` makes new node objects.
const PLUGS: readonly Port[] = [
  { id: "e1", side: "east", along: 0.25 },
  { id: "e2", side: "east", along: 0.75 },
  { id: "w1", side: "west", along: 0.25 },
  { id: "w2", side: "west", along: 0.75 },
];
const FRAMES: Graph = {
  nodes: [
    { id: "left", box: { x: 60, y: 120, w: 100, h: 40 } },
    { id: "card", box: { x: 300, y: 100, w: 240, h: 200 }, ports: PLUGS },
    ...Array.from({ length: 6 }, (_, i): Node => ({ id: `r${i + 1}`, parent: "card", box: { x: 320, y: 113 + i * 30, w: 200, h: 24 } })),
    { id: "right", box: { x: 680, y: 220, w: 100, h: 40 } },
    { id: "far", box: { x: 680, y: 20, w: 100, h: 40 }, ports: [{ id: "s", side: "south", along: 0.5 }] },
  ],
  edges: [
    { id: "i1", source: { node: "r1" }, target: { node: "card", port: "e1" } },
    { id: "i3", source: { node: "r3" }, target: { node: "card", port: "w1" } },
    { id: "i5", source: { node: "card", port: "e2" }, target: { node: "r5" } },
    { id: "s12", source: { node: "r1" }, target: { node: "r2" } },
    { id: "s46", source: { node: "r4" }, target: { node: "r6" } },
    { id: "o1", source: { node: "card", port: "e1" }, target: { node: "right" } },
    { id: "o2", source: { node: "left" }, target: { node: "card", port: "w1" } },
    { id: "o3", source: { node: "far", port: "s" }, target: { node: "right" } },
    { id: "o4", source: { node: "left" }, target: { node: "far" } },
  ],
};

describe("routerSession with the router corners", () => {
  it("gives the result of the plain route for each set of edges of one session (property, 10 routers × 5 kinds × 7 sets)", () => {
    let routes = 0;
    for (const kind of KINDS) {
      for (let seed = 1; seed <= 2; seed++) {
        const graph = makeFixture({ name: "t", kind, nodes: 40, edgesPerNode: 2, seed, fixedPorts: 0.3 });
        CORNERS.forEach((options, i) => {
          // Each router gets one of the two graphs of each kind.
          if ((i + seed) % 2 !== 0) return;
          const sets = edgeSets(graph, mulberry32(1000 * seed + i));
          routes += sameAsPlain(cornersRouter(options), graph, sets, `${options.name} ${kind} ${seed}`);
        });
      }
    }
    expect(routes).toBeGreaterThan(4000);
  }, 60_000);

  it("gives the result of the plain route with inner edges, sibling edges and plugs with along", () => {
    const pick = (...ids: string[]): Edge[] => ids.map((id) => FRAMES.edges.find((e) => e.id === id)!);
    const sets = [pick("i1", "o1"), pick("o1", "o2"), pick("i1", "i3", "i5"), pick("s12", "s46"), [], FRAMES.edges, pick("i1", "o1"), pick("o3", "o4"), pick("s12", "i5", "o2")];
    for (const options of [{ name: "corners" }, { name: "corners-gutter", inner: "gutter", bendCost: 24 }, { name: "corners-side", plugs: "side" }] satisfies CornersOptions[]) {
      const router = cornersRouter(options);
      expect(sameAsPlain(router, FRAMES, [...sets, ...edgeSets(FRAMES, mulberry32(7), false)], options.name)).toBeGreaterThan(20);
      // The routes of the inner edges have their frame, so the split of the session is the split of the plain route.
      expect(routerSession(router, FRAMES).route(pick("i1", "s12", "o1")).routes.map((r) => r.frame)).toEqual([undefined, "card", "card"]);
    }
  });

  it("starts the counts of the lower steps of the margin at 0 for each route, and keeps the lower corner graphs", () => {
    const reg = highwaysRegistry();
    // This plug rule places no plug, so each edge gets the plugs of `facing`. It records the ways of the router and their counts at the start.
    const seen: { readonly ways: WayFinder; readonly start: readonly number[] }[] = [];
    const look = defineStrategy<"plugs", object>({
      step: "plugs",
      name: "look",
      describe: "This rule records the ways of the router.",
      defaults: {},
      run: (input) => {
        // The router `corners` gives its ways to each plug rule.
        const ways = input.ways!;
        seen.push({ ways, start: [...ways.lowerWays] });
        return [];
      },
    });
    const router = cornersRouter({ name: "look", plug: look });
    let lower = 0;
    for (let seed = 0; seed < 3; seed++) {
      // The boxes of this board are 4 apart, so a way from a plug needs a lower step of the margin.
      const { graph } = reg.generate("escape", seed, { gap: 4, nets: 60 });
      const session = routerSession(router, graph);
      // The same set two times: the second route finds the lower corner graphs that the first route made.
      for (const edges of [graph.edges, graph.edges, someEdges(graph, 3, mulberry32(seed)), [], graph.edges]) {
        seen.length = 0;
        const plain = router.route({ ...graph, edges });
        expect(session.route(edges), `escape ${seed}`).toStrictEqual(plain);
        const [fresh, kept] = seen;
        expect(kept!.start, `escape ${seed}: the counts at the start`).toEqual(fresh!.start);
        expect(kept!.ways.lowerWays, `escape ${seed}: the counts at the end`).toEqual(fresh!.ways.lowerWays);
        lower += fresh!.ways.lowerWays.reduce((a, b) => a + b, 0);
      }
    }
    // The plain routes used the lower corner graphs, so the routes of the session used them too.
    expect(lower).toBeGreaterThan(0);
  });

  it("keeps the note joinStopped of the plain route", () => {
    const reg = highwaysRegistry();
    const stopped = cornersRouter({ name: "stopped", joinWork: 1 });
    let notes = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const { graph } = reg.generate("maze", seed);
      const sets = edgeSets(graph, mulberry32(seed));
      sameAsPlain(stopped, graph, sets, `maze ${seed} stopped`);
      sameAsPlain(cornersRouter({ name: "corners" }), graph, sets, `maze ${seed}`);
      const session = routerSession(stopped, graph);
      // The note does not depend on the edges, and a second route keeps it.
      for (const edges of [sets[0]!, [], sets[0]!]) if (session.route(edges).joinStopped === true) notes++;
    }
    expect(notes).toBeGreaterThan(0);
    expect(notes % 3).toBe(0);
  });

  it("does not read the edges of the graph of the session", () => {
    const graph = makeFixture({ name: "t", kind: "clustered", nodes: 60, edgesPerNode: 2, seed: 3, fixedPorts: 0.3 });
    const corners = cornersRouter({ name: "corners" });
    const edges = someEdges(graph, 4, mulberry32(3));
    expect(routerSession(corners, { nodes: graph.nodes, edges: [] }).route(edges)).toStrictEqual(corners.route({ ...graph, edges }));
  });

  it("does less work than the plain route for a few edges among many nodes", () => {
    const graph = makeFixture({ name: "t", kind: "uniform", nodes: 400, edgesPerNode: 2, seed: 1 });
    // The router of the built-in list is a copy with `maxNodes`. The copy keeps the `route` of the router, so it keeps the session.
    const corners = cornersRouter({ name: "corners", maxNodes: 10_000 });
    const session = routerSession(corners, graph);
    const random = mulberry32(5);
    for (let i = 0; i < 3; i++) {
      const edges = someEdges(graph, 2, random);
      const start = WORK.sight;
      const plain = corners.route({ ...graph, edges });
      const middle = WORK.sight;
      const got = session.route(edges);
      const end = WORK.sight;
      expect(got).toStrictEqual(plain);
      // The plain route makes the corner graph of 400 nodes. The session made it one time.
      expect((end - middle) * 20, `set ${i}: ${middle - start} tests of sight of the plain route, ${end - middle} of the session`).toBeLessThan(middle - start);
    }
  });

  it("throws the error of the plain route for the nodes when the session starts", () => {
    const corners = cornersRouter({ name: "corners" });
    const box = { x: 0, y: 0, w: 40, h: 40 };
    const badPlug: Graph = { nodes: [{ id: "a", box, ports: [{ id: "p", side: "east", along: 2 }] }], edges: [] };
    const badParent: Graph = { nodes: [{ id: "a", box, parent: "none" }], edges: [] };
    for (const graph of [badPlug, badParent]) {
      expect(() => corners.route(graph)).toThrow(RangeError);
      expect(() => routerSession(corners, graph)).toThrow(RangeError);
    }
  });
});

/** The record of one session: the result of each set of edges, and the work of the start of the session and of each route. */
interface SessionRecord {
  readonly results: readonly Result[];
  /** The tests of sight and the visits of corners: first of the start of the session, then of each route. */
  readonly work: readonly (readonly [number, number])[];
  /** The number of ways that the corner graphs of the lower steps of the margin gave. It is 0 for a router without the rule `keepWays`. */
  readonly lower: number;
}

// The ways of the router of the last route with the rule `keepWays`.
let keptWays: WayFinder | undefined;

/** This plug rule places no plug, so each edge gets the plugs of `facing`. It keeps the ways of the router in `keptWays`. */
const keepWays = defineStrategy<"plugs", object>({
  step: "plugs",
  name: "keep",
  describe: "This rule keeps the ways of the router.",
  defaults: {},
  run: (input) => {
    keptWays = input.ways;
    return [];
  },
});

/** This function gives the ways that the rule `keepWays` kept since the last call, and forgets them. */
function takeWays(): WayFinder | undefined {
  const ways = keptWays;
  keptWays = undefined;
  return ways;
}

/** This function makes one session, routes each set of edges in it, and gives the record. */
function sessionRecord(router: Router, graph: Graph, sets: readonly (readonly Edge[])[]): SessionRecord {
  const results: Result[] = [];
  const work: [number, number][] = [];
  let lower = 0;
  takeWays();
  let sight = WORK.sight;
  let corner = WORK.corner;
  const step = (): void => {
    work.push([WORK.sight - sight, WORK.corner - corner]);
    sight = WORK.sight;
    corner = WORK.corner;
  };
  const session = routerSession(router, graph);
  step();
  for (const edges of sets) {
    results.push(session.route(edges));
    step();
    for (const count of takeWays()?.lowerWays ?? []) lower += count;
  }
  session.dispose();
  return { results, work, lower };
}

describe("the stamps of a session of the router corners", () => {
  // A session keeps its grids and its corner graphs, so their stamps grow with each route. The test lowers the limit of the stamps.
  // Thus a few routes bring each stamp to the limit many times, as 2^31 queries do with the default limit.
  const reg = highwaysRegistry();
  // The test makes each board with the default limit, because `makeFixture` uses a grid too.
  const boards: readonly { readonly label: string; readonly router: Router; readonly graph: Graph; readonly lower: boolean }[] = [
    { label: "clustered", router: cornersRouter({ name: "corners" }), graph: makeFixture({ name: "t", kind: "clustered", nodes: 40, edgesPerNode: 2, seed: 2, fixedPorts: 0.3 }), lower: false },
    {
      label: "hubs with side plugs",
      router: cornersRouter({ name: "corners-side", plugs: "side" }),
      graph: makeFixture({ name: "t", kind: "hubs", nodes: 40, edgesPerNode: 2, seed: 1, fixedPorts: 0.3 }),
      lower: false,
    },
    // The boxes of this board are 4 apart, so the session makes the corner graphs of the lower steps of the margin. Each has its own stamps.
    { label: "escape", router: cornersRouter({ name: "keep", plug: keepWays }), graph: reg.generate("escape", 1, { gap: 4, nets: 60 }).graph, lower: true },
  ];

  for (const { label, router, graph, lower } of boards) {
    it(`gives the results and the work of the default limit when the stamps start again, on the board ${label} (limits 1, 2, 3 and 7)`, () => {
      const sets = edgeSets(graph, mulberry32(11));
      const plain = sets.map((edges) => router.route({ ...graph, edges }));
      const bytes = plain.map((result) => JSON.stringify(result));
      const want = sessionRecord(router, graph, sets);
      expect(want.results).toStrictEqual(plain);
      // The session of the board `escape` used the lower corner graphs, so the test brings their stamps to the limit too.
      if (lower) expect(want.lower).toBeGreaterThan(0);
      for (const limit of [1, 2, 3, 7]) {
        const grids = STAMPS.gridStarts;
        const searches = STAMPS.searchStarts;
        let got: SessionRecord;
        let gridStarts: number;
        let searchStarts: number;
        let again: Result[];
        try {
          STAMPS.limit = limit;
          got = sessionRecord(router, graph, sets);
          gridStarts = STAMPS.gridStarts - grids;
          searchStarts = STAMPS.searchStarts - searches;
          // The plain route makes its grids and its corner graphs with the low limit too.
          again = sets.map((edges) => router.route({ ...graph, edges }));
        } finally {
          STAMPS.limit = STAMP_END;
        }
        // The one session came to the limit of the stamps of its grids and of its searches many times.
        expect(gridStarts, `${label} limit ${limit}: the starts of the grids`).toBeGreaterThan(100);
        expect(searchStarts, `${label} limit ${limit}: the starts of the searches`).toBeGreaterThan(3);
        sets.forEach((_, i) => {
          expect(got.results[i], `${label} limit ${limit} set ${i}`).toStrictEqual(plain[i]);
          expect(JSON.stringify(got.results[i]), `${label} limit ${limit} set ${i} (bytes)`).toBe(bytes[i]);
          expect(again[i], `${label} limit ${limit} set ${i} (plain)`).toStrictEqual(plain[i]);
          expect(JSON.stringify(again[i]), `${label} limit ${limit} set ${i} (plain, bytes)`).toBe(bytes[i]);
        });
        // A query that gives an item two times, or a search that loses its marks, changes the work.
        expect(got.work, `${label} limit ${limit}: the work`).toEqual(want.work);
        expect(got.lower, `${label} limit ${limit}: the ways of the lower corner graphs`).toBe(want.lower);
      }
    }, 60_000);
  }
});

describe("routerSession with a router that has no session", () => {
  it("gives the result of the plain route for each set of edges (property, 3 routers × 5 kinds)", () => {
    const routers: readonly Router[] = [straightRouter, plugsRouter, trunksRouter({ name: "trunks", rule: byCollection })];
    let routes = 0;
    for (const router of routers) {
      expect(router.session, router.name).toBeUndefined();
      KINDS.forEach((kind, i) => {
        const graph = makeFixture({ name: "t", kind, nodes: 40, edgesPerNode: 2, seed: i + 1, fixedPorts: 0.3 });
        routes += sameAsPlain(router, graph, edgeSets(graph, mulberry32(i), false), `${router.name} ${kind}`);
      });
    }
    expect(routes).toBeGreaterThan(1000);
  });

  it("gives the result of a copy of corners with a different route, not the result of corners", () => {
    const corners = cornersRouter({ name: "corners" });
    // This copy turns each route around, so its results are not those of `corners`.
    const turned: Router = { ...corners, name: "turned", route: (graph) => ({ routes: corners.route(graph).routes.map((r) => ({ ...r, points: [...r.points].reverse() })) }) };
    const graph = makeFixture({ name: "t", kind: "clustered", nodes: 60, edgesPerNode: 2, seed: 4, fixedPorts: 0.3 });
    const sets = edgeSets(graph, mulberry32(4));
    expect(turned.session).toBe(corners.session);
    expect(routerSession(turned, graph).route(sets[0]!)).not.toStrictEqual(corners.route({ ...graph, edges: sets[0]! }));
    for (const router of [turned, withRepair(corners), withStableOrder(corners), withStableOrder(withRepair(corners))]) {
      expect(sameAsPlain(router, graph, sets, router.name)).toBeGreaterThan(100);
    }
  });
});

describe("dispose of a session", () => {
  it("stops each later route, and a second dispose does nothing", () => {
    const graph = makeFixture({ name: "t", kind: "uniform", nodes: 20, edgesPerNode: 2, seed: 1 });
    for (const router of [cornersRouter({ name: "corners" }), straightRouter]) {
      const session = routerSession(router, graph);
      expect(session.route(graph.edges).routes).toHaveLength(graph.edges.length);
      session.dispose();
      session.dispose();
      expect(() => session.route(graph.edges), router.name).toThrow("The session is disposed");
      // A new session of the same router and graph routes again.
      expect(routerSession(router, graph).route(graph.edges)).toStrictEqual(router.route(graph));
    }
  });
});
