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
export { CANAL_DEFAULTS, CANAL_SCHEMA, canalHubs, canalRouter, canalStrategy, canalWays, halfPower, type CanalHub, type CanalOptions } from "./canals/index.ts";
export { ADAM_DEFAULTS, ADAM_SCHEMA, adamRouter, adamRoutes, adamStrategy, type AdamOptions } from "./adam/index.ts";
export { REROUTE_DEFAULTS, REROUTE_SCHEMA, rerouteRouter, rerouteStrategy, rerouteWays, turnsOf, type RerouteOptions } from "./reroute/index.ts";
export { TIGHT_DEFAULTS, TIGHT_FIRSTS, TIGHT_SCHEMA, TIGHT_TIES, tightRouter, tightStrategy, waySlacks, type TightFirst, type TightOptions, type TightTies } from "./tight/index.ts";
export { ATTRACTION_DEFAULTS, ATTRACTION_SCHEMA, attractionRouter, attractionStrategy, type AttractionOptions } from "./attraction/index.ts";
export { sectionsRouter, type SectionsOptions } from "./sections.ts";
export { boxField, keepRules, passesThrough, relaxRoutes, resample as resampleRoute, simplify, type BoxField, type RelaxOptions } from "./physics.ts";
export { REPEL_DEFAULTS, REPEL_SCHEMA, repelRouter, repelStrategy, type RepelOptions } from "./repel/index.ts";
export { SPRINGS_DEFAULTS, SPRINGS_SCHEMA, springsRouter, springsStrategy, type SpringsOptions } from "./springs/index.ts";
export { NUDGE_DEFAULTS, NUDGE_SCHEMA, nudgeRoutes, nudgeRouter, nudgeStrategy, spread, type NudgeOptions } from "./nudge/index.ts";
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
