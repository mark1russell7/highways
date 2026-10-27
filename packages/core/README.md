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

## License

MIT
