// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), load: vi.fn(), versions: vi.fn() }));
vi.mock("../app/_lib/api", () => ({ apiRequest: mocks.request, API_BASE_URL: "http://127.0.0.1:8080" }));
vi.mock("../app/_lib/auth", () => ({ useAuthSnapshot: () => ({ ready: true, token: "", user: undefined }) }));
vi.mock("../app/_lib/comment-api", async (original) => ({ ...await original<object>(), loadComments: mocks.load }));
vi.mock("../app/_lib/minecraft-version-api", () => ({ getCachedMinecraftVersionConfig: () => undefined, loadMinecraftVersionConfig: mocks.versions }));
vi.mock("../app/_components/comment-markdown-editor", () => ({ CommentMarkdownEditor: () => null }));
import { I18nProvider, useI18n } from "../app/_lib/i18n-provider";
import { AdminAntiAbusePanel } from "../app/_components/admin-anti-abuse-panel";
import { MinecraftVersionPicker } from "../app/_components/minecraft-version-picker";
import { ResourcePickerDialog } from "../app/_components/editor/resource-picker-dialog";
import { CommentSection } from "../app/_components/comment-section";

beforeEach(() => {
  localStorage.clear(); localStorage.setItem("mcmods-ui-locale", "en-US");
  mocks.request.mockReset(); mocks.load.mockReset(); mocks.versions.mockReset();
  mocks.request.mockResolvedValue({ items: [], counts: {}, policies: {}, enabled: true, emergencyMode: false });
  mocks.load.mockResolvedValue({ items: [], total: 0 }); mocks.versions.mockResolvedValue({ versions: [], loaders: [] });
});
afterEach(() => { cleanup(); localStorage.clear(); });
function FallbackProbe() {
  const { getOwnTranslation, t } = useI18n();
  return <span data-own={getOwnTranslation("de-DE", "antiAbuse.title")}>{t("antiAbuse.title")}</span>;
}
it("localizes anti-abuse controls in English and Chinese with the real provider", async () => {
  const { rerender } = render(<I18nProvider><AdminAntiAbusePanel token="fixture" /></I18nProvider>);
  await screen.findByRole("heading", { name: "Risk overview" });
  expect(await screen.findByText("Log threshold")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add restriction" })).toBeTruthy();
  localStorage.setItem("mcmods-ui-locale", "zh-CN");
  rerender(<I18nProvider><AdminAntiAbusePanel token="fixture" /></I18nProvider>);
  expect(await screen.findByRole("heading", { name: "风险总览" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "添加限制" })).toBeTruthy();
});
it("uses the existing English fallback without claiming a German translation", () => {
  localStorage.setItem("mcmods-ui-locale", "de-DE");
  render(<I18nProvider><FallbackProbe /></I18nProvider>);
  expect(screen.getByText("Risk overview").getAttribute("data-own")).toBe("");
});
it("shows passed and failed challenges separately", async () => {
  mocks.request.mockResolvedValue({ items: [], counts: {}, policies: {}, enabled: true, emergencyMode: false, challengePassed24h: 2, challengeFailed24h: 3 });
  render(<I18nProvider><AdminAntiAbusePanel token="fixture" /></I18nProvider>);
  expect(await screen.findByText("2 / 3")).toBeTruthy();
});
it("localizes compressed legacy-version groups", async () => {
  render(<I18nProvider><MinecraftVersionPicker values={["b1.1", "b1.2"]} onChange={() => {}} config={{ versions: [{ code: "b1.1", type: "legacy" }, { code: "b1.2", type: "legacy" }], loaders: [] }} /></I18nProvider>);
  expect(await screen.findByRole("button", { name: "Legacy versions" })).toBeTruthy();
});
it("localizes manual resource input and validation without custom labels", async () => {
  const loadPage = vi.fn().mockResolvedValue({ items: [], total: 0, limit: 40, offset: 0 });
  render(<I18nProvider><ResourcePickerDialog open value={[]} allowUnresolved loadPage={loadPage} onClose={() => {}} onConfirm={() => {}} /></I18nProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Can't find your resource?" }));
  expect(screen.getByText("Enter the resource ID here")).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText("namespace:identifier"), { target: { value: "bad space" } });
  expect(screen.getByText("Invalid ID format")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add an input" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Return to results" }).hasAttribute("disabled")).toBe(true);
});
it("localizes floor navigation labels and invalid-floor feedback", async () => {
  const { container } = render(<I18nProvider><CommentSection targetType="mod" targetKey="fixture" /></I18nProvider>);
  await screen.findByLabelText("Go to floor");
  fireEvent.change(screen.getByPlaceholderText("Floor"), { target: { value: "0" } });
  fireEvent.submit(container.querySelector("form")!);
  expect(await screen.findByText("Enter a valid positive floor number.")).toBeTruthy();
});
