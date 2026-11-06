/**
 * yolomodeboom Top-6 gradients: reliable triggers v4.
 * ADD this as a NEW Apps Script .gs file alongside FAST v2.
 * Run installYoloGradientReliableTriggersV4() ONCE.
 * Keeps the original Github token, rank selector, layout and artwork code.
 */
function installYoloGradientReliableTriggersV4() {
  if (typeof YOLO_GRADIENT === 'undefined' ||
      typeof yoloReadTopSix_ !== 'function' ||
      typeof yoloGradientCheck_ !== 'function' ||
      typeof yoloGradientWaitForReady_ !== 'function') {
    throw new Error('The original FAST v2 gradient script must remain installed.');
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== YOLO_GRADIENT.spreadsheetId) {
    throw new Error('Run in the Apps Script project of the ORIGINAL spreadsheet.');
  }
  // Remove obsolete gradient-only triggers; leave your AREDL refresh alone.
  const handlers = [
    'yoloGradientOnEdit','yoloGradientPeriodic',
    'yoloGradientOnChange','yoloGradientOnStructuralChangePatch',
    'yoloGradientV4OnEdit','yoloGradientV4OnChange','yoloGradientV4Periodic'
  ];
  ScriptApp.getProjectTriggers().forEach(t => {
    if (handlers.includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('yoloGradientV4OnEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('yoloGradientV4OnChange').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('yoloGradientV4Periodic').timeBased().everyMinutes(1).create();
  console.log('v4 installed: onEdit, onChange and one-minute backup.');
  console.log('Current top six: ' + yoloReadTopSix_().signature);
  yoloGradientV4CheckNow();
}

function yoloGradientV4OnEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet().getName();
  if (sheet !== 'Sheet2' && sheet !== 'AREDL Ranked') return;
  yoloGradientV4HandleEvent_('edit on ' + sheet);
}

function yoloGradientV4OnChange(e) {
  if (!e) return;
  const kind = String(e.changeType || 'OTHER');
  // Include EDIT as a fallback in case the onEdit handler misses a change.
  if (!['EDIT','INSERT_ROW','REMOVE_ROW','OTHER'].includes(kind)) return;
  yoloGradientV4HandleEvent_('change event ' + kind);
}

function yoloGradientV4HandleEvent_(source) {
  try {
    console.log('Top-six watcher triggered: ' + source);
    SpreadsheetApp.flush();
    Utilities.sleep(1800);
    const props = PropertiesService.getScriptProperties();
    let current = yoloReadTopSix_();
    let applied = props.getProperty(YOLO_GRADIENT.appliedProperty) || '';

    // Row insertion/Formula recalculation can arrive after the trigger event.
    if (current.signature === applied) {
      Utilities.sleep(3000);
      SpreadsheetApp.flush();
      current = yoloReadTopSix_();
      applied = props.getProperty(YOLO_GRADIENT.appliedProperty) || '';
    }
    console.log('Current=' + current.signature + '; applied=' + applied);
    if (current.signature === applied) return;

    yoloGradientCheck_('v4 ' + source);
    yoloGradientWaitForReady_('v4 ' + source);
  } catch (err) {
    console.error('Top-six watcher failed (' + source + '): ' + err);
  }
}

function yoloGradientV4Periodic() {
  try {
    // AREDL API/script refreshes never fire onEdit, so use a frequent fallback.
    yoloGradientCheck_('v4 one-minute backup');
  } catch (err) {
    console.error('Top-six one-minute backup failed: ' + err);
  }
}

function yoloGradientV4CheckNow() {
  const props = PropertiesService.getScriptProperties();
  console.log('Current=' + yoloReadTopSix_().signature);
  console.log('Applied=' + (props.getProperty(YOLO_GRADIENT.appliedProperty) || '(none)'));
  console.log('Pending=' + (props.getProperty(YOLO_GRADIENT.pendingProperty) || '(none)'));
  yoloGradientCheck_('v4 manual check');
  yoloGradientWaitForReady_('v4 manual check');
}

function yoloGradientV4ShowTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => /yoloGradient/i.test(t.getHandlerFunction()))
    .forEach(t => console.log(t.getHandlerFunction() + ' / ' + t.getEventType()));
}
