import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@worldcup/shared", "@worldcup/db", "@worldcup/sdk"],
};

export default nextConfig;
