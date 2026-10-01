import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectChangelogEditor } from "../project-changelog-editor";
import { LocalizedAssetEditor } from "../localized-asset-editor";
import { SimpleProjectDetailLoader } from "../simple-project-detail";
import { ModpackDetailLoader } from "../modpack-detail";
import { ModEditor } from "../mod-editor";
import { ModpackEditor } from "../modpack-editor";
import { SimpleProjectEditor } from "../simple-project-editor";
import { LogShareViewer } from "../log-share-viewer";

const mocks = vi.hoisted(() => ({ token: "cookie-session", api: vi.fn(), skin: vi.fn(), updateSkin: vi.fn(), log: vi.fn(), changelogs: vi.fn(), saveChangelog: vi.fn(), router: { push: vi.fn(), replace: vi.fn() } }));
function translate(key: string) { return key; }
vi.mock("../../_lib/api", async (original) => ({ ...await original<typeof import("../../_lib/api")>(), apiRequest: mocks.api }));
vi.mock("../../_lib/auth", () => ({ useAuthSnapshot: () => ({ ready: true, token: mocks.token, user: mocks.token ? { id: "1" } : undefined }) }));
vi.mock("../../_lib/i18n-provider", () => ({ useI18n: () => ({ locale: "en-US", t: translate }), supportedLocales: [{ code: "en-US", label: "English" }] }));
vi.mock("../../_lib/project-changelog-api", () => ({ loadProjectChangelogs: mocks.changelogs, saveProjectChangelog: mocks.saveChangelog }));
vi.mock("../../_lib/use-auto-draft", () => ({ useAutoDraft: () => ({ status: "idle", completeDraft: vi.fn() }) }));
vi.mock("../../_lib/skin-api", () => ({ loadSkin: mocks.skin, updateSkin: mocks.updateSkin }));
vi.mock("../../_lib/log-share-api", () => ({ loadPublicLogShare: mocks.log, logShareDownloadURL: (code: string) => `/logs/${code}` }));
vi.mock("../../_lib/minecraft-version-api", () => ({ loadMinecraftVersionConfig: () => Promise.resolve({ versions: [] }) }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("../minecraft-version-picker", () => ({ MinecraftVersionPicker: () => null }));
vi.mock("../tools-playground", () => ({ ToolsPlayground: () => null }));
vi.mock("../review-edit-lock", () => ({ ReviewLockGate: ({ children }: { children: React.ReactNode }) => children }));
afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); mocks.token = "cookie-session"; });

describe("failed detail requests", () => {
  it.each(["simple", "modpack"])("shows a recoverable %s load failure", async (kind) => {
    mocks.api.mockRejectedValue(new Error("Local service unavailable"));
    render(kind === "simple" ? <SimpleProjectDetailLoader projectType="plugin" siteId="example" /> : <ModpackDetailLoader siteId="example" />);
    await screen.findByText("Local service unavailable");
    expect(screen.getByRole("button", { name: "common.retry" })).toBeTruthy();
  });
});

