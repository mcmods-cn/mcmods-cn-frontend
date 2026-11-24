import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { Page } from "playwright";
import type { AIConfig } from "../app/_lib/admin-ai-config.mts";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(() => fixture.start());
after(() => fixture.close());
const rev = (n: number) => n.toString(16).padStart(64, "0");
const path = "/api/v1/admin/ai/config";
function settings(): AIConfig {
  return {
    revision: rev(1),
    providers: [{ code: "archive", name: "Catalog translation", protocol: "openai-compatible", enabled: true, baseUrl: "https://translation.example.invalid/v1", hasApiKey: true, notes: "Resource descriptions" }],
    models: [], taskModels: [], quotas: [],
    translation: { enabled: false, sourceLocale: "en-US", targetLocales: ["zh-CN"], taskType: "translation", autoSubmit: false, glossary: "" },
  };
}
function actor(id: string, permissions: string[], version = 1) {
  return { id, username: id, roleCodes: [], permissionVersion: version, rbacVersion: 1,
    permissionRules: ["admin.access", ...permissions].map(code => ({ code, allow: true, priority: 100 })) };
}
async function openProviders(page: Page) {
  await page.goto(fixture.origin + "/admin");
  const aiGroup = page.locator('[data-admin-group="ai"]');
  await aiGroup.waitFor({ state: "attached" });
  const menu = page.locator('button[aria-controls="admin-navigation"]');
  if (await menu.isVisible()) await menu.click();
  await aiGroup.click();
  await page.locator('[data-admin-panel="ai-providers"]').click();
  await page.getByPlaceholder("Name", { exact: true }).waitFor();
}
const save = (page: Page) => page.getByRole("button", { name: "Save AI config", exact: true });
const password = (page: Page) => page.locator('input[type="password"]');
async function closeNotice(page: Page, text: string | RegExp) {
  const notice = page.getByRole("alertdialog").filter({ hasText: text });
  await notice.getByRole("button", { name: "Close", exact: true }).click();
}

test("AI readers on desktop light and mobile dark can inspect credentials metadata without a mutation", async () => {
  for (const [variant, viewport, colorScheme] of [
    ["desktop", {width:1440,height:900}, "light"], ["mobile",{width:390,height:844}, "dark"],
  ] as const) {
    let writes = 0, reads = 0;
    const identity = Promise.withResolvers<void>();
    const owned = await fixture.page(async request => {
      if (request.path === "/api/v1/auth/me") {
        await identity.promise;
        return { data: actor("reader0001", ["ai.read"]) };
      }
      if (request.path === path) {
        if (request.method !== "GET") { writes++; return { status: 403, error: "Read only" }; }
        reads++; return { data: settings() };
      }
    }, {viewport, colorScheme});
    try {
      const page = owned.page;
      await Promise.all([
        openProviders(page),
        (async () => {
          await page.getByText("Checking login state", { exact: true }).waitFor();
          assert.equal(await page.locator('[data-admin-group="ai"]').count(), 0);
          identity.resolve();
        })(),
      ]);
      await page.getByRole("status").filter({hasText:"You have read-only access."}).waitFor();
      assert(await save(page).isDisabled());
      assert.equal(await save(page).evaluate(button => getComputedStyle(button).cursor), "not-allowed");
      assert(await password(page).isDisabled());
      assert.equal(await password(page).inputValue(), "");
      assert.equal(await page.locator("fieldset :enabled").count(), 0);
      await save(page).dispatchEvent("click");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), colorScheme === "dark");
      assert.equal(reads, 1); assert.equal(writes, 0);
      if (process.env.MCMODS_ADMIN_AI_SCREENSHOTS) {
        await mkdir(process.env.MCMODS_ADMIN_AI_SCREENSHOTS, {recursive:true});
        await page.screenshot({path:join(process.env.MCMODS_ADMIN_AI_SCREENSHOTS,`ai-readonly-after-${variant}.png`)});
      }
    } finally {
      identity.resolve();
      await owned.close();
    }
  }
});

