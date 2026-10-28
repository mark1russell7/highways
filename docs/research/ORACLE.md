# The oracle bound of a selector

This note is the result of the item ORACLE of the [roadmap](../ROADMAP.md). A selector chooses one strategy for each input from the features of the input. This note gives the upper bound of such a selector.

- The oracle of an input is the best strategy of the whole portfolio on that input. The portfolio has 228 strategies: the built-in strategies and each option of waves 1 to 3, kept and dropped.
- The note compares the oracle with the best single strategy: one strategy for all inputs, with the best median.
- It also tests a realistic selector, which chooses on one half of the seeds and runs on the other half.
- The script [`scripts/oracle.ts`](../../packages/core/scripts/oracle.ts) makes the tables from the records of the workflow `Screen`. The test `src/bench/screen/oracle.test.ts` examines its functions.

## Summary

- The bound is large. On `exact-v1`, the oracle closes a median of 0.947 of the gap (0.797 to 1.009). The best single strategy, `w3b:growth-s0.3`, closes 0.595. The gain is 0.352 (0.191 to 0.465).
- On `screen-v1`, under the guard of the B3 q95 of `shared`, the oracle B1 is 39% to 534% above the best single strategy on each of the 4 boards that decide.
- A realistic selector keeps little of this gain. On `exact-v1`, a choice for each class on half of the seeds is worse than the best single strategy: it keeps -32% of the oracle gain.
- On `screen-v1`, a choice for each board keeps 76% of the gain against the best single strategy, but only 26% against the best single strategy with a fall back to `shared`. Only 8 inputs give these numbers.
- The winners change from input to input in each class of `exact-v1`. The class does not tell the winner. On `screen-v1`, the kind of board goes with the winner, but each kind has only 1 to 3 inputs.
- Most winners are dropped ideas or forms of `growth`. Most of them also mix collections. Without the strategies that mix collections, the bound is smaller.
- The bound passes the limit of the item. The roadmap gets the item SELECT.

## The data

