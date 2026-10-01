// @vitest-environment jsdom
import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const upload = vi.hoisted(() => vi.fn());
vi.mock("../app/_lib/i18n-provider", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../app/_lib/oss-upload", () => ({ uploadUserFileToOSS: upload, formatBytes: (n: number) => `${n}` }));
vi.mock("../app/_components/markdown-renderer", () => ({ MarkdownRenderer: () => null }));
vi.mock("../app/_components/sticker-picker", () => ({ StickerPicker: () => null }));
import { CommentMarkdownEditor, type CommentEditorAttachment } from "../app/_components/comment-markdown-editor";
afterEach(cleanup); beforeEach(() => { upload.mockReset(); });
const existing = { id: "old", name: "old.txt", sizeBytes: 1, contentType: "text/plain" };
function Editor({ disabled = false }: { disabled?: boolean }) {
  const [attachments, setAttachments] = useState<CommentEditorAttachment[]>([existing]);
  return <CommentMarkdownEditor attachments={attachments} disabled={disabled} value="draft" token="isolated" onAttachmentsChange={setAttachments} onChange={() => {}} onError={() => {}} />;
}
it("does not restore an attachment removed while an upload is pending", async () => {
  let complete!: (record: object) => void;
  upload.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  const { container } = render(<Editor />);
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["x"], "new.txt")] } });
  fireEvent.click(screen.getByRole("button", { name: "common.delete" }));
  await act(async () => { complete({ id: "new", originalName: "new.txt", sizeBytes: 1, contentType: "text/plain" }); });
  await waitFor(() => expect(screen.getByText("new.txt")).toBeTruthy());
  expect(screen.queryByText("old.txt")).toBeNull();
});
it("does not start file uploads while the editor is disabled", () => {
  upload.mockResolvedValue({ id: "new", originalName: "new.txt", sizeBytes: 1, contentType: "text/plain" });
  const { container } = render(<Editor disabled />);
  fireEvent.drop(container.firstElementChild!, { dataTransfer: { files: [new File(["x"], "new.txt")] } });
  expect(upload).not.toHaveBeenCalled();
});
it("prevents overlapping drop batches from replacing each other's attachments", async () => {
  const completions: Array<(record: object) => void> = [];
  upload.mockImplementation(() => new Promise((resolve) => { completions.push(resolve); }));
  const { container } = render(<Editor />);
  fireEvent.drop(container.firstElementChild!, { dataTransfer: { files: [new File(["x"], "first.txt")] } });
  fireEvent.drop(container.firstElementChild!, { dataTransfer: { files: [new File(["x"], "second.txt")] } });
  const callCount = upload.mock.calls.length;
  await act(async () => { completions.forEach((complete, index) => complete({ id: `new-${index}`, originalName: index ? "second.txt" : "first.txt", sizeBytes: 1, contentType: "text/plain" })); });
  expect(callCount).toBe(1);
  expect(await screen.findByText("first.txt")).toBeTruthy();
});
