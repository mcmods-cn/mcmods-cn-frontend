import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler, type APIReply } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => fixture.start());
after(async () => fixture.close());
const stamp = "2026-01-02T00:00:00Z";
const common: APIHandler = ({ path }) => {
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === "/api/v1/markdown/config") return { data: {} };
  if (path === "/api/v1/minecraft/versions") return { data: { versions: [{ code: "1.21", type: "release" }, { code: "1.20.1", type: "release" }], loaders: [{ code: "fabric", versions: ["1.21"] }, { code: "forge", versions: ["1.20.1"] }] } };
  if (path === "/api/v1/users/me/drafts") return { data: { id: "synthetic-draft", updatedAt: stamp } };
};
const controlled = (handler: APIHandler) => fixture.page(async request => await handler(request) ?? common(request));
const actor = (id:string) => ({id, username:id, roleCodes:[],permissionRules:[],permissionVersion:1,rbacVersion:1});
const version = { publicId: "version01", label: "Fixture version", minecraftVersions: ["1.21"], loaders: ["fabric"], modVersion: "1", status: "active" };
const baseWorkspace: APIHandler = ({path}) => {
  if (path === "/api/v1/mods/fixture-mod/editor") return {data:{uniqueId:"fixturemod",siteId:"fixture-mod",primaryName:"Fixture mod",compatibilities:[]}};
  if (path === "/api/v1/mods/fixture-mod/content-versions") return {data:{items:[version]}};
  if (path === "/api/v1/mods/fixture-mod/content-templates" || path === "/api/v1/mods/fixture-mod/content-sections") return {data:{items:[]}};
  if (path === "/api/v1/mods/fixture-mod/export-imports/active") return {data:{job:null}};
};
const job = (status:string) => ({ id: "private-job", modSiteId:"fixture-mod", packageId:"package-one",targetVersionPublicId:"version01",overwriteExistingImportData:false,status,progress:status==="ready"?100:10,currentStage:status,errorCode:"",errorDetail:{},deduplicated:false,reviewRequired:false,configuredModids:[],detectedModids:[],primaryDetectedModid:"",modidConfirmationRequired:false,createdAt:stamp,updatedAt:stamp });
// Native browser storage, native PNG/canvas, and shipped React components.
// API jobs, upload tickets, conflicts and permissions are controlled fixtures.
test("FP005 BUG062 empty-project fallback exposes only each loader's verified versions and localized picker actions", {timeout:30_000}, async()=>{
  const writes:Array<Record<string,unknown>>=[];
  const browser=await controlled(request=>{
    if(request.path==="/api/v1/minecraft/versions")return {data:{versions:[{code:"1.21",type:"release"},{code:"1.20.1",type:"release"},{code:"24w01a",type:"snapshot"},{code:"24w02a",type:"snapshot"}],loaders:[{code:"fabric",versions:["1.21","24w01a","24w02a"]},{code:"forge",versions:["1.20.1"]}]}};
    if(request.path==="/api/v1/mods/fixture-mod/content-versions") {
      if(request.method==="POST") {writes.push(JSON.parse(request.body));return {status:503,error:"Controlled version write failure"};}
      return {data:{items:[]}};
    }
    return baseWorkspace(request);
  });
  try {
    const {page}=browser;
    await page.goto(`${fixture.origin}/mods/fixture-mod/data/edit?new=1`);
    await page.getByRole("button",{name:"fabric",exact:true}).click();
    await page.getByTitle("Select Minecraft versions",{exact:true}).click();
    const dialog=page.getByRole("dialog");
    await dialog.getByRole("button",{name:/^1\.21 Release$/}).click();
    assert.equal(await dialog.getByRole("button",{name:/^1\.20\.1 /}).count(),0,"forge-only version must not become selectable for fabric");
    await dialog.getByRole("button",{name:"Confirm",exact:true}).click();
    assert.equal(await page.getByRole("button",{name:"forge",exact:true}).isDisabled(),true);
    await page.getByRole("button",{name:"Add version",exact:true}).click();
    await page.getByText("Controlled version write failure",{exact:true}).waitFor();
    assert.deepEqual(writes[0].minecraftVersions,["1.21"]);assert.deepEqual(writes[0].loaders,["fabric"]);
    await page.getByRole("combobox",{name:"Language",exact:true}).selectOption("zh-CN");
    await page.waitForFunction(()=>document.documentElement.lang==="zh-CN");
    await page.locator('button[title]').filter({hasText:"1.21"}).click();
    const localized=page.getByRole("dialog");
    assert.equal(await localized.getByRole("button",{name:"确定",exact:true}).count(),1);
    assert.equal((await localized.innerText()).includes("minecraftVersionPicker."),false);
    await localized.getByRole("button",{name:/^1\.21 正式版$/}).click();
    await localized.getByRole("button",{name:/显示快照|Show snapshots/}).click();
    await localized.getByRole("checkbox",{name:/2024/}).check();
    await localized.getByRole("button",{name:"确定",exact:true}).click();
    assert.equal(await page.locator('button[aria-haspopup="dialog"][title*="2024"]').getAttribute("title"),"2024 年快照");
  } finally {await browser.close();}
});

