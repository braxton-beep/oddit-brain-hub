/**
 * Figma Automation Webhook Server
 *
 * POST /trigger   — start a report setup job
 * GET  /health    — liveness check
 * POST /clear-cookies — force re-login on next job
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const { runFigmaSetup } = require('./figma-runner');
const { clearCookies } = require('./figma-auth');
const logger = require('./logger');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// ── Simple serial job queue (no deps) ────────────────────────────────────────
let _queueChain = Promise.resolve();
let _queueSize = 0;

function enqueue(fn) {
  _queueSize++;
  _queueChain = _queueChain.then(() => {
    return fn().finally(() => { _queueSize--; });
  });
}

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
  res.json({ status: 'ok', queued: _queueSize });
});

/**
 * POST /trigger
 * Body: { clientName, tier, shopUrl, supabaseRunId? }
 */
app.post('/trigger', requireSecret, async (req, res) => {
  const { clientName, tier, shopUrl, supabaseRunId, callbackUrl } = req.body;

  if (!clientName || !tier) {
    return res.status(400).json({ error: 'clientName and tier are required' });
  }

  if (!['Pro', 'Essential'].includes(tier)) {
    return res.status(400).json({ error: 'tier must be "Pro" or "Essential"' });
  }

  logger.info('Job queued', { clientName, tier, queueSize: _queueSize });
  res.status(202).json({ status: 'queued', queueSize: _queueSize });

  enqueue(async () => {
    logger.info('Job starting', { clientName, tier });
    try {
      const result = await runFigmaSetup({ clientName, tier, shopUrl });
      logger.info('Job complete', result);
      if (callbackUrl) {
        await notifyCallback(callbackUrl, { status: 'success', supabaseRunId, ...result });
      }
    } catch (err) {
      logger.error('Job failed', { clientName, tier, error: err.message });
      if (callbackUrl) {
        await notifyCallback(callbackUrl, { status: 'error', supabaseRunId, error: err.message });
      }
    }
  });
});

/**
 * GET /latest-screenshot — serve the most recent debug screenshot
 */
app.get('/latest-screenshot', requireSecret, (req, res) => {
  const dataDir = path.resolve('./data');
  if (!fs.existsSync(dataDir)) return res.status(404).json({ error: 'No data directory' });
  const files = fs.readdirSync(dataDir)
    .filter(f => f.endsWith('.png'))
    .map(f => ({ name: f, time: fs.statSync(path.join(dataDir, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);
  if (!files.length) return res.status(404).json({ error: 'No screenshots found' });
  res.sendFile(path.join(dataDir, files[0].name));
});

/**
 * POST /clear-cookies
 */
app.post('/clear-cookies', requireSecret, (req, res) => {
  clearCookies();
  res.json({ status: 'cookies cleared' });
});

// ── Callback helper ───────────────────────────────────────────────────────────

async function notifyCallback(url, payload) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(WEBHOOK_SECRET ? { 'x-webhook-secret': WEBHOOK_SECRET } : {})
      },
      body: JSON.stringify(payload)
    });
    logger.info('Callback delivered', { url, status: response.status });
  } catch (err) {
    logger.error('Callback failed', { url, error: err.message });
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`Figma automation server running on :${PORT}`);
});
