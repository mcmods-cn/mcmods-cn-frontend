import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
const frontend = resolve(process.env.MCMODS_AUDIT_FRONTEND_CHECKOUT || fileURLToPath(new URL('../', import.meta.url)));
assert.equal(JSON.parse(await readFile(join(frontend, 'package.json'), 'utf8')).name, 'mcmods-cn-frontend');
const { chromium } = createRequire(frontend + '/package.json')('playwright');
const runtimePath = process.env.MCMODS_AUDIT_RECIPE_RUNTIME;
assert(runtimePath);
const runtime = JSON.parse(await readFile(runtimePath, 'utf8'));
assert.equal(runtime.owner, 'mcmods-live-recipe-catalog');
const originURL = new URL(runtime.frontendOrigin);
assert.equal(originURL.hostname, '127.0.0.1');
assert(['http:', 'https:'].includes(originURL.protocol));
assert.equal(originURL.pathname, '/');
assert(!originURL.username && !originURL.password && !originURL.search && !originURL.hash);
const ownOrigin = originURL.origin;
const head = execFileSync('git', ['-C', frontend, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(head, runtime.repoRevisions['mcmods-cn-frontend']?.commit ?? runtime.repoRevisions.frontend?.commit ?? runtime.repoRevisions.frontend);
assert.equal(execFileSync('git', ['-C', frontend, 'status', '--porcelain'], { encoding: 'utf8' }).trim(), '');
const run = String(Date.now());
const directory = join(dirname(runtimePath), 'browser-recipe-' + run);
await mkdir(directory, { mode: 0o700 });
const sha = raw => createHash('sha256').update(raw).digest('hex');
assert.equal(runtime.cont002.expectedAmount, 3);
assert.equal(runtime.cont002.expectedProbability, .5);
const pendingResponseCaptures = [];
const report = { caseIds: ['CONT-002', 'CONT-003', 'GR-010'], runId: run, startedAt: new Date().toISOString(), status: 'IN_PROGRESS', driverSHA256: sha(await readFile(fileURLToPath(import.meta.url))), frontend: { checkout: frontend, commit: head, clean: true }, fixedCombination: runtime.repoRevisions, apiInterception: false, transport: 'Actual same-origin Next development + mounted HTTP + PostgreSQL, faithful HTTP/WS forwarding; no response rewriting', roles: ['anonymous public reader'], milestones: [], apiObservations: [], pageErrors: [] };
const save = () => writeFile(join(directory, 'browser-result.json'), JSON.stringify(report, null, 2) + '\n');
await save();
const browser = await chromium.launch({ headless: false });
try {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: 'mcmods-ui-locale', value: 'en-US', url: ownOrigin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.pageErrors.push(error.message));
    page.on('response', response => { const capture = (async () => { const u = new URL(response.url()); if (u.origin !== ownOrigin || !u.pathname.startsWith('/api/v1/') || !(u.pathname.includes('recipe') || u.pathname.includes('catalog')))
        return; const raw = await response.body().catch(() => null); report.apiObservations.push({ at: new Date().toISOString(), path: u.pathname, query: u.search, status: response.status(), decodedBodySHA256: raw ? sha(raw) : null }); })(); pendingResponseCaptures.push(capture); });
    const cases = [['manual-only', runtime.cont002.manualOnly.recipePublicId, runtime.cont002.manualOnly.typePublicId, true], ['import-only', runtime.cont002.importedOnly.recipePublicId, runtime.cont002.importedOnly.typePublicId, false], ['mixed-manual', runtime.cont002.mixed.manualRecipePublicId, runtime.cont002.mixed.typePublicId, true], ['mixed-imported', runtime.cont002.mixed.importedRecipePublicId, runtime.cont002.mixed.typePublicId, false]];
    for (const [name, id, typeId, manual] of cases) {
        const expectedCatalog = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/recipe-types/' + typeId + '/catalog');
        await page.goto(ownOrigin + '/recipe-types?publicId=' + encodeURIComponent(typeId));
        const catalogResponse = await expectedCatalog;
        assert.equal(catalogResponse.status(), 200);
        const catalog = (await catalogResponse.json()).data;
        const card = page.locator('#recipe-' + id);
        await card.waitFor();
        if (manual) {
            await card.getByText(String(runtime.cont002.expectedAmount), { exact: true }).waitFor();
            await card.getByText('50%', { exact: true }).waitFor();
        }
        const listed = await page.locator('[id^="recipe-"]').evaluateAll(nodes => nodes.map(node => node.id.slice(7)));
        assert.deepEqual([...listed].sort(), catalog.recipes.map(x => x.publicId).sort());
        if (name === 'manual-only')
            assert.deepEqual(listed, [id]);
        if (name === 'import-only')
            assert(!listed.includes(runtime.cont002.mixed.manualRecipePublicId));
        if (name === 'mixed-manual' || name === 'mixed-imported') {
            assert(listed.includes(runtime.cont002.mixed.manualRecipePublicId));
            assert(listed.includes(runtime.cont002.mixed.importedRecipePublicId));
        }
        report.milestones.push({ name, step: 'type-list', id, typeId, listed, actualAPITotal: catalog.total, manual, quantityVisible: manual ? await card.getByText('3', { exact: true }).count() : undefined, probabilityVisible: manual ? await card.getByText('50%', { exact: true }).count() : undefined });
        await page.goto(ownOrigin + '/' + encodeURIComponent(id));
        await page.waitForURL(u => u.pathname === '/recipe-types' && u.searchParams.get('recipePublicId') === id);
        await page.locator('#recipe-' + id).waitFor();
        if (manual) {
            await page.locator('#recipe-' + id).getByText('3', { exact: true }).waitFor();
            await page.locator('#recipe-' + id).getByText('50%', { exact: true }).waitFor();
        }
        await page.screenshot({ path: join(directory, name + '-detail.png'), fullPage: true });
        report.milestones.push({ name, step: 'exact-shortlink', id, path: new URL(page.url()).pathname, query: new URL(page.url()).search });
        await save();
        await page.reload();
        await page.locator('#recipe-' + id).waitFor();
        report.milestones.push({ name, step: 'refresh', id });
        await page.goto(ownOrigin + '/recipe-types');
        await page.getByRole('heading', { name: 'Recipe methods', exact: true }).waitFor();
        await page.goBack();
        await page.locator('#recipe-' + id).waitFor();
        await page.goForward();
        await page.getByRole('heading', { name: 'Recipe methods', exact: true }).waitFor();
        await page.goBack();
        await page.locator('#recipe-' + id).waitFor();
        report.milestones.push({ name, step: 'native-history-back-forward-back', id });
        await save();
    }
    for (const [label, typeId] of [['manual-only', runtime.cont002.manualOnly.typePublicId], ['mixed', runtime.cont002.mixed.typePublicId]]) {
        await page.goto(ownOrigin + '/recipe-types?publicId=' + typeId + '&page=2');
        await page.waitForURL(u => u.searchParams.get('publicId') === typeId && !u.searchParams.has('page'));
        await page.locator('[id^="recipe-"]').first().waitFor();
        report.milestones.push({ name: label, step: 'out-of-range-page-corrected', typeId, path: page.url() });
    }
    const geometry = runtime.gr010?.cases ?? (runtime.gr010Item ? [runtime.gr010Item] : []);
    report.geometryCases = [];
    for (const mode of [{ name: 'desktop', viewport: { width: 1440, height: 1000 }, touch: false, scale: 1 }, { name: 'touch', viewport: { width: 390, height: 844 }, touch: true, scale: 2 }]) {
        const c = await browser.newContext({ locale: 'en-US', viewport: mode.viewport, hasTouch: mode.touch, deviceScaleFactor: mode.scale });
        await c.addCookies([{ name: 'mcmods-ui-locale', value: 'en-US', url: ownOrigin }]);
        const p = await c.newPage();
        p.setDefaultTimeout(20000);
        for (const fixture of geometry) {
            const id = fixture.recipePublicId;
            const rendered = p.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/catalog/recipes/' + id + '/render');
            await p.goto(ownOrigin + '/recipe-types?recipePublicId=' + id);
            const response = await rendered;
            assert.equal(response.status(), 200);
            const body = (await response.json()).data;
            await p.locator('#recipe-' + id).waitFor();
            const slots = (body.layout.slots ?? []).filter(s => s.ingredient_present !== false && s.coordinates_available !== false && Array.isArray(s.alternatives) && s.alternatives.length);
            const interactions = p.locator('#recipe-' + id + ' a.absolute.group, #recipe-' + id + ' span[tabindex="0"].absolute.group');
            assert.equal(await interactions.count(), slots.length);
            let checked = 0;
            for (let index = 0; index < slots.length; index++) {
                const s = slots[index], slot = interactions.nth(index), r = s.rect, v = s.visual_rect ?? r, visual = slot.locator('span.pointer-events-none.absolute.block').first();
                assert.deepEqual(await slot.evaluate(n => ({ x: n.style.left, y: n.style.top, w: n.style.width, h: n.style.height })), { x: r.x * 2 + 'px', y: r.y * 2 + 'px', w: r.width * 2 + 'px', h: r.height * 2 + 'px' });
                assert.deepEqual(await visual.evaluate(n => ({ x: n.style.left, y: n.style.top, w: n.style.width, h: n.style.height })), { x: (v.x - r.x) * 2 + 'px', y: (v.y - r.y) * 2 + 'px', w: v.width * 2 + 'px', h: v.height * 2 + 'px' });
                await slot.scrollIntoViewIfNeeded();
                const bounds = await slot.boundingBox();
                assert(bounds);
                const hit = await slot.evaluate(n => { const b = n.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + 1, b.top + 1); return hit === n || n.contains(hit); });
                assert(hit, 'rect edge must remain interactive independently of visual_rect');
                if (mode.touch)
                    await slot.tap({ position: { x: 1, y: 1 } });
                else
                    await p.mouse.move(bounds.x + 1, bounds.y + 1);
                // Real keyboard navigation, rather than setting document.activeElement.
                await p.locator('body').click({ position: { x: 2, y: 2 } });
                let focused = false, tabs = 0;
                for (; tabs < 120; tabs++) {
                    await p.keyboard.press('Tab');
                    if (await slot.evaluate(n => n === document.activeElement)) {
                        focused = true;
                        break;
                    }
                }
                assert(focused, 'keyboard Tab must reach actual rect target');
                report.geometryCases.push({ mode: mode.name, recipePublicId: id, kind: fixture.kind, slotIndex: index, rect: r, visualRect: v, hitEdge: true, keyboardFocus: true, tabs: tabs + 1, touch: mode.touch, deviceScaleFactor: mode.scale });
                checked++;
            }
            assert(checked > 0);
            await p.screenshot({ path: join(directory, 'geometry-' + mode.name + '-' + fixture.kind + '.png'), fullPage: true });
            await save();
        }
        await c.close();
    }
    report.geometryCoverage = { cases: geometry.length, declared: geometry.map(c => c.kind), notInferred: ['Unprovided fluid/gas cases', 'browser pinch zoom if no actual viewport scale proof'] };
    assert.deepEqual(report.pageErrors, []);
    report.status = 'PASS_RECORDED_REAL_RECIPE_CATALOG_DETAIL_QUANTITY_NAVIGATION_AND_AVAILABLE_GEOMETRY';
}
catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    throw error;
}
finally {
    await Promise.allSettled(pendingResponseCaptures);
    report.finishedAt = new Date().toISOString();
    await save();
    await browser.close();
    console.log(JSON.stringify({ status: report.status, report: join(directory, 'browser-result.json'), milestones: report.milestones.length, geometryChecks: report.geometryCases?.length ?? 0 }));
}
