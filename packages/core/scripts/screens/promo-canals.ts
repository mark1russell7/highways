// The router of the promotion test PROMO-CANALS: the opt-in router `canals`, at its defaults.
// Start: `pnpm screen --step router --module scripts/screens/promo-canals.ts --set screen-v3`. The baseline is the router default `shared`.
// The fresh seeds: add `--members 10-23`.
export { canalStrategy } from "../../src/routers/canals/index.ts";
