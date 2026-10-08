import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The Dockerfile copies .next/standalone into the image.
  output: "standalone",
  // Trace from the workspace root so @booth/core, consumed as source,
  // lands in the standalone output.
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  transpilePackages: ["@booth/core"],
};

export default nextConfig;
