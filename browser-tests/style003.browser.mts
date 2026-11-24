import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, navigateAdminPanel } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

test("STYLE003 public log errors use UI locale instead of provider diagnostics", { timeout: 30_000 }, async () => {
  for (const [locale,title,message] of [
    ["en-US","Log does not exist or has expired","This service is temporarily unavailable. Try again later."],
    ["zh-CN","日志不存在或已失效","此服务暂时不可用，请稍后重试。"],
  ]) {
    const browser = await fixture.page(({path}) => path === "/api/v1/log-shares/s/style003" ? {status:503,code:"LOG_SHARE_READ_BUSY",error:"private-provider-diagnostic SQLSTATE 23514"} : undefined);
    try {
      await browser.page.context().addCookies([{name:"mcmods-ui-locale",value:locale,url:fixture.origin}]);
      await browser.page.goto(`${fixture.origin}/log/s/style003`);
      await browser.page.getByRole("heading",{name:title,exact:true}).waitFor();
      await browser.page.getByText(message,{exact:true}).waitFor();
      assert.equal(await browser.page.getByText(/private-provider-diagnostic/).count(),0);
    } finally {await browser.close();}
  }
});

test("STYLE003 actual comment challenge localizes copy and preserves proof and draft", { timeout: 30_000 }, async () => {
  for (const [locale,publish,heading,proceed,moderation] of [
    ["en-US","Comment","Complete human verification","Verify and continue","The comment was submitted for review and will be public after approval."],
    ["zh-CN","发表评论","请完成人机验证","验证并继续","评论已提交并进入审核，通过后会公开显示。"],
  ]) {
    const bodies:Array<Record<string,unknown>>=[];
    const proofs:string[]=[];
    const browser=await fixture.page(({path,method,body,headers})=>{
      if(path==="/api/v1/community/posts/style003")return{data:{id:"style003",kind:"tutorial",title:"STYLE003 article",sourceLocale:"en-US",bodyMarkdown:"Test article",category:"",minecraftVersions:[],authorId:"author003",authorName:"Author",reviewStatus:"approved",projects:[],resources:[],createdAt:"2026-10-01T00:00:00Z",updatedAt:"2026-10-01T00:00:00Z",canEdit:false,canResolve:false}};
      if(path==="/api/v1/users/me/content-languages")return{data:{primaryLocale:"en-US",secondaryLocale:"zh-CN",editableLocales:["en-US","zh-CN"]}};
      if(path==="/api/v1/location")return{data:{isMainlandChina:false}};
      if(path==="/api/v1/projects/style003/follow")return{data:{followed:false,notificationsEnabled:true}};
      if(path==="/api/v1/review-locks/community_post/style003")return{data:{locked:false,subscribed:false,canSubscribe:false}};
      if(path==="/api/v1/anti-abuse/form-token")return{data:{token:"form003",fieldName:"contact_reference",expiresAt:"2099-10-01T00:00:00Z"}};
      if(path==="/api/v1/stickers")return{data:{packs:[]}};
      if(path==="/api/v1/comment-targets/community_post/style003/comments") {
        if(method==="GET")return{data:{items:[],total:0,nextCursor:"",capabilities:{canCreate:true}}};
        bodies.push(JSON.parse(body));
        proofs.push(headers["x-anti-abuse-challenge"]||"");
        if(bodies.length===1)return{status:403,code:"challenge_required",error:"private-risk-engine-diagnostic",details:{challenge:{id:"proof003",provider:"proof",prompt:"7 + 2",expiresAt:"2099-10-01T00:00:00Z"}}};
        return{status:202,data:{id:"c00000001",status:"pending",moderation:true}};
      }
    });
    try {
      const {page}=browser;
      await page.context().addCookies([{name:"mcmods-ui-locale",value:locale,url:fixture.origin}]);
      await page.goto(`${fixture.origin}/tutorials/style003`);
      const editor=page.locator("textarea").first();
      await editor.fill("STYLE003 preserved comment");
      await page.getByRole("button",{name:publish,exact:true}).click();
      const dialog=page.getByRole("dialog");
      await dialog.getByRole("heading",{name:heading,exact:true}).waitFor();
      assert.equal(await editor.inputValue(),"STYLE003 preserved comment");
      await dialog.getByRole("textbox").fill("9");
      await dialog.getByRole("button",{name:proceed,exact:true}).click();
      await page.getByText(moderation,{exact:true}).waitFor();
      assert.equal(await dialog.count(),0);
      assert.equal(await editor.inputValue(),"");
      assert.equal(bodies.length,2);
      assert.equal(bodies[0].body,"STYLE003 preserved comment");
      assert.equal(bodies[1].body,bodies[0].body);
      assert.equal(bodies[1].idempotencyKey,bodies[0].idempotencyKey);
      assert.equal(proofs[0],"");
      assert.equal(proofs[1],"proof003:9");
      assert.equal(await page.getByText(/private-risk-engine-diagnostic/).count(),0);
    } finally {await browser.close();}
  }
});

