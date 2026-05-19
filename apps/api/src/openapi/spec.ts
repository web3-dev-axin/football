export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "World Cup Prediction Market API",
    version: "0.1.0",
  },
  paths: {
    "/health": { get: { summary: "Health check" } },
    "/teams": { get: { summary: "List teams" } },
    "/schedule": { get: { summary: "List schedule fixtures" } },
    "/fixtures": { get: { summary: "List fixtures" } },
    "/data-quality/fixtures/{fixtureId}": { get: { summary: "Get fixture data quality" } },
    "/live-windows": { get: { summary: "List live windows" } },
    "/markets": { get: { summary: "List markets" } },
    "/markets/{marketId}": { get: { summary: "Get market detail" } },
    "/odds/markets/{marketId}": { get: { summary: "Get market odds comparison" } },
    "/odds/fixtures/{fixtureId}": { get: { summary: "Get fixture odds comparisons" } },
    "/settlements": { get: { summary: "List settlements" } },
    "/admin/data-quality/fixtures/compare": { post: { summary: "Compare fixture data sources" } },
    "/admin/data-quality/fixtures/inject-mismatch": { post: { summary: "Inject fixture mismatch for testing" } },
    "/admin/data-quality/live-events/compare": { post: { summary: "Compare live event data sources" } },
    "/admin/sync/fixtures": { post: { summary: "Sync fixture data" } },
    "/admin/sync/teams": { post: { summary: "Sync team data" } },
    "/admin/sync/rankings": { post: { summary: "Sync team rankings" } },
    "/admin/sync/live-events": { post: { summary: "Sync live event data" } },
    "/admin/sync/odds": { post: { summary: "Sync market odds" } },
    "/admin/odds/compare": { post: { summary: "Compare market odds" } },
    "/admin/live-windows/create": { post: { summary: "Create demo live window" } },
    "/admin/markets/create": { post: { summary: "Create chain market metadata" } },
    "/admin/results/propose": { post: { summary: "Propose result" } },
    "/admin/results/finalize": { post: { summary: "Finalize result" } },
  },
};

if (import.meta.main) {
  console.log(JSON.stringify(openApiSpec, null, 2));
}
