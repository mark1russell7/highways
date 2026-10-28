# The inputs of XPLAT-HASH

These 3 files are inputs of the trace `scripts/xplat.ts`. The workflow `Xplat` routes them on each cell of its matrix.

- The files come from the joint bench of layout-contract, CI run 40688908137, artifact `xplat-graphs`. The full artifact has 24 inputs. The workflow also downloads it when it can.
- The data is synthetic. The bench made it from seeds.
- Each file has `{ manifestId, pack, env, routes, graph }`. `graph` is the packed input that the routers route.

The route hashes of linux and node 26 (the rule of `routeHash` of the joint runner):

| File | Router | Route hash on linux node 26 | Route hash on win32 node 24 |
|---|---|---|---|
| `01-rows-freeAspect-polygon-s3` | `shared` | `f0ad16aafc0c90d0` | `ca9a3aa1c882e3e5` |
| `04-rows-freeWidth-convex-s1` | `shared` | `2cc8f0a82c2cc27f` | `1cc4cb76261f85f6` |
| `13-shelf-next-freeHeight-circle-s2` | `shared` | `105968a47971cfcc` | `f23f5ef3ab298d33` |
| `13-shelf-next-freeHeight-circle-s2` | `sections` | `5951994740536c9d` | `938efc53b6929fc1` |
| `01-rows-freeAspect-polygon-s3` | `corners` | `c95ebdbe50476273` | the same |
| `04-rows-freeWidth-convex-s1` | `corners` | `b2f8ba66f0b25c5e` | the same |
| `13-shelf-next-freeHeight-circle-s2` | `corners` | `c748a1b1816244b3` | the same |

The bench made these hashes with `highways` 0.5.1. The research note `docs/research/XPLAT.md` gives the result of the matrix.
