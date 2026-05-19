import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { createAppContext, type AppContext } from "./services/app-context";
import { ApiError, errorBody, toApiError } from "./services/errors";
import { registerAdminRoutes } from "./routes/admin";
import { registerDocsRoutes } from "./routes/docs";
import { registerHealthRoutes } from "./routes/health";
import { registerPublicRoutes } from "./routes/public";
import { registerCommercialRoutes } from "./routes/commercial";

export function createApiApp(ctx: AppContext = createAppContext()): Hono {
  const app = new Hono();
  app.use("*", requestId());
  app.use("*", cors());

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
