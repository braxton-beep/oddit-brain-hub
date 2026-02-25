

## ✅ COMPLETED: Simplify Screenshot Pipeline and Add Figma Injection

### Status: Done

**What was delivered:**

1. ✅ **Removed AI Section Logic** — stripped `identifyCROSections`, `captureSectionScreenshot`, and all AI gateway calls
2. ✅ **Simple Homepage Screenshots** — Desktop (1440px) + Mobile (390px) via Firecrawl in parallel
3. ✅ **Figma Screenshot Injection** — Since Figma REST API doesn't support image uploads/node fills, built a **Figma Plugin** workaround:
   - `get-setup-screenshots` edge function serves screenshot URLs per client
   - `figma-plugin/` contains a local Figma plugin (manifest.json, code.js, ui.html) that finds named frames and fills them with fetched images using `figma.createImage()`
4. ✅ **Asana Attachments** — Both screenshots attached to Asana tasks with URLs in notes

### How to install the Figma Plugin
1. In Figma → Plugins → Development → Import plugin from manifest
2. Point to `figma-plugin/manifest.json`
3. Open a duplicated template, run the plugin, enter client name → Fetch → Inject
