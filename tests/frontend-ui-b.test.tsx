// @vitest-environment jsdom
import React, { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  request: vi.fn(), resolved: vi.fn(), stickers: vi.fn(),
  auth: { ready: true, token: "test-session", user: undefined },
  locale: "en-US", t: (key: string) => key,
}));
vi.mock("../app/_lib/api", () => ({
  API_BASE_URL: "http://127.0.0.1:8080", apiRequest: mocks.request,
  ApiError: class ApiError extends Error { constructor(message: string, public status: number) { super(message); } },
}));
vi.mock("../app/_lib/auth", () => ({ useAuthSnapshot: () => mocks.auth }));
vi.mock("../app/_lib/i18n-provider", () => ({
  useI18n: () => ({ locale: mocks.locale, t: mocks.t }),
  supportedLocales: [{ code: "en-US", label: "English" }],
}));
vi.mock("../app/_lib/editor-api", () => ({ loadResolvedContent: mocks.resolved }));
vi.mock("../app/_lib/mod-api", () => ({ backendModToCatalogEntry: (record: unknown) => record }));
vi.mock("../app/_lib/sticker-api", () => ({
  loadStickerCatalog: mocks.stickers, stickerCatalogKey: (pack: string, item: string) => `${pack}:${item}`,
}));
vi.mock("../app/_components/mod-detail", () => ({ ModDetail: ({ mod }: { mod: { uniqueId: string } }) => <div>mod:{mod.uniqueId}</div> }));
vi.mock("../app/_components/blueprint-viewer", () => ({ BlueprintViewer: () => null }));
vi.mock("../app/_components/canonical-recipe-card", () => ({ CanonicalRecipeCard: () => null }));
vi.mock("../app/_components/global-recipe-card", () => ({ GlobalRecipeCard: () => null }));
import { ModDetailLoader } from "../app/_components/mod-detail-loader";
import { ProjectAutoUpdateSettings } from "../app/_components/project-auto-update-settings";
import { IconFont, IconfontLoader } from "../app/_components/iconfont";
import { MarkdownRenderer } from "../app/_components/markdown-renderer";
import { AdminAntiAbusePanel } from "../app/_components/admin-anti-abuse-panel";
import { BanAdminPanel } from "../app/_components/admin-governance-automation-panels";

beforeEach(() => {
  mocks.request.mockReset(); mocks.resolved.mockReset(); mocks.stickers.mockReset();
  mocks.resolved.mockResolvedValue(undefined); mocks.stickers.mockResolvedValue({ packs: [] });
  mocks.auth.token = "test-session"; mocks.locale = "en-US";
});
afterEach(() => { cleanup(); document.querySelectorAll("script[data-mcmods-iconfont],svg[data-fixture]").forEach((node) => node.remove()); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

describe("mod detail loading", () => {
  it("shows failed requests and allows retry", async () => {
    mocks.request.mockRejectedValueOnce(new Error("controlled outage")).mockResolvedValueOnce({ uniqueId: "firstmod1" });
    render(<ModDetailLoader siteId="firstmod1" />);
    expect(await screen.findByText("controlled outage")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "common.refresh" }));
    expect(await screen.findByText("mod:firstmod1")).toBeTruthy();
  });
  it("never renders a previous resource while a new resource is loading", async () => {
    const second = deferred<{ uniqueId: string }>();
    mocks.request.mockResolvedValueOnce({ uniqueId: "firstmod1" }).mockReturnValueOnce(second.promise);
    const { rerender } = render(<ModDetailLoader siteId="firstmod1" />);
    await screen.findByText("mod:firstmod1");
    rerender(<ModDetailLoader siteId="secondmod" />);
    expect(screen.queryByText("mod:firstmod1")).toBeNull();
    await act(async () => { second.resolve({ uniqueId: "secondmod" }); });
    expect(await screen.findByText("mod:secondmod")).toBeTruthy();
  });
  it("ignores obsolete responses after language changes", async () => {
    const old = deferred<{ uniqueId: string }>();
    mocks.request.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ uniqueId: "current" });
    const { rerender } = render(<ModDetailLoader siteId="firstmod1" />);
    mocks.locale = "zh-CN"; rerender(<ModDetailLoader siteId="firstmod1" />);
    await screen.findByText("mod:current");
    await act(async () => { old.resolve({ uniqueId: "obsolete" }); });
    expect(screen.queryByText("mod:obsolete")).toBeNull();
  });
});

describe("asynchronous source binding and bans", () => {
  it("resets the submitted source form and reloads after a delayed successful POST", async () => {
    const saved = deferred<object>();
    mocks.request.mockImplementation((path: string, options: RequestInit = {}) => {
      if (options.method === "POST") return saved.promise;
      if (path.endsWith("/runs")) return Promise.resolve({ items: [] });
      return Promise.resolve({ project: { id: "testmod01", type: "mod", url: "" }, settings: [], sources: [] });
    });
    const { container } = render(<ProjectAutoUpdateSettings projectType="mod" projectId="testmod01" token="test-session" />);
    await screen.findByRole("button", { name: "projectAutomation.verifySource" });
    const form = container.querySelector("form")!;
    const url = form.querySelector<HTMLInputElement>('input[name="url"]')!;
    fireEvent.change(url, { target: { value: "https://modrinth.com/mod/test" } });
    fireEvent.submit(form);
    await act(async () => { saved.resolve({}); });
    await waitFor(() => expect(url.value).toBe(""));
    expect(container.textContent).not.toContain("Cannot read properties of null");
    expect(mocks.request.mock.calls.filter(([path]) => path.endsWith("/automation"))).toHaveLength(2);
  });
  it("resets a successfully submitted ban after the React event finishes", async () => {
    const saved = deferred<object>();
    mocks.request.mockImplementation((path: string, options: RequestInit = {}) => options.method === "POST" ? saved.promise : Promise.resolve({ items: [] }));
    const { container } = render(<BanAdminPanel token="test-session" />);
    const form = container.querySelector("form")!;
    const input = form.querySelector<HTMLInputElement>('input[name="userId"]')!;
    fireEvent.change(input, { target: { value: "fixture-user" } }); fireEvent.submit(form);
    await act(async () => { saved.resolve({}); });
    await waitFor(() => expect(input.value).toBe(""));
    expect(container.textContent).not.toContain("Cannot read properties of null");
  });
});