test("FP053 catalog editors reject unread snapshots and preserve per-content-language edits after retry", {timeout:40_000},async()=>{
  for (const kind of ["tag","recipe_type"] as const) {
    let failed=true,reads=0;
    const path=kind==="tag"?"/api/v1/tags/target001":"/api/v1/recipe-types/target001";
    const writes:Array<Record<string,unknown>>=[];
    const browser=await controlled(({path:requestPath,method,body})=>{
      if(requestPath!==path)return;
      if(method==="PUT"){writes.push(JSON.parse(body));return {status:503,error:"Controlled manual catalog write failure"};}
      reads++;return failed?{status:503,error:"Controlled manual catalog read failure"}:{data:{publicId:"target001",registry:"minecraft:item",canonicalId:"fixture:manual",defaultLocale:"en-US",publishedRevisionId:"revision-original",reviewStatus:"approved",localizations:[{locale:"en-US",name:"English original",summary:"",contentMarkdown:"",provenance:"human",reviewStatus:"approved",editable:true},{locale:"zh-CN",name:"中文原文",summary:"",contentMarkdown:"",provenance:"human",reviewStatus:"approved",editable:true}],members:[],catalysts:[],definition:{custom:{preserve:true}},templateCount:0,recipeCount:0}};
    });
    try {
      const {page}=browser;
      await page.goto(`${fixture.origin}/${kind==="tag"?"mods-tag":"recipe-types"}?editor=edit&publicId=target001`);
      await page.getByText("Controlled manual catalog read failure",{exact:true}).waitFor();
      assert.equal(await page.getByRole("button",{name:"Save",exact:true}).first().count(),0);assert.equal(writes.length,0);
      failed=false;await page.getByRole("button",{name:"Retry",exact:true}).click();
      const name=page.getByRole("textbox",{name:"Localized name",exact:true});await name.fill("Unsaved English manual title");
      const languages=page.getByRole("tablist");
      await languages.getByRole("tab",{name:"简体中文",exact:true}).click();assert.equal(await name.inputValue(),"中文原文");await name.fill("未保存中文手工标题");
      await languages.getByRole("tab",{name:"English (US)",exact:true}).click();assert.equal(await name.inputValue(),"Unsaved English manual title");
      await page.getByRole("combobox",{name:"Language",exact:true}).selectOption("zh-CN");
      await page.waitForFunction(()=>document.documentElement.lang==="zh-CN");
      const translatedName=page.getByRole("textbox",{name:"本地化名称",exact:true});assert.equal(await translatedName.inputValue(),"Unsaved English manual title");assert.equal(reads,2);
      await page.getByRole("button",{name:"保存",exact:true}).first().click();await page.getByText("Controlled manual catalog write failure",{exact:true}).waitFor();
      assert.equal(writes.length,1);assert.equal(writes[0].baseRevisionId,"revision-original");
      assert.deepEqual((writes[0].localizations as Array<{locale:string;name:string}>).map(value=>[value.locale,value.name]),[["en-US","Unsaved English manual title"],["zh-CN","未保存中文手工标题"]]);
      assert.equal(await translatedName.inputValue(),"Unsaved English manual title");assert.equal(reads,2);
    } finally {await browser.close();}
  }
});

