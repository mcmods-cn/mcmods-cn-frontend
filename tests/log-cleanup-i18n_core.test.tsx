import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../app/_lib/i18n-provider";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../app/_lib/api", async (original) => ({ ...await original<object>(), apiRequest: mocks.request }));
import { LogCleanupPanel } from "../app/_components/admin-console";

beforeEach(() => { mocks.request.mockReset(); mocks.request.mockResolvedValue({ enabled: true, defaultDays: 30, categoryDays: {} }); });
afterEach(() => { cleanup(); localStorage.clear(); });

it.each(["en-US", "zh-CN", "zh-TW", "de-DE", "es-ES", "fr-FR", "ja-JP", "ru-RU"])("describes actual cleanup-on-save and audit retention in %s", async (locale) => {
  localStorage.setItem("mcmods-ui-locale", locale);
  render(<I18nProvider><LogCleanupPanel token="cookie-session" /></I18nProvider>);
  const chinese = locale === "zh-CN" || locale === "zh-TW";
  await screen.findByRole("checkbox", { name: chinese ? "启用保存时清理" : "Enable cleanup on save" });
  expect(screen.getByText(chinese ? /不会启动后台定时清理.*权限审计日志不可删除/ : /does not run in the background.*Permission audit logs cannot be deleted/)).toBeTruthy();
  expect(document.documentElement.lang).toBe(locale);
});
