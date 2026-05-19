import { Hono } from "hono";
import { graphql } from "ponder";
import { db } from "ponder:api";
import schema from "ponder:schema";

// Minimal Ponder HTTP surface. The polygoal API reads the same Postgres tables
// directly via @polygoal/db, so we only expose `/graphql` and `/sql` here for
// ad-hoc inspection.
const app = new Hono();

app.use("/graphql", graphql({ db, schema }));
app.use("/", graphql({ db, schema }));

app.get("/up", (c) => c.json({ ok: true }));

export default app;
