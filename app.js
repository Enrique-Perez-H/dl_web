(async function(){
const S = await (await fetch('data.json')).json();
const TIERS = ["S+","S","A","B","C","F"];
const TC = {"S+":"var(--t-splus)","S":"var(--t-s)","A":"var(--t-a)","B":"var(--t-b)","C":"var(--t-c)","F":"var(--t-f)"};
const CAT = {w:"var(--weapon)",v:"var(--vital)",s:"var(--spirit)"};
const CATN = {w:"Arma",v:"Vitalidad",s:"Espíritu"};
const TYPES = {parche:["Parche","var(--t-b)"],heroe:["Héroe nuevo","var(--t-splus)"],discord:["Discord","var(--spirit)"],ranked:["Ranked","var(--t-s)"]};
const MES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
let wrSort = {k:"wr",dir:-1};
let edit = false, canWrite = false, dirty = false, filterRole = "Todos", query = "", popFor = null, artifactNs = null;

const $ = (s,el=document)=>el.querySelector(s);
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const tierOf = slug => TIERS.find(t => (S.tiers[t]||[]).includes(slug)) || "—";
const H = slug => S.heroes[slug];
const img = (slug,cls="") => `<img src="${S.img[slug]}" alt="" width="72" height="72" ${cls}>`;
const fmtDate = d => { const [y,m,dd] = d.split("-"); return `${+dd} ${MES[+m-1]} ${y}`; };
const souls = n => n>=1000 ? (n/1000).toLocaleString("es-ES",{maximumFractionDigits:1})+"k" : String(n);

function route(){
  const h = (location.hash||"").slice(1);
  if (h.startsWith("h-") && S.heroes[h.slice(2)]) return {v:"hero",slug:h.slice(2)};
  if (h==="builds") return {v:"builds"};
  if (h==="noticias") return {v:"news"};
  if (h==="winrates") return {v:"wr"};
  if (h==="coaching") return {v:"coach"};
  return {v:"tier"};
}

function header(r){
  const cur = r.v==="hero" ? "builds" : r.v;
  const a = (id,href,txt)=>`<a href="#${href}" ${cur===id?'aria-current="page"':''}>${txt}</a>`;
  return `<header class="top"><div class="wrap">
    <a class="brand" href="#tier"><b>zok<span>3</span>r</b><small>Deadlock meta</small></a>
    <nav class="tabs" aria-label="Secciones">${a("tier","tier","Tier list")}${a("builds","builds","Builds")}${a("wr","winrates","Winrates")}${a("news","noticias","Noticias")}<a href="#coaching" class="cta-tab" ${cur==="coach"?'aria-current="page"':''}>Coaching</a></nav>
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
    <div class="sh"><h2>Winrates</h2><p>Fuente: <a href="${st.src}" target="_blank" rel="noopener">statlocker.gg</a> · parche actual, todos los modos · consultado ${fmtDate(st.date)}</p></div>
    <div class="kpis">
      <div><span class="k">Mejor winrate</span><b>${esc(top[0].name)}</b><span class="v">${pct(top[0].wr)}</span></div>
      <div><span class="k">Peor winrate</span><b>${esc(top[top.length-1].name)}</b><span class="v">${pct(top[top.length-1].wr)}</span></div>
      <div><span class="k">Por encima del 54%</span><b>${over} héroes</b><span class="v">S según statlocker</span></div>
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
    <p class="fine">Winrate: % de partidas ganadas con el héroe. Pick rate: % de partidas en las que aparece. La barra de winrate parte del 50%; cada punto por encima o por debajo alarga la barra. Partidas: total del héroe en su página de statlocker; vacío cuando la página no lo muestra. </p>
    <p class="tnote"><b>Nota:</b> la tier list es subjetiva y está hecha por mí en torno a rankeds de alto nivel. Los personajes pueden cambiar de tier en función de tu rango.</p>
  </section>`;
}

function itemLi(n){
  const it = S.items[n] || {c:"s",cost:0};
  return `<li style="--cat:${CAT[it.c]}"><i title="${CATN[it.c]}"></i><span>${esc(n)}</span><em>${it.cost?souls(it.cost):""}</em></li>`;
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
      <div class="wr"><div class="n">${pct(S.stats.hero[slug].wr)}</div><div class="l">Winrate · pick ${pct(S.stats.hero[slug].pick)}${S.stats.hero[slug].games?` · ${kfmt(S.stats.hero[slug].games)} partidas`:''}<br><a href="${S.stats.src}" target="_blank" rel="noopener">statlocker.gg</a></div></div>
    </div>
    <div class="plan"><p class="k">Plan de juego</p><p>${esc(h.plan)}</p>
      ${edit ? `<div class="note"><label class="k" for="note">Nota de zok3r</label><textarea id="note" data-slug="${slug}" placeholder="Tu consejo personal para este héroe…">${esc(note)}</textarea></div>` : (note?`<div class="note"><p class="k">Nota de zok3r</p><p>${esc(note)}</p></div>`:'')}
    </div>
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
      ${best.length ? `<div class="best">${best.map(([n,w])=>`<div class="bi" style="--cat:${CAT[(S.items[n]||{c:'s'}).c]}"><i></i><span>${esc(n)}</span><b>${pct(w)}</b></div>`).join("")}</div>
      <p class="fine">De <a href="${S.stats.src.replace('standard-winrates','hero-library/')+slug.replace('mo-krill','mo-&-krill')}" target="_blank" rel="noopener">statlocker.gg</a>, entre objetos comprados en al menos el 5% de las partidas del héroe. Casi todos son de final: quien llega a comprarlos suele ir ganando ya, así que indican qué cerrar, no qué comprar primero.</p>` : '<p class="fine">statlocker no muestra objetos para este héroe ahora mismo.</p>'}</div>
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

function footer(){
  return `<footer><div class="wrap"><span>Tier list y notas: zok3r · <a href="https://twitch.tv/zok3r" target="_blank" rel="noopener">twitch.tv/zok3r</a></span>
  <span>Winrates, pick rates y objetos con mejor winrate: <a href="https://statlocker.gg/heroes/standard-winrates" target="_blank" rel="noopener">statlocker.gg</a> (consultado ${fmtDate(S.stats.date)}). Objetos más comprados, orden de habilidades y líneas difíciles: <a href="https://deadlocktiers.com/" target="_blank" rel="noopener">deadlocktiers.com</a> (ranked, datos a ${fmtDate(S.meta.dataDate)}). Nombres de objetos y habilidades en inglés, como en el cliente original.</span>
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
  const body = r.v==="hero" ? heroView(r.slug) : r.v==="builds" ? buildsView() : r.v==="news" ? newsView() : r.v==="wr" ? wrView() : r.v==="coach" ? coachView() : tierView();
  document.getElementById("app").innerHTML = header(r) + `<main>${body}</main>` + footer() + edbar() + popup();
  document.title = r.v==="hero" ? `${H(r.slug).name} · Zok3r Deadlock Meta` : "Zok3r Deadlock Meta";
}

function markDirty(){ dirty = true; }
function swapPortrait(a,b){
  // the portrait at slug a actually belongs to b: swap images and tier positions so each name keeps the right face
  [S.img[a],S.img[b]] = [S.img[b],S.img[a]];
  const pa = TIERS.map(t=>[t,S.tiers[t].indexOf(a)]).find(x=>x[1]>=0), pb = TIERS.map(t=>[t,S.tiers[t].indexOf(b)]).find(x=>x[1]>=0);
  if (pa&&pb){ S.tiers[pa[0]][pa[1]] = b; S.tiers[pb[0]][pb[1]] = a; }
  S.flags = S.flags.filter(x=>x!==a && x!==b);
}

document.addEventListener("click", e=>{
  const t = e.target.closest("button,a"); if (!t) return;
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
  if (e.target.id==="rename" && popFor && e.target.value!==popFor){ swapPortrait(popFor, e.target.value); popFor = e.target.value; markDirty(); render(); }
});
document.addEventListener("input", e=>{
  if (e.target.id==="q"){ query = e.target.value; const pos = e.target.selectionStart; render(); const q=$("#q"); q.focus(); try{q.setSelectionRange(pos,pos)}catch(_){} }
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
window.addEventListener("hashchange", ()=>{ popFor=null; render(); window.scrollTo(0,0); });

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
