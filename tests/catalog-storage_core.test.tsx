import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCatalogControls } from "../app/_lib/catalog-state";
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/mods", useRouter: () => router, useSearchParams: () => new URLSearchParams("q=example&page=3") }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
describe("catalog preferences with unavailable persistence", () => {
  it("keeps sorting and filter groups usable when storage writes are blocked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
    const hook = renderHook(() => useCatalogControls({ preferenceStorageKey: "isolated-preferences", expandedStorageKey: "isolated-groups", filterParams: ["q"], defaultExpandedGroups: ["versions"], sortOptions: ["heat", "updated"] as const, defaultSort: "heat", onPageChange: vi.fn() }));
    await act(async () => { await Promise.resolve(); });
    act(() => hook.result.current.changePreference({ sort: "updated" }));
    expect(router.replace).toHaveBeenCalledWith("/mods?q=example&sort=updated", { scroll: false });
    act(() => hook.result.current.toggleGroup("versions", false));
    expect(hook.result.current.expandedGroups.has("versions")).toBe(false);
  });
});
