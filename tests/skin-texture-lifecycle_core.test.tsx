import { act, cleanup, render } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkinViewerCanvas } from "../components/minecraft-skin/SkinViewerCanvas";
vi.mock("../app/_lib/i18n-provider", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("three", async (original) => ({ ...await original<typeof import("three")>(), WebGLRenderer: class {
  domElement = document.createElement("canvas");
  setPixelRatio() {} setClearColor() {} setSize() {} render() {} dispose() {}
} }));
vi.mock("three/examples/jsm/controls/OrbitControls.js", () => ({ OrbitControls: class { target = { set() {} }; update() {} dispose() {} } }));
let frames: FrameRequestCallback[];
beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("skin texture ownership", () => {
  it("disposes a texture that resolves after its sibling has failed", async () => {
    let finish!: (texture: THREE.Texture<HTMLImageElement>) => void;
    vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation((url) => url === "skin"
      ? new Promise((resolve) => { finish = resolve; }) : Promise.reject(new Error("cape unavailable")));
    render(<SkinViewerCanvas skinUrl="skin" capeUrl="cape" />);
    await act(async () => { frames[0](0); await Promise.resolve(); });
    const texture = new THREE.Texture<HTMLImageElement>();
    const dispose = vi.spyOn(texture, "dispose");
    await act(async () => { finish(texture); await Promise.resolve(); });
    expect(dispose).toHaveBeenCalledTimes(1);
  });
  it("disposes a late texture after the viewer unmounts", async () => {
    let finish!: (texture: THREE.Texture<HTMLImageElement>) => void;
    vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const view = render(<SkinViewerCanvas skinUrl="skin" />);
    act(() => frames[0](0));
    view.unmount();
    const texture = new THREE.Texture<HTMLImageElement>();
    const dispose = vi.spyOn(texture, "dispose");
    await act(async () => { finish(texture); await Promise.resolve(); });
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
