// Oddit Screenshot Injector — Figma Plugin Code
// Enhanced: auto-fills ALL section frames from AI-detected page sections
// Falls back to legacy 4-frame mode if no sections detected

figma.showUI(__html__, { width: 400, height: 560 });

figma.ui.onmessage = async (msg) => {
  // ── Legacy mode: inject desktop/mobile into named frames ──
  if (msg.type === "inject-screenshots") {
    const { screenshots } = msg;
    const frameMap = {
      "Desktop Screenshot": screenshots.desktop,
      "Mobile Screenshot": screenshots.mobile,
      "Desktop Focus": screenshots.desktop,
      "Mobile Focus": screenshots.mobile,
    };

    let filled = 0;
    let errors = [];

    for (const [frameName, imageUrl] of Object.entries(frameMap)) {
      if (!imageUrl) continue;
      const frame = figma.currentPage.findOne(
        (node) => node.name === frameName && (node.type === "FRAME" || node.type === "RECTANGLE")
      );
      if (!frame) { errors.push(`Frame "${frameName}" not found`); continue; }

      try {
        const response = await fetch(imageUrl);
        const buffer = await response.arrayBuffer();
        const image = figma.createImage(new Uint8Array(buffer));
        frame.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: image.hash }];
        filled++;
      } catch (e) {
        errors.push(`Error filling "${frameName}": ${e.message || e}`);
      }
    }

    figma.ui.postMessage({ type: "inject-result", filled, errors });
  }

  // ── Section-based injection: crop regions from full-page screenshot ──
  if (msg.type === "inject-sections") {
    const { sections, screenshotUrls } = msg;
    // sections: [{ section_name, device_type, y_start_pct, y_end_pct, full_screenshot_url }]

    let filled = 0;
    let errors = [];
    const imageCache = {};

    // Pre-load full-page screenshots into Figma image cache
    for (const url of Object.values(screenshotUrls)) {
      if (!url || imageCache[url]) continue;
      try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const image = figma.createImage(new Uint8Array(buffer));
        imageCache[url] = image;
      } catch (e) {
        errors.push(`Failed to load screenshot: ${e.message || e}`);
      }
    }

    // Find all frames/rectangles on current page
    const allNodes = figma.currentPage.findAll(
      (node) => node.type === "FRAME" || node.type === "RECTANGLE"
    );

    for (const section of sections) {
      const { section_name, device_type, y_start_pct, y_end_pct, full_screenshot_url } = section;

      // Match frame by naming convention: "{Section Name} Desktop" or "{Section Name} Mobile"
      const deviceLabel = device_type === "desktop" ? "Desktop" : "Mobile";
      const possibleNames = [
        `${section_name} ${deviceLabel}`,           // "Hero Desktop"
        `${section_name} - ${deviceLabel}`,         // "Hero - Desktop"
        `${deviceLabel} ${section_name}`,           // "Desktop Hero"
        `${deviceLabel} - ${section_name}`,         // "Desktop - Hero"
        section_name,                                // Just "Hero" (fill both)
      ];

      const frame = allNodes.find((node) => {
        const name = node.name.trim();
        return possibleNames.some((pn) => name.toLowerCase() === pn.toLowerCase());
      });

      if (!frame) {
        // Not an error — template may not have all sections
        continue;
      }

      const image = imageCache[full_screenshot_url];
      if (!image) {
        errors.push(`No image loaded for ${section_name} ${deviceLabel}`);
        continue;
      }

      try {
        // Calculate crop transform
        // imageTransform maps frame UV coords (0-1) to image UV coords (0-1)
        // We want to show the portion from y_start_pct to y_end_pct
        const yStart = y_start_pct / 100;
        const yEnd = y_end_pct / 100;
        const sectionHeight = yEnd - yStart;

        // The transform: [[scaleX, skewX, translateX], [skewY, scaleY, translateY]]
        // scaleX = 1 (use full width), scaleY = section fraction, translateY = start position
        const transform = [
          [1, 0, 0],
          [0, sectionHeight, yStart],
        ];

        frame.fills = [
          {
            type: "IMAGE",
            scaleMode: "CROP",
            imageHash: image.hash,
            imageTransform: transform,
          },
        ];
        filled++;
      } catch (e) {
        errors.push(`Error filling "${section_name} ${deviceLabel}": ${e.message || e}`);
      }
    }

    figma.ui.postMessage({
      type: "inject-result",
      filled,
      errors,
      mode: "sections",
    });
  }

  // ── Scan template: report which frames exist ──
  if (msg.type === "scan-template") {
    const allNodes = figma.currentPage.findAll(
      (node) => node.type === "FRAME" || node.type === "RECTANGLE"
    );
    const frameNames = allNodes.map((n) => n.name);
    figma.ui.postMessage({ type: "scan-result", frameNames });
  }

  if (msg.type === "close") {
    figma.closePlugin();
  }
};
