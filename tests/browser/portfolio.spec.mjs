import { test, expect } from '@playwright/test';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { normalizeRepository } from '../../src/core.js';

const config = JSON.parse(await readFile(new URL('../../site.config.json', import.meta.url), 'utf8'));
const snapshot = JSON.parse(await readFile(new URL('../../data/repositories.json', import.meta.url), 'utf8'));
const seed = normalizeRepository({ id: 1, name: 'fixture', owner: { login: config.username }, private: false }, config);
const browserErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  browserErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

function fixture(count = 3) {
  return {
    schemaVersion: 1,
    username: config.username,
    generatedAt: new Date().toISOString(),
    repositories: Array.from({ length: count }, (_, index) => {
      const name = `project-${String(index + 1).padStart(2, '0')}`;
      return { ...seed, id: index + 1, name, fullName: `${config.username}/${name}`, url: `https://github.com/${config.username}/${name}`, owner: config.username, description: index % 2 ? 'A developer tool for local systems' : 'A semantic retrieval experiment', language: index % 2 ? 'JavaScript' : 'Python', topics: index % 2 ? ['tools'] : ['rag'], overview: 'A safe, concise README overview.', hasReadme: true, stars: index * 3, forks: index, homepage: null, readmeUrl: `https://github.com/${config.username}/${name}#readme`, updatedAt: new Date(Date.UTC(2026, 9, index + 1)).toISOString() };
    })
  };
}

async function useFixture(page, data = fixture()) {
  await page.route('**/data/repositories.json', route => route.fulfill({ json: data }));
  await page.goto('./');
  await expect(page.locator('#project-grid')).toHaveAttribute('aria-busy', 'false');
}

async function openFilters(page, isMobile) {
  if (isMobile) await page.getByRole('button', { name: 'Filters', exact: true }).click();
}

test('published site loads real repositories and every asset under a Pages subpath', async ({ page }) => {
  const errors = [];
  const assets = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith('http://127.0.0.1:4173/')) assets.push({ url: response.url(), status: response.status() }); });
  await page.goto('./');
  await expect(page.locator('#project-grid')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.project-card')).toHaveCount(snapshot.repositories.length);
  await expect(page.locator('.featured-card')).toHaveCount(config.featured.filter(name => snapshot.repositories.some(repository => repository.name === name)).length);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Practical AI.');
  expect(errors).toEqual([]);
  expect(assets.every(asset => asset.status === 200 && asset.url.includes('/portfolio/'))).toBeTruthy();
  const anchors = await page.locator('a[href^="#"]').evaluateAll(links => links.map(link => link.getAttribute('href')).filter(href => href.length > 1));
  for (const href of anchors) await expect(page.locator(href)).toHaveCount(1);
});

test('real repository layout stays bounded across narrow and wide resizes', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#project-grid')).toHaveAttribute('aria-busy', 'false');
  for (const width of [320, 360, 390, 620, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
});

test('search, language and topic filters, sorting, and clear state', async ({ page, isMobile }) => {
  await useFixture(page);
  await page.locator('#project-search').fill('retrieval');
  await expect(page.locator('.project-card')).toHaveCount(2);
  await page.locator('#project-search').fill('');
  await openFilters(page, isMobile);
  await page.locator('#language-filter').selectOption('JavaScript');
  await expect(page.locator('.project-card')).toHaveCount(1);
  await page.locator('#language-filter').selectOption('');
  await page.locator('#topic-filter').selectOption('rag');
  await expect(page.locator('.project-card')).toHaveCount(2);
  await page.locator('#topic-filter').selectOption('');
  await page.locator('#sort-select').selectOption('name');
  await expect(page.locator('.project-card h3').first()).toHaveText('project-01');
  await page.locator('#sort-select').selectOption('stars');
  await expect(page.locator('.project-card h3').first()).toHaveText('project-03');
  await page.locator('#project-search').fill('no-such-project');
  await expect(page.getByText('No matching projects.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.project-card')).toHaveCount(3);
  await expect(page.locator('#project-search')).toBeFocused();
});

test('modal traps keyboard focus, shows safe metadata, and restores focus on Escape', async ({ page }) => {
  await useFixture(page);
  const opener = page.getByRole('button', { name: 'Details for project-03', exact: true });
  await opener.click();
  const dialog = page.locator('#project-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#dialog-title')).toBeFocused();
  await expect(dialog.getByRole('link', { name: 'Inspect the source' })).toHaveAttribute('href', `https://github.com/${config.username}/project-03`);
  await expect(dialog.getByText('A safe, concise README overview.')).toBeVisible();
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement.closest('dialog')?.id)).toBe('project-dialog');
  }
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement.closest('dialog')?.id)).toBe('project-dialog');
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test('command palette navigates to pages and opens project details', async ({ page }) => {
  await useFixture(page);
  await page.keyboard.press('Control+k');
  await expect(page.locator('#command-dialog')).toBeVisible();
  await page.locator('#command-input').fill('project-02');
  await page.keyboard.press('Enter');
  await expect(page.locator('#project-dialog')).toBeVisible();
  await expect(page.locator('#dialog-title')).toHaveText('project-02');
  await page.keyboard.press('Escape');
  await expect(page.locator('#open-command')).toBeFocused();
  await page.keyboard.press('Control+k');
  await page.locator('#command-input').fill('About');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#about$/);
  await expect(page.locator('#command-dialog')).not.toBeVisible();
});

