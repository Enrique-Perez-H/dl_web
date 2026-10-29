# Zok3r Deadlock Meta

Static site (Spanish): Deadlock tier list, hero builds and news.

- `index.html` – page shell
- `style.css` – styles
- `app.js` – rendering and routing (hash routes: `#h-<hero-slug>`)
- `data.json` – all content: tiers, heroes, items, news, stats
- `assets/heroes/` – hero portraits (`<slug>.webp`)

The app loads `data.json` with `fetch`, so serve the folder instead of opening the file directly:

    python3 -m http.server 8000

Note: the owner edit mode and `publish()` came from the original Claude artifact and only work inside that runtime; outside it the page is read-only.
