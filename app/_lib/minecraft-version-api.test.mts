import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import type { MinecraftVersionConfig } from "./mod-api";

function version(code: string): MinecraftVersionConfig {
  return { versions: [{ code, type: "release" }], loaders: [], sourceUrl: "", lastSyncedAt: "" };
}

test("a late version read cannot restore the catalog from before an administrator save", async () => {
  const initial = Promise.withResolvers<MinecraftVersionConfig>();
  const refresh = Promise.withResolvers<MinecraftVersionConfig>();
  const reads = [initial, refresh];
  const key = "mcmodsVersionRead-" + crypto.randomUUID();
  Reflect.set(globalThis, key, () => reads.shift()!.promise);
  try {
    const source = (await readFile(new URL("./minecraft-version-api.ts", import.meta.url), "utf8")).replace(
      'import { apiRequest } from "./api";', `const apiRequest = globalThis[${JSON.stringify(key)}];`,
    );
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const catalog = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`) as typeof import("./minecraft-version-api");
    const picker = catalog.loadMinecraftVersionConfig();
    const otherPicker = catalog.loadMinecraftVersionConfig();
    const admin = catalog.loadMinecraftVersionConfig({ refresh: true });
    assert.equal(reads.length, 0);
    const saved = version("saved");
    catalog.cacheMinecraftVersionConfig(saved);
    refresh.resolve(version("before-save"));
    initial.resolve(version("oldest"));
    assert.deepEqual(await Promise.all([picker, otherPicker, admin]), [saved, saved, saved]);
    assert.equal(catalog.getCachedMinecraftVersionConfig(), saved);
    assert.equal(await catalog.loadMinecraftVersionConfig(), saved);

    const first = Promise.withResolvers<MinecraftVersionConfig>();
    const second = Promise.withResolvers<MinecraftVersionConfig>();
    reads.push(first, second);
    const former = catalog.loadMinecraftVersionConfig({ refresh: true });
    const latter = catalog.loadMinecraftVersionConfig({ refresh: true });
    first.reject(new Error("obsolete read failed"));
    const synced = version("synced");
    second.resolve(synced);
    assert.deepEqual(await Promise.all([former, latter]), [synced, synced]);

    const unavailable = Promise.withResolvers<MinecraftVersionConfig>();
    reads.push(unavailable);
    const failed = catalog.loadMinecraftVersionConfig({ refresh: true });
    unavailable.reject(new Error("version catalog unavailable"));
    await assert.rejects(failed, /version catalog unavailable/);
    assert.equal(catalog.getCachedMinecraftVersionConfig(), synced);
    assert.equal(await catalog.loadMinecraftVersionConfig(), synced);
  } finally {
    Reflect.deleteProperty(globalThis, key);
  }
});
