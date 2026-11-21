import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type BrowserContext } from "playwright";
import { unzipSync } from "fflate";
import sharp from "sharp";

test("LIVE-GAME-20261024 unchanged supported game package -> browser upload -> JetStream business Worker -> independent review -> public recipe and decoded pixels", { timeout: 240_000 }, async () => {
  const runtimePath = process.env.MCMODS_AUDIT_JOURNEY_RUNTIME;
  assert(runtimePath, "Set MCMODS_AUDIT_JOURNEY_RUNTIME to the owned fixture runtime JSON");
  const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
  const directory = dirname(runtimePath);
  const runId = String(Date.now());
  const reportPath = join(directory, `browser-journey-${runId}.json`);
  const authPath = resolve(runtime.authPath);
  assert(authPath.startsWith(`${resolve(directory)}/`), "Synthetic credentials must stay in this owned fixture directory");
  const auth = JSON.parse(await readFile(authPath, "utf8")) as { creatorToken: string; reviewerToken: string };
  const backend = new URL(runtime.apiOrigin);
  const frontend = new URL(runtime.frontendOrigin);
  const oss = new URL(runtime.ossOrigin);
  for (const origin of [backend, frontend, oss]) assert(origin.hostname === "127.0.0.1" && origin.protocol === "http:" && !origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash, "Use only the owned local HTTP services");
  const config = await fetch(new URL("/authentication-write-config", frontend), { redirect: "error", signal: AbortSignal.timeout(10_000) });
  assert.equal(config.status, 200);
  const { apiBaseURL } = await config.json();
  assert.equal(typeof apiBaseURL, "string");
  const api = new URL(apiBaseURL);
  assert([backend.href, frontend.href].includes(api.href), "The frontend must use the owned backend or its same-origin gateway");
  const source = await readFile(runtime.samplePath);
  const sampleHash = createHash("sha256").update(source).digest("hex");
  assert.equal(sampleHash, runtime.sampleSha256);
  const sourceEntries = unzipSync(source);
  const report: Record<string, unknown> = { caseId: "LIVE-GAME-20261024", runId, startedAt: new Date().toISOString(), status: "IN_PROGRESS", sampleSha256: sampleHash, sampleBytes: source.length, runtimeRevisions: runtime.repoRevisions, frontendCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), boundary: runtime.fixtureScope, authenticatedSessionSetup: "Owned fixture's valid synthetic HttpOnly mcmods_session cookie; actual API /auth/me verifies role; login UI not part of this journey", milestones: [], traffic: [], imageEvidence: [], apiInterception: false };
  const milestones = report.milestones as unknown[];
  const traffic = report.traffic as unknown[];
  const images = report.imageEvidence as unknown[];
  report.apiTopology = api.origin === frontend.origin ? "same-origin gateway" : "direct loopback backend";
  const browser = await chromium.launch({ headless: true });
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  async function context(token?: string) {
    const context = await browser.newContext({ locale: "en-US", serviceWorkers: "block" });
    contexts.push(context);
    await context.addCookies([{ name: "mcmods-ui-locale", value: "en-US", url: frontend.origin }]);
    if (token) await context.addCookies([{ name: "mcmods_session", value: token, url: api.origin, httpOnly: true, sameSite: "Lax" }]);
    // No application/API/OSS transport is replaced. Unrelated external media
    // stays outside the owned acceptance environment.
    await context.route(url => ![api.origin, frontend.origin, oss.origin].includes(url.origin), route => route.abort());
    return context;
  }
  async function get(context: BrowserContext, path: string) {
    const response = await context.request.get(`${api.origin}${path}`);
    const json = await response.json();
    assert.equal(response.status(), 200, `${path}: ${json.code || json.error || response.status()}`);
    assert.notEqual(json.data, undefined, `${path} must return the actual API data envelope`);
    return json.data;
  }
  try {
    const creator = await context(auth.creatorToken);
    const creatorIdentity = await get(creator, "/api/v1/auth/me");
    assert(!creatorIdentity.permissionRules?.some((rule: { allow: boolean; code: string }) => rule.allow && ["*", "admin.*"].includes(rule.code)), "Creator must use ordinary scoped authority");
    report.creatorId = creatorIdentity.id;
    const page = await creator.newPage();
    page.setDefaultTimeout(20_000);
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => {
      const url = new URL(response.url());
      if (url.origin === api.origin && url.pathname.startsWith("/api/")) traffic.push({ method: response.request().method(), path: url.pathname, status: response.status() });
    });
    await page.goto(`${frontend.origin}/mods/${encodeURIComponent(runtime.projectSiteId)}/data/edit?import=exporter&version=${encodeURIComponent(runtime.targetVersionPublicId)}`);
    await page.getByRole("heading", { name: "Edit or import mod data", exact: true }).waitFor();
    const fileInput = page.locator('input[type="file"][accept=".zip,application/zip"]:visible').first();
    await fileInput.waitFor();
    const createJobPath = `/api/v1/mods/${encodeURIComponent(runtime.projectSiteId)}/export-imports`;
    const created = page.waitForResponse(response => new URL(response.url()).pathname === createJobPath && response.request().method() === "POST", { timeout: 60_000 });
    await fileInput.setInputFiles(runtime.samplePath);
    const jobResponse = await created;
    const jobEnvelope = await jobResponse.json();
    assert.equal(jobResponse.status(), 202, `Actual upload job creation must succeed: ${jobEnvelope.code || jobEnvelope.error || "unexpected status"}`);
    const jobId = jobEnvelope.data.id;
    assert(jobId);
    report.jobId = jobId;
    milestones.push({ stage: "browser_upload_created_actual_job", jobId, time: new Date().toISOString() });
    let completed: Record<string, unknown> | undefined;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const job = await get(creator, `${createJobPath}/${encodeURIComponent(jobId)}`);
      if (["ready", "partial", "failed", "confirmation_required", "cancelled"].includes(job.status)) { completed = job; break; }
      await delay(250);
    }
    assert(completed, "The actual queued job must finish within the bounded observation");
    report.jobFinal = { id: jobId, status: completed.status, progress: completed.progress, errorCode: completed.errorCode };
    assert.equal(completed.status, "ready", `Import must be fully ready, observed ${completed.status}/${completed.errorCode}`);
    await page.screenshot({ path: join(directory, "browser-upload-ready.png"), fullPage: true });
    milestones.push({ stage: "actual_worker_ready", jobId, time: new Date().toISOString() });

    const reviewer = await context(auth.reviewerToken);
    const reviewerIdentity = await get(reviewer, "/api/v1/auth/me");
    assert.notEqual(reviewerIdentity.id, creatorIdentity.id);
    assert(!reviewerIdentity.permissionRules?.some((rule: { allow: boolean; code: string }) => rule.allow && ["*", "admin.*"].includes(rule.code)), "Independent reviewer must use explicit review authority");
    report.reviewerId = reviewerIdentity.id;
    // Review text search covers display fields; a site slug is not a supported search key.
    // Bind the actual returned revision to its public project identity below.
    const queue = await get(reviewer, "/api/v1/reviews/content?limit=100");
    const reviewItem = queue.items.find((item: { source: string; projectId: string }) => item.source === "export" && item.projectId === runtime.projectPublicId);
    assert(reviewItem, "Actual review queue must contain the browser-created import revision");
    report.revisionId = reviewItem.id;
    const detail = await get(reviewer, `/api/v1/export-revisions/${encodeURIComponent(reviewItem.id)}`);
    assert.equal(detail.package.sha256, sampleHash);
    assert.equal(detail.targetVersionPublicId, runtime.targetVersionPublicId);
    assert.equal(detail.namespace, runtime.namespace);
    assert.equal(detail.canReview, true);
    assert(detail.counts.resources > 0);
    const anonymous = await context();
    assert.equal((await anonymous.request.get(`${api.origin}/api/v1/export-revisions/${encodeURIComponent(reviewItem.id)}`)).status(), 403, "Pending revision must remain unavailable anonymously");
    const reviewPage = await reviewer.newPage();
    reviewPage.setDefaultTimeout(20_000);
    reviewPage.on("pageerror", error => errors.push(error.message));
    await reviewPage.goto(`${frontend.origin}/reviews`);
    const history = reviewPage.locator(`a[href*="importRevisionId=${reviewItem.id}"]`);
    await history.waitFor();
    await history.click();
    await reviewPage.getByText(sampleHash, { exact: true }).waitFor();
    await reviewPage.screenshot({ path: join(directory, "browser-independent-import-history.png"), fullPage: true });
    await reviewPage.goto(`${frontend.origin}/reviews`);
    const card = reviewPage.locator("article").filter({ has: reviewPage.locator(`a[href*="importRevisionId=${reviewItem.id}"]`) });
    const reviewPath = new URL(reviewItem.reviewUrl, api.origin).pathname;
    const reviewed = reviewPage.waitForResponse(response => new URL(response.url()).pathname === reviewPath && response.request().method() === "PATCH");
    await card.getByRole("button", { name: "Approve", exact: true }).click();
    const reviewResponse = await reviewed;
    assert.equal(reviewResponse.status(), 200, "Independent browser review must commit successfully");
    const active = await get(anonymous, `/api/v1/export-revisions/${encodeURIComponent(reviewItem.id)}`);
    assert.equal(active.isActive, true);
    milestones.push({ stage: "independent_browser_review_committed", revisionId: reviewItem.id, time: new Date().toISOString() });

    const types = await get(anonymous, "/api/v1/recipe-types?canonicalId=minecraft%3Acrafting&limit=100");
    const type = types.items.find((item: { canonicalId: string }) => item.canonicalId === "minecraft:crafting");
    assert(type, "Published actual JEI type must be visible anonymously");
    const catalog = await get(anonymous, `/api/v1/recipe-types/${encodeURIComponent(type.publicId)}/catalog?limit=100`);
    const recipe = catalog.recipes.find((item: { modSiteId: string; recipeId: string }) => item.modSiteId === runtime.projectSiteId || item.recipeId.startsWith("auditfixture:"));
    assert(recipe, "Published recipe must belong to the actual imported sample");
    report.recipePublicId = recipe.publicId;
    const publicPage = await anonymous.newPage();
    publicPage.setDefaultTimeout(20_000);
    publicPage.on("pageerror", error => errors.push(error.message));
    await publicPage.goto(`${frontend.origin}/recipe-types?recipePublicId=${encodeURIComponent(recipe.publicId)}`);
    const cardSelector = `#recipe-${recipe.publicId}`;
    await publicPage.locator(cardSelector).waitFor();
    const visibleImages = publicPage.locator(`${cardSelector} img`);
    assert(await visibleImages.count() > 0, "Public actual recipe must reference its exported image assets");
    for (const image of await visibleImages.all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(async node => { const image = node as HTMLImageElement; if (!image.complete) await new Promise<void>((resolve, reject) => { image.addEventListener("load", () => resolve(), { once: true }); image.addEventListener("error", () => reject(new Error("Actual public asset did not decode")), { once: true }); }); });
      const decoded = await image.evaluate(node => ({ width: (node as HTMLImageElement).naturalWidth, height: (node as HTMLImageElement).naturalHeight, src: (node as HTMLImageElement).src }));
      assert(decoded.width > 0 && decoded.height > 0, "Browser must decode actual exported pixels");
      const url = new URL(decoded.src);
      assert.equal(url.origin, api.origin);
      const assetPath = url.searchParams.get("path");
      assert(assetPath && sourceEntries[assetPath], "Visible image must be a named original game artifact");
      const response = await anonymous.request.get(decoded.src);
      assert.equal(response.status(), 200);
      const bytes = await response.body();
      const [expected, actual] = await Promise.all([sharp(sourceEntries[assetPath]).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })]);
      assert.equal(actual.info.width, expected.info.width);
      assert.equal(actual.info.height, expected.info.height);
      assert.deepEqual(actual.data, expected.data, "Pixels and transparency must survive persistence/minimization");
      images.push({ path: assetPath, width: decoded.width, height: decoded.height, actualSha256: createHash("sha256").update(bytes).digest("hex"), sourceSha256: createHash("sha256").update(sourceEntries[assetPath]).digest("hex"), decodedRGBAEqual: true });
    }
    await publicPage.screenshot({ path: join(directory, "browser-anonymous-actual-recipe.png"), fullPage: true });
    milestones.push({ stage: "anonymous_frontend_recipe_and_source_pixels_verified", recipePublicId: recipe.publicId, time: new Date().toISOString() });
    assert.deepEqual(errors, [], "Actual React applications must not throw");
    report.status = "BROWSER_CHAIN_PASS_PENDING_DATABASE_QUEUE_POSTCONDITION_REVIEW";
  } catch (error) {
    report.status = "FAIL";
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    report.reactErrors = errors;
    await mkdir(directory, { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    await writeFile(join(directory, "browser-journey-latest.json"), JSON.stringify({ runId, reportPath, status: report.status }, null, 2));
    for (const context of contexts) await context.close();
    await browser.close();
    console.log("Live game journey evidence saved", reportPath, "status", report.status);
  }
});
