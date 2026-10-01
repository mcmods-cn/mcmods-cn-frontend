import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FavoritePickerModal } from "../favorite-picker-modal";
import { ProjectFollowsPanel } from "../project-follows-panel";
import { RatingPanel } from "../rating-panel";
import type { RatingSummary } from "../../_lib/rating-api";

const mocks = vi.hoisted(() => ({
  collections: vi.fn(), membership: vi.fn(), saveMembership: vi.fn(), createCollection: vi.fn(),
  followedProjects: vi.fn(), unfollow: vi.fn(), summary: vi.fn(),
}));
vi.mock("../../_lib/i18n-provider", () => ({ useI18n: () => ({ locale: "en-US", t: translate }) }));
function translate(key: string) { return key; }
vi.mock("../../_lib/auth", () => ({ useAuthSnapshot: () => ({ ready: true, token: "test-session", user: { id: "1" } }) }));
vi.mock("../../_lib/favorite-api", () => ({
  loadFavoriteCollections: mocks.collections, loadFavoriteMembership: mocks.membership,
  saveFavoriteMembership: mocks.saveMembership, createFavoriteCollection: mocks.createCollection,
}));
vi.mock("../../_lib/project-follow-api", () => ({ loadFollowedProjects: mocks.followedProjects, unfollowProject: mocks.unfollow }));
vi.mock("../../_lib/rating-api", () => ({ getRatingSummary: mocks.summary }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("next/image", () => ({ default: () => null }));

afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); });

describe("favorite membership preservation", () => {
  it("does not allow replacing memberships after the initial read failed", async () => {
    mocks.collections.mockResolvedValue([{ id: "folder", name: "Existing", isDefault: false, itemCount: 1 }]);
    mocks.membership.mockRejectedValue(new Error("Membership unavailable"));
    render(<FavoritePickerModal entityType="mod" entityKey="project" title="Project" token="session" onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByText("Membership unavailable");
    expect((screen.getByRole("button", { name: "common.save" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    expect(mocks.saveMembership).not.toHaveBeenCalled();
  });

  it("can recover a failed read before saving the preserved selection", async () => {
    mocks.collections.mockResolvedValue([{ id: "folder", name: "Existing", isDefault: false, itemCount: 1 }]);
    mocks.membership.mockRejectedValueOnce(new Error("Membership unavailable")).mockResolvedValueOnce(["folder"]);
    mocks.saveMembership.mockResolvedValue({ collectionIds: ["folder"] });
    const saved = vi.fn();
    render(<FavoritePickerModal entityType="mod" entityKey="project" title="Project" token="session" onClose={vi.fn()} onSaved={saved} />);
    await screen.findByText("Membership unavailable");
    fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "common.save" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(true));
    expect(mocks.saveMembership).toHaveBeenCalledWith("session", "mod", "project", ["folder"]);
  });
});

describe("project follow recovery", () => {
  it("shows an unfollow failure and keeps the project available to retry", async () => {
    mocks.followedProjects.mockResolvedValue({ items: [{ id: "project", type: "mod", name: "My Mod", url: "/mods/project", updatedAt: "2026-01-01T00:00:00Z" }] });
    mocks.unfollow.mockRejectedValueOnce(new Error("Unfollow unavailable")).mockResolvedValueOnce(undefined);
    render(<ProjectFollowsPanel token="session" />);
    await screen.findByText("My Mod");
    fireEvent.click(screen.getByRole("button", { name: "projectFollows.unfollow" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toBe("Unfollow unavailable");
    expect(screen.getByText("My Mod")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "projectFollows.unfollow" }));
    await waitFor(() => expect(screen.queryByText("My Mod")).toBeNull());
  });
});

describe("rating request ordering", () => {
  it("does not let an older target's response overwrite the current target", async () => {
    let resolveOld: (value: RatingSummary) => void = () => {};
    mocks.summary.mockImplementation((_type: string, id: string) => id === "old"
      ? new Promise<RatingSummary>((resolve) => { resolveOld = resolve; })
      : Promise.resolve(summary("new", 4.5)));
    const { rerender } = render(<RatingPanel targetType="mod" targetId="old" targetName="Old" />);
    rerender(<RatingPanel targetType="mod" targetId="new" targetName="New" />);
    await screen.findByText("4.5");
    await act(async () => resolveOld(summary("old", 1.2)));
    expect(screen.queryByText("1.2")).toBeNull();
    expect(screen.getByText("4.5")).toBeTruthy();
  });
});

function summary(id: string, average: number): RatingSummary {
  return {
    targetType: "mod", targetId: id, overallAverage: average, ratingCount: 1, dimensions: [], heatScore: 1,
    heatComponents: { longTerm: 0, trend: 0, effectiveView: 0, promotion: 0, quality: 0, newProject: 0 },
    engagement: { views: 0, downloads: 0, favorites: 0, comments: 0 }, canRate: false, canViewReviews: false,
  };
}
