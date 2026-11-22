import assert from "node:assert/strict";
import { test } from "node:test";
import { aiConfigSnapshot, aiConfigWrite, changedCredentialDestination, mergeAIDraft, type AIConfig } from "./admin-ai-config.mts";

const config = (): AIConfig => ({
  revision: "a".repeat(64),
  providers: [{code:"a",name:"Provider",baseUrl:"https://example.invalid",enabled:true,hasApiKey:true,notes:"",protocol:"openai-compatible"}],
  models: [], taskModels: [], quotas: [{scope:"site",subject:"default",period:"day",requestLimit:5,tokenLimit:300,costLimitCny:0}],
  translation: {enabled:false,sourceLocale:"en-US",targetLocales:[],taskType:"translation",autoSubmit:false,glossary:""},
});

test("AI configuration validates all settings before saving, clears returned secrets and preserves zeroes", () => {
  const raw=config();
  raw.providers[0].apiKey="untrusted-server-value";
  const saved=aiConfigSnapshot(raw);
  assert(!Object.hasOwn(saved.providers[0],"apiKey"));
  assert.equal(raw.providers[0].apiKey,"untrusted-server-value");
  assert.equal(aiConfigWrite(saved).quotas[0].costLimitCny,0);
  for(const revision of [undefined, "A".repeat(64), "z".repeat(64), "b".repeat(63)]) {
    const legacy=aiConfigSnapshot({...raw,revision});
    assert.equal(legacy.revision,undefined);
    assert.throws(()=>aiConfigWrite(legacy));
  }
  assert.throws(()=>aiConfigSnapshot({...raw,quotas:[{...raw.quotas[0],tokenLimit:Number.MAX_SAFE_INTEGER+1}]}));
  const missingCost = JSON.parse(JSON.stringify({ ...raw, quotas: [{ ...raw.quotas[0], costLimitCny: null }] }));
  assert.throws(() => aiConfigSnapshot(missingCost));
  assert.throws(()=>aiConfigSnapshot({...raw,quotas:[{}] as AIConfig["quotas"]}));
});

test("Blank keys are omitted, replacement and explicit clear cannot be combined",()=>{
  const draft=config();
  draft.providers[0].apiKey="   ";
  assert(!Object.hasOwn(aiConfigWrite(draft).providers[0],"apiKey"));
  draft.providers[0].apiKey="replacement";
  assert.equal(aiConfigWrite(draft).providers[0].apiKey,"replacement");
  draft.providers[0].clearApiKey=true;
  assert.throws(()=>aiConfigWrite(draft));
  delete draft.providers[0].apiKey;
  const payload=aiConfigWrite(draft);
  assert.deepEqual(payload.clearApiKeys,["a"]);
  assert(!Object.hasOwn(payload.providers[0],"clearApiKey"));
  assert(!Object.hasOwn(payload.providers[0],"apiKey"));
});

test("Reapplying reviewed edits preserves current rows, quotas and unrelated fields; ambiguous row identities require a fresh edit",()=>{
  const base=config(), draft=config(), current=config();
  draft.providers[0].name="my name";draft.providers[0].apiKey="new-secret";
  current.revision="b".repeat(64);current.quotas[0].requestLimit=2;current.providers[0].notes="new notes";
  current.providers.unshift({...base.providers[0],code:"b",name:"other"});
  const merged=mergeAIDraft("providers",base,draft,current);assert(merged);
  assert.equal(merged.revision,current.revision);assert.deepEqual(merged.quotas,current.quotas);
  assert.deepEqual(merged.providers[0],current.providers[0]);assert.equal(merged.providers[1].notes,"new notes");
  assert.equal(merged.providers[1].name,"my name");assert.equal(merged.providers[1].apiKey,"new-secret");
  draft.providers[0].code="renamed";
  assert.equal(mergeAIDraft("providers",base,draft,current),undefined);
  assert.equal(mergeAIDraft("providers",base,draft,{...current,revision:undefined}),undefined);
  assert.equal(base.providers[0].code,"a");assert.equal(current.providers[1].name,"Provider");
});

test("A pending credential stays with its intended origin across reviewed merges", () => {
  const base = config(), local = config(), remote = config();
  local.providers[0].apiKey = "for-the-original-host";
  remote.providers[0].baseUrl = "https://OTHER.example.invalid/api";
  const proposed = mergeAIDraft("providers", base, local, remote); assert(proposed);
  assert.deepEqual(changedCredentialDestination(local, proposed), {provider:"a",origin:"https://other.example.invalid"});
  remote.providers[0].baseUrl = "https://EXAMPLE.invalid:443/other/path";
  assert.equal(changedCredentialDestination(local, remote), undefined);
});
