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
- The curvature of each S curve is `1 / radius` or less. So a `cubic` or a `quintic` S curve is longer than a biarc.
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

## Room for the links

A host layout can pack the boxes of a far view in a grid, with no gap between them. Then the links have no channel, and they go through the boxes. The router knows the room that the links need. The room functions give that room, and they can open the gaps.

- `roomDemand(items, links, options)` gives the gaps of the board. A gap is a boundary between two columns (`axis: "x"`) or two rows (`axis: "y"`). Each gap has its current `width`, its `lanes` and its `need`.
- The need of a gap is `gutter + lanes × spacing`, and not less than its current width. The default gutter is 8, and the default spacing is 4.
- With the method `routes`, the default, the function opens each gap to the gutter and routes the links one time. The lanes of a gap are the most routes that go along it side by side.
- With the method `lines`, the lanes of a gap are the straight lines between the centers of the boxes that cross the gap.
- `openGaps(items, gaps)` moves each box by the growth of each gap before it. The boxes keep their size, their order and their alignment, so a grid stays a grid.
- `makeRoom(items, links, options)` gives the gaps and the open board. `maxGrowth` limits the growth of the board on each axis, as a share of its size.
- With `passes: 2`, `roomDemand` finds the lanes again on the open board and adds the growth that they need. `maxGrowth` limits the sum of the passes.
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
| `router` | `Graph` | `Result` | `straight`, `plugs`, `corners`, `corners-smooth`, `trunks`, `shared`, `shared-all`, `sections`, `sections-tree` |
| `curve` | `CurveInput`: the points, the normals of the plugs and the free space | `CurveSegment[]` | `straight`, `rounded`, `spline`, `arc`, `smooth`, `clothoid` |
| `room` | `RoomInput`: the boxes and the links of a board, and the tree of sections for `levels` | `Gap[]` | `routes`, `lines`, `levels` |

A strategy has a `step`, a `name`, a `describe` text, its `defaults` and the method `run(input, options?)`. The type of the options comes from `defaults`. Each option that a call does not give gets its default value.

- `defineStrategy({ step, name, describe, defaults, schema?, run, maxNodes? })` makes a strategy. The function `run` gets each option.
- `createRegistry(strategies)` makes a registry. Two strategies with one step and one name are an error.
- `register(registry, ...strategies)` gives a new registry. It does not change the registry before it.
- `listStrategies(registry, step)` gives the strategies of a step, in order. `findStrategy` and `getStrategy` give one strategy by its name.
- `asRouter(strategy, options?)` gives a `Router`, and `routersOf(registry)` gives the routers of a registry.
- `STRATEGIES` is the registry of `BUILT_IN_STRATEGIES`. The records `groupStrategies`, `routerStrategies`, `curveStrategies` and `roomStrategies` give each built-in strategy with its typed options.

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

### Declarations of the options

Each strategy declares its options in `schema`. A declaration tells the type, the range, the step and the meaning of one option. Tools make controls and sweeps from these declarations, with no other data.

| Type | Fields | Values |
|---|---|---|
| `number`, `integer` | `min`, `max`, `step`, `scale`, `special`, `marks` | A number. An `integer` takes only whole numbers. |
| `boolean` | | `false` or `true`. |
| `enum` | `values` | One of `values`. |
| `function`, `strategy`, `list`, `object` | `step` (for `strategy`) | A rule, a strategy, an array or an object. A sweep cannot set them. |

Each declaration has a `describe` sentence and an optional `default`.

- The range from `min` to `max` is the range of a control and of a sweep. The strategy can take a value outside it.
- The `scale` is `linear` or `log`. A sweep on the scale `log` gives values with equal ratios.
- The `special` values are valid outside the range. `Infinity` sets no limit.
- The `marks` are the notable values: the default and the values of the sweeps of the benchmark.
- The `default` is the value that the strategy uses when the caller and `defaults` give no value. A value of `defaults` comes first.

The type `OptionSchema<O>` needs one declaration for each key of the options, and no other key. A number option needs a number declaration, and an enum declaration takes only the values of its type.

The helpers read the declarations:

- `optionDefaults(strategy)` gives the effective default of each option. The strategy gives the same output with this object as with no options.
- `listOptions(strategy)` gives each option with its key, its declaration and its default, in the order of the schema.
- `checkOptions(strategy, options)` reports each value without a declaration, of the wrong type, out of the range or not a whole number. It changes no value.
- `clampOptions(strategy, options)` moves each number into its range, for a control. A special value stays.
- `checkSchema(strategy)` reports each option of `defaults` without a declaration, and each bad declaration.
- `sweepValues(declaration, { count, special })` gives the values of a sweep. Without `count`, a number option gives its `marks`.
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

The plugs have one strategy, so they have no step yet. The step `group` gives the grouping rule of the zoom levels.

## Measures and the report

The [note on the measures](https://github.com/mark1russell7/highways/blob/main/docs/research/MEASURES.md) gives an id, a formula and a scale to each measure. Each measure is a pure function, and its TSDoc names its id.

| Ids | Functions |
|---|---|
| R1, R2 | `crossingAngles`: the crossings and their angles |
| R4, R5 | `totalTurn`, `detourSpread` |
| R11 | `plugSpacing`: the gaps between the plugs of each side |
| B1, B4 | `inkSaved`, `ambiguity` |
| C1, C2, C3 | `g1Defect`, `g2Defect`, `bendingEnergy` |
| Z6, Z7, Z8 | `nestingFaults`, `positionStability`, `orderStability` |
| Z10 | `changeGraph` makes a seeded small change, and `routeStability` compares the routes |
| G1, G2, G8, G9 | `modularity`, `cutShare`, `treeCost`, `groupStability` |
| M2 | `roomOrderFaults` |

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

## License

MIT
