// The import boundaries of the workspace (@mark1russell7/boundaries), and the rule of the core (CORE-IMPORT-GATE).
// The script check:boundaries of package.json starts this check, and the shared CI starts it after the build.
import { boundaries } from "@mark1russell7/boundaries";

/** The packages of npm that the source of the core imports. Each one is a dependency of `packages/core/package.json`. */
const CORE_DEPENDENCIES = ["layout-contract", "predicates", "rigor-generators", "rigor-statistics"];

export default boundaries(import.meta.dirname, {
  reference: "CLAUDE.md, the section Scope.",
  forbidden: [
    {
      name: "core-knows-no-renderer",
      severity: "error",
      comment:
        "The core knows no renderer. Its source imports only its own files, the modules of Node and the dependencies of its package.json.",
      from: { path: "^packages/core/src/" },
      to: {
        dependencyTypesNot: ["core"],
        pathNot: ["^packages/core/src/", `node_modules/@mark1russell7/(${CORE_DEPENDENCIES.join("|")})/`],
      },
    },
  ],
});
