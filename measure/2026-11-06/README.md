# Probes of 2026-11-06

- `probe-hwcb.ts`: the probe of HWC-B for ROUTE-TIE (#350).
- `probe-pairs-heap.ts` and `pairs-heap-1.txt`: the heap of `routePairCrossings` on `trunks`, `shared`, `shared-all` and `corners`, at 1 000 to 4 000 nodes.
- `probe-straight-heap.ts` and `pairs-heap-2.txt`: the heap and the time of the pair count and of `ambiguity` on `straight` and `plugs`, at 2 500 to 10 000 nodes. BENCH-PAIRS-HEAP (#374) rests on these rows.

The heap is the value after the call, before a collection. A local machine gives no time for a record.

## Later on 2026-11-06

- `probe-pairs-cover.ts` and `pairs-cover-1.txt`: the coverage of the 95% interval of a sampled pair count (BENCH-PAIRS-HEAP), 100 seeds, local, 1 core.
- `router-budget-42172538370/`: the profile tables, rows and logs of Scale run 42172538370 (ROUTER-BUDGET step 2), the packed board n1000, one route for each router. The CPU model of each job is in its rows.
- `sections-slow-42172523936/log-tables.txt`: the profile table and the time tables of Profile run 42172523936 (SECTIONS-SLOW step 5), `sections-tree` on `large-clustered`, `e55dde1~1` against `e55dde1`.
