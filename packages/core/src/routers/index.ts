import type { Router } from "../model.ts";
import { cornersRouter } from "./corners.ts";
import { plugsRouter } from "./plugs.ts";
import { sharedRouter } from "./shared.ts";
import { straightRouter } from "./straight.ts";
import { byCollection, trunksRouter } from "./trunks.ts";

export { boxExit, straightRouter } from "./straight.ts";
export { plugsRouter } from "./plugs.ts";
export { cornersRouter, type CornersOptions } from "./corners.ts";
export { sharedRouter, type SharedOptions } from "./shared.ts";
export { byCollection, groupEdges, laneOrder, splitPoint, trunksRouter, type TrunksOptions } from "./trunks.ts";

/** The routers that the benchmark races. */
export const ROUTERS: readonly Router[] = [
  straightRouter,
  plugsRouter,
  cornersRouter({ name: "corners", maxNodes: 10_000 }),
  cornersRouter({ name: "corners-smooth", smooth: true, maxNodes: 10_000 }),
  trunksRouter({ name: "trunks", rule: byCollection, maxNodes: 10_000 }),
  sharedRouter({ name: "shared", rule: byCollection, maxNodes: 10_000 }),
  sharedRouter({ name: "shared-all", maxNodes: 10_000 }),
];
