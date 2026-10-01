import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, backendFetch } from "../app/_lib/api";
import { downloadFavoriteModpackExport } from "../app/_lib/favorite-api";
import { waitForModExportJob, type ModExportJob } from "../app/_lib/mod-export-api";
import { putFileToOSS, type OSSDirectUploadTicket } from "../app/_lib/oss-upload";
vi.mock("../app/_lib/api", async (original) => ({ ...await original<typeof import("../app/_lib/api")>(), apiRequest: vi.fn(), backendFetch: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("cookie downloads and upload cancellation", () => {
  it("downloads favorites with cookie credentials without a sentinel Bearer header", async () => {
    vi.useFakeTimers();
    vi.mocked(backendFetch).mockResolvedValue(new Response("synthetic mrpack"));
    vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:synthetic"); static revokeObjectURL = vi.fn(); });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await downloadFavoriteModpackExport("cookie-session", "task", "pack");
    const options = vi.mocked(backendFetch).mock.calls[0][1];
    expect(options?.credentials).toBe("include");
    expect(new Headers(options?.headers).has("Authorization")).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic");
  });
  it("removes each abort listener after the import polling wait completes", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const job = { status: "importing" } as ModExportJob;
    vi.mocked(apiRequest).mockResolvedValueOnce(job).mockResolvedValueOnce(job).mockResolvedValueOnce({ status: "ready" });
    const result = waitForModExportJob("mod", "job", "cookie-session", vi.fn(), controller.signal);
    await vi.advanceTimersByTimeAsync(2_400);
    expect((await result).status).toBe("ready");
    expect(add).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1]);
  });
  it("rejects an already cancelled multipart upload before any request", async () => {
    const controller = new AbortController(); controller.abort();
    const xhr = vi.spyOn(globalThis, "XMLHttpRequest");
    const ticket = { multipart: { uploadId: "isolated", partSize: 1, parts: [] } } as unknown as OSSDirectUploadTicket;
    await expect(putFileToOSS(ticket, new File(["test"], "test.zip"), undefined, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(xhr).not.toHaveBeenCalled();
  });
});
