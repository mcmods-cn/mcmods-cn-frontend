import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "../app/_components/theme-provider";

afterEach(() => {
  document.documentElement.classList.remove("dark");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Toggle() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

it("renders and toggles when browser storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  render(<ThemeProvider><Toggle /></ThemeProvider>);
  fireEvent.click(screen.getByRole("button", { name: "light" }));
  expect(screen.getByRole("button", { name: "dark" })).toBeDefined();
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});
