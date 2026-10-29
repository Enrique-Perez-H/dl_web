# Zok3r Deadlock Meta

A static, bilingual (Spanish / English) Deadlock site: tier list, hero builds, winrates, item browser, hero comparison with lane odds, and makers that let visitors build a build or a tier list and share it in Discord ("Deadlock Hispano").

There is no build step. Serve the folder with any static host. Locally:

    python3 -m http.server 8000

(`data.json` is loaded with `fetch`, so opening `index.html` straight from disk does not work.)

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The app (one classic script, no dependencies) |
| `data.json` | All content: tiers, heroes, items, news, per-rank-bracket stats, lane data, builds, winrate history |
| `i18n/en.json` | English translations. Spanish strings are the keys: `t("Texto")` in `app.js` |
| `assets/heroes/`, `assets/items/` | Hero portraits and item icons (`assets/items/index.json` maps item slug to file) |
| `scripts/` | `update_stats.py`, `fetch_item_icons.py`, `check_i18n.py` |
| `functions/index.js` | Optional Cloudflare Pages Function for Discord link previews |

## Pages (hash routes)

| Route | What it shows |
| --- | --- |
| `#tier` | Tier list |
| `#builds`, `#h-<hero>` | Hero list and hero sheets (build by phase, best items, winrate history, lane matchups and partners) |
| `#winrates` | Winrate table with change since the previous patch |
| `#objetos`, `#objeto/<item>` | Item browser and item detail |
| `#comparar/<a>/<b>` | Hero comparison: lane win chance, soul lead curve, partners, builds |
| `#crear/<hero>?e=..&m=..&l=..` | Build maker. The build lives in the URL |
| `#mi-tier?sp=..&s=..&a=..&b=..&c=..&f=..` | Tier list maker. Hero slugs per tier live in the URL |
| `#noticias`, `#coaching`, `#aviso` | News, coaching, legal notice and privacy |

The header has a rank switch (all ranks / Oracle+) and a language switch (ES / EN). Both are remembered in the browser and the language can be forced with `?lang=en`.

## Updating the data

    python3 scripts/update_stats.py                 # everything, last 14 days (about 30 min, mostly lane curves)
    python3 scripts/update_stats.py --skip-curves   # faster, keeps the previous lane curves
    python3 scripts/update_stats.py --only builds   # one step: stats | curves | builds | history
    python3 scripts/fetch_item_icons.py             # icons for every item in data.json (needs: pip install pillow to resize)
    python3 scripts/check_i18n.py                   # lists strings without an English translation

Everything comes from the public Deadlock API (`api.deadlock-api.com`):

- **stats** (per rank bracket): winrate, pick rate, games, best-winrate items, same-lane hero matchups, best lane partners.
- **curves**: souls lead of a hero's duo over the enemy duo at 3/6/9/12/15 minutes for every pair of heroes that lane against each other (`lane-soul-curve`, which the API marks as subject to change).
- **builds**: the most bought items per phase for every hero (ranked, purchase-time windows). They overwrite `early`/`mid`/`late` in `data.json`.
- **history**: winrate per hero between the balance patches listed in `meta.patchDates` (edit that list when a new balance patch ships).

Still maintained by hand: the tier list, the game plans, the news, the coaching copy, and the ability order (from deadlocktiers.com).
When a script adds new heroes, items or text, add their English text to `i18n/en.json` (the checker shows what is missing).

## Lane odds, in short

The comparison slider is the probability that hero A's duo is ahead in souls at 15 minutes against hero B's duo, from real 2v2 lane data (mean lead and spread, normal approximation). With little data it falls back to the chance of winning the match when both lane against each other, blended with the log5 estimate from their overall winrates. Best lane partners are the same-lane allies whose pair winrate beats what both winrates predict.

## Sharing in Discord

The build and tier list makers have a share block: a Discord-formatted message, a PNG image (copy or download) and a link that reopens the exact build or list. To show a button that opens the server, set `community.invite` in `data.json`.

Share links look like `/?r=crear/abrams&e=..` (state in the query so a server can read it). The app turns them back into hash routes on load.

### Link previews (optional)

Discord only shows a generic card for a bare link. On Cloudflare Pages, `functions/index.js` adds Open Graph tags for share links so Discord shows the build or tier list title, items and hero portrait. Deploy the repo as a Cloudflare Pages project (no build command, output directory `/`). On other static hosts, such as GitHub Pages, the site works the same but without per-link previews; the image export covers that.

## Deploying

Any static host works. GitHub Pages: Settings, Pages, deploy from the branch root. Cloudflare Pages: connect the repo, no build command, output directory `/`.

## Legal

Fan project, not affiliated with Valve. Game names, hero portraits and item icons belong to Valve. See `#aviso` in the app for the notice and privacy statement, and review it before going public or monetising.
