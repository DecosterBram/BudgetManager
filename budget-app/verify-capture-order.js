// Ad-hoc check: capture form is description-first, and the keyboard flow follows it.
const { chromium } = require('playwright');
const Database = require('better-sqlite3');

const PROBE = 'ZZ order probe';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const fails = [];
  const check = (label, actual, expected) => {
    const ok = expected instanceof RegExp ? expected.test(actual) : actual === expected;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}`);
    if (!ok) fails.push(label);
  };
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('placeholder') ?? '');

  await page.goto('http://localhost:3000/capture', { waitUntil: 'networkidle' });

  const labels = await page.locator('form .section-label').allInnerTexts();
  check('field order', labels.slice(0, 4).join(' → '), /^DESCRIPTION → AMOUNT → CATEGORY → DATE/i);
  check('focus on mount', await focused(), 'Merchant or description');

  // Tab order follows visual order
  await page.keyboard.press('Tab');
  check('tab 1 → amount', await focused(), '€ 0,00');
  await page.keyboard.press('Tab');
  check('tab 2 → category', await focused(), 'Type to filter categories…');

  // Accepting a suggestion lands on the still-empty amount
  await page.getByPlaceholder('Merchant or description').click();
  await page.waitForTimeout(200); // let the field's own blur timer settle first
  await page.getByPlaceholder('Merchant or description').pressSequentially('Aldi', { delay: 50 });
  await page.waitForTimeout(250);
  await page.locator('form button', { hasText: 'aldi' }).first().click();
  check('after suggestion (mouse) → amount', await focused(), '€ 0,00');

  // Same via keyboard: ArrowDown to the suggestion, Enter to accept
  const desc = page.getByPlaceholder('Merchant or description');
  await desc.click();
  await page.waitForTimeout(200);
  await desc.fill('');
  await desc.pressSequentially('Aldi', { delay: 50 });
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  check('after suggestion (keyboard) → amount', await focused(), '€ 0,00');

  // Full round trip still saves
  await page.getByPlaceholder('Merchant or description').fill(PROBE);
  await page.getByPlaceholder('€ 0,00').fill('7,89');
  const cat = page.getByPlaceholder('Type to filter categories…');
  await cat.click();
  await cat.fill('Groceries');
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /^Groceries/ }).first().click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(1500);

  check('session list shows entry', await page.locator('body').innerText(), new RegExp(PROBE));
  check('focus returns to description', await focused(), 'Merchant or description');

  const db = new Database('data/budget.db');
  const row = db.prepare('select description, amount_cents from transactions where description = ?').get(PROBE);
  check('row in database', row ? `${row.description} / ${row.amount_cents}` : 'MISSING', `${PROBE} / 789`);
  console.log('cleanup: deleted', db.prepare('delete from transactions where description = ?').run(PROBE).changes, 'probe row(s)');
  db.close();

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILURE(S): ${fails.join(', ')}` : '\nall checks passed');
  process.exit(fails.length ? 1 : 0);
})();
