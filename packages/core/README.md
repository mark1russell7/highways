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

### Plugs

A node can have `ports`, and an end of an edge can name one of them in `port`. Each plug has one of these forms:

| Form | The place of the plug |
|---|---|
| `{ id }` | The router picks the side and the point. |
| `{ id, side }` | The router picks the point on that side. |
| `{ id, at }` | The plug is fixed at `at`, relative to the top-left corner of the box. |
| `{ id, side, along }` | The plug is fixed at the side start plus `along` times the side length. |

- `along` goes from 0 to 1. The start of `north` and `south` is the left end. The start of `east` and `west` is the top end.
- When the box gets taller or wider, a plug with `along` keeps its fraction of the side.
- `resolvePorts(graph)` gives each plug with `along` a fixed `at`. Each router calls it at the start of `route`.
- The arithmetic is the arithmetic of `portPoint` of `@mark1russell7/layout-contract`. `portOffset` calls it.
- `resolvePorts` throws a `RangeError` for a bad `along`. A bad value is not finite or is outside 0 to 1. A plug with `along` also needs a `side` and has no `at`.
- In an input file, such a plug has `side` and `along`, with no `x` and no `y`.

```ts
const node = { id: "a", box: { x: 0, y: 0, w: 80, h: 40 }, ports: [{ id: "out", side: "east", along: 0.25 }] };
// The plug "out" is at (80, 10). With h = 120, it is at (80, 30).
```

### Frames

A node can name a frame node in `parent`. A frame is a node that holds other nodes, for example a card that holds rows.

- An inner edge goes from a plug of a frame to a node in the frame. `splitFrames(graph)` finds the inner edges.
- The router `corners` routes each inner edge inside its frame. The route stays in the box of the frame, smaller by the option `frameInset`.
- The route goes around the other nodes of the frame. It leaves the plug of the wall into the frame, along the normal of the wall.
- Each inner route has the id of its frame in `Route.frame`. The inner routes come after the outer routes.
- Each other router gives no route for an inner edge. To route both, use your outer router, then `corners` for the inner routes.
- An outer edge to a plug of the frame routes as before. The outer route and the inner route meet at the plug.
- The default of `frameInset` is the margin of the router.
- A parent that names no node, or a cycle of parents, makes each router throw a `RangeError`.
- The option `outside` sets the rule for a node box outside the box of its frame:
  - `throw` (the default) throws a `RangeError`.
  - `skip` gives no route to the edges of that node.
  - `clamp` cuts the box to the bounds of the frame.

```ts
const nodes = [
  { id: "card", box: { x: 0, y: 0, w: 240, h: 200 }, ports: [{ id: "in", side: "west", along: 0.25 }] },
  { id: "row", parent: "card", box: { x: 20, y: 120, w: 200, h: 24 } },
];
const edges = [{ id: "inner", source: { node: "row" }, target: { node: "card", port: "in" } }];
const inner = cornersRouter({ name: "corners" }).route({ nodes, edges }).routes; // inner[0].frame is "card"
```

## Curve types

A router gives polylines. The curve layer turns a polyline into a curve of a type. The polyline can come from any router, from a lane of `laneRoutes` or from a link of a zoom level.

| Type | Curve | Ends |
|---|---|---|
| `straight` | The polyline as it is. | As the polyline. |
| `rounded` | A quadratic Bezier curve at each corner, as `roundCorners` draws it. The `radius` sets the size of the corners. | The first and the last legs stay. |
| `spline` | A centripetal Catmull-Rom spline through each point. It does not overshoot or make loops in a piece. The `tension` goes from 0 (the spline) to 1 (the polyline). | With `startNormal` and `endNormal`, the curve leaves and enters each plug along its normal. |
| `arc` | A circular arc at each corner, tangent to the two legs. On horizontal and vertical legs, each arc is a quarter circle. | The first and the last legs stay. |
| `smooth` | A cubic spiral, an arc and a second cubic spiral at each corner, as the corner smoothing of Figma. The `smoothing` goes from 0 (the curve `arc`) to 1 (no arc). | The first and the last legs stay. |
| `clothoid` | A clothoid, an arc and a second clothoid at each corner, as a transition curve of a road. The `spiral` goes from 0 (the curve `arc`) to 1 (no arc). Cubic pieces draw each clothoid within the `tolerance`. | The first and the last legs stay. |

The curves `smooth` and `clothoid` have no jump of the curvature. The curvature grows from 0 on a leg to `1 / radius` on the arc. A cubic spiral turns by 1 radian or less, so a sharp corner keeps a part of its arc. The free space tests the triangle of each corner of these curves: the start of the corner, the vertex and the end of the corner. The curve stays in this triangle, so the test needs no samples.

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

Each type has its own function too: `straightCurve`, `roundedCurve`, `splineCurve`, `arcCurve`, `smoothCurve` and `clothoidCurve`.

### Curved highways

A curve of one lane does not know the other lanes of its bundle. So the lanes of `laneRoutes` lose their spacing at a bend. `highwayCurves` curves all the lanes together, and a bundle bends as one.

- At each bend of a bundle, the lanes are arcs with one center. The radius of a lane is the radius of the center line plus or minus its offset.
- The bend grows to keep the inner lane at `minRadius`. It shrinks to fit on its legs and in the free space.
- A lane joins or leaves a bundle on an S curve on the leg with fewer lanes. The tangent has no break there.
- The option `jog` sets the shape of the S curve. A `biarc` (the default) is two arcs. A `cubic` S curve is one cubic Bezier curve. A `quintic` S curve has no jump of the curvature, in `jogPieces` cubic pieces.
- The curvature of each S curve is `1 / radius` or less. So a `cubic` or a `quintic` S curve is longer than a biarc. Where it does not fit on its leg, the lane gets a biarc.
- A lane in no open bundle gets the curve of `arcCurve`.

```ts
import { highwayCurves, runKey, segmentsOf, toSvgPath, curveSpace } from "@mark1russell7/highways";

const graph = segmentsOf(result);
const open = new Set(graph.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges)));
const space = curveSpace(board.nodes.map((n) => n.box));
// The same input as laneRoutes(graph, open, 4, 16). The curves come in the order of laneRoutes.
for (const lane of highwayCurves(graph, open, 4, { maxWidth: 16, radius: 12, minRadius: 4, space })) {
  const d = toSvgPath(lane.segments);
}
```

The curve strategy `highway` is in the registry. For one polyline, it gives the curve of `arc`. `benchHighways` compares each lane curved alone with `rounded` to the lanes of `highwayCurves`. It gives the error of the lane spacing and the crossings in a bundle. It also gives the breaks of the tangent, the smallest radius and the curves through a box.

### Lane order through a bundle

Two edges can go along several runs one after the other. The option `laneOrder` of the routers `trunks`, `shared` and `sections` sets their lane order on these runs.

