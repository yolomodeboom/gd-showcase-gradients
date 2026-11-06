/**
 * One-time compact-header upgrade for the five showcase tabs.
 *
 * ADD THIS AS A NEW Apps Script .gs FILE in the ORIGINAL workbook, alongside
 * the working "FiveShowcases" installer, FAST v2, and v4 script files.
 * Run: yoloFiveRemoveBlankRow4
 *
 * Important: Row 4 contains a hidden J4 sort key needed by the ranking
 * formulas. We HIDE (rather than delete) row 4, which removes its 30-pixel
 * visual space without introducing #REF errors or changing row numbers.
 *
 * Pre-flight checks validate all ten new PNGs before touching the sheet.
 * All image anchors, offsets and visible widths are preserved.
 */
function yoloFiveRemoveBlankRow4() {
  if (typeof YOLO_FIVE === 'undefined' ||
      typeof yoloFiveSnapshot_ !== 'function' ||
      typeof yoloFiveLatestCommit_ !== 'function' ||
      typeof yoloFiveImages_ !== 'function' ||
      typeof yoloFiveFetchPng_ !== 'function' ||
      typeof yoloFiveReplacePreservingLayout_ !== 'function') {
    throw new Error('Keep the installed FiveShowcases Apps Script file in this project.');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== YOLO_FIVE.spreadsheetId)
    throw new Error('Run this in the ORIGINAL completions workbook.');

  const NEW_WIDTH = 348;
  const NEW_HEIGHT = 2867;
  const PREVIOUS_ROW4_HEIGHT = 30;
  const snapshot = yoloFiveSnapshot_();
  const sha = yoloFiveLatestCommit_();
  const root = 'https://raw.githubusercontent.com/' +
    YOLO_FIVE.repo + '/' + sha + '/';

  const mr = UrlFetchApp.fetch(root + 'assets/sorts/manifest.json',
    { muteHttpExceptions: true });
  if (mr.getResponseCode() !== 200) {
    throw new Error('New GitHub image manifest is not published yet (HTTP ' +
      mr.getResponseCode() + '). No sheet changes were made.');
  }
  const manifest = JSON.parse(mr.getContentText());
  if (manifest.schema_version !== 1 || !manifest.modes)
    throw new Error('Unexpected image manifest. No sheet changes were made.');

  const imagesToReplace = [];
  const sheetsToCompact = [];
  for (const mode of snapshot.modes) {
    const sheet = ss.getSheetByName(mode.title);
    if (!sheet || sheet.getRange('J4').getDisplayValue() !== mode.title)
      throw new Error('Missing or incorrectly sorted tab: ' + mode.title);

    if (!sheet.isRowHiddenByUser(4) &&
        sheet.getRowHeight(4) !== PREVIOUS_ROW4_HEIGHT)
      throw new Error('Row 4 on ' + mode.title +
        ' does not have the expected 30-pixel height. Aborting safely.');

    const entry = manifest.modes[mode.key];
    if (!entry || entry.signature !== mode.signature)
      throw new Error('The generated image set is stale for ' +
        mode.title + '. No sheets were modified.');

    const imgs = yoloFiveImages_(sheet);
    const expected = {
      left: 'assets/sorts/' + mode.key + '/left.png',
      right: 'assets/sorts/' + mode.key + '/right.png'
    };
    if (!entry.images ||
        entry.images.left !== expected.left ||
        entry.images.right !== expected.right)
      throw new Error('Unexpected artwork paths for ' + mode.title);

    for (const side of ['left', 'right']) {
      const blob = yoloFiveFetchPng_(
        root + entry.images[side], mode.key + '-' + side + '.png');
      const bytes = blob.getBytes();
      const b = i => bytes[i] & 255;
      const read32 = offset => b(offset) * 16777216 +
        b(offset + 1) * 65536 + b(offset + 2) * 256 + b(offset + 3);
      if (read32(16) !== NEW_WIDTH || read32(20) !== NEW_HEIGHT)
        throw new Error('Wrong image dimensions for ' + mode.title +
          ' ' + side + '. Expected ' + NEW_WIDTH + 'x' + NEW_HEIGHT);

      imagesToReplace.push({image:imgs[side], blob:blob});
    }
    sheetsToCompact.push(sheet);
  }

  // Avoid overwriting a newer completion list with an outdated image set.
  if (yoloFiveSnapshot_().signature !== snapshot.signature)
    throw new Error('Rankings changed during validation; retry the upgrade.');

  const lock = LockService.getScriptLock();
  lock.waitLock(90000);
  try {
    if (yoloFiveSnapshot_().signature !== snapshot.signature)
      throw new Error('Rankings changed; retry.');

    // The existing helper keeps image anchors, offsets and widths unchanged.
    // Only the displayed height is reduced to match the 30-pixel removal.
    imagesToReplace.forEach(function(item) {
      // The screen height can differ from the PNG's native pixel height.
      // Subtract only the exact removed spacer height, preserving layout.
      const originalDisplayHeight = item.image.getHeight();
      if (originalDisplayHeight <= PREVIOUS_ROW4_HEIGHT)
        throw new Error('Unexpected tiny artwork height; aborting.');
      item.image.setHeight(originalDisplayHeight - PREVIOUS_ROW4_HEIGHT);
      yoloFiveReplacePreservingLayout_(item.image, item.blob);
    });
    sheetsToCompact.forEach(sheet => sheet.hideRows(4));
    SpreadsheetApp.flush();

    const props = PropertiesService.getScriptProperties();
    props.setProperty(YOLO_FIVE.appliedProp, snapshot.signature);
    props.deleteProperty(YOLO_FIVE.pendingProp);
    props.deleteProperty(YOLO_FIVE.pendingTimeProp);
    props.deleteProperty(YOLO_FIVE.forceAfterProp);

    console.log('COMPLETE: Row 4 hidden on all five showcases. ' +
      'Images: ' + NEW_WIDTH + 'x' + NEW_HEIGHT +
      '; displayed widths, anchors and offsets preserved. Commit: ' +
      sha.slice(0, 12));
  } finally {
    lock.releaseLock();
  }
}
