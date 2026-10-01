import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModContentResource, ModContentSection, ModContentTemplate } from "../../_lib/mod-content-api";
import { ModContentLayoutEditorPage } from "../mod-content-layout-editor";
import { ModContentResourceEditor } from "../mod-content-resource-editor";

const mocks = vi.hoisted(() => ({
  layout: vi.fn(), saveLayout: vi.fn(), sections: vi.fn(), templates: vi.fn(), resource: vi.fn(),
  updateResource: vi.fn(), createResource: vi.fn(), archiveResource: vi.fn(),
  loadDraft: vi.fn(), saveDraft: vi.fn(), completeDraft: vi.fn(),
}));
function translate(key: string) { return key; }
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../_lib/auth", () => ({ useAuthSnapshot: () => ({ ready: true, token: "cookie-session", user: { id: "synthetic-owner" } }) }));
vi.mock("../../_lib/i18n-provider", () => ({ useI18n: () => ({ locale: "en-US", t: translate }), supportedLocales: [{ code: "en-US", label: "English" }] }));
vi.mock("../../_lib/mod-content-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../_lib/mod-content-api")>(),
  loadAllModContentSectionResources: mocks.layout, updateModContentLayout: mocks.saveLayout,
  loadModContentSections: mocks.sections, loadModContentTemplates: mocks.templates,
  loadModContentResource: mocks.resource, updateModContentResource: mocks.updateResource,
  createModContentResource: mocks.createResource, archiveModContentResource: mocks.archiveResource,
}));
vi.mock("../../_lib/draft-api", () => ({ loadUserDraft: mocks.loadDraft, saveUserDraft: mocks.saveDraft, completeUserDraft: mocks.completeDraft }));
vi.mock("../tools-playground", () => ({ ToolsPlayground: () => null }));

function section(publicId: string, parentPublicId = "", name = publicId): ModContentSection {
  return { publicId, parentPublicId, versionPublicId: "version", templatePublicId: "template", templateCode: "items", templateBuiltin: true, templateI18nKey: "items", defaultLocale: "en-US", displayMode: "compact", ordinal: 0, status: "active", resourceCount: 0, localizations: [{ locale: "en-US", name, summary: "", contentMarkdown: "" }] };
}
const template: ModContentTemplate = {
  publicId: "template", code: "items", builtin: true, i18nKey: "items", defaultLocale: "en-US", defaultDisplayMode: "compact", status: "active", localizations: [],
  definition: { resourceKinds: ["minecraft.item"], entryTypes: [{ code: "item", names: { "en-US": "Item" }, kindCodes: ["minecraft.item"], groups: [{ code: "properties", names: { "en-US": "Properties" }, fields: [{ code: "damage", type: "range", names: { "en-US": "Damage" }, paths: [["damage"]], editable: true }] }] }] },
};
function resource(): ModContentResource {
  return {
    entityId: "entity", publicId: "resource", kindCode: "minecraft.item", canonicalId: "example:fresh",
    versions: [{ publicId: "version", label: "1.0", hasDetail: true, minecraftVersions: ["1.21"], loaders: ["fabric"], modVersion: "1.0", sourceKind: "manual", revisionId: "import-revision", registry: "items", iconPath: "", modSiteId: "example", names: { "en-US": "Fresh resource" } }],
    details: [{ versionPublicId: "version", sectionPublicId: "root", entryTypeCode: "item", definitionSchemaVersion: 1, defaultLocale: "en-US", definition: { damage: [1, 3] }, status: "active", publishedRevisionId: "fresh-revision", localizations: [{ locale: "en-US", name: "Fresh resource", summary: "", contentMarkdown: "Fresh description" }] }],
  };
}
function restoredDraft() {
  return {
    draftKey: "mod-resource:example:edit:resource", updatedAt: "2026-10-01T00:00:00Z",
    payload: { activeVersionId: "version", canonicalId: "example:restored", defaultLocale: "en-US", definition: { damage: [4, 9] }, entryTypeCode: "item", iconFilePublicId: "", iconSmallFilePublicId: "", kindCode: "minecraft.item", reason: "Restored edit", renderFilePublicId: "", selectedSectionId: "root", localizations: [{ locale: "en-US", fields: { name: "Restored resource", contentMarkdown: "Restored description" }, provenance: "human", reviewStatus: "draft", editable: true }] },
  };
}
afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.sections.mockResolvedValue([section("root")]);
  mocks.templates.mockResolvedValue([template]);
  mocks.resource.mockResolvedValue(resource());
  // Capture the actual write boundary without pretending that a backend persisted it.
  mocks.updateResource.mockRejectedValue(new Error("Captured resource write"));
  mocks.saveLayout.mockRejectedValue(new Error("Captured layout write"));
  mocks.loadDraft.mockResolvedValue(restoredDraft());
  mocks.saveDraft.mockResolvedValue({ updatedAt: "2026-10-01T00:00:00Z" });
  mocks.completeDraft.mockResolvedValue({ completed: true });
});

