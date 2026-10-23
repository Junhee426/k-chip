import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { environmentCsv } from '../../src/model.js';

const root = fileURLToPath(new URL('../../src/', import.meta.url));
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
let server;
let browser;
let baseUrl;

before(async () => {
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
        response.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] || 'text/plain' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  try {
    await browser?.close();
  } finally {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
  }
});

async function openPage(t, pageName) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], 'browser must not raise uncaught errors');
  });
  await page.goto(baseUrl);
  if (pageName) await page.locator(`[data-page="${pageName}"]`).click();
  return page;
}

async function downloadProject(page, delay = 0) {
  const pending = page.waitForEvent('download');
  await page.locator('.top-actions [data-action="save"]').click({ delay });
  const download = await pending;
  assert.equal(download.suggestedFilename(), 'kleo-chip-scenario.json');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function waitForValue(page, selector, value) {
  try {
    await page.waitForFunction(
      ({ selector, value }) => document.querySelector(selector)?.value === value,
      { selector, value },
    );
  } catch (error) {
    throw new Error(
      `${selector}: expected ${value}, got ${await page.locator(selector).inputValue()}\nToast: ${await page.locator('#toast').textContent()}`,
      { cause: error },
    );
  }
}

for (const delay of [0, 100]) {
  test(`part edit is committed to the original before cloning (${delay} ms click)`, async t => {
    const page = await openPage(t, 'parts');
    const original = page.locator('tr.selected [data-part]');
    const originalId = await original.getAttribute('data-part');
    const count = await page.locator('[data-part]').count();
    const name = `Edited original ${delay}`;
    await page.locator('[data-path="part.name"]').fill(name);
    await page.locator('[data-action="clone-part"]').click({ delay });
    await page.waitForFunction(
      count => document.querySelectorAll('[data-part]').length === count,
      count + 1,
    );
    assert.equal(await page.locator(`[data-part="${originalId}"]`).textContent(), name);
    assert.equal(
      await page.locator('[data-path="part.name"]').inputValue(),
      name + ' \u00b7 \ubcf5\uc0ac',
    );
    assert.notEqual(
      await page.locator('tr.selected [data-part]').getAttribute('data-part'),
      originalId,
    );
  });

  test(`save immediately after a field edit includes the committed value (${delay} ms click)`, async t => {
    const page = await openPage(t, 'parts');
    const id = await page.locator('tr.selected [data-part]').getAttribute('data-part');
    const name = `Saved edit ${delay}`;
    await page.locator('[data-path="part.name"]').fill(name);
    const project = await downloadProject(page, delay);
    assert.equal(project.parts.find(part => part.id === id).name, name);
  });
}

test('environment drafts survive title, page, part and orbit changes within their context', async t => {
  const page = await openPage(t, 'data');
  const picker = '[data-path="selectedPartId"]';
  const partIds = await page
    .locator(`${picker} option`)
    .evaluateAll(options => options.map(o => o.value));
  const originalPart = await page.locator(picker).inputValue();
  const otherPart = partIds.find(id => id !== originalPart);
  const orbit = '[data-path="mission.orbitId"]';
  const originalOrbit = await page.locator(orbit).inputValue();
  const otherOrbit = await page
    .locator(`${orbit} option`)
    .evaluateAll(
      (options, original) => options.find(o => o.value !== original).value,
      originalOrbit,
    );
  await page.locator('[name="source"]').fill('Pending source for original context');
  await page.locator('[name="dose"]').fill('12.5');
  await page.locator('[data-path="title"]').fill('Changed scenario title');
  await page.locator('[data-path="title"]').press('Tab');
  await waitForValue(page, '[name="source"]', 'Pending source for original context');
  assert.equal(await page.locator('[name="dose"]').inputValue(), '12.5');
  await page.locator('[data-page="overview"]').click();
  await page.locator('[data-page="data"]').click();
  assert.equal(
    await page.locator('[name="source"]').inputValue(),
    'Pending source for original context',
  );
  await page.locator(picker).selectOption(otherPart);
  await page.locator('[name="source"]').fill('Pending source for other part');
  await page.locator(picker).selectOption(originalPart);
  await waitForValue(page, '[name="source"]', 'Pending source for original context');
  await page.locator(orbit).selectOption(otherOrbit);
  await page.locator('[name="source"]').fill('Pending source for other orbit');
  await page.locator(orbit).selectOption(originalOrbit);
  await waitForValue(page, '[name="source"]', 'Pending source for original context');
  await page.locator(picker).selectOption(otherPart);
  await waitForValue(page, '[name="source"]', 'Pending source for other part');
});

test('applying an environment draft saves it and reset clears pending drafts', async t => {
  const page = await openPage(t, 'data');
  const id = await page.locator('[data-path="selectedPartId"]').inputValue();
  const orbit = await page.locator('[data-path="mission.orbitId"]').inputValue();
  const originalSource = await page.locator('[name="source"]').inputValue();
  await page.locator('[name="source"]').fill('Committed environment source');
  await page.locator('[name="dose"]').fill('12.5');
  await page.locator('#env-editor button[type="submit"]').click();
  const project = await downloadProject(page);
  const row = project.environments.find(
    row => row.partId === id && row.orbitId === orbit && row.shieldMm === project.mission.shieldMm,
  );
  assert.equal(row.source, 'Committed environment source');
  assert.equal(row.annualTidKrad, 12.5);
  await page.locator('[data-page="overview"]').click();
  await page.locator('[data-page="data"]').click();
  assert.equal(await page.locator('[name="source"]').inputValue(), 'Committed environment source');
  await page.locator('[name="source"]').fill('Discard this pending draft');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-action="reset"]').click();
  await waitForValue(page, '[name="source"]', originalSource);
  await page.locator('[data-page="overview"]').click();
  await page.locator('[data-page="data"]').click();
  assert.equal(await page.locator('[name="source"]').inputValue(), originalSource);
});

