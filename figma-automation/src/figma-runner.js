/**
 * figma-runner.js
 * Core Playwright automation for Oddit report setup.
 *
 * Flow:
 *  1. Open Figma template file
 *  2. Duplicate → lands in Drafts
 *  3. Rename duplicate to "{Client Name} // {Tier} Report"
 *  4. Move to correct project folder
 *  5. Open the duplicate
 *  6. Run "Oddit Screenshot Injector" plugin
 *  7. Enter client name → Fetch → Auto-Fill Sections
 *  8. Report success / failure
 */

const { chromium } = require('playwright');
const { ensureAuthenticated } = require('./figma-auth');
const logger = require('./logger');

// ── Template file IDs ────────────────────────────────────────────────────────
// Defaults match the fallbacks in run-report-setup/index.ts
const TEMPLATES = {
  Pro:       process.env.FIGMA_TEMPLATE_ODDIT_PRO       || '3EfexlsSpqIciz7PkcSPwu',
  Essential: process.env.FIGMA_TEMPLATE_ODDIT_ESSENTIAL || '3EfexlsSpqIciz7PkcSPwu',
};

// Destination project IDs — both tiers land in the Reports project
const PROJECT_IDS = {
  Pro:       process.env.FIGMA_PROJECT_PRO       || '258925701',
  Essential: process.env.FIGMA_PROJECT_ESSENTIAL || '258925701',
};

const FIGMA_FILE_BASE = 'https://www.figma.com/design';
const PLUGIN_NAME = 'Oddit Screenshot Injector';

// ── Helpers ──────────────────────────────────────────────────────────────────

function templateUrl(tier) {
  const fileId = TEMPLATES[tier];
  if (!fileId) throw new Error(`No template configured for tier: ${tier}`);
  return `${FIGMA_FILE_BASE}/${fileId}`;
}

/**
 * Wait for a selector with a clear error message on timeout.
 */
async function waitFor(page, selector, description, timeout = 15000) {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout });
  } catch {
    throw new Error(`Timed out waiting for: ${description} (selector: ${selector})`);
  }
}

// ── Main automation ───────────────────────────────────────────────────────────

