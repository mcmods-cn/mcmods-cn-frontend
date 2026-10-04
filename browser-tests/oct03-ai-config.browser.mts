import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Page } from "playwright";
import type { AIConfig } from "../app/_components/admin-console-shared.tsx";
import { ProductionBrowserFixture } from "./fixture.mts";

// Actual production React panels, deterministic project API transport. The
// configuration is synthetic; no provider requests, paid translation, real
// authorization or PostgreSQL persistence is established by these cases.
const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });
const panels = ["ai-providers", "ai-models", "ai-task-models"] as const;
type AIPanel = typeof panels[number];
function config(): AIConfig {
  return {
    providers: [{ code: "fixture", name: "Fixture provider", enabled: true, baseUrl: "https://ai-provider.example.invalid/v1", protocol: "openai-compatible", hasApiKey: true, notes: "" }],
    models: [{ provider: "fixture", model: "fixture-model", displayName: "Original model", enabled: true, contextTokens: 4096, maxOutputTokens: 1024, inputPricePerMillion: 1, outputPricePerMillion: 2 }],
    taskModels: [{ taskType: "i18n_translation_completion", modelKey: "fixture/fixture-model", timeoutSeconds: 30, prompt: "Original prompt" }],
    quotas: [{ scope: "site", subject: "default", period: "day", requestLimit: 10, tokenLimit: 10000, costLimitCny: 1 }],
    translation: { enabled: false, sourceLocale: "zh-CN", targetLocales: ["en-US"], taskType: "i18n_translation_completion", autoSubmit: false, glossary: "" },
  };
}
async function openPanel(page: Page, name: AIPanel) {
  await page.goto(`${fixture.origin}/admin`);
  await page.locator('[data-admin-group="ai"]').click();
  await page.locator(`[data-admin-panel="${name}"]`).click();
}
function field(page: Page, name: AIPanel) {
  return name === "ai-providers" ? page.locator("fieldset input").nth(2) : name === "ai-models" ? page.locator("fieldset input").nth(2) : page.locator("fieldset textarea");
}
async function assertReadOnly(page: Page, name: AIPanel) {
  assert.equal(await field(page, name).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: /^(Save AI config|保存 AI 配置|Saving|保存中)$/, exact: true }).isDisabled(), true);
  assert.equal(await page.locator("fieldset").evaluate(element => element instanceof HTMLFieldSetElement && element.disabled), true);
}
async function changeLanguage(page: Page, locale: "zh-CN" | "en-US") {
  const current = await page.evaluate(() => document.documentElement.lang);
  const other = await page.context().newPage();
  try {
    await other.goto(`${fixture.origin}/login`);
    await other.getByRole("button", { name: /^(Register|注册)$/, exact: true }).click();
    await other.locator('input[maxlength="32"]').waitFor();
    await other.waitForFunction(value => document.documentElement.lang === value, current);
    await other.getByRole("combobox", { name: /^(Language|语言)$/, exact: true }).selectOption(locale);
    await page.waitForFunction(value => document.documentElement.lang === value, locale);
  } finally { await other.close(); }
}
async function closeNotice(page: Page) {
  await page.getByRole("alertdialog").getByRole("button", { name: /^(Close|关闭)$/, exact: true }).click();
}

