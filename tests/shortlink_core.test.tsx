// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicShortLinkPage from "../app/[publicId]/page";
import { apiRequest } from "../app/_lib/api";
const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ publicId: "abcdefghi" }), useRouter: () => navigation }));
vi.mock("../app/_lib/api", () => ({ apiRequest: vi.fn(), ApiError: class extends Error {} }));
vi.mock("../app/_lib/i18n-provider", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("public short link error recovery", () => {
  it("renders the recovery link after a transport failure", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new TypeError("network unavailable"));
    render(<PublicShortLinkPage />);
    await waitFor(() => expect(screen.getByText("blueprints.shortLinkNotFound")).toBeTruthy());
    expect(screen.getByRole("link").getAttribute("href")).toBe("/");
  });
  it("rejects an external redirect target", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ target: "https://attacker.invalid" });
    render(<PublicShortLinkPage />);
    await waitFor(() => expect(screen.getByText("blueprints.shortLinkNotFound")).toBeTruthy());
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
