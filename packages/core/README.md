# @mark1russell7/highways

`@mark1russell7/highways` routes the edges of large graphs. It knows no renderer. It takes boxes and edges, and it gives polylines and zoom levels.

The [repository README](https://github.com/mark1russell7/highways#readme) tells the idea, the routers and the benchmark. The [site](https://mark1russell7.github.io/highways/) shows a live map.

## Install

```sh
pnpm add @mark1russell7/highways
```

## Route a graph

```ts
import { cornersRouter, type Graph } from "@mark1russell7/highways";

const graph: Graph = {
  nodes: [
    { id: "a", box: { x: 0, y: 0, w: 80, h: 40 } },
    { id: "b", box: { x: 240, y: 120, w: 80, h: 40 } },
  ],
  edges: [{ id: "ab", source: { node: "a" }, target: { node: "b" } }],
};
const result = cornersRouter({ name: "corners" }).route(graph);
// Each route is a polyline: result.routes[0].points
```

## Curve types

A router gives polylines. The curve layer turns a polyline into a curve of a type. The polyline can come from any router, from a lane of `laneRoutes` or from a link of a zoom level.

| Type | Curve | Ends |
|---|---|---|
| `straight` | The polyline as it is. | As the polyline. |
| `rounded` | A quadratic Bezier curve at each corner, as `roundCorners` draws it. The `radius` sets the size of the corners. | The first and the last legs stay. |
| `spline` | A centripetal Catmull-Rom spline through each point. It does not overshoot or make loops in a piece. The `tension` goes from 0 (the spline) to 1 (the polyline). | With `startNormal` and `endNormal`, the curve leaves and enters each plug along its normal. |
| `arc` | A circular arc at each corner, tangent to the two legs. On horizontal and vertical legs, each arc is a quarter circle. | The first and the last legs stay. |

The output is a list of segments: `move`, `line`, `cubic` and `arc`. A renderer maps them to SVG path data, to canvas calls or to the vertices of a mesh.

- `curveOf(points, options)` gives the segments of a curve. The `type` of `options` selects the curve type.
- `toSvgPath(segments, digits = 2)` writes the segments as SVG path data.
- `sampleCurve(segments, tolerance = 0.5)` gives a polyline within `tolerance` of the curve, for hit tests and measures.
- `curveSpace(boxes)` makes the free space of a board one time. With `space`, a curve goes through no box that its polyline avoids.

Where the full curve goes through a box, the free space makes the curve smaller. It shrinks the radius of a corner, or the tangents of a piece of a spline. A corner with no clear radius stays sharp. A piece of a spline with no clear tangent is its straight leg.

```ts
import { curveOf, curveSpace, nearestSide, SIDE_NORMAL, toSvgPath } from "@mark1russell7/highways";

const space = curveSpace(graph.nodes.map((n) => n.box));
const box = new Map(graph.nodes.map((n) => [n.id, n.box]));
for (const route of result.routes) {
  const edge = graph.edges.find((e) => e.id === route.edge)!;
  const p = route.points;
  const curve = curveOf(p, {
    type: "spline",
    startNormal: SIDE_NORMAL[nearestSide(box.get(edge.source.node)!, p[0]!)],
    endNormal: SIDE_NORMAL[nearestSide(box.get(edge.target.node)!, p[p.length - 1]!)],
    space,
  });
  const d = toSvgPath(curve); // The data of an SVG path element: "M 80 20 C ..."
}
```

A canvas draws an `arc` segment with `ctx.arc(center.x, center.y, radius, start, start + sweep, sweep < 0)`.

Each type has its own function too: `straightCurve`, `roundedCurve`, `splineCurve` and `arcCurve`.

The benchmark compares each curve type to the polylines of each router, on the fixtures of 100 nodes or fewer. It counts the curves that go through a box, with and without the free space. It also gives the ratio of the lengths.

## Room for the links

A host layout can pack the boxes of a far view in a grid, with no gap between them. Then the links have no channel, and they go through the boxes. The router knows the room that the links need. The room functions give that room, and they can open the gaps.

- `roomDemand(items, links, options)` gives the gaps of the board. A gap is a boundary between two columns (`axis: "x"`) or two rows (`axis: "y"`). Each gap has its current `width`, its `lanes` and its `need`.
- The need of a gap is `gutter + lanes × spacing`, and not less than its current width. The default gutter is 8, and the default spacing is 4.
- With the method `routes`, the default, the function opens each gap to the gutter and routes the links one time. The lanes of a gap are the most routes that go along it side by side.
- With the method `lines`, the lanes of a gap are the straight lines between the centers of the boxes that cross the gap.
- `openGaps(items, gaps)` moves each box by the growth of each gap before it. The boxes keep their size, their order and their alignment, so a grid stays a grid.
- `makeRoom(items, links, options)` gives the gaps and the open board. `maxGrowth` limits the growth of the board on each axis, as a share of its size.
- `roomLinks(graph)` gives the links of a graph, with the count of the edges of each pair.

The host layout still packs the boxes. These functions do not place a box. They only open the gaps between the boxes.

```ts
import { cornersRouter, makeRoom, roomLinks } from "@mark1russell7/highways";

const room = makeRoom(graph.nodes, roomLinks(graph), { gutter: 8, spacing: 4 });
// Each gap tells its axis, its place `at`, its `width`, its `lanes` and its `need`.
const open = { nodes: room.items, edges: graph.edges };
const result = cornersRouter({ name: "corners" }).route(open);
```

The benchmark measures the board `packedGridBoard`: 96 touching boxes and 132 links, at gutter 8 and spacing 4. The links are the links of the far view. A lane route of the router `sections` gets a lane of 4 units for each edge of a shared segment.

| Board | Area | Through | Crossings | Mean detour | Worst detour | Lane routes through a box |
|---|---:|---:|---:|---:|---:|---:|
| Packed | 1.00 | 62 | 162 | 1.12 | 1.48 | 94 |
| Gutter only | 1.13 | 0 | 345 | 1.34 | 2.38 | 10 |
| Method `routes` | 1.50 | 0 | 276 | 1.32 | 2.09 | 2 |
| Method `lines` | 3.80 | 0 | 382 | 1.20 | 1.47 | 5 |

On the packed board, the links are short only because they go through the boxes. The method `routes` is the default, because it gives the fewest crossings for its area.

## Strategies

The steps of the pipeline that vary have strategies. Each step has one interface, so a consumer chooses a strategy by its name or adds its own.

| Step | Input | Output | Built-in strategies |
|---|---|---|---|
| `router` | `Graph` | `Result` | `straight`, `plugs`, `corners`, `corners-smooth`, `trunks`, `shared`, `shared-all`, `sections`, `sections-tree` |
| `curve` | `CurveInput`: the points, the normals of the plugs and the free space | `CurveSegment[]` | `straight`, `rounded`, `spline`, `arc` |
| `room` | `RoomInput`: the boxes and the links of a board | `Gap[]` | `routes`, `lines` |

A strategy has a `step`, a `name`, a `describe` text, its `defaults` and the method `run(input, options?)`. The type of the options comes from `defaults`. Each option that a call does not give gets its default value.

- `defineStrategy({ step, name, describe, defaults, run, maxNodes? })` makes a strategy. The function `run` gets each option.
- `createRegistry(strategies)` makes a registry. Two strategies with one step and one name are an error.
- `register(registry, ...strategies)` gives a new registry. It does not change the registry before it.
- `listStrategies(registry, step)` gives the strategies of a step, in order. `findStrategy` and `getStrategy` give one strategy by its name.
- `asRouter(strategy, options?)` gives a `Router`, and `routersOf(registry)` gives the routers of a registry.
- `STRATEGIES` is the registry of `BUILT_IN_STRATEGIES`. The records `routerStrategies`, `curveStrategies` and `roomStrategies` give each built-in strategy with its typed options.

A registry is data. No import changes it. The benchmark and the site take their lists from `STRATEGIES`, so a new built-in strategy gets its rows and its button with no other edit. A consumer makes its own registry:

```ts
import { BUILT_IN_STRATEGIES, center, createRegistry, defineStrategy, FIXTURES, routersOf, runBenchmark } from "@mark1russell7/highways";

const elbow = defineStrategy({
  step: "router",
  name: "elbow",
  describe: "Each edge goes along one axis, then along the other, from center to center.",
  defaults: { turn: "x" as "x" | "y" },
  run(graph, o) {
    const box = new Map(graph.nodes.map((n) => [n.id, n.box]));
    const routes = graph.edges.map((e) => {
      const a = center(box.get(e.source.node)!);
      const b = center(box.get(e.target.node)!);
      return { edge: e.id, points: [a, o.turn === "x" ? { x: b.x, y: a.y } : { x: a.x, y: b.y }, b] };
    });
    return { routes };
  },
});
const registry = createRegistry([...BUILT_IN_STRATEGIES, elbow]);
const rows = runBenchmark(routersOf(registry), FIXTURES.slice(0, 1)); // The rows include the router `elbow`.
```

The built-in strategies give the same output as their functions. `curveStrategies.rounded.run({ points, space }, { radius: 8 })` gives the segments of `curveOf(points, { type: "rounded", space, radius: 8 })`. `benchCurveStrategies` and the fourth argument of `benchRoom` take a list of strategies.

The plugs and the zoom levels have one strategy each, so they have no step yet.

## License

MIT
