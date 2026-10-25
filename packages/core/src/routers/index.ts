import type { Router } from "../model.ts";
import { straightRouter } from "./straight.ts";

export { boxExit, straightRouter } from "./straight.ts";

/** The routers that the benchmark races. */
export const ROUTERS: readonly Router[] = [straightRouter];
