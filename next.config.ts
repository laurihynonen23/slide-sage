import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "sharp", "pdf-lib", "@anthropic-ai/sdk", "openai"],
  turbopack: {
    root: "/Users/laurihynonen/Projects/slide-sage",
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
