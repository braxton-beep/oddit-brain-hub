// Oddit Screenshot Injector — Figma Plugin Code
// Finds frames named "Desktop Screenshot", "Mobile Screenshot", etc.
// and fills them with images fetched from the Oddit API.

figma.showUI(__html__, { width: 360, height: 420 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === "inject-screenshots") {
    const { screenshots } = msg; // { desktop: url, mobile: url }

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

      // Find frame by name in the current page
      const frame = figma.currentPage.findOne(
        (node) => node.name === frameName && (node.type === "FRAME" || node.type === "RECTANGLE")
      );

      if (!frame) {
        errors.push(`Frame "${frameName}" not found`);
        continue;
      }

      try {
        // Fetch the image bytes
        const response = await fetch(imageUrl);
        const buffer = await response.arrayBuffer();
        const imageBytes = new Uint8Array(buffer);

        // Create Figma image from bytes
        const image = figma.createImage(imageBytes);

        // Set the frame fill to the image
        frame.fills = [
          {
            type: "IMAGE",
            scaleMode: "FILL",
            imageHash: image.hash,
          },
        ];

        filled++;
      } catch (e) {
        errors.push(`Error filling "${frameName}": ${e.message || e}`);
      }
    }

    figma.ui.postMessage({
      type: "inject-result",
      filled,
      errors,
    });
  }

  if (msg.type === "close") {
    figma.closePlugin();
  }
};
