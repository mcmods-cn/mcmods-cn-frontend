import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { minecraftLoaderCodeKey, toggleMinecraftVersionCodes } from "./minecraft-version-selection.mts";

test("every Minecraft version group action uses the disabled-code-aware toggle boundary", async () => {
  const component = await readFile(new URL("../_components/minecraft-version-picker.tsx", import.meta.url), "utf8");
  assert.match(component, /toggleMinecraftVersionCodes/);
  assert.doesNotMatch(component, /for \(const code of codes\) \{\s*if \(allSelected\) selected\.delete\(code\)/);
});

test("compressed and parent group toggles preserve disabled selected members", () => {
  const available = ["1.21.1", "1.21.2", "1.21.3"];
  const disabled = new Set(["1.21.2"]);

  assert.deepEqual(
    toggleMinecraftVersionCodes(available, available, available, disabled),
    ["1.21.2"],
  );
  assert.deepEqual(
    toggleMinecraftVersionCodes(["1.21.2"], available, available, disabled),
    available,
  );
  assert.deepEqual(
    toggleMinecraftVersionCodes(available, ["1.21.1", "1.21.3"], available, disabled),
    ["1.21.2"],
  );
  assert.deepEqual(
    toggleMinecraftVersionCodes(["1.21.2"], ["1.21.2"], available, disabled),
    ["1.21.2"],
  );
});

test("version toggles retain configured order and unrelated selected codes", () => {
  assert.deepEqual(
    toggleMinecraftVersionCodes(["custom"], ["1.20.4", "1.21.1"], ["1.21.1", "1.20.4"], new Set()),
    ["1.21.1", "1.20.4", "custom"],
  );
});

test("mod-content global fallback preserves each loader's verified range", async () => {
  const workspace = await readFile(new URL("../_components/mod-content-workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /versions:\s*\[\.\.\.loader\.versions\]/);
  assert.doesNotMatch(workspace, /versions:\s*allMinecraftVersions/);
});

test("Minecraft loader administration rejects case-only duplicate codes", async () => {
  const panel = await readFile(new URL("../_components/admin-mod-panels.tsx", import.meta.url), "utf8");
  const editor = await readFile(new URL("../_components/mod-editor.tsx", import.meta.url), "utf8");
  assert.equal(minecraftLoaderCodeKey(" NeoForge "), minecraftLoaderCodeKey("neoforge"));
  assert.match(panel, /minecraftLoaderCodeKey\(item\.code\)\s*===\s*minecraftLoaderCodeKey\(code\)/);
  assert.doesNotMatch(panel, /loaders\.some\(\(item\)\s*=>\s*item\.code\s*===\s*code\)/);
  assert.match(editor, /minecraftLoaderCodeKey/);
  assert.doesNotMatch(editor, /item\.code\s*===\s*(?:compatibility\.loader|loader)/);
});

test("Minecraft loader administration renders every structured provenance source", async () => {
  const panel = await readFile(new URL("../_components/admin-mod-panels.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("./mod-api.ts", import.meta.url), "utf8");
  assert.match(api, /sourceUrls\?:\s*string\[\]/);
  assert.match(panel, /status\.sourceUrls\s*\?\?\s*\[\]/);
  assert.match(panel, /syncSourceURLs\.map\(/);
  assert.doesNotMatch(panel, /href=\{syncStatus\.sourceUrl\}/);
});
