// Ad-hoc check: the selected month survives tab switches (click + g-shortcut).
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const fails = [];

  const expectUrl = async (label, expected) => {
    try {
      await page.waitForURL(expected, { timeout: 5000 });
      console.log(`PASS  ${label}: ${page.url()}`);
    } catch {
      console.log(`FAIL  ${label}: ${page.url()} (expected ${expected})`);
      fails.push(label);
    }
  };
  const expectText = (label, actual, expected) => {
    const ok = expected instanceof RegExp ? expected.test(actual) : actual === expected;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${actual}`);
    if (!ok) fails.push(label);
  };

  await page.goto('http://localhost:3000/month?month=2026-07', { waitUntil: 'networkidle' });
  expectText('start heading', await page.locator('h5').first().innerText(), 'July 2026');

  await page.getByRole('button', { name: /^Plan/ }).click();
  await expectUrl('click Plan keeps month', 'http://localhost:3000/plan?month=2026-07');
  expectText('Plan heading', await page.locator('h5').first().innerText(), /July 2026/);

  await page.getByRole('button', { name: /^Trends/ }).click();
  await expectUrl('click Trends keeps month', 'http://localhost:3000/trends?month=2026-07');

  await page.getByRole('button', { name: /^Goals/ }).click();
  await expectUrl('click Goals (prerendered page) keeps month', 'http://localhost:3000/goals?month=2026-07');

  await page.keyboard.press('g');
  await page.keyboard.press('m');
  await expectUrl('g m keeps month', 'http://localhost:3000/month?month=2026-07');
  expectText('Month heading after g m', await page.locator('h5').first().innerText(), 'July 2026');
  expectText('sidebar picker value', await page.locator('select').inputValue(), '2026-07');

  await page.keyboard.press('n');
  await expectUrl('n → capture keeps month', 'http://localhost:3000/capture?month=2026-07');

  // No month chosen: behaviour unchanged, no query string invented
  await page.goto('http://localhost:3000/month', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Plan/ }).click();
  await expectUrl('no month selected → url stays clean', 'http://localhost:3000/plan');

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILURE(S): ${fails.join(', ')}` : '\nall checks passed');
  process.exit(fails.length ? 1 : 0);
})();
