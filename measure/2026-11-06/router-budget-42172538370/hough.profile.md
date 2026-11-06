scale: hough on joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap/s2 (1000 nodes, 4000 edges), linux x64 node v26.13.0, AMD EPYC 7763 64-Core Processor.

The profile of the first route of hough (129557.5 ms, with the profiler):

| self % | function |
|---:|---|
| 39.5 | span index.ts:135 |
| 24.1 | placeOf index.ts:45 |
| 17.5 | houghLines index.ts:118 |
| 14.9 | (anonymous) index.ts:151 |
| 1.3 | (garbage collector) :0 |
| 0.7 | #search visibility.ts:578 |
| 0.3 | #down visibility.ts:1084 |
| 0.3 | (anonymous) index.ts:152 |
| 0.3 | houghPlan index.ts:179 |
| 0.2 | set visibility.ts:1045 |
| 0.1 | #bucket visibility.ts:395 |
| 0.1 | estimate visibility.ts:638 |
| 0.1 | #nearestVisible visibility.ts:459 |
| 0.1 | #walk grid.ts:126 |
| 0.1 | hitsRect geom.ts:97 |
| 0.0 | hits visibility.ts:83 |
| 0.0 | pop visibility.ts:1075 |
| 0.0 | houghPeaks index.ts:58 |
| 0.0 | dist geom.ts:19 |
| 0.0 | CornerGraph visibility.ts:197 |
| 0.0 | (program) :0 |
| 0.0 | #slot grid.ts:33 |
| 0.0 | #down visibility.ts:1172 |
| 0.0 | get topKey visibility.ts:1033 |
| 0.0 | bucketKey visibility.ts:1016 |

scale: hough: route 1 of 1: 129557.5 ms.
scale: hough: checkProperties: 78.6 ms.
scale: hough: measureQuality: 887.2 ms.
scale: hough: exactStretches.build: 882 ms.
scale: hough: exactStretches.use: 7941.1 ms.

The profile of the steps of hough, with the profiler:

| self % | function |
|---:|---|
| 38.5 | distancesTo index.ts:281 |
| 18.4 | pop index.ts:252 |
| 11.7 | dist geom.ts:19 |
| 6.5 | push index.ts:228 |
| 4.3 | guide index.ts:288 |
| 2.5 | #bucket visibility.ts:395 |
| 2.4 | pointSegmentDistance index.js:170 |
| 2.2 | pointBoxDistance geom.ts:124 |
| 1.4 | #nearestVisible visibility.ts:459 |
| 1.4 | #walk grid.ts:126 |
| 1.1 | hitsRect geom.ts:97 |
| 1.0 | pairDistances index.ts:322 |
| 1.0 | (garbage collector) :0 |
| 0.7 | segmentBoxDistance geom.ts:131 |
| 0.6 | addLink index.ts:95 |
| 0.6 | hits visibility.ts:83 |
| 0.6 | #down visibility.ts:1172 |
| 0.5 | (anonymous) quality.ts:201 |
| 0.4 | segmentHitsBox geom.ts:81 |
| 0.3 | (anonymous) quality.ts:53 |
| 0.2 | bucketKey visibility.ts:1016 |
| 0.2 | #slot grid.ts:33 |
| 0.2 | (anonymous) quality.ts:95 |
| 0.2 | orient index.js:155 |
| 0.2 | CornerGraph visibility.ts:197 |

scale: hough: hash d562d2106bdf3e50, exact c20fc374f639a363.
