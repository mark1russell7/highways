scale: mlseb on joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap/s2 (1000 nodes, 4000 edges), linux x64 node v26.13.0, AMD EPYC 9V74 80-Core Processor.

The profile of the first route of mlseb (460230.9 ms, with the profiler):

| self % | function |
|---:|---|
| 40.3 | mlsPoint index.ts:73 |
| 33.5 | dist geom.ts:19 |
| 13.0 | (anonymous) index.ts:176 |
| 6.8 | (anonymous) index.ts:93 |
| 1.3 | (anonymous) index.ts:175 |
| 1.1 | (garbage collector) :0 |
| 0.5 | findRun lane-order.ts:26 |
| 0.4 | (anonymous) trace.ts:25 |
| 0.2 | sharedStretches stretches.ts:58 |
| 0.2 | (anonymous) index.ts:166 |
| 0.1 | (anonymous) stretches.ts:154 |
| 0.1 | #take grid.ts:101 |
| 0.1 | placeRoutes lane-order.ts:46 |
| 0.1 | holdsInOrder follow.ts:27 |
| 0.1 | sigOf stretches.ts:89 |
| 0.1 | (anonymous) base.ts:73 |
| 0.1 | (anonymous) base.ts:68 |
| 0.1 | turn lane-order.ts:71 |
| 0.1 | partBefore lane-order.ts:102 |
| 0.1 | (anonymous) stretches.ts:143 |
| 0.1 | #search visibility.ts:578 |
| 0.1 | tangent index.ts:60 |
| 0.1 | outOfBoxes trace.ts:21 |
| 0.1 | partAfter lane-order.ts:83 |
| 0.1 | follow follow.ts:102 |

scale: mlseb: route 1 of 1: 460230.9 ms.
scale: mlseb: checkProperties: 1847 ms.
scale: mlseb: measureQuality: 2514.9 ms.
scale: mlseb: exactStretches.build: 702.7 ms.
scale: mlseb: exactStretches.use: 6763.1 ms.

The profile of the steps of mlseb, with the profiler:

| self % | function |
|---:|---|
| 26.5 | distancesTo index.ts:281 |
| 16.6 | dist geom.ts:19 |
| 13.8 | pop index.ts:252 |
| 6.3 | pointBoxDistance geom.ts:124 |
| 4.7 | push index.ts:228 |
| 4.6 | pointSegmentDistance index.js:170 |
| 3.5 | holds properties.ts:142 |
| 2.8 | guide index.ts:288 |
| 2.2 | (garbage collector) :0 |
| 2.0 | (anonymous) quality.ts:53 |
| 2.0 | segmentBoxDistance geom.ts:131 |
| 1.6 | #bucket visibility.ts:395 |
| 1.5 | #walk grid.ts:126 |
| 1.1 | hitsRect geom.ts:97 |
| 1.1 | #nearestVisible visibility.ts:459 |
| 0.8 | pairDistances index.ts:322 |
| 0.7 | (anonymous) properties.ts:64 |
| 0.6 | segmentHitsBox geom.ts:81 |
| 0.6 | addLink index.ts:95 |
| 0.6 | (anonymous) quality.ts:201 |
| 0.6 | checkProperties properties.ts:32 |
| 0.4 | paintedSegments quality.ts:49 |
| 0.4 | orient index.js:155 |
| 0.4 | key quality.ts:46 |
| 0.4 | turns geom.ts:148 |

scale: mlseb: hash 389e6c0d92e8935b, exact 15f0a1618d15cb06.
