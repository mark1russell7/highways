## The route time at each size (ROUTER-BUDGET)

Node v26.13.0, AMD EPYC 9V74 80-Core Processor. The times are in seconds. The budget is 5 minutes for each route.

| router | board | nodes | edges | routes | median | A/A b÷a | over the limit | over the budget | growth exponent |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|
| growth | uniform | 125 | 500 | 4 | 0.15 | 0.954 | 0 | no |  |
| growth | uniform | 250 | 1000 | 4 | 0.28 | 1.000 | 0 | no | 0.89 |
| growth | uniform | 500 | 2000 | 4 | 0.63 | 0.981 | 0 | no | 1.18 |
| growth | uniform | 1000 | 4000 | 4 | 1.57 | 1.016 | 0 | no | 1.32 |
| growth | uniform | 2000 | 8000 | 4 | 4.97 | 0.987 | 0 | no | 1.66 |
| growth | fixture | 1000 |  | 0 |  |  | 1 | yes, 1 over the limit of 10 min |  |
| hough | uniform | 125 | 500 | 4 | 0.09 | 1.018 | 0 | no |  |
| hough | uniform | 250 | 1000 | 4 | 0.15 | 1.017 | 0 | no | 0.76 |
| hough | uniform | 500 | 2000 | 4 | 0.27 | 1.022 | 0 | no | 0.87 |
| hough | uniform | 1000 | 4000 | 4 | 0.57 | 0.959 | 0 | no | 1.11 |
| hough | uniform | 2000 | 8000 | 4 | 1.36 | 0.838 | 0 | no | 1.25 |
| hough | joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap/s2 | 1000 | 4000 | 1 | 72.01 |  | 0 | no |  |
| hub-arcs | uniform | 125 | 500 | 4 | 0.54 | 0.928 | 0 | no |  |
| hub-arcs | uniform | 250 | 1000 | 4 | 1.27 | 1.013 | 0 | no | 1.22 |
| hub-arcs | uniform | 500 | 2000 | 4 | 2.73 | 1.005 | 0 | no | 1.11 |
| hub-arcs | uniform | 1000 | 4000 | 4 | 6.52 | 1.006 | 0 | no | 1.26 |
| hub-arcs | uniform | 2000 | 8000 | 4 | 17.33 | 0.992 | 0 | no | 1.41 |
| hub-arcs | joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap/s2 | 1000 | 4000 | 1 | 213.61 |  | 0 | no |  |
| mlseb | uniform | 125 | 500 | 4 | 1.92 | 0.986 | 0 | no |  |
| mlseb | uniform | 250 | 1000 | 4 | 6.45 | 0.994 | 0 | no | 1.75 |
| mlseb | uniform | 500 | 2000 | 4 | 15.13 | 0.994 | 0 | no | 1.23 |
| mlseb | uniform | 1000 | 4000 | 4 | 38.25 | 1.004 | 0 | no | 1.34 |
| mlseb | uniform | 2000 | 8000 | 4 | 90.74 | 1.019 | 0 | no | 1.25 |
| mlseb | joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap/s2 | 1000 | 4000 | 1 | 260.46 |  | 0 | no |  |
| ridges | uniform | 125 | 500 | 4 | 0.12 | 0.965 | 0 | no |  |
| ridges | uniform | 250 | 1000 | 4 | 0.21 | 1.011 | 0 | no | 0.84 |
| ridges | uniform | 500 | 2000 | 4 | 0.39 | 0.971 | 0 | no | 0.88 |
| ridges | uniform | 1000 | 4000 | 4 | 0.80 | 1.031 | 0 | no | 1.03 |
| ridges | uniform | 2000 | 8000 | 4 | 1.76 | 1.002 | 0 | no | 1.13 |
| ridges | joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap/s2 | 1000 | 4000 | 1 | 385.24 |  | 0 | yes |  |
| search | uniform | 125 | 500 | 4 | 1.03 | 0.969 | 0 | no |  |
| search | uniform | 250 | 1000 | 4 | 2.19 | 1.011 | 0 | no | 1.09 |
| search | uniform | 500 | 2000 | 4 | 4.91 | 0.978 | 0 | no | 1.16 |
| search | uniform | 1000 | 4000 | 4 | 12.06 | 0.982 | 0 | no | 1.30 |
| search | uniform | 2000 | 8000 | 4 | 32.47 | 0.990 | 0 | no | 1.43 |
| search | joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap/s2 | 1000 | 4000 | 1 | 594.22 |  | 0 | yes |  |
