import type { Result } from "../model.ts";

/** This test helper gives a result with no field `room` on its ways. The digests of the `same` tests read it. */
export function withoutRoom(result: Result): Result {
  const { runs, bundles } = result;
  return {
    ...result,
    ...(runs ? { runs: runs.map(({ room: _, ...run }) => run) } : {}),
    ...(bundles ? { bundles: bundles.map(({ room: _, ...bundle }) => bundle) } : {}),
  };
}
