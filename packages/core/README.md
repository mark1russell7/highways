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
| `group` | `Graph` | `Section`: the tree of groups of the router `sections` | `quadtree`, `keys` |
| `router` | `Graph` | `Result` | `straight`, `plugs`, `corners`, `corners-smooth`, `trunks`, `shared`, `shared-all`, `sections`, `sections-tree` |
| `curve` | `CurveInput`: the points, the normals of the plugs and the free space | `CurveSegment[]` | `straight`, `rounded`, `spline`, `arc` |
| `room` | `RoomInput`: the boxes and the links of a board | `Gap[]` | `routes`, `lines` |

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

## License

MIT