test("FP052 a pending section continuation cannot append to a newly searched scope",{timeout:30_000},async()=>{
  const late=Promise.withResolvers<APIReply>(),started=Promise.withResolvers<void>();
  const section={publicId:"section01",versionPublicId:"version01",templatePublicId:"template01",templateCode:"item",displayMode:"compact",defaultLocale:"en-US",localizations:[{locale:"en-US",name:"Synthetic section",summary:"",contentMarkdown:""}],resourceCount:2};
  const resource=(id:string,name:string)=>({versionPublicId:"version01",resourcePublicId:id,sectionPublicId:"section01",kindCode:"minecraft.item",canonicalId:`fixture:${id}`,ordinal:0,names:{"en-US":name},definition:{},hasDetailDescription:false});
  const response=(name:string,id:string,hasMore=false)=>({data:{section,categories:[],versionLabel:"1.21",items:[resource(id,name)],total:1,hasMore,nextCursor:hasMore?"next-old":"",capabilities:{createResource:false,editResource:false,manageLayout:false}}});
  const browser=await controlled(({path,url})=>{
    if(path==="/api/v1/mods/fixture-mod/content-templates")return {data:{items:[]}};
    if(path==="/api/v1/mods/fixture-mod/content-sections/section01/resources"){
      assert.equal(url.searchParams.get("limit"),"120");
      if(url.searchParams.has("cursor")){started.resolve();return late.promise;}
      return url.searchParams.get("q")==="new query"?response("New search item","new01"):response("Original search item","old01",true);
    }
  });
  try {
    const {page}=browser;await page.goto(`${fixture.origin}/mods/fixture-mod/data/sections/section01`);
    await page.getByRole("link",{name:/Original search item/}).waitFor();await page.getByRole("button",{name:"Next",exact:true}).click();await started.promise;
    await page.getByRole("searchbox").fill("new query");await page.getByRole("link",{name:/New search item/}).waitFor();
    const finished=page.waitForResponse(response=>response.url().includes("cursor=next-old"));late.resolve(response("Late previous search item","late01"));await (await finished).finished();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await page.getByRole("link",{name:/Late previous search item/}).count(),0);assert.equal(await page.getByRole("link",{name:/Original search item/}).count(),0);assert.equal(await page.getByRole("link",{name:/New search item/}).count(),1);
  } finally {late.resolve(response("Released","release01"));await browser.close();}
});

test("SEC046 IndexedDB import recovery never gives another account a persisted job or file",{timeout:30_000},async()=>{
  let account="actor0001";
  const late=Promise.withResolvers<APIReply>(),started=Promise.withResolvers<void>();
  const reads:Array<{account:string;path:string}>=[];
  const browser=await controlled(request=>{
    if(request.path==="/api/v1/auth/me")return {data:actor(account)};
    if(request.path==="/api/v1/mods/fixture-mod/export-imports/private-job"){reads.push({account,path:request.path});started.resolve();return late.promise;}
    return baseWorkspace(request);
  });
  try {
    const {page}=browser;await page.goto(`${fixture.origin}/login`);
    await page.evaluate(async stamp=>{
      await new Promise<void>((resolve,reject)=>{
        const request=indexedDB.open("mcmods-cn-import-uploads",1);
        request.onupgradeneeded=()=>{for(const name of ["tasks","files"])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:"key"});};
        request.onerror=()=>reject(request.error);request.onsuccess=()=>{
          const db=request.result,tx=db.transaction(["tasks","files"],"readwrite"),key="exporter:actor0001:fixture-mod:version01";
          tx.objectStore("tasks").put({key,subjectId:"actor0001",siteId:"fixture-mod",targetVersionId:"version01",overwriteExistingImportData:false,phase:"importing",completedPartNumbers:[],jobId:"private-job",createdAt:Date.parse(stamp),updatedAt:Date.parse(stamp)});
          tx.objectStore("files").put({key,file:new File(["synthetic private bytes"],"private-owner-a.zip",{type:"application/zip"})});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);
        };
      });
    },stamp);
    await page.goto(`${fixture.origin}/mods/fixture-mod/data/edit?version=version01&import=exporter`);await started.promise;
    account="actor0002";await page.evaluate(()=>window.dispatchEvent(new StorageEvent("storage",{key:"mcmods-auth-sync",newValue:"login:actor0002"})));
    await page.locator('a[title="actor0002"]').waitFor();
    await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('input[accept=".zip,application/zip"]')?.disabled===false);
    late.resolve({data:job("ready")});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.deepEqual(reads,[{account:"actor0001",path:"/api/v1/mods/fixture-mod/export-imports/private-job"}]);
    const keys=await page.evaluate(()=>new Promise<IDBValidKey[]>((resolve,reject)=>{const req=indexedDB.open("mcmods-cn-import-uploads",1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,r=db.transaction("tasks").objectStore("tasks").getAllKeys();r.onsuccess=()=>{resolve(r.result);db.close();};r.onerror=()=>reject(r.error);};}));
    assert.deepEqual(keys,["exporter:actor0001:fixture-mod:version01"]);
    assert.equal(await page.getByText("private-owner-a.zip",{exact:true}).count(),0);
  } finally {late.resolve({data:job("ready")});await browser.close();}
});

