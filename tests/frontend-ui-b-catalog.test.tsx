// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), paramsKey: "q=first", t: (key: string, params?: Record<string, string | number>) => `${key}${params?.count === undefined ? "" : `:${params.count}`}`, preferences: { view: "list", pageSize: 20, sort: "relevance", sortDirection: "desc" } }));
vi.mock("../app/_lib/api", () => ({ apiRequest: mocks.request, API_BASE_URL: "http://127.0.0.1" }));
vi.mock("../app/_lib/auth", () => ({ useAuthSnapshot: () => ({ ready: true, token: "", user: null }) }));
vi.mock("../app/_lib/i18n-provider", () => ({ useI18n: () => ({ locale: "en-US", t: mocks.t }) }));
vi.mock("../app/_lib/catalog-state", async (original) => ({ ...await original<object>(), useCatalogControls: () => ({ paramsKey: mocks.paramsKey, preferences: mocks.preferences, expandedGroups: new Set(), mobileFiltersOpen: false, setMobileFiltersOpen: () => {}, queryDraft: "", setQueryDraft: () => {}, notice: "", setNotice: () => {}, replaceParams: () => {}, toggleListParam: () => {}, clearFilters: () => {}, submitSearch: () => {}, changePreference: () => {}, toggleGroup: () => {}, changePage: () => {} }) }));
vi.mock("../app/_components/catalog-minecraft-version-filter", () => ({ CatalogMinecraftVersionFilter: () => null }));
vi.mock("../app/_components/project-submission-modal", () => ({ ProjectSubmissionModal: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
import { SimpleProjectCatalog } from "../app/_components/simple-project-catalog";
afterEach(cleanup);
it("ignores an old catalog result after the search changes", async () => {
  let complete!: (result: object) => void;
  mocks.request.mockImplementation((path: string) => path.includes("q=first") ? new Promise((resolve) => { complete = resolve; }) : Promise.resolve({ items: [], total: 2 }));
  const view = render(<SimpleProjectCatalog projectType="plugin" />);
  await waitFor(() => expect(complete).toBeTypeOf("function"));
  mocks.paramsKey = "q=second";
  view.rerender(<SimpleProjectCatalog projectType="plugin" />);
  await screen.findByText("largeProjects.catalog.total:2");
  await act(async () => { complete({ items: [], total: 1 }); });
  expect(screen.getByText("largeProjects.catalog.total:2")).toBeTruthy();
  expect(screen.queryByText("largeProjects.catalog.total:1")).toBeNull();
});
