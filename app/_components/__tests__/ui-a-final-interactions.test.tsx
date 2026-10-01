import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminConsole } from "../admin-console";
import { UserHome } from "../user-home";
import { AdminStickerPanel } from "../admin-sticker-panel";
import { FavoriteModpackExport } from "../favorite-modpack-export";
import type { FavoriteModpackExportDetail, FavoriteModpackExportPreview } from "../../_lib/favorite-api";

const mocks = vi.hoisted(() => ({ api: vi.fn(), saveAuth: vi.fn(), uploadAvatar: vi.fn(), userId: "account-a", section: "settings", preflight: vi.fn(), createExport: vi.fn(), loadExport: vi.fn(), loadExports: vi.fn(), download: vi.fn(), router: { push: vi.fn(), replace: vi.fn() } }));
function translate(key: string) { return key; }
vi.mock("../../_lib/api", async (original) => ({ ...await original<typeof import("../../_lib/api")>(), apiRequest: mocks.api }));
vi.mock("../../_lib/auth", () => ({ canAccessAdmin: () => true, hasPermission: () => true, clearAuth: vi.fn(), saveAuth: mocks.saveAuth, isCurrentAuthUser: (expected: string | undefined) => expected !== undefined && expected === mocks.userId, useAuthSnapshot: () => ({ ready: true, token: "cookie-session", user: { id: mocks.userId, username: mocks.userId, email: "fixture@example.invalid", roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 } }) }));
vi.mock("../../_lib/i18n-provider", () => ({ useI18n: () => ({ locale: "en-US", t: translate }), supportedLocales: [{ code: "en-US", label: "English" }] }));
vi.mock("../../_lib/favorite-api", async (original) => ({ ...await original<typeof import("../../_lib/favorite-api")>(), preflightFavoriteModpackExport: mocks.preflight, createFavoriteModpackExport: mocks.createExport, loadFavoriteModpackExport: mocks.loadExport, loadFavoriteModpackExports: mocks.loadExports, downloadFavoriteModpackExport: mocks.download }));
vi.mock("../../_lib/oss-upload", async (original) => ({ ...await original<typeof import("../../_lib/oss-upload")>(), uploadUserFileToOSS: mocks.uploadAvatar }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, useSearchParams: () => new URLSearchParams(`section=${mocks.section}`), usePathname: () => "/admin" }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("../theme-provider", () => ({ useTheme: () => ({ toggleTheme: vi.fn() }) }));
vi.mock("../site-brand-provider", () => ({ useSiteBrand: () => ({ siteName: "Fixture", logoUrl: "" }) }));
vi.mock("../admin-dashboard-panel", () => ({ AdminDashboardPanel: () => <p>Dashboard fixture</p>, AdminProjectWorkbenchPanel: () => null }));
vi.mock("../user-avatar", () => ({ UserAvatar: () => null }));
vi.mock("../content-language-preferences", () => ({ ContentLanguagePreferences: () => null }));
vi.mock("../timezone-picker", () => ({ TimezonePicker: () => null }));
vi.mock("../minecraft-version-picker", () => ({ MinecraftVersionPicker: ({ disabled, values, onChange }: { disabled: boolean; values: string[]; onChange: (values: string[]) => void }) => <select aria-label="Minecraft version fixture" disabled={disabled} value={values[0] || ""} onChange={(event) => onChange([event.target.value])}><option value="" /><option value="1.21.1">1.21.1</option><option value="1.20.1">1.20.1</option></select> }));

function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("resolver not initialized"); };
  let reject: (error: Error) => void = () => { throw new Error("rejecter not initialized"); };
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
beforeEach(() => { vi.resetAllMocks(); mocks.userId = "account-a"; mocks.section = "settings"; });

