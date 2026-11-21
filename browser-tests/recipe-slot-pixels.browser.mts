import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { strFromU8, unzipSync } from "fflate";
import sharp from "sharp";
import { ProductionBrowserFixture } from "./fixture.mts";

type Rect = { x: number; y: number; width: number; height: number };
type Slot = { slot_id: string; role: string; rect: Rect; visual_rect?: Rect };
type Sample = {
  canvas: { width: number; height: number };
  background: Uint8Array;
  icon: Uint8Array;
  slot: Slot;
  kind: "item" | "fluid";
};

const fixture = new ProductionBrowserFixture();
before(() => fixture.start());
after(() => fixture.close());

async function solidPNG(width: number, height: number, color: string) {
  return sharp({ create: { width, height, channels: 4, background: color } }).png().toBuffer();
}

function containsPoint(rect: Rect, x: number, y: number) {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

// The browser paints the icon and badge over a neutral recipe background. Read
// the pixels of the composed page, not the DOM image box or the downloaded PNG.
async function checkSlot(sample: Sample, expected: Rect, color: (r: number, g: number, b: number) => boolean) {
  const revision = "pixeltest", id = "sample:output";
  const browser = await fixture.page(({ path, url }) => {
    if (path === "/api/v1/catalog/recipes/slotpixels/render") return { data: {
      publicId: "slotpixels", recipeId: "sample:layout", revisionId: revision,
      layout: { canvas: sample.canvas, background: "background.png", background_contains_ingredients: false,
        slots: [{ ...sample.slot, alternatives: [{ id, kind: sample.kind, amount: 4, iconPath: "icon.png", sourceRevisionId: revision }] }] },
    } };
    if (path === "/api/v1/export-revisions/" + revision + "/assets/content") {
      const asset = url.searchParams.get("path");
      if (asset === "icon.png" || asset === "background.png") {
        return { bytes: asset === "icon.png" ? sample.icon : sample.background, contentType: "image/png" };
      }
    }
  }, { deviceScaleFactor: 1, reducedMotion: "reduce" });
  try {
    const { page } = browser;
    await page.goto(fixture.origin + "/recipe-types?recipePublicId=slotpixels");
    const card = page.locator("#recipe-slotpixels");
    const canvas = card.locator('img[alt=""]').locator("..");
    const target = card.locator('[aria-label="sample:output (sample:output)"]');
    await target.waitFor();
    await target.getByText("4", { exact: true }).waitFor();
    // A CSS tank background has no img.decode(). Decode its actual resource
    // too so the screenshot measures a completed render in both modes.
    await canvas.evaluate(async element => {
      await Promise.all(Array.from(element.querySelectorAll("img"), image => image.decode()));
      const tank = element.querySelector('[role="img"]');
      if (tank) {
        const source = getComputedStyle(tank).backgroundImage.match(/^url\("(.*)"\)$/)?.[1];
        if (!source) throw new Error("Missing tank image");
        const image = new Image();
        image.src = source;
        await image.decode();
      }
    });
    const viewport = await canvas.boundingBox(), hit = await target.boundingBox();
    const drawing = await target.getByRole("img").boundingBox();
    assert(viewport && hit && drawing);
    const scale = viewport.width / sample.canvas.width;
    const relativeToCanvas = (box: Rect) => [box.x - viewport.x, box.y - viewport.y, box.width, box.height];
    assert.deepEqual(relativeToCanvas(hit),
      [sample.slot.rect.x, sample.slot.rect.y, sample.slot.rect.width, sample.slot.rect.height].map(n => n * scale));
    // Grid centering can place the canvas at a fractional CSS pixel. Clip its
    // interior to integer pixels, then translate each pixel center back to JEI.
    const left = Math.ceil(viewport.x), top = Math.ceil(viewport.y);
    const clip = { x: left, y: top, width: Math.floor(viewport.x + viewport.width) - left, height: Math.floor(viewport.y + viewport.height) - top };
    const raster = await sharp(await page.screenshot({ clip, scale: "css" })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = raster.info;
    assert.equal(width, clip.width);
    assert.equal(height, clip.height);
    let count = 0, outsideHit = 0, outsideExpected = 0;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels;
        if (!color(raster.data[i], raster.data[i + 1], raster.data[i + 2])) continue;
        count++;
        const mx = (left - viewport.x + x + 0.5) / scale, my = (top - viewport.y + y + 0.5) / scale;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        if (!containsPoint(expected, mx, my)) outsideExpected++;
        if (!containsPoint(sample.slot.rect, mx, my)) outsideHit++;
      }
    }
    assert(count > 0, "The expected icon color must appear in the composed recipe");
    const pixels = {
      canvasSizeCSS: [viewport.width, viewport.height], hitCSS: relativeToCanvas(hit), drawingCSS: relativeToCanvas(drawing),
      markerBoundsInClip: [minX, minY, maxX + 1, maxY + 1], markerPixels: count, outsideHit, outsideExpected,
    };
    assert.equal(outsideExpected, 0, `Icon outside intended rectangle: ${JSON.stringify(pixels)}`);
    if (sample.kind === "fluid") {
      assert(outsideHit > 0, "Decorated tank must visibly extend beyond its hit area");
      const point = { x: viewport.x + expected.x * scale + 1, y: viewport.y + expected.y * scale + 1 };
      assert.equal(await target.evaluate((node, p) => node.contains(document.elementFromPoint(p.x, p.y)), point), false);
      await card.getByRole("button").first().focus();
      await page.keyboard.press("Tab");
      assert.equal(await target.evaluate(node => node === document.activeElement), true);
    }
    return pixels;
  } finally { await browser.close(); }
}

