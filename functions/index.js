// Cloudflare Pages Function for "/": adds Open Graph tags to shared build and tier list links, so Discord
// shows a preview card (title, items, hero portrait) instead of a bare link. Share links look like
//   /?r=crear/abrams&e=Melee%20Charge~..&m=..&l=..&t=Title&a=Author
//   /?r=mi-tier&sp=abrams~..&s=..&t=Title&by=Author
// The static site works without this function; it only adds previews.

const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cut = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
const list = v => (v || "").split("~").filter(Boolean);

const TEXT = {
  es: {build:"Build de {hero}", by:"por {name}", tierlist:"Mi tier list de Deadlock", phases:{e:"Línea", m:"Medio", l:"Final"}, tiersDesc:"Tier list de Deadlock en Deadlock Hispano"},
  en: {build:"{hero} build", by:"by {name}", tierlist:"My Deadlock tier list", phases:{e:"Laning", m:"Mid", l:"Late"}, tiersDesc:"Deadlock tier list"},
};

// Returns {title, description, image} for a share link, or null when the link is not a build or tier list.
export function describe(params, data, origin) {
  const r = params.get("r") || "";
  const L = TEXT[params.get("lang") === "en" ? "en" : "es"];
  const by = name => name ? ` · ${L.by.replace("{name}", name.slice(0, 32))}` : "";
  const tiers = ["S+", "S", "A", "B", "C", "F"], tk = {"S+":"sp", S:"s", A:"a", B:"b", C:"c", F:"f"};
  if (r.startsWith("crear/")) {
    const slug = r.split("/")[1], hero = data.heroes[slug];
    if (!hero) return null;
    const parts = ["e", "m", "l"].map(k => [k, list(params.get(k)).filter(n => data.items[n])]).filter(([, l]) => l.length)
      .map(([k, l]) => `${L.phases[k]}: ${l.join(", ")}`);
    return {
      title: cut((params.get("t") || L.build.replace("{hero}", hero.name)).slice(0, 60) + by(params.get("a")), 90),
      description: cut(parts.join(" · "), 280) || hero.name,
      image: `${origin}/${data.img[slug]}`,
    };
  }
  if (r === "mi-tier") {
    const rows = tiers.map(t => [t, list(params.get(tk[t])).filter(s => data.heroes[s])]).filter(([, l]) => l.length);
    const first = rows.length ? rows[0][1][0] : null;
    return {
      title: cut((params.get("t") || L.tierlist).slice(0, 60) + by(params.get("by")), 90),
      description: cut(rows.map(([t, l]) => `${t}: ${l.map(s => data.heroes[s].name).join(", ")}`).join(" · "), 280) || L.tiersDesc,
      image: first ? `${origin}/${data.img[first]}` : null,
    };
  }
  return null;
}

export function tags(meta, url) {
  const t = [
    ["og:type", "website"], ["og:site_name", "Zok3r Deadlock Meta"], ["og:title", meta.title],
    ["og:description", meta.description], ["og:url", url],
  ];
  if (meta.image) t.push(["og:image", meta.image]);
  return t.map(([p, c]) => `<meta property="${p}" content="${esc(c)}">`).join("")
    + `<meta name="twitter:card" content="summary"><meta name="description" content="${esc(meta.description)}">`;
}

export async function onRequest({ request, env, next }) {
  const res = await next();
  const url = new URL(request.url);
  if (!url.searchParams.has("r") || !(res.headers.get("content-type") || "").includes("text/html")) return res;
  try {
    const data = await (await env.ASSETS.fetch(new URL("/data.json", url))).json();
    const meta = describe(url.searchParams, data, url.origin);
    if (!meta) return res;
    const html = (await res.text()).replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`).replace("</head>", tags(meta, url.href) + "</head>");
    const headers = new Headers(res.headers); headers.delete("content-length");
    return new Response(html, { status: res.status, headers });
  } catch (_) {
    return res;   // never break the page because of a preview
  }
}