test("A writer reads a legacy service without PUT and the AI menu requires read access", async () => {
  let reads=0, writes=0;
  let permissions=["ai.write","ai.task.enqueue"];
  const owned=await fixture.page(request=>{
    if(request.path==="/api/v1/auth/me")return {data:actor("writer0001",permissions)};
    if(request.path===path){
      if(request.method==="GET"){reads++;const old=settings();delete old.revision;return {data:old};}
      writes++;return {status:400,error:"Unexpected revision"};
    }
  });
  try {
    await owned.page.goto(fixture.origin+"/admin");
    await owned.page.getByText("writer0001", {exact:false}).last().waitFor();
    assert.equal(await owned.page.locator('[data-admin-group="ai"]').count(),0);assert.equal(reads,0);
    permissions=[...permissions,"ai.read"];
    await openProviders(owned.page);
    await owned.page.getByRole("status").filter({hasText:"This server does not provide a revision"}).waitFor();
    assert(await save(owned.page).isDisabled());assert.equal(await password(owned.page).inputValue(),"");
    assert.equal(reads,1);assert.equal(writes,0);
  } finally {await owned.close();}
});

test("Concurrent AI editors compare the active revision and reapply only edited fields before another explicit save", async () => {
  let current=settings(), sequence=1;
  const writes: AIConfig[]=[];
  function handler(id:string): APIHandler {
    return request=>{
      if (request.path==="/api/v1/auth/me") return {data:actor(id,["ai.read","ai.write"])};
      if (request.path!==path) return;
      if (request.method==="GET") return {data:structuredClone(current)};
      const draft=JSON.parse(request.body) as AIConfig;
      writes.push(draft);
      if(current.revision!==draft.revision) return {status:409,code:"AI_CONFIG_CONFLICT",error:"Configuration changed"};
      current={...draft,revision:rev(++sequence),providers:draft.providers.map(provider=>{
        const copy={...provider,hasApiKey:true};delete copy.apiKey;return copy;
      })};
      return {data:structuredClone(current)};
    };
  }
  const a=await fixture.page(handler("first0001")), b=await fixture.page(handler("second001"));
  try {
    await Promise.all([openProviders(a.page),openProviders(b.page)]);
    await a.page.getByPlaceholder("Name",{exact:true}).fill("Updated locally");
    await password(a.page).fill("synthetic-draft-value");
    await b.page.getByPlaceholder("Name",{exact:true}).fill("Remote title");
    await b.page.getByPlaceholder("Description",{exact:true}).fill("Other administrator's notes");
    await save(b.page).click();await closeNotice(b.page,"AI config saved");
    assert(!Object.hasOwn(writes[0].providers[0],"apiKey"));
    await save(a.page).click();
    await a.page.getByText("The configuration changed. Your draft is preserved.").waitFor();
    assert(await save(a.page).isDisabled());
    assert.equal(await password(a.page).inputValue(),"synthetic-draft-value");
    await save(a.page).dispatchEvent("click");
    await a.page.getByRole("button",{name:"Compare with the latest settings"}).click();
    const latest=a.page.getByRole("alert");
    assert.equal(await latest.getByPlaceholder("Name",{exact:true}).inputValue(),"Remote title");
    assert.equal(await latest.getByPlaceholder("Description",{exact:true}).inputValue(),"Other administrator's notes");
    assert.equal(await latest.locator('input[type="password"]').inputValue(),"");
    assert.equal(writes.length,2);
    await a.page.getByRole("button",{name:"Apply my edited fields to the latest settings"}).click();
    assert.equal(await a.page.getByPlaceholder("Description",{exact:true}).inputValue(),"Other administrator's notes");
    assert.equal(await password(a.page).inputValue(),"synthetic-draft-value");
    await save(a.page).click();await closeNotice(a.page,"AI config saved");
    assert.deepEqual(writes.map(w=>w.revision),[rev(1),rev(1),rev(2)]);
    assert.equal(current.providers[0].name,"Updated locally");
    assert.equal(current.providers[0].notes,"Other administrator's notes");
    assert.equal(writes[2].providers[0].apiKey,"synthetic-draft-value");
    assert.equal(await password(a.page).inputValue(),"");
  } finally {await a.close();await b.close();}
});

