# Figma Automation — Oddit Report Setup

Playwright-based service that automates Figma steps 4–5 in the Oddit report pipeline.

## What it does

1. Authenticates with Figma (browser session, cookie-persisted)
2. Opens the correct tier template (Pro / Essential)
3. Duplicates it → renames to `{Client Name} // {Tier} Report`
4. Moves to the correct Figma project folder
5. Opens the duplicate
6. Runs **Oddit Screenshot Injector** plugin
7. Enters client name → Fetch → Auto-Fill Sections
8. Reports success/failure back via webhook callback

## Setup

```bash
cp .env.example .env
# Fill in all vars (see .env.example)

npm install
npx playwright install chromium --with-deps
mkdir -p data
```

## First run — save cookies

```bash
node src/scripts/test-auth.js
```

This opens a visible browser, logs in, and saves cookies to `data/figma-cookies.json`.

## Test a single report

```bash
node src/scripts/test-duplicate.js
```

Edit `CLIENT_NAME` / `TIER` in the script first.

## Start the server

```bash
npm start
# or for dev with auto-restart:
npm run dev
```

## API

### `POST /trigger`

Trigger a setup job. Returns `202` immediately; runs async.

```json
{
  "clientName": "Acme Store",
  "tier": "Pro",
  "shopUrl": "https://acme.myshopify.com",
  "supabaseRunId": "abc-123",
  "callbackUrl": "https://ihvylnngpenyazafnsps.supabase.co/functions/v1/figma-setup-callback"
}
```

Headers: `x-webhook-secret: YOUR_SECRET`

### `GET /health`

Returns queue status.

### `POST /clear-cookies`

Force re-auth on next run (use when Figma session expires).

## Deployment

### Railway / Fly.io (recommended)

1. Push to GitHub
2. Connect repo to Railway/Fly
3. Set env vars in dashboard
4. Done — Dockerfile handles everything

### Environment Variables (required)

| Var | Description |
|-----|-------------|
| `FIGMA_EMAIL` | Figma account email |
| `FIGMA_PASSWORD` | Figma account password |
| `FIGMA_TEMPLATE_ODDIT_PRO` | File ID from Pro template URL |
| `FIGMA_TEMPLATE_ODDIT_ESSENTIAL` | File ID from Essential template URL |
| `FIGMA_PROJECT_PRO` | Figma project ID for Pro reports |
| `FIGMA_PROJECT_ESSENTIAL` | Figma project ID for Essential reports |
| `WEBHOOK_SECRET` | Shared secret for `/trigger` auth |
| `SUPABASE_URL` | Your Supabase URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |

## Triggering from Supabase edge function

After `detect-sections` completes, call:

```typescript
await fetch(process.env.FIGMA_AUTOMATION_URL + '/trigger', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-webhook-secret': process.env.FIGMA_AUTOMATION_SECRET
  },
  body: JSON.stringify({
    clientName: run.client_name,
    tier: run.tier,
    shopUrl: run.shop_url,
    supabaseRunId: run.id,
    callbackUrl: `${SUPABASE_URL}/functions/v1/figma-setup-callback`
  })
});
```

## Notes

- Only one browser session runs at a time (serialized queue) to avoid Figma rate limits
- Cookies are saved after first login; re-auth happens automatically if expired
- Debug screenshots saved to `data/error-*.png` on failure
- Plugin selectors in `figma-runner.js` (step 7) may need tweaking — share your `ui.html` to finalize
