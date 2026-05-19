import type { Hono } from "hono";
import { openApiSpec } from "../openapi/spec";

export function registerDocsRoutes(app: Hono): void {
  app.get("/openapi.json", (c) => c.json(openApiSpec));
  app.get("/docs", (c) => c.html(`<!doctype html><html><head><title>World Cup Prediction Market API</title></head><body><h1>World Cup Prediction Market API</h1><p>OpenAPI JSON is available at <a href="/openapi.json">/openapi.json</a>.</p></body></html>`));
}
