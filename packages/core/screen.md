## Screen of the step `router` on `screen-v2`

60 inputs, 10 strategies. Each cell of a measure is the median over the inputs.
The floor of an input is the counts of the hard rules of the built-in strategy with the fewest breaks on that input.
The times come from 16 x AMD Ryzen AI 7 PRO 350 w/ Radeon 860M (win32 x64, Node.js v24.21.0), mode `process`, context `local`.

| strategy | new | runs | skipped | hard | over the floor | same twice | on the front of an input | ms | route.crossings.per-edge ↓ | route.detour.median ↓ | route.bundle.ink-saved ↑ | route.turn.mean ↓ |
|---|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|
| straight |  | 60 | 0 | 4712 | 3788 | yes | 0 | 0.046 | 2.948 | 1 | 0 | 0 |
| plugs |  | 60 | 0 | 4999 | 4075 | yes | 0 | 0.235 | 3.090 | 1.008 | 0.000 | 0.294 |
| corners | yes | 60 | 0 | 924 | 0 | yes | 39 | 5.916 | 2.992 | 1.019 | 0.039 | 0.548 |
| corners-smooth |  | 60 | 0 | 924 | 0 | yes | 37 | 6.496 | 3.407 | 1.021 | 0.035 | 0.543 |
| trunks |  | 60 | 0 | 924 | 0 | yes | 41 | 5.648 | 2.992 | 1.029 | 0.064 | 0.599 |
| shared |  | 60 | 0 | 924 | 0 | yes | 42 | 6.583 | 2.429 | 1.030 | 0.059 | 0.699 |
| shared-all |  | 60 | 0 | 924 | 0 | yes | 50 | 6.832 | 1.234 | 1.045 | 0.483 | 0.891 |
| sections |  | 60 | 0 | 924 | 0 | yes | 37 | 10.705 | 1.814 | 1.044 | 0.296 | 1.277 |
| sections-tree |  | 60 | 0 | 924 | 0 | yes | 22 | 9.492 | 1.509 | 1.102 | 0.388 | 1.546 |
| seams | yes | 60 | 0 | 0 | 0 | yes | 49 | 13.148 | 2.772 | 1.027 | 0.053 | 0.589 |

Pareto front over the medians: corners, corners-smooth, trunks, shared, shared-all, sections, seams.
Not on the front because of a break over the floor, no run or two different outputs: straight, plugs.
Strategies with no run on any input: 0.

600 records in 36.3 s.
