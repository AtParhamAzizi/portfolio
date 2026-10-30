import { test, expect } from '@playwright/test';
import axe from 'axe-core';

test('original dark theme remains the default and the toggle works with a keyboard', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(8, 9, 12)');
  const toggle = page.getByRole('button', { name: 'Switch to light mode' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#ffffff');
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#08090c');
});

test('saved theme is restored before styles load and persists across reloads', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  expect(await page.evaluate(() => localStorage.getItem('portfolio:theme'))).toBe('light');
  let releaseStylesheet;
  const stylesheetReady = new Promise(resolve => { releaseStylesheet = resolve; });
  await page.route('**/styles.css', async route => {
    await stylesheetReady;
    await route.continue();
  });
  await page.reload({ waitUntil: 'commit' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  releaseStylesheet();
  await page.waitForLoadState('load');
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('toggle works without browser storage', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage disabled'); } }));
  await page.goto('./');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(errors).toEqual([]);
});

test('invalid stored preferences fall back to dark', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('portfolio:theme', 'invalid'));
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
});

test('light mode stays bounded across viewport sizes', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#project-grid')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  for (const width of [320, 360, 390, 620, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
});

test('light page, project dialog, and command palette pass automated accessibility checks', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#project-grid')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.addScriptTag({ content: axe.source });
  const scan = async () => page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(item => ({ target: item.target, summary: item.failureSummary })) })));
  expect(await scan()).toEqual([]);
  await page.locator('.project-card h3 button').first().click();
  await expect(page.locator('#project-dialog')).toBeVisible();
  await page.locator('#project-dialog').evaluate(dialog => Promise.all(dialog.getAnimations().map(animation => animation.finished)));
  expect(await scan()).toEqual([]);
  await page.keyboard.press('Escape');
  await page.locator('#open-command').click();
  await expect(page.locator('#command-dialog')).toBeVisible();
  await page.locator('#command-dialog').evaluate(dialog => Promise.all(dialog.getAnimations().map(animation => animation.finished)));
  expect(await scan()).toEqual([]);
});
