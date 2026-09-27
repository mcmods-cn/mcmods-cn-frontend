import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  defaultUILocale,
  normalizeUILocale,
  readUILocaleCookie,
  serializeUILocaleCookie,
  supportedUILocales,
  uiLocaleCookieName,
} from "./ui-locale.mts";

test("root HTML and client translations share one request-visible locale authority", async () => {
  const [layout, provider] = await Promise.all([
    readFile(new URL("../layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("./i18n-provider.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(layout, /<html\s+lang="zh-CN"/);
  assert.match(layout, /await cookies\(\)/);
  assert.match(layout, /lang=\{initialLocale\}/);
  assert.match(layout, /<I18nProvider initialLocale=\{initialLocale\}>/);
  assert.match(provider, /readUILocaleCookie\(document\.cookie\)/);
  assert.match(provider, /document\.cookie\s*=\s*serializeUILocaleCookie\(nextLocale\)/);
  assert.match(provider, /document\.documentElement\.lang\s*=\s*locale/);
});

test("UI locale registry normalizes aliases and round-trips the request cookie", () => {
  assert.equal(defaultUILocale, "zh-CN");
  assert.deepEqual(supportedUILocales.map(({ code }) => code), [
    "zh-CN", "zh-TW", "en-US", "ja-JP", "fr-FR", "de-DE", "es-ES", "ru-RU",
  ]);
  assert.equal(normalizeUILocale("zh_Hant"), "zh-TW");
  assert.equal(normalizeUILocale("EN-us"), "en-US");
  assert.equal(normalizeUILocale("pt-BR"), undefined);

  const serialized = serializeUILocaleCookie("fr-FR");
  assert.match(serialized, new RegExp(`^${uiLocaleCookieName}=fr-FR;`));
  assert.match(serialized, /Path=\//);
  assert.match(serialized, /SameSite=Lax/);
  assert.equal(readUILocaleCookie(`theme=dark; ${serialized}`), "fr-FR");
  assert.equal(readUILocaleCookie(`${uiLocaleCookieName}=pt-BR`), undefined);
});
