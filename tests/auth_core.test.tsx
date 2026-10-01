// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../app/_lib/auth";

vi.mock("../app/_lib/api", () => ({
  API_BASE_URL: "http://127.0.0.1:8080", backendFetch: vi.fn(),
  isBearerAccessToken: (value?: string) => Boolean(value && value.split(".").length === 3),
  rememberAuthorizationVersion: vi.fn(),
}));

function user(id: string): AuthUser {
  return { id, username: id, email: `${id}@example.invalid`, roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 };
}

afterEach(() => { cleanup(); localStorage.clear(); vi.resetModules(); vi.clearAllMocks(); });

describe("auth bootstrap consistency", () => {
  it("does not restore a session after logout when an earlier /me finishes late", async () => {
    const { backendFetch } = await import("../app/_lib/api");
    let finish!: (response: Response) => void;
    vi.mocked(backendFetch).mockImplementation((url) => String(url).endsWith("/me")
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve(new Response(null, { status: 204 })));
    const auth = await import("../app/_lib/auth");
    const view = renderHook(() => auth.useAuthSnapshot());
    act(() => auth.clearAuth());
    await act(async () => { finish(Response.json({ data: user("old") })); });
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    expect(view.result.current.user).toBeNull();
  });
  it("does not replace a newly signed-in account with an earlier bootstrap response", async () => {
    const { backendFetch } = await import("../app/_lib/api");
    let finish!: (response: Response) => void;
    vi.mocked(backendFetch).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const auth = await import("../app/_lib/auth");
    const view = renderHook(() => auth.useAuthSnapshot());
    act(() => auth.saveAuth({ user: user("new") }));
    await act(async () => { finish(Response.json({ data: user("old") })); });
    expect(view.result.current.user?.id).toBe("new");
  });
});
