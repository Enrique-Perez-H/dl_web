(async function(){
"use strict";

/* ═══════════════ Data, language, rank bracket ═══════════════ */
const [S, ICONS] = await Promise.all([
  fetch("data.json").then(r=>r.json()),
  // assets/items/index.json maps item slug -> icon file (written by scripts/fetch_item_icons.py); without it items render without icons
  fetch("assets/items/index.json").then(r=>r.ok?r.json():{}).catch(()=>({})),
]);
const LS = {
  get(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(_){} },
};
const QP = new URLSearchParams(location.search);

// Spanish source strings are the translation keys: t("Texto") returns the English text from i18n/en.json when lang is "en".
let lang = ["es","en"].includes(QP.get("lang")) ? QP.get("lang") : LS.get("dl-lang") || (/^en/i.test(navigator.language||"") ? "en" : "es");
let EN = {};
const loadLang = async () => { if (lang==="en" && !Object.keys(EN).length) EN = await fetch("i18n/en.json").then(r=>r.json()).catch(()=>({})); };
await loadLang();
const t = (k,v) => {
  if (lang==="en" && EN[k]===undefined && k) (window.__i18nMissing ||= new Set()).add(k);   // dev aid: scripts/check_i18n.mjs lists these
  let s = lang==="en" && EN[k]!==undefined ? EN[k] : k;
  return v ? s.replace(/\{(\w+)\}/g,(m,n)=>v[n]!==undefined ? v[n] : m) : s;
};
const LOC = () => lang==="en" ? "en-GB" : "es-ES";

const BRACKETS = {all:"Todos los rangos", high:"Oracle+"};
let bracket = "all";
function useBracket(k){
  if (!S.brackets[k]) k = "all";
  bracket = k; S.stats = S.brackets[k].stats; S.lane = S.brackets[k].lane; LS.set("dl-bracket",k);
}
useBracket(LS.get("dl-bracket")||"all");

// Share links look like /?r=crear/abrams&e=..; turn them into the hash route the app uses (the server can read the query for previews)
if (QP.has("r")){
  const r = QP.get("r"); QP.delete("r"); QP.delete("lang");
  const rest = QP.toString();
  history.replaceState(null,"",location.pathname + "#" + r + (rest ? "?" + rest : ""));
}

/* ═══════════════ Constants and helpers ═══════════════ */
const TIERS = ["S+","S","A","B","C","F"];
const TC = {"S+":"var(--t-splus)","S":"var(--t-s)","A":"var(--t-a)","B":"var(--t-b)","C":"var(--t-c)","F":"var(--t-f)"};
const CAT = {w:"var(--weapon)",v:"var(--vital)",s:"var(--spirit)"};
const catName = c => t({w:"Arma",v:"Vitalidad",s:"Espíritu"}[c]);
const TYPES = {parche:["Parche","var(--t-b)"],heroe:["Héroe nuevo","var(--t-splus)"],discord:["Discord","var(--spirit)"],ranked:["Ranked","var(--t-s)"]};
const ROLES = ["Todos","Luchador","Asesino","Tirador","Místico"];
const PH = [["early","Línea","0–10 min","e"],["mid","Medio","10–20 min","m"],["late","Final","20+ min","l"]];

const $ = (s,el=document)=>el.querySelector(s);
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const tierOf = slug => TIERS.find(x => (S.tiers[x]||[]).includes(slug)) || "—";
const H = slug => S.heroes[slug];
const img = slug => `<img src="${S.img[slug]}" alt="" width="72" height="72">`;
const fmtDate = d => { const [y,m,dd] = d.split("-"); return new Date(Date.UTC(+y,m-1,+dd)).toLocaleDateString(LOC(),{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}); };
const fmtShort = d => { const [y,m,dd] = d.split("-"); return new Date(Date.UTC(+y,m-1,+dd)).toLocaleDateString(LOC(),{day:"numeric",month:"short",timeZone:"UTC"}); };
const islug = n => n.toLowerCase().replace(/[’']/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const ISL = Object.fromEntries(Object.keys(S.items).map(n=>[islug(n),n]));
const ico = (n,cls="") => ICONS[islug(n)] ? `<img class="ic ${cls}" src="assets/items/${ICONS[islug(n)]}" alt="" width="28" height="28" loading="lazy">` : "";
const costTier = c => ({800:1,1600:2,3200:3,6400:4}[c]||0);
const nf = (n,o) => n.toLocaleString(LOC(),o);
const souls = n => n>=1000 ? nf(n/1000,{maximumFractionDigits:1})+"k" : String(n);
const pct = n => n==null ? "—" : nf(n,{minimumFractionDigits:1,maximumFractionDigits:1})+"%";
const kfmt = n => n==null ? "—" : n>=1e6 ? nf(n/1e6,{maximumFractionDigits:2})+"M" : n>=1000 ? nf(Math.round(n/1000))+"k" : String(n);
const dpts = n => (n>=0?"+":"−") + nf(Math.abs(n),{minimumFractionDigits:1,maximumFractionDigits:1});
const SRC = () => `<a href="${esc(S.stats.src)}" target="_blank" rel="noopener">${esc(S.stats.srcName)}</a>`;
const bracketName = () => t(BRACKETS[bracket]);
const scopeTxt = () => `${t("últimos {n} días",{n:S.stats.scope.days})} · ${bracketName()}`;

// item -> [{slug, phase}] for every hero build
const USE = {};
Object.keys(S.heroes).forEach(sl=>PH.forEach(([k])=>S.heroes[sl][k].forEach(n=>{ (USE[n]=USE[n]||[]).push({slug:sl,phase:k}); })));

// UI state that survives re-renders
const U = {wrSort:{k:"wr",dir:-1}, iq:"", icat:"all", itier:0, isort:"cost", bq:"", bcat:"all", tq:"", trole:"Todos", query:"", filterRole:"Todos", bm:null, tl:null, dragging:null};

/* ═══════════════ Lane model ═══════════════ */
const LANE_K = 1000, LANE_SHRINK = 300;
const erf = x => { const s = Math.sign(x); x = Math.abs(x); const u = 1/(1+0.3275911*x); return s*(1-(((((1.061405429*u-1.453152027)*u)+1.421413741)*u-0.284496736)*u+0.254829592)*u*Math.exp(-x*x)); };
const phi = x => 0.5*(1+erf(x/Math.SQRT2));

// souls lead of a's duo over the enemy duo at 3/6/9/12/15 min, averaged over partners and lanes
function curveOf(a,b){
  const c = ((S.lane||{}).curve||{})[a<b ? a+"|"+b : b+"|"+a]; if (!c) return null;
  const sg = a<b ? 1 : -1;
  return {n:c[0], lead:c.slice(1,6).map(v=>sg*v), sd:c[6]};
}
function laneOdds(a,b){
  const wa = (S.stats.hero[a].wr ?? 50)/100, wb = (S.stats.hero[b].wr ?? 50)/100;
  const base = wa*(1-wb)/(wa*(1-wb)+wb*(1-wa));              // log5: chance of a beating b from overall winrates
  const ab = (S.lane.vs[a]||{})[b], ba = (S.lane.vs[b]||{})[a];
  let w = 0, n = 0; if (ab){ w += ab[0]; n += ab[1]; } if (ba){ w += ba[1]-ba[0]; n += ba[1]; }
  const match = (w+LANE_K*base)/(n+LANE_K)*100;               // chance of winning the match when laning against each other
  const c = curveOf(a,b);
  const lane = c && c.n>=150 && c.sd>0 ? 50+(phi(c.lead[4]/c.sd)*100-50)*c.n/(c.n+LANE_SHRINK) : null;   // chance of being ahead in souls at 15 min, pulled toward 50% when there are few lanes
  return {p:lane ?? match, lane, match, base:base*100, games:ab?ab[1]:ba?ba[1]:0, direct:n>0, sig:ab||null, curve:c};
}
function laneVerdict(p,a,b){
  const d = Math.abs(p-50), who = H(p>=50?a:b).name;
  return d<1.5 ? t("Línea igualada") : d<3.5 ? t("Ligera ventaja para {who}",{who}) : d<6 ? t("Ventaja clara para {who}",{who}) : t("Gran ventaja para {who}",{who});
}
function matchupsOf(slug){
  return Object.keys(S.heroes).filter(x=>x!==slug && S.stats.hero[x] && ((S.lane.vs[slug]||{})[x] || (S.lane.vs[x]||{})[slug])).map(x=>({x, p:laneOdds(slug,x).p})).sort((u,v)=>v.p-u.p);
}
const hardLanes = slug => matchupsOf(slug).slice(-3).reverse().map(o=>o.x);

/* ═══════════════ Routing ═══════════════ */
function route(){
  const h = (location.hash||"").slice(1).split("?")[0];
  if (h==="mi-tier") return {v:"tl"};
  if (h==="objetos") return {v:"items"};
  if (h.startsWith("objeto/") && ISL[h.slice(7)]) return {v:"item",name:ISL[h.slice(7)]};
  if (h==="comparar" || h.startsWith("comparar/")){ const [,a,b] = h.split("/"); return {v:"cmp",a:S.heroes[a]?a:"",b:S.heroes[b]?b:""}; }
  if (h==="crear" || h.startsWith("crear/")) return {v:"mk",slug:S.heroes[h.split("/")[1]]?h.split("/")[1]:Object.keys(S.heroes)[0]};
  if (h.startsWith("h-") && S.heroes[h.slice(2)]) return {v:"hero",slug:h.slice(2)};
  if (h==="builds") return {v:"builds"};
  if (h==="noticias") return {v:"news"};
  if (h==="winrates") return {v:"wr"};
  if (h==="coaching") return {v:"coach"};
  if (h==="aviso") return {v:"legal"};
  return {v:"tier"};
}

/* ═══════════════ Header and footer ═══════════════ */
function header(r){
  const cur = r.v==="hero" ? "builds" : r.v==="item" ? "items" : r.v;
  const a = (id,href,txt)=>`<a href="#${href}" ${cur===id?'aria-current="page"':''}>${t(txt)}</a>`;
  const seg = (attr,cur,opts,label) => `<div class="seg" role="group" aria-label="${esc(t(label))}">${opts.map(([k,txt,title])=>`<button data-${attr}="${k}" aria-pressed="${cur===k}" ${title?`title="${esc(t(title))}"`:''}>${esc(t(txt))}</button>`).join("")}</div>`;
  return `<header class="top"><div class="wrap hdr">
    <a class="brand" href="#tier"><b>zok<span>3</span>r</b><small>Deadlock meta</small></a>
    <div class="hctl">
      <div class="gs"><input id="gs" type="search" placeholder="${esc(t("Buscar héroe u objeto…"))}" autocomplete="off" aria-label="${esc(t("Buscar héroe u objeto"))}"><div class="gsr" id="gsr" hidden></div></div>
      ${seg("bracket",bracket,[["all","Todos","Todos los rangos"],["high","Oracle+","Oracle+"]],"Rango de las estadísticas")}
      ${seg("lang",lang,[["es","ES"],["en","EN"]],"Idioma")}
    </div>
    <nav class="tabs" aria-label="${esc(t("Secciones"))}">${a("tier","tier","Tier list")}${a("builds","builds","Builds")}${a("wr","winrates","Winrates")}${a("items","objetos","Objetos")}${a("cmp","comparar","Comparar")}${a("mk","crear","Mi build")}${a("tl","mi-tier","Mi tier list")}${a("news","noticias","Noticias")}<a href="#coaching" class="cta-tab" ${cur==="coach"?'aria-current="page"':''}>${t("Coaching")}</a></nav>
  </div></header>`;
}

function footer(){
  const bs = S.meta.buildsSrc;
  return `<footer><div class="wrap">
    <span>${t("Tier list y notas: zok3r")} · <a href="https://twitch.tv/zok3r" target="_blank" rel="noopener">twitch.tv/zok3r</a></span>
    <span>${t("Winrates, enfrentamientos de línea, compañeros, builds y objetos con mejor winrate")}: ${SRC()} (${scopeTxt()}, ${t("consultado")} ${fmtDate(S.stats.date)}). ${t("Orden de habilidades")}: <a href="https://deadlocktiers.com/" target="_blank" rel="noopener">deadlocktiers.com</a>. ${t("Nombres de objetos y habilidades en inglés, como en el cliente original.")}</span>
    <span>${t("Proyecto de fans, sin relación con Valve.")} <a href="#aviso">${t("Aviso legal y privacidad")}</a></span></div></footer>`;
}

/* ═══════════════ Tier list, builds, winrates ═══════════════ */
function tierView(){
  const rows = TIERS.map(x=>{
    const list = (S.tiers[x]||[]).map(slug=>`<button class="tile" data-hero="${slug}" title="${esc(H(slug).name)}">${img(slug)}<span class="nm">${esc(H(slug).name)}</span></button>`).join("");
    return `<div class="tier" style="--tc:${TC[x]}"><div class="lab"><div>${x}<small>${t("{n} héroes",{n:S.tiers[x].length})}</small></div></div><div class="row">${list||`<span class="tlhint">${t("Sin héroes")}</span>`}</div></div>`;
  }).join("");
  return `<section class="wrap">
    <div class="intro"><div>
      <h1>${t("Tier list de")} <em>Deadlock</em><br>${t("en español")}</h1>
      <p>${t("Mi ranking para ranked tras {patch}. Pulsa un héroe para ver su build: objetos por fase, orden de habilidades y líneas difíciles.",{patch:t(S.meta.patchLabel)})}</p>
    </div>
    <div class="patch"><a class="btn pri" href="#mi-tier" style="text-decoration:none;color:var(--brass-ink);margin-bottom:10px">${t("Crea la tuya")}</a><span class="k">${t("Actualizada")}</span><span class="v">${fmtDate(S.meta.updated)}</span><span class="k" style="margin-top:8px">${t("Último parche")}</span><span class="v">${esc(t(S.meta.lastPatch))}</span></div></div>
    <div class="tiers">${rows}</div>
    <p class="tnote"><b>${t("Nota")}:</b> ${t("la tier list es subjetiva y está hecha por mí en torno a rankeds de alto nivel. Los personajes pueden cambiar de tier en función de tu rango. Para ver datos de todos los rangos, mira los")} <a href="#winrates">winrates</a>.</p>
    <div class="legend"><span><b>${t("{n} héroes",{n:Object.keys(S.heroes).length})}</b> · ${t("roster completo tras City Never Sleeps")}</span><span>${t("Ranking propio de zok3r · Eternus 5 · 2.000 h")}</span></div>
  </section>`;
}

function buildsView(){
  const q = U.query.trim().toLowerCase();
  const list = Object.keys(S.heroes).sort((a,b)=>{
    const ta=TIERS.indexOf(tierOf(a)), tb=TIERS.indexOf(tierOf(b)); return ta-tb || H(a).name.localeCompare(H(b).name);
  }).filter(s => (U.filterRole==="Todos"||H(s).role===U.filterRole) && (!q || H(s).name.toLowerCase().includes(q)));
  return `<section class="wrap">
    <div class="sh"><h2>${t("Builds por héroe")}</h2><p>${t("Objetos más comprados en ranked (últimos {n} días) · ordenados por tier",{n:(S.meta.buildsSrc||{}).days||14})}</p></div>
    <div class="filters"><input id="q" type="search" placeholder="${esc(t("Buscar héroe…"))}" value="${esc(U.query)}" aria-label="${esc(t("Buscar héroe"))}">
      ${ROLES.map(r=>`<button class="chip" data-role="${r}" aria-pressed="${U.filterRole===r}">${t(r)}</button>`).join("")}</div>
    <div class="grid">${list.map(s=>`<a class="card" href="#h-${s}">${img(s)}<div><b>${esc(H(s).name)}</b><span><span class="tb" style="--tc:${TC[tierOf(s)]||'var(--line)'}">${tierOf(s)}</span> ${esc(t(H(s).role))}</span></div></a>`).join("") || `<p style="color:var(--muted)">${t("Ningún héroe coincide.")}</p>`}</div>
  </section>`;
}

// winrate change between the last two patch windows (all ranks)
function histDelta(slug){
  const v = ((S.history||{}).hero||{})[slug]; if (!v) return null;
  const p = v.filter(x=>x!=null); return p.length>=2 ? p[p.length-1]-p[p.length-2] : null;
}
function wrView(){
  const st = S.stats;
  const rows = Object.keys(S.heroes).map(s=>({s, wr:st.hero[s].wr, pick:st.hero[s].pick, games:st.hero[s].games, delta:histDelta(s), tier:TIERS.indexOf(tierOf(s)), name:H(s).name}));
  const k = U.wrSort.k, d = U.wrSort.dir;
  rows.sort((a,b)=> k==="name" ? d*a.name.localeCompare(b.name) : (d*((a[k]??-99)-(b[k]??-99)) || b.wr-a.wr));
  const maxPick = Math.max(...rows.map(r=>r.pick));
  const avg = rows.reduce((n,r)=>n+r.wr,0)/rows.length;
  const th = (key,lab,cls="") => `<th class="${cls}"><button data-sort="${key}" aria-label="${esc(t("Ordenar por {col}",{col:t(lab)}))}">${t(lab)}${U.wrSort.k===key?(U.wrSort.dir<0?" ↓":" ↑"):""}</button></th>`;
  const over = rows.filter(r=>r.wr>=54).length, under = rows.filter(r=>r.wr<46).length;
  const top = [...rows].sort((a,b)=>b.wr-a.wr);
  const lastW = ((S.history||{}).windows||[]).slice(-1)[0];
  return `<section class="wrap">
    <div class="sh"><h2>Winrates</h2><p>${t("Fuente")}: ${SRC()} · ${scopeTxt()} · ${t("consultado")} ${fmtDate(st.date)}</p></div>
    <div class="kpis">
      <div><span class="k">${t("Mejor winrate")}</span><b>${esc(top[0].name)}</b><span class="v">${pct(top[0].wr)}</span></div>
      <div><span class="k">${t("Peor winrate")}</span><b>${esc(top[top.length-1].name)}</b><span class="v">${pct(top[top.length-1].wr)}</span></div>
      <div><span class="k">${t("Por encima del 54%")}</span><b>${t("{n} héroes",{n:over})}</b><span class="v">${t("winrate alto")}</span></div>
      <div><span class="k">${t("Por debajo del 46%")}</span><b>${t("{n} héroes",{n:under})}</b><span class="v">${t("media del roster {n}",{n:pct(avg)})}</span></div>
    </div>
    <div class="tblwrap"><table class="wrt">
      <thead><tr>${th("name","Héroe")}${th("tier","Mi tier","c")}${th("wr","Winrate")}${th("pick","Pick rate")}${th("delta","Δ parche","r")}${th("games","Partidas","r")}</tr></thead>
      <tbody>${rows.map(r=>{ const x=tierOf(r.s); const w=Math.min(Math.abs((r.wr-50)*10),50);
        return `<tr><td><a class="hn" href="#h-${r.s}">${img(r.s)}<span>${esc(r.name)}</span></a></td>
        <td class="c"><span class="tb" style="--tc:${TC[x]}">${x}</span></td>
        <td><div class="cell"><div class="bar wr"><span class="mid"></span><i class="${r.wr>=50?'up':'dn'}" style="${r.wr>=50?`left:50%;width:${w}%`:`left:auto;right:50%;width:${w}%`}"></i></div><em>${pct(r.wr)}</em></div></td>
        <td><div class="cell"><div class="bar"><i class="pk" style="width:${(r.pick/maxPick*100).toFixed(1)}%"></i></div><em>${pct(r.pick)}</em></div></td>
        <td class="r num">${r.delta==null?"—":`<span class="${r.delta>=0?'dup':'ddn'}">${dpts(r.delta)}</span>`}</td>
        <td class="r num">${kfmt(r.games)}</td></tr>`;}).join("")}</tbody></table></div>
    <p class="fine">${t("Winrate: % de partidas ganadas con el héroe. Pick rate: % de partidas en las que aparece. La barra de winrate parte del 50%; cada punto por encima o por debajo alarga la barra. Partidas: partidas del héroe en el periodo analizado.")}${lastW?" "+t("Δ parche: cambio de winrate (todos los rangos) entre el periodo anterior y el que empieza el {date}.",{date:fmtDate(lastW.from)}):""}</p>
    <p class="tnote"><b>${t("Nota")}:</b> ${t("la tier list es subjetiva y está hecha por mí en torno a rankeds de alto nivel. Los personajes pueden cambiar de tier en función de tu rango.")}</p>
  </section>`;
}

/* ═══════════════ Hero page ═══════════════ */
function itemLi(n){
  const it = S.items[n] || {c:"s",cost:0};
  return `<li style="--cat:${CAT[it.c]}"><i title="${esc(catName(it.c))}"></i><span><a class="il" href="#objeto/${islug(n)}">${ico(n)}${esc(n)}</a></span><em>${it.cost?souls(it.cost):""}</em></li>`;
}

function historyBlock(slug){
  const h = S.history, vals = h && h.hero[slug]; if (!vals) return "";
  const pts = vals.map((v,i)=>({v,i})).filter(p=>p.v!=null); if (pts.length<2) return "";
  const W = 640, Ht = 170, L = 40, R = 40, T = 26, B = 34, n = h.windows.length;
  const lo = Math.floor(Math.min(50,...pts.map(p=>p.v))-1), hi = Math.ceil(Math.max(50,...pts.map(p=>p.v))+1);
  const X = i => n>1 ? L+(W-L-R)*i/(n-1) : W/2, Y = v => T+(Ht-T-B)*(1-(v-lo)/(hi-lo));
  const line = pts.map(p=>`${X(p.i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
  const d = pts[pts.length-1].v-pts[pts.length-2].v;
  return `<div class="blk"><h3>${t("Winrate por parche")}</h3>
    <svg class="hist" viewBox="0 0 ${W} ${Ht}" role="img" aria-label="${esc(t("Winrate de {hero} por parche",{hero:H(slug).name}))}: ${pts.map(p=>pct(p.v)).join(", ")}">
      <line x1="${L}" x2="${W-R}" y1="${Y(50)}" y2="${Y(50)}" class="h50"/><text x="${W-R}" y="${Y(50)-5}" text-anchor="end" class="hl">50%</text>
      <polyline points="${line}" class="hline"/>
      ${pts.map(p=>`<circle cx="${X(p.i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="4.5" class="hdot"/><text x="${X(p.i).toFixed(1)}" y="${(Y(p.v)-10).toFixed(1)}" text-anchor="middle" class="hv">${nf(p.v,{minimumFractionDigits:1,maximumFractionDigits:1})}</text>`).join("")}
      ${h.windows.map((w,i)=>`<text x="${X(i).toFixed(1)}" y="${Ht-10}" text-anchor="middle" class="hl">${fmtShort(w.from)}</text>`).join("")}
    </svg>
    <p class="fine">${t("Cada punto es el periodo que empieza en la fecha indicada y llega hasta el siguiente parche (todos los rangos). Último cambio:")} <b class="${d>=0?'dup':'ddn'}">${dpts(d)} ${t("puntos")}</b>.</p></div>`;
}

function heroView(slug){
  const h = H(slug), x = tierOf(slug), st = S.stats.hero[slug];
  const abil = h.abilities.map((a,i)=>{ const p = h.prio.indexOf(a)+1; return `<div class="ab"><span class="slot">${t("Habilidad {n}",{n:i+1})}${i===3?' · '+t("ulti"):''}</span><b>${esc(a)}</b><span class="pr ${p===1?'p1':''}">${p===1?t("Max primero"):t("{n}º",{n:p})}</span></div>`; }).join("");
  const ph = ([k,lab,time])=>`<div class="ph"><h4>${t(lab)}<small>${time}</small></h4><ol class="items">${h[k].map(itemLi).join("")}</ol></div>`;
  const best = st.best, bs = S.meta.buildsSrc;
  return `<section class="wrap">
    <a class="back" href="#builds">← ${t("Todas las builds")}</a>
    <div class="sheet-head">${img(slug)}
      <div><h2>${esc(h.name)}</h2><div class="meta"><span class="tb" style="--tc:${TC[x]}">Tier ${x}</span><span>${esc(t(h.role))}</span>${h.weapon!=="—"?`<span>· ${esc(t(h.weapon))}</span>`:''}</div></div>
      <div class="wr"><div class="n">${pct(st.wr)}</div><div class="l">Winrate · pick ${pct(st.pick)}${st.games?` · ${t("{n} partidas",{n:kfmt(st.games)})}`:''}<br>${SRC()} · ${bracketName()}</div></div>
    </div>
    <div class="plan"><p class="k">${t("Plan de juego")}</p><p>${esc(t(h.plan))}</p></div>
    <div class="acts"><a class="btn pri" href="#crear/${slug}">${t("Crear mi build")}</a><a class="btn" href="#comparar/${slug}">${t("Comparar con otro héroe")}</a></div>
    <div class="blk"><h3>${t("Orden de habilidades")}</h3><div class="abil">${abil}</div></div>
    <div class="blk"><h3>${t("Build por fase")}</h3><div class="phases">${PH.map(ph).join("")}</div>
      <div class="cats">${Object.keys(CAT).map(c=>`<span style="--cat:${CAT[c]}"><i></i>${catName(c)}</span>`).join("")}<span>${t("Coste en almas")}</span>${bs?`<span>${t("Datos: objetos más comprados en ranked, últimos {n} días",{n:bs.days})} (<a href="${esc(bs.src)}" target="_blank" rel="noopener">${esc(bs.srcName)}</a>)</span>`:''}</div></div>
    <div class="blk"><h3>${t("Objetos con mejor winrate")}</h3>
      ${best.length ? `<div class="best">${best.map(([n,w])=>`<div class="bi" style="--cat:${CAT[(S.items[n]||{c:'s'}).c]}"><i></i><a class="il" href="#objeto/${islug(n)}">${ico(n)}${esc(n)}</a><b>${pct(w)}</b></div>`).join("")}</div>
      <p class="fine">${t("De {src} ({scope}), entre objetos comprados en al menos el 5% de las partidas del héroe. Casi todos son de final: quien llega a comprarlos suele ir ganando ya, así que indican qué cerrar, no qué comprar primero.",{src:SRC(),scope:scopeTxt()})}</p>` : `<p class="fine">${t("No hay datos suficientes de objetos para este héroe ahora mismo.")}</p>`}</div>
    ${historyBlock(slug)}
    ${heroLaneBlock(slug)}
    <div class="blk"><h3>${t("Líneas más difíciles")}</h3><div class="lanes">${hardLanes(slug).map(s=>`<a class="lane" href="#comparar/${slug}/${s}">${img(s)}${esc(H(s).name)}</a>`).join("")}</div>
      <p class="fine">${t("Los tres héroes contra los que peor rinde en línea según los datos.")}</p></div>
  </section>`;
}

/* ═══════════════ Coaching, news, legal ═══════════════ */
function coachView(){
  const c = S.coaching, live = !!c.url;
  const cta = live ? `<a class="btn pri big" href="${esc(c.url)}" target="_blank" rel="noopener">${t("Unirme en Whop")} ↗</a>` : `<span class="btn big soon" aria-disabled="true">${t("Próximamente")}</span>`;
  return `<section class="wrap coach">
    <div class="chero"><div>
      <p class="eyebrow">${t("Coaching de Deadlock en español")}</p>
      <h1>${t("Sube de rango con")} <em>zok3r</em></h1>
      <p class="lede">${t("Reviso tus partidas como las juego yo en Eternus: posicionamiento, rotaciones, timings de objetos y qué pelea coger y cuál no.")}</p>
      <div class="ctas">${cta}<a class="btn big ghost" href="https://twitch.tv/zok3r" target="_blank" rel="noopener">${t("Verme en Twitch")} ↗</a></div>
    </div>
    <ul class="creds">
      <li><b>Eternus 5</b><span>${t("segundo rango más alto de Deadlock")}</span></li>
      <li><b>2.000 h</b><span>${t("jugadas en Deadlock")}</span></li>
      <li><b>${t("Ex-pro")}</b><span>${t("CoD (MW3, BO2), Overwatch y Apex Legends")}</span></li>
      <li><b>Top 10 EU</b><span>${t("en Overwatch · Radiant #270 EU en Valorant")}</span></li>
    </ul></div>
    <div class="plan-grid">
      <div class="price-card"><span class="k">${t("Plan único")}</span><div class="price">${esc(c.price)}<small>${esc(t(c.per))}</small></div>
        <ul class="incl">
          <li>${t("Un coaching personal de una partida tuya")}</li>
          <li>${t("Acceso a la biblioteca de coachings anteriores")}</li>
          <li>${t("Rol de alumno en el Discord")}</li>
        </ul>${cta}
        <p class="fine">${t("Más adelante: clases y Q&A en directo, y sesiones 1:1.")}</p></div>
      <div class="steps"><span class="k">${t("Cómo funciona")}</span>
        <ol>
          <li><b>${t("Únete en Whop")}</b><span>${t("Pagas el plan y recibes acceso al Discord.")}</span></li>
          <li><b>${t("Envía una partida")}</b><span>${t("Elige una ranked reciente con el héroe que quieras mejorar.")}</span></li>
          <li><b>${t("Recibe el análisis")}</b><span>${t("Te devuelvo la revisión con los errores clave y qué cambiar en la siguiente partida.")}</span></li>
          <li><b>${t("Repasa la biblioteca")}</b><span>${t("Aprende también de los coachings a otros jugadores de tu rango y tu héroe.")}</span></li>
        </ol></div>
    </div>
  </section>`;
}

function newsView(){
  const items = [...S.news].sort((a,b)=>b.date.localeCompare(a.date));
  return `<section class="wrap">
    <div class="sh"><h2>${t("Noticias")}</h2><p>${t("Parches oficiales y anuncios del Discord de Deadlock, resumidos en español")}</p></div>
    <div class="news">${items.map(n=>{ const [lab,col]=TYPES[n.type]||TYPES.parche;
      return `<article class="nw${n.upcoming?' up':''}" style="--dot:${col}"><div class="d"><span class="tag">${n.upcoming?t('Próximamente'):t(lab)}</span><span>${fmtDate(n.date)}</span></div>
        <h3>${n.hero&&S.img[n.hero]?`<a href="#h-${n.hero}" aria-label="${esc(t("Build de {hero}",{hero:H(n.hero).name}))}">${img(n.hero)}</a>`:''}${esc(t(n.title))}</h3>
        <p>${esc(t(n.body))}</p>${n.src?`<a class="src" href="${esc(n.src)}" target="_blank" rel="noopener">${t("Fuente")}: ${esc(n.srcName||new URL(n.src).hostname)} ↗</a>`:''}</article>`;}).join("")}</div>
  </section>`;
}

function legalView(){
  const sec = (h,body) => `<section class="legalsec"><h3>${t(h)}</h3>${body}</section>`;
  const p = k => `<p>${t(k)}</p>`;
  return `<section class="wrap legal">
    <div class="sh"><h2>${t("Aviso legal y privacidad")}</h2><p>${t("Última revisión")}: ${fmtDate(S.meta.updated)}</p></div>
    ${sec("Proyecto de fans",p("Esta web es un proyecto de fans de Deadlock, hecho por la comunidad. No está afiliada, patrocinada ni respaldada por Valve Corporation. Deadlock y los nombres, personajes, objetos e imágenes del juego son marcas y material protegido de Valve.")+p("Los retratos de los héroes y los iconos de los objetos pertenecen a Valve y se usan para identificar el contenido del juego. Si eres titular de derechos y quieres que se retire algo, escribe a zok3r por Twitch y se eliminará."))}
    ${sec("De dónde salen los datos",`<ul><li>${t("Winrates, pick rates, enfrentamientos de línea, compañeros de línea, builds, objetos con mejor winrate, costes e iconos")}: <a href="https://deadlock-api.com" target="_blank" rel="noopener">Deadlock API</a>.</li><li>${t("Orden de habilidades")}: <a href="https://deadlocktiers.com/" target="_blank" rel="noopener">deadlocktiers.com</a>.</li><li>${t("Tier list, planes de juego y noticias: zok3r y la comunidad.")}</li></ul>`+p("Las estadísticas son aproximaciones calculadas sobre partidas recientes y pueden no reflejar el estado actual del juego ni tu rango. Se ofrecen tal cual, sin garantía de exactitud."))}
    ${sec("Coaching",p("El coaching es un servicio privado de zok3r, ofrecido a través de Whop. No tiene relación con Valve ni con la Deadlock API."))}
    ${sec("Privacidad",p("Esta web no usa cookies, no tiene cuentas y no incluye herramientas de analítica ni publicidad.")+p("Tu navegador guarda en este dispositivo dos preferencias (idioma y rango de las estadísticas). No se envían a ningún sitio.")+p("Las builds y tier lists que creas viven en el enlace que compartes: quien lo abre ve lo que contiene, incluidos el título y el nombre que hayas escrito. No se almacena nada en ningún servidor.")+p("Las fuentes tipográficas se cargan desde Google Fonts, que puede registrar tu dirección IP al servirlas."))}
  </section>`;
}

/* ═══════════════ Items ═══════════════ */
const hchip = s => `<a class="lane" href="#h-${s}">${img(s)}${esc(H(s).name)}</a>`;
const catChips = (attr,cur) => [["all","Todos"],...Object.keys(CAT).map(c=>[c,{w:"Arma",v:"Vitalidad",s:"Espíritu"}[c]])].map(([k,l])=>`<button class="chip" data-${attr}="${k}" aria-pressed="${cur===k}">${t(l)}</button>`).join("");

function itemCard(n){
  const it = S.items[n], u = (USE[n]||[]).length, c = costTier(it.cost);
  return `<a class="icard" style="--cat:${CAT[it.c]}" href="#objeto/${islug(n)}">${ico(n,"lg")}<div><b>${esc(n)}</b><span>${catName(it.c)}${c?` · T${c}`:''}${it.cost?` · ${souls(it.cost)}`:''}</span>${u?`<small>${t(u===1?"{n} build":"{n} builds",{n:u})}</small>`:''}</div></a>`;
}

function itemsView(){
  const q = U.iq.trim().toLowerCase();
  const list = Object.keys(S.items).filter(n=>(U.icat==="all"||S.items[n].c===U.icat) && (!U.itier||costTier(S.items[n].cost)===U.itier) && (!q||n.toLowerCase().includes(q)));
  list.sort(U.isort==="name" ? (a,b)=>a.localeCompare(b) : U.isort==="use" ? (a,b)=>(USE[b]||[]).length-(USE[a]||[]).length||a.localeCompare(b) : (a,b)=>S.items[a].cost-S.items[b].cost||a.localeCompare(b));
  return `<section class="wrap">
    <div class="sh"><h2>${t("Objetos")}</h2><p>${t("{n} objetos · pulsa uno para ver qué héroes lo compran y dónde rinde mejor",{n:Object.keys(S.items).length})}</p></div>
    <div class="filters"><input id="iq" type="search" placeholder="${esc(t("Buscar objeto…"))}" value="${esc(U.iq)}" aria-label="${esc(t("Buscar objeto"))}">
      ${catChips("icat",U.icat)}</div>
    <div class="filters">${[0,1,2,3,4].map(x=>`<button class="chip" data-itier="${x}" aria-pressed="${U.itier===x}">${x?`Tier ${x} · ${souls([0,800,1600,3200,6400][x])}`:t('Todos los tiers')}</button>`).join("")}
      <label class="sortsel">${t("Ordenar")} <select id="isort"><option value="cost" ${U.isort==="cost"?'selected':''}>${t("Coste")}</option><option value="name" ${U.isort==="name"?'selected':''}>${t("Nombre")}</option><option value="use" ${U.isort==="use"?'selected':''}>${t("Más usados")}</option></select></label></div>
    <div class="igrid2">${list.map(itemCard).join("") || `<p style="color:var(--muted)">${t("Ningún objeto coincide.")}</p>`}</div>
  </section>`;
}

function itemView(n){
  const it = S.items[n], c = costTier(it.cost);
  const users = PH.map(([k,lab,time])=>[lab,time,(USE[n]||[]).filter(u=>u.phase===k).map(u=>u.slug)]).filter(x=>x[2].length);
  const bestIn = Object.keys(S.stats.hero).map(sl=>{ const b = S.stats.hero[sl].best.find(x=>x[0]===n); return b && {sl, wr:b[1]}; }).filter(Boolean).sort((a,b)=>b.wr-a.wr);
  return `<section class="wrap">
    <a class="back" href="#objetos">← ${t("Todos los objetos")}</a>
    <div class="sheet-head ihead" style="--cat:${CAT[it.c]}">${ico(n,"xl")}
      <div><h2>${esc(n)}</h2><div class="meta"><span class="tb" style="--tc:${CAT[it.c]}">${catName(it.c)}</span>${c?`<span>Tier ${c}</span>`:''}${it.cost?`<span>· ${t("{n} almas",{n:nf(it.cost)})}</span>`:''}</div></div></div>
    <div class="blk"><h3>${t("Lo compran en su build")}</h3>${users.length ? users.map(([lab,time,l])=>`<div class="ufor"><h4>${t(lab)}<small>${time}</small></h4><div class="lanes">${l.sort((a,b)=>H(a).name.localeCompare(H(b).name)).map(hchip).join("")}</div></div>`).join("") : `<p class="fine">${t("Ningún héroe lo lleva en su build más comprada ahora mismo.")}</p>`}</div>
    <div class="blk"><h3>${t("Héroes donde mejor rinde")}</h3>${bestIn.length ? `<div class="best">${bestIn.map(b=>`<a class="bi" href="#h-${b.sl}">${img(b.sl)}<span>${esc(H(b.sl).name)}</span><b>${pct(b.wr)}</b></a>`).join("")}</div><p class="fine">${t("Winrate del héroe con este objeto, según {src}.",{src:SRC()})}</p>` : `<p class="fine">${t("No aparece entre los objetos con mejor winrate de ningún héroe.")}</p>`}</div>
    <div class="acts"><a class="btn pri" href="#crear">${t("Crear una build")}</a></div>
  </section>`;
}

/* ═══════════════ Hero comparison and lane odds ═══════════════ */
const duoList = slug => {
  const l = (S.lane.duo||{})[slug] || [];
  if (!l.length) return `<p class="fine">${t("Sin datos suficientes.")}</p>`;
  return `<div class="duos">${l.map(([o,w,n,lift])=>`<a class="duo" href="#h-${o}">${img(o)}<span><b>${esc(H(o).name)}</b><small>${pct(w/n*100)} · ${t("{n} partidas",{n:kfmt(n)})}</small></span><em class="${lift>=0?'up':'dn'}">${dpts(lift)}</em></a>`).join("")}</div>`;
};
const sigBar = (lab,share,a,b) => {
  const x = share*100;
  return `<div class="sig"><span>${t(lab)}</span><div class="sbar" role="img" aria-label="${esc(t(lab))}: ${esc(H(a).name)} ${x.toFixed(0)}%, ${esc(H(b).name)} ${(100-x).toFixed(0)}%"><i style="width:${x}%"></i></div><em>${x.toFixed(0)} / ${(100-x).toFixed(0)}</em></div>`;
};
// souls lead of a's duo over the enemy duo, 3 to 15 minutes
function leadChart(c,a){
  const W = 320, Ht = 110, L = 12, R = 40, T = 14, B = 24, ts = [3,6,9,12,15];
  const m = Math.max(150,...c.lead.map(Math.abs)), X = i => L+(W-L-R)*i/4, Y = v => T+(Ht-T-B)/2*(1-v/m);
  const last = c.lead[4];
  return `<svg class="hist lead" viewBox="0 0 ${W} ${Ht}" role="img" aria-label="${esc(t("Ventaja de almas de {hero}",{hero:H(a).name}))}: ${c.lead.map(v=>Math.round(v)).join(", ")}">
    <line x1="${L}" x2="${W-R}" y1="${Y(0)}" y2="${Y(0)}" class="h50"/>
    <polyline points="${c.lead.map((v,i)=>`${X(i)},${Y(v).toFixed(1)}`).join(" ")}" class="hline"/>
    ${c.lead.map((v,i)=>`<circle cx="${X(i)}" cy="${Y(v).toFixed(1)}" r="3.5" class="hdot"/>`).join("")}
    <text x="${W-R+6}" y="${(Y(last)+4).toFixed(1)}" class="hv">${last>=0?"+":"−"}${nf(Math.abs(Math.round(last)))}</text>
    ${ts.map((x,i)=>`<text x="${X(i)}" y="${Ht-6}" text-anchor="middle" class="hl">${x}'</text>`).join("")}
  </svg>`;
}
function laneBlock(a,b){
  const o = laneOdds(a,b), p = o.p, knob = Math.min(Math.max(50+(p-50)*5,3),97), A = H(a).name, Bn = H(b).name;
  const hasLane = o.lane!=null;
  const nums = hasLane ? `<div class="lchips"><span>${t("Ir por delante en almas a los 15 min")}: <b>${pct(o.lane)}</b></span><span>${t("Ganar la partida si coinciden en línea")}: <b>${pct(o.match)}</b></span></div>` : "";
  const sig = o.sig ? `<div class="sigs"><h4>${t("Cuando coinciden en línea")}</h4>${sigBar("Kills",o.sig[2],a,b)}${sigBar("Farm (last hits)",o.sig[3],a,b)}${sigBar("Almas",o.sig[4],a,b)}<p class="fine">${t("Reparto entre los dos al final de la partida, {a} / {b}. Son datos de la partida entera, no solo de la fase de línea.",{a:A,b:Bn})}</p></div>` : "";
  const lead = hasLane ? `<div class="leadbox"><h4>${t("Ventaja de almas de {hero} sobre el dúo rival",{hero:A})}</h4>${leadChart(o.curve,a)}<p class="fine">${t("Media a los 3, 6, 9, 12 y 15 minutos sobre {n} líneas 2 contra 2.",{n:nf(o.curve.n)})}</p></div>` : "";
  return `<div class="blk lanebox"><h3>${t("Probabilidad de ganar la línea")}</h3>
    <div class="lanetop"><span class="lw a">${img(a)}<b>${esc(A)}</b></span><span class="lw b"><b>${esc(Bn)}</b>${img(b)}</span></div>
    <div class="lslider" role="img" aria-label="${esc(A)} ${p.toFixed(1)}% ${t("frente a")} ${esc(Bn)} ${(100-p).toFixed(1)}%">
      <i class="la" style="width:${knob}%"></i><i class="lb" style="width:${100-knob}%"></i>
      <span class="lmid"></span><span class="lknob" style="left:${knob}%"></span></div>
    <div class="lscale"><span>40%</span><span>50%</span><span>60%</span></div>
    <div class="lnums"><b class="a">${pct(p)}</b><span>${laneVerdict(p,a,b)}</span><b class="b">${pct(100-p)}</b></div>
    ${nums}
    <p class="fine">${hasLane ? t("Probabilidad de que el dúo de {a} vaya por delante en almas a los 15 minutos, calculada con {n} líneas 2 contra 2 reales. El marcador usa una escala ampliada de 40% a 60% para {a}.",{a:A,n:nf(o.curve.n)}) : o.direct ? t("Sin datos de línea suficientes entre ellos: se usa la probabilidad de ganar la partida cuando coinciden en línea ({n} partidas), combinada con el winrate general de cada uno. El marcador usa una escala ampliada de 40% a 60% para {a}.",{a:A,n:kfmt(o.games)}) : t("Sin partidas suficientes entre ellos en la misma línea: estimado solo con sus winrates generales. El marcador usa una escala ampliada de 40% a 60% para {a}.",{a:A})}</p>
    ${lead}${sig}
    <details class="method"><summary>${t("Cómo se calcula")}</summary><p class="fine">${t("Con datos de línea reales: se toma la ventaja media de almas del dúo de {a} sobre el dúo rival a los 15 minutos y su dispersión, y se calcula la probabilidad de que esa ventaja sea positiva (distribución normal); con pocas líneas el resultado se acerca al 50%. Se mide por dúos, 2 contra 2, así que incluye el efecto del compañero de línea: es la media sobre todos los compañeros posibles. Si faltan datos, se parte del winrate de cada héroe (fórmula log5: {base} para {a}) y se mezcla con el resultado de las partidas en que coincidieron en línea. No tiene en cuenta objetos, rango concreto ni la habilidad de los jugadores. Datos de {src} ({scope}).",{a:A,base:pct(o.base),src:SRC(),scope:scopeTxt()})}</p></details>
  </div>`;
}
const partnersBlock = (a,b) => `<div class="blk"><h3>${t("Mejores compañeros de línea")}</h3><div class="duocols">
    <div><h4>${esc(H(a).name)}</h4>${duoList(a)}</div><div><h4>${esc(H(b).name)}</h4>${duoList(b)}</div></div>
    <p class="fine">${t("Aliados que, jugando en la misma línea, ganan más de lo que predicen los winrates de ambos por separado. El número verde es esa diferencia en puntos de winrate.")}</p></div>`;
function heroLaneBlock(slug){
  const odds = matchupsOf(slug); if (!odds.length) return "";
  const chip = o => `<a class="lane" href="#comparar/${slug}/${o.x}">${img(o.x)}${esc(H(o.x).name)} <small>${pct(o.p)}</small></a>`;
  return `<div class="blk"><h3>${t("Línea según los datos")}</h3>
    <div class="duocols"><div><h4>${t("Mejores enfrentamientos")}</h4><div class="lanes">${odds.slice(0,5).map(chip).join("")}</div></div><div><h4>${t("Peores enfrentamientos")}</h4><div class="lanes">${odds.slice(-5).reverse().map(chip).join("")}</div></div></div>
    <p class="fine">${t("Probabilidad de ganar la línea con {hero} contra cada héroe. Pulsa uno para compararlos.",{hero:H(slug).name})}</p>
    <h4 style="margin-top:20px">${t("Mejores compañeros de línea")}</h4>${duoList(slug)}</div>`;
}

function cmpView(a,b){
  const opts = sel => `<option value="">${t("Elige un héroe…")}</option>` + Object.keys(S.heroes).sort((x,y)=>H(x).name.localeCompare(H(y).name)).map(k=>`<option value="${k}" ${k===sel?'selected':''}>${esc(H(k).name)}</option>`).join("");
  const pick = `<div class="cmpbar"><label>${t("Héroe A")}<select id="ca">${opts(a)}</select></label><span class="vs">VS</span><label>${t("Héroe B")}<select id="cb">${opts(b)}</select></label></div>`;
  if (!a || !b) return `<section class="wrap"><div class="sh"><h2>${t("Comparar héroes")}</h2><p>${t("Elige dos héroes para ver sus datos y builds lado a lado")}</p></div>${pick}</section>`;
  const st = x => S.stats.hero[x], all = x => [].concat(...PH.map(([k])=>H(x)[k]));
  const ia = new Set(all(a)), ib = new Set(all(b));
  const common = [...ia].filter(n=>ib.has(n)), onlyA = [...ia].filter(n=>!ib.has(n)), onlyB = [...ib].filter(n=>!ia.has(n));
  const w = (va,vb,hi=true) => va==null||vb==null||va===vb ? ["",""] : (hi ? va>vb : va<vb) ? ["win",""] : ["","win"];
  const row = (lab,ca,cb,cls=["",""]) => `<tr><th scope="row">${t(lab)}</th><td class="${cls[0]}">${ca}</td><td class="${cls[1]}">${cb}</td></tr>`;
  const il = l => l.length ? `<ul class="mini">${l.map(n=>`<li style="--cat:${CAT[S.items[n].c]}"><a class="il" href="#objeto/${islug(n)}">${ico(n)}${esc(n)}</a></li>`).join("")}</ul>` : '<span class="fine">—</span>';
  const ab = x => `<ol class="mini abl">${H(x).prio.map(p=>`<li>${esc(p)}</li>`).join("")}</ol>`;
  const ta = TIERS.indexOf(tierOf(a)), tb = TIERS.indexOf(tierOf(b));
  const notes = [];
  const wa = laneOdds(a,b).p;
  if (wa<44) notes.push(t("{b} es una de las líneas más difíciles de {a}.",{a:H(a).name,b:H(b).name}));
  if (wa>56) notes.push(t("{a} es una de las líneas más difíciles de {b}.",{a:H(a).name,b:H(b).name}));
  return `<section class="wrap">
    <div class="sh"><h2>${t("Comparar héroes")}</h2><p>${esc(H(a).name)} vs ${esc(H(b).name)}</p></div>${pick}
    ${notes.length?`<p class="tnote">${notes.join(" ")}</p>`:''}
    ${laneBlock(a,b)}${partnersBlock(a,b)}
    <div class="tblwrap"><table class="cmp"><thead><tr><th></th><th><a class="hn" href="#h-${a}">${img(a)}<span>${esc(H(a).name)}</span></a></th><th><a class="hn" href="#h-${b}">${img(b)}<span>${esc(H(b).name)}</span></a></th></tr></thead><tbody>
      ${row("Mi tier",`<span class="tb" style="--tc:${TC[tierOf(a)]}">${tierOf(a)}</span>`,`<span class="tb" style="--tc:${TC[tierOf(b)]}">${tierOf(b)}</span>`,w(ta,tb,false))}
      ${row("Rol",esc(t(H(a).role)),esc(t(H(b).role)))}
      ${row("Arma",esc(t(H(a).weapon)),esc(t(H(b).weapon)))}
      ${row("Winrate",pct(st(a).wr),pct(st(b).wr),w(st(a).wr,st(b).wr))}
      ${row("Pick rate",pct(st(a).pick),pct(st(b).pick))}
      ${row("Partidas",kfmt(st(a).games),kfmt(st(b).games))}
      ${row("Orden de habilidades",ab(a),ab(b))}
      ${row("Líneas difíciles",`<div class="lanes">${hardLanes(a).map(hchip).join("")}</div>`,`<div class="lanes">${hardLanes(b).map(hchip).join("")}</div>`)}
      ${row("Solo en su build",il(onlyA),il(onlyB))}
    </tbody></table></div>
    <div class="blk"><h3>${t("Objetos que comparten ({n})",{n:common.length})}</h3>${il(common)}</div>
    <div class="acts"><a class="btn" href="#comparar/${b}/${a}">${t("Intercambiar")}</a></div>
  </section>`;
}

/* ═══════════════ Sharing helpers ═══════════════ */
// hash route -> link with the state in the query, so a server can read it for link previews: /?r=crear/abrams&e=..
function shareUrl(hash){
  if (location.origin==="null") return "";
  const [path,qs] = hash.replace(/^#/,"").split("?");
  return `${location.origin}${location.pathname}?r=${path}${qs?"&"+qs:""}${lang==="en"?"&lang=en":""}`;
}
function copyText(text, msgSel, boxSel, okMsg){
  const msg = $(msgSel), box = boxSel && $(boxSel);
  const done = ok => { if (msg) msg.textContent = ok ? t(okMsg) : t("No se pudo copiar solo: selecciona la vista previa y cópiala."); if (!ok && box){ box.focus(); box.select(); } };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(()=>done(true),()=>done(false)); else done(false);
}
function shareImage(make, copy, filename, msgSel, wrapSel){
  const msg = $(msgSel), wrap = $(wrapSel);
  if (msg) msg.textContent = t("Generando imagen…");
  make().then(cv=>{
    if (wrap){ cv.className = "bmcanvas"; wrap.replaceChildren(cv); }
    cv.toBlob(async blob=>{
      if (copy){
        try { await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]); if (msg) msg.textContent = t("Imagen copiada. Pégala en Discord con Ctrl+V ✓"); return; } catch(_){}
        if (msg) msg.textContent = t("Tu navegador no deja copiar la imagen. Descárgala o haz clic derecho sobre la vista previa y cópiala.");
      } else {
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
        if (msg) msg.textContent = t("Imagen descargada. Arrástrala al chat de Discord ✓. Si no se descarga, haz clic derecho sobre la vista previa y guárdala.");
      }
    },"image/png");
  }).catch(()=>{ if (msg) msg.textContent = t("No se pudo generar la imagen."); });
}
const loadImg = src => new Promise(res=>{ const i = new Image(); i.onload = ()=>res(i); i.onerror = ()=>res(null); i.src = src; });
const cssVar = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const ensureFonts = () => Promise.all([document.fonts.load('800 44px "Big Shoulders Display"'), document.fonts.load('500 20px "Instrument Sans"'), document.fonts.load('700 12px "Big Shoulders Display"')]).catch(()=>{});
const shareBlock = (p,tl) => `<div class="blk share"><h3>${t("Compartir en {name}",{name:S.community.name})}</h3>
      <div class="r2"><label>${t(tl?"Título (opcional)":"Título de la build (opcional)")}<input id="${p}-title" maxlength="60" placeholder="${esc(t(tl?"p. ej. Mi tier list para ranked":"p. ej. Abrams tanque de melee"))}" value="${esc(tl?U.tl.t:U.bm.t)}"></label><label>${t("Tu nombre (opcional)")}<input id="${p}-author" maxlength="32" placeholder="${esc(t("Tu nick en el Discord"))}" value="${esc(tl?U.tl.by:U.bm.a)}"></label></div>
      <div class="sharebtns"><button class="btn pri" id="${p}-discord">${t("Copiar mensaje para Discord")}</button><button class="btn" id="${p}-img-copy">${t("Copiar imagen")}</button><button class="btn" id="${p}-img-dl">${t("Descargar imagen")}</button>${S.community.invite?`<a class="btn" href="${esc(S.community.invite)}" target="_blank" rel="noopener">${t("Abrir {name}",{name:S.community.name})} ↗</a>`:''}</div>
      <p class="fine" id="${p}-smsg" role="status">${t(tl?"Pega el mensaje en el canal y, si quieres, añade la imagen: Discord la muestra dentro del chat.":"Pega el mensaje en el canal de builds y, si quieres, añade la imagen: Discord la muestra dentro del chat.")}</p>
      <label class="k" for="${p}-text">${t("Vista previa del mensaje")}</label><textarea id="${p}-text" rows="8" readonly>${esc(tl?tlText():bmText())}</textarea>
      <div id="${p}-canvas-wrap"></div></div>`;

/* ═══════════════ Build maker (state lives in the URL) ═══════════════ */
const BMK = {e:"early",m:"mid",l:"late"};
const bmDefault = slug => ({slug, t:"", a:"", e:[...H(slug).early], m:[...H(slug).mid], l:[...H(slug).late], ph:"e"});
function bmParse(slug){
  const raw = location.hash.slice(1), qi = raw.indexOf("?");
  if (qi<0) return bmDefault(slug);
  const p = new URLSearchParams(raw.slice(qi+1)), b = {slug, t:(p.get("t")||"").slice(0,60), a:(p.get("a")||"").slice(0,32), e:[], m:[], l:[], ph:"e"};
  Object.keys(BMK).forEach(k=>{ b[k] = (p.get(k)||"").split("~").filter(n=>S.items[n]); });
  return b;
}
function bmHash(){
  const f = k => U.bm[k].map(encodeURIComponent).join("~");
  const x = (k,v) => v ? `&${k}=${encodeURIComponent(v)}` : "";
  return `#crear/${U.bm.slug}?e=${f("e")}&m=${f("m")}&l=${f("l")}${x("t",U.bm.t)}${x("a",U.bm.a)}`;
}
const bmSync = () => history.replaceState(null,"",bmHash());
const bmHas = n => U.bm.e.includes(n)||U.bm.m.includes(n)||U.bm.l.includes(n);
const bmTotal = () => [...U.bm.e,...U.bm.m,...U.bm.l].reduce((n,i)=>n+(S.items[i].cost||0),0);
function bmText(){
  const bm = U.bm, h = H(bm.slug), url = shareUrl(bmHash());
  const line = ([k,lab,time,key]) => bm[key].length ? `> **${t(lab)}** (${time}): ${bm[key].join(" · ")}` : null;
  return [`**${bm.t || t("Build de {hero}",{hero:h.name})}** · ${h.name} (${tierOf(bm.slug)})${bm.a?` · ${t("por {name}",{name:bm.a})}`:""}`, ...PH.map(line).filter(Boolean), `> ${t("Total: {n} almas",{n:nf(bmTotal())})}`, url && `[${t("Ver y editar esta build")}](<${url}>)`].filter(Boolean).join("\n");
}
async function bmImage(){
  const bm = U.bm, W = 1200, PAD = 40, GAP = 24, COL = (W-2*PAD-2*GAP)/3, ROW = 46;
  const rows = Math.max(1, ...PH.map(p=>bm[p[3]].length)), Hh = 150 + 44 + rows*ROW + 70;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = Hh;
  const c = cv.getContext("2d"), rr = (x,y,w,h,r) => { c.beginPath(); c.roundRect(x,y,w,h,r); };
  await ensureFonts();
  c.fillStyle = cssVar("--ink"); c.fillRect(0,0,W,Hh);
  const portrait = await loadImg(S.img[bm.slug]);
  if (portrait){ c.save(); rr(PAD,PAD,96,96,14); c.clip(); c.drawImage(portrait,PAD,PAD,96,96); c.restore(); }
  c.fillStyle = cssVar("--fg"); c.font = '800 54px "Big Shoulders Display", Arial Narrow, sans-serif';
  c.fillText((bm.t || t("Build de {hero}",{hero:H(bm.slug).name})).toUpperCase(), PAD+120, PAD+52, W-2*PAD-120);
  c.fillStyle = cssVar("--muted"); c.font = '500 22px "Instrument Sans", sans-serif';
  c.fillText(`${H(bm.slug).name} · Tier ${tierOf(bm.slug)} · ${t(H(bm.slug).role)}${bm.a?` · ${t("por {name}",{name:bm.a})}`:""}`, PAD+120, PAD+90, W-2*PAD-120);
  const icons = {};
  await Promise.all([...new Set([...bm.e,...bm.m,...bm.l])].map(async n=>{ if (ICONS[islug(n)]) icons[n] = await loadImg("assets/items/"+ICONS[islug(n)]); }));
  const top = 150;
  PH.forEach(([k,lab,time,key],ci)=>{
    const x = PAD + ci*(COL+GAP);
    c.fillStyle = cssVar("--panel"); rr(x,top,COL,44+rows*ROW+10,12); c.fill();
    c.fillStyle = cssVar("--fg"); c.font = '800 26px "Big Shoulders Display", Arial Narrow, sans-serif'; c.fillText(t(lab).toUpperCase(), x+16, top+32);
    c.fillStyle = cssVar("--muted"); c.font = '500 14px "Instrument Sans", sans-serif'; c.textAlign = "right"; c.fillText(time, x+COL-16, top+31); c.textAlign = "left";
    bm[key].forEach((n,i)=>{
      const y = top + 44 + i*ROW, cat = cssVar(CAT[S.items[n].c].slice(4,-1));
      c.fillStyle = cssVar("--panel2"); rr(x+8,y,COL-16,ROW-6,8); c.fill();
      c.fillStyle = cat; c.fillRect(x+8,y+4,4,ROW-14);
      if (icons[n]) c.drawImage(icons[n], x+20, y+2, ROW-10, ROW-10);
      c.fillStyle = cssVar("--fg"); c.font = '500 17px "Instrument Sans", sans-serif';
      c.fillText(n, x+20+(icons[n]?ROW-2:6), y+ROW/2+2, COL-90);
      c.fillStyle = cssVar("--muted"); c.font = '500 13px "JetBrains Mono", monospace'; c.textAlign = "right"; c.fillText(S.items[n].cost?souls(S.items[n].cost):"", x+COL-16, y+ROW/2+2); c.textAlign = "left";
    });
  });
  c.fillStyle = cssVar("--brass"); c.font = '800 24px "Big Shoulders Display", Arial Narrow, sans-serif';
  c.fillText(t("TOTAL {n} ALMAS",{n:nf(bmTotal())}), PAD, Hh-30);
  c.fillStyle = cssVar("--muted"); c.font = '500 16px "Instrument Sans", sans-serif'; c.textAlign = "right";
  c.fillText(`${S.community.name} · Zok3r Deadlock Meta`, W-PAD, Hh-30); c.textAlign = "left";
  return cv;
}

function mkView(slug){
  if (!U.bm || U.bm.slug!==slug) U.bm = bmParse(slug);
  const bm = U.bm, sum = l => l.reduce((n,i)=>n+(S.items[i].cost||0),0);
  const cols = PH.map(([k,lab,time,key])=>`<div class="ph mk"><button class="phbtn" data-bmph="${key}" aria-pressed="${bm.ph===key}">${t(lab)}<small>${time} · ${souls(sum(bm[key]))}</small></button>
    <div class="chips">${bm[key].map((n,i)=>`<button class="chipi" style="--cat:${CAT[S.items[n].c]}" data-bmrm="${key}:${i}" title="${esc(t("Quitar {item}",{item:n}))}">${ico(n)}<span>${esc(n)}</span><em>×</em></button>`).join("") || `<span class="fine">${t("Pulsa un objeto de abajo para añadirlo aquí.")}</span>`}</div></div>`).join("");
  const q = U.bq.trim().toLowerCase();
  const list = Object.keys(S.items).filter(n=>(U.bcat==="all"||S.items[n].c===U.bcat)&&(!q||n.toLowerCase().includes(q))).sort((a,b)=>S.items[a].cost-S.items[b].cost||a.localeCompare(b));
  const hopts = Object.keys(S.heroes).sort((a,b)=>H(a).name.localeCompare(H(b).name)).map(k=>`<option value="${k}" ${k===slug?'selected':''}>${esc(H(k).name)}</option>`).join("");
  return `<section class="wrap">
    <div class="sh"><h2>${t("Crea tu build")}</h2><p>${t("Elige objetos por fase y comparte el enlace: la build va dentro de la URL")}</p></div>
    <div class="mkbar">${img(slug)}<label>${t("Héroe")}<select id="mk-h">${hopts}</select></label>
      <div class="mkbtns"><button class="btn" data-bmload="pop">${t("Cargar la más comprada")}</button><button class="btn" data-bmload="clear">${t("Vaciar")}</button><button class="btn pri" id="bm-copy">${t("Copiar enlace")}</button></div>
      <span class="fine" id="bm-msg" role="status">${t("Total: {n} almas",{n:nf(bmTotal())})}</span></div>
    <div class="phases">${cols}</div>
    ${shareBlock("bm",false)}
    <div class="blk"><h3>${t("Añadir a {fase}",{fase:t(PH.find(p=>p[3]===bm.ph)[1]).toLowerCase()})}</h3>
      <div class="filters"><input id="bq" type="search" placeholder="${esc(t("Buscar objeto…"))}" value="${esc(U.bq)}" aria-label="${esc(t("Buscar objeto"))}">${catChips("bcat",U.bcat)}</div>
      <div class="pgrid">${list.map(n=>`<button class="pick" style="--cat:${CAT[S.items[n].c]}" data-bmadd="${esc(n)}" ${bmHas(n)?'disabled':''} title="${esc(n)}">${ico(n)}<span>${esc(n)}</span><em>${S.items[n].cost?souls(S.items[n].cost):''}</em></button>`).join("") || `<p class="fine">${t("Ningún objeto coincide.")}</p>`}</div></div>
  </section>`;
}

/* ═══════════════ Tier list maker ═══════════════ */
const TLK = {"S+":"sp",S:"s",A:"a",B:"b",C:"c",F:"f"};
const tlBlank = () => ({t:"", by:"", tiers:Object.fromEntries(TIERS.map(x=>[x,[]])), sel:null});
function tlParse(){
  const raw = location.hash.slice(1), qi = raw.indexOf("?"), b = tlBlank();
  if (qi<0) return b;
  const p = new URLSearchParams(raw.slice(qi+1)), seen = new Set();
  b.t = (p.get("t")||"").slice(0,60); b.by = (p.get("by")||"").slice(0,32);
  TIERS.forEach(x=>{ b.tiers[x] = (p.get(TLK[x])||"").split("~").filter(s=>S.heroes[s] && !seen.has(s) && seen.add(s)); });
  return b;
}
function tlHash(){
  const x = (k,v) => v ? `&${k}=${encodeURIComponent(v)}` : "";
  return `#mi-tier?${TIERS.map(k=>`${TLK[k]}=${U.tl.tiers[k].join("~")}`).join("&")}${x("t",U.tl.t)}${x("by",U.tl.by)}`;
}
const tlSync = () => history.replaceState(null,"",tlHash());
const tlWhere = s => TIERS.find(x=>U.tl.tiers[x].includes(s)) || null;
function tlPlace(slug, tier, before){
  TIERS.forEach(x=>{ U.tl.tiers[x] = U.tl.tiers[x].filter(s=>s!==slug); });
  if (!tier) return;
  const arr = U.tl.tiers[tier], i = before ? arr.indexOf(before) : -1;
  if (i>=0) arr.splice(i,0,slug); else arr.push(slug);
}
function tlText(){
  const tl = U.tl, url = shareUrl(tlHash());
  const lines = TIERS.filter(x=>tl.tiers[x].length).map(x=>`**${x}** · ${tl.tiers[x].map(s=>H(s).name).join(", ")}`);
  const left = Object.keys(S.heroes).length - TIERS.reduce((n,x)=>n+tl.tiers[x].length,0);
  return [`**${tl.t || t("Mi tier list de Deadlock")}**${tl.by?` · ${t("por {name}",{name:tl.by})}`:""}`, ...lines, left ? `> ${t("Sin clasificar: {n}",{n:left})}` : null, url && `[${t("Ver y editar esta tier list")}](<${url}>)`].filter(Boolean).join("\n");
}
async function tlImage(){
  const tl = U.tl, W = 1200, PAD = 40, LAB = 90, CELL = 84, TILE = 72, HEAD = 125;
  const per = Math.floor((W-2*PAD-LAB-16)/CELL);
  const rows = TIERS.map(x=>({x, list:tl.tiers[x], lines:Math.max(1,Math.ceil(tl.tiers[x].length/per))}));
  const Hh = HEAD + PAD + rows.reduce((n,r)=>n+r.lines*(TILE+24)+14,0) + 20;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = Hh;
  const c = cv.getContext("2d");
  await ensureFonts();
  const imgs = {}; await Promise.all(TIERS.flatMap(x=>tl.tiers[x]).map(async s=>{ imgs[s] = await loadImg(S.img[s]); }));
  c.fillStyle = cssVar("--ink"); c.fillRect(0,0,W,Hh);
  c.fillStyle = cssVar("--fg"); c.font = '800 54px "Big Shoulders Display", Arial Narrow, sans-serif';
  c.fillText((tl.t || t("Mi tier list de Deadlock")).toUpperCase(), PAD, PAD+50, W-2*PAD);
  c.fillStyle = cssVar("--muted"); c.font = '500 20px "Instrument Sans", sans-serif';
  c.fillText(`${S.community.name} · Zok3r Deadlock Meta${tl.by?` · ${t("por {name}",{name:tl.by})}`:""}`, PAD, PAD+82);
  let y = HEAD + 20;
  rows.forEach(r=>{
    const h = r.lines*(TILE+24)+6;
    c.fillStyle = cssVar("--panel"); c.beginPath(); c.roundRect(PAD,y,W-2*PAD,h+8,10); c.fill();
    c.fillStyle = cssVar(TC[r.x].slice(4,-1)); c.beginPath(); c.roundRect(PAD,y,LAB,h+8,[10,0,0,10]); c.fill();
    c.fillStyle = "#101413"; c.font = '900 44px "Big Shoulders Display", Arial Narrow, sans-serif'; c.textAlign = "center"; c.fillText(r.x, PAD+LAB/2, y+(h+8)/2+15); c.textAlign = "left";
    r.list.forEach((s,i)=>{
      const x = PAD+LAB+12+(i%per)*CELL, yy = y+6+Math.floor(i/per)*(TILE+24);
      if (imgs[s]) c.drawImage(imgs[s], x, yy, TILE, TILE);
      c.fillStyle = cssVar("--muted"); c.font = '700 12px "Big Shoulders Display", Arial Narrow, sans-serif'; c.textAlign = "center";
      c.fillText(H(s).name.toUpperCase(), x+TILE/2, yy+TILE+14, CELL-6); c.textAlign = "left";
    });
    y += h+8+6;
  });
  return cv;
}

function tlView(){
  if (!U.tl) U.tl = tlParse();
  const tl = U.tl, q = U.tq.trim().toLowerCase(), all = Object.keys(S.heroes);
  const pool = all.filter(s=>!tlWhere(s) && (U.trole==="Todos"||H(s).role===U.trole) && (!q||H(s).name.toLowerCase().includes(q))).sort((a,b)=>H(a).name.localeCompare(H(b).name));
  const tile = s => `<button class="tile${tl.sel===s?' sel':''}" draggable="true" data-tlhero="${s}" title="${esc(H(s).name)}">${img(s)}<span class="nm">${esc(H(s).name)}</span></button>`;
  const rows = TIERS.map(x=>`<div class="tier" style="--tc:${TC[x]}"><div class="lab"><div>${x}<small>${tl.tiers[x].length}</small></div></div><div class="row tlrow" data-tlrow="${x}">${tl.tiers[x].map(tile).join("") || `<span class="tlhint">${t("Arrastra héroes aquí")}</span>`}</div></div>`).join("");
  const left = all.filter(s=>!tlWhere(s)).length;
  const sel = tl.sel && S.heroes[tl.sel] ? `<div class="tlbar" role="toolbar" aria-label="${esc(t("Mover {hero}",{hero:H(tl.sel).name}))}">${img(tl.sel)}<b>${esc(H(tl.sel).name)}</b>
      <div class="tiersel">${TIERS.map(x=>`<button data-tlmove="${x}" style="--tc:${TC[x]}" aria-pressed="${tlWhere(tl.sel)===x}">${x}</button>`).join("")}</div>
      <button class="btn" data-tlshift="-1" aria-label="${esc(t("Mover antes"))}">←</button><button class="btn" data-tlshift="1" aria-label="${esc(t("Mover después"))}">→</button>
      <button class="btn" data-tlmove="">${t("Quitar")}</button><button class="btn" data-tlmove="__done">${t("Hecho")}</button></div>` : "";
  return `<section class="wrap">
    <div class="sh"><h2>${t("Crea tu tier list")}</h2><p>${t("Arrastra los héroes a su tier, o púlsalos y elige tier abajo")}</p></div>
    <div class="mkbar"><div class="mkbtns"><button class="btn" data-tlload="zok">${t("Cargar la de zok3r")}</button><button class="btn" data-tlload="clear">${t("Vaciar")}</button><button class="btn pri" id="tl-copy">${t("Copiar enlace")}</button></div>
      <span class="fine" id="tl-msg" role="status">${left ? t("{n} héroes sin clasificar",{n:left}) : t("Todos los héroes clasificados ✓")}</span></div>
    <div class="tiers tlmk">${rows}</div>
    <div class="blk"><h3>${t("Héroes sin clasificar")} <small class="fine">(${left})</small></h3>
      <div class="filters"><input id="tq" type="search" placeholder="${esc(t("Buscar héroe…"))}" value="${esc(U.tq)}" aria-label="${esc(t("Buscar héroe"))}">${ROLES.map(r=>`<button class="chip" data-trole="${r}" aria-pressed="${U.trole===r}">${t(r)}</button>`).join("")}</div>
      <div class="tlpool row" data-tlrow="">${pool.map(tile).join("") || `<span class="tlhint">${left ? t("Ningún héroe coincide.") : t("No queda ninguno. Suelta aquí un héroe para quitarlo de su tier.")}</span>`}</div>
      <p class="fine">${t("Con teclado: Tab hasta un héroe, Intro para seleccionarlo y elige su tier en la barra inferior.")}</p></div>
    ${shareBlock("tl",true)}
    ${sel}
  </section>`;
}

/* ═══════════════ Global search ═══════════════ */
function gsFill(){
  const inp = $("#gs"), box = $("#gsr"); if (!inp||!box) return;
  const q = inp.value.trim().toLowerCase();
  if (!q){ box.hidden = true; box.innerHTML = ""; return; }
  const hs = Object.keys(S.heroes).filter(s=>H(s).name.toLowerCase().includes(q)).slice(0,6);
  const is = Object.keys(S.items).filter(n=>n.toLowerCase().includes(q)).slice(0,8);
  box.innerHTML = hs.map(s=>`<a href="#h-${s}">${img(s)}<span>${esc(H(s).name)}</span><small>${t("Héroe")} · ${tierOf(s)}</small></a>`).join("")
    + is.map(n=>`<a href="#objeto/${islug(n)}">${ico(n)}<span>${esc(n)}</span><small>${catName(S.items[n].c)}</small></a>`).join("")
    || `<p class="fine" style="padding:10px 12px;margin:0">${t("Sin resultados")}</p>`;
  box.hidden = false;
}

/* ═══════════════ Render and events ═══════════════ */
function render(){
  const r = route();
  const body = r.v==="hero" ? heroView(r.slug) : r.v==="builds" ? buildsView() : r.v==="items" ? itemsView() : r.v==="item" ? itemView(r.name) : r.v==="cmp" ? cmpView(r.a,r.b) : r.v==="mk" ? mkView(r.slug) : r.v==="tl" ? tlView() : r.v==="news" ? newsView() : r.v==="wr" ? wrView() : r.v==="coach" ? coachView() : r.v==="legal" ? legalView() : tierView();
  $("#app").innerHTML = header(r) + `<main>${body}</main>` + footer();
  document.title = r.v==="hero" ? `${H(r.slug).name} · Zok3r Deadlock Meta` : r.v==="item" ? `${r.name} · Zok3r Deadlock Meta` : "Zok3r Deadlock Meta";
  document.documentElement.lang = lang;
}
function rerender(id){
  const el = id && $("#"+id), pos = el && el.selectionStart, y = window.scrollY;
  render(); window.scrollTo(0,y);
  const n = id && $("#"+id); if (n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(_){} }
}

document.addEventListener("click", e=>{
  if (!e.target.closest(".gs")){ const g=$("#gsr"); if (g) g.hidden = true; }
  const el = e.target.closest("button,a"); if (!el) return;
  const D = el.dataset;
  if (D.bracket){ useBracket(D.bracket); rerender(); return; }
  if (D.lang){ lang = D.lang; LS.set("dl-lang",lang); loadLang().then(()=>rerender()); return; }
  if (D.hero){ location.hash = "h-"+D.hero; return; }
  if (D.sort){ const k=D.sort; U.wrSort = U.wrSort.k===k ? {k,dir:-U.wrSort.dir} : {k,dir: k==="name"||k==="tier" ? 1 : -1}; rerender(); return; }
  if (D.role){ U.filterRole = D.role; rerender(); return; }
  if (D.icat){ U.icat = D.icat; rerender(); return; }
  if (D.itier){ U.itier = +D.itier; rerender(); return; }
  if (D.bcat){ U.bcat = D.bcat; rerender(); return; }
  if (D.trole){ U.trole = D.trole; rerender(); return; }
  // build maker
  const bm = U.bm;
  if (D.bmph){ bm.ph = D.bmph; rerender(); return; }
  if (D.bmadd){ if (!bmHas(D.bmadd)){ bm[bm.ph].push(D.bmadd); bmSync(); rerender(); } return; }
  if (D.bmrm){ const [k,i] = D.bmrm.split(":"); bm[k].splice(+i,1); bmSync(); rerender(); return; }
  if (D.bmload){
    const src = D.bmload==="clear" ? {early:[],mid:[],late:[]} : H(bm.slug);
    bm.e = [...src.early]; bm.m = [...src.mid]; bm.l = [...src.late]; bmSync(); rerender(); return; }
  if (el.id==="bm-discord"){ copyText(bmText(), "#bm-smsg", "#bm-text", "Mensaje copiado. Pégalo en el canal de builds ✓"); return; }
  if (el.id==="bm-img-copy" || el.id==="bm-img-dl"){ shareImage(bmImage, el.id==="bm-img-copy", `build-${bm.slug}.png`, "#bm-smsg", "#bm-canvas-wrap"); return; }
  if (el.id==="bm-copy"){ copyText(shareUrl(bmHash()) || location.href, "#bm-msg", null, "Enlace copiado ✓"); return; }
  // tier list maker
  const tl = U.tl;
  if (el.id==="tl-discord"){ copyText(tlText(), "#tl-smsg", "#tl-text", "Mensaje copiado. Pégalo en el canal ✓"); return; }
  if (el.id==="tl-img-copy" || el.id==="tl-img-dl"){ shareImage(tlImage, el.id==="tl-img-copy", "mi-tier-list.png", "#tl-smsg", "#tl-canvas-wrap"); return; }
  if (el.id==="tl-copy"){ copyText(shareUrl(tlHash()) || location.href, "#tl-msg", null, "Enlace copiado ✓"); return; }
  if (D.tlhero){ tl.sel = tl.sel===D.tlhero ? null : D.tlhero; rerender(); return; }
  if (D.tlmove!==undefined && tl.sel){
    if (D.tlmove==="__done") tl.sel = null; else tlPlace(tl.sel, D.tlmove||null);
    tlSync(); rerender(); return; }
  if (D.tlshift && tl.sel){ const x = tlWhere(tl.sel); if (x){ const arr = tl.tiers[x], i = arr.indexOf(tl.sel), j = i + +D.tlshift; if (j>=0 && j<arr.length){ [arr[i],arr[j]] = [arr[j],arr[i]]; tlSync(); rerender(); } } return; }
  if (D.tlload){ U.tl = tlBlank(); if (D.tlload==="zok") TIERS.forEach(x=>{ U.tl.tiers[x] = [...(S.tiers[x]||[])]; }); tlSync(); rerender(); return; }
});

document.addEventListener("change", e=>{
  const id = e.target.id;
  if (id==="isort"){ U.isort = e.target.value; rerender(); return; }
  if (id==="mk-h"){ U.bm = null; location.hash = "crear/"+e.target.value; return; }
  if (id==="ca" || id==="cb"){ const a=$("#ca").value, b=$("#cb").value; location.hash = "comparar/"+a+(b?"/"+b:""); return; }
});

document.addEventListener("input", e=>{
  const id = e.target.id;
  if (id==="q"){ U.query = e.target.value; rerender("q"); }
  else if (id==="iq"){ U.iq = e.target.value; rerender("iq"); }
  else if (id==="bq"){ U.bq = e.target.value; rerender("bq"); }
  else if (id==="tq"){ U.tq = e.target.value; rerender("tq"); }
  else if (id==="gs") gsFill();
  else if (id==="bm-title" || id==="bm-author"){
    if (id==="bm-title") U.bm.t = e.target.value; else U.bm.a = e.target.value;
    bmSync(); const tx = $("#bm-text"); if (tx) tx.value = bmText(); }
  else if (id==="tl-title" || id==="tl-author"){
    if (id==="tl-title") U.tl.t = e.target.value; else U.tl.by = e.target.value;
    tlSync(); const tx = $("#tl-text"); if (tx) tx.value = tlText(); }
});

document.addEventListener("keydown", e=>{
  if (e.target.id!=="gs") return;
  if (e.key==="Escape"){ e.target.value = ""; gsFill(); }
  if (e.key==="Enter"){ const a = $("#gsr a"); if (a){ location.hash = a.getAttribute("href"); e.target.blur(); } }
});

// drag and drop for the tier list maker
document.addEventListener("dragstart", e=>{
  const el = e.target.closest && e.target.closest("[data-tlhero]"); if (!el) return;
  U.dragging = el.dataset.tlhero; e.dataTransfer.effectAllowed = "move"; try{ e.dataTransfer.setData("text/plain", U.dragging); }catch(_){}
});
document.addEventListener("dragover", e=>{
  const row = U.dragging && e.target.closest && e.target.closest("[data-tlrow]"); if (!row) return;
  e.preventDefault(); document.querySelectorAll(".tlrow.over,.tlpool.over").forEach(x=>x.classList.remove("over")); row.classList.add("over");
});
document.addEventListener("drop", e=>{
  const row = U.dragging && e.target.closest && e.target.closest("[data-tlrow]"); if (!row) return;
  e.preventDefault(); const over = e.target.closest("[data-tlhero]");
  tlPlace(U.dragging, row.dataset.tlrow||null, over && over.dataset.tlhero!==U.dragging ? over.dataset.tlhero : null);
  U.dragging = null; U.tl.sel = null; tlSync(); rerender();
});
document.addEventListener("dragend", ()=>{ U.dragging = null; document.querySelectorAll(".over").forEach(x=>x.classList.remove("over")); });

window.addEventListener("hashchange", ()=>{ U.bm = null; U.tl = null; render(); window.scrollTo(0,0); });
render();
})();
