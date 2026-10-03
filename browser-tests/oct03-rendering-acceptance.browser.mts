import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { after, before, test } from "node:test";
import type { Page } from "playwright";
import sharp from "sharp";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";

type GLObservation = {
  id: number;
  vendor: string;
  renderer: string;
  version: string;
  created: Record<string, number>;
  deleted: Record<string, number>;
  liveBuffers: number;
  liveBufferBytes: number;
  peakBufferBytes: number;
  bufferUploadBytes: number;
  liveTextures: number;
  livePrograms: number;
  liveFramebuffers: number;
  liveRenderbuffers: number;
  instancedDraws: number;
  draws: Array<{ instances: number; indices: number; sequence: number; frame: number }>;
  finishSamplesMs: number[];
  viewMatrix: number[];
  errors: number[];
  nativeCalls: Record<string, { calls: number; totalMs: number; maxMs: number }>;
  longNativeCalls: Array<{ method: string; durationMs: number }>;
};
type RenderObservation = { contexts: GLObservation[]; pendingCovers: number; encodedCovers: number; longTasks: Array<{ startMs: number; durationMs: number }> };
type CPUProfile = {
  nodes: Array<{ id: number; callFrame: { functionName: string; url: string } }>;
  samples?: number[];
  timeDeltas?: number[];
  startTime: number;
  endTime: number;
};
declare global {
  interface Window {
    oct03RenderObservation: RenderObservation;
    oct03ReleaseCover: (index: number) => void;
    oct03MarkerImagesLoaded: number;
    oct03OpaqueProbeReads: number;
  }
}

const fixture = new ProductionBrowserFixture();
const reports: Array<{ name: string; ids: string[]; status: string; samples?: unknown; error?: string }> = [];
const diagnostics: Record<string, unknown> = {};
const stages: Record<string, Array<{ stage: string; elapsedMs: number }>> = {};
const cpuProfiles: Record<string, unknown> = {};
const sourcePaths = [
  "components/mcmods-exporter/StructureCanvas.tsx",
  "lib/mcmods-exporter/renderer/StructureRenderer.ts",
  "lib/mcmods-exporter/renderer/structureScene.ts",
  "lib/mcmods-exporter/renderer/structureSceneBudget.mts",
  "lib/mcmods-exporter/renderer/structureLoadControl.mts",
  "lib/mcmods-exporter/renderer/blueprint.ts",
  "lib/mcmods-exporter/renderer/minecraftBlockModel.ts",
  "app/_components/blueprint-viewer.tsx",
];

before(async () => { await fixture.start(); });
after(async () => {
  try { await fixture.close(); }
  finally {
    const sourceSHA256 = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, createHash("sha256").update(await readFile(new URL(`../${path}`, import.meta.url))).digest("hex")])));
    const report = {
      productionBuildId: (await readFile(new URL("../.next/BUILD_ID", import.meta.url), "utf8")).trim(),
      sourceSHA256,
      boundary: "Real standalone production components and native WebGL calls. Synthetic API/model/PNG transports only. Native draw methods are never replaced with successes; the first instance draw includes finish() to measure completion in this environment. Viewport390 is a browser viewport, not a physical mobile GPU. No physical-GPU fleet, mobile FPS, long-running memory, database or object-storage claim.",
      reports, diagnostics, stages, cpuProfiles,
    };
    if (process.env.MCMODS_RENDER_ACCEPTANCE_REPORT) {
      await mkdir(dirname(process.env.MCMODS_RENDER_ACCEPTANCE_REPORT), { recursive: true });
      await writeFile(process.env.MCMODS_RENDER_ACCEPTANCE_REPORT, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log("OCT03 production rendering acceptance", JSON.stringify(report));
  }
});

