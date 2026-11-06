# yolomodeboom — automatic AREDL top-six artwork

This repository regenerates transparent PNG side panels for the **Top 50 • Gradient Test** tab.

**Correct selection:** The Google Apps Script scans all ranked completions, sorts them numerically by AREDL placement, and selects the hardest six. It does **not** take the first six visible rows of `AREDL Ranked`, since the sheet might be sorted by attempts instead.

**Updates:** An installable Google Sheets edit trigger requests regeneration when your completed top six change. A five-minute backup check detects rank changes made by your existing AREDL refresh script. GitHub runs through `repository_dispatch`; GitHub's 60-day *scheduled-workflow* inactivity rule does not affect this event-based setup.

**Outputs:** `assets/left.png`, `assets/right.png`, and `assets/manifest.json`. The Google Apps Script fetches only a matching manifest and replaces the two current images while retaining image anchor, offset, width and height. The original production and public showcases are not modified.

## One-time installation

1. Create a **fine-grained personal access token** under GitHub Settings → Developer settings → Personal access tokens. Limit the token to `yolomodeboom/gd-showcase-gradients` and grant repository **Contents: Read and write**. Never share it in chat or commit it to the repository.
2. In your **original Google Sheet**, open **Extensions → Apps Script**, add a new script file and paste the supplied `Top6_Gradient_Automation_FINAL.gs` code.
3. Save, select `installYoloTop6Automation`, and click **Run**. Authorize Google Apps Script and paste the token when prompted.
4. The installer creates the edit and backup triggers, then dispatches the initial image generation. Check this repository's [Actions tab](https://github.com/yolomodeboom/gd-showcase-gradients/actions). After the build commits `assets/`, Apps Script syncs the PNGs automatically.

No Apps Script web app or GitHub repository secrets are needed.

## Diagnostics

- `yoloGradientStatus` — log signatures and token-configuration status without revealing your token.
- `yoloGradientCheckNow` — check for completed artwork or request regeneration.
- `yoloGradientForceRebuild` — regenerate even when the hardest six are unchanged.
- `yoloGradientAfterAREDLRefresh` — optional call at the very end of your pre-existing AREDL refresh function, to detect moves immediately. The backup trigger catches them even without modification.

## Local development

```bash
python -m pip install -r requirements.txt
python generate.py
```

The fallback demo manifest includes the current known six level IDs. A `repository_dispatch` uses the live ordered six names and ranks from your Google Sheet instead.

The five sorted showcase images are **346×2883 PNGs** (997,518 pixels, below the Google Sheets one-million-pixel limit). Each must be under 2 MB. After updating from the previous 348×2867 artwork, add [`apps-script/Fix_Side_Panel_Height_Once.gs`](apps-script/Fix_Side_Panel_Height_Once.gs) to the installed Apps Script project and run `yoloFiveFixSidePanelHeightOnce` once to extend the ten displayed images and force the refresh. Updating GitHub alone cannot edit the installed Apps Script project; its existing image replacement code preserves the on-sheet display height. If an AREDL thumbnail or level ID cannot be resolved reliably, generation fails and the last good images remain in the sheet.
