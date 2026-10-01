// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "../app/_lib/i18n-provider";

function Label() {
  const { t, setLocale } = useI18n();
  return <><span data-testid="label">{t("common.save", { anything: "value" })}</span><button onClick={() => setLocale("en-US")}>switch</button></>;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); document.documentElement.lang = "zh-CN"; });

describe("static UI locale resilience", () => {
  it("inserts parameter values literally without recursive placeholder replacement", () => {
    function Interpolation() {
      const { t } = useI18n();
      return <span>{t("mods.history.compareTitle", { before: "{after}", after: "$&" })}</span>;
    }
    localStorage.setItem("mcmods-ui-locale", "en-US");
    render(<I18nProvider><Interpolation /></I18nProvider>);
    expect(screen.getByText("Compare v{after} and v$&")).toBeTruthy();
  });
  it("changes language even when reads work but browser storage writes are denied", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    render(<I18nProvider><Label /></I18nProvider>);
    act(() => screen.getByText("switch").click());
    expect(screen.getByTestId("label").textContent).toBe("Save");
    vi.restoreAllMocks();
    act(() => screen.getByText("switch").click());
  });
  it("falls back when a stored override is not text", () => {
    localStorage.setItem("mcmods-i18n-overrides", JSON.stringify({ "zh-CN": { "common.save": 42 } }));
    render(<I18nProvider><Label /></I18nProvider>);
    expect(screen.getByTestId("label").textContent).toBe("保存");
  });
  it("falls back when an override is blank", () => {
    localStorage.setItem("mcmods-i18n-overrides", JSON.stringify({ "zh-CN": { "common.save": " " } }));
    render(<I18nProvider><Label /></I18nProvider>);
    expect(screen.getByTestId("label").textContent).toBe("保存");
  });
  it("updates the document language when the UI language changes", () => {
    render(<I18nProvider><Label /></I18nProvider>);
    act(() => screen.getByText("switch").click());
    expect(screen.getByTestId("label").textContent).toBe("Save");
    expect(document.documentElement.lang).toBe("en-US");
  });
});
