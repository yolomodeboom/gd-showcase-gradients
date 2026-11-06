/**
 * Small add-on for Top6_Gradient_Automation_FAST_v2.gs.
 *
 * This is NOT a replacement for v2: add as a NEW Apps Script file.
 * Run installYoloGradientRowChangePatch ONCE.
 *
 * Existing edit + periodic triggers, image sizes, layout, token, and tabs
 * are left completely unchanged.
 */

/** Installs the additional change trigger for inserting/deleting whole rows. */
function installYoloGradientRowChangePatch() {
  if (typeof YOLO_GRADIENT === 'undefined' ||
      typeof yoloGradientCheck_ !== 'function' ||
      typeof yoloGradientWaitForReady_ !== 'function') {
    throw new Error('The FAST v2 gradient automation must already be installed.');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== YOLO_GRADIENT.spreadsheetId) {
    throw new Error('Open Apps Script from the original completions spreadsheet.');
  }

  // Re-running this installer is safe; it replaces only its own trigger.
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'yoloGradientOnStructuralChangePatch') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('yoloGradientOnStructuralChangePatch')
    .forSpreadsheet(ss)
    .onChange()
    .create();

  console.log('Row-change trigger installed. Existing onEdit and periodic triggers preserved.');
}

/** Triggered for row insertions, deletions and other structural edits. */
function yoloGradientOnStructuralChangePatch(e) {
  if (!e || !['INSERT_ROW', 'REMOVE_ROW', 'OTHER'].includes(e.changeType)) return;

  try {
    console.log('Structural change: ' + e.changeType);
    SpreadsheetApp.flush();
    Utilities.sleep(1500); // Allow formula-based AREDL rankings to recalculate.
    yoloGradientCheck_('row change: ' + e.changeType);
    yoloGradientWaitForReady_('row change: ' + e.changeType);
  } catch (err) {
    console.error('Gradient row-change trigger failed: ' + err);
  }
}