test("FP007 automatic project import continues its original job when the UI language changes",{timeout:30_000},async()=>{
  const pending=Promise.withResolvers<APIReply>(),started=Promise.withResolvers<void>();
  let posts=0,reads=0;
  const imported={uniqueId:"import0001",siteId:"fixture-import",primaryName:"Imported completed name",secondaryName:"",abbreviation:"",summary:"",defaultLocale:"en-US",environment:"bothRequired",primaryCategory:"utility",officialStatus:"active",sourceStatus:"open",license:"MIT",curseforgeProjectId:"",modrinthProjectId:"",iconUrl:"",bodyMarkdown:"",submissionMethod:"manual",localizations:[{locale:"en-US",name:"Imported completed name",summary:"",bodyMarkdown:""}],modIds:[],compatibilities:[],tags:[],searchKeywords:[],authors:[],links:[],relationshipGroups:[],galleryImages:[]};
  const browser=await controlled(({path,method,body})=>{
    if(path==="/api/v1/creator-roles")return {data:{items:[]}};
    if(path==="/api/v1/mod-imports"){assert.equal(method,"POST");posts++;assert.deepEqual(JSON.parse(body),{provider:"modrinth",url:"https://modrinth.com/mod/synthetic"});return {data:{id:"import-one",status:"running",progress:10}};}
    if(path==="/api/v1/mod-imports/import-one"){reads++;started.resolve();return pending.promise;}
  });
  try{
    const {page}=browser;await page.goto(`${fixture.origin}/mods/new?method=modrinth&url=${encodeURIComponent("https://modrinth.com/mod/synthetic")}`);await started.promise;
    await page.getByRole("combobox",{name:"Language",exact:true}).selectOption("zh-CN");await page.waitForFunction(()=>document.documentElement.lang==="zh-CN");
    pending.resolve({data:{id:"import-one",status:"completed",progress:100,result:imported}});
    await page.locator('input[value="Imported completed name"]').first().waitFor();assert.equal(posts,1);assert.equal(reads,1);
  }finally{pending.resolve({data:{id:"import-one",status:"failed",error:"Released"}});await browser.close();}
});

