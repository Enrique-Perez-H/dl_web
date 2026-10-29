#!/usr/bin/env python3
"""Refresh everything that comes from game data in data.json, using the public Deadlock API.

    python3 scripts/update_stats.py                  # everything, last 14 days
    python3 scripts/update_stats.py --days 7
    python3 scripts/update_stats.py --skip-curves    # skip the slow per-matchup lane curves (~10 min)
    python3 scripts/update_stats.py --only builds    # one step: stats | curves | builds | history

Steps (API: https://api.deadlock-api.com):
  stats    per rank bracket: winrate / pick rate / games (hero-stats), best-winrate items (item-stats),
           same-lane matchups (hero-counter-stats) and best lane partners (hero-synergy-stats)
  curves   per rank bracket: souls lead of a hero's duo over the enemy duo at 3/6/9/12/15 min for every
           hero pair that lanes against each other (lane-soul-curve; the API marks it "subject to change")
  builds   most bought items per game phase for every hero (item-stats with purchase-time windows)
  history  winrate per hero in each window between the balance patches listed in meta.patchDates

Also keeps item costs current and adds items the API has but data.json does not.
"""
import argparse, json, math, re, sys, threading, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://api.deadlock-api.com/v1"
BRACKETS = {                       # key -> API filters; labels live in app.js
    "all": {},
    "high": {"min_average_badge": 80},    # average badge Oracle and above
}
MIN_BUY_RATE = 5.0       # % of a hero's games an item must be bought in to count as "best winrate"
BEST_N = 4
BUILD_N = 6              # items per phase in a build
PHASES = (("early", 0, 600), ("mid", 600, 1200), ("late", 1200, None))
PARTNER_K, PARTNERS_N = 300, 6
CURVE_TIMES = (180, 360, 540, 720, 900)
SLOT_CAT = {"weapon": "w", "vitality": "v", "spirit": "s"}

_lock, _last = threading.Lock(), [0.0]


def get(path, **params):
    """GET with retries and a global ~3 requests/second throttle (the API allows 200/min)."""
    q = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    req = urllib.request.Request(f"{BASE}{path}?{q}", headers={"User-Agent": "dl_web stats update"})
    for attempt in range(4):
        with _lock:
            wait = _last[0] + 0.32 - time.time()
            if wait > 0:
                time.sleep(wait)
            _last[0] = time.time()
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read())
        except Exception as e:
            if attempt == 3:
                raise
            print(f"retry {path}: {e}", file=sys.stderr)
            time.sleep(4 * (attempt + 1))


def slug(name):  # keep in sync with islug() in app.js
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"[’']", "", name.lower())).strip("-")


def stats_step(S, flt, slug_by_id, item_names):
    rows = {r["hero_id"]: r for r in get("/analytics/hero-stats", **flt)}
    total = sum(r["matches"] for r in rows.values()) / 12  # 12 players per game
    hero = {}
    for hid, s in slug_by_id.items():
        r = rows.get(hid)
        if not r or not r["matches"]:
            hero[s] = {"wr": None, "pick": None, "games": None, "best": []}
            continue
        items = get("/analytics/item-stats", hero_id=hid, min_matches=max(50, int(r["matches"] * MIN_BUY_RATE / 100)), **flt)
        best = sorted(((item_names[i["item_id"]], i["wins"] / i["matches"] * 100) for i in items
                       if i["item_id"] in item_names and i["matches"] / r["matches"] * 100 >= MIN_BUY_RATE),
                      key=lambda x: -x[1])[:BEST_N]
        hero[s] = {"wr": round(r["wins"] / r["matches"] * 100, 1), "pick": round(r["matches"] / total * 100, 1),
                   "games": r["matches"], "best": [[n, round(w, 1)] for n, w in best]}

    vs = {}
    for r in get("/analytics/hero-counter-stats", same_lane_filter="true", min_matches=100, **flt):
        a, b = slug_by_id.get(r["hero_id"]), slug_by_id.get(r["enemy_hero_id"])
        if not a or not b or not r["matches_played"]:
            continue
        share = lambda x, y: round(x / (x + y), 3) if x + y else 0.5
        vs.setdefault(a, {})[b] = [r["wins"], r["matches_played"], share(r["kills"], r["enemy_kills"]),
                                   share(r["last_hits"], r["enemy_last_hits"]), share(r["networth"], r["enemy_networth"])]
    wr = {s: (h["wr"] or 50) / 100 for s, h in hero.items()}
    pairs = {}
    for r in get("/analytics/hero-synergy-stats", same_lane_filter="true", min_matches=100, **flt):
        a, b = slug_by_id.get(r["hero_id1"]), slug_by_id.get(r["hero_id2"])
        if not a or not b or not r["matches_played"]:
            continue
        for x, y in ((a, b), (b, a)):
            exp = min(max(wr[x] + wr[y] - 0.5, 0.05), 0.95)
            lift = (r["wins"] - r["matches_played"] * exp) / (r["matches_played"] + PARTNER_K) * 100
            pairs.setdefault(x, []).append([y, r["wins"], r["matches_played"], round(lift, 1)])
    duo = {s: sorted(l, key=lambda q: -q[3])[:PARTNERS_N] for s, l in pairs.items()}
    return hero, {"vs": vs, "duo": duo}


