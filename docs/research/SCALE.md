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
The CPU of the runner is not the same in each cell, so compare the large changes only.

| Router | Commit | Cold | Warm | `checkProperties` | `measureQuality` | `exactStretches.use` |
|---|---|---:|---:|---:|---:|---:|
| `shared` | `main` | approximately 318 000 | | | | |
| `shared` | `18095dc`, the signatures | 27 966 | 27 956 | 6 685 | 3 710 | 8 582 |
| `shared` | `e387f66`, the lane order | 18 392 | 18 445 | 4 166 | 2 847 | 7 791 |
| `shared-all` | `18095dc` | 41 945 | 40 196 | 8 891 | 3 180 | 8 534 |
| `portfolio` | `18095dc` | 37 216 | 35 046 | 7 275 | 4 110 | 8 541 |
| `corners` | `main` | 4 004 | 3 794 | 69 | 1 004 | 12 222 |
| `corners` | `e387f66` | 3 502 | 3 412 | 67 | 932 | 7 770 |
| `sections` | `main` | 2 741 | 2 540 | 158 | 906 | 8 294 |
| `sections` | `e387f66` | 2 789 | 2 721 | 164 | 919 | 11 528 |

- The `main` row of `shared` is the time of the joint bench. The other rows come from the CI runs 40716219239, 40716722637 and 40717696580 of the workflow `Scale`.
- On this board, `portfolio` runs only its base member `shared`. The key of the pick takes 362 ms.
- After the signatures, the lane order takes 83% of a route of `shared`. The self time of `sig` is 0.3%.

The profile of a route of `shared`, by self time:

| After the signatures | After the lane order |
|---|---|
| `dist` 40.1% | `partBefore` 39.3% |
| `partBefore` 21.1% | `partAfter` 13.7% |
| `partAfter` 6.5% | `dist` 8.6% |
| `mergeSort` 6.1% | `mergeSort` 7.1% |
| `indexOf` 4.9% | `indexOf` 5.3% |

### The output does not change

- The route hash and the exact hash of each router on the board stay the same: `corners` `f3ccfe6861f93ffa`, `sections` `d8e7efc8f64bd7ca`, `shared` and `portfolio` `a624d2afe8f7ea08`.
- The router screen gives 126 of 126 records equal to `main`, except `ms` and `commit`. The highway screen gives 784 of 784.
- The CI of the pull request #132 runs the tests of the digests.

### The next hot spots

These hot spots stay. Each fix is larger than this item, and each fix must keep each byte of the output.

| Function | Share | Cause | Proposed fix |
|---|---|---|---|
| `partBefore` and `partAfter` of `lane-order.ts` | approximately 53% of the self time of a route of `shared` | The merge sort compares each pair of lanes again, and each compare walks the common points past the run. | Give each lane of a run its parting points one time, with a trie of the points past each end. The compare then reads the trie. |
| `mergeSort` of `lane-order.ts` | approximately 7% | The sort makes a new list at each level. | Sort in one buffer. The pairs to `compare` must stay the same, so the order stays the same. |
| `indexOf` of `segments.ts` | approximately 5% | `orderLanes` looks for the run in each route with a scan, and again in the reverse. | Give `orderLanes` the place of the run in each route, from the walk of `shared`. |
| `distancesTo` of `bench/exact/index.ts` | approximately 25% of the self time of the steps of `shared`, before the guide cache | Each end point gets one search to all its partners. The guide goes to the nearest partner, so the search opens most of the network. | Use a guide with landmarks (ALT) for a tighter bound. Two paths of the same length can give other last digits, so compare the bits of each distance. |
| `measureQuality` | approximately 3 s on `shared` | The grid query of each segment walks many cells on a dense board. | Measure the profile of the grid query first. |