const adminUser = { id: "1", username: "Existing", email: "existing@example.invalid", status: "active", roleCodes: [], roles: [], createdAt: "2026-01-01T00:00:00Z" };
function adminResponse(path: string) {
  if (path === "/api/v1/admin/dashboard") return {};
  if (path === "/api/v1/admin/config") return { features: {} };
  if (path === "/api/v1/admin/permissions") return { roles: [], permissions: [] };
  if (path === "/api/v1/admin/users") return [adminUser];
  throw new Error(`Unexpected fixture endpoint ${path}`);
}
async function openUsers() {
  const view = render(<AdminConsole />);
  await screen.findByText("Dashboard fixture");
  view.container.querySelectorAll<HTMLButtonElement>("[data-admin-group]").forEach((button) => { if (button.textContent?.endsWith("+")) fireEvent.click(button); });
  const button = view.container.querySelector<HTMLButtonElement>('[data-admin-panel="users"]');
  expect(button).not.toBeNull();
  fireEvent.click(button!);
  return view;
}
function fillUserForm() {
  fireEvent.change(screen.getByRole("textbox", { name: "admin.username" }), { target: { value: "Created user" } });
  fireEvent.change(screen.getByRole("textbox", { name: "admin.email" }), { target: { value: "created@example.invalid" } });
  fireEvent.change(screen.getByLabelText("admin.initialPassword"), { target: { value: "synthetic-password" } });
}

