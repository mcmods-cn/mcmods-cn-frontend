import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminConsole } from "../admin-console";
import { ApiError } from "../../_lib/api";

// Real AdminConsole and configuration panels; synthetic own-API boundary.
// No backend integration, provider request, production setting or real key.
const mocks = vi.hoisted(() => ({ api: vi.fn(), router: { push: vi.fn(), replace: vi.fn() } }));
function translate(key: string) { return key; }
vi.mock("../../_lib/api", async (original) => ({ ...await original<typeof import("../../_lib/api")>(), apiRequest: mocks.api }));
vi.mock("../../_lib/auth", () => ({
  canAccessAdmin: () => true, hasPermission: () => true, clearAuth: vi.fn(),
  useAuthSnapshot: () => ({ ready: true, token: "cookie-session", user: { id: "synthetic-admin", username: "Fixture", roleCodes: [] } }),
}));
vi.mock("../../_lib/i18n-provider", () => ({
  useI18n: () => ({ locale: "en-US", t: translate }),
  supportedLocales: [{ code: "zh-CN", label: "Chinese" }, { code: "en-US", label: "English" }, { code: "de-DE", label: "German" }],
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("../theme-provider", () => ({ useTheme: () => ({ toggleTheme: vi.fn() }) }));
vi.mock("../site-brand-provider", () => ({ useSiteBrand: () => ({ siteName: "Synthetic site", logoUrl: "" }) }));
vi.mock("../admin-dashboard-panel", () => ({ AdminDashboardPanel: () => <p>Loaded dashboard fixture</p>, AdminProjectWorkbenchPanel: () => null }));

beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);

function freshAIConfig() {
  return {
    providers: [
      { code: "primary", name: "Fresh provider", enabled: true, baseUrl: "https://provider.example.invalid/v1", protocol: "openai-compatible", hasApiKey: true, notes: "Keep provider context" },
      { code: "secondary", name: "Other provider", enabled: false, baseUrl: "https://secondary.example.invalid", protocol: "anthropic", hasApiKey: true, notes: "Keep unedited provider" },
    ],
    models: [{ provider: "primary", model: "synthetic-model", displayName: "Fresh model", enabled: true, contextTokens: 4096, maxOutputTokens: 512, inputPricePerMillion: 0.1, outputPricePerMillion: 0.2 }],
    taskModels: [{ taskType: "content_translation_completion", modelKey: "primary/synthetic-model", concurrencyLimit: 2, timeoutSeconds: 90, prompt: "Fresh prompt with {source}" }],
    // Current backend budgets have a defined identity only for site/default.
    quotas: [
      { scope: "site", subject: "default", period: "day", requestLimit: 250, tokenLimit: 75000, costLimitCny: 500 },
      { scope: "site", subject: "default", period: "hour", requestLimit: 15, tokenLimit: 2000, costLimitCny: 50 },
    ],
    translation: { enabled: true, sourceLocale: "zh-CN", targetLocales: ["en-US", "de-DE"], taskType: "content_translation_completion", autoSubmit: false, glossary: "Keep fresh glossary" },
  };
}

function staleInitialAIConfig() {
  return { providers: [], models: [], taskModels: [], quotas: [], translation: { enabled: false, sourceLocale: "en-US", targetLocales: [], taskType: "old", autoSubmit: false, glossary: "Stale initial snapshot" } };
}

function initialResponse(path: string) {
  if (path === "/api/v1/admin/dashboard") return {};
  if (path === "/api/v1/admin/config") return { features: { ai: true }, ai: staleInitialAIConfig() };
  if (path === "/api/v1/admin/permissions") return { roles: [], permissions: [] };
  if (path === "/api/v1/admin/users") return [];
  throw new Error(`Unexpected synthetic API endpoint: ${path}`);
}

async function openPanel(panel: string) {
  const view = render(<AdminConsole />);
  await screen.findByText("Loaded dashboard fixture");
  const group = view.container.querySelector<HTMLButtonElement>(`[data-admin-group="${panel.startsWith("ai-") ? "ai" : "notifications"}"]`);
  expect(group).not.toBeNull();
  fireEvent.click(group!);
  const button = view.container.querySelector<HTMLButtonElement>(`[data-admin-panel="${panel}"]`);
  expect(button).not.toBeNull();
  fireEvent.click(button!);
  return view;
}

function writesTo(endpoint: string) {
  return mocks.api.mock.calls.filter(([path, options]) => path === endpoint && options?.method === "PUT");
}

it.each(["ai-providers", "ai-models", "ai-task-models"] as const)(
  "%s blocks replacement after GET failure, then retries and preserves the complete fresh snapshot",
  async (panel) => {
    const endpoint = "/api/v1/admin/ai/config";
    const fresh = freshAIConfig();
    let reads = 0;
    let finishRetry: (value: ReturnType<typeof freshAIConfig>) => void = () => {};
    mocks.api.mockImplementation((path: string, options?: RequestInit) => {
      if (path === endpoint && options?.method === "PUT") {
        expect(typeof options.body).toBe("string");
        return Promise.resolve(JSON.parse(options.body as string));
      }
      if (path === endpoint) {
        reads += 1;
        if (reads === 1) return Promise.reject(new ApiError("Synthetic AI config read unavailable", 503));
        return new Promise((resolve) => { finishRetry = resolve; });
      }
      return Promise.resolve(initialResponse(path));
    });
    await openPanel(panel);
    expect((await screen.findByRole("alert")).textContent).toContain("Synthetic AI config read unavailable");
    expect(screen.queryByRole("button", { name: "admin.ai.saveConfig" })).toBeNull();
    expect(writesTo(endpoint)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
    await waitFor(() => expect(reads).toBe(2));
    expect(screen.getByRole("status").textContent).toContain("common.loading");
    expect(screen.queryByRole("button", { name: "admin.ai.saveConfig" })).toBeNull();
    expect(writesTo(endpoint)).toHaveLength(0);
    await act(async () => finishRetry(fresh));

    const expected = freshAIConfig();
    if (panel === "ai-providers") {
      fireEvent.change(screen.getAllByPlaceholderText("admin.name")[0], { target: { value: "Edited provider" } });
      expected.providers[0].name = "Edited provider";
    } else if (panel === "ai-models") {
      fireEvent.change(screen.getByPlaceholderText("admin.displayName"), { target: { value: "Edited model" } });
      expected.models[0].displayName = "Edited model";
    } else {
      fireEvent.change(screen.getByPlaceholderText("admin.ai.promptPlaceholder"), { target: { value: "Edited prompt with {source}" } });
      expected.taskModels[0].prompt = "Edited prompt with {source}";
    }
    fireEvent.click(screen.getByRole("button", { name: "admin.ai.saveConfig" }));
    await waitFor(() => expect(writesTo(endpoint)).toHaveLength(1));
    const [, options, token] = writesTo(endpoint)[0];
    expect(token).toBe("cookie-session");
    expect(JSON.parse(options.body)).toEqual(expected);
    expect(await screen.findByText("admin.ai.configSaved")).toBeTruthy();
    expect(reads).toBe(2);
  },
);

it("notification templates block replacement on read failure, then recover without dropping untouched templates/locales/metadata", async () => {
  const endpoint = "/api/v1/admin/config/notifications";
  const templates = [
    { code: "synthetic.first", version: 7, variables: ["actor"], translations: { "zh-CN": { title: "源文 {actor}", body: "正文" }, "en-US": { title: "First {actor}", body: "Keep first body" }, "de-DE": { title: "Name {actor}", body: "Keep unedited target locale" } } },
    { code: "synthetic.second", version: 3, variables: [], translations: { "zh-CN": { title: "另一模板", body: "其他正文" }, "en-US": { title: "Other template", body: "Keep second body" } } },
  ];
  let reads = 0;
  let finishRetry: (value: { templates: typeof templates }) => void = () => {};
  mocks.api.mockImplementation((path: string, options?: RequestInit) => {
    if (path === endpoint && options?.method === "PUT") return Promise.resolve(JSON.parse(options.body as string));
    if (path === endpoint) {
      reads += 1;
      if (reads === 1) return Promise.reject(new ApiError("Synthetic template read unavailable", 503));
      return new Promise((resolve) => { finishRetry = resolve; });
    }
    return Promise.resolve(initialResponse(path));
  });
  await openPanel("notification-templates");
  expect((await screen.findByRole("alert")).textContent).toContain("Synthetic template read unavailable");
  expect(screen.queryByRole("button", { name: "common.save" })).toBeNull();
  expect(writesTo(endpoint)).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
  await waitFor(() => expect(reads).toBe(2));
  expect(screen.queryByRole("button", { name: "common.save" })).toBeNull();
  expect(writesTo(endpoint)).toHaveLength(0);
  await act(async () => finishRetry({ templates }));

  fireEvent.change(screen.getByDisplayValue("First {actor}"), { target: { value: "Edited {actor}" } });
  fireEvent.click(screen.getByRole("button", { name: "common.save" }));
  await waitFor(() => expect(writesTo(endpoint)).toHaveLength(1));
  const [, options, token] = writesTo(endpoint)[0];
  expect(token).toBe("cookie-session");
  expect(JSON.parse(options.body)).toEqual({ templates: [
    { ...templates[0], translations: { ...templates[0].translations, "en-US": { ...templates[0].translations["en-US"], title: "Edited {actor}" } } },
    templates[1],
  ] });
  expect(await screen.findByText("admin.notificationTemplates.saved")).toBeTruthy();
  expect(reads).toBe(2);
});
