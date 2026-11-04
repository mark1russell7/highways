import { canonicalConfig, checkConfig, configId } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { exactBoard } from "./bench/screen/exact-set.ts";
import { resultHash } from "./bench/screen/exercise.ts";
import { MEMBER_FORMS, portfolioMember } from "./portfolio/members.ts";
import { configOfMember, MEMBER_MISFITS, routeConfig, routeSpace } from "./route-space.ts";
import { asRouter } from "./strategies/model.ts";

// MEMBER-POINTS: the point of each member of the portfolio in `routeSpace`. Made-up boards only.

const names = Object.keys(MEMBER_FORMS);
const points = names.map((name) => [name, configOfMember(name)] as const);

describe("configOfMember (MEMBER-POINTS)", () => {
  // On the 2 smaller boards alone, 9 forms give the hash of their base. On all 4 boards, only `w3d:cubu+stretch` does.
  it("gives the routes of the member of the same name, on four boards", { timeout: 300_000 }, () => {
    const boards = [exactBoard("clustered", 10, 0), exactBoard("hubs", 18, 1), exactBoard("clustered", 30, 2), exactBoard("hubs", 40, 3)];
    const differ: string[] = [];
    for (const [name, point] of points) {
      if (!point.ok) continue;
      for (const g of boards) {
        if (resultHash(routeConfig(g, point.config)) !== resultHash(asRouter(portfolioMember(name)!).route(g))) differ.push(`${name} on ${g.nodes.length} nodes`);
      }
    }
    expect(differ).toEqual([]);
  });

  it("has a row of MEMBER_MISFITS for each refused form, and no other row but portfolio", () => {
    const refused = points.flatMap(([name, point]) => (point.ok ? [] : [name]));
    expect(refused.sort()).toEqual(Object.keys(MEMBER_MISFITS).filter((n) => n !== "portfolio").sort());
    for (const name of refused) expect(configOfMember(name)).toEqual({ ok: false, reason: MEMBER_MISFITS[name] });
  });

  it("gives canonical configs with no break, and one id for each point", () => {
    const ids = new Set<string>();
    for (const [name, point] of points) {
      if (!point.ok) continue;
      expect(checkConfig(routeSpace, point.config), name).toEqual([]);
      expect(canonicalConfig(routeSpace, point.config), name).toEqual(point.config);
      ids.add(configId(routeSpace, point.config));
    }
    expect(ids.size).toBe(points.filter(([, point]) => point.ok).length);
  });

  it("gives a reason for `portfolio` and for an unknown name", () => {
    expect(MEMBER_FORMS["portfolio"]).toBeUndefined();
    expect(configOfMember("portfolio")).toEqual({ ok: false, reason: MEMBER_MISFITS["portfolio"] });
    expect(configOfMember("no-such-member")).toEqual({ ok: false, reason: "The name no-such-member is not a member of MEMBER_FORMS." });
  });
});
