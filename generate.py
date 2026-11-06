#!/usr/bin/env python3
"""Build exact AREDL thumbnail fades and publish them through GitHub Actions."""
import json
import os
import re
import unicodedata
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image
import requests

ROOT = Path(__file__).parent
OUT = ROOT / "assets"
GD_ART = "https://raw.githubusercontent.com/All-Rated-Extreme-Demon-List/Thumbnails/main/levels/full/{}.webp"
AREDL_API = "https://api.aredl.net/v2/api/aredl/levels"
WIDTH, HEIGHT = 335, 2897  # strictly below Google Sheets' one-million-pixel limit
KNOWN = {
    "ashley wave trials": ("62912799", .82),
    "acheron": ("73667628", .40),
    "slaughterhouse": ("27690100", .40),
    "sakupen circles": ("76962930", .55),
    "solar flare": ("90390075", .43),
    "arcturus": ("72315402", .60),
}

def normalized(text):
    text = unicodedata.normalize("NFKD", str(text)).casefold()
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in text if not unicodedata.combining(c))).strip()

def download(url):
    response = requests.get(url, timeout=35, headers={"User-Agent":"Yolomodeboom-AREDL-Gradients/1.0"})
    response.raise_for_status()
    return response.content

def payload():
    event_path = os.getenv("GITHUB_EVENT_PATH")
    if event_path:
        event = json.loads(Path(event_path).read_text(encoding="utf-8"))
        if event.get("client_payload"):
            return event["client_payload"]
    return json.loads((ROOT / "demo_top6.json").read_text(encoding="utf-8"))

def resolve(entries):
    missing = [e for e in entries if not e.get("level_id") and normalized(e["name"]) not in KNOWN]
    lookup = {}
    if missing:
        data = json.loads(download(AREDL_API))
        if isinstance(data, dict):
            data = data.get("levels", data.get("data", data.get("results", [])))
        if not isinstance(data, list):
            raise ValueError("Unexpected AREDL API response")
        for e in data:
            if not isinstance(e, dict):
                continue
            name = normalized(e.get("name",""))
            gd_id = e.get("level_id") or e.get("gd_id") or e.get("gd_level_id")
            if name and gd_id and str(gd_id).isdigit():
                lookup[name] = str(gd_id)
    for e in entries:
        key = normalized(e["name"])
        if not e.get("level_id"):
            e["level_id"] = KNOWN.get(key, (None,))[0] or lookup.get(key)
        if not e["level_id"] or not str(e["level_id"]).isdigit():
            raise ValueError("No reliable Geometry Dash ID for " + e["name"])
        e["focus_x"] = KNOWN[key][1] if key in KNOWN else None
    return entries

def cover(im, width, height, focus):
    src_w, src_h = im.size
    crop_w = min(src_w, max(1, round(src_h * width / height)))
    if focus is None:
        gray = np.asarray(im.resize((384,216)).convert("L"), dtype=np.float32)
        rw = max(5, round(crop_w * 384 / src_w))
        scores = []
        for x in range(rw//2, 384-rw//2, max(6,rw//8)):
            portion = gray[:,max(0,x-rw//2):min(384,x+rw//2)]
            if portion.shape[1] >= 4:
                edge = np.abs(np.diff(portion, axis=1)).mean()
                scores.append(((edge + portion.std()/6)*(1-.10*abs(x/384-.5)*2),x))
        cx = max(scores)[1] * src_w / 384 if scores else src_w/2
    else:
        cx = focus * src_w
    x0 = int(np.clip(cx - crop_w/2, 0, src_w-crop_w))
    return np.asarray(im.crop((x0,0,x0+crop_w,src_h)).resize((width,height),Image.Resampling.LANCZOS),dtype=np.float32)

def step(x, a, b):
    t=np.clip((x-a)/(b-a),0,1)
    return t*t*(3-2*t)

def make_panel(entries, side):
    height,width=HEIGHT,WIDTH
    band=height/3
    overlap=height*.09
    tile_h=round(band+2*overlap)
    y=np.arange(height,dtype=np.float32)
    t12=step(y,band-overlap,band+overlap)
    t23=step(y,2*band-overlap,2*band+overlap)
    weights=(1-t12,t12*(1-t23),t23)
    rgb=np.zeros((height,width,3),dtype=np.float32)
    for i,(e,weight) in enumerate(zip(entries,weights)):
        raw=download(GD_ART.format(e["level_id"]))
        with Image.open(BytesIO(raw)) as im:
            tile=cover(im.convert("RGB"),width,tile_h,e.get("focus_x"))
        origin=round(band*(i+.5)-tile_h/2)
        indices=np.clip(np.arange(height)-origin,0,tile_h-1)
        rgb += tile[indices]*weight[:,None,None]
    x=np.arange(width,dtype=np.float32)/(width-1)
    if side=="right": x=1-x
    horizontal=1-step(x,.08,.95)
    vertical=np.minimum(step(y,-30,35),1-step(y,height-35,height+30))
    a=(.97*255*horizontal[None,:]*vertical[:,None]).clip(0,255).astype("uint8")
    return Image.fromarray(np.dstack((rgb.clip(0,255).astype("uint8"),a)),"RGBA")

def save_png(im,path):
    if im.width*im.height >= 1_000_000: raise ValueError("Image exceeds Sheets pixel limit")
    im.save(path,"PNG",optimize=True)
    if path.stat().st_size >= 2_000_000:
        im.quantize(colors=256,method=Image.Quantize.FASTOCTREE).save(path,"PNG",optimize=True)
    if path.stat().st_size >= 2_000_000: raise ValueError("Image exceeds Sheets 2MB limit")

def main():
    data=payload()
    raw_entries=data.get("levels",[])
    if len(raw_entries)!=6: raise ValueError("Exactly six entries required")
    entries=[]
    for e in raw_entries:
        name=str(e.get("name","")).strip()
        rank=int(e.get("aredl_rank",0))
        if not name or rank<=0: raise ValueError("Invalid name or AREDL rank")
        entries.append({"name":name,"aredl_rank":rank,**({"level_id":str(e["level_id"])} if e.get("level_id") else {})})
    if [e["aredl_rank"] for e in entries] != sorted(e["aredl_rank"] for e in entries):
        raise ValueError("Levels must be ordered by AREDL rank")
    signature="|".join(e["name"].lower() for e in entries)
    if signature!=data.get("signature"): raise ValueError("Top-six signature mismatch")
    resolve(entries)
    left=make_panel(entries[:3],"left")
    right=make_panel(entries[3:],"right")
    OUT.mkdir(exist_ok=True)
    save_png(left,OUT/"left.png")
    save_png(right,OUT/"right.png")
    manifest={"schema_version":1,"signature":signature,
        "generated_utc":datetime.now(timezone.utc).isoformat(),
        "levels":entries,
        "images":{"left":"assets/left.png","right":"assets/right.png"}}
    (OUT/"manifest.json").write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print("Generated both panels for",signature)

if __name__=="__main__":
    main()