// Instrument native calls without replacing Three, its renderer or any GL result.
// WeakMaps avoid keeping disposed canvases, contexts or GPU objects alive.
async function observeNativeRendering(page: Page, holdCovers = false) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ holdCovers }) => {
    const observation: RenderObservation = { contexts: [], pendingCovers: 0, encodedCovers: 0, longTasks: [] };
    window.oct03RenderObservation = observation;
    window.oct03OpaqueProbeReads = 0;
    const nativeImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...args: Parameters<typeof nativeImageData>) {
      window.oct03OpaqueProbeReads++;
      return Reflect.apply(nativeImageData, this, args);
    };
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) observation.longTasks.push({ startMs: entry.startTime, durationMs: entry.duration });
        if (observation.longTasks.length > 64) observation.longTasks.splice(0, observation.longTasks.length - 64);
      }).observe({ type: "longtask", buffered: true });
    }
    const contexts = new WeakMap<WebGL2RenderingContext, GLObservation>();
    const nativeAnimationFrame = window.requestAnimationFrame;
    let activeFrame = 0;
    window.requestAnimationFrame = callback => nativeAnimationFrame.call(window, timestamp => {
      const previousFrame = activeFrame;
      activeFrame = timestamp;
      try { callback(timestamp); }
      finally { activeFrame = previousFrame; }
    });
    const objects = new WeakMap<object, number>();
    const resources = new WeakMap<GLObservation, Map<string, Set<number>>>();
    const sizes = new WeakMap<GLObservation, Map<number, number>>();
    const bindings = new WeakMap<GLObservation, Map<number, number>>();
    const uniformNames = new WeakMap<WebGLUniformLocation, string>();
    let nextObject = 0;
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value(this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        const context = Reflect.apply(nativeGetContext, this, [kind, ...args]) as RenderingContext | null;
        if (context instanceof WebGL2RenderingContext && !contexts.has(context)) {
          const debug = context.getExtension("WEBGL_debug_renderer_info");
          const record: GLObservation = {
            id: observation.contexts.length, vendor: String(context.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? context.VENDOR)),
            renderer: String(context.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER)), version: String(context.getParameter(context.VERSION)),
            created: {}, deleted: {}, liveBuffers: 0, liveBufferBytes: 0, peakBufferBytes: 0, bufferUploadBytes: 0,
            liveTextures: 0, livePrograms: 0, liveFramebuffers: 0, liveRenderbuffers: 0,
            instancedDraws: 0, draws: [], finishSamplesMs: [], viewMatrix: [], errors: [], nativeCalls: {}, longNativeCalls: [],
          };
          contexts.set(context, record);
          resources.set(record, new Map()); sizes.set(record, new Map()); bindings.set(record, new Map());
          observation.contexts.push(record);
        }
        return context;
      },
    });
    const proto = WebGL2RenderingContext.prototype;
    const wrap = (name: string, observed: (gl: WebGL2RenderingContext, args: unknown[], result: unknown) => void, finish = false) => {
      const original = Reflect.get(proto, name);
      assertFunction(original, name);
      Object.defineProperty(proto, name, { configurable: true, value(this: WebGL2RenderingContext, ...args: unknown[]) {
        const record = contexts.get(this);
        const timed = finish && record && record.finishSamplesMs.length < 1;
        const started = timed ? performance.now() : 0;
        const nativeStarted = performance.now();
        const result: unknown = Reflect.apply(original, this, args);
        const nativeMs = performance.now() - nativeStarted;
        if (record) {
          const call = record.nativeCalls[name] ??= { calls: 0, totalMs: 0, maxMs: 0 };
          call.calls++; call.totalMs += nativeMs; call.maxMs = Math.max(call.maxMs, nativeMs);
          if (nativeMs > 16) {
            record.longNativeCalls.push({ method: name, durationMs: nativeMs });
            if (record.longNativeCalls.length > 16) record.longNativeCalls.shift();
          }
        }
        observed(this, args, result);
        if (timed) { this.finish(); record.finishSamplesMs.push(performance.now() - started); }
        return result;
      } });
    };
    function assertFunction(value: unknown, name: string): asserts value is (...args: unknown[]) => unknown {
      if (typeof value !== "function") throw new Error(`Missing native GL method ${name}`);
    }
    const updateCounts = (record: GLObservation) => {
      const live = resources.get(record)!;
      record.liveBuffers = live.get("Buffer")?.size ?? 0;
      record.liveTextures = live.get("Texture")?.size ?? 0;
      record.livePrograms = live.get("Program")?.size ?? 0;
      record.liveFramebuffers = live.get("Framebuffer")?.size ?? 0;
      record.liveRenderbuffers = live.get("Renderbuffer")?.size ?? 0;
      record.liveBufferBytes = [...sizes.get(record)!.values()].reduce((sum, size) => sum + size, 0);
      record.peakBufferBytes = Math.max(record.peakBufferBytes, record.liveBufferBytes);
    };
    for (const kind of ["Buffer", "Texture", "Program", "Framebuffer", "Renderbuffer"]) {
      wrap(`create${kind}`, (gl, _args, result) => {
        const record = contexts.get(gl);
        if (!record || !result || typeof result !== "object") return;
        const id = ++nextObject; objects.set(result, id);
        const live = resources.get(record)!;
        if (!live.has(kind)) live.set(kind, new Set());
        live.get(kind)!.add(id);
        record.created[kind] = (record.created[kind] ?? 0) + 1;
        updateCounts(record);
      });
      wrap(`delete${kind}`, (gl, args) => {
        const record = contexts.get(gl);
        if (!record || !args[0] || typeof args[0] !== "object") return;
        const id = objects.get(args[0]);
        if (id === undefined) return;
        if (resources.get(record)!.get(kind)?.delete(id)) record.deleted[kind] = (record.deleted[kind] ?? 0) + 1;
        if (kind === "Buffer") sizes.get(record)!.delete(id);
        updateCounts(record);
      });
    }
    wrap("bindBuffer", (gl, args) => {
      const record = contexts.get(gl);
      if (!record) return;
      const id = args[1] && typeof args[1] === "object" ? objects.get(args[1]) : undefined;
      if (id === undefined) bindings.get(record)!.delete(Number(args[0]));
      else bindings.get(record)!.set(Number(args[0]), id);
    });
    for (const method of ["bufferData", "bufferSubData"]) wrap(method, (gl, args) => {
      const record = contexts.get(gl);
      if (!record) return;
      const payload = method === "bufferData" ? args[1] : args[2];
      const bytes = typeof payload === "number" ? payload : ArrayBuffer.isView(payload) || payload instanceof ArrayBuffer ? payload.byteLength : 0;
      record.bufferUploadBytes += bytes;
      const id = bindings.get(record)!.get(Number(args[0]));
      if (method === "bufferData" && id !== undefined) sizes.get(record)!.set(id, bytes);
      updateCounts(record);
    });
    wrap("getUniformLocation", (_gl, args, result) => {
      if (result instanceof WebGLUniformLocation) uniformNames.set(result, String(args[1]));
    });
    wrap("uniformMatrix4fv", (gl, args) => {
      const record = contexts.get(gl);
      if (record && args[0] instanceof WebGLUniformLocation && ["viewMatrix", "modelViewMatrix"].includes(uniformNames.get(args[0]) ?? "")) {
        record.viewMatrix = Array.from(args[2] as Float32Array);
      }
    });
    wrap("getError", () => undefined);
    for (const method of ["drawElementsInstanced", "drawArraysInstanced"]) wrap(method, (gl, args) => {
      const record = contexts.get(gl);
      if (!record) return;
      record.instancedDraws++;
      record.draws.push({ instances: Number(args.at(-1)), indices: Number(args[method === "drawElementsInstanced" ? 1 : 2]), sequence: record.instancedDraws, frame: activeFrame });
      if (record.draws.length > 16) record.draws.shift();
      const error = gl.getError();
      if (error !== gl.NO_ERROR) record.errors.push(error);
    }, true);
    const pending: Array<{ callback: BlobCallback; blob: Blob | null } | undefined> = [];
    const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
      nativeToBlob.call(this, blob => {
        observation.encodedCovers++;
        if (!holdCovers) { callback(blob); return; }
        pending.push({ callback, blob }); observation.pendingCovers++;
      }, type, quality);
    };
    window.oct03ReleaseCover = index => {
      const entry = pending[index];
      if (!entry) throw new Error(`No native encoded cover at ${index}`);
      pending[index] = undefined; observation.pendingCovers--; entry.callback(entry.blob);
    };
  }, { holdCovers });
}

function blueprintBytes(count: number, id = "audit:marker", secondaryId?: string) {
  const blocks: string[] = [];
  for (let index = 0; index < count; index++) blocks.push(`{"position":[${index % 100},${Math.floor(index / 3000)},${Math.floor(index / 100) % 30}],"state":{"id":${JSON.stringify(secondaryId && index >= count / 2 ? secondaryId : id)}}}`);
  return Buffer.from(`{"size":[100,${Math.max(1, Math.ceil(count / 3000))},30],"blocks":[${blocks.join(",")}]}`);
}
const png = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 38, g: 176, b: 71, alpha: 1 } } }).png().toBuffer();
const assetPaths = ["assets/audit/blockstates/marker.json", "assets/audit/models/block/marker.json", "assets/audit/textures/block/marker.png"];

