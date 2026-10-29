#!/usr/bin/env python3
"""Download in-game item icons into assets/items/ and write assets/items/index.json ({slug: filename}).

Source: the public Deadlock API asset list (https://api.deadlock-api.com/v1/assets/items), which
serves the images extracted from the game files. Names are matched to the items in data.json.

    python3 scripts/fetch_item_icons.py
"""
import json, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.deadlock-api.com/v1/assets/items"
OUT = ROOT / "assets" / "items"


def slug(name):  # keep in sync with islug() in app.js
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"[’']", "", name.lower())).strip("-")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "dl_web icon fetch"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main():
    wanted = {slug(n): n for n in json.loads((ROOT / "data.json").read_text(encoding="utf8"))["items"]}
    upgrades = [i for i in json.loads(get(API)) if i.get("type") == "upgrade"]
    upgrades.sort(key=lambda i: bool(i.get("disabled")))  # prefer enabled items on duplicate names
    OUT.mkdir(parents=True, exist_ok=True)
    have = {}
    for it in upgrades:
        s = slug(it.get("name", ""))
        url = it.get("shop_image_webp") or it.get("shop_image") or it.get("image")  # "image" is a monochrome glyph and sometimes points at the wrong item
        if s not in wanted or s in have or not url:
            continue
        ext = Path(url.split("?")[0]).suffix or ".png"
        (OUT / f"{s}{ext}").write_bytes(get(url))
        have[s] = f"{s}{ext}"
    (OUT / "index.json").write_text(json.dumps(have, indent=0, sort_keys=True) + "\n")
    print(f"{len(have)}/{len(wanted)} icons saved to {OUT}")
    for s in sorted(set(wanted) - set(have)):
        print("missing:", wanted[s], file=sys.stderr)


if __name__ == "__main__":
    main()
