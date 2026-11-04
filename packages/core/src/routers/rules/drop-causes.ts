import type { Point } from "../../geom.ts";
import { crossingsOf } from "./solver.ts";

/** The crossings of a whole board at three moments, as `measureQuality` counts them. */
export interface BoardCounts {
  /** The count of the first routes. */
  readonly first: number;
  /** The count after the pass of crossings of the solver. */
  readonly afterPass: number;
  /** The count after the fix of hard rules. The last guard reads this count. */
  readonly final: number;
}

/** The causes that applied on a board that the last guard dropped for crossings. More than one cause can apply. */
export interface DropCauses {
  /** Two moved routes cross more than their first shapes do, and neither route alone removes that rise. */
  readonly pair: boolean;
  /** The fix of hard rules raised the count of the board, or it left a moved route worse than its first shape. No check of crossings ran after it. */
  readonly fix: boolean;
  /** The pass of crossings stopped at its cap of rounds, with routes still going back. */
  readonly cap: boolean;
  /** The count of the board rose, and the count of the pass, which adds the routes, did not rise. */
  readonly counts: boolean;
  /** Two moved routes fall with each other, and each route counts that fall against its own rises. So no route is worse, and the board rises. */
  readonly shared: boolean;
  /** None of the five causes applied. */
  readonly outside: boolean;
  /** The rise of the count of the board. */
  readonly boardRise: number;
  /** The rise of the count of the pass over the same routes. */
  readonly routeRise: number;
}

/** This function gives the crossings between two routes, with no crossing of a route with itself. */
function between(a: readonly Point[], b: readonly Point[]): number {
  return crossingsOf(a, [b], -1) - crossingsOf(a, [], 0);
}

/** This function reads why a board went above its first count of crossings (RENDER-RULES). It compares each pair with one moved route or two. */
export function dropCauses(first: readonly (readonly Point[])[], final: readonly (readonly Point[])[], capped: boolean, board: BoardCounts): DropCauses {
  const moved = first.map((pts, i) => pts !== final[i]);
  let routeRise = 0;
  let pair = false;
  let fall = false;
  let worse = false;
  for (let i = 0; i < first.length; i++) {
    if (moved[i]) {
      routeRise += crossingsOf(final[i]!, [], 0) - crossingsOf(first[i]!, [], 0);
      if (crossingsOf(final[i]!, final, i) > crossingsOf(first[i]!, final, i)) worse = true;
    }
    for (let j = i + 1; j < first.length; j++) {
      if (!moved[i] && !moved[j]) continue;
      const now = between(final[i]!, final[j]!);
      const rise = now - between(first[i]!, first[j]!);
      routeRise += rise;
      if (moved[i] && moved[j] && rise < 0) fall = true;
      if (moved[i] && moved[j] && rise > 0 && now <= between(first[i]!, final[j]!) && now <= between(final[i]!, first[j]!)) pair = true;
    }
  }
  const fix = board.final > board.afterPass || worse;
  const counts = routeRise <= 0;
  const shared = fall && !worse && !counts;
  return { pair, fix, cap: capped, counts, shared, outside: !pair && !fix && !capped && !counts && !shared, boardRise: board.final - board.first, routeRise };
}