function provider(publicId: string, count: number, options: { faces?: number; editing?: boolean; textureGate?: Promise<void>; onTexture?: () => void; onCover?: () => void; pendingModel?: { gate: Promise<void>; onRequest: () => void } } = {}): APIHandler {
  const bytes = blueprintBytes(count, "audit:marker", options.pendingModel ? "audit:waiting" : undefined);
  const waitingAssets = ["assets/audit/blockstates/waiting.json", "assets/audit/models/block/waiting.json"];
  const directions = ["up", "down", "north", "south", "east", "west"].slice(0, options.faces ?? 1);
  return async ({ path, url }) => {
    if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
    if (path === "/api/v1/stickers") return { data: { packs: [] } };
    if (path === "/api/v1/auth/me" && !options.editing) return { status: 401, code: "AUTH_UNAUTHENTICATED", error: "Guest rendering fixture" };
    if (path === "/api/v1/users/me/favorites/summary") return { data: { entityPublicIds: [], collectionIdsByEntity: {} } };
    if (path === `/api/v1/blueprints/${publicId}`) return { data: {
      id: publicId, title: "OCT03 rendering acceptance", description: "Synthetic production renderer fixture", sourceFormat: "nbt", status: "ready",
      size: [100, Math.max(1, Math.ceil(count / 3000)), 30], blockCount: count, paletteCount: options.pendingModel ? 2 : 1, entityCount: 0, dataVersion: 1, lastError: "",
      createdAt: "2026-10-03T00:00:00Z", updatedAt: "2026-10-03T00:00:00Z", coverGenerated: Boolean(options.editing),
      uploader: { id: "synthetic-author", username: "Synthetic author" }, requiredMods: [], variants: [], materials: [],
      assetRevisions: [{ id: "synthetic-render-revision", siteId: "synthetic-mod", paths: options.pendingModel ? [...assetPaths, ...waitingAssets] : assetPaths }], canEdit: Boolean(options.editing), renderAvailable: true,
    } };
    if (path === `/api/v1/content/${publicId}` || path === `/api/v1/blueprints/${publicId}/content`) return { status: 404, error: "No localized content fixture" };
    if (path === `/api/v1/blueprints/${publicId}/render`) return { bytes, contentType: "application/json" };
    if (path === `/api/v1/comment-targets/blueprint/${publicId}/comments`) return { data: { items: [], total: 0, nextCursor: "", capabilities: { canCreate: false } } };
    if (path === `/api/v1/projects/${publicId}/follow`) return { data: { followed: false, notificationsEnabled: false } };
    if (path === "/api/v1/export-revisions/synthetic-render-revision/assets/content") {
      const asset = url.searchParams.get("path");
      if (asset === assetPaths[0]) return { bytes: Buffer.from(JSON.stringify({ variants: { "": { model: "audit:block/marker" } } })), contentType: "application/json" };
      if (options.pendingModel && asset === waitingAssets[0]) return { bytes: Buffer.from(JSON.stringify({ variants: { "": { model: "audit:block/waiting" } } })), contentType: "application/json" };
      if (options.pendingModel && asset === waitingAssets[1]) {
        options.pendingModel.onRequest();
        await options.pendingModel.gate;
        return { bytes: Buffer.from(JSON.stringify({ textures: { surface: "audit:block/marker" }, elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: "#surface" } } }] })), contentType: "application/json" };
      }
      if (asset === assetPaths[1]) return { bytes: Buffer.from(JSON.stringify({ textures: { surface: "audit:block/marker" }, elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: Object.fromEntries(directions.map(direction => [direction, { texture: "#surface" }])) }] })), contentType: "application/json" };
      if (asset === assetPaths[2]) { options.onTexture?.(); await options.textureGate; return { bytes: png, contentType: "image/png" }; }
    }
    if (path === "/api/v1/users/me/oss/uploads/presign" && options.editing) {
      options.onCover?.();
      return { data: { uploadRequired: false, file: { id: "synthetic-cover", url: "https://assets.example.test/synthetic-cover.webp" } } };
    }
  };
}

