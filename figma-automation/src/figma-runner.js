/**
 * figma-runner.js
 * Core Playwright automation for Oddit report setup.
 *
 * Revised flow — operates on Figma FILES PAGE (no WebGL required):
 *  1. Auth
 *  2. Navigate to project files page
 *  3. Find template file card → right-click → Duplicate
 *  4. Navigate to Drafts → find duplicate → rename
 *  5. Move duplicate to Reports project
 *  6. Return figma URL of the new file
 *
 * NOTE: Plugin interaction (screenshot injector) is deferred — requires
 * WebGL which headless Chromium does not support. Will be handled separately.
 */

const { chromium } = require('playwright');
const { ensureAuthenticated } = require('./figma-auth');
const logger = require('./logger');

// ── Template file IDs ────────────────────────────────────────────────────────
const TEMPLATES = {
  Pro:       process.env.FIGMA_TEMPLATE_ODDIT_PRO       || '3EfexlsSpqIciz7PkcSPwu',
  Essential: process.env.FIGMA_TEMPLATE_ODDIT_ESSENTIAL || '3EfexlsSpqIciz7PkcSPwu',
};

// Destination project IDs
const PROJECT_IDS = {
  Pro:       process.env.FIGMA_PROJECT_PRO       || '258925701',
  Essential: process.env.FIGMA_PROJECT_ESSENTIAL || '258925701',
};

// ── Main automation ───────────────────────────────────────────────────────────

