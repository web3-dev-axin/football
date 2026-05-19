import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { loadApiEnv, type ApiEnv } from "./env";
import { createAppContext, type AppContext } from "./services/app-context";
import { ApiError, errorBody, toApiError } from "./services/errors";
import { registerAdminRoutes } from "./routes/admin";
import { registerDocsRoutes } from "./routes/docs";
import { registerHealthRoutes } from "./routes/health";
import { registerPublicRoutes } from "./routes/public";
import { registerCommercialRoutes } from "./routes/commercial";

export type CreateApiAppOptions = {
  corsOrigins?: ApiEnv["corsOrigins"];
};

export function createApiApp(
  ctx: AppContext = createAppContext(),
  options: CreateApiAppOptions = {},
): Hono {
  const app = new Hono();
  const corsOrigins = options.corsOrigins ?? loadApiEnv().corsOrigins;

  app.use("*", requestId());
  app.use(
    "*",
    cors({
      origin: corsOrigins === "*" ? "*" : (incoming) => matchOrigin(incoming, corsOrigins),
      allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      allowMethods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: false,
      maxAge: 600,
    }),
  );
  // Chrome Private Network Access: preflight from public origin → private/loopback target.
  app.use("*", async (c, next) => {
    await next();
    if (c.req.header("access-control-request-private-network") === "true") {
      c.res.headers.set("Access-Control-Allow-Private-Network", "true");
    }
  });

  registerHealthRoutes(app);
  registerPublicRoutes(app, ctx);
  registerAdminRoutes(app, ctx);
  registerCommercialRoutes(app, ctx);
  registerDocsRoutes(app);

  app.notFound((c) => c.json(errorBody(new ApiError("NOT_FOUND", "Route not found", 404)), 404));
  app.onError((error, c) => {
    const apiError = toApiError(error);
    return c.json(errorBody(apiError), apiError.status as 400);
  });

  return app;
}

function matchOrigin(incoming: string, allowList: string[]): string | null {
  if (!incoming) return null;
  const normalized = incoming.replace(/\/$/, "");
  return allowList.includes(normalized) ? normalized : null;
}