test("STYLE003 anti-abuse admin feedback uses localized validation and success copy",{timeout:30_000},async()=>{
  let saves=0;
  const settings={enabled:true,emergencyMode:false,logThreshold:10,moderationThreshold:20,challengeThreshold:30,tempBlockThreshold:40,denyThreshold:50,newAccountDays:7,trustedAccountDays:30,trustedMinimumLevel:1,duplicateWindowHours:24,similarityThreshold:800,temporaryBlockMinutes:60,policies:{}};
  const browser=await fixture.page(({path,method,body})=>{
    if(path==="/api/v1/admin/anti-abuse/overview")return{data:{counts:{},activeRestrictions:0,highRiskUsers:0,trend:[],challengePassed24h:0,challengeFailed24h:0,duplicateBlocked24h:0,verifiedCrawlerReads24h:0,unknownCrawlerReads24h:0}};
    if(path==="/api/v1/admin/anti-abuse/config"){
      if(method==="PUT"){saves++;assert.equal(JSON.parse(body).logThreshold,10);}
      return{data:settings};
    }
    if(path.startsWith("/api/v1/admin/anti-abuse/"))return{data:{items:[]}};
  });
  try {
    await navigateAdminPanel(browser.page,fixture.origin,"Anti-bot and anti-abuse","User activity monitoring");
    await browser.page.getByRole("button",{name:"Save rules",exact:true}).click();
    await browser.page.getByRole("status").getByText("Anti-abuse rules saved and recorded in the administrator audit log.",{exact:true}).waitFor();
    assert.equal(saves,1);
    await browser.page.getByLabel("Log threshold (1–100)").fill("11.5");
    await browser.page.getByRole("button",{name:"Save rules",exact:true}).click();
    await browser.page.getByRole("status").getByText("All anti-abuse parameters must be integers.",{exact:true}).waitFor();
    assert.equal(saves,1,"invalid client settings must not be sent");
  } finally {await browser.close();}
});

test("anti-abuse readers can inspect and refresh without editing rules or user restrictions", { timeout: 30_000 }, async () => {
  let reads = 0;
  let writes = 0;
  const browser = await fixture.page(({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: {
      id: "riskread1", username: "Risk reader", permissionVersion: 1, rbacVersion: 1, roleCodes: [],
      permissionRules: ["admin.access", "security.anti-abuse.read"].map(code => ({ code, allow: true, priority: 1 })),
    } };
    if (!path.startsWith("/api/v1/admin/anti-abuse/")) return;
    if (method !== "GET") { writes++; return { status: 403, error: "Read only" }; }
    if (path.endsWith("/overview")) { reads++; return { data: { counts: {}, activeRestrictions: 6, highRiskUsers: 0, trend: [], challengePassed24h: 0, challengeFailed24h: 0, duplicateBlocked24h: 0, verifiedCrawlerReads24h: 0, unknownCrawlerReads24h: 0 } }; }
    if (path.endsWith("/config")) return { data: { enabled: true, emergencyMode: false, logThreshold: 10, moderationThreshold: 20, challengeThreshold: 30, tempBlockThreshold: 40, denyThreshold: 50, newAccountDays: 7, trustedAccountDays: 30, trustedMinimumLevel: 1, duplicateWindowHours: 24, similarityThreshold: 800, temporaryBlockMinutes: 60, policies: {} } };
    return { data: { items: [] } };
  });
  try {
    const { page } = browser;
    await navigateAdminPanel(page, fixture.origin, "Anti-bot and anti-abuse", "User activity monitoring");
    const threshold = page.getByLabel("Log threshold (1–100)");
    await threshold.waitFor();
    assert.equal(await threshold.inputValue(), "10");
    assert.equal(await threshold.isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Save rules", exact: true }).count(), 0);
    assert.equal(await page.locator("input[name=botToken]").count(), 0);
    assert.equal(await page.locator("form").count(), 0);
    const previousReads = reads;
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/anti-abuse/config")),
      page.getByRole("button", { name: "Refresh", exact: true }).click(),
    ]);
    assert.ok(reads > previousReads);
    assert.equal(writes, 0);
  } finally { await browser.close(); }
});
