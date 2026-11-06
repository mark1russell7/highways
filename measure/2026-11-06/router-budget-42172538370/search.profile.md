scale: search on joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap/s2 (1000 nodes, 4000 edges), linux x64 node v26.13.0, AMD EPYC 9V45 96-Core Processor.

The profile of the first route of search (348264.6 ms, with the profiler):

| self % | function |
|---:|---|
| 39.6 | partBefore lane-order.ts:102 |
| 11.8 | partAfter lane-order.ts:83 |
| 8.8 | dist geom.ts:19 |
| 4.9 | mergeSort lane-order.ts:150 |
| 3.8 | findRun lane-order.ts:26 |
| 3.4 | (anonymous) bundles.ts:120 |
| 3.2 | holdsInOrder follow.ts:27 |
| 3.1 | overlap index.ts:126 |
| 2.0 | #search visibility.ts:578 |
| 1.9 | (program) :0 |
| 1.7 | routeKeys bundles.ts:142 |
| 1.2 | scoreOfRoutes index.ts:135 |
| 1.1 | mergeAngle bundles.ts:214 |
| 1.1 | (garbage collector) :0 |
| 0.9 | ambiguity bundles.ts:57 |
| 0.9 | #down visibility.ts:1084 |
| 0.9 | (anonymous) follow.ts:171 |
| 0.8 | turn lane-order.ts:71 |
| 0.8 | key routes.ts:50 |
| 0.7 | placeRoutes lane-order.ts:46 |
| 0.5 | byBundle lane-order.ts:137 |
| 0.5 | drawnSegments routes.ts:56 |
| 0.4 | set visibility.ts:1045 |
| 0.4 | (anonymous) follow.ts:167 |
| 0.4 | #bucket visibility.ts:395 |

scale: search: route 1 of 1: 348264.6 ms.
scale: search: checkProperties: 1267.4 ms.
scale: search: measureQuality: 2554.6 ms.
scale: search: exactStretches.build: 583 ms.
scale: search: exactStretches.use: 5440.3 ms.

The profile of the steps of search, with the profiler:

| self % | function |
|---:|---|
| 26.9 | distancesTo index.ts:281 |
| 12.7 | dist geom.ts:19 |
| 12.5 | pop index.ts:252 |
| 9.9 | pointBoxDistance geom.ts:124 |
| 6.6 | pointSegmentDistance index.js:170 |
| 4.7 | holds properties.ts:142 |
| 3.9 | push index.ts:228 |
| 3.3 | guide index.ts:288 |
| 2.3 | segmentBoxDistance geom.ts:131 |
| 2.3 | (garbage collector) :0 |
| 1.7 | #bucket visibility.ts:395 |
| 1.6 | #walk grid.ts:126 |
| 1.5 | (anonymous) quality.ts:53 |
| 0.8 | #nearestVisible visibility.ts:459 |
| 0.8 | hitsRect geom.ts:97 |
| 0.7 | pairDistances index.ts:322 |
| 0.6 | checkProperties properties.ts:32 |
| 0.5 | addLink index.ts:95 |
| 0.5 | paintedSegments quality.ts:49 |
| 0.5 | (anonymous) quality.ts:95 |
| 0.5 | #slot grid.ts:33 |
| 0.5 | key quality.ts:46 |
| 0.4 | (anonymous) grid.ts:204 |
| 0.4 | turns geom.ts:148 |
| 0.3 | steps grid.ts:226 |

scale: search: hash 6269afee2bbd1152, exact d2fdf933c6e41c31.
