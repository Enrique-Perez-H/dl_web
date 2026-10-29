#!/usr/bin/env python3
"""Download in-game item icons into assets/items/ and write assets/items/index.json ({slug: filename}).

Source: the community Deadlock assets API (https://assets.deadlock-api.com), which serves
the images extracted from the game files. Item names are matched to the names in data.json.

    python3 scripts/fetch_item_icons.py

Needs network access to assets.deadlock-api.com and its image CDN.
"""
import json, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://assets.deadlock-api.com/v2/items/by-type/upgrade?language=english"
OUT = ROOT / "assets" / "items"
FIELDS = ("shop_image", "image", "shop_image_webp", "image_webp")  # preference order


def slug(name):  # keep in sync with islug() in app.js
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"[’']", "", name.lower())).strip("-")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "dl_web icon fetch"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main():
    wanted = {slug(n): n for n in json.loads((ROOT / "data.json").read_text(encoding="utf8"))["items"]}
    items = json.loads(get(API))
    OUT.mkdir(parents=True, exist_ok=True)
    have, seen = {}, set()
    for it in items:
        s = slug(it.get("name", ""))
        if s not in wanted or s in seen:
            continue
        seen.add(s)
        url = next((it[f] for f in FIELDS if it.get(f)), None)
        if not url:
            continue
        ext = Path(url.split("?")[0]).suffix or ".png"
        (OUT / f"{s}{ext}").write_bytes(get(url))
        have[s] = f"{s}{ext}"
    (OUT / "index.json").write_text(json.dumps(have, indent=0, sort_keys=True) + "\n")
    print(f"{len(have)}/{len(wanted)} icons saved")
    for s in sorted(set(wanted) - have):
        print("missing:", wanted[s], file=sys.stderr)


if __name__ == "__main__":
    main()