test("FP013 a failed simple-project icon upload releases every native crop object URL",{timeout:30_000},async()=>{
  let tickets=0;
  const browser=await controlled(({path})=>{
    if(path==="/api/v1/creator-roles")return {data:{items:[]}};
    if(path==="/api/v1/users/me/oss/uploads/presign"){tickets++;return {status:503,error:"Controlled icon ticket failure"};}
  });
  try{
    const {page}=browser;
    await page.context().addInitScript(()=>{
      const made:string[]=[],released:string[]=[],create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
      Object.assign(window,{__cropURLs:{made,released}});URL.createObjectURL=object=>{const value=create(object);made.push(value);return value;};URL.revokeObjectURL=value=>{released.push(value);revoke(value);};
    });
    await page.goto(`${fixture.origin}/plugins/new`);
    const png=await page.evaluate(()=>{const canvas=document.createElement("canvas");canvas.width=256;canvas.height=256;canvas.getContext("2d")!.fillRect(0,0,256,256);return canvas.toDataURL("image/png").split(",")[1];});
    await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles({name:"synthetic-icon.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")});
    const dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:"Crop and upload",exact:true}).click();
    await page.getByText("Controlled icon ticket failure",{exact:true}).waitFor();assert.equal(tickets,1);
    const urls=await page.evaluate(()=>Reflect.get(window,"__cropURLs") as {made:string[];released:string[]});assert.ok(urls.made.length>=2,"source and cropped output both use native object URLs");assert.deepEqual([...new Set(urls.released)].sort(),[...new Set(urls.made)].sort());
    assert.equal(await dialog.count(),0);
  }finally{await browser.close();}
});

function resourceSnapshot(kind:string,definition:Record<string,unknown>){
  return {entityId:"entity001",publicId:"resource01",kindCode:kind,canonicalId:"fixture:resource",details:[{versionPublicId:"version01",sectionPublicId:"section01",entryTypeCode:"default",definitionSchemaVersion:1,defaultLocale:"en-US",definition,status:"active",publishedRevisionId:"revision-before",localizations:[{locale:"en-US",name:"Synthetic resource",summary:"",contentMarkdown:"",provenance:"human"}]}],versions:[{publicId:"version01",label:"Fixture version",hasDetail:true}],capabilities:{createResource:true,editResource:true,manageLayout:true}};
}
const rootSection={publicId:"section01",versionPublicId:"version01",templatePublicId:"template01",templateCode:"items",templateBuiltin:true,templateI18nKey:"",parentPublicId:"",defaultLocale:"en-US",displayMode:"compact",ordinal:0,status:"active",localizations:[{locale:"en-US",name:"Items",summary:"",contentMarkdown:""}],resourceCount:1};
const rangeTemplate={publicId:"template01",code:"items",builtin:true,i18nKey:"",defaultLocale:"en-US",defaultDisplayMode:"compact",status:"active",localizations:[],definition:{resourceKinds:["minecraft.item"],entryTypes:[{code:"default",kindCodes:["minecraft.item"],names:{"en-US":"Test item"},groups:[{code:"testing",names:{"en-US":"Fields"},fields:[{code:"syntheticRange",type:"range",format:"range",names:{"en-US":"Synthetic range"},paths:[["syntheticRange"]],editable:true}]}]}]}};