describe("delegated layout and resource boundaries", () => {
  it("rejects a parent change that makes a descendant depth five while allowing depth four", async () => {
    const categories = [section("moving", "root", "Moving"), section("moving-child", "moving", "Moving child"), section("target-one", "root"), section("target-two", "target-one"), section("target-three", "target-two")];
    mocks.layout.mockResolvedValue({ section: section("root"), categories, items: [] });
    render(<ModContentLayoutEditorPage siteId="example" sectionId="root" />);
    const row = (await screen.findByRole("textbox", { name: "modContent.sectionActions.name: Moving" })).closest("section");
    expect(row).not.toBeNull();
    const parent = within(row!).getByRole<HTMLSelectElement>("combobox", { name: "modContent.sectionActions.parentCategory" });
    expect(within(parent).getByRole("option", { name: "target-three" })).toBeTruthy();
    fireEvent.change(parent, { target: { value: "target-three" } });
    expect(parent.value).toBe("root");
    fireEvent.click(screen.getAllByRole("button", { name: "modContent.sectionActions.submitLayout" })[0]);
    await screen.findByText("Captured layout write");
    expect(mocks.saveLayout.mock.calls[0][2].categories.find((item: { publicId: string }) => item.publicId === "moving").parentPublicId).toBe("root");
    fireEvent.change(parent, { target: { value: "target-two" } });
    expect(parent.value).toBe("target-two");
    fireEvent.click(screen.getAllByRole("button", { name: "modContent.sectionActions.submitLayout" })[0]);
    await waitFor(() => expect(mocks.saveLayout).toHaveBeenCalledTimes(2));
    const saved = mocks.saveLayout.mock.calls[1][2].categories as Array<{ publicId: string; parentPublicId: string }>;
    expect(saved.find((item) => item.publicId === "moving")?.parentPublicId).toBe("target-two");
    expect(saved.find((item) => item.publicId === "moving-child")?.parentPublicId).toBe("moving");
  });

  it("does not restore or autosave a draft after resource GET failure and retries with fresh data", async () => {
    window.history.replaceState({}, "", "/mods/example/resources/resource/edit?draft=selected");
    mocks.resource.mockRejectedValueOnce(new Error("Resource unavailable"));
    const { container } = render(<ModContentResourceEditor mode="edit" siteId="example" resourceId="resource" />);
    await screen.findByText("Resource unavailable");
    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryByRole("button", { name: "common.save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "common.delete" })).toBeNull();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(mocks.loadDraft).not.toHaveBeenCalled();
    expect(mocks.saveDraft).not.toHaveBeenCalled();
    expect(mocks.updateResource).not.toHaveBeenCalled();
    expect(mocks.createResource).not.toHaveBeenCalled();
    expect(mocks.archiveResource).not.toHaveBeenCalled();
    window.history.replaceState({}, "", "/mods/example/resources/resource/edit");
    fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
    expect(await screen.findByDisplayValue("Fresh resource")).toBeTruthy();
    expect(mocks.resource).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Resource unavailable")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "common.save" })[0]);
    await screen.findByText("Captured resource write");
    expect(mocks.updateResource).toHaveBeenCalledTimes(1);
    expect(mocks.updateResource.mock.calls[0][2]).toMatchObject({ canonicalId: "example:fresh", baseRevisionId: "fresh-revision", versionPublicId: "version", sectionPublicId: "root", localizations: [{ locale: "en-US", name: "Fresh resource", contentMarkdown: "Fresh description" }] });
    expect(mocks.loadDraft).not.toHaveBeenCalled();
  });

  it("shows a late restored range and submits those values and subsequent edits consistently", async () => {
    window.history.replaceState({}, "", "/mods/example/resources/resource/edit?draft=selected");
    let restore!: (value: ReturnType<typeof restoredDraft>) => void;
    mocks.loadDraft.mockReturnValue(new Promise((resolve) => { restore = resolve; }));
    render(<ModContentResourceEditor mode="edit" siteId="example" resourceId="resource" />);
    const minimum = await screen.findByRole<HTMLInputElement>("spinbutton", { name: "Damage minimum" });
    const maximum = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Damage maximum" });
    expect([minimum.value, maximum.value]).toEqual(["1", "3"]);
    await waitFor(() => expect(mocks.loadDraft).toHaveBeenCalledWith("selected", "cookie-session"));
    await act(async () => { restore(restoredDraft()); });
    expect([minimum.value, maximum.value]).toEqual(["4", "9"]);
    expect(screen.getByDisplayValue("Restored resource")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "common.save" })[0]);
    await screen.findByText("Captured resource write");
    expect(mocks.updateResource.mock.calls[0][2].definition).toEqual({ damage: [4, 9] });
    fireEvent.change(maximum, { target: { value: "12" } });
    fireEvent.change(minimum, { target: { value: "7" } });
    expect([minimum.value, maximum.value]).toEqual(["7", "12"]);
    fireEvent.click(screen.getAllByRole("button", { name: "common.save" })[0]);
    await waitFor(() => expect(mocks.updateResource).toHaveBeenCalledTimes(2));
    expect(mocks.updateResource.mock.calls[1][2].definition).toEqual({ damage: [7, 12] });
  });
});
