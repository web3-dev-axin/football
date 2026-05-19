export type ApiEnv = {
  host: string;
  port: number;
};

export function loadApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  return {
    host: env.API_HOST ?? "0.0.0.0",
    port: Number(env.API_PORT ?? 8787),
  };
}