describe("FE-UIA-009 asynchronous user creation", () => {
  it("retains the real form through both awaits, then resets and reports success", async () => {
    const post = deferred<typeof adminUser>();
    const refresh = deferred<typeof adminUser[]>();
    let reads = 0;
    mocks.api.mockImplementation((path: string, options?: RequestInit) => options?.method === "POST" ? post.promise : path === "/api/v1/admin/users" && ++reads > 1 ? refresh.promise : Promise.resolve(adminResponse(path)));
    await openUsers();
    fillUserForm();
    fireEvent.click(screen.getByRole("button", { name: "admin.createUser" }));
    expect((screen.getByRole("button", { name: "admin.saving" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => post.resolve(adminUser));
    expect((screen.getByRole("textbox", { name: "admin.username" }) as HTMLInputElement).value).toBe("Created user");
    await act(async () => refresh.resolve([adminUser]));
    await screen.findByText("admin.userCreated");
    expect((screen.getByRole("textbox", { name: "admin.username" }) as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("button", { name: "admin.createUser" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("keeps user input and permits retry after a rejected create", async () => {
    mocks.api.mockImplementation((path: string, options?: RequestInit) => options?.method === "POST" ? Promise.reject(new Error("Create temporarily unavailable")) : Promise.resolve(adminResponse(path)));
    await openUsers();
    fillUserForm();
    fireEvent.click(screen.getByRole("button", { name: "admin.createUser" }));
    await screen.findByText("Create temporarily unavailable");
    expect((screen.getByRole("textbox", { name: "admin.username" }) as HTMLInputElement).value).toBe("Created user");
    expect((screen.getByRole("button", { name: "admin.createUser" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

function profile(id: string) {
  return { publicId: id, username: id, signature: `${id} private signature`, signatureMaxBytes: 1000, avatarUrl: "", profileBackgroundUrl: "", timezone: "UTC", messageReceive: true, showOnlineStatus: false, onlineStatus: "hidden", publicCardStatSlots: ["", "", "", "", "", ""], cardStatisticOptions: [], canUpdateAvatar: false, canUseAnimatedAvatar: false };
}
function userResponse(path: string, id = mocks.userId) {
  if (path.endsWith("profile-settings")) return profile(id);
  if (path.endsWith("notification-settings")) return { emailEnabled: false, projectUpdatesEnabled: true };
  if (path.endsWith("overview")) return { followers: 0, following: 0, blocked: 0, aiBalance: { usedTokens: 0, reservedTokens: 0, limitTokens: 100, remainingTokens: 100, unlimited: false } };
  throw new Error(`Unexpected fixture endpoint ${path}`);
}
describe("FE-UIA-011 cookie account workspace isolation", () => {
  it("still saves the current account profile with an explicit identity condition", async () => {
    mocks.api.mockImplementation((path: string, options?: RequestInit) => Promise.resolve(options?.method === "PUT" ? { ...profile("account-a"), signature: "updated own signature" } : userResponse(path)));
    render(<UserHome />);
    await screen.findByDisplayValue("account-a private signature");
    fireEvent.change(screen.getByLabelText("user.signature"), { target: { value: "updated own signature" } });
    fireEvent.click(screen.getByRole("button", { name: "user.saveProfile" }));
    await screen.findByText("user.profileSaved");
    expect(mocks.saveAuth).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ id: "account-a", signature: "updated own signature" }) }), "account-a");
    expect(screen.getByDisplayValue("updated own signature")).toBeTruthy();
  });
  it("immediately clears account A private inputs while account B loads on the same cookie token", async () => {
    const next = deferred<ReturnType<typeof profile>>();
    mocks.api.mockImplementation((path: string) => path.endsWith("profile-settings") && mocks.userId === "account-b" ? next.promise : Promise.resolve(userResponse(path)));
    const { rerender } = render(<UserHome />);
    await screen.findByDisplayValue("account-a private signature");
    mocks.userId = "account-b";
    rerender(<UserHome />);
    expect(screen.queryByDisplayValue("account-a private signature")).toBeNull();
    await act(async () => next.resolve(profile("account-b")));
    await screen.findByDisplayValue("account-b private signature");
  });
  it("ignores an account A late private read after account B completed", async () => {
    const old = deferred<ReturnType<typeof profile>>();
    mocks.api.mockImplementation((path: string) => path.endsWith("profile-settings") && mocks.userId === "account-a" ? old.promise : Promise.resolve(userResponse(path)));
    const { rerender } = render(<UserHome />);
    mocks.userId = "account-b";
    rerender(<UserHome />);
    await screen.findByDisplayValue("account-b private signature");
    await act(async () => old.resolve(profile("account-a")));
    expect(screen.queryByDisplayValue("account-a private signature")).toBeNull();
    expect(screen.getByDisplayValue("account-b private signature")).toBeTruthy();
  });
  it("does not restore account A auth when its profile save finishes after a cookie account switch", async () => {
    const save = deferred<ReturnType<typeof profile>>();
    mocks.api.mockImplementation((path: string, options?: RequestInit) => options?.method === "PUT" ? save.promise : Promise.resolve(userResponse(path)));
    const { rerender } = render(<UserHome />);
    await screen.findByDisplayValue("account-a private signature");
    fireEvent.click(screen.getByRole("button", { name: "user.saveProfile" }));
    mocks.userId = "account-b";
    rerender(<UserHome />);
    await screen.findByDisplayValue("account-b private signature");
    await act(async () => save.resolve(profile("account-a")));
    expect(mocks.saveAuth).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("account-b private signature")).toBeTruthy();
  });
  it("checks the global account identity even before React unmounts the old workspace", async () => {
    const save = deferred<ReturnType<typeof profile>>();
    mocks.api.mockImplementation((path: string, options?: RequestInit) => options?.method === "PUT" ? save.promise : Promise.resolve(userResponse(path)));
    render(<UserHome />);
    await screen.findByDisplayValue("account-a private signature");
    fireEvent.click(screen.getByRole("button", { name: "user.saveProfile" }));
    // Simulate the auth store changing first; deliberately do not rerender.
    mocks.userId = "account-b";
    await act(async () => save.resolve(profile("account-a")));
    expect(mocks.saveAuth).not.toHaveBeenCalled();
  });
  it("does not attach account A uploaded avatar using account B's later cookie", async () => {
    const upload = deferred<{ id: string }>();
    mocks.uploadAvatar.mockReturnValue(upload.promise);
    mocks.api.mockImplementation((path: string) => Promise.resolve(path.endsWith("profile-settings") ? { ...profile(mocks.userId), canUpdateAvatar: true } : userResponse(path)));
    const { rerender } = render(<UserHome />);
    fireEvent.change(await screen.findByLabelText("user.chooseAvatar"), { target: { files: [new File(["synthetic jpeg"], "fixture.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(mocks.uploadAvatar).toHaveBeenCalledTimes(1));
    mocks.userId = "account-b";
    rerender(<UserHome />);
    await screen.findByDisplayValue("account-b private signature");
    await act(async () => upload.resolve({ id: "synthetic-account-a-file" }));
    expect(mocks.api.mock.calls.some(([, options]) => options?.method === "PUT")).toBe(false);
    expect(mocks.saveAuth).not.toHaveBeenCalled();
  });
});

function stickerData() {
  return { locales: ["en-US"], packs: [{ code: "dogs", status: "active", sortOrder: 0, translations: { "en-US": "Dogs pack" }, stickers: [] }, { code: "faces", status: "active", sortOrder: 10, translations: { "en-US": "Faces pack" }, stickers: [{ code: "wave", status: "active", sortOrder: 0, translations: { "en-US": "Wave sticker" }, imageFileId: "synthetic-file", mimeType: "image/png", width: 16, height: 16, fileSize: 10, checksum: "synthetic" }] }] };
}
describe("FE-UIA-015 sticker recovery", () => {
  it.each([["pack", "toggle"], ["pack", "delete"], ["sticker", "toggle"], ["sticker", "delete"]] as const)("reports a rejected %s %s, releases busy and permits a successful retry", async (target, action) => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const rejected = deferred<unknown>();
    let writes = 0;
    const data = stickerData();
    const endpoint = target === "pack" ? "/api/v1/admin/sticker-packs/dogs" : "/api/v1/admin/sticker-packs/faces/stickers/wave";
    mocks.api.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/v1/admin/stickers") return Promise.resolve(data);
      if (path === endpoint && options?.method === (action === "delete" ? "DELETE" : "PUT")) {
        if (++writes === 1) return rejected.promise;
        if (target === "pack") { if (action === "delete") data.packs.shift(); else data.packs[0].status = "disabled"; }
        else { if (action === "delete") data.packs[1].stickers = []; else data.packs[1].stickers[0].status = "disabled"; }
        return Promise.resolve(undefined);
      }
      throw new Error(`Unexpected fixture endpoint ${path}`);
    });
    render(<AdminStickerPanel token="cookie-session" />);
    const heading = await screen.findByRole("heading", { name: target === "pack" ? "Dogs pack" : "Faces pack" });
    const scope = target === "pack" ? heading.closest("article")! : screen.getByText("Wave sticker").closest("div")!;
    const button = within(scope).getByRole("button", { name: action === "delete" ? "common.delete" : "admin.stickers.disable" });
    fireEvent.click(button);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(writes).toBe(1);
    await act(async () => rejected.reject(new Error("Sticker action unavailable")));
    await screen.findByText("Sticker action unavailable");
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(writes).toBe(2));
    await waitFor(() => expect(screen.queryByText("Sticker action unavailable")).toBeNull());
    if (action === "toggle") expect(within(scope).getByRole("button", { name: "admin.stickers.enable" })).toBeTruthy();
    else expect(screen.queryByText(target === "pack" ? "Dogs pack" : "Wave sticker")).toBeNull();
  });
});

function exportDetail(status: FavoriteModpackExportDetail["task"]["status"]): FavoriteModpackExportDetail {
  return { task: { id: "export-task", collectionId: "folder", packName: "Synthetic pack", packVersion: "1", minecraftVersion: "1.21.1", loader: "neoforge", loaderVersion: "21", status, collectionItemCount: 1, exportedModCount: 1, autoDependencyCount: 0, skippedItemCount: 0, failedItemCount: 0, finalFileCount: 1, fileSize: 20, createdAt: "2026-01-01T00:00:00Z" }, items: [], downloadAvailable: status === "ready" };
}
function preview(version: string, loader: "neoforge" | "fabric" | "forge"): FavoriteModpackExportPreview {
  return { collectionId: "folder", collectionName: "Folder", minecraftVersion: version, loader, loaderVersion: "21", collectionItemCount: 1, exportedModCount: 1, autoDependencyCount: 0, skippedItemCount: 0, failedItemCount: 0, items: [{ sourceProjectType: "mod", sourceProjectName: "Synthetic mod", resultType: "exported" }] };
}
describe("FE-UIA-016 export failure and selection recovery", () => {
  it("reports a failed poll, retries and reaches ready without duplicate automatic downloads", async () => {
    vi.useFakeTimers();
    mocks.loadExport.mockResolvedValueOnce(exportDetail("pending")).mockRejectedValueOnce(new Error("Poll temporarily unavailable")).mockResolvedValue(exportDetail("ready"));
    mocks.download.mockResolvedValue(undefined);
    render(<FavoriteModpackExport token="cookie-session" collectionId="folder" collectionName="Folder" initialTaskId="export-task" />);
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(screen.getByText("Poll temporarily unavailable")).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(screen.getByText("favorites.modpackExport.status.ready")).toBeTruthy();
    expect(screen.queryByText("Poll temporarily unavailable")).toBeNull();
    expect(mocks.download).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(mocks.loadExport).toHaveBeenCalledTimes(3);
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });
  it("shows both automatic and explicit download failures and permits a manual retry", async () => {
    const retry = deferred<void>();
    mocks.loadExport.mockResolvedValue(exportDetail("ready"));
    mocks.download.mockRejectedValueOnce(new Error("Automatic download unavailable")).mockRejectedValueOnce(new Error("Manual download unavailable")).mockReturnValueOnce(retry.promise);
    render(<FavoriteModpackExport token="cookie-session" collectionId="folder" collectionName="Folder" initialTaskId="export-task" />);
    await screen.findByText("Automatic download unavailable");
    fireEvent.click(screen.getByRole("button", { name: "favorites.modpackExport.download" }));
    await screen.findByText("Manual download unavailable");
    fireEvent.click(screen.getByRole("button", { name: "favorites.modpackExport.download" }));
    expect((screen.getByRole("button", { name: "favorites.modpackExport.download" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "favorites.modpackExport.download" }));
    expect(mocks.download).toHaveBeenCalledTimes(3);
    await act(async () => retry.resolve(undefined));
    await waitFor(() => expect(screen.queryByText("Manual download unavailable")).toBeNull());
    expect(screen.queryByText("Automatic download unavailable")).toBeNull();
    expect(mocks.download).toHaveBeenCalledTimes(3);
  });
  it.each(["version", "loader"] as const)("requires a fresh preflight after changing the %s selection", async (selection) => {
    mocks.preflight.mockImplementation((_token: string, _folder: string, version: string, loader: "neoforge" | "fabric" | "forge") => Promise.resolve(preview(version, loader)));
    mocks.createExport.mockResolvedValue({ taskId: "export-task", status: "pending" });
    mocks.loadExport.mockResolvedValue(exportDetail("pending"));
    render(<FavoriteModpackExport token="cookie-session" collectionId="folder" collectionName="Folder" />);
    fireEvent.click(screen.getByRole("button", { name: "favorites.modpackExport.open" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Minecraft version fixture" }), { target: { value: "1.21.1" } });
    fireEvent.click(screen.getByRole("button", { name: "favorites.modpackExport.preflight" }));
    await screen.findByRole("button", { name: "favorites.modpackExport.create" });
    fireEvent.change(screen.getByRole("combobox", { name: selection === "version" ? "Minecraft version fixture" : "favorites.modpackExport.loader" }), { target: { value: selection === "version" ? "1.20.1" : "fabric" } });
    expect(screen.queryByRole("button", { name: "favorites.modpackExport.create" })).toBeNull();
    expect(mocks.createExport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "favorites.modpackExport.preflight" }));
    fireEvent.click(await screen.findByRole("button", { name: "favorites.modpackExport.create" }));
    await waitFor(() => expect(mocks.createExport).toHaveBeenCalledWith("cookie-session", "folder", selection === "version" ? "1.20.1" : "1.21.1", selection === "loader" ? "fabric" : "neoforge", false));
  });
});

describe("FE-UIA-022 favorite folder item scope", () => {
  const folders = [{ id: "default", name: "Default folder", isDefault: true, isPublic: false, itemCount: 0 }, { id: "a", name: "Folder A", isDefault: false, isPublic: false, itemCount: 1 }, { id: "b", name: "Folder B", isDefault: false, isPublic: false, itemCount: 1 }];
  const entry = (id: string) => ({ entityType: "mod", entityKey: `project-${id}`, metadata: { primaryName: `${id.toUpperCase()} private entry` } });
  it("shows a loading state instead of A items under B's heading until B resolves", async () => {
    mocks.section = "favorites";
    const b = deferred<{ items: ReturnType<typeof entry>[] }>();
    mocks.api.mockImplementation((path: string) => Promise.resolve(path.endsWith("/favorite-collections") ? { items: folders } : path.endsWith("/default/items") ? { items: [] } : path.endsWith("/a/items") ? { items: [entry("a")] } : path.endsWith("/b/items") ? b.promise : userResponse(path)));
    render(<UserHome />);
    fireEvent.click(await screen.findByRole("button", { name: /Folder A/ }));
    await screen.findByText("A private entry");
    fireEvent.click(screen.getByRole("button", { name: /Folder B/ }));
    expect(screen.getByRole("heading", { name: "Folder B" })).toBeTruthy();
    expect(screen.queryByText("A private entry")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("common.loading");
    await act(async () => b.resolve({ items: [entry("b")] }));
    await screen.findByText("B private entry");
  });
  it("keeps B's failed item read separate from A and recovers through an explicit retry", async () => {
    mocks.section = "favorites";
    let reads = 0;
    mocks.api.mockImplementation((path: string) => path.endsWith("/favorite-collections") ? Promise.resolve({ items: folders }) : path.endsWith("/default/items") ? Promise.resolve({ items: [] }) : path.endsWith("/a/items") ? Promise.resolve({ items: [entry("a")] }) : path.endsWith("/b/items") ? ++reads === 1 ? Promise.reject(new Error("B entries unavailable")) : Promise.resolve({ items: [entry("b")] }) : Promise.resolve(userResponse(path)));
    render(<UserHome />);
    fireEvent.click(await screen.findByRole("button", { name: /Folder A/ }));
    await screen.findByText("A private entry");
    fireEvent.click(screen.getByRole("button", { name: /Folder B/ }));
    await screen.findByText("B entries unavailable");
    expect(screen.queryByText("A private entry")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
    await screen.findByText("B private entry");
    expect(screen.queryByText("B entries unavailable")).toBeNull();
    expect(reads).toBe(2);
  });
  it("drops the deleted non-default folder's entries while loading the selected default folder", async () => {
    mocks.section = "favorites";
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let remaining = folders.slice(0, 2);
    let defaultReads = 0;
    const reselectedDefault = deferred<{ items: ReturnType<typeof entry>[] }>();
    mocks.api.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === "DELETE") { remaining = folders.slice(0, 1); return Promise.resolve(undefined); }
      return Promise.resolve(path.endsWith("/favorite-collections") ? { items: remaining } : path.endsWith("/default/items") ? ++defaultReads === 1 ? { items: [] } : reselectedDefault.promise : path.endsWith("/a/items") ? { items: [entry("a")] } : userResponse(path));
    });
    render(<UserHome />);
    await screen.findByText("favorites.empty");
    fireEvent.click(screen.getByRole("button", { name: /Folder A/ }));
    await screen.findByText("A private entry");
    fireEvent.click(screen.getByTitle("common.delete"));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Folder A/ })).toBeNull());
    expect(screen.queryByText("A private entry")).toBeNull();
    expect(screen.getByRole("heading", { name: "favorites.defaultFolder" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("common.loading");
    await act(async () => reselectedDefault.resolve({ items: [entry("default")] }));
    await screen.findByText("DEFAULT private entry");
  });
});
