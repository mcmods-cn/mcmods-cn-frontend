import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const apiSource = readFileSync(new URL("./server-api.ts", import.meta.url), "utf8");
const wizardSource = readFileSync(new URL("../_components/server-submission-wizard.tsx", import.meta.url), "utf8");

test("server mutation payloads contain declarations, never probe evidence", () => {
  const declaration = apiSource.match(/export type ServerModDeclaration = \{([\s\S]*?)\n\};/)?.[1] ?? "";
  assert.match(declaration, /id:\s*string/);
  assert.match(declaration, /version\?:\s*string/);
  assert.doesNotMatch(declaration, /source|confidence/);
  assert.match(apiSource, /mods:\s*ServerModDeclaration\[\]/);
  assert.match(apiSource, /export type ServerProbeResult = \{[\s\S]*?mods:\s*DetectedServerMod\[\]/);

  const serializer = wizardSource.match(/function serverModsFromResources[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(serializer, /Map<string,\s*ServerModDeclaration>/);
  assert.doesNotMatch(serializer, /source:\s*"manual"|confidence:\s*"declared"/);
});
