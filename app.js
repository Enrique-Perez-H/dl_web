(async function(){
const S = await (await fetch('data.json')).json();
// assets/items/index.json maps item slug -> icon file (written by scripts/fetch_item_icons.py); without it items render without icons
const ICONS = await fetch('assets/items/index.json').then(r=>r.ok?r.json():{}).catch(()=>({}));
const TIERS = ["S+","S","A","B","C","F"];
const TC = {"S+":"var(--t-splus)","S":"var(--t-s)","A":"var(--t-a)","B":"var(--t-b)","C":"var(--t-c)","F":"var(--t-f)"};
const CAT = {w:"var(--weapon)",v:"var(--vital)",s:"var(--spirit)"};
const CATN = {w:"Arma",v:"Vitalidad",s:"Espíritu"};
const TYPES = {parche:["Parche","var(--t-b)"],heroe:["Héroe nuevo","var(--t-splus)"],discord:["Discord","var(--spirit)"],ranked:["Ranked","var(--t-s)"]};
const MES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
let wrSort = {k:"wr",dir:-1};
let iq = "", icat = "all", itier = 0, isort = "cost", bq = "", bcat = "all", bm = null;
let edit = false, canWrite = false, dirty = false, filterRole = "Todos", query = "", popFor = null, artifactNs = null;

const $ = (s,el=document)=>el.querySelector(s);
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const tierOf = slug => TIERS.find(t => (S.tiers[t]||[]).includes(slug)) || "—";
const H = slug => S.heroes[slug];
const img = (slug,cls="") => `<img src="${S.img[slug]}" alt="" width="72" height="72" ${cls}>`;
const fmtDate = d => { const [y,m,dd] = d.split("-"); return `${+dd} ${MES[+m-1]} ${y}`; };
const islug = n => n.toLowerCase().replace(/[\u2019']/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const ISL = Object.fromEntries(Object.keys(S.items).map(n=>[islug(n),n]));
const ico = (n,cls="") => ICONS[islug(n)] ? `<img class="ic ${cls}" src="assets/items/${ICONS[islug(n)]}" alt="" width="28" height="28" loading="lazy">` : "";
const costTier = c => ({800:1,1600:2,3200:3,6400:4}[c]||0);
const PH = [["early","Línea","0–10 min","e"],["mid","Medio","10–20 min","m"],["late","Final","20+ min","l"]];
// item -> [{slug, phase}] for every hero build
const USE = {};
Object.keys(S.heroes).forEach(sl=>PH.forEach(([k])=>S.heroes[sl][k].forEach(n=>{ (USE[n]=USE[n]||[]).push({slug:sl,phase:k}); })));
const souls = n => n>=1000 ? (n/1000).toLocaleString("es-ES",{maximumFractionDigits:1})+"k" : String(n);

function route(){
  const h = (location.hash||"").slice(1).split("?")[0];
  if (h==="objetos") return {v:"items"};
  if (h.startsWith("objeto/") && ISL[h.slice(7)]) return {v:"item",name:ISL[h.slice(7)]};
  if (h==="comparar" || h.startsWith("comparar/")){ const [,a,b] = h.split("/"); return {v:"cmp",a:S.heroes[a]?a:"",b:S.heroes[b]?b:""}; }
  if (h==="crear" || h.startsWith("crear/")) return {v:"mk",slug:S.heroes[h.split("/")[1]]?h.split("/")[1]:Object.keys(S.heroes)[0]};
  if (h.startsWith("h-") && S.heroes[h.slice(2)]) return {v:"hero",slug:h.slice(2)};
  if (h==="builds") return {v:"builds"};
  if (h==="noticias") return {v:"news"};
  if (h==="winrates") return {v:"wr"};
  if (h==="coaching") return {v:"coach"};
  return {v:"tier"};
}

function header(r){
  const cur = r.v==="hero" ? "builds" : r.v==="item" ? "items" : r.v;
  const a = (id,href,txt)=>`<a href="#${href}" ${cur===id?'aria-current="page"':''}>${txt}</a>`;
  return `<header class="top"><div class="wrap">
    <a class="brand" href="#tier"><b>zok<span>3</span>r</b><small>Deadlock meta</small></a>
    <nav class="tabs" aria-label="Secciones">${a("tier","tier","Tier list")}${a("builds","builds","Builds")}${a("wr","winrates","Winrates")}${a("items","objetos","Objetos")}${a("cmp","comparar","Comparar")}${a("mk","crear","Mi build")}${a("news","noticias","Noticias")}<a href="#coaching" class="cta-tab" ${cur==="coach"?'aria-current="page"':''}>Coaching</a></nav>
    <div class="gs"><input id="gs" type="search" placeholder="Buscar héroe u objeto…" autocomplete="off" aria-label="Buscar héroe u objeto"><div class="gsr" id="gsr" hidden></div></div>
  </div></header>`;
}

function tierView(){
  const rows = TIERS.map(t=>{
    const list = (S.tiers[t]||[]).map(slug=>`<button class="tile${edit&&S.flags.includes(slug)?' flag':''}" data-hero="${slug}" title="${esc(H(slug).name)}">${img(slug)}<span class="nm">${esc(H(slug).name)}</span></button>`).join("");
    return `<div class="tier" style="--tc:${TC[t]}"><div class="lab"><div>${t}<small>${S.tiers[t].length} héroes</small></div></div><div class="row">${list||'<span style="color:var(--muted);font-size:13px;padding:8px">Sin héroes</span>'}</div></div>`;
  }).join("");
  return `<section class="wrap">
    <div class="intro"><div>
      <h1>Tier list de <em>Deadlock</em><br>en español</h1>
      <p>Mi ranking para ranked tras ${esc(S.meta.patchLabel)}. Pulsa un héroe para ver su build: objetos por fase, orden de habilidades y líneas difíciles.</p>
    </div>
    <div class="patch"><span class="k">Actualizada</span><span class="v">${fmtDate(S.meta.updated)}</span><span class="k" style="margin-top:8px">Último parche</span><span class="v">${esc(S.meta.lastPatch)}</span></div></div>
    <div class="tiers">${rows}</div>
    <p class="tnote"><b>Nota:</b> la tier list es subjetiva y está hecha por mí en torno a rankeds de alto nivel. Los personajes pueden cambiar de tier en función de tu rango. Para ver datos de todos los rangos, mira los <a href="#winrates">winrates</a>.</p>
    <div class="legend"><span><b>44 héroes</b> · roster completo tras City Never Sleeps</span><span>Ranking propio de zok3r · Eternus 5 · 2.000 h</span></div>
  </section>`;
}

function buildsView(){
  const roles = ["Todos","Luchador","Asesino","Tirador","Místico"];
  const q = query.trim().toLowerCase();
  const list = Object.keys(S.heroes).sort((a,b)=>{
    const ta=TIERS.indexOf(tierOf(a)), tb=TIERS.indexOf(tierOf(b)); return ta-tb || H(a).name.localeCompare(H(b).name);
  }).filter(s => (filterRole==="Todos"||H(s).role===filterRole) && (!q || H(s).name.toLowerCase().includes(q)));
  return `<section class="wrap">
    <div class="sh"><h2>Builds por héroe</h2><p>Objetos más comprados en ranked (últimos 7 días) · ordenados por tier</p></div>
    <div class="filters"><input id="q" type="search" placeholder="Buscar héroe…" value="${esc(query)}" aria-label="Buscar héroe">
      ${roles.map(r=>`<button class="chip" data-role="${r}" aria-pressed="${filterRole===r}">${r}</button>`).join("")}</div>
    <div class="grid">${list.map(s=>`<a class="card" href="#h-${s}">${img(s)}<div><b>${esc(H(s).name)}</b><span><span class="tb" style="--tc:${TC[tierOf(s)]||'var(--line)'}">${tierOf(s)}</span> ${esc(H(s).role)}</span></div></a>`).join("") || '<p style="color:var(--muted)">Ningún héroe coincide.</p>'}</div>
  </section>`;
}

const SRC = () => `<a href="${esc(S.stats.src)}" target="_blank" rel="noopener">${esc(S.stats.srcName||"statlocker.gg")}</a>`;
function scopeTxt(){
  const c = S.stats.scope; if (!c) return "parche actual, todos los modos";
  const bits = [c.days ? `últimos ${c.days} días` : "parche actual", c.matchMode ? `modo ${c.matchMode}` : "todos los modos"];
  if (c.minBadge!=null || c.maxBadge!=null) bits.push(`rango medio ${c.minBadge??"…"}–${c.maxBadge??"…"}`);
  return bits.join(", ");
}
const pct = n => n==null ? "—" : n.toLocaleString("es-ES",{minimumFractionDigits:1,maximumFractionDigits:1})+"%";
const kfmt = n => n==null ? "—" : n>=1000 ? Math.round(n/1000).toLocaleString("es-ES")+"k" : String(n);
function wrView(){
  const st = S.stats;
  const rows = Object.keys(S.heroes).map(s=>({s, wr:st.hero[s].wr, pick:st.hero[s].pick, games:st.hero[s].games, tier:TIERS.indexOf(tierOf(s)), name:H(s).name}));
  const k = wrSort.k, d = wrSort.dir;
  rows.sort((a,b)=> k==="name" ? d*a.name.localeCompare(b.name) : (d*((a[k]??-1)-(b[k]??-1)) || b.wr-a.wr));
  const maxPick = Math.max(...rows.map(r=>r.pick));
  const avg = rows.reduce((t,r)=>t+r.wr,0)/rows.length;
  const th = (key,lab,cls="") => `<th class="${cls}"><button data-sort="${key}" aria-label="Ordenar por ${lab}">${lab}${wrSort.k===key?(wrSort.dir<0?" ↓":" ↑"):""}</button></th>`;
  const over = rows.filter(r=>r.wr>=54).length, under = rows.filter(r=>r.wr<46).length;
  const top = [...rows].sort((a,b)=>b.wr-a.wr);
  return `<section class="wrap">
    <div class="sh"><h2>Winrates</h2><p>Fuente: ${SRC()} · ${scopeTxt()} · consultado ${fmtDate(st.date)}</p></div>
    <div class="kpis">
      <div><span class="k">Mejor winrate</span><b>${esc(top[0].name)}</b><span class="v">${pct(top[0].wr)}</span></div>
      <div><span class="k">Peor winrate</span><b>${esc(top[top.length-1].name)}</b><span class="v">${pct(top[top.length-1].wr)}</span></div>
      <div><span class="k">Por encima del 54%</span><b>${over} héroes</b><span class="v">winrate alto</span></div>
      <div><span class="k">Por debajo del 46%</span><b>${under} héroes</b><span class="v">media del roster ${pct(avg)}</span></div>
    </div>
    <div class="tblwrap"><table class="wrt">
      <thead><tr>${th("name","Héroe")}${th("tier","Mi tier","c")}${th("wr","Winrate")}${th("pick","Pick rate")}${th("games","Partidas","r")}</tr></thead>
      <tbody>${rows.map((r,i)=>{ const t=tierOf(r.s); const off=(r.wr-50)*10; // 1 pt = 10% of half-track
        const w=Math.min(Math.abs(off),50);
        return `<tr><td><a class="hn" href="#h-${r.s}">${img(r.s)}<span>${esc(r.name)}</span></a></td>
        <td class="c"><span class="tb" style="--tc:${TC[t]}">${t}</span></td>
        <td><div class="cell"><div class="bar wr"><span class="mid"></span><i class="${r.wr>=50?'up':'dn'}" style="${r.wr>=50?`left:50%;width:${w}%`:`left:auto;right:50%;width:${w}%`}"></i></div><em>${pct(r.wr)}</em></div></td>
        <td><div class="cell"><div class="bar"><i class="pk" style="width:${(r.pick/maxPick*100).toFixed(1)}%"></i></div><em>${pct(r.pick)}</em></div></td>
        <td class="r num">${kfmt(r.games)}</td></tr>`;}).join("")}</tbody></table></div>
    <p class="fine">Winrate: % de partidas ganadas con el héroe. Pick rate: % de partidas en las que aparece. La barra de winrate parte del 50%; cada punto por encima o por debajo alarga la barra. Partidas: partidas del héroe en el periodo analizado. </p>
    <p class="tnote"><b>Nota:</b> la tier list es subjetiva y está hecha por mí en torno a rankeds de alto nivel. Los personajes pueden cambiar de tier en función de tu rango.</p>
  </section>`;
}

function itemLi(n){
  const it = S.items[n] || {c:"s",cost:0};
  return `<li style="--cat:${CAT[it.c]}"><i title="${CATN[it.c]}"></i><span><a class="il" href="#objeto/${islug(n)}">${ico(n)}${esc(n)}</a></span><em>${it.cost?souls(it.cost):""}</em></li>`;
}

function heroView(slug){
  const h = H(slug), t = tierOf(slug);
  const pr = h.prio.map(a=>h.abilities.indexOf(a));
  const abil = h.abilities.map((a,i)=>{ const p = h.prio.indexOf(a)+1; return `<div class="ab"><span class="slot">Habilidad ${i+1}${i===3?' · ulti':''}</span><b>${esc(a)}</b><span class="pr ${p===1?'p1':''}">${p===1?'Max primero':p+'º'}</span></div>`; }).join("");
  const ph = (k,lab,time)=>`<div class="ph"><h4>${lab}<small>${time}</small></h4><ol class="items">${h[k].map(itemLi).join("")}</ol></div>`;
  const note = S.notes[slug]||"";
  const zb = S.zbuilds[slug];
  const rb = S.recBuilds[slug];
  const zph = (k,lab,time)=>`<div class="ph z"><h4>${lab}<small>${time}</small></h4><ol class="items">${(zb[k]||[]).map(itemLi).join("") || '<li style="--cat:var(--line)"><i></i><span style="color:var(--muted)">Sin objetos</span><em></em></li>'}</ol></div>`;
  const best = S.stats.hero[slug].best;
  return `<section class="wrap">
    <a class="back" href="#builds">← Todas las builds</a>
    <div class="sheet-head">${img(slug)}
      <div><h2>${esc(h.name)}</h2><div class="meta"><span class="tb" style="--tc:${TC[t]}">Tier ${t}</span><span>${esc(h.role)}</span>${h.weapon!=="—"?`<span>· ${esc(h.weapon)}</span>`:''}</div></div>
      <div class="wr"><div class="n">${pct(S.stats.hero[slug].wr)}</div><div class="l">Winrate · pick ${pct(S.stats.hero[slug].pick)}${S.stats.hero[slug].games?` · ${kfmt(S.stats.hero[slug].games)} partidas`:''}<br>${SRC()}</div></div>
    </div>
    <div class="plan"><p class="k">Plan de juego</p><p>${esc(h.plan)}</p>
      ${edit ? `<div class="note"><label class="k" for="note">Nota de zok3r</label><textarea id="note" data-slug="${slug}" placeholder="Tu consejo personal para este héroe…">${esc(note)}</textarea></div>` : (note?`<div class="note"><p class="k">Nota de zok3r</p><p>${esc(note)}</p></div>`:'')}
    </div>
    <div class="acts"><a class="btn pri" href="#crear/${slug}">Crear mi build</a><a class="btn" href="#comparar/${slug}">Comparar con otro héroe</a></div>
    <div class="blk"><h3>Orden de habilidades</h3><div class="abil">${abil}</div></div>
    ${rb || edit ? `<div class="blk"><h3>Build recomendada en statlocker</h3>${rb ? `<div class="rb"><div><span class="k">${esc(h.name)} build</span><b>${esc(rb.name)}</b>${rb.author?`<span class="by">Por ${esc(rb.author)}</span>`:''}</div>
        <div class="rbs">${rb.wr!=null?`<div><b>${pct(rb.wr)}</b><span>Winrate</span></div>`:''}${rb.matches!=null?`<div><b>${rb.matches.toLocaleString("es-ES")}</b><span>Partidas</span></div>`:''}</div>
        <a class="btn" href="${esc(rb.url||'https://statlocker.gg/builds')}" target="_blank" rel="noopener">Abrir en statlocker ↗</a></div>
        <p class="fine">Búscala por su nombre en el buscador de builds del juego para importarla.</p>` : '<p class="fine">Aún sin build recomendada para este héroe.</p>'}
      ${edit ? `<form class="nform rbform" id="rbform" data-slug="${slug}"><div class="r4"><input id="rb-name" placeholder="Nombre de la build" value="${esc(rb?rb.name:'')}" aria-label="Nombre de la build"><input id="rb-author" placeholder="Autor" value="${esc(rb&&rb.author||'')}" aria-label="Autor"><input id="rb-wr" placeholder="WR %" inputmode="decimal" value="${rb&&rb.wr!=null?rb.wr:''}" aria-label="Winrate"><input id="rb-matches" placeholder="Partidas" inputmode="numeric" value="${rb&&rb.matches!=null?rb.matches:''}" aria-label="Partidas"></div><input id="rb-url" type="url" placeholder="Enlace a la build (opcional)" value="${esc(rb&&rb.url||'')}" aria-label="Enlace"><div><button class="btn pri" type="submit">Guardar</button></div></form>` : ''}</div>` : ''}
    ${zb ? `<div class="blk"><h3>Build recomendada por zok3r</h3><div class="phases">${zph("early","Línea","0–10 min")}${zph("mid","Medio","10–20 min")}${zph("late","Final","20+ min")}</div></div>` : ''}
    ${edit ? zEditor(slug) : ''}
    <div class="blk"><h3>${zb?'Build más comprada en ranked':'Build por fase'}</h3><div class="phases">${ph("early","Línea","0–10 min")}${ph("mid","Medio","10–20 min")}${ph("late","Final","20+ min")}</div>
      <div class="cats">${Object.keys(CAT).map(c=>`<span style="--cat:${CAT[c]}"><i></i>${CATN[c]}</span>`).join("")}<span>Coste en almas</span><span>Datos: objetos más comprados en ranked, últimos 7 días (<a href="https://deadlocktiers.com/heroes/${slug}/" target="_blank" rel="noopener">deadlocktiers.com</a>)</span></div></div>
    <div class="blk"><h3>Objetos con mejor winrate</h3>
      ${best.length ? `<div class="best">${best.map(([n,w])=>`<div class="bi" style="--cat:${CAT[(S.items[n]||{c:'s'}).c]}"><i></i><a class="il" href="#objeto/${islug(n)}">${ico(n)}${esc(n)}</a><b>${pct(w)}</b></div>`).join("")}</div>
      <p class="fine">De ${SRC()} (${scopeTxt()}), entre objetos comprados en al menos el 5% de las partidas del héroe. Casi todos son de final: quien llega a comprarlos suele ir ganando ya, así que indican qué cerrar, no qué comprar primero.</p>` : '<p class="fine">No hay datos suficientes de objetos para este héroe ahora mismo.</p>'}</div>
    <div class="blk"><h3>Líneas más difíciles</h3><div class="lanes">${h.hard.map(s=>`<a class="lane" href="#h-${s}">${img(s)}${esc(H(s).name)}</a>`).join("")}</div></div>
  </section>`;
}

function zEditor(slug){
  const zb = S.zbuilds[slug] || {early:[],mid:[],late:[]};
  const ta = (k,lab)=>`<label>${lab}<textarea id="zb-${k}" rows="6" placeholder="Un objeto por línea">${esc((zb[k]||[]).join("\n"))}</textarea></label>`;
  return `<form class="nform zform" id="zform" data-slug="${slug}"><b style="font:800 18px var(--f-display);text-transform:uppercase">Tu build recomendada</b>
    <p class="fine" style="margin:0">Escribe un objeto por línea, con el nombre en inglés tal como aparece en el juego. Si rellenas alguna fase, tu build sale arriba como "Build recomendada por zok3r".</p>
    <div class="r3">${ta("early","Línea")}${ta("mid","Medio")}${ta("late","Final")}</div>
    <div id="zb-warn" class="fine"></div>
    <div style="display:flex;gap:8px"><button class="btn pri" type="submit">Guardar build</button>${S.zbuilds[slug]?'<button class="btn" type="button" id="zb-del">Quitar mi build</button>':''}</div></form>`;
}

function coachView(){
  const c = S.coaching, live = !!c.url;
  const cta = live ? `<a class="btn pri big" href="${esc(c.url)}" target="_blank" rel="noopener">Unirme en Whop ↗</a>` : `<span class="btn big soon" aria-disabled="true">Próximamente</span>`;
  const ed = edit ? `<form class="nform" id="cform"><b style="font:800 18px var(--f-display);text-transform:uppercase">Ajustes del coaching</b>
    <div class="r"><input id="c-price" value="${esc(c.price)}" aria-label="Precio" placeholder="Precio"><input id="c-per" value="${esc(c.per)}" aria-label="Periodo" placeholder="Periodo (p. ej. /mes)"><input id="c-url" type="url" value="${esc(c.url)}" placeholder="Enlace de Whop (vacío = Próximamente)" aria-label="Enlace de Whop"></div>
    <div><button class="btn pri" type="submit">Guardar</button></div></form>` : "";
  return `<section class="wrap coach">
    <div class="chero"><div>
      <p class="eyebrow">Coaching de Deadlock en español</p>
      <h1>Sube de rango con <em>zok3r</em></h1>
      <p class="lede">Reviso tus partidas como las juego yo en Eternus: posicionamiento, rotaciones, timings de objetos y qué pelea coger y cuál no.</p>
      <div class="ctas">${cta}<a class="btn big ghost" href="https://twitch.tv/zok3r" target="_blank" rel="noopener">Verme en Twitch ↗</a></div>
    </div>
    <ul class="creds">
      <li><b>Eternus 5</b><span>segundo rango más alto de Deadlock</span></li>
      <li><b>2.000 h</b><span>jugadas en Deadlock</span></li>
      <li><b>Ex-pro</b><span>CoD (MW3, BO2), Overwatch y Apex Legends</span></li>
      <li><b>Top 10 EU</b><span>en Overwatch · Radiant #270 EU en Valorant</span></li>
    </ul></div>
    ${ed}
    <div class="plan-grid">
      <div class="price-card"><span class="k">Plan único</span><div class="price">${esc(c.price)}<small>${esc(c.per)}</small></div>
        <ul class="incl">
          <li>Un coaching personal de una partida tuya</li>
          <li>Acceso a la biblioteca de coachings anteriores</li>
          <li>Rol de alumno en el Discord</li>
        </ul>${cta}
        <p class="fine">Más adelante: clases y Q&amp;A en directo, y sesiones 1:1.</p></div>
      <div class="steps"><span class="k">Cómo funciona</span>
        <ol>
          <li><b>Únete en Whop</b><span>Pagas el plan y recibes acceso al Discord.</span></li>
          <li><b>Envía una partida</b><span>Elige una ranked reciente con el héroe que quieras mejorar.</span></li>
          <li><b>Recibe el análisis</b><span>Te devuelvo la revisión con los errores clave y qué cambiar en la siguiente partida.</span></li>
          <li><b>Repasa la biblioteca</b><span>Aprende también de los coachings a otros jugadores de tu rango y tu héroe.</span></li>
        </ol></div>
    </div>
  </section>`;
}

function newsView(){
  const items = [...S.news].sort((a,b)=>b.date.localeCompare(a.date));
  const form = edit ? `<form class="nform" id="nform"><b style="font:800 18px var(--f-display);text-transform:uppercase">Añadir noticia</b>
    <div class="r"><input id="n-date" type="date" required value="${S.meta.today}" aria-label="Fecha"><select id="n-type" aria-label="Tipo">${Object.keys(TYPES).map(k=>`<option value="${k}">${TYPES[k][0]}</option>`).join("")}</select><input id="n-title" required placeholder="Titular" aria-label="Titular"></div>
    <textarea id="n-body" rows="3" placeholder="Resumen" aria-label="Resumen"></textarea>
    <input id="n-src" type="url" placeholder="Enlace a la fuente (opcional)" aria-label="Enlace">
    <div><button class="btn pri" type="submit">Añadir</button></div></form>` : "";
  return `<section class="wrap">
    <div class="sh"><h2>Noticias</h2><p>Parches oficiales y anuncios del Discord de Deadlock, resumidos en español</p></div>
    ${form}
    <div class="news">${items.map((n,i)=>{ const [lab,col]=TYPES[n.type]||TYPES.parche; const idx=S.news.indexOf(n);
      return `<article class="nw${n.upcoming?' up':''}" style="--dot:${col}"><div class="d"><span class="tag">${n.upcoming?'Próximamente':lab}</span><span>${fmtDate(n.date)}</span>${edit?`<button class="xbtn" data-del="${idx}">Borrar</button>`:''}</div>
        <h3>${n.hero&&S.img[n.hero]?`<a href="#h-${n.hero}" aria-label="Build de ${esc(H(n.hero).name)}">${img(n.hero)}</a>`:''}${esc(n.title)}</h3>
        <p>${esc(n.body)}</p>${n.src?`<a class="src" href="${esc(n.src)}" target="_blank" rel="noopener">Fuente: ${esc(n.srcName||new URL(n.src).hostname)} ↗</a>`:''}</article>`;}).join("")}</div>
  </section>`;
}

const hchip = s => `<a class="lane" href="#h-${s}">${img(s)}${esc(H(s).name)}</a>`;
const catChips = (attr,cur) => [["all","Todos"],...Object.keys(CAT).map(c=>[c,CATN[c]])].map(([k,l])=>`<button class="chip" data-${attr}="${k}" aria-pressed="${cur===k}">${l}</button>`).join("");

function itemCard(n){
  const it = S.items[n], u = (USE[n]||[]).length, t = costTier(it.cost);
  return `<a class="icard" style="--cat:${CAT[it.c]}" href="#objeto/${islug(n)}">${ico(n,"lg")}<div><b>${esc(n)}</b><span>${CATN[it.c]}${t?` · T${t}`:''}${it.cost?` · ${souls(it.cost)}`:''}</span>${u?`<small>${u} ${u===1?'build':'builds'}</small>`:''}</div></a>`;
}

function itemsView(){
  const q = iq.trim().toLowerCase();
  const list = Object.keys(S.items).filter(n=>(icat==="all"||S.items[n].c===icat) && (!itier||costTier(S.items[n].cost)===itier) && (!q||n.toLowerCase().includes(q)));
  list.sort(isort==="name" ? (a,b)=>a.localeCompare(b) : isort==="use" ? (a,b)=>(USE[b]||[]).length-(USE[a]||[]).length||a.localeCompare(b) : (a,b)=>S.items[a].cost-S.items[b].cost||a.localeCompare(b));
  return `<section class="wrap">
    <div class="sh"><h2>Objetos</h2><p>${Object.keys(S.items).length} objetos · pulsa uno para ver qué héroes lo compran y dónde rinde mejor</p></div>
    <div class="filters"><input id="iq" type="search" placeholder="Buscar objeto…" value="${esc(iq)}" aria-label="Buscar objeto">
      ${catChips("icat",icat)}</div>
    <div class="filters">${[0,1,2,3,4].map(t=>`<button class="chip" data-itier="${t}" aria-pressed="${itier===t}">${t?`Tier ${t} · ${souls([0,800,1600,3200,6400][t])}`:'Todos los tiers'}</button>`).join("")}
      <label class="sortsel">Ordenar <select id="isort"><option value="cost" ${isort==="cost"?'selected':''}>Coste</option><option value="name" ${isort==="name"?'selected':''}>Nombre</option><option value="use" ${isort==="use"?'selected':''}>Más usados</option></select></label></div>
    <div class="igrid2">${list.map(itemCard).join("") || '<p style="color:var(--muted)">Ningún objeto coincide.</p>'}</div>
  </section>`;
}

function itemView(n){
  const it = S.items[n], t = costTier(it.cost);
  const users = PH.map(([k,lab,time])=>[lab,time,(USE[n]||[]).filter(u=>u.phase===k).map(u=>u.slug)]).filter(x=>x[2].length);
  const bestIn = Object.keys(S.stats.hero).map(sl=>{ const b = S.stats.hero[sl].best.find(x=>x[0]===n); return b && {sl, wr:b[1]}; }).filter(Boolean).sort((a,b)=>b.wr-a.wr);
  return `<section class="wrap">
    <a class="back" href="#objetos">← Todos los objetos</a>
    <div class="sheet-head ihead" style="--cat:${CAT[it.c]}">${ico(n,"xl")}
      <div><h2>${esc(n)}</h2><div class="meta"><span class="tb" style="--tc:${CAT[it.c]}">${CATN[it.c]}</span>${t?`<span>Tier ${t}</span>`:''}${it.cost?`<span>· ${it.cost.toLocaleString("es-ES")} almas</span>`:''}</div></div></div>
    <div class="blk"><h3>Lo compran en su build</h3>${users.length ? users.map(([lab,time,l])=>`<div class="ufor"><h4>${lab}<small>${time}</small></h4><div class="lanes">${l.sort((a,b)=>H(a).name.localeCompare(H(b).name)).map(hchip).join("")}</div></div>`).join("") : '<p class="fine">Ningún héroe lo lleva en su build más comprada ahora mismo.</p>'}</div>
    <div class="blk"><h3>Héroes donde mejor rinde</h3>${bestIn.length ? `<div class="best">${bestIn.map(b=>`<a class="bi" href="#h-${b.sl}">${img(b.sl)}<span>${esc(H(b.sl).name)}</span><b>${pct(b.wr)}</b></a>`).join("")}</div><p class="fine">Winrate del héroe con este objeto, según ${SRC()}.</p>` : '<p class="fine">No aparece entre los objetos con mejor winrate de ningún héroe.</p>'}</div>
    <div class="acts"><a class="btn pri" href="#crear">Crear una build</a></div>
  </section>`;
}

function cmpView(a,b){
  const opts = sel => `<option value="">Elige un héroe…</option>` + Object.keys(S.heroes).sort((x,y)=>H(x).name.localeCompare(H(y).name)).map(k=>`<option value="${k}" ${k===sel?'selected':''}>${esc(H(k).name)}</option>`).join("");
  const pick = `<div class="cmpbar"><label>Héroe A<select id="ca">${opts(a)}</select></label><span class="vs">VS</span><label>Héroe B<select id="cb">${opts(b)}</select></label></div>`;
  if (!a || !b) return `<section class="wrap"><div class="sh"><h2>Comparar héroes</h2><p>Elige dos héroes para ver sus datos y builds lado a lado</p></div>${pick}</section>`;
  const st = x => S.stats.hero[x], all = x => [].concat(...PH.map(([k])=>H(x)[k]));
  const ia = new Set(all(a)), ib = new Set(all(b));
  const common = [...ia].filter(n=>ib.has(n)), onlyA = [...ia].filter(n=>!ib.has(n)), onlyB = [...ib].filter(n=>!ia.has(n));
  const w = (va,vb,hi=true) => va==null||vb==null||va===vb ? ["",""] : (hi ? va>vb : va<vb) ? ["win",""] : ["","win"];
  const row = (lab,ca,cb,cls=["",""]) => `<tr><th scope="row">${lab}</th><td class="${cls[0]}">${ca}</td><td class="${cls[1]}">${cb}</td></tr>`;
  const il = l => l.length ? `<ul class="mini">${l.map(n=>`<li style="--cat:${CAT[S.items[n].c]}"><a class="il" href="#objeto/${islug(n)}">${ico(n)}${esc(n)}</a></li>`).join("")}</ul>` : '<span class="fine">—</span>';
  const ab = x => `<ol class="mini abl">${H(x).prio.map((p,i)=>`<li>${esc(p)}</li>`).join("")}</ol>`;
  const ta = TIERS.indexOf(tierOf(a)), tb = TIERS.indexOf(tierOf(b));
  const notes = [];
  if (H(a).hard.includes(b)) notes.push(`${esc(H(b).name)} es una de las líneas más difíciles de ${esc(H(a).name)}.`);
  if (H(b).hard.includes(a)) notes.push(`${esc(H(a).name)} es una de las líneas más difíciles de ${esc(H(b).name)}.`);
  return `<section class="wrap">
    <div class="sh"><h2>Comparar héroes</h2><p>${esc(H(a).name)} vs ${esc(H(b).name)}</p></div>${pick}
    ${notes.length?`<p class="tnote">${notes.join(" ")}</p>`:''}
    <div class="tblwrap"><table class="cmp"><thead><tr><th></th><th><a class="hn" href="#h-${a}">${img(a)}<span>${esc(H(a).name)}</span></a></th><th><a class="hn" href="#h-${b}">${img(b)}<span>${esc(H(b).name)}</span></a></th></tr></thead><tbody>
      ${row("Mi tier",`<span class="tb" style="--tc:${TC[tierOf(a)]}">${tierOf(a)}</span>`,`<span class="tb" style="--tc:${TC[tierOf(b)]}">${tierOf(b)}</span>`,w(ta,tb,false))}
      ${row("Rol",esc(H(a).role),esc(H(b).role))}
      ${row("Arma",esc(H(a).weapon),esc(H(b).weapon))}
      ${row("Winrate",pct(st(a).wr),pct(st(b).wr),w(st(a).wr,st(b).wr))}
      ${row("Pick rate",pct(st(a).pick),pct(st(b).pick))}
      ${row("Partidas",kfmt(st(a).games),kfmt(st(b).games))}
      ${row("Orden de habilidades",ab(a),ab(b))}
      ${row("Líneas difíciles",`<div class="lanes">${H(a).hard.map(hchip).join("")}</div>`,`<div class="lanes">${H(b).hard.map(hchip).join("")}</div>`)}
      ${row("Solo en su build",il(onlyA),il(onlyB))}
    </tbody></table></div>
    <div class="blk"><h3>Objetos que comparten (${common.length})</h3>${il(common)}</div>
    <div class="acts"><a class="btn" href="#comparar/${b}/${a}">Intercambiar</a></div>
  </section>`;
}

// --- build maker: the build lives in the URL so it can be shared ---
const BMK = {e:"early",m:"mid",l:"late"};
function bmDefault(slug){
  const zb = S.zbuilds[slug], h = H(slug);
  return {slug, e:[...(zb&&zb.early&&zb.early.length?zb.early:h.early)], m:[...(zb&&zb.mid&&zb.mid.length?zb.mid:h.mid)], l:[...(zb&&zb.late&&zb.late.length?zb.late:h.late)], ph:"e"};
}
function bmParse(slug){
  const raw = location.hash.slice(1), qi = raw.indexOf("?");
  if (qi<0) return bmDefault(slug);
  const p = new URLSearchParams(raw.slice(qi+1)), b = {slug, e:[], m:[], l:[], ph:"e"};
  Object.keys(BMK).forEach(k=>{ b[k] = (p.get(k)||"").split("~").filter(n=>S.items[n]); });
  return b;
}
function bmHash(){
  const f = k => bm[k].map(encodeURIComponent).join("~");
  return `#crear/${bm.slug}?e=${f("e")}&m=${f("m")}&l=${f("l")}`;
}
function bmSync(){ history.replaceState(null,"",bmHash()); }
const bmHas = n => bm.e.includes(n)||bm.m.includes(n)||bm.l.includes(n);

function mkView(slug){
  if (!bm || bm.slug!==slug) bm = bmParse(slug);
  const sum = l => l.reduce((t,n)=>t+(S.items[n].cost||0),0);
  const cols = PH.map(([k,lab,time,key])=>`<div class="ph mk"><button class="phbtn" data-bmph="${key}" aria-pressed="${bm.ph===key}">${lab}<small>${time} · ${souls(sum(bm[key]))}</small></button>
    <div class="chips">${bm[key].map((n,i)=>`<button class="chipi" style="--cat:${CAT[S.items[n].c]}" data-bmrm="${key}:${i}" title="Quitar ${esc(n)}">${ico(n)}<span>${esc(n)}</span><em>×</em></button>`).join("") || '<span class="fine">Pulsa un objeto de abajo para añadirlo aquí.</span>'}</div></div>`).join("");
  const q = bq.trim().toLowerCase();
  const list = Object.keys(S.items).filter(n=>(bcat==="all"||S.items[n].c===bcat)&&(!q||n.toLowerCase().includes(q))).sort((a,b)=>S.items[a].cost-S.items[b].cost||a.localeCompare(b));
  const hopts = Object.keys(S.heroes).sort((a,b)=>H(a).name.localeCompare(H(b).name)).map(k=>`<option value="${k}" ${k===slug?'selected':''}>${esc(H(k).name)}</option>`).join("");
  const total = sum(bm.e)+sum(bm.m)+sum(bm.l);
  return `<section class="wrap">
    <div class="sh"><h2>Crea tu build</h2><p>Elige objetos por fase y comparte el enlace: la build va dentro de la URL</p></div>
    <div class="mkbar">${img(slug)}<label>Héroe<select id="mk-h">${hopts}</select></label>
      <div class="mkbtns"><button class="btn" data-bmload="pop">Cargar la más comprada</button>${S.zbuilds[slug]?'<button class="btn" data-bmload="zok">Cargar la de zok3r</button>':''}<button class="btn" data-bmload="clear">Vaciar</button><button class="btn pri" id="bm-copy">Copiar enlace</button></div>
      <span class="fine" id="bm-msg" role="status">Total: ${total.toLocaleString("es-ES")} almas</span></div>
    <div class="phases">${cols}</div>
    <div class="blk"><h3>Añadir a ${PH.find(p=>p[3]===bm.ph)[1].toLowerCase()}</h3>
      <div class="filters"><input id="bq" type="search" placeholder="Buscar objeto…" value="${esc(bq)}" aria-label="Buscar objeto">${catChips("bcat",bcat)}</div>
      <div class="pgrid">${list.map(n=>`<button class="pick" style="--cat:${CAT[S.items[n].c]}" data-bmadd="${esc(n)}" ${bmHas(n)?'disabled':''} title="${esc(n)}">${ico(n)}<span>${esc(n)}</span><em>${S.items[n].cost?souls(S.items[n].cost):''}</em></button>`).join("") || '<p class="fine">Ningún objeto coincide.</p>'}</div></div>
  </section>`;
}

// --- global search ---
function gsFill(){
  const inp = $("#gs"), box = $("#gsr"); if (!inp||!box) return;
  const q = inp.value.trim().toLowerCase();
  if (!q){ box.hidden = true; box.innerHTML = ""; return; }
  const hs = Object.keys(S.heroes).filter(s=>H(s).name.toLowerCase().includes(q)).slice(0,6);
  const is = Object.keys(S.items).filter(n=>n.toLowerCase().includes(q)).slice(0,8);
  box.innerHTML = hs.map(s=>`<a href="#h-${s}">${img(s)}<span>${esc(H(s).name)}</span><small>Héroe · ${tierOf(s)}</small></a>`).join("")
    + is.map(n=>`<a href="#objeto/${islug(n)}">${ico(n)}<span>${esc(n)}</span><small>${CATN[S.items[n].c]}</small></a>`).join("")
    || '<p class="fine" style="padding:10px 12px;margin:0">Sin resultados</p>';
  box.hidden = false;
}

function footer(){
  return `<footer><div class="wrap"><span>Tier list y notas: zok3r · <a href="https://twitch.tv/zok3r" target="_blank" rel="noopener">twitch.tv/zok3r</a></span>
  <span>Winrates, pick rates y objetos con mejor winrate: ${SRC()} (${scopeTxt()}, consultado ${fmtDate(S.stats.date)}). Objetos más comprados, orden de habilidades y líneas difíciles: <a href="https://deadlocktiers.com/" target="_blank" rel="noopener">deadlocktiers.com</a> (ranked, datos a ${fmtDate(S.meta.dataDate)}). Nombres de objetos y habilidades en inglés, como en el cliente original.</span>
  <span>Proyecto de fans, sin relación con Valve.</span></div></footer>`;
}

function edbar(){
  if (!canWrite) return "";
  if (!edit) return `<div class="edbar"><button class="btn pri" id="ed-on">Editar web</button></div>`;
  return `<div class="edbar"><span class="edmsg" id="edmsg">${dirty?'Cambios sin publicar':'Modo edición: pulsa un héroe para moverlo o renombrarlo.'}</span>
    <button class="btn" id="ed-off">Salir</button><button class="btn pri" id="ed-pub" ${dirty?'':'disabled'}>Publicar cambios</button></div>`;
}

function popup(){
  if (!popFor) return "";
  const s = popFor, t = tierOf(s);
  const opts = Object.keys(S.heroes).sort((a,b)=>H(a).name.localeCompare(H(b).name)).map(k=>`<option value="${k}" ${k===s?'selected':''}>${esc(H(k).name)}</option>`).join("");
  return `<div class="pop" role="dialog" aria-label="Editar héroe"><h4>${img(s)}${esc(H(s).name)}</h4>
    <div><div style="font-size:12px;color:var(--muted);margin-bottom:6px">Mover a tier</div><div class="tiersel">${TIERS.map(x=>`<button data-move="${x}" style="--tc:${TC[x]}" aria-pressed="${x===t}">${x}</button>`).join("")}</div></div>
    <div style="display:flex;gap:6px"><button class="btn" data-shift="-1">← Antes</button><button class="btn" data-shift="1">Después →</button></div>
    <label>Este retrato es de…<select id="rename">${opts}</select></label>
    <div style="font-size:12px;color:var(--muted)">Al cambiar el nombre se intercambia el retrato con el héroe elegido.</div>
    <button class="btn pri" id="pop-close">Hecho</button></div>`;
}

function render(){
  const r = route();
  const body = r.v==="hero" ? heroView(r.slug) : r.v==="builds" ? buildsView() : r.v==="items" ? itemsView() : r.v==="item" ? itemView(r.name) : r.v==="cmp" ? cmpView(r.a,r.b) : r.v==="mk" ? mkView(r.slug) : r.v==="news" ? newsView() : r.v==="wr" ? wrView() : r.v==="coach" ? coachView() : tierView();
  document.getElementById("app").innerHTML = header(r) + `<main>${body}</main>` + footer() + edbar() + popup();
  document.title = r.v==="hero" ? `${H(r.slug).name} · Zok3r Deadlock Meta` : r.v==="item" ? `${r.name} · Zok3r Deadlock Meta` : "Zok3r Deadlock Meta";
}

function markDirty(){ dirty = true; }
function swapPortrait(a,b){
  // the portrait at slug a actually belongs to b: swap images and tier positions so each name keeps the right face
  [S.img[a],S.img[b]] = [S.img[b],S.img[a]];
  const pa = TIERS.map(t=>[t,S.tiers[t].indexOf(a)]).find(x=>x[1]>=0), pb = TIERS.map(t=>[t,S.tiers[t].indexOf(b)]).find(x=>x[1]>=0);
  if (pa&&pb){ S.tiers[pa[0]][pa[1]] = b; S.tiers[pb[0]][pb[1]] = a; }
  S.flags = S.flags.filter(x=>x!==a && x!==b);
}

function rerender(id){
  const el = id && $("#"+id), pos = el && el.selectionStart, y = window.scrollY;
  render(); window.scrollTo(0,y);
  const n = id && $("#"+id); if (n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(_){} }
}
document.addEventListener("click", e=>{
  if (!e.target.closest(".gs")){ const g=$("#gsr"); if (g) g.hidden = true; }
  const t = e.target.closest("button,a"); if (!t) return;
  const D = t.dataset;
  if (D.icat){ icat = D.icat; rerender(); return; }
  if (D.itier){ itier = +D.itier; rerender(); return; }
  if (D.bcat){ bcat = D.bcat; rerender(); return; }
  if (D.bmph){ bm.ph = D.bmph; rerender(); return; }
  if (D.bmadd){ if (!bmHas(D.bmadd)){ bm[bm.ph].push(D.bmadd); bmSync(); rerender(); } return; }
  if (D.bmrm){ const [k,i] = D.bmrm.split(":"); bm[k].splice(+i,1); bmSync(); rerender(); return; }
  if (D.bmload){
    const src = D.bmload==="clear" ? {early:[],mid:[],late:[]} : D.bmload==="zok" ? S.zbuilds[bm.slug] : H(bm.slug);
    bm.e = [...(src.early||[])]; bm.m = [...(src.mid||[])]; bm.l = [...(src.late||[])]; bmSync(); rerender(); return; }
  if (t.id==="bm-copy"){
    const msg = $("#bm-msg"), url = location.href;
    const done = ok => { if (msg) msg.textContent = ok ? "Enlace copiado ✓" : "No se pudo copiar; cópialo de la barra de direcciones."; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(()=>done(true),()=>done(false)); else done(false);
    return; }
  if (t.dataset.hero){ if (edit){ popFor = t.dataset.hero; render(); } else { location.hash = "h-"+t.dataset.hero; } return; }
  if (t.dataset.sort){ const k=t.dataset.sort; wrSort = wrSort.k===k ? {k,dir:-wrSort.dir} : {k,dir: k==="name"||k==="tier" ? 1 : -1}; render(); return; }
  if (t.id==="zb-del"){ const f=$("#zform"); delete S.zbuilds[f.dataset.slug]; markDirty(); render(); return; }
  if (t.dataset.role){ filterRole = t.dataset.role; render(); return; }
  if (t.id==="ed-on"){ edit = true; render(); return; }
  if (t.id==="ed-off"){ edit = false; popFor = null; render(); return; }
  if (t.id==="ed-pub"){ publish(); return; }
  if (t.id==="pop-close"){ S.flags = S.flags.filter(x=>x!==popFor); popFor = null; markDirty(); render(); return; }
  if (t.dataset.move && popFor){ TIERS.forEach(x=>S.tiers[x]=S.tiers[x].filter(s=>s!==popFor)); S.tiers[t.dataset.move].push(popFor); markDirty(); render(); return; }
  if (t.dataset.shift && popFor){ const arr = S.tiers[tierOf(popFor)], i = arr.indexOf(popFor), j = i + +t.dataset.shift; if (j>=0 && j<arr.length){ [arr[i],arr[j]]=[arr[j],arr[i]]; markDirty(); render(); } return; }
  if (t.dataset.del){ S.news.splice(+t.dataset.del,1); markDirty(); render(); return; }
});
document.addEventListener("change", e=>{
  if (e.target.id==="isort"){ isort = e.target.value; rerender(); return; }
  if (e.target.id==="mk-h"){ bm = null; location.hash = "crear/"+e.target.value; return; }
  if (e.target.id==="ca" || e.target.id==="cb"){ const a=$("#ca").value, b=$("#cb").value; location.hash = "comparar/"+a+(b?"/"+b:""); return; }
  if (e.target.id==="rename" && popFor && e.target.value!==popFor){ swapPortrait(popFor, e.target.value); popFor = e.target.value; markDirty(); render(); }
});
document.addEventListener("input", e=>{
  if (e.target.id==="q"){ query = e.target.value; rerender("q"); }
  if (e.target.id==="iq"){ iq = e.target.value; rerender("iq"); }
  if (e.target.id==="bq"){ bq = e.target.value; rerender("bq"); }
  if (e.target.id==="gs") gsFill();
  if (e.target.id==="note"){ const s=e.target.dataset.slug; const v=e.target.value.trim(); if (v) S.notes[s]=v; else delete S.notes[s]; if(!dirty){ dirty=true; const b=$("#ed-pub"); if(b) b.disabled=false; const m=$("#edmsg"); if(m) m.textContent="Cambios sin publicar"; } }
});
document.addEventListener("submit", e=>{
  if (e.target.id==="cform"){ e.preventDefault(); S.coaching.price=$("#c-price").value.trim(); S.coaching.per=$("#c-per").value.trim(); S.coaching.url=$("#c-url").value.trim(); markDirty(); render(); return; }
  if (e.target.id==="rbform"){ e.preventDefault(); const slug=e.target.dataset.slug; const name=$("#rb-name").value.trim();
    const num = v => { v=v.trim().replace(/\./g,"").replace(",","."); return v===""||isNaN(+v) ? null : +v; };
    const wr = $("#rb-wr").value.trim().replace(",",".");
    if (!name) delete S.recBuilds[slug]; else S.recBuilds[slug] = {name, author:$("#rb-author").value.trim(), wr: wr===""||isNaN(+wr)?null:+wr, matches: num($("#rb-matches").value), url:$("#rb-url").value.trim()};
    markDirty(); render(); return; }
  if (e.target.id==="zform"){ e.preventDefault();
    const norm = Object.fromEntries(Object.keys(S.items).map(n=>[n.toLowerCase(),n]));
    const read = k => $("#zb-"+k).value.split("\n").map(x=>x.trim()).filter(Boolean).map(x=>norm[x.toLowerCase()]||x);
    const b = {early:read("early"),mid:read("mid"),late:read("late")};
    const unknown = [...b.early,...b.mid,...b.late].filter(x=>!S.items[x]);
    const slug = e.target.dataset.slug;
    if (!b.early.length && !b.mid.length && !b.late.length) delete S.zbuilds[slug]; else S.zbuilds[slug] = b;
    markDirty(); render();
    if (unknown.length){ const w=$("#zb-warn"); if(w) w.textContent = "No reconozco: " + unknown.join(", ") + ". Se guardan igual, pero revisa cómo están escritos."; }
    return; }
  if (e.target.id!=="nform") return; e.preventDefault();
  const n = {date:$("#n-date").value, type:$("#n-type").value, title:$("#n-title").value.trim(), body:$("#n-body").value.trim()};
  const src = $("#n-src").value.trim(); if (src) n.src = src;
  if (!n.title) return; S.news.push(n); markDirty(); render();
});
document.addEventListener("keydown", e=>{
  if (e.target.id!=="gs") return;
  if (e.key==="Escape"){ e.target.value = ""; gsFill(); }
  if (e.key==="Enter"){ const a = $("#gsr a"); if (a){ location.hash = a.getAttribute("href"); e.target.blur(); } }
});
window.addEventListener("hashchange", ()=>{ popFor=null; bm=null; render(); window.scrollTo(0,0); });

const RESET = ":root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}";
function buildDoc(){
  const head = '<title>Zok3r Deadlock Meta</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="stylesheet" href="' + document.querySelector('link[rel=stylesheet]').href + '">\n';
  const now = new Date(); S.meta.updated = now.toISOString().slice(0,10); S.meta.today = S.meta.updated;
  const json = JSON.stringify(S).replace(/</g,"\\u003c");
  const content = head + '<style id="css">' + document.getElementById("css").textContent + '</style>\n<div id="app"></div>\n'
    + '<script type="application/json" id="state">' + json + '<\/script>\n<script id="appjs">' + document.getElementById("appjs").textContent + '<\/script>';
  return '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>' + RESET + '</style></head><body>' + content + '</body></html>';
}
async function publish(){
  const b = $("#ed-pub"), m = $("#edmsg"); if (b) b.disabled = true; if (m) m.textContent = "Publicando…";
  try { await artifactNs.publish(buildDoc()); if (m) m.textContent = "Publicado"; dirty = false; }
  catch(err){
    const code = err && err.code;
    if (code==="conflict"){ if (m) m.textContent = "Había una versión más nueva; recargando."; }
    else if (code==="not_writer"||code==="not_granted"){ canWrite=false; edit=false; render(); }
    else { if (m) m.textContent = "No se pudo publicar ("+(code||"error")+"). Prueba de nuevo en un momento."; if (b) b.disabled=false; }
  }
}

render();
(async ()=>{
  try {
    if (!window.claude || !window.claude.use) return;
    const [user, art] = await Promise.all([window.claude.use("user"), window.claude.use("artifact")]);
    const owner = user ? (await user.isOwner() || await user.canEdit()) : false;
    if (owner && art){ artifactNs = art; canWrite = true; render(); }
  } catch(_){}
})();
})();