def curves_step(flt, hero_ids):
    """curve["a|b"] (a < b alphabetically) = [matches, lead@180, @360, @540, @720, @900, std@900] from a's duo."""
    slugs = sorted(hero_ids)
    pairs = [(a, b) for i, a in enumerate(slugs) for b in slugs[i + 1:]]

    def one(pair):
        a, b = pair
        rows = get("/analytics/lane-soul-curve", hero_ids=hero_ids[a], enemy_hero_ids=hero_ids[b], group_by="assigned_lane",
                   max_time_s=CURVE_TIMES[-1], min_matches=20, **flt)
        rows = [r for r in rows if r.get("net_worth_diff") and len(r["net_worth_diff"]) == len(CURVE_TIMES)]
        n = sum(r["matches_played"] for r in rows)
        if n < 100:
            return None
        mean = [sum(r["matches_played"] * r["net_worth_diff"][i] for r in rows) / n for i in range(len(CURVE_TIMES))]
        sd = math.sqrt(sum(r["matches_played"] * r["net_worth_diff_std"][-1] ** 2 for r in rows) / n)
        return f"{a}|{b}", [n] + [round(m) for m in mean] + [round(sd)]

    out, done = {}, 0
    with ThreadPoolExecutor(max_workers=4) as ex:
        for res in ex.map(one, pairs):
            done += 1
            if res:
                out[res[0]] = res[1]
            if done % 100 == 0:
                print(f"  curves {done}/{len(pairs)}", flush=True)
    return out


def builds_step(S, flt, slug_by_id, upgrades):
    names = {i["id"]: i["name"] for i in upgrades}
    by_name = {i["name"]: i for i in upgrades}
    added = 0
    for hid, s in slug_by_id.items():
        per = {}
        for key, lo, hi in PHASES:
            items = get("/analytics/item-stats", hero_id=hid, min_bought_at_s=lo, max_bought_at_s=hi, min_matches=200, **flt)
            per[key] = {names[i["item_id"]]: i for i in items if i["item_id"] in names}
        owner = {}   # an item belongs to the phase where it is bought most
        for key, _, _ in PHASES:
            for n, i in per[key].items():
                if n not in owner or i["matches"] > per[owner[n]][n]["matches"]:
                    owner[n] = key
        build = {}
        for key, _, _ in PHASES:
            top = sorted((n for n, k in owner.items() if k == key), key=lambda n: -per[key][n]["matches"])[:BUILD_N]
            build[key] = sorted(top, key=lambda n: per[key][n]["avg_buy_time_s"])
        if sum(map(len, build.values())) < 6:
            print(f"not enough build data for {s}, keeping the old build", file=sys.stderr)
            continue
        for key, lst in build.items():
            S["heroes"][s][key] = lst
            for n in lst:
                if n not in S["items"]:
                    it = by_name[n]
                    S["items"][n] = {"c": SLOT_CAT.get(it.get("item_slot_type"), "s"), "cost": it.get("cost") or 0}
                    added += 1
        print(f"  build {s}: " + " | ".join(", ".join(build[k][:3]) for k, _, _ in PHASES))
    if added:
        print(f"added {added} items to data.json (run scripts/fetch_item_icons.py for their icons)")