| Set | CI run | Records | Commit |
|---|---|---:|---|
| `exact-v1` | [40621199517](https://github.com/mark1russell7/highways/actions/runs/40621199517) | 9120 | `cc6f8e0` |
| `screen-v1`, `small-clustered` | [40621202168](https://github.com/mark1russell7/highways/actions/runs/40621202168) | 684 | `cc6f8e0` |
| `screen-v1`, `dense-groups` | [40621205190](https://github.com/mark1russell7/highways/actions/runs/40621205190) | 684 | `cc6f8e0` |
| `screen-v1`, `hub-chain` | [40621207466](https://github.com/mark1russell7/highways/actions/runs/40621207466) | 228 | `cc6f8e0` |
| `screen-v1`, `many-groups` | [40621210643](https://github.com/mark1russell7/highways/actions/runs/40621210643) | 228 | `cc6f8e0` |
| `screen-v1`, `tiny-uniform` | [40621213366](https://github.com/mark1russell7/highways/actions/runs/40621213366) | 684 | `cc6f8e0` |
| `screen-v1`, `packed-grid` | [40621215539](https://github.com/mark1russell7/highways/actions/runs/40621215539) | 684 | `cc6f8e0` |

- Each run uses the screen module `scripts/screens/meas2.ts`, so each run has the same 228 strategies. The strategies of wave 3D are in it.
- The records of the wave screens came from different commits and different modules. Thus this note does not use them. It screens the whole portfolio again, at one commit.
- The commands:

```sh
gh workflow run screen.yml --ref <branch> -f step=router -f set=exact-v1 -f module=packages/core/scripts/screens/meas2.ts
gh workflow run screen.yml --ref <branch> -f step=router -f set=screen-v1 -f module=packages/core/scripts/screens/meas2.ts -f families=<family>
pnpm --filter @mark1russell7/highways oracle --exact <folder> --screen <folder,...> --out oracle.md
```

## The method

- **The oracle.** For each input, the oracle is the best value over the strategies. Each strategy within `RECORD_EPS` of the best value is a winner.
- **The best single strategy.** This is the strategy with the best median over the inputs. On `exact-v1`, it must have a value on at least half of the inputs, as in [`GAP.md`](GAP.md).
- **The interval.** The interval is the 95% paired bootstrap interval, with 10000 samples from the seed 1 ([`PROMOTION.md`](../PROMOTION.md)). Each sample takes the oracle value and the value of the best single strategy of the same input.
- **The gap closed.** The value is B10 with the rule of each run, as in `GAP.md`. A run above the cap 1.5 has no value. The paired tables use the inputs where the best single strategy has a value.
- **The guard of `screen-v1`.** A run passes when its B3 q95 is at most the B3 q95 of `shared` on the same input. A difference of `RECORD_EPS` or less is a tie, so it passes.
- **The ratio of `screen-v1`.** The ratio of a run is its B1 divided by the B1 of `shared`. An input where `shared` has a B1 of 0 has no ratio. Thus `tiny-uniform/s0`, `packed-grid/s0` and `packed-grid/s1` are not in the tables.
- **The best single strategy of `screen-v1`.** It passes the guard on each input of the 4 boards that decide. The single strategy with a fall back takes the ratio 1 of `shared` where it fails the guard.
- **The boards that decide.** The boards are `small-clustered`, `dense-groups`, `hub-chain` and `many-groups`, as in the screens of waves 2 and 3.
- **The realistic selector.** For each class or board, the selector chooses the best single strategy on one half of the seeds. Then it runs that strategy on the other half.
  - On `exact-v1`, the halves are the seeds 0 to 4 and 5 to 9 of each class. The two splits test each input one time.
  - On `screen-v1`, the halves of a board with 3 seeds are the seeds 0 and 1, and the seed 2.
  - A board with 1 seed chooses on the inputs of the other 3 boards.
  - On a test input, a choice that fails the guard falls back to `shared`.
- **The share of the oracle gain.** The share is `(selector - best single) / (oracle - best single)`, from the medians over the test inputs. A share of 100% is the oracle, and a share of 0 is the best single strategy.

## `exact-v1`: the gap closed (B10)

| portfolio | inputs | best single | its median | oracle median | oracle interval | gain | gain interval |
|---|---:|---|---:|---:|---|---:|---|
| all 228 strategies | 37 | `w3b:growth-s0.3` | 0.595 | 0.947 | 0.797 to 1.009 | 0.352 | 0.191 to 0.465 |
| the strategies that never mix collections | 27 | `trunks-tree-bf06` | 0.264 | 0.434 | 0.317 to 0.627 | 0.170 | 0.069 to 0.485 |

- The oracle has a value on each of the 40 inputs. Its median over the 40 inputs is 0.933.
- On 13 inputs, the oracle is above 1. There, a strategy saves more ink after its routes than the optimum of the exact model after `follow`. With each value clipped at 1, the median stays 0.933.
- 40 of the 228 strategies never mix collections on `exact-v1`. Their oracle is 0.434, against 0.264 for their best single strategy.

| class | best single | oracle | gain |
|---|---:|---:|---:|
| `clustered` | 0.508 | 0.947 | 0.439 |
| `fanout` | 0.605 | 0.863 | 0.258 |
| `hubs` | 0.629 | 1.119 | 0.490 |
| `uniform` | 0.563 | 0.771 | 0.208 |

### The realistic selector on `exact-v1`

| split | test inputs | no value | selector | best single | oracle | share of the oracle gain | choices |
|---|---:|---:|---:|---:|---:|---:|---|
| first half to second half | 19 | 1 | 0.484 | 0.543 | 0.865 | -18% | uniform: `w3b:growth-s0.3`, clustered: `w3a:spiral-n3`, hubs: `hw:growth`, fanout: `hw:cubu` |
| second half to first half | 18 | 1 | 0.442 | 0.631 | 0.979 | -55% | uniform: `w2b:zipper-near2`, clustered: `hw:growth`, hubs: `w3d:kdeeb-routes`, fanout: `w3d:kdeeb-routes` |
| mean of the splits | | | | | | -37% | |
| both splits together | 37 | | 0.484 | 0.595 | 0.947 | -32% | |

- The choice on 5 seeds of a class is a different strategy in each split. It fits the 5 seeds and not the class.
- The selector is worse than `w3b:growth-s0.3` on each split. The class alone does not give a better choice than one strategy for all inputs.

## `screen-v1`: B1 under the guard

The best single strategy that passes the guard on each input of the 4 boards is `hw:shared-ways`. With a fall back to `shared`, the best single strategy is `w3a:diffusion-g2`.

| board | inputs | oracle / `shared` | best single / `shared` | oracle / best single | single with fall back / `shared` | oracle / single with fall back | best single of the board | its ratio |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| `small-clustered` | 3 | 1.673 | 1.103 | 1.483 | 1.673 | 1.043 | `w3d:kdeeb-routes` | 1.448 |
| `dense-groups` | 3 | 1.480 | 1.063 | 1.386 | 1.444 | 1.021 | `w3a:diffusion-l3` | 1.480 |
| `hub-chain` | 1 | 6.338 | 1.000 | 6.338 | 1.000 | 6.338 | `w2b:zipper-corridors` | 6.338 |
| `many-groups` | 1 | 1.679 | 1.029 | 1.631 | 1.000 | 1.679 | `w2c:od-cells-shared` | 1.679 |
| `tiny-uniform` (not in the decision) | 2 | 1.188 | 1.000 | 1.188 | 1.000 | 1.188 | `corners` | 1.000 |
| `packed-grid` (not in the decision) | 1 | 104.358 | 1.000 | 104.358 | 1.000 | 104.358 | `hw:level-links` | 104.358 |

- The oracle is 15% or more above the best single strategy on 4 of the 4 boards that decide.
- It is 15% or more above the single strategy with a fall back on 2 of the 4 boards: `hub-chain` and `many-groups`.
- The guard is strict. Most strategies that save much ink fail it on at least one input. Thus the best single strategy without a fall back is near `shared`.
- On `hub-chain` and `packed-grid`, `shared` saves little ink. Thus a small saving gives a large ratio.
- When each hard count must also be at most the count of `shared`, no row of the 4 boards changes. On `packed-grid`, the oracle falls to 25.942.

Without the 188 strategies that mix collections on `exact-v1`:

| board | oracle / `shared` | best single / `shared` | oracle / best single |
|---|---:|---:|---:|
| `small-clustered` | 1.103 | 1.103 | 1.000 |
| `dense-groups` | 1.063 | 1.063 | 1.000 |
| `hub-chain` | 5.776 | 1.000 | 5.776 |
| `many-groups` | 1.679 | 1.029 | 1.631 |

- The best single strategy of this portfolio is `hw:shared-ways`, as before.
- On the two boards with collections, no strategy that keeps the collections apart passes the guard with more ink saved than `hw:shared-ways`.
- The boards `hub-chain` and `many-groups` have no collections, so there a mix of collections is not possible.

### The realistic selector on `screen-v1`

| split | test inputs | selector / `shared` | best single / `shared` | oracle / `shared` | share of the oracle gain | share against the single with fall back | choices |
|---|---:|---:|---:|---:|---:|---:|---|
| first half to second half | 2 | 1.487 | 1.096 | 1.573 | 82% | -479% | small-clustered: `w3d:kdeeb-routes`, dense-groups: `w3a:diffusion-l3` |
| second half to first half | 4 | 1.508 | 1.080 | 1.508 | 100% | 100% | small-clustered: `w3a:diffusion-g2`, dense-groups: `w3a:diffusion-l3` |
| hub-chain from the other boards | 1 | 1.000 | 1.000 | 6.338 | 0% | 0% | hub-chain: `w3a:diffusion-l3` |
| many-groups from the other boards | 1 | 1.000 | 1.029 | 1.679 | -5% | 0% | many-groups: `w3a:diffusion-l3` |
| mean of the splits | | | | | 44% | -95% | |
| all splits together | 8 | 1.477 | 1.069 | 1.605 | 76% | 26% | |

- On `small-clustered` and `dense-groups`, a choice on some seeds of the board works on the other seeds. The forms of `diffusion` win on both boards.
- A board with 1 seed has no seed to learn from. The choice of the other boards fails the guard there, so it falls back to `shared` and gains nothing.
- The share against the single strategy with a fall back is small, because `w3a:diffusion-g2` already gets most of the gain on the boards with 3 seeds.
- The split of 2 test inputs gives -479%: there the oracle gains almost nothing over `w3a:diffusion-g2`, so the share is not stable.

## `screen-v1`: each measure without a guard

The values are the medians over the 14 inputs. A strategy needs a value on each input. For a measure where lower is better, a ratio below 1 is a gain.

| measure | id | better | best single | its median | oracle median | ratio |
|---|---|---|---|---:|---:|---:|
| `route.crossings` | R1 | lower | `shared-all-wind-p2-r1` | 140.000 | 126.000 | 0.900 |
| `route.crossings.per-edge` | R1 | lower | `shared-all-wind-p2-r1` | 0.700 | 0.645 | 0.921 |
| `route.crossing-angle.mean` | R2 | higher | `hw:cubu` | 0.687 | 0.703 | 1.024 |
| `route.crossing-angle.min` | R2 | higher | `shared-all-wind-p2-r1` | 5.876 | 11.939 | 2.032 |
| `route.clearance.mean` | R8 | higher | `w3d:kdeeb-routes` | 14.355 | 14.355 | 1.000 |
| `route.clearance.tight` | R8 | lower | `shared-all-wind-p2-r1` | 0.030 | 0.027 | 0.889 |
| `route.plug-spacing.min` | R11 | higher | `corners-gap8` | 0.407 | 0.410 | 1.009 |
| `route.lane.separation` | R12 | lower | `w3a:diffusion+stretch` | 0.052 | 0.037 | 0.725 |
| `route.orthogonality` | R14 | higher | `w3d:kdeeb-nomask` | 0.273 | 0.384 | 1.408 |
| `route.ink` | R1 | lower | `w3c:edge-paths-k3` | 23226.868 | 23226.868 | 1.000 |
| `route.bundle.ink-saved` | B1 | higher | `w3c:edge-paths-k3` | 0.663 | 0.678 | 1.023 |
| `route.bundle.share` | B2 | higher | `w3c:edge-paths-k3` | 0.904 | 0.932 | 1.030 |
| `route.bundle.stretch.median` | B3 | lower | `straight` | 0.981 | 0.980 | 0.999 |
| `route.bundle.occupied-area` | B7 | lower | `w3c:edge-paths-k3` | 0.723 | 0.712 | 0.985 |
| `route.bundle.run-edges.median` | B8 | higher | `w3c:hub-arcs-q4` | 7.000 | 13.250 | 1.893 |
| `route.bundle.run-edges.max` | B8 | higher | `w3c:hdbscan-flow` | 59.000 | 65.500 | 1.110 |
| `route.bundle.lane-fidelity.median` | B9 | lower | `hw:level-links` | 0.507 | 0.500 | 0.986 |
| `route.bundle.lane-fidelity.max` | B9 | lower | `w2b:level-links-corridors` | 0.807 | 0.500 | 0.620 |

- The table shows each measure with a ratio other than 1. The script also gives the other rows.
- On R3, R4, R5, R6, R7, R9, R10, R13, R15, B3 q95, B4, B5, B6, B8 `runs`, M1, M4 and Z10, the best single strategy is at the floor (0 or 1). Thus the oracle gains nothing. Most of these floors come from `straight`, `plugs` or `corners`, which bundle nothing.
- On the levels and the groups (Z3 to Z9, G1 to G8), only the strategies with zoom levels have a value on each input. The ratio is 1.
- Without a guard, B1 gains only 2.3%, because `w3c:edge-paths-k3` saves the most ink on almost each input. It also stretches the routes much more than `shared`.
- The large gains are on R2 min (2.03), B8 median (1.89), R14 (1.41) and B9 max (0.62). These measures have no strategy that is best on most inputs.

## The winners

### The winners on `exact-v1`

| strategy | wins | sole wins | uniform | clustered | hubs | fanout | mean collections | ideas |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `w3d:kdeeb-routes` | 10 | 10 | 3 | 2 | 3 | 2 | 3.6 | HWY-006 dropped, RULE-028 dropped |
| `w3b:growth-input` | 7 | 7 | 2 | 3 | 1 | 1 | 4.1 | HWY-055 screened |
| `w3b:growth-s0.3` | 5 | 1 | 0 | 1 | 2 | 2 | 3.4 | HWY-055 screened |
| `hw:cubu` | 4 | 0 | 0 | 1 | 2 | 1 | 4.0 | HWY-007 dropped |
| `hw:growth` | 4 | 0 | 0 | 1 | 2 | 1 | 3.8 | HWY-055 screened |
| `w3d:cubu+stretch` | 4 | 0 | 0 | 1 | 2 | 1 | 4.0 | HWY-007 dropped |
| `w3d:cubu-fft` | 4 | 0 | 0 | 1 | 2 | 1 | 4.0 | HWY-007 dropped |
| `corners-side` | 2 | 0 | 1 | 1 | 0 | 0 | 4.5 | WILD-001 kept |
| `corners-side-bend0` | 2 | 0 | 1 | 1 | 0 | 0 | 4.5 | the options of WILD-001 |
| `corners-side-bend4` | 2 | 0 | 1 | 1 | 0 | 0 | 4.5 | the options of WILD-001 |
| `corners-side-most32` | 2 | 0 | 1 | 1 | 0 | 0 | 4.5 | the options of WILD-001 |
| `hw:spiral` | 2 | 0 | 0 | 0 | 0 | 2 | 3.0 | HWY-017 dropped, EDA-035 dropped |
| `w2b:zipper-a1` | 2 | 0 | 2 | 0 | 0 | 0 | 4.5 | WILD-037 dropped, NAT-022 dropped |
| `w2b:zipper-near2` | 2 | 0 | 2 | 0 | 0 | 0 | 4.5 | WILD-037 dropped, NAT-022 dropped |
| `w3a:spiral+stretch` | 2 | 0 | 0 | 0 | 0 | 2 | 3.0 | HWY-017 dropped, EDA-035 dropped |

- A tie gives a win to each winner. Thus the forms of one strategy with the same routes share a win.
- By the base strategy, the 40 inputs go to `growth` (13), `kdeeb` (11), `cubu` (4), `zipper` (3), `spiral` (2), `corners-side` (2) and 5 others.
- `growth` and `kdeeb` win in each of the 4 classes. Each board of `exact-v1` has 10 nodes, 15 edges and no fixed plug. Thus only the class and the count of collections change.
- The winners do not follow the class. The mean count of collections of the inputs of each winner is 3.0 to 4.5, near the mean of the set. The data shows no feature that tells the winner.
- `kdeeb` (HWY-006) and `cubu` (HWY-007) are dropped ideas. They win 14 of 40 inputs. `growth`, `kdeeb` and `cubu` mix collections on each of the 40 runs.

### The winner of each input of `screen-v1`

| input | nodes | edges | edge shape | fixed plugs | collections | oracle / `shared` | winners |
|---|---:|---:|---|---:|---:|---:|---|
| `screen-v1/small-clustered/s0` | 100 | 200 | `clustered` | 7% | 5 | 1.454 | `w3a:diffusion-wide` |
| `screen-v1/small-clustered/s1` | 100 | 200 | `clustered` | 9% | 5 | 1.753 | `w3b:growth-s0.7` |
| `screen-v1/small-clustered/s2` | 100 | 200 | `clustered` | 10% | 5 | 1.673 | `w3a:diffusion-g2` |
| `screen-v1/dense-groups/s0` | 150 | 300 | `clustered` | 0% | 5 | 1.480 | `w3a:diffusion-l3` |
| `screen-v1/dense-groups/s1` | 150 | 300 | `clustered` | 0% | 5 | 1.537 | `w3a:diffusion-l3` |
| `screen-v1/dense-groups/s2` | 150 | 300 | `clustered` | 0% | 5 | 1.474 | `w3a:diffusion-l3` |
| `screen-v1/hub-chain/s0` | 96 | 119 | `hubChain` | 0% | 0 | 6.338 | `w2b:zipper-corridors` |
| `screen-v1/many-groups/s0` | 128 | 187 | `clustered` | 0% | 0 | 1.679 | `w2c:od-cells-shared` |
| `screen-v1/tiny-uniform/s1` | 10 | 15 | `random` | 0% | 3 | 1.000 | `shared` and 89 other strategies with the same B1 |
| `screen-v1/tiny-uniform/s2` | 10 | 15 | `random` | 0% | 3 | 1.376 | `corners-side`, `corners-side-bend0`, `corners-side-bend4`, `corners-side-most32` |
| `screen-v1/packed-grid/s2` | 96 | 132 | `longRange` | 0% | 0 | 104.358 | `hw:level-links`, `w2b:level-links-corridors`, `w2b:level-links-none` |

| strategy | wins | sole wins | boards | ideas |
|---|---:|---:|---|---|
| `w3a:diffusion-l3` | 3 | 3 | dense-groups | HWY-020 dropped |
| `w2c:od-cells-shared` | 2 | 1 | many-groups, tiny-uniform | WILD-032 dropped, EDA-033 dropped |

- The forms of `diffusion` (HWY-020, dropped) win 5 of the 6 inputs of the clustered boards with 5 collections. `growth` wins the sixth.
- On the chain of hubs, `zipper` wins. On the board with many groups and no collections, `od-cells` wins. On the packed grid with long edges, `level-links` wins.
- Only `small-clustered` has fixed plugs (7% to 10% of the edge ends). Its 3 inputs have 3 different winners. The data has too few inputs to tie the winner to the fixed plugs.
- Each winner of the 4 boards is a dropped idea, except `w3b:growth-s0.7`. On `exact-v1`, `diffusion`, `zipper-corridors` and `level-links` mix collections on 24 to 37 of 40 runs.

## The prediction

The prediction of the item was written before the build.

| Claim | Result | Met |
|---|---|---|
| 1. On `exact-v1`, the oracle has a median gap closed of 0.70 or more, against 0.595 for the best single strategy. | 0.947 (0.797 to 1.009), against 0.595. | Met |
| 2. On `screen-v1`, the guarded oracle B1 is 15% or more above the best single strategy on 3 or more of the 4 boards. | 4 of 4 boards, from 39% to 534%. Against the single strategy with a fall back, 2 of 4. | Met |
| 3. The realistic selector keeps less than half of the oracle gain. | `exact-v1`: -32%. `screen-v1`: 76% against the best single strategy, 26% against the single strategy with a fall back, and 44% as the mean of the splits. | Partly met |
| 4. No default output changes, so there is no release. | The item adds a script, a test and this note. No strategy and no default changes. | Met |

## What this means for a selector

- The upper bound is large on both sets. A selector item ranks above more single ideas, as the item ORACLE expected.
- A selector by class or by board does not keep the bound on `exact-v1`. The winners change between seeds of one class. Thus a selector needs features of the input below the class, or a cheap trial run of a few strategies.
- On `screen-v1`, a choice for each kind of board keeps a part of the gain. But a new kind of board gets no gain, because the selector has no seed of that kind.
- Most winners mix collections. A selector under the rule `collection` keeps a smaller bound: 0.434 against 0.264 on `exact-v1`, and only `hub-chain` and `many-groups` gain on `screen-v1`.
- The item SELECT of the roadmap builds a selector from the features of the input. It needs more seeds of each kind of board than `screen-v1` has.
