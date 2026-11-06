#!/usr/bin/env python3
"""Generate all five independently sorted top-six artwork pairs.

Event payload format:
{
  "modes": [
    {"key": "aredl", "title": "AREDL placement",
     "signature": "name1|...|name6",
     "levels": [{"name": "...", "aredl_rank": 42}, ... 6]}
  ]
}
When run manually, loads sorts_snapshot.json from the repository.
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from generate import OUT, make_panel, resolve, save_png, normalized

# Row 4 is visually hidden in each showcase. Keep the AREDL-only
# legacy generator unchanged; render the five-sort panels at the new
# visible grid height, with the maximum width under Sheets' 1M-pixel cap.
import generate as gradient_core
gradient_core.WIDTH, gradient_core.HEIGHT = 348, 2867  # 997,716 pixels; ends at start of footer row 57

BASE = Path(__file__).parent
MODES = {
    "aredl": "AREDL placement",
    "most": "Most attempts",
    "least": "Least attempts",
    "newest": "Newest first",
    "oldest": "Oldest first",
}

def load_payload():
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if event_path:
        event = json.loads(Path(event_path).read_text(encoding="utf-8"))
        if event.get("client_payload", {}).get("modes"):
            return event["client_payload"]
    return json.loads((BASE / "sorts_snapshot.json").read_text(encoding="utf-8"))

def main():
    payload = load_payload()
    modes = payload.get("modes")
    if not isinstance(modes, list) or len(modes) != len(MODES):
        raise ValueError("Expected five sorted modes")

    # Resolve Geometry Dash IDs once, including across repeated level names.
    all_levels = {}
    for mode in modes:
        if mode.get("key") not in MODES or mode.get("title") != MODES[mode.get("key")]:
            raise ValueError("Unexpected sorting mode")
        raw = mode.get("levels")
        if not isinstance(raw, list) or len(raw) != 6:
            raise ValueError("Each mode requires exactly six level entries")
        computed = "|".join(normalized(e.get("name","")) for e in raw)
        if computed != mode.get("signature"):
            raise ValueError("Signature mismatch in " + mode["key"])
        for e in raw:
            name = str(e.get("name","")).strip()
            rank = int(e.get("aredl_rank",0))
            if not name or rank < 1:
                raise ValueError("Invalid name/rank")
            key=normalized(name)
            if key not in all_levels:
                all_levels[key] = {"name": name, "aredl_rank": rank, **({"level_id":str(e["level_id"])} if e.get("level_id") else {})}
    if {m["key"] for m in modes} != set(MODES):
        raise ValueError("One or more modes missing")

    resolve(list(all_levels.values()))
    output = {"schema_version":1,
              "generated_utc":datetime.now(timezone.utc).isoformat(),
              "modes": {}}
    for mode in modes:
        key = mode["key"]
        levels = [dict(all_levels[normalized(e["name"])]) for e in mode["levels"]]
        target = OUT / "sorts" / key
        target.mkdir(parents=True,exist_ok=True)
        save_png(make_panel(levels[:3], "left"), target / "left.png")
        save_png(make_panel(levels[3:], "right"), target / "right.png")
        output["modes"][key] = {
            "title": mode["title"],
            "signature": mode["signature"],
            "levels": levels,
            "images": {
                "left":f"assets/sorts/{key}/left.png",
                "right":f"assets/sorts/{key}/right.png"
            }
        }
        print("Built",key, mode["signature"], flush=True)
    dest = OUT / "sorts" / "manifest.json"
    dest.write_text(json.dumps(output,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")

if __name__ == "__main__":
    main()