test('missing fields, long names, and untrusted README content remain readable and inert', async ({ page }) => {
  const data = fixture(1);
  const repository = data.repositories[0];
  repository.name = 'a'.repeat(100);
  repository.fullName = `${config.username}/${repository.name}`;
  repository.url = `https://github.com/${repository.fullName}`;
  repository.readmeUrl = `${repository.url}#readme`;
  repository.description = '';
  repository.language = null;
  repository.updatedAt = null;
  repository.topics = [];
  repository.overview = '<img src=x onerror="window.injection=true"> is untrusted text.';
  await useFixture(page, data);
  await expect(page.getByText('Language not specified')).toBeVisible();
  await expect(page.getByText('No repository description yet.', { exact: false })).toBeVisible();
  await page.locator('.project-card h3 button').click();
  await expect(page.locator('#project-dialog')).toContainText('<img src=x');
  await expect(page.locator('#project-dialog img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injection)).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('empty repositories display a deliberate empty state', async ({ page }) => {
  await useFixture(page, fixture(0));
  await expect(page.getByText('A clean workbench.')).toBeVisible();
  await expect(page.locator('#featured-area')).toBeHidden();
  await expect(page.locator('#repository-count')).toHaveText('00');
});

for (const count of [1, 3, 10, 50]) {
  test(`${count} repositories fit the viewport without horizontal overflow`, async ({ page }) => {
    await useFixture(page, fixture(count));
    await expect(page.locator('.project-card')).toHaveCount(count);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    const boxes = await page.locator('.project-card').evaluateAll(cards => cards.map(card => { const box = card.getBoundingClientRect(); return { left: box.left, right: box.right }; }));
    const width = page.viewportSize().width;
    expect(boxes.every(box => box.left >= 0 && box.right <= width)).toBeTruthy();
  });
}

test('API fallback is public-only, and API failure does not discard existing data', async ({ page }) => {
  await page.clock.install();
  await page.route('**/data/repositories.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  let requests = 0;
  await page.route('https://api.github.com/users/**', route => {
    requests += 1;
    if (requests > 1) return route.fulfill({ status: 403, json: { message: 'rate limit' } });
    return route.fulfill({ json: [
      { id: 700, name: 'live-public', private: false, owner: { login: config.username }, language: 'Python' },
      { id: 701, name: 'never-show-private', private: true, owner: { login: config.username } }
    ] });
  });
  await page.goto('./');
  await expect(page.locator('.project-card')).toHaveCount(1);
  await expect(page.locator('.project-card')).toContainText('live-public');
  await page.clock.fastForward(61000);
  await page.locator('#refresh-projects').click();
  await expect(page.locator('#data-status')).toContainText('Keeping the last successful snapshot.');
  await expect(page.locator('.project-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.project-card')).toHaveCount(1);
  await expect(page.locator('#data-status')).toContainText('Browser-cached');
});

test('unavailable snapshot and API resolve to an actionable error, never infinite loading', async ({ page }) => {
  await page.route('**/data/repositories.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.route('https://api.github.com/**', route => route.fulfill({ status: 500, json: { message: 'Unavailable' } }));
  await page.goto('./');
  await expect(page.getByText('The connection needs a moment.')).toBeVisible();
  await expect(page.locator('#project-grid')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#refresh-projects')).toBeEnabled();
});

test('works when browser storage is blocked and motion is reduced', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage disabled'); } }));
  await useFixture(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  await page.locator('.project-card h3 button').first().click();
  expect(await page.locator('#project-dialog').evaluate(dialog => getComputedStyle(dialog).animationName)).toBe('none');
});

test('WCAG A/AA automated accessibility scan of page and project dialog', async ({ page }) => {
  if (snapshot.repositories.length) {
    await page.goto('./');
    await expect(page.locator('.project-card')).toHaveCount(snapshot.repositories.length);
  } else await useFixture(page);
  await page.addScriptTag({ content: axe.source });
  const scan = async () => page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(item => ({ target: item.target, summary: item.failureSummary })) })));
  expect(await scan()).toEqual([]);
  await page.locator('.project-card h3 button').first().click();
  await expect(page.locator('#project-dialog')).toBeVisible();
  expect(await scan()).toEqual([]);
});
