# Zok3r Deadlock Meta

Static site (Spanish): Deadlock tier list, hero builds and news.

- `index.html` – page shell
- `style.css` – styles
- `app.js` – rendering and routing (hash routes: `#h-<hero-slug>`)
- `data.json` – all content: tiers, heroes, items, news, stats
- `assets/heroes/` – hero portraits (`<slug>.webp`)
- `assets/items/` – in-game item icons plus `index.json` (slug → file); empty until you run the script below
- `scripts/fetch_item_icons.py` – downloads the item icons

The app loads `data.json` with `fetch`, so serve the folder instead of opening the file directly:

    python3 -m http.server 8000

Note: the owner edit mode and `publish()` came from the original Claude artifact and only work inside that runtime; outside it the page is read-only.

## Pages

| Hash route | What it shows |
| --- | --- |
| `#tier` | Tier list |
| `#builds`, `#h-<hero>` | Hero list and hero sheets |
| `#objetos`, `#objeto/<item>` | Item browser (search, category, cost tier, sort) and item detail |
| `#comparar/<heroA>/<heroB>` | Side-by-side hero comparison |
| `#crear/<hero>?e=..&m=..&l=..` | Build maker; the build is stored in the URL, so the link is the share link |
| `#mi-tier?sp=..&s=..&a=..&b=..&c=..&f=..` | Tier list maker (blank by default); hero slugs per tier are stored in the URL |
| `#winrates`, `#noticias`, `#coaching` | Winrates, news, coaching |

The header search finds heroes and items.

## Item icons

    python3 scripts/fetch_item_icons.py

Pulls the icons from the community Deadlock assets API (`assets.deadlock-api.com`) into `assets/items/` and writes `index.json`. Items without an icon still render, just without the image. The game art belongs to Valve; this is a fan project.

## Updating the stats

    python3 scripts/update_stats.py                       # last 14 days, all ranks
    python3 scripts/update_stats.py --days 7 --min-badge 100 --match-mode ranked

Refreshes winrates, pick rates, games, best-winrate items, item costs, same-lane matchups and best lane partners in `data.json` from the public Deadlock API (`api.deadlock-api.com`). The tier list itself, builds, plans and news are still edited by hand.

## Sharing builds in Deadlock Hispano

The build maker (`#crear/<hero>`) has a share block: optional title and author, **Copiar mensaje para Discord** (formatted text with a link back to the build), **Copiar imagen** / **Descargar imagen** (a PNG of the build to paste or drop into the chat) and a live preview of the message.
To show a button that opens the server, put its invite link in `data.json` under `community.invite`.
Links reopen the exact build, but Discord shows a generic preview for them; per-build link previews would need a small server.

The tier list maker (`#mi-tier`) works the same way: drag heroes into tiers (or tap a hero and pick a tier), reorder, then copy a Discord message, copy or download a PNG, or copy the link. "Cargar la de zok3r" starts from the official list.

## Lane odds and partners

The comparison page shows a slider with the estimated chance of winning the lane (`laneOdds()` in `app.js`): the log5 estimate from both overall winrates, blended with the real results of matches where the two heroes laned together (`lane.vs` in `data.json`, from the API's counter stats with `same_lane_filter`). It is the chance of winning the *match* in that matchup, used as an approximation for the lane. Best lane partners (`lane.duo`) are the same-lane allies whose pair winrate beats what both winrates predict.
