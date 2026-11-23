import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Page } from "playwright";
import { ProductionBrowserFixture, type APIReply } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

const postId = "post00001";
const userId = "author001";
const stamp = "2026-11-23T00:00:00Z";
const post = { id: postId, kind: "discussion", title: "Synthetic discussion", bodyMarkdown: "Synthetic post body", sourceLocale: "en-US",
  reviewStatus: "approved", canEdit: false, canResolve: false, authorName: "Synthetic author", resources: [], minecraftVersions: [],
  tags: [], coverUrl: "", createdAt: stamp, updatedAt: stamp };

function comment(id: string, index: number) {
  return { id, floorNumber: index, depth: 0, body: `Synthetic comment ${index}`, deleted: false,
    author: { id: userId, username: "Synthetic visitor", avatarUrl: "", onlineStatus: "hidden" },
    reactions: {}, userReactions: [], childCount: 0, descendantCount: 0, heatScore: 0, hasMoreReplies: false, pinned: false,
    canEdit: false, canDelete: false, canPin: false, canReply: true, canReact: true, canReport: true, canWatch: false,
    createdAt: stamp, updatedAt: stamp, attachments: [] };
}

function publicCard(status: "online" | "hidden"): APIReply {
  return { data: { id: userId, username: "Synthetic visitor", avatarUrl: "", onlineStatus: status, statistics: [],
    level: { level: 1, experience: 0, experienceInLevel: 0, experienceToNextLevel: 10, lifetimeExperience: 0, progressPercent: 0 } } };
}

async function commentPage(loadCard: () => APIReply | Promise<APIReply>) {
  return fixture.page(({ path }) => {
    if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
    if (path === "/api/v1/stickers") return { data: { packs: [] } };
    if (path === "/api/v1/users/me/content-languages") return { data: { primaryLocale: "en-US", secondaryLocale: "" } };
    if (path === `/api/v1/users/${userId}/card`) return loadCard();
    if (path === `/api/v1/community/posts/${postId}`) return { data: post };
    if (path === `/api/v1/projects/${postId}/follow`) return { data: { following: false, notificationsEnabled: false } };
    if (path === `/api/v1/review-locks/community_post/${postId}`) return { data: { locked: false, subscribed: false, canSubscribe: false } };
    if (path === `/api/v1/comment-targets/community_post/${postId}/comments`) return { data: {
      items: [comment("comment01", 1), comment("comment02", 2)], total: 2, nextCursor: "",
      target: { type: "community_post", key: postId, title: post.title, url: `/discussions/${postId}` }, capabilities: { canCreate: true },
    } };
  });
}

const openCard = (page: Page, commentId: string) => page.locator(`[data-comment-id="${commentId}"]`)
  .getByRole("button", { name: "Open Synthetic visitor's user card" });
const card = (page: Page, commentId: string) => page.locator(`[data-comment-id="${commentId}"]`)
  .getByRole("dialog", { name: "Synthetic visitor's user card" });

test("reopening a user card reads current presence instead of showing the last open result", { timeout: 30_000 }, async () => {
  let reads = 0;
  let currentStatus: "online" | "hidden" = "online";
  const browser = await commentPage(() => { reads++; return publicCard(currentStatus); });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/discussions/${postId}`);
    const trigger = openCard(page, "comment01");
    await trigger.focus();
    const open = card(page, "comment01");
    await open.getByRole("img", { name: "Online", exact: true }).first().waitFor();
    await page.getByRole("heading", { name: post.title, exact: true }).click();
    await open.waitFor({ state: "hidden" });
    currentStatus = "hidden";
    await trigger.focus();
    await open.waitFor();
    assert.equal(await open.getByRole("img", { name: "Online", exact: true }).count(), 0);
    await open.getByRole("img", { name: "Online status hidden", exact: true }).first().waitFor();
    assert.equal(reads, 2);
  } finally { await browser.close(); }
});

test("hover and keyboard can share a current request for the same user", { timeout: 30_000 }, async () => {
  const started = Promise.withResolvers<void>();
  const reply = Promise.withResolvers<APIReply>();
  let reads = 0;
  const browser = await commentPage(() => { reads++; started.resolve(); return reply.promise; });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/discussions/${postId}`);
    await openCard(page, "comment01").hover();
    await started.promise;
    await openCard(page, "comment02").focus();
    await card(page, "comment02").waitFor();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    assert.equal(reads, 1);
    reply.resolve(publicCard("hidden"));
    for (const id of ["comment01", "comment02"]) {
      await card(page, id).getByRole("img", { name: "Online status hidden", exact: true }).first().waitFor();
    }
    assert.equal(reads, 1);
  } finally {
    reply.resolve(publicCard("hidden"));
    await browser.close();
  }
});

test("closing the last consumer cancels its read and reopening starts a fresh one", { timeout: 30_000 }, async () => {
  const started = Promise.withResolvers<void>();
  const lateReply = Promise.withResolvers<APIReply>();
  let reads = 0;
  const browser = await commentPage(() => {
    if (++reads > 1) return publicCard("hidden");
    started.resolve();
    return lateReply.promise;
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/discussions/${postId}`);
    const trigger = openCard(page, "comment01");
    await trigger.focus();
    await started.promise;
    const aborted = page.waitForEvent("requestfailed", request =>
      new URL(request.url()).pathname === `/api/v1/users/${userId}/card`);
    await page.getByRole("heading", { name: post.title, exact: true }).click();
    const failure = await aborted;
    assert.match(failure.failure()?.errorText ?? "", /aborted/i);
    await trigger.focus();
    const open = card(page, "comment01");
    await open.getByRole("img", { name: "Online status hidden", exact: true }).first().waitFor();
    assert.equal(reads, 2);
  } finally {
    lateReply.resolve(publicCard("online"));
    await browser.close();
  }
});
