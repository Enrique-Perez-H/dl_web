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
| `#winrates`, `#noticias`, `#coaching` | Winrates, news, coaching |

The header search finds heroes and items.

## Item icons

    python3 scripts/fetch_item_icons.py

Pulls the icons from the community Deadlock assets API (`assets.deadlock-api.com`) into `assets/items/` and writes `index.json`. Items without an icon still render, just without the image. The game art belongs to Valve; this is a fan project.
