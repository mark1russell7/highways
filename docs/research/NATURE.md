# Ideas from nature for routes and highways

This note is the research item NAT-R of the [roadmap](../ROADMAP.md). It gives the processes of nature that make networks, shared ways, trees, groups and smooth curves. For each process, it tells how the process becomes a strategy of a step of this library.

The catalog [`ideas/nature.json`](ideas/nature.json) holds one record for each idea, with its options, its cost and its screen. The later items use the note and the catalog:

- BUILD-W builds and screens each idea of the catalog. The [build order](#the-build-order) tells which ideas come first.
- HWY-STEP makes the step `highway`. Most ideas of this note are strategies of that step.
- TUNE sweeps the options of each kept idea against the measures of [MEAS0](MEASURES.md).

## Summary

- The note gives 49 ideas in six kinds. 17 come from the literature, 25 are hybrids and 7 are ours. So 32 of 49 are hybrids or ours.
- Many processes of nature solve the problem of this library. Slime molds, leaf veins, rivers, blood vessels, neurons and walkers all make a network that trades total length against detour.
- Each of these processes has one knob for that trade. Examples are the exponent `g` of the slime mold, the exponent `alpha` of branched transport and the factor `bf` of neurons. Each one moves a network between a Steiner tree and direct lines.
- Three closed forms give cheap strategies. The best split angle of a Y is `cos(theta / 2) = 2^(alpha - 1)`. Murray's law is the case `alpha = 2/3`, a split of 74.9 degrees. The best angle to join a highway with the discount `d` is `acos(d)`.
- A scratch run of the slime-mold model on a small board gives a deterministic network. At `g = 1.8`, its kept length is 0.99 times the rectilinear minimum spanning tree.
- The literature has no edge-bundling method that uses the slime-mold model or ant pheromones. This is a gap, and the reason for the hybrids of this note.
- The [build order](#the-build-order) has 14 ideas. The first six are small post steps or options of the routers of today.

## The question and the scope

The question is this: which processes of nature make networks, shared ways, trees, groups or smooth curves? How does each one become a strategy of a step?

The steps of this note are the steps of the core and two future steps:

| Step | Input and output | Where today |
|---|---|---|
| `highway` | The routes or the edges in, the shared ways (bundles) out. | Inside the routers `trunks`, `shared` and `sections`. HWY-STEP makes it a step. |
| `router` | A graph in, a polyline for each edge out. | The step `router`. |
| `curve` | A polyline in, curve segments out. | The step `curve`. |
| `group` | A graph in, a tree of sections out. | The step `group`. |
| `room` | The boxes and the lanes in, the gaps to open out. | The step `room`. |
| `plugs` | The edge ends of each box in, the plug points out. | Inside the routers. |
| `levels` | The items of each zoom level in, the level links out. | Inside the router `sections`. |
| `whole` | All options in, the best settings out. | TUNE. |

The scope has these limits:

- Each idea must be deterministic. The same input and the same seed give the same output.
- Each idea must have a screen: a test on the boards of the bench that keeps or drops it.
- The note does not repeat the curve families of [CURVES](CURVES.md) or the grouping rules of [GROUPING](GROUPING.md). It refers to them.

## How to read an entry

### Notation

- `n` is the number of nodes, and `m` is the number of edges. `k` is the number of ends of one fan or of one bundle.
- `V` and `E` are the vertices and the links of the corner graph. `G` is the number of cells of a grid. `u` is the unit of length of a board, as in [MEAS0](MEASURES.md#notation).
- `L_ij` is the length of the link from `i` to `j`. `D_ij` or `C_ij` is its conductance. `Q_ij` is the flow on it.
- `w` is the load of a way: the number of edges on it. `alpha` is the exponent of the cost of a load, so the cost of a way is `w^alpha L`.
- A fan is the set of edges with one common end. A run is a part of a route that it shares with other routes.
- R1 to R15, B1 to B9, C1 to C11, G1 to G9, Z1 to Z10 and M1 to M5 are the measures of [MEAS0](MEASURES.md).

### The columns of the idea tables

| Column | Meaning |
|---|---|
| Id | The id of the idea in the catalog. |
| Idea | The name of the idea. The letter after it is its kind: L for literature, H for hybrid, O for ours. |
| Step | The step that the idea is a strategy of. |
| What it does | The mechanism, in one or two lines. The notes after each table give the formula. |
| Cost | The time class, then the expected time on a board of 100 nodes and of 1000 nodes. |
| Wins | The MEAS0 measures that the idea makes better. |
| Risks | The MEAS0 measures that the idea can make worse. |
| Keep if | The cheapest screen. The catalog gives its boards. |

The times are estimates for one core of a CI machine. Only CI measures times, as [MEAS0](MEASURES.md) tells.

## The taxonomy

| Kind | Process of nature | What it makes | Ideas | Main step |
|---|---|---|---|---|
| Networks that adapt to flow | Slime molds, leaf veins under changing loads, auxin channels | A network where flow thickens a tube and no flow thins it | NAT-001 to NAT-004 | `highway` |
| Trails and walkers | Human trails, ant pheromones, army-ant lanes, termite nests | Shared ways from many single trips | NAT-005 to NAT-010 | `highway`, `router` |
| Drainage and trees | Rivers, vessels, leaf veins, neurons, roots, lungs, fungi | Trees that trade total length against path length | NAT-011 to NAT-024 | `highway` |
| Physics of surfaces and growth | Soap films, crystals, lightning, cracks, erosion, sand ripples, sunflowers, foams, fields | Shortest networks, partitions, even spacing, field lines | NAT-025 to NAT-037 | all steps |
| Collectives and patterns | Flocks, cell sorting, reaction-diffusion, bone | Lanes, groups, spaced spots, room where load is high | NAT-038 to NAT-042 | `highway`, `group`, `room` |
| Search over the options | Evolution, annealing, swarms | The best settings of the options | NAT-043 to NAT-049 | `whole`, `levels` |

A common law joins the first three kinds. Each process minimizes a cost of the form `sum_e w_e^alpha L_e` with `alpha < 1`, or reaches its fixed point. [Bohn and Magnasco 2007][bohn07] and [Xia 2003][xia03] give the form. The value of `alpha` sets the shape. `alpha = 0` gives a Steiner tree, `alpha = 1` gives straight edges, and the values between give trunks with branches.

## How to make a model deterministic

Most models of nature use random draws or a time step. These recipes make each one deterministic. The entries refer to them by their ids.

| Id | Recipe | How |
|---|---|---|
| D1 | Fixed steps | Run a fixed number of steps. Do not stop on the wall time. A stop on a tolerance is permitted, because it reads only the values. |
| D2 | Seeded draws | Draw each random number from a generator with the bench seed. Use one stream for each idea, so a new idea does not change the draws of another. |
| D3 | Hash jitter | Break the ties of a symmetric board with a small value from a hash of the edge id or the link id, not with a draw. |
| D4 | Jacobi updates | Compute all new values from the old values of the step. Then the order of the visits does not change the result. |
| D5 | Sorted ties | Sort the candidates by value, then by id. Take the first. |
| D6 | Fixed solves | Solve each linear system with conjugate gradient, a fixed cap on the iterations and a fixed order of the sums. |
| D7 | Mean field | Replace the samples of many agents by their expected values. One linear solve gives them. NAT-008 uses this recipe. |
| D8 | Argmax growth | A growth model picks its next cell by a draw with a probability. Pick the cell with the largest probability, with D5 for ties. |

## Networks that adapt to flow

| Id | Idea | Step | What it does | Cost (100, 1000) | Wins | Risks | Keep if |
|---|---|---|---|---|---|---|---|
| NAT-001 | Physarum highways (L) | `highway` | Tubes that carry flow between the edge ends thicken, the other tubes thin out. The thick tubes are the highways. | `T k E sqrt(V)`. 0.3 to 1 s, 5 to 20 s on the corner graph or under 0.5 s on the hub graph. | B1, B2, B7, R1 | B3, R5, R6, B4, R7 | B1 is 0.05 higher than `shared-all` and B3 q95 is at most 0.10 higher, on 2 of 3 boards. |
| NAT-002 | Physarum agents on a field (L) | `highway`, `levels` | Many particles with three sensors follow and drop a trail that spreads and fades. The trail lines between the nodes are the shared ways. | `T (A + G)`. 0.3 to 1 s for both sizes. | B1, B7, C3 | R9, R5, B4, Z10, Z3 | Z3 is 0 and B1 of the level links is 0.10 higher. Expected drop. |
| NAT-003 | Loops from changing loads (H) | `highway` | The model of NAT-001 with several load cases at once. Loops stay where two heavy loads want different ways. | One solve per load case and iteration. Under 0.5 s, 2 to 10 s. | R6, R5, B3 | B1, R1, B7 | R6 is 10% lower than NAT-001 at the same kept length, and B1 falls by 0.03 or less. |
| NAT-004 | Canalization feeder trees (H) | `router` | In each section, the members are sources and the hub is the sink. Channels with flux grow, so the routes to the hub merge into one tree. | One small solve per step and section. 50 ms, 0.5 to 1 s. | B1, R1, B2 | R5, R7 | B1 is 0.05 higher than the router `sections` of today, and R7 is not worse. |

### Notes on the networks that adapt to flow

- **NAT-001.** [Tero 2010][tero10] gives the model. The flow is `Q_ij = D_ij (p_i - p_j) / L_ij`. One end of an edge injects `I0`, the other end takes it out, and the other nodes conserve flow. The tubes adapt by `dD/dt = f(|Q|) - D` with `f(q) = q^g / (1 + q^g)`. The paper uses `I0 = 2` and `g = 1.8`. A small `I0` or a large `g` gives a tree near the minimum spanning tree. A large `I0` gives loops and fault tolerance. [Bonifaci 2012][bonifaci12] proves that the model finds the shortest path for one pair. [Straszak 2016][straszak16] shows that it is iteratively reweighted least squares.
- NAT-001 is deterministic with D6 for the solves. Each step uses the pairs in a fixed cycle, or all pairs with their mean `|Q|`. The start conductance is `1 + 0.01 hash(e)` with D3. The update is `D += 0.5 (f - D)`, a fixed step of D1. The options are `g` 1 to 3, `I0` 0.2 to 6 and the steps 50 to 400. Two more options are the keep threshold on `D` and the exponent `beta` of the route cost `L / D^beta`.
- **NAT-002.** [Jones 2010][jones10] gives the agent model. Each agent senses at the angles `-SA`, `0` and `+SA` at the distance `SO`, turns by `RA` to the strongest value, moves and drops trail. The trail field blurs and decays each step. Use D2 for the start positions, D4 for the field and D5 for equal sensor values. The raster ignores the exact boxes, so the expected result is a drop.
- **NAT-003.** [Katifori 2010][katifori10] and [Corson 2010][corson10] show that loops appear when the load changes. The fixed point is `C_e` proportional to `<Q_e^2>^(1 / (1 + gamma))`, scaled to a total budget `sum C_e^gamma = K`. Each load case is one collection or one source group. Use D6 and D1. The options are `gamma` 0.25 to 0.9, the budget and the load cases.
- **NAT-004.** [Mitchison 1980][mitchison80] and [Sachs 1981][sachs81] give the canalization hypothesis. [Feugier 2005][feugier05] gives a model with flux and carriers. Here the flux is `phi_ij = D_ij (c_i - c_j) / L_ij`, each member is a source of 1 and the hub drains all. The update `dD/dt = |phi|^mu - r D` with `mu > 1` gives a tree. It is NAT-001 with many sources and one sink. Use D1 and D6.

## Trails and walkers

| Id | Idea | Step | What it does | Cost (100, 1000) | Wins | Risks | Keep if |
|---|---|---|---|---|---|---|---|
| NAT-005 | Active walker trails (H) | `highway` | All edges route in passes. Each route makes the ground near it cheaper, and the ground recovers. Routes gather on common trails. | Passes times `shared`. 0.4 s, a few seconds. | B1, B2, B7, R1, Z10 | R5, R6, B4 | Its front of B1 against R5 q95 dominates `shared-all` on 1 board and is not dominated on the others. |
| NAT-006 | Desire-line room (O) | `room` | The straight line of each edge, weighted by the detour of its first route, sets the demand of each gap. The gaps that the lines want open first. | `m` times the gaps crossed. Under 10 ms, 50 ms, plus a route. | R5, R6, R7, M4 | M1, M3, M2 | R5 q95 is 5% lower than `roomDemand` at the same M1. |
| NAT-007 | Ant colony router (L) | `router` | Ants of each collection walk the corner graph. Short tours drop more pheromone, and pheromone evaporates. The ants of a collection meet on common ways. | `I m a len deg`. 0.1 s, 2 s. | B1, B2 | R5, R6, R7, Z10 | B1 is 0.03 higher than `shared`, with R5 q95 not worse. Expected tie at a higher cost. |
| NAT-008 | Expected ants (O) | `router` | The ant walk is a Markov chain. One linear solve gives the expected visits, so the pheromone update needs no samples and no seed. | One solve per source group and iteration. 0.1 to 0.3 s, 2 to 5 s. | B1, B2, Z10 | R5, R7 | B1 is within 0.02 of the better of NAT-001 and NAT-007, at a lower time. |
| NAT-009 | Two-way lanes (H) | `highway` | In each run, the lanes sort by direction first, then by the bundle order. Edges that go one way stay side by side. | `k log k` per run. Negligible. | B5, R1 | R1, B5 | End crossings are within 2% of `laneOrder` `bundle`. A default only if they drop. |
| NAT-010 | Termite hubs (H) | `group` | Edge lines drop material on a grid. Material attracts more material, so the deposits grow into spaced peaks. The hubs go to the peaks. | `T G`. Under 50 ms for both sizes. | R5, G8, B1 | R7, G6, Z7 | R5 q95 is 5% lower than the hubs of today, with R7 not worse. |

### Notes on the trails and walkers

- **NAT-005.** [Helbing 1997][helbing97] gives the active walker model. The ground comfort follows `dG/dt = (G0 - G) / T + I (1 - G / Gmax) sum_a delta(r - r_a)`. A walker feels `V_tr(r) = integral exp(-|r - r'| / sigma) G(r') d2r'` and heads along `d_a - r_a + grad V_tr`. The number `kappa = I T / sigma^2` sets the result. A small `kappa` gives direct ways, a large `kappa` a minimal way system. Real trail systems are between the two.
- In this library, a pass routes all edges with the router `shared`. The comfort grid is the sum of the routes of the last pass, blurred with `sigma` and decayed by the weathering. A link costs `L (1 - lambda G_norm)`. The passes are D1, and the blur is D4. The options are `kappa` 0.1 to 10, `sigma` 0.5u to 4u, the passes 2 to 8, the weathering and `lambda` 0 to 0.8.
- **NAT-006.** Desire paths show where a paved way makes a long detour. The demand of a gap is `sum_e w_e` over the edges whose straight line crosses the gap, with `w_e = delta_e - 1` from a first routing. Feed it to `openGaps` in place of the lane count. The method is deterministic. The options are the weight, the area budget and the detour threshold.
- **NAT-007.** [Dorigo 1996][dorigo96] gives the ant system, [Dorigo 1997][dorigo97] the ant colony system and [Stutzle 2000][stutzle00] the MAX-MIN ant system. An ant takes the link `j` from `i` with `p_ij = tau_ij^alpha eta_ij^beta / sum_l tau_il^alpha eta_il^beta` and `eta = 1 / L`. Pheromone follows `tau <- (1 - rho) tau + sum_k Q / L_k`. MAX-MIN clamps `tau` to a range. The final route is the argmax path. Use D2 for the ants and one pheromone field for each collection. [Latty 2011][latty11] shows that real ant networks are near Steiner trees with few loops.
- **NAT-008.** This idea is ours. From one source, the ant walk has the transition matrix `P`, the normalized `tau^alpha eta^beta`. The expected visits `n` solve `(I - P_T^T) n = e_source` on the transient nodes. The flow on a link is `n_i P_ij`. The pheromone update uses this flow. A direction bias `exp(k cos(angle to target))` in `eta` keeps the walk near its target. This is D7, so the result has no spread over seeds.
- **NAT-009.** On army-ant trails, the outbound ants walk in the outer lanes and the ants that come back in the middle ([Couzin 2003][couzin03]). Walkers in a counterflow form lanes by direction ([Helbing 1995][helbing95]). The lane key is the direction class, then the bundle order. The option `side` is `right`, `left` or `outer`. The sort is D5.
- **NAT-010.** [Bonabeau 1998][bonabeau98] gives the termite model with a pheromone in the material. Its short form is `C <- C + k C blur(C) - decay C` on a grid, then local maxima with a suppression radius `r`. [Theraulaz 1999][theraulaz99] gives the idea of stigmergy. Use D4 for the field and D5 for equal peaks.

## Drainage and trees

| Id | Idea | Step | What it does | Cost (100, 1000) | Wins | Risks | Keep if |
|---|---|---|---|---|---|---|---|
| NAT-011 | Optimal channel networks (L) | `highway` | The tree of a fan minimizes `sum Q^gamma L`. Heavy flows merge into trunks. | Sweeps of local moves. Under 50 ms per fan, 2 times `trunks`. | B1, B2, B6 | B3, R5, R6 | Its point of (B1, B3 q95) is on the front against `trunks` at each split. |
| NAT-012 | Branched transport junctions (L) | `highway` | The cost of a way grows as `w^alpha`. Targets of a fan merge into Y junctions where the weighted pulls balance. | `k^2` per fan. Under 10 ms, under 100 ms, plus repair. | B1, B6, B2, R4 | R9, B3, R5 | B6 max is 60 degrees or less and B1 is not lower than `trunks`, with 0 rule faults. |
| NAT-013 | Murray widths and angles (H) | `levels`, `curve` | A bundle of `k` edges is drawn `k^(1/3)` wide, not `k` wide. The split angle follows Murray's law. | Linear in the segments. Negligible. | B7, B6, M1 | M4, R8 | M1 is 5% lower with M4 at 0. |
| NAT-014 | Vascular tree construction (L) | `highway` | The tree of a fan grows one target at a time. Each target joins the segment where a new split adds the least volume. | `k^2` per fan. A few ms for both sizes. | B1, B6, B2 | B3, R5, R9 | B1 is higher than NAT-012 at the same B3 q95. Otherwise it is an option of NAT-012. |
| NAT-015 | Space colonization trunks (L) | `highway` | The targets are attractors. The tree grows in steps toward the mean direction of the attractors that each node holds. | `steps (S + V)`. Under 10 ms, under 100 ms. | B1, B6, C3 | R9, R5, R4 | B1 is 0.05 higher than `trunks`, B3 q95 at most 0.10 higher, 0 rule faults. |
| NAT-016 | Closed venation backbone (H) | `levels` | The items of a level link by their relative neighbourhood graph. Each level link follows that graph, so the far view has a few loops. | `k log k`. Under 10 ms. | B1, R1, Z3, B7 | R6, R9 | Z3 is not worse and the ink of the level is 10% lower. |
| NAT-017 | Balancing-factor trees (L) | `highway` | Each target joins the tree where its wire length plus `bf` times its path length to the root is least. One knob trades ink against detour. | `k^2` per fan. Under 10 ms, under 100 ms. | B1, B2, B3, R5 | B3, R5 | One value of `bf` dominates the default point of `trunks` on (B1, B3 q95). |
| NAT-018 | Knee of the plant front (H) | `highway` | A sweep of the weight gives the front of total length against path length for each fan. Each fan takes its own knee. | 11 times NAT-017. Under 0.1 s, under 1 s. | B1, B3, R5 | R8 | The hypervolume of (B1, B3) is higher than NAT-017 with its best fixed `bf`, on 2 of 3 boards. |
| NAT-019 | Bronchial splits (H) | `highway` | The targets split in two by a line through the tip. Each branch points to the center of its half, and the split repeats. | `k log^2 k` per fan. Under 10 ms. | B1, B6, B8, R4 | R5, R9 | Not dominated by the best `bf` of NAT-017, and B6 is lower. |
| NAT-020 | Mycelial spanner backbone (H) | `highway` | A minimum spanning tree over the hubs, plus a shortcut wherever the tree way is `t` times the direct way and traffic is high. | `h^2 log h` for `h` hubs. Under 1 ms, 10 ms. | R5, R6, R7, Z3 | B1, R1 | R6 is 10% lower with B1 at most 0.02 lower. |
| NAT-021 | Tropism growth router (H) | `router` | Each route grows from its plug like a root tip. It turns toward the target and away from boxes, with a limit on the turn of each step. | One distance field per target. 0.3 to 1 s, CI only. | C3, C5, R4, R15, R10 | R5, R9, R6 | C3 median is lower than `corners` with `clothoid`, and R5 q95 is at most 5% higher. |
| NAT-022 | Axon zipper (H) | `highway` | After any router, legs that run near and almost parallel zip onto one line when the shared length gains more than the extra length costs. | `S log S` for `S` segments. 5 ms, 50 to 100 ms. | B1, B2, B7, R12 | B4, R9, R5 | B1 is 0.05 higher, B4 at most 0.03 higher, and R9 stays 0. |
| NAT-023 | Harmonic field router (L) | `router`, `levels` | A Laplace field with the target low and the boxes as walls has no local minimum. The routes follow its gradient. | One grid solve per target. 0.3 to 1 s, CI only. | C3, R4, R8, B1 | R5, R6, R13 | Z3 is 0 and R8 is 20% higher than `levelLinks`. |
| NAT-024 | Pioneer and follower order (O) | `router` | Pioneer axons grow first and others follow. Edges with the longest span or the most load route first, so the followers get the discount. | `m log m` on top of `shared`. No change. | B1, B2, R5 | R5, B4 | Â12 is 0.64 or more on B1 against the input order, and R5 q95 is not worse. |

### Notes on the drainage and trees

- **NAT-011.** [Rinaldo 1992][rinaldo92] gives the optimal channel network. Its energy is `E = sum_i k_i Q_i^gamma L_i` with `gamma = 0.5`, and `Q_i` counts the area that drains through the link `i`. Here `Q_i` counts the edges of the fan whose path uses the link. A local move changes the next link of one vertex. A greedy sweep with D5 is deterministic, and annealing uses D2. [Rodriguez-Iturbe 1997][rodriguez97] and [Carraro 2020][carraro20] give the details and code.
- **NAT-012.** [Gilbert 1967][gilbert67] and [Xia 2003][xia03] give the cost `sum_e w_e^alpha L_e`. At a Y junction the three weighted unit vectors sum to zero: `w0^alpha e0 + w1^alpha e1 + w2^alpha e2 = 0`. So `cos theta1 = (w0^(2 alpha) + w1^(2 alpha) - w2^(2 alpha)) / (2 w0^alpha w1^alpha)`. Weighted Weiszfeld steps find the junction point. The merge order is by angle with D5. [Bernot 2009][bernot09] is the reference book.
- **NAT-013.** [Murray 1926][murray26] gives `r0^3 = sum r_i^3`. [Sherman 1981][sherman81] shows that the cube law makes the shear on the wall equal in all vessels. [Zamir 1976][zamir76] gives the angles. With the radius cubed proportional to the flow, the angle law is NAT-012 with `alpha = 2/3`. So the drawn width of a bundle of `k` edges is `w0 k^(1/3)`. A bundle of 8 edges is 2 lanes wide, not 8.
- **NAT-014.** [Schreiner 1993][schreiner93] and [Karch 1999][karch99] give constrained constructive optimization. The volume is `pi sum r_i^2 L_i`. Each new target tries the nearest segments, places a split by Weiszfeld steps and keeps the least added volume. The order of the targets is fixed by distance with D5.
- **NAT-015.** [Runions 2005][runions05] and [Runions 2007][runions07] give space colonization. A node `v` grows to `v + D n_v / |n_v|` with `n_v = sum (s - v) / |s - v|` over its attractors. An attractor stops when a node comes within the distance `d_k`. The method has no draws. D5 settles equal distances.
- **NAT-016.** The closed venation of [Runions 2005][runions05] links each source to the veins of its relative neighbourhood. [Toussaint 1980][toussaint80] defines that graph: `p-q` is a link if no `r` is nearer to both. It is a subgraph of the Delaunay graph and holds the minimum spanning tree, so it has a few loops.
- **NAT-017.** [Cuntz 2010][cuntz10] grows dendrites by a minimum spanning tree with a changed cost. The next target is the argmin of `d(t, v) + bf PL(v)` over the targets `t` and the tree nodes `v`. `PL(v)` is the path length from the root. `bf = 0` gives the least wire, a large `bf` gives a star. The paper finds `bf` from 0.2 to 0.7 in real neurons.
- **NAT-018.** [Conn 2017][conn17] shows that plant shoots sit near the Pareto front of total length against path length. Each species has its own place on the front. The knee is the front point farthest from the chord of the normalized front.
- **NAT-019.** [Kitaoka 1999][kitaoka99] gives a space-filling airway model. The flow ratio of a split is `r = Q1 / Q0`, and the angles follow Murray's law: `cos theta1 = (1 + r^(4/3) - (1 - r)^(4/3)) / (2 r^(2/3))`. [Mauroy 2004][mauroy04] shows that an optimal tree is fragile. A small change of its widths makes it much worse. So a small safety margin on the widths is wise.
- **NAT-020.** [Bebber 2007][bebber07] shows that fungi build a tree first and then fuse hyphae to add loops. [Althofer 1993][althofer93] gives the greedy spanner. A pair joins when `d_B(u, v) > t d(u, v)` and its demand is high. The order of the pairs is D5. The measures of [Tero 2010][tero10] report the trade: length over the tree, mean distance and fault tolerance.
- **NAT-021.** [Leitner 2010][leitner10] grows roots by tropisms. The heading follows `h' = normalize(h + s_t grad(phi_target) + s_o grad(phi_obstacle))`, with a limit `dtheta_max` on each turn. The target field is a geodesic distance by fast marching ([Sethian 1996][sethian96]), so it has no local minimum. The curvature is at most `dtheta_max / s`, so C5 has a floor.
- **NAT-022.** [Smit 2017][smit17] shows that axon shafts zip together by adhesion against tension. [Hentschel 1999][hentschel99] and [Chaudhuri 2011][chaudhuri11] model the bundling and sorting of axons. Two legs zip when `a overlap - tension dL > 0`, with an angle and a distance limit. This note reads the balance at the zipper vertex as `cos(theta / 2) = 1 - Gamma / (2 T)`. The pairs sort by gain with D5, and the passes are D1.
- **NAT-023.** [Connolly 1990][connolly90] plans paths on a solution of Laplace's equation. Such a field has no local minimum, unlike the potential fields of [Khatib 1986][khatib86]. [Goodhill 1998][goodhill98] reviews the gradients that guide axons. With `phi = 1` at the source and `phi = 0` at the target, the routes are the field lines of a dipole. The solve is D6 on a grid.
- **NAT-024.** This idea is ours. The router `shared` routes the edges one by one. So the order decides which ways become shared. [Hentschel 1999][hentschel99] gives the pioneer and follower pattern of axons. The order key is the negative span or the negative load, with the edge id as the tie break.

## Physics of surfaces and growth

| Id | Idea | Step | What it does | Cost (100, 1000) | Wins | Risks | Keep if |
|---|---|---|---|---|---|---|---|
| NAT-025 | Soap-film Steiner trees (L) | `highway` | A soap film between pins is the shortest network, with 120-degree junctions. Each fan routes along its Steiner tree. | `k^3 log k` per fan, `k` up to 30. A few ms. | B1, B7 | B3, R5, R6, B4 | It is the reference bound of B1 in the bench, not a default. |
| NAT-026 | Elastic band curves (L) | `curve` | Each route is a rubber band. Tension shortens and smooths it, and a soft push from the boxes keeps clearance. | Points times iterations. 10 ms, 100 ms. | C3, C4, R8, R4 | R9, C8, C10 | C3 median is 20% lower than `smooth`, and the clearance and end counts stay 0. |
| NAT-027 | Crystal metric (H) | `router` | A crystal grows fastest along preferred directions. The route cost uses a polygon as its unit ball, so routes use few directions. | Corners times 4 or 8 directions. 0.2 s, 2 to 5 s. | R14, R3, R4 | R5, R1, R12 | R3 is 20% lower than `corners`, and R5 q95 is at most 5% higher. |
| NAT-028 | Lightning growth (L) | `highway` | A channel grows cell by cell in a Laplace field. The chance of a cell is the field there to the power `eta`. | One field solve per growth step. Seconds per fan, CI only. | B1 | R4, C3, R5, Z10 | B1 and R4 are not worse than NAT-015. Expected drop. |
| NAT-029 | Crack partition (H) | `group` | Drying mud cracks in order, each crack across the long side of its domain. A crack follows the gaps between boxes and cuts the fewest edges. | One shortest path per split. A few ms, 50 ms. | G2, G8, G4, Z6 | G5, Z7, Z3 | G2 at the far view is lower than `cut` on 6 of 10 boards, and G5 is not worse. |
| NAT-030 | Erosion of a cost field (H) | `highway` | The route count of each cell is the flow. Flow lowers the cost, a blur smooths it, and the next pass routes again. | Passes of grid A*. 0.1 s per pass, CI only. | B1, B7, B2 | R5, R9, B4 | Not dominated by NAT-005 on (B1, R5 q95). Otherwise it is an option of NAT-005. |
| NAT-031 | Ripple spacing of plugs (O) | `plugs` | Plugs on a side are beads. Each is pulled to face its other end and pushed from its neighbours. An isotonic fit gives the exact answer. | `k log k` per side. Negligible. | R11, R10, R1 | R5 | R11 q05 is 0.2 higher and R1 is not worse. |
| NAT-032 | Phyllotaxis plug slots (O) | `plugs` | Slots at golden-angle steps. A new edge takes a new slot in the largest gap and no other plug moves. | `k log k` per side. Negligible. | Z10, R11 | R11, R1 | The moved share of Z10 is 30% lower, and R11 q05 is 0.35 or more. |
| NAT-033 | Foam groups (H) | `group` | A dry foam relaxes to cells of equal area. Seeds with a capacity take their nodes, move to the center and repeat. | `t n log n`. Under 10 ms at 1000 nodes. | G6, G4, G7 | G5, G2 | G4 is 0.05 higher than `kd` and G5 is not worse. |
| NAT-034 | Grassfire corridors (H) | `highway`, `router` | A fire lit at all box sides meets on the medial axis. Highways run on that axis, down the middle of the gaps. | `n log n`. 50 ms at 1000 nodes, then `shared`. | R8, R12, B1, C7 | R5, R3, R14 | The count of tight routes is 50% lower, and R5 q95 is at most 10% higher. |
| NAT-035 | Snell merges (O) | `highway`, `curve` | A route joins a highway with the discount `d` at the angle `acos(d)`, as light bends into a fast medium. | Constant per merge. Negligible. | B6, R4, C3, R5 | R9, R14 | B6 max is 75 degrees or less and R9 stays 0. |
| NAT-036 | Magnetic flow direction (H) | `router` | A leg that points against a chosen field costs more. Routes flow one way, so fewer routes go back. | No change in time class. | R7, R4 | R5, R1 | R7 is 30% lower than `corners`, and R5 q95 is at most 5% higher. |
| NAT-037 | Current corridors (H) | `highway` | Each edge injects a unit current. The sum of the absolute currents on each link marks the corridors. `shared` gives them the discount. | One solve per source group. 0.1 s, 1 to 3 s or under 0.5 s with a sketch. | B1, B2, B4, R5 | R1 | Not dominated by `shared-all` on (B1, B3 q95), and B4 is lower. |

### Notes on the physics of surfaces and growth

- **NAT-025.** [Smith 1992][smith92] gives an exact Euclidean method for small sets. [Kahng 1990][kahng90] gives the iterated 1-Steiner heuristic. [Zachariasen 1999][zachariasen99] adds obstacles. Each Steiner point has 3 links at 120 degrees. The heuristic adds the candidate point that cuts the tree length most, with D5. The tree is the case `alpha = 0` of NAT-012.
- **NAT-026.** [Quinlan 1993][quinlan93] gives elastic bands. Each point moves by `k_c (x_(i-1) + x_(i+1) - 2 x_i) + k_r sum_b grad(rho_b(x_i))`, with `rho_b = max(0, d0 - dist(x, b))`. This is a discrete curve-shortening flow ([Gage 1986][gage86]) with a push from the boxes. D1 and D4 make it deterministic.
- **NAT-027.** [Wulff 1901][wulff01] gives the equilibrium shape of a crystal, and [Taylor 1992][taylor92] the crystalline models of growth. The cost of a vector is `||v||_W = min { lambda : v in lambda W }`. A square `W` gives the rectilinear metric, an octagon the octilinear metric of metro maps. A state graph of corner and direction adds a bend cost.
- **NAT-028.** [Niemeyer 1984][niemeyer84] gives the dielectric breakdown model. The chance of a frontier cell is `|grad phi_i|^eta / sum_j |grad phi_j|^eta`. `eta = 1` gives diffusion-limited aggregation ([Witten 1981][witten81]). A large `eta` gives straight channels. [Kim 2007][kim07] makes it fast for animation. D8 makes it deterministic. One field solve per cell keeps it slow.
- **NAT-029.** [Bohn 2005a][bohn05a] and [Bohn 2005b][bohn05b] show that cracks split domains in order and meet older cracks at right angles. Here a crack is the cheapest path across the cell on the gap graph. Its cost is the edges cut plus `lambda` times its length. A balance limit `beta` is as in the rule `cut` of [GROUPING](GROUPING.md). D5 settles equal paths.
- **NAT-030.** [Howard 1994][howard94] gives the stream power law `dz/dt = U - K A^m S^n + D lap(z)`. [Musgrave 1989][musgrave89] uses erosion for terrain. Here `z` is the cost field and `A` is the route count of each cell. The ratio `D / K` sets the spacing between channels. D1 and D4 make it deterministic.
- **NAT-031.** This idea is ours. [Werner 1995][werner95] and [Anderson 1987][anderson87] model the even spacing of sand ripples and dunes. On one side of a box, minimize `sum (x_i - t_i)^2` with `x_(i+1) - x_i >= s`, in the order of the target angles. The change `y_i = x_i - i s` makes it an isotonic fit. Pool-adjacent-violators solves it exactly in linear time, with no draws.
- **NAT-032.** This idea is ours. [Vogel 1979][vogel79] gives the golden angle of 137.508 degrees. Along a side, the slot `k` sits at `frac(k / phi)` of the length. The ratio of the smallest gap to the largest gap stays above `1 / phi`. The method has no draws.
- **NAT-033.** [Lloyd 1982][lloyd82] gives the relaxation step. [Balzer 2009][balzer09] adds a capacity to each cell. [Weaire 1999][weaire99] gives the physics of foams. A swap of two nodes between two groups is kept when it lowers `sum |c_v - s_g|^2` and keeps the sizes. D5 orders the swaps.
- **NAT-034.** [Blum 1967][blum67] gives the grassfire transform. The medial axis is the Voronoi diagram of the box sides ([Aurenhammer 1991][aurenhammer91]). A link of the axis costs `L (1 + lambda / clearance)`. Short spurs join the plugs. The method has no draws.
- **NAT-035.** This idea is ours. A route at the distance `h` from a highway minimizes `sqrt(h^2 + x^2) + d (X - x)`. The optimum has `cos theta = d`, so the merge point sits `h d / sqrt(1 - d^2)` before the foot of the perpendicular. This is Snell's law ([Born 1999][born99]). The [scratch table](#snell-merges) gives the angles.
- **NAT-036.** [Sugiyama 1995][sugiyama95] gives the magnetic spring model. Here a leg costs `L (1 + c_m ((1 - cos theta) / 2)^beta)`, with `theta` the angle between the leg and the field. The field is parallel, radial or concentric.
- **NAT-037.** [Newman 2005][newman05] and [Brandes 2005][brandes05] give the current-flow betweenness. For each edge, solve `L p = b_e` and sum `|c_ij (p_i - p_j)|` on each link. [Spielman 2011][spielman11] gives a sketch with `O(log m)` random right sides. The sketch uses D2, and the solves use D6.

## Collectives and patterns

| Id | Idea | Step | What it does | Cost (100, 1000) | Wins | Risks | Keep if |
|---|---|---|---|---|---|---|---|
| NAT-038 | Boids lanes (H) | `highway` | Points of routes with a similar direction align, move together and keep a separation. Bundles form with lanes at the separation distance. | Iterations times neighbours. A few ms, 0.3 s. | B7, R12, B9 | R9, R5, C3, B4 | B7 is 10% lower with R9 at 0. |
| NAT-039 | Cell-sorting groups (H) | `group` | Like cells stick more strongly, so mixed cells sort out. Each node takes the label that costs the least adhesion and keeps the most edges inside. | Sweeps times `n + m`. 5 ms per sweep at 1000 nodes. | G1, G2, G4, G7 | G5, Z6, G9 | G2 at the far view is lower than `cut` on 6 of 10 boards, and G5 is not worse. |
| NAT-040 | Reaction-diffusion hub spacing (H) | `group` | An activator and a fast inhibitor make spots at an even spacing. The spots are the hubs, and a larger range gives the next level. | `T G`. 0.1 to 0.3 s for both sizes. | Z5, G6, R5 | G2, Z6, Z7 | The spread of `log(Z5)` is 30% lower, and G2 is at most 0.03 worse. |
| NAT-041 | Meinhardt nets (L) | `highway` | An activator, an inhibitor and a substrate make net lines that branch to the places in need. The line cells are the highway net. | `T G` with 4 fields. Seconds, CI only. | B1, B7 | R9, R5, Z10 | B1 is not lower than NAT-001, at a lower time. Expected drop. |
| NAT-042 | Remodelling room (H) | `room` | Bone grows where the load is high and thins where it is low. Each gap grows by its lane load over its width, under a fixed area budget. | Passes of route and `roomDemand`. 0.3 s, a few seconds. | M4, M1, R5 | M3, Z10 | M4 is 0 at an M1 of 1.35 or less. |

### Notes on the collectives and patterns

- **NAT-038.** [Reynolds 1987][reynolds87] gives the three rules of a flock: align, cohere and separate. [Vicsek 1995][vicsek95] gives the alignment model. Here only the points of other routes within `r` and with a similar direction count. A spring to the first route and a push from the boxes keep the route valid. D4 makes it deterministic. Unlike force-directed bundling, the separation keeps the lanes apart.
- **NAT-039.** [Steinberg 1963][steinberg63] gives differential adhesion. [Graner 1992][graner92] gives the cellular Potts model. Here `H = sum J (1 - delta(s_i, s_j)) - sum w delta(s_i, s_j) + lambda sum (a_g - A)^2`. Sweeps at zero temperature with D5 are deterministic. Sweeps at a temperature use D2.
- **NAT-040.** [Turing 1952][turing52] and [Gierer 1972][gierer72] give the activator and inhibitor. The spacing grows with `sqrt(D_h / D_a)`, so a ladder of ranges gives the levels. The node density seeds the activator. D1 and D4 make it deterministic.
- **NAT-041.** [Meinhardt 1976][meinhardt76] gives the model of lines and nets with four fields. A cell that becomes a line cell stays one. The model has eight or more rate constants, so it is hard to tune.
- **NAT-042.** [Huiskes 1987][huiskes87] gives adaptive bone remodelling: `d rho / dt = B (S / rho - k)`. Here the stimulus of a gap is its lane width over its width. Each pass sets `w_g <- w_g (1 + eta (S_g / S* - 1))` and scales the sum back to the budget. The note ROOM-A of the roadmap found 2 lane routes through a box at an M1 of 1.46. This idea aims at 0 with less area.

## Search over the options

| Id | Idea | Step | What it does | Cost (100, 1000) | Wins | Risks | Keep if |
|---|---|---|---|---|---|---|---|
| NAT-043 | Annealing of the choices (L) | `whole` | A hot search accepts some worse moves, then cools. It searches the plug sides, the lane orders and the bundle members. | Moves times the cost change. 0.1 s for lane orders, CI only with routes. | R1, B5, R11 | Z10, R5 | End crossings are 10% lower than `laneOrder` `bundle`. |
| NAT-044 | NSGA-II over the options (L) | `whole` | A population of settings evolves. Pareto rank and crowding keep a spread-out front of the measures. | Generations times population times a route. 200 s at 100 nodes, CI only. | B1, B3, R5, M1 | Z10 | Its front has the hypervolume of the grid sweep within 2%, with fewer runs. |
| NAT-045 | MAP-Elites atlas (H) | `whole` | The best setting in each cell of a grid of looks, for example ink against detour. The playground shows the atlas. | As NAT-044. A static file for each example board. | B1, R5, C3 | Z10 | It fills 30% more cells than a grid sweep with the same runs. |
| NAT-046 | Particle swarm and CMA-ES (L) | `whole` | Particles fly to their own best and the swarm best. CMA-ES shapes a Gaussian cloud. Both tune the continuous options. | 20 particles times 30 iterations times a route. CI only above 100 nodes. | B1, R5 | Z10 | It reaches 1% of the best grid score with a third of the runs. |
| NAT-047 | Firefly and bee searches (L) | `whole` | Fireflies move to brighter ones, so the swarm splits over several peaks. Bees send more workers to rich sites. | As NAT-046. | B1, R5 | Z10 | It finds a second optimum that NAT-046 misses. Expected drop. |
| NAT-048 | Use-it-or-lose-it pruning (H) | `highway` | Start from all runs of `shared-all`. Prune the runs that save the least, at a rate that falls with each round. | 2 to 3 times `shared-all`. | B8, B4, R5 | B1, B2 | B4 is 0.05 lower, with B1 at most 0.03 lower. |
| NAT-049 | Multiscale Physarum (O) | `levels` | The tube model runs on the coarse level first. Its tubes start the conductances of the next level, so the fine highways follow the far view. | Half of NAT-001. | Z9, Z10, Z7 | B1, R5 | Z9 is 30% lower than NAT-001 alone. |

### Notes on the search over the options

- **NAT-043.** [Kirkpatrick 1983][kirkpatrick83] gives simulated annealing. [Davidson 1996][davidson96] uses it to draw graphs. A move is accepted with `min(1, exp(-dE / T))`, and `T` falls by a factor `c`. The energy is a weighted sum of the scaled MEAS0 scores. D2 gives the draws.
- **NAT-044.** [Holland 1992][holland92] gives the genetic algorithm. [Deb 2002][deb02] gives NSGA-II, with a fast sort by Pareto rank and a crowding distance. D2 gives the draws. TUNE can use it in CI for 3 or 4 options at once.
- **NAT-045.** [Mouret 2015][mouret15] gives MAP-Elites. The archive keeps the best setting of each cell of the descriptors. The archive is a good input for a picker in the playground. A reader picks a look, not a weight.
- **NAT-046.** [Kennedy 1995][kennedy95] gives particle swarms: `v <- w v + c1 r1 (p - x) + c2 r2 (g - x)`. [Hansen 2001][hansen01] gives CMA-ES. Both use D2.
- **NAT-047.** [Yang 2009][yang09] gives the firefly algorithm, [Karaboga 2007][karaboga07] the artificial bee colony and [Pham 2006][pham06] the bees algorithm. [Sorensen 2015][sorensen15] warns that many of these methods are known methods under a new name. So the screen compares them to NAT-046, not to a grid.
- **NAT-048.** [Navlakha 2015][navlakha15] shows that the brain prunes synapses at a falling rate, and that this rate gives efficient and robust networks. Here the use of a run is the edges on it minus 1, times its length. The prune order is D5.
- **NAT-049.** This idea is ours. The start conductance of a link at the level `d + 1` is `1 + kappa D^(d)` of the corridor of its parent items. Then NAT-001 runs with fewer steps. Z9 must be in the suite before the screen.

## The scratch runs

These runs are small throwaway scripts on made-up boards. They check the formulas and the determinism of this note. They are not in the repository, and they are not measures of the bench.

### Physarum on a small board

The board is a lattice of 30 × 30 points with 2 box obstacles and 6 terminals. Each step does one conjugate gradient solve for each terminal as the source, with the others as sinks. `|Q|` is the root mean square over the solves. The update is `D += 0.5 (f - D)`, and the start is `1 + 0.01 hash(e)`. The table gives the kept length over the rectilinear minimum spanning tree of the terminals.

| `g` | `I0` | Kept length / tree | Shape |
|---|---|---|---|
| 1.0 | 0.5 | 1.03 | Tree |
| 1.0 | 2 | 5.45 | Mesh with loops |
| 1.0 | 6 | 10.44 | Mesh with loops |
| 1.8 | 0.5 | 0.99 | Near the Steiner tree |
| 1.8 | 2 | 0.99 | Near the Steiner tree |
| 1.8 | 6 | 1.65 | Tree with a few loops |
| 3 | 0.5 | 1.24 | Tree with detours |
| 3 | 2 | 1.57 | Tree with detours |
| 3 | 6 | 1.01 | Tree |

- A second run gives the same kept count, 94 links. So the model is deterministic with D3 and D6.
- The values of the paper, `g = 1.8` and `I0 = 2`, give a tree that is 1% shorter than the rectilinear tree. The Steiner points give the gain.
- `g = 1` keeps loops at a large `I0`. This is the loop regime of the paper.
- One run takes from 0.75 s to 1.1 s on a shared machine. This time is not reliable.

### Junction angles

The scratch run checks the equal split of NAT-012 by Weiszfeld steps. The table gives the full angle between the two branches.

| `alpha` | Model | Angle |
|---|---|---|
| 0 | Steiner tree, soap film | 120.0 degrees |
| 0.5 | Branched transport, rivers | 90.0 degrees |
| 2/3 | Murray's law, vessels | 74.9 degrees |
| 1 | Straight edges | No junction |

### Snell merges

The scratch run checks NAT-035 by a search over the merge point. The table gives the angle between the route and the highway.

| Discount `d` | Merge angle `acos(d)` |
|---|---|
| 0.25 | 75.52 degrees |
| 0.50 | 60.00 degrees |
| 0.75 | 41.41 degrees |

The router `shared` uses a link cost of `discount` times the length on a used link, with `discount = 0.5` by default. So its best merge angle is 60 degrees, not 90 degrees.

## The ranking

The value is the expected gain on the measures of MEAS0 if the screen keeps the idea. The cost is the size of the prototype and the time class. The rank is the value over the cost.

| Rank | Id | Value | Cost | Why |
|---|---|---|---|---|
| 1 | NAT-024 | Medium | S, no time change | An option of `shared`. It tests the order effect that all greedy routers have. |
| 2 | NAT-017 | High | S, `k^2` | One knob for the main trade of a fan. It gives a front, not a point. |
| 3 | NAT-022 | High | S, `S log S` | A post step after any router. It adds bundles where routes already run together. |
| 4 | NAT-035 | Medium | S, constant | A closed form. It changes only the merge points, and B6 measures it. |
| 5 | NAT-031 | Medium | S, linear | An exact method for the plug spacing, with no draws. |
| 6 | NAT-020 | Medium | S, under 10 ms | It adds loops to the hub tree of `sections`, which lowers the worst detour. |
| 7 | NAT-012 and NAT-013 | High | M, `k^2` | The common law of rivers, vessels and soap films, with its junction angles and widths. |
| 8 | NAT-001 | High | M, seconds at 1000 nodes | The best known model of nature for this problem. The gap in the literature makes it new. |
| 9 | NAT-005 | High | M, passes of `shared` | Shared trails from single routes, with one number `kappa` for the shape. |
| 10 | NAT-026 | Medium | S, linear | A curve with clearance. It completes the curve families of CURVES. |
| 11 | NAT-032 | Medium | S, negligible | Plugs that do not move when an edge is added. Z10 measures it. |
| 12 | NAT-042 | Medium | S, passes | Room where the load is. It aims at the fault that ROOM-A found. |
| 13 | NAT-039 | Medium | M, sweeps | Groups that keep the edges inside and the regions compact. |
| 14 | NAT-037 | Medium | M, solves | Corridors from all ways at once, not from the order of the edges. |

The ideas that the screens are expected to drop are NAT-002, NAT-028, NAT-041 and NAT-047. Each one is in the catalog with its screen, so BUILD-W can show the drop.

## The build order

BUILD-W builds the ideas in this order. Each idea gets its own folder, its tests and a row in the benchmark, as [CLAUDE](../../CLAUDE.md) tells.

1. NAT-024, the order of the edges in `shared`. Add the option `order` with `input`, `span-desc`, `span-asc` and `load`.
2. NAT-017, the balancing-factor tree for each fan of `trunks`. Sweep `bf` over 0, 0.2, 0.4, 0.7 and 1.
3. NAT-022, the axon zipper as a post step. Run it after `corners` and after `plugs`.
4. NAT-035, the Snell merge points in `shared` and `trunks`. B6 must be in the suite first.
5. NAT-031, the ripple spacing of the plugs, by pool-adjacent-violators.
6. NAT-020, the spanner backbone for the hubs of `sections`.
7. NAT-012 with NAT-013, the branched-transport junctions with Murray widths.
8. NAT-001, the Physarum highways, first on the hub graph, then on the corner graph in CI.
9. NAT-005, the active walker passes on top of `shared`.
10. NAT-026, the elastic band as a curve strategy.
11. NAT-032, the golden slots as an option of the plugs.
12. NAT-042, the remodelling room as a strategy of the step `room`.
13. NAT-039, the cell-sorting groups as a strategy of the step `group`.
14. NAT-037, the current corridors as a strategy of the step `highway`.

### The five cheapest screens

| Id | Screen | Why it is cheap |
|---|---|---|
| NAT-024 | `shared-all` with 4 orders on 5 boards and 5 seeds. | One sort. The bench runs today. |
| NAT-009 | `shared-all` with the lanes sorted by direction on 2 boards. | One sort key. |
| NAT-031 | The plug spacing on 2 boards, R11 q05 and R1. | Linear time, no routing change. |
| NAT-032 | The golden slots on 2 boards, Z10 after one added edge. | One formula. |
| NAT-013 | The room demand with widths `k^(1/3)` on 1 board. | One exponent in the width. |

## Combinations with the other families

The other notes of the idea program are in work at the same time as this note. So the catalog has no ids of other families in `related`. These links are by family:

- **HWY-R (highway formation).** NAT-001, NAT-005, NAT-037 and NAT-012 are strategies of the step `highway`. Each one can feed the force-directed or kernel bundling methods of HWY-R as a start. NAT-022 and NAT-038 are post steps that a bundling method of HWY-R can replace or follow.
- **RULE-R (rules for the drawing).** The energy methods NAT-026 and NAT-038 are force rules. The search methods NAT-043 to NAT-046 can tune the weights of any rule set of RULE-R. NAT-045 gives an atlas of rule settings.
- **EDA-R (routing from other fields).** NAT-025 is the Steiner tree of chip routing. NAT-005 and NAT-007 are near the negotiated congestion of PathFinder, where a used resource changes its cost each pass. NAT-027 with an octagon is the octilinear metric of metro maps.
- **WILD-R (our own ideas).** NAT-008, NAT-031, NAT-032, NAT-035 and NAT-049 are ours. Each one can pair with a WILD-R idea for the same step.
- **Inside this family.** NAT-017 and NAT-018 make the trees of a fan, and NAT-013 sets their widths. NAT-001 gives the corridors, NAT-003 adds loops and NAT-048 prunes. NAT-049 joins NAT-001 to the levels.

## Surprises and gaps

- **No bundling from slime molds or ants.** A search of the literature found no edge-bundling method based on Physarum or on ant pheromones. Ants and slime molds are used for shortest paths and network design only.
- **A deterministic slime mold.** With a fixed cycle of the sources and a hash start, the model gives the same network each run. At the values of the paper, it reaches the Steiner length on the scratch board.
- **One law for three processes.** Murray's law, river networks and soap films are cases of one cost, `sum w^alpha L`. Only `alpha` changes.
- **The discount sets an angle.** The default discount 0.5 of `shared` sets an ideal merge angle of 60 degrees. B6 can test it.
- **Gap: the ids of other families.** The notes HWY-R, RULE-R, EDA-R and WILD-R were not merged when this note was written. A later pass fills `related` with their ids.
- **Gap: a measure for loops.** No MEAS0 measure counts the loops of a highway network or its fault tolerance. NAT-003 and NAT-020 use R6 in its place. [Tero 2010][tero10] gives a fault tolerance measure that MEAS0 can add.

## Sources

- <a id="althofer93"></a>Althöfer, Das, Dobkin, Joseph and Soares, 1993. [On sparse spanners of weighted graphs](https://doi.org/10.1007/BF02189308). Discrete and Computational Geometry 9.
- <a id="anderson87"></a>Anderson, 1987. [A theoretical model for aeolian impact ripples](https://doi.org/10.1111/j.1365-3091.1987.tb00814.x). Sedimentology 34.
- <a id="aurenhammer91"></a>Aurenhammer, 1991. [Voronoi diagrams: a survey of a fundamental geometric data structure](https://doi.org/10.1145/116873.116880). ACM Computing Surveys 23(3).
- <a id="balzer09"></a>Balzer, Schlömer and Deussen, 2009. [Capacity-constrained point distributions: a variant of Lloyd's method](https://doi.org/10.1145/1531326.1531392). ACM TOG 28(3).
- <a id="bebber07"></a>Bebber, Hynes, Darrah, Boddy and Fricker, 2007. [Biological solutions to transport network design](https://doi.org/10.1098/rspb.2007.0459). Proc. R. Soc. B 274.
- <a id="bernot09"></a>Bernot, Caselles and Morel, 2009. [Optimal transportation networks: models and theory](https://doi.org/10.1007/978-3-540-69315-4). Springer.
- <a id="blum67"></a>Blum, 1967. A transformation for extracting new descriptors of shape. In Models for the Perception of Speech and Visual Form, MIT Press. The page [Medial axis](https://en.wikipedia.org/wiki/Medial_axis) gives a summary.
- <a id="bohn05a"></a>Bohn, Pauchard and Couder, 2005. [Hierarchical crack pattern as formed by successive domain divisions](https://doi.org/10.1103/PhysRevE.71.046214). Phys. Rev. E 71.
- <a id="bohn05b"></a>Bohn, Douady and Couder, 2005. [Four sided domains in hierarchical space dividing patterns](https://doi.org/10.1103/PhysRevLett.94.054503). Phys. Rev. Lett. 94.
- <a id="bohn07"></a>Bohn and Magnasco, 2007. [Structure, scaling, and phase transition in the optimal transport network](https://doi.org/10.1103/PhysRevLett.98.088702). Phys. Rev. Lett. 98.
- <a id="bonabeau98"></a>Bonabeau, Theraulaz, Deneubourg, Franks, Rafelsberger, Joly and Blanco, 1998. [A model for the emergence of pillars, walls and royal chambers in termite nests](https://doi.org/10.1098/rstb.1998.0310). Phil. Trans. R. Soc. B 353.
- <a id="bonifaci12"></a>Bonifaci, Mehlhorn and Varma, 2012. [Physarum can compute shortest paths](https://arxiv.org/abs/1106.0423). Journal of Theoretical Biology 309.
- <a id="born99"></a>Born and Wolf, 1999. [Principles of optics](https://doi.org/10.1017/CBO9781139644181). Cambridge University Press.
- <a id="brandes05"></a>Brandes and Fleischer, 2005. [Centrality measures based on current flow](https://doi.org/10.1007/978-3-540-31856-9_44). STACS 2005.
- <a id="carraro20"></a>Carraro, Bertuzzo, Fronhofer and others, 2020. [Generation and application of river network analogues for use in ecology and evolution](https://doi.org/10.1002/ece3.6479). Ecology and Evolution 10.
- <a id="chaudhuri11"></a>Chaudhuri, Borowski and Zapotocky, 2011. [A model of fasciculation and sorting in mixed populations of axons](https://arxiv.org/abs/1003.5397). Phys. Rev. E 84.
- <a id="conn17"></a>Conn, Pedmale, Chory and Navlakha, 2017. [High-resolution laser scanning reveals plant architectures that reflect universal network design principles](https://doi.org/10.1016/j.cels.2017.06.017). Cell Systems 5(1).
- <a id="connolly90"></a>Connolly, Burns and Weiss, 1990. [Path planning using Laplace's equation](https://doi.org/10.1109/ROBOT.1990.126315). IEEE ICRA 1990.
- <a id="corson10"></a>Corson, 2010. [Fluctuations and redundancy in optimal transport networks](https://doi.org/10.1103/PhysRevLett.104.048703). Phys. Rev. Lett. 104.
- <a id="couzin03"></a>Couzin and Franks, 2003. [Self-organized lane formation and optimized traffic flow in army ants](https://doi.org/10.1098/rspb.2002.2210). Proc. R. Soc. B 270.
- <a id="cuntz10"></a>Cuntz, Forstner, Borst and Häusser, 2010. [One rule to grow them all: a general theory of neuronal branching and its practical application](https://doi.org/10.1371/journal.pcbi.1000877). PLoS Comput. Biol. 6(8).
- <a id="davidson96"></a>Davidson and Harel, 1996. [Drawing graphs nicely using simulated annealing](https://doi.org/10.1145/234535.234538). ACM TOG 15(4).
- <a id="deb02"></a>Deb, Pratap, Agarwal and Meyarivan, 2002. [A fast and elitist multiobjective genetic algorithm: NSGA-II](https://doi.org/10.1109/4235.996017). IEEE TEC 6(2).
- <a id="dorigo96"></a>Dorigo, Maniezzo and Colorni, 1996. [Ant system: optimization by a colony of cooperating agents](https://doi.org/10.1109/3477.484436). IEEE SMC-B 26(1).
- <a id="dorigo97"></a>Dorigo and Gambardella, 1997. [Ant colony system: a cooperative learning approach to the traveling salesman problem](https://doi.org/10.1109/4235.585892). IEEE TEC 1(1).
- <a id="feugier05"></a>Feugier, Mochizuki and Iwasa, 2005. [Self-organization of the vascular system in plant leaves](https://doi.org/10.1016/j.jtbi.2005.03.017). Journal of Theoretical Biology 236.
- <a id="gage86"></a>Gage and Hamilton, 1986. [The heat equation shrinking convex plane curves](https://doi.org/10.4310/jdg/1214439902). J. Differential Geometry 23.
- <a id="gierer72"></a>Gierer and Meinhardt, 1972. [A theory of biological pattern formation](https://doi.org/10.1007/BF00289234). Kybernetik 12.
- <a id="gilbert67"></a>Gilbert, 1967. [Minimum cost communication networks](https://doi.org/10.1002/j.1538-7305.1967.tb04250.x). Bell System Technical Journal 46.
- <a id="goodhill98"></a>Goodhill, 1998. [Mathematical guidance for axons](https://doi.org/10.1016/S0166-2236(97)01203-4). Trends in Neurosciences 21(6).
- <a id="graner92"></a>Graner and Glazier, 1992. [Simulation of biological cell sorting using a two-dimensional extended Potts model](https://doi.org/10.1103/PhysRevLett.69.2013). Phys. Rev. Lett. 69.
- <a id="hansen01"></a>Hansen and Ostermeier, 2001. [Completely derandomized self-adaptation in evolution strategies](https://doi.org/10.1162/106365601750190398). Evolutionary Computation 9(2).
- <a id="helbing95"></a>Helbing and Molnár, 1995. [Social force model for pedestrian dynamics](https://arxiv.org/abs/cond-mat/9805244). Phys. Rev. E 51.
- <a id="helbing97"></a>Helbing, Keltsch and Molnár, 1997. [Modelling the evolution of human trail systems](https://arxiv.org/abs/cond-mat/9805158). Nature 388. The same authors with Schweitzer give the [active walker model](https://arxiv.org/abs/cond-mat/9806097), Phys. Rev. E 56.
- <a id="hentschel99"></a>Hentschel and van Ooyen, 1999. [Models of axon guidance and bundling during development](https://doi.org/10.1098/rspb.1999.0913). Proc. R. Soc. B 266.
- <a id="holland92"></a>Holland, 1992. [Adaptation in natural and artificial systems](https://doi.org/10.7551/mitpress/1090.001.0001). MIT Press. The first edition is from 1975.
- <a id="howard94"></a>Howard, 1994. [A detachment-limited model of drainage basin evolution](https://doi.org/10.1029/94WR00757). Water Resources Research 30(7).
- <a id="huiskes87"></a>Huiskes, Weinans, Grootenboer, Dalstra, Fudala and Slooff, 1987. [Adaptive bone-remodeling theory applied to prosthetic-design analysis](https://doi.org/10.1016/0021-9290(87)90030-3). Journal of Biomechanics 20.
- <a id="jones10"></a>Jones, 2010. [Characteristics of pattern formation and evolution in approximations of Physarum transport networks](https://doi.org/10.1162/artl.2010.16.2.16202). Artificial Life 16(2).
- <a id="kahng90"></a>Kahng and Robins, 1990. [A new class of Steiner tree heuristics with good performance: the iterated 1-Steiner approach](https://doi.org/10.1109/ICCAD.1990.129944). ICCAD 1990.
- <a id="karaboga07"></a>Karaboga and Basturk, 2007. [A powerful and efficient algorithm for numerical function optimization: artificial bee colony (ABC) algorithm](https://doi.org/10.1007/s10898-007-9149-x). J. Global Optimization 39.
- <a id="karch99"></a>Karch, Neumann, Neumann and Schreiner, 1999. [A three-dimensional model for arterial tree representation, generated by constrained constructive optimization](https://doi.org/10.1016/S0010-4825(98)00045-6). Computers in Biology and Medicine 29.
- <a id="katifori10"></a>Katifori, Szöllősi and Magnasco, 2010. [Damage and fluctuations induce loops in optimal transport networks](https://doi.org/10.1103/PhysRevLett.104.048704). Phys. Rev. Lett. 104.
- <a id="kennedy95"></a>Kennedy and Eberhart, 1995. [Particle swarm optimization](https://doi.org/10.1109/ICNN.1995.488968). ICNN 1995.
- <a id="khatib86"></a>Khatib, 1986. [Real-time obstacle avoidance for manipulators and mobile robots](https://doi.org/10.1177/027836498600500106). IJRR 5(1).
- <a id="kim07"></a>Kim and Lin, 2007. [Fast animation of lightning using an adaptive mesh](https://doi.org/10.1109/TVCG.2007.38). IEEE TVCG 13(2).
- <a id="kirkpatrick83"></a>Kirkpatrick, Gelatt and Vecchi, 1983. [Optimization by simulated annealing](https://doi.org/10.1126/science.220.4598.671). Science 220.
- <a id="kitaoka99"></a>Kitaoka, Takaki and Suki, 1999. [A three-dimensional model of the human airway tree](https://doi.org/10.1152/jappl.1999.87.6.2207). J. Applied Physiology 87(6).
- <a id="latty11"></a>Latty, Ramsch, Ito, Nakagaki, Sumpter, Middendorf and Beekman, 2011. [Structure and formation of ant transportation networks](https://doi.org/10.1098/rsif.2010.0612). J. R. Soc. Interface 8.
- <a id="leitner10"></a>Leitner, Klepsch, Bodner and Schnepf, 2010. [A dynamic root system growth model based on L-Systems](https://doi.org/10.1007/s11104-010-0284-7). Plant and Soil 332.
- <a id="lloyd82"></a>Lloyd, 1982. [Least squares quantization in PCM](https://doi.org/10.1109/TIT.1982.1056489). IEEE Trans. Information Theory 28(2).
- <a id="mauroy04"></a>Mauroy, Filoche, Weibel and Sapoval, 2004. [`An optimal bronchial tree may be dangerous`](https://doi.org/10.1038/nature02287). Nature 427.
- <a id="meinhardt76"></a>Meinhardt, 1976. [Morphogenesis of lines and nets](https://doi.org/10.1111/j.1432-0436.1976.tb01478.x). Differentiation 6.
- <a id="mitchison80"></a>Mitchison, 1980. [A model for vein formation in higher plants](https://doi.org/10.1098/rspb.1980.0015). Proc. R. Soc. B 207.
- <a id="mouret15"></a>Mouret and Clune, 2015. [Illuminating search spaces by mapping elites](https://arxiv.org/abs/1504.04909). arXiv 1504.04909.
- <a id="murray26"></a>Murray, 1926. [The physiological principle of minimum work: the vascular system and the cost of blood volume](https://doi.org/10.1073/pnas.12.3.207). PNAS 12(3).
- <a id="musgrave89"></a>Musgrave, Kolb and Mace, 1989. [The synthesis and rendering of eroded fractal terrains](https://doi.org/10.1145/74334.74337). SIGGRAPH 1989.
- <a id="navlakha15"></a>Navlakha, Barth and Bar-Joseph, 2015. [Decreasing-rate pruning optimizes the construction of efficient and robust distributed networks](https://doi.org/10.1371/journal.pcbi.1004347). PLoS Comput. Biol. 11(7).
- <a id="newman05"></a>Newman, 2005. [A measure of betweenness centrality based on random walks](https://doi.org/10.1016/j.socnet.2004.11.009). Social Networks 27.
- <a id="niemeyer84"></a>Niemeyer, Pietronero and Wiesmann, 1984. [Fractal dimension of dielectric breakdown](https://doi.org/10.1103/PhysRevLett.52.1033). Phys. Rev. Lett. 52.
- <a id="pham06"></a>Pham, Ghanbarzadeh, Koç, Otri, Rahim and Zaidi, 2006. [The bees algorithm: a novel tool for complex optimisation problems](https://doi.org/10.1016/B978-008045157-2/50081-X). IPROMS 2006.
- <a id="quinlan93"></a>Quinlan and Khatib, 1993. [Elastic bands: connecting path planning and control](https://doi.org/10.1109/ROBOT.1993.291936). IEEE ICRA 1993.
- <a id="reynolds87"></a>Reynolds, 1987. [Flocks, herds and schools: a distributed behavioral model](https://doi.org/10.1145/37401.37406). SIGGRAPH 1987.
- <a id="rinaldo92"></a>Rinaldo, Rodríguez-Iturbe, Rigon, Bras, Ijjász-Vásquez and Marani, 1992. [Minimum energy and fractal structures of drainage networks](https://doi.org/10.1029/92WR00801). Water Resources Research 28(9).
- <a id="rodriguez97"></a>Rodríguez-Iturbe and Rinaldo, 1997. [Fractal river basins: chance and self-organization](https://doi.org/10.1063/1.882305). Cambridge University Press. The link is a review of the book.
- <a id="runions05"></a>Runions, Fuhrer, Lane, Federl, Rolland-Lagan and Prusinkiewicz, 2005. [Modeling and visualization of leaf venation patterns](https://doi.org/10.1145/1073204.1073251). ACM TOG 24(3).
- <a id="runions07"></a>Runions, Lane and Prusinkiewicz, 2007. [Modeling trees with a space colonization algorithm](https://algorithmicbotany.org/papers/colonization.egwnp2007.html). Eurographics Workshop on Natural Phenomena 2007.
- <a id="sachs81"></a>Sachs, 1981. [The control of the patterned differentiation of vascular tissues](https://doi.org/10.1016/S0065-2296(08)60351-1). Advances in Botanical Research 9.
- <a id="schreiner93"></a>Schreiner and Buxbaum, 1993. [Computer-optimization of vascular trees](https://doi.org/10.1109/10.243413). IEEE Trans. Biomedical Engineering 40(5).
- <a id="sethian96"></a>Sethian, 1996. [A fast marching level set method for monotonically advancing fronts](https://doi.org/10.1073/pnas.93.4.1591). PNAS 93(4).
- <a id="sherman81"></a>Sherman, 1981. [On connecting large vessels to small: the meaning of Murray's law](https://doi.org/10.1085/jgp.78.4.431). J. General Physiology 78(4).
- <a id="smit17"></a>Šmít, Fouquet, Pincet, Zapotocky and Brezina, 2017. [Axon tension regulates fasciculation/defasciculation through the control of axon shaft zippering](https://doi.org/10.7554/eLife.19907). eLife 6.
- <a id="smith92"></a>Smith, 1992. [How to find Steiner minimal trees in Euclidean d-space](https://doi.org/10.1007/BF01758756). Algorithmica 7.
- <a id="sorensen15"></a>Sörensen, 2015. [Metaheuristics: the metaphor exposed](https://doi.org/10.1111/itor.12001). International Transactions in Operational Research 22(1).
- <a id="spielman11"></a>Spielman and Srivastava, 2011. [Graph sparsification by effective resistances](https://arxiv.org/abs/0803.0929). SIAM J. Computing 40(6).
- <a id="steinberg63"></a>Steinberg, 1963. [Reconstruction of tissues by dissociated cells](https://doi.org/10.1126/science.141.3579.401). Science 141.
- <a id="straszak16"></a>Straszak and Vishnoi, 2016. [IRLS and slime mold: equivalence and convergence](https://arxiv.org/abs/1601.02712). arXiv 1601.02712.
- <a id="stutzle00"></a>Stützle and Hoos, 2000. [MAX-MIN ant system](https://doi.org/10.1016/S0167-739X(00)00043-1). Future Generation Computer Systems 16(8).
- <a id="sugiyama95"></a>Sugiyama and Misue, 1995. [Graph drawing by the magnetic spring model](https://doi.org/10.1006/jvlc.1995.1013). J. Visual Languages and Computing 6(3).
- <a id="taylor92"></a>Taylor, Cahn and Handwerker, 1992. [Geometric models of crystal growth](https://doi.org/10.1016/0956-7151(92)90090-2). Acta Metallurgica et Materialia 40(7).
- <a id="tero07"></a>Tero, Kobayashi and Nakagaki, 2007. [A mathematical model for adaptive transport network in path finding by true slime mold](https://doi.org/10.1016/j.jtbi.2006.07.015). Journal of Theoretical Biology 244.
- <a id="tero10"></a>Tero, Takagi, Saigusa, Ito, Bebber, Fricker, Yumiki, Kobayashi and Nakagaki, 2010. [Rules for biologically inspired adaptive network design](https://doi.org/10.1126/science.1177894). Science 327. The earlier form of the model with `f(q) = q^mu` is in [Tero 2007][tero07].
- <a id="theraulaz99"></a>Theraulaz and Bonabeau, 1999. [A brief history of stigmergy](https://doi.org/10.1162/106454699568700). Artificial Life 5(2).
- <a id="toussaint80"></a>Toussaint, 1980. [The relative neighbourhood graph of a finite planar set](https://doi.org/10.1016/0031-3203(80)90066-7). Pattern Recognition 12.
- <a id="turing52"></a>Turing, 1952. [The chemical basis of morphogenesis](https://doi.org/10.1098/rstb.1952.0012). Phil. Trans. R. Soc. B 237.
- <a id="vicsek95"></a>Vicsek, Czirók, Ben-Jacob, Cohen and Shochet, 1995. [Novel type of phase transition in a system of self-driven particles](https://arxiv.org/abs/cond-mat/0611743). Phys. Rev. Lett. 75.
- <a id="vogel79"></a>Vogel, 1979. [A better way to construct the sunflower head](https://doi.org/10.1016/0025-5564(79)90080-4). Mathematical Biosciences 44.
- <a id="weaire99"></a>Weaire and Hutzler, 1999. [The physics of foams](https://global.oup.com/academic/product/the-physics-of-foams-9780198552895). Oxford University Press.
- <a id="werner95"></a>Werner, 1995. [Eolian dunes: computer simulations and attractor interpretation](https://doi.org/10.1130/0091-7613(1995)023<1107:EDCSAA>2.3.CO;2). Geology 23(12).
- <a id="witten81"></a>Witten and Sander, 1981. [Diffusion-limited aggregation, a kinetic critical phenomenon](https://doi.org/10.1103/PhysRevLett.47.1400). Phys. Rev. Lett. 47.
- <a id="wulff01"></a>Wulff, 1901. [Zur Frage der Geschwindigkeit des Wachsthums und der Auflösung der Krystallflächen](https://doi.org/10.1524/zkri.1901.34.1.449). Zeitschrift für Kristallographie 34.
- <a id="xia03"></a>Xia, 2003. [Optimal paths related to transport problems](https://doi.org/10.1142/S021919970300094X). Communications in Contemporary Mathematics 5(2).
- <a id="yang09"></a>Yang, 2009. [Firefly algorithms for multimodal optimization](https://doi.org/10.1007/978-3-642-04944-6_14). SAGA 2009.
- <a id="zachariasen99"></a>Zachariasen and Winter, 1999. [Obstacle-avoiding Euclidean Steiner trees in the plane: an exact algorithm](https://doi.org/10.1007/3-540-48518-X_17). ALENEX 1999.
- <a id="zamir76"></a>Zamir, 1976. [Optimality principles in arterial branching](https://doi.org/10.1016/0022-5193(76)90058-8). Journal of Theoretical Biology 62.

[althofer93]: #althofer93
[anderson87]: #anderson87
[aurenhammer91]: #aurenhammer91
[balzer09]: #balzer09
[bebber07]: #bebber07
[bernot09]: #bernot09
[blum67]: #blum67
[bohn05a]: #bohn05a
[bohn05b]: #bohn05b
[bohn07]: #bohn07
[bonabeau98]: #bonabeau98
[bonifaci12]: #bonifaci12
[born99]: #born99
[brandes05]: #brandes05
[carraro20]: #carraro20
[chaudhuri11]: #chaudhuri11
[conn17]: #conn17
[connolly90]: #connolly90
[corson10]: #corson10
[couzin03]: #couzin03
[cuntz10]: #cuntz10
[davidson96]: #davidson96
[deb02]: #deb02
[dorigo96]: #dorigo96
[dorigo97]: #dorigo97
[feugier05]: #feugier05
[gage86]: #gage86
[gierer72]: #gierer72
[gilbert67]: #gilbert67
[goodhill98]: #goodhill98
[graner92]: #graner92
[hansen01]: #hansen01
[helbing95]: #helbing95
[helbing97]: #helbing97
[hentschel99]: #hentschel99
[holland92]: #holland92
[howard94]: #howard94
[huiskes87]: #huiskes87
[jones10]: #jones10
[kahng90]: #kahng90
[karaboga07]: #karaboga07
[karch99]: #karch99
[katifori10]: #katifori10
[kennedy95]: #kennedy95
[khatib86]: #khatib86
[kim07]: #kim07
[kirkpatrick83]: #kirkpatrick83
[kitaoka99]: #kitaoka99
[latty11]: #latty11
[leitner10]: #leitner10
[lloyd82]: #lloyd82
[mauroy04]: #mauroy04
[meinhardt76]: #meinhardt76
[mitchison80]: #mitchison80
[mouret15]: #mouret15
[murray26]: #murray26
[musgrave89]: #musgrave89
[navlakha15]: #navlakha15
[newman05]: #newman05
[niemeyer84]: #niemeyer84
[pham06]: #pham06
[quinlan93]: #quinlan93
[reynolds87]: #reynolds87
[rinaldo92]: #rinaldo92
[rodriguez97]: #rodriguez97
[runions05]: #runions05
[runions07]: #runions07
[sachs81]: #sachs81
[schreiner93]: #schreiner93
[sethian96]: #sethian96
[sherman81]: #sherman81
[smit17]: #smit17
[smith92]: #smith92
[sorensen15]: #sorensen15
[spielman11]: #spielman11
[steinberg63]: #steinberg63
[straszak16]: #straszak16
[stutzle00]: #stutzle00
[sugiyama95]: #sugiyama95
[taylor92]: #taylor92
[tero07]: #tero07
[tero10]: #tero10
[theraulaz99]: #theraulaz99
[toussaint80]: #toussaint80
[turing52]: #turing52
[vicsek95]: #vicsek95
[vogel79]: #vogel79
[weaire99]: #weaire99
[werner95]: #werner95
[witten81]: #witten81
[wulff01]: #wulff01
[xia03]: #xia03
[yang09]: #yang09
[zachariasen99]: #zachariasen99
[zamir76]: #zamir76