test("FP043 a late draft restore replaces an invalid range and draft-completion failure remains distinct from its saved content",{timeout:30_000},async()=>{
  const pending=Promise.withResolvers<APIReply>(),started=Promise.withResolvers<void>();const writes:Array<Record<string,unknown>>=[];let completions=0;
  const restored={activeVersionId:"version01",canonicalId:"fixture:resource",defaultLocale:"en-US",definition:{syntheticRange:[2,6]},entryTypeCode:"default",iconFilePublicId:"",iconSmallFilePublicId:"",kindCode:"minecraft.item",localizations:[{locale:"en-US",provenance:"human",reviewStatus:"approved",editable:true,fields:{name:"Restored range resource",summary:"",contentMarkdown:""}}],reason:"Restored reason",renderFilePublicId:"",selectedSectionId:"section01"};
  const browser=await controlled(({path,method,body})=>{
    if(path==="/api/v1/mods/fixture-mod/content-sections")return {data:{items:[rootSection]}};
    if(path==="/api/v1/mods/fixture-mod/content-templates")return {data:{items:[rangeTemplate]}};
    if(path==="/api/v1/users/me/drafts/restore01"){started.resolve();return pending.promise;}
    if(path==="/api/v1/users/me/drafts/complete"){completions++;return {status:503,error:"Controlled draft completion failure"};}
    if(path==="/api/v1/mods/fixture-mod/content-resources/resource01"){
      if(method==="PUT"){writes.push(JSON.parse(body));return {data:{publicId:"resource01",revisionId:"newrev001",changeRequestId:"change001",reviewStatus:"pending"}};}
      return {data:resourceSnapshot("minecraft.item",{syntheticRange:[1,10]})};
    }
  });
  try{
    const {page}=browser;await page.goto(`${fixture.origin}/mods/fixture-mod/resources/resource01/edit?version=version01&section=section01&draft=restore01`);await started.promise;
    const minimum=page.getByRole("spinbutton",{name:"Synthetic range minimum",exact:true}),maximum=page.getByRole("spinbutton",{name:"Synthetic range maximum",exact:true});
    await minimum.fill("20");assert.equal(await page.getByRole("button",{name:"Save",exact:true}).first().isDisabled(),true);assert.equal(writes.length,0);
    pending.resolve({data:{draftKey:"mod-resource:fixture-mod:edit:resource01",updatedAt:stamp,payload:restored}});
    await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('input[aria-label="Synthetic range minimum"]')?.value==="2");assert.equal(await maximum.inputValue(),"6");
    const warning=Promise.withResolvers<string>();page.once("dialog",async dialog=>{warning.resolve(dialog.message());await dialog.accept();});
    await page.getByRole("button",{name:"Save",exact:true}).first().click();assert.match(await warning.promise,/Content was saved, but the draft status could not be updated/);
    assert.equal(writes.length,1);assert.deepEqual(writes[0].definition,{syntheticRange:[2,6]});assert.equal(completions,1);await page.getByText(/Submitted for review|submitted for review|pending review/).first().waitFor();
  }finally{pending.resolve({status:503,error:"Released"});await browser.close();}
});

test("FP056 loot advanced JSON rejects primitive/array roots without erasing its original definition",{timeout:30_000},async()=>{
  const writes:Array<Record<string,unknown>>=[];const original={pools:[],custom:{keep:true}};
  const browser=await controlled(({path,method,body})=>{
    if(path==="/api/v1/mods/fixture-mod/content-sections")return {data:{items:[{...rootSection,templateCode:"loot_table"}]}};
    if(path==="/api/v1/mods/fixture-mod/content-templates")return {data:{items:[{...rangeTemplate,code:"loot_table",definition:{resourceKinds:["minecraft.loot_table"],entryTypes:[{code:"default",kindCodes:["minecraft.loot_table"],names:{"en-US":"Loot table"},groups:[]}]}}]}};
    if(path==="/api/v1/mods/fixture-mod/content-resources/resource01"){
      if(method==="PUT"){writes.push(JSON.parse(body));return {status:503,error:"Controlled loot write failure"};}return {data:resourceSnapshot("minecraft.loot_table",original)};
    }
  });
  try{
    const {page}=browser;await page.goto(`${fixture.origin}/mods/fixture-mod/resources/resource01/edit?version=version01&section=section01`);
    await page.getByText("Advanced loot table JSON",{exact:true}).click();const textarea=page.locator('details').filter({has:page.getByText("Advanced loot table JSON",{exact:true})}).locator("textarea");
    for(const invalid of ["null","[]",'"invalid primitive"']){await textarea.fill(invalid);assert.equal(await textarea.getAttribute("aria-invalid"),"true");assert.equal(await page.getByRole("button",{name:"Save",exact:true}).first().isDisabled(),true);assert.equal(writes.length,0);}
    const changed={...original,custom:{keep:true,edited:true}};await textarea.fill(JSON.stringify(changed));assert.notEqual(await textarea.getAttribute("aria-invalid"),"true");await page.getByRole("button",{name:"Save",exact:true}).first().click();await page.getByText("Controlled loot write failure",{exact:true}).waitFor();assert.deepEqual(writes[0].definition,{custom:{edited:true}},"write uses the real baseline override contract and does not erase imported fields");assert.deepEqual(JSON.parse(await textarea.inputValue()),changed);
  }finally{await browser.close();}
});

