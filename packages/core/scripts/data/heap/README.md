# The budgets of the heap gate

The file `budgets.json` is the input of the heap gate `scripts/heap.ts` (HEAP-GATE). The job `heap` of the workflow `CI` runs the gate.

- Each router of the file routes the dense board of ROUTE-SCALE in its own process.
- The measures of a router are its peak RSS and its committed heap after the route, in MB, from the CI run `run`.
- The heap cap of a router is its peak RSS times `margin`, and at least `floorMb`. V8 can need more old space than the peak RSS, so the cap has a floor.
- The RSS budget of a router is the larger of its peak RSS times `margin` and its peak RSS plus `slackMb` (HEAP-BUDGET). The budget has no floor, so a small router keeps a tight budget.
- The heap is for information only.
- A router with the value `null` has no measure. It runs with the cap `measureCapMb`, and it does not fail the gate.

To change a measure, run the job `heap` in CI, and copy the values of its artifact `heap-gate` into the file. Do not measure on a local machine, because the load of other processes changes the RSS.
