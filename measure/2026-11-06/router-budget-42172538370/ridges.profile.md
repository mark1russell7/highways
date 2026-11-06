scale: ridges on joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap/s2 (1000 nodes, 4000 edges), linux x64 node v26.13.0, AMD EPYC 9V45 96-Core Processor.

The profile of the first route of ridges (238307.8 ms, with the profiler):

| self % | function |
|---:|---|
| 44.7 | partBefore lane-order.ts:102 |
| 14.0 | dist geom.ts:19 |
| 12.9 | partAfter lane-order.ts:83 |
| 9.5 | findRun lane-order.ts:26 |
| 8.2 | holdsInOrder follow.ts:27 |
| 4.7 | mergeSort lane-order.ts:150 |
| 1.7 | (program) :0 |
| 1.2 | placeRoutes lane-order.ts:46 |
| 0.6 | (anonymous) follow.ts:171 |
| 0.4 | (garbage collector) :0 |
| 0.3 | usersOf follow.ts:169 |
| 0.3 | byText compare.ts:5 |
| 0.3 | (anonymous) follow.ts:167 |
| 0.2 | (anonymous) follow.ts:182 |
| 0.2 | turn lane-order.ts:71 |
| 0.1 | #search visibility.ts:578 |
| 0.1 | byBundle lane-order.ts:137 |
| 0.1 | byEdge lane-order.ts:122 |
| 0.1 | slice follow.ts:53 |
| 0.0 | orderLanes segments.ts:243 |
| 0.0 | #down visibility.ts:1084 |
| 0.0 | #walk grid.ts:126 |
| 0.0 | (anonymous) follow.ts:56 |
| 0.0 | orderPlaced lane-order.ts:203 |
| 0.0 | #bucket visibility.ts:395 |

scale: ridges: route 1 of 1: 238307.8 ms.
scale: ridges: checkProperties: 24549.7 ms.
scale: ridges: measureQuality: 9521.6 ms.
scale: ridges: exactStretches.build: 593.5 ms.
scale: ridges: exactStretches.use: 4798.3 ms.

The profile of the steps of ridges, with the profiler:

| self % | function |
|---:|---|
| 34.5 | holds properties.ts:142 |
| 27.6 | dist geom.ts:19 |
| 8.4 | pointBoxDistance geom.ts:124 |
| 6.5 | pointSegmentDistance index.js:170 |
| 5.3 | distancesTo index.ts:281 |
| 3.2 | segmentBoxDistance geom.ts:131 |
| 3.2 | pop index.ts:252 |
| 1.2 | #walk grid.ts:126 |
| 1.0 | checkProperties properties.ts:32 |
| 1.0 | push index.ts:228 |
| 1.0 | (anonymous) quality.ts:53 |
| 0.8 | (garbage collector) :0 |
| 0.6 | guide index.ts:288 |
| 0.5 | paintedSegments quality.ts:49 |
| 0.5 | (anonymous) quality.ts:95 |
| 0.5 | segmentHitsBox geom.ts:81 |
| 0.4 | #bucket visibility.ts:395 |
| 0.4 | #slot grid.ts:33 |
| 0.3 | turns geom.ts:148 |
| 0.3 | (anonymous) grid.ts:204 |
| 0.3 | key quality.ts:46 |
| 0.3 | hitsRect geom.ts:97 |
| 0.2 | #nearestVisible visibility.ts:459 |
| 0.2 | querySegment grid.ts:203 |
| 0.2 | pairDistances index.ts:322 |

scale: ridges: hash ef39f74f680d9015, exact 95d7c82221448840.