test("Server requires an explicit credential decision on origin change and clears only the selected provider", async()=>{
  const writes: (AIConfig & {clearApiKeys?:string[]})[]=[];
  const owned=await fixture.page(request=>{
    if(request.path==="/api/v1/auth/me")return {data:actor("writer0001",["ai.read","ai.write"])};
    if(request.path!==path)return;
    const initial=settings();
    if(request.method==="GET")return {data:initial};
    const submitted=JSON.parse(request.body);writes.push(submitted);
    if(writes.length===1)return {status:400,code:"AI_PROVIDER_KEY_ACTION_REQUIRED",error:"Change destination",details:{provider:"archive"}};
    return {data:{...initial,revision:rev(2),providers:[{...submitted.providers[0],hasApiKey:false}]}};
  });
  try{
    await openProviders(owned.page);
    const url=owned.page.getByPlaceholder("Base URL");
    await url.fill("https://new.example.invalid/v1");await save(owned.page).click();
    await closeNotice(owned.page,"The destination for archive changed.");
    assert.equal(await url.inputValue(),"https://new.example.invalid/v1");
    assert(!Object.hasOwn(writes[0].providers[0],"apiKey"));assert(!Object.hasOwn(writes[0],"clearApiKeys"));
    await password(owned.page).fill("discarded-synthetic-replacement");
    await owned.page.getByRole("checkbox",{name:"Clear saved API key"}).check();
    assert(await password(owned.page).isDisabled());assert.equal(await password(owned.page).inputValue(),"");
    await save(owned.page).click();await closeNotice(owned.page,"AI config saved");
    assert.deepEqual(writes[1].clearApiKeys,["archive"]);assert(!Object.hasOwn(writes[1].providers[0],"apiKey"));
    assert(!Object.hasOwn(writes[1].providers[0],"clearApiKey"));assert.equal(writes[1].revision,rev(1));
  }finally{await owned.close();}
});

test("A permission downgrade, account switch and late save response cannot restore a secret draft", async()=>{
  let user=actor("writer0001",["ai.read","ai.write"]),reads=0,writes=0;
  const started=Promise.withResolvers<void>(),release=Promise.withResolvers<void>();
  const owned=await fixture.page(async request=>{
    if(request.path==="/api/v1/auth/me")return {data:user};
    if(request.path!==path)return;
    if(request.method==="GET"){reads++;const data=settings();data.providers[0].name=user.id;return {data};}
    writes++;started.resolve();await release.promise;return {data:{...settings(),revision:rev(2)}};
  });
  try{
    await openProviders(owned.page);
    await password(owned.page).fill("only-for-the-first-writer");
    await save(owned.page).click();await started.promise;
    user=actor("writer0001",["ai.read"],2);
    await owned.page.evaluate(()=>window.dispatchEvent(new CustomEvent("mcmods-permissions-changed")));
    await owned.page.getByRole("status").filter({hasText:"You have read-only access."}).waitFor();
    assert.equal(await password(owned.page).inputValue(),"");assert(await save(owned.page).isDisabled());
    user=actor("second001",["ai.read","ai.write"]);
    await owned.page.evaluate(()=>window.dispatchEvent(new StorageEvent("storage",{key:"mcmods-auth-sync",newValue:"login:second001"})));
    await owned.page.waitForFunction(()=>document.querySelector<HTMLInputElement>('input[placeholder="Name"]')?.value==="second001");
    release.resolve();
    assert.equal(await password(owned.page).inputValue(),"");assert.equal(await owned.page.getByRole("alertdialog").count(),0);
    assert.equal(reads,3);assert.equal(writes,1);
  }finally{release.resolve();await owned.close();}
});

