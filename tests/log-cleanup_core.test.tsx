import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn(), t: (key: string) => key }));
vi.mock("../app/_lib/api", async (original) => ({ ...await original<object>(), apiRequest: mocks.request }));
vi.mock("../app/_lib/i18n-provider", async (original) => ({ ...await original<object>(), useI18n: () => ({ locale: "en-US", t: mocks.t }) }));
import { ApiError } from "../app/_lib/api";
import { LogCleanupPanel } from "../app/_components/admin-console";

const initial = { enabled: true, defaultDays: 30, categoryDays: {} };
beforeEach(() => mocks.request.mockReset());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("keeps the saved normalized policy and explains that cleanup failed", async () => {
  mocks.request.mockResolvedValueOnce(initial).mockRejectedValueOnce(new ApiError("cleanup failed", 503, "LOG_CLEANUP_FAILED", 0, { saved: true, config: { ...initial, defaultDays: 3650 }, deleted: { api: 2 } }));
  const notices = vi.spyOn(window, "dispatchEvent");
  render(<LogCleanupPanel token="cookie-session" />);
  const input = await screen.findByRole("spinbutton", { name: "admin.logs.defaultRetentionDays" });
  fireEvent.change(input, { target: { value: "9999" } });
  fireEvent.click(screen.getByRole("button", { name: "common.save" }));
  await waitFor(() => expect(notices).toHaveBeenCalledWith(expect.objectContaining({ type: "mcmods-admin-notice", detail: expect.objectContaining({ message: "admin.logs.policySavedCleanupFailed" }) })));
  expect((input as HTMLInputElement).value).toBe("3650");
  expect(notices).not.toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ message: "admin.logs.policySaved" }) }));
});

it("rejects malformed error details instead of replacing editable policy", async () => {
  mocks.request.mockResolvedValueOnce(initial).mockRejectedValueOnce(new ApiError("malformed cleanup response", 503, "LOG_CLEANUP_FAILED", 0, { saved: true, config: { enabled: true, defaultDays: "3650", categoryDays: {} } }));
  const notices = vi.spyOn(window, "dispatchEvent");
  render(<LogCleanupPanel token="cookie-session" />);
  const input = await screen.findByRole("spinbutton", { name: "admin.logs.defaultRetentionDays" });
  fireEvent.click(screen.getByRole("button", { name: "common.save" }));
  await waitFor(() => expect(notices).toHaveBeenCalledWith(expect.objectContaining({ type: "mcmods-admin-notice" })));
  expect((input as HTMLInputElement).value).toBe("30");
  expect(notices).not.toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ message: "admin.logs.policySavedCleanupFailed" }) }));
});
