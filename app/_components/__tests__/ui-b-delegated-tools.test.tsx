import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolsPlayground } from "../tools-playground";
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
function translate(key: string) { return key; }
vi.mock("../../_lib/api", () => ({ apiRequest: mocks.api }));
vi.mock("../../_lib/auth", () => ({ useAuthSnapshot: () => ({ ready: true, token: "cookie-session", user: { id: "1" } }) }));
vi.mock("../../_lib/i18n-provider", () => ({ useI18n: () => ({ locale: "en-US", t: translate }) }));
vi.mock("../markdown-renderer", () => ({ MarkdownRenderer: () => null }));
vi.mock("../sticker-picker", () => ({ StickerPicker: () => null }));
vi.mock("next/image", () => ({ default: () => <span /> }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => { vi.resetAllMocks(); mocks.api.mockImplementation((path: string) => path === "/api/v1/markdown/config" ? Promise.resolve({}) : Promise.reject(new Error("Draft temporarily unavailable"))); });
describe("Markdown editor persistence", () => {
  it("renders externally restored controlled content without sending a stale edit", async () => {
    const changed = vi.fn();
    const { rerender } = render(<ToolsPlayground embedded value="Before" onChange={changed} />);
    rerender(<ToolsPlayground embedded value="Restored server draft" onChange={changed} />);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Restored server draft");
    expect(changed).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Human edit" } });
    expect(changed).toHaveBeenCalledWith("Human edit");
  });
  it("does not autosave sample content over a draft whose initial GET failed", async () => {
    vi.useFakeTimers();
    render(<ToolsPlayground />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(mocks.api.mock.calls.some(([, options]) => options?.method === "PUT")).toBe(false);
    expect(screen.getByRole("button", { name: "common.retry" })).toBeTruthy();
  });
  it("stops automatic retries of a failed content write and permits an explicit retry", async () => {
    vi.useFakeTimers();
    mocks.api.mockImplementation((path: string, options?: { method?: string }) => options?.method === "PUT" ? new Promise((_, reject) => window.setTimeout(() => reject(new Error("Write temporarily unavailable")), 100)) : Promise.resolve(path.endsWith("markdown-playground") ? { content: "Existing" } : {}));
    render(<ToolsPlayground />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New human content" } });
    for (let interval = 0; interval < 4; interval += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1800); });
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    }
    expect(mocks.api.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(mocks.api.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(2);
  });
});
