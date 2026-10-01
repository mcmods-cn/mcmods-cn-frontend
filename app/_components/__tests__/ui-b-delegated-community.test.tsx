import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityMonitorPanel, EconomyConfigPanel, LevelConfigPanel } from "../admin-community-panels";
import { ModContentLayoutEditorPage } from "../mod-content-layout-editor";
const mocks = vi.hoisted(() => ({ userId: "1", api: vi.fn(), loadLayout: vi.fn(), saveLayout: vi.fn() }));
function translate(key: string) { return key; }
vi.mock("../../_lib/api", () => ({ apiRequest: mocks.api }));
vi.mock("../../_lib/auth", () => ({ useAuthSnapshot: () => ({ ready: true, token: "cookie-session", user: { id: mocks.userId } }) }));
vi.mock("../../_lib/i18n-provider", () => ({ useI18n: () => ({ locale: "en-US", t: translate }), supportedLocales: [{ code: "en-US", label: "English" }] }));
vi.mock("../../_lib/mod-content-api", () => ({ loadAllModContentSectionResources: mocks.loadLayout, updateModContentLayout: mocks.saveLayout, modContentResourceAssetURL: () => "" }));
vi.mock("../catalog-resource-icon", () => ({ CatalogResourceIconPicker: () => null }));
afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); mocks.userId = "1"; });
describe("community administration recovery", () => {
  it("allows configuring a newly added role whose threshold is absent", async () => {
    mocks.api.mockImplementation((path: string) => Promise.resolve(path.endsWith("role-tracks") ? [{ code: "levels", name: "Levels", roles: ["first", "second"] }] : { roleTrackCode: "levels", levelThresholds: [0] }));
    render(<LevelConfigPanel token="cookie-session" />);
    const inputs = await screen.findAllByRole("spinbutton", { name: "admin.community.requiredExperience" });
    fireEvent.change(inputs[1], { target: { value: "250" } });
    expect((inputs[1] as HTMLInputElement).value).toBe("250");
  });
  it.each(["economy", "levels"])("offers retry after %s configuration fails to load", async (panel) => {
    mocks.api.mockRejectedValue(new Error("Config unavailable"));
    render(panel === "economy" ? <EconomyConfigPanel token="cookie-session" /> : <LevelConfigPanel token="cookie-session" />);
    await screen.findByText("Config unavailable");
    expect(screen.getByRole("button", { name: "common.retry" })).toBeTruthy();
  });
  it("ignores old activity responses after a new filter is applied", async () => {
    let completeOld: (value: unknown) => void = () => {};
    mocks.api.mockImplementation((path: string) => path.includes("action=create") ? Promise.resolve({ items: [{ id: "new", username: "Filtered user", markdownAddedBytes: 0, occurredAt: "2026-01-01T00:00:00Z" }] }) : new Promise((resolve) => { completeOld = resolve; }));
    render(<ActivityMonitorPanel token="cookie-session" />);
    await waitFor(() => expect(mocks.api).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("combobox", { name: "admin.community.action" }), { target: { value: "create" } });
    fireEvent.click(screen.getByRole("button", { name: "common.search" }));
    await screen.findByText("Filtered user");
    await act(async () => completeOld({ items: [{ id: "old", username: "Old unfiltered user", markdownAddedBytes: 0, occurredAt: "2026-01-01T00:00:00Z" }] }));
    expect(screen.getByText("Filtered user")).toBeTruthy();
    expect(screen.queryByText("Old unfiltered user")).toBeNull();
  });
});
it("does not retain the previous account's layout after a cookie-session account switch", async () => {
  const section = { publicId: "root", versionPublicId: "version", templateCode: "items", defaultLocale: "en-US", displayMode: "grid", localizations: [{ locale: "en-US", name: "Private first account" }] };
  mocks.loadLayout.mockResolvedValueOnce({ section, categories: [], items: [] }).mockRejectedValueOnce(new Error("Second account denied"));
  const { rerender } = render(<ModContentLayoutEditorPage siteId="example" sectionId="root" />);
  await screen.findByText(/Private first account/);
  mocks.userId = "2";
  rerender(<ModContentLayoutEditorPage siteId="example" sectionId="root" />);
  await screen.findByText("Second account denied");
  expect(screen.queryByText(/Private first account/)).toBeNull();
  expect(screen.queryByRole("button", { name: "modContent.sectionActions.submitLayout" })).toBeNull();
  expect(screen.getByRole("button", { name: "common.retry" })).toBeTruthy();
});
it("preserves localized category descriptions when only its name changes", async () => {
  const section = { publicId: "root", versionPublicId: "version", templateCode: "items", defaultLocale: "en-US", displayMode: "grid", localizations: [{ locale: "en-US", name: "Root" }] };
  const category = { ...section, publicId: "category", parentPublicId: "root", ordinal: 0, localizations: [{ locale: "en-US", name: "Category", summary: "Keep summary", contentMarkdown: "Keep markdown" }] };
  mocks.loadLayout.mockResolvedValue({ section, categories: [category], items: [] });
  mocks.saveLayout.mockRejectedValue(new Error("Stop after recording write"));
  render(<ModContentLayoutEditorPage siteId="example" sectionId="root" />);
  fireEvent.change(await screen.findByRole("textbox", { name: "modContent.sectionActions.name: Category" }), { target: { value: "Renamed" } });
  fireEvent.click(screen.getAllByRole("button", { name: "modContent.sectionActions.submitLayout" })[0]);
  await waitFor(() => expect(mocks.saveLayout).toHaveBeenCalled());
  expect(mocks.saveLayout.mock.calls[0][2].categories[0].localizations[0]).toEqual({ locale: "en-US", name: "Renamed", summary: "Keep summary", contentMarkdown: "Keep markdown" });
});