def history_step(S, flt, slug_by_id):
    ds = sorted(S["meta"].get("patchDates", []))
    if not ds:
        print("meta.patchDates is empty; skipping history", file=sys.stderr)
        return None
    ts = lambda d: int(datetime.fromisoformat(d).replace(tzinfo=timezone.utc).timestamp())
    bounds = ds + [date.today().isoformat()]
    wins = [{"from": a, "to": b} for a, b in zip(bounds, bounds[1:]) if ts(b) - ts(a) >= 2 * 86400][-6:]
    hero = {s: [] for s in slug_by_id.values()}
    for w in wins:
        rows = {r["hero_id"]: r for r in get("/analytics/hero-stats", **{**flt, "min_unix_timestamp": ts(w["from"]), "max_unix_timestamp": ts(w["to"])})}
        for hid, s in slug_by_id.items():
            r = rows.get(hid)
            hero[s].append(round(r["wins"] / r["matches"] * 100, 1) if r and r["matches"] >= 500 else None)
        print(f"  window {w['from']} → {w['to']}")
    return {"windows": wins, "hero": hero}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--only", choices=["stats", "curves", "builds", "history"])
    ap.add_argument("--skip-curves", action="store_true")
    a = ap.parse_args()
    run = lambda step: a.only in (None, step) and not (step == "curves" and a.skip_curves and a.only is None)

    path = ROOT / "data.json"
    S = json.loads(path.read_text(encoding="utf8"))
    hero_ids = {h["name"]: h["id"] for h in get("/assets/heroes")}
    ids = {s: hero_ids[h["name"]] for s, h in S["heroes"].items() if h["name"] in hero_ids}
    if len(ids) != len(S["heroes"]):
        sys.exit("hero names in data.json do not all match the API")
    slug_by_id = {v: k for k, v in ids.items()}
    upgrades = [i for i in get("/assets/items") if i.get("type") == "upgrade" and not i.get("disabled")]
    item_names = {i["id"]: i["name"] for i in upgrades if i["name"] in S["items"]}
    for i in upgrades:   # keep shop costs current
        if i["name"] in S["items"] and i.get("cost"):
            S["items"][i["name"]]["cost"] = i["cost"]

    since = int(time.time()) - a.days * 86400
    S.setdefault("brackets", {})
    for key, extra in BRACKETS.items():
        flt = {"min_unix_timestamp": since, **extra}
        br = S["brackets"].setdefault(key, {})
        if run("stats"):
            print(f"== stats [{key}]")
            hero, lane = stats_step(S, flt, slug_by_id, item_names)
            br["stats"] = {"src": "https://deadlock-api.com", "srcName": "Deadlock API", "date": date.today().isoformat(),
                           "scope": {"days": a.days, **extra}, "hero": hero}
            br["lane"] = {**lane, "curve": br.get("lane", {}).get("curve", {})}
        if run("curves"):
            print(f"== lane curves [{key}]")
            br.setdefault("lane", {"vs": {}, "duo": {}})["curve"] = curves_step(flt, ids)
    if run("builds"):
        print("== builds (ranked, all ranks)")
        builds_step(S, {"min_unix_timestamp": since, "match_mode": "ranked"}, slug_by_id, upgrades)
        S["meta"]["buildsSrc"] = {"srcName": "Deadlock API", "src": "https://deadlock-api.com", "date": date.today().isoformat(), "days": a.days}
    if run("history"):
        print("== history")
        h = history_step(S, {}, slug_by_id)
        if h:
            S["history"] = h
    S.pop("stats", None)
    S.pop("lane", None)
    path.write_text(json.dumps(S, ensure_ascii=False, indent=1) + "\n", encoding="utf8")
    print("data.json updated")


if __name__ == "__main__":
    main()
