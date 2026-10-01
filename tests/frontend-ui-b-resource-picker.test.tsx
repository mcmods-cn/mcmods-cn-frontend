// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResourcePickerDialog } from "../app/_components/editor/resource-picker-dialog";
vi.mock("../app/_lib/i18n-provider", () => ({ useI18n: () => ({ locale: "en-US", t: (key: string) => key }) }));
vi.mock("../app/_components/editor/selected-resource-list", () => ({ CatalogResourceIcon: () => null, CatalogResourceIdentity: () => null }));
afterEach(cleanup);
describe("resource picker repeated searches", () => {
  it("runs an unchanged search again and finishes its loading state", async () => {
    const loadPage = vi.fn().mockResolvedValue({ items: [], total: 0, limit: 40, offset: 0 });
    render(<ResourcePickerDialog open value={[]} loadPage={loadPage} onClose={() => {}} onConfirm={() => {}} labels={{ empty: "No matches" }} />);
    await screen.findByText("No matches");
    fireEvent.click(screen.getByRole("button", { name: "common.search" }));
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("common.loading")).toBeNull();
    expect(screen.getByText("No matches")).toBeTruthy();
  });
});
