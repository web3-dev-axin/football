import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

function loadRootEnv(): void {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const candidates = [".env", `.env.${nodeEnv}`, ".env.local", `.env.${nodeEnv}.local`];
  for (const candidate of candidates) {
    const filepath = path.join(projectRoot, candidate);
    if (!fs.existsSync(filepath)) continue;
    const content = fs.readFileSync(filepath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (key in process.env && process.env[key] !== undefined && process.env[key] !== "") continue;
      const trimmed = rawValue?.replace(/^['"]|['"]$/g, "").trim();
      if (trimmed === undefined) continue;
      process.env[key] = trimmed;
    }
  }
}

loadRootEnv();

function apiRewriteTarget(): string {
  const raw =
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_INTERNAL_URL ??
    "http://127.0.0.1:8787";
  return raw.replace(/\/$/, "");
}

const nextConfig: NextConfig = {
  transpilePackages: ["@polygoal/shared", "@polygoal/db", "@polygoal/sdk"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiRewriteTarget()}/:path*`,
      },
    ];
  },
};

export default nextConfig;
