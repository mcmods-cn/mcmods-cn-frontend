import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

test("UTC daily dashboard buckets retain their day in western browser time zones", async () => {
  const source = await readFile(new URL("../_components/admin-dashboard-panel.tsx", import.meta.url), "utf8");
  const file = ts.createSourceFile("admin-dashboard-panel.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = file.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === "formatChartDate");
  assert(node, "test must exercise the real chart date formatter");
  const compiled = ts.transpileModule(`export ${node.getText(file)}`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { formatChartDate } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  const previous = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    assert.equal(formatChartDate("2026-10-02", "en-US", true), "Oct 2, 2026");
    assert.equal(formatChartDate("2026-01-01", "en-US", true), "Jan 1, 2026");
    assert.match(formatChartDate("2026-10-02", "zh-CN", true), /2日/);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
