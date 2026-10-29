#!/usr/bin/env python3
"""Refresh winrates, pick rates, games, best-winrate items and item costs in data.json from the public Deadlock API.

    python3 scripts/update_stats.py                      # last 14 days, all ranks, normal mode
    python3 scripts/update_stats.py --days 7 --min-badge 100 --match-mode ranked

Endpoints (https://api.deadlock-api.com): /v1/analytics/hero-stats, /v1/analytics/item-stats,
/v1/assets/heroes, /v1/assets/items. --min-badge/--max-badge use the API's badge encoding
(tier = leading digits, subtier = last digit; e.g. 100 = Ascendant 1).
"""
import argparse, json, re, sys, time, urllib.parse, urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://api.deadlock-api.com/v1"
MIN_BUY_RATE = 5.0   # % of the hero's games in which an item must be bought to count as "best"
BEST_N = 4


def get(path, **params):
    q = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    req = urllib.request.Request(f"{BASE}{path}?{q}", headers={"User-Agent": "dl_web stats update"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read())
        except Exception as e:
            if attempt == 2:
                raise
            print(f"retry {path}: {e}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--match-mode")
    ap.add_argument("--min-badge", type=int)
    ap.add_argument("--max-badge", type=int)
    a = ap.parse_args()

    path = ROOT / "data.json"
    S = json.loads(path.read_text(encoding="utf8"))
    flt = dict(min_unix_timestamp=int(time.time()) - a.days * 86400, match_mode=a.match_mode,
               min_average_badge=a.min_badge, max_average_badge=a.max_badge)

    hero_ids = {h["name"]: h["id"] for h in get("/assets/heroes")}
    upgrades = [i for i in get("/assets/items") if i.get("type") == "upgrade" and i["name"] in S["items"]]
    item_names = {i["id"]: i["name"] for i in upgrades}
    for i in upgrades:  # keep shop costs current (new items arrive with cost 0)
        if i.get("cost"):
            S["items"][i["name"]]["cost"] = i["cost"]
    slug_by_id = {hero_ids[h["name"]]: s for s, h in S["heroes"].items() if h["name"] in hero_ids}
    if len(slug_by_id) != len(S["heroes"]):
        sys.exit("hero names in data.json do not all match the API")

    rows = {r["hero_id"]: r for r in get("/analytics/hero-stats", **flt)}
    total = sum(r["matches"] for r in rows.values()) / 12  # 12 players per game
    out = {}
    for hid, slug in slug_by_id.items():
        r = rows.get(hid)
        if not r or not r["matches"]:
            print(f"no data for {slug}", file=sys.stderr)
            out[slug] = {"wr": None, "pick": None, "games": None, "best": []}
            continue
        items = get("/analytics/item-stats", hero_id=hid, min_matches=max(50, int(r["matches"] * MIN_BUY_RATE / 100)), **flt)
        best = sorted(((item_names[i["item_id"]], i["wins"] / i["matches"] * 100) for i in items
                       if i["item_id"] in item_names and i["matches"] / r["matches"] * 100 >= MIN_BUY_RATE),
                      key=lambda x: -x[1])[:BEST_N]
        out[slug] = {"wr": round(r["wins"] / r["matches"] * 100, 1), "pick": round(r["matches"] / total * 100, 1),
                     "games": r["matches"], "best": [[n, round(w, 1)] for n, w in best]}
        print(f"{slug:14s} wr {out[slug]['wr']:5.1f}  pick {out[slug]['pick']:5.1f}  games {r['matches']:>8}")
        time.sleep(0.3)

    S["stats"] = {
        "src": "https://deadlock-api.com", "srcName": "Deadlock API", "date": date.today().isoformat(),
        "scope": {"days": a.days, "matchMode": a.match_mode, "minBadge": a.min_badge, "maxBadge": a.max_badge},
        "hero": out,
    }
    path.write_text(json.dumps(S, ensure_ascii=False, indent=1) + "\n", encoding="utf8")
    print("data.json updated")


if __name__ == "__main__":
    main()
