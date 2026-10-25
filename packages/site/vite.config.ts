import { defineConfig } from "vite";

// The Pages workflow sets SITE_BASE to "/highways". A local build uses the root.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const base = env["SITE_BASE"] ? `${env["SITE_BASE"].replace(/\/$/, "")}/` : "/";

export default defineConfig({
  base,
  worker: { format: "es" },
  build: { target: "es2022" },
});
