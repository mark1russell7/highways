# The routes of a large board

This note is the result of the item ROUTE-SCALE of the [roadmap](../ROADMAP.md). It finds why `shared` takes minutes on a dense board, and it makes the routers fast there. No output changes.

## The dense board (ROUTE-SCALE)

The joint bench of layout-contract routes a board of 1000 boxes and 4000 edges. One route of `shared` took approximately 318 s, and the cell of `shared-all` took 27 min. This item finds the cause and removes it. Each byte of each route stays the same.

- The folder `packages/core/scripts/data/scale` keeps the board. Its `README.md` tells where the board comes from.
- The script `packages/core/scripts/scale.ts` routes the board with one router. It writes the time of each route and of each step of the bench after the route.
- With `--profile`, the script also keeps a CPU profile of the first route and of the steps.
- The workflow `Scale` runs the script for `shared`, `shared-all`, `sections`, `portfolio` and `corners`, on `ubuntu-latest` with node 26.
- The job `screen` of `Scale` runs the router screen of `main` and of the head in turn on one runner, 5 rounds each. The script `packages/core/scripts/scale-screen.ts` compares the records and the times.

### The cause

`shared` finds the runs of each walk with a signature of each link. The signature is the sorted list of the edges that use the link.

- Before this item, the function `sig` sorted and joined the list again at each call. On a dense board, a busy link has hundreds of users, and each walk calls `sig` for each link.
- Thus the time of `sig` grew with the walks, the links and the users together.
- `sharedStretches` of `highways/stretches.ts` had the same pattern. It also looked for each member of a stretch with a scan of the members.

### The changes

Each change keeps each result. The tests of the digests and the hashes below show it.

- `routers/shared.ts`: each sorted list of users gets a number one time. Two links get the same number only when they have the same list. The id of a run keeps its form.
- `highways/stretches.ts`: the same numbers, and a set of the members of each stretch in place of the scan.
- `lane-order.ts`: `partAfter` and `partBefore` skip the distance when the two points are the same object. A point is at the distance 0 from itself, so the result does not change.
- `segments.ts`: `lanePaths` gets the spacing of each segment one time, not one time for each path.
- `bench/exact/index.ts`: `distancesTo` gets the guide of each node one time. A node can go in the heap more than one time, and the guide loops over all the targets.
- `bench/properties.ts`: the run check makes the reverse of each run one time, and `holds` uses a plain loop.

### The times

The times are wall times in ms on `ubuntu-latest` with node 26. Each cell routes 3 times: the first route is cold, and "warm" is the median of the next 2 routes.
The CPU of the runner is not the same in each cell, so compare the large changes only. The last column names the CPU.

| Router | Commit | Cold | Warm | `checkProperties` | `measureQuality` | `exactStretches.use` | CPU |
|---|---|---:|---:|---:|---:|---:|---|
| `shared` | `main` | 301 906 | 302 719 | 7 153 | 4 039 | 8 218 | EPYC 7763 |
| `shared` | `18095dc`, the signatures | 27 966 | 27 956 | 6 685 | 3 710 | 8 582 | Xeon 8573C |
| `shared` | `e387f66`, the lane order | 18 392 | 18 445 | 4 166 | 2 847 | 7 791 | Xeon 6973P-C |
| `shared` | `418dc3a`, the head | 21 199 | 20 934 | 2 511 | 3 089 | 6 630 | EPYC 9V74 |
| `portfolio` | `main` | 299 885 | 298 220 | 6 883 | 4 008 | 8 243 | EPYC 7763 |
| `portfolio` | `418dc3a` | 27 732 | 27 061 | 3 472 | 3 994 | 9 314 | EPYC 7763 |
| `shared-all` | `418dc3a` | 36 217 | 35 797 | 3 331 | 3 682 | 7 734 | Xeon 6973P-C |
| `corners` | `main` | 4 004 | 3 794 | 69 | 1 004 | 12 222 | EPYC 7763 |
| `corners` | `418dc3a` | 3 751 | 3 678 | 62 | 874 | 9 084 | Xeon 8573C |
| `sections` | `main` | 2 741 | 2 540 | 158 | 906 | 8 294 | EPYC 7763 |
| `sections` | `418dc3a` | 2 550 | 2 328 | 116 | 680 | 8 487 | Xeon 8573C |