describe("ban expiration contract", () => {
  it("sends RFC3339 instead of datetime-local text", async () => {
    mocks.request.mockResolvedValue({ items: [] });
    const { container } = render(<BanAdminPanel token="test-session" />);
    const form = container.querySelector("form")!;
    fireEvent.change(form.querySelector('input[name="endsAt"]')!, { target: { value: "2026-10-02T08:30" } });
    fireEvent.submit(form);
    await waitFor(() => {
      const posted = mocks.request.mock.calls.find(([, options]) => options?.method === "POST");
      expect(JSON.parse(String(posted?.[1].body)).endsAt).toBe(new Date("2026-10-02T08:30").toISOString());
    });
  });
});

describe("anti-abuse administration", () => {
  it("retains restriction input and shows a failed mutation", async () => {
    mocks.request.mockImplementation((_path: string, options: RequestInit = {}) => options.method === "POST"
      ? Promise.reject(new Error("controlled permission failure")) : Promise.resolve({ items: [], counts: {}, policies: {}, enabled: true, emergencyMode: false, logThreshold: 0, moderationThreshold: 0, challengeThreshold: 0, tempBlockThreshold: 0, denyThreshold: 0, similarityThreshold: 0 }));
    const { container } = render(<AdminAntiAbusePanel token="test-session" />);
    const form = container.querySelector('form:has(input[name="durationMinutes"])')!;
    const user = form.querySelector<HTMLInputElement>('input[name="userId"]')!;
    fireEvent.change(user, { target: { value: "fixture-user" } }); fireEvent.submit(form);
    expect(await screen.findByText("controlled permission failure")).toBeTruthy();
    expect(user.value).toBe("fixture-user");
  });
  it("resets a successful restriction form after a delayed mutation", async () => {
    const saved = deferred<object>();
    mocks.request.mockImplementation((_path: string, options: RequestInit = {}) => options.method === "POST" ? saved.promise : Promise.resolve({ items: [], counts: {}, policies: {}, enabled: true, emergencyMode: false, logThreshold: 0, moderationThreshold: 0, challengeThreshold: 0, tempBlockThreshold: 0, denyThreshold: 0, similarityThreshold: 0 }));
    const { container } = render(<AdminAntiAbusePanel token="test-session" />);
    const form = container.querySelector('form:has(input[name="durationMinutes"])')!;
    const user = form.querySelector<HTMLInputElement>('input[name="userId"]')!;
    fireEvent.change(user, { target: { value: "fixture-user" } }); fireEvent.submit(form);
    await act(async () => { saved.resolve({}); });
    await waitFor(() => expect(user.value).toBe(""));
  });
});

describe("iconfont loader", () => {
  it("rejects a suffix lookalike hostname", () => {
    render(<IconfontLoader symbolUrl="https://evilalicdn.com/t/c/font.js" />);
    expect(document.querySelector("script[data-mcmods-iconfont]")).toBeNull();
  });
  it("announces loaded symbols under React StrictMode", async () => {
    render(<StrictMode><IconfontLoader symbolUrl="https://at.alicdn.com/t/c/font.js" /><IconFont name="auditfixture" fallback="fallback" label="loaded icon" /></StrictMode>);
    const symbol = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    symbol.dataset.fixture = "true"; symbol.id = "icon-auditfixture"; document.body.appendChild(symbol);
    fireEvent.load(document.querySelector("script[data-mcmods-iconfont]")!);
    await waitFor(() => expect(screen.getByRole("img", { name: "loaded icon" })).toBeTruthy());
  });
});

describe("Markdown extension boundaries", () => {
  it("keeps extension syntax literal inside fenced and inline code", () => {
    mocks.request.mockResolvedValue({ isMainlandChina: true });
    const { container } = render(<MarkdownRenderer emptyText="empty" markdown={'```text\n[icon:health] [recipe:AbC123xYz] [vedio:yt:abcdef12]\n```\n\n`[intro:abc123xyz]`'} />);
    const codes = Array.from(container.querySelectorAll("code"));
    expect(codes[0].textContent?.trimEnd()).toBe("[icon:health] [recipe:AbC123xYz] [vedio:yt:abcdef12]");
    expect(codes[1].textContent).toBe("[intro:abc123xyz]");
    expect(container.textContent).not.toContain("\uE000");
  });
  it("treats a malformed internal URI marker as untrusted text", () => {
    mocks.request.mockResolvedValue({ isMainlandChina: true });
    expect(() => render(<MarkdownRenderer emptyText="empty" markdown={"literal \uE000MCICON_%ZZ\uE001"} />)).not.toThrow();
  });
});

it("still renders supported embeds and keeps unsupported extension text intact", () => {
  mocks.request.mockResolvedValue({ isMainlandChina: true });
  const { container } = render(<MarkdownRenderer emptyText="empty" markdown="[video:yt:abcdef12] [video:unsupported] [GeoGebra:unsupported value!]" />);
  expect(container.querySelector("iframe")?.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/abcdef12");
  expect(container.textContent).toContain("[video:unsupported]");
  expect(container.textContent).toContain("[GeoGebra:unsupported value!]");
});
