import assert from "node:assert/strict";
import test from "node:test";
import { resolveUILocaleSyncHint, supportedUILocales } from "./ui-locale.mts";

test("locale hints validate the canonical registry and carry finite safe timestamps", () => {
  for (const { code } of supportedUILocales) {
    assert.deepEqual(resolveUILocaleSyncHint(`1760000000000:${code}`, null, 0), { changedAt: 1760000000000, locale: code });
  }
  for (const value of [null, "", "en-US", "0:en", "0:EN-us", "0:zh_Hant", "0:pt-BR", "0:en-US; Path=/", "0:javascript:alert(1)", "1e3:en-US", "Infinity:en-US", "NaN:en-US", "-1:en-US", "01:en-US", "9007199254740992:en-US", "0:en-US\n", " 0:en-US"]) {
    assert.equal(resolveUILocaleSyncHint(value, "1760000000001:zh-CN", 0), undefined, `reject ${String(value)}`);
  }
});

test("newer stored or already observed locale updates beat late storage events", () => {
  assert.deepEqual(resolveUILocaleSyncHint("5:fr-FR", "6:de-DE", 0), { changedAt: 6, locale: "de-DE" });
  assert.deepEqual(resolveUILocaleSyncHint("6:fr-FR", "5:de-DE", 0), { changedAt: 6, locale: "fr-FR" });
  assert.deepEqual(resolveUILocaleSyncHint("6:fr-FR", "6:de-DE", 0), { changedAt: 6, locale: "de-DE" });
  assert.equal(resolveUILocaleSyncHint("5:fr-FR", "4:de-DE", 6), undefined);
  assert.deepEqual(resolveUILocaleSyncHint("6:fr-FR", null, 6), { changedAt: 6, locale: "fr-FR" });
  assert.deepEqual(resolveUILocaleSyncHint("6:fr-FR", "invalid", 0), { changedAt: 6, locale: "fr-FR" });
});
