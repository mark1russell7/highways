# Rules, forces and constraints for the routes

This note is the research item RULE-R of the [roadmap](../ROADMAP.md). It surveys the methods where rules of the drawing decide the routes and the highways. A force layout lets forces decide the places of the nodes. These methods go further: a rule can be any measure of the drawing.

The catalog [`ideas/rules.json`](ideas/rules.json) holds the same 53 ideas as records. The item BUILD-W builds and screens each record. The ids are `RULE-001` to `RULE-053`.

## Summary

- The note gives 53 ideas in seven areas. 15 come from the literature, 13 are new ideas of this note and 25 are hybrids of the two.
- Each idea tells which rules it can express, how it obeys the hard rules and how it stays stable between zoom levels.
- Most soft methods break a hard rule at times. One repair step, [RULE-046](#rule-046), makes any of them safe. It is first in the [build order](#build-order).
- When the way of each route around the boxes and the order of the lanes are fixed, the geometry is one convex program ([RULE-050](#rule-050)). A convex program has one answer, so it is the same each run and moves little between levels.
- The cheapest high-value router is the corner graph of today with rule prices and rip-up ([RULE-044](#rule-044)). It obeys the hard rules by construction.
- A rule language ([RULE-036](#rule-036)) turns rules written as data into energy terms and constraints. The [section on rule languages](#where-a-rule-language-fits) tells where a formula engine over collections, for example Vex, fits.
- The learned ideas have no corpus of good drawings yet. Their labels must not come from the MEAS0 order, or the loop is circular.

## The question and the scope

The question: how can rules of the drawing decide the routes and the highways? A rule is a measure with a target. Examples are "no two lanes nearer than 4 px", "crossings near 90 degrees" and "a route stays 8 px from each box".

The note covers these kinds of methods:

- Forces on the route points: springs, repulsion, attraction, fields and the layout methods adapted to routes.
- Constraint solvers: linear and quadratic programs, Cassowary, separation constraints, integer programs, SAT and constraint programming.
- Energy and optimization: a sum of rule terms, gradient descent, Adam, annealing, position-based dynamics, barriers and multigrid.
- Image space: render the drawing, measure the image and descend the gradient of the measure.
- Grid rules and rule languages: automata, grammars, L-systems and rules written as data.
- Learned rules: weights from preferences, critics, graph networks and reinforcement learning.

The note does not repeat other notes. [MEASURES.md](MEASURES.md) gives the measures. [CURVES.md](CURVES.md) gives the curve families. [GROUPING.md](GROUPING.md) gives the grouping rules. The notes of HWY-R, NAT-R, EDA-R and WILD-R give the other families of ideas. Where an idea of this note is near an idea of the highway family, the entry names its `HWY-` id.

The core takes boxes and edges and gives polylines and zoom levels. So each idea here moves only the routes, the junctions and the highways. The boxes stay fixed. A method that also moves the boxes belongs to the step `room`.

## How to read an entry

### Notation

- `x_i` is a route point, and `V` is the number of route points of all routes. A board of 100 nodes has 150 to 300 edges and approximately 1500 route points. A board of 1000 nodes has approximately 15 000.
- `φ(x)` is the signed distance from `x` to the nearest box. It is negative inside a box. `∇φ` points away from the nearest box.
- `d0` is the clearance that a rule asks for. `u` is the unit of length of a board, as in [MEAS0](MEASURES.md#notation).
- `G` is the number of cells of a grid, and `R` is the side of an image in pixels.
- `E_r` is the energy term of the rule `r`, and `w_r` is its weight.
- Each measure id, for example R2, B1 or Z7, is an id of [MEAS0](MEASURES.md).

### The fields of an entry

| Field | Meaning |
|---|---|
| Kind | `literature`: a known method. `ours`: a new idea of this note. `hybrid`: a known method with a new part for this library. |
| Step | The step of the core that the idea plugs into. `highway` is the future step of HWY-STEP. `whole` means a frame around several steps. |
| Math | The key formula or algorithm. |
| Rules it expresses | The kinds of rules that the method can hold. |
| Hard rules | How the method keeps the routes out of the boxes and the ends on the plugs. The patterns are in the [next section](#how-a-method-obeys-the-hard-rules). |
| Zoom levels | How the routes stay stable between levels. The patterns are in the [section after it](#how-a-method-stays-stable-between-levels). |
| Cost | The time complexity, and an estimate of the time on boards of 100 and of 1000 nodes. The estimates assume 10^8 basic operations each second in JavaScript. |
| Options | The options that a user tunes, with their ranges. |
| Improves, Risks | The MEAS0 measures that the idea makes better, and the measures that it can make worse. |
| Screen | The cheapest test that keeps or drops the idea: boards, measures and a threshold. |
| Depends on placement | `yes` when the result changes with the places of the boxes. |
| Prototype | S: one day or less. M: two to five days. L: more than one week, or a solver from outside. |

### How a method obeys the hard rules

The hard rules of [MEAS0](MEASURES.md#the-hard-rules-of-today) say that no route goes through a box and that each route ends on its plug. A soft rule only makes a fault rare. These five patterns make it impossible.

| Pattern | How it works | Methods |
|---|---|---|
| `guard` | The search moves only through free space. Each candidate obeys the rules before the method sees it. | The corner graph, a grid search, the candidates of annealing |
| `project` | After each step, a projection moves each point with `φ < d0` out along `∇φ`. The ends snap back to the side of their plug. | Forces, gradient descent, image losses |
| `barrier` | A barrier term goes to infinity at the box edge. A line search with a collision check keeps each step legal. | Interior point methods, IPC |
| Exact | The hard rules are constraints of a solver. A solver answer obeys them, or the solver reports no answer. | QP, MIP, SAT, ASP |
| Repair | [RULE-046](#rule-046) operates after any method. It falls back to a detour of the corner graph, then to the base route. | Each soft method |

The plug ends are fixed in each method of this note, or they slide along their side of the box. The plug angle (R10) stays on `SIDE_NORMAL` because the first leg is a fixed stub.

### How a method stays stable between levels

Each zoom level routes its own level links. A rule method must not give a new drawing at each level. These five patterns keep the levels near each other (Z7 to Z10).

| Pattern | How it works |
|---|---|
| `warm` | Each level starts from the routes of its parent level. |
| `anchor` | A term `μ ‖x - x_parent‖²` pulls each shared point to its place at the parent level. [RULE-045](#rule-045) gives the schedule of `μ`. |
| `convex` | A convex energy has one answer. A small change of the input then gives a small move. |
| `hysteresis` | A discrete choice changes only when the new choice wins by a margin. [RULE-053](#rule-053) gives the gate. |
| Native | The method solves all levels together: multigrid ([RULE-024](#rule-024)) or one loss over all levels ([RULE-031](#rule-031)). |

### Determinism

The same input gives the same output (the rule "same twice" of MEAS0). Each method here obeys it with three rules:

- A fixed count of steps, not a time limit.
- A seeded random number generator for each sample and each random choice.
- A fixed order of summation and of constraint projection, so the rounding is the same.

A solver from outside (MIP, SAT, ASP) is deterministic only with one thread and a fixed seed. A learned method is deterministic only when its weights are frozen and its inference has no sampling.

## Taxonomy

| Area | Ids | What decides the route | Rules it can hold | Hard rules | Zoom levels | Best step |
|---|---|---|---|---|---|---|
| [Forces on routes](#forces-on-routes) | [RULE-001](#rule-001) to [RULE-011](#rule-011) | A sum of forces on each point, then relaxation | Local geometric rules: length, gaps, clearance, angles, direction | `project`, `guard` ([RULE-011](#rule-011)) | `warm`, `anchor` | `router` as a refiner, `highway` |
| [Constraint solvers](#constraint-solvers) | [RULE-012](#rule-012) to [RULE-018](#rule-018) | A program with constraints and an objective | Linear, quadratic and Boolean rules, priorities | Exact | `convex`, a change penalty | `router`, `highway`, MEAS2 |
| [Energy and optimization](#energy-and-optimization) | [RULE-019](#rule-019) to [RULE-026](#rule-026) | The descent of one energy | Each rule with a smooth form, also discrete rules by annealing | `barrier`, `project`, `guard` | `anchor`, native multigrid | `router`, `levels` |
| [Image space](#image-space) | [RULE-027](#rule-027) to [RULE-031](#rule-031) | The gradient of a measure of a rendered image | Density, clutter, ink, white space | `project`, repair | One scale for each level | `whole`, `highway` |
| [Grid rules and rule languages](#grid-rules-and-rule-languages) | [RULE-032](#rule-032) to [RULE-037](#rule-037) | Local rules on cells or parts, or rules written as data | Local style rules, capacity, any rule of a library | `guard`, exact | Coarse cells constrain fine cells | `router`, `room`, `whole` |
| [Learned rules](#learned-rules) | [RULE-038](#rule-038) to [RULE-043](#rule-043) | Weights, critics or policies from examples | Taste that no single measure holds | Repair, `guard` | A feature for the parent level | `whole`, `router` |
| [New ideas](#new-ideas-of-this-note) | [RULE-044](#rule-044) to [RULE-053](#rule-053) | Mixes of the above | All of the above | All patterns | All patterns | Each step |

## Forces on routes

A force method gives each route point a sum of forces and lets the points relax. The forces are springs along the route, pushes from the boxes and from other routes, and pulls toward other routes or lines. The literature uses them for node layouts and for edge bundling ([Fruchterman 1991][fruchterman91], [Holten 2009][holten09]). Here the boxes are fixed, so only the route points move. Each force method needs `project` or [RULE-046](#rule-046) for the hard rules.

### RULE-001

**Elastic band: springs along the route and a push from the boxes.** Kind: `literature`. Step: `router`. Prototype: S.

The base router gives a route. The route becomes a chain of points with a spring between each pair of neighbors. Each point gets a push away from the boxes from the distance field. The chain relaxes for a fixed number of steps. The ends stay on their plugs.

| Field | Value |
|---|---|
| Math | `F_i = k_s (x_{i-1} + x_{i+1} - 2 x_i) + k_r max(0, d0 - φ(x_i)) ∇φ(x_i)` |
| Rules it expresses | Short routes, smooth routes, a clearance `d0` from each box. |
| Hard rules | `project`. The push grows near a box, and a projection step moves each point with `φ < d0` out along `∇φ`. The plug ends are fixed. |
| Zoom levels | `warm` and `anchor`. Each level starts from the route of its parent level. |
| Cost | `O(I·V)` for I steps and V route points. 100 nodes: 5 ms. 1000 nodes: 60 ms. |
| Options | K_s spring stiffness 0.1 to 1. K_r push strength 0.5 to 5. D0 clearance 2 to 16 px. Steps 20 to 200. Point spacing 4 to 16 px. |
| Improves | R8, C3, C7, R4 |
| Risks | R1, R3, R14, R6 |
| Screen | On `case-dense-groups` and `mid-clustered`, after `corner`: keep it if the median R8 rises by 30% with R9 = 0 and R1 up by 5% or less. |
| Depends on placement | yes |
| Sources | [Quinlan 1993][quinlan93], [Khatib 1986][khatib86] |
| Related | [RULE-005](#rule-005), [RULE-022](#rule-022), [RULE-046](#rule-046), HWY-002 |

### RULE-002

**Rule-energy edge bundling with a box field.** Kind: `hybrid`. Step: `highway`. Prototype: M.

Force-directed edge bundling pulls the points of compatible edges together. This variant adds the box distance field as a second force and a hard projection. A stretch budget limits the pull on each edge. So bundles form only in free space, not through a box.

| Field | Value |
|---|---|
| Math | `F_i = k_s Δx_i + Σ_{q ∈ C(e)} c(e,q) (x_{q,i} - x_i) / ‖x_{q,i} - x_i‖ + k_b ∇φ(x_i), stop the pull when length(e) > s_max · length0(e)` |
| Rules it expresses | Ink, bundles, clearance from boxes, a stretch budget for each edge. |
| Hard rules | `project` after each cycle, then RULE-046. |
| Zoom levels | `warm` and `anchor`. The compatibility uses the level links of each level. |
| Cost | `O(C·m·P·I)` for C candidate partners, P points per edge and I steps. 100 nodes: 40 ms. 1000 nodes: 1.5 s with a grid of neighbors. |
| Options | Compatibility threshold 0.4 to 0.8. Cycles 4 to 6. Points per edge 1 to 64 (doubles each cycle). Step 0.04, halves each cycle. K_b 0.5 to 5. S_max stretch budget 1.1 to 1.5. |
| Improves | B1, B2, B7, R12 |
| Risks | B4, R6, R3, C9, R9 |
| Screen | On `mid-clustered` and `case-dense-groups`, against `trunks`: keep it if B1 is equal or better, B4 rises by 10% or less, and R9 = 0. |
| Depends on placement | yes |
| Sources | [Holten 2009][holten09], [Khatib 1986][khatib86] |
| Related | HWY-002, HWY-006, [RULE-047](#rule-047), [RULE-028](#rule-028) |

### RULE-003

**Route-to-route repulsion with a cutoff.** Kind: `hybrid`. Step: `router`. Prototype: S.

Each route point carries a like charge. Points of other routes push it away inside a cutoff radius. The push spreads parallel routes into lanes and opens narrow crossing angles. Edges of one bundle do not push each other, so the bundles stay.

| Field | Value |
|---|---|
| Math | `F_i = Σ_{j ∉ e, ‖x_i - x_j‖ < r_c} q² (x_i - x_j) / ‖x_i - x_j‖³, neighbors from a grid hash` |
| Rules it expresses | A minimum gap between routes, lane separation, wide crossing angles. |
| Hard rules | `project`, then RULE-046. |
| Zoom levels | `anchor`. The charge falls with the level, so far views keep their bundles. |
| Cost | `O(I·V·k)` for k neighbors in the cutoff. 100 nodes: 8 ms. 1000 nodes: 120 ms. |
| Options | Q charge 0.5 to 4. R_c cutoff 4 to 24 px. Steps 20 to 100. Same-bundle exemption on or off. |
| Improves | R12, R2, R8 |
| Risks | R6, R3, B1, C8 |
| Screen | On `mid-hubs` and `mid-fanout`, after `corner`: keep it if R12 rises by 25% and R1 does not rise. |
| Depends on placement | yes |
| Sources | [Fruchterman 1991][fruchterman91], [Hu 2005][hu05] |
| Related | [RULE-001](#rule-001), [RULE-049](#rule-049), HWY-016 |

### RULE-004

**Magnetic springs: a field that turns segments to a direction.** Kind: `literature`. Step: `router`. Prototype: S.

A magnetic field turns each segment toward the nearest field direction. The field can be orthogonal, octilinear, radial from a hub or parallel to the main flow. The torque gives the drawing a style rule without a grid.

| Field | Value |
|---|---|
| Math | `τ = k_m ‖s‖^α θ^β, θ = angle from the nearest field direction, two equal forces at the ends of s, at right angles to s` |
| Rules it expresses | Orthogonal or octilinear segments, a main flow direction, radial fans around hubs. |
| Hard rules | `project`. The plug stubs keep `SIDE_NORMAL`. |
| Zoom levels | The field is the same at each level, so the directions do not change between levels. `anchor`. |
| Cost | `O(I·V)`. 100 nodes: 5 ms. 1000 nodes: 60 ms. |
| Options | Field: orthogonal, octilinear, radial or flow. K_m 0.1 to 2. Α 1. Β 1 to 2. |
| Improves | R14, R10, C10 |
| Risks | R6, R1, R8 |
| Screen | On `grid-400` and `mid-uniform`, from `straight`: keep it if R14 reaches 0.8 or more with R6 up by 10% or less. |
| Depends on placement | yes |
| Sources | [Sugiyama 1995][sugiyama95] |
| Related | [RULE-016](#rule-016), [RULE-052](#rule-052) |

### RULE-005

**Harmonic potential field router.** Kind: `literature`. Step: `router`. Prototype: M.

The router solves the Laplace equation on a grid. The boxes hold the highest potential, and the target plug holds zero. The route follows the steepest descent. A harmonic function has no local minimum in the free space, so each descent reaches its target.

| Field | Value |
|---|---|
| Math | `∇²u = 0 in free cells, u = 1 on boxes, u = 0 at the target, solved by SOR or multigrid. Route: dx/dt = -∇u` |
| Rules it expresses | Clearance (the potential is high near boxes), smooth routes, routes that stay in the middle of gaps. |
| Hard rules | `guard`. The descent does not enter a box cell, because the potential is at its maximum there. The end snaps to the plug. |
| Zoom levels | The coarse grid of the parent level starts the solve, so the field changes little between levels. |
| Cost | `O(G)` per target with multigrid, for G cells. 100 nodes: 0.4 s (one solve per target box). 1000 nodes: 30 s or more, so only the far levels or one solve per group. |
| Options | Cell 2 to 8 px. SOR factor 1.5 to 1.9. Sweeps 20 to 200. Potential of the border 0 or 1. |
| Improves | R8, C7, R9, C3 |
| Risks | R6, R5, R1 |
| Screen | On `case-dense-groups` and `packedGridBoard`, 100 nodes: keep it if R9 = 0, R8 rises by 40% and R6 is 1.3 times `corner` or less. |
| Depends on placement | yes |
| Sources | [Connolly 1990][connolly90], [Khatib 1986][khatib86] |
| Related | [RULE-006](#rule-006), [RULE-024](#rule-024), [RULE-051](#rule-051) |

### RULE-006

**Distance field and fast marching: the geodesic router.** Kind: `literature`. Step: `router`. Prototype: M.

A distance transform gives the signed distance φ to the nearest box. The speed falls near the boxes. Fast marching gives the travel time from the target, and the route descends it. The speed function writes clearance and area costs as one rule.

| Field | Value |
|---|---|
| Math | `‖∇T‖ = 1/F(x), F = clamp(φ/d0, ε, 1)^p, φ by the exact distance transform in O(G)` |
| Rules it expresses | Clearance, length, a cost for each area: dense regions, group interiors, margins. |
| Hard rules | `guard`. F = 0 inside a box, so the time there is infinite. |
| Zoom levels | `warm`. Each level uses its own level boxes and the coarse field of the parent. |
| Cost | `O(G)` for the transform, `O(G log G)` for each target. 100 nodes: 0.6 s. 1000 nodes: 30 s, so targets share one solve per group. |
| Options | Cell 2 to 8 px. D0 4 to 24 px. P 1 to 3. Ε 0.01 to 0.2. |
| Improves | R8, C7, R4, C3 |
| Risks | R6, R12, R1 |
| Screen | Same boards as RULE-005, against `corner`: keep it if C7 and R8 rise by 30% at R6 of 1.2 times or less. |
| Depends on placement | yes |
| Sources | [Sethian 1996][sethian96], [Felzenszwalb 2012][felzenszwalb12] |
| Related | [RULE-005](#rule-005), [RULE-041](#rule-041), [RULE-046](#rule-046), HWY-020 |

### RULE-007

**Elastic rod: curvature forces on the curve.** Kind: `literature`. Step: `curve`. Prototype: S.

The curve step treats a route as a discrete elastic rod. The bending energy is the sum of the squared turns over the local lengths. The descent lowers it while a projection keeps the clearance. The result has no sharp corner.

| Field | Value |
|---|---|
| Math | `E_b = Σ_i (2 tan(θ_i/2))² / ℓ_i, ℓ_i = half the sum of the two neighbor segment lengths, plus a stretch term Σ (‖e‖ - ‖e0‖)²` |
| Rules it expresses | Smallest radius, small curvature change, no tangent break. |
| Hard rules | `project` with `φ ≥ clearance`. The end tangents stay on `SIDE_NORMAL`. |
| Zoom levels | `anchor`. The rod of the parent level is the start. |
| Cost | `O(I·V)`. 100 nodes: 6 ms. 1000 nodes: 80 ms. |
| Options | K_b 0.1 to 10. Point spacing 2 to 8 px. Steps 20 to 200. Smallest radius 4 to 24 px. |
| Improves | C3, C4, C5, C2 |
| Risks | C7, C8, R8, R1 |
| Screen | On `shared-all` and `case-hub-chain`, after the curve `smooth`: keep it if C3 falls by 20% with 0 faults of C7. |
| Depends on placement | yes |
| Sources | [Bergou 2008][bergou08], [Horn 1983][horn83] |
| Related | [RULE-001](#rule-001), [RULE-022](#rule-022), [RULE-026](#rule-026) |

### RULE-008

**Stress majorization of the bend points.** Kind: `literature`. Step: `router`. Prototype: M.

Dwyer, Marriott and Wybrow put the bend points of the routes into a stress layout as extra nodes. Each bend point has a target distance to its neighbors and to the box corners that it wraps. Each step of stress majorization is one convex solve.

| Field | Value |
|---|---|
| Math | `stress = Σ w_ij (‖x_i - x_j‖ - d_ij)², w_ij = d_ij^-2, each step solves L_w X = L_Z X0 by conjugate gradients` |
| Rules it expresses | Target lengths, a distance to each wrapped corner, even spacing of the bends. |
| Hard rules | `project`. Separation constraints keep each bend point on its side of each wrapped corner. |
| Zoom levels | `warm`. Majorization descends from the start, so a warm start gives a near answer. |
| Cost | `O(I·V·k)` with a sparse solve. 100 nodes: 30 ms. 1000 nodes: 600 ms. |
| Options | Weight exponent -2 to 0. Steps 10 to 50. Corner gap 2 to 16 px. |
| Improves | R4, R8, R6, R5 |
| Risks | R1, R3, R14 |
| Screen | On `mid-clustered`, after `corner`: keep it if R6 and R4 fall by 10% and R1 does not rise. |
| Depends on placement | yes |
| Sources | [Dwyer 2006b][dwyer06r], [Gansner 2004][gansner04] |
| Related | [RULE-009](#rule-009), [RULE-011](#rule-011), [RULE-050](#rule-050) |

### RULE-009

**Separation constraints: the QP that nudges parallel segments.** Kind: `literature`. Step: `router`. Prototype: S.

The router keeps the order of the parallel segments in a channel. A quadratic program then places them. It keeps each segment near the channel middle and each pair at least a gap apart. VPSC solves each axis. The fixed order makes the problem convex.

| Field | Value |
|---|---|
| Math | `min Σ w_i (x_i - c_i)² subject to x_j - x_i ≥ g for each ordered pair, lo ≤ x_i ≤ hi. VPSC in O(s log s) for each axis` |
| Rules it expresses | A gap between lanes, centered lanes, the bounds of a channel, alignment by equal constraints. |
| Hard rules | Exact. The channel bounds are the box walls minus the clearance. A channel too narrow for its lanes keeps the base route. |
| Zoom levels | `convex`. The same order gives a small move for a small change. |
| Cost | `O(s log s)` for each channel of s segments. 100 nodes: 3 ms. 1000 nodes: 40 ms. |
| Options | Gap 2 to 12 px. Weight of the middle against the plug side 0 to 1. Equal spacing on or off. |
| Improves | R12, R8, B9, R11 |
| Risks | R6, M1 |
| Screen | On `mid-hubs` and `case-dense-groups`: keep it if each channel wide enough has each gap at `g` or more, with R1 unchanged. |
| Depends on placement | yes |
| Sources | [Dwyer 2006][dwyer06], [WebCoLa 2014][webcola], [Wybrow 2009][wybrow09] |
| Related | [RULE-050](#rule-050), [RULE-052](#rule-052), HWY-016 |

### RULE-010

**Kamada-Kawai on the skeleton of the hubs.** Kind: `hybrid`. Step: `highway`. Prototype: M.

The highways form a small graph, with the hubs and the junctions as its nodes. Kamada-Kawai places the free junctions so that their distances match the path lengths of the box graph. The boxes stay fixed and push the junctions out by a barrier.

| Field | Value |
|---|---|
| Math | `E = Σ_{i<j} ½ k_ij (‖p_i - p_j‖ - ℓ d_ij)², k_ij = K / d_ij², Newton steps on one node at a time, barrier -ln(φ(p_i))` |
| Rules it expresses | Junction spacing, balanced hubs, distances that follow the graph. |
| Hard rules | `barrier` at each junction, then the routes go through the corner graph. |
| Zoom levels | `anchor`. Each level places its own hubs near the hubs of its parent. |
| Cost | `O(I·h²)` for h hubs. 100 nodes: 1 ms. 1000 nodes: 30 ms. |
| Options | K 1. ℓ unit length 0.5 to 2 u. Steps 20 to 200. Anchor weight μ 0 to 10. |
| Improves | B6, B3, R5, Z7 |
| Risks | B7, R6 |
| Screen | On `case-hub-chain` and `mid-hubs` with `sections`: keep it if B3 falls by 10% and Z7 does not rise. |
| Depends on placement | yes |
| Sources | [Kamada 1989][kamada89] |
| Related | [RULE-045](#rule-045), HWY-043, HWY-041 |

### RULE-011

**Moves that keep the topology (PrEd, ImPrEd).** Kind: `hybrid`. Step: `router`. Prototype: M.

PrEd and ImPrEd move the points with any forces, but they limit each move so that no point crosses a segment. A route then keeps its way around the boxes and its crossings. Any force rule becomes safe: no move adds a box crossing or a route crossing.

| Field | Value |
|---|---|
| Math | `For each point and each of 8 direction sectors: max move = ½ · distance to the nearest segment in that sector. Move = force clipped to that bound` |
| Rules it expresses | Any force rule. The limit keeps the crossing count and the side of each box. |
| Hard rules | `guard` by construction. A point does not cross a box edge at any time. |
| Zoom levels | The warm start fixes the topology, so the order of the routes does not change between levels. |
| Cost | `O(I·V·k)`. 100 nodes: 15 ms. 1000 nodes: 250 ms. |
| Options | Sectors 8. Steps 20 to 200. The set of forces. |
| Improves | R9, R1, Z8, R8 |
| Risks | R6 |
| Screen | As a wrapper of RULE-001 and RULE-003: keep it if R9 and the new crossings are 0 in each run, at 2 times the time or less. |
| Depends on placement | yes |
| Sources | [Bertault 2000][bertault00], [Simonetto 2011][simonetto11], [Dwyer 2009][dwyer09t] |
| Related | [RULE-001](#rule-001), [RULE-003](#rule-003), [RULE-046](#rule-046), [RULE-050](#rule-050) |

## Constraint solvers

A constraint solver takes the rules as equations, inequalities or clauses, and an objective. It obeys the hard rules exactly, and it says when no answer exists. Its cost is the problem: the convex programs are fast, and the integer programs are exact only on small boards.

### RULE-012

**Cassowary: rules with strengths.** Kind: `literature`. Step: `router`. Prototype: M.

Cassowary solves linear equations and inequalities with strengths: `required`, `strong`, `medium` and `weak`. The router writes the coordinate of each leg as a variable. A stronger rule wins over all weaker rules together. A small edit solves again fast.

| Field | Value |
|---|---|
| Math | `Simplex with a lexicographic objective over the strengths. Examples: x_leg ≥ box.right + gap (required), x_leg = x_other (strong), x_leg = mid (weak)` |
| Rules it expresses | Alignment, equal spacing, order, a distance to a box, centered legs. |
| Hard rules | The `required` constraints hold the hard rules for the leg coordinates. |
| Zoom levels | Each level solves again from the basis of its parent, so a small edit gives a small change. |
| Cost | `O(c)` for an incremental edit, `O(c²)` at worst for c constraints. 100 nodes: 10 ms. 1000 nodes: 300 ms. |
| Options | A strength for each rule. Gap 2 to 12 px. |
| Improves | R14, R12, R11, Z10 |
| Risks | R6 |
| Screen | On `grid-400` and `mid-uniform`, orthogonal routes: keep it if the `required` rows give 0 hard faults and the aligned legs rise by 30%, with R6 unchanged. |
| Depends on placement | yes |
| Sources | [Badros 2001][badros01] |
| Related | [RULE-009](#rule-009), [RULE-017](#rule-017), [RULE-052](#rule-052) |

### RULE-013

**Integer program for orthogonal routing: the exact reference.** Kind: `literature`. Step: `router`. Prototype: L.

The orthogonal visibility graph holds the candidate segments. A multi-commodity flow program picks one path for each edge. The objective sums length, bends and crossings with weights. On small boards the solver proves the best answer, which MEAS2 needs.

| Field | Value |
|---|---|
| Math | `min Σ_e Σ_a c_a y_ea + β Σ bends + γ Σ z, flow conservation for each edge, z ≥ y_ea + y_fb - 1 for each crossing pair of arcs` |
| Rules it expresses | Any linear rule: length, bends, crossings, capacity, forbidden arcs. |
| Hard rules | Exact. Only the free arcs exist. |
| Zoom levels | A penalty Σ ‖y - y_parent‖ for a change from the parent level. |
| Cost | NP-hard. Boards of 20 edges or fewer take seconds. Not for 1000 nodes. |
| Options | Weights β, γ. Time limit 1 to 60 s. Optimality gap 0 to 5%. |
| Improves | R1, R3, R4, R6 |
| Risks | none |
| Screen | On 30 boards of 8 to 15 edges, in CI: keep it if it proves the optimum on 80% or more, in 10 s or less each. |
| Depends on placement | yes |
| Sources | [Wybrow 2009][wybrow09], [Marriott 2014][marriott14], [OR-Tools 2024][ortools] |
| Related | [RULE-015](#rule-015), [RULE-043](#rule-043), HWY-040 |

### RULE-014

**Minimum cost flow for the fewest bends.** Kind: `literature`. Step: `router`. Prototype: L.

For a fixed embedding, Tamassia gets the bends of an orthogonal drawing from a minimum cost flow. Each unit of flow is a turn of 90 degrees. The flow gives the fewest bends that the angles permit. For routes among boxes, the faces come from the fixed boxes and the route order.

| Field | Value |
|---|---|
| Math | `Network: each vertex supplies 4, each inner face takes 2·deg(f) - 4, the outer face takes 2·deg(f) + 4. Each arc costs 1 for each bend` |
| Rules it expresses | Fewest bends, fixed angles at the plugs, orthogonal segments. |
| Hard rules | The embedding comes from a guarded route, so the shape keeps it. |
| Zoom levels | The parent level fixes the embedding, so the shape is stable. |
| Cost | `O(n^1.75 √log n)`. 100 nodes: 10 ms. 1000 nodes: 400 ms, plus the planarization of the routes. |
| Options | Bend cost 1. The angles that are fixed. |
| Improves | R3, R14 |
| Risks | R6, R8 |
| Screen | On `grid-400`, after `corner`: keep it if R3 falls by 15% at the same topology. |
| Depends on placement | yes |
| Sources | [Tamassia 1987][tamassia87] |
| Related | [RULE-050](#rule-050), [RULE-013](#rule-013) |

### RULE-015

**SAT and CP-SAT on a grid of cells.** Kind: `literature`. Step: `router`. Prototype: L.

Each pair of a grid cell and an edge has a Boolean variable. The clauses say that each edge forms one connected path, each cell holds at most c lanes, and a box cell holds none. A SAT or CP-SAT solver finds a legal set, then lowers length and bends.

| Field | Value |
|---|---|
| Math | `x_ec ∈ {0,1}, Σ_e x_ec ≤ cap(c), a path cell has 2 neighbors on the path and an end cell has 1, connectivity by lazy cuts` |
| Rules it expresses | Capacity, forbidden areas, parity, any Boolean rule. |
| Hard rules | Exact. |
| Zoom levels | The solution of the parent level gives the hints of the solver. |
| Cost | NP-hard. A grid of 100 by 100 cells with 20 edges solves in seconds. |
| Options | Cell 4 to 16 px. Capacity 1 to 4. Time limit 1 to 60 s. |
| Improves | R9, R12, R1 |
| Risks | R4 |
| Screen | On tight boards (`packedGridBoard`, 16 boxes): keep it if it routes each edge where `corner` with room fails, in 10 s or less. |
| Depends on placement | yes |
| Sources | [Nam 2002][nam02], [OR-Tools 2024][ortools] |
| Related | [RULE-013](#rule-013), [RULE-037](#rule-037), [RULE-018](#rule-018) |

### RULE-016

**Octilinear highways by a mixed integer program.** Kind: `literature`. Step: `highway`. Prototype: L.

Nöllenburg and Wolff draw metro maps with a mixed integer program. Each edge takes one of eight directions, keeps its order at each station and has a minimum length. Bends cost. On the skeleton of the highways, the trunks become octilinear lines, as on a transit map.

| Field | Value |
|---|---|
| Math | `A binary for each edge and each of 8 sectors, big-M relations between x_v - x_u and the sector, circular order constraints. Objective: bends + relative position + length` |
| Rules it expresses | Octilinear trunks, the order of the trunks, a minimum length, few bends, the relative position of the hubs. |
| Hard rules | The boxes are fixed vertices with clearance constraints. Planarity cuts enter lazily. |
| Zoom levels | Each level adds a term for the relative position to its parent. |
| Cost | MIP. A skeleton of 100 edges or fewer takes minutes. |
| Options | Weights of the three terms. Minimum length 1 to 4 u. Time limit. |
| Improves | R14, B6, R3, M2 |
| Risks | R6, M3 |
| Screen | On the skeleton of `mid-hubs` (60 trunk edges or fewer), in CI: keep it if it solves in 60 s or less with R14 = 1 and B3 up by 10% or less. |
| Depends on placement | yes |
| Sources | [Nöllenburg 2011][nollenburg11] |
| Related | [RULE-004](#rule-004), [RULE-052](#rule-052), HWY-016 |

### RULE-017

**Layers of rules in priority order.** Kind: `ours`. Step: `whole`. Prototype: M.

The rules sit in layers: the hard rules first, then each group of soft rules in priority order. Each layer optimizes its terms, then holds its value within a slack while the next layers run. The user orders the rules and gives no weights.

| Field | Value |
|---|---|
| Math | `For k = 1..L: f_k* = min f_k(x) subject to f_j(x) ≤ (1 + ε_j) f_j* for each j < k, with the hard rules as layer 0` |
| Rules it expresses | Any rule. The layers express priority, not a weight. |
| Hard rules | Layer 0 holds the hard rules as constraints. |
| Zoom levels | The same layers run at each level. An option puts the stability term of RULE-045 in the first soft layer. |
| Cost | L times the inner solver. |
| Options | The order of the layers. Slack ε 0 to 0.2. |
| Improves | R1, R6 |
| Risks | R8, C3 |
| Screen | With RULE-019 inside, on `mid-clustered`: keep it if the first measure stays within ε of its own optimum and the second beats the weighted sum. |
| Depends on placement | no |
| Sources | [Marler 2004][marler04] |
| Related | [RULE-012](#rule-012), [RULE-019](#rule-019), [RULE-038](#rule-038) |

### RULE-018

**Wave function collapse with tiles of routes.** Kind: `hybrid`. Step: `router`. Prototype: M.

The board becomes a grid of tiles: empty, straight, corner, cross, merge and box. Adjacency rules tell which tiles can touch. The solver fixes the cell with the least entropy and spreads the rules. Routes and highways appear as a pattern of tiles that obeys the rules.

| Field | Value |
|---|---|
| Math | `Arc consistency over the cells, each with a domain of tiles. Pick the cell of least entropy with a seeded random number generator. Backtrack on a contradiction` |
| Rules it expresses | Local rules of adjacency: no tee next to a box, merges only on lanes, a style of tiles. |
| Hard rules | Box cells and plug cells are fixed. A path check for each edge adds the global rule that each edge connects. |
| Zoom levels | The coarse tiles constrain the fine tiles. |
| Cost | `O(G·T)` for each spread, plus restarts. 100 nodes: 50 ms. 1000 nodes: 2 s. |
| Options | The tile set. Tile weights. Seed. Backtrack limit 100 to 10 000. |
| Improves | R14, R3 |
| Risks | R6, R7, Z1 |
| Screen | On `grid-400`: keep it if each edge connects in 3 restarts or fewer with R14 = 1. |
| Depends on placement | yes |
| Sources | [Gumin 2016][gumin16], [Karth 2017][karth17] |
| Related | [RULE-015](#rule-015), [RULE-032](#rule-032), [RULE-034](#rule-034) |

## Energy and optimization

An energy method sums one term for each rule and descends the sum. [Ahmed 2020][ahmed20] showed that this works for many layout criteria at once. The method is general: a new rule is a new term. Its weak points are the weights and the local minima. [RULE-017](#rule-017), [RULE-038](#rule-038) and [RULE-048](#rule-048) attack those.

### RULE-019

**Energy as a sum of rule terms, by gradient descent.** Kind: `hybrid`. Step: `router`. Prototype: M.

Each rule becomes a smooth term: a crossing angle, a clearance or a length. The energy is the weighted sum. Gradient descent moves all route points at once. (GD)² showed this for node layouts. Here the variables are the route points, and the boxes are fixed.

| Field | Value |
|---|---|
| Math | `E(x) = Σ_r w_r E_r(x), x ← x - η ∇E. Smooth forms: clearance softplus(d0 - φ)², crossing angle cos²θ, length Σ ‖x_{i+1} - x_i‖²` |
| Rules it expresses | Any rule with a smooth form or a smooth substitute. |
| Hard rules | `barrier` for the boxes, then RULE-046. |
| Zoom levels | `anchor` and `warm`. |
| Cost | `O(I·(V + P))` for P pairs. 100 nodes: 50 ms. 1000 nodes: 1 s with a grid for the pairs. |
| Options | A weight for each rule. Step η. Steps 100 to 1000. Sharpness of the smooth forms. |
| Improves | R1, R2, R8, C3 |
| Risks | R9, R6 |
| Screen | On `mid-clustered`: keep it if its front over R1, R6 and R8 has a point that `corner` with RULE-001 does not dominate. |
| Depends on placement | yes |
| Sources | [Ahmed 2020][ahmed20], [Ye 2020][ye20] |
| Related | [RULE-020](#rule-020), [RULE-027](#rule-027), [RULE-036](#rule-036), [RULE-046](#rule-046) |

### RULE-020

**Adam with a seeded sample of pairs.** Kind: `hybrid`. Step: `router`. Prototype: S.

Pair terms of route against route cost O(V²). Adam with a seeded sample of pairs makes each step O(V). The step size falls on a schedule, as in the SGD layouts of stress. A fixed seed and a fixed order keep the result the same each time.

| Field | Value |
|---|---|
| Math | `m ← β1 m + (1 - β1) g, v ← β2 v + (1 - β2) g², x ← x - η_t m̂ / (√v̂ + ε), η_t = η0 e^{-λt}, g from a seeded sample of pairs` |
| Rules it expresses | The same rules as RULE-019. |
| Hard rules | The same as RULE-019. |
| Zoom levels | `anchor`. |
| Cost | `O(I·V·s)` for s samples of each point. 100 nodes: 30 ms. 1000 nodes: 400 ms. |
| Options | Η0 0.01 to 1. Β1 0.9, β2 0.999. Samples 4 to 32. Seed. Steps 100 to 2000. |
| Improves | R1, R2, R8 |
| Risks | Z10, R6 |
| Screen | Against RULE-019 at the same time: keep it if it reaches the energy of RULE-019 in a third of the time or less at 1000 nodes. |
| Depends on placement | yes |
| Sources | [Kingma 2015][kingma15], [Ahmed 2022][ahmed22], [Zheng 2019][zheng18] |
| Related | [RULE-019](#rule-019) |

### RULE-021

**Simulated annealing over candidate routes.** Kind: `hybrid`. Step: `router`. Prototype: S.

Each edge gets k candidate routes from the base router: the shortest, a detour on each side and a route along each near highway. Annealing changes the choice of one edge at a time. It accepts a worse total with a probability that falls with the temperature.

| Field | Value |
|---|---|
| Math | `P(accept) = exp(-ΔE / T), T_k = T0 α^k. ΔE is local: the crossings of one edge come from a grid of segments` |
| Rules it expresses | Any rule, also discrete rules: crossing counts, highway membership, lane capacity. |
| Hard rules | `guard`. Each candidate obeys the hard rules. |
| Zoom levels | `hysteresis`. The start state is the choice of the parent level, and a change costs. |
| Cost | `O(S·k_n)` for S changes and k_n segments near an edge. 100 nodes: 100 ms. 1000 nodes: 2 s. |
| Options | K candidates 3 to 8. T0. Α 0.9 to 0.99. Changes per edge 20 to 200. Seed. |
| Improves | R1, R12, B1, R5 |
| Risks | R6, Z10 |
| Screen | On `mid-clustered` and `mid-hubs`: keep it if R1 falls by 15% against the first choice, at the same R6. |
| Depends on placement | yes |
| Sources | [Davidson 1996][davidson96] |
| Related | [RULE-044](#rule-044), [RULE-025](#rule-025), HWY-045, HWY-059 |

### RULE-022

**Position-based dynamics: one rule at a time (XPBD).** Kind: `hybrid`. Step: `router`. Prototype: S.

Position-based dynamics treats each rule as a constraint. Gauss-Seidel moves the points onto one constraint at a time. XPBD gives each rule a compliance, so a soft rule gives way and a hard rule does not. Games use it because it is stable at any step size.

| Field | Value |
|---|---|
| Math | `Δλ = (-C(x) - α̃ λ) / (∇C M⁻¹ ∇Cᵀ + α̃), Δx = M⁻¹ ∇Cᵀ Δλ, α̃ = α / Δt². Constraints: segment length, φ(x) ≥ d0 with α = 0, bend angle, lane gap` |
| Rules it expresses | Lengths, distances, angles, alignment: each local rule. |
| Hard rules | Compliance 0 for the boxes, a final pass, then RULE-046. The plugs have infinite mass. |
| Zoom levels | `anchor` as a soft constraint to the place at the parent level. |
| Cost | `O(I·C)` for C constraints. 100 nodes: 10 ms. 1000 nodes: 150 ms. |
| Options | Iterations 5 to 50. Substeps 1 to 8. Compliance of each rule 0 to 0.01. A fixed order of the constraints. |
| Improves | R8, R12, C5, R14 |
| Risks | R6, R1 |
| Screen | On `mid-clustered` and `case-dense-groups`, against RULE-001: keep it if it gets the same R8 in half the time, with R9 = 0. |
| Depends on placement | yes |
| Sources | [Müller 2007][muller07], [Macklin 2016][macklin16] |
| Related | [RULE-001](#rule-001), [RULE-023](#rule-023), [RULE-046](#rule-046), [RULE-036](#rule-036) |

### RULE-023

**Barrier and continuous collision checks (IPC).** Kind: `hybrid`. Step: `router`. Prototype: M.

Incremental potential contact adds a log barrier that goes to infinity when a route point nears a box. A continuous collision check limits each line search. So each step stays free of boxes, not only the last step.

| Field | Value |
|---|---|
| Math | `b(d) = -(d - d̂)² ln(d / d̂) for d < d̂, else 0. Step ≤ 0.8 · the time of first contact from the collision check` |
| Rules it expresses | Clearance as a barrier, with any smooth energy. |
| Hard rules | `barrier`. Each step is legal. |
| Zoom levels | `anchor`. |
| Cost | `O(I·V·k)` plus the collision checks. 100 nodes: 40 ms. 1000 nodes: 800 ms. |
| Options | D̂ 1 to 8 px. Barrier weight κ. Newton steps 5 to 30. |
| Improves | R9, R8, C7 |
| Risks | R6 |
| Screen | With the energy of RULE-019 on `mid-clustered`: keep it if R9 = 0 at each step, at 2 times the time of RULE-019 or less. |
| Depends on placement | yes |
| Sources | [Li 2020b][li20ipc] |
| Related | [RULE-019](#rule-019), [RULE-022](#rule-022), [RULE-046](#rule-046) |

### RULE-024

**Multigrid over the zoom levels.** Kind: `hybrid`. Step: `levels`. Prototype: M.

The zoom levels form a hierarchy of grids. The far level solves the rule energy on its few links first. Each finer level starts from the coarse answer and smooths it. A V-cycle sends the fine errors back up, so the levels agree.

| Field | Value |
|---|---|
| Math | `Restriction R and prolongation P. V-cycle: ν1 smooth steps on the fine level, restrict the residual, solve the coarse level, x_f ← x_f + P e_c, ν2 smooth steps` |
| Rules it expresses | The same energy at each level. |
| Hard rules | `project` at each level. |
| Zoom levels | Native. The coarse-to-fine order gives agreement between levels. |
| Cost | `O(V)` for each cycle. 100 nodes: 20 ms. 1000 nodes: 200 ms. |
| Options | Ν1, ν2 1 to 3. Cycles 1 to 5. Prolongation: linear or along the lanes. |
| Improves | Z9, Z10, Z7 |
| Risks | R6 |
| Screen | On `nestedGridBoard` and `mid-clustered`: keep it if Z10 falls by 30% against levels solved alone, at the same energy. |
| Depends on placement | yes |
| Sources | [Briggs 2000][briggs00], [Walshaw 2003][walshaw03], [Hu 2005][hu05] |
| Related | [RULE-045](#rule-045), [RULE-031](#rule-031), HWY-052 |

### RULE-025

**Prices for rules that couple edges (dual ascent, ADMM).** Kind: `hybrid`. Step: `router`. Prototype: M.

A hard rule that couples edges gets a price, for example the capacity of a gap. Each edge routes alone with the prices as costs. A price rises where its rule fails and falls where it holds. This is negotiated routing, written as dual ascent.

| Field | Value |
|---|---|
| Math | `L = Σ_e c(P_e) + Σ_g λ_g (use_g - cap_g), λ_g ← max(0, λ_g + ρ (use_g - cap_g))` |
| Rules it expresses | Capacity, crowding, each rule that couples edges. |
| Hard rules | `guard`. The search of each edge uses the corner graph. |
| Zoom levels | `warm`. The prices of the parent level start each level. |
| Cost | `O(K·m·A)` for K rounds and the A* time A. 100 nodes: 200 ms. 1000 nodes: 5 s. |
| Options | Ρ 0.1 to 2. Rounds 5 to 30. History factor 0 to 1. |
| Improves | R12, R1, R8, M4 |
| Risks | R6, R5 |
| Screen | On `case-dense-groups` and `packedGridBoard`: keep it if the lanes over capacity fall to 0 in 10 rounds or fewer, with R6 up by 10% or less. |
| Depends on placement | yes |
| Sources | [Boyd 2011][boyd11], [McMurchie 1995][mcmurchie95] |
| Related | [RULE-044](#rule-044), HWY-044, HWY-039 |

### RULE-026

**Motion planners: CHOMP and TrajOpt.** Kind: `literature`. Step: `router`. Prototype: M.

Robot motion planners treat a path as one vector. CHOMP descends a smoothness term and an obstacle term with a gradient that spreads each update along the path. TrajOpt solves a series of convex programs with a hinge on the signed distance.

| Field | Value |
|---|---|
| Math | `CHOMP: x ← x - η A⁻¹ ∇U, A = KᵀK the finite difference metric. TrajOpt: Σ max(0, d0 - sd(x_i)) inside a trust region` |
| Rules it expresses | Smoothness, clearance, length. |
| Hard rules | The TrajOpt penalty rises until each point is legal, then RULE-046. |
| Zoom levels | `anchor`. |
| Cost | CHOMP `O(I·V)` with a banded solve. 100 nodes: 30 ms. 1000 nodes: 500 ms. |
| Options | Η. Smoothness weight. D0. Trust region. |
| Improves | C3, C4, R8 |
| Risks | R6, R1 |
| Screen | Against RULE-001 on the same boards: keep it if C3 is 20% lower at the same R8. |
| Depends on placement | yes |
| Sources | [Ratliff 2009][ratliff09], [Schulman 2014][schulman14] |
| Related | [RULE-001](#rule-001), [RULE-007](#rule-007), [RULE-023](#rule-023) |

## Image space

An image method renders the drawing and measures the image. A soft or differentiable rasterizer ([Li 2020][li20diffvg]) gives the gradient of the measure for each route point. Its cost depends on the size of the image, not on the count of the edges. It is the natural home of the rules that people see, for example clutter and density.

### RULE-027

**Differentiable raster loss.** Kind: `hybrid`. Step: `whole`. Prototype: M.

A differentiable rasterizer draws the routes into an image of R by R pixels. The losses read the image: ink over a cap, ink over boxes and gaps under a minimum width. Their gradients flow back to the route points. One pass costs the same for 10 edges or 10 000.

| Field | Value |
|---|---|
| Math | `I(p) = Σ_s k(dist(p, s) / w), L = Σ_p max(0, I(p) - ρ_max)² + λ Σ_p I(p) M_box(p), gradients by DiffVG or a soft kernel` |
| Rules it expresses | Density, clutter, ink over boxes, white space, any rule that reads an image. |
| Hard rules | The box term is soft, so `project` and RULE-046. |
| Zoom levels | Each level renders at its own scale, so each zoom gets its own loss. |
| Cost | `O(R² + V·k)`. 100 nodes: 30 ms at 256². 1000 nodes: 80 ms. |
| Options | R 128 to 512. Kernel width 1 to 4 px. Ρ_max. Λ. |
| Improves | R12, B7, R8, R9 |
| Risks | R1, C9 |
| Screen | On `mid-clustered` and `large-clustered`: keep it if the peak density falls by 30% with R6 up by 10% or less. |
| Depends on placement | yes |
| Sources | [Li 2020][li20diffvg] |
| Related | [RULE-028](#rule-028), [RULE-029](#rule-029), [RULE-031](#rule-031), HWY-006 |

### RULE-028

**Density bundling with a mask of the free space.** Kind: `hybrid`. Step: `highway`. Prototype: S.

KDEEB moves each route point up the gradient of the density of all routes. Routes gather into ridges, and the ridges become highways. The rule version multiplies the density by a mask of the free space, so no ridge forms over a box.

| Field | Value |
|---|---|
| Math | `ρ = K_h * Σ δ(x_i) by splat and blur, x_i ← x_i + η ∇ρ / ‖∇ρ‖, mask ρ · [φ > d0], then smooth along the route` |
| Rules it expresses | Ink, bundles, free space. |
| Hard rules | `project`, then RULE-046. |
| Zoom levels | The kernel width h grows with the level, so the ridges nest. |
| Cost | `O(I·(R² + V))`. 100 nodes: 40 ms. 1000 nodes: 150 ms. |
| Options | H 8 to 64 px. Steps 5 to 20. R 128 to 512. Η. |
| Improves | B1, B2, B7 |
| Risks | B4, R6, R9 |
| Screen | On `mid-clustered` against `shared`: keep it if B1 is equal or better with R9 = 0 after the projection. |
| Depends on placement | yes |
| Sources | [Hurter 2012][hurter12], [van der Zwan 2016][zwan16] |
| Related | HWY-006, HWY-007, [RULE-027](#rule-027) |

### RULE-029

**Clutter measure as a loss.** Kind: `hybrid`. Step: `whole`. Prototype: M.

Feature congestion measures clutter from the local spread of color, direction and contrast. This rule takes the direction part: many route directions in one area show as clutter. The loss lowers that spread, so near routes turn parallel or cross at right angles.

| Field | Value |
|---|---|
| Math | `T(p) = K * Σ_s w_s (cos 2θ_s, sin 2θ_s), clutter(p) = 1 - ‖T(p)‖ / Σ w_s, L = Σ_p clutter(p), gradients through the soft raster` |
| Rules it expresses | Visual order, alignment to the flow, right-angle crossings. |
| Hard rules | `project`, then RULE-046. |
| Zoom levels | Each level has its own resolution. |
| Cost | The same as RULE-027. |
| Options | Window 8 to 32 px. R. Weight. |
| Improves | R2, R12, R5 |
| Risks | R6, R1 |
| Screen | On `mid-uniform` and `mid-clustered`: keep it if the clutter falls by 20% and R2 rises. |
| Depends on placement | yes |
| Sources | [Rosenholtz 2007][rosenholtz07], [Li 2020][li20diffvg] |
| Related | [RULE-027](#rule-027), [RULE-049](#rule-049) |

### RULE-030

**Medial axis of the free space as the highway line.** Kind: `hybrid`. Step: `highway`. Prototype: M.

The medial axis of the free space holds the points at equal distance from two boxes. It is the line of the most clearance. This rule pulls the trunks of the highways onto the axis and prunes its short branches. Skeleton bundling does the same with the density of the routes.

| Field | Value |
|---|---|
| Math | `Skeleton from the ridges of the distance transform, pruned by branch length. Pull k ∇dist(x, axis) on the trunk points` |
| Rules it expresses | Clearance, lanes in the middle of gaps, highways in the gaps. |
| Hard rules | The axis is in the free space by definition. |
| Zoom levels | The prune length grows with the level, so the skeletons nest. |
| Cost | `O(G)` for the transform and the skeleton. 100 nodes: 20 ms. 1000 nodes: 100 ms. |
| Options | Prune length 1 to 4 u. Cell 2 to 8 px. Pull k. |
| Improves | R8, C7, B7 |
| Risks | R6, B3 |
| Screen | On `packedGridBoard` and `case-dense-groups`: keep it if the trunk R8 doubles with B3 up by 10% or less. |
| Depends on placement | yes |
| Sources | [Ersoy 2011][ersoy11], [Felzenszwalb 2012][felzenszwalb12] |
| Related | HWY-009, [RULE-047](#rule-047), [RULE-006](#rule-006) |

### RULE-031

**One render loss summed over the zoom levels.** Kind: `ours`. Step: `levels`. Prototype: M.

One route set serves each zoom level. This loss renders the drawing at the scale of each level and sums the image losses with weights. A route that reads well near and far wins. One trade replaces a separate tune for each level.

| Field | Value |
|---|---|
| Math | `L = Σ_ℓ ω_ℓ L_img(render(x, s_ℓ)), with s_ℓ the scale of level ℓ and the line width fixed in screen pixels` |
| Rules it expresses | Legibility at each zoom. |
| Hard rules | `project`, then RULE-046. |
| Zoom levels | Native. One geometry serves all levels. |
| Cost | The number of levels times RULE-027. 100 nodes: 100 ms. 1000 nodes: 250 ms. |
| Options | A weight ω for each level. The scales. |
| Improves | Z10, Z9, R12 |
| Risks | R6 |
| Screen | On `nestedGridBoard`: keep it if the worst level loss falls by 20% and Z10 is better than levels solved alone. |
| Depends on placement | yes |
| Sources | [Li 2020][li20diffvg] |
| Related | [RULE-027](#rule-027), [RULE-024](#rule-024) |

## Grid rules and rule languages

A grid method puts local rules on cells or on parts of routes. Some are classic routers ([Lee 1961][lee61]), and some come from games and plants. The last two ideas let a user write the rules as data.

### RULE-032

**Wavefront automaton with rule costs (Lee).** Kind: `literature`. Step: `router`. Prototype: S.

A cellular automaton spreads a wave from the source cell. Each cell takes the minimum of its neighbors plus a cost. The cost table holds the rules: a turn costs, a cell near a box costs, a cell on a highway costs less. The trace back gives the route.

| Field | Value |
|---|---|
| Math | `T(c, d) = min over neighbors n of T(n, d') + w(c) + τ [d ≠ d'], state = cell and direction, buckets for small integer costs` |
| Rules it expresses | Bends, clearance, highway preference, forbidden cells, rules of direction. |
| Hard rules | `guard`. A box cell does not enter the wave. |
| Zoom levels | The route of the coarse grid limits the fine search to a corridor. |
| Cost | `O(4G)` for each edge. 100 nodes: 0.3 s. 1000 nodes: 5 s, so a corridor is necessary. |
| Options | Cell 2 to 8 px. Turn cost τ. Near-box cost. Highway discount. |
| Improves | R3, R8, R14, B2 |
| Risks | R6, R12 |
| Screen | On `grid-400`: keep it if R3 is equal to `corner` or lower, with R9 = 0, in 2 times the time or less. |
| Depends on placement | yes |
| Sources | [Lee 1961][lee61] |
| Related | [RULE-033](#rule-033), [RULE-044](#rule-044), [RULE-006](#rule-006) |

### RULE-033

**Sandpile automaton for the capacity of gaps.** Kind: `ours`. Step: `room`. Prototype: S.

Each cell of a gap holds lanes like grains of sand. A cell over its capacity topples and sends one lane to each free neighbor. The abelian property makes the final state the same for each order of topples. So the spread of the lanes needs no seed.

| Field | Value |
|---|---|
| Math | `If h(c) ≥ cap(c): h(c) -= deg(c), and h(n) += 1 for each free neighbor n. The stable state is unique (Dhar)` |
| Rules it expresses | Capacity of a gap, an even spread of crowded lanes. |
| Hard rules | Box cells are walls, so no lane goes into a box. The routes then follow the cells that they get. |
| Zoom levels | Each level has its own capacity. The state of the parent level adds as grains. |
| Cost | `O(G·t)` for t topples. 100 nodes: 5 ms. 1000 nodes: 50 ms. |
| Options | Capacity of each cell 1 to 4. Neighbors 4 or 8. |
| Improves | R12, M4, R8 |
| Risks | R6, R4 |
| Screen | On the gaps of `case-dense-groups`: keep it if each cell holds its capacity or less and R12 rises by 20%. |
| Depends on placement | yes |
| Sources | [Dhar 1990][dhar90] |
| Related | [RULE-025](#rule-025), [RULE-009](#rule-009), HWY-051 |

### RULE-034

**Shape grammar: rewrite rules on parts of routes.** Kind: `hybrid`. Step: `router`. Prototype: S.

A shape grammar holds rewrite rules on parts of routes. A jog of two short legs becomes one leg. A turn back becomes a detour around a corner. Two parallel routes become a lane pair. A rule applies only when its result obeys the hard rules.

| Field | Value |
|---|---|
| Math | `Rules L → R with a guard g(R), applied in a fixed priority order to a fixed point. Critical pairs check that the order does not change the result` |
| Rules it expresses | Local style rules and simplifications. |
| Hard rules | `guard`. Each rewrite checks its result. |
| Zoom levels | A grammar for each level. The coarse levels use the merge rules more. |
| Cost | `O(V·r·p)` for r rules and p passes. 100 nodes: 5 ms. 1000 nodes: 60 ms. |
| Options | The rule set. Priority. Passes 1 to 10. |
| Improves | R3, R7, R15, B2 |
| Risks | R1, R6 |
| Screen | On `mid-clustered` after `corner`: keep it if R3 plus R7 falls by 10% with 0 hard faults. |
| Depends on placement | yes |
| Sources | [Stiny 1972][stiny72] |
| Related | [RULE-036](#rule-036), [RULE-046](#rule-046), [RULE-018](#rule-018) |

### RULE-035

**L-system trees for a fan-out.** Kind: `ours`. Step: `highway`. Prototype: M.

An L-system grows a highway from a hub like a branch. Each step rewrites a trunk symbol into a trunk and branches, with angles and lengths from the rules. A branch stops at its targets or at a box. The grammar fixes the style of a fan-out.

| Field | Value |
|---|---|
| Math | `T → F [+B] F [-B] T with angle δ and length factor r. An open L-system asks φ at each step and stops at a box` |
| Rules it expresses | Branch angles, branch spacing, symmetry. |
| Hard rules | The query of the environment stops growth at a box. RULE-046 repairs the last legs. |
| Zoom levels | Depth d of the derivation is level d, so the trees nest. |
| Cost | `O(b)` for b branches. 100 nodes: 1 ms. 1000 nodes: 10 ms. |
| Options | Δ 15 to 60 degrees. R 0.5 to 0.9. Depth 2 to 6. |
| Improves | B6, H3, R11 |
| Risks | R6, B3, Z1 |
| Screen | On `mid-fanout`: keep it if B6 is in its target band with R6 up by 15% or less against `trunks`. |
| Depends on placement | yes |
| Sources | [Prusinkiewicz 1990][prusinkiewicz90] |
| Related | HWY-017, HWY-037 |

### RULE-036

**A rule language that compiles to energy and constraints.** Kind: `hybrid`. Step: `whole`. Prototype: L.

A user writes rules as data: a selector of routes, segments or boxes, and a term, for example a minimum gap or an equal angle. A compiler turns each rule into an energy term or a constraint. Penrose does this for diagrams. One solver then solves all rules.

| Field | Value |
|---|---|
| Math | `Rule = {select, term, weight or hard}. E = Σ_r w_r Σ_{t ∈ sel_r} f_r(t). Hard rules go to the constraint solver (RULE-022 or RULE-023)` |
| Rules it expresses | Each term of the library. A user adds rules without code. |
| Hard rules | Hard rules compile to constraints, then RULE-046. |
| Zoom levels | The rule set applies at each level. A rule can name a level. |
| Cost | The cost of the solver, plus `O(t)` to evaluate t terms. |
| Options | The rule file. The solver. |
| Improves | R1, R8, R12 |
| Risks | R6 |
| Screen | Write RULE-001, RULE-003 and RULE-049 as rule files: keep it if each compiled run matches the hand-written run within 1% on 3 boards. |
| Depends on placement | yes |
| Sources | [Ye 2020][ye20], [Hoffswell 2018][hoffswell18], [Pollock 2024][pollock24] |
| Related | [RULE-019](#rule-019), [RULE-022](#rule-022), [RULE-017](#rule-017), [RULE-037](#rule-037) |

### RULE-037

**Answer set programs for the discrete choices.** Kind: `hybrid`. Step: `highway`. Prototype: L.

Answer set programming writes discrete rules as logic. An edge joins a highway if its stretch stays under a budget. No gap holds more than c lanes. The clingo solver finds the stable models and lowers the weak constraints. The geometry comes after.

| Field | Value |
|---|---|
| Math | `{ on(E,H) : cand(E,H) } 1 :- edge(E).  :- cap(G,C), #count{E : use(E,G)} > C.  #minimize { W,E : cost(E,W) }.` |
| Rules it expresses | Highway membership, capacity, exclusion, derived rules in the style of Datalog. |
| Hard rules | Integrity constraints. |
| Zoom levels | A rule says that each fine highway sits in its parent highway. |
| Cost | Exponential at worst. Small for 200 edges or fewer in practice. |
| Options | The program. Time limit. |
| Improves | B2, B4, B3 |
| Risks | R6 |
| Screen | On `mid-hubs`: keep it if it finds the best membership in 5 s or less and B3 falls against the rule of `trunks`. |
| Depends on placement | yes |
| Sources | [Gebser 2019][gebser19] |
| Related | [RULE-036](#rule-036), [RULE-015](#rule-015), HWY-045, HWY-048 |

### Where a rule language fits

A rule of the drawing has two parts: what it selects and what it measures. "Each pair of lanes in one gap" is a selection. "The gap between them, minus 4 px, if negative" is a measure. [RULE-036](#rule-036) compiles both into a term of the energy.

A formula engine over collections fits the measure part. Vex (`@mark1russell7/vex`) is one example. Vex evaluates one formula at each record of a collection, and its axes lift the formula to the relations between records. So one Vex program can give:

- the residual of a rule at each route point, segment or box,
- the pair terms through a relation, for example "each two segments in one channel",
- an error value, not an exception, where a rule does not apply,
- an explanation of each value, for the debug view of a rule.

The solver part stays outside: the gradient, the projection and the step. A solver needs the derivative of each term. If Vex has no derivative or Jacobian of a formula, that is a gap to report to Vex through its skill. It is not a reason to hide the term in a host function.

The order of work is: first the solver with hand-written terms ([RULE-022](#rule-022) or [RULE-019](#rule-019)), then the rule format, then the compiler from Vex formulas to terms.

## Learned rules

A learned method takes its rules from examples. This repository uses made-up data only. So each learned idea needs a corpus first: preference pairs from a panel, or the answers of an exact solver on small boards. A learned method stays deterministic only with frozen weights and no sampling at run time.

### RULE-038

**Rule weights from preferences.** Kind: `hybrid`. Step: `whole`. Prototype: M.

People pick the better drawing of each pair. A Bradley-Terry model fits the weights of the rule terms so that the energy ranks the drawings in the same order. The weights then drive the solver. The fit is offline, so the routes stay the same for each run.

| Field | Value |
|---|---|
| Math | `P(a ≻ b) = σ(w · (m_b - m_a)), maximize the log likelihood with an L2 term. m = the vector of MEAS0 values` |
| Rules it expresses | The weights of any rule set. |
| Hard rules | No change. The solver keeps them. |
| Zoom levels | One weight vector for each level, from views of that level. |
| Cost | A logistic fit, under 1 s. No cost at run time. |
| Options | L2 weight. The set of pairs. |
| Improves | R1, R2, B1 |
| Risks | R6 |
| Screen | 200 pairs from a panel on made-up boards: keep it if it agrees with 75% or more of the held-out pairs. |
| Depends on placement | no |
| Sources | [Klammler 2018][klammler18], [Bradley 1952][bradley52] |
| Related | [RULE-017](#rule-017), [RULE-039](#rule-039) |

### RULE-039

**A frozen critic network as a loss.** Kind: `hybrid`. Step: `whole`. Prototype: L.

A small network learns to score drawings from images and pairs of preferences. Then its weights freeze. The critic becomes one term of the energy, and its gradient flows through the raster. A fixed network gives a fixed answer.

| Field | Value |
|---|---|
| Math | `L = L_rules + λ (-critic(render(x))), a small CNN on images of 64² to 256², gradients through DiffVG` |
| Rules it expresses | A learned taste. |
| Hard rules | `project`, then RULE-046. |
| Zoom levels | A render for each level. |
| Cost | 5 ms for each pass on the CPU at 128². 100 nodes: 300 ms. 1000 nodes: 400 ms. |
| Options | Λ. The size of the network. |
| Improves | R2, R12 |
| Risks | R1, R6, R8 |
| Screen | Keep it if the critic score rises and no MEAS0 measure gets worse by more than 5%. |
| Depends on placement | yes |
| Sources | [Haleem 2019][haleem19], [Klammler 2018][klammler18] |
| Related | [RULE-027](#rule-027), [RULE-038](#rule-038) |

### RULE-040

**A graph network that gives a warm start.** Kind: `hybrid`. Step: `router`. Prototype: L.

A graph neural network reads the route points, the boxes and the links between them. It gives a move for each point in one pass. It trains on the rule energy as its loss, as DeepGD trains on stress. At run time it gives the warm start of an exact solver.

| Field | Value |
|---|---|
| Math | `h_i' = φ(h_i, Σ_j ψ(h_i, h_j, e_ij)), output Δx_i, loss E_rules(x + Δx)` |
| Rules it expresses | The rules of the training loss. |
| Hard rules | RULE-046 after the pass. |
| Zoom levels | A pass for each level, with the place at the parent level as a feature. |
| Cost | `O(L·E)` for L layers. 100 nodes: 20 ms. 1000 nodes: 100 ms. Training in CI only. |
| Options | Layers 4 to 12. Width 32 to 128. The training boards. |
| Improves | R1, R8 |
| Risks | R6, R9 |
| Screen | Keep it if it cuts the solver steps by 50% to reach the same energy on held-out fixtures. |
| Depends on placement | yes |
| Sources | [Wang 2021][wang21], [Tiezzi 2024][tiezzi24] |
| Related | [RULE-019](#rule-019), [RULE-043](#rule-043) |

### RULE-041

**A neural time field (NTFields).** Kind: `literature`. Step: `router`. Prototype: L.

NTFields trains a network to give the travel time between two points. The time solves the eikonal equation with a speed that falls near the obstacles. A route is the descent of the time. The network takes the place of a grid solve for each target.

| Field | Value |
|---|---|
| Math | `‖∇_x T(x_s, x)‖ = 1 / S(x), the loss is the residual of this equation, S from φ` |
| Rules it expresses | Clearance through the speed, length. |
| Hard rules | RULE-046 after the descent. |
| Zoom levels | One field for each level. |
| Cost | Training for each board takes seconds to minutes. Queries take 1 ms. |
| Options | The size of the network. Training steps. |
| Improves | R8, C7 |
| Risks | R9, R6 |
| Screen | Keep it if one field trained for a board routes 1000 edges faster than RULE-006 at the same R8. |
| Depends on placement | yes |
| Sources | [Ni 2023][ni23] |
| Related | [RULE-006](#rule-006) |

### RULE-042

**Reinforcement learning distilled into a fixed scorer.** Kind: `hybrid`. Step: `router`. Prototype: L.

A policy learns to order the edges and to choose their candidates. Its reward is the rule energy at the end. A policy that samples gives a new answer each run. So the trained policy distills into a fixed score, and the router takes its best candidate in a fixed order.

| Field | Value |
|---|---|
| Math | `Policy gradient with the reward -E, then a regression fit of the score s(e, cand), then the maximum with a fixed tie break` |
| Rules it expresses | Each rule of the reward. |
| Hard rules | `guard`. Each candidate is legal. |
| Zoom levels | The state holds the choice of the parent level. |
| Cost | Training is large, in CI only. Inference `O(m·k)`. 1000 nodes: 50 ms. |
| Options | Reward weights. Candidates 3 to 8. |
| Improves | R1, B1 |
| Risks | R6, Z10 |
| Screen | Keep it if the distilled score beats RULE-021 at the same time on 3 families. |
| Depends on placement | yes |
| Sources | [Liao 2019][liao19], [Mirhoseini 2021][mirhoseini21] |
| Related | [RULE-021](#rule-021), [RULE-043](#rule-043) |

### RULE-043

**Imitation of the exact solver.** Kind: `ours`. Step: `router`. Prototype: M.

On small boards, the exact program of RULE-013 gives the best routes. A ranker learns which candidate the solver chose for each edge, from features, for example length, bends and crossings. The router then ranks the candidates on large boards.

| Field | Value |
|---|---|
| Math | `Features f(e, cand), a linear or tree ranker with a pairwise loss, the best candidate of each edge in a fixed order` |
| Rules it expresses | The rules of the exact objective. |
| Hard rules | `guard`. Each candidate is legal. |
| Zoom levels | A feature for the choice of the parent level. |
| Cost | Inference `O(m·k)`. 1000 nodes: 50 ms. |
| Options | The features. The model. |
| Improves | R1, R3, R6 |
| Risks | R5 |
| Screen | Keep it if the gap to the optimum on held-out small boards falls by 30% against the first candidate. |
| Depends on placement | yes |
| Sources | [Wybrow 2009][wybrow09] |
| Related | [RULE-013](#rule-013), [RULE-042](#rule-042), [RULE-021](#rule-021) |

## New ideas of this note

These ideas are new for this library, or they join two methods in a new way. Most of them are small and plug into the steps of today.

### RULE-044

**Corner graph with rule prices, then rip-up and reroute.** Kind: `ours`. Step: `router`. Prototype: S.

The corner graph of today prices each arc by its length. This router adds rule prices: a turn, an arc near a box, an arc on a used lane and an arc along a highway. A* routes each edge. Then the worst edges route again with the prices of the others.

| Field | Value |
|---|---|
| Math | `c(a) = ℓ(a) (1 + α [near box] + β use(a) - γ [on highway]) + τ turn(a). Rounds: route all, rank by E_e, remove the top q%, route them again` |
| Rules it expresses | Bends, clearance, crowding, highway preference, each rule on an arc. |
| Hard rules | `guard`. Only free arcs exist. The plugs are fixed. |
| Zoom levels | A discount on the arcs of the routes of the parent level. |
| Cost | `O(R·q·m·A)` for R rounds. 100 nodes: 50 ms. 1000 nodes: 1.5 s. |
| Options | Α, β, γ, τ 0 to 2. Rounds 1 to 5. Q 5% to 30%. |
| Improves | R1, R3, R12, B2 |
| Risks | R6, R5 |
| Screen | On `mid-clustered` and `case-dense-groups`, against `corner`: keep it if R1 and R3 fall by 10% with R6 up by 5% or less and 0 hard faults. |
| Depends on placement | yes |
| Sources | [McMurchie 1995][mcmurchie95], [Wybrow 2009][wybrow09] |
| Related | [RULE-025](#rule-025), [RULE-021](#rule-021), [RULE-032](#rule-032), HWY-005, HWY-039 |

### RULE-045

**Continuation anchor between the zoom levels.** Kind: `ours`. Step: `levels`. Prototype: S.

Each level solves its rules with one more term: the squared distance of each shared route point from its place at the parent level. The weight falls as the levels get finer. Routes then move little between levels. A convex energy gives a bounded move.

| Field | Value |
|---|---|
| Math | `E_ℓ(x) = E_rules(x) + μ_ℓ Σ_i ‖x_i - P(x_{ℓ-1})_i‖², μ_ℓ = μ0 κ^ℓ. For an m-convex E: ‖x*_ℓ - P x*_{ℓ-1}‖ ≤ ‖∇E_rules(P x*_{ℓ-1})‖ / (μ_ℓ + m)` |
| Rules it expresses | Stability between levels. |
| Hard rules | The same as the base solver. |
| Zoom levels | Native. |
| Cost | No extra cost. |
| Options | Μ0 0 to 10. Κ 0.3 to 1. |
| Improves | Z10, Z9, Z7 |
| Risks | R6, R8 |
| Screen | On `nestedGridBoard` and `mid-clustered`: keep it if Z10 falls by 40% with the energy of each level up by 5% or less. |
| Depends on placement | yes |
| Sources | [Briggs 2000][briggs00] |
| Related | [RULE-024](#rule-024), [RULE-031](#rule-031), [RULE-053](#rule-053), HWY-052 |

### RULE-046

**One repair step for the hard rules after any method.** Kind: `ours`. Step: `router`. Prototype: S.

Any soft method can leave a fault. This step repairs each route. It pushes points out of boxes along the distance gradient, snaps the ends to the plug side and tests each segment. A segment that still fails gets a corner graph detour. A route that still fails keeps its base route.

| Field | Value |
|---|---|
| Math | `x ← x + max(0, d0 - φ(x)) ∇φ(x) for k passes. Exact segment-box test. Fallback: local A* between the last good points, then the base route` |
| Rules it expresses | The hard rules `no-pass-through`, `ends-at-plugs`, `link-ends` and `complete`. |
| Hard rules | Exact, because of the fallback to the base route. |
| Zoom levels | It changes only the parts with a fault, so it adds little change between levels. |
| Cost | `O(V + f·A)` for f faults. 100 nodes: 2 ms. 1000 nodes: 20 ms. |
| Options | Passes 1 to 5. D0. The fallback: detour or base route. |
| Improves | R9, Z2, Z3 |
| Risks | R3, C9 |
| Screen | After each soft method: keep it if the hard faults are 0 on 9 fixtures with 5 seeds, and it changes 5% of the points or fewer. |
| Depends on placement | yes |
| Sources | [Felzenszwalb 2012][felzenszwalb12], [Wybrow 2009][wybrow09] |
| Related | [RULE-001](#rule-001), [RULE-019](#rule-019), [RULE-022](#rule-022), [RULE-027](#rule-027) |

### RULE-047

**Pull toward the lane slots of the highway skeleton.** Kind: `ours`. Step: `highway`. Prototype: S.

The highway step gives a skeleton of trunks. Each route point near a trunk gets a pull toward its nearest lane slot. The pull is one rule term, so the solver trades it against detour and clearance. An edge that does not fit stays off the trunk.

| Field | Value |
|---|---|
| Math | `E_h = k Σ_i w(d_i) ‖x_i - slot_i‖², w(d) = max(0, 1 - d / r), slot = trunk point + lane offset` |
| Rules it expresses | Bundles with a lane order. |
| Hard rules | `project`, then RULE-046. |
| Zoom levels | One skeleton for each level. The skeletons nest. |
| Cost | `O(V log T)` for T trunk segments. 100 nodes: 3 ms. 1000 nodes: 30 ms. |
| Options | K. Reach r 8 to 64 px. Lane spacing. |
| Improves | B2, B1, B9 |
| Risks | B3, R6 |
| Screen | With the trunks of HWY-001 on `mid-clustered`: keep it if B2 rises by 15% with B3 up by 5% or less. |
| Depends on placement | yes |
| Sources | [Holten 2009][holten09] |
| Related | HWY-001, HWY-009, [RULE-030](#rule-030), [RULE-002](#rule-002) |

### RULE-048

**A curriculum that adds the rules one at a time.** Kind: `ours`. Step: `whole`. Prototype: S.

The solver starts with only the coarse rules: length and clearance from the boxes. It adds the fine rules one at a time: lane gaps, crossing angles and curvature. Each new rule starts from the last answer. This order avoids the poor local minima of the full energy from a raw start.

| Field | Value |
|---|---|
| Math | `E_t = Σ_r s_r(t) w_r E_r, with s_r(t) going from 0 to 1 in stage r` |
| Rules it expresses | Any rule. |
| Hard rules | The same as the solver. |
| Zoom levels | The stages can follow the levels. |
| Cost | The same as the solver. |
| Options | The order of the rules. The length of each stage. |
| Improves | R1, R2, R12 |
| Risks | R6 |
| Screen | On `mid-clustered` with 5 seeds: keep it if the final energy falls by 5% against the full energy at once, at the same number of steps. |
| Depends on placement | no |
| Sources | [Ahmed 2020][ahmed20] |
| Related | [RULE-019](#rule-019), [RULE-017](#rule-017) |

### RULE-049

**Torque to a right angle at each crossing.** Kind: `ours`. Step: `router`. Prototype: S.

At each crossing of two routes, a torque turns both segments toward a right angle. The torque acts only near the crossing, so the rest of each route keeps its shape. The rule makes crossings easy to read, without fewer crossings.

| Field | Value |
|---|---|
| Math | `E = k cos²θ at a crossing of angle θ. The gradient goes to the four ends of the two segments and to a window of w points with a falloff` |
| Rules it expresses | Crossing angle. |
| Hard rules | `project`, then RULE-046. |
| Zoom levels | `anchor`. |
| Cost | `O(X·w)` for X crossings. 100 nodes: 2 ms. 1000 nodes: 30 ms. |
| Options | K. Window 2 to 6 points. |
| Improves | R2 |
| Risks | R6, R3, R15 |
| Screen | On `mid-uniform` and `mid-clustered`: keep it if the median R2 rises by 15 degrees with R6 up by 3% or less. |
| Depends on placement | yes |
| Sources | [Ahmed 2020][ahmed20] |
| Related | [RULE-003](#rule-003), [RULE-029](#rule-029) |

### RULE-050

**Topology first, then one convex program for the geometry.** Kind: `hybrid`. Step: `router`. Prototype: M.

A discrete step fixes the way of each route around the boxes and the order of the routes in each channel. With those fixed, the free space of each segment is convex. One convex program then places all points. It has one answer, so it is the same each run and moves little for a small change.

| Field | Value |
|---|---|
| Math | `Variables: the bend points. Linear constraints: the side of each wrapped corner, x_j - x_i ≥ g in each channel. Objective: Σ ‖x_{k+1} - x_k‖² + λ Σ ‖x_k - x_k0‖². Solved by ADMM` |
| Rules it expresses | Each convex quadratic rule: length, centered lanes, gaps, alignment. |
| Hard rules | Exact. The constraints hold the hard rules. |
| Zoom levels | `convex`. The same topology at each level gives a near geometry. |
| Cost | `O(I·V)` by ADMM. 100 nodes: 20 ms. 1000 nodes: 300 ms. |
| Options | Gap g 2 to 12 px. Λ 0 to 1. ADMM steps 50 to 500. |
| Improves | R12, R8, Z10, R5 |
| Risks | R1 |
| Screen | On `mid-clustered` and `case-dense-groups`, after `shared`: keep it if each channel with room has gaps of g or more and Z10 falls by 30%. |
| Depends on placement | yes |
| Sources | [Pupyrev 2016][pupyrev16], [Dwyer 2009][dwyer09t] |
| Related | [RULE-009](#rule-009), [RULE-011](#rule-011), [RULE-008](#rule-008), HWY-016 |

### RULE-051

**Streamlines of a summed current.** Kind: `ours`. Step: `highway`. Prototype: M.

Each edge drives one unit of current from its source plug to its target plug through a sheet that conducts. The boxes insulate. The currents of the edges of one direction class add. Each route follows a streamline of its own current plus the total, so routes of one direction share channels.

| Field | Value |
|---|---|
| Math | `∇·(σ ∇u_e) = δ_s - δ_t for each edge, J = Σ σ ∇u_e for each direction class, the route traces J_e + β J by RK4` |
| Rules it expresses | Bundles by flow, clearance (σ = 0 in boxes). |
| Hard rules | No current enters an insulator, so the streamlines stay out of the boxes up to the error of the grid. Then RULE-046. |
| Zoom levels | The coarse grid of the parent level starts the solve. |
| Cost | One Poisson solve for each class, `O(G)` by multigrid. 100 nodes: 0.3 s. 1000 nodes: 3 s. |
| Options | Β 0 to 2. Cell 2 to 8 px. The direction classes. |
| Improves | B1, B2, R8 |
| Risks | R6, R7 |
| Screen | On `mid-clustered`: keep it if B1 is equal to `shared` or better with R7 = 0. |
| Depends on placement | yes |
| Sources | [Connolly 1990][connolly90], [Tero 2010][tero10] |
| Related | [RULE-005](#rule-005), HWY-021 |

### RULE-052

**Rules that align and snap the legs.** Kind: `hybrid`. Step: `router`. Prototype: S.

A reader sees aligned legs as one line. This rule finds legs of different routes with nearly equal coordinates and adds an equal constraint. It also snaps the leg coordinates to a grid of fixed pitch. A QP or XPBD pass meets them where the boxes permit.

| Field | Value |
|---|---|
| Math | `Cluster the leg coordinates within ε by a sorted sweep. Constraints x_a = x_b (strong) and x = k · pitch (weak), solved by RULE-009 or RULE-022` |
| Rules it expresses | Alignment, a snap grid, equal spacing. |
| Hard rules | The bounds of the solver hold the hard rules. |
| Zoom levels | The pitch doubles at each coarser level, so the alignment nests. |
| Cost | `O(L log L)` for L legs. 100 nodes: 2 ms. 1000 nodes: 20 ms. |
| Options | Ε 1 to 6 px. Pitch 4 to 16 px. |
| Improves | R14 |
| Risks | R12, R8, R6 |
| Screen | On `grid-400` and `mid-uniform`: keep it if the count of distinct leg coordinates falls by 30% with R12 unchanged. |
| Depends on placement | yes |
| Sources | [Badros 2001][badros01], [Hoffswell 2018][hoffswell18] |
| Related | [RULE-009](#rule-009), [RULE-012](#rule-012), [RULE-004](#rule-004) |

### RULE-053

**A hysteresis gate for discrete choices.** Kind: `ours`. Step: `levels`. Prototype: S.

A discrete choice flips when its score margin changes sign. An example is the highway that an edge takes. This gate keeps the choice of the parent level unless the new choice wins by a margin h. A small change of the input then flips few routes.

| Field | Value |
|---|---|
| Math | `Take c_new only if S(c_new) < S(c_parent) - h. The same test applies to an edit over time` |
| Rules it expresses | Stability of discrete choices. |
| Hard rules | No change. |
| Zoom levels | Native. |
| Cost | `O(1)` for each choice. |
| Options | H 0% to 20% of the score. |
| Improves | Z10, Z8, Z9 |
| Risks | R1, R6 |
| Screen | On `nestedGridBoard` with one box moved by 1 u: keep it if the route flips fall by 50% with the energy up by h or less. |
| Depends on placement | no |
| Sources | [Davidson 1996][davidson96] |
| Related | [RULE-045](#rule-045), HWY-046, HWY-054 |

## Ranking

The ranking divides the expected value by the cost. The expected value is a score from 1 to 5. It tells how much the idea can move the MEAS0 measures on the bench boards. The cost is 1 for prototype S, 2 for M and 3 for L.

| Rank | Id | Idea | Value | Prototype | Value per cost |
|---|---|---|---|---|---|
| 1 | [RULE-044](#rule-044) | Corner graph with rule prices, then rip-up and reroute | 5 | S | 5.0 |
| 2 | [RULE-046](#rule-046) | One repair step for the hard rules after any method | 5 | S | 5.0 |
| 3 | [RULE-009](#rule-009) | Separation constraints: the QP that nudges parallel segments | 4 | S | 4.0 |
| 4 | [RULE-021](#rule-021) | Simulated annealing over candidate routes | 4 | S | 4.0 |
| 5 | [RULE-022](#rule-022) | Position-based dynamics: one rule at a time (XPBD) | 4 | S | 4.0 |
| 6 | [RULE-045](#rule-045) | Continuation anchor between the zoom levels | 4 | S | 4.0 |
| 7 | [RULE-001](#rule-001) | Elastic band: springs along the route and a push from the boxes | 3 | S | 3.0 |
| 8 | [RULE-003](#rule-003) | Route-to-route repulsion with a cutoff | 3 | S | 3.0 |
| 9 | [RULE-020](#rule-020) | Adam with a seeded sample of pairs | 3 | S | 3.0 |
| 10 | [RULE-033](#rule-033) | Sandpile automaton for the capacity of gaps | 3 | S | 3.0 |
| 11 | [RULE-034](#rule-034) | Shape grammar: rewrite rules on parts of routes | 3 | S | 3.0 |
| 12 | [RULE-047](#rule-047) | Pull toward the lane slots of the highway skeleton | 3 | S | 3.0 |
| 13 | [RULE-049](#rule-049) | Torque to a right angle at each crossing | 3 | S | 3.0 |
| 14 | [RULE-052](#rule-052) | Rules that align and snap the legs | 3 | S | 3.0 |
| 15 | [RULE-053](#rule-053) | A hysteresis gate for discrete choices | 3 | S | 3.0 |
| 16 | [RULE-050](#rule-050) | Topology first, then one convex program for the geometry | 5 | M | 2.5 |
| 17 | [RULE-019](#rule-019) | Energy as a sum of rule terms, by gradient descent | 4 | M | 2.0 |
| 18 | [RULE-004](#rule-004) | Magnetic springs: a field that turns segments to a direction | 2 | S | 2.0 |
| 19 | [RULE-007](#rule-007) | Elastic rod: curvature forces on the curve | 2 | S | 2.0 |
| 20 | [RULE-028](#rule-028) | Density bundling with a mask of the free space | 2 | S | 2.0 |
| 21 | [RULE-032](#rule-032) | Wavefront automaton with rule costs (Lee) | 2 | S | 2.0 |
| 22 | [RULE-048](#rule-048) | A curriculum that adds the rules one at a time | 2 | S | 2.0 |
| 23 | [RULE-002](#rule-002) | Rule-energy edge bundling with a box field | 3 | M | 1.5 |
| 24 | [RULE-006](#rule-006) | Distance field and fast marching: the geodesic router | 3 | M | 1.5 |
| 25 | [RULE-011](#rule-011) | Moves that keep the topology (PrEd, ImPrEd) | 3 | M | 1.5 |
| 26 | [RULE-012](#rule-012) | Cassowary: rules with strengths | 3 | M | 1.5 |
| 27 | [RULE-017](#rule-017) | Layers of rules in priority order | 3 | M | 1.5 |
| 28 | [RULE-023](#rule-023) | Barrier and continuous collision checks (IPC) | 3 | M | 1.5 |
| 29 | [RULE-024](#rule-024) | Multigrid over the zoom levels | 3 | M | 1.5 |
| 30 | [RULE-025](#rule-025) | Prices for rules that couple edges (dual ascent, ADMM) | 3 | M | 1.5 |
| 31 | [RULE-027](#rule-027) | Differentiable raster loss | 3 | M | 1.5 |
| 32 | [RULE-030](#rule-030) | Medial axis of the free space as the highway line | 3 | M | 1.5 |
| 33 | [RULE-013](#rule-013) | Integer program for orthogonal routing: the exact reference | 4 | L | 1.3 |
| 34 | [RULE-036](#rule-036) | A rule language that compiles to energy and constraints | 4 | L | 1.3 |
| 35 | [RULE-005](#rule-005) | Harmonic potential field router | 2 | M | 1.0 |
| 36 | [RULE-008](#rule-008) | Stress majorization of the bend points | 2 | M | 1.0 |
| 37 | [RULE-010](#rule-010) | Kamada-Kawai on the skeleton of the hubs | 2 | M | 1.0 |
| 38 | [RULE-026](#rule-026) | Motion planners: CHOMP and TrajOpt | 2 | M | 1.0 |
| 39 | [RULE-029](#rule-029) | Clutter measure as a loss | 2 | M | 1.0 |
| 40 | [RULE-031](#rule-031) | One render loss summed over the zoom levels | 2 | M | 1.0 |
| 41 | [RULE-035](#rule-035) | L-system trees for a fan-out | 2 | M | 1.0 |
| 42 | [RULE-038](#rule-038) | Rule weights from preferences | 2 | M | 1.0 |
| 43 | [RULE-043](#rule-043) | Imitation of the exact solver | 2 | M | 1.0 |
| 44 | [RULE-051](#rule-051) | Streamlines of a summed current | 2 | M | 1.0 |
| 45 | [RULE-014](#rule-014) | Minimum cost flow for the fewest bends | 2 | L | 0.7 |
| 46 | [RULE-015](#rule-015) | SAT and CP-SAT on a grid of cells | 2 | L | 0.7 |
| 47 | [RULE-016](#rule-016) | Octilinear highways by a mixed integer program | 2 | L | 0.7 |
| 48 | [RULE-037](#rule-037) | Answer set programs for the discrete choices | 2 | L | 0.7 |
| 49 | [RULE-018](#rule-018) | Wave function collapse with tiles of routes | 1 | M | 0.5 |
| 50 | [RULE-039](#rule-039) | A frozen critic network as a loss | 1 | L | 0.3 |
| 51 | [RULE-040](#rule-040) | A graph network that gives a warm start | 1 | L | 0.3 |
| 52 | [RULE-041](#rule-041) | A neural time field (NTFields) | 1 | L | 0.3 |
| 53 | [RULE-042](#rule-042) | Reinforcement learning distilled into a fixed scorer | 1 | L | 0.3 |

## Build order

The build order is not the ranking. Some ideas make others safe or measurable, so they come first.

1. [RULE-046](#rule-046), the repair step. Each soft method needs it to keep the hard rules. It is small and it has a clear screen.
2. [RULE-044](#rule-044), the corner graph with rule prices and rip-up. It obeys the hard rules by construction and gives the most for its cost.
3. [RULE-022](#rule-022), position-based dynamics. It is the general refiner for local rules, with one compliance for each rule.
4. [RULE-009](#rule-009), the separation QP for the lanes of a channel. It gives exact gaps where the room permits.
5. [RULE-050](#rule-050), topology first, then one convex program. It joins 4 with the order of the lanes of the routers `shared` and `trunks`.
6. [RULE-045](#rule-045), the continuation anchor. It adds stability between the levels to each method above, at no cost.
7. [RULE-021](#rule-021), annealing over candidates. It handles the discrete rules, for example crossings and highway membership.
8. [RULE-019](#rule-019) with [RULE-020](#rule-020), the energy of all rules with Adam. It is the frame for each smooth rule.
9. [RULE-036](#rule-036), the rule language. It lets a user write the rules of steps 3 and 8 as data.
10. [RULE-013](#rule-013), the exact integer program. It gives MEAS2 its reference on small boards, so each other idea gets a gap to the optimum.
11. [RULE-027](#rule-027), the raster loss. It brings the rules of density and clutter.
12. [RULE-049](#rule-049), the crossing torque. It is a small rule term for R2.
13. [RULE-033](#rule-033), the sandpile for the capacity of gaps.
14. [RULE-006](#rule-006), the distance field router, for boards with narrow gaps.
15. [RULE-053](#rule-053), the hysteresis gate for the discrete choices of 7 and 10.

## The cheapest screens

These five screens use the boards and the measures of today, and each prototype is S:

| Id | Screen | Why it is cheap |
|---|---|---|
| [RULE-046](#rule-046) | Hard faults 0 on 9 fixtures with 5 seeds, 5% of the points changed or fewer | The bench counts the hard faults already. |
| [RULE-049](#rule-049) | Median R2 up by 15 degrees, R6 up by 3% or less | One term on top of RULE-001 or the routes of today. |
| [RULE-044](#rule-044) | R1 and R3 down by 10% against `corner` | It changes only the arc costs of the corner graph. |
| [RULE-053](#rule-053) | Route flips down by 50% when one box moves | It is a comparison of two scores. |
| [RULE-033](#rule-033) | Each gap cell at its capacity or less, R12 up by 20% | The grid and the gaps of ROOM exist. |

## Combinations with the other families

- Highways (HWY-R). The highway family decides which edges share a trunk. This family then places the lanes: [RULE-047](#rule-047) pulls each edge to its lane slot, and [RULE-009](#rule-009) or [RULE-050](#rule-050) spaces the lanes. [RULE-002](#rule-002) and [RULE-028](#rule-028) are the rule versions of HWY-002 and HWY-006. [RULE-025](#rule-025) and HWY-044 are two sides of one negotiation: one pushes edges apart, one pulls them together.
- Nature (NAT-R). [RULE-051](#rule-051) is near the slime mold networks of [Tero 2010][tero10]: both send current through a sheet and keep the channels with the most flow. [RULE-033](#rule-033) is a sandpile, a model of self-organized criticality. An ant or a slime mold method can give the candidates of [RULE-021](#rule-021).
- Other fields (EDA-R). Chip routers use negotiated congestion, rip-up and integer programs. [RULE-044](#rule-044), [RULE-025](#rule-025) and [RULE-013](#rule-013) take those methods. A global router of EDA can give the corridors, and [RULE-022](#rule-022) can refine the routes inside them.
- Free ideation (WILD-R). Any rule of WILD-R with a measure can become a term of [RULE-019](#rule-019) or a rule of [RULE-036](#rule-036). Each soft idea of WILD-R can use [RULE-046](#rule-046) for the hard rules and [RULE-045](#rule-045) for the levels.
- Measures (MEAS0). Each measure with a smooth form is also a rule term. [RULE-013](#rule-013) gives MEAS2 its optimum.

## Surprises

- Given the topology and the lane order, the best geometry is one convex program. So the hard part is discrete, and the geometry is easy and stable.
- The abelian sandpile gives the same state for each order of topples. A random spread then needs no seed.
- A harmonic potential has no local minimum in the free space, so a descent always reaches its target.
- IPC keeps each step free of boxes, not only the last step. A soft method then needs no repair.
- A raster loss costs the same for 10 or 10 000 edges at one image size.
- Penrose and Bluefish already compile rules written as data to energies and constraints. A rule language for routes does not start from zero.

## Gaps

- MEAS0 has no measure of alignment and no measure of the symmetry of the routes. [RULE-052](#rule-052) and [RULE-004](#rule-004) need one. This note proposes "the count of distinct leg coordinates" as the alignment measure.
- The learned ideas ([RULE-038](#rule-038) to [RULE-043](#rule-043)) have no corpus. Labels from the MEAS0 order make a loop: the learned rule learns MEAS0 again.
- The exact methods ([RULE-013](#rule-013), [RULE-015](#rule-015), [RULE-016](#rule-016), [RULE-037](#rule-037)) need a solver from outside. The bench starts them in CI only.
- The note made no scratch runs. The costs are estimates from the complexity and the size of the boards. BUILD-W measures them.

## Sources

<!-- ste-disable-next word-list -- the title of a source -->
- <a id="ahmed20"></a>Ahmed, De Luca, Devkota, Kobourov and Li, 2020. [Graph drawing via gradient descent, (GD)^2](https://arxiv.org/abs/2008.05584). GD 2020.
<!-- ste-disable-next word-list -- the title of a source -->
- <a id="ahmed22"></a>Ahmed, De Luca, Devkota, Kobourov and Li, 2022. [Multicriteria scalable graph drawing via stochastic gradient descent, (SGD)^2](https://arxiv.org/abs/2112.01571). IEEE TVCG 28(6).
- <a id="badros01"></a>Badros, Borning and Stuckey, 2001. [The Cassowary linear arithmetic constraint solving algorithm](https://doi.org/10.1145/504704.504705). ACM TOCHI 8(4).
- <a id="bergou08"></a>Bergou, Wardetzky, Robinson, Audoly and Grinspun, 2008. [Discrete elastic rods](https://doi.org/10.1145/1360612.1360662). ACM TOG 27(3).
- <a id="bertault00"></a>Bertault, 2000. [A force-directed algorithm that preserves edge-crossing properties](https://doi.org/10.1016/S0020-0190(00)00042-9). Information Processing Letters 74.
<!-- ste-disable-next word-list -- the title of a source -->
- <a id="boyd11"></a>Boyd, Parikh, Chu, Peleato and Eckstein, 2011. [Distributed optimization and statistical learning via the alternating direction method of multipliers](https://doi.org/10.1561/2200000016). Foundations and Trends in Machine Learning 3(1).
- <a id="bradley52"></a>Bradley and Terry, 1952. [Rank analysis of incomplete block designs: I. The method of paired comparisons](https://doi.org/10.2307/2334029). Biometrika 39.
- <a id="briggs00"></a>Briggs, Henson and McCormick, 2000. [A multigrid tutorial, second edition](https://doi.org/10.1137/1.9780898719505). SIAM.
- <a id="connolly90"></a>Connolly, Burns and Weiss, 1990. [Path planning using Laplace's equation](https://doi.org/10.1109/ROBOT.1990.126315). ICRA 1990.
- <a id="davidson96"></a>Davidson and Harel, 1996. [Drawing graphs nicely using simulated annealing](https://doi.org/10.1145/234535.234538). ACM TOG 15(4).
- <a id="dhar90"></a>Dhar, 1990. [Self-organized critical state of sandpile automaton models](https://doi.org/10.1103/PhysRevLett.64.1613). Physical Review Letters 64.
- <a id="dwyer06"></a>Dwyer, Koren and Marriott, 2006. [IPSep-CoLa: an incremental procedure for separation constraint layout of graphs](https://doi.org/10.1109/TVCG.2006.156). IEEE TVCG 12(5).
- <a id="dwyer06r"></a>Dwyer, Marriott and Wybrow, 2006. [Integrating edge routing into force-directed layout](https://doi.org/10.1007/978-3-540-70904-6_3). GD 2006.
- <a id="dwyer09t"></a>Dwyer, Marriott and Wybrow, 2009. [Topology preserving constrained graph layout](https://doi.org/10.1007/978-3-642-00219-9_22). GD 2008.
- <a id="ersoy11"></a>Ersoy, Hurter, Paulovich, Cantareiro and Telea, 2011. [Skeleton-based edge bundling for graph visualization](https://doi.org/10.1109/TVCG.2011.233). IEEE TVCG 17(12).
- <a id="felzenszwalb12"></a>Felzenszwalb and Huttenlocher, 2012. [Distance transforms of sampled functions](https://doi.org/10.4086/toc.2012.v008a019). Theory of Computing 8.
- <a id="fruchterman91"></a>Fruchterman and Reingold, 1991. [Graph drawing by force-directed placement](https://doi.org/10.1002/spe.4380211102). Software: Practice and Experience 21(11).
- <a id="gansner04"></a>Gansner, Koren and North, 2004. [Graph drawing by stress majorization](https://www.graphviz.org/documentation/GKN04.pdf). GD 2004.
- <a id="gebser19"></a>Gebser, Kaminski, Kaufmann and Schaub, 2019. [Multi-shot ASP solving with clingo](https://arxiv.org/abs/1705.09811). Theory and Practice of Logic Programming 19(1).
- <a id="gumin16"></a>Gumin, 2016. [WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse). Source code and description.
- <a id="haleem19"></a>Haleem, Wang, Puri, Wadhwa and Qu, 2019. [Evaluating the readability of force directed graph layouts: a deep learning approach](https://arxiv.org/abs/1808.00703). IEEE CG&A 39(4).
- <a id="hoffswell18"></a>Hoffswell, Borning and Heer, 2018. [SetCoLa: high-level constraints for graph layout](https://doi.org/10.1111/cgf.13440). Computer Graphics Forum 37(3).
- <a id="holten09"></a>Holten and van Wijk, 2009. [Force-directed edge bundling for graph visualization](https://doi.org/10.1111/j.1467-8659.2009.01450.x). Computer Graphics Forum 28(3).
- <a id="horn83"></a>Horn, 1983. [The curve of least energy](https://dspace.mit.edu/handle/1721.1/5697). ACM TOMS 9.
- <a id="hu05"></a>Hu, 2005. [Efficient, high-quality force-directed graph drawing](https://yifanhu.net/PUB/graph_draw_small.pdf). The Mathematica Journal 10(1).
- <a id="hurter12"></a>Hurter, Ersoy and Telea, 2012. [Graph bundling by kernel density estimation](https://doi.org/10.1111/j.1467-8659.2012.03079.x). Computer Graphics Forum 31(3).
- <a id="kamada89"></a>Kamada and Kawai, 1989. [An algorithm for drawing general undirected graphs](https://doi.org/10.1016/0020-0190(89)90102-6). Information Processing Letters 31(1).
- <a id="karth17"></a>Karth and Smith, 2017. [WaveFunctionCollapse is constraint solving in the wild](https://doi.org/10.1145/3102071.3110566). FDG 2017.
- <a id="khatib86"></a>Khatib, 1986. [Real-time obstacle avoidance for manipulators and mobile robots](https://doi.org/10.1177/027836498600500106). IJRR 5(1).
- <a id="kingma15"></a>Kingma and Ba, 2015. [Adam: a method for stochastic optimization](https://arxiv.org/abs/1412.6980). ICLR 2015.
- <a id="klammler18"></a>Klammler, Mchedlidze and Pak, 2018. [Aesthetic discrimination of graph layouts](https://arxiv.org/abs/1809.01017). GD 2018. The journal version is in JGAA 23(3).
- <a id="lee61"></a>Lee, 1961. [An algorithm for path connections and its applications](https://doi.org/10.1109/TEC.1961.5219222). IRE Transactions on Electronic Computers 10(3).
- <a id="li20diffvg"></a>Li, Lukáč, Gharbi and Ragan-Kelley, 2020. [Differentiable vector graphics rasterization for editing and learning](https://doi.org/10.1145/3414685.3417871). ACM TOG 39(6).
- <a id="li20ipc"></a>Li, Ferguson, Schneider, Langlois, Zorin, Panozzo, Jiang and Kaufman, 2020. [Incremental potential contact: intersection- and inversion-free, large-deformation dynamics](https://doi.org/10.1145/3386569.3392425). ACM TOG 39(4).
- <a id="liao19"></a>Liao, Zhang, Dong, Poczos, Shimada and Kara, 2019. [A deep reinforcement learning approach for global routing](https://arxiv.org/abs/1906.08809). arXiv 1906.08809.
- <a id="macklin16"></a>Macklin, Müller and Chentanez, 2016. [XPBD: position-based simulation of compliant constrained dynamics](https://doi.org/10.1145/2994258.2994272). MIG 2016.
- <a id="marler04"></a>Marler and Arora, 2004. [Survey of multi-objective optimization methods for engineering](https://doi.org/10.1007/s00158-003-0368-6). Structural and Multidisciplinary Optimization 26.
- <a id="marriott14"></a>Marriott, Stuckey and Wybrow, 2014. [Seeing around corners: fast orthogonal connector routing](https://doi.org/10.1007/978-3-662-44043-8_4). Diagrams 2014.
- <a id="mcmurchie95"></a>McMurchie and Ebeling, 1995. [PathFinder: a negotiation-based performance-driven router for FPGAs](https://doi.org/10.1145/201310.201328). FPGA 1995.
- <a id="mirhoseini21"></a>Mirhoseini and others, 2021. [A graph placement methodology for fast chip design](https://doi.org/10.1038/s41586-021-03544-w). Nature 594.
- <a id="muller07"></a>Müller, Heidelberger, Hennix and Ratcliff, 2007. [Position based dynamics](https://doi.org/10.1016/j.jvcir.2007.01.005). JVCIR 18(2).
<!-- ste-disable-next word-list -- the title of a source -->
- <a id="nam02"></a>Nam, Sakallah and Rutenbar, 2002. [A new FPGA detailed routing approach via search-based Boolean satisfiability](https://doi.org/10.1109/TCAD.2002.1004311). IEEE TCAD 21(6).
- <a id="ni23"></a>Ni and Qureshi, 2023. [NTFields: neural time fields for physics-informed robot motion planning](https://arxiv.org/abs/2210.00120). ICLR 2023.
- <a id="nollenburg11"></a>Nöllenburg and Wolff, 2011. [Drawing and labeling high-quality metro maps by mixed-integer programming](https://doi.org/10.1109/TVCG.2010.81). IEEE TVCG 17(5).
- <a id="ortools"></a>Perron and Didier, Google, 2024. [CP-SAT solver of OR-Tools](https://developers.google.com/optimization/cp/cp_solver). Documentation.
- <a id="pollock24"></a>Pollock, Mei, Huang, Evans, Jackson and Satyanarayan, 2024. [Bluefish: composing diagrams with declarative relations](https://doi.org/10.1145/3654777.3676465). UIST 2024.
- <a id="prusinkiewicz90"></a>Prusinkiewicz and Lindenmayer, 1990. [The algorithmic beauty of plants](http://algorithmicbotany.org/papers/#abop). Springer.
- <a id="pupyrev16"></a>Pupyrev, Nachmanson, Bereg and Holroyd, 2016. [Edge routing with ordered bundles](https://arxiv.org/abs/1209.4227). Computational Geometry 52.
- <a id="quinlan93"></a>Quinlan and Khatib, 1993. [Elastic bands: connecting path planning and control](https://doi.org/10.1109/ROBOT.1993.291936). ICRA 1993.
- <a id="ratliff09"></a>Ratliff, Zucker, Bagnell and Srinivasa, 2009. [CHOMP: gradient optimization techniques for efficient motion planning](https://doi.org/10.1109/ROBOT.2009.5152817). ICRA 2009.
- <a id="rosenholtz07"></a>Rosenholtz, Li and Nakano, 2007. [Measuring visual clutter](https://doi.org/10.1167/7.2.17). Journal of Vision 7(2).
- <a id="schulman14"></a>Schulman, Duan, Ho, Lee, Awwal, Bradlow, Pan, Patil, Goldberg and Abbeel, 2014. [Motion planning with sequential convex optimization and convex collision checking](https://doi.org/10.1177/0278364914528132). IJRR 33(9).
- <a id="sethian96"></a>Sethian, 1996. [A fast marching level set method for monotonically advancing fronts](https://doi.org/10.1073/pnas.93.4.1591). PNAS 93(4).
- <a id="simonetto11"></a>Simonetto, Archambault, Auber and Bourqui, 2011. [ImPrEd: an improved force-directed algorithm that prevents nodes from crossing edges](https://doi.org/10.1111/j.1467-8659.2011.01956.x). Computer Graphics Forum 30(3).
- <a id="stiny72"></a>Stiny and Gips, 1972. [Shape grammars and the generative specification of painting and sculpture](http://www.shapegrammar.org/ifip/SGBestPapers72.pdf). IFIP Congress 1971.
- <a id="sugiyama95"></a>Sugiyama and Misue, 1995. [Graph drawing by the magnetic spring model](https://doi.org/10.1006/jvlc.1995.1013). JVLC 6(3).
- <a id="tamassia87"></a>Tamassia, 1987. [On embedding a graph in the grid with the minimum number of bends](https://doi.org/10.1137/0216030). SIAM J. Comput. 16(3).
- <a id="tero10"></a>Tero, Takagi, Saigusa, Ito, Bebber, Fricker, Yumiki, Kobayashi and Nakagaki, 2010. [Rules for biologically inspired adaptive network design](https://doi.org/10.1126/science.1177894). Science 327.
- <a id="tiezzi24"></a>Tiezzi, Ciravegna and Gori, 2024. [Graph neural networks for graph drawing](https://arxiv.org/abs/2109.10061). IEEE TNNLS 35(4).
- <a id="walshaw03"></a>Walshaw, 2003. [A multilevel algorithm for force-directed graph-drawing](https://doi.org/10.7155/jgaa.00070). JGAA 7(3).
- <a id="wang21"></a>Wang, Yen, Hu and Shen, 2021. [DeepGD: a deep learning framework for graph drawing using GNN](https://arxiv.org/abs/2106.15347). IEEE CG&A 41(5).
- <a id="webcola"></a>Dwyer and others, 2014. [WebCoLa: constraint-based layout in the browser](https://ialab.it.monash.edu/webcola/). Source code and documentation.
- <a id="wybrow09"></a>Wybrow, Marriott and Stuckey, 2009. [Orthogonal connector routing](https://doi.org/10.1007/978-3-642-11805-0_22). GD 2009.
- <a id="ye20"></a>Ye, Ni, Krieger, Ma'ayan, Wise, Aldrich, Sunshine and Crane, 2020. [Penrose: from mathematical notation to beautiful diagrams](https://doi.org/10.1145/3386569.3392375). ACM TOG 39(4).
- <a id="zheng18"></a>Zheng, Pawar and Goodman, 2019. [Graph drawing by stochastic gradient descent](https://arxiv.org/abs/1710.04626). IEEE TVCG 25(9).
- <a id="zwan16"></a>van der Zwan, Codreanu and Telea, 2016. [CUBu: universal real-time bundling for large graphs](https://doi.org/10.1109/TVCG.2016.2515611). IEEE TVCG 22(12).

[ahmed20]: #ahmed20
[ahmed22]: #ahmed22
[badros01]: #badros01
[bergou08]: #bergou08
[bertault00]: #bertault00
[boyd11]: #boyd11
[bradley52]: #bradley52
[briggs00]: #briggs00
[connolly90]: #connolly90
[davidson96]: #davidson96
[dhar90]: #dhar90
[dwyer06]: #dwyer06
[dwyer06r]: #dwyer06r
[dwyer09t]: #dwyer09t
[ersoy11]: #ersoy11
[felzenszwalb12]: #felzenszwalb12
[fruchterman91]: #fruchterman91
[gansner04]: #gansner04
[gebser19]: #gebser19
[gumin16]: #gumin16
[haleem19]: #haleem19
[hoffswell18]: #hoffswell18
[holten09]: #holten09
[horn83]: #horn83
[hu05]: #hu05
[hurter12]: #hurter12
[kamada89]: #kamada89
[karth17]: #karth17
[khatib86]: #khatib86
[kingma15]: #kingma15
[klammler18]: #klammler18
[lee61]: #lee61
[li20diffvg]: #li20diffvg
[li20ipc]: #li20ipc
[liao19]: #liao19
[macklin16]: #macklin16
[marler04]: #marler04
[marriott14]: #marriott14
[mcmurchie95]: #mcmurchie95
[mirhoseini21]: #mirhoseini21
[muller07]: #muller07
[nam02]: #nam02
[ni23]: #ni23
[nollenburg11]: #nollenburg11
[ortools]: #ortools
[pollock24]: #pollock24
[prusinkiewicz90]: #prusinkiewicz90
[pupyrev16]: #pupyrev16
[quinlan93]: #quinlan93
[ratliff09]: #ratliff09
[rosenholtz07]: #rosenholtz07
[schulman14]: #schulman14
[sethian96]: #sethian96
[simonetto11]: #simonetto11
[stiny72]: #stiny72
[sugiyama95]: #sugiyama95
[tamassia87]: #tamassia87
[tero10]: #tero10
[tiezzi24]: #tiezzi24
[walshaw03]: #walshaw03
[wang21]: #wang21
[webcola]: #webcola
[wybrow09]: #wybrow09
[ye20]: #ye20
[zheng18]: #zheng18
[zwan16]: #zwan16
