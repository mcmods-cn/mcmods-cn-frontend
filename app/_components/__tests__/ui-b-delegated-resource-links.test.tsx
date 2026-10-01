import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ModLootTableView } from "../mod-resource-components";
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("../../_lib/auth", () => ({ useAuthSnapshot: () => ({ user: undefined }) }));
vi.mock("../../_lib/i18n-provider", () => ({ useI18n: () => ({ locale: "en-US", t: (key: string) => key }) }));
afterEach(cleanup);
it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "//untrusted.invalid/file"])("rejects unsafe imported resource navigation %s", (detailUrl) => {
  render(<ModLootTableView data={{ definitionAvailable: true, referencedLootTables: ["example:loot"], resourceSources: { "example:loot": { detailUrl } } }} />);
  expect(screen.queryByRole("link", { name: "example:loot" })).toBeNull();
  expect(screen.getByText("example:loot")).toBeTruthy();
});
it.each(["/mods/example/resources/resource?version=version", "https://example.invalid/resource"])("retains a valid imported resource navigation %s", (detailUrl) => {
  render(<ModLootTableView data={{ definitionAvailable: true, referencedLootTables: ["example:loot"], resourceSources: { "example:loot": { detailUrl } } }} />);
  expect(screen.getByRole("link", { name: "example:loot" }).getAttribute("href")).toBe(detailUrl);
});
