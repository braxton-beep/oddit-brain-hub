const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const COOKIES_PATH = process.env.FIGMA_COOKIES_PATH || './data/figma-cookies.json';

/**
 * Ensure we have a valid Figma session.
 * Tries cookies first; falls back to username/password login.
 */
async function ensureAuthenticated(context, page) {
  // Try loading cookies from env var first (for Google OAuth users)
  const envCookies = process.env.FIGMA_COOKIES;
  if (envCookies) {
    try {
      logger.info('Loading Figma cookies from FIGMA_COOKIES env var');
      const cookies = JSON.parse(envCookies);
      // Normalize cookies for Playwright (Cookie-Editor exports slightly different format)
      const normalized = cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        expires: c.expirationDate || c.expires || -1,
        httpOnly: c.httpOnly || false,
        secure: c.secure || false,
        sameSite: c.sameSite === 'no_restriction' ? 'None'
          : c.sameSite === 'lax' ? 'Lax'
          : c.sameSite === 'strict' ? 'Strict'
          : 'None',
      }));
      await context.addCookies(normalized);

      // Verify session is still valid
      await page.goto('https://www.figma.com/files/recents-and-sharing', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      const isLoggedIn = await page
        .locator('[data-testid="user-menu-avatar"], [class*="user_avatar"], [aria-label*="account"]')
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (isLoggedIn) {
        logger.info('Figma session restored from env cookies');
        return;
      }
      logger.warn('Env cookies expired or invalid');
    } catch (e) {
      logger.warn('Failed to parse FIGMA_COOKIES env var', { error: e.message });
    }
  }

  // Try loading saved cookies from file
  const cookiesPath = path.resolve(COOKIES_PATH);
  if (fs.existsSync(cookiesPath)) {
    logger.info('Loading saved Figma cookies from file');
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    await context.addCookies(cookies);

    // Verify session is still valid
    await page.goto('https://www.figma.com/files/recents-and-sharing', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const isLoggedIn = await page
      .locator('[data-testid="user-menu-avatar"], [class*="user_avatar"], [aria-label*="account"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isLoggedIn) {
      logger.info('Figma session restored from file cookies');
      return;
    }

    logger.warn('Saved cookies expired or invalid — falling back to login');
  }

  // Full login flow (email/password only — Google OAuth users must set FIGMA_COOKIES)
  await login(context, page);
}

async function login(context, page) {
  const email = process.env.FIGMA_EMAIL;
  const password = process.env.FIGMA_PASSWORD;

  if (!email || !password) {
    throw new Error('FIGMA_EMAIL and FIGMA_PASSWORD must be set for browser auth');
  }

  logger.info('Logging in to Figma', { email });
  await page.goto('https://www.figma.com/login', { waitUntil: 'networkidle' });

  // Fill email
  await page.locator('input[name="email"], input[type="email"]').fill(email);
  await page.locator('button[type="submit"], button:has-text("Continue")').first().click();

  // Wait for password field (some flows show it on next screen)
  await page.locator('input[name="password"], input[type="password"]').waitFor({ timeout: 10000 });
  await page.locator('input[name="password"], input[type="password"]').fill(password);
  await page.locator('button[type="submit"], button:has-text("Log in")').first().click();

  // Wait for redirect to files page
  await page.waitForURL('**/files**', { timeout: 30000 });
  logger.info('Figma login successful');

  // Save cookies for next run
  const cookies = await context.cookies();
  const cookiesPath = path.resolve(COOKIES_PATH);
  fs.mkdirSync(path.dirname(cookiesPath), { recursive: true });
  fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  logger.info('Figma cookies saved', { path: cookiesPath });
}

/**
 * Clear saved cookies (force re-login on next run)
 */
function clearCookies() {
  const cookiesPath = path.resolve(COOKIES_PATH);
  if (fs.existsSync(cookiesPath)) {
    fs.unlinkSync(cookiesPath);
    logger.info('Figma cookies cleared');
  }
}

module.exports = { ensureAuthenticated, login, clearCookies };
