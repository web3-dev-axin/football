export type ApiEnv = {
  host: string;
  port: number;
  corsOrigins: string[] | "*";
};

export function loadApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  return {
    host: env.API_HOST ?? "0.0.0.0",
    port: Number(env.API_PORT ?? 8787),
    corsOrigins: parseCorsOrigins(env.CORS_ALLOWED_ORIGINS),
  };
}

function parseCorsOrigins(raw: string | undefined): string[] | "*" {
  if (!raw || raw.trim() === "" || raw.trim() === "*") return "*";
  return raw
    .split(",")
    .map((entry) => entry.trim().replace(/\/$/, ""))
    .filter((entry) => entry.length > 0);
}
