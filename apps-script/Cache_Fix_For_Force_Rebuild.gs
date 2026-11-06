/**
 * OPTIONAL FIX FOR STALE GITHUB ARTWORK DURING FORCE REBUILD.
 *
 * This is a two-function replacement for the existing FAST v2 script.
 * DO NOT add this as a separate .gs file: two definitions of
 * yoloGradientApplyIfReady_ in one Apps Script project are ambiguous.
 *
 * In the original FAST v2 script:
 * 1. Find "function yoloGradientApplyIfReady_(top, props)".
 * 2. Replace that entire function, up to (but not including)
 *    "function yoloGradientFetchPng_(url, name)", with BOTH functions below.
 * 3. Save. No reinstallation or trigger changes are necessary.
 *
 * Fix: ask the authenticated GitHub REST API for the latest main commit
 * and fetch manifest+PNGs from immutable commit-specific raw URLs.
 * This removes the likely raw.githubusercontent.com/main cache delay.
 */
function yoloGradientHeadSha_() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty(YOLO_GRADIENT.tokenProperty);
  if (!token) throw new Error('Missing GitHub token in Script Properties.');
  const url = 'https://api.github.com/repos/' + YOLO_GRADIENT.repository +
    '/git/ref/heads/' + YOLO_GRADIENT.branch + '?cache_bust=' + Date.now();
  const res = UrlFetchApp.fetch(url, {
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Cache-Control': 'no-cache'
    },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('GitHub HEAD lookup failed: HTTP ' + res.getResponseCode() +
      ' / ' + res.getContentText().slice(0, 200));
  }
  const result = JSON.parse(res.getContentText());
  const sha = result && result.object && result.object.sha;
  if (!/^[0-9a-f]{40}$/.test(String(sha))) {
    throw new Error('Unexpected GitHub HEAD response.');
  }
  return sha;
}

function yoloGradientApplyIfReady_(top, props) {
  // Resolve branch HEAD through GitHub's API; fetch all files from that
  // exact immutable commit to avoid stale cached /main URLs.
  const commitSha = yoloGradientHeadSha_();
  const rawRoot = 'https://raw.githubusercontent.com/' + YOLO_GRADIENT.repository +
    '/' + commitSha + '/';
  const prefix = rawRoot + 'assets/';
  const manifestResponse = UrlFetchApp.fetch(
    prefix + 'manifest.json',
    { muteHttpExceptions: true }
  );
  if (manifestResponse.getResponseCode() === 404) return false;
  if (manifestResponse.getResponseCode() !== 200) {
    throw new Error('Cannot read GitHub image manifest (HTTP ' +
      manifestResponse.getResponseCode() + ').');
  }
  const manifest = JSON.parse(manifestResponse.getContentText());
  if (manifest.schema_version !== 1 || manifest.signature !== top.signature) return false;

  const forceAfter = Number(props.getProperty(YOLO_GRADIENT.forceAfterProperty) || 0);
  if (forceAfter && !(Date.parse(manifest.generated_utc || '') > forceAfter)) return false;
  if (!manifest.images ||
      manifest.images.left !== 'assets/left.png' ||
      manifest.images.right !== 'assets/right.png') {
    throw new Error('Unexpected PNG paths in GitHub manifest.');
  }

  const leftBlob = yoloGradientFetchPng_(rawRoot + manifest.images.left, 'left.png');
  const rightBlob = yoloGradientFetchPng_(rawRoot + manifest.images.right, 'right.png');
  if (yoloReadTopSix_().signature !== top.signature) return false;

  const ss = SpreadsheetApp.openById(YOLO_GRADIENT.spreadsheetId);
  const images = yoloGradientImages_(ss.getSheetByName(YOLO_GRADIENT.targetTab));
  yoloGradientReplaceKeepLayout_(images.left, leftBlob);
  yoloGradientReplaceKeepLayout_(images.right, rightBlob);
  SpreadsheetApp.flush();

  props.setProperty(YOLO_GRADIENT.appliedProperty, top.signature);
  props.deleteProperty(YOLO_GRADIENT.forceAfterProperty);
  props.deleteProperty(YOLO_GRADIENT.pendingProperty);
  props.deleteProperty(YOLO_GRADIENT.pendingTimeProperty);
  console.log('Gradient art applied to TEST tab: ' + top.signature +
    ' (from GitHub commit ' + commitSha.slice(0, 12) + ')');
  return true;
}
