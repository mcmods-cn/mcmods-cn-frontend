// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), t: (key: string) => key, search: new URLSearchParams(), locale: "en-US", token: "isolated-session" }));
vi.mock("../app/_lib/api", () => ({ apiRequest: mocks.request }));
vi.mock("../app/_lib/auth", () => ({ useAuthSnapshot: () => ({ ready: true, token: mocks.token, user: { id: "self" } }) }));
vi.mock("../app/_lib/i18n-provider", () => ({ useI18n: () => ({ locale: mocks.locale, t: mocks.t }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }), useSearchParams: () => mocks.search }));
vi.mock("../app/_components/user-avatar", () => ({ UserAvatar: () => null, OnlineStatusDot: () => null }));
import { MessagesCenter } from "../app/_components/messages-center";
const conversations = ["first", "second"].map((id) => ({ id, partnerId: id, username: id, avatarUrl: "", onlineStatus: "offline", lastMessage: "", unreadCount: 0, canMessage: true }));
const message = (conversationId: string, body: string) => ({ id: body, conversationId, senderId: conversationId, recipientId: "self", body, createdAt: "2026-10-01T00:00:00Z" });
function base(path: string) {
  if (path === "/api/v1/messages/conversations") return Promise.resolve(conversations);
  if (path === "/api/v1/me/unread-summary") return Promise.resolve({ notifications: 0 });
  return Promise.resolve([]);
}
afterEach(cleanup); beforeEach(() => { mocks.request.mockReset(); mocks.locale = "en-US"; mocks.token = "isolated-session"; });
it("loads the newly selected conversation and ignores the previous response", async () => {
  let complete!: (messages: object[]) => void;
  mocks.request.mockImplementation((path: string) => {
    if (path === "/api/v1/messages/conversations/first") return new Promise((resolve) => { complete = resolve; });
    if (path === "/api/v1/messages/conversations/second") return Promise.resolve([message("second", "second private message")]);
    return base(path);
  });
  render(<MessagesCenter />);
  fireEvent.click(screen.getByRole("button", { name: "messages.privateChats" }));
  fireEvent.click(await screen.findByRole("button", { name: "first messages.noMessages" }));
  await waitFor(() => expect(complete).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: "second messages.noMessages" }));
  await act(async () => { complete([message("first", "first private message")]); });
  expect(await screen.findByText("second private message")).toBeTruthy();
  expect(screen.queryByText("first private message")).toBeNull();
});
it("does not append a late send response into another conversation or clear its draft", async () => {
  let complete!: (response: object) => void;
  mocks.request.mockImplementation((path: string, options: RequestInit = {}) => {
    if (options.method === "POST" && path === "/api/v1/messages/conversations/first") return new Promise((resolve) => { complete = resolve; });
    return base(path);
  });
  render(<MessagesCenter />);
  fireEvent.click(screen.getByRole("button", { name: "messages.privateChats" }));
  fireEvent.click(await screen.findByRole("button", { name: "first messages.noMessages" }));
  const draft = screen.getByPlaceholderText("messages.messagePlaceholder");
  fireEvent.change(draft, { target: { value: "first draft" } });
  fireEvent.click(screen.getByRole("button", { name: "messages.send" }));
  await waitFor(() => expect(complete).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: "second messages.noMessages" }));
  fireEvent.change(screen.getByPlaceholderText("messages.messagePlaceholder"), { target: { value: "second draft" } });
  await act(async () => { complete({ message: message("first", "late first send") }); });
  expect(screen.queryByText("late first send")).toBeNull();
  expect((screen.getByPlaceholderText("messages.messagePlaceholder") as HTMLTextAreaElement).value).toBe("second draft");
});

it("does not display a cached notification translation in another locale", async () => {
  const notification = { id: "notice", kind: "system", title: "source title", body: "source body", sourceLocale: "zh-CN", read: true, data: {}, actors: [], createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", translationAllowed: true };
  mocks.request.mockImplementation((path: string) => {
    if (path.startsWith("/api/v1/notifications?")) return Promise.resolve([notification]);
    if (path === "/api/v1/notifications/notice/translate") return Promise.resolve({ cached: true, translation: { title: "English title", body: "English body" } });
    if (path === "/api/v1/notifications/ai-balance") return Promise.resolve({ usedTokens: 0, reservedTokens: 0, limitTokens: 100, remainingTokens: 100, unlimited: false });
    return base(path);
  });
  const view = render(<MessagesCenter />);
  fireEvent.click(await screen.findByRole("button", { name: "messages.aiTranslate" }));
  await screen.findByText("English title");
  mocks.locale = "ja-JP";
  view.rerender(<MessagesCenter />);
  expect(screen.queryByText("English title")).toBeNull();
  expect(screen.getByText("source title")).toBeTruthy();
});
it("clears the previous session conversation state when the account changes", async () => {
  mocks.request.mockImplementation((path: string) => path === "/api/v1/messages/conversations/first" ? Promise.resolve([message("first", "old session content")]) : base(path));
  const view = render(<MessagesCenter />);
  fireEvent.click(screen.getByRole("button", { name: "messages.privateChats" }));
  fireEvent.click(await screen.findByRole("button", { name: "first messages.noMessages" }));
  await screen.findByText("old session content");
  mocks.token = "new-isolated-session";
  view.rerender(<MessagesCenter />);
  expect(screen.queryByText("old session content")).toBeNull();
});
