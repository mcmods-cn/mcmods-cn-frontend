import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIReply } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });
const stamp = "2026-10-02T00:00:00Z";

// Real UI and upload hashing/batch orchestration. Presign fixtures explicitly
// return existing synthetic files (uploadRequired=false), so these cases do not
// claim actual object-storage uploads, backend persistence or authorization.
for (const kind of ["creator", "project"] as const) test(`OCT02 ${kind} proof retry keeps uploaded file IDs and preserves failed application input`, { timeout: 30_000 }, async () => {
  const uploads: string[] = [];
  let applicationWrites = 0;
  const submitted = Promise.withResolvers<void>();
  const application = Promise.withResolvers<APIReply>();
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/auth/me") return { data: { id: "proofuser", username: "Synthetic applicant", email: "proof@example.invalid", roleCodes: [], permissionVersion: 1, rbacVersion: 1, permissionRules: [{ code: "project.editor.apply", allow: true, priority: 100 }] } };
    if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
    if (path === "/api/v1/stickers") return { data: { packs: [] } };
    if (path === "/api/v1/creator-roles") return { data: { items: [] } };
    if (path === "/api/v1/creators/proofauth") return { data: { creator: { publicId: "proofauth", kind: "author", name: "Synthetic author", claimed: false, reviewStatus: "approved" }, descriptionMarkdown: "", links: [], collaborators: [], members: [], teams: [], works: [], claimedUser: null, canEditProfile: false, canManageMembers: false, canCreateRoles: false, canClaim: true } };
    if (path === "/api/v1/blueprints/proofproj") return { data: { id: "proofproj", title: "Synthetic proof project", description: "", sourceFormat: "nbt", status: "ready", size: [1, 1, 1], blockCount: 0, paletteCount: 0, entityCount: 0, dataVersion: 1, lastError: "", createdAt: stamp, updatedAt: stamp, uploader: { id: "owneruser", username: "Synthetic owner" }, requiredMods: [], variants: [], materials: [], assetRevisions: [], canEdit: false, renderAvailable: false } };
    if (path === "/api/v1/content/proofproj") return { status: 404, error: "Synthetic content absent" };
    if (path === "/api/v1/users/me/favorites/summary") return { data: { entityPublicIds: [], collectionIds: [] } };
    if (path === "/api/v1/projects/proofproj/follow") return { data: { followed: false, notificationsEnabled: false } };
    if (path === "/api/v1/comment-targets/creator/proofauth/comments" || path === "/api/v1/comment-targets/blueprint/proofproj/comments") return { data: { items: [], total: 0, nextCursor: "", capabilities: { canCreate: false } } };
    if (path === "/api/v1/users/me/oss/uploads/presign" && method === "POST") {
      const request = JSON.parse(body) as { originalName: string; sizeBytes: number; sha256: string; category: string };
      uploads.push(request.originalName);
      if (request.originalName === "second.txt" && uploads.filter((name) => name === "second.txt").length === 1) return { status: 503, error: "Synthetic second file unavailable" };
      const id = request.originalName === "first.txt" ? "prooffil1" : "prooffil2";
      return { data: { uploadRequired: false, bucket: "synthetic", objectKey: `synthetic/${id}`, category: request.category, source: request.category, originalName: request.originalName, contentType: "text/plain", sizeBytes: request.sizeBytes, sha256: request.sha256, file: { id, originalName: request.originalName, sizeBytes: request.sizeBytes, sourceSizeBytes: request.sizeBytes, createdAt: stamp, updatedAt: stamp, status: "active", scanStatus: "clean" } } };
    }
    if (path === "/api/v1/creators/proofauth/claims" || path === "/api/v1/projects/blueprint/proofproj/editor-applications") {
      applicationWrites++;
      const request = JSON.parse(body) as { proofMarkdown: string; proofFileIds?: string[]; attachmentIds?: string[] };
      assert.equal(request.proofMarkdown, "Synthetic preserved proof");
      assert.deepEqual(request.proofFileIds ?? request.attachmentIds, ["prooffil1", "prooffil2"]);
      if (applicationWrites === 1) { submitted.resolve(); return application.promise; }
      return { data: { id: "proofapp1", status: "pending" } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/${kind === "creator" ? "authors/proofauth" : "blueprints/proofproj"}`);
    await page.getByRole("button", { name: kind === "creator" ? "Claim" : "Apply to become this project's editor", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("textarea").fill("Synthetic preserved proof");
    await dialog.locator('input[type="file"]').setInputFiles([{ name: "first.txt", mimeType: "text/plain", buffer: Buffer.from("synthetic first proof") }, { name: "second.txt", mimeType: "text/plain", buffer: Buffer.from("synthetic second proof") }]);
    const retry = dialog.getByRole("button", { name: "Retry", exact: true });
    await retry.waitFor();
    const attachedFiles = dialog.getByRole("button", { name: "Delete", exact: true }).locator(kind === "creator" ? "xpath=../.." : "xpath=..");
    assert.equal(await attachedFiles.filter({ hasText: "first.txt" }).count(), 1);
    await retry.click();
    await attachedFiles.filter({ hasText: "second.txt" }).waitFor();
    assert.deepEqual(uploads, ["first.txt", "second.txt", "second.txt"]);
    const save = dialog.locator('button[type="submit"]');
    await save.click();
    await submitted.promise;
    assert.equal(await dialog.locator("textarea").isDisabled(), true);
    assert.equal(await dialog.getByRole("button", { name: "Close", exact: true }).isDisabled(), true);
    assert.equal(await save.isDisabled(), true);
    application.resolve({ status: 503, error: "Synthetic application unavailable" });
    await page.waitForFunction(() => !document.querySelector('form[role="dialog"] textarea')?.matches(":disabled"));
    const notice = page.getByRole("alertdialog");
    if (await notice.count()) await notice.getByRole("button", { name: "Close", exact: true }).click();
    assert.equal(await dialog.locator("textarea").inputValue(), "Synthetic preserved proof");
    await save.click();
    if (kind === "creator") await dialog.waitFor({ state: "detached" });
    else {
      await dialog.getByRole("status").waitFor();
      assert.equal(await save.isDisabled(), true);
    }
    assert.equal(applicationWrites, 2);
    assert.deepEqual(uploads, ["first.txt", "second.txt", "second.txt"]);
  } finally { application.resolve({ status: 503, error: "Synthetic test stopped" }); await browser.close(); }
});
