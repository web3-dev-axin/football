export class WorldCupApiClient {
  constructor(private readonly baseUrl: string) {}

  async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) throw new Error(`API request failed with ${response.status}`);
    return response.json() as Promise<T>;
  }
}
