"""Proof-of-concept: split full-height images into two lossless halves for in-cell IMAGE()."""
from io import BytesIO
from pathlib import Path
import requests
from PIL import Image

OUTPUT = Path("assets/lab-halves")
VERSIONS = {
    "current": "b760c99e88e1b5bdc2d8166f13bef91a0a3555ed",
    "grief": "5ea6846bbfca0032c5546136e68d0b2f406b692d",
}
BASE = "https://raw.githubusercontent.com/yolomodeboom/gd-showcase-gradients"

def build():
    for name, sha in VERSIONS.items():
        dest = OUTPUT / name
        dest.mkdir(parents=True, exist_ok=True)
        for side in ("left","right"):
            url = f"{BASE}/{sha}/assets/{side}.png"
            response = requests.get(url, timeout=50)
            response.raise_for_status()
            with Image.open(BytesIO(response.content)) as original:
                img = original.convert("RGBA")
                w,h = img.size
                split = h//2
                for part,(start,end) in enumerate([(0,split),(split,h)],1):
                    sliced=img.crop((0,start,w,end))
                    assert sliced.width*sliced.height < 1_000_000
                    destination = dest / f"{side}_{part}.png"
                    sliced.save(destination, optimize=True)
                    print(destination, sliced.size, destination.stat().st_size)
if __name__=="__main__":
    build()
