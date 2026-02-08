import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kaizen/api-client", "@kaizen/ui"],
};

export default nextConfig;