async function snapshot(page: Page) { return page.evaluate(() => structuredClone(window.oct03RenderObservation)); }
async function frames(page: Page, count = 3) {
  await page.evaluate(async count => { for (let i = 0; i < count; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); }, count);
}
async function waitDraw(page: Page, context: number, instances: number, afterSequence = 0) {
  await page.waitForFunction(({ context, instances, afterSequence }) => window.oct03RenderObservation.contexts[context]?.draws.some(draw => draw.instances === instances && draw.sequence > afterSequence), { context, instances, afterSequence }, { timeout: 60_000 });
}
function assertFlatFacePassCount(record: GLObservation, instances: number, expectedPasses: number, afterSequence = 0) {
  const draws = record.draws.filter(draw => draw.instances === instances && draw.sequence > afterSequence && draw.frame > 0);
  assert.ok(draws.length > 0, "The real flat-face scene must draw during an animation frame");
  const latestFrame = draws.at(-1)!.frame;
  const latest = draws.filter(draw => draw.frame === latestFrame);
  for (const draw of latest) assert.equal(draw.indices, 6, "This check applies to the fixture's single quad, not a combined mesh");
  assert.equal(latest.length, expectedPasses, "Opaque loaded planes use one pass; alpha/context planes retain back/front ordering");
}
function assertReleased(record: GLObservation) {
  assert.equal(record.liveBuffers, 0, "Every application vertex/index/instance buffer must be deleted");
  assert.equal(record.liveBufferBytes, 0);
  assert.equal(record.livePrograms, 0);
  // Three r185 creates three scratch/src/dst framebuffers during construction
  // and keeps them for the context lifetime. Capture targets must return to
  // this exact baseline; a retained capture framebuffer still fails this check.
  assert.equal(record.liveFramebuffers, 3);
  assert.equal(record.liveRenderbuffers, 0);
  // Three r185 owns four 1x1 placeholders plus the module-shared 16x16 DFG LUT
  // used by MeshStandardMaterial. These outlive renderer.dispose until context
  // collection. Any application or cover texture beyond this exact baseline fails.
  assert.equal(record.liveTextures, record.instancedDraws ? 5 : 4, "Disposed context must retain only Three's known context-level textures");
  assert.deepEqual(record.errors, []);
}
async function runAcceptance(name: string, ids: string[], signal: AbortSignal, task: () => Promise<unknown>) {
  try {
    const samples = await task();
    reports.push({ name, ids, status: signal.aborted ? "TIMED_OUT" : "PASS", samples });
  } catch (error) {
    reports.push({ name, ids, status: signal.aborted ? "TIMED_OUT" : "FAIL", error: error instanceof Error ? error.stack ?? error.message : String(error) });
    throw error;
  }
}
async function scopedPage(handler: APIHandler, signal: AbortSignal) {
  const browser = await fixture.page(handler);
  const abort = () => { void browser.page.context().close().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  return { ...browser, close: async () => { signal.removeEventListener("abort", abort); await browser.close(); } };
}
function recordStage(name: string, stage: string, started: number) {
  (stages[name] ??= []).push({ stage, elapsedMs: performance.now() - started });
}
async function saveDiagnostic(name: string, page: Page) {
  try {
    diagnostics[name] = page.isClosed()
      ? { interrupted: "Test timeout closed its native context; CLI timeout remains authoritative" }
      : { observation: await snapshot(page), alerts: await page.getByRole("alert").allTextContents() };
  } catch (error) {
    if (!page.isClosed()) throw error;
    diagnostics[name] = { interrupted: "Native context closed during timeout diagnostic; CLI timeout remains authoritative" };
  }
}

test("PERF069 real production renderer submits 600k instances, slices layers and releases one build", { timeout: 120_000 }, async (context) => {
  await runAcceptance("production-600k-admission-and-layers", ["PERF-069"], context.signal, async () => {
    const browser = await scopedPage(provider("oct03-render-large", 600000), context.signal);
    try {
      await observeNativeRendering(browser.page);
      const started = performance.now();
      const profiler = process.env.MCMODS_RENDER_ACCEPTANCE_PROFILE ? await browser.page.context().newCDPSession(browser.page) : undefined;
      if (profiler) { await profiler.send("Profiler.enable"); await profiler.send("Profiler.start"); }
      try {
        // Hydration can start the large synchronous parser before the DOM event
        // is delivered. Commit the actual document, then use the unchanged real
        // native draw gate within the case's original overall 120-second budget.
        await browser.page.goto(`${fixture.origin}/blueprints/oct03-render-large`, { waitUntil: "commit" });
        recordStage("production-600k-admission-and-layers", "document navigation committed", started);
        await waitDraw(browser.page, 0, 600000);
        await browser.page.waitForFunction(() => window.oct03RenderObservation.contexts[0].liveTextures > 5);
        await frames(browser.page);
        recordStage("production-600k-admission-and-layers", "native 600k instance draw complete", started);
        const builtMs = performance.now() - started;
        assert.equal(await browser.page.getByRole("alert").filter({ hasText: "The 3D preview could not be rendered." }).count(), 0);
        const initial = (await snapshot(browser.page)).contexts[0];
        assertFlatFacePassCount(initial, 600000, 1);
        const initialUploadBytes = initial.bufferUploadBytes;
        recordStage("production-600k-admission-and-layers", "begin keyboard layer selection", started);
        await browser.page.getByRole("button", { name: "↓", exact: true }).press("Enter");
        await browser.page.getByRole("button", { name: "↓", exact: true }).press("Enter");
        await waitDraw(browser.page, 0, 6000, initial.instancedDraws);
        const layered = await snapshot(browser.page);
        recordStage("production-600k-admission-and-layers", "native adjacent and primary layer draws", started);
        assert.ok(layered.contexts[0].draws.some(draw => draw.instances === 3000 && draw.sequence > initial.instancedDraws));
        assertFlatFacePassCount(layered.contexts[0], 3000, 1, initial.instancedDraws);
        assertFlatFacePassCount(layered.contexts[0], 6000, 2, initial.instancedDraws);
        const layerUploadBytes = layered.contexts[0].bufferUploadBytes - initialUploadBytes;
        const allStarted = performance.now();
        await browser.page.getByRole("button", { name: "All", exact: true }).focus();
        await browser.page.keyboard.press("Enter");
        await waitDraw(browser.page, 0, 600000, layered.contexts[0].instancedDraws);
        const allRestoreMs = performance.now() - allStarted;
        assertFlatFacePassCount((await snapshot(browser.page)).contexts[0], 600000, 1, layered.contexts[0].instancedDraws);
        recordStage("production-600k-admission-and-layers", "all layers restored", started);
        // Client navigation preserves this instrumentation window and unmounts the real viewer.
        await browser.page.locator('a[href^="/login"]').first().press("Enter");
        await browser.page.waitForURL("**/login?**");
        await browser.page.locator("canvas").waitFor({ state: "detached" });
        const afterUnmount = await snapshot(browser.page);
        await frames(browser.page);
        const disposed = await snapshot(browser.page);
        disposed.contexts.forEach(assertReleased);
        recordStage("production-600k-admission-and-layers", "actual viewer unmounted and application resources released", started);
        assert.equal(disposed.contexts.at(-1)?.instancedDraws, afterUnmount.contexts.at(-1)?.instancedDraws, "Unmount must stop this viewer's animation");
        return { blocks: 600000, layers: 200, completedBuilds: 1, builtMs, allRestoreMs, selectedLayer: 198, primaryInstances: 3000, adjacentInstances: 6000, layerUploadBytes, contexts: disposed.contexts, longTasks: disposed.longTasks };
      } finally {
        if (profiler) {
          const { profile }: { profile: CPUProfile } = await profiler.send("Profiler.stop");
          const durationByNode = new Map<number, number>();
          for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
            const node = profile.samples![index];
            durationByNode.set(node, (durationByNode.get(node) ?? 0) + (profile.timeDeltas?.[index] ?? 0) / 1000);
          }
          cpuProfiles["production-600k-admission-and-layers"] = {
            sampledDurationMs: (profile.endTime - profile.startTime) / 1000,
            topSampledFrames: profile.nodes.map(node => ({ function: node.callFrame.functionName, sampledMs: durationByNode.get(node.id) ?? 0, script: node.callFrame.url ? new URL(node.callFrame.url, fixture.origin).pathname : "" })).sort((a, b) => b.sampledMs - a.sampledMs).slice(0, 30),
            boundary: "CDP sampled JavaScript-thread profile, native call durations and browser long tasks; not physical GPU timing or an exclusive attribution of shared host CPU",
          };
          await mkdir(dirname(process.env.MCMODS_RENDER_ACCEPTANCE_PROFILE!), { recursive: true });
          await writeFile(process.env.MCMODS_RENDER_ACCEPTANCE_PROFILE!, `${JSON.stringify(profile)}\n`);
          await profiler.detach();
        }
      }
    } finally { await saveDiagnostic("production-600k-admission-and-layers", browser.page); await browser.close(); }
  });
});