test("BUG148 category selects and native drag reject cycles and a subtree deeper than four levels",{timeout:30_000},async()=>{
  const categories=[{id:"catA0001",parent:"section01",name:"A"},{id:"catA0002",parent:"catA0001",name:"A child"},{id:"catA0003",parent:"catA0002",name:"A grandchild"},{id:"catX0001",parent:"section01",name:"X"},{id:"catY0001",parent:"catX0001",name:"Y"}].map((value,index)=>({...rootSection,publicId:value.id,parentPublicId:value.parent,ordinal:index,localizations:[{locale:"en-US",name:value.name,summary:"",contentMarkdown:""}],resourceCount:0}));
  const writes:Array<Record<string,unknown>>=[];
  const browser=await controlled(({path,method,body,url})=>{
    if(path==="/api/v1/mods/fixture-mod/content-sections/section01/layout"){
      if(method==="PATCH"){writes.push(JSON.parse(body));return {status:503,error:"Controlled layout write failure"};}
      assert.equal(url.searchParams.get("limit"),"500");return {data:{section:rootSection,categories,items:[],total:0,limit:500,hasMore:false,nextCursor:"",capabilities:{manageLayout:true,createResource:true,editResource:true}}};
    }
  });
  try{
    const {page}=browser;await page.goto(`${fixture.origin}/mods/fixture-mod/data/sections/section01/arrange`);
    const row=page.locator("section").filter({has:page.getByRole("textbox",{name:"Localized name: A",exact:true})}).last(),parent=row.getByRole("combobox",{name:"Parent category",exact:true});await parent.waitFor();
    for(const id of ["catA0001","catA0002","catA0003","catY0001"])assert.equal(await parent.locator(`option[value="${id}"]`).count(),0);
    const a=page.locator('article[draggable="true"]').filter({has:page.locator("strong").filter({hasText:/^A$/})}),y=page.locator('article[draggable="true"]').filter({has:page.locator("strong").filter({hasText:/^Y$/})});
    await a.dragTo(y);assert.equal(await parent.inputValue(),"section01");await parent.selectOption("catX0001");assert.equal(await parent.inputValue(),"catX0001");
    await page.getByRole("button",{name:"Submit layout for review",exact:true}).first().click();await page.getByText("Controlled layout write failure",{exact:true}).waitFor();
    const payload=writes[0].categories as Array<{publicId:string;parentPublicId:string}>;assert.equal(payload.find(value=>value.publicId==="catA0001")?.parentPublicId,"catX0001");assert.equal(payload.find(value=>value.publicId==="catA0003")?.parentPublicId,"catA0002");
  }finally{await browser.close();}
});

