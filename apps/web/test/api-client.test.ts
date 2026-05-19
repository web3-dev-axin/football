import { describe, expect, test } from "bun:test";
import { ApiClientError, apiGet, apiPost, consumerApi, humanizeApiError } from "../lib/api-client";

function stubFetch(response: Response): { calls: Array<{ url: string; init?: RequestInit }>; restore: () => void } {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    return response.clone();
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

describe("api client", () => {
  test("apiPost serializes JSON body and parses response", async () => {
    const stub = stubFetch(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
    try {
      const result = await apiPost<{ ok: boolean }>("/risk/check", { marketId: "m1" }, "http://api.local");
      expect(result.ok).toBe(true);
      expect(stub.calls[0]?.url).toBe("http://api.local/risk/check");
      expect(stub.calls[0]?.init?.method).toBe("POST");
      expect(stub.calls[0]?.init?.body).toBe(JSON.stringify({ marketId: "m1" }));
    } finally {
      stub.restore();
    }
  });

  test("apiGet surfaces ApiClientError with code from backend", async () => {
    const stub = stubFetch(new Response(JSON.stringify({ error: { code: "MARKET_NOT_FOUND", message: "Market not found" } }), { status: 404 }));
    try {
      await expect(apiGet("/markets/x", "http://api.local")).rejects.toBeInstanceOf(ApiClientError);
    } finally {
      stub.restore();
    }
  });

  test("humanizeApiError maps risk codes to user-friendly copy", () => {
    expect(humanizeApiError(new ApiClientError(409, "x", "USER_LIMIT_EXCEEDED"))).toContain("per-user exposure");
    expect(humanizeApiError(new ApiClientError(409, "x", "MARKET_LIMIT_EXCEEDED"))).toContain("volume limit");
    expect(humanizeApiError(new ApiClientError(409, "x", "ORDER_LIMIT_EXCEEDED"))).toContain("per-order limit");
    expect(humanizeApiError(new ApiClientError(409, "x", "RISK_LIMIT_DISABLED"))).toContain("Trading is paused");
    expect(humanizeApiError(new Error("boom"))).toBe("boom");
  });

  test("consumerApi.listCommercialMarkets serializes query params", async () => {
    const stub = stubFetch(new Response(JSON.stringify({ commercialMarkets: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    try {
      await consumerApi.listCommercialMarkets({ marketType: "match_winner" });
      await consumerApi.listCommercialMarkets({ fixtureId: "demo-2026-001" });
      expect(stub.calls[0]?.url).toContain("marketType=match_winner");
      expect(stub.calls[1]?.url).toContain("fixtureId=demo-2026-001");
    } finally {
      stub.restore();
    }
  });

  test("consumerApi.getFixtureEvents unwraps events array", async () => {
    const stub = stubFetch(new Response(JSON.stringify({ fixtureId: "f", events: [{ id: "e1", eventType: "goal" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    try {
      const events = await consumerApi.getFixtureEvents("demo-2026-001");
      expect(events.length).toBe(1);
      expect(stub.calls[0]?.url).toContain("/fixtures/demo-2026-001/events");
    } finally {
      stub.restore();
    }
  });
});
