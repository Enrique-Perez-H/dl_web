#!/usr/bin/env python3
"""List Spanish strings that have no English translation in i18n/en.json.

    python3 scripts/check_i18n.py

Checks the literals passed to t() in app.js, plus the text fields in data.json that the app translates
(hero plans, roles and weapons, news, patch labels, coaching). Strings built at runtime and passed to t()
through a variable are caught in the browser instead: open the site with ?lang=en and run
`[...window.__i18nMissing]` in the console after visiting the pages.
Exits with status 1 when something is missing.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
en = json.loads((ROOT / "i18n" / "en.json").read_text(encoding="utf8"))
data = json.loads((ROOT / "data.json").read_text(encoding="utf8"))
src = (ROOT / "app.js").read_text(encoding="utf8")

keys = {m.group(2) for m in re.finditer(r'\b(?:t|p|sec)\((["])((?:[^"\\]|\\.)*)\1', src)}
for m in re.finditer(r't\(([^()"]*\?\s*"[^"]+"\s*:\s*"[^"]+")', src):
    keys |= set(re.findall(r'"([^"]+)"', m.group(1)))
keys.discard("Texto")   # appears in a comment

for h in data["heroes"].values():
    keys |= {h["plan"], h["role"], h["weapon"]}
for n in data["news"]:
    keys |= {n["title"], n["body"]}
keys |= {data["meta"]["patchLabel"], data["meta"]["lastPatch"], data["coaching"]["per"]}
keys.discard("—")

missing = sorted(k for k in keys if k and k not in en)
unused = sorted(k for k in en if k not in keys)
for k in missing:
    print("MISSING:", k[:140])
print(f"{len(keys)} strings checked, {len(missing)} missing, {len(unused)} dictionary entries not seen statically")
sys.exit(1 if missing else 0)
