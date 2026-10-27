# Roadmap

This file is the plan of `highways`. Each item has an id, a status and the items that it waits for. The live tracker shows the same items.

Status: `done`, `active`, `blocked`, `later`.

## Shipped

| Id | Item | Shipped | Link |
|---|---|---|---|
| H0 | The geometry, the fixtures from 10 to 100 000 nodes, the hard rules, the metrics and a straight-line control. The workflow `Bench` races the routers in CI. | 2026-10-25 | `5c05df7` |
| H1 | Plugs that face the other end, the inflection curve and the corner router. | 2026-10-25 | `5c05df7` |
| H2 | Bundles: the router `trunks` (bundles by a rule), the router `shared` (shared ways in lane order) and the segments with a count. | 2026-10-25 | `c910fb7` |
| H3 | The tree of sections, the hubs and the zoom levels. The profile fix makes each router 2 to 2.5 times faster at 10 000 nodes. | 2026-10-25 | `fa1dd82` |
| SITE | The public site routes the fixtures in the browser. The examples page shows boards of made-up data. | 2026-10-25 | #3, #5 |
| REL1 | The core is on npm as `@mark1russell7/highways`. Version 0.1.1 adds `laneRoutes` and `runKey`. | 2026-10-25 | #4, #6 |
| ER2 | Version 0.1.2: a level link goes from box to box around the other items. The far view draws calm outlines. | 2026-10-26 | #7 |
| HW0 | This roadmap and its tracker. | 2026-10-26 | #11 |
| QFIX | The case boards and the measures of the faults of the links: through, out and back, worst detour and outside. The benchmark reports them. | 2026-10-26 | #12 |
| PERF1 | The level links are fast again, with the same output. On `mid-clustered`, the level links take 307 ms, not 891 ms. The full route takes 935 ms, not 3 416 ms. | 2026-10-26 | #13 |
| ER3a | In the far view of a dense board, the level links go around the groups. Level through on `case-dense-groups`: 26 before, 0 after. | 2026-10-26 | #16 |
| ER3b | A route of `sections` skips a hub that takes it away from its target. Out and back on `case-hub-chain`: `sections` 6 to 0, `sections-tree` 25 to 0. | 2026-10-26 | #14 |
| REL2 | Version 0.1.3 on npm: PERF1, ER3a, ER3b and the measures of QFIX. | 2026-10-26 | #17 |
| ER3c | On a level with many groups, the level links go through the groups, not around the outer edge. Level outside on `case-many-groups`: 4 before, 0 after. | 2026-10-26 | #19 |
| CURVE | Curve types for the routes: straight, rounded, spline and arc, as segments for any renderer. With the free space, no curve goes through a box. | 2026-10-26 | #21 |
| ROOM | `roomDemand` gives the room that each gap needs, and `openGaps` opens it. On `packedGridBoard`, links through boxes: 62 before, 0 after, for 50% more area. | 2026-10-26 | #22 |
| REL3 | Version 0.1.4 on npm: ER3c, CURVE and ROOM. | 2026-10-26 | #23 |
| STRAT | One strategy interface and one registry for the steps `router`, `curve` and `room`. The benchmark and the site list the registry. | 2026-10-26 | #25 |
| ROOM-A | The area curve of `maxGrowth` on `packedGridBoard`. The area goes from 1.13 at 0 to 1.50 at 0.30, then stays flat. At 0.25, the area is 1.46, with 2 lane routes through a box. | 2026-10-26 | #26 |
| ROOM-C | `gapLanes` gives each link of the far view its own lane in a gap, with three lane orders. The order `crossings` has 467 crossings, against 585 for the order of the list. Shared lines hide crossings and show 276. Spacing 2 to 8 changes the crossings less than 5%. | 2026-10-26 | #26 |
| ROOM-D | The option `passes` of `roomDemand`. Two passes at gutter 8: worst detour 2.03, not 2.09, for 4% more area. The mean detour stays 1.32 for each gutter and each number of passes. | 2026-10-26 | #26 |
| REL4 | Version 0.1.5 on npm: STRAT and the options of ROOM-A, ROOM-C and ROOM-D. The routes do not change. | 2026-10-26 | #27 |
| CUSTOM | Options for the grouping rule (the step `group`), the levels, the hub limit, the far-view thresholds and the limits of the tree. With the defaults, the output does not change. On `case-hub-chain`, hub limit 1.5 gives a worst detour of 1.39, not 1.78. | 2026-10-26 | #28 |
| REL5 | Version 0.2.0 on npm: CUSTOM. MINOR, because the type `Step` gains the step `group`. The routes do not change. | 2026-10-26 | #29 |

## Open

| Id | Item | Status | Waits for | Priority |
|---|---|---|---|---|
| ER3d | On a level where each group overlaps its neighbours on all sides, some links still go through a group. Measure: level through on `mid-clustered`, in CI. | `later` | | P2 |
| EX2 | Example pages that compare the strategies and the curve types. | `later` | CURVE, STRAT | P3 |
| MEAS0 | Research: the measures of a good route, curve, group and level. A note gives each measure, its formula, its scale and the studies behind it. | `later` | | P1 |
| OPTS | Each strategy declares its options: the type, the range, the step and the meaning. Tools then make controls and sweeps from the registry. | `later` | STRAT | P1 |
| MEAS1 | The measure suite: each measure of MEAS0 in the bench, with seeds, medians and spread. The report gives the Pareto front of each step. | `later` | MEAS0 | P1 |
| HWC | Curved highways: a bundle bends as one. Its lanes stay parallel at the lane spacing through each bend, and merge and split on smooth curves. | `later` | CURVE | P1 |
| ROOM2 | Room at each zoom level: each level of the tree gets the gaps that its level links need. The boxes stay stable from level to level. | `later` | ROOM, CUSTOM | P1 |
| MEAS2 | The gap to the best route: small boards with a known best answer from an exact solver. The bench gives the gap of each router. | `later` | MEAS1 | P2 |
| CURV-R | Research: curve families and their math. Continuity of the tangent and the curvature, clothoids, biarcs, Hobby curves, splines and the clearance to the boxes. | `later` | MEAS0 | P2 |
| CURV2 | More curve types, each with its options: clothoid corners, biarcs, Hobby curves, centripetal Catmull-Rom, B-splines, tension curves and superellipse corners. | `later` | CURV-R, OPTS | P2 |
| GRP-R | Research: grouping rules and their measures. Spatial trees, clusters of positions, communities of links, mixed rules, and the stability of each. | `later` | MEAS0 | P2 |
| GRP2 | More grouping strategies from GRP-R, each in its folder with its tests and a row in the benchmark. | `later` | GRP-R, MEAS1 | P2 |
| TUNE | The tuning harness: it sweeps the options of each strategy from its declaration. It gives the Pareto front and the best setting for given weights. | `later` | OPTS, MEAS1 | P2 |
| PLAY | The playground page: choose a strategy for each step and move the options. The measures change live, and a link keeps the setting. | `later` | OPTS, MEAS1 | P2 |
| EX3 | More example boards of made-up data: charts of teams, pipelines, network maps, timelines and dense grids, each with its page. | `later` | EX2 | P3 |

## Rules for each item

- Keep `laneRoutes`, `runKey` and the levels compatible. A host app pins `^0.1.x`, and goes to `^0.2.0` for CUSTOM.
- Before 1.0.0, a breaking change raises the MINOR version. A feature or a fix raises the PATCH version.
- A change to the output of a route needs a note to the consumers before the release.
- Each strategy has its own folder, its tests and a row in the benchmark.
- Examples and tests use made-up data only.
