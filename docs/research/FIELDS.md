# Routing from other fields

This note is the research item EDA-R of the [roadmap](../ROADMAP.md). It asks what other fields know about the routing of many wires or flows in a plane. It also tells which of their methods fit this library.

The catalog of the note is [`ideas/fields.json`](ideas/fields.json). It has one record for each idea, with the ids `EDA-001` to `EDA-051`. The later items use the note:

- BUILD-W builds and screens each idea of the catalog. The [build order](#the-build-order) gives the first waves.
- HWY-STEP takes the decision of the highways out of the routers. The ideas with the step `highway` plug in there.
- MEAS2 needs the best answer on small boards. Four ideas give an exact value or a lower bound for it.
- TUNE sweeps the options of each idea. The [options](#options-and-screens) give the ranges.

## Summary

- The note gives 51 ideas from six fields. 31 come from the literature, 17 are hybrids and 3 are new ideas of this note (kind `ours`). Thus 20 of 51 are of the kind `ours` or `hybrid`.
- Chip design gives the most ideas (19). A chip router solves the same problem in three stages. They are a coarse route through regions with a capacity, a track for each wire, and then the points.
- The step `room` of today gives each piece of a link one lane past each piece that it overlaps. A chip router calls this a track assignment, and the left-edge rule solves it with fewer tracks. A [scratch run](#a-scratch-run-tracks-in-the-gaps) gives 5% to 26% fewer lanes at the same crossings.
- The discount of the router `shared` is a fixed form of the hub discount of transport networks and of the cost `len × f^α` of branched transport. Gilbert's formula for that cost gives the angle at each merge.
- A flow field to one target gives a shortest-path tree. Its ways merge and do not cross each other. One search serves all edges of the target.
- The highway hierarchies of road planners define a highway from the shortest ways. That definition fits HWY-STEP.
- The [build order](#the-build-order) has 14 ideas. Most of the first 7 have the size `S`.

## The question and the scope

### The question

Chips, circuit boards, metro maps, roads, flow maps and games all route many lines in a plane. Each field has a problem like the problem of this library:

- A chip routes millions of wires through channels between cells, with a fixed width for each channel.
- A circuit board routes buses and pairs of wires around parts, with a clearance.
- A metro map draws lines that share tracks, and it orders the lines on each shared track.
- A transport network merges loads into trunks between hubs.
- A map shows a network at each zoom with fewer and simpler lines.
- A game moves many agents on a map with no collision.

For each method, the note asks four questions:

1. What part of the library does it replace or make better? The parts are a router, the lane order, the room, the levels and the plugs.
2. What does it guarantee? Examples are an optimum, a ratio to the optimum, or a bound.
3. What does it cost on a board of 100 nodes and of 1000 nodes?
4. What is the cheapest screen that keeps it or drops it?

### The scope

- In scope: methods that route lines among boxes in a plane, order the lines, give them room, or make zoom levels.
- Out of scope: methods for three dimensions, timing of signals, and the electrical rules of chips and boards.
- The note does not repeat [CURVES.md](CURVES.md) or [GROUPING.md](GROUPING.md). It names their families where an idea touches them.
- The other notes of the research wave are HWY-R (the formation of highways), NAT-R (nature), RULE-R (render rules) and WILD-R (new ideas).

## How to read an entry

### Notation

- `n` is the number of nodes, and `m` is the number of edges. `G` is the number of cells of a grid. `p` is the number of link pieces in one gap.
- `s` is the lane spacing. `cap(a)` is the number of lanes that a corridor `a` holds: `floor(width / s)`.
- `f(a)` is the number of edges that use the link `a`. `α` is the exponent of a flow cost, from 0 to 1.
- The ids R1 to R15, B1 to B9, C1 to C11, G1 to G9, Z1 to Z10 and M1 to M5 are from [MEAS0](MEASURES.md).
- A measure in parentheses is a measure that the idea risks.

### The columns of the idea tables

| Column | Meaning |
|---|---|
| Id | The id of the idea in the catalog. |
| Idea | The name of the idea, and its kind when it is `hybrid` or `ours`. |
| What it does | The mechanism, in short. |
| Math | The key formula or algorithm, in code font. |
| Guarantee | The proven quality of the method, if any. |
| Cost | The time for one board. The catalog gives the time at 100 and at 1000 nodes. |
| Part | The part of the library that the idea replaces or makes better. |
| Measures | The measures that it makes better. The measures in parentheses are its risks. |

The [options and screens](#options-and-screens) table gives the options and the cheapest screen of each idea. The catalog gives the same data as records.

## What the library does today

The router `corners` searches a sparse visibility graph. Its points are the corners of the boxes, grown by `margin`. Each corner links to its 8 nearest visible corners. The routers `trunks`, `shared` and `sections` decide the bundles:

- `trunks` sends a fan-out along one trunk to a split point at a fixed share of the way.
- `shared` routes the edges one by one, the longest first. A link that an edge of the same key uses already costs `discount` (0.5) of its length. This follows the ordered bundles of [Pupyrev 2011][pupyrev11].
- `sections` routes through hubs at the centers of the sections of the step `group`.

The step `room` gives each piece of a link in a gap its own lane. The function `gapLanes` orders the pieces and puts each piece one lane past each earlier piece that overlaps it. `roomDemand` and `openGaps` then open each gap to hold its lanes.

## A taxonomy

| Field | What it routes | What it knows that the library does not use | Ideas | Parts |
|---|---|---|---|---|
| Chips (VLSI) | Millions of wires on a few layers, in channels between cells | Capacities for each region, tracks for each channel, negotiation of congestion, Steiner trees | EDA-001 to EDA-019 | router, room, highway, levels |
| Circuit boards | Hundreds of wires, buses and pairs, at any angle | Topology first and geometry second, wide paths for pairs, ordered escape from a part | EDA-020 to EDA-024 | router, plugs, curve, highway |
| Metro maps | Tens of lines on shared tracks | Octilinear grids, the order of lines on shared tracks by an exact program | EDA-025 to EDA-027 | router, highway, curve |
| Transport and logistics | Flows of goods and cars between regions | Hubs at the best place, cost that falls with the flow, equilibrium of flows, growth | EDA-028 to EDA-034 | highway, router |
| Cartography | Flows on maps, and networks at each zoom | Spiral trees, selection of strokes, safe simplification, displacement, ranges of zoom | EDA-035 to EDA-042 | highway, levels, room, plugs |
| Robotics and games | Agents in a space with obstacles | Exact shortest ways at any angle, meshes with clearance, flow fields, conflict search, hierarchies | EDA-043 to EDA-050 | router, highway, levels |
| Placement for routing | The same problems | Prices of congestion that open room | EDA-051 | room |

The steps of the catalog are `router` 19, `highway` 11, `room` 9, `levels` 6, `curve` 3, `plugs` 2 and `whole` 1. Each idea except EDA-038 depends on the placement of the boxes.

## Chips (VLSI)

A chip router has the largest problem of all the fields. Its classic flow has three stages ([Kahng 2011][kahng11]):

1. The global router divides the chip into regions (g-cells), each with a capacity. It routes each wire as a chain of regions.
2. The track assignment gives each long piece a track in its channel.
3. The detailed router makes the exact geometry.

The library has stages 1 and 3 in one router, and its step `room` does a basic form of stage 2.

### Search for one wire

| Id | Idea | What it does | Math | Guarantee | Cost | Part | Measures |
|---|---|---|---|---|---|---|---|
| EDA-001 | Grid maze (Lee, Hadlock, A*) | A* on a uniform grid with a cost for each bend and for each used cell | `f = g + h`, `g = len + β·bends + γ·used` | Lee finds a shortest way on the grid when a way exists | `G log G` for each edge. Heavy at 1000 nodes. | router | R14, R3, R8, R9 (R4, R5) |
| EDA-002 | Line probe (Hightower, Mikami-Tabuchi) | Probe lines from both ends. A probe that meets a probe of the other end gives a way with few bends. | Probes at level `k` start from each point of the probes at level `k-1` | Mikami-Tabuchi finds a way when one exists. Hightower can fail. | `L·n` for each edge | router | R3, R14, R9 (R5, R6, R8) |
| EDA-003 | Orthogonal visibility graph | The lines through each side of a box, cut at the boxes. A* with a bend penalty, then a nudge of parallel legs. | `cost = L + β·bends` | The graph holds an optimal orthogonal route for this cost ([Wybrow 2009][wybrow09]) | `V log V` for each edge, `V` up to `n²` | router | R14, R3, R9, R12 (R5, R1) |
| EDA-019 | Corner-stitched tiles | Maximal free rectangles that know their neighbors. Route on the tiles. | `capacity = floor(width / s)` | None. A data structure. | `n log n` to build | router, room | R8, M4, R12 (R3, R5) |

Notes:

- The router `corners` is a visibility graph at any angle. EDA-001 to EDA-003 are its orthogonal forms. A host with an orthogonal style gets fewer bends from EDA-003 than from `corners` with a curve.
- [Hanan 1966][hanan66] proves that the Hanan grid holds a rectilinear Steiner minimal tree. EDA-003 is a sparse form of that grid.
- EDA-019 gives each corridor its width. EDA-008, EDA-009 and EDA-021 need these widths as capacities.

### Channels and gaps

A channel router assigns tracks to the wires of one channel. A gap of the step `room` is a channel. Its pieces are the intervals, and its lanes are the tracks.

| Id | Idea | What it does | Math | Guarantee | Cost | Part | Measures |
|---|---|---|---|---|---|---|---|
| EDA-004 | Constrained left edge (hybrid) | Sort the pieces by start, fill the lowest track first. Keep an order of two pieces only where a swap adds crossings. | Tracks `≥ max(d, longest chain)`. `d` is the density. | Left edge gives `d` tracks, the optimum, with no constraint ([Hashimoto 1971][hashimoto71]) | `p²` for each gap | room (lanes) | M1, M4, R12 (B5, R1) |
| EDA-005 | Dogleg | Let a piece change its track inside a gap, at the turn of another link | Split the pieces at the turns, then EDA-004 | Breaks cycles of constraints. The problem is NP-complete ([Szymanski 1985][szymanski85]). | Two times EDA-004 | room (lanes) | M1, M4 (R3, R4, R15, C2) |
| EDA-006 | Greedy channel router | Sweep the gap column by column with local rules | A column sweep | Completes each channel. In practice `d` to `d + 2` tracks ([Rivest 1982][rivest82]). | Columns × tracks | room (lanes) | M1, M4 (R3, R15, B5) |
| EDA-007 | Switchbox at junctions | Connect the lanes that turn where a row gap meets a column gap, with fixed ends on four sides | Greedy sweep or maze search | None. Heuristics. | `t²` for each junction | room (lanes) | B5, R1 (R3, R15) |
| EDA-013 | Track assignment across gaps | Give each long piece one track from gap to gap, with few crossings at the junctions | Interval coloring with a cost of overlaps, track changes and crossings | None. Greedy, or an ILP on small boards. | `p log p` for each gap | room (lane order) | B5, R1, R15 (M1) |

Notes:

- The density `d` of a gap is the largest number of pieces at one point. No lane assignment uses fewer than `d` lanes. Thus `d` is a lower bound for M1 that MEAS2 can use.
- The vertical constraints of a chip channel fix the order of two wires. For this library, the order is free, but each order has a cost in crossings. EDA-004 keeps only the orders that save crossings.
- [Yoshimura 1982][yoshimura82] merges the pieces into tracks by a matching. It gives fewer tracks than the left edge when the constraints are many.
- EDA-013 is the order of ROOM-C, solved for all gaps together. Today each gap has its own order, so a lane can change its track at each junction.

### Global routing and congestion

| Id | Idea | What it does | Math | Guarantee | Cost | Part | Measures |
|---|---|---|---|---|---|---|---|
| EDA-008 | Gap graph, then tracks, then points (hybrid) | Route each edge through the gaps and their junctions with a capacity, then tracks, then points | `min Σ cost(path_e)` with a soft limit `use(g) ≤ cap(g)` | None for the whole. Each stage has its own. | Near 20 ms at 100 nodes | whole | M4, R12, R9, M1 (R5, R6, R1) |
| EDA-009 | Negotiated congestion (PathFinder) | Route all edges, then raise the price of each overfull corridor with a history term. Repeat. | `c(a) = (b(a) + h(a))·p(a)` | Converges in practice. No bound. | 5 to 30 passes of the router | router | M4, R12, B9, R9 (R5, R6, B1) |
| EDA-010 | Rip-up and reroute | Remove the edges with a fault and their neighbors. Route them again in a new order. | Accept a round only when the total cost falls | None | Near +30% time | router | R7, R6, R1, B5 (Z10) |
| EDA-011 | Multicommodity flow | Solve the fractional flow, then pick one way for each edge at random by its weight | `min λ` with `Σ x_e(a) ≤ λ·cap(a)` | Congestion `O(log G / log log G)` times the optimum, with high probability ([Raghavan 1987][raghavan87]) | Near 100 times the router | router | M4, R12 (R5, B1) |
| EDA-012 | Lagrangian prices (hybrid) | Route each edge alone at the prices, then move each price by its overuse | `L(λ) = Σ_e min_p [len(p) + Σ λ_a] − Σ λ_a·cap_a ≤ OPT` | The dual value is a lower bound on the optimum | 20 to 200 iterations | router | M4, R12 (R5) |

Notes:

- PathFinder ([McMurchie 1995][mcmurchie95]) is the base of most chip and FPGA routers. Its history term remembers each corridor that was full in an earlier pass. Thus an edge leaves a corridor that others need more.
- The router `shared` has no capacity. Its bundles can be wider than their gap, and then `openGaps` must open the gap. EDA-009 spreads the edges before the step `room`.
- EDA-011 and EDA-012 give a bound, not only a route. MEAS2 can use the bound when no exact solver finishes.
- [Müller 2011][muller11] solves the fractional problem of a whole chip with resource sharing. Its time is near-linear in the number of shortest-path calls.

### Wiring trees and buses

| Id | Idea | What it does | Math | Guarantee | Cost | Part | Measures |
|---|---|---|---|---|---|---|---|
| EDA-014 | Layers as zoom levels (hybrid) | Put each edge on the coarsest level where it shows alone, with a budget for each level. Count each change of form as a change of layer. | `min Σ layerChanges` with `items_d + links_d ≤ B_d` | COLA is exact for one net on a tree ([Lee 2008][lee08]) | `m × depth` | levels | Z4, Z9, Z5 (Z1, Z7) |
| EDA-015 | Rectilinear Steiner trunks (FLUTE) | Replace the split point of `trunks` with a Steiner tree of the plug and its targets | RSMT on the Hanan grid, by a table | FLUTE is optimal up to 9 points ([Chu 2008][chu08]). The spanning tree is at most 1.5 times the Steiner tree ([Hwang 1976][hwang76]). | `k log k` for each net | highway | B1, B3, B7 (R9, R10) |
| EDA-016 | River routing | Route `k` lanes in order with no crossing. Each lane hugs the lane before it. | Each wire keeps the distance `s` from the wire before it | Optimal separation of two rows ([Tompa 1980][tompa80]). Planar by construction. | `k` for each merge | curve | B5, R12, B9, B6 (R4, C2) |
| EDA-017 | Stretch balance (hybrid) | Move the exits of a bundle so that no member pays a large detour | `exit cost += λ_e·(st(e) − τ)` | None | `k × iterations` for each bundle | highway | B3, R6, R5 (B1, B2) |
| EDA-018 | RUDY demand map (hybrid) | Spread each link as a uniform density over its bounding box. Sum on a grid. | `d(x, y) = Σ_e w·(W_e + H_e) / (W_e·H_e)` | None. An estimate. | `m + cells` | room | M1, M4 (M4, R8) |

Notes:

- A chip puts long wires on high layers. Each change of layer costs area and delay. A zoom level of this library is like a layer. A far level shows the long links. Each change of form along a route is like a change of layer.
- A circuit board makes the wires of a bus equal in length ([Ozdal 2006][ozdal06]). EDA-017 inverts the goal: it keeps the stretch of the members even, so that no member pays for the bundle alone.
- RUDY ([Spindler 2007][spindler07]) estimates the demand before any route. A placer uses it to grow the cells in a hot area. EDA-018 uses it to open the gaps before the router runs.

## Circuit boards

A board router has fewer wires than a chip, but at any angle and with a clearance. Two ideas of this field are new to this library: topology first, and wide paths for pairs.

| Id | Idea | What it does | Math | Guarantee | Cost | Part | Measures |
|---|---|---|---|---|---|---|---|
| EDA-020 | Topology, then rubber bands | Decide on which side of each box an edge goes. Then pull it tight in that class. | Homotopic shortest path by a funnel on a triangulation | Shortest in its class ([Hershberger 1994][hershberger94]). A cut test decides if a topology fits ([Leiserson 1985][leiserson85]). | `n log n` to build | router | R5, R6, R8, R12 (R1) |
| EDA-021 | Fat-path bundle (hybrid) | Route a bundle of `k` lanes as one wide path, then split it into lanes | Grow each box by `w / 2`, `w = k·s + clearance` | A path in the grown space has room for each lane | Up to 4 graphs, one for each width | highway | M4, R12, B9, R9 (R5, R6, B2) |
| EDA-022 | Ordered escape for plugs | Order the plugs of one side so that their stubs do not cross | Sort by the angle of the first leg. Flow when slots are few. | Min-cost flow is optimal for unordered escape. SAT is exact for ordered escape ([Luo 2008][luo08]). | `k log k` for each side | plugs | R1, R11, B5, R10 (R5) |
| EDA-023 | Push and shove | When a host adds an edge, push the routes in its way aside | Offset each segment in collision by the clearance | None | Local to the edit | router | Z10, R12 (R8, R3) |
| EDA-024 | Tangent arcs (TopoR style) | Lines and arcs of circles around the corners, with the clearance as the radius | Common tangents of circles of radius `clearance + offset` | Exact length and exact offsets | `points` for each route | curve | C1, C5, R8, B9 (C2, R4) |

Notes:

- SURF ([Staepelaere 1993][staepelaere93]) is the classic rubber-band router. TopoR is a commercial router with the same idea at any angle.
- A differential pair is two wires that stay together. [Yan 2010][yan10] routes the pair as one wire and then splits it. EDA-021 uses the same idea for a bundle.
- EDA-024 is the circular fillet of [CURVES.md](CURVES.md) (F1), with the radius from the clearance. It makes the offsets of the lanes exact, as the arcs are concentric.
- EDA-023 is the method of interactive board editors, for example [KiCad][kicad]. It gives stability when a host adds one edge.

## Metro maps

| Id | Idea | What it does | Math | Guarantee | Cost | Part | Measures |
|---|---|---|---|---|---|---|---|
| EDA-025 | Octilinear grid router | A* on a grid of 8 directions, with a cost for each bend by its angle and a discount on the links of the bundle | Grid nodes with bend links. `c135 < c90 < c45`. | The ILP is exact for the grid ([Bast 2020][bast20]) | `G log G` for each edge | router | R3, R4, B1, R2 (R5, R6) |
| EDA-026 | Exact lane order (MLCM) | Order the lanes of all runs together by an integer program | `x_ab^r ∈ {0, 1}`. `min Σ w_c·crossings + w_s·separations`. | Exact. MLCM is NP-hard ([Fink 2013][fink13]). | An ILP. Seconds at 100 nodes after the rules. | highway (lane order) | B5, R1 |
| EDA-027 | Schematization | Turn each route into a path with a set of directions, the fewest legs and the topology kept | Dynamic program over the points of the route | Optimal for a fixed set of directions ([Delling 2010][delling10]) | `k²` for each route | curve | R3, R14, R4 (R9, R5, C8) |

Notes:

- The survey of [Wu 2020][wu20] covers the metro-map methods. [Nöllenburg 2011][nollenburg11] gives the exact octilinear layout by a mixed-integer program.
- LOOM ([Bast 2018][bast18]) orders the lines on shared tracks. Its rules fix most pairs before the program, so the program is small. The router `shared` uses an order by bundle or by run today, so EDA-026 is the exact reference for MEAS2.
- A metro map can move its stations. This library cannot move the boxes, so only the routing and ordering parts fit.

## Transport, airlines and logistics

Transport models have the same trade as bundles: a shared road saves cost, but a detour to reach it costs time.

| Id | Idea | What it does | Math | Guarantee | Cost | Part | Measures |
|---|---|---|---|---|---|---|---|
| EDA-028 | Weber hubs (hybrid) | Put each hub of `sections` at the weighted median of the plugs that use it | Weiszfeld: `h ← Σ(w_i·p_i / |h − p_i|) / Σ(w_i / |h − p_i|)` | Weiszfeld converges to the optimum of a convex problem ([Beck 2015][beck15]) | `20 × edges` for each hub | router | R5, R6, R7, Z9 (Z7, R9) |
| EDA-029 | Branched transport | Give each link the cost `len × f^α`. Ways merge where the saving pays for the detour. | `E = Σ_a len(a)·f(a)^α` | Gilbert gives the angles of an optimal network ([Gilbert 1967][gilbert67]). `α = 0` gives the Steiner tree. | As `shared`, 1 to 5 passes | highway | B1, B2, B7 (B3, R5, B4) |
| EDA-030 | Gilbert split point (`ours`) | Put the split of `trunks` where the flow cost of the trunk and its branches is least | Weighted Weiszfeld. The angle of two branches follows the formula below. | Optimal for the flow cost of one fan | `k × iterations` for each trunk | highway | B1, B6, R5 (R9, B3) |
| EDA-031 | Wardrop spreading | A corridor link costs more as its load grows. Frank-Wolfe steps move a share of the edges to their best way. | `t(x) = t0·(1 + β·(x / c)^4)`. Minimize the Beckmann potential. | The equilibrium is at most 4/3 of the optimum for linear costs ([Roughgarden 2002][roughgarden02]) | 10 to 50 iterations | router | M4, R12, B9 (B1, B2, R5) |
| EDA-032 | Concave, then convex cost (`ours`) | Below the capacity, each more edge costs less. Above it, each more edge costs much more. | `c(f) = len·f^α` for `f ≤ cap`, then a steep rise | None | As EDA-009 | highway | B1, M4, R12 (R5, R6) |
| EDA-033 | Consolidation by cells (hybrid) | Group the edges by the pair of sections of their ends. Each large group gets one trunk between two terminals. | Key = `(cell(source), cell(target))` | None | Faster than `shared` | highway | B1, B2, B8, Z9 (B4, R5, R7) |
| EDA-034 | Growth order (hybrid) | Route in a stable order. Each edge uses the drawn network at a discount, as a new road joins the roads that exist. | Order by a hash of the id or by `(span, id)` | None | As `shared` | router | Z10 (B1, R5) |

The angle at a merge. Two branches with the flows `m1` and `m2` meet at the angle `θ`:

`cos θ = ((m1 + m2)^(2α) − m1^(2α) − m2^(2α)) / (2·m1^α·m2^α)`

For equal flows, `cos θ = 2^(2α − 1) − 1`. Thus `α = 0` gives 120°, `α = 0.5` gives 90°, `α = 0.75` gives approximately 65° and `α = 1` gives 0°, which is no merge. A small `α` gives wide merges and much sharing. A large `α` gives narrow merges and less sharing. The measure B6 can compare each merge with this angle.

Notes:

- The hub-location model of [O'Kelly 1987][okelly87] charges a link between two hubs `α` times its length, with `α < 1`. The `discount` of `shared` is the same `α`. [Campbell 1994][campbell94] gives the p-hub median.
- The discount of `shared` is constant: the second edge on a link saves the same as the tenth. With `f^α`, each more edge saves less. Thus EDA-029 gives a family of bundles, from none (`α = 1`) to one tree (`α` near 0).
- Wardrop's first principle ([Wardrop 1952][wardrop52]) says that at equilibrium no driver gains with another route. EDA-031 uses it to spread the edges, which is the inverse of a bundle. EDA-032 joins both.
- The street model of [Barthélemy 2008][barthelemy08] adds roads in order, and each new road joins the network that exists. EDA-034 uses this for stability, not for the shape.
- Freight carriers consolidate loads between regions ([Crainic 2000][crainic00]). EDA-033 does the same with the sections of the step `group`.

## Cartography

| Id | Idea | What it does | Math | Guarantee | Cost | Part | Measures |
|---|---|---|---|---|---|---|---|
| EDA-035 | Spiral trees | A tree of logarithmic spirals from one source to many targets, with an angle limit | Angle-restricted Steiner arborescence | A 2-approximation of the shortest spiral tree ([Buchin 2015][buchin15]) | `k log k` for each fan | highway | B6, R7, B1, C2 (R9, R5) |
| EDA-036 | Stroke selection | Join pieces that continue each other into strokes. At a far zoom, show the top strokes and keep the network connected. | A stroke has turns of 30° to 45° or less | The ILP of [Chimani 2014][chimani14] is exact. The greedy form has no bound. | `k log k` | levels | Z4, Z5, Z9 (Z1, Z3) |
| EDA-037 | Safe simplification | Remove points of each line at a far zoom, with a test that keeps the side of each box | Douglas-Peucker or Visvalingam-Whyatt, with `ε_d = ε0·2^d` | Saalfeld's test keeps the topology ([Saalfeld 1999][saalfeld99]) | `k log k` for each line | levels | R3, C3 (R9, Z3, R1) |
| EDA-038 | Lane collapse (hybrid) | At a far zoom, draw a bundle as one line with a width by its count | Show lanes when `s × zoom ≥ pxMin` | None | `segments` | levels | Z4, B7, R12 (B5, B9) |
| EDA-039 | Least-squares displacement | Move each box by the least amount that gives the spacing of its lanes | `min Σ w_i·|δ_i|²` with spacing constraints | A convex program. Its optimum is unique. | `n log n` for each pass | room | M3, M1, M5 (M2) |
| EDA-040 | Active ranges (hybrid) | Give each item one range of zoom with no hole, so it does not pop in and out | `max Σ w_i·(b_i − a_i)` with no conflict at any scale | The 1-D forms are greedy optimal ([Been 2010][been10]) | `n log n` | levels | Z7, Z8, Z4 (Z1) |
| EDA-041 | Boundary leaders (hybrid) | Treat the plugs of a side as labels and the lanes of the gap as points. Leaders give stubs with no crossing. | One-sided `po` leaders by a sweep | Least total length with no crossing ([Bekos 2007][bekos07]) | `k log k` for each side | plugs | R1, R11, R10 (R5) |
| EDA-042 | Count badges (`ours`) | Place a count badge on each wide segment where it covers nothing. A shortage adds room demand. | Slider labels and a greedy independent set | None. The 4-position model is NP-hard. | `b log b` | room | none in MEAS0 (M1) |

Notes:

- Flow maps draw migration as merged trees from one source ([Phan 2005][phan05], [Verbeek 2011][verbeek11]). A fan of `trunks` is such a tree. A spiral tree does not turn back toward its source, so R7 is 0 for its members.
- Generalization of a network has four operators: selection, simplification, aggregation and displacement. EDA-036 selects, EDA-037 simplifies, EDA-038 aggregates and EDA-039 displaces.
- Dual carriageways collapse to one line at a far zoom ([Thom 2005][thom05]). A bundle at a far zoom is the same case.
- A level of this library is a fixed set of zooms. Active ranges ([Been 2006][been06]) make each item show for one range with no gap. This is the stability of Z7 and Z8.
- EDA-042 needs a measure of badge overlaps that MEAS0 does not have.

## Robotics and games

| Id | Idea | What it does | Math | Guarantee | Cost | Part | Measures |
|---|---|---|---|---|---|---|---|
| EDA-043 | Exact tangent visibility graph | Link each pair of corners that see each other and are tangent at both ends | Reduced visibility graph, then A* | Exact shortest way around the grown boxes ([Lozano-Pérez 1979][lozanoperez79]) | `n²` links. Heavy at 1000 nodes. | router | R5, R6 (R8, B1) |
| EDA-044 | Any-angle search | Search at any angle on a mesh or a grid. Polyanya searches intervals on a mesh. | Theta*: `g(s') = g(parent(s)) + |parent(s) − s'|` | Anya and Polyanya are optimal ([Harabor 2016][harabor16], [Cui 2017][cui17]). Theta* is not. | Near 0.1 s for all edges at 1000 nodes | router | R5, R6 (R8, B1) |
| EDA-045 | Mesh with clearance | A triangulation that knows the width of each passage. A search for a disc of a given size. | A disc of radius `r` passes a portal when its clearance is `r` or more | Finds a way for each clearance when one exists ([Kallmann 2010][kallmann10]) | `n log n` to build | router | R8, M4, R12 (R5) |
| EDA-046 | Flow field for each target (hybrid) | One Dijkstra from a target. Each edge into it follows the field down. | The ways follow the parent pointers of one shortest-path tree | The ways form a tree: 0 crossings among them | One search for each target | highway | B1, B2, R1 (B4, B8) |
| EDA-047 | Conflict search (hybrid) | Branch on each crossing at a sharp angle or each pair of lanes too near. Route one edge again in each branch. | CBS on a constraint tree. ECBS has a bound `w`. | ECBS cost `≤ w × OPT` ([Sharon 2015][sharon15]) | Exponential in the worst case | router | R12, R2, R9 (R5) |
| EDA-048 | Cooperative A* | Each routed edge reserves its lanes. A later edge pays more for a full corridor. | Prioritized planning with a reservation table | None | As `shared` | router | M4, R12 (R5, R6, Z10) |
| EDA-049 | Hierarchical pathfinding | An abstract graph of the entrances on the borders of the sections. Route on it, then refine. | HPA* | Routes near 1% longer than the optimum in the paper ([Botea 2004][botea04]) | Fast queries after a precompute | levels | Z9, R7 (R5, R6) |
| EDA-050 | Highway hierarchy (hybrid) | Rank each link by the long shortest ways that use it. The top links are the highways. | A link is a highway when it is far from both ends of a shortest way | Exact queries ([Sanders 2005][sanders05]). The rank is a definition, not a bound. | Near the cost of `shared` | highway | B2, B8, Z9, Z4 (B3, R5, B4) |

Notes:

- The corner graph links each corner to 8 neighbors, so a way can be longer than the shortest. EDA-043 measures that gap on boards of 400 nodes or fewer. MEAS2 can use it as the length reference.
- Polyanya ([Cui 2017][cui17]) needs no visibility graph. It is the scalable form of EDA-043.
- A flow field ([Emerson 2013][emerson13], [Treuille 2006][treuille06]) is one search for many agents. For a target with a fan-in of `d`, it is `d` times faster than one search for each edge.
- Highway hierarchies ([Sanders 2005][sanders05]), contraction hierarchies ([Geisberger 2008][geisberger08]) and transit nodes ([Bast 2007][bast07]) all find the few roads that long trips use. That is a definition of a highway for HWY-STEP.
- MAPF ([Sharon 2015][sharon15], [Silver 2005][silver05]) avoids collisions in time. A static board has no time, so a conflict is a crossing or a pair of lanes too near.

## Placement for routing

| Id | Idea | What it does | Math | Guarantee | Cost | Part | Measures |
|---|---|---|---|---|---|---|---|
| EDA-051 | Room by congestion prices (hybrid) | Use the prices of EDA-012, or the history of EDA-009, for each gap. Open the gaps with the highest price first. | `Δwidth_g ∝ λ_g`. Stop when `max λ ≤ τ`. | None | 2 to 3 times the router and the room | room | M1, M4, R5 (M3, M2) |

A chip placer grows the cells in a hot area so the router gets room ([Spindler 2007][spindler07]). The price of a gap tells how much one more unit of width saves. Thus EDA-051 opens only the gaps that pay.

## A scratch run: tracks in the gaps

The run compares three lane assignments in the gaps of the far view. It uses the cases and fixtures of the core, `boardGaps` and the order `crossings` of `gapLanes`. Each node is one item, as in the room bench. The script stays in the scratch folder, not in the repository.

- Stack: the lanes of `gapLanes` today. A piece goes one lane past each earlier piece that it overlaps.
- Left edge: the left-edge rule with no constraint. Its lane count is the density.
- Constrained: EDA-004. Piece `i` stays below piece `j` only when they overlap and the swap adds crossings.

The crossings use the cost of `gapLanes`.

| Board | Stack lanes | Density | Stack / density | Stack crossings | Left-edge crossings | Constrained lanes | Constrained crossings |
|---|---:|---:|---:|---:|---:|---:|---:|
| `case-dense-groups` | 375 | 348 | 1.08 | 465 | 614 | 356 | 465 |
| `case-hub-chain` | 69 | 62 | 1.11 | 76 | 100 | 65 | 76 |
| `case-many-groups` | 170 | 134 | 1.27 | 458 | 624 | 145 | 458 |
| `tiny-uniform` | 11 | 11 | 1.00 | 2 | 2 | 11 | 2 |
| `small-clustered` | 268 | 260 | 1.03 | 190 | 331 | 267 | 190 |
| `grid-400` | 5212 | 3273 | 1.59 | 37408 | 47830 | 3850 | 37398 |

The packed and nested grid boards have gaps of width 0, so all their values are 0.

### What the run shows

- The constrained left edge keeps the same crossings or fewer. It uses fewer lanes on 5 of 6 boards: 26% fewer on `grid-400`, 15% on `case-many-groups`, 6% on `case-hub-chain` and 5% on `case-dense-groups`.
- The pure left edge reaches the density, but it adds 28% to 74% more crossings. This is the trade of a channel router between the tracks and the constraints.
- The stack uses up to 1.59 times the density. The excess grows with the board, so the gain of EDA-004 grows with the board.
- Fewer lanes need less room. EDA-004 has the size `S` and touches only the lane assignment of `gapLanes`.

## Ranking

The value is the expected gain on the measures. The cost is the size of the prototype and the time of a run.

| Rank | Id | Value | Cost | Why |
|---:|---|---|---|---|
| 1 | EDA-004 | High | S | Measured: up to 26% fewer lanes at the same crossings |
| 2 | EDA-029 | High | S | One option generalizes the `discount` of `shared`. A sweep of `α` gives a front of B1 against B3. |
| 3 | EDA-046 | High | S | 0 crossings among the edges of one target, and faster than a search for each edge |
| 4 | EDA-043 | High | S | The length reference for MEAS2, and a router when the gap is large |
| 5 | EDA-030 | Medium | S | A better split for `trunks`, with a formula for the angle |
| 6 | EDA-022 | Medium | S | Fewer crossings at the plugs, where the eye looks first |
| 7 | EDA-028 | Medium | S | Shorter ways through the hubs of `sections` |
| 8 | EDA-009 | High | M | Bundles that fit their gaps before the step `room` |
| 9 | EDA-026 | High | M | The exact lane order for MEAS2 |
| 10 | EDA-050 | High | M | A definition of a highway for HWY-STEP |
| 11 | EDA-018 | Medium | S | Room before the routes, at a low cost |
| 12 | EDA-038 | Medium | S | Fewer elements at the far levels |
| 13 | EDA-013 | Medium | M | One track for each lane across the junctions |
| 14 | EDA-021 | Medium | M | Wide paths that fit their bundles |
| 15 | EDA-010 | Medium | S | Less effect of the input order |
| 16 | EDA-033 | Medium | S | Bundles from the sections, faster than `shared` |
| 17 | EDA-051 | Medium | M | Room only where it pays |
| 18 | EDA-040 | Medium | M | No item pops in and out across the zoom |

The ideas of size `L` (EDA-008, EDA-011, EDA-020, EDA-045, EDA-047) have a high value only after the ideas that they need. EDA-008 needs EDA-004, EDA-009 and EDA-019.

## The build order

| Order | Id | Step | Why at this place |
|---:|---|---|---|
| 1 | EDA-004 | room | The scratch run shows the gain. It changes one function. |
| 2 | EDA-029 | highway | A cost option of `shared`. TUNE sweeps `α`. |
| 3 | EDA-030 | highway | The split of `trunks` with the same `α`. It shares the code of EDA-029. |
| 4 | EDA-046 | highway | One search for each target. A new bundle strategy with no crossings. |
| 5 | EDA-043 | router | The length reference. MEAS2 needs it first. |
| 6 | EDA-022 | plugs | A sort of the plugs of each side. |
| 7 | EDA-028 | router | Weiszfeld steps for the hubs of `sections`. |
| 8 | EDA-018 | room | A demand map for `roomDemand`. |
| 9 | EDA-009 | router | Congestion with capacities from the gaps. |
| 10 | EDA-026 | highway | The exact lane order, for MEAS2 and small boards. |
| 11 | EDA-050 | highway | The rank of the links for HWY-STEP. |
| 12 | EDA-038 | levels | Lane collapse at the far levels. |
| 13 | EDA-013 | room | Tracks across the junctions, after EDA-004. |
| 14 | EDA-032 | highway | Joins EDA-029 and EDA-009 in one cost. |

## Options and screens

Each screen uses the boards of the core and the measures of MEAS0. The thresholds are the cheapest test that keeps or drops the idea. A board with more than 400 nodes runs only in CI.

| Id | Options | Screen |
|---|---|---|
| EDA-001 | `cell` 2 to 20, `bendCost` 0 to 10, `usedCost` −0.5 to 5 | Keep if R14 ≥ 0.95, R9 = 0 and the R3 median ≤ `corners` + 1 |
| EDA-002 | `maxLevel` 2 to 8, `escape` | Keep if the R3 median < `corners` and R6 ≤ 1.1 times `corners` |
| EDA-003 | `bendPenalty` 0 to 200, `nudgeSpacing` 2 to 8 | Keep if R3 ≤ `corners`, R14 = 1 and the time ≤ 5 times `corners` |
| EDA-004 | `constraints`, `tieBreak` | Keep if the lanes fall 5% or more on 3 boards with no rise of R1 |
| EDA-005 | `maxDoglegs` 0 to 3, `minStep` 1 to 4 | Keep if the lanes fall 5% more than EDA-004 and R3 rises 0.2 or less |
| EDA-006 | `initialTracks`, `minJog` 1 to 4 | Keep if the lanes are 5% fewer than EDA-004 and R3 rises 0.2 or less |
| EDA-007 | `order`, `maxJogs` 0 to 2 | Keep if the lane crossings at the junctions fall 20% or more |
| EDA-008 | `spacing` 2 to 8, `overflowCost` 1 to 100, `stages` | Keep if M4 = 0, R12 is better than `shared` and R5 stays within 5% |
| EDA-009 | `pf0`, `pfGrowth` 1.3 to 2, `hf`, `passes` 5 to 50 | Keep if the overfull gaps fall 50% or more and R5 rises 5% or less |
| EDA-010 | `rounds` 1 to 5, `scope`, `order` | Keep if the spread of R6 and R1 over 5 input orders falls 50% or more |
| EDA-011 | `eps` 0.05 to 0.3, `roundings` 1 to 20 | Keep as a reference if its bound is within 20% of EDA-009 |
| EDA-012 | `iterations` 20 to 200, `theta` 0.1 to 2 | Keep if the gap of the bound is 15% or less on boards of 30 nodes |
| EDA-013 | `w1`, `w2`, `w3` 0 to 10, `method` | Keep if the crossings fall 15% or more at 5% more lanes or fewer |
| EDA-014 | `budget`, `spanThreshold`, `viaCost` 0 to 10 | Keep if Z4 ≤ 1 at each level, Z9 is 10% better and Z1 = 0 |
| EDA-015 | `degreeLimit` 2 to 9, `metric` | Keep if B1 rises 5% or more with R9 = 0 |
| EDA-016 | `spacing` 2 to 8, `shape` | Keep if the errors of the lane spacing at the merges fall 50% or more |
| EDA-017 | `tau` 1.1 to 2, `iterations` 5 to 30 | Keep if the B3 q95 falls 10% or more at a B1 loss of 3% or less |
| EDA-018 | `cell` 5 to 40, `wireWidth` 1 to 8 | Keep if the rank correlation with `roomDemand` is 0.8 or more at 10 times less time |
| EDA-019 | `orientation`, `minTile` 0 to 4 | Keep if the build time is not more than the time of the corner graph |
| EDA-020 | `clearance` 2 to 10, `classSearch` | Keep if the R5 median falls 3% or more with a better R8 |
| EDA-021 | `spacing` 2 to 8, `widthBuckets` 2 to 6 | Keep if M4 falls 80% or more and R5 rises 5% or less |
| EDA-022 | `method`, `slotSpacing` 2 to 8 | Keep if the crossings near the boxes fall 30% or more |
| EDA-023 | `mode`, `maxIterations` 10 to 1000 | Keep if Z10 falls 80% or more against a full new route, with R9 = 0 |
| EDA-024 | `radius`, `minRadius` 1 to 8 | Keep if R8 ≥ the clearance on each route and C7 = 0 |
| EDA-025 | `cell` 5 to 20, `bendCosts`, `shareDiscount` 0.2 to 1 | Keep if R3 falls 20% or more and R5 rises 8% or less |
| EDA-026 | `wCross`, `wSep`, `timeLimit` 0.1 to 10 s | Keep as a strategy if B5 falls 10% or more within 2 s at 100 nodes |
| EDA-027 | `directions` 4, 6 or 8, `delta` 0.5 to 4 | Keep if R3 falls 30% or more with R9 = 0 and C8 ≤ 2 |
| EDA-028 | `iterations` 5 to 50, `weight`, `clampToSection` | Keep if the R5 median falls 3% or more with no rise of R7 |
| EDA-029 | `alpha` 0.3 to 1, `passes` 1 to 5 | Keep if one `α` is better than `discount` 0.5 on B1 and on the B3 q95 |
| EDA-030 | `alpha` 0.3 to 0.9, `clamp` 0.2 to 0.8 | Keep if B1 rises 3% or more and the B6 maximum falls 10° or more |
| EDA-031 | `beta` 0.15 to 1, `power` 1 to 4, `iterations` 10 to 50 | Keep if the largest overuse falls 50% or more and R5 rises 5% or less |
| EDA-032 | `alpha`, `beta`, `power`, `mu` 1 to 10 | Keep if B1 is within 5% of EDA-029 and M4 within 10% of EDA-031 |
| EDA-033 | `level` 1 to 4, `minGroup` 2 to 8, `legMax` | Keep if B1 rises 10% or more and R5 stays within 5% |
| EDA-034 | `order`, `discount` 0.2 to 1 | Keep if the routes that change after an edit fall 50% or more |
| EDA-035 | `alpha` 10° to 35°, `smoothing` 0 to 1 | Keep if R7 = 0 and the B6 maximum falls 20° or more |
| EDA-036 | `turnLimit` 20° to 60°, `keepShare` 0.1 to 0.5 | Keep if Z4 ≤ 1 at each level and Z9 is not worse |
| EDA-037 | `method`, `eps0` 0.5 to 4, `safe` | Keep if the points fall 40% or more with no rise of Z3 |
| EDA-038 | `pxMin` 1 to 4, `widthScale`, `minCount` 2 to 5 | Keep if Z4 falls 30% or more at the far levels |
| EDA-039 | `weight`, `keepOrder`, `maxMove` 0 to 10 | Keep if M3 falls 30% or more and M1 rises 5% or less |
| EDA-040 | `weight`, `minRange` 1 to 3 | Keep if no item vanishes and comes back across the zoom |
| EDA-041 | `leader`, `slotSpacing` 2 to 8 | As EDA-022 |
| EDA-042 | `badgeSize` 8 to 24, `minCount` 2 to 5 | Keep if no badge covers a box or a badge, and M1 rises 2% or less |
| EDA-043 | `maxExact` 100 to 1000, `fallbackK` 8 to 16 | Keep as a router if the gap to `corners` is 2% or more on a board |
| EDA-044 | `method`, `mesh`, `margin` 2 to 10 | Keep if R5 is within 0.5% of EDA-043 and the time ≤ `corners` |
| EDA-045 | `radius`, `refine` | Keep if a wide path fails less often than with the grown corner graph |
| EDA-046 | `minFanIn` 2 to 10, `graph`, `tieBreak` | Keep if R1 = 0 among the edges of one target and B1 is above `corners` |
| EDA-047 | `conflicts`, `w` 1 to 1.5, `nodeLimit` 100 to 10000 | Keep if the conflicts fall 50% or more and R5 rises 3% or less |
| EDA-048 | `gamma` 0.5 to 10, `priority` | Keep if the overuse is within 10% of EDA-009 at a third of its time |
| EDA-049 | `level` 1 to 4, `entranceSpacing` 2 to 8 | Keep if Z9 falls 20% or more and the time falls 30% or more |
| EDA-050 | `H` 4 to 64, `levels` 1 to 4, `rank` | Keep if its front of B1 and B3 is better than the front of `discount` |
| EDA-051 | `tau` 0 to 1, `areaBudget` 1.0 to 1.5, `rounds` 1 to 3 | Keep if M1 falls 10% or more at M4 = 0 |

### The five cheapest screens

1. EDA-004 has a screen already: the scratch run of this note.
2. EDA-029 is a change of the cost of one link in `shared`, and a sweep of `α` on two boards.
3. EDA-018 is a correlation of two demand maps. It needs no new route.
4. EDA-038 counts the drawn elements at each level. It needs no new route.
5. EDA-030 replaces one point of `trunks` with a few Weiszfeld steps.

## Combinations with the other families

- Physarum and ant trails (NAT-R). The slime mold model makes a tube grow with its flow, and the result is a branched transport network. EDA-029 gives its cost in closed form. The pheromone of an ant colony is the history term of EDA-009.
- River networks and leaf veins (NAT-R) follow `f^α` costs too. Their angles at a merge follow the formula of EDA-030.
- Force-directed edge bundling (HWY-R) gives bundles with no capacity. EDA-021 and EDA-009 give them a width that fits the gaps.
- Clusters of edges that overlap (HWY-R) give candidate highways. EDA-050 ranks them by the shortest ways, and EDA-033 by the sections.
- Energy and gradient descent on the measures (RULE-R) need a cost for each crossing and each lane. EDA-012 gives the prices as a dual, with a lower bound.
- The grouping rule `cut` of [GROUPING.md](GROUPING.md) cuts few links. Its sections are the cells of EDA-033 and the clusters of EDA-049.
- The circular fillet F1 and the biarc F8 of [CURVES.md](CURVES.md) are the curves of EDA-024. The exact offsets of F13 fit EDA-016.
- The ideas of WILD-R for the lane order can use EDA-026 as the exact reference on small boards.

## Gaps

- No measure of MEAS0 counts the overlaps of count badges. EDA-042 needs one.
- The catalogs of the other families did not exist when this note was written. The `related` field of each record names only EDA ids.
- The scratch run uses the far view only. The near levels can give other ratios.

## Sources

### Chips

- <a id="lee61"></a>Lee, 1961. [An algorithm for path connections and its applications](https://doi.org/10.1109/TEC.1961.5219222). IRE Transactions on Electronic Computers EC-10(3).
- <a id="hadlock77"></a>Hadlock, 1977. [A shortest path algorithm for grid graphs](https://doi.org/10.1002/net.3230070404). Networks 7(4).
- <a id="hightower69"></a>Hightower, 1969. [A solution to line-routing problems on the continuous plane](https://doi.org/10.1145/800260.809014). Design Automation Workshop.
- <a id="hanan66"></a>Hanan, 1966. [On Steiner's problem with rectilinear distance](https://doi.org/10.1137/0114025). SIAM Journal on Applied Mathematics 14(2).
- <a id="wybrow09"></a>Wybrow, Marriott and Stuckey, 2009. [Orthogonal connector routing](https://doi.org/10.1007/978-3-642-11805-0_22). Graph Drawing 2009.
- <a id="hashimoto71"></a>Hashimoto and Stevens, 1971. [Wire routing by optimizing channel assignment within large apertures](https://doi.org/10.1145/800158.805069). Design Automation Workshop.
- <a id="yoshimura82"></a>Yoshimura and Kuh, 1982. [Efficient algorithms for channel routing](https://doi.org/10.1109/TCAD.1982.1269993). IEEE TCAD 1(1).
- <a id="deutsch76"></a>Deutsch, 1976. [A dogleg channel router](https://doi.org/10.1145/800146.804807). Design Automation Conference.
- <a id="szymanski85"></a>Szymanski, 1985. [Dogleg channel routing is NP-complete](https://doi.org/10.1109/TCAD.1985.1270096). IEEE TCAD 4(1).
- <a id="rivest82"></a>Rivest and Fiduccia, 1982. [A greedy channel router](https://doi.org/10.1145/800263.809170). Design Automation Conference.
- <a id="luk85"></a>Luk, 1985. [A greedy switch-box router](https://doi.org/10.1016/0167-9260(85)90029-X). Integration 3(2).
- <a id="hamachi84"></a>Hamachi and Ousterhout, 1984. [Detour: a fast, accurate switchbox router](https://doi.org/10.1145/800033.800861). Design Automation Conference.
- <a id="batterywala02"></a>Batterywala, Shenoy, Nicholls and Zhou, 2002. [Track assignment: a desirable intermediate step between global routing and detailed routing](https://doi.org/10.1145/774572.774581). ICCAD 2002.
- <a id="chang10"></a>Chang, Lee, Gao, Wu and Wang, 2010. [NTHU-Route 2.0: a robust global router for modern designs](https://doi.org/10.1109/TCAD.2010.2061590). IEEE TCAD 29(12).
- <a id="mcmurchie95"></a>McMurchie and Ebeling, 1995. [PathFinder: a negotiation-based performance-driven router for FPGAs](https://doi.org/10.1145/201310.201328). FPGA 1995.
- <a id="nair87"></a>Nair, 1987. [A simple yet effective technique for global wiring](https://doi.org/10.1109/TCAD.1987.1270264). IEEE TCAD 6(2).
- <a id="raghavan87"></a>Raghavan and Thompson, 1987. [Randomized rounding: a technique for provably good algorithms and algorithmic proofs](https://doi.org/10.1007/BF02579324). Combinatorica 7(4).
- <a id="muller11"></a>Müller, Radke and Vygen, 2011. [Faster min-max resource sharing in theory and practice](https://doi.org/10.1007/s12532-011-0023-y). Mathematical Programming Computation 3(1).
- <a id="ozdal09"></a>Ozdal and Wong, 2009. [Archer: a history-based global routing algorithm](https://doi.org/10.1109/TCAD.2009.2013991). IEEE TCAD 28(4).
- <a id="fisher81"></a>Fisher, 1981. [The Lagrangian relaxation method for solving integer programming problems](https://doi.org/10.1287/mnsc.27.1.1). Management Science 27(1).
- <a id="lee08"></a>Lee and Wang, 2008. [`Congestion-constrained layer assignment for via minimization in global routing`](https://doi.org/10.1109/TCAD.2008.927733). IEEE TCAD 27(9).
- <a id="chu08"></a>Chu and Wong, 2008. [FLUTE: fast lookup table based rectilinear Steiner minimal tree algorithm for VLSI design](https://doi.org/10.1109/TCAD.2007.907068). IEEE TCAD 27(1).
- <a id="hwang76"></a>Hwang, 1976. [On Steiner minimal trees with rectilinear distance](https://doi.org/10.1137/0130013). SIAM Journal on Applied Mathematics 30(1).
- <a id="tompa80"></a>Tompa, 1980. [An optimal solution to a wire-routing problem](https://doi.org/10.1145/800141.804677). STOC 1980.
- <a id="leiserson83"></a>Leiserson and Pinter, 1983. [Optimal placement for river routing](https://doi.org/10.1137/0212030). SIAM Journal on Computing 12(3).
- <a id="spindler07"></a>Spindler and Johannes, 2007. [Fast and accurate routing demand estimation for efficient routability-driven placement](https://portal.fis.tum.de/en/publications/fast-and-accurate-routing-demand-estimation-for-efficient-routabi/). DATE 2007.
- <a id="ousterhout84"></a>Ousterhout, 1984. [Corner stitching: a data-structuring technique for VLSI layout tools](https://doi.org/10.1109/TCAD.1984.1270058). IEEE TCAD 3(1).
- <a id="kahng11"></a>Kahng, Lienig, Markov and Hu, 2011. [VLSI physical design: from graph partitioning to timing closure](https://doi.org/10.1007/978-90-481-9591-6). Springer.

### Circuit boards

- <a id="staepelaere93"></a>Staepelaere, Jue, Dayan and Dai, 1993. [SURF: rubber-band routing system for multichip modules](https://doi.org/10.1109/54.245962). IEEE Design and Test of Computers 10(4). A [technical report](https://tr.soe.ucsc.edu/sites/default/files/technical-reports/UCSC-CRL-93-04.pdf) gives the details.
- <a id="hershberger94"></a>Hershberger and Snoeyink, 1994. [Computing minimum length paths of a given homotopy class](https://doi.org/10.1016/0925-7721(94)90010-8). Computational Geometry 4(2).
- <a id="leiserson85"></a>Leiserson and Maley, 1985. [Algorithms for routing and testing routability of planar VLSI layouts](https://doi.org/10.1145/22145.22152). STOC 1985.
- <a id="duncan01"></a>Duncan, Efrat, Kobourov and Wenk, 2001. [Drawing with fat edges](https://doi.org/10.1007/3-540-45848-4_14). Graph Drawing 2001.
- <a id="yan10"></a>Yan, Wu, Ma and Wong, 2010. [On the escape routing of differential pairs](https://scholars.hkbu.edu.hk/en/publications/on-the-escape-routing-of-differential-pairs/). ICCAD 2010.
- <a id="yan10t"></a>Yan, 2010. [Algorithmic studies on PCB routing](https://www.ideals.illinois.edu/items/18457). PhD thesis, University of Illinois.
- <a id="luo08"></a>Luo and Wong, 2008. [Ordered escape routing based on Boolean satisfiability](https://www.cecs.uci.edu/~papers/aspdac08/pdf/p244_3A-4.pdf). ASP-DAC 2008.
- <a id="ozdal06"></a>Ozdal and Wong, 2006. [A length-matching routing algorithm for high-performance printed circuit boards](https://scholars.hkbu.edu.hk/en/publications/a-length-matching-routing-algorithm-for-high-performance-printed-/). IEEE TCAD 25(12).
- <a id="teig02"></a>Teig, 2002. [The X architecture: not your father's diagonal wiring](https://doi.org/10.1145/505348.505355). SLIP 2002.
- <a id="kicad"></a>KiCad developers. [The PCB editor and its interactive router](https://docs.kicad.org/8.0/en/pcbnew/pcbnew.html). KiCad 8 documentation.
- <a id="topor"></a>[TopoR](https://en.wikipedia.org/wiki/TopoR), a topological router for printed circuit boards.

### Metro maps

- <a id="bast20"></a>Bast, Brosi and Storandt, 2020. [Metro maps on octilinear grid graphs](https://doi.org/10.1111/cgf.13986). Computer Graphics Forum 39(3).
- <a id="bast18"></a>Bast, Brosi and Storandt, 2018. [Efficient generation of geographically accurate transit maps](https://arxiv.org/abs/1710.02226). SIGSPATIAL 2018.
- <a id="fink13"></a>Fink and Pupyrev, 2013. [Metro-line crossing minimization: hardness, approximations, and tractable cases](https://arxiv.org/abs/1306.2079). Graph Drawing 2013.
- <a id="pupyrev11"></a>Pupyrev, Nachmanson, Bereg and Holroyd, 2011. [Edge routing with ordered bundles](https://arxiv.org/abs/1209.4227). Graph Drawing 2011.
- <a id="nollenburg11"></a>Nöllenburg and Wolff, 2011. [Drawing and labeling high-quality metro maps by mixed-integer programming](https://doi.org/10.1109/TVCG.2010.81). IEEE TVCG 17(5).
- <a id="wu20"></a>Wu, Niedermann, Takahashi, Roberts and Nöllenburg, 2020. [A survey on transit map layout](https://doi.org/10.1111/cgf.14030). Computer Graphics Forum 39(3).
- <a id="cabello05"></a>Cabello, de Berg and van Kreveld, 2005. [Schematization of networks](https://doi.org/10.1016/j.comgeo.2004.11.002). Computational Geometry 30(3).
- <a id="delling10"></a>Delling, Gemsa, Nöllenburg and Pajor, 2010. [Path schematization for route sketches](https://i11www.iti.kit.edu/extra/publications/dgnp-psrs-10.pdf). SWAT 2010.

### Transport, airlines and logistics

- <a id="okelly87"></a>O'Kelly, 1987. [A quadratic integer program for the location of interacting hub facilities](https://doi.org/10.1016/S0377-2217(87)80007-3). European Journal of Operational Research 32(3).
- <a id="campbell94"></a>Campbell, 1994. [Integer programming formulations of discrete hub location problems](https://doi.org/10.1016/0377-2217(94)90318-2). European Journal of Operational Research 72(2).
- <a id="beck15"></a>Beck and Sabach, 2015. [Weiszfeld's method: old and new results](https://doi.org/10.1007/s10957-014-0586-7). Journal of Optimization Theory and Applications 164(1).
- <a id="gilbert67"></a>Gilbert, 1967. [Minimum cost communication networks](https://www.nokia.com/bell-labs/publications-and-media/publications/minimum-cost-communication-networks). Bell System Technical Journal 46(9).
- <a id="xia03"></a>Xia, 2003. [Optimal paths related to transport problems](https://doi.org/10.1142/S0219199703000963). Communications in Contemporary Mathematics 5(2).
- <a id="wardrop52"></a>Wardrop, 1952. [Some theoretical aspects of road traffic research](https://doi.org/10.1680/ipeds.1952.11259). Proceedings of the Institution of Civil Engineers 1(3).
- <a id="frank56"></a>Frank and Wolfe, 1956. [An algorithm for quadratic programming](https://doi.org/10.1002/nav.3800030109). Naval Research Logistics Quarterly 3(1–2).
- <a id="roughgarden02"></a>Roughgarden and Tardos, 2002. [How bad is selfish routing?](https://doi.org/10.1145/506147.506153) Journal of the ACM 49(2).
- <a id="crainic00"></a>Crainic, 2000. [Service network design in freight transportation](https://doi.org/10.1016/S0377-2217(99)00233-7). European Journal of Operational Research 122(2).
- <a id="barthelemy08"></a>Barthélemy and Flammini, 2008. [Modeling urban street patterns](https://doi.org/10.1103/PhysRevLett.100.138702). Physical Review Letters 100(13).

### Cartography

- <a id="phan05"></a>Phan, Xiao, Yeh, Hanrahan and Winograd, 2005. [Flow map layout](https://doi.org/10.1109/INFVIS.2005.1532150). InfoVis 2005.
- <a id="verbeek11"></a>Verbeek, Buchin and Speckmann, 2011. [`Flow map layout via spiral trees`](https://research.tue.nl/en/publications/flow-map-layout-via-spiral-trees/). IEEE TVCG 17(12).
- <a id="buchin15"></a>Buchin, Speckmann and Verbeek, 2015. [Angle-restricted Steiner arborescences for flow map layout](https://doi.org/10.1007/s00453-013-9867-z). Algorithmica 72(2).
- <a id="thomson03"></a>Thomson, 2003. [Bending the axial line: smoothly continuous road centre-line segments as a basis for road network analysis](https://www.spacesyntax.net/symposia-archive/SSS4/fullpapers/50Thomsonfpaper.pdf). Space Syntax Symposium 2003.
- <a id="chimani14"></a>Chimani, van Dijk and Haunert, 2014. [How to eat a graph: computing selection sequences for the continuous generalization of transportation networks](https://doi.org/10.1145/2666310.2666414). SIGSPATIAL 2014.
- <a id="douglas73"></a>Douglas and Peucker, 1973. [`Algorithms for the reduction of the number of points required to represent a digitized line or its caricature`](https://doi.org/10.3138/FM57-6770-U75U-7727). Cartographica 10(2).
- <a id="visvalingam93"></a>Visvalingam and Whyatt, 1993. [Line generalisation by repeated elimination of points](https://doi.org/10.1179/000870493786962263). The Cartographic Journal 30(1).
- <a id="saalfeld99"></a>Saalfeld, 1999. [Topologically consistent line simplification with the Douglas-Peucker algorithm](https://doi.org/10.1559/152304099782424901). Cartography and Geographic Information Science 26(1).
- <a id="thom05"></a>Thom, 2005. [A strategy for collapsing OS Integrated Transport Network dual carriageways](https://ica.ign.fr/2005_Coruna/papers/thom.pdf). ICA Workshop on Generalisation 2005.
- <a id="harrie99"></a>Harrie, 1999. [The constraint method for solving spatial conflicts in cartographic generalization](https://doi.org/10.1559/152304099782424884). Cartography and Geographic Information Science 26(1).
- <a id="dwyer06"></a>Dwyer, Marriott and Stuckey, 2006. [Fast node overlap removal](https://doi.org/10.1007/11618058_15). Graph Drawing 2005.
- <a id="been06"></a>Been, Daiches and Yap, 2006. [Dynamic map labeling](https://doi.org/10.1109/TVCG.2006.136). IEEE TVCG 12(5).
- <a id="been10"></a>Been, Nöllenburg, Poon and Wolff, 2010. [Optimizing active ranges for consistent dynamic map labeling](https://i11www.iti.kit.edu/extra/publications/bnpw-oarcd-08.pdf). Computational Geometry 43(3).
- <a id="bekos07"></a>Bekos, Kaufmann, Symvonis and Wolff, 2007. [Boundary labeling: models and efficient algorithms for rectangular maps](https://doi.org/10.1016/j.comgeo.2006.05.003). Computational Geometry 36(3).
- <a id="christensen95"></a>Christensen, Marks and Shieber, 1995. [An empirical study of algorithms for point-feature label placement](https://doi.org/10.1145/212332.212334). ACM Transactions on Graphics 14(3).

### Robotics and games

- <a id="lozanoperez79"></a>Lozano-Pérez and Wesley, 1979. [An algorithm for planning collision-free paths among polyhedral obstacles](https://doi.org/10.1145/359156.359164). Communications of the ACM 22(10).
- <a id="daniel10"></a>Daniel, Nash, Koenig and Felner, 2010. [Theta*: any-angle path planning on grids](https://doi.org/10.1613/jair.2994). JAIR 39.
- <a id="harabor16"></a>Harabor, Grastien, Öz and Aksakalli, 2016. [Optimal any-angle pathfinding in practice](https://doi.org/10.1613/jair.5007). JAIR 56.
- <a id="cui17"></a>Cui, Harabor and Grastien, 2017. [Compromise-free pathfinding on a navigation mesh](https://www.ijcai.org/proceedings/2017/70). IJCAI 2017.
- <a id="kallmann10"></a>Kallmann, 2010. [Shortest paths with arbitrary clearance from navigation meshes](https://diglib.eg.org/handle/10.2312/SCA.SCA10.159-168). SCA 2010.
- <a id="treuille06"></a>Treuille, Cooper and Popović, 2006. [Continuum crowds](https://doi.org/10.1145/1141911.1142008). ACM Transactions on Graphics 25(3).
- <a id="emerson13"></a>Emerson, 2013. [Crowd pathfinding and steering using flow field tiles](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf). Game AI Pro, chapter 23.
- <a id="sharon15"></a>Sharon, Stern, Felner and Sturtevant, 2015. [Conflict-based search for optimal multi-agent pathfinding](https://doi.org/10.1016/j.artint.2014.11.006). Artificial Intelligence 219.
- <a id="silver05"></a>Silver, 2005. [Cooperative pathfinding](https://ojs.aaai.org/index.php/AIIDE/article/view/18726). AIIDE 2005.
- <a id="botea04"></a>Botea, Müller and Schaeffer, 2004. [Near optimal hierarchical path-finding](https://www.semanticscholar.org/paper/Near-Optimal-Hierarchical-Path-Finding-Botea-M%C3%BCller/b0f0432ba69e4d730b93a75e3d19c8e9d811efac). Journal of Game Development 1(1).
- <a id="sanders05"></a>Sanders and Schultes, 2005. [Highway hierarchies hasten exact shortest path queries](https://doi.org/10.1007/11561071_51). ESA 2005.
- <a id="geisberger08"></a>Geisberger, Sanders, Schultes and Delling, 2008. [Contraction hierarchies: faster and simpler hierarchical routing in road networks](https://doi.org/10.1007/978-3-540-68552-4_24). WEA 2008.
- <a id="bast07"></a>Bast, Funke, Sanders and Schultes, 2007. [Fast routing in road networks with transit nodes](https://doi.org/10.1126/science.1137521). Science 316(5824).

[bast07]: #bast07
[bast18]: #bast18
[bast20]: #bast20
[barthelemy08]: #barthelemy08
[beck15]: #beck15
[been06]: #been06
[been10]: #been10
[bekos07]: #bekos07
[botea04]: #botea04
[buchin15]: #buchin15
[campbell94]: #campbell94
[chimani14]: #chimani14
[chu08]: #chu08
[crainic00]: #crainic00
[cui17]: #cui17
[delling10]: #delling10
[emerson13]: #emerson13
[fink13]: #fink13
[geisberger08]: #geisberger08
[gilbert67]: #gilbert67
[hanan66]: #hanan66
[harabor16]: #harabor16
[hashimoto71]: #hashimoto71
[hershberger94]: #hershberger94
[hwang76]: #hwang76
[kahng11]: #kahng11
[kallmann10]: #kallmann10
[kicad]: #kicad
[lee08]: #lee08
[leiserson85]: #leiserson85
[lozanoperez79]: #lozanoperez79
[luo08]: #luo08
[mcmurchie95]: #mcmurchie95
[muller11]: #muller11
[nollenburg11]: #nollenburg11
[okelly87]: #okelly87
[ozdal06]: #ozdal06
[phan05]: #phan05
[pupyrev11]: #pupyrev11
[raghavan87]: #raghavan87
[rivest82]: #rivest82
[roughgarden02]: #roughgarden02
[saalfeld99]: #saalfeld99
[sanders05]: #sanders05
[sharon15]: #sharon15
[silver05]: #silver05
[spindler07]: #spindler07
[staepelaere93]: #staepelaere93
[szymanski85]: #szymanski85
[thom05]: #thom05
[tompa80]: #tompa80
[treuille06]: #treuille06
[verbeek11]: #verbeek11
[wardrop52]: #wardrop52
[wu20]: #wu20
[wybrow09]: #wybrow09
[yan10]: #yan10
[yoshimura82]: #yoshimura82
