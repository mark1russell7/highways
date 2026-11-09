# Changelog of `@mark1russell7/highways`

## 0.19.0

This version is a MINOR before 1.0: the exported data `MEASURES` changes, and the stability lengths change their unit. The routes do not change.

### The range of each measure

- Each row of `MEASURES` has the new fields `min` and `max`. They give the range of the values of the measure. `max` is `Infinity` when the measure has no upper limit.
- A test runs a screen of each step on a small board, and it checks that each value of the records is in the range of its measure.
- The unit texts give no range. A share and a flag of 0 or 1 have the unit `share`. A signed value has `no unit`. The share of the gap that a strategy closes has `ratio`, with no limit on each side.
- The results page of the site shows the range of each measure.

### Three values that left their range

- `route.backtrack` (R7) divides by the larger of the edges and the routes. Before, a result with more routes than edges gave a value above 1.
- `treeCost` (G8) counts at most the `n` nodes of the graph for an item. Before, an item with a node two times gave a value above 1.
- The high end of the interval of a sampled pair count is never below its low end. The low end was already 0 or more.
- These three values do not change for a valid result.

### The unit of the stability lengths

- The lengths of Z10 and Z12 (`routeStability`, `highwayEdits` and the stability rows of the suite and the screen) are over the width `W` of the board. Before, they were over the unit of the board.
- `W` is the width of the bounding box of the boxes of the nodes. A board has no margins. The new function `boardWidth` gives `W`.
- Thus a stability value compares across boards of different sizes. The share of the routes that move does not change.

### Exports

- `boardWidth`.
- The fields `min` and `max` of `MeasureInfo`.
- `RANGES` and `RangeRule`: the range of each measure, by its unit or its key, with the reason.

## 0.17.0

This version is a MINOR before 1.0, because default routes of `sectionsRouter` change. The public API does not change.

### Routes that change

- A way through the hubs that goes through a box gives way to the direct way, when the direct way goes through no box (SITE-HUB-THROUGH).
- The way goes through a box when a piece between two hubs has no way. A step from a plug into a box does too.
- The options `margin: 20, stretch: 3, cap: 6` move 4 of 6,307 routes of 84 boards. Their `route.through` goes from 296 to 292.
- With the default options, no route of these boards moves. The option `outSteps: false` keeps the routes of 0.16.0.

## 0.16.1

This version is a PATCH before 1.0: it adds two strategies, a new optional field and new exports. The default routes do not change.

### Strategies

- The curve strategy `elastic` (NAT-026) is an elastic band on the polyline of a route. Springs pull the band taut, and the boxes near it push it away. A spline goes through the band.
- When a route has no band, `elastic` gives the spline of the polyline with the plug normals. Thus the curve leaves along the normal of each plug.
- The plug strategy `charges` (RULE-054) pushes the free plugs of a side apart as equal charges. A spring pulls each plug to the place of `facing`.
- `routeSpace` has 10 plug options. The record `space-size/1` counts 1016275071962 base configs.

### The rules of a curve

- A curve strategy can declare `curveRules`: `g1` for a curve with no kink, and `normals` for a curve that leaves along the plug normals.
- The bench checks the rules C1 and C10 of each strategy that declares them. Before, the bench checked a fixed list of names. Thus a variant of a screen got no check.
- The built-in curves declare the rules that the fixed list gave them. The results of the bench do not change.

### Exports

- `elasticCurve`, `relaxBand`, `ELASTIC_DEFAULTS`, `ElasticOptions` and `ElasticStrategyOptions`.
- `chargeEnds`, `chargePlugs`, `CHARGE_DEFAULTS` and `ChargeOptions`.
- `CurveRules`, and the optional field `curveRules` of `Strategy` and `StrategyDefinition`.

## 0.16.0

This version is a MINOR before 1.0: the routes of two routers change in their last bits.

### Routes

- `inflectionCurve` takes its powers as products, not with `**` (POW-PORTABLE). In Node.js, `x ** 3` and `x ** 4` give different last bits on Linux and on Windows.
- The routers `plugs` and `corners` with `smooth` give the same points on each system. The points of their curves move by at most 6e-12. No route changes its count of points.
- The record of the gate `through-check/7` changes in 6 rows of `plugs`. In 5 rows, a depth moves by less than 2e-13. In `packed-grid`, the route `0:e115` had a depth of 0, and it has a depth of 6e-14. Thus its class changes from `wall` to `band`.

### Dependencies

- The range of `@mark1russell7/rigor-statistics` is `^0.1.18`. It was `^0.1.5`. The interval of `routePairCrossings` does not change.

## 0.15.2

This version is a PATCH before 1.0: two new exports. No route output changes.

### New

- `EPS_STEPS` is the count of grid steps in one unit, from the tolerance `EPS` of `layout-contract` (PAINT-TIE).
- `snapToEps(point)` puts a point on that grid.

### Measures

