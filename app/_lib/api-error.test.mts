import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, apiErrorMessage } from "./api-error.mts";
import en from "../_locales/en-US.ts";
import zhCN from "../_locales/zh-CN.ts";

function translator(messages: unknown) {
  return (key: string) => {
    let value: unknown = messages;
    for (const segment of key.split(".")) value = value && typeof value === "object" ? (value as Record<string, unknown>)[segment] : undefined;
    return typeof value === "string" ? value : key;
  };
}

test("STYLE003 localized API errors preserve machine facts and never translate by server prose", () => {
  const details = { currentRevisionId: "revision003", challenge: { id: "proof003", provider: "proof" } };
  for (const diagnostic of ["SQLSTATE 23514 constraint private_table", "数据库内部故障", "a changing upstream message"]) {
    const error = new ApiError(diagnostic, 409, "COMMENT_EDIT_CONFLICT", 37, details);
    assert.equal(apiErrorMessage(error, translator(en), "fallback"), "This content changed. Reload it before editing again.");
    assert.equal(apiErrorMessage(error, translator(zhCN), "fallback"), "内容已发生变化，请重新读取后再编辑。");
    assert.equal(error.message, diagnostic, "diagnostics stay available separately from display copy");
    assert.equal(error.status, 409);
    assert.equal(error.code, "COMMENT_EDIT_CONFLICT");
    assert.equal(error.retryAfter, 37);
    assert.equal(error.details, details);
  }
});

test("STYLE003 all ordinary status errors have localized copy and semantic codes use the existing dictionary", () => {
  for (const status of [400,401,403,404,405,409,410,413,422,429,500,502,503,504]) {
    const error = new ApiError("must not be displayed", status, `HTTP_${status}`);
    const english = apiErrorMessage(error, translator(en), "fallback");
    const chinese = apiErrorMessage(error, translator(zhCN), "fallback");
    assert.notEqual(english, "fallback", String(status));
    assert.notEqual(chinese, "fallback", String(status));
    assert.notEqual(english, chinese, String(status));
    assert.doesNotMatch(english, /must not|apiErrors\./);
  }
  assert.equal(apiErrorMessage(new ApiError("server diagnostic",400,"CONTENT_LANGUAGE_SECONDARY_UNSUPPORTED"),translator(en),"fallback"),en.contentLanguage.unsupportedSecondary);
  assert.equal(apiErrorMessage(new ApiError("server diagnostic",500,"CONTENT_LANGUAGE_SETTINGS_READ_FAILED"),translator(zhCN),"fallback"),zhCN.contentLanguage.loadFailed);
});

test("STYLE003 unknown codes, missing translations and transport failures use the localized feature fallback", () => {
  for (const error of [new ApiError("secret diagnostic",500,"NEW_UNTRANSLATED_CODE"), new ApiError("secret",400,""), new Error("TLS private upstream details"), undefined, null, new ApiError("secret",500,"constructor")]) {
    assert.equal(apiErrorMessage(error, translator(en), "Failed to load this feature."), "Failed to load this feature.");
  }
  assert.equal(apiErrorMessage(new ApiError("secret",404,"HTTP_404"),(key)=>key,"fallback"),"fallback");
});
