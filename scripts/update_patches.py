#!/usr/bin/env python3
"""Per-hero patch changes with a buff / nerf / mixed verdict, from Valve's official patch notes on Steam.

    python3 scripts/update_patches.py            # last 180 days of patches
    python3 scripts/update_patches.py --days 365
    python3 scripts/update_patches.py --show 2026-10-14   # print how every line of that patch was classified

Source: Steam's public news API for Deadlock (app 1422450), official announcements only. Hero changes are the
lines written as "- Hero: change". Each line is classified as buff (+1), nerf (-1) or neutral (0) from its wording and numbers;
a hero's verdict for a patch comes from the weighted total. This is a heuristic: the site shows every line with its
own arrow so a wrong call is easy to spot, and the original English text is kept.

Writes data.json: patches (newest first), heroes[slug].changes, and meta.patchDates (balance patches, used by the
winrate history chart; run `update_stats.py --only history` afterwards).
"""
import argparse, html, json, re, sys, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NEWS = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1422450&count=300&maxlength=0&format=json"
ALIASES = {"nurse": "nurse-harrow", "doorman": "the-doorman", "gray talon": "grey-talon", "mo and krill": "mo-krill", "mo & krill": "mo-krill",
           "krill": "mo-krill", "mo": "mo-krill", "geist": "lady-geist"}
KEEP_LINES = 24            # lines kept per hero per patch (the verdict always uses all of them)
BUFF_UP = re.compile(r"\b(increas\w*|rais\w*|improv\w*|boost\w*|extend\w*|lengthen\w*|buff\w*|gains?|now (?:has|gives|grants|also))\b", re.I)
NERF_DOWN = re.compile(r"\b(reduc\w*|decreas\w*|lower\w*|shorten\w*|nerf\w*|remov\w*|no longer|loses?|diminish\w*)\b", re.I)
# properties where a bigger number is worse for the hero
LOWER_BETTER = re.compile(r"cooldown|cool-down|delay|cast time|post-cast|wind-?up|channel time|recovery|reload|\bcost\b|spread|recoil|self[- ]damage|"
                          r"damage taken|cycle time|charge time|ramp[- ]up|penalty|drawback|stamina cost|health cost", re.I)
# "cooldown boon / reduction / scaling" is a bonus that shortens cooldowns: bigger is better
HIGHER_BETTER = re.compile(r"cooldown (?:boon|reduction|scaling|rate)|faster cooldown", re.I)
IGNORE = re.compile(r"\b(fix(?:ed|es)?|bugs?|visual|vfx|animations?|sounds?|audio|tooltips?|text|typo|ui|icon|model|cosmetic|reverted)\b", re.I)
NUM = r"[-+]?\d+(?:[.,]\d+)?"
FROM_TO = re.compile(rf"from\s+({NUM})[^0-9]{{0,30}}?\bto\s+({NUM})|({NUM})\s*(?:->|→)\s*({NUM})", re.I)


def classify(text):
    """(direction, weight) for one change line: +1 buff, -1 nerf, 0 neutral."""
    if IGNORE.search(text) or re.search(r"street brawl", text, re.I):
        return 0, 0.0
    ft = FROM_TO.search(text)
    a = b = None
    if ft:
        try:
            g = [x for x in ft.groups() if x is not None]
            a, b = float(g[0].replace(",", ".")), float(g[1].replace(",", "."))
        except ValueError:
            a = b = None
    up, down = BUFF_UP.search(text), NERF_DOWN.search(text)
    if up and not down:
        d = 1
    elif down and not up:
        d = -1
    elif a is not None and b is not None and a != b:
        d = 1 if b > a else -1            # no verb: read the numbers ("Cooldown from 30s to 25s")
    else:
        return 0, 0.0
    # "now has -7% resistance" style: a negative new value after "now has" is a nerf
    if re.search(r"now has\s+-", text, re.I):
        d = -1
    if LOWER_BETTER.search(text) and not HIGHER_BETTER.search(text):
        d = -d
    w = 1.0
    if a not in (None, 0) and b is not None:
        w = min(max(abs(b - a) / abs(a) * 5, 0.5), 2.0)
    return d, round(w, 2)


