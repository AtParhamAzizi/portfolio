import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { normalizeRepository } from '../../src/core.js';

const config = JSON.parse(await readFile(new URL('../../site.config.json', import.meta.url), 'utf8'));

async function repositoryFixture(page, overrides = {}) {
  const repository = { ...normalizeRepository({ id: 999, name: 'readme-test', private: false, owner: { login: config.username } }, config), ...overrides };
  await page.route('**/data/repositories.json', route => route.fulfill({ json: { schemaVersion: 1, username: config.username, generatedAt: new Date().toISOString(), repositories: [repository] } }));
  await page.goto('./');
  await expect(page.locator('.project-card')).toHaveCount(1);
}

test('README retrieval is lazy, cached, and source/website links are real data', async ({ page }) => {
  let requests = 0;
  await page.route('https://api.github.com/repos/**/readme', route => {
    requests += 1;
    return route.fulfill({ json: { encoding: 'base64', content: Buffer.from('# A project\n\nA **local** README overview.').toString('base64') } });
  });
  await repositoryFixture(page, { homepage: 'https://example.org/demo' });
  expect(requests).toBe(0);
  await expect(page.locator('.project-card').getByRole('link', { name: 'Website' })).toHaveAttribute('href', 'https://example.org/demo');
  const opener = page.getByRole('button', { name: 'Details for readme-test' });
  await opener.click();
  await expect(page.locator('#project-dialog')).toContainText('A local README overview.');
  await expect(page.locator('#project-dialog').getByRole('link', { name: 'Project website' })).toHaveAttribute('rel', 'noopener noreferrer');
  await page.getByRole('button', { name: 'Close project details' }).click();
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(page.locator('#project-dialog')).toContainText('A local README overview.');
  expect(requests).toBe(1);
  await page.mouse.click(5, 5);
  await expect(page.locator('#project-dialog')).not.toBeVisible();
});

test('known missing and rate-limited READMEs do not block project inspection', async ({ page }) => {
  let requests = 0;
  await page.route('https://api.github.com/repos/**/readme', route => { requests += 1; return route.fulfill({ status: 403, json: { message: 'Rate limited' } }); });
  await repositoryFixture(page, { hasReadme: false });
  await page.locator('.project-card h3 button').click();
  await expect(page.locator('#project-dialog')).toContainText('No README is available');
  expect(requests).toBe(0);
  await page.keyboard.press('Escape');
  await page.unroute('**/data/repositories.json');
  await repositoryFixture(page);
  await page.locator('.project-card h3 button').click();
  await expect(page.locator('#project-dialog')).toContainText('The README is temporarily unavailable.');
  await expect(page.locator('#project-dialog').getByRole('link', { name: 'Inspect the source' })).toBeVisible();
  expect(requests).toBe(1);
});

test('invalid account configuration produces a bounded, actionable error', async ({ page }) => {
  await page.route('**/site.config.json', route => route.fulfill({ json: { ...config, username: '' } }));
  await page.goto('./');
  await expect(page.locator('#data-status')).toContainText('Configuration error:');
  await expect(page.getByText('The workspace needs configuration.')).toBeVisible();
  await expect(page.locator('#project-grid')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#refresh-projects')).toBeDisabled();
});
