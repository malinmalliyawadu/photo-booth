import type { NextConfig } from "next";
import path from "node:path";

// One .env at the repo root serves the app, the worker and the db
// scripts. Next only reads its own folder, so pull the root file in
// here; values already in the environment win, which is what systemd
// and Coolify rely on.
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, "../../.env"));
} catch {
  /* no .env: production sets the variables itself */
}

const nextConfig: NextConfig = {
  output: "standalone",
  // Workspace packages ship TypeScript source, not a build.
  transpilePackages: ["@booth/core", "@booth/db"],
  // sharp and pg carry native bindings; leave them resolving from
  // node_modules rather than letting the bundler rewrite their paths.
  serverExternalPackages: ["sharp", "pg"],
};

export default nextConfig;