test("Recipe icon pixels follow the draw rectangle while the keyboard and pointer target retain the hit rectangle", async () => {
  const canvas = { width: 90, height: 40 }, background = await solidPNG(180, 80, "#909090");
  const rect = { x: 48, y: 9, width: 16, height: 16 };
  const slot = { slot_id: "output_0", role: "output", rect };
  await checkSlot({ canvas, background, slot, icon: await solidPNG(32, 32, "#fdc21b"), kind: "item" }, rect,
    (r, g, b) => r === 253 && g === 194 && b === 27);
  const visual = { x: 5, y: 3, width: 66, height: 27 };
  await checkSlot({ canvas, background, slot: { ...slot, visual_rect: visual }, icon: await solidPNG(32, 32, "#12d3ed"), kind: "fluid" }, visual,
    (r, g, b) => r === 18 && g === 211 && b === 237);
});

// For a recorded Minecraft 1.20.1 vanilla all-profile ZIP, compare the actual
// icon with the vanilla crafting output square. HTTP is a fixture here. The
// separately maintained multipart journey verifies real import and publication.
const archivePath = process.env.MCMODS_TEST_VANILLA_GEOMETRY_ZIP;
test("A real vanilla torch flame is painted inside its crafting output slot", {
  skip: archivePath ? false : "MCMODS_TEST_VANILLA_GEOMETRY_ZIP is unset",
}, async t => {
  assert(archivePath);
  const source = await readFile(archivePath);
  const index = "recipes/jei/categories.json", templates = "recipes/jei/templates/minecraft/crafting.json";
  const bindings = "recipes/jei/recipes/minecraft/crafting.json", icon = "icons/items/32/minecraft/torch.png";
  const meta = unzipSync(source, { filter: file => [index, templates, bindings].includes(file.name) });
  const categories = JSON.parse(strFromU8(meta[index])).categories as { recipe_type_id: string; canvas: Sample["canvas"] }[];
  const recipes = JSON.parse(strFromU8(meta[bindings])).recipes as {
    recipe_id: string; template_id: string; bindings: { slot_id: string; alternatives: { resource_location: string; amount: number }[] }[];
  }[];
  const layouts = JSON.parse(strFromU8(meta[templates])).templates as {
    template_id: string; background: string; background_contains_ingredients: boolean; slots: Slot[];
  }[];
  const category = categories.find(value => value.recipe_type_id === "minecraft:crafting");
  const recipe = recipes.find(value => value.recipe_id === "minecraft:torch");
  const template = layouts.find(value => value.template_id === recipe?.template_id);
  const slot = template?.slots.find(value => value.role === "output");
  assert(category && recipe && template && slot);
  assert.equal(template.background_contains_ingredients, false);
  assert(recipe.bindings.find(value => value.slot_id === slot.slot_id)?.alternatives.some(value => value.resource_location === "minecraft:torch" && value.amount === 4));
  const images = unzipSync(source, { filter: file => file.name === template.background || file.name === icon });
  const torch = await sharp(images[icon]).ensureAlpha().raw().toBuffer();
  const rgb = (r: number, g: number, b: number) => (r * 256 + g) * 256 + b;
  const flameColors = new Set<number>();
  for (let i = 0; i < torch.length; i += 4) {
    const [r, g, b, a] = torch.subarray(i, i + 4);
    if (a === 255 && r > 210 && g > 115 && b < 160 && r > g) flameColors.add(rgb(r, g, b));
  }
  assert(flameColors.size > 0, "Missing bright torch colors in source PNG");
  const background = await sharp(images[template.background]).ensureAlpha().raw().toBuffer();
  for (let i = 0; i < background.length; i += 4) {
    assert(background[i + 3] === 0 || !flameColors.has(rgb(background[i], background[i + 1], background[i + 2])),
      "The unfilled crafting background contains the marker color");
  }
  const pixels = await checkSlot({ canvas: category.canvas, background: images[template.background], icon: images[icon], slot, kind: "item" },
    slot.rect, (r, g, b) => flameColors.has(rgb(r, g, b)));
  t.diagnostic(JSON.stringify(pixels));
});