- With `bundle`, two edges keep one side on each run of their common stretch. Where they part, the edge that turns more to the left gets the left lane.
- Two edges can part on the left at one end and on the right at the other end. Then they must cross. The end with the smaller x, then the smaller y, sets the side. The crossing is where they part, not between two runs.
- With `run`, each run gets its order alone. Two edges can change sides between two runs.
- The default of `trunks` and `shared` is `bundle`. The default of `sections` is `run`, so its runs keep the lane order of version 0.2.0.
- `orderLanes(run, routes, order)` gives the order of one run. Its default order is `run`.
- The option changes only the lane order. The routes, the runs and their keys stay the same.
- The option `stretchOrder` of `shared` and `shared-all` gives one order to each stretch of runs: `none` (the default), `consensus`, `periphery` or `sifting`. The default of `shared-stretch` is `sifting`. `siftPasses` sets the passes of `sifting`.
- `stretchLaneOrders(runs, options?)` gives the order of each run. `laneStretches` gives the stretches. [One lane order for each stretch](../../docs/research/XPLAT.md#one-lane-order-for-each-stretch-lane-stretch) gives the numbers.

The benchmark measures the lanes of `highwayCurves` on the case boards, with each lane order. A crossing in the body is between the middles of the first and the last leg of a bundle. An end crossing is near a merge or a split.

| Router | Board | Body crossings, `run` → `bundle` | End crossings, `run` → `bundle` |
|---|---|---:|---:|
| `shared` | `case-dense-groups` | 10 → 0 | 366 → 162 |
| `shared-all` | `case-dense-groups` | 0 → 0 | 1586 → 838 |
| `shared-all` | `case-hub-chain` | 2 → 3 | 603 → 73 |
| `shared-all` | `case-many-groups` | 12 → 0 | 2301 → 687 |

With `bundle`, 90% or more of the end crossings that stay are necessary. Each comes from two edges that part on opposite sides at the two ends of their stretch. The order changes no crossing of the routes. The rows of `trunks` change by one end crossing at most. On the 9 rows of `sections`, 12 of the 18 crossing counts fall and 5 rise. Thus `run` stays the default of `sections`.

### Where the lanes leave a trunk

The router `trunks` gives each group one trunk from the plug to a split point. The option `leave` sets where each lane leaves the trunk.

- With `part`, the default, a lane leaves the trunk where its way parts from the ways of the other lanes.
- A lane that turns back over the trunk by more than 90 degrees leaves at an earlier point of the trunk. It does so only on a line that is clear of the boxes.
- On the second leg of the trunk, the lane leaves at the foot of its next point. A foot less than two margins from the start of that leg puts the edge out of the bundle.
- The bundle keeps the points that all its routes share. Past them, the lanes that go on together share a run, in the `runs` of the result.
- With `split`, each lane leaves at the split point, as in version 0.2.0. Lanes that go on together past the split point have no run.
- `leaveTrunk(trunk, branch, clear, min)` gives the place where one branch leaves its trunk.

The benchmark measures the lanes of `highwayCurves` on the case boards, with each value of `leave`.

| Router | Board | Worst lane spacing error, `split` → `part` | Body crossings, `split` → `part` |
|---|---|---:|---:|
| `trunks` | `case-dense-groups` | 45.6% → 0.6% | 0 → 0 |
| `trunks-all` | `case-dense-groups` | 133.2% → 0.8% | 3 → 0 |
| `trunks-all` | `case-many-groups` | 68.2% → 47.6% | 1 → 0 |

The error of 47.6% is on a new run of two lanes. With `split`, these lanes go on one line with no lane spacing, and the benchmark does not measure them. The run starts at the plug of a bundle with a very short trunk. Its first leg is 13 units long, to the corner of a box.

The benchmark compares each curve type to the polylines of each router, on the fixtures of 100 nodes or fewer. It counts the curves that go through a box, with and without the free space. It also gives the ratio of the lengths.

### Options of the cost, the order and the merges

These options of `shared` and `trunks` are off by default. With the defaults, the routes do not change.

- `cost: flow` of `shared` sets the cost of a link with `f` edges to `len * f^alpha`. A smaller `alpha` gives more sharing and a longer stretch (EDA-029).
- `passes` of `shared` sets the number of passes. After the first pass, each edge finds its way again with the ways of the other edges fixed (HWY-039).
- `order` of `shared` sets the order of the edges of a key: `span` (the default, the longest first), `shortest`, `load` or `input` (NAT-024).
- `merge: snell` of `shared` moves each merge point to the angle `acos(d)` on the run (NAT-035). It cuts the sharp merges.
- `reuse` of `shared`, with `passes` 2 or more, routes each edge again in each later pass. The busy links of the pass before cost less (HWY-005).
- `capacity` of `shared` adds a cost for each lane that does not fit in the free space across a link. `laneWidth` sets the width of a lane (HWY-016).
- `splitAt: gilbert` of `trunks` puts the split point where the flow cost is least, with the exponent `alpha` (EDA-030).
- `fan: tree` of `trunks` grows a balancing-factor tree for each group, with the factor `bf` (NAT-017). 0 gives the least ink.

The screen `screen-v1` compares the options with the defaults on the boards `small-clustered`, `dense-groups`, `hub-chain` and `many-groups`.

| Option | Router | Result |
|---|---|---|
| `passes: 3` | `shared-all` | B1 rises 1% to 8%, and the B3 q95 falls or stays, on 4 boards. Crossings fall up to 28%. |
| `merge: snell` | `shared`, `shared-all` | The B6 max falls 8% to 27% on 6 board pairs. The ink rises 0.5% at most. Crossings rise 6% to 13%, and from 18 to 24 on `hub-chain`. |
| `cost: flow`, `alpha` 0.5 | `shared-all` | B1 rises 1% to 32%, but the B3 q95 rises up to 67%. |
| `fan: tree`, `bf` 0.2 | `trunks` | On `dense-groups`, B1 rises from 0.081 to 0.095 and the B3 q95 falls. |
| `splitAt: gilbert` | `trunks` | The B6 max rises. The ink changes 0.6% at most. |

## Room for the links

A host layout can pack the boxes of a far view in a grid, with no gap between them. Then the links have no channel, and they go through the boxes. The router knows the room that the links need. The room functions give that room, and they can open the gaps.

- `roomDemand(items, links, options)` gives the gaps of the board. A gap is a boundary between two columns (`axis: "x"`) or two rows (`axis: "y"`). Each gap has its current `width`, its `lanes` and its `need`.
- The need of a gap is `gutter + lanes × spacing`, and not less than its current width. The default gutter is 8, and the default spacing is 4.
- With the method `routes`, the default, the function opens each gap to the gutter and routes the links one time. The lanes of a gap are the most routes that go along it side by side.
- With the method `lines`, the lanes of a gap are the straight lines between the centers of the boxes that cross the gap.
- `openGaps(items, gaps)` moves each box by the growth of each gap before it. The boxes keep their size, their order and their alignment, so a grid stays a grid.
- `makeRoom(items, links, options)` gives the gaps and the open board. `maxGrowth` limits the growth of the board on each axis, as a share of its size.
- With `passes: 2`, `roomDemand` finds the lanes again on the open board and adds the growth that they need. `maxGrowth` limits the sum of the passes.
- The option `bends` gives room to the bends of the bundles (HWC-D). It is off by default. Its router routes the open board, and each segment with two or more edges is a bundle.
- With `bends`, a leg of a bundle that is too short for its arcs grows by one gap between its ends. A bend of the width `W` needs the radius `W/2 + minRadius` on its center line.
- `roomLinks(graph)` gives the links of a graph, with the count of the edges of each pair.
- `gapLanes(items, links, options)` gives each link of a far view its own lane in each gap. The lanes are `spacing` apart, around the middle of the gap.
- The option `order` of `gapLanes` sets the lane order in a gap: `links` (the order of the list), `ends` (by the sides of the turns) or `crossings` (the default).

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
| Packed | 1.00 | 56 | 113 | 1.14 | 1.48 | 94 |
| Gutter only | 1.13 | 0 | 345 | 1.34 | 2.38 | 10 |
| Method `routes` | 1.50 | 0 | 276 | 1.32 | 2.09 | 2 |
| Method `lines` | 3.80 | 0 | 382 | 1.20 | 1.47 | 5 |

On the packed board, the links are short only because they go through the boxes. Before ER3d, 62 links went through a box, with 162 crossings. The method `routes` is the default, because it gives the fewest crossings for its area.

`sweepRoom` changes one knob at a time on the same board. `growthSettings`, `laneSettings` and `passSettings` give the settings of the benchmark.

| Knob | Setting | Area | Crossings | Mean detour | Worst detour | Lane routes through a box |
|---|---|---:|---:|---:|---:|---:|
| `maxGrowth` | 0.12 | 1.25 | 288 | 1.34 | 2.33 | 6 |
| `maxGrowth` | 0.25 | 1.46 | 284 | 1.32 | 2.14 | 2 |
| `maxGrowth` | 0.30 and more | 1.50 | 276 | 1.32 | 2.09 | 2 |
| Lane order | `links` | 1.50 | 585 | 1.34 | 2.30 | 2 |
| Lane order | `ends` | 1.50 | 551 | 1.33 | 2.19 | 2 |
| Lane order | `crossings` | 1.50 | 467 | 1.33 | 2.23 | 2 |
| Passes | 2 | 1.57 | 281 | 1.32 | 2.03 | 2 |
| Gutter | 12 | 1.58 | 282 | 1.32 | 2.03 | 2 |

The links of a gap without lanes share one line. Thus the crossings on that line do not count. With a lane for each link, the crossings show, and the order `crossings` removes 20% of them. The spacing changes the crossings less than 5%. The mean detour stays near 1.32 for each knob, because a link with legs parallel to the axes goes around the boxes.

### Room at each zoom level

At a far view, a group of nodes is one box. The boxes of the groups touch, so the level links have no channel. `levelRoom` gives each zoom level the gaps that its own links need.

- `levelRoom(nodes, links, root, options)` takes the nodes, the links and the tree of sections. The indices of the tree are the indices of `nodes`.
- The far levels open first. Each nearer level measures its links on the board of the level before it, and only adds growth. Thus a box moves with its parent.
- The nodes move by one monotone shift on each axis. Thus each level keeps the order and the alignment of the boxes, and no gap of a far level gets narrower.
- Each level of the result gives its `items` at their open places, its links (`pairs`), its demand (`gaps`) and its `nodes`.
- With `board: "shared"`, the default, each level uses the board of the nearest level. No box moves between two levels.
- With `board: "each"`, each level has its own board. The items of a far level stay nearer together, but a box moves in its parent when the level changes.
- `depths` sets the depths that get room. With `nodes: true`, the level with each node alone also gets room.
- The result also gives the `gaps` of the nodes: `openGaps(nodes, gaps)` gives the board of the nearest level. The room strategy `levels` gives these gaps.
- `levelCut(nodes, root, depth)` gives the items of one level, as the router `sections` makes them.

```ts
import { buildSections, levelRoom, roomLinks, sectionsRouter } from "@mark1russell7/highways";

const root = buildSections(graph.nodes);
const room = levelRoom(graph.nodes, roomLinks(graph), root, { gutter: 8, spacing: 4 });
// Each level gives its items at their open places.
const far = room.levels[1]!.items;
const result = sectionsRouter({ name: "sections" }).route({ nodes: room.items, edges: graph.edges });
```

The router makes the tree of sections again from the open board. To keep the tree of the packed board, give the router a `group` strategy that gives `root`.

`benchLevelRoom` measures each level with groups. The board `nestedGridBoard` has 256 touching boxes, and its quadtree has 4, 16 and 64 groups. The fair baseline opens each level to the gutter only. Each link gets a lane of 4 units in each gap, and the crossings count these lanes. The shift is the move of a box in its parent from the level before, in gutters.

| Board | Depth | Area | Through | Crossings | Worst detour | Order changes | Mean shift |
|---|---:|---:|---:|---:|---:|---:|---:|
| Packed | 2 | 1.00 | 6 | 14 | 2.36 | 0 | 0 |
| Packed | 3 | 1.00 | 36 | 122 | 1.87 | 0 | 0 |
| Gutter only | 1 | 1.01 | 0 | 0 | 1.32 | 0 | 0.71 |
| Gutter only | 2 | 1.03 | 0 | 290 | 2.45 | 0 | 0.71 |
| Gutter only | 3 | 1.07 | 0 | 836 | 2.37 | 0 | 0.71 |
| Room of the nodes alone (`makeRoom`) | 1 to 3 | 1.61 | 0 | 0, 273, 836 | 1.38, 2.27, 2.15 | 0 | 0 |
| `levelRoom`, board `shared` | 1 to 3 | 1.35 | 0 | 0, 273, 836 | 1.40, 2.18, 2.14 | 0 | 0 |
| `levelRoom`, board `each` | 1 | 1.02 | 0 | 0 | 1.41 | 0 | 1.12 |
| `levelRoom`, board `each` | 2 | 1.17 | 0 | 273 | 2.21 | 0 | 3.66 |
| `levelRoom`, board `each` | 3 | 1.35 | 0 | 836 | 2.14 | 0 | 2.63 |

The room removes each level link through a box, and no level changes the order of the boxes. Against the gutter only, the crossings with lanes fall 6% at depth 2 and stay the same at depth 3. Most crossings come from the links themselves, not from the width of the gaps. The board `shared` uses 16% less area than the room of the nodes alone, and no box moves between two levels. The board `each` keeps the far levels small, but the boxes move 1 to 4 gutters in their parents. Thus `shared` is the default.

## Options of the zoom levels

The router `sections` makes its hubs and its zoom levels from a tree of groups. Each rule and each limit of that tree is an option. The defaults give the output of version 0.1.5, but `throughCost` changes the links of a walled-in level.

| Option | Default | Where | What it sets |
|---|---|---|---|
| `group` | the quadtree | `sectionsRouter` | The grouping rule: a strategy of the step `group`. `groupOptions` gives its options. |
| `levels` | each depth | `sectionsRouter` | The depths of the tree that get a level with groups. The level of single nodes always comes last. |
| `stretch` | 2 | `sectionsRouter` | The hub limit. A way through the hubs is at most this many times the straight line. `Infinity` keeps each such way. |
| `stretchPad` | 4 | `sectionsRouter` | A way through the hubs can be this many margins longer than the hub limit. |
| `hubSlack` | 80 | `sectionsRouter` | A way skips a hub that is this many units farther from the target than the way was before. |
| `hubs` | `Infinity` | `sectionsRouter` | The number of hubs on each side of the lowest common section that a way passes. |
| `cap` | 8 | `buildSections` | The section limit. A section with more nodes splits in four. |
| `maxDepth` | 16 | `buildSections` | The depth limit of the tree. |
| `collapse` | 32 | `buildSections` | A cell shrinks to one quarter at most this many times without a split. |
| `tightMargin` | 1 | `levelLinks` | The margin of the second corner graph of the level links. |
| `plugInset` | 6 | `levelLinks` | A plug of a level link stays this far from the corners of its side. |
| `throughCost` | 8 | `levelLinks` | The cost of a level link through a far box, in mean box sizes. The value 0 gives the links of version 0.1.5. |
| `routesAt`, `itemAt` | 22, 120 | `pickLevel` | The far-view thresholds, in pixels on the screen. `PICK` holds them. |

`SECTIONS_DEFAULTS`, `SECTION_DEFAULTS`, `LEVEL_LINK_DEFAULTS` and `PICK` give the default numbers. `itemSizes(levels)` gives the sizes that `pickLevel(sizes, scale, options)` reads.

The built-in grouping rules are in `groupStrategies`. The rule `quadtree` splits the plane, as `buildSections` does. The rule `keys` makes one group for each key of the nodes. Its default key is the string `data.group` of a node, and a node without a key is a group alone. With the option `split`, a large group splits into a quadtree.

The rule `kd` splits the plane with lines across one axis, as a k-d tree does. The option `line` sets the place of each line. The value `median` puts half of the nodes on each side. The value `middle` cuts the cell in half. The value `slide` cuts the cell in half and moves a line with an empty side to the nearest node. With the fan-out 4, each half splits again on the same level.

The rule `cut` also splits the plane with lines, but each line cuts the fewest edges. The option `balance` gives the smallest share of the nodes on each side. The option `objective` sets the cost of a line, and the option `pull` moves the line to the middle of the cell. With the option `guard`, each section also tries the split of the quadtree and keeps the split that cuts fewer edges.

A consumer rule groups the nodes by its own field. Then the far view shows one item for each group:

```ts
import { defineStrategy, keyedSections, sectionsRouter } from "@mark1russell7/highways";

const byTeam = defineStrategy({
  step: "group",
  name: "team",
  describe: "One group for each team.",
  defaults: {},
  run: (graph) => keyedSections(graph.nodes, { key: (node) => String(node.data?.["team"]) }),
});
const result = sectionsRouter({ name: "teams", group: byTeam }).route(graph);
// result.levels[1] has one item for each team. The id of an item is "s:" and the team.
```

The router examines the tree of a consumer rule with `checkSections`. Each node must be in exactly one leaf. The children of a section split its nodes, and a child is one level deeper than its parent.

The benchmark sweeps the hub limit, `hubSlack`, `cap` and the grouping rules on the case boards. Each table starts with the defaults. On `case-hub-chain`:

| `stretch` | Worst detour | Routes through hubs | Shared runs | Out and back |
|---|---:|---:|---:|---:|
| 1.25 | 1.19 | 14 | 4 | 0 |
| 1.5 | 1.39 | 20 | 8 | 0 |
| 2 (default) | 1.78 | 24 | 10 | 0 |
| 3 | 2.05 | 25 | 11 | 0 |

A smaller hub limit gives shorter routes and fewer shared runs. No route goes through a box or out and back at any value. On `case-many-groups`, the rule `keys` has one key for each group of cards. It gives 32 items at the far view, and no level link goes out and back.

### Links through a walled-in level

On a walled-in level, each group overlaps its neighbours, so some level links find no way around the groups. The measures split the level links through a box in two:

- An unavoidable link goes only through boxes that overlap its source or its target.
- An avoidable link also goes through a far box. A far box overlaps neither end of the link.

A level link through a far box gets a second way. That way can go through boxes, and each far box costs `throughCost` mean box sizes. The link keeps the way with fewer far boxes. The benchmark sweeps `throughCost`. On `mid-clustered`, at depth 3, in CI:

| `throughCost` | Through | Unavoidable | Avoidable | Out and back | Worst detour |
|---|---:|---:|---:|---:|---:|
| 0 (version 0.1.5) | 208 | 94 | 114 | 124 | 5.88 |
| 2 | 208 | 123 | 85 | 124 | 5.88 |
| 4 | 208 | 141 | 67 | 124 | 5.88 |
| 8 (default) | 208 | 154 | 54 | 124 | 5.88 |
| 16 | 208 | 157 | 51 | 124 | 5.88 |

The second way does not change the number of links through a box. It moves them from far boxes to the boxes next to their ends.

## Strategies

The steps of the pipeline that vary have strategies. Each step has one interface, so a consumer chooses a strategy by its name or adds its own.

| Step | Input | Output | Built-in strategies |
|---|---|---|---|
| `group` | `Graph` | `Section`: the tree of groups of the router `sections` | `quadtree`, `keys`, `kd`, `cut` |
| `plugs` | `PlugInput`: the graph, and optionally the ways of the router | `PlugPair[]`: the two plugs of each edge | `facing` |
| `router` | `Graph` | `Result` | `straight`, `plugs`, `corners`, `corners-smooth`, `trunks`, `shared`, `shared-all`, `sections`, `sections-tree` |
| `highway` | `HighwayInput`: the graph, optionally the first routes of a router, and optionally the plan before an edit | `HighwayPlan`: the highways as data | `keys`, `shared-ways`, `corridors`, `meet`, `weiszfeld`, `stubs`, `zipper`, `level-links`, `quickbundles`, `road-classes`, `flow-field`, `wspd`, `od-cells`, `select`, `mingle`, `spiral`, `flow-clusters`, `traclus`, `diffusion`, `nested`, `lanes`, `growth`, `edge-paths`, `soft-keys`, `hough`, `ridges`, `hdbscan`, `hub-arcs`, `divided`, `hierarchy`, `fdeb`, `mesh`, `kdeeb`, `cubu`, `mlseb`, `sbeb`, `areas`, `confluent`, `power`, `crossbars`, `frechet`, `spectral`, `resistance`, `link-communities`, `territories`, `consensus`, `p-hub`, `scale-space`, `corridors+breakeven`, `corridors+stretch`, `corridors+ambiguity`, `corridors+hysteresis`, `corridors+ids` |
| `levels` | `LevelInput`: the graph, the tree of groups and the routes | `Level[]`: the zoom levels of the router `sections` | `depths` |
| `curve` | `CurveInput`: the points, the normals of the plugs, the free space and the lane on its board | `CurveSegment[]` | `straight`, `rounded`, `spline`, `arc`, `smooth`, `clothoid`, `highway` |
| `room` | `RoomInput`: the boxes and the links of a board, and the tree of sections for `levels` | `Gap[]` | `routes`, `lines`, `levels` |
| `whole` | `Graph` | `WholeOutput`: the board and its `Result` | `pipeline` |

`STEPS` gives the steps in the order of the pipeline: `group`, `plugs`, `router`, `highway`, `levels`, `curve`, `room`, `whole`.

- The plugs come before the router, because the router finds its ways between the plugs.
- The levels come after the routes, because the last level uses the routes.
- The step `whole` runs the other steps, so it comes last.

A strategy has a `step`, a `name`, a `describe` text, its `defaults` and the method `run(input, options?)`. The type of the options comes from `defaults`. Each option that a call does not give gets its default value.

- `defineStrategy({ step, name, describe, defaults, schema?, run, maxNodes? })` makes a strategy. The function `run` gets each option.
- `createRegistry(strategies)` makes a registry. Two strategies with one step and one name are an error.
- `register(registry, ...strategies)` gives a new registry. It does not change the registry before it.
- `listStrategies(registry, step)` gives the strategies of a step, in order. `findStrategy` and `getStrategy` give one strategy by its name.
- `asRouter(strategy, options?)` gives a `Router`, and `routersOf(registry)` gives the routers of a registry.
- `STRATEGIES` is the registry of `BUILT_IN_STRATEGIES`. The records `groupStrategies`, `plugStrategies`, `routerStrategies`, `highwayStrategies`, `levelStrategies`, `curveStrategies`, `roomStrategies` and `wholeStrategies` give each built-in strategy with its typed options.

### The steps `plugs`, `levels` and `whole`

Each of these steps has one default strategy. The default gives the output of the code before the step, so each route stays the same.

- `facing` (the step `plugs`) puts each free plug on the side that faces the other end of its edge. The router `corners` uses it by default.
  The option `plug` of `corners` takes a plug strategy, and `plugOptions` gives its options.
- `depths` (the step `levels`) makes one zoom level for each depth of the tree, and a last level with each node alone (`depthLevels`).
  The option `level` of `sections` takes a level strategy, and `levelOptions` gives its options. The strategy also gets the level options of the router.
- `pipeline` (the step `whole`) runs a room strategy, then a router or a highway plan, with the rules that the router reads (`runPipeline`).
  Without options, it routes with `corners`. The demo of the site runs it. It does not draw the curves.
- `venation` (the step `levels`, NAT-016) keeps the levels of `depths`. Its level links take their ways on a closed backbone of the items.
  The backbone is the relative neighbourhood graph (`rng`) or the Gabriel graph. A backbone link that a level link uses costs less for the next level links.
  The routes do not change, so only the level links (Z3) change.
- `board-portfolio` (the step `whole`, WILD-045) runs a short list of settings on the board and keeps the best one.
  The list `BOARD_PORTFOLIO_SETTINGS` holds 12 routers and highway plans. The option `settings` sets how many of them run.
  A setting with a break of a hard rule does not count. The score adds the rank shares of the crossings, the median detour and the ink saved.
  It reads no screen record and has no fit. With `budget: 0`, the default, the pick does not depend on the speed of the machine.
- `strategyKey(router, step)` gives the option of a router that takes a strategy of the step. `pipeline` uses it for the steps `group`, `plugs` and `levels`.
- `stepRouterStrategy(strategy)` runs a strategy of a step of `RoutedStep` as a router. `stepRouters(registry, step)` gives one router for each strategy of the step.

```ts
import { asRouter, CASES, plugStrategies, routerStrategies, wholeStrategies } from "@mark1russell7/highways";

const graph = CASES.find((c) => c.name === "case-hub-chain")!.make();
// The two calls give the routes of `corners` with no option.
const a = asRouter(routerStrategies.corners, { plug: plugStrategies.facing }).route(graph);
const b = wholeStrategies.pipeline.run(graph).result;
```

### The step `highway`

The step `highway` decides which edges share a way. It gives a plan, not routes. `follow` routes the plan.

- A `Highway` has an `id`, a `key`, a `spine`, its `lanes` and its `members`. Lane 0 is on the left of the spine.
- A `HighwayMember` is an edge with its merge point and its split point. `on` and `off` give their places on the spine.
- `checkPlan(graph, plan)` lists the problems of a plan. A good plan gives an empty list.
- `follow(graph, plan, options?)` routes each member from its plug to its merge point, along the spine, and from its split point to its target.
- `follow` routes an edge that is not a member with its first route, or with the way finder. It gives one run for each stretch that two members or more share.
- `highwayRouter(strategy)` and `highwayRouterStrategy(strategy)` give a router that makes the plan and then calls `follow`.

| Strategy | Decision |
|---|---|
| `keys` | The trunks and the runs of the router `trunks`. `planOfResult` reads them. The router does not change. |
| `shared-ways` | The runs of the router `shared`. `planOfResult` reads them. The router does not change. |
| `corridors` | The corridor signatures of HWY-031. The links of the first routes get a MinHash signature, and each cluster of ways gives a highway. |
| `meet` | The merge points and split points of HWY-050. Each member joins its spine where its first route meets the spine, and leaves where they part. |
| `weiszfeld` | The meeting points of HWY-043. Each highway gets the merge and split points with the least ink, with the weight `k^alpha` on the trunk. |
| `stubs` | The stubs of HWY-015. The ends on one side of a box that go in near directions share one plug and one short stub. |
| `zipper` | The axon zipper of NAT-022. Two near, nearly parallel legs zip into one line when the shared length pays for the jogs. |
| `level-links` | The level links of HWY-056. The edges between two items of a zoom level ride the link of the level. |
| `quickbundles` | The QuickBundles of HWY-026. One pass puts each edge in the nearest cluster of resampled lines. Each cluster gets highways. |
| `road-classes` | The road classes of HWY-034. The links that most ways use become main roads. A second pass routes the edges onto them. |
| `flow-field` | The flow field of EDA-046. The edges into one side of a box merge like streams on shortest ways to one root. |
| `wspd` | The well-separated pairs of HWY-018. The edges between the two sets of one pair share one highway. |
| `od-cells` | The origin and destination cells of EDA-033. The edges between two cells of a zoom level share one trunk. |
| `select` | The candidate selection of HWY-045. Some strategies propose highways, and a greedy pass with swaps keeps the best set. |
| `mingle` | The agglomerative bundles of HWY-003 (MINGLE). Two bundles that are near in 4D merge when the merge saves ink. |
| `spiral` | The spiral trees of HWY-017 and EDA-035. The edges of a hub with many targets share the branches of one tree of spirals. |
| `flow-clusters` | The end point clusters of HWY-023. A hierarchical clustering puts the edges with near ends in 4D into one highway. |
| `traclus` | The segment clusters of HWY-025 (TRACLUS). The near segments of the first routes make clusters, and each cluster gives its mean line. |
| `diffusion` | The route-aware bundling of HWY-020. The use of each link spreads to the links next to it, and dense links cost less. |
| `nested` | The nested levels of HWY-052. Each level puts the edges of each cluster of the level above in finer clusters. The option `level` selects the plan. |
| `lanes` | The lanes and the capacity of HWY-051. A highway that does not fit in its channels splits into two highways by lane order. |
| `growth` | The local growth of HWY-055. Each edge, the longest first, joins the highway with the largest saving, or starts a highway. |
| `edge-paths` | The edge-path bundling of HWY-012. An edge with a short path of other edges follows their ways. |
| `soft-keys` | The soft keys of HWY-019. The key of an edge adds a distance, so near edges of two keys can share a highway. |
| `hough` | The Hough votes of HWY-024. The straight lines of the edges vote for corridors, and each peak becomes a highway. |
| `ridges` | The density ridges of HWY-032. The ridges of the blurred density of the edges become highways. |
| `hdbscan` | The density clusters of HWY-028 (HDBSCAN). The clusters of edges that live over a long range of densities become highways. |
| `hub-arcs` | The hub arc location of HWY-042. A greedy pass with swaps chooses at most `q` arcs, and each edge rides its best arc. |
| `divided` | The divided edge bundling of HWY-011. Each highway of two-way traffic splits into two carriageways, one for each direction. |
| `hierarchy` | The hierarchical edge bundling of HWY-001. Each edge goes near the hubs of the sections between its two leaves. |
| `fdeb` | The force-directed edge bundling of HWY-002 with the box field of RULE-002. The bundled points snap back to legal ways. |
| `mesh` | The control mesh of HWY-004. The crossings of the edges with the mesh form clusters, and a cluster shares one point. |
| `kdeeb` | The density bundling of RULE-028 with HWY-006. The edges move up a density that is 0 in the boxes. |
| `cubu` | The fast density bundling of HWY-007. The steps of `kdeeb` with a separable blur or a Fourier transform. |
| `mlseb` | The moving least squares bundling of HWY-008. Each point moves to a local fit of the near edges, and snaps back to a legal way. |
| `sbeb` | The skeleton-based edge bundling of HWY-009. The edges of a group move toward the skeleton of their shape. |
| `areas` | The image-based edge bundles of HWY-010. Each group of edges is one area around the longest path of its skeleton. |
| `confluent` | The confluent drawings of HWY-013. Each biclique of a greedy search is one track with two junctions. |
| `power` | The power graphs of HWY-014. The edges between two modules of nodes are one power edge, and one highway. |
| `crossbars` | The bundled crossings of HWY-022. Two sets of edges that cross near one place cross as two bundles. |
| `frechet` | The subtrajectory clusters of HWY-027. The parts of the first routes near one reference part, by the discrete Fréchet distance, become highways. |
| `spectral` | The spectral clusters of HWY-029. The largest eigengap of the compatibility graph of the edges gives the number of clusters. |
| `resistance` | The spectral bundling of HWY-021. The effective resistance of each edge lowers the weight of a pair of two bridges. |
| `link-communities` | The link communities of HWY-030. The edges with a common node and similar neighbours form one community. |
| `territories` | The territories of HWY-033. The plugs and the bends form cells, and the strong flows between two cells become highways. |
| `consensus` | The consensus of HWY-035. The finders vote on the pairs of edges, and the pairs that most finders agree on stay. |
| `p-hub` | The p-hub median of HWY-041. The p-median of the plugs gives the hubs, and the links between two hubs become highways. |
| `scale-space` | The scale space of HWY-053. Only the clusters that live over a long range of scales get highways. |
| `steiner` | The Steiner trees of HWY-036. Each group of edges gets one rectilinear tree around the boxes, and the shared parts of the tree become highways. |
| `gaps` | The gap highways of HWY-057. A free line in a gap between boxes holds a highway when enough edges can ride it. |
| `streets` | The orthogonal streets of HWY-058. A greedy set cover picks the free horizontal and vertical lines that carry the most edge length. |
| `search` | The local search of HWY-059. It adds, drops and changes the highways of a start plan, and it keeps the plan with the best score. |
| `interchanges` | The interchanges of HWY-060. An edge can change from one highway to another at an interchange, where two spines come near. |
| `knee` | The knee tree of NAT-018. A sweep of the balancing factor gives trees from the least ink to the most direct paths, and the knee of that front is the pick. |
| `bronchial` | The bronchial tree of NAT-019. The tree grows toward the center of its targets, then splits them in two sectors, again and again. |

The strategy `corridors` joins two ways when they share a long length. The length is `BREAK_EVEN` times the lane width or more, and the share `rho` of the shorter way or more.
The strategies `meet`, `weiszfeld`, `stubs`, `zipper`, `level-links`, `lanes`, `divided` and `crossbars` change the plan of the option `from`: `shared-ways` (the default), `corridors` or `none`.
The routers `trunks` and `shared` keep their own code. A test pins their output, so the strategies `keys` and `shared-ways` read the same decision.

A gate keeps, drops or changes the highways of a plan. `gateStrategy(strategy, gate)` puts a gate after a highway strategy, with the name `<strategy>+<gate>`.
The new strategy has the options of both. The keys of the options of a gate are not keys of the strategy before it. Gates can follow gates.

| Gate | Rule |
|---|---|
| `breakeven` (HWY-047) | An edge stays on its highways only when its share of the shared ink is larger than its detour. The option `shareAlpha` sets the cost `n^shareAlpha` of a stretch for `n` edges. |
| `stretch` (HWY-048) | An edge stays only when its route is at most `budget` times its route alone, plus `pad`. |
| `ambiguity` (HWY-049) | Each highway keeps its largest group of edges whose end nodes have an ambiguity of `maxAmbiguity` or less. The ambiguity is the share of the pairs of end nodes without an edge. |
| `hysteresis` (HWY-046) | A new highway needs `kOn` edges. A highway of the plan before the edit stays while it has `kOff` edges. |
| `ids` (HWY-054) | Each highway takes the id of the highway of the plan before the edit with the most common edges. The routes do not change. |

The gates `hysteresis` and `ids` read `HighwayInput.previous`: the graph and the plan before an edit. Without it, `hysteresis` uses the limit `kOn` and `ids` changes nothing.
The functions `keepMembers`, `edgeLengths`, `matchHighways`, `jaccard` and `commonEdges` help a new gate.

A registry is data. No import changes it. The benchmark and the site take their lists from `STRATEGIES`, so a new built-in strategy gets its rows and its button with no other edit. A consumer makes its own registry:

```ts
import { BUILT_IN_STRATEGIES, center, createRegistry, defineStrategy, FIXTURES, routersOf, runBenchmark } from "@mark1russell7/highways";

const elbow = defineStrategy({
  step: "router",
  name: "elbow",
  describe: "Each edge goes along one axis, then along the other, from center to center.",
  defaults: { turn: "x" as "x" | "y" },
  schema: { turn: { type: "enum", values: ["x", "y"], describe: "The axis of the first leg." } },
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

### Wrappers of a router

Two functions wrap a router strategy. The wrapped strategy has a new name, and the router does not change.

- `stableOrderStrategy(strategy)` gives `<name>+stable`. It routes the edges in a stable order: by a hash of their ids, then by the ids. Thus each order of the input edges gives the same output.
- `repairStrategy(strategy, repair?)` gives `<name>+repair`. After the router, `repairResult` repairs the breaks of the hard rules.
  - It moves each free end back to its plug, and pushes each inner leg out of a box.
  - It replaces each other leg through a box with a detour through the corner graph.
  - When a leg does not repair, it routes the whole route again. Else it walks along the boundaries of the boxes, so boxes that touch do not block it.
  - A route that it cannot repair keeps its base route.
- `withStableOrder(router)` and `withRepair(router, repair?)` wrap a `Router` in the same way.

```ts
import { repairStrategy, routerStrategies, stableOrderStrategy } from "@mark1russell7/highways";

const shared = stableOrderStrategy(routerStrategies.shared);
const result = repairStrategy(shared).run(graph); // The router `shared+stable+repair`.
```

### The router `attraction`

The router `attraction` is opt-in. It is not in `STRATEGIES`, so the default outputs do not change.

- `attractionRouter(options)` gives the negotiated attraction of HWY-044, and `attractionStrategy` is its router strategy.
- Each pass after the first routes each edge again. A link that many edges used in the passes before gets a lower cost.
- The options are `passes` (1 to 10), `attraction` (0 to 1), `capacityWeight` (0 to 10) and `laneWidth` (1 to 12).
- A capacity term raises the cost of a link when its users are more than its width holds.
- With 1 pass, `attraction: 0` and `capacityWeight: 0`, the routes are the routes of `shared`.

### The routers `tight` and `annealing`

The routers `tight` and `annealing` are opt-in. They are not in `STRATEGIES`, so the default outputs do not change. Both put a hook on the router `shared`.

- `tightRouter(options)` gives the order of WILD-023: the edges whose second way costs much more than their first way go first.
  Its options are `penalty` (2 to 10), `first` (`tight` or `loose`) and `ties` (`id` or `length`). `tightStrategy` is its router strategy.
- `annealingRouter(options)` gives the simulated annealing of RULE-021, with the candidate routes of WILD-028. Each edge picks one of a few ways.
  The energy adds the ink, the path length and the crossings. The chance to keep a worse state is rational, so it uses no `Math.exp`.
  Its options are `candidates` (3 to 8), `crossing` (0 to 20), `temperature` (0.1 to 10), `cooling` (0.9 to 0.99), `budget` (20 to 200) and `seed`.
  The same seed gives the same routes. `annealingStrategy` is its router strategy.

### The portfolio router

The router `portfolio` is opt-in. It is not in `STRATEGIES`, so the default outputs do not change. [`PORTFOLIO.md`](../../docs/research/PORTFOLIO.md#the-portfolio-router-portfolio-api) gives its tables.

- `routePortfolio(graph, options?)` runs the router `shared` first, then more members for the size band of the graph. It gives the output with the fewest guard breaks, then the most ink saved (B1).
- The options are `rule` (`collection` or `all`), `cap` (1.1, 1.25 or 1.5), `k` (3, 5 or 8), `budgetMs`, `maxMembers` and `hashes`.
- `hashes` sets the members with an `outputHash` in the trace. With `pick` (the default), only the base and the winner get a hash, and only when the winner is not the base. With `all`, each member that ran gets a hash. The output and the winner do not change. [The hash of the router](../../docs/research/PORTFOLIO.md#the-hash-of-the-router-hash-lazy) gives the times.
- The size bands are 1 to 12, 13 to 24, 25 to 40, 41 to 64 and 65 to 128 nodes. An input above 128 nodes uses the last band.
- Without `k`, the members are the fit of the band. Each member has a node limit, so the default is deterministic. The limits keep the model time at or below 45 ms. The model counts the key on the output of each member, and the hashes of a pick that moves.
- At 41 to 64 nodes, the fit runs one member at the cap 1.5 under the rule `collection`. Above 64 nodes, the fit is `shared` alone.
- With `k`, the members are the first `k` names of the greedy set of the band.
- A member passes the guard when it has no more breaks of each hard rule than `shared`. It also has no edge with a stretch above the cap. Under the rule `collection`, it also has no shared segment with edges of two collections. The base `shared` always passes.
- `budgetMs` is an opt-in ceiling. A cut by the budget makes the output depend on the speed of the machine.
- `budgetMs` is a soft limit between members. The router examines it only before each member, so a slow member runs to its end. With `budgetMs: 50`, the median on large boards was 142 to 239 ms.
- Version 0.6.0 changes the default of `routePortfolio`. [The defaults of 0.5.1 and 0.6.0](../../docs/research/PORTFOLIO.md#the-defaults-of-051-and-060) gives the old and the new members of each band.
- Version 0.7.0 changes it again. [The defaults of 0.6.0 and 0.7.0](../../docs/research/PORTFOLIO.md#the-defaults-of-060-and-070) gives the members that change.
- The router picks with `selectBest` of `@mark1russell7/layout-contract`, the one run-time dependency of the core.
- The result has the output, the winner, the trace of the pick and the move count `move.pick`.
- `exactStretches(graph, options?)` gives a function from the routes to the stretch of each edge in the exact model. The router uses it for the cap. `exactStretch` gives the largest stretch.
- `portfolioRouter(options?)` gives a `Router`, and `portfolioStrategy` is the router strategy. Add `portfolioStrategy` to a registry of your own to race it.
- `portfolioStrategy.schema` declares each option except the clock `now` (SCHEMA-GAPS). The lists of `rule`, `cap`, `k` and `hashes` come from `PORTFOLIO_RULES`, `PORTFOLIO_CAPS`, `PORTFOLIO_KS_API` and `PORTFOLIO_HASHES`.

```ts
import { routePortfolio } from "@mark1russell7/highways";

const { result, winner } = routePortfolio(graph, { rule: "all", cap: 1.25, k: 5, budgetMs: 50 });
```

### The router `shared-stretch`

The router `shared-stretch` is opt-in. It is `shared` with the stretch order `sifting`. It is not in `STRATEGIES`, so the default outputs do not change.

- `sharedStretchStrategy` is the router strategy. Add it to a registry of your own to race it.
- Its routes are the routes of `shared`. Only the lane order of the runs changes.
- On `screen-v1`, the order `sifting` cuts the lane crossings and the broken pairs of `shared` from 21 to 16.
- Each run calculates the relation of each pair of its lanes. On a dense board of 1000 boxes, a route takes 25 times the time of `shared`.

### Declarations of the options

Each strategy declares its options in `schema`. A declaration tells the type, the range, the step and the meaning of one option. Tools make controls and sweeps from these declarations, with no other data.

| Type | Fields | Values |
|---|---|---|
| `number`, `integer` | `min`, `max`, `step`, `scale`, `special`, `marks`, `values` | A number. An `integer` takes only whole numbers. With `values`, only one of `values`. |
| `boolean` | | `false` or `true`. |
| `enum` | `values`, `custom` | One of `values`. With `custom: "function"`, also a rule of the caller. |
| `function`, `strategy`, `list`, `object` | `step` (for `strategy`) | A rule, a strategy, an array or an object. A sweep cannot set them. |

Each declaration has a `describe` sentence and an optional `default`.

- The range from `min` to `max` is the range of a control and of a sweep. The strategy can take a value outside it.
- The `scale` is `linear` or `log`. A sweep on the scale `log` gives values with equal ratios.
- The `special` values are valid outside the range. `Infinity` sets no limit.
- The `marks` are the notable values: the default and the values of the sweeps of the benchmark.
- The `values` of a number option are its only valid values. A control shows them as a list, and a sweep gives them. The `cap` of the portfolio router uses them.
- An enum with `custom: "function"` names the known rules of an option that also takes a rule. A control sets the names, and a caller can still give its own rule.
- The `default` is the value that the strategy uses when the caller and `defaults` give no value. A value of `defaults` comes first.

The type `OptionSchema<O>` needs one declaration for each key of the options, and no other key. A number option needs a number declaration, and an enum declaration takes only the values of its type.
An option of a rule or its name, for example `GroupRule | "collection" | "all"`, takes an enum of the names or a declaration of the rule.

The option `rule` of the routers `trunks`, `shared` and `shared-all`, and of the highway strategies `keys`, `shared-ways` and `soft-keys`, takes a name (SCHEMA-GAPS):

- With `collection`, the rule is `byCollection`. With `all`, each edge has one key. For the router `shared`, `all` is the same as no rule.
- The `defaults` of each strategy keep the rule `byCollection`, as before. The declaration gives its name `collection` as its `default`. The router `shared-all` sets no rule.
- A rule of the caller stays valid. The name `collection` gives the same output as the rule `byCollection`.

The helpers read the declarations:

- `optionDefaults(strategy)` gives the effective default of each option. The strategy gives the same output with this object as with no options.
- `listOptions(strategy)` gives each option with its key, its declaration and its default, in the order of the schema.
- `checkOptions(strategy, options)` reports each value without a declaration, of the wrong type, out of the range, not a whole number or not one of `values`. It changes no value.
- `clampOptions(strategy, options)` moves each number into its range, for a control. A number with `values` moves to the nearest value. A special value stays.
- `checkSchema(strategy)` reports each option of `defaults` without a declaration, and each bad declaration.
- `sweepValues(declaration, { count, special })` gives the values of a sweep. Without `count`, a number option gives its `marks`. Else, a number option with `values` gives its `values`.
- `sweepOf(strategy, key, options)` gives one setting for each value of a sweep. The name of a setting is the key and the value.
- `sweepGrid(strategy, keys, options)` gives one setting for each combination of the values of the keys.

The benchmark functions take these settings. A sweep from the declarations gives the same table as the hub-limit sweep of CUSTOM:

```ts
import { CASES, routerStrategies, sweepOf, sweepSections } from "@mark1russell7/highways";

const graph = CASES.find((c) => c.name === "case-hub-chain")!.make();
const rows = sweepSections("case-hub-chain", graph, sweepOf(routerStrategies.sections, "stretch"));
// The settings are "stretch 1.25", "stretch 1.5", "stretch 2", "stretch 3" and "stretch Infinity".
```

A test examines each built-in strategy with `checkSchema`. Thus an option of `defaults` without a declaration makes the test fail.

The step `plugs` gives the plugs of the router `corners`. The step `group` gives the grouping rule of the zoom levels, and the step `levels` makes the levels.

## Measures and the report

The [note on the measures](https://github.com/mark1russell7/highways/blob/main/docs/research/MEASURES.md) gives an id, a formula and a scale to each measure. Each measure is a pure function, and its TSDoc names its id.

| Ids | Functions |
|---|---|
| R1, R2 | `crossingAngles`: the crossings and their angles |
| R4, R5 | `totalTurn`, `detourSpread` |
| R11 | `plugSpacing`: the gaps between the plugs of each side |
| B1, B4 | `inkSaved`, `ambiguity` |
| C1, C2, C3 | `g1Defect`, `g2Defect`, `bendingEnergy` |
| C4, C8 | `curvatureVariation`, `curveDeviation` |
| Z5 | `levelRatio`: the largest ratio of the item counts of two levels, and the spread of the ratios |
| Z6, Z7, Z8 | `nestingFaults`, `positionStability`, `orderStability` |
| Z10 | `changeGraph` makes a seeded small change, and `routeStability` compares the routes |
| G1, G2, G8, G9 | `modularity`, `cutShare`, `treeCost`, `groupStability` |
| G4, G5, G7 | `groupFill`, `itemOverlaps`, `silhouette` |
| M2, M3, M5 | `roomOrderFaults`, `boxDisplacement`, `distanceDistortion` |
| H3 | `routeSymmetry`: the share of the routes that a mirror or a half turn of the board keeps |

A quadratic measure examines a seeded sample above its limit, so the values of a large board are estimates.

`runSuite` measures several seeds of each fixture family, for the steps `router`, `curve`, `room` and `group`. The first seed of a family is the fixture itself. The report has these parts:

- `rows`: one row for each step, fixture, seed and strategy.
- `summaries`: the median, the interquartile range, the minimum and the maximum of each measure over the seeds.
- `fronts`: the Pareto front of each step on each fixture family, on the axes of `FRONT_OBJECTIVES`.
- `rules`: the counts of the six proposed hard rules of MEAS0 for each strategy.

A strategy with a violation of a hard rule of today does not enter the front.

```ts
import { formatFronts, runSuite } from "@mark1russell7/highways";

const { report } = runSuite({ max: 1000, seeds: 5 });
console.log(formatFronts(report.fronts));
```

The script `bench` takes `--seeds <n>` and `--report <file>`. A family with more nodes than `--seeds-max-nodes` (default 1 000) gets one seed only. `--suite-steps <a,b>` runs only these steps of the suite. The workflow `Bench` keeps `report.json` and `bench.json` as an artifact. The tables of today do not change.

The workflow `Bench` runs the suite in parts. Each part writes its report, and `joinReports` joins the reports into the report of one run.

Three options of `runSuite` keep each part short (BENCH-GREEN):

- `shard` runs one shard of the cells of the steps `router` and `highway`. The strategy at place `s` on the seed `k` belongs to the shard `(s + k) % count`.
- `caps` stops a strategy above a fixture size. The report lists each such cell in `capped`.
- `pair` names a baseline router, for example `shared`. On the first seed of each fixture to `pairMax` nodes, the baseline routes in turn with each strategy. The row gets `paired`, with the two medians and their ratio.

`compareStep` runs each strategy of one step on one board, with the measures of the suite. It gives one row for each strategy and the Pareto front of the step. The options give each strategy its own options.

`compareAnyStep` does the same for each step of `COMPARE_ALL_STEPS`, which is `STEPS`. The compare page of the site uses it.

- The step `highway` makes the plan of each strategy, and `follow` routes the plan, as in the screen. `highwayRouters` gives these routers.
- The steps `plugs`, `levels` and `whole` run each strategy as a router (`stepRouterStrategy`), and measure the routes as the step `router`.
- The step `room` opens the gaps of a packed board with each strategy and measures the open board with `roomValues`.
- The option `onRow` gets each row when its strategy is done, so a host can show the progress.

With the option `lanes`, the step `curve` opens each shared way of the routes of `curveRouter` into lanes, and each curve draws the lanes. Each input then has its `lane`, so the curve `highway` bends the lanes of a bundle as one with each of its options.

```ts
import { compareStep } from "@mark1russell7/highways";

const { rows, front } = compareStep("curve", graph, { options: { arc: { radius: 20 } } });
const lanes = compareStep("curve", graph, { curveRouter: "shared", lanes: { width: 5, maxWidth: 30 }, options: { highway: { jog: "quintic" } } });
```

## The same routes on each platform

A transcendental Math function, for example `Math.atan2` or `Math.hypot`, can give a different last bit on another platform or node version. A decision of a router must not depend on that bit.

- The script `scripts/check-math.mjs` of the repository counts these calls in each source file. `pnpm test` fails when a count goes up.
- For a new decision, use exact arithmetic: a cross product, a dot product or a squared length.
- A compare function of a sort must be a total order. Otherwise, two engines can give two orders.
- The lane order of a run comes from a merge sort of the package, so each engine gives the same order (LANE-ORDER).
- Each sort of the stretch orders (LANE-STRETCH) has a total order. Its ties break by the key of the edge or of the run. Thus the 4 cells of `Xplat` agree.
- Version 0.8.0 changes the default lane order of some shared runs. No route point moves. [The lane order](../../docs/research/XPLAT.md#the-lane-order-lane-order) gives the changes.
- The note [`XPLAT.md`](../../docs/research/XPLAT.md) gives the result of the item XPLAT-HASH.

## License

MIT
