import type { Router } from "../model.ts";
import { cornersRouter } from "./corners.ts";
import { plugsRouter } from "./plugs.ts";
import { sectionsRouter } from "./sections.ts";
import { sharedRouter } from "./shared.ts";
import { straightRouter } from "./straight.ts";
import { byCollection, trunksRouter } from "./trunks.ts";

export { boxExit, straightRouter } from "./straight.ts";
export { plugsRouter } from "./plugs.ts";
export { cornersRouter, type CornersOptions } from "./corners.ts";
export { frameRoutes, type FrameOptions, type InnerMode, type Outside } from "./frames.ts";
export { GUTTER_BEND_COST, gutterRoutes, type GutterEdge, type GutterOptions } from "./gutter.ts";
export { sharedRouter, type ShareCost, type SharedHooks, type SharedNegotiation, type SharedOptions, type SharedSearch, type ShareMerge, type ShareOrder } from "./shared.ts";
export { ANNEALING_DEFAULTS, ANNEALING_SCHEMA, annealingRouter, annealingStrategy, annealWays, type AnnealingOptions } from "./annealing/index.ts";
export { TIGHT_DEFAULTS, TIGHT_FIRSTS, TIGHT_SCHEMA, TIGHT_TIES, tightRouter, tightStrategy, waySlacks, type TightFirst, type TightOptions, type TightTies } from "./tight/index.ts";
export { ATTRACTION_DEFAULTS, ATTRACTION_SCHEMA, attractionRouter, attractionStrategy, type AttractionOptions } from "./attraction/index.ts";
export { sectionsRouter, type SectionsOptions } from "./sections.ts";
export { byCollection, groupEdges, laneOrder, splitPoint, trunksRouter, type TrunkFan, type TrunkSplit, type TrunksOptions } from "./trunks.ts";

/** The built-in routers. The registry `STRATEGIES` holds the same routers as strategies, and the benchmark races the routers of the registry. */
export const ROUTERS: readonly Router[] = [
  straightRouter,
  plugsRouter,
  cornersRouter({ name: "corners", maxNodes: 10_000 }),
  cornersRouter({ name: "corners-smooth", smooth: true, maxNodes: 10_000 }),
  trunksRouter({ name: "trunks", rule: byCollection, maxNodes: 10_000 }),
  sharedRouter({ name: "shared", rule: byCollection, maxNodes: 10_000 }),
  sharedRouter({ name: "shared-all", maxNodes: 10_000 }),
  sectionsRouter({ name: "sections", maxNodes: 100_000 }),
  sectionsRouter({ name: "sections-tree", stretch: Infinity, maxNodes: 100_000 }),
];
