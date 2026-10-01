// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ thread: vi.fn(), react: vi.fn(), load: vi.fn(), t: (key: string) => key }));
vi.mock("../app/_lib/auth", () => ({ useAuthSnapshot: () => ({ ready: true, token: "synthetic-session", user: undefined }) }));
vi.mock("../app/_lib/i18n-provider", () => ({ useI18n: () => ({ locale: "en-US", t: mocks.t }) }));
vi.mock("../app/_lib/comment-api", async (importOriginal) => ({ ...await importOriginal<object>(), loadCommentThread: mocks.thread, loadComments: mocks.load, setCommentReaction: mocks.react }));
vi.mock("../app/_components/markdown-renderer", () => ({ MarkdownRenderer: ({ markdown }: { markdown: string }) => <span>{markdown}</span> }));
vi.mock("../app/_components/user-avatar", () => ({ UserCardAvatar: () => null }));
vi.mock("../app/_components/unified-report-dialog", () => ({ UnifiedReportButton: () => null }));
vi.mock("../app/_components/comment-markdown-editor", () => ({ CommentMarkdownEditor: () => null }));
import { CommentSection, CommentThread } from "../app/_components/comment-section";
import type { CommentItem } from "../app/_lib/comment-api";
const comment = (id: string): CommentItem => ({
  id, floorNumber: null, body: id, depth: 0, deleted: false,
  author: { id: "fixture", username: "fixture", avatarUrl: "", onlineStatus: "offline" },
  reactions: { thumbs_up: 1 }, userReactions: [], childCount: 0, descendantCount: 0, heatScore: 0,
  hasMoreReplies: false, pinned: false, canEdit: false, canDelete: false, canPin: false, canReply: false,
  canReact: true, canReport: false, canWatch: false, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", attachments: [],
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => { mocks.thread.mockReset(); mocks.react.mockReset(); mocks.load.mockReset(); });
it("preserves both reactions when independent requests complete", async () => {
  const completed: Array<() => void> = [];
  mocks.thread.mockResolvedValue({ items: [comment("first"), comment("second")], target: { title: "fixture", url: "/mods/fixture" } });
  mocks.react.mockImplementation(() => new Promise<void>((resolve) => completed.push(resolve)));
  render(<CommentThread commentId="first" />);
  await screen.findByText("first");
  const buttons = screen.getAllByRole("button", { name: "👍 1" });
  fireEvent.click(buttons[0]); fireEvent.click(buttons[1]);
  await act(async () => { completed[0](); });
  await act(async () => { completed[1](); });
  expect(screen.getAllByRole("button", { name: "👍 2" })).toHaveLength(2);
});
it("reports clipboard failure without claiming the link was copied", async () => {
  const writeText = vi.fn().mockRejectedValue(new Error("controlled clipboard denial"));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  mocks.thread.mockResolvedValue({ items: [comment("first")], target: { title: "fixture", url: "/mods/fixture" } });
  render(<CommentThread commentId="first" />);
  fireEvent.click(await screen.findByRole("button", { name: "mods.comments.shareBranch" }));
  expect(await screen.findByText("controlled clipboard denial")).toBeTruthy();
  expect(screen.queryByText("mods.comments.branchCopied")).toBeNull();
});
it("ignores an obsolete sort response", async () => {
  let complete!: (value: unknown) => void;
  mocks.load.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; })).mockResolvedValueOnce({ items: [comment("new sort")], total: 1, capabilities: { canCreate: false } });
  render(<CommentSection targetType="mod" targetKey="fixture" />);
  await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "oldest" } });
  await screen.findByText("new sort");
  await act(async () => { complete({ items: [comment("obsolete sort")], total: 1, capabilities: { canCreate: false } }); });
  expect(screen.queryByText("obsolete sort")).toBeNull();
});
it("deduplicates clicks on the same reaction while it is pending", async () => {
  let complete!: () => void;
  mocks.thread.mockResolvedValue({ items: [comment("first")], target: { title: "fixture", url: "/mods/fixture" } });
  mocks.react.mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
  render(<CommentThread commentId="first" />);
  const button = await screen.findByRole("button", { name: "👍 1" });
  fireEvent.click(button); fireEvent.click(button);
  await act(async () => { complete(); });
  expect(mocks.react).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "👍 2" })).toBeTruthy();
});
