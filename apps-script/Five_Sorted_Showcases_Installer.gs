/**
 * YOLOMODEBOOM: Five automatically updating, individually sorted showcases.
 * One-time installer. Install in the ORIGINAL Google Sheet's Apps Script project.
 * Keep your existing FAST v2 + reliability files; this script deactivates only
 * the older gradient triggers after confirming all 10 new images are present.
 *
 * GitHub token is reused from Script Properties: YOLO_GRADIENT_GITHUB_TOKEN.
 * Changes only the five showcase over-grid images, never column widths.
 *
 * The AREDL artwork sheet may be named "Top 50 • Gradient Test" during testing
 * or "AREDL placement" after finalization.
 */
const YOLO_FIVE = Object.freeze({
  spreadsheetId: '1VjuJHTMGOtLe99SPCTwmePvzqMFfKnHZnpfQrHyL9aw',
  repo: 'yolomodeboom/gd-showcase-gradients',
  branch: 'main',
  tokenProp: 'YOLO_GRADIENT_GITHUB_TOKEN',
  appliedProp: 'YOLO_FIVE_APPLIED_SIGNATURE',
  pendingProp: 'YOLO_FIVE_PENDING_SIGNATURE',
  pendingTimeProp: 'YOLO_FIVE_PENDING_TIME',
  forceAfterProp: 'YOLO_FIVE_FORCE_AFTER',
  retryMs: 25 * 60 * 1000,
  waitMs: 115 * 1000,
  pollMs: 4200,
  modes: [
    {key:'aredl', title:'AREDL placement', legacy:'Top 50 • Gradient Test'},
    {key:'most', title:'Most attempts'},
    {key:'least', title:'Least attempts'},
    {key:'newest', title:'Newest first'},
    {key:'oldest', title:'Oldest first'}
  ]
});

function yoloFiveSheet_(ss, mode) {
  const s = ss.getSheetByName(mode.title) ||
    (mode.legacy ? ss.getSheetByName(mode.legacy) : null);
  if (!s) throw new Error('Showcase tab is missing: ' + mode.title);
  return s;
}

