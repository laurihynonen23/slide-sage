import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "sharp", "pdf-lib", "@anthropic-ai/sdk", "openai", "@napi-rs/canvas"],
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
