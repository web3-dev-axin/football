import { describe, expect, test } from "bun:test";
import { createAnvilPublicClient } from "./chain";
import { WorldCupApiClient } from "./api";

describe("sdk clients", () => {
  test("creates an Anvil public client", () => {
    const client = createAnvilPublicClient("http://127.0.0.1:8545");
    expect(client.chain?.id).toBe(31337);
  });

  test("fetches JSON and surfaces HTTP errors", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.endsWith("/ok")) return new Response(JSON.stringify({ ok: true }), { status: 200 });
        return new Response("bad", { status: 500 });
      }) as typeof fetch;
      const client = new WorldCupApiClient("http://api.local");
      expect(await client.getJson<{ ok: boolean }>("/ok")).toEqual({ ok: true });
      await expect(client.getJson("/fail")).rejects.toThrow("500");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
