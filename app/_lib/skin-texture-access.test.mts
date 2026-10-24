import assert from "node:assert/strict";
import test from "node:test";
import { skinTextureCrossOrigin } from "./skin-texture-access.mts";

test("CMP-001 API texture previews carry the current cookie without enabling credentials for other providers", () => {
  assert.equal(skinTextureCrossOrigin("https://api.example.test/api/yggdrasil/textures/hash", "https://api.example.test"), "use-credentials");
  assert.equal(skinTextureCrossOrigin("/api/yggdrasil/textures/hash", "https://api.example.test"), "use-credentials");
  assert.equal(skinTextureCrossOrigin("http://127.0.0.1:8080/api/yggdrasil/textures/hash", "http://127.0.0.1:8080"), "use-credentials");
  for (const value of ["https://other.example.test/texture.png", "https://api.example.test.attacker.invalid/texture.png", "blob:https://www.example.test/preview", "data:image/png;base64,synthetic"]) assert.equal(skinTextureCrossOrigin(value, "https://api.example.test"), "anonymous");
});
