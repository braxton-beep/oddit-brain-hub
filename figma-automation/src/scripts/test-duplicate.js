/**
 * End-to-end test for one report.
 * Run: node src/scripts/test-duplicate.js
 *
 * Edit CLIENT_NAME / TIER below before running.
 */
require('dotenv').config();
const { runFigmaSetup } = require('../figma-runner');
const logger = require('../logger');

const CLIENT_NAME = 'ACME Store';   // ← change me
const TIER = 'Essential';           // ← 'Pro' or 'Essential'
const SHOP_URL = 'https://acme.myshopify.com';

(async () => {
  try {
    const result = await runFigmaSetup({
      clientName: CLIENT_NAME,
      tier: TIER,
      shopUrl: SHOP_URL
    });
    logger.info('Test complete', result);
  } catch (err) {
    logger.error('Test failed', { error: err.message });
    process.exit(1);
  }
})();
