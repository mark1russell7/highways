scale: hub-arcs on joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap/s2 (1000 nodes, 4000 edges), linux x64 node v26.13.0, Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz.

The profile of the first route of hub-arcs (206818.3 ms, with the profiler):

| self % | function |
|---:|---|
| 34.8 | partBefore lane-order.ts:102 |
| 10.8 | partAfter lane-order.ts:83 |
| 8.4 | overlap index.ts:126 |
| 8.1 | dist geom.ts:19 |
| 6.0 | mergeSort lane-order.ts:150 |
| 5.6 | findRun lane-order.ts:26 |
| 3.6 | #search visibility.ts:578 |
| 2.4 | holdsInOrder follow.ts:27 |
| 1.8 | total index.ts:113 |
| 1.6 | #down visibility.ts:1084 |
| 1.3 | (garbage collector) :0 |
| 1.1 | (program) :0 |
| 1.1 | (anonymous) base.ts:72 |
| 1.0 | sharedStretches stretches.ts:58 |
| 1.0 | placeRoutes lane-order.ts:46 |
| 0.8 | set visibility.ts:1045 |
| 0.8 | (anonymous) stretches.ts:154 |
| 0.6 | (anonymous) stretches.ts:143 |
| 0.6 | (anonymous) base.ts:68 |
| 0.5 | corridorClusters index.ts:170 |
| 0.5 | (anonymous) base.ts:73 |
| 0.5 | sigOf stretches.ts:89 |
| 0.4 | turn lane-order.ts:71 |
| 0.4 | estimate visibility.ts:638 |
| 0.4 | (anonymous) index.ts:140 |

scale: hub-arcs: route 1 of 1: 206818.3 ms.
scale: hub-arcs: checkProperties: 11601.6 ms.
scale: hub-arcs: measureQuality: 12160.4 ms.
scale: hub-arcs: exactStretches.build: 835.1 ms.
scale: hub-arcs: exactStretches.use: 10639.8 ms.

The profile of the steps of hub-arcs, with the profiler:

| self % | function |
|---:|---|
| 23.7 | dist geom.ts:19 |
| 16.7 | distancesTo index.ts:281 |
| 12.8 | pointBoxDistance geom.ts:124 |
| 11.8 | holds properties.ts:142 |
| 9.4 | pointSegmentDistance index.js:170 |
| 4.8 | pop index.ts:252 |
| 2.6 | segmentBoxDistance geom.ts:131 |
| 2.3 | (anonymous) quality.ts:53 |
| 2.1 | push index.ts:228 |
| 2.1 | (garbage collector) :0 |
| 1.5 | #walk grid.ts:126 |
| 1.3 | guide index.ts:288 |
| 0.7 | (program) :0 |
| 0.7 | paintedSegments quality.ts:49 |
| 0.7 | checkProperties properties.ts:32 |
| 0.6 | #bucket visibility.ts:395 |
| 0.5 | hitsRect geom.ts:97 |
| 0.5 | (anonymous) quality.ts:95 |
| 0.5 | segmentHitsBox geom.ts:81 |
| 0.4 | key quality.ts:46 |
| 0.4 | #slot grid.ts:33 |
| 0.3 | (anonymous) grid.ts:204 |
| 0.3 | #nearestVisible visibility.ts:459 |
| 0.3 | turns geom.ts:148 |
| 0.3 | pairDistances index.ts:322 |

scale: hub-arcs: hash 6a65ea7948c1db40, exact 4792e1bbdbe32cbd.
