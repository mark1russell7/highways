## The dense board (ROUTE-SCALE)

1000 nodes, 4000 edges. Node v26.13.0, AMD EPYC 7763 64-Core Processor. The times are in seconds.

| router | cold | warm median | runs | checkProperties | measureQuality | exactStretches.build | exactStretches.use | portfolio.key | violations | route hash | exact | same |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| hough | 104.09 |  | 1 | 0.08 | 0.90 | 0.87 | 8.20 |  | 0 | `d562d2106bdf3e50` | `c20fc374f639a363` | yes |
| hub-arcs | 206.62 |  | 1 | 11.91 | 11.80 | 0.88 | 10.19 |  | 0 | `6a65ea7948c1db40` | `4792e1bbdbe32cbd` | yes |
| mlseb | 444.33 |  | 1 | 1.79 | 2.42 | 0.71 | 7.25 |  | 0 | `389e6c0d92e8935b` | `15f0a1618d15cb06` | yes |
| ridges | 252.75 |  | 1 | 31.45 | 9.54 | 0.59 | 5.51 |  | 0 | `ef39f74f680d9015` | `95d7c82221448840` | yes |
| search | 323.59 |  | 1 | 1.15 | 2.37 | 0.50 | 4.93 |  | 0 | `6269afee2bbd1152` | `d2fdf933c6e41c31` | yes |