- The painted count of the bench reads its points on the grid `EPS_STEPS`, as `routePairCrossings` does. Thus a shift far under the grid does not move a touch.
- `PAINT_COUNTER` of the bench is 2. A painted count of version 1 does not compare with a count of version 2.

## 0.15.1

This version is a PATCH before 1.0: a new optional parameter, new fields and new exports. No route output changes.

### Measures

- `routePairCrossings(routes, options)` takes the optional `maxPoints` and `seed` (BENCH-PAIRS-HEAP). Above `maxPoints`, the count reads a seeded sample of the routes, and `estimated` is true.
- A sampled count gives a 95% interval in `low` and `high`. A full count has `low` and `high` equal to `pairs`.
- `contactSampled` is true when the contact count comes from a sample of the shared vertices. Then the interval is too narrow.
- The suite passes `PAIR_POINTS`, 1 000 000. Each board up to 10 000 nodes keeps a full count.
- The suite rows give `R1.pairsLow`, `R1.pairsHigh` and `R1.pairsContactSampled`.

### New

- `RoutePairOptions`, `PAIR_POINTS`, `sameKind` and `withoutMixedKinds`.
- `MeasureInfo.estimatedBy` names the flag of a count that can come from a sample. A gate does not pair an estimate with a full count.

## 0.15.0

This version is a MINOR before 1.0, because default routes change and the public types name `layout-contract` 0.4.0.

### Read this first

- The `seams` screen has not run at this version. So `seams` stays off the site, and it has no verdict.
- The body count of `measureHighways` reads 0 on `shared-all` because of a fix of the measure. This figure is not a gain of the router.
- The end count of `shared-all` falls from 2375 to 720 on one board only, `case-many-groups`. Do not read it as a general figure.
- The old and new body figures come from different counters, so they do not compare. The version is in `BUNDLE_COUNTER`.
- On 75 boards, `shared-all` reads 0.417 of `corners` on `route.crossings` and 1.033 on `route.crossings.pairs`, as medians.
- The pair count of `shared-all` stays under `corners` on 4 families: `bottleneck`, `comb`, `maze` and `walled-level`.
- So a lower `route.crossings` alone does not show a gain for a router that shares segments.

### Routes that change

- The lanes of each side of a run or trunk compress to fit its free room (LANE-ROOM). A lane can move. The closed routes do not change.
- A margin is a preference, not a wall (PLUG-OUT-BLOCKED). A route on `escape` can change. The option `outSteps: false` is the way back.
- The first stop of an inner route lies on the bounds of its room (INNER-SPIKE). The default digests of the 150 boards stay the same.

### Measures

- `route.crossings.pairs` and `routePairCrossings` count the pairs of routes that cross, at a shared vertex and on a shared stretch too (ROUTE-PAIRS).
- `measureHighways` reads the crossing point of two pieces, not the middle of a sampled piece (BUNDLE-COUNTER). No route moves.
- Above 20 000 segments, `route.crossings` is an estimate. On the benchmark, it reads up to 16.03% off a full count.

### New

- `strategyOfKey` and `KEYED_STRATEGIES` find a strategy from its key (CATALOG-LOOKUP).
- `configOfMember` gives a member of the portfolio its point in `routeSpace` (MEMBER-POINTS).
- `corners` marks `through` on an inner route that goes through a box of its room (INNER-THROUGH).
- Each lane that the lanes bring to a box has the mark `outOfRoom` (LANE-ROOM).
- The 11 opt-in routers reach the compare page, the strategy cards and the bench (PHYSICAL-VISIBLE).

### Not in this version

- The controls `one-trunk` and `perimeter` are not in this version.
- The read of the sample of `route.crossings` (CROSSINGS-SAMPLE) and the exact count (CROSSINGS-LIMIT) are not in this version.
- The grid of the painted count (PAINT-TIE) and the measure of true shapes are not in this version.

## 0.14.0

This version is a MINOR before 1.0, because default routes change and callers hash them.

### Routes that change

- The corner graph joins its parts when closed regions split it (CORNER-REACH). A route on such a board can change. Each other board keeps its bytes.
- Larger boards change more. Boards of `maze` that change go from 4 percent at the default size to 39 percent at the largest size.
- A route with no way says so in its record, with the field `through`. This field also applies to the router `seams`.

### Cost

- On 29 of 48 boards, the join does its work and gains no link. On those boards, the median added time is 0.20 ms.

### A limit

- At `levelJoinWork` 0, a level link of walled items can go through a wall box, and no link is lost.
- A level link can go through a box on the real router, with or without the join. The item LEVEL-CROSSINGS measures it.
- The record `scripts/data/level-join/crossings.json` gives the counts. On `maze` at its largest size, 142 of 329 links cross a box.

### New

- The option `rangeShrink` of `assign` (ASSIGN-BOUND).
- The opt-in router `seams` (PASS-SEAMS).
- The set `screen-v4`, the absolute count of pass-throughs and the signal `route.no-graph` (PASS-GRID).
- The input families `channel`, `comb`, `spiral`, `switchbox`, `escape` and `rings` (FAMILIES-WEEKLY).
