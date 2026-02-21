

## Simplify Screenshot Pipeline and Add Figma Injection

### Problem
The current pipeline uses a complex AI-driven CRO section identification system that tries to intelligently find and screenshot key areas of a page. This is overengineered for what is actually a simple project setup automation. Screenshots are full-page captures regardless, and nothing gets injected into Figma.

### What Changes

**1. Remove AI Section Logic**
Strip out `identifyCROSections`, `captureSectionScreenshot`, and all related AI gateway calls. This eliminates the dependency on `LOVABLE_API_KEY` for this step and removes the timeout risk from multiple sequential Firecrawl calls.

**2. Simple Homepage Screenshots (Desktop + Mobile)**
Replace with two straightforward Firecrawl scrape calls:
- **Desktop**: viewport 1440x900, full-page screenshot
- **Mobile**: viewport 390x844, full-page screenshot

These are simple `formats: ["screenshot"]` calls with viewport settings -- no actions, no scrolling, no JavaScript injection.

**3. Figma Screenshot Injection**
After duplicating the Figma template (Step 6), inject the captured screenshots into the template's designated frames:
- `Desktop Screenshot` frame -- filled with desktop homepage screenshot
- `Mobile Screenshot` frame -- filled with mobile homepage screenshot
- `Desktop Focus` and `Mobile Focus` -- same images (or focus URL screenshots if provided)

The injection flow:
1. Get the duplicated file's node tree via `GET /files/{key}` to find frame node IDs by name
2. Upload each screenshot PNG to Figma via `POST /images/{key}` to get an `imageHash`
3. Set each frame's `fills` to use that `imageHash` via `PUT /files/{key}/nodes`

**4. Attach Screenshots to Asana**
Still attach both desktop and mobile screenshots as Asana task attachments and list URLs in the task notes.

### Technical Details

**File modified:** `supabase/functions/run-report-setup/index.ts`

**Removed:**
- `identifyCROSections()` function (~85 lines)
- `captureSectionScreenshot()` function (~90 lines)
- AI gateway calls and model fallback logic
- `LOVABLE_API_KEY` dependency for screenshots

**Added/Replaced:**
- `captureHomepageScreenshot(url, firecrawlKey, viewport)` -- simple Firecrawl scrape with `formats: ["screenshot"]` and viewport config
- `injectScreenshotsIntoFigma(figmaToken, fileKey, screenshots)` -- finds named frames in the duplicated template and fills them with uploaded images using Figma's REST API (`POST /v1/files/{key}/images`, node property updates)

**Step flow becomes:**
1. Create Asana card
2. Move to Ready for Setup
3. Capture homepage screenshots (desktop 1440px + mobile 390px) -- 2 Firecrawl calls in parallel
4. Upload to storage + attach to Asana
5. Add tags
6. Duplicate Figma templates
7. Inject screenshots into Figma template frames
8. Card stays in Ready for Setup

