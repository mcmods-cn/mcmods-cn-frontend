import assert from "node:assert/strict";
import test from "node:test";
import { recipeCandidateChance } from "./recipe-slot-chance.mts";
import { recipeMaterialAmount, recipeSlotAmountLabel } from "./recipe-slot-amount.mts";

// The global and project cards use the same projection. The production browser
// spec also checks the rendered label beside each output and its quantity.
for (const role of ["output", "byproduct"]) {
  test(`${role} uses the current candidate and leaves its amount and unit intact`, () => {
    const slot = { role, probability: .75 };
    const alternatives = [
      { amount: 2, unit: "mB", probability: .25 },
      { amount: 0, chance_available: false },
      { amount: 3, chance_available: true, chance: 0, chance_percent: 0 },
    ];
    const before = structuredClone(alternatives);
    assert.deepEqual(recipeCandidateChance(alternatives[0], slot, "en_us", "en-US"), { label: "25%", title: "25%" });
    assert.equal(recipeSlotAmountLabel(alternatives[0]), "2 mB");
    assert.equal(recipeCandidateChance(alternatives[1], slot, "en_us", "en-US"), null);
    assert.deepEqual(recipeCandidateChance(alternatives[2], slot, "en_us", "en-US"), { label: "0%", title: "0%" });
    assert.deepEqual(alternatives, before);

    const unavailable = { chance_available: false, chance: null, chance_percent: null, chance_text: "Unknown" };
    assert.equal(recipeCandidateChance(unavailable, slot, "en_us", "en-US"), null);
    assert.equal(recipeCandidateChance({ byproduct: true }, slot, "en_us", "en-US"), null);
    assert.deepEqual(recipeCandidateChance({}, slot, "en_us", "en-US"), { label: "75%", title: "75%" });
    assert.equal(recipeCandidateChance({}, { ...slot, chance_available: false }, "en_us", "en-US"), null);
  });
}

test("bounded probabilities preserve their comparator, localized tooltip and UI number formatting", () => {
  for (const [comparator, symbol] of Object.entries({ exact: "", less_than: "<", greater_than: ">", less_than_or_equal: "≤", greater_than_or_equal: "≥" })) {
    const candidate = { chance_percent: 1.5, chance_comparator: comparator, chance_texts: { fr_fr: "Texte JEI" }, chance_text: "JEI text" };
    const slot = { semantic_role: "byproduct" };
    assert.deepEqual(recipeCandidateChance(candidate, slot, "fr_fr", "fr-FR"), { label: symbol + "1,5%", title: "Texte JEI" });
    assert.deepEqual(recipeCandidateChance(candidate, slot, "en_us", "en-US"), { label: symbol + "1.5%", title: "JEI text" });
  }
});

test("legacy textual chances and numeric probability are both supported without inventing zero", () => {
  const slot = { role: "output", chance_texts: { zh_cn: "低概率" }, chance_text: "Rare" };
  assert.deepEqual(recipeCandidateChance({}, slot, "zh_cn", "zh-CN"), { label: "低概率", title: "低概率" });
  assert.deepEqual(recipeCandidateChance({}, slot, "ja_jp", "ja-JP"), { label: "Rare", title: "Rare" });
  assert.deepEqual(recipeCandidateChance({ chance_text: "Candidate" }, slot, "en_us", "en-US"), { label: "Candidate", title: "Candidate" });
  assert.equal(recipeCandidateChance({ chance_percent: .00001 }, { role: "output" }, "en_us", "en-US")?.label, "0.00001%");
  for (const invalid of [null, undefined, "", false, [], -1, 2]) {
    assert.equal(recipeCandidateChance({ chance: invalid }, { role: "output" }, "en_us", "en-US"), null);
  }
  for (const role of ["input", "catalyst", "", undefined]) {
    assert.equal(recipeCandidateChance({ chance: .25 }, { role }, "en_us", "en-US"), null);
  }
});

test("materials with missing quantity never count as one, and known counts keep their units", () => {
  assert.equal(recipeMaterialAmount({ amount: null }), "");
  assert.equal(recipeMaterialAmount({ amount: 0 }), "0");
  assert.equal(recipeMaterialAmount({ count: 1 }), "1");
  assert.equal(recipeMaterialAmount({ amount: 250, amount_unit: "mB" }), "250mB");
  assert.equal(recipeMaterialAmount({ amount_text: "1–3" }), "1–3");
});
