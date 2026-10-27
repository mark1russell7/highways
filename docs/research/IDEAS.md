# New ideas for each step

This note is the research item WILD-R of the [roadmap](../ROADMAP.md). It gives new ideas for each step of `highways`: plugs, groups, zoom levels, room, routes, highways, lane order, curves and the whole pipeline.

Four other notes survey edge bundling (HWY-R), nature (NAT-R), render rules (RULE-R) and other fields (EDA-R). This note looks for ideas outside those fields. An idea that touches one of them has the kind `hybrid`. The catalog [`ideas/wild.json`](ideas/wild.json) holds one record for each idea. BUILD-W builds and screens each record.

## Summary

- The note gives 60 ideas. 47 are new (`ours`), 10 mix a new part with a known method (`hybrid`), and 3 come from the literature.
- Each idea names its method. The methods are a morphological box, an inversion, an analogy from a far field, a multi-scale idea, a meta idea and a new measure.
- The far fields include typography, compilers, music, weaving, plumbing, sewing and queueing. Others are auctions, voting, game theory and the economics of shared roads.
- A scratch run of this note examines the plugs of today. On 3 of 5 boards, 93% or more of the free route ends turn at their out point. A slide of the plug along its side straightens only 0% to 13% of them. The fix is a search from the whole side ([WILD-001](#wild-001-free-plugs-on-a-side)), not a slide.
- One idea gives a highway and its zoom levels together. [WILD-034](#wild-034-highways-from-the-level-links) routes each edge on the link of its far items, so the far view agrees with the near view.
- Seven ideas are new measures or bounds. A floor for the ink ([WILD-054](#wild-054-an-ink-floor-from-moats)) and exact answers on small boards ([WILD-055](#wild-055-exact-answers-on-small-boards)) tell how far each router is from the best.
- The [build order](#the-build-order-for-build-w) has 14 steps. The first three are cheap: input in any order, the order fragility of each router, and free plugs on a side.

## The question and the scope

The question: which ideas can make each step of `highways` better, apart from the ideas of the four other notes? A step is one of these parts of the pipeline:

| Step | What it decides | Where it is today |
|---|---|---|
| `plugs` | The point where a route leaves its box | `placePlug`, `sideToward` and `pointOnSide` in the routers |
| `group` | The tree of sections | The strategies of the step `group` |
| `levels` | The items and the links of each zoom level | `levelLinks`, `levelCut` and `pickLevel` |
| `room` | The width that each gap gets | The strategies of the step `room` |
| `router` | The way of each edge | The strategies of the step `router` |
| `highway` | Which edges travel together, their merges, splits and lane order | Inside `trunks`, `shared` and `sections`. HWY-STEP makes it a step. |
| `curve` | The curve along each way | The strategies of the step `curve` |
| `whole` | More than one step: the settings, the passes, the stability, the measures | The bench and TUNE |

The scope:

- The note gives a concrete algorithm for each idea, not only an analogy. Each idea has a test that keeps or drops it.
- The note does not repeat the rules of [GROUPING](GROUPING.md) or the curves of [CURVES](CURVES.md). It refers to them.
- The boards of the tests are the fixtures of the bench and the case boards of MEAS0. All the data is made up.
- The times are estimates. The section [notation](#notation) gives their base.

## How to read an entry

### Notation

- `n` is the number of nodes and `m` is the number of edges. `u` is the unit of length of a board, as in [MEAS0](MEASURES.md#how-to-read-an-entry).
- `T_c` is the time of one route of the whole board with the router `corners`. The estimate is 30 ms at 100 nodes and 1 s at 1 000 nodes. Costs that use `T_c` are estimates.
- `k` is a small count that the entry defines: the ends of a side, the items of a level or the candidates of an edge.
- The measure ids (R1, B1, C2, G2, Z9, M4, H1 and the others) are the ids of [MEAS0](MEASURES.md).
- `Â12` is the effect size of Vargha and Delaney that MEAS0 uses. A value of 0.64 or more is a medium effect.

### The fields of an entry

| Field | Meaning |
|---|---|
| Method | The method that gave the idea, and the far field for an analogy. |
| Kind | `ours`: new to this note. `hybrid`: a new part on a known method, or an idea that touches another note. `literature`: a known method. |
| Math | The key formula or algorithm, in code font. |
| Cost | The time complexity, and the estimated time at 100 and at 1 000 nodes. |
| Options | The options that TUNE sweeps, with their ranges. |
| Makes better | The MEAS0 measures that the idea makes better. |
| Risks | The MEAS0 measures that the idea can make worse. |
| Reads the placement | Yes when the result changes with the places of the boxes. |
| Cheapest test | The boards, the measures and the threshold that keep or drop the idea. "In CI" marks a board of 1 000 nodes or more. |
| Size | S, M or L: the size of the first prototype. |
| Related | Similar or combinable ideas. An id in code font is a record of another note. |

## The taxonomy

The table gives the number of ideas for each method and step. The ideas of the step `whole` include the 7 measures.

| Method | `plugs` | `group` | `levels` | `room` | `router` | `highway` | `curve` | `whole` | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Inversion | 1 | 1 | 1 | 1 | 1 | 1 |  | 3 | 9 |
| Morphological box | 2 |  |  |  | 2 | 1 | 1 |  | 6 |
| Analogy from a far field | 3 | 3 | 4 | 4 | 3 | 8 | 2 |  | 27 |
| Multi-scale and progressive |  |  | 1 |  | 2 | 1 |  | 3 | 7 |
| Meta |  |  |  |  |  |  | 1 | 3 | 4 |
| Measure |  |  |  |  |  |  |  | 7 | 7 |
| Total | 6 | 4 | 6 | 5 | 8 | 11 | 4 | 16 | 60 |

The analogies come from 16 far fields:

| Far field | Ideas |
|---|---|
| Auctions and markets | [WILD-003](#wild-003-plug-auction), [WILD-013](#wild-013-budgeted-frontier-expansion), [WILD-018](#wild-018-room-and-routes-as-a-market) |
| City blocks and the seams of a garment | [WILD-035](#wild-035-streets-along-the-cuts) |
| Compilers | [WILD-004](#wild-004-side-spill-by-capacity), [WILD-023](#wild-023-tight-edges-first), [WILD-037](#wild-037-conservative-coalescing-of-near-routes) |
| Economics of shared roads | [WILD-033](#wild-033-savings-merge-with-a-fair-share) |
| Game theory | [WILD-010](#wild-010-incumbent-bonus-for-stable-groups), [WILD-024](#wild-024-best-response-routing-game) |
| Heating and cooling | [WILD-014](#wild-014-zoom-hysteresis), [WILD-040](#wild-040-flush-lanes-after-an-exit) |
| Image retargeting | [WILD-020](#wild-020-seam-insertion) |
| Music | [WILD-041](#wild-041-lane-changes-as-voice-leading) |
| Origin-destination surveys | [WILD-032](#wild-032-warrant-highways-from-the-demand-matrix) |
| Plumbing | [WILD-036](#wild-036-manifolds-for-a-fan-to-a-row) |
| Queueing | [WILD-026](#wild-026-queueing-price-of-a-gap) |
| Sewing | [WILD-021](#wild-021-gusset-room) |
| Terrain level of detail | [WILD-015](#wild-015-geomorph-between-levels) |
| Typography | [WILD-002](#wild-002-plug-justification), [WILD-008](#wild-008-line-breaking-on-a-space-filling-curve), [WILD-011](#wild-011-level-ladder-by-line-breaking), [WILD-017](#wild-017-water-filling-room), [WILD-043](#wild-043-optical-lane-spacing-at-bends) |
| Voting | [WILD-009](#wild-009-a-vote-of-the-grouping-rules), [WILD-031](#wild-031-approval-corridors) |
| Weaving and braids | [WILD-038](#wild-038-braid-crossings-at-the-best-place) |

## The morphological box of each step

A morphological box lists the axes of a step and the values of each axis. A setting picks one value on each axis. The box shows the values of today, and the new values that this note adds. The bold value is the value of today.

### Plugs

| Axis | Values | Ideas |
|---|---|---|
| Where the plug sits | **fixed on the side that faces the other end**, free on the side, shared by a cohort, on a corner | 001, 005, 006 |
| How the plugs of a side share it | **each plug alone**, order and spacing, assignment by an auction, spill by capacity | 002, 003, 004 |
| When the plug is decided | **before the search**, during the search, after the search | 001 |

### Groups and zoom levels

| Axis | Values | Ideas |
|---|---|---|
| What the rule reads | **positions or keys**, the routes, the votes of the other rules | 007, 009 |
| How the rule cuts | **top down by cells**, along a curve that fills the plane, by a merge | 008 |
| Memory of the last partition | **none**, a bonus for the old group | 010 |
| The item counts of the levels | **one depth for each level**, a ladder at a ratio, a budget of the screen | 011, 013 |
| The links of a level | **routed alone**, made from the fine routes, the highways of the edges | 012, 034 |
| The switch between levels | **one threshold**, two thresholds, a blend | 014, 015 |
| The lanes of a far bundle | **always drawn**, one stroke below one pixel | 016 |

### Room

| Axis | Values | Ideas |
|---|---|---|
| Where the width goes | **a full line across the board**, a seam, a local gusset | 020, 021 |
| How a shortfall is shared | **in proportion to the need**, water-filling, prices | 017, 018 |
| What gives first | **the gap**, the lane spacing | 019 |
| How room and routes meet | **one pass**, prices, a fixed point | 018, 026, 049 |

### Routes

| Axis | Values | Ideas |
|---|---|---|
| The order of the edges | **the input order, or the longest first**, the shortest first, by slack, random restarts | 022, 023 |
| The price of a link | **length, with a discount on a shared way**, crossings, the angle of a crossing, a queue | 024, 025, 026 |
| The scope of one search | **the whole board**, a corridor of the far view, one group | 027, 029 |
| How many ways for each edge | **one**, `k` candidates and a joint choice, best responses | 024, 028 |

### Highways, lane order and curves

| Axis | Values | Ideas |
|---|---|---|
| What makes a highway | **a key, or a shared way during the search**, an overlap after the search, the demand between groups, a level link, the cut lines | 030, 032, 034, 035 |
| Who picks the highways | **each edge in turn**, a cover of the approved links, a merge by savings, a conservative merge | 031, 033, 037 |
| The shape of a highway | **a trunk with a split point**, a manifold with taps | 036 |
| The scope of a lane order | **each run**, one order for the board | 039 |
| Where the lanes swap | **at the ends of a run**, on the straightest segment | 038 |
| How a lane shifts | **a fixed stack**, a flush stack, the least total shift | 040, 041 |
| The curve of each edge | **one type for the board**, a portfolio, a nudge at a crossing, wider spacing on a bend | 042, 043, 044 |

### The whole pipeline

| Axis | Values | Ideas |
|---|---|---|
| The settings | **fixed defaults**, a portfolio, a learned choice, a tuner | 045, 046, 047, 048 |
| The passes | **one pass**, a fixed point, stages in time, a repair after a move | 049, 050, 052 |
| The input order | **as given**, sorted by a stable hash | 053 |
| What the layout gets back | **nothing**, a push for each box | 051 |

### Promising combinations

- One plug stage: free plugs on a side (001), then justification (002), with a spill when a side is full (004). Each part has a test of its own, so BUILD-W can stop after any part.
- One multi-scale router: highways from the level links (034), on links made from the fine routes (012). The search stays in a corridor of the far view (027). Z9 is 0 by its design.
- One room stage: squeeze the lanes first (019), then share the rest by water-filling (017). A queueing price goes on the gaps that stay full (026).
- One highway stage: detect the overlaps after the routes (030) and merge them conservatively (037). Then fix one lane order (039) and put the swaps on the straightest segments (038).

## A scratch run: free plugs

The scratch run measures the plugs of today. It routes 6 boards with `corners`. For each free route end, it checks the turn at the out point: the angle between the stub and the first leg. Then it slides the plug along its side to the place in front of the second point of the route. It counts the ends that become straight. The board `nestedGridBoard` gave no free ends, so the table has 5 boards.

| Board | Free ends | Straight today | Turn at the out point | Straight after a slide | Turn saved for each route |
|---|---:|---:|---:|---:|---:|
| `case-dense-groups` | 600 | 0 | 600 | 68 (11%) | 0.027 rad |
| `case-hub-chain` | 238 | 0 | 52 | 0 | 0 |
| `case-many-groups` | 374 | 0 | 240 | 0 | 0 |
| `small-clustered` | 400 | 29 | 371 | 47 (13%) | 0.020 rad |
| `grid-400` | 1 600 | 0 | 1 488 | 129 (9%) | 0.001 rad |

The results:

- On `case-dense-groups`, `small-clustered` and `grid-400`, 93% or more of the free ends turn at their out point. On the other two boards, 22% and 64% turn. The route goes out of the box, then turns toward its first corner.
- A slide of the plug fixes few ends, because the first corner is often outside the span of the side. The route must turn once in any case.
- A slide does not change the way. The search from the whole side ([WILD-001](#wild-001-free-plugs-on-a-side)) can pick a different first corner, so it can save a full bend. This run does not measure that part. It is the test of WILD-001.

## Plugs

A plug is the point where a route leaves its box. Today `placePlug` puts it on the side that faces the other end, at a fixed place.

### WILD-001 Free plugs on a side

The router does not fix a free plug before the search. The search starts from the whole free side at once, so the first leg goes straight to the first corner. The plug is the foot of that leg.

| Field | Value |
|---|---|
| Method | Inversion |
| Kind | `ours` |
| Math | Multi-source A*. For each corner `c` in the strip in front of the free side `S`, a start link has the cost `dist(c, S) + λ · angle(c - foot(c), normal)`, with `foot(c)` the projection of `c` on `S`, clamped to the inset. |
| Cost | `O(k)` more start links for each end, with `k` corners in the strip. Near `T_c`: 30 ms at 100 nodes, 1 s at 1 000 nodes. |
| Options | inset: 2 to 20, default 6<br>λ (angle weight): 0 to 4, default 1<br>minGap between two plugs of a side: 4 to 16, default 8 |
| Makes better | R3, R4, R10 |
| Risks | R11, R1 |
| Reads the placement | Yes |
| Cheapest test | A scratch run of this note gives the first data: a pure slide of the plug straightens 9% to 13% of the bent ends. Keep the full form when the median of R3 drops by 15% or more on `small-clustered` and `case-dense-groups`, with the minimum of R11 at 0.5 or more. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-002](#wild-002-plug-justification), [WILD-003](#wild-003-plug-auction), [WILD-006](#wild-006-eight-direction-plugs), `EDA-022` |
| Sources | None. The idea is new to this note. |

### WILD-002 Plug justification

Each plug of a side has an ideal place, where its route wants to leave. The plugs keep their order and a gap of at least `s_min`. The plugs move the least distance from their ideal places.

| Field | Value |
|---|---|
| Method | Analogy: typography (justification and kerning) |
| Kind | `ours` |
| Math | Minimize `Σ (x_i - a_i)^2` with `x_(i+1) - x_i ≥ s_min` and `lo ≤ x_i ≤ hi`. Put `y_i = x_i - i · s_min`: the problem is isotonic regression of `a_i - i · s_min`. Pool adjacent violators solves it in `O(k)`, then clamp to the side. |
| Cost | `O(k log k)` for each side with the sort, `O(m log m)` in total. Less than 1 ms at 100 nodes and 5 ms at 1 000 nodes. |
| Options | s_min: 2 to 16, default 6<br>ideal place: the straight line to the other end, or the first leg of the route<br>weight of each plug: 1, or the count of its edges |
| Makes better | R11, R1, R10 |
| Risks | R10, R3 |
| Reads the placement | Yes |
| Cheapest test | On `grid-400` and `small-clustered`, the minimum of R11 must reach 1.0 on each side with room for its plugs. Drop it when R1 grows by more than 2%. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-001](#wild-001-free-plugs-on-a-side), [WILD-003](#wild-003-plug-auction), [WILD-004](#wild-004-side-spill-by-capacity), `NAT-031`, `EDA-022` |
| Sources | [Ayer 1955][ayer55], [Knuth 1981][knuth81] |

### WILD-003 Plug auction

Each side has slots at an even spacing. Each end of an edge bids for the slots of its box. The auction gives each end one slot at the lowest total cost, and no two ends share a slot.

| Field | Value |
|---|---|
| Method | Analogy: auctions and markets |
| Kind | `ours` |
| Math | Assignment problem with `c(end, slot) = w_a · angle(slot → other end, normal) + w_d · detour estimate + w_x · crossings of the straight stubs`. The auction of Bertsekas with ε-scaling: a bidder raises the price of its best slot by `best - second + ε`. |
| Cost | `O(s · k · log(C / ε))` for each box with `k` ends and `s` slots. Less than 2 ms at 100 nodes and 20 ms at 1 000 nodes. |
| Options | slots on each side: 2 to 16, or side / s_min<br>w_a, w_d, w_x: 0 to 4<br>ε: 0.01 to 1 |
| Makes better | R10, R11, R1, R3 |
| Risks | R5, R6 |
| Reads the placement | Yes |
| Cheapest test | On `case-dense-groups` and `small-clustered`, keep it when R1 drops by 5% or more and the minimum of R11 is 1.0, with the q95 of R5 up by less than 3%. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-002](#wild-002-plug-justification), [WILD-004](#wild-004-side-spill-by-capacity), [WILD-024](#wild-024-best-response-routing-game), `EDA-022` |
| Sources | [Bertsekas 1988][bertsekas88] |

### WILD-004 Side spill by capacity

A side holds at most `cap` plugs at the spacing `s_min`. When more ends face that side, the ends with the lowest cost to move spill to the next side. A register allocator spills values in the same way.

| Field | Value |
|---|---|
| Method | Analogy: compilers (register allocation and spills) |
| Kind | `ours` |
| Math | `cap_s = floor(len_s / s_min) - 1`. Sort the ends of a full side by the spill cost: the gain of angle to the next side, clockwise or counter-clockwise. Move the cheapest ends until the side fits. Do at most 4 passes around the box. |
| Cost | `O(k log k)` for each box. Less than 1 ms at 100 and at 1 000 nodes. |
| Options | s_min: 2 to 16, default 6<br>spill to: the nearer side, or both sides<br>passes: 1 to 4 |
| Makes better | R11, R12 |
| Risks | R10, R3 |
| Reads the placement | Yes |
| Cheapest test | On `mid-fanout` (in CI) and a case board with a fan of 20 edges, count the sides with R11 below 1. Keep it when that count drops to 0 and the mean of R10 rises by less than 10°. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-002](#wild-002-plug-justification), [WILD-003](#wild-003-plug-auction), `EDA-022` |
| Sources | [Chaitin 1982][chaitin82] |

### WILD-005 Angular cohorts share a plug

The ends of a box are sorted by the angle toward their other ends. Breaks in the angle split them into cohorts. Each cohort shares one plug and one short stub, then fans out.

| Field | Value |
|---|---|
| Method | Morphological box |
| Kind | `hybrid` |
| Math | Optimal 1D clustering of the angles by dynamic programming: minimize `Σ variance within each cohort + β · cohorts`. A cohort has 2 or more ends and a spread of `θ_max` or less. |
| Cost | `O(k^2)` for each box with `k` ends. Less than 2 ms at 100 nodes and 20 ms at 1 000 nodes. |
| Options | θ_max: 5° to 45°, default 20°<br>β: 0 to 10<br>smallest cohort: 2 to 5 |
| Makes better | B1, R11, B7 |
| Risks | B4, B6 |
| Reads the placement | Yes |
| Cheapest test | On `mid-fanout` (in CI) and `small-clustered`, keep it when B1 rises by 0.05 or more and B4 rises by less than 0.02. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-030](#wild-030-detect-highways-after-routing), [WILD-036](#wild-036-manifolds-for-a-fan-to-a-row), `HWY-015` |
| Sources | [Wang 2011][wang11] |

### WILD-006 Eight-direction plugs

A box also gets four corner plugs with diagonal normals. An edge whose direction is near 45° leaves from a corner, so its first leg needs no turn.

| Field | Value |
|---|---|
| Method | Morphological box |
| Kind | `ours` |
| Math | The set of normals is the 4 side normals and the 4 diagonals. Pick the normal nearest to the direction of the other end. A corner plug sits at the corner, moved in by `inset` along both sides. Its out point is `p + margin · n`. |
| Cost | `O(1)` for each end, as today. |
| Options | corner plugs: on or off<br>diagonal window: 10° to 40°, default 22.5°<br>inset: 2 to 12 |
| Makes better | R10, R3, R4 |
| Risks | R11, R8, R14 |
| Reads the placement | Yes |
| Cheapest test | On `grid-400` and `small-clustered`, keep it when the mean of R4 drops by 10% or more and the tight share of R8 does not rise. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-001](#wild-001-free-plugs-on-a-side) |
| Sources | None. The idea is new to this note. |

## Groups

A grouping rule gives the tree of sections. [GROUPING](GROUPING.md) gives 19 rules from the literature. These ideas are new to that note.

### WILD-007 Groups from routes

The router routes each edge with `corners` first. Two nodes whose routes use the same corridors are similar. A merge on the graph of neighbours joins similar nodes, so each group holds nodes whose edges travel together.

| Field | Value |
|---|---|
| Method | Inversion |
| Kind | `ours` |
| Math | Put each route on cells of side `4u`. The vector of a node is the count of each cell that its routes touch, with TF-IDF weights. The similarity is the cosine. Average linkage merges only Delaunay neighbours. Cut the merge tree at the ratio `r`. |
| Cost | One `corners` route (`T_c`) and `O(n log n)` merges. 50 ms at 100 nodes, 1.3 s at 1 000 nodes. |
| Options | cell: 2 to 8 u<br>ratio r: 2 to 8, default 4<br>weight of the positions: 0 to 1, default 0.5 |
| Makes better | G2, Z9, B2 |
| Risks | G4, G5, G9 |
| Reads the placement | Yes |
| Cheapest test | Against `cut` on the 10 boards of GRP-R, at the same `k`: keep it when G2 at the far view is lower on 6 boards or more and Z9 drops. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-012](#wild-012-coarse-links-from-fine-routes), [WILD-034](#wild-034-highways-from-the-level-links), `HWY-031` |
| Sources | None. The idea is new to this note. |

### WILD-008 Line breaking on a space-filling curve

The nodes are sorted along a Hilbert curve. The order breaks into groups as Knuth and Plass break a paragraph into lines. The breaks minimize the cut edges and a badness for groups far from the target size.

| Field | Value |
|---|---|
| Method | Analogy: typography (the line breaking of Knuth and Plass) |
| Kind | `ours` |
| Math | `F(j) = min_i F(i) + out(i, j) + γ · ((j - i - b) / b)^2` over `i` in `[j - 2b, j - b/2]`. `out(i, j) = deg(i, j) - 2 · inner(i, j)`, with prefix sums of the degrees and an incremental count of the inner edges. The breaks of level `d + 1` are a subset of the breaks of level `d`, so the levels nest. |
| Cost | `O(n · b)` for each level. Less than 5 ms at 100 nodes and 50 ms at 1 000 nodes. |
| Options | target size b: 4 to 64<br>γ: 0.1 to 10<br>curve: Hilbert or Z-order |
| Makes better | G2, G6, Z5, Z6 |
| Risks | G4, G5, G9 |
| Reads the placement | Yes |
| Cheapest test | Against `kd` and `cut` at the same `k` on the 10 boards of GRP-R: keep it when G2 at the far view is not worse on 8 boards and G6 is above 0.9. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-009](#wild-009-a-vote-of-the-grouping-rules), [WILD-011](#wild-011-level-ladder-by-line-breaking) |
| Sources | [Knuth 1981][knuth81] |

### WILD-009 A vote of the grouping rules

The rules `quadtree`, `kd`, `cut` and `keys` make their trees. Each pair of neighbour nodes gets one vote from each rule that puts them in one group. A merge on the votes gives the consensus tree.

| Field | Value |
|---|---|
| Method | Analogy: voting (consensus of many ballots) |
| Kind | `ours` |
| Math | `co(u, v) = (1 / R) Σ_r [group_r(u) = group_r(v)]` for Delaunay neighbours, summed over the levels. Average linkage on `1 - co`, with merges of neighbours only. Cut at the `k` of the reference rule. |
| Cost | `R` trees, `O(R · n log n)`, and the merge. 10 ms at 100 nodes, 100 ms at 1 000 nodes. |
| Options | rules: a subset of the registry<br>weight of each rule: 0 to 1<br>levels that vote: 1 to 4 |
| Makes better | G9, G2, G4 |
| Risks | G5 |
| Reads the placement | Yes |
| Cheapest test | Under the seeded moves of MEAS0: keep it when the ARI of G9 is 0.05 or more above the best single rule, with G2 not worse than the median rule. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-008](#wild-008-line-breaking-on-a-space-filling-curve), [WILD-010](#wild-010-incumbent-bonus-for-stable-groups), `HWY-035` |
| Sources | [Strehl 2002][strehl02] |

### WILD-010 Incumbent bonus for stable groups

Each node is a player that picks a neighbour group. Its payoff counts its edges into the group, a cost for the size of the group, and a bonus for its group before an edit. Best responses end in a stable partition.

| Field | Value |
|---|---|
| Method | Analogy: game theory (hedonic games) |
| Kind | `ours` |
| Math | `u_v(C) = e(v, C) - λ · abs(C) + β · [C = prev(v)]`. This is a symmetric additively separable hedonic game. Its potential `Φ = Σ_C Σ_(u<v in C) (a_uv - λ) + β · kept` falls at each strict move, so the best responses stop. |
| Cost | `O(m)` for each sweep, with 3 to 10 sweeps. Less than 5 ms at 100 nodes and 50 ms at 1 000 nodes. |
| Options | λ: 0.01 to 1<br>β: 0 to 5<br>sweeps: 1 to 20 |
| Makes better | G9, Z7, Z8, Z10 |
| Risks | G2, G6 |
| Reads the placement | Yes |
| Cheapest test | One move of `u` on 5 seeds of `small-clustered` and `mid-clustered`: keep it when the ARI of G9 is 0.95 or more and higher than without the bonus, with G2 up by less than 0.02. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-009](#wild-009-a-vote-of-the-grouping-rules), [WILD-050](#wild-050-incremental-routing-after-a-move) |
| Sources | [Bogomolnaia 2002][bogomolnaia02], [Monderer 1996][monderer96] |

## Zoom levels

A level is a cut of the tree of sections. Today each level is one depth of the tree, and `pickLevel` picks a level from the scale.

### WILD-011 Level ladder by line breaking

A merge tree can give any number of items. A dynamic program picks the item counts of the levels. Each step is near the target ratio, and the far view fits the budget of the host.

| Field | Value |
|---|---|
| Method | Analogy: typography (the line breaking of Knuth and Plass) |
| Kind | `ours` |
| Math | The candidates are the cut sizes `k` of the tree. `F(k_j) = min_i F(k_i) + (log(k_j / k_i) - log r)^2 + μ · [items + links of k_j > B]`. Keep the best path of `L` levels. |
| Cost | `O(K^2 · L)` for `K` candidates. Less than 1 ms. |
| Options | ratio r: 2 to 8, default 4<br>levels L: 2 to 8<br>budget B: 20 to 200<br>μ: 1 to 100 |
| Makes better | Z5, Z4 |
| Risks | Z6, Z7 |
| Reads the placement | Yes |
| Cheapest test | On `nestedGridBoard`, `case-many-groups` and `mid-clustered`: keep it when the spread of `log(lr)` of Z5 drops by 30% or more and Z4 is 1 or less at the far view. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-008](#wild-008-line-breaking-on-a-space-filling-curve), [WILD-013](#wild-013-budgeted-frontier-expansion) |
| Sources | [Knuth 1981][knuth81] |

### WILD-012 Coarse links from fine routes

The router routes the edges first. A link of a level then follows the routes of its edges outside its two items. The far view agrees with the near view by its design, as a mipmap comes from its finer image.

| Field | Value |
|---|---|
| Method | Inversion |
| Kind | `ours` |
| Math | For the link `(A, B)`, clip each route `r_e` to the outside of `A ∪ B`. Take the medoid `argmin_e Σ_f F(r_e, r_f)`, with `F` the discrete Fréchet distance, over at most 16 sampled routes. Snap its ends to the boundaries of `A` and `B`. |
| Cost | `O(links · s^2 · p^2)` with `s` sampled routes of `p` points. 10 ms at 100 nodes, 300 ms at 1 000 nodes. |
| Options | sample: 4 to 32, default 16<br>pick: the medoid, or the route with the most shared length<br>smooth: on or off |
| Makes better | Z9, Z10 |
| Risks | Z3, R6 |
| Reads the placement | Yes |
| Cheapest test | On `mid-clustered` and `case-dense-groups`: keep it when Z9 drops by 50% or more and the avoidable level through of Z3 does not rise. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-027](#wild-027-far-view-first-then-refine), [WILD-034](#wild-034-highways-from-the-level-links), [WILD-015](#wild-015-geomorph-between-levels), `HWY-052` |
| Sources | [Williams 1983][williams83] |

### WILD-013 Budgeted frontier expansion

A level is not one depth of the tree. From the root, the step opens the item with the best gain for each new element, until the budget is spent. Large, busy groups open first.

| Field | Value |
|---|---|
| Method | Analogy: auctions and markets (a knapsack of the screen budget) |
| Kind | `ours` |
| Math | Frontier `F`. `gain(c)` = the cut edges that opening `c` shows as its own links, plus `w · size(c)`. `cost(c)` = `children(c) - 1` plus the new links. Greedy by `gain / cost` with a priority queue. A ladder of budgets gives nested levels, because each frontier refines the last. |
| Cost | `O(k log k)` for each level. Less than 1 ms. |
| Options | budgets: a list, 20 to 500<br>w: 0 to 1<br>gain: links, nodes or both |
| Makes better | Z4, Z5, Z6 |
| Risks | Z8, Z7, G4 |
| Reads the placement | Yes |
| Cheapest test | On `mid-clustered` and `nestedGridBoard`: keep it when each level has Z4 of 1 or less and G2 is lower than a fixed depth with the same number of items. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-011](#wild-011-level-ladder-by-line-breaking), [WILD-016](#wild-016-bundle-level-of-detail), `EDA-040` |
| Sources | None. The idea is new to this note. |

### WILD-014 Zoom hysteresis

`pickLevel` changes the level at one scale when the reader zooms in, and at a lower scale when the reader zooms out. A small move near a threshold then does not change the view.

| Field | Value |
|---|---|
| Method | Analogy: heating and cooling (the dead band of a thermostat) |
| Kind | `ours` |
| Math | Level `d` holds for the scale `s` in `[a_d, b_d]`. Go to `d + 1` only when `s > b_d · (1 + h)`. Go back to `d` only when `s < b_d · (1 - h)`. |
| Cost | `O(1)` for each frame. |
| Options | h: 0 to 0.3, default 0.1 |
| Makes better | Z7, Z10 |
| Risks | Z4 |
| Reads the placement | No |
| Cheapest test | A zoom path of 200 steps with 2% noise on `case-many-groups`: keep it when the level flips drop by 80% or more and Z4 stays at 1.1 or less. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-015](#wild-015-geomorph-between-levels), [WILD-016](#wild-016-bundle-level-of-detail), `HWY-046`, `EDA-040` |
| Sources | [Åström 2008][astrom08] |

### WILD-015 Geomorph between levels

Between two levels, each link moves smoothly from its coarse form to the fine routes of its edges. The host draws the blend between two thresholds, so no line jumps.

| Field | Value |
|---|---|
| Method | Analogy: terrain level of detail (geomorphs) |
| Kind | `ours` |
| Math | Resample the coarse link `L` and each fine route `r` on `n` points by arc length. At the blend `t` in `[0, 1]`: `p_i(t) = (1 - t) · L_i + t · r_i`. `t` is a smoothstep of the scale between the two thresholds. |
| Cost | `O(m · n)` for each frame. 2 ms at 100 nodes and 20 ms at 1 000 nodes, for `n = 32`. |
| Options | n: 16 to 64<br>width of the band: 0.1 to 0.5 of the step between two levels |
| Makes better | Z9, Z7 |
| Risks | C9, R9 |
| Reads the placement | Yes |
| Cheapest test | On `mid-clustered`: keep it when the largest jump between two frames at 1% of zoom apart is less than `2u`, and the through count of the blend at `t = 0.5` is 0 after a clamp. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-012](#wild-012-coarse-links-from-fine-routes), [WILD-014](#wild-014-zoom-hysteresis) |
| Sources | [Hoppe 1996][hoppe96] |

### WILD-016 Bundle level of detail

When the lanes of a bundle are less than one pixel apart on the screen, the host draws one stroke. Its width grows with the log of the count. Lanes far enough apart get their own lines.

| Field | Value |
|---|---|
| Method | Multi-scale and progressive |
| Kind | `ours` |
| Math | Screen spacing `σ = spacing · scale`. When `σ < σ_min`, draw one stroke of width `w_0 · (1 + log2(count))`. When `σ ≥ 2 σ_min`, draw the lanes. Blend between the two. |
| Cost | `O(bundles)` for each frame. |
| Options | σ_min: 0.5 to 3 px, default 1<br>w_0: 1 to 4 px |
| Makes better | B7, B1 |
| Risks | B9, B4 |
| Reads the placement | No |
| Cheapest test | On `shared-all` over `case-many-groups` at 5 zoom scales: keep it when the lane legibility count of WILD-060 is 0 and the drawn ink drops. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-060](#wild-060-lane-legibility-at-each-zoom), [WILD-014](#wild-014-zoom-hysteresis), `EDA-038`, `EDA-042` |
| Sources | None. The idea is new to this note. |

## Room

The step `room` opens the gaps that the lanes need. Today `boardGaps` finds full lines across the board, and `maxGrowth` shares the room in proportion.

### WILD-017 Water-filling room

The board can grow by a given share only. Each gap asks for its need. The room goes to the gaps as water fills basins, so the shortfall goes to the gaps where it hurts least.

| Field | Value |
|---|---|
| Method | Analogy: typography (the glue of a justified line) |
| Kind | `ours` |
| Math | Each gap of `boardGaps` crosses the board, so the growth of an axis is `Σ_g x_g`. Minimize `Σ_g w_g (d_g - x_g)^2` with `Σ_g x_g ≤ W` and `0 ≤ x_g ≤ d_g`. KKT: `x_g = clamp(d_g - ν / (2 w_g), 0, d_g)`, with `ν` by bisection and `w_g` the lanes of the gap. |
| Cost | `O(G · log(1 / ε))` for `G` gaps. Less than 1 ms. |
| Options | maxGrowth: 0 to 1<br>weight: lanes, need or 1 |
| Makes better | M1, M4 |
| Risks | M4 |
| Reads the placement | Yes |
| Cheapest test | On `packedGridBoard`, against the `maxGrowth` curve of ROOM-A: keep it when M4 is lower at the areas 1.25 and 1.40. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-019](#wild-019-squeeze-lanes-before-opening), [WILD-018](#wild-018-room-and-routes-as-a-market), [WILD-049](#wild-049-room-and-routes-to-a-fixed-point), `EDA-039` |
| Sources | [Boyd 2004][boyd04], [Knuth 1981][knuth81] |

### WILD-018 Room and routes as a market

A gap sells width at a price. A route pays the price for each lane that it puts through a gap, so routes go around costly gaps. The prices move until the supply of width meets the demand.

| Field | Value |
|---|---|
| Method | Analogy: auctions and markets (prices that clear a market) |
| Kind | `ours` |
| Math | For `t = 1..T`: route with the cost `len + Σ_g λ_g · [route crosses g]`. The excess is `x_g = lanes_g · spacing + gutter - width_g`. `λ_g ← max(0, λ_g + η · (x_g - share_g))`. This is dual ascent on `area + α · length`. |
| Cost | `T` routes, with `T` from 3 to 6: 150 ms at 100 nodes, 5 s at 1 000 nodes. |
| Options | T: 2 to 8<br>η: 0.1 to 2<br>α: 0.1 to 10 |
| Makes better | M1, M4, R5 |
| Risks | R5, R6 |
| Reads the placement | Yes |
| Cheapest test | On `packedGridBoard`: keep it when its points (M1, M4) lie below the curve of ROOM-A, with the q95 of R5 up by less than 5%. |
| Size | L: a new solver, or a change of more than one step. |
| Related | [WILD-017](#wild-017-water-filling-room), [WILD-026](#wild-026-queueing-price-of-a-gap), [WILD-049](#wild-049-room-and-routes-to-a-fixed-point), `EDA-051`, `EDA-012` |
| Sources | [Boyd 2004][boyd04] |

### WILD-019 Squeeze lanes before opening

Before a gap opens, its lanes move closer, down to a floor. The gap opens only for the lanes that do not fit at the floor.

| Field | Value |
|---|---|
| Method | Inversion |
| Kind | `ours` |
| Math | `s_g = clamp((width_g - gutter) / lanes_g, s_min, spacing)`. The new need is `max(width_g, gutter + lanes_g · s_min)`. |
| Cost | `O(G)`. Less than 1 ms. |
| Options | s_min: 1 to 6, default 2<br>scope: each gap, or one value for the board |
| Makes better | M1, M3 |
| Risks | R12, B9 |
| Reads the placement | Yes |
| Cheapest test | On `packedGridBoard` at `maxGrowth` 0.3: keep it when M1 drops by 10% or more, M4 does not rise, and R12 stays below 0.05. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-017](#wild-017-water-filling-room), [WILD-043](#wild-043-optical-lane-spacing-at-bends), [WILD-060](#wild-060-lane-legibility-at-each-zoom), `EDA-004` |
| Sources | None. The idea is new to this note. |

### WILD-020 Seam insertion

The step finds a connected path of cells across the board that goes through the most crowded gaps and through no box. Width goes in along that path only. The step repeats until each gap has its need.

| Field | Value |
|---|---|
| Method | Analogy: image retargeting (seam carving) |
| Kind | `ours` |
| Math | Energy `e(c) = ∞` in a box and `-need(c)` in a gap. Vertical seam by dynamic programming: `M(i, j) = e(i, j) + min(M(i - 1, j - 1 .. j + 1))`. Insert width `δ` along the seam: each cell right of it moves by `δ`. |
| Cost | `O(cells)` for each seam. 50 ms at 100 nodes and 1 s at 1 000 nodes for 20 seams. |
| Options | cell: 1 to 4 u<br>δ: 2 to 16<br>largest number of seams: 5 to 50<br>slope: 1 or 2 cells for each row |
| Makes better | M1, M4 |
| Risks | M2, M5 |
| Reads the placement | Yes |
| Cheapest test | On `packedGridBoard`: keep it when M4 reaches 0 at an area below 1.50 and the count of M2 stays 0. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-021](#wild-021-gusset-room), [WILD-017](#wild-017-water-filling-room), `EDA-039` |
| Sources | [Avidan 2007][avidan07] |

### WILD-021 Gusset room

A gap opens only near the place that needs it. The boxes in the shadow of that place move, and the shift fades with the distance along the gap.

| Field | Value |
|---|---|
| Method | Analogy: sewing (a gusset adds cloth in one place) |
| Kind | `ours` |
| Math | `δ_b = need_g · φ(d_b / R)`, with `d_b` the distance of box `b` along the gap from the place of need and `φ(t) = max(0, 1 - t)^2`. Then check the order of the boxes on each axis. Where the check fails, open the full line. |
| Cost | `O(G · n)`. 5 ms at 100 nodes, 50 ms at 1 000 nodes. |
| Options | R: 2 to 20 u<br>φ: quadratic or linear<br>fallback: the full line, or no change |
| Makes better | M1, M3 |
| Risks | M2, M5 |
| Reads the placement | Yes |
| Cheapest test | On `packedGridBoard` and `nestedGridBoard`: keep it when M3 drops by 30% or more at the same M4, and the count of M2 stays 0. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-020](#wild-020-seam-insertion), [WILD-017](#wild-017-water-filling-room), `EDA-039` |
| Sources | None. The idea is new to this note. |

## Routes

These ideas change the order, the price or the scope of the search. The search is the A* of `WayFinder` on the corner graph.

### WILD-022 Shortest edges first, and other orders

The router `shared` routes the longest edges first, so the short edges join them. The inverse routes the shortest first: short edges stay direct, and long edges join them. An axis of the box tests five orders.

| Field | Value |
|---|---|
| Method | Inversion |
| Kind | `ours` |
| Math | Order axis: the longest first (today), the shortest first, by the area of the bounding box, by slack (WILD-023), and 8 random orders with the best one kept. The search is the same discounted A*. |
| Cost | `T_c` for each order. 8 random orders cost `8 T_c`. |
| Options | order: longest, shortest, area, slack, random<br>restarts: 1 to 16 |
| Makes better | R5, R6, B1 |
| Risks | B1, R1 |
| Reads the placement | Yes |
| Cheapest test | On `shared` and `shared-all` over `case-hub-chain`, `case-many-groups` and `small-clustered`, with 5 seeds: keep an order when `Â12` is 0.64 or more on the q95 of R5 or on B1. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-023](#wild-023-tight-edges-first), [WILD-056](#wild-056-order-fragility-and-the-price-of-anarchy), [WILD-053](#wild-053-input-in-any-order), `NAT-024`, `EDA-034` |
| Sources | None. The idea is new to this note. |

### WILD-023 Tight edges first

A list scheduler issues first the instructions with the least slack. In the same way, the router routes first the edges with few good ways, and last the edges with many ways of near-equal cost.

| Field | Value |
|---|---|
| Method | Analogy: compilers (list scheduling by slack) |
| Kind | `ours` |
| Math | `slack(e) = L2(e) / L1(e) - 1`, with `L1` the shortest way and `L2` the shortest way after a penalty of 3 times on the links of `L1`. Route in the order of rising slack. |
| Cost | Two more A* searches for each edge: `3 T_c`. 90 ms at 100 nodes, 3 s at 1 000 nodes. |
| Options | penalty: 2 to 10, default 3<br>ties: by id or by length |
| Makes better | R5, R6, R1 |
| Risks | None of MEAS0 |
| Reads the placement | Yes |
| Cheapest test | The same test as WILD-022. Keep it when it beats the best order of WILD-022 on one measure with `Â12` of 0.64 or more. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-022](#wild-022-shortest-edges-first-and-other-orders), [WILD-024](#wild-024-best-response-routing-game), `EDA-010` |
| Sources | [Graham 1969][graham69] |

### WILD-024 Best-response routing game

Each edge is a player. In turn, each edge drops its route and takes its best route against the routes of the others. The rounds stop when no edge changes.

| Field | Value |
|---|---|
| Method | Analogy: game theory (best responses and potential games) |
| Kind | `hybrid` |
| Math | `c_e(r) = L(r) + α · Σ_f X(r, r_f) + β · bends(r)`. Crossings are symmetric, so `Φ = Σ_e (L + β · bends) + α · Σ_(e<f) X` is an exact potential. Each strict move lowers `Φ`, so the rounds end at a Nash equilibrium. |
| Cost | `R` rounds of `T_c` with crossing tests, `R` from 3 to 5. 0.5 s at 100 nodes, 20 s at 1 000 nodes. |
| Options | α: 0 to 100<br>β: 0 to 20<br>rounds: 1 to 10<br>order of the players: as WILD-022 |
| Makes better | R1, R2, R3 |
| Risks | R5 |
| Reads the placement | Yes |
| Cheapest test | On `case-dense-groups` and `small-clustered`: keep it when R1 drops by 15% or more against `corners`, with the q95 of R5 up by less than 5%. Give its price of anarchy against WILD-055 on small boards. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-025](#wild-025-angle-priced-crossings), [WILD-055](#wild-055-exact-answers-on-small-boards), [WILD-056](#wild-056-order-fragility-and-the-price-of-anarchy), `EDA-009`, `EDA-031` |
| Sources | [Monderer 1996][monderer96], [Nash 1950][nash50], [Roughgarden 2002][roughgarden02] |

### WILD-025 Angle-priced crossings

A crossing costs less when it is near a right angle. The router then puts each crossing that it cannot avoid at a steep angle.

| Field | Value |
|---|---|
| Method | Morphological box |
| Kind | `hybrid` |
| Math | Link cost `len + Σ_x (α_0 + α · (1 - sin θ_x)^p)`, with `θ_x` the angle between the link and the leg that it crosses. |
| Cost | One round with crossing tests: `2 T_c`. 60 ms at 100 nodes, 2 s at 1 000 nodes. |
| Options | α_0: 0 to 50<br>α: 0 to 100<br>p: 1 to 4 |
| Makes better | R2, R1 |
| Risks | R5 |
| Reads the placement | Yes |
| Cheapest test | On `case-dense-groups` and `small-clustered`: keep it when the mean of R2 rises by 0.05 or more and R1 does not rise. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-024](#wild-024-best-response-routing-game), [WILD-042](#wild-042-right-angle-crossing-nudge), `EDA-024` |
| Sources | [Didimo 2009][didimo09] |

### WILD-026 Queueing price of a gap

A gap is a server with a capacity of lanes. The cost to put one more lane through a gap rises fast as the gap fills, as the delay of a queue near its capacity.

| Field | Value |
|---|---|
| Method | Analogy: queueing (the delay near the capacity of a server) |
| Kind | `hybrid` |
| Math | `cap_g = floor((width_g - gutter) / spacing)`. Link cost `len · (1 + α · x_g / (cap_g - x_g + 1))`, with `x_g` the lanes already in the gap. Route one by one, or find the equilibrium with Frank-Wolfe steps. |
| Cost | `T_c` and one gap lookup for each link. 40 ms at 100 nodes, 1.3 s at 1 000 nodes. |
| Options | α: 0 to 10<br>mode: one by one, or equilibrium<br>spacing: 2 to 8 |
| Makes better | M4, R12, M1 |
| Risks | R5, R6 |
| Reads the placement | Yes |
| Cheapest test | On `packedGridBoard` with no room: keep it when M4 drops by 30% or more with the q95 of R5 up by less than 10%. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-018](#wild-018-room-and-routes-as-a-market), [WILD-019](#wild-019-squeeze-lanes-before-opening), `EDA-009`, `EDA-031`, `EDA-051` |
| Sources | [Sheffi 1985][sheffi85] |

### WILD-027 Far view first, then refine

The router routes the links of the far view first. Each finer edge then searches only a corridor around the link of its two far items. Coarse and fine agree, and the search is smaller.

| Field | Value |
|---|---|
| Method | Multi-scale and progressive |
| Kind | `ours` |
| Math | Corridor `C_e` = the boxes of the items along the coarse link, made larger by `w`. A* on the corners in `C_e` only. When no way exists, A* on the full graph. |
| Cost | The level links and `T_c` times the share of the corridor, near `0.3 T_c` to `0.6 T_c`. 20 ms at 100 nodes, 0.5 s at 1 000 nodes. |
| Options | w: 1 to 10 u<br>level of the corridor: far view, or the coarsest level that splits the ends<br>fallback: on or off |
| Makes better | Z9, Z10 |
| Risks | R5, R6 |
| Reads the placement | Yes |
| Cheapest test | On `mid-clustered` (in CI) and `small-clustered`: keep it when Z9 drops by 30% and the time drops, with the q95 of R5 up by less than 5%. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-012](#wild-012-coarse-links-from-fine-routes), [WILD-034](#wild-034-highways-from-the-level-links), [WILD-029](#wild-029-route-each-group-alone-then-stitch), `EDA-049`, `EDA-008` |
| Sources | [Botea 2004][botea04] |

### WILD-028 Candidate routes and a joint choice

Each edge gets `k` candidate routes that pass the boxes on different sides. A local search picks one candidate for each edge, to lower the crossings and the length together.

| Field | Value |
|---|---|
| Method | Morphological box |
| Kind | `ours` |
| Math | Candidates: the `k` shortest loopless ways of Yen on the corner graph, one for each class of the boxes passed on the left. A table `X[e, i][f, j]` of crossings, pruned by bounding boxes. Minimize `Σ L + α Σ X` with simulated annealing or tabu search. |
| Cost | `k T_c` for the candidates and `O(k^2 m^2)` for the table before the pruning. 1 s at 100 nodes. Too slow above 1 000 nodes without more pruning. |
| Options | k: 2 to 8<br>α: 0 to 100<br>steps: 1 000 to 100 000 |
| Makes better | R1, R2, B5 |
| Risks | R5 |
| Reads the placement | Yes |
| Cheapest test | On the 3 case boards: keep it when R1 drops by 20% or more against `corners`, at a time below `10 T_c`. |
| Size | L: a new solver, or a change of more than one step. |
| Related | [WILD-055](#wild-055-exact-answers-on-small-boards), [WILD-024](#wild-024-best-response-routing-game), `HWY-045` |
| Sources | [Yen 1971][yen71] |

### WILD-029 Route each group alone, then stitch

The router routes the edges inside each group of the tree alone. An edge between groups goes through portals on the borders of the groups. A small graph of portals joins the groups, as in HPA*.

| Field | Value |
|---|---|
| Method | Multi-scale and progressive |
| Kind | `literature` |
| Math | Portals: one entry point for each free span of a shared border. The abstract graph holds the cached shortest ways between the portals of each group. A* on the abstract graph, then refine each abstract link inside its group. |
| Cost | `Σ T_c(group)` and the abstract search: near linear. 30 ms at 1 000 nodes, near 1 s at 10 000 nodes (estimates). |
| Options | cap of a group: 16 to 256<br>portals for each span: 1 to 3<br>smooth the result: on or off |
| Makes better | Z10, R5 |
| Risks | R5, R7 |
| Reads the placement | Yes |
| Cheapest test | On `mid-clustered` (in CI): keep it when the time drops by 3 times or more against `corners`, with the median of R5 up by less than 2%. |
| Size | L: a new solver, or a change of more than one step. |
| Related | [WILD-027](#wild-027-far-view-first-then-refine), [WILD-050](#wild-050-incremental-routing-after-a-move), `EDA-049` |
| Sources | [Botea 2004][botea04] |

## Highways and lane order

These ideas decide which edges travel together, where they merge and split, and the order of their lanes. They are candidates for the step `highway` of HWY-STEP.

### WILD-030 Detect highways after routing

Each edge routes alone. Then the step finds the stretches where several routes run near each other, and makes each stretch a highway with its lanes. The trigger is the overlap, not a key.

| Field | Value |
|---|---|
| Method | Morphological box |
| Kind | `hybrid` |
| Math | Sample each route each `u / 2`, and put the samples in cells of side `w`. A stretch is a longest sequence of cells that the same set `S` of routes crosses in order, with `abs(S) ≥ 2` and a length of `L_min` or more. The spine is the mean of the samples of `S`. The lanes snap to it. |
| Cost | `O(samples · log)` after `T_c`. 40 ms at 100 nodes, 1.3 s at 1 000 nodes. |
| Options | w: 2 to 20, default 2 · spacing<br>L_min: 2 to 20 u<br>least edges: 2 to 8 |
| Makes better | B1, B2, B7 |
| Risks | B4, B3, R9 |
| Reads the placement | Yes |
| Cheapest test | On `small-clustered` and `case-many-groups`: keep it when B1 is 0.10 or more, B4 is below 0.1 and R9 is 0. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-037](#wild-037-conservative-coalescing-of-near-routes), [WILD-031](#wild-031-approval-corridors), `HWY-031`, `HWY-025`, `HWY-050` |
| Sources | None. The idea is new to this note. |

### WILD-031 Approval corridors

Each edge approves each link that lies on a way within `1 + ε` of its shortest. A greedy cover picks few links that serve the most edges. The edges then route on the picked links at a discount.

| Field | Value |
|---|---|
| Method | Analogy: voting (approval voting) and set cover |
| Kind | `ours` |
| Math | Approve `(i, j)` when `d_s(i) + w_ij + d_t(j) ≤ (1 + ε) · d*_e`, from one forward and one backward search for each edge. Score of a link = its approvals. Pick the top links until each edge has an approved way in the set. Then discounted A*, as in `shared`. |
| Cost | Two full searches for each edge: `2 T_c` to `3 T_c`. 100 ms at 100 nodes, 3 s at 1 000 nodes. |
| Options | ε: 0.05 to 0.5<br>discount: 0.3 to 0.9<br>budget of links: 5% to 50% |
| Makes better | B1, B2, B3 |
| Risks | B4, R1 |
| Reads the placement | Yes |
| Cheapest test | Against `shared-all` on `case-many-groups` and `small-clustered`: keep it when B1 rises with the q95 of B3 at `1 + ε` or less. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-030](#wild-030-detect-highways-after-routing), [WILD-033](#wild-033-savings-merge-with-a-fair-share), `HWY-058`, `HWY-048` |
| Sources | [Brams 1978][brams78], [Chvátal 1979][chvatal79] |

### WILD-032 Warrant highways from the demand matrix

The step counts the edges between each pair of groups at a level, as a survey of trips. A pair with demand over a warrant gets a highway between the hubs of its groups. Light pairs go direct.

| Field | Value |
|---|---|
| Method | Analogy: origin-destination surveys |
| Kind | `hybrid` |
| Math | `OD_d(A, B)` = the edges between the items `A` and `B` of level `d`. A highway when `OD ≥ τ` and `span(A, B) ≥ L_min`. An edge of the pair goes plug, hub of `A`, spine, hub of `B`, plug. `d` is the coarsest level that splits the pair. |
| Cost | `O(m)` for the matrix, and `T_c` for the spines and the legs. Near the cost of `sections`. |
| Options | τ: 2 to 20<br>level: coarsest, or by span<br>L_min: 2 to 20 u |
| Makes better | B1, B8, Z9 |
| Risks | R5, R7, B4 |
| Reads the placement | Yes |
| Cheapest test | Against `sections` on `case-hub-chain` and `small-clustered`: keep it when B1 is within 0.02 and R7 is lower. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-034](#wild-034-highways-from-the-level-links), [WILD-033](#wild-033-savings-merge-with-a-fair-share), `EDA-033`, `HWY-041` |
| Sources | [Sheffi 1985][sheffi85] |

### WILD-033 Savings merge with a fair share

Each edge starts alone. The two bundles whose merge saves the most ink merge first. A merge holds only when each edge pays less than alone: its share of the shared ink plus its own detour.

| Field | Value |
|---|---|
| Method | Analogy: economics of shared roads (cost sharing) |
| Kind | `hybrid` |
| Math | `s(A, B) = ink(A) + ink(B) - ink(A ∪ B)`, with the ink of a trunk to the split point. Accept when for each `e`: `shared / abs(A ∪ B) + own(e) + detour(e) ≤ alone(e)`. A priority queue of the savings over pairs of near bundles. |
| Cost | `O(p log p)` merges for `p` candidate pairs, each with a trunk test. 50 ms at 100 nodes, 2 s at 1 000 nodes. |
| Options | pairs: the 4 to 16 nearest bundles<br>detour cap: 1.1 to 2<br>share: equal, or by length |
| Makes better | B1, B3, R6 |
| Risks | B4 |
| Reads the placement | Yes |
| Cheapest test | Against `trunks` on `mid-fanout` (in CI) and `small-clustered`: keep it when B1 rises with the q95 of B3 at 1.2 or less. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-031](#wild-031-approval-corridors), [WILD-030](#wild-030-detect-highways-after-routing), `HWY-047`, `HWY-038`, `EDA-029` |
| Sources | [Clarke 1964][clarke64] |

### WILD-034 Highways from the level links

The router routes the links of the far view first. Each edge between two far items follows the link of its items as its highway, and its lanes stack along the link.

| Field | Value |
|---|---|
| Method | Multi-scale and progressive |
| Kind | `hybrid` |
| Math | For `e = (u, v)`: `d*` = the coarsest level where `u` and `v` are in different items `A` and `B`. The way: plug of `u`, the start of `link_d*(A, B)` through `A`, the link, the end of the link, plug of `v`. Inside an item, the same rule repeats on the finer level. |
| Cost | The level links of today and two short A* searches for each edge: near `0.5 T_c`. 20 ms at 100 nodes, 0.6 s at 1 000 nodes. |
| Options | level: coarsest, or by span<br>repeat inside the items: on or off<br>lane order: `bundle` or `run` |
| Makes better | Z9, B1, B2 |
| Risks | R5, R6, R7 |
| Reads the placement | Yes |
| Cheapest test | On `mid-clustered` (in CI) and `case-dense-groups`: keep it when Z9 is 0, B1 is at least the value of `sections`, and R7 is not higher. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-012](#wild-012-coarse-links-from-fine-routes), [WILD-027](#wild-027-far-view-first-then-refine), [WILD-032](#wild-032-warrant-highways-from-the-demand-matrix), `HWY-056`, `HWY-001` |
| Sources | None. The idea is new to this note. |

### WILD-035 Streets along the cuts

A guillotine grouping cuts the board with lines. The free parts of those lines become streets. Each edge between groups goes to the nearest street and travels along the streets.

| Field | Value |
|---|---|
| Method | Analogy: city blocks and the seams of a garment |
| Kind | `ours` |
| Math | The street graph: the cut lines of `cut` or `kd`, cut to their free parts, with nodes at their crossings. Each edge: A* to the nearest street point on the border of its group, A* on the street graph, then A* down. Lanes on each street in bundle order. |
| Cost | `O(n)` street segments. `T_c` on a smaller graph. 30 ms at 100 nodes, 1 s at 1 000 nodes. |
| Options | grouping rule: cut or kd<br>street levels: 1 to 3<br>cost to reach a street: 0 to 4 u |
| Makes better | B1, B2, B7, R14 |
| Risks | R5, R6, M4 |
| Reads the placement | Yes |
| Cheapest test | On `nestedGridBoard` and `case-many-groups`: keep it when B7 and R1 drop, with the q95 of R5 at 1.6 or less. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-034](#wild-034-highways-from-the-level-links), [WILD-017](#wild-017-water-filling-room), `HWY-058`, `HWY-057` |
| Sources | None. The idea is new to this note. |

### WILD-036 Manifolds for a fan to a row

When one node links to many boxes in a row, one header line goes along the row, in the gap before it. A short tap leaves the header at a right angle to each box.

| Field | Value |
|---|---|
| Method | Analogy: plumbing (a manifold with taps) |
| Kind | `ours` |
| Math | Find the targets of `u` whose centers lie in one band on an axis, with 1D clustering, `k_min` or more. The header lies on the free line in the gap before the row, from the first tap to the last. The feed goes from `u` to the start of the header by A*. |
| Cost | `O(m log m)` and `T_c` of the feeds. 5 ms at 100 nodes, 100 ms at 1 000 nodes. |
| Options | k_min: 3 to 8<br>band: 0.5 to 2 box heights<br>side of the taps: near or far |
| Makes better | B1, R3, R14, B7 |
| Risks | B4, R5 |
| Reads the placement | Yes |
| Cheapest test | On `mid-fanout` (in CI) and a small case board with fans: keep it when B1 rises by 0.1 or more and the mean of R3 drops. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-005](#wild-005-angular-cohorts-share-a-plug), [WILD-040](#wild-040-flush-lanes-after-an-exit), `HWY-017`, `EDA-035`, `HWY-037` |
| Sources | None. The idea is new to this note. |

### WILD-037 Conservative coalescing of near routes

Two routes that go parallel and close become one corridor, as a compiler merges two copies of one value. The merge is conservative: it adds no crossing and no route through a box.

| Field | Value |
|---|---|
| Method | Analogy: compilers (register coalescing) |
| Kind | `ours` |
| Math | A candidate pair: legs within 5° and a distance `d` or less, with an overlap of `L` or more. The merge moves both legs to their mean line. Accept when `crossings(after) ≤ crossings(before)`, `through = 0` and the detour is under its cap. Repeat to a fixed point, cheapest first. |
| Cost | `O(m log m)` with a grid of segments. 5 ms at 100 nodes, 100 ms at 1 000 nodes. |
| Options | d: 2 to 20<br>angle: 2° to 10°<br>L: 2 to 20 u |
| Makes better | B1, B2, R12 |
| Risks | B4, B3 |
| Reads the placement | Yes |
| Cheapest test | On `corners` over `small-clustered`: keep it when B1 is 0.05 or more, R1 does not rise, and R9 is 0. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-030](#wild-030-detect-highways-after-routing), `HWY-026` |
| Sources | [Briggs 1994][briggs94], [George 1996][george96] |

### WILD-038 Braid crossings at the best place

The order of the lanes at the entry and at the exit of a highway fixes the crossings that it needs. The step writes the change as a braid of swaps, and does each swap where the highway is long and straight.

| Field | Value |
|---|---|
| Method | Analogy: weaving and braids |
| Kind | `ours` |
| Math | Needed crossings = `inv(π_in, π_out)`, the count of inversions, in `O(k log k)`. It is a lower bound of B5 on this highway. Write the swaps as a bubble-sort word. A dynamic program gives each swap to a segment with the lowest `1 / len + λ · curvature`. |
| Cost | `O(k^2 + segments · k)` for each highway. Less than 5 ms at 1 000 nodes. |
| Options | λ: 0 to 10<br>swaps for each segment: 1 to 8<br>place: the longest segment, or the ends |
| Makes better | B5, R2, B6 |
| Risks | B9 |
| Reads the placement | Yes |
| Cheapest test | On `shared-all` over `case-many-groups`: keep it when B5 equals the lower bound on 90% of the highways and the body crossings sit on the straightest segments. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-039](#wild-039-one-global-lane-order), [WILD-042](#wild-042-right-angle-crossing-nudge), `EDA-026`, `HWY-016` |
| Sources | [Artin 1947][artin47] |

### WILD-039 One global lane order

Today each run, or each stretch of a bundle, orders its lanes. The inverse fixes one order of all the edges, and every run uses it. Two edges then keep one side of each other everywhere.

| Field | Value |
|---|---|
| Method | Inversion |
| Kind | `hybrid` |
| Math | Key of `e`: the rank of its source along a Hilbert curve, then the rank of its target. Or sifting: move one edge at a time to its best place in `π`, with incremental counts of the crossings of the runs. |
| Cost | `O(m log m)` for the key. `O(m^2)` for sifting, with a cap at 2 000 edges. |
| Options | key: Hilbert, angle, or spectral<br>sifting passes: 0 to 3 |
| Makes better | B5, R1 |
| Risks | R1, B9 |
| Reads the placement | Yes |
| Cheapest test | Against the order `bundle` on `shared-all` over `case-many-groups`: keep it when the end crossings drop below 687, with 0 body crossings. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-038](#wild-038-braid-crossings-at-the-best-place), `EDA-026`, `HWY-016` |
| Sources | [Bekos 2007][bekos07], [Pupyrev 2011][pupyrev11] |

### WILD-040 Flush lanes after an exit

When a lane leaves a highway, the other lanes can stay straight. A dynamic program picks the side to which the lane stack is flush on each segment, so the lanes that go on do not shift.

| Field | Value |
|---|---|
| Method | Analogy: heating and cooling (a reducing duct) |
| Kind | `ours` |
| Math | The state is the offset `o_j` of the stack on segment `j`: flush left, flush right, centered, or a lane index. Cost = `Σ abs(Δ lateral place)` of the lanes that go on, plus `μ` for each exit on the inner side. `O(J · S^2)` for `J` segments and `S` states. |
| Cost | `O(J · S^2)` for each highway. Less than 1 ms. |
| Options | states: 3, or the lanes + 1<br>μ: 0 to 10 |
| Makes better | B9, C2, C3, B6 |
| Risks | R12 |
| Reads the placement | Yes |
| Cheapest test | On `trunks` over `case-dense-groups` and `shared-all` over `case-many-groups`: keep it when the sum of the lateral shifts drops by 50% and the maximum of C2 does not rise. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-041](#wild-041-lane-changes-as-voice-leading), [WILD-038](#wild-038-braid-crossings-at-the-best-place), `EDA-017` |
| Sources | None. The idea is new to this note. |

## Curves

These ideas change the curves after the routes. [CURVES](CURVES.md) gives the curve types.

### WILD-041 Lane changes as voice leading

When a lane must shift to the side, it glides over a length that grows with the shift. A voice moves to the nearest note of the next chord in the same way. The slots of each next run keep the total shift small.

| Field | Value |
|---|---|
| Method | Analogy: music (voice leading) |
| Kind | `ours` |
| Math | Match the lanes to the slots of run `j + 1` by `min Σ abs(pos_j(e) - pos_(j+1)(e))`. In 1D, the sorted match is optimal, in `O(k log k)`. A shift `Δ` becomes a quintic S curve over the length `max(ℓ_0, c · abs(Δ))`. |
| Cost | `O(k log k)` for each joint. Less than 1 ms. |
| Options | ℓ_0: 2 to 20<br>c: 2 to 8 |
| Makes better | B9, C2, C4 |
| Risks | B5, R12 |
| Reads the placement | Yes |
| Cheapest test | On `shared-all` over `case-many-groups`: keep it when the maximum of C2 on the lane shifts drops by 50% and B5 does not rise. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-040](#wild-040-flush-lanes-after-an-exit), `EDA-016` |
| Sources | [Tymoczko 2006][tymoczko06] |

### WILD-042 Right-angle crossing nudge

Near each crossing of two curves, both curves turn so they cross at a steeper angle. A short straight piece through the crossing keeps the angle, and the curves blend back inside the free space.

| Field | Value |
|---|---|
| Method | Morphological box |
| Kind | `hybrid` |
| Math | At a crossing `x` with angle `θ < θ_min`: turn each tangent by `(θ_min - θ) / 2` about `x` over a window `w`. Put a cubic with the new tangent at `x` and G1 joints at the ends of the window. Reject the change when the clearance falls below the margin. |
| Cost | `O(X · w)` for `X` crossings. 10 ms at 1 000 nodes. |
| Options | θ_min: 30° to 90°<br>w: 2 to 10 u |
| Makes better | R2 |
| Risks | C3, C11, C8, C7 |
| Reads the placement | Yes |
| Cheapest test | On `case-dense-groups` with the curve `smooth`: keep it when the minimum of R2 rises by 15° and C7 stays 0. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-025](#wild-025-angle-priced-crossings), [WILD-038](#wild-038-braid-crossings-at-the-best-place) |
| Sources | [Didimo 2009][didimo09] |

### WILD-043 Optical lane spacing at bends

Two lanes look closer on a tight bend than on a straight leg at the same spacing. The spacing grows a little where the curvature is high, so the lanes look even.

| Field | Value |
|---|---|
| Method | Analogy: typography (optical kerning) |
| Kind | `ours` |
| Math | `s(p) = s_0 · (1 + k · s_0 · abs(κ(p)))`, with a cap at `1.5 s_0`. The offsets of `highwayCurves` use `s(p)` on each arc. |
| Cost | `O(lanes · arcs)`. Less than 1 ms. |
| Options | k: 0.5 to 2<br>cap: 1 to 2 times s_0 |
| Makes better | R12, B9 |
| Risks | M4 |
| Reads the placement | Yes |
| Cheapest test | Keep it only when R12 on the curves drops and the bends that need room (HWC-D) do not rise. A study with readers decides the final value of `k`. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-019](#wild-019-squeeze-lanes-before-opening), [WILD-040](#wild-040-flush-lanes-after-an-exit) |
| Sources | None. The idea is new to this note. |

### WILD-044 Curve for each edge by a small portfolio

Each route tries the curve types `arc`, `smooth`, `clothoid` and `spline`. A score of the curve measures picks the best type for that route.

| Field | Value |
|---|---|
| Method | Meta |
| Kind | `ours` |
| Math | `score(c) = Σ_i w_i · norm(C_i(c))` over C2, C3, C7 and C8. Take the type with the lowest score. A tie goes to the cheaper type. |
| Cost | Four times the curve step. Less than 10 ms at 1 000 nodes. |
| Options | types: a subset of the registry<br>weights: 0 to 1 |
| Makes better | C3, C2, C7 |
| Risks | C11 |
| Reads the placement | Yes |
| Cheapest test | On `case-dense-groups` and `small-clustered`: keep it when the median score beats the best single type by 5%, with less than 30% of the routes in a second style. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-045](#wild-045-a-portfolio-for-each-board) |
| Sources | None. The idea is new to this note. |

## The whole pipeline

These ideas change more than one step: the choice of the settings, the passes and the stability after a move.

### WILD-045 A portfolio for each board

For one board, the pipeline tries a short list of complete settings: group, router, curve and room. The suite measures each, and the pipeline keeps the best weighted score within a time budget.

| Field | Value |
|---|---|
| Method | Meta |
| Kind | `ours` |
| Math | `score(s) = Σ_i w_i · rank-normalized measure_i(s)`. Keep the setting with the lowest score, and the Pareto set to show. Stop a setting when its time passes the budget. |
| Cost | The sum of the times of the settings. CI for the full list. |
| Options | settings: 3 to 20<br>weights of the measures<br>time budget: 0.1 to 10 s |
| Makes better | R1, R5, B1, C3 |
| Risks | Z10 |
| Reads the placement | Yes |
| Cheapest test | On the boards of SCREEN: keep it when its score beats the best single setting on 60% of the boards. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-046](#wild-046-learned-choice-of-the-strategy), [WILD-047](#wild-047-automatic-tuning-with-successive-halving), [WILD-044](#wild-044-curve-for-each-edge-by-a-small-portfolio), `NAT-045` |
| Sources | [Rice 1976][rice76], [Xu 2008][xu08] |

### WILD-046 Learned choice of the strategy

Features of the board predict the best setting, so only one setting routes. A model trained on the records of SCREEN maps the features to the winner of WILD-045.

| Field | Value |
|---|---|
| Method | Meta |
| Kind | `literature` |
| Math | Features: `n`, `m`, `m / n`, degree skew, the coefficient of variation of the box sizes, the nearest-neighbour ratio of the centers, the share of edges with keys, the largest fan-out and the mean span over `u`. Model: k nearest neighbours or gradient-boosted trees. |
| Cost | Features in `O(n log n)`. The training is offline. |
| Options | model: kNN or trees<br>k: 1 to 10<br>feature set |
| Makes better | R1, R5, B1 |
| Risks | R5, R6 |
| Reads the placement | Yes |
| Cheapest test | Leave one family out: keep it when the chosen setting is within 5% of the portfolio score on 70% of the boards. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-045](#wild-045-a-portfolio-for-each-board) |
| Sources | [Rice 1976][rice76], [Xu 2008][xu08], [Kwon 2018][kwon18] |

### WILD-047 Automatic tuning with successive halving

TUNE sweeps the options. Successive halving makes it cheap: many settings try small boards, the best part goes on to larger boards, and only a few reach the largest.

| Field | Value |
|---|---|
| Method | Meta |
| Kind | `literature` |
| Math | Hyperband with the budgets 100, 400 and 1 000 nodes. Sample `n_0` settings from each `schema`. Keep the top `1 / η` at each rung by the weighted score, and compare with `Â12`. |
| Cost | Near `η · log_η(R)` times one full sweep of the best few. CI only. |
| Options | η: 2 to 4<br>n_0: 20 to 200<br>weights of the measures |
| Makes better | R5, B1, M1 |
| Risks | None of MEAS0 |
| Reads the placement | Yes |
| Cheapest test | Tune on seeds 1 to 3 and test on seeds 4 and 5: keep it when the tuned setting beats the defaults with `Â12` of 0.64 or more on the test seeds. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-048](#wild-048-tune-on-crops-of-the-board), [WILD-045](#wild-045-a-portfolio-for-each-board), `NAT-044`, `NAT-046` |
| Sources | [Li 2018][li18], [López-Ibáñez 2016][lopez16] |

### WILD-048 Tune on crops of the board

A large board is costly to tune. The tuner cuts a few windows of 100 to 200 nodes from it and tunes on the windows. The whole board then uses the best setting.

| Field | Value |
|---|---|
| Method | Multi-scale and progressive |
| Kind | `ours` |
| Math | `k` random squares that hold `n_w` nodes each. An edge cut by the border goes to a fixed point on the border. Rank the settings on the windows. The Kendall tau between the window ranks and the full ranks checks the proxy. |
| Cost | `k` windows times the settings times `T_c(n_w)`. |
| Options | k: 3 to 10<br>n_w: 50 to 300 |
| Makes better | R5, B1 |
| Risks | None of MEAS0 |
| Reads the placement | Yes |
| Cheapest test | On `mid-clustered` (in CI): keep it when the Kendall tau between the window ranks and the full ranks is 0.7 or more over 10 settings. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-047](#wild-047-automatic-tuning-with-successive-halving) |
| Sources | None. The idea is new to this note. |

### WILD-049 Room and routes to a fixed point

The pipeline routes, opens the room that the routes need, and routes again on the opened board. It stops when the routes and the gaps stop changing, or after three rounds.

| Field | Value |
|---|---|
| Method | Inversion |
| Kind | `ours` |
| Math | `x_(t+1) = Room(Route(x_t))`. Stop when the largest change of a gap is below `u / 2`, or at `t = 3`. When it oscillates, damp it: `x_(t+1) = x_t + 0.5 · (Room - x_t)`. |
| Cost | Three times `T_c` and the room step. 100 ms at 100 nodes, 3 s at 1 000 nodes. |
| Options | rounds: 1 to 5<br>damping: 0 to 0.9 |
| Makes better | M4, R9, R5 |
| Risks | M1, M3 |
| Reads the placement | Yes |
| Cheapest test | On `packedGridBoard`: keep it when M4 is 0 at a lower M1 than one pass of ROOM. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-018](#wild-018-room-and-routes-as-a-market), [WILD-017](#wild-017-water-filling-room), `EDA-008` |
| Sources | None. The idea is new to this note. |

### WILD-050 Incremental routing after a move

When one box moves, only the routes near it change. The routes that touch the old or the new place of the box, or end at it, route again. The others keep their points.

| Field | Value |
|---|---|
| Method | Multi-scale and progressive |
| Kind | `ours` |
| Math | Dirty region `D = inflate(box_old ∪ box_new, margin)`. Route `e` again when its route meets `D` or one of its ends is the moved box. Check the other routes against the new obstacles, and route again each one that fails. |
| Cost | `O(dirty · A*)` for each move. 1 to 5 ms at 1 000 nodes. |
| Options | margin: 0 to 4 u<br>repair: route again, or shift the points |
| Makes better | Z10 |
| Risks | R1, B1 |
| Reads the placement | Yes |
| Cheapest test | Under the seeded moves of MEAS0 on `small-clustered` and `mid-clustered`: keep it when the mean of Z10 drops by 50% and R1 and R5 stay within 2% of a full route. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-051](#wild-051-advice-to-the-layout), [WILD-010](#wild-010-incumbent-bonus-for-stable-groups), [WILD-029](#wild-029-route-each-group-alone-then-stitch), `EDA-023`, `HWY-054` |
| Sources | [Bridgeman 2000][bridgeman00] |

### WILD-051 Advice to the layout

The router gives the host a push for each box: the direction that makes the routes around the box shorter. The later joint step of placement and routing can use the push as a force.

| Field | Value |
|---|---|
| Method | Inversion |
| Kind | `ours` |
| Math | `f_b = Σ_e` the push of each route that bends at a corner of `b`: the unit vector from the corner toward the chord without that bend, times the excess length. Divide by the size of the box. |
| Cost | `O(Σ points of the routes)`. Less than 5 ms at 1 000 nodes. |
| Options | weight: 0 to 1<br>cap of a push: 0.5 to 4 u |
| Makes better | R5, R6, R3 |
| Risks | H1, M5 |
| Reads the placement | No |
| Cheapest test | On `small-clustered`, move each box by `0.5u` along its push and route again: keep it when the median of R5 drops by 3% or more with no overlap of boxes. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-050](#wild-050-incremental-routing-after-a-move) |
| Sources | None. The idea is new to this note. |

### WILD-052 An anytime pipeline

The pipeline gives a usable picture at once and better pictures later. Straight lines come first, then corner routes, then highways and curves. The host shows the latest complete stage.

| Field | Value |
|---|---|
| Method | Multi-scale and progressive |
| Kind | `ours` |
| Math | Stages `S_0..S_k` with the times `t_i`. At the deadline `τ`, show `S_j` with the largest `j` where `Σ_(i≤j) t_i ≤ τ`. Each stage keeps the plugs of the stage before it, so the picture changes little. |
| Cost | The sum of the stages. The first picture costs `O(m)`. |
| Options | stages: 2 to 5<br>time slice: 16 to 200 ms |
| Makes better | Z10 |
| Risks | Z10 |
| Reads the placement | Yes |
| Cheapest test | On `mid-clustered` (in CI): keep it when the first picture comes in less than 50 ms and Z10 between the last two stages is below `2u`. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-029](#wild-029-route-each-group-alone-then-stitch), [WILD-050](#wild-050-incremental-routing-after-a-move) |
| Sources | [Zilberstein 1996][zilberstein96] |

### WILD-053 Input in any order

Today the order of the edges in the input can change the routes. The routers sort the edges by a stable hash of their ids first. The same board in any order then gives the same routes.

| Field | Value |
|---|---|
| Method | Inversion |
| Kind | `ours` |
| Math | Order = sort by `(rule key, hash64(edge.id))`. The test shuffles the input `k` times and compares the routes by the Fréchet distance. |
| Cost | `O(m log m)`. Less than 1 ms. |
| Options | hash: FNV-1a or xxHash |
| Makes better | Z10, G9 |
| Risks | None of MEAS0 |
| Reads the placement | No |
| Cheapest test | Shuffle `small-clustered` 10 times: keep it when each route is equal over the shuffles, against the spread of today. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-056](#wild-056-order-fragility-and-the-price-of-anarchy), [WILD-022](#wild-022-shortest-edges-first-and-other-orders) |
| Sources | None. The idea is new to this note. |

## New measures and exact bounds

MEAS0 gives 59 measures. These ideas add a ceiling for the bundle measures, exact answers on small boards, and four measures that MEAS0 does not have. The ids W1 to W7 are proposals for MEAS2.

### WILD-054 An ink floor from moats

Bundles save ink, but the largest possible saving is not known. A primal-dual bound of the Steiner forest gives a floor for the ink of each drawing that joins the same plug pairs. B1 then has a ceiling.

| Field | Value |
|---|---|
| Method | Measure |
| Kind | `ours` |
| Math | Grow moats around the plugs of the pairs that are not yet joined, at one rate. The sum of the growth of the active moats is a dual value `LB ≤ OPT`. Then `inkSaved ≤ 1 - LB / Σ L(r_e)`. Boxes make `OPT` larger, so the bound holds. |
| Cost | `O(p^2 log p)` for `p` plugs. Up to 2 000 plugs in less than 1 s. |
| Options | none |
| Makes better | B1 |
| Risks | None of MEAS0 |
| Reads the placement | Yes |
| Cheapest test | A test: the bound is at most the ink of each router on each board. Then the bench gives `B1 / B1_max` on 5 boards. |
| Size | M: a strategy folder with its tests. |
| Related | [WILD-055](#wild-055-exact-answers-on-small-boards), [WILD-030](#wild-030-detect-highways-after-routing), `HWY-040`, `EDA-012` |
| Sources | [Agrawal 1995][agrawal95] |

### WILD-055 Exact answers on small boards

On boards with up to 12 edges, an exact solver picks one route for each edge from `k` candidates. It finds the fewest crossings and the shortest length. Each router gets its gap to this answer for MEAS2.

| Field | Value |
|---|---|
| Method | Measure |
| Kind | `ours` |
| Math | Candidates: Yen with `k = 6`. ILP: `x_ei` in `{0, 1}`, `Σ_i x_ei = 1`, `y_eifj ≥ x_ei + x_fj - 1`. Minimize `Σ L_ei x_ei + α Σ X_eifj y_eifj`. HiGHS, or branch and bound with the bound `Σ_e min_i L_ei`. |
| Cost | Seconds for 12 edges. CI only. |
| Options | k: 3 to 10<br>α: 1 to 100 |
| Makes better | R1, R5 |
| Risks | None of MEAS0 |
| Reads the placement | Yes |
| Cheapest test | It must find the optimum of a brute force on 20 boards with 6 edges. The optimum is over the candidates only, so the note gives it as an upper bound of the true optimum. |
| Size | L: a new solver, or a change of more than one step. |
| Related | [WILD-028](#wild-028-candidate-routes-and-a-joint-choice), [WILD-024](#wild-024-best-response-routing-game), [WILD-054](#wild-054-an-ink-floor-from-moats), `HWY-040`, `EDA-026` |
| Sources | [Yen 1971][yen71], [Huangfu 2018][huangfu18] |

### WILD-056 Order fragility and the price of anarchy

The bench routes a board with 20 random orders of the edges. The spread of each measure is its order fragility. The ratio of the default order to the best of the 20 shows what a better order can gain.

| Field | Value |
|---|---|
| Method | Measure |
| Kind | `ours` |
| Math | `frag_f = IQR(f over the orders) / median(f)`. `poa_f = f(default) / min(f over the orders)`. |
| Cost | `20 T_c`. CI only above 400 nodes. |
| Options | orders: 10 to 50 |
| Makes better | R1, R5, B1 |
| Risks | None of MEAS0 |
| Reads the placement | Yes |
| Cheapest test | On `shared` and `sections` over 3 boards: keep the measure when two routers differ in fragility by 2 times or more. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-022](#wild-022-shortest-edges-first-and-other-orders), [WILD-053](#wild-053-input-in-any-order), [WILD-024](#wild-024-best-response-routing-game) |
| Sources | [Roughgarden 2002][roughgarden02] |

### WILD-057 Tracing load

A reader traces one edge from end to end. Each crossing, merge and split on the way is a place to choose. The measure counts these places for each edge, with a weight for how hard each one is.

| Field | Value |
|---|---|
| Method | Measure |
| Kind | `ours` |
| Math | `T(e) = crossings + 2 · (merges and splits where e is not the outer lane) + 0.5 · bends`. Report `q_0.5` and `q_0.95`. |
| Cost | `O(n log n)` with the pass of R1. |
| Options | weights: 0 to 4 |
| Makes better | R1, B4 |
| Risks | None of MEAS0 |
| Reads the placement | Yes |
| Cheapest test | Rank the 9 routers on 3 boards: keep the measure when its ranks differ from the ranks of R1, with a Kendall tau below 0.8. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-058](#wild-058-ink-hot-spots), `HWY-049` |
| Sources | [Ware 2002][ware02] |

### WILD-058 Ink hot spots

B7 counts the cells that the ink touches. A hot spot is a small area with much ink. The measure gives the 95th percentile of the ink in each cell, against the straight lines.

| Field | Value |
|---|---|
| Method | Measure |
| Kind | `ours` |
| Math | `h = q_0.95(ink in each cell of side 4u) / q_0.95(ink of the straight lines in each cell)`. |
| Cost | `O(n log n)`. |
| Options | cell: 2 to 8 u |
| Makes better | B7 |
| Risks | None of MEAS0 |
| Reads the placement | Yes |
| Cheapest test | Keep the measure when it separates the routers with bundles from the routers without bundles on 3 boards, where B7 does not. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-057](#wild-057-tracing-load), [WILD-016](#wild-016-bundle-level-of-detail) |
| Sources | None. The idea is new to this note. |

### WILD-059 Monotone share

A route that goes toward its target on both axes all the way is easy to follow. The measure gives the share of the routes that are monotone in the direction from the source to the target.

| Field | Value |
|---|---|
| Method | Measure |
| Kind | `ours` |
| Math | `mono(e) = 1` when each leg outside the plug stubs has `dx · sign(Δx) ≥ -ε` and `dy · sign(Δy) ≥ -ε`. Report the share. |
| Cost | `O(points)`. |
| Options | ε: 0 to 4 |
| Makes better | R7 |
| Risks | None of MEAS0 |
| Reads the placement | Yes |
| Cheapest test | Keep the measure when its Spearman correlation with R7 over the routers and the boards is below 0.8. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-022](#wild-022-shortest-edges-first-and-other-orders) |
| Sources | [Angelini 2012][angelini12] |

### WILD-060 Lane legibility at each zoom

A lane helps only when the reader can tell it from its neighbour. At the scale of each level, the measure counts the bundles whose lanes are less than one pixel apart.

| Field | Value |
|---|---|
| Method | Measure |
| Kind | `ours` |
| Math | `leg_d = share of the runs of level d with spacing · scale_d < 1 px`, with `scale_d` from `pickLevel`. |
| Cost | `O(runs)` for each level. |
| Options | threshold: 0.5 to 2 px |
| Makes better | B9 |
| Risks | None of MEAS0 |
| Reads the placement | Yes |
| Cheapest test | Keep the measure when it is above 0 for some routers at some levels on `case-many-groups`. |
| Size | S: one file in a strategy folder. |
| Related | [WILD-016](#wild-016-bundle-level-of-detail), [WILD-019](#wild-019-squeeze-lanes-before-opening) |
| Sources | None. The idea is new to this note. |

## The ranking

The value of an idea is a mark from 1 to 5. It joins two estimates. The first is how much a win moves the measures of the [short list of MEAS1](MEASURES.md#the-short-list-for-meas1). The second is the chance that the idea passes its test. The size gives the cost: S is 1, M is 2 and L is 4. The table sorts the ideas by the value for each unit of size.

| Rank | Idea | Step | Value | Size | Value for each unit of size |
|---:|---|---|---:|---|---:|
| 1 | [WILD-053](#wild-053-input-in-any-order) Input in any order | `whole` | 5 | S | 5.00 |
| 2 | [WILD-002](#wild-002-plug-justification) Plug justification | `plugs` | 4 | S | 4.00 |
| 3 | [WILD-022](#wild-022-shortest-edges-first-and-other-orders) Shortest edges first, and other orders | `router` | 4 | S | 4.00 |
| 4 | [WILD-039](#wild-039-one-global-lane-order) One global lane order | `highway` | 4 | S | 4.00 |
| 5 | [WILD-056](#wild-056-order-fragility-and-the-price-of-anarchy) Order fragility and the price of anarchy | `whole` | 4 | S | 4.00 |
| 6 | [WILD-004](#wild-004-side-spill-by-capacity) Side spill by capacity | `plugs` | 3 | S | 3.00 |
| 7 | [WILD-005](#wild-005-angular-cohorts-share-a-plug) Angular cohorts share a plug | `plugs` | 3 | S | 3.00 |
| 8 | [WILD-011](#wild-011-level-ladder-by-line-breaking) Level ladder by line breaking | `levels` | 3 | S | 3.00 |
| 9 | [WILD-014](#wild-014-zoom-hysteresis) Zoom hysteresis | `levels` | 3 | S | 3.00 |
| 10 | [WILD-016](#wild-016-bundle-level-of-detail) Bundle level of detail | `levels` | 3 | S | 3.00 |
| 11 | [WILD-017](#wild-017-water-filling-room) Water-filling room | `room` | 3 | S | 3.00 |
| 12 | [WILD-019](#wild-019-squeeze-lanes-before-opening) Squeeze lanes before opening | `room` | 3 | S | 3.00 |
| 13 | [WILD-023](#wild-023-tight-edges-first) Tight edges first | `router` | 3 | S | 3.00 |
| 14 | [WILD-036](#wild-036-manifolds-for-a-fan-to-a-row) Manifolds for a fan to a row | `highway` | 3 | S | 3.00 |
| 15 | [WILD-041](#wild-041-lane-changes-as-voice-leading) Lane changes as voice leading | `curve` | 3 | S | 3.00 |
| 16 | [WILD-057](#wild-057-tracing-load) Tracing load | `whole` | 3 | S | 3.00 |
| 17 | [WILD-060](#wild-060-lane-legibility-at-each-zoom) Lane legibility at each zoom | `whole` | 3 | S | 3.00 |
| 18 | [WILD-034](#wild-034-highways-from-the-level-links) Highways from the level links | `highway` | 5 | M | 2.50 |
| 19 | [WILD-001](#wild-001-free-plugs-on-a-side) Free plugs on a side | `plugs` | 4 | M | 2.00 |
| 20 | [WILD-012](#wild-012-coarse-links-from-fine-routes) Coarse links from fine routes | `levels` | 4 | M | 2.00 |
| 21 | [WILD-024](#wild-024-best-response-routing-game) Best-response routing game | `router` | 4 | M | 2.00 |
| 22 | [WILD-030](#wild-030-detect-highways-after-routing) Detect highways after routing | `highway` | 4 | M | 2.00 |
| 23 | [WILD-038](#wild-038-braid-crossings-at-the-best-place) Braid crossings at the best place | `highway` | 4 | M | 2.00 |
| 24 | [WILD-045](#wild-045-a-portfolio-for-each-board) A portfolio for each board | `whole` | 4 | M | 2.00 |
| 25 | [WILD-050](#wild-050-incremental-routing-after-a-move) Incremental routing after a move | `whole` | 4 | M | 2.00 |
| 26 | [WILD-054](#wild-054-an-ink-floor-from-moats) An ink floor from moats | `whole` | 4 | M | 2.00 |
| 27 | [WILD-043](#wild-043-optical-lane-spacing-at-bends) Optical lane spacing at bends | `curve` | 2 | S | 2.00 |
| 28 | [WILD-044](#wild-044-curve-for-each-edge-by-a-small-portfolio) Curve for each edge by a small portfolio | `curve` | 2 | S | 2.00 |
| 29 | [WILD-058](#wild-058-ink-hot-spots) Ink hot spots | `whole` | 2 | S | 2.00 |
| 30 | [WILD-059](#wild-059-monotone-share) Monotone share | `whole` | 2 | S | 2.00 |
| 31 | [WILD-003](#wild-003-plug-auction) Plug auction | `plugs` | 3 | M | 1.50 |
| 32 | [WILD-007](#wild-007-groups-from-routes) Groups from routes | `group` | 3 | M | 1.50 |
| 33 | [WILD-008](#wild-008-line-breaking-on-a-space-filling-curve) Line breaking on a space-filling curve | `group` | 3 | M | 1.50 |
| 34 | [WILD-010](#wild-010-incumbent-bonus-for-stable-groups) Incumbent bonus for stable groups | `group` | 3 | M | 1.50 |
| 35 | [WILD-013](#wild-013-budgeted-frontier-expansion) Budgeted frontier expansion | `levels` | 3 | M | 1.50 |
| 36 | [WILD-025](#wild-025-angle-priced-crossings) Angle-priced crossings | `router` | 3 | M | 1.50 |
| 37 | [WILD-026](#wild-026-queueing-price-of-a-gap) Queueing price of a gap | `router` | 3 | M | 1.50 |
| 38 | [WILD-027](#wild-027-far-view-first-then-refine) Far view first, then refine | `router` | 3 | M | 1.50 |
| 39 | [WILD-031](#wild-031-approval-corridors) Approval corridors | `highway` | 3 | M | 1.50 |
| 40 | [WILD-032](#wild-032-warrant-highways-from-the-demand-matrix) Warrant highways from the demand matrix | `highway` | 3 | M | 1.50 |
| 41 | [WILD-033](#wild-033-savings-merge-with-a-fair-share) Savings merge with a fair share | `highway` | 3 | M | 1.50 |
| 42 | [WILD-035](#wild-035-streets-along-the-cuts) Streets along the cuts | `highway` | 3 | M | 1.50 |
| 43 | [WILD-037](#wild-037-conservative-coalescing-of-near-routes) Conservative coalescing of near routes | `highway` | 3 | M | 1.50 |
| 44 | [WILD-040](#wild-040-flush-lanes-after-an-exit) Flush lanes after an exit | `highway` | 3 | M | 1.50 |
| 45 | [WILD-046](#wild-046-learned-choice-of-the-strategy) Learned choice of the strategy | `whole` | 3 | M | 1.50 |
| 46 | [WILD-047](#wild-047-automatic-tuning-with-successive-halving) Automatic tuning with successive halving | `whole` | 3 | M | 1.50 |
| 47 | [WILD-049](#wild-049-room-and-routes-to-a-fixed-point) Room and routes to a fixed point | `whole` | 3 | M | 1.50 |
| 48 | [WILD-055](#wild-055-exact-answers-on-small-boards) Exact answers on small boards | `whole` | 4 | L | 1.00 |
| 49 | [WILD-006](#wild-006-eight-direction-plugs) Eight-direction plugs | `plugs` | 2 | M | 1.00 |
| 50 | [WILD-009](#wild-009-a-vote-of-the-grouping-rules) A vote of the grouping rules | `group` | 2 | M | 1.00 |
| 51 | [WILD-015](#wild-015-geomorph-between-levels) Geomorph between levels | `levels` | 2 | M | 1.00 |
| 52 | [WILD-020](#wild-020-seam-insertion) Seam insertion | `room` | 2 | M | 1.00 |
| 53 | [WILD-021](#wild-021-gusset-room) Gusset room | `room` | 2 | M | 1.00 |
| 54 | [WILD-042](#wild-042-right-angle-crossing-nudge) Right-angle crossing nudge | `curve` | 2 | M | 1.00 |
| 55 | [WILD-048](#wild-048-tune-on-crops-of-the-board) Tune on crops of the board | `whole` | 2 | M | 1.00 |
| 56 | [WILD-051](#wild-051-advice-to-the-layout) Advice to the layout | `whole` | 2 | M | 1.00 |
| 57 | [WILD-052](#wild-052-an-anytime-pipeline) An anytime pipeline | `whole` | 2 | M | 1.00 |
| 58 | [WILD-018](#wild-018-room-and-routes-as-a-market) Room and routes as a market | `room` | 3 | L | 0.75 |
| 59 | [WILD-028](#wild-028-candidate-routes-and-a-joint-choice) Candidate routes and a joint choice | `router` | 3 | L | 0.75 |
| 60 | [WILD-029](#wild-029-route-each-group-alone-then-stitch) Route each group alone, then stitch | `router` | 3 | L | 0.75 |

## The build order for BUILD-W

The build order does not follow the ranking alone. It puts first the ideas that make the tests of the others more correct, and it keeps one step of the pipeline in each row.

| Order | Ideas | Why at this place |
|---:|---|---|
| 1 | [WILD-053](#wild-053-input-in-any-order) Input in any order | It is cheap, and it makes each later comparison repeatable. |
| 2 | [WILD-056](#wild-056-order-fragility-and-the-price-of-anarchy) Order fragility | It tells how much of a difference between two routers comes from the order of the edges. |
| 3 | [WILD-001](#wild-001-free-plugs-on-a-side) Free plugs on a side | The scratch run shows the bent ends on each board. It can save one bend of most routes. |
| 4 | [WILD-002](#wild-002-plug-justification) Plug justification | It comes after WILD-001 and keeps the plugs of a side apart, in `O(k)`. |
| 5 | [WILD-034](#wild-034-highways-from-the-level-links) Highways from the level links | It joins the highways and the zoom levels, and it builds on the level links of today. |
| 6 | [WILD-022](#wild-022-shortest-edges-first-and-other-orders) and [WILD-023](#wild-023-tight-edges-first) The order of the edges | One option of the routers `shared` and `shared-all`. WILD-056 measures the gain. |
| 7 | [WILD-019](#wild-019-squeeze-lanes-before-opening) and [WILD-017](#wild-017-water-filling-room) Squeeze, then water-filling | Two small changes of the step `room`, with one test on `packedGridBoard`. |
| 8 | [WILD-039](#wild-039-one-global-lane-order) and [WILD-038](#wild-038-braid-crossings-at-the-best-place) Lane order | The global order lowers the end crossings. The braid gives a lower bound of B5 for each highway. |
| 9 | [WILD-030](#wild-030-detect-highways-after-routing) Detect highways after routing | A trigger with no key, for the step `highway` of HWY-STEP. |
| 10 | [WILD-024](#wild-024-best-response-routing-game) Best-response routing game | It lowers the crossings, and its price of anarchy needs WILD-055. |
| 11 | [WILD-054](#wild-054-an-ink-floor-from-moats) and [WILD-055](#wild-055-exact-answers-on-small-boards) Bounds | They give each router its distance from the best on small boards. |
| 12 | [WILD-045](#wild-045-a-portfolio-for-each-board) A portfolio for each board | It uses the winners of the rows before it. |
| 13 | [WILD-050](#wild-050-incremental-routing-after-a-move) Incremental routing | It makes the drawing stable after an edit, and it is fast. |
| 14 | [WILD-011](#wild-011-level-ladder-by-line-breaking) and [WILD-014](#wild-014-zoom-hysteresis) Level ladder and hysteresis | Two small changes of the zoom levels. |

The five cheapest tests are the tests of WILD-053, WILD-022, WILD-002, WILD-019 and WILD-014. Each one needs one board or a short zoom path, and less than one second at 100 nodes.

## Combinations with the other notes

The ids in code font are the records of the other catalogs. BUILD-W screens each combination after its parts pass their own tests.

| Ideas of this note | Ideas of another note | The combination |
|---|---|---|
| WILD-034 | `HWY-056`, `HWY-001` | The same trigger: a level link becomes a highway. BUILD-W builds it once, and keeps the lane rules of this note. |
| WILD-030, WILD-037 | `HWY-031`, `HWY-025`, `HWY-050` | Detection after the routes. The corridor signature of HWY-R gives the stretches, and the conservative merge keeps the crossings. |
| WILD-031 | `HWY-058`, `HWY-048` | The approval of a link is the stretch budget of each edge. The cover picks the streets. |
| WILD-033 | `HWY-047`, `HWY-038`, `EDA-029` | The break-even law gives the saving of a merge. The fair share test stops a merge that one edge pays for. |
| WILD-036 | `HWY-017`, `EDA-035`, `HWY-037` | A manifold and a spiral tree are two shapes for one fan-out. A portfolio (WILD-044 for the curves, WILD-045 for the board) picks one. |
| WILD-038, WILD-039 | `EDA-026`, `HWY-016` | The exact lane order by ILP is the reference on small boards. The global order and the braid are the fast forms. |
| WILD-024, WILD-026 | `EDA-009`, `EDA-031` | The queueing price is a cost of congestion for negotiated routing. The best responses are the discrete form of the Wardrop spreading. |
| WILD-017, WILD-018, WILD-020 | `EDA-039`, `EDA-051`, `EDA-012` | Water-filling sets how much each gap gets. The least-squares move of EDA-R places the boxes. The prices are one model for both notes. |
| WILD-027, WILD-029 | `EDA-049`, `EDA-008` | A search on the tree of sections, then a refine in a corridor. |
| WILD-002, WILD-001 | `NAT-031`, `EDA-022` | The ripple spacing and the ordered escape give the ideal places, and the justification keeps them apart. |
| WILD-014, WILD-016 | `HWY-046`, `EDA-040`, `EDA-038` | Hysteresis on the count of a highway and on the zoom scale. The collapse of the lanes follows the screen spacing. |
| WILD-022 | `NAT-024`, `EDA-034` | The pioneer and follower order and the growth order are two more values of the order axis. |
| WILD-045, WILD-047 | `NAT-044`, `NAT-045`, `NAT-046` | The evolutionary tuners search the settings. Successive halving gives them a cheap budget of boards. |
| WILD-050 | `EDA-023`, `HWY-054` | Push and shove repairs the routes near a move. Stable highway ids keep the names of the highways. |
| WILD-054, WILD-055 | `HWY-040`, `EDA-026` | The exact solvers of the other notes and the bounds of this note give one table of distances from the best. |

RULE-R gives the render rules. Its catalog was not complete when this note was written, so the table has no RULE ids. WILD-016, WILD-043 and WILD-060 touch the rules of drawing. BUILD-W links them to RULE-R.

## Analogies set aside

Some far fields gave ideas that the code has already, or that another idea of this note holds. The note keeps them out of the catalog.

- Origami pleats: a pleat adds width along one line. The room lines of `boardGaps` do that today.
- Static single assignment in compilers: a phi node joins two values. `segmentsOf` joins the shared segments of the routes today.
- Knitting: a cable crosses the stitches of a row. [WILD-038](#wild-038-braid-crossings-at-the-best-place) holds the same idea as a braid.
- Plumbing with a loop main: a loop gives two ways to each tap. The routes of this library have one way for each edge, so a loop adds ink and no clarity.
- Auctions of the gaps: an auction of the lane slots of a gap gives the same result as the prices of [WILD-018](#wild-018-room-and-routes-as-a-market).

## Sources

The titles keep the words of their authors, so the linter does not examine this list.

<!-- ste-disable -->

- <a id="agrawal95"></a>Agrawal, Klein and Ravi, 1995. [When trees collide: an approximation algorithm for the generalized Steiner problem on networks](https://www.contrib.andrew.cmu.edu/~ravi/sicomp95.pdf). SIAM Journal on Computing 24(3).
- <a id="angelini12"></a>Angelini, Colasante, Di Battista, Frati and Patrignani, 2012. [Monotone drawings of graphs](https://doi.org/10.7155/jgaa.00249). JGAA 16(1).
- <a id="artin47"></a>Artin, 1947. [Theory of braids](https://doi.org/10.2307/1969218). Annals of Mathematics 48(1).
- <a id="astrom08"></a>Åström and Murray, 2008. [Feedback systems: an introduction for scientists and engineers](https://fbswiki.org/wiki/index.php/Feedback_Systems:_An_Introduction_for_Scientists_and_Engineers). Princeton University Press.
- <a id="avidan07"></a>Avidan and Shamir, 2007. [Seam carving for content-aware image resizing](https://doi.org/10.1145/1276377.1276390). ACM TOG 26(3), SIGGRAPH 2007.
- <a id="ayer55"></a>Ayer, Brunk, Ewing, Reid and Silverman, 1955. [An empirical distribution function for sampling with incomplete information](https://doi.org/10.1214/aoms/1177728423). Annals of Mathematical Statistics 26(4).
- <a id="bekos07"></a>Bekos, Kaufmann, Potika and Symvonis, 2007. [Line crossing minimization on metro maps](https://doi.org/10.1007/978-3-540-77537-9_24). Graph Drawing 2007, LNCS 4875.
- <a id="bertsekas88"></a>Bertsekas, 1988. [The auction algorithm: a distributed relaxation method for the assignment problem](https://doi.org/10.1007/BF02186476). Annals of Operations Research 14.
- <a id="bogomolnaia02"></a>Bogomolnaia and Jackson, 2002. [The stability of hedonic coalition structures](https://doi.org/10.1006/game.2001.0877). Games and Economic Behavior 38(2).
- <a id="botea04"></a>Botea, Müller and Schaeffer, 2004. [Near optimal hierarchical path-finding](https://webdocs.cs.ualberta.ca/~mmueller/ps/hpastar.pdf). Journal of Game Development 1(1).
- <a id="boyd04"></a>Boyd and Vandenberghe, 2004. [Convex optimization](https://web.stanford.edu/~boyd/cvxbook/). Cambridge University Press (water-filling, section 5.5.3, and Lagrange duality).
- <a id="brams78"></a>Brams and Fishburn, 1978. [Approval voting](https://www.cambridge.org/core/journals/american-political-science-review/article/abs/approval-voting/7CE5DEEE235794B0B12F76ADAE621482). American Political Science Review 72(3).
- <a id="bridgeman00"></a>Bridgeman and Tamassia, 2000. [Difference metrics for interactive orthogonal graph drawing algorithms](https://doi.org/10.7155/jgaa.00025). JGAA 4(3).
- <a id="briggs94"></a>Briggs, Cooper and Torczon, 1994. [Improvements to graph coloring register allocation](https://doi.org/10.1145/177492.177575). ACM TOPLAS 16(3).
- <a id="chaitin82"></a>Chaitin, 1982. [Register allocation and spilling via graph coloring](https://doi.org/10.1145/800230.806984). SIGPLAN Symposium on Compiler Construction 1982.
- <a id="chvatal79"></a>Chvátal, 1979. [A greedy heuristic for the set-covering problem](https://doi.org/10.1287/moor.4.3.233). Mathematics of Operations Research 4(3).
- <a id="clarke64"></a>Clarke and Wright, 1964. [Scheduling of vehicles from a central depot to a number of delivery points](https://doi.org/10.1287/opre.12.4.568). Operations Research 12(4).
- <a id="didimo09"></a>Didimo, Eades and Liotta, 2009. [Drawing graphs with right angle crossings](https://doi.org/10.1007/978-3-642-03367-4_19). WADS 2009, LNCS 5664.
- <a id="george96"></a>George and Appel, 1996. [Iterated register coalescing](https://doi.org/10.1145/229542.229546). ACM TOPLAS 18(3).
- <a id="graham69"></a>Graham, 1969. [Bounds on multiprocessing timing anomalies](https://doi.org/10.1137/0117039). SIAM Journal on Applied Mathematics 17(2).
- <a id="hoppe96"></a>Hoppe, 1996. [Progressive meshes](https://doi.org/10.1145/237170.237216). SIGGRAPH 1996.
- <a id="huangfu18"></a>Huangfu and Hall, 2018. [Parallelizing the dual revised simplex method](https://doi.org/10.1007/s12532-017-0130-5). Mathematical Programming Computation 10 (the HiGHS solver).
- <a id="knuth81"></a>Knuth and Plass, 1981. [Breaking paragraphs into lines](https://doi.org/10.1002/spe.4380111102). Software: Practice and Experience 11(11).
- <a id="kwon18"></a>Kwon, Crnovrsanin and Ma, 2018. [What would a graph look like in this layout? A machine learning approach to large graph visualization](https://arxiv.org/abs/1710.04328). IEEE TVCG 24(1).
- <a id="li18"></a>Li, Jamieson, DeSalvo, Rostamizadeh and Talwalkar, 2018. [Hyperband: a novel bandit-based approach to hyperparameter optimization](https://jmlr.org/papers/v18/16-558.html). JMLR 18(185).
- <a id="lopez16"></a>López-Ibáñez, Dubois-Lacoste, Pérez Cáceres, Birattari and Stützle, 2016. [The irace package: iterated racing for automatic algorithm configuration](https://doi.org/10.1016/j.orp.2016.09.002). Operations Research Perspectives 3.
- <a id="monderer96"></a>Monderer and Shapley, 1996. [Potential games](https://doi.org/10.1006/game.1996.0044). Games and Economic Behavior 14(1).
- <a id="nash50"></a>Nash, 1950. [Equilibrium points in n-person games](https://doi.org/10.1073/pnas.36.1.48). PNAS 36(1).
- <a id="pupyrev11"></a>Pupyrev, Nachmanson, Bereg and Holroyd, 2011. [Edge routing with ordered bundles](https://arxiv.org/abs/1209.4227). Graph Drawing 2011, LNCS 7034.
- <a id="rice76"></a>Rice, 1976. [The algorithm selection problem](https://doi.org/10.1016/S0065-2458(08)60520-3). Advances in Computers 15.
- <a id="roughgarden02"></a>Roughgarden and Tardos, 2002. [How bad is selfish routing?](https://doi.org/10.1145/506147.506153). Journal of the ACM 49(2).
- <a id="sheffi85"></a>Sheffi, 1985. [Urban transportation networks: equilibrium analysis with mathematical programming methods](http://web.mit.edu/sheffi/www/selectedMedia/sheffi_urban_trans_networks.pdf). Prentice-Hall (the BPR link cost and the Frank-Wolfe assignment).
- <a id="strehl02"></a>Strehl and Ghosh, 2002. [Cluster ensembles: a knowledge reuse framework for combining multiple partitions](https://www.jmlr.org/papers/v3/strehl02a.html). JMLR 3.
- <a id="tymoczko06"></a>Tymoczko, 2006. [The geometry of musical chords](https://doi.org/10.1126/science.1126287). Science 313(5783).
- <a id="wang11"></a>Wang and Song, 2011. [Ckmeans.1d.dp: optimal k-means clustering in one dimension by dynamic programming](https://journal.r-project.org/archive/2011-2/RJournal_2011-2_Wang+Song.pdf). The R Journal 3(2).
- <a id="ware02"></a>Ware, Purchase, Colpoys and McGill, 2002. [Cognitive measurements of graph aesthetics](https://doi.org/10.1057/palgrave.ivs.9500013). Information Visualization 1(2).
- <a id="williams83"></a>Williams, 1983. [Pyramidal parametrics](https://history.siggraph.org/?p=106019). SIGGRAPH 1983.
- <a id="xu08"></a>Xu, Hutter, Hoos and Leyton-Brown, 2008. [SATzilla: portfolio-based algorithm selection for SAT](https://doi.org/10.1613/jair.2490). JAIR 32.
- <a id="yen71"></a>Yen, 1971. [Finding the k shortest loopless paths in a network](https://doi.org/10.1287/mnsc.17.11.712). Management Science 17(11).
- <a id="zilberstein96"></a>Zilberstein, 1996. [Using anytime algorithms in intelligent systems](https://doi.org/10.1609/aimag.v17i3.1232). AI Magazine 17(3).

<!-- ste-enable -->

[agrawal95]: #agrawal95
[angelini12]: #angelini12
[artin47]: #artin47
[astrom08]: #astrom08
[avidan07]: #avidan07
[ayer55]: #ayer55
[bekos07]: #bekos07
[bertsekas88]: #bertsekas88
[bogomolnaia02]: #bogomolnaia02
[botea04]: #botea04
[boyd04]: #boyd04
[brams78]: #brams78
[bridgeman00]: #bridgeman00
[briggs94]: #briggs94
[chaitin82]: #chaitin82
[chvatal79]: #chvatal79
[clarke64]: #clarke64
[didimo09]: #didimo09
[george96]: #george96
[graham69]: #graham69
[hoppe96]: #hoppe96
[huangfu18]: #huangfu18
[knuth81]: #knuth81
[kwon18]: #kwon18
[li18]: #li18
[lopez16]: #lopez16
[monderer96]: #monderer96
[nash50]: #nash50
[pupyrev11]: #pupyrev11
[rice76]: #rice76
[roughgarden02]: #roughgarden02
[sheffi85]: #sheffi85
[strehl02]: #strehl02
[tymoczko06]: #tymoczko06
[wang11]: #wang11
[ware02]: #ware02
[williams83]: #williams83
[xu08]: #xu08
[yen71]: #yen71
[zilberstein96]: #zilberstein96
