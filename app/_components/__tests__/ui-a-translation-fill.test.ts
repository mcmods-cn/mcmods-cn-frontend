import { describe, expect, it } from "vitest";
import { safeMissingTranslation } from "../../_lib/ai-translation-fill";

describe("delayed AI translation publication", () => {
  it("fills a missing field while retaining interpolation parameters", () => {
    expect(safeMissingTranslation("Hello {name}", "Hello {name}", "", "你好 {name}" )).toBe("你好 {name}");
  });
  it("protects manual edits made while the task was running", () => {
    expect(safeMissingTranslation("Hello", "Hello", "Human revision", "AI revision")).toBeUndefined();
  });
  it("rejects an obsolete source, damaged placeholders, and empty responses", () => {
    expect(safeMissingTranslation("Old", "New", "", "旧版")).toBeUndefined();
    expect(safeMissingTranslation("Hello {name}", "Hello {name}", "", "你好")).toBeUndefined();
    expect(safeMissingTranslation("Hello", "Hello", "", " ")).toBeUndefined();
  });
});
