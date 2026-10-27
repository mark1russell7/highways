import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The Pages workflow sets SITE_BASE to "/highways". A local build uses the root.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const base = env["SITE_BASE"] ? `${env["SITE_BASE"].replace(/\/$/, "")}/` : "/";
const page = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

// The site has three pages: the live demo, the examples and the compare page.
export default defineConfig({
  base,
  worker: { format: "es" },
  build: {
    target: "es2022",
    rolldownOptions: {
      input: { main: page("./index.html"), examples: page("./examples.html"), compare: page("./compare.html") },
    },
  },
});