test("FS016 real production renderer releases three consecutive 100k builds", { timeout: 120_000 }, async (context) => {
  await runAcceptance("production-100k-three-builds", ["OCT02-FS-016"], context.signal, async () => {
    const browser = await scopedPage(provider("oct03-render-repeated", 100000), context.signal);
    try {
      await observeNativeRendering(browser.page);
      const started = performance.now();
      await browser.page.goto(`${fixture.origin}/blueprints/oct03-render-repeated`, { waitUntil: "domcontentloaded" });
      await waitDraw(browser.page, 0, 100000);
      const buildSamplesMs = [performance.now() - started];
      for (let cycle = 1; cycle <= 2; cycle++) {
        const rebuilt = performance.now();
        await browser.page.getByRole("button", { name: "Cull hidden faces", exact: true }).click();
        await waitDraw(browser.page, cycle, 100000);
        buildSamplesMs.push(performance.now() - rebuilt);
        assertReleased((await snapshot(browser.page)).contexts[cycle - 1]);
      }
      await browser.page.locator('a[href^="/login"]').first().click();
      await browser.page.waitForURL("**/login?**");
      await browser.page.locator("canvas").waitFor({ state: "detached" });
      const afterUnmount = await snapshot(browser.page);
      await frames(browser.page);
      const disposed = await snapshot(browser.page);
      assert.equal(disposed.contexts.length, 3);
      disposed.contexts.forEach(assertReleased);
      assert.equal(disposed.contexts[2].instancedDraws, afterUnmount.contexts[2].instancedDraws);
      return { blocks: 100000, completedBuilds: 3, buildSamplesMs, contexts: disposed.contexts };
    } finally { await saveDiagnostic("production-100k-three-builds", browser.page); await browser.close(); }
  });
});

test("PERF069 production budget rejects a 3.6M-face model before GPU buffers and renders bounded fallback", { timeout: 120_000 }, async (context) => {
  await runAcceptance("production-600k-six-face-budget", ["PERF-069"], context.signal, async () => {
    const browser = await scopedPage(provider("oct03-render-budget", 600000, { faces: 6 }), context.signal);
    try {
      await observeNativeRendering(browser.page);
      const started = performance.now();
      await browser.page.goto(`${fixture.origin}/blueprints/oct03-render-budget`, { waitUntil: "domcontentloaded" });
      recordStage("production-600k-six-face-budget", "document ready", started);
      await waitDraw(browser.page, 0, 600000);
      recordStage("production-600k-six-face-budget", "native bounded fallback draw complete", started);
      const observed = await snapshot(browser.page);
      assert.equal(observed.contexts.length, 1);
      assert.ok(observed.contexts[0].draws.every(draw => draw.instances <= 600000));
      assert.ok(observed.contexts[0].draws.some(draw => draw.instances === 600000 && draw.indices === 36), "Production fallback is a cube, not the original six instanced face meshes");
      assert.ok(observed.contexts[0].peakBufferBytes < 128 * 1024 * 1024, "Rejected face model must not upload millions of instance matrices");
      assert.equal(await browser.page.getByRole("alert").filter({ hasText: "The 3D preview could not be rendered." }).count(), 0);
      return { blocks: 600000, rejectedModelInstances: 3600000, result: "bounded cube fallback", contexts: observed.contexts };
    } finally { await saveDiagnostic("production-600k-six-face-budget", browser.page); await browser.close(); }
  });
});

test("PERF069 production parser refuses 600001 blocks while the page remains usable", { timeout: 120_000 }, async (context) => {
  await runAcceptance("production-parser-budget-rejection", ["PERF-069"], context.signal, async () => {
    const browser = await scopedPage(provider("oct03-render-limit", 600001), context.signal);
    try {
      await observeNativeRendering(browser.page);
      await browser.page.goto(`${fixture.origin}/blueprints/oct03-render-limit`, { waitUntil: "domcontentloaded" });
      await browser.page.getByRole("alert").getByText(/600,000/).waitFor({ timeout: 60_000 });
      await browser.page.getByRole("heading", { name: "OCT03 rendering acceptance", exact: true }).waitFor();
      const observed = await snapshot(browser.page);
      assert.ok(observed.contexts.every(context => context.instancedDraws === 0));
      assert.equal(await browser.page.getByRole("button", { name: "Export CSV", exact: true }).count(), 1);
      return { blocks: 600001, result: "explicit readable rejection before scene GPU instances", contexts: observed.contexts };
    } finally { await saveDiagnostic("production-parser-budget-rejection", browser.page); await browser.close(); }
  });
});

