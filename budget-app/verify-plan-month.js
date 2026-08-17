const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // Record income shown on Month before change
  await page.goto('http://localhost:3000/month', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const incomeBefore = await page.locator('.amount').first().textContent();
  console.log('Month income before:', incomeBefore);
  await page.screenshot({ path: '/tmp/month-before.png' });

  // Go to Plan, change income to 3100, save
  await page.goto('http://localhost:3000/plan', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const incomeInput = page.locator('input[inputmode="decimal"]');
  await incomeInput.click({ clickCount: 3 });
  await incomeInput.fill('3100,00');
  await page.getByRole('button', { name: 'Save plan' }).click();
  await page.waitForTimeout(1500);
  const savedOk = await page.locator('text=✓ Saved').isVisible();
  console.log('"✓ Saved" visible:', savedOk);
  await page.screenshot({ path: '/tmp/plan-after-save.png' });

  // Now go to Month and check income updated
  await page.goto('http://localhost:3000/month', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const incomeAfter = await page.locator('.amount').first().textContent();
  console.log('Month income after:', incomeAfter);
  await page.screenshot({ path: '/tmp/month-after.png' });

  await browser.close();
})();
