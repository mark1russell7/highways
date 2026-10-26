Each board is a list of boxes and a list of edges. The page gives them to the `sections` router of `@mark1russell7/highways`:

```ts
import { laneRoutes, runKey, sectionsRouter, segmentsOf } from "@mark1russell7/highways";

const result = sectionsRouter({ name: "sections", margin: 20, stretch: 3, cap: 6 }).route({ nodes, edges });
const runs = segmentsOf(result); // the shared runs, each with the count of its edges
const lanes = laneRoutes(runs, new Set([runKey(run.edges)]), 5); // one open run, with a lane for each edge
const far = result.levels; // the zoom levels: groups of nodes, and the links between groups
```

The core has no renderer. This page draws the result on a canvas.