- The rows come from the CI runs 40716219239 (`main`), 40716722637, 40717696580 and 40728475746 of the workflow `Scale`.
- The cells of `portfolio` ran on the same CPU. A route falls from 299.9 s to 27.7 s, 10.8 times faster. The remeasure below gives 0.091 to 0.092 on that CPU model.
- On this board, `portfolio` runs only its base member `shared`. The key of the pick takes approximately 340 ms.
- On `main`, the joint bench needed 27 min for the cell of `shared-all`. On the head, one route takes 36 s.

The profile of a route of `shared`, by self time:

| `main` | After the signatures | The head |
|---|---|---|
| `sig` 72.3% | `dist` 40.1% | `partBefore` 43.3% |
| `byText` 12.8% | `partBefore` 21.1% | `partAfter` 12.1% |
| `dist` 6.5% | `partAfter` 6.5% | `dist` 10.3% |
| `(program)` 2.2% | `mergeSort` 6.1% | `indexOf` 6.7% |
| `partBefore` 2.0% | `indexOf` 4.9% | `mergeSort` 4.8% |

- On `main`, `sig` and `byText` take 85% of the self time. After the signatures, `sig` takes 0.3%.
- After the signatures, the lane order takes 83% of a route of `shared`.

### The remeasure (MEASURE-ISOLATE)

The times above are from separate jobs, so their speed claim was void. The workflow `Remeasure` (run 41382862417) timed 0.8.0 and the workspace in one job, with an A/A arm.
Each of the 5 jobs runs each arm in a fresh process in each round. The [record](verdicts/remeasure/route-scale.json) keeps each job.

The ratio is the time of the workspace over the time of 0.8.0. The interval is over the 4 jobs that count, and the columns give each CPU model.

| Router | Old claim | Interval | EPYC 7763, 3 jobs | EPYC 9V74, 1 job | 0.8.0 | Workspace | Verdict |
|---|---:|---|---|---:|---:|---:|---|
| `shared` | 0.070 | 0.089 to 0.105 | 0.089 to 0.090 | 0.105 | 297.1 s | 26.5 s | The gain is smaller than the old claim. |
| `shared-all` | 0.100 | 0.035 to 0.037 | 0.035 to 0.036 | 0.037 | 1443.2 s | 50.4 s | The claim holds. |
| `portfolio` | 0.093 | 0.091 to 0.108 | 0.091 to 0.092 | 0.108 | 297.3 s | 27.1 s | The gain is smaller than the old claim. |

- The interval is the claim. The spread of a ratio is between the CPU models, not inside a job.
- The A/A band of job 4 (EPYC 9V45) is 1.001 to 1.009. It does not contain 1, so job 4 does not count. Its ratios are 0.083, 0.029 and 0.084.
- The claim of `shared-all` holds in the 4 jobs that count. A fifth job does not change it: its worst job, 0.037, is far below the limit 0.067 of 15 times.
- The CPU models of the users are not known. A future limit on these measures has one value for each CPU model.

### The output does not change

- The route hash and the exact hash of each router on the board stay the same: `corners` `f3ccfe6861f93ffa`, `sections` `d8e7efc8f64bd7ca`, and `shared` and `portfolio` `a624d2afe8f7ea08`.
- The workflow `Xplat` gives the same 51 route hashes and exact hashes as `main`, in each of the 4 cells. The runs are 40716110206 and 40728475149.
- The router screen gives 126 of 126 records equal to `main`, except `ms` and `commit`. The highway screen gives 784 of 784. The runs are 40716114094, 40716118524 and 40728475194.
- The tests of the digests pass in the CI of the pull request #132.

The job `screen` of `Scale` runs the router screen of `main` and of the head in turn on one runner, 5 rounds each. The times are the median ms of the records of each router.