test("FS014 FS016 production first-person survives rebuild, blur stops movement and late cover/texture stays scoped", { timeout: 60_000 }, async (context) => {
  await runAcceptance("production-first-person-and-late-resources", ["OCT02-FS-014", "OCT02-FS-016"], context.signal, async () => {
    const textureGate = Promise.withResolvers<void>();
    let textureRequests = 0;
    let coverRequests = 0;
    const browser = await scopedPage(provider("oct03-render-lifecycle", 30, { editing: true, textureGate: textureGate.promise, onTexture: () => textureRequests++, onCover: () => coverRequests++ }), context.signal);
    try {
      await observeNativeRendering(browser.page, true);
      // A deliberately delayed texture can hold the document load event. The
      // production canvas, native draws and encoded cover are our readiness gates.
      await browser.page.goto(`${fixture.origin}/blueprints/oct03-render-lifecycle`, { waitUntil: "domcontentloaded" });
      await waitDraw(browser.page, 0, 30);
      await browser.page.waitForFunction(() => window.oct03RenderObservation.pendingCovers === 1);
      assert.ok(textureRequests > 0);
      await browser.page.getByRole("button", { name: "Fullscreen", exact: true }).click();
      await browser.page.getByRole("button", { name: "First person", exact: true }).click();
      assert.equal(await browser.page.locator("canvas").first().evaluate(canvas => canvas.style.cursor), "crosshair");
      await browser.page.getByRole("button", { name: "Cull hidden faces", exact: true }).click();
      await waitDraw(browser.page, 1, 30);
      await browser.page.waitForFunction(() => window.oct03RenderObservation.pendingCovers === 2);
      assert.equal(await browser.page.locator("canvas").first().evaluate(canvas => canvas.style.cursor), "crosshair");
      assertReleased((await snapshot(browser.page)).contexts[0]);
      await browser.page.locator("canvas").first().click({ position: { x: 200, y: 200 } });
      await browser.page.waitForFunction(() => document.pointerLockElement instanceof HTMLCanvasElement);
      const beforeMovement = (await snapshot(browser.page)).contexts[1].viewMatrix;
      assert.equal(beforeMovement.length, 16);
      await browser.page.keyboard.down("w");
      await frames(browser.page, 5);
      const moving = (await snapshot(browser.page)).contexts[1].viewMatrix;
      assert.notDeepEqual(moving, beforeMovement, "Actual first-person view must respond to held W");
      await browser.page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await frames(browser.page);
      const stopped = (await snapshot(browser.page)).contexts[1].viewMatrix;
      await frames(browser.page, 5);
      assert.deepEqual((await snapshot(browser.page)).contexts[1].viewMatrix, stopped, "Held W must no longer move the real camera after blur");
      await browser.page.keyboard.up("w");
      await browser.page.evaluate(() => document.exitPointerLock());
      await browser.page.evaluate(() => window.oct03ReleaseCover(0));
      await frames(browser.page);
      assert.equal(coverRequests, 0, "A disposed renderer's genuine encoded cover must not upload");
      textureGate.resolve();
      await browser.page.waitForFunction(() => window.oct03RenderObservation.contexts[1].liveTextures > 5);
      assertReleased((await snapshot(browser.page)).contexts[0]);
      await Promise.all([
        browser.page.waitForResponse(response => response.url().includes("/oss/uploads/presign") && response.status() === 200),
        browser.page.evaluate(() => window.oct03ReleaseCover(1)),
      ]);
      assert.equal(coverRequests, 1, "The active renderer's genuine cover still completes");
      return { samples: await snapshot(browser.page), textureRequests, coverRequests, blurMatrixStable: true, firstPersonPreserved: true, nativeEncodedCovers: 2, discardedLateCover: 1 };
    } finally { textureGate.resolve(); await saveDiagnostic("production-first-person-and-late-resources", browser.page); await browser.close(); }
  });
});

test("OCT03 DB001 a stationary production scene stops idle GPU submission and redraws camera and resize changes", { timeout: 60_000 }, async (context) => {
  await runAcceptance("production-stationary-rendering", ["OCT03-DB-001"], context.signal, async () => {
    const browser = await scopedPage(provider("oct03-render-idle", 30), context.signal);
    try {
      await observeNativeRendering(browser.page);
      await browser.page.goto(`${fixture.origin}/blueprints/oct03-render-idle`, { waitUntil: "domcontentloaded" });
      await waitDraw(browser.page, 0, 30);
      await browser.page.waitForFunction(() => window.oct03RenderObservation.contexts[0].liveTextures > 5);
      await frames(browser.page, 8);
      const settled = (await snapshot(browser.page)).contexts[0];
      await frames(browser.page, 8);
      const idle = (await snapshot(browser.page)).contexts[0];
      assert.deepEqual(idle.viewMatrix, settled.viewMatrix, "The real native scene camera is stationary");
      assert.equal(idle.instancedDraws, settled.instancedDraws, "An unchanged production scene must not repeatedly submit its instance meshes");
      await browser.page.locator("canvas").first().scrollIntoViewIfNeeded();
      const box = await browser.page.locator("canvas").first().boundingBox();
      assert.ok(box);
      assert.equal(await browser.page.evaluate(({ x, y }) => document.elementFromPoint(x, y) instanceof HTMLCanvasElement, { x: box.x + box.width / 2, y: box.y + box.height / 2 }), true, "The actual orbit pointer must hit the production canvas inside the viewport");
      await browser.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await browser.page.mouse.down();
      await browser.page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 3 });
      await browser.page.mouse.up();
      await browser.page.waitForFunction(previous => window.oct03RenderObservation.contexts[0].viewMatrix.some((value, index) => value !== previous[index]), idle.viewMatrix);
      const moved = (await snapshot(browser.page)).contexts[0];
      assert.ok(moved.instancedDraws > idle.instancedDraws, "Actual orbit input must redraw the native scene");
      await frames(browser.page, 240);
      const damped = (await snapshot(browser.page)).contexts[0];
      await frames(browser.page, 8);
      const rest = (await snapshot(browser.page)).contexts[0];
      assert.deepEqual(rest.viewMatrix, damped.viewMatrix, "Orbit damping reaches a stationary camera");
      assert.equal(rest.instancedDraws, damped.instancedDraws, "Damping must finish without idle resubmission");
      await browser.page.setViewportSize({ width: 480, height: 900 });
      await waitDraw(browser.page, 0, 30, rest.instancedDraws);
      const resized = (await snapshot(browser.page)).contexts[0];
      assert.deepEqual(resized.errors, []);
      return { blocks: 30, idleFrames: 8, idleDrawDelta: idle.instancedDraws - settled.instancedDraws, orbitInputRedrew: true, dampingFrames: 240, resizeRedrew: true, contexts: [resized] };
    } finally { await saveDiagnostic("production-stationary-rendering", browser.page); await browser.close(); }
  });
});

