# highways

`highways` routes the edges of large graphs. It uses a hierarchy of highways, bundles and zoom levels.

The core is plain TypeScript. It knows no renderer. It takes boxes and edges, and it gives polylines and zoom levels.

The site [mark1russell7.github.io/highways](https://mark1russell7.github.io/highways/) shows a live map. Pick a router and a fixture, and your browser routes the graph. The site also shows the benchmark.

## The idea

- A tree of sections divides the plane. Each section has a highway that bends around the nodes in it.
- A node goes onto the highway of its section by a ramp. A section goes onto the highway of its parent by a ramp.
- An edge goes up to the lowest common section, along its highway, and down again.
- When you zoom out, a section becomes one node, and its highway becomes one edge with a count. This repeats at each level.
- A grouping rule gives each edge a key. Edges with the same key share one plug and one bundle.
- A plug with a fixed place stays there. The router places each free plug.

## Status

| Step | Content | State |
|---|---|---|
| H0 | The repository, the benchmark, the fixtures and a straight-line control | Done |
| H1 | One region: plugs, routes around the nodes and the inflection rule | Done |
| H2 | Bundles by rule, ordered lanes and the data to unpack a bundle | Done |
| H3 | The tree of sections, the highways and the zoom levels | In progress |
| H4 | A race of the strategies for each step | Later |
| H5 | Stability: an incremental mode and a full recompute | Later |

## The routers

| Router | Method |
|---|---|
| `straight` | The control. Each edge is one straight line between its plugs. |
| `plugs` | Each edge leaves its plug along the normal of the side and follows the curve of the inflection rule. It does not go around the nodes. |
| `corners` | Each edge goes around the nodes on a shortest path (A*) through a sparse visibility graph of the box corners. |
| `corners-smooth` | The same paths as `corners`. A route in clear view follows the inflection rule, and the other routes get round corners. |
| `trunks` | A rule puts edges in groups. The edges of a group leave one plug of one node on one trunk. At a split point, each edge goes on to its target. |
| `shared` | The edges of one collection share their ways through the corner graph. A link that the group uses already costs half. |
| `shared-all` | The same as `shared`, but all edges share their ways. |
| `sections` | A tree of sections, with a hub in each section. A long edge goes through the hubs, and a short edge goes directly. |
| `sections-tree` | The same as `sections`, but each edge goes through the hubs. |

A free plug goes on the side that faces the other end. Thus the angle between the normal of the plug and the chord is 45° or less.

The inflection rule sets the number of inflections from the angle of the chord: 0 near an axis, 1 near a diagonal, 2 between them. The inflections are at 1/2, or at 1/3 and 2/3, of the chord.

The corner graph links each corner to its 8 nearest corners in view. A path keeps a clearance of at least half of the margin (5 units). A coarse lattice of free points links groups of nodes across empty space.

The benchmark races `corners` only to 10 000 nodes. There, it breaks no hard rule and has 14 times fewer crossings than straight lines. It takes approximately 21 s. The routers with sections also race at 100 000 nodes.

The rule of `trunks` in the benchmark groups the edges by the collection of the target. The result gives each bundle with its trunk and the order of its lanes. Lane 0 turns most to the left, so two lanes do not cross at the split point.

The fixture `mid-fanout` has nodes that link to many nodes of one collection. There, `trunks` uses 8% less ink and has 10% fewer crossings than `corners`. The metric `ink` counts a shared segment one time.

The routers `shared` and `shared-all` follow Pupyrev, Nachmanson, Bereg and Holroyd, "Edge routing with ordered bundles". The edges go one by one, the longest first. A stretch that several edges share has the same points in each of their routes. The result gives each stretch as a run, with the order of its lanes. Where two edges part, the edge that turns more to the left has the lane more to the left. Thus two lanes do not cross where they part.

On the fixtures from 400 to 1 000 nodes, `shared` uses 43% to 58% less ink than `corners`. `shared-all` uses 60% to 74% less. The routes are 10% to 17% longer, with more bends. The crossings go down by 4 to 30 times, but the metric counts a crossing of two shared stretches one time.

The routers `sections` and `sections-tree` divide the plane into a quadtree of sections. A section with more than 8 nodes splits in four. The hub of a section is the free corner nearest to the center of its nodes. An edge goes from its node up the hubs to the lowest common section, then down the hubs to the other node. The router finds each way between two hubs one time, so all the edges on it share its points.

The result gives one zoom level for each depth of the tree. A link of a level counts the edges between two items.

A link between two groups starts on the box of one group and ends on the box of the other group. It goes around the boxes of the other items of its level. Where there is space, its legs are horizontal or vertical. Where two boxes overlap, no clear way is possible, and the link goes straight. The last level shows each node, and its links are the routes of the edges.

On the fixtures from 400 to 1 000 nodes, `sections-tree` uses 50% to 71% less ink than `corners`. It has 10 to 38 times fewer crossings and is faster. But its routes are 3.8 to 5.9 times as long as the line between their plugs.

`sections` uses the hubs only when that way is at most 2 times as long as the line. Else the edge goes directly around the nodes. Then the ink goes down by 17% to 29% and the crossings by 1.5 to 2.3 times. The routes are 16% to 23% longer.

The metric `bends` counts each vertex of a curve, because a route is a polyline. A later step gives the curves to the renderer as curves.

## The segments

`segmentsOf(result)` breaks the routes into segments. Each run and each trunk becomes a shared segment, with its edges in lane order and their count. The other parts of the routes become private segments. A path gives the segments of one edge in order, with its lane in each segment.

A renderer uses these segments for the three views of a bundle:

- **Unpack:** draw each shared segment one time, as a fat edge with its count. A click shows the edges of the segment.
- **Pull apart:** `pullApart(graph, { spacing, maxWidth })` draws each lane next to the others, in lane order. The ends of each route stay at their plugs.
- **Expand:** draw the route of each edge.
- **Open some runs:** `laneRoutes(result, open, laneWidth, maxWidth)` pulls apart only the shared segments whose key is in `open`. The other segments stay as one way. `runKey(edges)` gives the key of a segment: its sorted edge ids, joined with commas.

The [examples page](https://mark1russell7.github.io/highways/examples.html) shows these views on boards of made-up data.

## The benchmark

`pnpm --filter @mark1russell7/highways bench` races the routers on the fixtures and writes a Markdown table.

- `--max <nodes>` sets the largest fixture. The default is 1 000. The fixtures go from 10 to 100 000 nodes.
- `--json <file>` also writes the rows as JSON.

The workflow `Bench` races the routers on all the fixtures, to 100 000 nodes, in CI. It starts on each change of `packages/core` on `main`, or by hand. It writes the table to the summary of the run and keeps `bench.json` as an artifact.

Each router must obey the hard rules. A broken rule is a violation:

- Each edge has one route.
- Each route starts and ends at its nodes.
- A fixed plug stays in its place.
- No route goes through a node that is not one of its ends.
- At each zoom level, the counts of the links add up to the edges between the shown items.
- Each link of a zoom level starts and ends on the boxes of its items.
- The same input gives the same result.

The benchmark also measures the quality of each result:

| Value | Meaning |
|---|---|
| ink | The length of all drawn lines. A shared segment counts one time. |
| crossings | The points where two drawn segments cross. Above 20 000 segments, this value is an estimate from a sample. |
| bends | The mean number of bends of a route. |
| inflections | The mean number of changes of the direction of the turn of a route. |
| clearance | The mean distance from a route to the nearest node that is not one of its ends. |
| tight | The share of the routes that come closer than 4 units to such a node. |
| detour | The mean ratio of the length of a route to the distance between its ends. |
| plug angle | The mean angle between the route and the normal of the side of its node, in degrees. |

The benchmark also counts the faults of the links. It writes a second table: the routes first, then the sum of the zoom levels with groups.

| Value | Meaning |
|---|---|
| through | The links that go through the inside of a box that is not one of their ends. |
| out and back | The links whose distance to their target grows by more than 40 units and more than a quarter of the span. |
| worst detour | The largest ratio of the length of a link to the distance between its ends. |
| outside | The links that go more than 24 units outside the bounding box of all the boxes. |
| level overlaps | The pairs of items of a zoom level whose boxes overlap. |

The benchmark also races the routers on three case boards of made-up data. Each case shows one known defect:

| Case | Defect |
|---|---|
| `case-dense-groups` | The groups of the far view overlap, and level links go through other groups. |
| `case-hub-chain` | A route climbs a chain of hubs away from its target and comes back. |
| `case-many-groups` | On a level with many groups, links go around the outer edge of the board. |

`measureStability` compares two results of the same graph with the discrete Fréchet distance of each route.

## Packages

| Package | Content |
|---|---|
| `packages/core` | The geometry, the model, the fixtures, the routers and the benchmark |
| `packages/site` | The GitHub Pages site: a live map of the routers, the idea and the benchmark. The workflow `Pages` deploys it from `main`. |

## Development

- `pnpm install` installs the workspace.
- `pnpm test` starts the tests. `pnpm typecheck` checks the source and the tests.
- `pnpm lint:ste` examines the prose.
