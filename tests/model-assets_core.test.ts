// @vitest-environment jsdom
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMinecraftBlockModel, type AssetSource } from "../lib/mcmods-exporter/renderer";

afterEach(() => vi.restoreAllMocks());

describe("OBJ sidecar asset boundaries", () => {
  it("does not load an MTL texture that is absent from the revision asset index", async () => {
    const loadTexture = vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(() => new THREE.Texture());
    const source: AssetSource = {
      has: (assetPath) => ["assets/example/models/block/object.obj", "assets/example/models/block/object.mtl"].includes(assetPath),
      json: async <T,>(assetPath: string) => (assetPath.includes("blockstates/")
        ? { variants: { "": { model: "example:block/object" } } }
        : { loader: "forge:obj", model: "example:block/object.obj" }) as T,
      text: async (assetPath) => assetPath.endsWith(".mtl")
        ? "newmtl surface\nmap_Kd https://untrusted.invalid/tracker.png"
        : "mtllib object.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl surface\nf 1 2 3",
      url: () => undefined,
    };
    const model = await buildMinecraftBlockModel(source, "example:object");
    expect(model.children.length).toBeGreaterThan(0);
    expect(loadTexture).not.toHaveBeenCalled();
  });
});
