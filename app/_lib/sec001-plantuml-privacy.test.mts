import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { defaultMarkdownConfig, normalizeMarkdownConfig } from "./markdown-config.ts";
import { buildContentSecurityPolicy } from "./csp-policy.mts";

test("SEC-001 PlantUML defaults to disabled and a fixed same-origin proxy", () => {
  assert.equal(defaultMarkdownConfig.plantUML, false);
  assert.equal(defaultMarkdownConfig.plantUMLServer, "/plantuml");

  const legacy = normalizeMarkdownConfig({
    plantUML: true,
    plantUMLServer: "https://www.plantuml.com/plantuml",
  });
  assert.equal(legacy.plantUML, false);
  assert.equal(legacy.plantUMLServer, "/plantuml");

  const trusted = normalizeMarkdownConfig({ plantUML: true, plantUMLServer: "/plantuml/" });
  assert.equal(trusted.plantUML, true);
  assert.equal(trusted.plantUMLServer, "/plantuml");
});

test("SEC-001 browser surfaces contain no built-in public PlantUML egress", async () => {
  const [tool, renderer, admin, readme] = await Promise.all([
    readFile(new URL("../_components/tools-plantuml.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/markdown-renderer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/admin-console-infrastructure.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../README.md", import.meta.url), "utf8"),
  ]);
  const policy = buildContentSecurityPolicy({
    nonce: "sec001",
    production: true,
    apiBaseURL: "https://api.example.test",
  });

  for (const content of [tool, renderer, admin, policy]) {
    assert.doesNotMatch(content, /https?:\/\/(?:www\.)?plantuml\.com/i);
  }
  assert.match(tool, /PLANTUML_PROXY_PATH\}\/svg\//);
  assert.match(admin, /readOnly/);
  assert.match(readme, /\/plantuml/);
  assert.match(readme, /self-hosted|自建/);
});
