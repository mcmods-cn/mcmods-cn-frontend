import { performance } from "node:perf_hooks";
import { buildModContentLayoutRenderIndex } from "../app/_lib/mod-content-layout-render-index.mts";

const scenarios = [
  { name: "10k-across-1000-categories", resources: 10_000, categories: 1_000 },
  { name: "20k-across-1000-categories", resources: 20_000, categories: 1_000 },
  { name: "20k-single-category", resources: 20_000, categories: 1 },
];

for (const scenario of scenarios) {
  const resources = Array.from({ length: scenario.resources }, (_, index) => ({
    resourcePublicId: `resource-${index}`,
    sectionPublicId: `category-${index % scenario.categories}`,
    ordinal: Math.floor(index / scenario.categories),
    similarGroupId: `group-${Math.floor(index / 4)}`,
  }));
  const samples: number[] = [];
  let sectionCount = 0;
  let indexedResourceCount = 0;
  for (let run = 0; run < 9; run++) {
    const started = performance.now();
    const index = buildModContentLayoutRenderIndex(resources, "root");
    samples.push(performance.now() - started);
    sectionCount = index.sections.size;
    indexedResourceCount = index.resourceByID.size;
  }
  samples.sort((left, right) => left - right);
  process.stdout.write(`${JSON.stringify({
    scenario: scenario.name,
    resources: scenario.resources,
    categories: scenario.categories,
    sections: sectionCount,
    indexedResources: indexedResourceCount,
    medianMs: Number(samples[Math.floor(samples.length / 2)]!.toFixed(3)),
    maxMs: Number(samples.at(-1)!.toFixed(3)),
  })}\n`);
}