function yoloFiveNormalize_(name) {
  return String(name).normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function yoloFiveSnapshot_() {
  const ss = SpreadsheetApp.openById(YOLO_FIVE.spreadsheetId);
  const modes = YOLO_FIVE.modes.map(function(mode) {
    const s = yoloFiveSheet_(ss, mode);
    // G7:H12 are the first SIX displayed level names and numeric AREDL ranks.
    // They are already sorted according to that tab's fixed J4 mode.
    const data = s.getRange('G7:H12').getDisplayValues();
    const levels = data.map(function(row) {
      const name = String(row[0] || '').trim();
      const rank = Number(String(row[1] || '').replace(/^#/, '').trim());
      if (!name || !Number.isSafeInteger(rank) || rank < 1)
        throw new Error('Incomplete top-six list in ' + s.getName() +
          ': name=' + name + ', rank=' + row[1]);
      return {name:name, aredl_rank:rank};
    });
    const signature = levels.map(x => yoloFiveNormalize_(x.name)).join('|');
    return {key:mode.key,title:mode.title,signature:signature,levels:levels};
  });
  return {
    modes:modes,
    signature:modes.map(m => m.key + ':' + m.signature).join('\n')
  };
}

function yoloFiveImages_(sheet) {
  const left = [], right = [];
  sheet.getImages().forEach(function(img) {
    const a = img.getAnchorCell();
    if (!a || a.getRow() !== 1) return;
    if (a.getColumn() === 1) left.push(img);
    if (a.getColumn() === 11) right.push(img);
  });
  if (left.length !== 1 || right.length !== 1)
    throw new Error('Expected one over-grid PNG at A1 and K1 on ' +
      sheet.getName() + '. Found ' + left.length + ' left, ' +
      right.length + ' right. Nothing was replaced.');
  return {left:left[0],right:right[0]};
}

function yoloFiveLatestCommit_() {
  const token = PropertiesService.getScriptProperties()
    .getProperty(YOLO_FIVE.tokenProp);
  if (!token) throw new Error('Missing GitHub token. Original FAST v2 setup required.');
  const url = 'https://api.github.com/repos/' + YOLO_FIVE.repo +
    '/git/ref/heads/' + YOLO_FIVE.branch + '?cb=' + Date.now();
  const res = UrlFetchApp.fetch(url,{
    headers:{
      Authorization:'Bearer ' + token,
      Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
      'Cache-Control':'no-cache'
    },muteHttpExceptions:true
  });
  if (res.getResponseCode() !== 200)
    throw new Error('GitHub HEAD lookup HTTP ' + res.getResponseCode() +
      ': ' + res.getContentText().slice(0,200));
  const sha = JSON.parse(res.getContentText()).object.sha;
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Invalid GitHub commit SHA');
  return sha;
}

function yoloFiveFetchPng_(url, filename) {
  const res = UrlFetchApp.fetch(url, {muteHttpExceptions:true});
  if (res.getResponseCode() !== 200)
    throw new Error('Cannot download ' + filename +
      ': HTTP ' + res.getResponseCode());
  const bytes = res.getContent();
  if (bytes.length < 32 || bytes.length >= 2*1024*1024)
    throw new Error(filename + ' exceeds Sheets image limits.');
  const b = i => bytes[i] & 255;
  const signature = [137,80,78,71,13,10,26,10];
  if (signature.some((v,i) => b(i) !== v))
    throw new Error(filename + ' is not a PNG.');
  const uint32 = i => b(i)*16777216+b(i+1)*65536+b(i+2)*256+b(i+3);
  const width=uint32(16),height=uint32(20);
  if (width<1 || height<1 || width*height>=1000000)
    throw new Error(filename + ' has unacceptable dimensions: ' + width + 'x' + height);
  return Utilities.newBlob(bytes, 'image/png', filename);
}

function yoloFiveReplacePreservingLayout_(image, blob) {
  const anchor=image.getAnchorCell();
  const width=image.getWidth(), height=image.getHeight();
  const x=image.getAnchorCellXOffset(), y=image.getAnchorCellYOffset();
  image.replace(blob).setAnchorCell(anchor)
    .setAnchorCellXOffset(x).setAnchorCellYOffset(y)
    .setWidth(width).setHeight(height);
}

/**
 * Returns true if the latest published GitHub commit has the exact contents
 * for ALL five modes. Preloads all ten PNGs before modifying any image.
 */
function yoloFiveApplyReady_(snapshot, props) {
  const sha=yoloFiveLatestCommit_();
  const root='https://raw.githubusercontent.com/' + YOLO_FIVE.repo + '/' + sha + '/';
  const res=UrlFetchApp.fetch(root+'assets/sorts/manifest.json',
    {muteHttpExceptions:true});
  if (res.getResponseCode()===404) return false;
  if (res.getResponseCode()!==200)
    throw new Error('Five-sort manifest HTTP '+res.getResponseCode());
  const manifest=JSON.parse(res.getContentText());
  if (manifest.schema_version!==1 || !manifest.modes) return false;
  const forceAfter=Number(props.getProperty(YOLO_FIVE.forceAfterProp)||0);
  if (forceAfter && !(Date.parse(manifest.generated_utc||'')>forceAfter)) return false;
  for (const mode of snapshot.modes) {
    const source=manifest.modes[mode.key];
    if (!source || source.title!==mode.title ||
        source.signature!==mode.signature) return false;
    if (source.images?.left!==('assets/sorts/'+mode.key+'/left.png') ||
        source.images?.right!==('assets/sorts/'+mode.key+'/right.png'))
      throw new Error('Unexpected image paths in five-sort manifest.');
  }

  const ss=SpreadsheetApp.openById(YOLO_FIVE.spreadsheetId);
  const writes=[];
  for (const mode of snapshot.modes) {
    const s=yoloFiveSheet_(ss,mode);
    const imgs=yoloFiveImages_(s); // Validate anchors before downloads.
    const imagePaths=manifest.modes[mode.key].images;
    const lb=yoloFiveFetchPng_(root+imagePaths.left,mode.key+'-left.png');
    const rb=yoloFiveFetchPng_(root+imagePaths.right,mode.key+'-right.png');
    writes.push({img:imgs.left,blob:lb});
    writes.push({img:imgs.right,blob:rb});
  }
  // Don't apply outdated images if somebody changed the completion list mid-run.
  if (yoloFiveSnapshot_().signature!==snapshot.signature) return false;
  writes.forEach(w=>yoloFiveReplacePreservingLayout_(w.img,w.blob));
  SpreadsheetApp.flush();
  props.setProperty(YOLO_FIVE.appliedProp,snapshot.signature);
  props.deleteProperty(YOLO_FIVE.pendingProp);
  props.deleteProperty(YOLO_FIVE.pendingTimeProp);
  props.deleteProperty(YOLO_FIVE.forceAfterProp);
  console.log('Applied all 10 sort-specific PNGs from GitHub '+sha.slice(0,12));
  return true;
}

function yoloFiveDispatch_(snapshot,reason) {
  const props=PropertiesService.getScriptProperties();
  const token=props.getProperty(YOLO_FIVE.tokenProp);
  if (!token) throw new Error('Missing GitHub token');
  const res=UrlFetchApp.fetch(
    'https://api.github.com/repos/'+YOLO_FIVE.repo+'/dispatches',{
      method:'post',
      contentType:'application/json',
      headers:{
        Authorization:'Bearer '+token,
        Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28'
      },
      payload:JSON.stringify({
        event_type:'five-sorts-updated',
        client_payload:{modes:snapshot.modes,reason:reason}
      }),
      muteHttpExceptions:true
    });
  if(res.getResponseCode()!==204)
    throw new Error('Five-sort GitHub dispatch HTTP '+res.getResponseCode()+
      ': '+res.getContentText().slice(0,200));
  props.setProperty(YOLO_FIVE.pendingProp,snapshot.signature);
  props.setProperty(YOLO_FIVE.pendingTimeProp,String(Date.now()));
  console.log('Requested five-sort artwork: '+reason);
}

function yoloFiveCycle_(source,waitForBuild) {
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(2500)) return;
  let snap;
  try {
    const props=PropertiesService.getScriptProperties();
    snap=yoloFiveSnapshot_();
    if(props.getProperty(YOLO_FIVE.appliedProp)===snap.signature) return;
    if(yoloFiveApplyReady_(snap,props)) return;
    const pending=props.getProperty(YOLO_FIVE.pendingProp);
    const since=Number(props.getProperty(YOLO_FIVE.pendingTimeProp)||0);
    if(pending!==snap.signature || Date.now()-since>YOLO_FIVE.retryMs) {
      yoloFiveDispatch_(snap,source);
    }
  } finally {lock.releaseLock();}
  if(waitForBuild) yoloFiveWait_(snap,source);
}

function yoloFiveWait_(snapshot,source) {
  const started=Date.now();
  const props=PropertiesService.getScriptProperties();
  while(Date.now()-started<YOLO_FIVE.waitMs) {
    Utilities.sleep(YOLO_FIVE.pollMs);
    if(props.getProperty(YOLO_FIVE.appliedProp)===snapshot.signature) return;
    const current=yoloFiveSnapshot_();
    if(current.signature!==snapshot.signature) {
      console.log('Top-six lists changed while waiting; next check will use new order.');
      return;
    }
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(500)) continue;
    try {
      if(yoloFiveApplyReady_(snapshot,props)){
        console.log('Five-sort artwork applied after '+
          Math.round((Date.now()-started)/1000)+' seconds.');
        return;
      }
    } catch(err) {
      console.log('Still waiting on complete GitHub image set: '+err);
    } finally{lock.releaseLock();}
  }
  console.log('GitHub image set not ready yet; next one-minute check will retry.');
}

function yoloFiveOnEdit(e) {
  if (!e || !e.range) return;
  const name=e.range.getSheet().getName();
  if (name!=='Sheet2' && name!=='AREDL Ranked') return;
  try {
    SpreadsheetApp.flush();
    Utilities.sleep(1900); // Let formula-based sort orders recalculate.
    yoloFiveCycle_('edit '+name,true);
  } catch(err) {console.error('Five-sort edit trigger: '+err);}
}

function yoloFiveOnChange(e) {
  if(!e || !['EDIT','INSERT_ROW','REMOVE_ROW','OTHER'].includes(e.changeType))return;
  try {
    SpreadsheetApp.flush();
    Utilities.sleep(2500);
    yoloFiveCycle_('sheet change '+e.changeType,true);
  }catch(err){console.error('Five-sort change trigger: '+err);}
}

function yoloFivePeriodic() {
  try {yoloFiveCycle_('one-minute AREDL backup',true);}
  catch(err){console.error('Five-sort backup: '+err);}
}

function yoloFiveCheckNow() {
  yoloFiveCycle_('manual check',true);
}

function yoloFiveForceRebuild() {
  const props=PropertiesService.getScriptProperties();
  props.setProperty(YOLO_FIVE.forceAfterProp,String(Date.now()));
  props.deleteProperty(YOLO_FIVE.appliedProp);
  props.deleteProperty(YOLO_FIVE.pendingProp);
  props.deleteProperty(YOLO_FIVE.pendingTimeProp);
  yoloFiveCycle_('manual force rebuild',true);
}

/**
 * Run ONCE. First confirm the published images can all be fetched and applied;
 * only THEN retire the older image automation triggers.
 */
function installYoloFiveShowcases() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss || ss.getId()!==YOLO_FIVE.spreadsheetId)
    throw new Error('Run from the original Notable yolomodeboom completions workbook.');
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty(YOLO_FIVE.tokenProp))
    throw new Error('The original GitHub token is missing.');
  const snap=yoloFiveSnapshot_();

  // Confirm every sheet has exactly two over-grid images, and that sort is fixed.
  for(const mode of YOLO_FIVE.modes){
    const s=yoloFiveSheet_(ss,mode);
    if(s.getRange('J4').getDisplayValue()!==mode.title)
      throw new Error(s.getName()+' J4 is not '+mode.title+'.');
    yoloFiveImages_(s);
  }
  if(!yoloFiveApplyReady_(snap,props)) {
    throw new Error('GitHub image set is not yet aligned with the five sheets. '+
      'No old triggers were disabled. Run yoloFiveCheckNow later.');
  }

  const older=[
    'yoloGradientOnEdit','yoloGradientPeriodic','yoloGradientOnChange',
    'yoloGradientOnStructuralChangePatch',
    'yoloGradientV4OnEdit','yoloGradientV4OnChange',
    'yoloGradientV4Periodic',
    'yoloFiveOnEdit','yoloFiveOnChange','yoloFivePeriodic'
  ];
  ScriptApp.getProjectTriggers().forEach(t=>{
    if(older.includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('yoloFiveOnEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('yoloFiveOnChange').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('yoloFivePeriodic').timeBased().everyMinutes(1).create();
  console.log('Installed five-sort automation. All ten images applied.');
  console.log('Current signatures: '+snap.signature);
  SpreadsheetApp.getUi().alert(
    'Five showcase sorts installed! All 10 images are updated. '+
    'Check the five tabs at 110% zoom before the final rename/hide step.');
}

function yoloFiveStatus() {
  const props=PropertiesService.getScriptProperties();
  const snap=yoloFiveSnapshot_();
  console.log(JSON.stringify({
    modes:snap.modes.map(m=>({name:m.title,levels:m.levels.map(x=>x.name)})),
    applied:props.getProperty(YOLO_FIVE.appliedProp)===snap.signature,
    pending:!!props.getProperty(YOLO_FIVE.pendingProp),
    tokenConfigured:!!props.getProperty(YOLO_FIVE.tokenProp),
    gradientTriggers:ScriptApp.getProjectTriggers()
      .filter(t=>/yolo(Gradient|Five)/i.test(t.getHandlerFunction()))
      .map(t=>t.getHandlerFunction())
  },null,2));
}