test("PERF070 production unfinished load aborts on unmount and ignores late native PNG and model responses", { timeout: 60_000 }, async (context) => {
  await runAcceptance("production-unfinished-load-cancellation", ["PERF-070"], context.signal, async () => {
    const textureGate = Promise.withResolvers<void>();
    const modelGate = Promise.withResolvers<void>();
    const textureStarted = Promise.withResolvers<void>();
    const modelStarted = Promise.withResolvers<void>();
    let textureRequests = 0;
    let modelRequests = 0;
    let cancelledModelRequests = 0;
    const browser = await scopedPage(provider("oct03-render-cancel", 30, {
      textureGate: textureGate.promise,
      onTexture: () => { textureRequests++; textureStarted.resolve(); },
      pendingModel: { gate: modelGate.promise, onRequest: () => { modelRequests++; modelStarted.resolve(); } },
    }), context.signal);
    try {
      await observeNativeRendering(browser.page);
      // Ordinary block PNG loading is fire-and-forget. Holding a second real
      // state model keeps buildStructureScene/load genuinely unfinished while
      // the first state's native ImageLoader owns an outstanding PNG request.
      await browser.page.addInitScript(() => {
        window.oct03MarkerImagesLoaded = 0;
        const add = HTMLImageElement.prototype.addEventListener;
        HTMLImageElement.prototype.addEventListener = function (...args: Parameters<typeof add>) {
          if (args[0] === "load") {
            Reflect.apply(add, this, ["load", () => {
              if (new URL(this.currentSrc || this.src, location.href).searchParams.get("path") === "assets/audit/textures/block/marker.png") window.oct03MarkerImagesLoaded++;
            }, { once: true }]);
          }
          return Reflect.apply(add, this, args);
        };
      });
      browser.page.on("requestfailed", request => {
        if (new URL(request.url()).searchParams.get("path") === "assets/audit/models/block/waiting.json") cancelledModelRequests++;
      });
      await browser.page.goto(`${fixture.origin}/blueprints/oct03-render-cancel`, { waitUntil: "domcontentloaded" });
      await Promise.all([textureStarted.promise, modelStarted.promise]);
      await browser.page.getByRole("status").filter({ hasText: /Building/ }).waitFor();
      await frames(browser.page, 8);
      const pending = await snapshot(browser.page);
      assert.equal(pending.contexts.length, 1, "A real renderer exists before cancellation");
      assert.equal(pending.contexts[0].instancedDraws, 0, "The held model keeps production load unfinished");
      assert.equal(pending.encodedCovers, 0, "onLoaded/capture must not run while scene building is unfinished");
      assert.equal(await browser.page.evaluate(() => window.oct03MarkerImagesLoaded), 0);
      await browser.page.locator('a[href^="/login"]').first().press("Enter");
      // The original document intentionally still owns a held PNG request.
      // Observe route/DOM readiness; its load event is not an unmount signal.
      await browser.page.waitForURL("**/login?**", { waitUntil: "domcontentloaded" });
      await browser.page.locator("canvas").waitFor({ state: "detached" });
      await frames(browser.page);
      const unmounted = await snapshot(browser.page);
      const imageReadsAtUnmount = await browser.page.evaluate(() => window.oct03OpaqueProbeReads);
      unmounted.contexts.forEach(assertReleased);
      textureGate.resolve();
      modelGate.resolve();
      await browser.page.waitForFunction(() => window.oct03MarkerImagesLoaded === 1);
      await frames(browser.page, 8);
      const late = await snapshot(browser.page);
      assert.equal(textureRequests, 1);
      assert.equal(modelRequests, 1);
      assert.equal(cancelledModelRequests, 1, "The actual in-flight model fetch must observe the unmount AbortSignal");
      assert.equal(late.contexts.length, 1, "Late responses must not create a replacement renderer");
      assert.equal(late.contexts[0].instancedDraws, 0, "Late responses must not install or draw a disposed scene");
      assert.equal(late.encodedCovers, 0, "Late load completion must not capture a cover");
      assert.deepEqual(late.contexts[0].created, unmounted.contexts[0].created, "Late PNG decoding must not allocate native GPU resources on the disposed renderer");
      assert.equal(await browser.page.evaluate(() => window.oct03OpaqueProbeReads), imageReadsAtUnmount, "A disposed material must not read pixels or allocate an optimization canvas for a late PNG");
      late.contexts.forEach(assertReleased);
      return { blocks: 30, states: 2, genuinelyUnfinishedLoad: true, textureRequests, modelRequests, cancelledModelRequests, nativeImageLoadsAfterUnmount: 1, beforeCancel: pending, afterUnmount: unmounted, afterLateResponses: late, boundary: "Async model fetch plus native PNG completion; does not claim interruption of synchronous CPU parsing or physical driver memory reclamation" };
    } finally { textureGate.resolve(); modelGate.resolve(); await saveDiagnostic("production-unfinished-load-cancellation", browser.page); await browser.close(); }
  });
});