async function runFigmaSetup({ clientName, tier, shopUrl }) {
  const reportName = `${clientName} // ${tier} Report`;
  logger.info('Starting Figma setup', { clientName, tier, reportName });

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    // ── Step 1: Authenticate ────────────────────────────────────────────────
    await ensureAuthenticated(context, page);

    // ── Step 2: Open template + duplicate ──────────────────────────────────
    const tmplUrl = templateUrl(tier);
    logger.info('Navigating to template', { url: tmplUrl });
    await page.goto(tmplUrl, { waitUntil: 'networkidle', timeout: 60000 });

    // Figma may show a loading screen — wait for the canvas toolbar
    await waitFor(page, '[data-testid="toolbar"], [class*="toolbar"]', 'Figma toolbar');

    logger.info('Duplicating template to Drafts');
    await openMainMenu(page);
    await page.locator('[data-testid="main-menu-item-file"], li:has-text("File")').first().click();
    await page.locator('li:has-text("Duplicate to Drafts"), [data-testid*="duplicate"]').first().click();

    // Small pause for Figma to process
    await page.waitForTimeout(3000);
    logger.info('Duplicate created');

    // ── Step 3: Find duplicate in Drafts + rename ───────────────────────────
    logger.info('Navigating to Drafts to find duplicate');
    await page.goto('https://www.figma.com/files/drafts', { waitUntil: 'networkidle' });

    // Most-recently-modified file is the duplicate — it should be the first card
    const firstFile = page.locator('[class*="file_card"], [data-testid="file-card"]').first();
    await firstFile.waitFor({ state: 'visible', timeout: 20000 });

    logger.info('Renaming duplicate', { reportName });
    await firstFile.hover();
    await page.locator('[class*="file_card"] [aria-label*="more"], [class*="file_card"] button[title*="options"]').first().click();
    await page.locator('li:has-text("Rename"), [data-testid*="rename"]').first().click();

    // The file name becomes an editable input
    const nameInput = page.locator('[class*="file_name_input"], input[aria-label*="name"], input[value*="Copy of"]').first();
    await nameInput.waitFor({ timeout: 5000 });
    await nameInput.selectAll?.() || await nameInput.press('Control+a');
    await nameInput.fill(reportName);
    await nameInput.press('Enter');
    logger.info('File renamed');

    // ── Step 4: Move to project folder ─────────────────────────────────────
    const projectId = PROJECT_IDS[tier];
    if (projectId) {
      logger.info('Moving file to project', { tier, projectId });
      await firstFile.hover();
      await page.locator('[class*="file_card"] [aria-label*="more"], [class*="file_card"] button[title*="options"]').first().click();
      await page.locator('li:has-text("Move to"), [data-testid*="move"]').first().click();

      // Project picker modal
      await waitFor(page, '[class*="project_picker"], [data-testid*="project-picker"]', 'project picker modal');
      await page.locator(`[data-id="${projectId}"], [href*="${projectId}"], li:has-text("${tier}")`)
        .first()
        .click();
      await page.locator('button:has-text("Move"), [data-testid*="confirm-move"]').first().click();
      logger.info('File moved to project');
    } else {
      logger.warn('No project ID configured for tier — file stays in Drafts', { tier });
    }

    // ── Step 5: Open the duplicate file ────────────────────────────────────
    // Figma should have navigated to the new file after rename/move.
    // If not, find it and click it.
    const currentUrl = page.url();
    if (!currentUrl.includes('/design/')) {
      logger.info('Navigating into the renamed file');
      const renamedFile = page.locator(`[title="${reportName}"], [aria-label*="${clientName}"]`).first();
      await renamedFile.waitFor({ timeout: 15000 });
      await renamedFile.dblclick();
      await page.waitForURL('**/design/**', { timeout: 30000 });
    }

    await waitFor(page, '[data-testid="toolbar"], [class*="toolbar"]', 'Figma canvas toolbar');
    logger.info('Duplicate file open', { url: page.url() });

    // ── Step 6: Open the Oddit Screenshot Injector plugin ──────────────────
    logger.info('Opening plugin', { plugin: PLUGIN_NAME });
    await openMainMenu(page);

    await page.locator('li:has-text("Plugins"), [data-testid*="plugins"]').first().click();
    // Sub-menu: Development (our plugin is in dev mode)
    const devMenu = page.locator('li:has-text("Development"), [data-testid*="development"]').first();
    const hasDev = await devMenu.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasDev) {
      await devMenu.hover();
    }
    await page.locator(`li:has-text("${PLUGIN_NAME}"), [title="${PLUGIN_NAME}"]`).first().click();
    logger.info('Plugin launched');

    // ── Step 7: Interact with plugin UI ────────────────────────────────────
    // Plugin renders in an iframe inside Figma's canvas
    const pluginFrame = page.frameLocator('iframe[title*="plugin"], iframe[src*="plugin"]');

    logger.info('Waiting for plugin UI to load');

    // Wait for client name input to appear (confirms plugin is ready)
    const clientInput = pluginFrame.locator('#clientName');
    await clientInput.waitFor({ state: 'visible', timeout: 30000 });

    // Ensure we're on the AI Sections tab (default, but be explicit)
    await pluginFrame.locator('#tabSections').click();

    logger.info('Filling client name in plugin', { clientName });
    await clientInput.clear();
    await clientInput.fill(clientName);

    // Click "Detect Sections" — triggers the edge function + AI analysis
    logger.info('Clicking Detect Sections');
    await pluginFrame.locator('#detectBtn').click();

    // Wait for #status to show success class (sections detected)
    // Timeout is generous — Gemini detection can take 20-40s
    await pluginFrame
      .locator('#status.success')
      .waitFor({ state: 'visible', timeout: 90000 });
    logger.info('Sections detected successfully');

    // "Auto-Fill Sections" button should now be visible
    const injectBtn = pluginFrame.locator('#injectSectionsBtn');
    await injectBtn.waitFor({ state: 'visible', timeout: 10000 });

    logger.info('Clicking Auto-Fill Sections');
    await injectBtn.click();

    // Wait for final success — status div shows "Filled X frame(s)"
    await pluginFrame
      .locator('#status.success')
      .waitFor({ state: 'visible', timeout: 120000 });

    const statusText = await pluginFrame.locator('#status').textContent().catch(() => 'done');
    logger.info('Plugin injection complete ✓', { clientName, tier, reportName, status: statusText });

    const finalUrl = page.url();
    return { success: true, reportName, figmaUrl: finalUrl };

  } catch (err) {
    logger.error('Figma setup failed', { error: err.message, stack: err.stack });
    // Capture screenshot for debugging
    await page.screenshot({ path: `./data/error-${Date.now()}.png`, fullPage: false }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

// ── Utility: open Figma's main hamburger menu ────────────────────────────────

async function openMainMenu(page) {
  // Figma's main menu — the "F" logo / hamburger in the top-left
  const menuBtn = page.locator(
    '[data-testid="main-menu-btn"], [aria-label="Main menu"], [class*="main_menu"] button'
  ).first();
  await menuBtn.waitFor({ state: 'visible', timeout: 10000 });
  await menuBtn.click();
  // Brief pause for sub-menu to render
  await page.waitForTimeout(500);
}

module.exports = { runFigmaSetup };
