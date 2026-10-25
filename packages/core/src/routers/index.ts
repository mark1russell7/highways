import type { Router } from "../model.ts";
import { cornersRouter } from "./corners.ts";
import { plugsRouter } from "./plugs.ts";
import { straightRouter } from "./straight.ts";

export { boxExit, straightRouter } from "./straight.ts";
export { plugsRouter } from "./plugs.ts";
export { cornersRouter, type CornersOptions } from "./corners.ts";

/** The routers that the benchmark races. */
export const ROUTERS: readonly Router[] = [
  straightRouter,
  plugsRouter,
  cornersRouter({ name: "corners", maxNodes: 10_000 }),
  cornersRouter({ name: "corners-smooth", smooth: true, maxNodes: 10_000 }),
];