describe("editor load and date guards", () => {
  it.each(["mod", "modpack", "simple"])("offers sign-in for a guest opening an existing %s editor", async (kind) => {
    mocks.token = "";
    render(kind === "mod" ? <ModEditor siteId="existing" /> : kind === "modpack" ? <ModpackEditor siteId="existing" /> : <SimpleProjectEditor projectType="plugin" siteId="existing" />);
    expect(screen.getByRole("link", { name: "common.login" })).toBeTruthy();
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it.each(["mod", "modpack", "simple"])("does not expose a blank %s form after its existing content failed to load", async (kind) => {
    mocks.api.mockRejectedValue(new Error("Existing project unavailable"));
    render(kind === "mod" ? <ModEditor siteId="existing" /> : kind === "modpack" ? <ModpackEditor siteId="existing" /> : <SimpleProjectEditor projectType="plugin" siteId="existing" />);
    await screen.findByText("Existing project unavailable");
    expect(screen.queryByRole("button", { name: "common.save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "mods.submission.actions.submitRevision" })).toBeNull();
    expect(screen.getByRole("button", { name: "common.retry" })).toBeTruthy();
  });
  it("cannot save an asset after its base content failed to load", async () => {
    mocks.skin.mockRejectedValue(new Error("Asset unavailable"));
    render(<LocalizedAssetEditor kind="skin" publicId="asset" />);
    await screen.findByText("Asset unavailable");
    expect(screen.queryByRole("button", { name: "assetEditor.submit" })).toBeNull();
    expect(screen.getByRole("button", { name: "common.retry" })).toBeTruthy();
  });
  it.each(["skin", "blueprint"] as const)("submits every %s language in one metadata revision", async (kind) => {
    const versions = [
      { locale: "en-US", fields: { name: "Original", summary: "Summary", contentMarkdown: "Original content" }, provenance: "human", reviewStatus: "approved", editable: true },
      { locale: "zh-CN", fields: { name: "中文名称", summary: "中文摘要", contentMarkdown: "中文内容" }, provenance: "human", reviewStatus: "approved", editable: true },
    ];
    mocks.skin.mockResolvedValue({ name: "Original", description: "Summary", tags: [], visibility: "public", model: "default", kind: "skin" });
    mocks.updateSkin.mockResolvedValue({ updated: true, reviewRequired: true, revisionId: "revision" });
    mocks.api.mockImplementation((path: string, options?: { method?: string }) => {
      if (options?.method === "PUT") return Promise.resolve({ updated: true, reviewRequired: true, revisionId: "revision" });
      return Promise.resolve(path.includes("/content?") ? { defaultLocale: "en-US", resolvedLocale: "en-US", available: versions.map(({ fields, ...item }) => ({ ...item, ...fields })) } : { title: "Original", description: "Original content" });
    });
    render(<LocalizedAssetEditor kind={kind} publicId="asset" />);
    fireEvent.click(await screen.findByRole("button", { name: "assetEditor.submit" }));
    await screen.findByText("assetEditor.submitted");
    const writes = mocks.api.mock.calls.filter(([, options]) => options?.method === "PUT");
    expect(writes.some(([path]) => path.endsWith("/content"))).toBe(false);
    const body = kind === "skin" ? mocks.updateSkin.mock.calls[0][1] : JSON.parse(writes[0][1].body);
    expect(body.defaultLocale).toBe("en-US");
    expect(body.localizations).toEqual(versions.map(({ locale, fields }) => ({ locale, ...fields })));
    expect(writes.length + mocks.updateSkin.mock.calls.length).toBe(1);
  });
  it("can clear a changelog date without crashing or issuing a write", async () => {
    mocks.changelogs.mockResolvedValue({ target: { id: "project", name: "Project", url: "/mods/project", type: "mod" }, categories: [] });
    const view = render(<ProjectChangelogEditor targetType="mod" targetId="project" />);
    await screen.findByText("changelog.create");
    const date = view.container.querySelector<HTMLInputElement>('input[type="datetime-local"]');
    expect(date).not.toBeNull();
    fireEvent.change(date!, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "common.submit" }));
    await screen.findByText("changelog.validation.required");
    expect(mocks.saveChangelog).not.toHaveBeenCalled();
  });
});

describe("log share navigation", () => {
  it("ignores a previous share's aborted response after navigation", async () => {
    let rejectOld: (error: Error) => void = () => {};
    mocks.log.mockImplementation((code: string) => code === "old" ? new Promise((_, reject) => { rejectOld = reject; }) : Promise.resolve({ title: "New log", originalName: "new.log", createdAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-02T00:00:00Z", entries: [], redactionVersion: 1 }));
    const { rerender } = render(<LogShareViewer code="old" />);
    rerender(<LogShareViewer code="new" />);
    await screen.findByText("New log");
    await act(async () => rejectOld(new DOMException("Aborted", "AbortError")));
    await waitFor(() => expect(screen.getByText("New log")).toBeTruthy());
  });
});
