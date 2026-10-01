import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminConsole } from "../admin-console";

const mocks = vi.hoisted(() => ({ api: vi.fn(), setTranslations: vi.fn(), setTranslation: vi.fn(), router: { push: vi.fn(), replace: vi.fn() } }));
function translate(key: string) { return key; }
vi.mock("../../_lib/api", async (importOriginal) => ({ ...await importOriginal<typeof import("../../_lib/api")>(), apiRequest: mocks.api }));
vi.mock("../../_lib/auth", () => ({ canAccessAdmin: () => true, hasPermission: () => true, clearAuth: vi.fn(), useAuthSnapshot: () => ({ ready: true, token: "cookie-session", user: { id: "admin" } }) }));
vi.mock("../../_lib/i18n-provider", () => ({
  useI18n: () => ({ locale: "en-US", t: translate, translationKeys: ["example"],
    getTranslation: () => "Hello {name}", getBaseTranslation: () => "", getOwnTranslation: () => "",
    setTranslation: mocks.setTranslation, setTranslations: mocks.setTranslations, resetTranslation: vi.fn() }),
  supportedLocales: [{ code: "zh-CN", label: "Chinese" }, { code: "en-US", label: "English" }],
  hasCompatibleInterpolationParameters: (source: string, target: string) => source.includes("{name}") === target.includes("{name}"),
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, useSearchParams: () => new URLSearchParams(), usePathname: () => "/admin" }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("../theme-provider", () => ({ useTheme: () => ({ toggleTheme: vi.fn() }) }));
vi.mock("../site-brand-provider", () => ({ useSiteBrand: () => ({ siteName: "Test site", logoUrl: "" }) }));
vi.mock("../admin-dashboard-panel", () => ({ AdminDashboardPanel: () => <p>Dashboard fixture</p>, AdminProjectWorkbenchPanel: () => null }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { vi.resetAllMocks(); });

const user = { id: "1", username: "Tester", email: "test@example.invalid", status: "active", roleCodes: [], roles: [], createdAt: "2026-01-01T00:00:00Z" };
function initialResponse(path: string) {
  if (path === "/api/v1/admin/dashboard") return {};
  if (path === "/api/v1/admin/config") return { features: { ai: true }, ai: { providers: [], models: [], taskModels: [] } };
  if (path === "/api/v1/admin/permissions") return { roles: [], permissions: [] };
  if (path === "/api/v1/admin/users") return [user];
  throw new Error(`Unexpected fixture endpoint: ${path}`);
}
async function openPanel(panel: string) {
  const view = render(<AdminConsole />);
  await screen.findByText("Dashboard fixture");
  view.container.querySelectorAll<HTMLButtonElement>("[data-admin-group]").forEach((button) => {
    if (button.textContent?.endsWith("+")) fireEvent.click(button);
  });
  const button = view.container.querySelector<HTMLButtonElement>(`[data-admin-panel="${panel}"]`);
  expect(button).not.toBeNull();
  fireEvent.click(button!);
  return view;
}

describe("administration write protection", () => {
  it.each(["retry", "cancel"] as const)("confirms and posts an explicit AI task %s using its stable UID", async (action) => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.api.mockImplementation((path: string, options?: { method?: string }) => {
      if (path.startsWith("/api/v1/admin/ai/tasks?")) return Promise.resolve([{ id: 123, task_uid: "stable-task", status: action === "retry" ? "failed" : "running" }]);
      if (path === `/api/v1/admin/ai/tasks/stable-task/${action}` && options?.method === "POST") return Promise.resolve({ taskUid: action === "retry" ? "new-task" : "stable-task", status: action === "retry" ? "queued" : "cancelled" });
      return Promise.resolve(initialResponse(path));
    });
    await openPanel("ai-task-logs");
    fireEvent.click(await screen.findByRole("button", { name: action === "retry" ? "admin.ai.retryTask" : "admin.ai.cancelTask" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith(`/api/v1/admin/ai/tasks/stable-task/${action}`, { method: "POST", body: "{}" }, "cookie-session"));
    expect(confirm).toHaveBeenCalledWith(action === "retry" ? "admin.ai.retryTaskConfirm" : "admin.ai.cancelTaskConfirm");
  });
  it("does not let failed permission reads erase a user's existing permissions", async () => {
    mocks.api.mockImplementation((path: string) => path.startsWith("/api/v1/admin/users/1/permissions") ? Promise.reject(new Error("Permission load unavailable")) : Promise.resolve(initialResponse(path)));
    await openPanel("user-roles");
    await screen.findByText("Permission load unavailable");
    const save = screen.getByRole("button", { name: "admin.saveUserPermissions" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(mocks.api.mock.calls.some(([, options]) => options?.method === "PUT")).toBe(false);
  });

  it("does not overwrite text typed while an AI translation was pending", async () => {
    let resolveResult: (result: unknown) => void = () => {};
    mocks.api.mockImplementation((path: string) => {
      if (path === "/api/v1/admin/ai/tasks") return Promise.resolve({ id: "task", taskUid: "task", status: "queued" });
      if (path === "/api/v1/admin/ai/tasks/task") return new Promise((resolve) => { resolveResult = resolve; });
      return Promise.resolve(initialResponse(path));
    });
    await openPanel("i18n");
    fireEvent.click(screen.getByRole("button", { name: "admin.ai.completeTranslation" }));
    await waitFor(() => expect(mocks.api.mock.calls.some(([path]) => path === "/api/v1/admin/ai/tasks/task")).toBe(true));
    fireEvent.change(screen.getByPlaceholderText("admin.missingTranslation"), { target: { value: "Human {name}" } });
    await act(async () => resolveResult({ status: "completed", result: { items: [{ key: "example", text: "AI {name}" }] } }));
    expect(mocks.setTranslations.mock.calls.some(([, values]) => values.example === "AI {name}")).toBe(false);
    expect((screen.getByPlaceholderText("admin.missingTranslation") as HTMLTextAreaElement).value).toBe("Human {name}");
  });
});
