import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { defaultMetadataSiteName, normalizeMetadataSiteName } from "./site-brand-metadata.mts";

const layout = await readFile(new URL("../layout.tsx", import.meta.url), "utf8");
const provider = await readFile(new URL("../_components/site-brand-provider.tsx", import.meta.url), "utf8");

test("root metadata composes page titles with the current site brand", () => {
  assert.match(layout, /export async function generateMetadata/);
  assert.match(layout, /default: siteName/);
  assert.match(layout, /template: `\%s \| \$\{siteName\}`/);
  assert.match(layout, /loadMetadataSiteName/);
  assert.equal(normalizeMetadataSiteName("  Example %s Site  "), "Example % s Site");
  assert.equal(normalizeMetadataSiteName(null), defaultMetadataSiteName);
});

test("client branding refreshes the supported Next boundary without owning document title", () => {
  assert.doesNotMatch(provider, /MutationObserver/);
  assert.doesNotMatch(provider, /document\.title/);
  assert.doesNotMatch(provider, /usePathname/);
  assert.match(provider, /useRouter/);
  assert.match(provider, /router\.refresh\(\)/);
});