test("FP041 combining a 200k-entry catalog reaches its upload contract and successful version creation is not repeated after refresh fails",{timeout:35_000},async()=>{
  let tickets=0;const entries=Array.from({length:200_000},(_,index)=>index),expected=Buffer.byteLength(entries.map(value=>JSON.stringify(value)).join("\n"));
  const browser=await controlled(request=>{
    if(request.path==="/api/v1/mods/fixture-mod/catalog-imports/uploads/presign"){tickets++;assert.equal(JSON.parse(request.body).sizeBytes,expected);return {status:503,error:"Controlled combined-catalog upload failure"};}return baseWorkspace(request);
  });
  try{const {page}=browser;await page.goto(`${fixture.origin}/mods/fixture-mod/data/edit?version=version01&import=iconrenderer`);await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('input[accept=".json,application/json,application/x-ndjson"]')?.disabled===false);await page.locator('input[accept=".json,application/json,application/x-ndjson"]').first().setInputFiles({name:"synthetic-200k.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(entries))});await page.getByText("Controlled combined-catalog upload failure",{exact:true}).waitFor();assert.equal(tickets,1);}finally{await browser.close();}
  let writes=0;
  const second=await controlled(request=>{if(request.path==="/api/v1/mods/fixture-mod/content-versions"){if(request.method==="POST"){writes++;return {data:{publicId:"version02",reviewStatus:"approved"}};}if(writes)return {status:503,error:"Controlled post-create refresh failure"};return {data:{items:[]}};}return baseWorkspace(request);});
  try{const {page}=second;await page.goto(`${fixture.origin}/mods/fixture-mod/data/edit?new=1`);await page.getByRole("button",{name:"fabric",exact:true}).click();await page.getByTitle("Select Minecraft versions",{exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:/^1\.21 Release$/}).click();await page.getByRole("dialog").getByRole("button",{name:"Confirm",exact:true}).click();await page.getByRole("button",{name:"Add version",exact:true}).evaluate(node=>{(node as HTMLButtonElement).click();(node as HTMLButtonElement).click();});await page.getByText("Controlled post-create refresh failure",{exact:true}).waitFor();assert.equal(writes,1);assert.equal(await page.getByRole("button",{name:"Add version",exact:true}).isDisabled(),true,"the persisted form must already be reset and unable to repeat its write before refresh fails");assert.equal(await page.getByTitle("Select Minecraft versions",{exact:true}).count(),1);}finally{await second.close();}
});

test("TEST047 seven unresolved source producers retain diagnostics and an externally emptied cursor page can return safely",{timeout:30_000},async()=>{
  const producers=["mod_relationship","community_post_project","community_post_resource","modpack_mod","minecraft_server_mod","simple_project_parent","mod_content_resource"];
  const types=["mod","modpack","plugin","map","resource_pack","shader_pack","datapack","addon","community_post","user","tag","recipe_type","minecraft_server","skin"];
  let emptyContinuation=false;const reads:Array<{cursor:string;type:string}>=[];
  const rows=producers.map((sourceType,index)=>({id:`source${index}`,rawIdentifier:`unresolved-${index}`,referenceType:types[index],sourceType,sourceId:`internal-${index}`,sourcePublicId:`public000${index}`,sourceLabel:`Producer ${index}`,fieldPath:`definition.references[${index}]`,status:"pending",createdAt:stamp}));
  const browser=await controlled(({path,url})=>{
    if(path==="/api/v1/admin/unresolved-reference-types")return {data:{items:types}};
    if(path==="/api/v1/admin/unresolved-references"){const cursor=url.searchParams.get("cursor")||"",type=url.searchParams.get("type")||"";reads.push({cursor,type});assert.equal(url.searchParams.get("limit"),"50");assert.equal(url.searchParams.has("offset"),false);return {data:{items:cursor&&emptyContinuation?[]:rows,hasMore:!cursor,nextCursor:cursor?"":"next-page",limit:50}};}
  });
  try{
    const {page}=browser;await page.goto(`${fixture.origin}/admin`);await page.locator('[data-admin-group="content"]').click();await page.locator('[data-admin-panel="unresolved-references"]').click();await page.getByText("unresolved-6",{exact:true}).waitFor();
    for(let index=0;index<producers.length;index++){await page.getByText(`${producers[index]} · public000${index} · definition.references[${index}]`,{exact:true}).waitFor();if(index<6)assert.equal(await page.getByRole("link",{name:`Producer ${index}`,exact:true}).getAttribute("href"),`/public000${index}`);else{assert.equal(await page.getByRole("link",{name:`Producer ${index}`,exact:true}).count(),0);assert.equal(await page.getByText(`Producer ${index}`,{exact:true}).count(),1);}}
    const select=page.locator('select:has(option[value="recipe_type"])');assert.equal(await select.locator("option").count(),15);
    for(const type of types){const done=page.waitForResponse(response=>new URL(response.url()).searchParams.get("type")===type);await select.selectOption(type);await (await done).finished();await page.getByText("unresolved-6",{exact:true}).waitFor();assert.equal(reads.at(-1)?.type,type);}
    emptyContinuation=true;await page.getByRole("button",{name:"Next",exact:true}).click();await page.getByText("No references match the current filters.").waitFor();assert.equal(await page.getByRole("button",{name:"Previous",exact:true}).isDisabled(),false);await page.getByRole("button",{name:"Previous",exact:true}).click();await page.getByText("unresolved-6",{exact:true}).waitFor();assert.equal(reads.at(-1)?.cursor,"");
  }finally{await browser.close();}
});
