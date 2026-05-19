import { serve } from "@hono/node-server";
import { createApiApp } from "./app";
import { loadApiEnv } from "./env";
import { createAppContextFromEnv } from "./services/app-context";

const env = loadApiEnv();
const ctx = await createAppContextFromEnv();
serve({ fetch: createApiApp(ctx).fetch, hostname: env.host, port: env.port });
console.log(`API listening on http://${env.host}:${env.port}`);
