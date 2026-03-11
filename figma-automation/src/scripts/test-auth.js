/**
 * Quick script to test Figma login and save cookies.
 * Run: node src/scripts/test-auth.js
 */
require('dotenv').config();
const { chromium } = require('playwright');
const { ensureAuthenticated } = require('../figma-auth');
const logger = require('../logger');

(async () => {
  const browser = await chromium.launch({ headless: false }); // visible so you can watch
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await ensureAuthenticated(context, page);
    logger.info('Auth test passed — cookies saved');
    await page.screenshot({ path: './data/auth-test.png' });
  } catch (err) {
    logger.error('Auth test failed', { error: err.message });
  } finally {
    await browser.close();
  }
})();
