/**
 * Figma Automation Webhook Server
 *
 * POST /trigger   — start a report setup job
 * GET  /health    — liveness check
 * POST /clear-cookies — force re-login on next job
 */

require('dotenv').config();

const express = require('express');
const { default: PQueue } = require('p-queue');
const { runFigmaSetup } = require('./figma-runner');
const { clearCookies } = require('./figma-auth');
const logger = require('./logger');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Serialize jobs — only one Figma browser session at a time
const queue = new PQueue({ concurrency: 1 });

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireSecret(req, res, next) {
  if (!WEBHOOK_SECRET) return next(); // disabled if not set
  const header = req.headers['x-webhook-secret'] || req.headers['authorization']?.replace('Bearer ', '');
  if (header !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', queue: queue.size, pending: queue.pending });
});

/**
 * POST /trigger
 * Body: { clientName, tier, shopUrl, supabaseRunId? }
 *
 * Called by Supabase edge function after section detection completes (step 3).
 * Runs asynchronously — returns 202 immediately, then POSTs result to Supabase.
 */
app.post('/trigger', requireSecret, async (req, res) => {
  const { clientName, tier, shopUrl, supabaseRunId, callbackUrl } = req.body;

  if (!clientName || !tier) {
    return res.status(400).json({ error: 'clientName and tier are required' });
  }

  if (!['Pro', 'Essential'].includes(tier)) {
    return res.status(400).json({ error: 'tier must be "Pro" or "Essential"' });
  }

  logger.info('Job queued', { clientName, tier, queueSize: queue.size });
  res.status(202).json({ status: 'queued', queueSize: queue.size });

  // Run async
  queue.add(async () => {
    logger.info('Job starting', { clientName, tier });
    try {
      const result = await runFigmaSetup({ clientName, tier, shopUrl });
      logger.info('Job complete', result);

      // Report back to Supabase / caller if a callback URL was provided
      if (callbackUrl) {
        await notifyCallback(callbackUrl, {
          status: 'success',
          supabaseRunId,
          ...result
        });
      }
    } catch (err) {
      logger.error('Job failed', { clientName, tier, error: err.message });
      if (callbackUrl) {
        await notifyCallback(callbackUrl, {
          status: 'error',
          supabaseRunId,
          error: err.message
        });
      }
    }
  });
});

/**
 * POST /clear-cookies
 * Forces re-authentication on next job (useful when Figma session expires)
 */
app.post('/clear-cookies', requireSecret, (req, res) => {
  clearCookies();
  res.json({ status: 'cookies cleared' });
});

// ── Callback helper ───────────────────────────────────────────────────────────

async function notifyCallback(url, payload) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(WEBHOOK_SECRET ? { 'x-webhook-secret': WEBHOOK_SECRET } : {})
      },
      body: JSON.stringify(payload)
    });
    logger.info('Callback delivered', { url, status: res.status });
  } catch (err) {
    logger.error('Callback failed', { url, error: err.message });
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`Figma automation server running on :${PORT}`);
});
