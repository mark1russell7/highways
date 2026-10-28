# The portfolio of strategies

This note is the result of the item PORTFOLIO of the [roadmap](../ROADMAP.md). A portfolio starts `shared` and k more strategies on an input. Then it keeps the output with the best guarded B1.

- The score of the portfolio uses only the outputs. Thus the portfolio needs no prediction of the winner.
- The note gives the Pareto curve of the portfolio: the gain for each k, on seeds that the choice of the set did not see. It also gives the time of each set.
- The script [`scripts/portfolio.ts`](../../packages/core/scripts/portfolio.ts) makes the tables from the records of CI. The test `src/bench/screen/portfolio.test.ts` examines its functions.
- The section [The rule of the caller](#the-rule-of-the-caller-portfolio-rule) is the result of the item PORTFOLIO-RULE. The script also makes its tables, with the optima of `exact-v1`.
- The section [The portfolio at each cap](#the-portfolio-at-each-cap-exact-bounds) is the result of the item EXACT-BOUNDS. It gives the greedy sets of each rule and cap.
- The script [`scripts/portfolio-time.ts`](../../packages/core/scripts/portfolio-time.ts) times each strategy. The workflow `Portfolio` starts it in CI.
- The section [The portfolio router](#the-portfolio-router-portfolio-api) is the result of the item PORTFOLIO-API: the opt-in router `portfolio` of the core.

## Summary

- **PORTFOLIO-RULE.** Each reversed pair has another rule or another cap. With the rule of the caller and the one cap 1.5, the whole pool reaches the oracle.
  - At that cap, k = 3 keeps 47% of the oracle gain for `all`, and 12% for `collection`. k = 8 keeps 93% and 73%.
- **The claim does not hold on `exact-v1`.** The oracle of [`ORACLE.md`](ORACLE.md) ranks by B10, and B10 needs the exact optimum. B10 is not a monotone map of B1 on one input. On 29 of 40 inputs, the run with the best B1 does not have the best B10.
- **On `exact-v1`, a portfolio keeps little of the oracle gain.**
  - With the guard `q95`, the portfolio is worse than the best single strategy for each k. `shared` has a B3 q95 of 1 on 31 of 40 inputs, so almost no run passes the guard.
  - With the guard `cap`, k = 3 keeps 6% of the oracle gain, and k = 8 keeps 7%. The whole pool keeps only 37%.
- **On `screen-v1`, the claim holds.** There the oracle ranks by guarded B1, which the portfolio computes. The whole pool reaches the oracle (100%).
  - A greedy set of 2 or 3 keeps 72% of the oracle gain over the best single strategy, on 8 test inputs.
  - But on each board, the set of k = 3 is at most 4.3% above the best single strategy. It gains nothing on `hub-chain` and `many-groups`, because those boards have 1 seed.
- **Time.** Most strategies take 1 to 5 times the time of `shared`. At 40 nodes, the set of k = 3 of `screen-v1` takes 37 ms one after the other, and 11 ms in parallel, on a CI machine.

## The data

| Set | CI run | Records | Commit |
|---|---|---:|---|
| `exact-v1` | [40624133769](https://github.com/mark1russell7/highways/actions/runs/40624133769) | 10480 | `725206f` |
| `screen-v1`, `small-clustered` | [40624136019](https://github.com/mark1russell7/highways/actions/runs/40624136019) | 786 | `725206f` |
| `screen-v1`, `dense-groups` | [40624138382](https://github.com/mark1russell7/highways/actions/runs/40624138382) | 786 | `725206f` |
| `screen-v1`, `hub-chain` | [40624140683](https://github.com/mark1russell7/highways/actions/runs/40624140683) | 262 | `725206f` |
| `screen-v1`, `many-groups` | [40624142811](https://github.com/mark1russell7/highways/actions/runs/40624142811) | 262 | `725206f` |
| `screen-v1`, `tiny-uniform` | [40624145062](https://github.com/mark1russell7/highways/actions/runs/40624145062) | 786 | `725206f` |
| `screen-v1`, `packed-grid` | [40624147552](https://github.com/mark1russell7/highways/actions/runs/40624147552) | 786 | `725206f` |
| the times | [40624849185](https://github.com/mark1russell7/highways/actions/runs/40624849185) | 47160 | branch `portfolio` |
| the report | [40626512090](https://github.com/mark1russell7/highways/actions/runs/40626512090) | | branch `portfolio` |

- The pool is the 262 strategies of the screen module `scripts/screens/meas2.ts` at `725206f`, with the built-in routers. It has the strategies of wave 3E. Wave 3F is not on `main`, so it is not in the pool.
- The records of `ORACLE.md` came from `cc6f8e0`, before wave 3E. Thus this note screens the whole pool again, at one commit.
- Each dropped strategy stays in the pool, for example `w3d:kdeeb-routes`.
- The commands:

```sh
gh workflow run screen.yml --ref <branch> -f step=router -f set=exact-v1 -f module=packages/core/scripts/screens/meas2.ts
gh workflow run screen.yml --ref <branch> -f step=router -f set=screen-v1 -f module=packages/core/scripts/screens/meas2.ts -f families=<family>
gh workflow run screen.yml --ref <branch> -f time="--sizes 10,24,40 --seeds 0,1,2 --repeats 5 --shards 16"
gh workflow run screen.yml --ref <branch> -f report="--exact <id> --screen <id,...> --time <id>"
```

## The method

- **The portfolio.** The portfolio starts `shared` and each strategy of its set. It keeps the output with the best B1 among the outputs that pass the guard. `shared` always passes, so it is the fall back. A tie within `RECORD_EPS` goes to `shared`, then to the order of the set.
- **The guard `q95`.** A run passes when its B3 q95 is at most the B3 q95 of `shared`. Each hard count must also be at most the count of `shared`. This is the guard of `ORACLE.md`, with the hard rules.
- **The guard `cap`.** A run passes when each hard count is at most the count of `shared`. It has no B3 condition.
- **The cap of the stretch.** On `exact-v1`, each guard also needs the largest stretch at or below 1.5, the largest cap of the gap closed. Thus each choice has a gap closed. The stretch is a measure of the output.
- **The greedy set.** On the train inputs, each step adds the strategy that gives the best median of the portfolio, then the best mean. The choice stops when no strategy improves the score. Thus some sets have fewer than k strategies.
- **The splits.**
  - On `exact-v1`, the halves are the seeds 0 to 4 and 5 to 9 of each class. Each input is a test input one time.
  - On `screen-v1`, the first split trains on the seeds 0 and 1 of the 4 boards that decide, and tests on the seed 2. The second split is the reverse. `hub-chain` and `many-groups` have only the seed 0, so they are test inputs only in the second split.
- **The best single strategy.** It has the best median on the train inputs of the split, with a value on each train input. On `screen-v1`, it also passes the guard on each train input. On a test input where it fails the guard, it falls back to `shared`.
- **The oracle.** On `exact-v1`, it is the best B10 of the pool, without a guard, as in `ORACLE.md`. On `screen-v1`, it is the best guarded ratio of the pool.
- **The share of the oracle gain.** The share is `(portfolio - best single) / (oracle - best single)`, from the medians over the test inputs of both splits.
- **The interval.** The interval is the 95% paired bootstrap interval of `ORACLE.md`.
- **The time.** Each strategy routes each board of the classes of `exact-v1` at 10, 24 and 40 nodes, with the seeds 0, 1 and 2. That is 12 boards at each size. One run warms the code, then 5 runs are timed.
  - The time of a set adds the time of `corners` (the base of B3), of `shared` and of each strategy, with the score of each output. The score is B1, B3 q95 and the hard rules.
  - For each board, a strategy takes the median of its 5 runs. One after the other is the sum of the runs. In parallel is the longest run.
  - The table gives the median and the q95 over the 12 boards. The column `× shared` divides by the time of `shared` on the same machine.

## The check of the claim

The claim of the item: guarded B1 uses only the output, and B10 is a linear map of B1 on each input. Thus the best B1 is also the best B10, and a portfolio reaches the oracle.

| check on `exact-v1` | value |
|---|---:|
| pairs of runs on one input with a strict order by B1 and by B10 | 703613 |
| pairs where the order by B10 is the reverse of the order by B1 | 75676 (11%) |
| inputs where the run with the best B1 does not have the best B10 | 29 of 40 |
| inputs where `shared` has a B3 q95 of 1 | 31 of 40 |
| median count of strategies that pass the guard `q95` with more B1 than `shared` | 4 |

- B10 is `(B1 - B1 of the baseline) / (the optimum B1 - B1 of the baseline)`. The baseline and the optimum change with the run:
  - A run that mixes collections gets the rule `all`: the baseline `shared-ways-all` and the optimum without a rule.
  - The cap of the optimum is the smallest cap at or above the largest stretch of the run.
- Thus two runs on one input can have different scales of B10. B10 is a linear map of B1 only for runs with the same rule and the same cap.
- The oracle of `ORACLE.md` ranks by B10. A portfolio cannot compute B10, because B10 needs the optimum. This note ranks by B1, which the portfolio computes, and measures the choice by B10.
- On `screen-v1`, the oracle ranks by the guarded ratio of B1. That score is the score of the portfolio. Thus the claim holds there.

## `exact-v1`: the gap closed (B10)

The best single strategy of both splits is `w3d:kdeeb-routes`. `w3b:growth-s0.3` has no value on 3 inputs, so it is not a candidate.

With the guard `cap`:

| k | test inputs | portfolio median | interval | best single | gain over the single | gain interval | oracle | share of the oracle gain | share of each split |
|---:|---:|---:|---|---:|---:|---|---:|---:|---|
| 1 | 40 | 0.521 | 0.481 to 0.589 | 0.545 | -0.024 | -0.137 to 0.067 | 0.949 | -6% | -34% / 0% |
| 2 | 40 | 0.553 | 0.493 to 0.611 | 0.545 | 0.007 | -0.121 to 0.100 | 0.949 | 2% | -11% / -4% |
| 3 | 40 | 0.569 | 0.511 to 0.628 | 0.545 | 0.024 | -0.102 to 0.125 | 0.949 | 6% | 0% / -4% |
| 5 | 40 | 0.569 | 0.511 to 0.628 | 0.545 | 0.024 | -0.102 to 0.125 | 0.949 | 6% | 0% / -4% |
| 8 | 40 | 0.572 | 0.528 to 0.628 | 0.545 | 0.027 | -0.101 to 0.134 | 0.949 | 7% | 6% / 1% |
| all 261 | 40 | 0.696 | 0.686 to 0.716 | 0.545 | 0.151 | 0.025 to 0.249 | 0.949 | 37% | 30% / 46% |

| k | set of the first split | set of the second split |
|---:|---|---|
| 1 | `w3b:growth-s0.3` | `w3d:kdeeb-routes` |
| 2 | `w3b:growth-s0.3`, `w3e:mlseb-routes` | `w3d:kdeeb-routes`, `w3a:traclus-m2` |
| 3 | `w3b:growth-s0.3`, `w3e:mlseb-routes`, `hw:mlseb` | `w3d:kdeeb-routes`, `w3a:traclus-m2`, `w3e:sbeb-routes` |
| 5 | the set of 3, `w3d:kdeeb-routes`, `w3c:edge-paths-k1.5` | the set of 3, `w3a:traclus+stretch`, `w3c:edge-paths+stretch` |
| 8 | the set of 5, `w3e:mlseb-a0` | the set of 5, `w2c:level-links+stretch`, `w3a:traclus-e4` |

With the guard `q95`:

| k | test inputs | portfolio median | interval | best single | share of the oracle gain | set of the first split | set of the second split |
|---:|---:|---:|---|---:|---:|---|---|
| 1 | 40 | 0.068 | 0.000 to 0.131 | 0.545 | -118% | `corners-side` | `corners-side` |
| 2 | 40 | 0.106 | 0.036 to 0.139 | 0.545 | -109% | `corners-side`, `w2b:zipper-p2` | `corners-side`, `hw:crossbars` |
| 3 | 40 | 0.106 | 0.036 to 0.139 | 0.545 | -109% | the set of 2, `w3c:hough+stretch` | the set of 2, `w2b:zipper-a1` |
| 5 | 40 | 0.106 | 0.036 to 0.139 | 0.545 | -109% | the set of 3, `hw:stubs`, `hw:kdeeb` | the set of 3, `w3d:hierarchy+stretch`, `hw:flow-field` |
| 8 | 40 | 0.106 | 0.036 to 0.139 | 0.545 | -109% | the set of 5 | the set of 5 |
| all 261 | 39 | 0.104 | 0.028 to 0.158 | 0.562 | -118% | all | all |

- With the guard `q95`, the portfolio is far below the best single strategy. `shared` does not stretch the routes at the q95 on 31 of 40 inputs. The strategies that save much ink stretch some routes, so they fail the guard.
- With the guard `cap`, the portfolio keeps the run with the most ink saved. But the run with the most ink saved often mixes collections, and the rule `all` has a larger optimum. Thus a high B1 can give a low B10.
- The whole pool with the guard `cap` closes 0.696 of the gap, against 0.949 for the oracle. The difference is the cost of a score without the optimum.
- The greedy sets differ between the splits. Only `w3d:kdeeb-routes` is in both, from k = 5 in the first split and from k = 1 in the second split.

## `screen-v1`: the guarded B1

The values are ratios to the B1 of `shared`.

| k | test inputs | portfolio / `shared` | best single / `shared` | oracle / `shared` | share of the oracle gain | share of each split | set of the first split | set of the second split |
|---:|---:|---:|---:|---:|---:|---|---|---|
| 1 | 8 | 1.314 | 1.096 | 1.605 | 43% | 49% / 0% | `w2b:zipper-a1` | `w3a:diffusion-g2` |
| 2 | 8 | 1.462 | 1.096 | 1.605 | 72% | 77% / 8% | `w2b:zipper-a1`, `w3a:diffusion-l3` | `w3a:diffusion-g2`, `w3a:diffusion-l3` |
| 3 | 8 | 1.462 | 1.096 | 1.605 | 72% | 77% / 8% | the set of 2, `w2c:od-cells-shared` | the set of 2 |
| 5 | 8 | 1.462 | 1.096 | 1.605 | 72% | 77% / 8% | the set of 3, `w2b:zipper-corridors`, `w3a:diffusion-wide` | the set of 2 |
| 8 | 8 | 1.462 | 1.096 | 1.605 | 72% | 77% / 8% | the set of 5, `w3b:growth-s0.7` | the set of 2 |
| all 261 | 8 | 1.605 | 1.096 | 1.605 | 100% | 100% / 100% | all | all |

The portfolio over the best single strategy on each board, on the test inputs:

| k | `small-clustered` | `dense-groups` | `hub-chain` | `many-groups` | boards at 15% or more |
|---:|---:|---:|---:|---:|---:|
| 1 | 1.000 | 1.000 | 1.000 | 1.000 | 0 of 4 |
| 2 to 8 | 1.009 | 1.043 | 1.000 | 1.000 | 0 of 4 |
| all 261 | 1.454 | 1.043 | 6.338 | 1.679 | 3 of 4 |

The portfolio over `shared` on each board, on the test inputs:

| k | `small-clustered` | `dense-groups` | `hub-chain` | `many-groups` | boards at 15% or more |
|---:|---:|---:|---:|---:|---:|
| 1 | 1.450 | 1.420 | 1.000 | 1.000 | 2 of 4 |
| 2 to 8 | 1.450 | 1.480 | 1.000 | 1.000 | 2 of 4 |
| all 261 | 1.673 | 1.480 | 6.338 | 1.679 | 4 of 4 |

- On `screen-v1`, the whole pool reaches the oracle, as the claim expects. The guarded ratio is the score of the portfolio.
- A small set keeps most of the gain over all test inputs, because 6 of the 8 test inputs are on the clustered boards. There the forms of `diffusion` win, and a set of 2 holds them.
- On each board, the best single strategy of the split is often also a form of `diffusion`. Thus the set of k = 3 is at most 4.3% above it.
- `hub-chain` and `many-groups` are test inputs only when the train inputs are the seed 2 of the clustered boards. Their winners (`w2b:zipper-corridors` and `w2c:od-cells-shared`) are not in that set, so the portfolio falls back to `shared`.
- The sets that `exact-v1` chooses do not carry over. With the guard `cap`, they give 1.000 on the boards that decide. With the guard `q95`, the set of 8 gives 1.304, against 1.069 for `hw:shared-ways`.

## The time

The times are from one CI machine (`ubuntu-latest`). They are not the times of the UI machine. Thus the column `× shared` gives each time relative to `shared` on the same machine.

| size | strategies under 16 ms | strategies under 100 ms | median of the medians | `shared` median | `shared` q95 |
|---:|---:|---:|---:|---:|---:|
| 10 | 262 of 262 | 262 of 262 | 1.99 ms | 0.94 ms | 1.41 ms |
| 24 | 240 of 262 | 262 of 262 | 5.89 ms | 2.65 ms | 4.01 ms |
| 40 | 199 of 262 | 261 of 262 | 10 ms | 4.96 ms | 7.19 ms |

The time of the sets that each corpus chooses on all of its inputs, at 40 nodes:

| corpus | guard | k | set | one after the other: median | q95 | × shared | in parallel: median | q95 | × shared |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|
| `screen-v1` | `q95` | 1 | `w3a:diffusion-g2` | 19 ms | 23 ms | 3.7 | 9.1 ms | 10 ms | 1.7 |
| `screen-v1` | `q95` | 3 | the set of 1, `w2c:od-cells-shared`, `w3a:diffusion-l3` | 37 ms | 42 ms | 7.0 | 11 ms | 13 ms | 2.1 |
| `screen-v1` | `q95` | 8 | the set of 3, `w2b:zipper-corridors`, `w3a:diffusion-wide`, `w3b:growth-s0.7` (6 in all) | 77 ms | 87 ms | 14.7 | 17 ms | 20 ms | 3.3 |
| `exact-v1` | `q95` | 3 | `corners-side`, `hw:zipper`, `hw:crossbars` | 67 ms | 73 ms | 12.7 | 23 ms | 25 ms | 4.5 |
| `exact-v1` | `q95` | 8 | the set of 3 and 5 more | 152 ms | 171 ms | 29.0 | 40 ms | 49 ms | 7.6 |
| `exact-v1` | `cap` | 1 | `w3b:growth-s0.3` | 22 ms | 26 ms | 4.3 | 12 ms | 14 ms | 2.3 |
| `exact-v1` | `cap` | 3 | the set of 1, `w3e:mlseb-parabola`, `w3e:mlseb-routes` | 212 ms | 291 ms | 40.4 | 98 ms | 141 ms | 18.7 |
| `exact-v1` | `cap` | 8 | the set of 3 and 5 more | 435 ms | 583 ms | 83.0 | 104 ms | 143 ms | 19.8 |

The largest k that fits each budget, by the q95 of the time:

| corpus | guard | size | 16 ms, one after the other | 16 ms, in parallel | 100 ms, one after the other | 100 ms, in parallel |
|---|---|---:|---:|---:|---:|---:|
| `screen-v1` | `q95` | 10 | 3 | 8 | 8 | 8 |
| `screen-v1` | `q95` | 24 | 1 | 8 | 8 | 8 |
| `screen-v1` | `q95` | 40 | none | 3 | 8 | 8 |
| `exact-v1` | `q95` | 10 | 2 | 8 | 8 | 8 |
| `exact-v1` | `q95` | 24 | none | 5 | 5 | 8 |
| `exact-v1` | `q95` | 40 | none | none | 3 | 8 |
| `exact-v1` | `cap` | 10 | 1 | 1 | 8 | 8 |
| `exact-v1` | `cap` | 24 | 1 | 1 | 1 | 5 |
| `exact-v1` | `cap` | 40 | none | 1 | 1 | 1 |

- The forms of `mlseb` are the slow strategies of the sets: 83 to 102 ms at 40 nodes, 17 to 21 times `shared`. A set with them does not fit 100 ms at 40 nodes.
- Without `mlseb`, each strategy of the sets takes 1 to 9 times `shared`. The score of an output takes approximately 0.3 ms at 40 nodes.
- In parallel, the time is the time of the slowest strategy. Thus the parallel set of k = 3 of `screen-v1` fits 16 ms at 40 nodes on this machine.
- The full tables, with each set at each size, are in the artifact of the report run.

## The prediction

The prediction of the item was written before the work.

| Claim | Result | Met |
|---|---|---|
| 1. k = 3 keeps 60% to 80% of the oracle gain on the held-out half of `exact-v1`. | 6% with the guard `cap`, and -109% with the guard `q95`. | Not met |
| 2. `w3d:kdeeb-routes` is in the greedy set for k of 3 or more on `exact-v1`. | In the second split for each k, and in the first split from k = 5, with the guard `cap`. It is not in the sets of the guard `q95`, nor in the sets on all inputs. | Partly met |
| 3. k = 8 keeps 85% or more. | 7% with the guard `cap`. The whole pool keeps 37%. | Not met |
| 4. At 40 nodes, the set of k = 3 fits 100 ms but not 16 ms, one after the other. | Met for the sets of `screen-v1` (42 ms q95) and of `exact-v1` with the guard `q95` (73 ms q95). The set of the guard `cap` holds 2 forms of `mlseb` and takes 291 ms. | Partly met |
| 5. On `screen-v1`, k = 3 is 15% or more above the strict single on 3 or more of 4 boards. | 0 of 4. The set is at most 4.3% above the best single strategy of its split. Against `shared`, it is 45% or more above on 2 of 4 boards. | Not met |

## What this means

- On `screen-v1`, the score of the portfolio is the score of the oracle. A portfolio of the whole pool reaches the oracle, but a small greedy set does not carry the winners of the boards with 1 seed.
- On `exact-v1`, no score of the output alone gives the choice of the oracle. B1 without the guard prefers outputs that mix collections, and the guard `q95` refuses almost each run.
- A portfolio can use a better score of the output. One option is the B1 above the baseline of the rule of the run, divided by a bound of the rule that needs no solve. The item SELECT can test it.
- The time is small for most strategies. A portfolio of 3 fast strategies fits 100 ms at 40 nodes, one after the other, on a CI machine.
- The item adds no strategy and changes no default, so it needs no release.

## The rule of the caller (PORTFOLIO-RULE)

This section is the result of the item PORTFOLIO-RULE of the [roadmap](../ROADMAP.md). It uses the records of `exact-v1` of the run [40624133769](https://github.com/mark1russell7/highways/actions/runs/40624133769) again. It adds no strategy.

### The cause of the reversed pairs

For one input, one rule and one cap, B10 is `(B1 - b) / (o - b)`. The baseline `b` and the optimum `o` are constants, and `o` is more than `b`. Thus B10 is a monotone map of B1.

- The rule of a run is `all` when a shared segment mixes collections. Else it is `collection`.
- The cap of a run is the smallest cap at or above its stretch.

| the two runs have | pairs | reversed | share |
|---|---:|---:|---:|
| the same rule and the same cap | 137708 | 0 | 0% |
| the same rule and another cap | 147072 | 11209 | 8% |
| another rule | 418833 | 64467 | 15% |
| all | 703613 | 75676 | 11% |

- No pair with the same rule and the same cap is reversed. The check skips each tie at `RECORD_EPS`, as above.
- Of the pairs with another rule, 156778 have the same cap, and 34538 of them are reversed. 262055 have another cap, and 29929 of them are reversed.

### The rule as a parameter

The rule is a property of the output. Thus a caller can give it as a parameter: "collections can mix" (`all`) or "collections cannot mix" (`collection`).

- With `collection`, the portfolio chooses by B1 only among the runs that do not mix collections. With `all`, each run obeys the rule, because a run that does not mix is also correct.
- The value of a choice is the gap closed of the rule of the caller. The oracle is the best value of that rule over the runs that obey it, without a guard.
- The forms:
  - (input, rule): the value is at the cap of each run, as in the records.
  - (input, rule, cap): the value is at the one cap 1.5 for each run. Each input has a proven optimum at 1.5 for each rule, so this cap applies to all runs. The guard `cap` already refuses each run above 1.5.
  - The old form: the rule and the cap of each run, as in the sections above.
- The guard is `cap`. The splits are the halves of the seeds, as above.
- The best single strategy has the best median on the train inputs. On an input where it fails the guard or the rule, it falls back to `shared`.
- The records do not hold the baseline of `all`. The script finds each baseline from the gap closed `g` of the runs: `b = (B1 - g × o) / (1 - g)`.
  - For `collection`, this gives the B1 of `shared` on each input.
  - At the cap 1.5, the value of the script is the value of the record for each of the 1007 runs at that cap. The largest difference is below 1e-16.

The share of the oracle gain for each k, on the test inputs of both splits:

| form | rule | cap | best single | oracle | oracle gain | k = 1 | k = 2 | k = 3 | k = 5 | k = 8 | all 261 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| the old form | the rule of each run | the cap of each run | 0.545 | 0.949 | 0.404 | -6% | 2% | 6% | 6% | 7% | 37% |
| (input, rule) | `collection` | the cap of each run | 0.106 | 0.600 | 0.494 | 0% | 6% | 7% | 11% | 23% | 81% |
| (input, rule, cap) | `collection` | 1.5 | 0.021 | 0.378 | 0.357 | 0% | 0% | 12% | 32% | 73% | 100% |
| (input, rule) | `all` | the cap of each run | 0.521 | 0.863 | 0.342 | 0% | 9% | 14% | 14% | 15% | 51% |
| (input, rule, cap) | `all` | 1.5 | 0.565 | 0.695 | 0.130 | 0% | 24% | 47% | 56% | 93% | 100% |

- At the one cap, the whole pool reaches the oracle of each rule (100%). There the order by B1 is the order by B10. At the cap of each run, the whole pool keeps 81% for `collection` and 51% for `all`.
- At the cap 1.5, k = 3 keeps 47% for `all` and 12% for `collection`. k = 8 keeps 93% and 73%.
- At the cap of each run, k = 3 keeps 14% for `all` and 7% for `collection`. The cap changes with the stretch of the run. Thus a high B1 with a large stretch can give a low B10.
- The rule `collection` has the larger oracle gain: 0.494 against 0.342 at the cap of each run, and 0.357 against 0.130 at the cap 1.5.
  - Most strong strategies mix collections on some inputs. There the best single strategy falls back to `shared`, so its median is low: 0.106 and 0.021.
  - In `ORACLE.md`, the pool of `collection` holds only the strategies that do not mix on any input. That pool has a smaller gain: 0.434 against 0.264, a gain of 0.170. Here each run that obeys the rule counts.
- With `all` at the cap of each run, the sets and the medians of the portfolio are the same as in the old form. The best single strategy and the oracle are lower:
  - A run that does not mix has the value of `all` in this form, so the oracle is lower.
  - The best single strategy falls back to `shared`, so `w3b:growth-s0.3` is a candidate.
- A check: with `all`, a choice only among the runs that mix (and `shared`) gives the same values for each k.

The sets of each form:

| form | k | set of the first split | set of the second split |
|---|---:|---|---|
| `collection`, the cap of each run | 1 | `corners-side` | `corners-side` |
| | 2 | the set of 1, `hw:keys` | the set of 1, `w3a:mingle+stretch` |
| | 3 | the set of 2, `hw:stubs` | the set of 2, `trunks-tree-bf02` |
| | 5 | the set of 3, `w3a:diffusion-g2`, `w2c:level-links+stretch-b1.1` | the set of 3, `w2b:zipper-near2`, `hw:spiral` |
| | 8 | the set of 5, `trunks-tree-bf08`, `hw:spiral`, `w3e:areas-keys` | the set of 5, `w3c:ridges-wide`, `hw:crossbars`, `trunks-gilbert-a05` |
| `collection`, the cap 1.5 | 1 | `trunks-gilbert-a03` | `corners-side` |
| | 2 | the set of 1, `w3e:areas-keys` | the set of 1, `w3a:mingle+stretch` |
| | 3 | the set of 2, `trunks-tree-bf02` | the set of 2, `trunks-tree-bf02` |
| | 5 | the set of 3, `w2b:zipper-a1`, `w3a:flow-clusters-t0.5` | the set of 3, `w2b:zipper-near2`, `hw:keys` |
| | 8 | the set of 5, `w2c:level-links+stretch`, `w3a:spiral-a35`, `corners-side` | the set of 5, `w3e:areas-keys`, `hw:spiral`, `w2b:stubs-w15` |
| `all`, the cap of each run | 1 | `w3b:growth-s0.3` | `w3d:kdeeb-routes` |
| | 2 | the set of 1, `w3e:mlseb-routes` | the set of 1, `w3a:traclus-m2` |
| | 3 | the set of 2, `hw:mlseb` | the set of 2, `w3e:sbeb-routes` |
| | 5 | the set of 3, `w3d:kdeeb-routes`, `w3c:edge-paths-k1.5` | the set of 3, `w3a:traclus+stretch`, `w3c:edge-paths+stretch` |
| | 8 | the set of 5, `w3e:mlseb-a0` (6 in all) | the set of 5, `w2c:level-links+stretch`, `w3a:traclus-e4` (7 in all) |
| `all`, the cap 1.5 | 1 | `w3b:growth-s0.3` | `w3b:growth-s0.3` |
| | 2 | the set of 1, `w3e:mlseb-a0` | the set of 1, `w3e:mlseb-parabola` |
| | 3 | the set of 2, `w3e:mlseb-routes` | the set of 2, `hw:growth` |
| | 5 | the set of 3, `w3c:edge-paths-k1.5`, `hw:growth` | the set of 3, `w3b:growth-input`, `hw:mlseb` |
| | 8 | the set of 5, `hw:mlseb`, `w3e:mlseb-parabola` (7 in all) | the set of 5, `w3a:traclus-m2`, `w3e:mlseb-routes`, `hw:level-links` |

- In each form, the best single strategy of each split is also the set of k = 1. Thus k = 1 keeps 0%.
- At the cap 1.5, the sets of `all` hold the forms of `growth` and `mlseb` in both splits. The sets of `collection` share only `trunks-tree-bf02` at k = 3.

### The prediction of PORTFOLIO-RULE

The prediction was written before the work.

| Claim | Result | Met |
|---|---|---|
| 1. Each reversed pair has another rule or another cap. No pair with the same rule and cap is reversed, except ties. | 0 of 137708 pairs with the same rule and the same cap are reversed. | Met |
| 2. Per (input, rule, cap), k = 3 keeps 50% or more of the oracle gain of that rule. | 47% for `all` and 12% for `collection`, at the cap 1.5. | Not met |
| 3. Per (input, rule) with the cap of each run, k = 3 keeps less than per (input, rule, cap). | 14% against 47% for `all`, and 7% against 12% for `collection`. | Met |
| 4. The rule `collection` has a smaller oracle gain than `all`. | The gain of `collection` is larger: 0.494 against 0.342, and 0.357 against 0.130 at the cap 1.5. | Not met |

### What the rule means

- With the rule of the caller and one cap, B1 ranks the runs as the oracle ranks them. Thus the whole pool reaches the oracle, and a small set loses only the winners that it does not hold.
- The rule of the caller and one cap give the score that `SELECT` needs. A selector can rank by B1 among the runs that obey the rule.
- At the cap 1.5, a run with a small stretch gets no credit for it. A caller with a smaller stretch limit needs the optimum of that cap.
- The rule `all` keeps 47% to 93% of its gain with a set of 3 to 8. The rule `collection` needs more strategies: k = 8 keeps 73%.
- The item adds no strategy and changes no default, so it needs no release.

## The portfolio at each cap (EXACT-BOUNDS)

This section is the result of the item EXACT-BOUNDS of the [roadmap](../ROADMAP.md). The curve of PORTFOLIO-RULE also runs at each cap: 1.1, 1.25 and 1.5. [`BOUNDS.md`](BOUNDS.md) gives the bounds past 10 nodes.

- The records come from the CI run [40631516113](https://github.com/mark1russell7/highways/actions/runs/40631516113) of the workflow `Screen` on `exact-v1`. The run has 11880 records of 297 strategies, with wave 3F.
- The report comes from the CI run [40633116748](https://github.com/mark1russell7/highways/actions/runs/40633116748) of the workflow `Portfolio`.
- At one cap, the portfolio chooses by B1 only among the runs at or below the cap. Each input has a proven optimum at each cap and each rule.
- The baseline `shared` stays the fallback output at each cap. Its stretch is above 1.1 on 5 of 40 inputs. There it keeps its gap closed.
- An input counts at a cap only when the optimum at the cap is above the baseline of the rule. At the cap 1.1 with the rule `all`, 38 of 40 inputs count.

The share of the oracle gain for each k, on the test inputs of both splits:

| rule | cap | best single | oracle | oracle gain | k = 1 | k = 2 | k = 3 | k = 5 | k = 8 | all 296 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `collection` | 1.1 | 0.106 | 0.431 | 0.325 | 0% | 3% | 8% | 28% | 54% | 100% |
| `collection` | 1.25 | 0.047 | 0.430 | 0.383 | 0% | 3% | 7% | 12% | 26% | 100% |
| `collection` | 1.5 | 0.021 | 0.392 | 0.370 | 0% | 0% | 12% | 27% | 76% | 100% |
| `all` | 1.1 | 0.201 | 0.813 | 0.613 | 0% | 13% | 30% | 87% | 87% | 100% |
| `all` | 1.25 | 0.468 | 0.665 | 0.197 | 0% | 48% | 55% | 70% | 84% | 100% |
| `all` | 1.5 | 0.565 | 0.701 | 0.136 | 0% | 23% | 45% | 46% | 89% | 100% |

- At each cap, the whole pool reaches the oracle of the rule, as at the cap 1.5.
- At the cap 1.5, wave 3F changes the values of PORTFOLIO-RULE a little. The oracle of `collection` goes from 0.378 to 0.392.
- The rule `all` at the cap 1.1 has the largest oracle gain: 0.613. Few strategies stay in the cap, so the best single strategy is low (0.201). A set of 5 keeps 87%.
- The rule `collection` at the cap 1.1 has a smaller oracle gain than at the cap 1.5: 0.325 against 0.370. The optimum at 1.1 is lower, and the best single strategy is higher.

### The greedy sets for PORTFOLIO-API

The greedy choice on all inputs of the cap, for each rule and cap of the caller. Each set also runs `shared`. The item PORTFOLIO-API builds a strategy from these sets.

| rule | cap | inputs | k = 3 | k = 5 adds | k = 8 adds |
|---|---:|---:|---|---|---|
| `collection` | 1.1 | 40 | `corners-side`, `hw:zipper`, `trunks-gilbert-a05` | `w3a:spiral-a15`, `w2c:select+stretch` | `trunks-tree-bf08`, `w3a:diffusion-g2`, `w2b:zipper-near2` |
| `collection` | 1.25 | 40 | `corners-side`, `trunks-tree-bf08`, `w3a:mingle+stretch` | `w3e:crossbars+stretch`, `w3f:p-hub-a0.2` | `trunks-tree-bf06`, `hw:spiral`, `w3f:p-hub-multiple` |
| `collection` | 1.5 | 40 | `trunks-gilbert-a07`, `hw:zipper`, `w3e:areas-keys` | `w3a:mingle+stretch`, `w3f:p-hub-a0.2` | `trunks-tree-bf02`, `w3f:resistance-sparse`, `w2b:zipper-a1` |
| `all` | 1.1 | 38 | `w2b:zipper-p2`, `hw:cubu`, `w3d:kdeeb-routes` | `w3e:sbeb-routes`, `w3c:hough-wide` | `hw:stubs`, `w3a:spiral+stretch`, `hw:mesh` |
| `all` | 1.25 | 40 | `w3e:mlseb+stretch`, `w3d:kdeeb-routes`, `hw:growth` | `w3d:kdeeb-nomask`, `w3f:p-hub-a0.2` | `w3b:growth-s0.7`, `hw:level-links`, `w3b:growth-input` |
| `all` | 1.5 | 40 | `w3b:growth-s0.3`, `w3e:mlseb-parabola`, `w3e:mlseb-routes` | `hw:mlseb`, `hw:growth` | `w3b:growth-input`, `w3e:mlseb-a0`, `w3a:traclus-m2` |

- The sets of the rule `collection` share no strategy between the caps 1.1 and 1.5. `corners-side` is first at 1.1 and 1.25.
- The sets of the rule `all` hold `growth` only from the cap 1.25. At the cap 1.1, the forms of `zipper`, `cubu` and `kdeeb` lead.
- The sets come from all 40 inputs of `exact-v1` (1 board size). The section [The portfolio router](#the-portfolio-router-portfolio-api) replaces them with a set for each size band, with a test on held-out seeds.

## The portfolio router (PORTFOLIO-API)

This section is the result of the item PORTFOLIO-API of the [roadmap](../ROADMAP.md). The core has an opt-in router `portfolio`. It is not in the registry `STRATEGIES`, so no default output changes.

- `routePortfolio(graph, { rule, cap, k, budgetMs, maxMembers })` runs the base `shared`, then the first k members of the set of its rule, cap and size band.
- The rule is `collection` (the default) or `all`. The cap is 1.1, 1.25 or 1.5 (the default). k is 3 (the default), 5 or 8.
- The combinator was a local copy of `portfolio` of `@mark1russell7/layout-contract` 0.2.6. A test compared the copy and the contract on 2 000 seeded cases. Since PORTFOLIO-FIT, the core imports the combinator from the contract.
- The key of the pick:
  - `hard` counts the breaks of the hard rules, plus each edge with a stretch above the cap. Under `collection`, it also counts each shared segment that holds edges of two collections.
  - The one level `B1` is the ink saved (higher is better), with the `minEffect` of the table `MEASURES`.
  - The hash is `resultHash`.
- The result of `routePortfolio` has the trace of the pick and the move count `move.pick`. The strategy `portfolioStrategy` gives only the output.

### The size bands

The router chooses the band from the node count at call time: up to 12 nodes, 13 to 24 nodes, and 25 to 40 nodes. A larger graph uses the band of 25 to 40 nodes.

- The records come from the CI run [40631516113](https://github.com/mark1russell7/highways/actions/runs/40631516113) on `exact-v1` (10 nodes), and from the 12 runs of EXACT-BOUNDS on `exact-v1-bounds` (18, 24 and 40 nodes).
- The script [`scripts/portfolio-sets.ts`](../../packages/core/scripts/portfolio-sets.ts) (`pnpm portfolio:sets`) keeps a short table of the runs in `scripts/data/portfolio-runs.json.gz`. From it, the script writes the sets to `src/portfolio/sets.ts`. The test `sets.test.ts` checks that the file is current.
- The seeds 0 to 4 of each band choose the set. The seeds 5 to 9 test it. Each rule and cap has the same split.
- The value is the gap closed at the cap, with the midpoint of the interval of [`BOUNDS.md`](BOUNDS.md) above 10 nodes.
- The choice uses the guard of the records. A member has no more hard breaks than `shared`. Its stretch is at or below the cap, and it obeys the rule of the caller.
- The column `base wins` counts the test inputs where `shared` wins at k = 5.

The share of the oracle gain on the test seeds (5 to 9). In the larger bands, each cell gives the band set first. Then it gives the set of the band up to 12 nodes (the 10-node set) on the same test inputs:

| band | rule | cap | test | base | best single | oracle | k = 3 | k = 5 | k = 8 | base wins |
|---|---|---:|---:|---:|---:|---:|---|---|---|---:|
| n1-12 | `collection` | 1.1 | 20 | 0.000 | 0.094 | 0.452 | 11% | 23% | 58% | 1 of 20 |
| n13-24 | `collection` | 1.1 | 40 | 0.000 | 0.000 | 0.161 | 0% / 0% | 4% / 0% | 4% / 0% | 20 of 40 |
| n25-40 | `collection` | 1.1 | 20 | 0.000 | 0.000 | 0.000 | - | - | - | 18 of 20 |
| n1-12 | `collection` | 1.25 | 20 | 0.000 | 0.048 | 0.432 | 5% | 5% | 19% | 2 of 20 |
| n13-24 | `collection` | 1.25 | 40 | 0.000 | 0.045 | 0.223 | 25% / -25% | 38% / -25% | 44% / -17% | 7 of 40 |
| n25-40 | `collection` | 1.25 | 20 | 0.000 | 0.030 | 0.100 | 36% / -43% | 43% / -43% | 62% / -43% | 4 of 20 |
| n1-12 | `collection` | 1.5 | 20 | 0.000 | 0.000 | 0.398 | 10% | 47% | 70% | 5 of 20 |
| n13-24 | `collection` | 1.5 | 40 | 0.000 | 0.020 | 0.216 | 41% / -10% | 45% / -10% | 51% / 11% | 3 of 40 |
| n25-40 | `collection` | 1.5 | 16 | 0.000 | 0.045 | 0.110 | 86% / -68% | 94% / -68% | 100% / -68% | 0 of 16 |
| n1-12 | `all` | 1.1 | 19 | 0.000 | 0.199 | 0.798 | 14% | 95% | 95% | 2 of 19 |
| n13-24 | `all` | 1.1 | 40 | -0.563 | -0.369 | 0.063 | 72% / -20% | 89% / -20% | 97% / -2% | 1 of 40 |
| n25-40 | `all` | 1.1 | 20 | -1.256 | -0.997 | -0.659 | 3% / -77% | 83% / -77% | 83% / -77% | 4 of 20 |
| n1-12 | `all` | 1.25 | 20 | -0.023 | 0.391 | 0.653 | 78% | 83% | 89% | 0 of 20 |
| n13-24 | `all` | 1.25 | 40 | -0.318 | 0.205 | 0.336 | 74% / 74% | 74% / 100% | 78% / 100% | 0 of 40 |
| n25-40 | `all` | 1.25 | 19 | -0.615 | -0.057 | 0.074 | 20% / 20% | 43% / 20% | 43% / 20% | 0 of 19 |
| n1-12 | `all` | 1.5 | 20 | -0.019 | 0.526 | 0.686 | 42% | 42% | 97% | 0 of 20 |
| n13-24 | `all` | 1.5 | 40 | -0.242 | 0.343 | 0.443 | 66% / 51% | 100% / 51% | 100% / 59% | 1 of 40 |
| n25-40 | `all` | 1.5 | 13 | -0.472 | 0.196 | 0.241 | 100% / -69% | 100% / -69% | 100% / 86% | 0 of 13 |

The share on the train seeds (0 to 4, in sample):

| rule | cap | n1-12 k = 3, 5, 8 | n13-24 k = 3, 5, 8 | n25-40 k = 3, 5, 8 |
|---|---:|---|---|---|
| `collection` | 1.1 | 25%, 64%, 100% | 35%, 64%, 86% | - |
| `collection` | 1.25 | 47%, 94%, 100% | 44%, 71%, 81% | 52%, 100%, 100% |
| `collection` | 1.5 | 47%, 79%, 100% | 49%, 84%, 95% | 78%, 100%, 100% |
| `all` | 1.1 | 61%, 86%, 100% | 58%, 75%, 100% | 86%, 100%, 100% |
| `all` | 1.25 | 54%, 65%, 100% | 55%, 76%, 100% | 98%, 100%, 100% |
| `all` | 1.5 | 76%, 100%, 100% | 70%, 95%, 100% | 94%, 100%, 100% |

- A set of one band does not carry to another band. At k = 5, the 10-node set is below the best single strategy in 7 of the 12 cells of the larger bands. The band set is above the 10-node set in 10 of the 12 cells.
- The held-out share is lower than the share in sample, most at k = 8. The test has 13 to 40 inputs, so a cell can change by 20 points or more with a new seed.
- Under `collection` at the cap 1.1, the large bands have little gain. At 25 to 40 nodes, the best single strategy and the oracle both have a gap closed of 0. `shared` wins on 18 of 20 test inputs.
- Under `all` at the caps 1.1 and 1.25, the median of the base on large boards is negative: -0.318 to -1.256. At 25 to 40 nodes and the cap 1.1, the oracle is also negative (-0.659). The idea waves of BUILD-W aim there.

### The router in CI

The screen module [`scripts/screens/portfolio-api.ts`](../../packages/core/scripts/screens/portfolio-api.ts) gives one form of the router for each rule, cap and k. The script [`scripts/portfolio-api-report.ts`](../../packages/core/scripts/portfolio-api-report.ts) (`pnpm portfolio:api`) makes the tables from its records.

| Set | CI runs of the workflow `Screen` |
|---|---|
| `exact-v1` | [40649456144](https://github.com/mark1russell7/highways/actions/runs/40649456144) |
| `exact-v1-bounds`, 18 nodes | [40649458704](https://github.com/mark1russell7/highways/actions/runs/40649458704), [40649461187](https://github.com/mark1russell7/highways/actions/runs/40649461187), [40649463378](https://github.com/mark1russell7/highways/actions/runs/40649463378), [40649465760](https://github.com/mark1russell7/highways/actions/runs/40649465760) |
| `exact-v1-bounds`, 24 nodes | [40649468315](https://github.com/mark1russell7/highways/actions/runs/40649468315), [40649470298](https://github.com/mark1russell7/highways/actions/runs/40649470298), [40649472758](https://github.com/mark1russell7/highways/actions/runs/40649472758), [40649475187](https://github.com/mark1russell7/highways/actions/runs/40649475187) |
| `exact-v1-bounds`, 40 nodes | [40649477333](https://github.com/mark1russell7/highways/actions/runs/40649477333), [40649479774](https://github.com/mark1russell7/highways/actions/runs/40649479774), [40649481965](https://github.com/mark1russell7/highways/actions/runs/40649481965), [40649484540](https://github.com/mark1russell7/highways/actions/runs/40649484540) |
| `screen-v1` | [40649453791](https://github.com/mark1russell7/highways/actions/runs/40649453791) |

- **The gap closed.** The 54 cells are each band, rule, cap and k. In each cell, the median gap closed of the router on the test seeds is equal to that of the offline choice. So each share of the table above is also the share of the router.
- **The key against the guard.** The key of the router and the guard of the records do not always choose the same member. Under `collection` at the cap 1.1, the router and the offline choice have a different B1 on some test inputs. At 13 to 24 nodes, 16 to 19 of 40 inputs differ. At 25 to 40 nodes, 9 of 20 differ. There the base `shared` has edges above the cap. The key counts each of them as a hard break, so a member in the cap with less ink wins. In the other cells, 0 to 3 inputs differ.
- **`screen-v1`.** On each of the 14 inputs, the router has no more hard breaks than `shared`. The median B1 of `shared` is 0.081. The router gives 0.082 to 0.126 under `collection`, and 0.158 to 0.400 under `all`. The records of `screen-v1` have no stretch of the model, so the pool gets the guard of the B3 q95 there. That guard is not the key of the router, so the router and the pool do not compare directly.

The median time of the router, one member after the other, on a CI machine. `shared` alone takes 0.8 ms at 10 nodes, 2.2 ms at 18 and 24 nodes, and 4.6 ms at 40 nodes:

| rule | cap | 10 nodes k = 3, 8 | 18 and 24 nodes k = 3, 8 | 40 nodes k = 3, 8 |
|---|---:|---|---|---|
| `collection` | 1.1 | 15 ms, 27 ms | 32 ms, 57 ms | 76 ms, 74 ms |
| `collection` | 1.25 | 11 ms, 25 ms | 21 ms, 48 ms | 53 ms, 108 ms |
| `collection` | 1.5 | 10 ms, 24 ms | 25 ms, 39 ms | 51 ms, 89 ms |
| `all` | 1.1 | 19 ms, 32 ms | 32 ms, 74 ms | 69 ms, 142 ms |
| `all` | 1.25 | 25 ms, 39 ms | 74 ms, 94 ms | 176 ms, 204 ms |
| `all` | 1.5 | 29 ms, 59 ms | 56 ms, 160 ms | 62 ms, 84 ms |

- At 40 nodes and k = 3, the router takes 51 to 176 ms. The members take most of it: the records of EXACT-BOUNDS give 33 to 164 ms for `shared` and the same 3 members. The key adds approximately 10 to 20 ms.
- The set of `all` at the cap 1.25 holds `w3d:kdeeb-routes` and `w3e:mlseb+stretch`. They are the slowest members.
- On `screen-v1`, the boards of 96 to 150 nodes take 0.4 to 1.8 s (median), against 20 ms for `shared`. The sets come from boards of 40 nodes or fewer. Above 40 nodes, set `budgetMs` to keep the time in a limit.
- The workflow `Bench` races the router with its defaults in the part `opt-in`. In the run [40651207340](https://github.com/mark1russell7/highways/actions/runs/40651207340), the router took 1.1 s at 100 nodes, 32 s at 400 nodes and 546 s at 1 000 nodes. So the part stops at 400 nodes. Since PORTFOLIO-FIT, the default is the fit. The section [The fit of the router](#the-fit-of-the-router-portfolio-fit) has its new times.

### The predictions of PORTFOLIO-API

| Prediction | Confidence | Result |
|---|---|---|
| 1. The local copy and the contract give the same pick on each case. | high | Met: 2 000 cases of `portfolio`, 500 of `selectBest`, and `pickMoves`. |
| 4. At 40 nodes, k = 3 and no budget, the router takes less than 50 ms in CI. | medium | Not met: 51 to 176 ms (median). |
| 5. No default output changes, so the version step is PATCH. | high | Met: the digest tests of `sections`, the bundlers and the site boards pass. The router is not in `STRATEGIES`. |
| 6. At 13 to 24 and 25 to 40 nodes, the band set at k = 5 beats the 10-node set in each rule and cap, by 10 points or more in at least half of the 12 cells. | medium | Not met: it beats the 10-node set in 10 of 12 cells, and by 10 points or more in 9. It loses under `all` at 1.25 and 13 to 24 nodes (74% against 100%). At 25 to 40 nodes under `collection` at 1.1, no set has a gain. |
| 7. Under `collection`, the band set at k = 5 keeps 20% or more at 13 to 24 nodes at each cap. | low | Not met: 4% at 1.1, 38% at 1.25 and 45% at 1.5. |
| 8. At 25 to 40 nodes under `all` at the caps 1.1 and 1.25, the base wins on half of the test inputs or more. | medium | Not met: 4 of 20 and 0 of 19. The base wins most under `collection` at 1.1: 18 of 20. |

## The fit of the router (PORTFOLIO-FIT)

This section is the result of the item PORTFOLIO-FIT of the [roadmap](../ROADMAP.md). It has three parts: one key, the import of the contract and a deterministic default.

### The decision: the core imports the contract

The core imports the shared functions from `@mark1russell7/layout-contract` (0.2.7 or later):

- `portfolio`, `selectBest` and `pickMoves`
- `compareMeasure`, `minEffectOf` and `RECORD_EPS`
- `outputHash`, `outputGroups`, `exercised`, `canonicalJson` and `sha256Hex`.

The reasons:

- Two copies of the pick can disagree. PORTFOLIO-API found such a difference between the key of the router and the guard of the records.
- The contract has no dependencies, so the import adds only the contract.
- The parity tests of the copies are not necessary, so the core loses them.

The published package `@mark1russell7/highways` has one run-time dependency since PORTFOLIO-FIT. The core keeps only the functions that the contract does not have:

- `documentHash`, because the function of the contract rounds to a grid, and the hash of a document keeps the exact numbers
- `utf8`, because the contract does not export it
- the seeds, the random generator and `round3`.

A minified bundle of the core (`esbuild`, `src/index.ts`) has 435 086 bytes with the contract and 427 057 bytes without it. So the contract adds 8 029 bytes, approximately 7.8 KB. The CI run [40661133199](https://github.com/mark1russell7/highways/actions/runs/40661133199) of the workflow `Portfolio` measured it.

### One key

PORTFOLIO-API found that the key of the router and the guard of the records did not always choose the same member. The key counted each edge of the base above the cap as a hard break. The offline scan was not `selectBest`. Since PORTFOLIO-FIT, the two sides use the same guard and the same function:

- A member passes when it has no more breaks of each hard rule than the base, and no edge with a stretch above the cap. Under the rule `collection`, it also has no mixed segment.
- The base `shared` is the fallback, so it always passes. The cap does not apply to it.
- `selectBest` of the contract ranks the outputs that pass by B1, with the `minEffect` of B1.

`guardBreaks` and `portfolioKey` of `src/portfolio/key.ts` hold the guard. The offline choice `choose` of `scripts/portfolio.ts` uses the same `selectBest`. The test `pick.test.ts` routes the boards of `exact-v1` and a part of `exact-v1-bounds`, and it compares the two picks.

The workflow `Portfolio` compares the winner of each record with the offline choice of the same members. On 3 740 records of the forms without a budget, 0 winners differ. Under `collection` at the cap 1.1, the share of the gap closed does not change. The median B1 of the router goes up. At 13 to 24 nodes and k = 5, it goes from 0.045 to 0.074. At 25 to 40 nodes, it goes from 0.088 to 0.101.

### The deterministic default

The default of the router is deterministic. [The promotion rule](../PROMOTION.md#deterministic-defaults) gives this rule for each project. Without `k`, the router runs the fit of `src/portfolio/fit.ts`. The fit holds a list of members for each rule, cap and band, and a node limit for each member.

The script `portfolio-sets.ts` makes the fit from the times of CI:

- The run [40658558076](https://github.com/mark1russell7/highways/actions/runs/40658558076) timed each member and the key on 10 to 150 nodes (`portfolio:time --members`). `scripts/data/portfolio-times.json` keeps the medians.
- A member leaves the pool of a band when it alone takes more than 50 ms in that band. The sets come from this pool, so 2 sets changed.
- The fit is the longest start of the set whose model time is at or below 40 ms. The model time is the time of `shared`, plus the setup of the key, plus each member.
- A member leaves the fit at the first size where it does not fit. Its node limit is the last size where it fits.

The setup of the key is the stretch network of the graph and the facts of the base. It takes 22 ms at 40 nodes, 65 ms at 64 nodes and 190 ms at 100 nodes. So above 40 nodes, the fit is `shared` alone. At 40 nodes, the fit is `shared` alone in 4 of 6 cells, because the node limits stop at 32 nodes.

The share of the oracle gain on the test seeds, at k = 5, at k = 5 with a budget, and at the fit (CI run [40661449005](https://github.com/mark1russell7/highways/actions/runs/40661449005)):

| rule | cap | band | test | k = 5 | 16 ms | 50 ms | 100 ms | fit |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| `collection` | 1.1 | n1-12 | 20 | 23% | 23% | 23% | 23% | 58% |
| `collection` | 1.1 | n13-24 | 40 | 4% | 0% | 4% | 4% | 0% |
| `collection` | 1.1 | n25-40 | 20 | - | - | - | - | - |
| `collection` | 1.25 | n1-12 | 20 | 5% | 5% | 5% | 5% | 19% |
| `collection` | 1.25 | n13-24 | 40 | 38% | 3% | 38% | 38% | 38% |
| `collection` | 1.25 | n25-40 | 20 | 43% | 0% | 36% | 43% | -43% |
| `collection` | 1.5 | n1-12 | 20 | 47% | 47% | 47% | 47% | 70% |
| `collection` | 1.5 | n13-24 | 40 | 45% | 31% | 45% | 45% | 45% |
| `collection` | 1.5 | n25-40 | 16 | 94% | 0% | 86% | 94% | 0% |
| `all` | 1.1 | n1-12 | 19 | 95% | 14% | 95% | 95% | 95% |
| `all` | 1.1 | n13-24 | 40 | 89% | 35% | 89% | 89% | 72% |
| `all` | 1.1 | n25-40 | 20 | 83% | 0% | 3% | 83% | -77% |
| `all` | 1.25 | n1-12 | 20 | 83% | 70% | 83% | 83% | 89% |
| `all` | 1.25 | n13-24 | 40 | 74% | 0% | 74% | 74% | 0% |
| `all` | 1.25 | n25-40 | 19 | 43% | 0% | 0% | 43% | -427% |
| `all` | 1.5 | n1-12 | 20 | 42% | 42% | 42% | 42% | 42% |
| `all` | 1.5 | n13-24 | 40 | 97% | 31% | 70% | 91% | 61% |
| `all` | 1.5 | n25-40 | 13 | 100% | 0% | 86% | 100% | 0% |

- At 1 to 12 nodes, the fit runs 4 to 8 members. It keeps as much as k = 5, or more.
- At 25 to 40 nodes, the test boards have 40 nodes. There the fit is often `shared` alone, and its share is 0% or less. A negative share tells that the best single strategy beats `shared`.
- The budget of 16 ms cuts most members at 13 nodes and more. With the budget of 50 ms, the share falls by 15 points or less in 8 of 11 cells at 13 to 40 nodes.

The time of the router in CI, one member after the other. Each cell gives the range of the medians over the 6 rules and caps, then the range of the q95, in ms:

| set | `shared` | fit | k = 5 | k = 5, 50 ms |
|---|---|---|---|---|
| 1 to 12 nodes | 0.8 | 24 to 37, q95 28 to 45 | 16 to 31, q95 19 to 43 | 16 to 30, q95 19 to 41 |
| 13 to 24 nodes | 2.6 | 23 to 46, q95 33 to 79 | 31 to 107, q95 49 to 222 | 31 to 68, q95 48 to 126 |
| 40 nodes | 5.0 | 6 to 41, q95 8 to 51 | 80 to 123, q95 100 to 178 | 55 to 69, q95 63 to 92 |
| `screen-v1` | 8.9 | 16 to 17, q95 28 to 30 | 214 to 376, q95 831 to 1 653 | 142 to 239, q95 655 to 1 374 |

- The fit has a median of 50 ms or less in each band up to 40 nodes.
- A budget is not a hard limit. The router examines the budget between two members, so one slow member goes past it. On `screen-v1`, the budget of 50 ms gives a median of 142 to 239 ms.
- On `screen-v1`, the fit keeps 14% to 94% of the oracle gain, against 14% to 146% at k = 5. Most of its gain comes from the boards of 10 nodes.
- In the part `opt-in` of the workflow `Bench` (run [40660432890](https://github.com/mark1russell7/highways/actions/runs/40660432890)), the fit took 47 ms at 10 nodes, 37 ms at 100 nodes and 148 ms at 400 nodes.

### The predictions of PORTFOLIO-FIT

| Prediction | Confidence | Result |
|---|---|---|
| 1. With one key, 0 winners differ from the offline choice. | high | Met: 0 of 3 740 records. |
| 2. With one key, the share under `collection` at 1.1 changes by 10 points or more in at least one band. | medium | Not met: the shares do not change. The median B1 of the router goes up. |
| 3. The contract adds less than 4 KB to a minified bundle. | medium | Not met: 8 029 bytes. |
| 4. At 50 ms and k = 5, the share falls by less than 15 points in most cells at 13 to 40 nodes, but to near 0 on `screen-v1`. | medium | Partly met: it falls by 15 points or less in 8 of 11 cells. On `screen-v1`, it falls by 0 to 20 points, because the budget cuts only after a slow member. |
| 5. A deterministic default with a median of 50 ms or less exists in each band up to 40 nodes. Above 40 nodes, it is the base alone or the base and one member. | medium | Met: the medians are 6 to 46 ms. Above 40 nodes, the fit is `shared` alone. |


## The speed of the router (PORTFOLIO-SPEED)

This section is the result of the item PORTFOLIO-SPEED of the [roadmap](../ROADMAP.md). It makes the setup of the key cheaper, and it adds two size bands above 40 nodes.

### The profile

The script `portfolio:time --breakdown` times each part of the setup of the key, and the router in each form. It uses the 4 classes of `exact-v1`, the seeds 0 to 2 and 5 repeats. Each cell is a median in ms, before and after the change (CI runs [40664327269](https://github.com/mark1russell7/highways/actions/runs/40664327269) and [40664691452](https://github.com/mark1russell7/highways/actions/runs/40664691452)):

| nodes | `shared` | network | distances | setup | key and pick in k = 3 | share of the setup |
|---:|---:|---:|---:|---:|---:|---:|
| 40 | 7.0 | 10.5 | 12.8 to 1.3 | 23.7 to 12.9 | 26.9 to 15.5 | 39% to 26% |
| 64 | 8.9 | 12.5 | 39.1 to 1.8 | 52.0 to 16.9 | 57.1 to 23.1 | 48% to 22% |
| 100 | 14.9 | 20.7 | 150.5 to 2.8 | 171.8 to 24.7 | 174.8 to 39.5 | 62% to 18% |
| 400 | 103.6 | 83.1 | 7 095 to 27.5 | 7 182 to 125.9 | 7 391 to 202.3 | 88% to 13% |

- The setup is the network of the stretch, the shortest distances and the facts of the base. The share of the setup is the setup over the time of `collection` at 1.5 with k = 3.
- The router made the setup once for each input before this item. `portfolioKey` makes the facts once for each call, and the members do not use the stretch.
- The distances were the cost. The old search was a full Dijkstra with a linear scan, from each end of each edge.
- The new search is A* with a binary heap. The straight distance to the nearest open target guides it. One search serves all the pairs of one terminal, and it stops when each target is settled.
- An update from the base routes does not apply. The shortest distance of a pair does not change with the routes.
- After the change, the network is the largest part of the setup. It is the graph of the corners of the boxes, with the links of each end point.

The router with k = 3 takes 7% to 17% less time at 40 nodes and 15% to 24% less at 64 nodes. It takes 39% to 54% less at 100 nodes and 86% to 91% less at 400 nodes. A fit with a member takes 26% to 31% less time at 40 nodes.

### The check of the values

The script `portfolio:time --check-stretch` routes each input of 3 sets with each strategy of the pool. It compares the stretch of each edge of the new function and of the old function (CI run [40664694253](https://github.com/mark1russell7/highways/actions/runs/40664694253)):

| set | records | edges | missing | largest difference | edges above 0.001 | records with another `gap.stretch` |
|---|---:|---:|---:|---:|---:|---:|
| `exact-v1` | 11 880 | 178 200 | 0 | 4.44e-16 | 0 | 0 |
| `exact-v1-bounds` | 35 640 | 1 461 240 | 0 | 8.88e-16 | 0 | 0 |
| `screen-v1` | 4 158 | 549 747 | 0 | 8.88e-16 | 0 | 0 |

- The values are the same, to the rounding of floating point. The records and their digests do not change.
- The test `stretches.test.ts` compares the two functions on the boards of `exact-v1` at 10, 24 and 40 nodes.
- `exactStretch` and `exactStretches` are exports of the core. The signature of `exactStretches` stays `(graph, options?) => (routes) => Map<string, number>`.

### The bands above 40 nodes

The script `portfolio:time --guard-records` routes the 4 classes of `exact-v1` at 64 and 100 nodes, with the seeds 0 to 9 and the 75 members (CI run [40665016754](https://github.com/mark1russell7/highways/actions/runs/40665016754)). Each line has the values of the guard: B1, the stretch, the flag of mixed collections and the hard breaks.

- These boards have no optima. So the value of a run is its B1 under the guard, and the oracle is the best member of the pool.
- `portfolio-sets.ts --large` adds these records to the short table, as the set `exact-large`.
- The bands are `n1-12`, `n13-24`, `n25-40`, `n41-64` and `n65-128`. An input above 128 nodes uses `n65-128`.
- Under the cap 1.1 and the rule `collection`, no member gives more B1 than the base. So these 2 sets are empty.

The fit uses the times of the members of the run 40658558076, and the times of the setup of the run [40665256727](https://github.com/mark1russell7/highways/actions/runs/40665256727) (`portfolio-sets.ts --setup-time`). The members did not change. At 40 nodes, the median ratio of the times of the members of the two runs is 1.00. One member can change by a factor of up to 1.8.

The fit of the large bands, on the test seeds 5 to 9 (20 boards in each band):

| band | rule | cap | base | best single | oracle | fit | share at the fit |
|---|---|---:|---:|---:|---:|---|---:|
| n41-64 | `collection` | 1.5 | 0.174 | 0.186 | 0.217 | `shared-flow-a06-p3` (64) | 0% |
| n41-64 | `all` | 1.5 | 0.174 | 0.420 | 0.431 | `hw:growth` (64) | 0% |

- A share of 0% tells that the fit gets the B1 of the best single strategy. Over the base, the fit keeps 28% and 96% of the oracle gain.
- In the other 4 cells at 64 nodes and in all 6 cells at 100 nodes, the fit is `shared` alone. There, the set is empty, or the model time of `shared`, the setup and the first member is above 40 ms.
- At 25 to 40 nodes, the cheaper setup lets more members run at 40 nodes. 10 node limits go from 32 to 40.
- The shares at the fit at 1 to 40 nodes do not change by more than 6 points. The script tests each fit without its node limits.

The time of the router with the new fit, on the seeds 0 to 4 with 5 repeats (CI run [40666269015](https://github.com/mark1russell7/highways/actions/runs/40666269015)). Each cell gives the range of the medians over the 6 rules and caps, then the range of the q95, in ms:

| nodes | `shared` | setup | fit | k = 3 |
|---:|---:|---:|---|---|
| 12 | 2.6 | 4.9 | 26 to 58, q95 39 to 99 | 15 to 44, q95 22 to 72 |
| 24 | 3.3 | 5.3 | 24 to 41, q95 30 to 56 | 24 to 99, q95 31 to 133 |
| 40 | 5.0 | 8.5 | 38 to 58, q95 46 to 75 | 43 to 75, q95 53 to 98 |
| 64 | 8.1 | 14.8 | 10 to 46, q95 14 to 59 | 71 to 159, q95 105 to 234 |
| 100 | 14.7 | 23.0 | 17 to 18, q95 28 | 70 to 150, q95 106 to 228 |
| 128 | 20.5 | 30.0 | 24 to 25, q95 32 to 36 | 99 to 210, q95 122 to 269 |
| 400 | 100.0 | 116.5 | 112 to 116, q95 187 to 189 | 436 to 934, q95 674 to 1 616 |

- At 64 nodes, the 2 fits with a member take 39 and 46 ms (median).
- At 12 nodes, the fit has a median above 50 ms in 2 of 6 cells. At 40 nodes, it has a median above 50 ms in 1 of 6 cells.
- In the router, the members take approximately 1.4 times their time alone. The model of the fit does not count the key of each member.
- The share of the setup at 400 nodes is 15%. The members and the base are the cost.

### A cooperative budget

This part is a design. The contract does not change in this item.

- A member gets a second argument: `run(input, context)`. The context has `deadlineMs`, the time at which the member stops, and `signal`, an `AbortSignal`.
- A member that stops early gives its best output so far, with `partial: true`. A member with no output so far gives the output of its first pass.
- The router gives each member the time that remains of `budgetMs`. A member with no support for the context runs to its end, as today.
- `deterministic` is `false` when the router cuts a member or skips one. It stays `true` when no cut occurs.
- `pickMoves` does not change. A partial output passes the same guard, and `selectBest` ranks it with the others.
- The iterative members can stop early. They are `hw:growth`, `hw:diffusion`, the families `mlseb` and `kdeeb`, and `shared-p2` and `shared-p3`.
- A member with one pass, as `corners-side`, cannot stop early. The router keeps the check before each member for these.

### The predictions of PORTFOLIO-SPEED

| Prediction | Result |
|---|---|
| 1. A shared setup cuts the time of the router at 40 nodes by 30% or more. | Not met: the setup was shared before this item. The cheaper stretch cuts k = 3 by 7% to 17%, and a fit with a member by 26% to 31%. |
| 2. One search for each terminal brings the setup at 100 nodes to 30 ms or less. | Met: 24.7 ms, from 171.8 ms. |
| 3. The default runs a member other than `shared` at 64 and 100 nodes, with a median of 50 ms or less. | Partly met: at 64 nodes in 2 of 6 cells, at 39 and 46 ms. At 100 nodes, the fit is `shared` alone. |
| 4. The share of the setup at 400 nodes stays above 50%. | Not met: 13% to 15%. |
| 5. A cooperative budget keeps the q95 within 1.5 times `budgetMs`. | Not tested: this item gives only the design. |

## The cost of each member (FIT-COST)

This section is the result of the item FIT-COST of the [roadmap](../ROADMAP.md). The model of the fit counts the key on the output of each member.

### The cost in the router

The script `portfolio:time --member-cost` times each member alone and in the router, on the same board. It uses the 4 classes of `exact-v1`, 9 sizes from 10 to 128 nodes, the seeds 0 to 2 and 5 repeats (CI run [40670255629](https://github.com/mark1russell7/highways/actions/runs/40670255629)). The router runs each rule and cap with k = 8. In the router, the cost of a member is its run and the key on its output. Each cell is a median in ms. A ratio gives the median over the rows, then the q10 and the q90:

| band | rows | run alone | key alone | hash | in the router | router / run alone | router / (run + key) alone |
|---|---:|---:|---:|---:|---:|---|---|
| n1-12 | 78 | 3.9 | 0.4 | 0.3 | 3.9 | 1.06 (0.92 to 1.21) | 0.97 (0.82 to 1.02) |
| n13-24 | 68 | 4.9 | 0.6 | 0.5 | 5.7 | 1.12 (1.03 to 1.24) | 0.99 (0.94 to 1.02) |
| n25-40 | 68 | 9.0 | 1.0 | 0.7 | 10.4 | 1.13 (1.06 to 1.23) | 1.01 (0.98 to 1.04) |
| n41-64 | 21 | 18.0 | 2.1 | 1.5 | 21.0 | 1.17 (1.08 to 1.23) | 1.01 (1.00 to 1.04) |
| n65-128 | 26 | 32.3 | 4.5 | 3.1 | 38.5 | 1.16 (1.10 to 1.25) | 1.03 (1.01 to 1.05) |

- The key is the guard, the levels and the hash of the output. The hash is approximately 70% of the key.
- In the router, a member takes 1.06 to 1.17 times its run alone. The ratio grows with the band, so one fixed factor does not fit each band.
- With the measured key, the ratio is 0.97 to 1.03 in each band. So the fit uses the measured key of each member at each size.
- The model of the whole pick, from the medians alone, gives 0.93 to 1.01 of the measured pick. Without the key, the model is 9% to 13% low above 12 nodes.
- The old model counted the guard and the levels of each member, but not the hash.

### The fit

- `portfolio-times.json` keeps the run alone and the key of each member apart, with the schema `portfolio-times/2`.
- A member stays in the pool of a band when its run and its key take 50 ms or less. The fit admits members while the model time is at or below `FIT_TARGET_MS`.
- The model time is the time of `shared`, plus the setup of the key, plus the run and the key of each member.
- The times come from one run on one CI machine: [40670252502](https://github.com/mark1russell7/highways/actions/runs/40670252502) (`portfolio:time --members`). Before this item, the times came from two runs.

The router check runs the fit on the test seeds 5 to 9, at 8 sizes from 10 to 128 nodes, with 5 repeats. The highest median of the 48 cells, for each target, in ms:

| `FIT_TARGET_MS` | first run | second run |
|---:|---:|---:|
| 50 | 54.4 ([40674619751](https://github.com/mark1russell7/highways/actions/runs/40674619751)) | - |
| 45 | 48.2 ([40675156189](https://github.com/mark1russell7/highways/actions/runs/40675156189)) | 53.2 ([40675173532](https://github.com/mark1russell7/highways/actions/runs/40675173532)) |
| 42 | 47.6 ([40675819975](https://github.com/mark1russell7/highways/actions/runs/40675819975)) | 39.1 ([40675823757](https://github.com/mark1russell7/highways/actions/runs/40675823757)) |
| 40 | 47.3 ([40675813099](https://github.com/mark1russell7/highways/actions/runs/40675813099)) | 45.2 ([40675816377](https://github.com/mark1russell7/highways/actions/runs/40675816377)) |

- Two runs of the same fit differ by up to 30% in one cell. Each run gets other CI machines.
- A second run of the times ([40670281850](https://github.com/mark1russell7/highways/actions/runs/40670281850)) changes the fit at 50 ms in 2 cells, at 13 to 24 nodes.
- So `FIT_TARGET_MS` is 42 ms. The fit at 40 ms has the same times, and it keeps less of the gain.

The pool changes 5 sets:

- `collection` 1.25, 65 to 128 nodes: `hw:lanes` replaces `hw:crossbars`.
- `all` 1.25, 13 to 24 nodes: `w3e:mlseb+stretch` leaves the pool. The greedy choice then takes `w3d:kdeeb-nomask`, `w3b:growth-input` and `w3d:cubu+stretch` in place of `w3a:diffusion-l3` and `hw:cubu`.
- `all` 1.25, 41 to 64 nodes, and `all` 1.25, 65 to 128 nodes: the order and the members change.
- `all` 1.5, 13 to 24 nodes: `w3e:mlseb+stretch` leaves the pool.

The fit changes in 15 of 30 cells. In 12 cells, a node limit goes down or a member leaves. In 1 cell, a member comes in. In the other 2 cells, the set changes.

The time of the router with the new fit, from the run 40675819975. Each cell gives the median, then the q95, in ms:

| rule | cap | 10 | 12 | 18 | 24 | 40 | 64 | 100 | 128 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `collection` | 1.1 | 40, 91 | 40, 54 | 42, 51 | 42, 52 | 31, 38 | 10, 15 | 18, 30 | 25, 36 |
| `collection` | 1.25 | 34, 49 | 38, 50 | 42, 54 | 41, 52 | 39, 49 | 10, 14 | 18, 29 | 25, 36 |
| `collection` | 1.5 | 33, 54 | 37, 46 | 37, 46 | 40, 53 | 36, 45 | 40, 55 | 18, 28 | 24, 38 |
| `all` | 1.1 | 48, 79 | 39, 59 | 47, 64 | 37, 50 | 39, 48 | 10, 14 | 18, 29 | 25, 35 |
| `all` | 1.25 | 39, 57 | 33, 48 | 45, 61 | 30, 44 | 6, 8 | 10, 14 | 18, 29 | 24, 36 |
| `all` | 1.5 | 37, 64 | 23, 34 | 19, 24 | 24, 30 | 42, 49 | 10, 14 | 17, 28 | 24, 36 |

- The median is 48 ms or less in each of the 48 cells, in the two runs.
- The q95 is above 80 ms in 1 cell: `collection` 1.1 at 10 nodes, with 91 and 85 ms. 10 nodes is the first size that each shard times.

The share of the oracle gain at the fit, on the test seeds 5 to 9, before and after this item (`portfolio:sets`, CI run [40675696325](https://github.com/mark1russell7/highways/actions/runs/40675696325)). A share of 0% tells that the fit gets the B1 of the best single strategy:

| rule | cap | n1-12 | n13-24 | n25-40 | n41-64 | n65-128 |
|---|---:|---|---|---|---|---|
| `collection` | 1.1 | 58% | 4% | - | - | - |
| `collection` | 1.25 | 19% | 44% to 38% | 36% | -88% | - |
| `collection` | 1.5 | 70% | 51% | 86% | 0% | -1565% |
| `all` | 1.1 | 95% | 89% to 83% | 3% | 0% | -9% |
| `all` | 1.25 | 89% to 83% | 74% to 31% | 0% to -427% | -2376% | - |
| `all` | 1.5 | 42% | 61% | 100% to 86% | 0% to -2349% | -1072% |

- 23 of 30 shares do not change. No share goes up.
- `all` 1.25 at 13 to 24 nodes loses 43 points. The new set causes most of the loss: with the target 50 ms, the share is 34%.
- `all` 1.25 at 40 nodes loses `w3d:kdeeb-routes`. The fit there is `shared` alone, so it loses the gain of the best single strategy.
- `all` 1.5 at 41 to 64 nodes loses `hw:growth`, the best single strategy of the band. With the target 50 ms, the fit keeps it, at a median of 47 ms.

### The predictions of FIT-COST

| Prediction | Result |
|---|---|
| 1. The cost ratio of a member in the router is 1.2 to 1.6 in each band. | Not met: 1.06 to 1.17 over the run alone, and 0.97 to 1.03 over the run and the key alone. |
| 2. The 3 cells above 50 ms each lose one member, and the share falls by 10 points or less. | Not met: at 12 nodes, `all` 1.1 loses 3 members and `all` 1.25 loses 4. The shares fall by 0 and 6 points. At 40 nodes, `all` 1.25 loses its one member, and the fit is `shared` alone. |
| 3. A fit from one clean run changes 1 set or more up to 40 nodes. | Met: 2 sets at 13 to 24 nodes, and the fit in 14 of 18 cells up to 40 nodes. |
| 4. The router has a median of 50 ms or less and a q95 of 80 ms or less in each cell. | Partly met: the median is 48 ms or less in each of the 48 cells. The q95 is 91 ms in 1 cell. |

## The hash of the router (HASH-LAZY)

This section is the result of the item HASH-LAZY of the [roadmap](../ROADMAP.md). The router hashes only the outputs of a pick that moves.

### The option `hashes`

- layout-contract 0.2.8 gives `portfolio()` the option `hashes`. `routePortfolio` passes it on.
- With `pick` (the default), the router computes the guard and the levels of each member, without a hash.
- After the pick, the router hashes the base and the winner, but only when the winner is not the base. Then `picked` compares the two hashes.
- With `all`, each member that ran gets a hash, as before this item.
- The test `hashes.test.ts` runs the board of `router.test.ts` and the test seeds 5 to 9 of each band. The output, the winner, `winnerIndex`, `kept` and `picked` are equal under `pick` and `all`.
- Under `pick`, at most 2 members of a trace have an `outputHash`.
- The bench and the records do not read `outputHash`. They hash the outputs themselves, so they use the default.

### The cost in the router

The script `portfolio:time --member-cost` times each member alone and in the router, as in FIT-COST (CI run [40681245872](https://github.com/mark1russell7/highways/actions/runs/40681245872)). After this item, the key has no hash. The column `hash` gives the hash of the output alone. The rows do not use the last member of each pick, because the time after it holds the pick and the two hashes. Each cell is a median in ms:

| band | rows | run alone | key alone | hash | in the router | router / run alone | router / (run + key) alone |
|---|---:|---:|---:|---:|---:|---|---|
| n1-12 | 72 | 3.1 | 0.1 | 0.2 | 3.1 | 1.01 (0.90 to 1.05) | 0.98 (0.88 to 1.03) |
| n13-24 | 58 | 4.5 | 0.1 | 0.4 | 4.5 | 1.02 (0.95 to 1.09) | 0.99 (0.91 to 1.03) |
| n25-40 | 58 | 7.9 | 0.3 | 0.6 | 8.1 | 1.04 (0.99 to 1.07) | 0.99 (0.97 to 1.03) |
| n41-64 | 16 | 16.5 | 0.5 | 1.4 | 17.1 | 1.04 (1.00 to 1.08) | 1.00 (0.97 to 1.04) |
| n65-128 | 16 | 27.9 | 1.2 | 2.9 | 29.9 | 1.07 (1.04 to 1.08) | 1.02 (1.00 to 1.04) |

- In the router, a member takes 1.01 to 1.07 times its run alone. With FIT-COST, the ratio was 1.06 to 1.17.
- Without the hash, the key is 0.1 to 1.2 ms. With the hash, it was 0.4 to 4.5 ms.
- The model of the whole pick adds the hashes of the base and the winner when the pick moves. It gives 1.01 of the measured pick in each band.

### The times

- `portfolio-times.json` keeps the hash of each member apart from its key, with the schema `portfolio-times/3`.
- The model time of the fit is the time of `shared`, the setup of the key, and the run and the key of each member. It also adds the hash of the base and the largest hash of the members.
- The largest hash is the worst case: the pick moves to the slowest hash of the set.
- Each shard of `portfolio:time` runs its first board once before it starts the clock. So each time is a warm median.
- The times come from one run on one CI machine: [40681241949](https://github.com/mark1russell7/highways/actions/runs/40681241949) (`portfolio:time --members`).

### The target of the fit

The router check runs the fit on the test seeds 5 to 9, at 8 sizes from 10 to 128 nodes, with 5 repeats. The highest median of the 48 cells, for each target, in ms:

| `FIT_TARGET_MS` | fit | first run | second run |
|---:|---|---:|---:|
| 50 | [40684785728](https://github.com/mark1russell7/highways/actions/runs/40684785728) | 53.7 ([40684977648](https://github.com/mark1russell7/highways/actions/runs/40684977648)) | 54.5 ([40684981137](https://github.com/mark1russell7/highways/actions/runs/40684981137)) |
| 45 | [40684782540](https://github.com/mark1russell7/highways/actions/runs/40684782540) | 49.8 ([40684970091](https://github.com/mark1russell7/highways/actions/runs/40684970091)) | 49.0 ([40684974034](https://github.com/mark1russell7/highways/actions/runs/40684974034)) |
| 42 | [40684779080](https://github.com/mark1russell7/highways/actions/runs/40684779080) | 47.7 ([40684962277](https://github.com/mark1russell7/highways/actions/runs/40684962277)) | 39.8 ([40684966052](https://github.com/mark1russell7/highways/actions/runs/40684966052)) |

- `FIT_TARGET_MS` is 45 ms. It is the highest target with a median of 50 ms or less in each of the 48 cells, in the two runs.
- The margin to 50 ms is small: 0.2 ms in the first run. The next change of the members or of the key needs a new check.

The fit changes in 13 of 30 cells. In each of them, a node limit goes up or a member comes in. No member leaves:

- `collection` 1.1, 13 to 24 nodes: `hw:weiszfeld` (18) and `trunks-gilbert-a07` (18) come in.
- `collection` 1.1, 25 to 40 nodes: `w2b:weiszfeld-a1` goes from 32 to 40.
- `collection` 1.25, 13 to 24 nodes: `hw:stubs` (18) comes in.
- `collection` 1.25, 25 to 40 nodes: `shared-order-shortest` goes from 32 to 40, and `w2b:weiszfeld-a1` (32) comes in.
- `collection` 1.5, 13 to 24 nodes: `shared-wind-p3-r1` and `trunks-gilbert-a07` go from 18 to 24.
- `collection` 1.5, 25 to 40 nodes: `shared-wind-p2-r1-e2` goes from 32 to 40, and `hw:crossbars` (32) comes in.
- `all` 1.1, 1 to 12 nodes: `hw:stubs` and `hw:spiral` go from 10 to 12.
- `all` 1.1, 13 to 24 nodes: `w3a:spiral-a15` (18) comes in.
- `all` 1.1, 41 to 64 nodes: `hw:diffusion` (64) comes in. Before, the fit was `shared` alone.
- `all` 1.25, 1 to 12 nodes: `hw:level-links` goes from 10 to 12, and `w3d:kdeeb-nomask` (10) comes in.
- `all` 1.25, 13 to 24 nodes: `w3f:p-hub-a0.2` goes from 18 to 24, and `w3a:spiral-n3` (18) comes in.
- `all` 1.25, 25 to 40 nodes: `w3d:kdeeb-routes` (32) comes back. Before, the fit was `shared` alone.
- `all` 1.5, 25 to 40 nodes: `w3b:growth-s0.3` (32) comes in.

The pool does not change, so `sets.ts` does not change.

The time of the router with the fit at 45 ms, from the run 40684970091. Each cell gives the median, then the q95, in ms:

| rule | cap | 10 | 12 | 18 | 24 | 40 | 64 | 100 | 128 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `collection` | 1.1 | 38, 47 | 42, 53 | 50, 65 | 41, 48 | 45, 53 | 10, 13 | 16, 25 | 22, 32 |
| `collection` | 1.25 | 32, 40 | 38, 47 | 46, 55 | 41, 49 | 45, 58 | 9, 13 | 16, 25 | 22, 32 |
| `collection` | 1.5 | 34, 45 | 38, 44 | 35, 43 | 47, 60 | 45, 54 | 42, 54 | 16, 25 | 22, 31 |
| `all` | 1.1 | 44, 64 | 49, 65 | 49, 62 | 40, 50 | 40, 46 | 46, 54 | 16, 25 | 23, 33 |
| `all` | 1.25 | 46, 69 | 42, 64 | 49, 62 | 46, 57 | 5, 7 | 10, 13 | 16, 25 | 22, 33 |
| `all` | 1.5 | 41, 64 | 26, 40 | 18, 21 | 24, 30 | 42, 48 | 9, 13 | 16, 25 | 23, 32 |

- The median is 50 ms or less in each of the 48 cells, in the two runs. The highest q95 is 69 ms and 67 ms.
- With the warm-up, `collection` 1.1 at 10 nodes has a q95 of 47 ms in the two runs. With FIT-COST, it was 91 ms and 85 ms.

The share of the oracle gain at the fit, on the test seeds 5 to 9 (`portfolio:sets`, CI run [40684782540](https://github.com/mark1russell7/highways/actions/runs/40684782540)). A cell with 3 values gives 0.5.1, 0.6.0 and this item:

| rule | cap | n1-12 | n13-24 | n25-40 | n41-64 | n65-128 |
|---|---:|---|---|---|---|---|
| `collection` | 1.1 | 58% | 4% | - | - | - |
| `collection` | 1.25 | 19% | 44%, 38%, 44% | 36% | -88% | - |
| `collection` | 1.5 | 70% | 51% | 86% | 0% | -1565% |
| `all` | 1.1 | 95% | 89%, 83%, 89% | 3% | 0% | -9% |
| `all` | 1.25 | 89%, 83%, 89% | 74%, 31%, 31% | 0%, -427%, 0% | -2376% | - |
| `all` | 1.5 | 42% | 61% | 100%, 86%, 100% | 0%, -2349%, -2349% | -1072% |

- 5 shares go up, and they get their value of 0.5.1 again. 25 of 30 shares do not change. No share goes down.
- 2 shares stay below 0.5.1. `all` 1.25 at 13 to 24 nodes keeps 31%. `all` 1.5 at 41 to 64 nodes keeps -2349%.
- At 41 to 64 nodes, `all` 1.5 gets `hw:growth` only with the target 50 ms. That target fails the router check.
- `all` 1.1 at 41 to 64 nodes gets `hw:diffusion`, but the share stays 0%.

### The predictions of HASH-LAZY

| Prediction | Result |
|---|---|
| 1. The pick traces are the same under `pick` and `all`. | Met: the output, the winner, `winnerIndex`, `kept` and `picked` are equal on each board, rule, cap and form of the test. |
| 2. The cost of a member in the router is 1.00 to 1.06 of its run alone in each band. | Partly met: 1.01 to 1.04 in 4 bands, and 1.07 at 65 to 128 nodes. |
| 3. After the refit at 42 ms, 4 or more of the 7 shares that FIT-COST lowered come back to within 3 points of 0.5.1. | Not met: 3 of 7 at 42 ms. At the chosen 45 ms, 5 of 7 come back. |
| 4. `all` 1.5 at 41 to 64 nodes keeps `hw:growth` again. | Not met: the fit keeps it only at 50 ms, and that target fails the router check. |
| 5. With the warm-up, the q95 of `collection` 1.1 at 10 nodes is 60 ms or less. | Met: 44 and 42 ms at 42 ms, and 47 and 47 ms at 45 ms. |

## The defaults of 0.5.1 and 0.6.0

Version 0.6.0 changes the default output of `routePortfolio`. This table gives the default of each rule, cap and band in the two versions. A default is the base `shared`, then the members of the fit, in their order. The number after each member is its node limit.

- PORTFOLIO-SPEED (#118) added the bands n41-64 and n65-128. In 0.5.1, an input above 40 nodes used `shared` alone.
- TIE-GRID (#119) took the tie rule of layout-contract 0.2.7. It moved one member of `collection|1.1|n13-24`.
- FIT-COST (#123) counts the key of each member, and sets the target of the fit to 42 ms.
- HASH-LAZY (#127) changes the fit after 0.6.0, in 13 cells. [The hash of the router](#the-hash-of-the-router-hash-lazy) gives each change.

| Rule | Cap | Band | 0.5.1 | 0.6.0 |
|---|---|---|---|---|
| `all` | 1.1 | n1-12 | `w2b:zipper-p2` (12), `hw:cubu` (12), `w3d:kdeeb+stretch` (12), `w3c:hough-wide` (12), `w3d:kdeeb-routes` (12), `hw:stubs` (12), `hw:spiral` (12), `w3b:growth-s0.7` (12) | `w2b:zipper-p2` (12), `hw:cubu` (12), `w3d:kdeeb+stretch` (12), `w3c:hough-wide` (12), `w3d:kdeeb-routes` (12), `hw:stubs` (10), `hw:spiral` (10), `w3b:growth-s0.7` (10) |
| `all` | 1.1 | n13-24 | `w3e:frechet-e0.5` (24), `w3a:diffusion-wide` (24), `w2c:zipper+stretch-b1.1` (24), `w3d:cubu+stretch` (18) | `w3e:frechet-e0.5` (24), `w3a:diffusion-wide` (24), `w2c:zipper+stretch-b1.1` (24), `w3d:cubu+stretch` (18) |
| `all` | 1.1 | n25-40 | `w2c:zipper+stretch-b1.1` (32), `w3a:spiral-a15` (32) | `w2c:zipper+stretch-b1.1` (40), `w3a:spiral-a15` (32) |
| `all` | 1.1 | n41-64 | `shared` alone (no band) | `shared` alone |
| `all` | 1.1 | n65-128 | `shared` alone (no band) | `shared` alone |
| `all` | 1.25 | n1-12 | `w3d:kdeeb-routes` (12), `w3e:mlseb+stretch` (12), `hw:growth` (12), `hw:level-links` (12), `w3b:growth-input` (12), `w3e:confluent+stretch` (12), `w3d:kdeeb-nomask` (10), `w3a:diffusion-g2` (10) | `w3d:kdeeb-routes` (12), `w3e:mlseb+stretch` (12), `hw:growth` (12), `hw:level-links` (10), `w3b:growth-input` (10), `w3e:confluent+stretch` (10) |
| `all` | 1.25 | n13-24 | `w3d:kdeeb-routes` (24), `w3e:mlseb+stretch` (18) | `w3d:kdeeb-routes` (24), `w3f:p-hub-a0.2` (18), `w3d:kdeeb-nomask` (18) |
| `all` | 1.25 | n25-40 | `w3d:kdeeb-routes` (32) | `shared` alone |
| `all` | 1.25 | n41-64 | `shared` alone (no band) | `shared` alone |
| `all` | 1.25 | n65-128 | `shared` alone (no band) | `shared` alone |
| `all` | 1.5 | n1-12 | `w3b:growth-s0.3` (12), `w3e:mlseb-a0` (12), `w3e:mlseb-routes` (10), `w3c:edge-paths-k1.5` (10) | `w3b:growth-s0.3` (12), `w3e:mlseb-a0` (12), `w3e:mlseb-routes` (10), `w3c:edge-paths-k1.5` (10), `w3f:territories-r2` (10) |
| `all` | 1.5 | n13-24 | `hw:growth` (24), `w3b:growth-input` (24) | `hw:growth` (24), `w3b:growth-input` (24) |
| `all` | 1.5 | n25-40 | `hw:growth` (40), `w3b:growth-s0.7` (32), `w3b:growth-s0.3` (32) | `hw:growth` (40), `w3b:growth-s0.7` (40) |
| `all` | 1.5 | n41-64 | `shared` alone (no band) | `shared` alone |
| `all` | 1.5 | n65-128 | `shared` alone (no band) | `shared` alone |
| `collection` | 1.1 | n1-12 | `corners-side` (12), `w2c:select+stretch` (12), `trunks-gilbert-a05` (12), `w3a:spiral-a15` (12), `trunks-tree-bf08` (12), `hw:zipper` (12), `w2c:level-links+stretch-b1.1` (12), `hw:stubs` (12) | `corners-side` (12), `w2c:select+stretch` (12), `trunks-gilbert-a05` (12), `w3a:spiral-a15` (12), `trunks-tree-bf08` (12), `hw:zipper` (12), `w2c:level-links+stretch-b1.1` (12), `hw:stubs` (12) |
| `collection` | 1.1 | n13-24 | `w3e:crossbars+stretch` (24), `corners-side` (24), `shared-p2` (24), `w2c:zipper+stretch-b1.1` (18), `trunks-tree-bf08` (18), `hw:weiszfeld` (18) | `w3e:crossbars+stretch` (24), `trunks-tree-bf08` (24), `corners-side` (24), `shared-p2` (24), `w2c:zipper+stretch-b1.1` (18) |
| `collection` | 1.1 | n25-40 | `w2a:shared-ways+breakeven` (32), `w2b:weiszfeld-a1` (32) | `w2a:shared-ways+breakeven` (40), `w2b:weiszfeld-a1` (32) |
| `collection` | 1.1 | n41-64 | `shared` alone (no band) | `shared` alone |
| `collection` | 1.1 | n65-128 | `shared` alone (no band) | `shared` alone |
| `collection` | 1.25 | n1-12 | `corners-side` (12), `trunks-tree-bf06` (12), `w3f:p-hub-a0.2` (12), `hw:stubs` (12), `hw:p-hub` (12), `hw:spiral` (12), `w2c:level-links+stretch` (12), `w3f:spectral-c0.3` (12) | `corners-side` (12), `trunks-tree-bf06` (12), `w3f:p-hub-a0.2` (12), `hw:stubs` (12), `hw:p-hub` (12), `hw:spiral` (12), `w2c:level-links+stretch` (12), `w3f:spectral-c0.3` (12) |
| `collection` | 1.25 | n13-24 | `w2a:shared-ways+stretch` (24), `shared-p3` (24), `trunks-gilbert-a07` (24), `w3e:crossbars+stretch` (24), `trunks-tree-bf06` (18), `w3c:hdbscan+stretch` (18), `shared-wind-p2-r1-e2` (18), `hw:stubs` (18) | `w2a:shared-ways+stretch` (24), `shared-p3` (24), `trunks-gilbert-a07` (24), `w3e:crossbars+stretch` (24), `trunks-tree-bf06` (24), `w3c:hdbscan+stretch` (18), `shared-wind-p2-r1-e2` (18) |
| `collection` | 1.25 | n25-40 | `w2a:shared-ways+stretch` (32), `shared-p3` (32), `shared-order-shortest` (32) | `w2a:shared-ways+stretch` (40), `shared-p3` (40), `shared-order-shortest` (32) |
| `collection` | 1.25 | n41-64 | `shared` alone (no band) | `shared` alone |
| `collection` | 1.25 | n65-128 | `shared` alone (no band) | `shared` alone |
| `collection` | 1.5 | n1-12 | `trunks-gilbert-a03` (12), `w3e:areas-keys` (12), `trunks-tree-bf02` (12), `w3f:p-hub-a0.2` (12), `w2b:zipper-a1` (12), `w3a:spiral-a35` (12), `w3f:spectral-c0.3` (12), `w2c:level-links+stretch` (12) | `trunks-gilbert-a03` (12), `w3e:areas-keys` (12), `trunks-tree-bf02` (12), `w3f:p-hub-a0.2` (12), `w2b:zipper-a1` (12), `w3a:spiral-a35` (12), `w3f:spectral-c0.3` (12), `w2c:level-links+stretch` (12) |
| `collection` | 1.5 | n13-24 | `shared-wind-p2-r0.5` (24), `trunks-gilbert-a03` (24), `w3e:crossbars+stretch` (24), `shared-wind-p2-r1-e2` (24), `trunks-tree-bf06` (24), `shared-flow-a06-p3` (18), `shared-wind-p3-r1` (18), `trunks-gilbert-a07` (18) | `shared-wind-p2-r0.5` (24), `trunks-gilbert-a03` (24), `w3e:crossbars+stretch` (24), `shared-wind-p2-r1-e2` (24), `trunks-tree-bf06` (24), `shared-flow-a06-p3` (24), `shared-wind-p3-r1` (18), `trunks-gilbert-a07` (18) |
| `collection` | 1.5 | n25-40 | `shared-p3` (40), `hw:lanes` (32), `shared-wind-p2-r1-e2` (32) | `shared-p3` (40), `hw:lanes` (40), `shared-wind-p2-r1-e2` (32) |
| `collection` | 1.5 | n41-64 | `shared` alone (no band) | `shared-flow-a06-p3` (64) |
| `collection` | 1.5 | n65-128 | `shared` alone (no band) | `shared` alone |

## The defaults of 0.6.0 and 0.7.0

Version 0.7.0 changes the default output of `routePortfolio` again. HASH-LAZY (#127) took the hash out of the key of each member, and the fit target went from 42 to 45 ms.

- The trace of a pick has fewer `outputHash` fields. Only member 0 and the winner carry one, and only when the pick moves. The option `hashes: "all"` gives the old trace.
- 13 of 30 fits change. Each change adds a member or raises a node limit, and no member leaves. This table gives only the cells that change.

| Rule | Cap | Band | 0.6.0 | 0.7.0 |
|---|---|---|---|---|
| `all` | 1.1 | n1-12 | `w2b:zipper-p2` (12), `hw:cubu` (12), `w3d:kdeeb+stretch` (12), `w3c:hough-wide` (12), `w3d:kdeeb-routes` (12), `hw:stubs` (10), `hw:spiral` (10), `w3b:growth-s0.7` (10) | `w2b:zipper-p2` (12), `hw:cubu` (12), `w3d:kdeeb+stretch` (12), `w3c:hough-wide` (12), `w3d:kdeeb-routes` (12), `hw:stubs` (12), `hw:spiral` (12), `w3b:growth-s0.7` (10) |
| `all` | 1.1 | n13-24 | `w3e:frechet-e0.5` (24), `w3a:diffusion-wide` (24), `w2c:zipper+stretch-b1.1` (24), `w3d:cubu+stretch` (18) | `w3e:frechet-e0.5` (24), `w3a:diffusion-wide` (24), `w2c:zipper+stretch-b1.1` (24), `w3d:cubu+stretch` (18), `w3a:spiral-a15` (18) |
| `all` | 1.1 | n41-64 | `shared` alone | `hw:diffusion` (64) |
| `all` | 1.25 | n1-12 | `w3d:kdeeb-routes` (12), `w3e:mlseb+stretch` (12), `hw:growth` (12), `hw:level-links` (10), `w3b:growth-input` (10), `w3e:confluent+stretch` (10) | `w3d:kdeeb-routes` (12), `w3e:mlseb+stretch` (12), `hw:growth` (12), `hw:level-links` (12), `w3b:growth-input` (10), `w3e:confluent+stretch` (10), `w3d:kdeeb-nomask` (10) |
| `all` | 1.25 | n13-24 | `w3d:kdeeb-routes` (24), `w3f:p-hub-a0.2` (18), `w3d:kdeeb-nomask` (18) | `w3d:kdeeb-routes` (24), `w3f:p-hub-a0.2` (24), `w3d:kdeeb-nomask` (18), `w3a:spiral-n3` (18) |
| `all` | 1.25 | n25-40 | `shared` alone | `w3d:kdeeb-routes` (32) |
| `all` | 1.5 | n25-40 | `hw:growth` (40), `w3b:growth-s0.7` (40) | `hw:growth` (40), `w3b:growth-s0.7` (40), `w3b:growth-s0.3` (32) |
| `collection` | 1.1 | n13-24 | `w3e:crossbars+stretch` (24), `trunks-tree-bf08` (24), `corners-side` (24), `shared-p2` (24), `w2c:zipper+stretch-b1.1` (18) | `w3e:crossbars+stretch` (24), `trunks-tree-bf08` (24), `corners-side` (24), `shared-p2` (24), `w2c:zipper+stretch-b1.1` (18), `hw:weiszfeld` (18), `trunks-gilbert-a07` (18) |
| `collection` | 1.1 | n25-40 | `w2a:shared-ways+breakeven` (40), `w2b:weiszfeld-a1` (32) | `w2a:shared-ways+breakeven` (40), `w2b:weiszfeld-a1` (40) |
| `collection` | 1.25 | n13-24 | `w2a:shared-ways+stretch` (24), `shared-p3` (24), `trunks-gilbert-a07` (24), `w3e:crossbars+stretch` (24), `trunks-tree-bf06` (24), `w3c:hdbscan+stretch` (18), `shared-wind-p2-r1-e2` (18) | `w2a:shared-ways+stretch` (24), `shared-p3` (24), `trunks-gilbert-a07` (24), `w3e:crossbars+stretch` (24), `trunks-tree-bf06` (24), `w3c:hdbscan+stretch` (18), `shared-wind-p2-r1-e2` (18), `hw:stubs` (18) |
| `collection` | 1.25 | n25-40 | `w2a:shared-ways+stretch` (40), `shared-p3` (40), `shared-order-shortest` (32) | `w2a:shared-ways+stretch` (40), `shared-p3` (40), `shared-order-shortest` (40), `w2b:weiszfeld-a1` (32) |
| `collection` | 1.5 | n13-24 | `shared-wind-p2-r0.5` (24), `trunks-gilbert-a03` (24), `w3e:crossbars+stretch` (24), `shared-wind-p2-r1-e2` (24), `trunks-tree-bf06` (24), `shared-flow-a06-p3` (24), `shared-wind-p3-r1` (18), `trunks-gilbert-a07` (18) | `shared-wind-p2-r0.5` (24), `trunks-gilbert-a03` (24), `w3e:crossbars+stretch` (24), `shared-wind-p2-r1-e2` (24), `trunks-tree-bf06` (24), `shared-flow-a06-p3` (24), `shared-wind-p3-r1` (24), `trunks-gilbert-a07` (24) |
| `collection` | 1.5 | n25-40 | `shared-p3` (40), `hw:lanes` (40), `shared-wind-p2-r1-e2` (32) | `shared-p3` (40), `hw:lanes` (40), `shared-wind-p2-r1-e2` (40), `hw:crossbars` (32) |
