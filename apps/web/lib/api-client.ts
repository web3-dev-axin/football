export class ApiClientError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function apiGet<T>(path: string, baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787"): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
  if (!response.ok) throw new ApiClientError(response.status, `API request failed: ${path}`);
  return response.json() as Promise<T>;
}
