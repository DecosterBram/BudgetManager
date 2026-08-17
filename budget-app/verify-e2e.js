const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Capture a transaction
  await page.goto('http://localhost:3000/capture', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('€ 0,00').fill('12,50');
  await page.getByPlaceholder('Merchant or description').fill('Aldi');
  await page.waitForTimeout(400); // autocomplete prediction
  await page.keyboard.press('Tab'); // accept predicted category, move to date
  await page.keyboard.press('Tab'); // move to date
  await page.keyboard.press('Enter'); // save
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/e2e-capture-saved.png' });
  console.log('After save screenshot: /tmp/e2e-capture-saved.png');

  // 2. Check month view shows the new transaction
  await page.goto('http://localhost:3000/month', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/e2e-month.png' });
  const txCount = await page.locator('text=Aldi').count();
  console.log(`"Aldi" appearances in month view: ${txCount}`);

  // 3. Check plan save
  await page.goto('http://localhost:3000/plan', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/e2e-plan-before.png' });
  await page.getByRole('button', { name: 'Save plan' }).click();
  await page.waitForTimeout(1500);
  const savedMsg = await page.locator('text=✓ Saved').isVisible();
  console.log(`"✓ Saved" visible after save: ${savedMsg}`);
  await page.screenshot({ path: '/tmp/e2e-plan-saved.png' });

  await browser.close();
})();
