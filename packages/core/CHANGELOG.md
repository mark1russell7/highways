# Changelog of `@mark1russell7/highways`

## 0.16.0

This version is a MINOR before 1.0, because the public types name `layout-contract` and its range moves to `^0.5.0`.

### Not in this version

- The exact count of `route.crossings` (CROSSINGS-LIMIT) is not in this version.
- The grid of the painted count (PAINT-TIE) and the measure of true shapes are not in this version.

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
