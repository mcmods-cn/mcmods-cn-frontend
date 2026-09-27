import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../_components/admin-unresolved-references.tsx", import.meta.url), "utf8");

test("unresolved reference administration uses bounded cursor pages", () => {
  assert.match(panel, /hasMore: boolean/);
  assert.match(panel, /nextCursor: string/);
  assert.match(panel, /cursorHistory/);
  assert.match(panel, /AbortController/);
  assert.doesNotMatch(panel, /total: number|offset: number|setPage\(|Math\.ceil\(result\.total|parameters\.set\("offset"/);
});

test("unresolved reference filters reset cursor scope and render current-page navigation", () => {
  assert.match(panel, /resetPagination/);
  assert.match(panel, /result\.nextCursor/);
  assert.match(panel, /common\.previous/);
  assert.match(panel, /common\.next/);
});

test("submitting the same unresolved-reference search starts a fresh request generation", () => {
  assert.match(panel, /const \[requestVersion, setRequestVersion\] = useState\(0\)/);
  assert.match(panel, /setRequestVersion\(\(current\) => current \+ 1\)/);
  assert.match(panel, /function search\(event: FormEvent\)[\s\S]*?resetPagination\(\);[\s\S]*?setSubmittedQuery\(query\.trim\(\)\)/);
  assert.match(panel, /\[cursor, requestVersion, status, submittedQuery, token, type\]/);
  assert.match(panel, /\.finally\(\(\) => \{ if \(active\) setLoading\(false\); \}\)/);
});

test("an empty cursor page keeps its real previous-page recovery path", () => {
  assert.match(panel, /disabled=\{loading \|\| cursorHistory\.length === 0\}/);
  assert.match(panel, /const previousCursor = history\.pop\(\) \|\| ""/);
  assert.doesNotMatch(panel, /!result\.items\.length[^\n]*common\.previous|result\.total/);
});

test("list and authoritative-type failures remain visible without replacing the last good page", () => {
	assert.match(panel, /setError\(reason instanceof Error \? reason\.message : String\(reason\)\)/);
	assert.match(panel, /setReferenceTypesError\(reason instanceof Error \? reason\.message : String\(reason\)\)/);
	assert.match(panel, /\{error \? <p[^>]+role="alert">\{error\}<\/p> : null\}/);
	assert.match(panel, /\{referenceTypesError \? <p[^>]+role="alert">\{referenceTypesError\}<\/p> : null\}/);
	assert.doesNotMatch(panel, /\.catch\([^)]*\)\s*=>\s*setResult\(/);
});
