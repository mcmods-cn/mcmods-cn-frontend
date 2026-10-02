import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Locator } from "playwright";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
const providers: APIHandler = ({ path }) => {
  if (path === "/api/v1/markdown/config") return { data: {} };
  if (path === "/api/v1/users/me/markdown-playground") return { data: { content: "Contrast fixture draft", revision: 1 } };
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
};
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

async function contrast(element: Locator) {
  return element.evaluate(target => {
    const parse = (value: string) => {
      const channels = value.match(/[\d.]+/g)?.map(Number);
      if (!channels || channels.length < 3) throw new Error(`Unexpected computed color: ${value}`);
      return channels;
    };
    const composite = (front: number[], back: number[]) => {
      const alpha = front[3] ?? 1;
      return front.slice(0, 3).map((channel, index) => alpha * channel + (1 - alpha) * back[index]);
    };
    const backgrounds: number[][] = [];
    let ancestor: Element | null = target;
    while (ancestor) {
      backgrounds.push(parse(getComputedStyle(ancestor).backgroundColor));
      ancestor = ancestor.parentElement;
    }
    let background = [255, 255, 255];
    for (const layer of backgrounds.reverse()) background = composite(layer, background);
    const foreground = composite(parse(getComputedStyle(target).color), background);
    const luminance = (rgb: number[]) => rgb.reduce((sum, channel, index) => {
      const normalized = channel / 255;
      const linear = normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      return sum + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
    const front = luminance(foreground);
    const back = luminance(background);
    return { foreground, background, ratio: (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05) };
  });
}

test("OCT02 filled accent text reaches WCAG 4.5 in both themes and hover states", { timeout: 30_000 }, async () => {
  const browser = await fixture.page(request => providers(request));
  const samples: Array<{ theme: string; control: string; ratio: number }> = [];
  try {
    const { page } = browser;
    for (const theme of ["light", "dark"]) {
      await page.goto(`${fixture.origin}/login`);
      if ((await page.locator("html").evaluate(element => element.classList.contains("dark"))) !== (theme === "dark")) {
        await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
      }
      await page.waitForFunction(dark => document.documentElement.classList.contains("dark") === dark, theme === "dark");
      await page.waitForFunction(() => {
        const element = document.querySelector("main .button-primary");
        const hex = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
        const rgb = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
        return element && getComputedStyle(element).backgroundColor === `rgb(${rgb.join(", ")})`;
      });
      const button = page.locator("main .button-primary").first();
      samples.push({ theme, control: "primary default", ...(await contrast(button)) });
      const badges = page.locator('[class*="bg-[var(--accent)]"]');
      for (let index = 0; index < await badges.count(); index++) {
        const badge = badges.nth(index);
        if (await badge.isVisible() && (await badge.innerText()).trim()) {
          samples.push({ theme, control: `login filled accent ${index}`, ...(await contrast(badge)) });
        }
      }
      await button.hover();
      await page.waitForFunction(() => {
        const element = document.querySelector("main .button-primary");
        const hex = getComputedStyle(document.documentElement).getPropertyValue("--accent-strong").trim();
        const rgb = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
        return element && getComputedStyle(element).backgroundColor === `rgb(${rgb.join(", ")})`;
      });
      samples.push({ theme, control: "primary hover", ...(await contrast(button)) });
      await page.goto(`${fixture.origin}/tools/playground`);
      await page.waitForFunction(() => document.querySelector("textarea")?.value === "Contrast fixture draft");
      const bold = page.getByRole("button", { name: "Bold", exact: true });
      await page.mouse.move(0, 0);
      samples.push({ theme, control: "toolbar default", ...(await contrast(bold)) });
      await bold.hover();
      samples.push({ theme, control: "toolbar hover", ...(await contrast(bold)) });
      for (const control of [page.getByRole("combobox", { name: "Heading", exact: true }), page.getByRole("combobox", { name: "Insert media", exact: true }), page.locator('summary[title="Insert icon"]')]) {
        samples.push({ theme, control: "toolbar nested control", ...(await contrast(control)) });
      }
    }
    console.log("Computed Chromium WCAG samples", samples);
    assert(samples.every(sample => sample.ratio >= 4.5), JSON.stringify(samples.filter(sample => sample.ratio < 4.5)));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("header details summary").click();
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal((await page.getByRole("button", { name: "加粗", exact: true }).isVisible()), true);
  } finally { await browser.close(); }
});

test("OCT02 Markdown waits for the initial server draft before allowing edits", { timeout: 30_000 }, async () => {
  let release: () => void = () => {};
  const delayed = new Promise<void>(resolve => { release = resolve; });
  let requested: () => void = () => {};
  const loading = new Promise<void>(resolve => { requested = resolve; });
  const browser = await fixture.page(async request => {
    if (request.path === "/api/v1/users/me/markdown-playground") {
      assert.equal(request.method, "GET", "No save may overwrite an unread draft");
      requested();
      await delayed;
      return { data: { content: "Existing server content", revision: 3 } };
    }
    return providers(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/tools/playground`);
    await loading;
    const editor = page.getByRole("textbox", { name: "Editor", exact: true });
    assert.equal(await editor.isDisabled(), true, "An unread server draft must not overwrite editable user input");
    assert.equal(await page.getByRole("button", { name: "Bold", exact: true }).isDisabled(), true);
    release();
    await page.waitForFunction(() => document.querySelector("textarea")?.value === "Existing server content");
    await editor.fill("New unsaved user content");
    assert.equal(await editor.inputValue(), "New unsaved user content");
  } finally { release(); await browser.close(); }
});

test("OCT02 global catalogs reject fractional and unsafe page offsets", { timeout: 30_000 }, async () => {
  for (const route of ["mods-tag", "recipe-types"]) {
    for (const input of ["1.5", "Infinity", "9007199254740991"]) {
      let requested: () => void = () => {};
      const request = new Promise<void>(resolve => { requested = resolve; });
      const offsets: string[] = [];
      const endpoint = route === "mods-tag" ? "/api/v1/tags" : "/api/v1/recipe-types";
      const browser = await fixture.page(({ path, url }) => {
        if (path === endpoint) {
          offsets.push(url.searchParams.get("offset") || "");
          requested();
          return { data: { items: [], total: 0 } };
        }
      });
      try {
        await browser.page.goto(`${fixture.origin}/${route}?page=${input}`);
        await request;
        assert(offsets.length > 0);
        assert(offsets.every(offset => offset === "0"), `${route} page=${input}: ${JSON.stringify(offsets)}`);
      } finally { await browser.close(); }
    }
  }
});
