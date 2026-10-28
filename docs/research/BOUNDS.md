# The bounds of the gap closed past 10 nodes

This note is the result of the item EXACT-BOUNDS of the [roadmap](../ROADMAP.md). It gives the gap closed (B10) at 18, 24 and 40 nodes, and at each cap: 1.1, 1.25 and 1.5.

- [`GAP.md`](GAP.md) gives the gap closed on `exact-v1` (10 nodes) at the cap of each run. This note gives it at each cap, for each rule.
- Above 10 nodes, HiGHS proves few optima in 300 s. Thus the gap closed is an interval: from the best solution and from the bound of each solve.
- The script [`scripts/bounds.ts`](../../packages/core/scripts/bounds.ts) makes the tables. The test `src/bench/screen/bounds.test.ts` examines it.
- [`PORTFOLIO.md`](PORTFOLIO.md#the-portfolio-at-each-cap-exact-bounds) gives the portfolio at each cap, and the greedy sets for PORTFOLIO-API.

## Summary

- **The solves.** At 18 nodes, 162 of 240 solves prove. At 24 nodes, 113 of 240 prove, and at 40 nodes, 41 of 240. Only 18 solves at 40 nodes have no solution.
- **The intervals are narrow.** The median width of the first 5 is 0.03 or less in 23 of 24 cells. The largest is 0.100, at 40 nodes with the rule `all` at the cap 1.1.
- **`growth` holds at the cap 1.5 with the rule `all`.** A form of `growth` is first at 18, 24 and 40 nodes. Its median midpoint falls from 0.440 to 0.139.
- **The tight caps change the order.** At the cap 1.1, the forms of `zipper` lead at 10 nodes. At 40 nodes and the cap 1.1, each strategy that ranks saves less ink than the baseline.
- **The rule `collection` stays near 0.** The best median midpoint is 0.117 or less at each size and cap.
- The first 5 at 10 nodes are seldom the first 5 at 18 or 24 nodes. Most strategies have a stretch above the tight caps on many inputs of the large boards.

## The data

| Set | CI run | Commit |
|---|---|---|
| the solves of `exact-v1-bounds` | [40631513534](https://github.com/mark1russell7/highways/actions/runs/40631513534) | `71fb29c` |
| the screen of `exact-v1` | [40631516113](https://github.com/mark1russell7/highways/actions/runs/40631516113) | `71fb29c` |
| the screens of `exact-v1-bounds`, one for each of the 12 families | [40644555345](https://github.com/mark1russell7/highways/actions/runs/40644555345) to [40644583603](https://github.com/mark1russell7/highways/actions/runs/40644583603) | `5545ed6` |
| the report | [40645753347](https://github.com/mark1russell7/highways/actions/runs/40645753347) | `5545ed6` |

- The set `exact-v1-bounds` has the 4 classes of `exact-v1` at 18, 24 and 40 nodes, with 10 seeds for each class. [`LAYOUT-RECORDS.md`](../LAYOUT-RECORDS.md#the-screen-set-exact-v1-bounds) gives the generators.
- Each solve has a time limit of 300 s. The file [`optima-exact-v1-bounds.json`](../../packages/core/src/bench/exact/optima-exact-v1-bounds.json) keeps the 720 rows.
- The pool is the 297 strategies of the screen module `scripts/screens/meas2.ts`, with waves 3E and 3F and the built-in routers.


## The interval

Above 10 nodes, HiGHS proves few optima in 300 s. A solve without a proof gives two values:

- The objective of the best solution (the incumbent). The plan of that solution, after `follow`, gives the B1 `b`.
- The dual bound. No plan of the model has a smaller objective.

The objective of the model is the ink plus a small cost of the length (0.001 for each unit). Thus the ratio of the bound to the objective is approximately a ratio of the ink.

- The interval of the optimum B1 is from `b` to `1 - (1 - b) × bound / objective`.
- The low end is a plan that exists. The high end supposes that the ink of the optimum is at least `bound / objective` times the ink of the incumbent, with the same length of the routes.
- Without a positive bound, the high end is 1. At a proven optimum, the two ends are equal.
- The high end is an estimate, not a proof. A plan with other route lengths can have a different ratio of ink.

The gap closed of a run is `(B1 - B1 of the baseline) / (the optimum B1 - B1 of the baseline)`. Over the interval of the optimum, it is an interval too.

- The high end of the optimum gives the low end of the gap closed. The low end of the optimum gives the high end.
- The midpoint and the width of each interval are the values of the tables. The median is over the inputs with a value.
- A run has a value at a cap only when its stretch is at or below the cap. Under the rule `collection`, a run that mixes collections has no value.
- An input has no value when the low end of the optimum is at the baseline or below it.
- A strategy with values on fewer than half of the inputs does not rank.

## The solves by size, rule and cap

The rows at 10 nodes come from [`optima-exact-v1.json`](../../packages/core/src/bench/exact/optima-exact-v1.json). The last column gives the median width of the interval of the optimum B1.

| nodes | rule | cap | inputs | proven | bound only | no solution | median width of the optimum B1 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 10 | `all` | 1.1 | 40 | 40 | 0 | 0 | 0.000 |
| 10 | `all` | 1.25 | 40 | 40 | 0 | 0 | 0.000 |
| 10 | `all` | 1.5 | 40 | 40 | 0 | 0 | 0.000 |
| 10 | `collection` | 1.1 | 40 | 40 | 0 | 0 | 0.000 |
| 10 | `collection` | 1.25 | 40 | 40 | 0 | 0 | 0.000 |
| 10 | `collection` | 1.5 | 40 | 40 | 0 | 0 | 0.000 |
| 18 | `all` | 1.1 | 40 | 40 | 0 | 0 | 0.000 |
| 18 | `all` | 1.25 | 40 | 23 | 17 | 0 | 0.000 |
| 18 | `all` | 1.5 | 40 | 1 | 39 | 0 | 0.030 |
| 18 | `collection` | 1.1 | 40 | 40 | 0 | 0 | 0.000 |
| 18 | `collection` | 1.25 | 40 | 37 | 3 | 0 | 0.000 |
| 18 | `collection` | 1.5 | 40 | 21 | 19 | 0 | 0.000 |
| 24 | `all` | 1.1 | 40 | 34 | 6 | 0 | 0.000 |
| 24 | `all` | 1.25 | 40 | 3 | 37 | 0 | 0.023 |
| 24 | `all` | 1.5 | 40 | 0 | 40 | 0 | 0.042 |
| 24 | `collection` | 1.1 | 40 | 39 | 1 | 0 | 0.000 |
| 24 | `collection` | 1.25 | 40 | 28 | 12 | 0 | 0.000 |
| 24 | `collection` | 1.5 | 40 | 9 | 31 | 0 | 0.013 |
| 40 | `all` | 1.1 | 40 | 8 | 32 | 0 | 0.016 |
| 40 | `all` | 1.25 | 40 | 0 | 38 | 2 | 0.053 |
| 40 | `all` | 1.5 | 40 | 0 | 28 | 12 | 0.069 |
| 40 | `collection` | 1.1 | 40 | 29 | 11 | 0 | 0.000 |
| 40 | `collection` | 1.25 | 40 | 4 | 36 | 0 | 0.014 |
| 40 | `collection` | 1.5 | 40 | 0 | 36 | 4 | 0.037 |


## The first 5 strategies by size, rule and cap

Each cell gives a strategy, the median midpoint of its interval of the gap closed, and the medians of the two ends. The row `width` gives the median width of the 5. The row `values` gives the inputs with a value of each of the 5.

### The rule `collection` at the cap 1.1

| rank | 10 nodes | 18 nodes | 24 nodes | 40 nodes |
|---:|---|---|---|---|
| 1 | `corners-side` 0.106 (0.106 to 0.106) | `hw:weiszfeld` 0.005 (0.005 to 0.005) | `w2a:shared-ways+stretch` 0.000 (0.000 to 0.000) | `shared-flow-a08` -0.145 (-0.145 to -0.145) |
| 2 | `corners-side-bend0` 0.106 (0.106 to 0.106) | `w2a:shared-ways+breakeven` 0.005 (0.005 to 0.005) | `w3d:divided+stretch` 0.000 (0.000 to 0.000) | `w2c:wspd+stretch` -0.379 (-0.379 to -0.379) |
| 3 | `corners-side-bend4` 0.106 (0.106 to 0.106) | `w2a:shared-ways+stretch` 0.005 (0.005 to 0.005) | `shared-flow-a07` 0.000 (0.000 to 0.000) | `hw:od-cells` -0.380 (-0.380 to -0.380) |
| 4 | `corners-side-most32` 0.106 (0.106 to 0.106) | `w2b:level-links-d2` 0.005 (0.005 to 0.005) | `shared-order-shortest` 0.000 (0.000 to 0.000) | `w3e:power-saved1` -0.380 (-0.380 to -0.380) |
| 5 | `corners` 0.000 (0.000 to 0.000) | `w2b:weiszfeld-a0` 0.005 (0.005 to 0.005) | `w2a:shared-ways+ambiguity` 0.000 (0.000 to 0.000) | `w2c:od-cells+stretch` -0.381 (-0.381 to -0.381) |
| width | 0.000 | 0.000 | 0.000 | 0.000 |
| values | 40/40, 40/40, 40/40, 40/40, 40/40 | 23/40, 29/40, 23/40, 21/40, 23/40 | 20/40, 20/40, 21/40, 23/40, 22/40 | 21/40, 21/40, 24/40, 22/40, 27/40 |

### The rule `collection` at the cap 1.25

| rank | 10 nodes | 18 nodes | 24 nodes | 40 nodes |
|---:|---|---|---|---|
| 1 | `trunks-gilbert-a05` 0.103 (0.103 to 0.103) | `hw:crossbars` 0.071 (0.071 to 0.071) | `w3e:crossbars+stretch` 0.060 (0.060 to 0.060) | `w3e:crossbars+stretch` 0.082 (0.082 to 0.082) |
| 2 | `trunks-gilbert-a07` 0.103 (0.103 to 0.103) | `w3e:crossbars+stretch` 0.071 (0.071 to 0.071) | `shared-flow-a06-p3` 0.041 (0.041 to 0.041) | `hw:divided` 0.059 (0.058 to 0.061) |
| 3 | `trunks-tree-bf08` 0.087 (0.087 to 0.087) | `w2a:shared-ways+stretch` 0.030 (0.030 to 0.030) | `shared-p3` 0.039 (0.039 to 0.039) | `hw:lanes` 0.059 (0.058 to 0.061) |
| 4 | `corners-side` 0.047 (0.047 to 0.047) | `w2b:level-links-d2` 0.030 (0.030 to 0.030) | `shared-p2` 0.032 (0.032 to 0.032) | `hw:shared-ways` 0.059 (0.058 to 0.061) |
| 5 | `corners-side-bend0` 0.047 (0.047 to 0.047) | `w3d:divided+stretch` 0.030 (0.030 to 0.030) | `w2b:level-links-d2` 0.031 (0.030 to 0.031) | `w2a:shared-ways+ids` 0.059 (0.058 to 0.061) |
| width | 0.000 | 0.000 | 0.000 | 0.002 |
| values | 20/40, 22/40, 22/40, 40/40, 40/40 | 24/40, 34/40, 40/40, 38/40, 40/40 | 29/40, 24/40, 29/40, 29/40, 31/40 | 23/40, 26/40, 26/40, 26/40, 26/40 |

### The rule `collection` at the cap 1.5

| rank | 10 nodes | 18 nodes | 24 nodes | 40 nodes |
|---:|---|---|---|---|
| 1 | `trunks-tree-bf04` 0.117 (0.117 to 0.117) | `shared-wind-p2-r1-e2` 0.077 (0.077 to 0.077) | `hw:crossbars` 0.101 (0.099 to 0.102) | `shared-flow-a06-p3` 0.072 (0.070 to 0.073) |
| 2 | `trunks-tree-bf02` 0.116 (0.116 to 0.116) | `trunks-gilbert-a03` 0.073 (0.073 to 0.073) | `trunks-gilbert-a03` 0.083 (0.082 to 0.084) | `shared-wind-p3-r1` 0.070 (0.067 to 0.073) |
| 3 | `trunks-tree-bf06` 0.116 (0.116 to 0.116) | `hw:crossbars` 0.063 (0.063 to 0.063) | `shared-wind-p2-r2` 0.080 (0.079 to 0.082) | `shared-wind-p2-r1` 0.070 (0.067 to 0.072) |
| 4 | `hw:keys` 0.113 (0.113 to 0.113) | `trunks-gilbert-a05` 0.059 (0.059 to 0.059) | `shared-wind-p3-r1` 0.077 (0.076 to 0.079) | `shared-p3` 0.063 (0.060 to 0.065) |
| 5 | `trunks` 0.113 (0.113 to 0.113) | `shared-wind-p2-r2` 0.054 (0.054 to 0.054) | `shared-wind-p2-r1-e2` 0.076 (0.076 to 0.076) | `shared-p2` 0.056 (0.053 to 0.060) |
| width | 0.000 | 0.000 | 0.002 | 0.005 |
| values | 26/40, 25/40, 27/40, 26/40, 26/40 | 30/40, 23/40, 25/40, 23/40, 31/40 | 20/40, 20/40, 26/40, 27/40, 21/40 | 29/40, 21/40, 22/40, 33/40, 33/40 |

### The rule `all` at the cap 1.1

| rank | 10 nodes | 18 nodes | 24 nodes | 40 nodes |
|---:|---|---|---|---|
| 1 | `w2b:zipper-a1` 0.339 (0.339 to 0.339) | `w3a:diffusion-wide` 0.062 (0.062 to 0.062) | `w3e:frechet-e0.5` -0.211 (-0.211 to -0.211) | `w2c:zipper+stretch-b1.1` -1.015 (-1.084 to -0.946) |
| 2 | `hw:zipper` 0.294 (0.294 to 0.294) | `w2c:zipper+stretch` 0.041 (0.041 to 0.041) | `w3a:spiral-a15` -0.255 (-0.255 to -0.255) | `w3e:frechet-e0.5` -1.207 (-1.283 to -1.131) |
| 3 | `w2b:zipper-p2` 0.294 (0.294 to 0.294) | `w3a:spiral-a15` -0.014 (-0.014 to -0.014) | `shared-all-flow-a08` -0.272 (-0.272 to -0.272) | `w3c:soft-keys+stretch` -1.233 (-1.264 to -1.222) |
| 4 | `w2c:zipper+stretch` 0.294 (0.294 to 0.294) | `hw:diffusion` -0.035 (-0.035 to -0.035) | `w2c:zipper+stretch-b1.15` -0.301 (-0.301 to -0.301) | `w2b:zipper-corridors` -1.304 (-1.388 to -1.219) |
| 5 | `w2c:zipper+stretch-b1.15` 0.294 (0.294 to 0.294) | `w3a:diffusion+stretch` -0.035 (-0.035 to -0.035) | `w2c:zipper+stretch-b1.1` -0.307 (-0.307 to -0.307) | `w2c:level-links+stretch-b1.1` -1.305 (-1.340 to -1.305) |
| width | 0.000 | 0.000 | 0.000 | 0.100 |
| values | 25/40, 32/40, 32/40, 32/40, 32/40 | 25/40, 20/40, 31/40, 20/40, 20/40 | 30/40, 25/40, 20/40, 21/40, 36/40 | 34/40, 23/40, 20/40, 26/40, 31/40 |

### The rule `all` at the cap 1.25

| rank | 10 nodes | 18 nodes | 24 nodes | 40 nodes |
|---:|---|---|---|---|
| 1 | `w3d:kdeeb-nomask` 0.495 (0.495 to 0.495) | `w3e:mlseb+stretch` 0.318 (0.312 to 0.319) | `w3e:mlseb+stretch` 0.198 (0.196 to 0.200) | `w3d:kdeeb-routes` -0.057 (-0.061 to -0.052) |
| 2 | `w3e:mlseb+stretch` 0.475 (0.475 to 0.475) | `hw:cubu` 0.308 (0.305 to 0.311) | `hw:cubu` 0.160 (0.152 to 0.167) | `hw:cubu` -0.092 (-0.101 to -0.083) |
| 3 | `w3d:kdeeb-routes` 0.468 (0.468 to 0.468) | `w3d:cubu-fft` 0.308 (0.305 to 0.311) | `w3d:cubu-fft` 0.160 (0.152 to 0.167) | `w3d:cubu-fft` -0.092 (-0.101 to -0.083) |
| 4 | `hw:cubu` 0.450 (0.450 to 0.450) | `w3d:kdeeb-nomask` 0.304 (0.301 to 0.315) | `w3d:kdeeb-routes` 0.157 (0.153 to 0.162) | `w3e:mlseb+stretch` -0.096 (-0.108 to -0.084) |
| 5 | `w3d:cubu-fft` 0.450 (0.450 to 0.450) | `w3d:kdeeb-routes` 0.290 (0.290 to 0.290) | `w3d:cubu+stretch` 0.128 (0.126 to 0.130) | `w3e:frechet+stretch` -0.135 (-0.149 to -0.123) |
| width | 0.000 | 0.000 | 0.012 | 0.025 |
| values | 26/40, 39/40, 40/40, 33/40, 33/40 | 40/40, 30/40, 30/40, 23/40, 39/40 | 40/40, 26/40, 26/40, 36/40, 40/40 | 37/40, 25/40, 25/40, 37/40, 38/40 |

### The rule `all` at the cap 1.5

| rank | 10 nodes | 18 nodes | 24 nodes | 40 nodes |
|---:|---|---|---|---|
| 1 | `w3e:mlseb-parabola` 0.664 (0.664 to 0.664) | `w3b:growth-s0.3` 0.440 (0.431 to 0.448) | `w3b:growth-s0.3` 0.353 (0.338 to 0.371) | `w3b:growth-input` 0.139 (0.126 to 0.152) |
| 2 | `w3b:growth-s0.3` 0.576 (0.576 to 0.576) | `hw:growth` 0.423 (0.406 to 0.442) | `hw:growth` 0.347 (0.331 to 0.363) | `w3b:growth-s0.7` 0.099 (0.093 to 0.105) |
| 3 | `hw:growth` 0.539 (0.539 to 0.539) | `w3b:growth-input` 0.398 (0.380 to 0.410) | `w3b:growth-input` 0.344 (0.327 to 0.361) | `w3b:growth-t1.2` 0.062 (0.059 to 0.065) |
| 4 | `w3b:growth-input` 0.527 (0.527 to 0.527) | `w3b:growth-s0.7` 0.341 (0.324 to 0.353) | `w3b:growth-s0.7` 0.261 (0.250 to 0.269) | `w3d:kdeeb-nomask` 0.008 (0.007 to 0.010) |
| 5 | `w3b:growth-s0.7` 0.418 (0.418 to 0.418) | `w3e:frechet-s1` 0.262 (0.252 to 0.268) | `w3b:growth-t1.2` 0.187 (0.179 to 0.198) | `hw:shared-ways-all` 0.000 (0.000 to 0.000) |
| width | 0.000 | 0.024 | 0.029 | 0.011 |
| values | 21/40, 37/40, 36/40, 36/40, 36/40 | 36/40, 33/40, 36/40, 35/40, 26/40 | 34/40, 34/40, 36/40, 36/40, 35/40 | 20/40, 23/40, 21/40, 22/40, 20/40 |


## The check of the prediction

The prediction of the item was written before the work.

| Claim | Result | Met |
|---|---|---|
| 1. At 18 and 24 nodes, the first 5 are the first 5 at 10 nodes, in any order. | 1 of 12 cells: `all` at 1.25 and 18 nodes. With `all` at 1.25 and 1.5, 4 of 5 stay. With `collection`, 0 of 5 stay. | Not met |
| 2. At 40 nodes, the median width of the first 5 is 0.3 or more. | 0.000 to 0.100. The largest is `all` at the cap 1.1. | Not met |
| 3. Under the rule `all`, `growth` is first at each size where the intervals rank. | The intervals rank at each size. At the cap 1.5, `growth` is first at 18, 24 and 40 nodes, but `w3e:mlseb-parabola` is first at 10 nodes. At 1.1 and 1.25, `growth` is never first. | Not met |
| 4. At the cap 1.1, the oracle gain of `collection` is larger than at the cap 1.5. | 0.325 at 1.1, against 0.370 at 1.5 ([`PORTFOLIO.md`](PORTFOLIO.md#the-portfolio-at-each-cap-exact-bounds)). | Not met |
| 5. No default output changes, so no release. | The item adds data, scripts and docs. No default changes. | Met |

- At 10 nodes, the gap closed of the bounds agrees with the gap closed of the screen on 20441 of 20441 runs. Each of these runs has a proven optimum.
- At 10 nodes with the rule `all` at the cap 1.5, `w3e:mlseb-parabola` has a value on 21 of 40 inputs. On the other inputs its stretch is above 1.5. `w3b:growth-s0.3` has a value on 37 of 40 inputs.

## What this means

- With this estimate, the bounds of HiGHS give intervals narrow enough for a ranking up to 40 nodes, at 300 s for each solve.
- The rule `all` at the cap 1.5 keeps the order of [`GAP.md`](GAP.md): the forms of `growth` lead, and the gap closed falls with the size.
- A tight cap removes most strategies on the large boards. At 40 nodes and the cap 1.1, `shared` has a value on 2 of 40 inputs. The baseline of `all` has a value on none.
  - There the baseline routes are longer than the cap, so they save more ink than each run at the cap. Thus the medians are below 0.
  - A caller with a tight cap needs strategies that save ink at a small stretch. No strategy of the pool does that at 40 nodes.
- The rule `collection` has a small gap closed at each size. [`PORTFOLIO.md`](PORTFOLIO.md) shows that its oracle gain is large. Thus the next idea waves aim at the rule `collection` first.
- The item adds no strategy and changes no default, so it needs no release.
