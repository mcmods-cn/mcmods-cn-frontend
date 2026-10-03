import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AbortableSharedCache,
  ExclusiveTaskGate,
} from "../../lib/mcmods-exporter/renderer/structureLoadControl.mts";

test("the structure build gate runs one task at a time and drops an aborted waiter", async () => {
  const gate = new ExclusiveTaskGate();
  const order: string[] = [];
  let releaseFirst!: () => void;
  const first = gate.run(undefined, async () => {
    order.push("first:start");
    await new Promise<void>((resolve) => { releaseFirst = resolve; });
    order.push("first:end");
    return 1;
  });
  const cancelled = new AbortController();
  let cancelledStarted = false;
  const second = gate.run(cancelled.signal, async () => {
    cancelledStarted = true;
    return 2;
  });
  const third = gate.run(undefined, async () => {
    order.push("third:start");
    return 3;
  });

  await Promise.resolve();
  cancelled.abort(new Error("caller-specific cancellation"));
  await assert.rejects(second, (reason: unknown) => reason instanceof Error && reason.name === "AbortError");
  assert.equal(cancelledStarted, false);
  assert.deepEqual(order, ["first:start"]);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, third]), [1, 3]);
  assert.deepEqual(order, ["first:start", "first:end", "third:start"]);
});

test("a shared fetch survives one consumer abort and is cached after success", async () => {
  const cache = new AbortableSharedCache<string>();
  let resolveFetch!: (value: string) => void;
  let loaderSignal!: AbortSignal;
  let loads = 0;
  const loader = (signal: AbortSignal) => {
    loads++;
    loaderSignal = signal;
    return new Promise<string>((resolve) => { resolveFetch = resolve; });
  };
  const firstController = new AbortController();
  const secondController = new AbortController();
  const first = cache.get("stone", firstController.signal, loader);
  const second = cache.get("stone", secondController.signal, loader);

  firstController.abort();
  await assert.rejects(first, (reason: unknown) => reason instanceof Error && reason.name === "AbortError");
  assert.equal(loaderSignal.aborted, false);
  resolveFetch("model");
  assert.equal(await second, "model");
  assert.equal(await cache.get("stone", undefined, loader), "model");
  assert.equal(loads, 1);
});

test("a shared fetch is aborted and evicted after its last consumer leaves", async () => {
  const cache = new AbortableSharedCache<string>();
  const observedSignals: AbortSignal[] = [];
  const loader = (signal: AbortSignal) => {
    observedSignals.push(signal);
    return new Promise<string>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  };
  const firstController = new AbortController();
  const secondController = new AbortController();
  const first = cache.get("stone", firstController.signal, loader);
  const second = cache.get("stone", secondController.signal, loader);

  firstController.abort();
  secondController.abort();
  await Promise.allSettled([first, second]);
  assert.equal(observedSignals[0]?.aborted, true);

  const retryController = new AbortController();
  const retry = cache.get("stone", retryController.signal, loader);
  await Promise.resolve();
  assert.equal(observedSignals.length, 2);
  retryController.abort();
  await assert.rejects(retry);
});

test("viewer and renderer source contracts propagate and dispose abort signals", async () => {
  const [canvas, viewer, renderer, scene, model, source] = await Promise.all([
    readFile(new URL("../../components/mcmods-exporter/StructureCanvas.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/blueprint-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../lib/mcmods-exporter/renderer/StructureRenderer.ts", import.meta.url), "utf8"),
    readFile(new URL("../../lib/mcmods-exporter/renderer/structureScene.ts", import.meta.url), "utf8"),
    readFile(new URL("../../lib/mcmods-exporter/renderer/minecraftBlockModel.ts", import.meta.url), "utf8"),
    readFile(new URL("../../lib/mcmods-exporter/renderer/httpAssetSource.ts", import.meta.url), "utf8"),
  ]);
  assert.match(canvas, /load: \(signal\?: AbortSignal\)/);
  assert.match(canvas, /const controller = new AbortController\(\)/);
  assert.match(canvas, /source\.load\(controller\.signal\)/);
  assert.match(canvas, /activeRenderer\.load\(bytes, source\.name, controller\.signal\)/);
  assert.match(canvas, /controller\.abort\(\)/);
  assert.match(viewer, /load: async \(signal\?: AbortSignal\)/);
  assert.match(viewer, /signal,/);
  assert.match(renderer, /private loadController\?: AbortController/);
  assert.match(renderer, /structureBuildGate\.run/);
  assert.match(renderer, /this\.loadController\?\.abort/);
  assert.match(scene, /signal\?: AbortSignal/);
  assert.match(scene, /throwIfAborted\(signal\)/);
  assert.match(scene, /if \(isAbortError\(error\)\) throw error/);
  assert.match(scene, /Promise\.allSettled/);
  assert.match(model, /signal\?: AbortSignal/);
  assert.match(model, /bundle\.json[^\n]+signal/);
  assert.match(model, /if \(isAbortError\(error\)\) throw error/);
  assert.match(model, /if \(finished\) \{\s+texture\.dispose\(\)/);
  assert.match(source, /new AbortableSharedCache/);
  assert.match(source, /headers: \{ Accept: contentType\(normalized\) \},\s+signal,/);
});
