import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import * as THREE from "three";
import ts from "typescript";

const dataModule = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

// Exercise the production effect; only hooks, texture transport and GPU/browser
// boundaries are controlled. Texture.dispose is the real Three lifecycle event.
async function startPreview() {
  const key = `skin-preview-${crypto.randomUUID()}`;
  const effects: Array<() => void | (() => void)> = [];
  const skin = Promise.withResolvers<THREE.Texture>();
  const cape = Promise.withResolvers<THREE.Texture>();
  const host = { clientWidth: 320, clientHeight: 320, appendChild() {} };
  Reflect.set(globalThis, key, { effects, host, skin, cape });
  const hooks = dataModule(`const f=globalThis[${JSON.stringify(key)}];export const useEffect=(fn)=>f.effects.push(fn);export const useRef=(value)=>({current:value===null?f.host:value});export const useState=(value)=>[value,()=>{}];`);
  const three = dataModule(`export * from ${JSON.stringify(import.meta.resolve("three"))};const f=globalThis[${JSON.stringify(key)}];export class WebGLRenderer{domElement={remove(){}};setPixelRatio(){}setClearColor(){}setSize(){}render(){}dispose(){}};export class TextureLoader{loadAsync(url){return f[url].promise;}};`);
  const controls = dataModule("export class OrbitControls{target={set(){}};update(){}dispose(){}};");
  const i18n = dataModule("export const useI18n=()=>({t:(key)=>key});");
  const url = new URL("../../components/minecraft-skin/SkinViewerCanvas.tsx", import.meta.url);
  const source = (await readFile(url, "utf8"))
    .replace('from "react"', `from ${JSON.stringify(hooks)}`)
    .replace('from "three"', `from ${JSON.stringify(three)}`)
    .replace('from "three/examples/jsm/controls/OrbitControls.js"', `from ${JSON.stringify(controls)}`)
    .replace('from "@/app/_lib/i18n-provider"', `from ${JSON.stringify(i18n)}`);
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    .replace('from "react/jsx-runtime"', `from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`);
  const original = new Map<string, unknown>();
  for (const [name, value] of Object.entries({ window: { devicePixelRatio: 1 }, ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: (): number => 1, cancelAnimationFrame: () => {} })) {
    original.set(name, Reflect.get(globalThis, name));
    Reflect.set(globalThis, name, value);
  }
  try {
    const { SkinViewerCanvas } = await import(dataModule(output));
    SkinViewerCanvas({ skinUrl: "skin", capeUrl: "cape" });
    const cleanups = effects.map((effect) => effect());
    return { skin, cape, close() {
      for (const cleanup of cleanups) cleanup?.();
      for (const [name, value] of original) {
        if (value === undefined) Reflect.deleteProperty(globalThis, name); else Reflect.set(globalThis, name, value);
      }
      Reflect.deleteProperty(globalThis, key);
    } };
  } catch (error) {
    for (const [name, value] of original) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name); else Reflect.set(globalThis, name, value);
    }
    Reflect.deleteProperty(globalThis, key);
    throw error;
  }
}

for (const late of [false, true]) test(`failed appearance pair releases ${late ? "late" : "already loaded"} texture without waiting for unmount`, async () => {
  const preview = await startPreview();
  const texture = new THREE.Texture();
  let disposals = 0;
  texture.addEventListener("dispose", () => disposals++);
  try {
    if (late) { preview.cape.reject(new Error("Synthetic cape unavailable")); await setImmediate(); }
    preview.skin.resolve(texture);
    await setImmediate();
    if (!late) { preview.cape.reject(new Error("Synthetic cape unavailable")); await setImmediate(); }
    assert.equal(disposals, 1);
  } finally { preview.close(); }
  assert.equal(disposals, 1, "unmount must not dispose the same texture twice");
});
