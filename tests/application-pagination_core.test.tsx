import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn(), t: (key: string) => key }));
vi.mock("../app/_lib/api", () => ({ apiRequest: mocks.request }));
vi.mock("../app/_lib/i18n-provider", () => ({ useI18n: () => ({ locale: "en-US", t: mocks.t }), supportedLocales: ["en-US", "zh-CN"] }));
vi.mock("../app/_lib/auth", () => ({ useAuthSnapshot: () => ({ ready: true, token: "cookie-session", user: { id: "synthetic" } }) }));
vi.mock("../app/_components/catalog-resource-icon", () => ({ CatalogResourceIconPicker: () => null }));
vi.mock("../app/_components/minecraft-version-picker", () => ({ MinecraftVersionPicker: () => null }));
import { CreatorClaimsPanel } from "../app/_components/admin-community-panels";
import { ModReviewQueuePanel } from "../app/_components/admin-mod-panels";

beforeEach(() => { mocks.request.mockReset(); mocks.request.mockResolvedValue({ items: [], total: 101 }); });
afterEach(cleanup);

it("loads the next creator claim page and returns to the first page", async () => {
  render(<CreatorClaimsPanel token="cookie-session" />);
  const next = await screen.findByRole("button", { name: "common.next" });
  await waitFor(() => expect(next.hasAttribute("disabled")).toBe(false));
  fireEvent.click(next);
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("/api/v1/admin/creator-claims?limit=50&offset=50", expect.objectContaining({ signal: expect.any(AbortSignal) }), "cookie-session"));
  fireEvent.click(screen.getByRole("button", { name: "common.previous" }));
  await waitFor(() => expect(mocks.request).toHaveBeenLastCalledWith("/api/v1/admin/creator-claims?limit=50&offset=0", expect.objectContaining({ signal: expect.any(AbortSignal) }), "cookie-session"));
});

it("loads a real second editor queue page through its API contract", async () => {
  render(<ModReviewQueuePanel kind="editor" token="cookie-session" />);
  const next = await screen.findByRole("button", { name: "common.next" });
  await waitFor(() => expect(next.hasAttribute("disabled")).toBe(false));
  fireEvent.click(next);
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("/api/v1/admin/project-editor-applications?limit=50&offset=50", expect.objectContaining({ signal: expect.any(AbortSignal) }), "cookie-session"));
});

it("returns to the valid creator page after reviewing its last remaining claim", async () => {
  let reviewed = false;
  mocks.request.mockImplementation((path: string, options: RequestInit) => {
    if (options.method === "PATCH") { reviewed = true; return Promise.resolve({}); }
    return Promise.resolve({
      total: reviewed ? 50 : 51,
      items: !reviewed && path.includes("offset=50") ? [{ id: "synthetic-claim", name: "Synthetic author", username: "Synthetic", userId: "synthetic", proofMarkdown: "Synthetic proof", attachments: [], createdAt: "2026-01-01T00:00:00Z" }] : [],
    });
  });
  render(<CreatorClaimsPanel token="cookie-session" />);
  const next = await screen.findByRole("button", { name: "common.next" });
  await waitFor(() => expect(next.hasAttribute("disabled")).toBe(false));
  fireEvent.click(next);
  const approve = await screen.findByRole("button", { name: "admin.reviews.approve" });
  fireEvent.click(approve);
  await waitFor(() => expect(reviewed).toBe(true));
  await waitFor(() => expect(mocks.request).toHaveBeenLastCalledWith("/api/v1/admin/creator-claims?limit=50&offset=0", expect.objectContaining({ signal: expect.any(AbortSignal) }), "cookie-session"));
  expect(screen.queryByText("Synthetic author")).toBeNull();
});

it("keeps the current review queue when an older request resolves after changing queue kind", async () => {
  let complete!: (value: object) => void;
  mocks.request.mockImplementation((path: string) => path.startsWith("/api/v1/admin/project-editor-applications")
    ? new Promise((resolve) => { complete = resolve; }) : Promise.resolve({ items: [], total: 0 }));
  const view = render(<ModReviewQueuePanel kind="editor" token="cookie-session" />);
  await waitFor(() => expect(complete).toBeTypeOf("function"));
  view.rerender(<ModReviewQueuePanel kind="content" token="cookie-session" />);
  await waitFor(() => expect(mocks.request).toHaveBeenLastCalledWith(expect.stringContaining("/api/v1/reviews/content?"), expect.any(Object), "cookie-session"));
  await act(async () => { complete({ items: [{ id: "synthetic-editor", targetName: "Stale editor result", username: "Synthetic", proofMarkdown: "Synthetic proof", createdAt: "2026-01-01T00:00:00Z", attachments: [] }], total: 101 }); });
  expect(screen.queryByText(/Stale editor result/)).toBeNull();
});

it("keeps a legacy complete creator list usable before the backend pagination rollout", async () => {
  mocks.request.mockResolvedValue({ items: [{ id: "synthetic-claim", name: "Legacy complete list", username: "Synthetic", userId: "synthetic", proofMarkdown: "Synthetic proof", attachments: [], createdAt: "2026-01-01T00:00:00Z" }] });
  render(<CreatorClaimsPanel token="cookie-session" />);
  await screen.findByText("Legacy complete list");
  expect(screen.queryByRole("button", { name: "common.next" })).toBeNull();
  expect(screen.getByRole("button", { name: "admin.reviews.approve" }).hasAttribute("disabled")).toBe(false);
});
