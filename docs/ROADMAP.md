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

## Open

| Id | Item | Status | Waits for | Priority |
|---|---|---|---|---|
| PERF1 | Make the level links fast again. At 1 000 nodes, 0.1.2 takes up to 2 times as long as 0.1.1. | `later` | | P1 |
| ER3a | The far view of a dense board: boxes that overlap make straight links. Measure: level through on `case-dense-groups`. | `later` | | P1 |
| ER3b | The near view: a chain of hubs goes out and back. Measure: out and back on `case-hub-chain`. | `later` | | P1 |
| ER3c | On a level with many groups, some links go around the outer edge. Measure: level outside on `case-many-groups`. | `later` | | P1 |
| CURVE | Curve types for the edges: straight, rounded corners, splines and arcs, as an option of the route. | `later` | | P2 |
| STRAT | One interface for the strategies of each step, so that a consumer can choose or add a strategy. | `later` | | P2 |
| CUSTOM | Options for the generalizations: the grouping rule, the levels and their limits. | `later` | STRAT | P2 |
| EX2 | Example pages that compare the strategies and the curve types. | `later` | CURVE, STRAT | P3 |

## Rules for each item

- Keep `laneRoutes`, `runKey` and the levels compatible. A host app pins `^0.1.2`.
- Before 1.0.0, a breaking change raises the MINOR version. A feature or a fix raises the PATCH version.
- A change to the output of a route needs a note to the consumers before the release.
- Each strategy has its own folder, its tests and a row in the benchmark.
- Examples and tests use made-up data only.