test("Conflict review never carries a local replacement key to a destination changed by another editor", async () => {
  const current = settings();
  let writes = 0;
  const owned = await fixture.page(request => {
    if (request.path === "/api/v1/auth/me") return {data:actor("writer0001", ["ai.read", "ai.write"])};
    if (request.path !== path) return;
    if (request.method === "GET") return {data:structuredClone(current)};
    writes++;
    return {status:409, code:"AI_CONFIG_CONFLICT", error:"Another writer"};
  });
  try {
    await openProviders(owned.page);
    await password(owned.page).fill("for-the-original-host-only");
    current.revision = rev(2);
    current.providers[0].baseUrl = "https://replacement.example.invalid/v1";
    await save(owned.page).click();
    await owned.page.getByRole("button",{name:"Compare with the latest settings"}).click();
    const comparison = owned.page.getByRole("alert");
    await comparison.getByText("The destination for archive is now https://replacement.example.invalid.",{exact:false}).waitFor();
    assert.equal(await comparison.getByRole("button",{name:"Apply my edited fields to the latest settings"}).count(),0);
    assert.equal(await owned.page.getByRole("group",{name:"Your unsaved changes"}).locator('input[type="password"]').inputValue(),"for-the-original-host-only");
    await comparison.getByRole("button",{name:"Discard my draft and use the latest settings"}).click();
    assert.equal(await password(owned.page).inputValue(),"");
    assert.equal(await owned.page.getByPlaceholder("Base URL").inputValue(),current.providers[0].baseUrl);
    assert.equal(writes,1);
  } finally {await owned.close();}
});

test("A denied save removes the current user's pending credential before another operation", async () => {
  let writes = 0;
  const owned = await fixture.page(request => {
    if (request.path === "/api/v1/auth/me") return { data: actor("writer0001", ["ai.read", "ai.write"]) };
    if (request.path !== path) return;
    if (request.method === "GET") return { data: settings() };
    writes++;
    return { status: 403, error: "Write permission was revoked" };
  });
  try {
    const { page } = owned;
    await openProviders(page);
    await password(page).fill("synthetic-unsaved-key");
    await save(page).click();
    await closeNotice(page, "Permission required");
    await page.getByRole("status").filter({ hasText: "Your account does not have permission" }).waitFor();
    assert.equal(await password(page).count(), 0);
    assert.equal(await page.getByPlaceholder("Name", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Retry", exact: true }).count(), 0);
    assert(await save(page).isDisabled());
    await save(page).dispatchEvent("click");
    assert.equal(writes, 1);
  } finally {
    await owned.close();
  }
});

test("Mixed-version responses preserve the revision on every PUT and lock edits after a revisionless reread", async () => {
  let reads = 0;
  const writes: AIConfig[] = [];
  const owned = await fixture.page(request => {
    if (request.path === "/api/v1/auth/me") return { data: actor("writer0001", ["ai.read", "ai.write"]) };
    if (request.path !== path) return;
    if (request.method === "GET") {
      const snapshot = settings();
      if (++reads > 1) delete snapshot.revision;
      return { data: snapshot };
    }
    writes.push(JSON.parse(request.body) as AIConfig);
    if (writes.length === 1) return { status: 400, error: "Unknown field revision" };
    return { status: 428, code: "AI_CONFIG_REVISION_REQUIRED", error: "Read a current revision" };
  });
  try {
    const { page } = owned;
    await openProviders(page);
    await password(page).fill("synthetic-pending-key");
    await save(page).click();
    await closeNotice(page, "Settings could not be saved. Your draft is preserved.");
    assert.equal(writes.length, 1);
    assert.equal(await password(page).inputValue(), "synthetic-pending-key");
    await save(page).click();
    await page.getByRole("button", { name: "Compare with the latest settings" }).click();
    const comparison = page.getByRole("alert");
    await comparison.getByText("This server does not provide a revision", { exact: false }).first().waitFor();
    assert.equal(await comparison.getByRole("button", { name: "Apply my edited fields to the latest settings" }).count(), 0);
    assert(await save(page).isDisabled());
    const draft = page.getByRole("group", { name: "Your unsaved changes" });
    assert.equal(await draft.locator('input[type="password"]').inputValue(), "synthetic-pending-key");
    await comparison.getByRole("button", { name: "Discard my draft and use the latest settings" }).click();
    assert(await save(page).isDisabled());
    assert.equal(await password(page).inputValue(), "");
    assert.equal(reads, 2);
    assert.deepEqual(writes.map(request => request.revision), [rev(1), rev(1)]);
  } finally {
    await owned.close();
  }
});
