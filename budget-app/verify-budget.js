const { chromium } = require('playwright');

const SCREENS = [
  { name: 'capture',  url: 'http://localhost:3000/capture' },
  { name: 'month',    url: 'http://localhost:3000/month' },
  { name: 'goals',    url: 'http://localhost:3000/goals' },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const screen of SCREENS) {
    await page.goto(screen.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `/tmp/budget-${screen.name}.png` });
    console.log(`Screenshot: /tmp/budget-${screen.name}.png`);
  }

  // Light mode check
  await page.goto('http://localhost:3000/capture', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/budget-capture-light.png' });
  console.log('Screenshot (light): /tmp/budget-capture-light.png');

  await browser.close();
})();
