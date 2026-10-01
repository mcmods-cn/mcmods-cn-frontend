// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { completeUserDraft, loadUserDraft, saveUserDraft } from "../app/_lib/draft-api";
import { useAutoDraft } from "../app/_lib/use-auto-draft";

vi.mock("../app/_lib/draft-api", () => ({ saveUserDraft: vi.fn(), completeUserDraft: vi.fn(), loadUserDraft: vi.fn() }));
afterEach(() => { window.history.replaceState({}, "", "/"); cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

function useDraft(value: { title: string }) {
  return useAutoDraft({ draftKey: "example", projectKey: "project", editUrl: "/mods/example/edit", enabled: true, kind: "mod", title: value.title, token: "cookie-session", value, onRestore: vi.fn() });
}

describe("draft persistence consistency", () => {
  it("restores a selected draft under StrictMode effect replay", async () => {
    window.history.replaceState({}, "", "/mods/example/edit?draft=selected");
    const restore = vi.fn();
    vi.mocked(loadUserDraft).mockResolvedValue({ draftKey: "example", payload: { title: "restored" }, updatedAt: "2026-10-01T00:00:00Z" } as Awaited<ReturnType<typeof loadUserDraft>>);
    renderHook(() => useAutoDraft({ draftKey: "example", projectKey: "project", editUrl: "/mods/example/edit", enabled: true, kind: "mod", title: "original", token: "cookie-session", value: { title: "original" }, onRestore: restore }), { wrapper: StrictMode });
    await act(async () => { await Promise.resolve(); });
    expect(restore).toHaveBeenCalledWith({ title: "restored" });
    window.history.replaceState({}, "", "/");
  });
  it("saves the original values again after an earlier edit was autosaved", async () => {
    vi.useFakeTimers();
    vi.mocked(saveUserDraft).mockResolvedValue({ updatedAt: "2026-10-01T00:00:00Z" } as Awaited<ReturnType<typeof saveUserDraft>>);
    const hook = renderHook(({ value }) => useDraft(value), { initialProps: { value: { title: "original" } } });
    hook.rerender({ value: { title: "edited" } });
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    hook.rerender({ value: { title: "original" } });
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(saveUserDraft).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveUserDraft).mock.calls[1][0].payload).toEqual({ title: "original" });
    expect(loadUserDraft).not.toHaveBeenCalled();
  });
  it("waits for the in-flight autosave before marking the draft complete", async () => {
    vi.useFakeTimers();
    let finish!: (result: Awaited<ReturnType<typeof saveUserDraft>>) => void;
    vi.mocked(saveUserDraft).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    vi.mocked(completeUserDraft).mockResolvedValue({ completed: true });
    const hook = renderHook(({ value }) => useDraft(value), { initialProps: { value: { title: "original" } } });
    hook.rerender({ value: { title: "edited" } });
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    let completion!: Promise<void>;
    act(() => { completion = hook.result.current.completeDraft({ projectKey: "project", projectTitle: "example", targetUrl: "/mods/example", reviewStatus: "approved" }); });
    expect(completeUserDraft).not.toHaveBeenCalled();
    await act(async () => { finish({ updatedAt: "2026-10-01T00:00:00Z" } as Awaited<ReturnType<typeof saveUserDraft>>); await completion; });
    expect(completeUserDraft).toHaveBeenCalledTimes(1);
  });
});
