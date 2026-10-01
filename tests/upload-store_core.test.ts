import { describe, expect, it } from "vitest";
import { modExportUploadTaskKey } from "../app/_lib/mod-export-upload-store";

describe("import resume identity", () => {
  it("isolates cookie session imports by the authenticated account", () => {
    expect(modExportUploadTaskKey("example", "version", "cookie-session", "user-a"))
      .not.toBe(modExportUploadTaskKey("example", "version", "cookie-session", "user-b"));
  });
  it("does not create a shared cookie-session namespace before auth is ready", () => {
    expect(modExportUploadTaskKey("example", "version", "cookie-session")).toBe("");
  });
});
