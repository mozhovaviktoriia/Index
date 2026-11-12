// Чек-лист подопечного: как выглядят ответы того, кому ты даришь подарок.

// Помощники для карточек
const sec=(t,b,c)=>b?'<div class="card '+(c||"")+'"><h2>'+t+'</h2>'+b+'</div>':"";
const chipsH=a=>a.length?'<div class="chips">'+a.map(c=>'<span class="chip">'+esc(c)+'</span>').join("")+'</div>':"";
const plain=a=>a.length?'<ul>'+a.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>':"";

// Рисует чек-лист подопечного
function renderList(){
  const el=$("v-list");
  if(!target){
    el.innerHTML='<h1>Чек-лист</h1><div class="card"><p>Сначала проведи жеребьёвку и нажми «Открыть» у любой пары.</p></div>';
    return;
  }
  const t=target,f=t.f||{},yn=t.yn||{},ch=t.chips||{};
  const by=v=>YN.filter(n=>yn[n]===v);
  const wish=by("y").concat(lines(f.want));
  const no=by("n").concat(lines(f.no));
  const wl=wish.length?'<ul>'+wish.map((x,i)=>'<li><label><input type="checkbox" data-k="'+i+'"'+(ticks[i]?" checked":"")+'><span class="'+(ticks[i]?"done":"")+'">'+esc(x)+'</span></label></li>').join("")+'</ul>':"";
  let h='<h1>Ты даришь подарок: '+esc(t.name)+'</h1><p class="sub">Никому не рассказывай, кому ты даришь.</p>';
  const al=(ch.allergy||[]).filter(x=>x!=="Нет аллергий");
  const alT=f.allergy&&!/^нет\.?$/i.test(f.allergy)?"<p>"+esc(f.allergy)+"</p>":"";
  h+=sec("Важно: аллергии и ограничения",chipsH(al)+alT,"warn");
  h+=sec("Хочу",wl+(wl?'<div class="hint">Отмечай идеи, которые уже рассмотрены</div>':""));
  h+=sec("Лучше не надо",plain(no));
  h+=sec("Можно",chipsH(by("m")));
  GROUPS.filter(g=>g.k!=="allergy").forEach(g=>{
    h+=sec(g.t,chipsH(ch[g.k]||[]));
  });
  h+=sec("Любимые фильмы, сериалы, игры, книги",f.fav?"<p>"+esc(f.fav)+"</p>":"");
  h+=sec("Подсказки для Санты",f.extra?"<p>"+esc(f.extra)+"</p>":"");
  const sz=SIZES.concat([["age","Возраст"]]).filter(s=>f[s[0]]).map(s=>s[1]+": "+f[s[0]]);
  if(f.surprise)sz.push("Сюрпризы: "+f.surprise+" из 5 (1 — спроси меня, 5 — удиви)");
  h+=sec("О себе",plain(sz));
  el.innerHTML=h;
  el.querySelectorAll("input[data-k]").forEach(c=>c.onchange=()=>{
    ticks[c.dataset.k]=c.checked;
    c.nextElementSibling.className=c.checked?"done":"";
  });
}