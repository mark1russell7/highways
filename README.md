# highways

`highways` routes the edges of large graphs. It uses a hierarchy of highways, bundles and zoom levels.

The core is plain TypeScript. It knows no renderer. It takes boxes and edges, and it gives polylines and zoom levels.

The site [mark1russell7.github.io/highways](https://mark1russell7.github.io/highways/) shows a live map. Pick a router and a fixture, and your browser routes the graph. The site also shows the benchmark.

The [results page](https://mark1russell7.github.io/highways/results.html) shows the committed verdicts of the screens, the ideas and the newest items of the roadmap. Each merge to `main` builds it again.

The [strategies page](https://mark1russell7.github.io/highways/strategies.html) has a card for each strategy of the registry. A card shows the ideas that the strategy builds, with their papers, math and cost. It also shows the options, the verdicts and the time in the benchmark. The map [`strategy-ideas.ts`](packages/core/scripts/strategy-ideas.ts) links each strategy and its options to their idea records. It reads the ids in the text `describe`, and a test checks each id.

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
| `sections-tree` | The same as `sections`, but without the limit of the stretch. |

A free plug goes on the side that faces the other end. Thus the angle between the normal of the plug and the chord is 45° or less.

The inflection rule sets the number of inflections from the angle of the chord: 0 near an axis, 1 near a diagonal, 2 between them. The inflections are at 1/2, or at 1/3 and 2/3, of the chord.

The corner graph links each corner to its 8 nearest corners in view. A path keeps a clearance of at least half of the margin (5 units). A coarse lattice of free points links groups of nodes across empty space.

The benchmark races `corners` only to 10 000 nodes. There, it breaks no hard rule and has 14 times fewer crossings than straight lines. It takes approximately 21 s. The routers with sections also race at 100 000 nodes.

The rule of `trunks` in the benchmark groups the edges by the collection of the target. The result gives each bundle with its trunk and the order of its lanes. Lane 0 turns most to the left, so two lanes do not cross at the split point.

The fixture `mid-fanout` has nodes that link to many nodes of one collection. There, `trunks` uses 8% less ink and has 10% fewer crossings than `corners`. The metric `ink` counts a shared segment one time.

The routers `shared` and `shared-all` follow Pupyrev, Nachmanson, Bereg and Holroyd, "Edge routing with ordered bundles". The edges go one by one, the longest first. A stretch that several edges share has the same points in each of their routes. The result gives each stretch as a run, with the order of its lanes. Where two edges part, the edge that turns more to the left has the lane more to the left. Thus two lanes do not cross where they part.

On the fixtures from 400 to 1 000 nodes, `shared` uses 43% to 58% less ink than `corners`. `shared-all` uses 60% to 74% less. The routes are 10% to 17% longer, with more bends. The crossings go down by 4 to 30 times, but the metric counts a crossing of two shared stretches one time.

The routers `sections` and `sections-tree` divide the plane into a quadtree of sections. A section with more than 8 nodes splits in four. The hub of a section is the free corner nearest to the center of its nodes. An edge goes from its node up the hubs to the lowest common section, then down the hubs to the other node. The router finds each way between two hubs one time, so all the edges on it share its points.

An edge skips a hub that is more than 80 units farther from its target than the nearest approach of the way before it. When the way through the hubs still goes out and back, the edge goes directly around the nodes. Thus no route of these two routers goes away from its target and comes back.

The result gives one zoom level for each depth of the tree. A link of a level counts the edges between two items.

A link between two groups starts on the box of one group and ends on the box of the other group. It goes around the boxes of the other items of its level. Where there is space, its legs are horizontal or vertical. Where two boxes overlap, no clear way is possible, and the link goes straight. The last level shows each node, and its links are the routes of the edges.

On the fixtures from 400 to 1 000 nodes, `sections-tree` uses 37% to 50% less ink than `corners`. It has 3.4 to 5.1 times fewer crossings. Its routes are 1.45 to 1.56 times as long as the line between their plugs.

`sections` uses the hubs only when that way is at most 2 times as long as the line. Else the edge goes directly around the nodes. Then the ink goes down by 28% to 39% and the crossings by 2.2 to 3 times. The routes are 20% to 32% longer.

The metric `bends` counts each vertex of a curve, because a route is a polyline.

## The segments

`segmentsOf(result)` breaks the routes into segments. Each run and each trunk becomes a shared segment, with its edges in lane order and their count. The other parts of the routes become private segments. A path gives the segments of one edge in order, with its lane in each segment.

A renderer uses these segments for the three views of a bundle:

- **Unpack:** draw each shared segment one time, as a fat edge with its count. A click shows the edges of the segment.
- **Pull apart:** `pullApart(graph, { spacing, maxWidth })` draws each lane next to the others, in lane order. The ends of each route stay at their plugs.
- **Expand:** draw the route of each edge.
- **Open some runs:** `laneRoutes(result, open, laneWidth, maxWidth)` pulls apart only the shared segments whose key is in `open`. The other segments stay as one way. `runKey(edges)` gives the key of a segment: its sorted edge ids, joined with commas.

The [examples page](https://mark1russell7.github.io/highways/examples.html) shows these views on boards of made-up data.

The [compare page](https://mark1russell7.github.io/highways/compare.html) puts the strategies of one step side by side. Each panel shows the output of a strategy and its measures, and a mark shows the best value of each measure. The page covers each step of the pipeline and each strategy of the registry.

## The curve types

`curveOf(points, { type })` turns a polyline into a curve: `straight`, `rounded`, `spline`, `arc`, `smooth` or `clothoid`. The curve is a list of segments for any renderer. `toSvgPath` writes SVG path data, and `sampleCurve` gives points. With `curveSpace(boxes)`, a curve goes through no box that its polyline avoids. The [package README](packages/core/README.md) tells the API.

The [compare page](https://mark1russell7.github.io/highways/compare.html) runs each strategy of a step on the same board. It marks the best value of each measure and the Pareto front.

## Room for the links

A host layout can pack boxes with no gap between them. Then the links have no channel. `roomDemand` gives the width that each gap between two columns or two rows needs. That width is a gutter and a lane for each link along the gap.

`openGaps` moves the boxes apart to that width, and a grid stays a grid. `makeRoom` does both. The [package README](packages/core/README.md) tells the API and the measures.

## Strategies

The steps `group`, `router`, `highway`, `curve` and `room` have strategies with one interface. A consumer chooses a strategy by its name, or adds its own with `defineStrategy`. The registry `STRATEGIES` gives the lists of the benchmark and of the site. The [package README](packages/core/README.md) tells the API.

## The benchmark

`pnpm --filter @mark1russell7/highways bench` races the routers on the fixtures and writes a Markdown table.

- `--max <nodes>` sets the largest fixture. The default is 1 000. The fixtures go from 10 to 100 000 nodes.
- `--min <nodes>` sets the smallest fixture. The default is 0.
- `--repeat <n>` sets the timed routes of each cell. The table gives the median. The default is 3.
- `--routers <a,b>` races only these routers. `--skip-routers <a,b>` races all the routers except these.
- `--cell-limit <ms>` sets the time limit of each cell. After the routes of a cell pass the limit, the cell starts no more routes. Its row shows "over the limit". A route that runs does not stop.
- `--rows-only` races only the fixtures. It does not race the case boards, and it does not print the side tables.
- `--json <file>` also writes the rows as JSON. `--side-tables <file>` also writes the side tables to a file.
- `--shard <i>/<n>` starts only the shard `i` of `n` shards of the cells of the steps `router` and `highway`. Each shard gets one seed of each strategy.
- `--caps <name>=<nodes>` stops a strategy above a fixture size. The report lists each capped cell, so the row is capped, not missing.
- `--pair <router>` adds the paired arm. On the first seed, this router routes each fixture in turn with each strategy. The row gets the ratio of the times.

A third table compares each curve type to the polylines of each router, on the fixtures of 100 nodes or fewer. It counts the curves that go through a box, with and without the free space, and it gives the ratio of the lengths.

A fourth table measures the room of the links on a packed board of touching boxes. It compares the packed board, the board with a gutter only and the board that `makeRoom` opens. Three more tables change one knob of the room at a time: `maxGrowth`, the lane order with the spacing, and the gutter with the passes.

The workflow `Bench` races the routers in CI, in parts that run at the same time. A change of `packages/core` on `main` races the fixtures to 10 000 nodes. Each night, the workflow races all the fixtures, to 100 000 nodes. A run by hand with `max` 100000 does the same. The last job joins the parts with `pnpm bench:join`. It writes the table to the summary of the run and keeps `bench.json` as an artifact.

The workflow divides the step `highway` of the suite into 10 shards to 1 000 nodes, one job each (BENCH-GREEN). A push run caps `mlseb` at 400 nodes, and the nightly run has no cap. Each part to 1 000 nodes pairs each strategy with `shared`. The ratio of the times comes from one CPU, so it compares better between runs than the time.

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
| `packages/site` | The GitHub Pages site: a live map of the routers, the idea, the benchmark, the examples and the compare page. The workflow `Pages` deploys it from `main`. |

### The generator of the site

The examples page has a tab `Generator`. Pick a family of `HIGHWAYS_FAMILIES`, a seed and a value for each dimension of the family. A web worker generates the board and routes it with the default pipeline. The URL keeps the board, for example `#family=hub-chain&seed=12&rows=6`. The list "Named examples" sets the controls to a known board.

The generator has 15 families. The 9 families of CORPUS-FAMILIES add cards with rows, a long pipeline, a wide fan-out and two hubs. They also add uneven sizes, thin bars, a sparse board, a dense local mesh and a complete bipartite part.

The compare page and the live demo have the choice "Generated", with the same controls and the same keys of the URL. The screen sets make their boards with the same families.

## Development

- `pnpm install` installs the workspace.
- `pnpm test` starts the tests. `pnpm typecheck` checks the source and the tests.
- `pnpm lint:ste` examines the prose.
