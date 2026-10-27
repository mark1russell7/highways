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

## Open

| Id | Item | Status | Waits for | Priority |
|---|---|---|---|---|
| ER3d | On a level where each group overlaps its neighbours on all sides, some links still go through a group. Measure: level through on `mid-clustered`, in CI. | `later` | | P2 |
| EX2 | Example pages that compare the strategies and the curve types. | `later` | CURVE, STRAT | P3 |

## Rules for each item

- Keep `laneRoutes`, `runKey` and the levels compatible. A host app pins `^0.1.2`.
- Before 1.0.0, a breaking change raises the MINOR version. A feature or a fix raises the PATCH version.
- A change to the output of a route needs a note to the consumers before the release.
- Each strategy has its own folder, its tests and a row in the benchmark.
- Examples and tests use made-up data only.
