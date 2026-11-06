/**
 * One-time height alignment for the five live showcase tabs.
 * The regenerated source PNGs are 346 x 2883 px (under 1M pixels).
 *
 * ADD this file to the workbook's existing Apps Script project and run
 * yoloFiveFixSidePanelHeightOnce exactly once.
 *
 * Preflights all 10 images at A1/K1 before changing anything. It changes
 * displayed image heights only, and asks the existing automation to
 * regenerate the images with the current live top-six lists.
 */
function yoloFiveFixSidePanelHeightOnce() {
  if (typeof YOLO_FIVE === 'undefined' ||
      typeof yoloFiveSheet_ !== 'function' ||
      typeof yoloFiveImages_ !== 'function' ||
      typeof yoloFiveForceRebuild !== 'function') {
    throw new Error('The five-showcase automation must be installed first.');
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== YOLO_FIVE.spreadsheetId)
    throw new Error('Run this from the original completions workbook.');

  const OLD_HEIGHT = 2867;
  const NEW_HEIGHT = 2883;
  const images = [];

  // Preflight every image before changing the first one.
  for (const mode of YOLO_FIVE.modes) {
    const sheet = yoloFiveSheet_(ss, mode);
    const pair = yoloFiveImages_(sheet);
    for (const image of [pair.left, pair.right]) {
      const height = image.getHeight();
      if (height !== OLD_HEIGHT && height !== NEW_HEIGHT)
        throw new Error(sheet.getName() +
          ': unexpected image height ' + height +
          ' px. Aborting without changes.');
      images.push(image);
    }
  }

  images.forEach(image => image.setHeight(NEW_HEIGHT));
  SpreadsheetApp.flush();
  console.log('All ten side images now display at ' + NEW_HEIGHT + ' px.');

  // The installed refresh code preserves these adjusted display dimensions.
  // Force rebuilding is necessary because its signature cache otherwise
  // skips same-level image updates from GitHub.
  yoloFiveForceRebuild();
}
