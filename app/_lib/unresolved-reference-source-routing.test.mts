import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../_components/admin-unresolved-references.tsx", import.meta.url), "utf8");

test("unresolved-reference sources expose routable identities and diagnostic fallbacks", () => {
  assert.match(panel, /"minecraft_server_mod"/);
  assert.match(panel, /"simple_project_parent"/);
  assert.match(panel, /routableUnresolvedSourceTypes\.has\(item\.sourceType\)/);
  assert.match(panel, /href=\{`\/\$\{encodeURIComponent\(item\.sourcePublicId\)\}`\}/);
  assert.match(panel, /item\.sourceLabel \|\| item\.sourceType/);
  assert.match(panel, /item\.sourcePublicId \? ` · \$\{item\.sourcePublicId\}`/);
});