test("OCT03 DB002 flat faces retain front/back visibility and PNG transparency in native production rendering", { timeout: 60_000 }, async (context) => {
  await runAcceptance("production-flat-face-two-sides-and-alpha", ["OCT03-DB-002"], context.signal, async () => {
    const rgba = Buffer.alloc(4 * 4 * 4);
    for (let index = 0; index < 16; index++) {
      rgba.set([38, 176, 71, index % 4 < 2 ? 128 : 0], index * 4);
    }
    const patterned = await sharp(rgba, { raw: { width: 4, height: 4, channels: 4 } }).png().toBuffer();
    const solid = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 38, g: 176, b: 71, alpha: 1 } } }).png().toBuffer();
    const blank = await sharp(Buffer.alloc(rgba.length), { raw: { width: 4, height: 4, channels: 4 } }).png().toBuffer();
    const images: Buffer[] = [];
    let imageWidth = 0;
    const samples: Array<{ side: string; greenPixels: number; imageSHA256: string }> = [];
    for (const side of ["up", "down", "solid", "blank"] as const) {
      const publicId = `oct03-flat-${side}`;
      const base = provider(publicId, 1);
      const browser = await scopedPage(async request => {
        if (request.path === `/api/v1/blueprints/${publicId}/render`) return {
          bytes: Buffer.from(JSON.stringify({ size: [1, 1, 1], blocks: [{ position: [0, 0, 0], state: { id: "audit:marker" } }] })), contentType: "application/json",
        };
        if (request.url.searchParams.get("path") === assetPaths[1]) return {
          bytes: Buffer.from(JSON.stringify({ textures: { surface: "audit:block/marker" }, elements: [{ from: [0, 8, 0], to: [16, 8, 16], faces: { [side === "down" ? "down" : "up"]: { texture: "#surface", uv: [0, 0, 16, 16], rotation: side === "down" ? 180 : 0 } } }] })), contentType: "application/json",
        };
        if (request.url.searchParams.get("path") === assetPaths[2]) return { bytes: side === "blank" ? blank : side === "solid" ? solid : patterned, contentType: "image/png" };
        return base(request);
      }, context.signal);
      try {
        await observeNativeRendering(browser.page);
        await browser.page.goto(`${fixture.origin}/blueprints/${publicId}`, { waitUntil: "domcontentloaded" });
        await waitDraw(browser.page, 0, 1);
        await browser.page.waitForFunction(() => window.oct03RenderObservation.contexts[0].liveTextures > 5);
        await frames(browser.page, 8);
        assertFlatFacePassCount((await snapshot(browser.page)).contexts[0], 1, side === "solid" ? 1 : 2);
        const nativePNG = await browser.page.locator("canvas").first().screenshot();
        if (process.env.MCMODS_RENDER_ACCEPTANCE_REPORT) await writeFile(`${process.env.MCMODS_RENDER_ACCEPTANCE_REPORT}.flat-${side}.png`, nativePNG);
        const { data, info } = await sharp(nativePNG).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        assert.equal(info.channels, 3);
        if (imageWidth) assert.equal(info.width, imageWidth);
        imageWidth = info.width;
        let greenPixels = 0;
        for (let offset = 0; offset < data.length; offset += 3) {
          if (data[offset + 1] > data[offset] * 1.7 && data[offset + 1] > data[offset + 2] * 1.7) greenPixels++;
        }
        if (side !== "blank") assert.ok(greenPixels > 100, "The colored part of the real flat face must be visible from either winding");
        images.push(data);
        samples.push({ side, greenPixels, imageSHA256: createHash("sha256").update(nativePNG).digest("hex") });
        assert.deepEqual((await snapshot(browser.page)).contexts[0].errors, []);
      } finally { await browser.close(); }
    }
    diagnostics["production-flat-face-two-sides-and-alpha"] = { samples };
    assert.equal(images[0].length, images[1].length);
    let maximumChannelDifference = 0;
    for (let offset = 0; offset < images[0].length; offset++) maximumChannelDifference = Math.max(maximumChannelDifference, Math.abs(images[0][offset] - images[1][offset]));
    // Opposite triangle winding may round a texel boundary by one raster pixel.
    // Check interior pixels exactly; permit differences only at that boundary.
    const hasPattern = (offset: number) => [0, 1, 2].some(channel => Math.abs(images[0][offset + channel] - images[3][offset + channel]) > 5);
    let differingBoundaryPixels = 0;
    for (let offset = 0; offset < images[0].length; offset += 3) {
      if (![0, 1, 2].some(channel => Math.abs(images[0][offset + channel] - images[1][offset + channel]) > 2)) continue;
      const x = (offset / 3) % imageWidth;
      const y = Math.floor(offset / 3 / imageWidth);
      const neighborhood = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const neighbor = ((y + dy) * imageWidth + x + dx) * 3;
        if (x + dx >= 0 && x + dx < imageWidth && neighbor >= 0 && neighbor < images[0].length) neighborhood.push(hasPattern(neighbor));
      }
      assert.ok(neighborhood.includes(true) && neighborhood.includes(false), "Opposite winding must preserve every interior pixel; differences belong only to a texel edge");
      differingBoundaryPixels++;
    }
    assert.ok(differingBoundaryPixels <= 8, "A winding change must not alter a material region or hide one side");
    let solidChangedPixels = 0;
    let patternChangedPixels = 0;
    let blendedPixels = 0;
    for (let offset = 0; offset < images[0].length; offset += 3) {
      const changed = (image: Buffer) => [0, 1, 2].some(channel => Math.abs(image[offset + channel] - images[3][offset + channel]) > 5);
      if (changed(images[2])) solidChangedPixels++;
      if (changed(images[0])) patternChangedPixels++;
      const green = offset + 1;
      if (images[0][green] > images[3][green] + 5 && images[0][green] < images[2][green] - 5) blendedPixels++;
    }
    assert.ok(patternChangedPixels > 100 && patternChangedPixels < solidChangedPixels - 100, "Transparent texels must leave part of the underlying real grid/background visible");
    assert.ok(blendedPixels > 100, "Half-alpha texels must blend between the blank and opaque native images");
    return { samples, maximumChannelDifference, differingBoundaryPixels, patternChangedPixels, solidChangedPixels, blendedPixels, boundary: "Native canvas PNG pixels with opposite quad windings, half-transparent and fully transparent texels; synthetic transports, no physical GPU claim" };
  });
});

test("OCT03 DB002 unreadable and oversized opaque textures keep native two-pass rendering", { timeout: 60_000 }, async (context) => {
  await runAcceptance("production-flat-face-optimization-fallback", ["OCT03-DB-002"], context.signal, async () => {
    const widePNG = await sharp({ create: { width: 257, height: 4, channels: 4, background: { r: 38, g: 176, b: 71, alpha: 1 } } }).png().toBuffer();
    const samples = [];
    for (const mode of ["unreadable", "oversized"] as const) {
      const publicId = `oct03-flat-fallback-${mode}`;
      const base = provider(publicId, 30);
      const browser = await scopedPage(request => {
        if (mode === "oversized" && request.url.searchParams.get("path") === assetPaths[2]) return { bytes: widePNG, contentType: "image/png" };
        return base(request);
      }, context.signal);
      try {
        await observeNativeRendering(browser.page);
        await browser.page.addInitScript(mode => {
          window.oct03OpaqueProbeReads = 0;
          const original = CanvasRenderingContext2D.prototype.getImageData;
          CanvasRenderingContext2D.prototype.getImageData = function (...args: Parameters<typeof original>) {
            window.oct03OpaqueProbeReads++;
            if (mode === "unreadable") throw new DOMException("Synthetic local image-read permission denial", "SecurityError");
            return Reflect.apply(original, this, args);
          };
        }, mode);
        await browser.page.goto(`${fixture.origin}/blueprints/${publicId}`, { waitUntil: "domcontentloaded" });
        await waitDraw(browser.page, 0, 30);
        await browser.page.waitForFunction(() => window.oct03RenderObservation.contexts[0].liveTextures > 5);
        await frames(browser.page, 8);
        const record = (await snapshot(browser.page)).contexts[0];
        assertFlatFacePassCount(record, 30, 2);
        const reads = await browser.page.evaluate(() => window.oct03OpaqueProbeReads);
        assert.equal(reads, mode === "unreadable" ? 1 : 0, "Image-read failure falls back once; oversized images must not allocate a probe pixel array");
        assert.deepEqual(record.errors, []);
        assert.equal(await browser.page.getByRole("alert").filter({ hasText: "The 3D preview could not be rendered." }).count(), 0);
        samples.push({ mode, imageReads: reads, realNativePasses: 2 });
      } finally { await browser.close(); }
    }
    return { samples, boundary: "Real loaded PNG and native rendering; unreadable mode injects a local 2D read SecurityError, oversized mode uses a genuine257px PNG; no actual cross-origin policy claim" };
  });
});