test("OCT03 FS004 all AI configuration panels wait for fresh snapshots and retain drafts through language and save failures", { timeout: 50_000 }, async () => {
  for (const name of panels) {
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const saveStarted = Promise.withResolvers<void>();
    const saveRelease = Promise.withResolvers<void>();
    const snapshot = config();
    snapshot.providers[0].name = "Fresh provider";
    snapshot.models[0].displayName = "Fresh model";
    snapshot.taskModels[0].prompt = "Fresh prompt";
    let reads = 0;
    const writes: AIConfig[] = [];
    const browser = await fixture.page(async ({ path, method, body }) => {
      if (path === "/api/v1/admin/config") return { data: { general: { siteName: "Synthetic", logoUrl: "" }, features: {}, ai: config() } };
      if (path === "/api/v1/admin/ai/config") {
        if (method === "PUT") { writes.push(JSON.parse(body) as AIConfig); saveStarted.resolve(); await saveRelease.promise; return { status: 503, error: "Synthetic AI configuration save rejected" }; }
        reads++; started.resolve(); await release.promise; return { data: snapshot };
      }
    });
    try {
      const { page } = browser;
      await openPanel(page, name); await started.promise;
      await assertReadOnly(page, name); assert.equal(writes.length, 0);
      release.resolve();
      const input = field(page, name);
      await input.fill("Manual AI configuration");
      await changeLanguage(page, "zh-CN");
      assert.equal(await input.inputValue(), "Manual AI configuration");
      await changeLanguage(page, "en-US");
      assert.equal(await input.inputValue(), "Manual AI configuration");
      assert.equal(reads, 1, "UI language changes must not overwrite editable snapshots with another GET");
      await page.getByRole("button", { name: "Save AI config", exact: true }).click();
      await saveStarted.promise; await assertReadOnly(page, name);
      assert.equal(writes.length, 1);
      assert.deepEqual(writes[0].quotas, snapshot.quotas, "model/provider edits must retain request/token/cost budget configuration");
      assert.deepEqual(writes[0].translation, snapshot.translation);
      if (name === "ai-providers") { assert.equal(writes[0].providers[0].name, "Manual AI configuration"); assert.equal(writes[0].models[0].displayName, "Fresh model"); assert.equal(writes[0].taskModels[0].prompt, "Fresh prompt"); }
      if (name === "ai-models") { assert.equal(writes[0].models[0].displayName, "Manual AI configuration"); assert.equal(writes[0].providers[0].name, "Fresh provider"); assert.equal(writes[0].taskModels[0].prompt, "Fresh prompt"); }
      if (name === "ai-task-models") { assert.equal(writes[0].taskModels[0].prompt, "Manual AI configuration"); assert.equal(writes[0].providers[0].name, "Fresh provider"); assert.equal(writes[0].models[0].displayName, "Fresh model"); }
      saveRelease.resolve();
      await page.getByRole("alertdialog").filter({ hasText: "Synthetic AI configuration save rejected" }).waitFor();
      await closeNotice(page);
      assert.equal(await input.inputValue(), "Manual AI configuration");
      assert.equal(await input.isEnabled(), true);
      assert.equal(writes.length, 1);
    } finally { release.resolve(); saveRelease.resolve(); await browser.close(); }
  }
});

test("OCT03 FS004 failed AI configuration reads stay read-only until explicit successful retries", { timeout: 35_000 }, async () => {
  for (const name of panels) {
    let reads = 0;
    let writes = 0;
    const retryStarted = Promise.withResolvers<void>();
    const retryRelease = Promise.withResolvers<void>();
    const snapshot = config(); snapshot.providers[0].name = "Retry provider"; snapshot.models[0].displayName = "Retry model"; snapshot.taskModels[0].prompt = "Retry prompt";
    const browser = await fixture.page(async ({ path, method }) => {
      if (path === "/api/v1/admin/config") return { data: { general: { siteName: "Synthetic", logoUrl: "" }, features: {}, ai: config() } };
      if (path === "/api/v1/admin/ai/config") {
        if (method === "PUT") { writes++; return { data: snapshot }; }
        if (++reads === 1) return { status: 503, code: "AI_SETTINGS_UNAVAILABLE", error: "Synthetic AI configuration initial read rejected" };
        retryStarted.resolve(); await retryRelease.promise; return { data: snapshot };
      }
    });
    try {
      const { page } = browser;
      await openPanel(page, name);
      await page.getByRole("alert").filter({ hasText: "Unable to load. Please try again." }).waitFor();
      await assertReadOnly(page, name);
      await changeLanguage(page, "zh-CN");
      await page.getByRole("alert").filter({ hasText: "加载失败，请重试。" }).waitFor();
      assert.equal(reads, 1);
      await page.getByRole("button", { name: "重试", exact: true }).click();
      await retryStarted.promise; await assertReadOnly(page, name);
      assert.equal(writes, 0);
      retryRelease.resolve();
      const input = field(page, name);
      await page.waitForFunction(() => { const fieldset = document.querySelector("fieldset"); return fieldset instanceof HTMLFieldSetElement && !fieldset.disabled; });
      assert.equal(await input.inputValue(), name === "ai-providers" ? "Retry provider" : name === "ai-models" ? "Retry model" : "Retry prompt");
      assert.equal(reads, 2); assert.equal(writes, 0);
    } finally { retryRelease.resolve(); await browser.close(); }
  }
});