async function runFigmaSetup({ clientName, tier, shopUrl }) {
  const reportName = `${clientName} // ${tier} Report`;
  logger.info('Starting Figma setup', { clientName, tier, reportName });

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--no-zygote',
      '--single-process',
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    // ── Step 1: Authenticate ────────────────────────────────────────────────
    await ensureAuthenticated(context, page);

    // ── Step 2: Search for the template file ───────────────────────────────
    const projectId = PROJECT_IDS[tier];
    const templateFileId = TEMPLATES[tier];

    logger.info('Searching for template file', { templateFileId });
    await page.goto('https://www.figma.com/files/recents-and-sharing', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Use the search bar to find the template
    const searchBar = page.locator('[placeholder*="Search"], input[type="search"], [class*="search"] input').first();
    await searchBar.waitFor({ state: 'visible', timeout: 10000 });
    await searchBar.click();
    await searchBar.fill('Oddit Report Design Template');
    await page.waitForTimeout(2000);

    // Click "See all results" to get to full results page with right-clickable file cards
    const seeAllBtn = page.locator('a:has-text("See all results"), button:has-text("See all results")').first();
    const seeAllVisible = await seeAllBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (seeAllVisible) {
      await seeAllBtn.click();
      await page.waitForTimeout(2000);
    } else {
      // Press Enter to submit the search
      await searchBar.press('Enter');
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: `./data/search-results-${Date.now()}.png` }).catch(() => {});

    // ── Step 3: Find the template file card and duplicate it ───────────────
    logger.info('Looking for template file card in search results', { templateFileId });

    // Use text content to find the card — most reliable across Figma UI changes
    // The template is named "Customer Name // Oddit Report Design Template"
    const TEMPLATE_NAME = 'Oddit Report Design Template';

    // Try several approaches to find a right-clickable container for the file card
    const cardSelectors = [
      `a[href*="${templateFileId}"]`,
      `[href*="${templateFileId}"]`,
      `figure:has-text("${TEMPLATE_NAME}")`,
      `article:has-text("${TEMPLATE_NAME}")`,
      `li:has-text("${TEMPLATE_NAME}")`,
      `div:has-text("${TEMPLATE_NAME}"):not(:has(div:has-text("${TEMPLATE_NAME}")))`, // leaf container
    ];

    let templateCard = null;
    for (const sel of cardSelectors) {
      const el = page.locator(sel).first();
      const vis = await el.isVisible({ timeout: 2000 }).catch(() => false);
      if (vis) {
        templateCard = el;
        logger.info('Found template card', { selector: sel });
        break;
      }
    }

    if (!templateCard) {
      await page.screenshot({ path: `./data/template-not-found-${Date.now()}.png` }).catch(() => {});
      throw new Error(`Template file card not found in search results. Check debug screenshot.`);
    }

    // Right-click the card to get context menu
    await templateCard.hover();
    await page.waitForTimeout(300);
    await templateCard.click({ button: 'right' });

    await page.waitForTimeout(500);
    await page.screenshot({ path: `./data/after-menu-${Date.now()}.png` }).catch(() => {});

    // Click Duplicate in the context menu
    const duplicateOption = page.locator('li:has-text("Duplicate"), [role="menuitem"]:has-text("Duplicate")').first();
    await duplicateOption.waitFor({ state: 'visible', timeout: 5000 });
    await duplicateOption.click();
    logger.info('Duplicate clicked');

    await page.waitForTimeout(3000);

    // ── Step 4: Navigate to Drafts and find the copy ───────────────────────
    logger.info('Navigating to Drafts');
    await page.goto('https://www.figma.com/files/drafts', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // The duplicate should be the most recently created file
    // It will be named "Copy of <original name>"
    const firstFileCard = page.locator('[class*="file_card"], [data-testid="file-card"]').first();
    await firstFileCard.waitFor({ state: 'visible', timeout: 15000 });

    // ── Step 5: Rename the duplicate ───────────────────────────────────────
    logger.info('Renaming duplicate', { reportName });
    await firstFileCard.hover();
    await page.waitForTimeout(300);

    // Try clicking the options menu button
    const cardOptionsBtn = page.locator('[class*="file_card"]:first-child button, [data-testid="file-card"]:first-child button').first();
    const cardOptVisible = await cardOptionsBtn.isVisible({ timeout: 2000 }).catch(() => false);

    if (cardOptVisible) {
      await cardOptionsBtn.click();
    } else {
      // Right-click the card
      await firstFileCard.click({ button: 'right' });
    }

    await page.waitForTimeout(300);
    const renameOption = page.locator('li:has-text("Rename"), [role="menuitem"]:has-text("Rename")').first();
    await renameOption.waitFor({ state: 'visible', timeout: 5000 });
    await renameOption.click();

    // Fill the new name
    const nameInput = page.locator('input[class*="file_name"], input[class*="fileName"], input[value*="Copy of"]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await nameInput.press('Control+a');
    await nameInput.fill(reportName);
    await nameInput.press('Enter');
    await page.waitForTimeout(1000);
    logger.info('File renamed', { reportName });

    // ── Step 6: Move to project ────────────────────────────────────────────
    if (projectId) {
      logger.info('Moving file to project', { projectId });
      await firstFileCard.hover();
      await page.waitForTimeout(300);

      const moveBtn = page.locator('[class*="file_card"]:first-child button').first();
      const moveBtnVisible = await moveBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (moveBtnVisible) {
        await moveBtn.click();
      } else {
        await firstFileCard.click({ button: 'right' });
      }

      await page.waitForTimeout(300);
      const moveOption = page.locator('li:has-text("Move to"), [role="menuitem"]:has-text("Move to")').first();
      await moveOption.waitFor({ state: 'visible', timeout: 5000 });
      await moveOption.click();

      // Wait for project picker and select the project
      await page.waitForTimeout(1000);
      const projectOption = page.locator(`[href*="${projectId}"], [data-id="${projectId}"]`).first();
      await projectOption.waitFor({ state: 'visible', timeout: 10000 });
      await projectOption.click();

      // Confirm move
      const confirmBtn = page.locator('button:has-text("Move here"), button:has-text("Move")').first();
      const confirmVisible = await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (confirmVisible) await confirmBtn.click();

      await page.waitForTimeout(1000);
      logger.info('File moved to project');
    }

    // ── Done ───────────────────────────────────────────────────────────────
    const figmaUrl = `https://www.figma.com/design/${templateFileId}`; // placeholder — real URL TBD
    logger.info('Figma setup complete ✓', { clientName, tier, reportName });

    return { success: true, reportName, figmaUrl };

  } catch (err) {
    logger.error('Figma setup failed', { error: err.message, stack: err.stack });
    await page.screenshot({ path: `./data/error-${Date.now()}.png`, fullPage: false }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

module.exports = { runFigmaSetup };
