# The routes on each platform

This note is the result of the item XPLAT-HASH of the [roadmap](../ROADMAP.md). It finds why `shared` and `sections` give different routes on two platforms.

## The same routes on each platform (XPLAT-HASH)

The joint bench of layout-contract routes 24 inputs on linux with node 26 and on win32 with node 24. For `corners`, the route hashes are equal. For `shared` and `sections`, 27 of 27 route hashes are different. This item finds the cause. It does not change a route.

- The trace `packages/core/scripts/xplat.ts` routes each input. It writes the route hash by the rule of the joint runner, and the exact routes with all the digits of each number.
- With `XPLAT_CALLS=1`, the trace also logs each call of `Math.hypot`, `atan2`, `sin`, `cos`, `tan`, `acos`, `asin`, `atan`, `exp`, `log` and `pow`. It keeps a hash of each chunk of 1000 calls.
- The workflow `Xplat` runs the trace on ubuntu and windows, with node 24 and node 26. Then it logs in full each chunk that differs, with the stack of each call.
- `packages/core/scripts/xplat-summary.ts` compares the cells. The inputs are the 24 inputs of the layout-contract run 40688908137. The folder `packages/core/scripts/data/xplat` keeps 3 of them.
- The data comes from the CI run [40691194197](https://github.com/mark1russell7/highways/actions/runs/40691194197) of the workflow `Xplat`, at `highways` 0.7.0.

### The cells

| Cell | Node | V8 | Hashes equal to the linux node 26 hash of the joint bench | Hashes equal to the win32 node 24 hash of the joint bench |
|---|---|---|---|---|
| linux, node 24 | 24.22.1 | 13.6.233.17 | 24 of 51 (the 24 of `corners`) | 27 of 27 |
| linux, node 26 | 26.12.1 | 14.6.202.34 | 51 of 51 | 0 of 27 |
| win32, node 24 | 24.22.1 | 13.6.233.17 | 24 of 51 (the 24 of `corners`) | 27 of 27 |
| win32, node 26 | 26.12.1 | 14.6.202.34 | 51 of 51 | 0 of 27 |

- The 51 routes are 24 inputs with `corners`, 24 with `shared` and 3 with `sections`.
- The two cells with node 24 give the same exact routes and the same call logs. The two cells with node 26 do too.
- The operating system has no effect. The node version is the axis.
- Each cell gives the same hash at each of its 3 runs.

### The difference

- In each of the 27 routes that differ, only one line of the exact result differs: the list `runs`. The points of each route are equal to the last bit.
- In `runs`, the edges of some runs have a different lane order. For `shared`, 2 to 21 runs of 1242 to 3378 differ. For `sections`, 1 or 2 runs of 144 to 310 differ.
- Thus the difference is a decision, not a move of a few ulps. It changes the lane order, and the route hash includes the lane order.

### The first call that differs

The call logs of node 24 and node 26 differ in 54 of 153 routes. In each of the 54, the first call that differs has this stack:

| Frame | Place |
|---|---|
| `Math.atan2` in `turn` | `src/segments.ts:202` |
| `partAfter` or `partBefore` | `src/segments.ts:237` or `src/segments.ts:253` |
| the compare function of `placed.sort` in `orderLanes` | `src/segments.ts:288` to `src/segments.ts:294` |
| `orderLanes` from the router | `src/routers/shared.ts:302` or `src/routers/sections.ts:211` |

- Each Math function gives the same result for the same arguments on each cell. The first call that differs has different arguments.
- In `01-rows-freeAspect-polygon-s3` with `shared`, the calls 1 to 134492 are equal. The call 134493 is `atan2(0, 454.86)` on node 26 and `atan2(-485.145, 380.948)` on node 24.
- Thus the sort of V8 13.6 and the sort of V8 14.6 give the pairs of lanes to the compare function in a different sequence.

### The cause

`orderLanes` sorts the lanes of a run with `Array.prototype.sort`. Its compare function is not a total order:

- It gives the difference of two angles from `partAfter`, or else from `partBefore`, or else from `byEdge`. Each pair uses the first part that exists.
- Thus three lanes can make a cycle: P before Q, Q before R and R before P.
- The JavaScript specification does not define the result of a sort when the compare function is not consistent. Two engines can give two orders, and each is correct by the specification.

The sort probe of the trace shows the change of the engine. The CI run [40693515449](https://github.com/mark1russell7/highways/actions/runs/40693515449) gives its data.

- The probe sorts a fixed shuffle of n numbers, and records the pairs that the engine gives to the compare function.
- For 3 to 7 numbers, V8 13.6 and V8 14.6 give the pairs in a different sequence. For 2 numbers, and for 8 to 100 numbers, the sequence is the same.
- The runs of node 24 and node 26 have 2 to 314 lanes. 259 runs have a different lane order, and each of them has 3 to 7 lanes.
- Thus only the change of the sort of 3 to 7 items changes the lane orders. A run with 8 or more lanes keeps its lane order.
- The probe also sorts with a compare function that makes a cycle of 3 classes. Its result is the same on the two engines. Thus a cycle does not always give two orders.

### The predictions

| # | Prediction | Confidence | Result | Evidence |
|---|---|---|---|---|
| 1 | The raw points differ, not only the hash. | 0.7 | Partly met | The exact results differ, but only in the lane order of `runs`. No point of a route moves. |
| 2 | The node version is the axis. | 0.5 | Met | The cells group by node. Linux and win32 give the same results with the same node. |
| 3 | The first value that differs comes from `orderLanes`: `hypot` at `segments.ts:122` or `segments.ts:130`, or `atan2` at `segments.ts:202`. | 0.45 | Partly met | The first call that differs is `atan2` at `segments.ts:202`, in `orderLanes`. But its arguments differ, not its result. The sort is the cause. |
| 4 | The difference flips a tie, so the lane order or the path changes. | 0.4 | Met | The lane order of 1 to 21 runs changes. No path changes. |
| 5 | Two runs in one cell give the same hash. | 0.9 | Met | Each cell gives the same hash at its 3 runs. |

### The fix

This item does not change a route. The next item can make the lane order the same on each engine:

1. Give the compare function of `orderLanes` a total order. For example, compute the key of each lane one time, then sort by the key and by `byEdge`.
2. Or sort the lanes with a sort of the package, so the sequence of the pairs does not depend on the engine. A merge sort is stable, and it gives the same result on each engine for each compare function.
3. Compare the turns with the signs of a cross product and a dot product. Do not subtract two `atan2` values. This also removes 2 transcendental calls from `segments.ts`.

Each option changes the lane order of some runs on node 24, on node 26 or on the two. Thus each option needs a new baseline of the joint bench.

### The ratchet of the Math calls

The script `scripts/check-math.mjs` counts the calls of the transcendental Math functions in `packages/*/src`. `pnpm test` starts it as `test:math`.

- The baseline `docs/math-baseline.json` has 187 calls in 53 files.
- The check fails when the count of a file goes up, or when a new file has a call.
- When a count goes down, the check asks for a lower baseline with `node scripts/check-math.mjs --write`.
- This item found no Math function that gives a different result. But the result of such a function can change on another platform. A decision of the router must not depend on its last bit.

## The lane order (LANE-ORDER)

The relations `byRun` and `byBundle` of `orderLanes` are not transitive, so three lanes can make a cycle. `Array.prototype.sort` with such a relation gives another order on V8 13.6 (node 24) and on V8 14.6 (node 26). This item makes the lane order the same on each engine.

- `orderLanes` and `laneOrderOfRun` of the router `shared` sort with `mergeSort` of `lane-order.ts`. The relations do not change.
- The merge sort is stable. Its pairs depend only on the input order and on the results of the relation, not on the engine.
- On a run with no cycle, the order is the order of each correct sort, for each order of the input routes. A test examines more than 500 random runs.
- On a run with a cycle, the order still depends on the order of the input routes. The order `bundle` starts from the order of the edges, so its order is fixed. The order `run` starts from the order of the routes.
- The item LANE-STRETCH is to give one order to each stretch, and thus to remove the cycles. It goes through the promotion rule.

### The predictions of LANE-ORDER

These predictions were written on 2026-10-28, before the CI runs.

1. Each chosen candidate makes the 4 cells of the matrix agree on 51 of 51 routes (high, correctness).
2. A test shows that the candidates give the order of today on each run with no cycle (high, correctness).
3. The order of Kahn changes 13 or fewer of the 27 routes that differ, against the output of node 26 (0.5, risky).
4. Fewer than 5% of the digest boards of the core tests change (0.4, risky).
5. The lane crossings (`B5`) move by less than their `minEffect` on the corpus for the chosen candidate (medium, quality).
6. The corpus has at least one broken cycle (0.6).
7. The candidate `kahn-scc` makes 9 or fewer swaps on `case-many-groups` (0.4, risky). A local probe on node 24 ran before this prediction was written.

### The candidates

Each candidate ran behind a switch for the measure only. The final change keeps only the merge sort. The numbers come from the screen `screen-v1` and the workflow `Xplat` on 2026-10-28.

| Candidate | Cells that agree | Routes that change against node 26 / node 24 | Swaps of HWC-B, `case-dense-groups` / `case-many-groups` | `B5`, routers | `B5`, highways | Cycles that break, fixtures of `Xplat` | Time of `shared` / time of `corners` |
|---|---|---|---|---|---|---|---|
| The sort of the engine (before) | 24 of 51 | 0 / 27 | 24 / 0 | 295 | 6559 | 0 | 2.46 |
| Merge sort (chosen) | 51 of 51 | 27 / 27 | 29 / 15 | 300 | 6552 | 0 | 2.28 |
| Kahn, the smallest index | 51 of 51 | 27 / 26 | 384 / 41 | 1070 | 7537 | 669 656 | 2.97 |
| Kahn, the fewest predecessors | 51 of 51 | 27 / 26 | 40 / 9 | 337 | 6434 | 656 413 | 3.05 |
| Kahn, the source component of Tarjan | 51 of 51 | 27 / 26 | 174 / 26 | 740 | 7045 | 587 255 | 3.70 |
| Rank by wins (Copeland) | 51 of 51 | 27 / 27 | 37 / 7 | 327 | 6571 | not counted | 2.88 |

- The swap counts are the same on node 24 and on node 26 for each row, also for the sort of the engine. Thus HWC-B did not depend on the version of V8.
- `B5` is `route.bundle.lane-crossings`. Its `minEffect` is 0, so each change counts. The columns of `B5` are on node 26.
- The fixtures of `Xplat` have 64 182 runs of 2 or more lanes, and 21 738 of them have a cycle. On the screen of the routers, 255 of the 7227 calls of the lane order have a cycle.
- Each total order (the forms of Kahn and the rank) costs crossings. The merge sort is nearly neutral. Thus the merge sort is the choice.
- The time column divides the time of `shared` by the time of `corners` in the same cell. `corners` does not order lanes, so the ratio removes most of the noise of the runner.

### The merge sort on each node version

The screens of the final change ran on node 24 and on node 26. The screens of the sort of the engine ran on the same day.

| Measure | Node 24 | Node 26 |
|---|---|---|
| `B5` of the routers, engine to merge | 302 to 300 | 295 to 300 |
| `B5` of the highways, engine to merge | 6533 to 6552 | 6559 to 6552 |
| Records of the routers that change (of 126) | 10 | 10 |
| Records of the highways that change (of 784) | 119 | 127 |
| Records of the merge sort that differ from the other node version | 0 of 910 | 0 of 910 |
| Records of the sort of the engine that differ from the other node version | 75 of 910 | 75 of 910 |

The default router `shared` goes from 8 to 11 lane crossings on the screen of the routers. `shared-all` goes from 167 to 169 on node 26.

These tables count the runs where the merge sort gives another order than the sort of the engine. Each cell gives the runs that change, then all the runs, then the runs with a cycle. The screens count each distinct run one time.

| Lanes | Fixtures of `Xplat`, node 24 | Fixtures of `Xplat`, node 26 | Screen of the routers, node 24 / 26 | Screen of the highways, node 24 / 26 |
|---|---|---|---|---|
| 2 | 0 of 11 972 (0) | 0 of 11 972 (0) | 0 / 0 of 1086 (0) | 3 / 3 of 70 071 (0) |
| 3 | 41 of 6090 (95) | 41 of 6090 (95) | 2 / 2 of 480 (5) | 187 / 187 of 28 585 (492) |
| 4 | 100 of 4168 (203) | 137 of 4168 (203) | 4 / 4 of 316 (5) | 392 / 509 of 14 548 (751) |
| 5 | 168 of 3196 (288) | 175 of 3196 (288) | 4 / 3 of 243 (8) | 410 / 488 of 7982 (778) |
| 6 | 206 of 2533 (343) | 201 of 2533 (343) | 9 / 9 of 159 (12) | 465 / 448 of 4715 (760) |
| 7 | 258 of 2164 (435) | 251 of 2164 (435) | 3 / 2 of 120 (7) | 339 / 336 of 2618 (499) |
| 8 or more | 16 477 of 34 059 (20 374) | 16 477 of 34 059 (20 374) | 60 / 60 of 522 (96) | 1124 / 1124 of 6049 (1496) |
| Routes or records with a changed run | 27 of 51 | 27 of 51 | 10 / 10 of 126 | 119 / 127 of 784 |
| Inputs with a changed run | 24 of 24 | 24 of 24 | 7 / 7 of 14 | 11 / 11 of 14 |

- On the fixtures of `Xplat`, each route of `shared` and `sections` changes on the two node versions. A route of `corners` does not change.
- Three runs of 2 lanes on the screen of the highways change. There, the relation is not antisymmetric for the two lanes.
- The module `packages/core/scripts/lane/diff.ts` makes the counts of the screens. `scripts/xplat.ts` writes the counts of the fixtures in the field `lanes`.

### The digests

5 of the 27 digests of the core and the site change. They are in `routers/bundlers.same.test.ts`:

- `case-dense-groups/shared` and `case-dense-groups/shared-all`
- `case-many-groups/shared-all`
- `small-clustered/shared` and `small-clustered/shared-all`

The 8 digests of `sections.same.test.ts` and the 3 boards of the site do not change. HWC-B expects 15 swaps on `case-many-groups`, the value of the merge sort.

### The score of the predictions

1. Met. The 4 cells agree on 51 of 51 routes.
2. Met. On more than 500 random runs with no cycle, `orderLanes` gives the order of the sort of before.
3. Not met. The merge sort changes 27 of the 27 routes against node 26. Each other candidate also changes 27 of 27.
4. Not met. 5 of 27 digests change (19%).
5. Not met. `B5` of the routers goes from 295 to 300 on node 26, and the `minEffect` is 0. `B5` of the highways goes from 6559 to 6552. The sum goes down by 2.
6. Met. The fixtures of `Xplat` have 21 738 runs with a cycle.
7. Not met. `kahn-scc` makes 26 swaps on `case-many-groups`.

## One lane order for each stretch (LANE-STRETCH)

LANE-ORDER gives each run its own merge sort. The relation `bundle` is not transitive, so each run breaks its cycles alone. Two neighbour runs can break one cycle in two ways. Then two lanes cross between the runs. This item gives one order to each stretch of runs.

- A stretch is a set of runs that the routes go through one after the other.
- `stretchLaneOrders(runs, options)` of `lane-orders/stretch/` gives the order of each run. Each run gets the order of its stretch, restricted to its edges.
- The router `shared` gets the options `stretchOrder` (default `none`) and `siftPasses` (default 2). With `none`, the order is the order of `orderLanes` with `bundle`.
- The router `shared-stretch` is opt-in. It is `shared` with `stretchOrder: "sifting"`, the best variant of the screen. It is not in `STRATEGIES`, so no default output changes.
- `stretchLaneOrders` also uses `sifting` by default.
- The option changes only the lane order. The routes, the runs, the length and the bends stay the same.

### The survey

The lane order of edges along shared paths is the problem of the metro-line crossings (MLCM).

1. Benkert, Nöllenburg, Uyttendaele and Wolff (2006) state MLCM: order the lines on each edge of a graph with the fewest crossings.
2. Bekos, Kaufmann, Potika and Symvonis (2008) and Asquith, Gudmundsson and Merrick (2008) add the periphery condition (MLCM-P and MLCM-PA). A line ends at the outside of its station.
3. Nöllenburg (2009) solves MLCM-PA in polynomial time. Fink and Pupyrev (2013) show that MLCM in general is NP-hard. An ILP solves small boards.
4. Pupyrev, Nachmanson, Bereg and Holroyd (2011) order the paths of ordered bundles. Each pair keeps one side along its common subpath, and crosses at one end.
5. A cycle of the relation is a feedback arc set problem. The heuristic of Eades, Lin and Smyth (1993) gives a good linear order in linear time.

### The variants

The three variants are the three families of the survey that fit a router with no solver.

| Variant | Method | Why |
|---|---|---|
| `consensus` | The heuristic of Eades, Lin and Smyth on the relation of the stretch. | It is the standard fast heuristic for a feedback arc set. |
| `periphery` | The run with the most lanes gives its order. Each next run puts its new edges at their best place. | It follows MLCM-PA and the ordered bundles. The main run keeps the order of `bundle`. |
| `sifting` | The order of `consensus`, then `siftPasses` passes of sifting. Each pass moves each edge to its best place. | It is a local search on the crossings that the order costs. |

### The design of the stretches

The first design joined each pair of neighbour runs that share 2 or more edges. Its audit (commit `d892da1`) showed a fault of the measure `B5`.

- `B5` counts a pair of lanes one time on a board, when the pair changes sides between two shared segments. A consistent order of a stretch makes `B5` 0 there.
- A pair that the order puts against the relation `bundle` on a run crosses at an end of that run. `B5` does not count this crossing. The audit calls such a pair a broken pair.
- In the first design, `B5` fell on each variant, but the broken pairs rose by a factor of 6 to 14. Thus the sum of the crossings rose.
- The cause: two edges can part and join again on the other side. One order for the stretch then forces a side that is wrong on part of it.

The second design (commit `a4304c6`) keeps a run out of a stretch when its sides disagree.

- Each route votes for the direction of a link between two neighbour runs. A link stays only when all votes agree. The links make a forest.
- A walk from the root (the run with the most lanes) adds each run whose pair sides agree with the sides of the stretch. A run that disagrees starts a later stretch.
- The audit counts `B5` plus the distinct broken pairs of each board. The verdict uses this total.

### The numbers

The screen `screen-v1` of the routers ran on 2026-10-28 (run 40748169320, commit `a4304c6`). It has 14 inputs. The time is the median over the inputs of 3 warm routes.

| Router | `B5` | Distinct broken pairs | Total | Change of the total | Time, ms |
|---|---:|---:|---:|---:|---:|
| `shared` | 11 | 10 | 21 | | 8.24 |
| `shared`, `consensus` | 2 | 17 | 19 | −10% | 8.38 |
| `shared`, `periphery` | 3 | 19 | 22 | +5% | 8.15 |
| `shared`, `sifting` | 2 | 14 | 16 | −24% | 8.16 |
| `shared-all` | 169 | 224 | 393 | | 7.71 |
| `shared-all`, `consensus` | 105 | 657 | 762 | +94% | 10.35 |
| `shared-all`, `periphery` | 57 | 286 | 343 | −13% | 10.39 |
| `shared-all`, `sifting` | 55 | 230 | 285 | −27% | 9.94 |

The first design gave these totals of `B5` and the broken pairs of each run: `shared` 21, then 64, 88 and 62. `shared-all` 393 (507 for each run), then 4710, 2222 and 1865.

The promotion rule on the records of the screen gives these results against `shared` and `shared-all`:

- Length and bends: each record ties. A lane order does not move a route point.
- `B5`: `shared` has 0 on 11 of 14 inputs, so the floor rule makes a tie there. The median ratio is 1.000 for each variant. The sign test of `shared` is 3 better, 0 worse (p = 0.125).
- `B5` of `shared-all`: `periphery` and `sifting` are better on 6 inputs and worse on 0 (p = 0.016). The median ratio is also 1.000.
- Time: the median time ratio is 0.90 to 0.98 for `shared` and 1.07 to 1.09 for `shared-all`. The q95 is 1.32 or less. Each passes the limits 1.5 and 2.0.
- The gain test needs a median ratio of 0.95 or less. No variant passes it, because most inputs tie at the floor 0.
- The audit has the broken pairs only as totals over the inputs. Thus the rule cannot run on the total for each input. [The gap of the rule](#the-gap-of-the-rule) tells the measure that it needs.

### The time on the dense board

The workflow `Scale` routes the board of 1000 boxes and 4000 edges 3 times in one job. The table gives the median of the 3 routes.

| Router | Run | Commit | Median, s | Ratio to `shared` |
|---|---|---|---:|---:|
| `shared` | 40748153040 | `a4304c6` | 21.19 | 1.00 |
| `shared-stretch`, `consensus`, before the cache of the sides | 40749484343 | `a4304c6` | 735.42 | 34.7 |
| `shared-stretch`, `sifting` (the default) | SCALE_SIFTING_RUN | SCALE_SIFTING_SHA | SCALE_SIFTING | SCALE_SIFTING_RATIO |

The jobs of two runs can use different machines. Thus the ratio has the noise of the runner.

- At `a4304c6`, the walk of the stretches calculated the sides of a run again for each test of the run. The profile gave 75% of the time to `sidesOf`, `partBefore` and `partAfter`.
- The fix keeps the sides of each run in a cache. Each run gets them one time. The orders do not change.

### The verdict

`sifting` is the best variant. Its total falls on both routers: by 24% on `shared` and by 27% on `shared-all`.

- The verdict is `kept`, opt-in. `shared-stretch` and the option `stretchOrder` stay. No default changes.
- The variant does not pass the promotion rule. The gain test fails on `B5`, and the rule has no measure for the broken pairs.
- The default of `shared-stretch` is `sifting`. The audit ran with each variant as an option, so the numbers do not change.
- `consensus` makes the total of `shared-all` rise by 94%. Thus it is not the default.
- `periphery` makes the total of `shared` rise by 5%.

### The gap of the rule

The promotion rule cannot decide on the broken pairs.

- `B5` does not count a crossing at the end of a run. Thus a lane order can make `B5` fall and the true crossings rise.
- The audit gives the broken pairs only as a total over the inputs. The sign test and the median test need one value for each input.
- The rule needs a measure of the broken pairs for each input, in the records of the screen. Then the total of `B5` and the broken pairs can be a win measure.

### The predictions of LANE-STRETCH

1. The default routes do not change: each digest test and the 51 hashes of `Xplat` equal main (high).
2. The order is the same in the 4 cells of `Xplat` and for each permutation of the input (high).
3. The best variant cuts the mean lane crossings of `shared` on `screen-v1` by 10% or more (0.45).
4. The best variant passes the promotion rule on the lane crossings, with no loss beyond `minEffect` on length or bends (0.4).
5. Its route time is 1.2 times or less the warm median of `shared` (medium).
6. On the board of 1000 boxes, it takes 1.5 times or less the time of `shared` (0.5).

### The score of the predictions

SCORE_PLACEHOLDER