test("OCT03 FS004 late AI reads cannot open or replace the next actor's configuration", { timeout: 35_000 }, async () => {
  for (const name of panels) {
    let identity = "actor001";
    let writes = 0;
    const firstStarted = Promise.withResolvers<void>(); const firstRelease = Promise.withResolvers<void>(); const firstFinished = Promise.withResolvers<void>();
    const secondStarted = Promise.withResolvers<void>(); const secondRelease = Promise.withResolvers<void>();
    const browser = await fixture.page(async ({ path, method }) => {
      if (path === "/api/v1/auth/me") return { data: { id: identity, username: `Actor ${identity}`, email: `${identity}@example.invalid`, roleCodes: [], permissionVersion: 1, rbacVersion: 1, permissionRules: [{ code: "*", allow: true, priority: 100 }] } };
      if (path === "/api/v1/admin/config") return { data: { general: { siteName: "Synthetic", logoUrl: "" }, features: {}, ai: config() } };
      if (path === "/api/v1/admin/ai/config") {
        if (method === "PUT") { writes++; return { data: config() }; }
        const requestedActor = identity;
        if (requestedActor === "actor001") { firstStarted.resolve(); await firstRelease.promise; firstFinished.resolve(); }
        else { secondStarted.resolve(); await secondRelease.promise; }
        const snapshot = config(); snapshot.providers[0].name = requestedActor; snapshot.models[0].displayName = requestedActor; snapshot.taskModels[0].prompt = requestedActor;
        return { data: snapshot };
      }
    });
    try {
      const { page } = browser;
      await openPanel(page, name); await firstStarted.promise;
      identity = "actor002";
      await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "mcmods-auth-sync", newValue: "login:actor002" })));
      await secondStarted.promise;
      firstRelease.resolve(); await firstFinished.promise;
      await page.getByText(/Actor actor002/).last().waitFor();
      await assertReadOnly(page, name);
      assert.notEqual(await field(page, name).inputValue(), "actor001");
      secondRelease.resolve();
      await page.waitForFunction(() => { const fieldset = document.querySelector("fieldset"); return fieldset instanceof HTMLFieldSetElement && !fieldset.disabled; });
      assert.equal(await field(page, name).inputValue(), "actor002");
      assert.equal(writes, 0);
    } finally { firstRelease.resolve(); secondRelease.resolve(); await browser.close(); }
  }
});

test("OCT03 FS004 switching AI panels preserves models, providers and task bindings saved from the previous panel", { timeout: 25_000 }, async () => {
  let current = config(); current.models[0].displayName = "Model from fresh GET";
  let reads = 0;
  const writes: AIConfig[] = [];
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/admin/config") return { data: { general: { siteName: "Synthetic", logoUrl: "" }, features: {}, ai: config() } };
    if (path === "/api/v1/admin/ai/config") {
      if (method === "PUT") { current = JSON.parse(body) as AIConfig; writes.push(structuredClone(current)); }
      else reads++;
      return { data: structuredClone(current) };
    }
  });
  try {
    const { page } = browser;
    await openPanel(page, "ai-models");
    await field(page, "ai-models").fill("Saved model");
    await page.getByRole("button", { name: "Save AI config", exact: true }).click();
    await page.getByRole("alertdialog").filter({ hasText: "AI config saved" }).waitFor(); await closeNotice(page);
    assert.equal(current.models[0].displayName, "Saved model");
    await page.locator('[data-admin-panel="ai-providers"]').click();
    await field(page, "ai-providers").fill("Saved provider");
    await page.getByRole("button", { name: "Save AI config", exact: true }).click();
    await page.getByRole("alertdialog").filter({ hasText: "AI config saved" }).waitFor(); await closeNotice(page);
    assert.equal(current.providers[0].name, "Saved provider"); assert.equal(current.models[0].displayName, "Saved model");
    await page.locator('[data-admin-panel="ai-task-models"]').click();
    await field(page, "ai-task-models").fill("Saved prompt");
    await page.getByRole("button", { name: "Save AI config", exact: true }).click();
    await page.getByRole("alertdialog").filter({ hasText: "AI config saved" }).waitFor(); await closeNotice(page);
    assert.equal(current.providers[0].name, "Saved provider"); assert.equal(current.models[0].displayName, "Saved model"); assert.equal(current.taskModels[0].prompt, "Saved prompt");
    await page.locator('[data-admin-panel="ai-models"]').click();
    await page.waitForFunction(() => { const fieldset = document.querySelector("fieldset"); return fieldset instanceof HTMLFieldSetElement && !fieldset.disabled; });
    assert.equal(await field(page, "ai-models").inputValue(), "Saved model");
    assert.equal(reads, 4); assert.equal(writes.length, 3);
    for (const write of writes) { assert.deepEqual(write.quotas, config().quotas); assert.deepEqual(write.translation, config().translation); }
  } finally { await browser.close(); }
});