def verdict(net, tot, buffs, nerfs):
    if tot == 0:
        return "other"
    r = net / tot
    return "buff" if r >= 0.35 else "nerf" if r <= -0.35 else "mixed"


def note_lines(contents):
    c = html.unescape(contents)
    c = re.sub(r"\[/?p\]", "\n", c)
    c = re.sub(r"\[/?(b|i|u|h\d|list|\*)\]", "", c)
    c = re.sub(r"\[url=[^\]]*\]|\[/url\]", "", c)
    return [l.strip() for l in c.splitlines() if l.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=180)
    ap.add_argument("--show", help="print the classification of the patch on this date (YYYY-MM-DD) and exit")
    a = ap.parse_args()

    path = ROOT / "data.json"
    S = json.loads(path.read_text(encoding="utf8"))
    names = {h["name"].lower(): s for s, h in S["heroes"].items()}
    names.update(ALIASES)
    req = urllib.request.Request(NEWS, headers={"User-Agent": "dl_web patch notes"})
    items = json.loads(urllib.request.urlopen(req, timeout=60).read())["appnews"]["newsitems"]
    cutoff = time.time() - a.days * 86400

    patches, per_hero = [], {s: [] for s in S["heroes"]}
    for n in sorted(items, key=lambda n: -n["date"]):
        if n["feedname"] != "steam_community_announcements" or (n["date"] < cutoff and not a.show):
            continue
        day = datetime.fromtimestamp(n["date"], timezone.utc).strftime("%Y-%m-%d")
        by = {}
        for line in note_lines(n["contents"]):
            m = re.match(r"^-\s*([^:]{2,30}):\s*(.+)$", line)
            if m and m.group(1).strip().lower() in names:
                by.setdefault(names[m.group(1).strip().lower()], []).append(m.group(2).strip())
        if not by:
            continue
        if a.show and a.show != day:
            continue
        patches.append({"d": day, "title": n["title"].strip(), "url": n["url"]})
        for slug, lines in by.items():
            cls = [classify(t) for t in lines]
            net = sum(d * w for d, w in cls); tot = sum(abs(d) * w for d, w in cls)
            buffs, nerfs = sum(1 for d, _ in cls if d > 0), sum(1 for d, _ in cls if d < 0)
            if a.show:
                print(f"\n{S['heroes'][slug]['name']}: {verdict(net, tot, buffs, nerfs).upper()}  (net {net:+.1f} of {tot:.1f}; {buffs} buffs, {nerfs} nerfs)")
                for t, (d, w) in zip(lines, cls):
                    print(f"  {'+' if d > 0 else '-' if d < 0 else '·'} {w:>4}  {t[:130]}")
                continue
            per_hero[slug].append({"d": day, "v": verdict(net, tot, buffs, nerfs), "b": buffs, "n": nerfs, "net": round(net, 2), "tot": round(tot, 2),
                                   "l": [[d, t[:170]] for t, (d, _) in zip(lines, cls)][:KEEP_LINES], "more": max(0, len(lines) - KEEP_LINES)})
    if a.show:
        return
    for s in S["heroes"]:
        S["heroes"][s]["changes"] = per_hero[s]
    S["patches"] = patches
    bal = [p["d"] for p in patches if any(c["d"] == p["d"] and c["v"] != "other" for h in per_hero.values() for c in h)]
    S["meta"]["patchDates"] = sorted(bal)[-6:]
    path.write_text(json.dumps(S, ensure_ascii=False, indent=1) + "\n", encoding="utf8")
    cnt = {v: sum(1 for h in per_hero.values() for c in h if c["v"] == v) for v in ("buff", "nerf", "mixed", "other")}
    print(f"{len(patches)} patches, hero entries: {cnt}; meta.patchDates = {S['meta']['patchDates']}")


if __name__ == "__main__":
    main()
