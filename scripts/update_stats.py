#!/usr/bin/env python3
"""Refresh everything that comes from game data in data.json, using the public Deadlock API.

    python3 scripts/update_stats.py                  # everything, last 14 days
    python3 scripts/update_stats.py --days 7
    python3 scripts/update_stats.py --skip-curves    # skip the slow per-matchup lane curves (~10 min)
    python3 scripts/update_stats.py --only builds    # one step: stats | curves | builds | variants | history

Steps (API: https://api.deadlock-api.com):
  stats    per rank bracket: winrate / pick rate / games (hero-stats), best-winrate items (item-stats),
           same-lane matchups (hero-counter-stats) and best lane partners (hero-synergy-stats)
  curves   per rank bracket: souls lead of a hero's duo over the enemy duo at 3/6/9/12/15 min for every
           hero pair that lanes against each other (lane-soul-curve; the API marks it "subject to change")
  builds   most bought items per game phase for every hero (item-stats with purchase-time windows)
  variants heroes played two ways (e.g. spirit / gun): detects the two archetypes from item co-purchase data
           (item-permutation-stats) and builds each one from the players who went that way
  abilities ability upgrade order per hero from ability-order-stats / ability-max-first-stats (replaces the deadlocktiers order)
  flow     item progression per hero by game phase with transitions (item-flow-stats)
  counter  items that win more than usual against teams with a given hero (item-stats with enemy_hero_ids)
  items    average buy minute per item and per hero, and component / upgrade chains from the game's item data
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
VARIANT_MIN, VARIANT_MAX, VARIANT_LIFT = 0.12, 0.80, 0.60
VARIANT_SHARE = 20.0   # % of a hero's players each variant must cover (and the two must differ in kind: weapon / spirit / vitality)
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


def phase_build(hid, flt, names, include=None):
    """Most bought items per phase for a hero, optionally only among players who bought every item in `include`."""
    per = {}
    for key, lo, hi in PHASES:
        items = get("/analytics/item-stats", hero_id=hid, min_bought_at_s=lo, max_bought_at_s=hi, min_matches=100 if include else 200,
                    include_item_ids=",".join(map(str, include)) if include else None, **flt)
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
    return build


def add_new_items(S, build, by_name):
    added = 0
    for lst in build.values():
        for n in lst:
            if n not in S["items"]:
                S["items"][n] = {"c": SLOT_CAT.get(by_name[n].get("item_slot_type"), "s"), "cost": by_name[n].get("cost") or 0}
                added += 1
    return added


def builds_step(S, flt, slug_by_id, upgrades):
    names = {i["id"]: i["name"] for i in upgrades}
    by_name = {i["name"]: i for i in upgrades}
    added = 0
    for hid, s in slug_by_id.items():
        build = phase_build(hid, flt, names)
        if sum(map(len, build.values())) < 6:
            print(f"not enough build data for {s}, keeping the old build", file=sys.stderr)
            continue
        S["heroes"][s].update(build)
        added += add_new_items(S, build, by_name)
        print(f"  build {s}: " + " | ".join(", ".join(build[k][:3]) for k, _, _ in PHASES))
    if added:
        print(f"added {added} items to data.json (run scripts/fetch_item_icons.py for their icons)")


def variants_step(S, flt, slug_by_id, upgrades, only=None):
    """Find heroes played in two distinct ways (e.g. spirit Talon / gun Talon) and build each variant.

    Items bought by 12-80% of a hero's players are candidates. If two of them are rarely bought together
    (co-purchase lift <= VARIANT_LIFT) the hero has two archetypes: every other candidate joins the anchor it is
    co-bought with more. Each archetype is identified by two items bought together; its build, share and winrate
    are read from the players who bought both."""
    names = {i["id"]: i["name"] for i in upgrades}
    by_name = {i["name"]: i for i in upgrades}
    slot = {i["id"]: i.get("item_slot_type") for i in upgrades}
    found = 0
    for hid, s in slug_by_id.items():
        if only and s not in only:
            continue
        S["heroes"][s].pop("variants", None)
        items = get("/analytics/item-stats", hero_id=hid, min_matches=500, **flt)
        cnt = {i["item_id"]: i["matches"] for i in items if i["item_id"] in names}
        if not cnt:
            continue
        N = max(cnt.values())
        cand = [i for i, c in cnt.items() if VARIANT_MIN <= c / N <= VARIANT_MAX and c >= 1000]
        if len(cand) < 4:
            continue
        pairs = get("/analytics/item-permutation-stats", hero_ids=hid, comb_size=2, min_matches=max(100, int(N * 0.004)), **flt)
        co = {frozenset(p["item_ids"]): p["matches"] for p in pairs}
        lift = lambda a, b: co.get(frozenset((a, b)), 0) * N / (cnt[a] * cnt[b])
        a, b = min(((x, y) for i, x in enumerate(cand) for y in cand[i + 1:]), key=lambda p: lift(*p))
        if lift(a, b) > VARIANT_LIFT:
            continue
        groups = {a: [a], b: [b]}
        for x in cand:
            if x not in (a, b):
                groups[a if lift(x, a) >= lift(x, b) else b].append(x)
        if min(map(len, groups.values())) < 2:
            continue
        variants = []
        for anchor, members in groups.items():
            mates = [m for m in sorted(members, key=lambda m: -cnt[m]) if m != anchor and lift(anchor, m) >= 1.0]
            if not mates:
                continue
            sig = [anchor, mates[0]]
            stat = get("/analytics/item-stats", hero_id=hid, include_item_ids=",".join(map(str, sig)), min_matches=100, **flt)
            row = next((i for i in stat if i["item_id"] == anchor), None)
            if not row or row["matches"] / N < VARIANT_SHARE / 100 * 0.9:
                continue
            kinds = {}
            for m in members:
                kinds[slot[m]] = kinds.get(slot[m], 0) + cnt[m]
            build = phase_build(hid, flt, names, include=sig)
            if sum(map(len, build.values())) < 6:
                continue
            add_new_items(S, build, by_name)
            variants.append({"kind": SLOT_CAT.get(max(kinds, key=kinds.get), "s"), "share": round(row["matches"] / N * 100, 1),
                             "wr": round(row["wins"] / row["matches"] * 100, 1), "games": row["matches"],
                             "sig": [names[x] for x in sig], **build})
        if len(variants) == 2 and min(v["share"] for v in variants) >= VARIANT_SHARE and variants[0]["kind"] != variants[1]["kind"]:
            variants.sort(key=lambda v: -v["share"])
            S["heroes"][s]["variants"] = variants
            found += 1
            print(f"  {s}: lift {lift(a, b):.2f}  " + "  vs  ".join(f"{v['kind']} {v['share']}% wr {v['wr']} [{', '.join(v['sig'])}]" for v in variants))
    print(f"{found} heroes with two builds")


def abilities_step(S, flt, slug_by_id, all_items):
    """Ability upgrade order from real games: consensus order of the 15 upgrade points, max-priority order and what is maxed first.

    heroes[slug].order = {seq: [slot, ...] (1-4, the consensus upgrade order), prio: [ability names by when they are maxed],
                          maxFirst: [[name, share %, winrate %], ...]}"""
    for hid, s in slug_by_id.items():
        h = S["heroes"][s]
        ids = {i["id"]: h["abilities"].index(i["name"]) + 1 for i in all_items
               if i.get("type") == "ability" and hid in (i.get("heroes") or []) and i["name"] in h["abilities"]}
        if len(ids) < 4:
            print(f"  {s}: found {len(ids)}/4 ability ids, keeping the old order", file=sys.stderr)
            continue
        rows = get("/analytics/ability-order-stats", hero_id=hid, min_matches=100, **flt)
        pos = {}                                  # (slot, k-th point) -> [weighted position sum, weight]
        for r in rows:
            seen = {}
            for idx, a in enumerate(r["abilities"]):
                slot = ids.get(a)
                if slot is None:
                    continue
                seen[slot] = seen.get(slot, 0) + 1
                acc = pos.setdefault((slot, seen[slot]), [0.0, 0])
                acc[0] += idx * r["matches"]; acc[1] += r["matches"]
        if not pos:
            continue
        seq = [k[0] for k in sorted(pos, key=lambda k: pos[k][0] / pos[k][1])]
        third = {slot: pos[(slot, 3)][0] / pos[(slot, 3)][1] for slot in range(1, 5) if (slot, 3) in pos}
        prio = [h["abilities"][slot - 1] for slot in sorted(third, key=third.get)] + [n for i, n in enumerate(h["abilities"], 1) if i not in third]
        mf = [r for r in get("/analytics/ability-max-first-stats", hero_id=hid, min_matches=200, **flt) if r["ability_id"] in ids]
        tot = sum(r["matches"] for r in mf) or 1
        order = {"seq": seq[:15], "prio": prio,
                 "maxFirst": [[h["abilities"][ids[r["ability_id"]] - 1], round(r["matches"] / tot * 100, 1), round(r["wins"] / r["matches"] * 100, 1)]
                              for r in sorted(mf, key=lambda r: -r["matches"])[:3]]}
        h["order"], h["prio"] = order, prio
        print(f"  {s}: max first {order['maxFirst'][0][0] if order['maxFirst'] else '-'}; order {''.join(map(str, order['seq']))}")


FLOW_COLS = 4          # item-flow-stats phases: 0-9, 9-20, 20-30, 30+ minutes
FLOW_TOP = 8


def flow_step(S, flt, slug_by_id, item_names):
    """Item progression per hero: the most bought items in each game phase with pick rate, winrate and what they are followed by.

    flow[slug] = {n: players, cols: [[[item, pick %, winrate %, [[next item, share % of buyers], ...]], ...], x4]}"""
    S["flow"] = {}
    for hid, s in slug_by_id.items():
        f = get("/analytics/item-flow-stats", hero_ids=hid, min_matches=300, **flt)
        reached = f["reached_per_column"]
        nodes = [n for n in f["nodes"] if n["item_id"] in item_names]
        by = {(n["column"], n["item_id"]): n for n in nodes}
        out = []
        for col in range(FLOW_COLS):
            top = sorted((n for n in nodes if n["column"] == col), key=lambda n: -n["matches"])[:FLOW_TOP]
            col_out = []
            for n in top:
                nxt = sorted((e for e in f["edges"] if e["from_column"] == col and e["from_item_id"] == n["item_id"] and e["to_item_id"] in item_names),
                             key=lambda e: -e["matches"])[:3] if col < FLOW_COLS - 1 else []
                col_out.append([item_names[n["item_id"]], round(n["matches"] / reached[col] * 100, 1), round(n["wins"] / n["matches"] * 100, 1),
                                [[item_names[e["to_item_id"]], round(e["matches"] / n["matches"] * 100)] for e in nxt]])
            out.append(col_out)
        S["flow"][s] = {"n": reached[0], "cols": out}
    print(f"  flow for {len(S['flow'])} heroes")


def counter_step(S, flt, slug_by_id, item_names):
    """Items that win more than usual against teams with a given hero: counter[enemy] = [[item, lift in winrate points, winrate %], ...].
    The lift is relative to the hero's own effect on every item, so it shows what is better than average against them."""
    base = {i["item_id"]: i["wins"] / i["matches"] * 100 for i in get("/analytics/item-stats", min_matches=2000, **flt) if i["matches"]}
    S["counter"] = {}
    for hid, s in slug_by_id.items():
        rows = get("/analytics/item-stats", enemy_hero_ids=hid, min_matches=1500, **flt)
        raw = [(item_names[i["item_id"]], i["wins"] / i["matches"] * 100 - base[i["item_id"]], i["wins"] / i["matches"] * 100)
               for i in rows if i["item_id"] in item_names and i["item_id"] in base]
        if not raw:
            S["counter"][s] = []
            continue
        # every item wins less against a strong hero: centre on the median so the lift shows which items do better than usual
        med = sorted(l for _, l, _ in raw)[len(raw) // 2]
        lifts = sorted(((n, l - med, w) for n, l, w in raw), key=lambda x: -x[1])[:6]
        S["counter"][s] = [[n, round(l, 1), round(w, 1)] for n, l, w in lifts]
    print(f"  counter items for {len(S['counter'])} heroes")


def items_step(S, flt, slug_by_id, upgrades, item_names):
    """Item timing and upgrade chains.

    items[name].t = average minute the item is bought; items[name].from / .to = components it is built from / items it upgrades into;
    heroes[slug].times = {item: average buy minute} for the items the hero buys."""
    for i in get("/analytics/item-stats", min_matches=2000, **flt):
        if i["item_id"] in item_names:
            S["items"][item_names[i["item_id"]]]["t"] = round(i["avg_buy_time_s"] / 60, 1)
    cls = {i["class_name"]: i["name"] for i in upgrades}
    for name in S["items"]:
        S["items"][name].pop("from", None); S["items"][name].pop("to", None)
    for i in upgrades:
        if i["name"] not in S["items"]:
            continue
        comps = [cls[c] for c in (i.get("component_items") or []) if c in cls and cls[c] in S["items"]]
        if comps:
            S["items"][i["name"]]["from"] = comps
            for c in comps:
                S["items"][c].setdefault("to", []).append(i["name"])
    for hid, s in slug_by_id.items():
        rows = get("/analytics/item-stats", hero_id=hid, min_matches=300, **flt)
        n = max((r["matches"] for r in rows), default=0)
        S["heroes"][s]["times"] = {item_names[r["item_id"]]: round(r["avg_buy_time_s"] / 60, 1) for r in rows
                                   if r["item_id"] in item_names and r["matches"] >= 0.03 * n}
    print("  item timing and upgrade chains updated")



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
    ap.add_argument("--only", choices=["stats", "curves", "builds", "variants", "abilities", "flow", "counter", "items", "history"])
    ap.add_argument("--hero", help="with --only variants: comma separated hero slugs to (re)build")
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
    all_items = get("/assets/items")
    upgrades = [i for i in all_items if i.get("type") == "upgrade" and not i.get("disabled")]
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
    if run("variants"):
        print("== build variants (ranked, all ranks)")
        variants_step(S, {"min_unix_timestamp": since, "match_mode": "ranked"}, slug_by_id, upgrades, only=set(a.hero.split(",")) if a.hero else None)
    ranked = {"min_unix_timestamp": since, "match_mode": "ranked"}
    if run("abilities"):
        print("== ability order (ranked, all ranks)")
        abilities_step(S, ranked, slug_by_id, all_items)
    if run("flow"):
        print("== item flow (ranked, all ranks)")
        flow_step(S, ranked, slug_by_id, item_names)
    if run("counter"):
        print("== items against each hero (ranked, all ranks)")
        counter_step(S, ranked, slug_by_id, item_names)
    if run("items"):
        print("== item timing and upgrade chains (ranked, all ranks)")
        items_step(S, ranked, slug_by_id, upgrades, item_names)
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
