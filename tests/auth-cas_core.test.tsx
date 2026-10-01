import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AuthUser } from "../app/_lib/auth";

vi.mock("../app/_lib/api", () => ({
  API_BASE_URL: "http://127.0.0.1:8080", backendFetch: vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
  isBearerAccessToken: () => false, rememberAuthorizationVersion: vi.fn(),
}));

function user(id: string, username = id): AuthUser {
  return { id, username, email: `${id}@example.invalid`, roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); vi.resetModules(); vi.clearAllMocks(); });

it("rejects A's late profile save synchronously after B signs in", async () => {
  const auth = await import("../app/_lib/auth");
  const api = await import("../app/_lib/api");
  auth.saveAuth({ user: user("account-A") });
  const view = renderHook(() => auth.useAuthSnapshot());
  act(() => { auth.saveAuth({ user: user("account-B") }); });
  const events = vi.spyOn(window, "dispatchEvent");
  const broadcasts = vi.spyOn(Storage.prototype, "setItem");
  vi.mocked(api.rememberAuthorizationVersion).mockClear();
  let accepted: boolean | undefined;
  act(() => { accepted = auth.saveAuth({ user: user("account-A", "Late A profile") }, "account-A"); });
  expect(view.result.current.user?.id).toBe("account-B");
  expect(view.result.current.user?.username).toBe("account-B");
  expect(accepted).toBe(false);
  expect(events).not.toHaveBeenCalled();
  expect(broadcasts).not.toHaveBeenCalled();
  expect(api.rememberAuthorizationVersion).not.toHaveBeenCalled();
});

it("rejects a different response identity even when the current account matches the expected account", async () => {
  const auth = await import("../app/_lib/auth");
  auth.saveAuth({ user: user("account-A") });
  const view = renderHook(() => auth.useAuthSnapshot());
  act(() => { auth.saveAuth({ user: user("account-B") }, "account-A"); });
  expect(view.result.current.user?.id).toBe("account-A");
});

it("checks the new identity before React commits the account change", async () => {
  const auth = await import("../app/_lib/auth");
  auth.saveAuth({ user: user("account-A") });
  const view = renderHook(() => auth.useAuthSnapshot());
  act(() => {
    auth.saveAuth({ user: user("account-B") });
    expect(auth.isCurrentAuthUser("account-A")).toBe(false);
    expect(auth.isCurrentAuthUser("account-B")).toBe(true);
    expect(auth.saveAuth({ user: user("account-A") }, "account-A")).toBe(false);
  });
  expect(view.result.current.user?.id).toBe("account-B");
});

it("does not restore a signed-out account through a delayed conditional profile save", async () => {
  const auth = await import("../app/_lib/auth");
  auth.saveAuth({ user: user("account-A") });
  const view = renderHook(() => auth.useAuthSnapshot());
  act(() => { auth.clearAuth(); });
  act(() => { auth.saveAuth({ user: user("account-A") }, "account-A"); });
  expect(view.result.current.user).toBeNull();
});

it("allows same-account profile changes and an explicit login without an expected identity", async () => {
  const auth = await import("../app/_lib/auth");
  auth.saveAuth({ user: user("account-A") });
  const view = renderHook(() => auth.useAuthSnapshot());
  act(() => { auth.saveAuth({ user: user("account-A", "Updated A") }, "account-A"); });
  expect(view.result.current.user?.username).toBe("Updated A");
  act(() => { auth.saveAuth({ user: user("account-B") }); });
  expect(view.result.current.user?.id).toBe("account-B");
});

it("preserves refreshed authorization and the current session when an older same-account profile result arrives", async () => {
  const auth = await import("../app/_lib/auth");
  const api = await import("../app/_lib/api");
  const captured = user("account-A");
  auth.saveAuth({ token: "old-session-token", user: captured });
  const view = renderHook(() => auth.useAuthSnapshot());
  const fresh: AuthUser = { ...captured, email: "new-email@example.invalid", roleCodes: ["new-role"],
    permissionRules: [{ code: "admin.access", allow: false, priority: 20 }], permissionVersion: 2, rbacVersion: 3 };
  vi.mocked(api.backendFetch).mockResolvedValueOnce(Response.json({ data: fresh }));
  await act(async () => { window.dispatchEvent(new Event("mcmods-permissions-changed")); });
  expect(view.result.current.user?.permissionVersion).toBe(2);
  const currentToken = view.result.current.token;
  act(() => { auth.saveAuth({ token: "old-session-token", user: { ...captured, username: "Updated profile", avatarUrl: "/synthetic.png", signature: "Updated signature" } }, "account-A"); });
  expect(view.result.current.user?.permissionVersion).toBe(2);
  expect(view.result.current.user?.rbacVersion).toBe(3);
  expect(view.result.current.user?.roleCodes).toEqual(fresh.roleCodes);
  expect(view.result.current.user?.permissionRules).toEqual(fresh.permissionRules);
  expect(view.result.current.user?.email).toBe(fresh.email);
  expect(view.result.current.token).toBe(currentToken);
  expect(view.result.current.user?.username).toBe("Updated profile");
  expect(view.result.current.user?.avatarUrl).toBe("/synthetic.png");
  expect(view.result.current.user?.signature).toBe("Updated signature");
});

it("keeps an in-flight permission refresh and the newer profile fields", async () => {
  const auth = await import("../app/_lib/auth");
  const api = await import("../app/_lib/api");
  const captured = user("account-A");
  auth.saveAuth({ user: captured });
  const view = renderHook(() => auth.useAuthSnapshot());
  let finish!: (response: Response) => void;
  vi.mocked(api.backendFetch).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  act(() => { window.dispatchEvent(new Event("mcmods-permissions-changed")); });
  act(() => { auth.saveAuth({ user: { ...captured, username: "New profile", signature: "New signature" } }, "account-A"); });
  const fresh: AuthUser = { ...captured, permissionVersion: 2, rbacVersion: 3,
    roleCodes: ["fresh-role"], permissionRules: [{ code: "admin.access", allow: false, priority: 20 }] };
  await act(async () => { finish(Response.json({ data: fresh })); });
  expect(view.result.current.user?.permissionVersion).toBe(2);
  expect(view.result.current.user?.rbacVersion).toBe(3);
  expect(view.result.current.user?.permissionRules).toEqual(fresh.permissionRules);
  expect(view.result.current.user?.roleCodes).toEqual(fresh.roleCodes);
  expect(view.result.current.user?.username).toBe("New profile");
  expect(view.result.current.user?.signature).toBe("New signature");
});
