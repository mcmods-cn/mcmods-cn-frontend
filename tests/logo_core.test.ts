// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/site-logo/route";

let directory = "";
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); if (directory) await rm(directory, { recursive: true }); directory = ""; });

function request(origin = "http://localhost:3000") {
  const form = new FormData();
  form.set("file", new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "logo.png", { type: "image/png" }));
  return new NextRequest("http://localhost:3000/api/site-logo", { method: "POST", headers: { Origin: origin, Cookie: "mcmods_session=synthetic-token", Authorization: "Bearer cookie-session" }, body: form });
}

describe("site logo cookie-session authorization", () => {
  it("forwards only the session cookie and verifies backend permission before writing", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "mcmods-logo-core-"));
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    const fetchPermission = vi.fn().mockImplementation((_url, init) => {
      const headers = new Headers(init.headers);
      return Promise.resolve(new Response(null, { status: headers.get("Cookie") === "mcmods_session=synthetic-token" && !headers.has("Authorization") ? 204 : 403 }));
    });
    vi.stubGlobal("fetch", fetchPermission);
    const response = await POST(request());
    expect(response.status).toBe(201);
    const { url } = await response.json();
    expect((await readFile(path.join(directory, "public", url))).length).toBe(8);
  });
  it("rejects a cross-origin cookie upload without consulting the backend", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "mcmods-logo-core-"));
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    const fetchPermission = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchPermission);
    expect((await POST(request("https://attacker.invalid"))).status).toBe(403);
    expect(fetchPermission).not.toHaveBeenCalled();
  });
});
