import assert from "node:assert/strict";
import test from "node:test";
import { projectTextOverflow } from "./project-text-limits.mts";

test("Mod and Modpack submissions count Unicode code points in the fields their APIs constrain", () => {
  const project = { primaryName: "𠮷".repeat(160), summary: "😀".repeat(500) };
  assert.equal(projectTextOverflow(project, "😀".repeat(160)), null);
  assert.deepEqual(projectTextOverflow({ ...project, primaryName: project.primaryName + "𠮷" }), { field: "primaryName", limit: 160 });
  assert.deepEqual(projectTextOverflow({ ...project, summary: project.summary + "𠮷" }), { field: "summary", limit: 500 });
  const name = "𠮷".repeat(161);
  assert.equal(projectTextOverflow({ ...project, secondaryName: name } as typeof project), null);
  assert.deepEqual(projectTextOverflow(project, name), { field: "secondaryName", limit: 160 });
});
