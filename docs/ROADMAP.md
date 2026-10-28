# Roadmap

This file is the plan of `highways`. Each item has an id, a status and the items that it waits for. The live tracker shows the same items.

Status: `done`, `active`, `blocked`, `later`.

## Shipped

| Id | Item | Shipped | Link |
|---|---|---|---|
| H0 | The geometry, the fixtures from 10 to 100 000 nodes, the hard rules, the metrics and a straight-line control. The workflow `Bench` races the routers in CI. | 2026-10-25 | `5c05df7` |
| H1 | Plugs that face the other end, the inflection curve and the corner router. | 2026-10-25 | `5c05df7` |
| H2 | Bundles: the router `trunks` (bundles by a rule), the router `shared` (shared ways in lane order) and the segments with a count. | 2026-10-25 | `c910fb7` |
| H3 | The tree of sections, the hubs and the zoom levels. The profile fix makes each router 2 to 2.5 times faster at 10 000 nodes. | 2026-10-25 | `fa1dd82` |
| SITE | The public site routes the fixtures in the browser. The examples page shows boards of made-up data. | 2026-10-25 | #3, #5 |
| REL1 | The core is on npm as `@mark1russell7/highways`. Version 0.1.1 adds `laneRoutes` and `runKey`. | 2026-10-25 | #4, #6 |
| ER2 | Version 0.1.2: a level link goes from box to box around the other items. The far view draws calm outlines. | 2026-10-26 | #7 |
| HW0 | This roadmap and its tracker. | 2026-10-26 | #11 |
| QFIX | The case boards and the measures of the faults of the links: through, out and back, worst detour and outside. The benchmark reports them. | 2026-10-26 | #12 |
| PERF1 | The level links are fast again, with the same output. On `mid-clustered`, the level links take 307 ms, not 891 ms. The full route takes 935 ms, not 3 416 ms. | 2026-10-26 | #13 |
| ER3a | In the far view of a dense board, the level links go around the groups. Level through on `case-dense-groups`: 26 before, 0 after. | 2026-10-26 | #16 |
| ER3b | A route of `sections` skips a hub that takes it away from its target. Out and back on `case-hub-chain`: `sections` 6 to 0, `sections-tree` 25 to 0. | 2026-10-26 | #14 |
| REL2 | Version 0.1.3 on npm: PERF1, ER3a, ER3b and the measures of QFIX. | 2026-10-26 | #17 |
| ER3c | On a level with many groups, the level links go through the groups, not around the outer edge. Level outside on `case-many-groups`: 4 before, 0 after. | 2026-10-26 | #19 |
| CURVE | Curve types for the routes: straight, rounded, spline and arc, as segments for any renderer. With the free space, no curve goes through a box. | 2026-10-26 | #21 |
| ROOM | `roomDemand` gives the room that each gap needs, and `openGaps` opens it. On `packedGridBoard`, links through boxes: 62 before, 0 after, for 50% more area. | 2026-10-26 | #22 |
| REL3 | Version 0.1.4 on npm: ER3c, CURVE and ROOM. | 2026-10-26 | #23 |
| STRAT | One strategy interface and one registry for the steps `router`, `curve` and `room`. The benchmark and the site list the registry. | 2026-10-26 | #25 |
| ROOM-A | The area curve of `maxGrowth` on `packedGridBoard`. The area goes from 1.13 at 0 to 1.50 at 0.30, then stays flat. At 0.25, the area is 1.46, with 2 lane routes through a box. | 2026-10-26 | #26 |
| ROOM-C | `gapLanes` gives each link of the far view its own lane in a gap, with three lane orders. The order `crossings` has 467 crossings, against 585 for the order of the list. Shared lines hide crossings and show 276. Spacing 2 to 8 changes the crossings less than 5%. | 2026-10-26 | #26 |
| ROOM-D | The option `passes` of `roomDemand`. Two passes at gutter 8: worst detour 2.03, not 2.09, for 4% more area. The mean detour stays 1.32 for each gutter and each number of passes. | 2026-10-26 | #26 |
| REL4 | Version 0.1.5 on npm: STRAT and the options of ROOM-A, ROOM-C and ROOM-D. The routes do not change. | 2026-10-26 | #27 |
| CUSTOM | Options for the grouping rule (the step `group`), the levels, the hub limit, the far-view thresholds and the limits of the tree. With the defaults, the output does not change. On `case-hub-chain`, hub limit 1.5 gives a worst detour of 1.39, not 1.78. | 2026-10-26 | #28 |
| REL5 | Version 0.2.0 on npm: CUSTOM. MINOR, because the type `Step` gains the step `group`. The routes do not change. | 2026-10-26 | #29 |
| OPTS | Each strategy declares its options in `schema`: 74 declarations on 17 built-in strategies. A sweep from the declarations gives the hub-limit table of CUSTOM. The defaults do not change. | 2026-10-26 | #31 |
| MEAS0 | Research: [the measures of a good result](research/MEASURES.md). The note gives 59 measures in six areas, 35 of them new to the bench, and 6 proposed hard rules. | 2026-10-26 | #32 |
| ER3d | The measures split level through into unavoidable and avoidable links. A link through a far box gets a second way (`throughCost`, default 8). On `mid-clustered`, avoidable level through: 114 before, 54 after. The level links take 8% more time. | 2026-10-26 | #33 |
| HWC | `highwayCurves` bends the lanes of a bundle as one, with concentric arcs. On `shared` and `case-dense-groups`, worst lane spacing error: 13.6% before, 0.8% after, with 0 tangent breaks. | 2026-10-26 | #36 |
| ROOM2 | `levelRoom` gives each zoom level the gaps of its own level links. On `nestedGridBoard`, level through: 6 and 36 before, 0 after. The area grows 1.35x, with 0 order changes and 0 shift. | 2026-10-26 | #37 |
| CURV-R | Research: [curve families and their math](research/CURVES.md). The note gives 16 families with their curvature, offsets and clearance, 5 of them with exact offsets. It ranks them for 3 uses and gives an 8-step build order for CURV2. | 2026-10-27 | #41 |
| HWC-B | `laneOrder: "bundle"` keeps two edges on one side through their common stretch. On `shared-all` and `case-many-groups`, end crossings: 2301 before, 687 after. Body crossings: 12 before, 0 after. | 2026-10-26 | #40 |
| GRP-R | Research: [grouping rules for the zoom levels](research/GROUPING.md). The note gives 19 rules in four kinds and a build order of 5 rules for GRP2. A guillotine cut that reads the links cuts fewer links than the quadtree at the far view on 8 of 10 boards. | 2026-10-26 | #39 |
| HWC-C | `leave: "part"` lets each lane of a trunk leave where its way parts, so few branches turn back. On `trunks-all` and `case-dense-groups`, worst lane spacing error: 133.2% before, 0.8% after. Body crossings: 3 before, 0 after. | 2026-10-27 | #44 |
| BENCH-CI | The workflow `Bench` races the routers in parts that run at the same time, with a time limit for each cell. Before, no push run on `main` finished: 0 of 25 since `fa1dd82`, each over 60 min. After, a run to 10 000 nodes finishes in 12.4 min. | 2026-10-27 | #45 |
| MEAS1 | `runSuite` puts the 10 measures of the short list of MEAS0 and the 6 proposed rules in the bench. The suite measures 5 seeds of each family to 1 000 nodes and 1 seed above. Each step gets the median, the IQR and a Pareto front. Up to 100 nodes, each of the 6 rule counts is 0 for each built-in strategy. | 2026-10-27 | #35 |
| SEC-V | A level link between two items that touch keeps two points, so it obeys the rule `link-ends`. On `mid-clustered` seed 4, the violations of `sections` and of `sections-tree` are 2 each before, 0 after. | 2026-10-27 | #46 |
| GRP2 | The grouping rules `kd` and `cut` are strategies of the step `group`. At the far view, `cut` cuts fewer links than the quadtree on 8 of 10 boards and more on none. On `case-dense-groups`, its cut share is 0.370 against 0.430. | 2026-10-27 | #48 |
| CURV2 | The curves `smooth` and `clothoid` have no jump of the curvature at a corner. The option `jog` gives quintic S curves: on `shared-all` and `case-hub-chain`, 251 of 267 have no jump of the curvature, with 0 tangent breaks. | 2026-10-27 | #50 |
| HWC-D | The room option `bends` grows the gaps where the legs of a bundle are too short for its arcs. On `shared-all` and `case-many-groups`, against ROOM alone: under min 137 before, 120 after. Room-fixable arcs: 49 before, 3 after. The area grows by 4.6%. | 2026-10-27 | #52 |
| EX2 | The page `compare.html` puts the strategies of one step side by side, with their measures, the best values and the Pareto front. The 9 router panels of a board of 100 nodes take 826 ms. | 2026-10-27 | #53 |
| REL6 | Version 0.3.0 on npm: OPTS to EX2. MINOR, because the type `CurveType` gains `smooth` and `clothoid`. The default routes change for HWC-B, HWC-C, ER3d and SEC-V. | 2026-10-27 | #54 |
| EX2-FIX | On the 5 boards of the compare page, 68 of 78 controls change the drawing or the measures. A test lists the other 10 with their reason. | 2026-10-27 | #55 |
| HWY-R | Research: [ways to make highways](research/HIGHWAYS.md). The note gives 60 ideas in four groups, 17 of them ours and 11 hybrids. It gives a build order of 14 steps for BUILD-W. | 2026-10-27 | #58 |
| SCREEN | The screen gives one JSON record for each run on the 14 boards of `screen-v1`, and its summary. In CI, the 9 routers give 126 records in 8.3 s. | 2026-10-27 | #59 |
| EDA-R | Research: [routing from other fields](research/FIELDS.md). The note gives 51 ideas from six fields, 20 of them `ours` or hybrids. A constrained left-edge track rule gives up to 26% fewer gap lanes at the same crossings. | 2026-10-27 | #61 |
| WILD-R | Research: [new ideas for each step](research/IDEAS.md). The note gives 60 ideas, 47 of them new to the note and 10 hybrids, from 16 far fields. It gives a build order of 14 steps for BUILD-W. | 2026-10-27 | #60 |
| NAT-R | Research: [ideas from nature](research/NATURE.md). The note gives 49 ideas, 7 of them ours and 25 hybrids, in [a catalog](research/ideas/nature.json). It gives a build order of 14 ideas for BUILD-W. | 2026-10-27 | #62 |
| RULE-R | Research: [rules, forces and constraints for the routes](research/RULES.md). The note gives 53 ideas in seven areas, 13 of them ours and 25 hybrids. It gives a build order of 15 steps for BUILD-W. | 2026-10-27 | #63 |
| HWY-STEP | The step `highway` gives a plan as data, and `follow` routes it. `keys`, `shared-ways` and `corridors` plug in, and the 16 digests of the routers stay the same. | 2026-10-27 | #67 |
| REL7 | Version 0.4.0 on npm: EX2-FIX, SCREEN, the record field `tolerance` and HWY-STEP. MINOR, because the type `Step` gains `highway`. The default routes do not change. | 2026-10-27 | #68 |
| IDEA0 | [The idea catalog](research/CATALOG.md): 273 records, 24 duplicate groups, 248 distinct ideas and seven waves for BUILD-W. A test checks the schema, the links and the measure ids. | 2026-10-27 | #69 |
| BUILD-W1B | Plug and lane options, off by default. WILD-001 (`plugs: side`) is kept: R3 falls 11% to 33%. EDA-004 (`tracks: left-edge`) is kept: lanes fall 5% to 26%. WILD-002 and NAT-031 (`plugGap`) are dropped: R1 grows more than 2%. | 2026-10-27 | #70 |
| BUILD-W1A | The bundle measures B2, B3 and B6, and the order fragility W3, in the screen. RULE-046 (the repair step) is kept: the hard breaks fall to 0 on each input. WILD-053 and WILD-056 are dropped: the fragility is 0 for each router. | 2026-10-27 | #71 |
| BUILD-W1C | Cost, order and merge options of `shared` and `trunks`, off by default. With `passes: 3` (HWY-039), B1 of `shared-all` rises on 4 boards, and the B3 q95 does not rise. NAT-035 (`merge: snell`) cuts the B6 max 8% to 27%. NAT-024 is kept. EDA-030 is dropped. | 2026-10-27 | #72 |
| REL8 | Version 0.4.1 on npm: the kept ideas of wave 1 (free plugs, lane tracks, the repair step, rip-up passes, Snell merges, pioneer order) and the bundle measures. PATCH: each is off by default, and the default routes do not change. | 2026-10-27 | #74 |
| BUILD-W2B | Five highway strategies on the plans of `shared-ways` and `corridors`. HWY-043 (`weiszfeld`) is kept: the B6 max falls 20% on dense-groups. The zipper (NAT-022) adds B1 on 4 boards but fails the q95. HWY-050, HWY-015 and HWY-056 are dropped. | 2026-10-27 | #76 |
| BUILD-W2A | Gates after a highway plan: `gateStrategy` and the strategies `corridors+breakeven`, `corridors+stretch`, `corridors+ambiguity`, `corridors+hysteresis` and `corridors+ids`. The screen option `edits` measures Z10 over seeded edits. HWY-046, HWY-047, HWY-048 and HWY-049 are dropped: B1 falls, or the gate removes no edge. HWY-054 is screened: each matched highway keeps its id, and the warm start is open. | 2026-10-27 | #75 |
| BUILD-W2C | Six highway finders: `quickbundles`, `road-classes`, `flow-field`, `wspd`, `od-cells` and `select`. No finder beats `shared` on 3 of 4 boards, alone or with the gate `stretch`. `road-classes` has the largest B1, and it wins on 2 boards. HWY-026, HWY-034, EDA-046, HWY-018, HWY-045 and EDA-033 are dropped. `zipper+stretch` and `level-links+stretch` stay dropped. | 2026-10-27 | #78 |
| PROMO | The promotion rule (`docs/PROMOTION.md`): a kept option becomes the default, or a rule of the selector, only after a measured win on the whole corpus and on fresh seeds. Shared with packing and the joint selector. | 2026-10-27 | #77, #79 |
| REL9 | Version 0.4.2 on npm: the highway strategies and gates of wave 2, Weiszfeld meeting points and the edit screen. PATCH: each is off by default, and the default routes do not change. | 2026-10-27 | #80 |
| CONTRACT-FIT | The fit test of the input and record types to `@mark1russell7/layout-contract` 0.1.0 (a devDependency at commit `52fefbb`). It lists 9 gaps, G1 to G9, in `docs/LAYOUT-RECORDS.md`. `TOLERANCE` equals `DEFAULT_TOLERANCE.through`. | 2026-10-27 | #82 |
| CONTRACT-GAPS | The contract 0.2.0 (commit `69933a6`) closes G1, G2, G3, G6 and G8. `highways` closes G4 (`locked` is a boolean) and G5 (`inputGraph` takes a `RouteInput`). The joint measures with a floor of 0 agree with the floors of `docs/PROMOTION.md`. G7 and G9 stay open. | 2026-10-27 | #83 |
| BUILD-W3A | Five clustering finders: `mingle`, `spiral`, `flow-clusters`, `traclus` and `diffusion`. No finder beats `shared` on 3 of 4 boards, alone or with the gate `stretch`. `diffusion` (HWY-020) wins 2: B1 rises on 4 boards and R1 falls 22% to 84%. HWY-003, HWY-017, EDA-035, HWY-023, HWY-025 and HWY-020 are dropped. | 2026-10-27 | #84 |
| BUILD-W3B | Three highway strategies (`nested`, `lanes`, `growth`), the options `reuse` and `capacity` of `shared`, and an exact reference of HWY-040 with HiGHS. The option `capacity` (HWY-016) and the exact reference are kept. On 3 tiny boards, `shared` reaches 4% of the optimum B1. `growth` has the largest B1 but wins 0 of 4. `lanes` (HWY-051) is dropped. | 2026-10-27 | #85 |
| MEAS3A | The screen gives ten more measures of MEAS0: `R12`, `R14`, `B5`, `B7`, `B8`, `B9`, `M1`, `M4`, `Z2` and `Z9`. On screen-v1, `R14` is 0.07 to 0.89 and `M4` is 0 on 21 of 70 records. `M1` stays at 1 to 1.005. | 2026-10-27 | #88 |
| BUILD-W3C | Six highway finders: `edge-paths`, `soft-keys`, `hough`, `ridges`, `hdbscan` and `hub-arcs`. No finder beats `shared` on 3 of 4 boards, alone or with the gate `stretch`. `hub-arcs` (HWY-042) with the gate wins 2: the paired B1 ratio is 1.07 and the q95 ratio 0.96. HWY-012, HWY-019, HWY-024, HWY-032, HWY-028 and HWY-042 are dropped. | 2026-10-27 | #89 |
| REL10 | Version 0.5.0 on npm: the strategies of wave 3, the exact reference, the measures of MEAS3A and the types of layout-contract 0.2.0. MINOR: `LayoutCell.containerSize` gets the values `freeHeight` and `freeArea`, and `locked` widens to `boolean`. The default routes do not change. | 2026-10-28 | #90 |
| REL11 | Version 0.5.1 on npm: the strategies of waves 3D to 3F, the portfolio router `routePortfolio` (opt-in), the activation measures and the bounds. PATCH: new opt-in exports and a run-time dependency on `@mark1russell7/layout-contract` `^0.2.6`. The default routes do not change. | 2026-10-28 | #115 |
| TIE-GRID | The core takes `@mark1russell7/layout-contract` 0.2.7. `compareMeasure` compares on the integer grid of the records, so a live pick equals the replay of its record. PATCH: a dependency change. Picks at a tie can change. One set changes: under `collection` at cap 1.1, 13 to 24 nodes, `trunks-tree-bf08` moves from place 5 to place 2. | 2026-10-28 | #119 |
| RESCREEN-M3A | The ideas of waves 1 to 3 again, on the wins of MEAS3A. 8 of 27 records are at least as good as their baseline on 3 or more boards. No stage or verdict changes. Each built strategy also gets the part of the gap to the exact B1 that it closes on `tiny-uniform`. `growth` closes the most of the built-ins, a median of 0.51. | 2026-10-27 | #92 |
| BUILD-W3D | Six highway finders: `divided`, `hierarchy`, `fdeb`, `mesh`, `kdeeb` and `cubu`. `divided` (HWY-011) wins 3 of 4 boards against `shared`, but by very small margins that come from its base `shared-ways`. It is kept. No other finder wins more than 1, alone or with the gate `stretch`. HWY-001, HWY-002, HWY-004, HWY-006 and HWY-007 are dropped. | 2026-10-27 | #93 |
| MEAS2 | The set `exact-v1` (4 classes of 10 boards, 10 nodes) with 240 proven optima of the exact model, and the gap closed (B10) in the screen. At 300 s for each solve, 10 nodes prove on each class and rule, and 14 nodes for the rule `collection`. The best median is 0.595 (0.508 to 0.634), from `growth`. [`GAP.md`](research/GAP.md) ranks each strategy. | 2026-10-28 | #94 |
| WIN-RES | A win must beat the baseline by more than the resolution. `compareMeasure` gives `"better"`, `"worse"` or `"tie"` with the `minEffect` of each measure, and a tie is not a win. With the strict rule, HWY-011 and HWY-016 change from kept to dropped. NAT-022 and WILD-037 reach 3 boards, but their guards keep them dropped. | 2026-10-28 | #96 |
| BUILD-W3E | Seven highway finders: `mlseb`, `sbeb`, `areas`, `confluent`, `power`, `crossbars` and `frechet`. No finder wins more than 2 of 4 boards against `shared`, alone or with the gate `stretch`. Each win of `power` and `areas` is a tie on a board where `shared` has 0 runs. HWY-008, HWY-009, HWY-010, HWY-013, HWY-014, HWY-022 and HWY-027 are dropped. | 2026-10-27 | #97 |
| G10 | The contract 0.2.2 has `compareMeasure` and `minEffectOf`. The core has `layout-contract` ^0.2.3 as a development dependency and keeps its own copy. A test shows that the copy and the contract give the same result on the cases of `compare.test.ts` and on 5000 seeded random pairs. | 2026-10-27 | #99 |
| ORACLE | [The oracle bound](research/ORACLE.md): the best strategy of each input, over 228 strategies. On `exact-v1`, the oracle closes 0.947 of the gap, against 0.595 for the best single strategy. On `screen-v1`, the guarded oracle B1 is 39% to 534% above the best single strategy on 4 of 4 boards. A selector by class keeps -32% of the gain on `exact-v1`. | 2026-10-27 | #100 |
| BUILD-W3F | Seven highway finders: `spectral`, `resistance`, `link-communities`, `territories`, `consensus`, `p-hub` and `scale-space`. No finder beats `shared` on more than 2 of 4 boards, alone or with the gate `stretch`. All seven are dropped. `p-hub` closes 0.356 of the gap on tiny-uniform. | 2026-10-27 | #95 |
| PORTFOLIO | [The portfolio of strategies](research/PORTFOLIO.md): `shared` and k more strategies, and the output with the best guarded B1. On `exact-v1`, k = 3 keeps 6% of the oracle gain, because B10 needs the optimum. On `screen-v1`, k = 3 keeps 72%, but at most 4.3% over the best single strategy on each board. At 40 nodes, it takes 42 ms one after the other. | 2026-10-27 | #101 |
| PORTFOLIO-RULE | [The rule of the caller](research/PORTFOLIO.md#the-rule-of-the-caller-portfolio-rule): each reversed pair of B1 and B10 has another rule or another cap. With the rule of the caller and the one cap 1.5, the whole pool reaches the oracle. k = 3 keeps 47% of the gain for `all` and 12% for `collection`. | 2026-10-27 | #105 |
| GUARDS | Two guards in [the promotion rule](PROMOTION.md#activation), with the same text as packing and layout-contract. A verdict counts only when the candidate is exercised. Candidates with the same `outputHash` on each decision input count as one output group. | 2026-10-28 | #102 |
| ACTIVATION | Each screen record gets its `outputHash` and the move counts of its strategy. A verdict counts only when a candidate is exercised on a decision board. Of 289 strategies, 17 are silent on the static screen. 15 of them go to a rebuild wave. The edit screen of the gate `ids` shows its move. No verdict changes. | 2026-10-28 | #107 |
| EXACT-BOUNDS | [The bounds of the gap closed](research/BOUNDS.md) at 18, 24 and 40 nodes and at the caps 1.1, 1.25 and 1.5, from 720 solves. The intervals are narrow: the median width of the first 5 is 0.1 or less. The [portfolio](research/PORTFOLIO.md#the-portfolio-at-each-cap-exact-bounds) gets a curve and greedy sets for each rule and cap. | 2026-10-28 | #110 |
| PORTFOLIO-API | [The opt-in portfolio router](research/PORTFOLIO.md#the-portfolio-router-portfolio-api) `portfolio`: `shared` and the greedy set of the size band, rule and cap of the caller, with the shared combinator of layout-contract. On the held-out seeds, k = 5 keeps 4% to 100% of the oracle gain. At 40 nodes, k = 3 takes 51 to 176 ms. | 2026-10-28 | #112 |
| PORTFOLIO-FIT | [One key and a deterministic default](research/PORTFOLIO.md#the-fit-of-the-router-portfolio-fit) for the router `portfolio`. The router and the offline choice use one guard and `selectBest`: 0 of 3 740 winners differ. The core imports layout-contract. Without `k`, the router runs a fit with a node limit for each member, at 6 to 46 ms (median) up to 40 nodes. | 2026-10-28 | #114 |
| PORTFOLIO-SPEED | [A cheaper key and two bands above 40 nodes](research/PORTFOLIO.md#the-speed-of-the-router-portfolio-speed) for the router `portfolio`. One A* search for each terminal gives the same stretch, to 1e-15. The setup at 100 nodes goes from 172 to 25 ms. At 41 to 64 nodes, the fit runs one member at the cap 1.5, at 39 to 46 ms. | 2026-10-28 | #118 |
| CALIBRATION | [A Brier score of the predictions](#calibration): 229 claims of 54 items score 0.177. Quality and size claims hit less than their confidence, and correctness and build claims hit more. | 2026-10-28 | #120 |
| SHARED-RULE | The 16 shared sections of `docs/PROMOTION.md` sit between markers. `docs/shared.lock.json` holds their hashes, and `scripts/check-shared.mjs` fails `pnpm test` on drift. The win test gets one sentence: the same machine times the candidate and the default. | 2026-10-28 | #122 |
| FIT-COST | [The cost of each member](research/PORTFOLIO.md#the-cost-of-each-member-fit-cost) in the fit of the router `portfolio`. In the router, a member takes 1.06 to 1.17 times its run alone, and 0.97 to 1.03 times its run and its key. The fit uses the measured key at the target 42 ms. On the test seeds, the median is 48 ms or less in each of 48 cells. | 2026-10-28 | #123 |
| REL12 | Version 0.6.0 on npm. MINOR: the default of `routePortfolio` changes (#118, #119, #123). [The defaults of 0.5.1 and 0.6.0](research/PORTFOLIO.md#the-defaults-of-051-and-060) gives the old and the new members. New export `exactStretches`. | 2026-10-28 | #124 |
| PROFILES | The shared block "Caller profiles" from layout-contract #30: a guard applies only to the inputs that declare its property. highways has only the profile `all`. | 2026-10-28 | #125 |
| HASH-LAZY | [The hash of the router](research/PORTFOLIO.md#the-hash-of-the-router-hash-lazy) `portfolio`. With the new default `hashes: "pick"`, only a pick that moves hashes the base and the winner. A member takes 1.01 to 1.07 times its run alone. The fit target goes to 45 ms. 5 shares get their value of 0.5.1 again. | 2026-10-28 | #127 |
| REL13 | Version 0.7.0 on npm. MINOR: the default fit and the default trace of `routePortfolio` change (#127). [The defaults of 0.6.0 and 0.7.0](research/PORTFOLIO.md#the-defaults-of-060-and-070) gives the members that change. | 2026-10-28 | #128 |
| XPLAT-HASH | [The routes on each platform](research/XPLAT.md#the-same-routes-on-each-platform-xplat-hash). The node version is the axis, not the system. The compare function of `orderLanes` is not a total order. V8 13.6 and 14.6 sort 3 to 7 items in other sequences, so 259 runs of 3 to 7 lanes get another lane order. No point moves. `scripts/check-math.mjs` holds the 187 transcendental Math calls. | 2026-10-28 | #129 |
| LANE-ORDER | [The lane order](research/XPLAT.md#the-lane-order-lane-order). `orderLanes` and `laneOrderOfRun` sort with a merge sort of the package, so node 24 and node 26 give the same lane order. 5 of 27 digests change. `B5` goes from 295 to 300 on the routers and from 6559 to 6552 on the highways. LANE-STRETCH is to remove the cycles. | 2026-10-28 | #130 |
| REL14 | Version 0.8.0 on npm. MINOR: the default lane order of shared runs changes, so each engine gives the same order (#130). No route point moves. [The lane order](research/XPLAT.md#the-lane-order-lane-order) gives the changes. | 2026-10-28 | #131 |
| CI-AUTO | A pull request that changes the core source starts the `xplat` matrix and the screens of the routers and of the highways by itself. Thus it needs no manual dispatch. | 2026-10-28 | #134 |
| ROUTE-SCALE | [The dense board](research/SCALE.md#the-dense-board-route-scale). A route of `shared` on 1000 boxes and 4000 edges goes from 302 s to 21 s, and `portfolio` from 300 s to 28 s on the same CPU. Each sorted list of link users gets a number one time, and the lane order skips the distance of a point to itself. No output byte changes. | 2026-10-28 | #132 |
| REL15 | Version 0.8.1 on npm. PATCH: ROUTE-SCALE (#132) routes a dense board of 1000 boxes approximately 10 times faster with `shared`, `shared-all` and `portfolio`. The output does not change. | 2026-10-28 | #135 |
| CORPUS-SEEDS | [The corpus `screen-v2`](research/CATALOG.md#the-corpus-screen-v2-corpus-seeds): the 6 families of `screen-v1` with 10 seeds each, and the split file `corpus-split/1`, which holds out the seeds 7 to 9. The seeds 0 to 2 give the boards and the records of `screen-v1`. With 10 seeds, `territories` leaves the highway front. | 2026-10-28 | #136 |
| VERDICT | The shared block "The verdict over families" from layout-contract #49. The family is the unit of a verdict, and a verdict counts only when it holds under both weightings. Step 1 of SCREEN-WEIGHT. | 2026-10-28 | #139 |
| SCREEN-WEIGHT | [The verdict over families of the screens](research/CATALOG.md#the-verdict-over-families-of-the-screens-screen-weight). The manifests of `screen-v1` and `screen-v2` get `familyBy`. `scripts/screen-verdict.ts` scores both screens again. 145 of 145 verdicts with a side keep it from `screen-v1` to `screen-v2`. No option has a promotion yet, so the guard count is 0. | 2026-10-28 | #140 |
| SITE-LIVE | The [results page](https://mark1russell7.github.io/highways/results.html) reads only committed files: the verdict snapshots of [`research/verdicts/`](research/verdicts/README.md), the idea records and this roadmap. It shows the verdict grid, the 40 `better` verdicts with families against them, the ideas and the newest items. The Pages build starts no race. It reads a committed benchmark snapshot, and it adds the Status and Releases pages. | 2026-10-28 | #143 |
| COMPARE-ALL | The compare page and the demo show each step of the pipeline and each strategy of the registry: 4 grouping rules, 9 routers, 53 highways, 7 curves and 3 room strategies. A highway plan goes through `follow`, as in the screen. Each room strategy opens the board "Packed grid". A test fails when a step or a strategy is missing. | 2026-10-28 | #146 |
| COMPARE-PICK | The compare page reads the key `pick` of its link, for example `#step=highway&pick=corridors,keys`. It shows the picked strategies first and marks them. It ignores a name that the step does not have, and a note tells it. Each panel has a toggle of the pick. | 2026-10-28 | #149 |
| IDEA-QUEUE | [The build queue](research/CATALOG.md#the-build-queue): `pnpm queue` writes [`research/queue.json`](research/queue.json), with one row for each idea that is not built. The score is the gain on the open targets, times the uncertainty, divided by the cost. 183 ideas have a rank, and 77 are blocked. `corridors` builds `HWY-031`, so it gets no rank. The results page shows the top 20. A section of the catalog compares the predicted gain with the measured gain. | 2026-10-28 | #PRNUM |

## Calibration

On 2026-10-28, 229 prediction claims of 54 items have a confidence and a result. Their Brier score is 0.177. A score of 0 is a perfect forecast.

- A claim gets 1 when it is met, 0.5 when it is partly met and 0 when it is not met. A claim with no test does not count.
- A high claim counts as 0.9, a medium claim as 0.6 and a low claim as 0.3. The results of 4 claims have no verdict word, so their outcome comes from the numbers.
- The live tracker keeps the table of each claim, with its confidence, its outcome and its area.

| Confidence | Claims | Hit rate | Brier |
|---|---|---|---|
| high (0.9) | 49 | 0.90 | 0.081 |
| medium (0.6) | 133 | 0.67 | 0.207 |
| low (0.3) | 47 | 0.37 | 0.191 |
| none | 25 | 0.78 | not scored |

| Area of the claim | Claims | Hit rate | Mean confidence |
|---|---|---|---|
| Correctness: equal outputs, 0 digest changes, tests, the SemVer step | 56 | 0.97 | 0.80 |
| Build: a measure, an option, a page or a note exists | 56 | 0.94 | 0.64 |
| Speed and time | 16 | 0.75 | 0.58 |
| Wins: the number of ideas that win the wave rule | 12 | 0.54 | 0.53 |
| Quality: B1, gap closed, keep-rate, crossings, spacing, detour | 107 | 0.41 | 0.51 |
| Size and scaling: the effect of more nodes | 7 | 0.07 | 0.47 |

The three levels are calibrated as a whole, but the areas are not. Quality and size claims were too optimistic: the high quality claims hit 0.56, and 1 of 7 size claims hit. Correctness and build claims were too modest: the medium build claims hit 0.95. The hit rate fell from 0.76 on 2026-10-27 to 0.48 on 2026-10-28, when most claims were on the gains of the portfolio.

The rule for the next predictions:

- The base rates are high 0.90, medium 0.67 and low 0.37.
- Give a new claim the level whose base rate is nearest to the hit rate of its area.
- Start a quality claim or a size claim at low, and a speed claim or a wins claim at medium.
- Start a correctness claim or a build claim at high.
- Raise a claim by one level only with a measured reason, for example a scratch run on the same inputs.

## Open

| Id | Item | Status | Waits for | Priority |
|---|---|---|---|---|
| BUILD-QUEUE | Up to 3 builds at a time take the ideas from the top of the [build queue](research/CATALOG.md#the-build-queue). Each build takes an idea with `pnpm queue --take`, skips a blocked idea and commits the new queue. | `later` | IDEA-QUEUE | P1 |
| CORPUS-GEN | The example boards of the site become the corpus generator, with sliders for each parameter of a board. | `later` | CORPUS-SEEDS | P1 |
| STRATEGY-CARDS | An analysis card for each strategy: the source, the complexity, the guarantee and the scaling exponent. It adds the sweeps of one option at a time and the Sobol indices from the nightly sweep. | `later` | IDEA-QUEUE | P2 |
| LANE-WALK | The lane order of a dense run without a walk for each compare. After ROUTE-SCALE, `partBefore` and `partAfter` take approximately 55% of a `shared` route on the dense board. The lane order stays the same. | `later` | ROUTE-SCALE | P2 |
| BENCH-STEPS | Cheaper measures on a dense board: `exactStretches` (a landmark guide for `distancesTo`), `measureQuality` and `checkProperties`. The values stay the same. | `later` | ROUTE-SCALE | P3 |
| STAGE-DATA | The stages of the routers and their options as data (`strategy-space/1` of layout-contract 0.2.10): `routeSpace`, `routeConfig` and each router of today as a named point with an equal route hash. | `later` | LANE-STRETCH, OPTS | P1 |
| TIME-PAIR | The time test runs each candidate and its default in one job, in alternate runs, so both use the same CPU. | `later` | SHARED-RULE | P1 |
| SELECT | A selector for each input from its features, or from a cheap trial run of a few strategies. The oracle bound is large: 0.352 of gap closed on `exact-v1`, and 39% or more of B1 on 4 of 4 boards. A choice by class keeps none of it, so the selector needs finer features and more seeds of each board. A portfolio with a score of the output alone keeps 6% on `exact-v1` (PORTFOLIO), so the selector needs a score that knows the rule of the run. PORTFOLIO-RULE gives that score: B1 among the runs that obey the rule of the caller, at one cap. | `later` | ORACLE | P1 |
| HWC-E | Room for the plug stubs, and the spacing rise of the bends: most arcs under the smallest radius sit on short plug stubs or on legs along one box. | `later` | HWC-D | P2 |
| MEAS-FLAT | Z2 is 0 on each record, and B8 `runs` is degenerate where `shared` has 0. Correct each definition, or mark it inactive with its reason. | `later` | MEAS3A | P2 |
| REBUILD-SILENT | ACTIVATION found 15 strategies whose own move does not fire on `screen-v1`. For each, a small board on which the move must fire gives the cause. When the move fires there, the corpus has a gap, and such boards go to CORPUS-SEEDS. When it does not fire, the trigger is wrong, and the strategy is built again. | `later` | ACTIVATION | P1 |
| CURV3 | More curve types from CURV-R, each with its options: Hobby curves, B-splines, biarc corners and superellipse corners. | `later` | CURV2 | P2 |
| GRP3 | More grouping rules from GRP-R: `agglomerative`, `leiden` and `pack`, and the options `refine` and `band` of the rule `cut`. | `later` | GRP2 | P2 |
| TUNE | The tuning harness: it sweeps the options of each strategy from its declaration. It gives the Pareto front and the best setting for given weights. | `later` | OPTS, MEAS1 | P2 |
| PLAY | The playground page: choose a strategy for each step and move the options. The measures change live, and a link keeps the setting. | `later` | OPTS, MEAS1 | P2 |
| EX3 | More example boards of made-up data: charts of teams, pipelines, network maps, timelines and dense grids, each with its page. | `later` | EX2 | P3 |
| SHARED-SMOOTH | The routers `shared` and `shared-all` read their option `smooth`, or the schema loses it. Today the control does nothing. | `later` | EX2-FIX | P2 |
| COMPARE-PIPELINE | Compare picks a whole pipeline from `routeSpace`. Waits for STAGE-DATA. | `later` | STAGE-DATA | P2 |
| BUILD-W | Build and screen each idea of the catalog, in waves by family and by expected value. Each kept idea gets its folder, its tests and a row in the benchmark. The next waves aim at two holes of the portfolio first. The first hole is the rule `collection` at the cap 1.1 on large boards: there the base `shared` wins on 18 of 20 test inputs. The second hole is the rule `all` at a tight cap (1.1, 1.25) on large boards, where the medians of gap closed are negative. After them, the waves aim at the rule `collection`, because there the best single strategy reaches 0.021 of gap closed, against an oracle of 0.378. | `later` | IDEA0, SCREEN, HWY-STEP | P1 |

## Rules for each item

- Keep `laneRoutes`, `runKey` and the levels compatible. A host app pins `^0.1.x`, and goes to `^0.2.0` for CUSTOM.
- Before 1.0.0, a breaking change raises the MINOR version. A feature or a fix raises the PATCH version.
- A change to the output of a route needs a note to the consumers before the release.
- Each strategy has its own folder, its tests and a row in the benchmark.
- Examples and tests use made-up data only.