test('loading a project or replacing environments clears pending environment drafts', async t => {
  const page = await openPage(t, 'data');
  const project = await downloadProject(page);
  const originalSource = await page.locator('[name="source"]').inputValue();
  await page.locator('[name="source"]').fill('Draft before project load');
  await page.locator('#project-file').setInputFiles({
    name: 'saved-scenario.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await waitForValue(page, '[name="source"]', originalSource);
  await page.locator('[name="source"]').fill('Draft before environment import');
  for (const row of project.environments) row.source = 'Imported environment source';
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#environment-file').setInputFiles({
    name: 'environment.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(environmentCsv(project)),
  });
  await waitForValue(page, '[name="source"]', 'Imported environment source');
  await page.locator('[data-page="overview"]').click();
  await page.locator('[data-page="data"]').click();
  assert.equal(await page.locator('[name="source"]').inputValue(), 'Imported environment source');
});

test('changing shield then immediately applying cannot save a form from the previous context', async t => {
  const page = await openPage(t, 'data');
  const before = await downloadProject(page);
  await page.locator('[name="dose"]').fill('99');
  await page.locator('[name="source"]').fill('Draft for previous shield');
  await page.locator('[data-path="mission.shieldMm"]').fill('3');
  await page.locator('#env-editor button[type="submit"]').click({ delay: 100 });
  const after = await downloadProject(page);
  assert.equal(after.mission.shieldMm, 3);
  assert.deepEqual(after.environments, before.environments);
  assert.notEqual(await page.locator('[name="source"]').inputValue(), 'Draft for previous shield');
});

test('changing shared environment conditions invalidates drafts for other affected parts', async t => {
  const page = await openPage(t, 'data');
  const picker = '[data-path="selectedPartId"]';
  const originalPart = await page.locator(picker).inputValue();
  const otherPart = await page
    .locator(`${picker} option`)
    .evaluateAll(
      (options, original) => options.find(o => o.value !== original).value,
      originalPart,
    );
  await page.locator('[name="seu"]').fill('0.00123');
  await page.locator(picker).selectOption(otherPart);
  await page.locator('[name="dose"]').fill('12.5');
  await page.locator('[name="source"]').fill('New shared environment');
  await page.locator('#env-editor button[type="submit"]').click();
  await page.locator(picker).selectOption(originalPart);
  await waitForValue(page, '[name="source"]', 'New shared environment');
  assert.equal(await page.locator('[name="dose"]').inputValue(), '12.5');
  assert.equal(await page.locator('[name="seu"]').inputValue(), '');
});

test('changing only another part rate preserves a pending environment draft', async t => {
  const page = await openPage(t, 'data');
  const picker = '[data-path="selectedPartId"]';
  const originalPart = await page.locator(picker).inputValue();
  const otherPart = await page
    .locator(`${picker} option`)
    .evaluateAll(
      (options, original) => options.find(o => o.value !== original).value,
      originalPart,
    );
  await page.locator('[name="seu"]').fill('0.00123');
  await page.locator(picker).selectOption(otherPart);
  await page.locator('[name="seu"]').fill('0.00456');
  await page.locator('#env-editor button[type="submit"]').click();
  await page.locator(picker).selectOption(originalPart);
  await waitForValue(page, '[name="seu"]', '0.00123');
});

test('lab data input survives rendering and the record button commits the draft', async t => {
  const page = await openPage(t);
  const hex = '1234567890ABCDEF';
  await page.locator('#lab-hex').fill(hex);
  await page.locator('[data-lab-view="ecc"]').click();
  assert.equal(await page.locator('#lab-hex').inputValue(), hex);
  await page.locator('[data-lab-bit="0"]').click();
  assert.equal(await page.locator('#lab-hex').inputValue(), hex);
  await page.locator('#lab-data-form button[type="submit"]').click();
  const project = await downloadProject(page);
  assert.equal(project.lab.hex, hex);
});

test('Tab commits the edited field and keeps focus on the next field', async t => {
  const page = await openPage(t, 'parts');
  const id = await page.locator('tr.selected [data-part]').getAttribute('data-part');
  const name = 'Keyboard edit';
  await page.locator('[data-path="part.name"]').fill(name);
  await page.locator('[data-path="part.name"]').press('Tab');
  await page.waitForFunction(() => document.activeElement?.dataset.path === 'part.vendor');
  assert.equal(await page.locator(`[data-part="${id}"]`).textContent(), name);
  await page.keyboard.type('Updated manufacturer');
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => document.activeElement?.dataset.path === 'part.densityBits');
  const project = await downloadProject(page);
  assert.equal(project.parts.find(part => part.id === id).vendor, 'Updated manufacturer');
});
