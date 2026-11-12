// Captures every screen and state in light and dark, phone and desktop, into docs/design/screenshots.
// Usage: npm run screenshots [-- name-filter]. Uses your installed Chrome; set CHROME_PATH to override.
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const OUT = new URL('../docs/design/screenshots/', import.meta.url).pathname;
const PORT = 5175;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const filter = process.argv[2];

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
// Screens that scroll inside the app shell get a taller phone so everything is in frame.
const TALL_PHONE = { width: 390, height: 1500 };

const topCard = (page) => page.locator('[aria-hidden="false"] > [aria-roledescription="card"]').first();
const drag = (dx, dy) => async (page) => {
  const box = await topCard(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 });
  await page.waitForTimeout(150);
};
const tapCard = async (page) => {
  const box = await topCard(page).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + 60);
  await page.waitForTimeout(500);
};

const openHistoryRow = (name) => async (page) => {
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await page.waitForTimeout(300);
};
const filterHistory = (label) => async (page) => {
  await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
  await page.waitForTimeout(300);
};

const SHOTS = [
  { name: '01-sign-in', screen: 'sign-in' },
  { name: '02-sign-in-returning', screen: 'sign-in-returning' },
  { name: '03-scan-progress', screen: 'scan' },
  { name: '04-scan-paused', screen: 'scan-paused' },
  { name: '05-deck-main', screen: 'deck' },
  { name: '05b-deck-with-queue', screen: 'deck-queued' },
  { name: '05c-deck-small-phone', screen: 'deck-queued', viewport: { width: 375, height: 667 } },
  { name: '05d-deck-loading-older-mail', screen: 'deck-backfilling' },
  { name: '06-deck-drag-unsubscribe', screen: 'deck', action: drag(-95, 4) },
  { name: '07-deck-drag-keep', screen: 'deck', action: drag(95, 4) },
  { name: '08-deck-drag-later', screen: 'deck', action: drag(0, -120) },
  { name: '09-deck-preview', screen: 'deck', action: tapCard },
  { name: '09b-deck-drag-filter', screen: 'deck', action: drag(0, 130) },
  { name: '09c-filter-sheet', screen: 'filter-sheet' },
  { name: '10-deck-repeat-offender', screen: 'deck-repeat-offender' },
  { name: '11-deck-rereview', screen: 'deck-rereview' },
  { name: '12-deck-empty', screen: 'deck-empty' },
  { name: '13-confirm-sheet', screen: 'confirm' },
  { name: '14-confirm-running', screen: 'confirm-running' },
  { name: '14b-confirm-with-filter', screen: 'confirm-mixed' },
  { name: '15-toast-summary', screen: 'toast' },
  { name: '16-toast-error', screen: 'toast-error' },
  { name: '17-manual-queue', screen: 'manual', viewport: TALL_PHONE },
  { name: '18-settings', screen: 'settings', viewport: TALL_PHONE },
  { name: '18b-settings-scanning-older', screen: 'settings-scanning' },
  { name: '18c-settings-loading-90-days', screen: 'settings-backfilling' },
  { name: '19-history', screen: 'history', viewport: TALL_PHONE },
  { name: '19b-history-expanded', screen: 'history', viewport: TALL_PHONE, action: openHistoryRow('Stubborn Co') },
  { name: '19c-history-filtered', screen: 'history', action: filterHistory('Repeat offenders') },
  { name: '19d-history-empty', screen: 'history-empty' },
  { name: '20-sign-in-expired', screen: 'expired' },
  { name: '21-update-banner', screen: 'update' },
  { name: '30-desktop-deck', screen: 'deck', viewport: DESKTOP },
  { name: '31-desktop-confirm-sheet', screen: 'confirm', viewport: DESKTOP },
  { name: '32-desktop-settings', screen: 'settings', viewport: DESKTOP },
  { name: '33-desktop-history', screen: 'history', viewport: DESKTOP, action: openHistoryRow('Stubborn Co') },
].filter((shot) => !filter || shot.name.includes(filter));

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

mkdirSync(OUT, { recursive: true });
// Only clear screenshots this script makes; anything else in the folder (like design handoffs) stays.
if (!filter) {
  for (const file of readdirSync(OUT)) {
    if (/^\d{2}[a-z]?-.+-(light|dark)\.png$/.test(file)) rmSync(`${OUT}${file}`);
  }
}

let failures = 0;
for (const shot of SHOTS) {
  for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: shot.viewport ?? PHONE, deviceScaleFactor: 2, colorScheme, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(`http://localhost:${PORT}/unsubber/dev/screens.html?screen=${shot.screen}`);
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 15_000 });
      if (shot.action) await shot.action(page);
      const path = `${OUT}${shot.name}-${colorScheme}.png`;
      await page.screenshot({ path });
      console.log(`✓ ${shot.name}-${colorScheme}${errors.length ? `  (page errors: ${errors.join('; ')})` : ''}`);
    } catch (error) {
      failures++;
      console.log(`✗ ${shot.name}-${colorScheme}: ${error.message.split('\n')[0]}`);
    } finally {
      await context.close();
    }
  }
}

await browser.close();
await server.close();
console.log(`\n${SHOTS.length * 2 - failures} screenshots in docs/design/screenshots${failures ? `, ${failures} failed` : ''}`);
process.exit(failures ? 1 : 0);