| Router | `main` | Head | Change |
|---|---:|---:|---:|
| `straight` | 0.08 | 0.09 | +7.1% |
| `plugs` | 0.68 | 0.68 | +0.1% |
| `corners` | 8.60 | 8.50 | -1.2% |
| `corners-smooth` | 9.08 | 9.23 | +1.6% |
| `trunks` | 7.77 | 7.90 | +1.6% |
| `shared` | 11.08 | 10.86 | -2.0% |
| `shared-all` | 13.55 | 10.39 | -23.3% |
| `sections` | 13.82 | 14.00 | +1.3% |
| `sections-tree` | 13.45 | 14.21 | +5.7% |

- The data comes from the run 40728475746 at `418dc3a`. An earlier run, 40718111347, gave changes from -20.1% to +8.5%.
- The router screen uses small boards, so most changes are in the noise of one runner. Only `shared-all` is clearly faster.

### The next hot spots

These hot spots stay. Each fix is larger than this item, and each fix must keep each byte of the output.

| Function | Share | Cause | Proposed fix |
|---|---|---|---|
| `partBefore` and `partAfter` of `lane-order.ts` | approximately 53% of the self time of a route of `shared` | The merge sort compares each pair of lanes again, and each compare walks the common points past the run. | Give each lane of a run its parting points one time, with a trie of the points past each end. The compare then reads the trie. |
| `mergeSort` of `lane-order.ts` | approximately 7% | The sort makes a new list at each level. | Sort in one buffer. The pairs to `compare` must stay the same, so the order stays the same. |
| `indexOf` of `segments.ts` | approximately 5% | `orderLanes` looks for the run in each route with a scan, and again in the reverse. | Give `orderLanes` the place of the run in each route, from the walk of `shared`. |
| `distancesTo` of `bench/exact/index.ts` | approximately 25% of the self time of the steps of `shared`, before the guide cache | Each end point gets one search to all its partners. The guide goes to the nearest partner, so the search opens most of the network. | Use a guide with landmarks (ALT) for a tighter bound. Two paths of the same length can give other last digits, so compare the bits of each distance. |
| `measureQuality` | approximately 3 s on `shared` | The grid query of each segment walks many cells on a dense board. | Measure the profile of the grid query first. |

## The tree of sections at 10 000 nodes (H3)

H3 made each router faster at 10 000 nodes with a profile fix. Its old claim, 2 to 2.5 times faster, came from separate jobs.
The workflow `Remeasure` (run 41369331158) timed the core before `fa1dd82` and the workspace in one job, with an A/A arm. Each of the 5 jobs runs each arm in a fresh process in each round.
The board is the fixture `large-clustered` of 10 000 nodes. The [record](verdicts/remeasure/h3.json) keeps each job. The A/A band of each job contains 1, so each job counts.

The ratio is the time of the workspace over the old time. The columns give each CPU model.

| Router | Interval | Xeon 6973P-C, 2 jobs | Xeon 8573C, 1 job | EPYC 9V45, 2 jobs | Verdict |
|---|---|---|---:|---|---|
| `corners` | 0.339 to 0.471 | 0.380 to 0.390 | 0.460 | 0.339 to 0.471 | The claim holds. |
| `corners-smooth` | 0.370 to 0.502 | 0.389 to 0.475 | 0.468 | 0.370 to 0.502 | The gain is smaller than the claim. |
| `trunks` | 0.382 to 0.506 | 0.382 to 0.423 | 0.449 | 0.400 to 0.506 | The gain is smaller than the claim. |
| `shared` | 0.335 to 0.435 | 0.359 to 0.361 | 0.381 | 0.335 to 0.435 | The claim holds. |
| `shared-all` | 0.170 to 0.231 | 0.188 | 0.200 | 0.170 to 0.231 | The claim holds. |
| `sections` | 1.147 to 1.332 | 1.173 to 1.243 | 1.290 | 1.147 to 1.332 | The workspace is slower. |
| `sections-tree` | 2.667 to 3.211 | 2.671 to 2.744 | 2.667 | 2.828 to 3.211 | The workspace is slower. |

