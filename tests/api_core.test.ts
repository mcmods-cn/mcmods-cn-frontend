import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../app/_lib/api";

afterEach(() => { vi.unstubAllGlobals(); });

describe("API response contracts", () => {
  it("accepts an explicit 204 from the unfollow endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiRequest<void>("/api/v1/projects/example/follow", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("continues rejecting a malformed 200 envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
    await expect(apiRequest("/broken")).rejects.toMatchObject({ status: 200 });
  });

  it("does not prevent a mutation when persistent browser storage is blocked", async () => {
    vi.stubGlobal("window", {
      localStorage: { getItem: () => { throw new DOMException("blocked", "SecurityError"); } },
      dispatchEvent: vi.fn(),
    });
    const request = vi.fn().mockResolvedValue(Response.json({ data: { saved: true } }));
    vi.stubGlobal("fetch", request);
    await expect(apiRequest("/save", { method: "POST", body: "{}" })).resolves.toEqual({ saved: true });
    const headers = new Headers(request.mock.calls[0][1].headers);
    expect(headers.get("X-Client-ID")).toBeTruthy();
  });
});
