/**
 * Align the over-grid side gradients to the TOP of the dark footer (row 57)
 * on all five live showcase tabs. Safe to run repeatedly.
 *
 * REPLACE the previously installed Fix_Side_Panel_Height_Once.gs contents
 * with this file, then run yoloFiveFixSidePanelHeightOnce once.
 *
 * The bottom boundary is computed from the actual visible row heights,
 * skipping hidden row 4. It is currently 2867 pixels. No row heights,
 * image widths, anchors, or ranking formulas are changed.
 *
 * The existing yoloFiveReplacePreservingLayout_ refresh function saves and
 * restores image.display height/width. Consequently every automated image
 * regeneration after a Sheet2/AREDL Ranked update will preserve the
 * footer-aligned height set here.
 */

/** Sum visible sheet row heights from row 1 up to the footer in row 57. */
function yoloFiveFooterImageHeight_(sheet) {
  const FOOTER_ROW = 57;
  let height = 0;
  for (let row = 1; row < FOOTER_ROW; row++) {
    if (sheet.isRowHiddenByUser(row)) continue;
    if (typeof sheet.isRowHiddenByFilter === 'function' &&
        sheet.isRowHiddenByFilter(row)) continue;
    height += sheet.getRowHeight(row);
  }
  if (height < 2500 || height > 3000)
    throw new Error(sheet.getName() +
      ': unexpected footer start at ' + height + ' px; no changes applied.');
  return height;
}

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

  const changes = [];
  const heights = [];
  // Validate all 10 images and the footer position before modifying any.
  for (const mode of YOLO_FIVE.modes) {
    const sheet = yoloFiveSheet_(ss, mode);
    if (sheet.getRange('J4').getDisplayValue() !== mode.title)
      throw new Error('Unexpected sorting key in ' + sheet.getName());
    const correctHeight = yoloFiveFooterImageHeight_(sheet);
    const pair = yoloFiveImages_(sheet);
    for (const image of [pair.left, pair.right]) {
      const height = image.getHeight();
      if (height < 2500 || height > 3000)
        throw new Error(sheet.getName() +
          ': unexpected image display height ' + height + ' px; aborting.');
      changes.push({image, correctHeight});
    }
    heights.push(sheet.getName() + ': ' + correctHeight + 'px');
  }

  // Change only the over-grid images' displayed heights. Their anchors,
  // x/y offsets, widths and the actual spreadsheet cell layout stay intact.
  changes.forEach(({image, correctHeight}) => image.setHeight(correctHeight));
  SpreadsheetApp.flush();
  console.log('Aligned 10 PNGs to the footer: ' + heights.join(', '));

  // Rebuild artwork from the current live top-six lists. This ensures the
  // newly generated 348x2867 PNGs are applied, and the installed updater
  // preserves the just-corrected display dimensions on every later refresh.
  yoloFiveForceRebuild();
}