- The old arm is the core before `fa1dd82`. So the ratio also contains each change after `fa1dd82`.
- On this board, the 2 jobs on EPYC 9V45 differ more than the CPU models. So the CPU model does not explain all of the spread here.
- The open item SECTIONS-SLOW finds the change that makes `sections` and `sections-tree` slower.

### The profile of `sections-tree` and the second fix (SECTIONS-SLOW step 2)

The workflow `Profile` (run 41505173044) profiled `sections-tree` on `large-clustered` at `bce22a5`, the commit before SEARCH-SPEED (#259).
The run keeps one profile, the profile of `bce22a5`. It has no profile of `c6af859`.
A function that `c6af859` does not have gets the share 0 % at `c6af859`.

| Function | Self time at `bce22a5` | Total time at `bce22a5` | At `c6af859` | Changed by #259 |
|---|---:|---:|---|---|
| `CornerGraph.#search` | 20.8 % | 58.2 % | not there | yes |
| `MinHeap.#down` | 11.1 % | | there | yes, 8.3 % of it is in `#search` |
| `dist` | 10.1 % | | there | yes, 6.7 % of it is in `#search` |
| `SoftGraph.path` | 8.7 % | 14.5 % | not there, 0 % | no |
| `Grid.#walk` | 8.3 % | 17.6 % | there | no |
| `CornerGraph.#nearestVisible` | 7.1 % | 13.8 % | there | only the table of buckets |

The largest cost that #259 did not change is `SoftGraph.path`. Only `fewerFar` uses it, and `fewerFar` came after `c6af859` (#33).
The search is a feature: it finds a way through fewer far boxes. But much of its time is waste, and a change can remove that waste:

- One line takes 4.5 % of all the time. It gets the cost of each box of each link from a function, with a look-up in a set.
- Each search makes three new arrays over all the vertices, and a new heap.

The fix keeps the costs of the boxes in a typed array with a stamp, so the search uses `cost` one time for each box.
The links, their lengths and their boxes are in flat typed arrays. The arrays of the search and the heap stay from one search to the next.
The search adds the same box costs in the same order, so each path and each cost stays the same to the last bit.
A new test compares the search with a copy of the search of version 0.11.0, with a new cost function in each search.
The `Sections gate` run 41691623211 of #276 timed the fix. The A/A spread of the run is 0.025, below the noise cap 0.058.
The head takes 0.943 times the time of its parent (41.4 s against 43.9 s), and 0.928 times the time of the fixed base `25a2be4`.
The interval of the head over the A/A arm is 0.930 to 0.950. So the fix is faster, and the gain is 5 % to 7 %.

### The walk of the grid (SECTIONS-SLOW step 3)

The same profile gives `Grid.#walk` 8.3 % self time and 17.6 % total time. No fix changed it.
Most of its time comes from the legs of `square` in `levels.ts`, through `Obstacles.clear`. Each leg is a different segment, so the fix is in the walk.
The line data of the profile shows two costs in the walk:

- The look-up of each bucket takes 2.0 % of all the time. The key of a bucket is not a small integer, so the map hashes a boxed number.
- `Math.hypot` takes 1.8 % of all the time. It gives the number of steps of each segment.

The fix ([#280](https://github.com/mark1russell7/highways/pull/280)) keeps the buckets in a table with open addressing, by the same keys. Each key gives the same list of items.

A segment parallel to an axis uses its other side as its length. `Math.hypot` gives the same value.
For a different segment, a square root gives the length. The square root and `Math.hypot` differ by a few units in the last place.
Far from a whole number of steps, the two lengths round up to the same number. Near a whole number, the walk uses `Math.hypot`.

So the walk has the same steps, the same buckets, the same items in the same order and the same work counts.
A new test compares the grid with a copy of the grid of version 0.11.0, on seeded scripts of adds and queries.

The gate run 41712051689 finds the head faster against its parent: ratio 0.964, interval over the A/A arm 0.950 to 0.988, A/A spread 0.019. The head is 0.904 times the fixed base `25a2be4`.
