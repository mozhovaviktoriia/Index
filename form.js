// Анкета: рисуем кнопки и поля, собираем ответы, показываем экран проверки и отправляем на сервер.

// Поле ввода с подписью
function field(id,l){
  return '<div class="f"><label for="f-'+id+'">'+l+'</label><input id="f-'+id+'" autocomplete="off"></div>';
}

// Рисует всю анкету
function renderForm(){
  let h='<h1>Анкета для Тайного Санты</h1><p class="sub">Нажимай на кнопки и пиши своё. Обязательно только имя.</p>'+'<div class="fields">'+field("name","Имя или никнейм")+field("pin","Секретное слово: по нему ты откроешь свою пару")+field("age","Возраст (по желанию)")+'</div>';
  h+='<h2>Что насчёт этого?</h2><p class="hint">«Хочу» — будет приятно, «Нет» — лучше не надо, «Можно» — мне всё равно.</p>';
  h+='<div class="yn-grid">';
  YN.forEach(n=>{
    h+='<div class="yn"><span>'+n+'</span><div class="tri"><button class="opt" data-yn="'+n+'" data-v="y">Хочу</button><button class="opt" data-yn="'+n+'" data-v="n">Нет</button><button class="opt" data-yn="'+n+'" data-v="m">Можно</button></div></div>';
  });
  h+='</div>';
  GROUPS.forEach(g=>{
    h+='<h2>'+g.t+'</h2><div class="chips">'+g.o.map(o=>'<button class="opt" data-chip="'+g.k+'" data-v="'+o+'">'+o+'</button>').join("")+'</div><input id="c-'+g.k+'" placeholder="Своё: через запятую">';
  });
  h+='<h2>Любишь сюрпризы?</h2><input id="f-surprise" type="range" min="1" max="5" value="3"><div class="pair hint"><span>Спроси меня</span><span>Удиви</span></div>';
  h+='<h2>Немного о себе</h2><div class="fields">'+SIZES.map(s=>field(s[0],s[1])).join("")+'</div>';
  h+='<h2>Своими словами</h2>'+TEXT.map(t=>'<label for="f-'+t[0]+'">'+t[1]+'</label><textarea id="f-'+t[0]+'"></textarea>').join("");
  h+='<div class="row"><button id="make">Проверить анкету</button></div><div id="made"></div>';
  $("v-form").innerHTML=h;
}

// Нажата ли кнопка-вариант
function on(b){
  const d=b.dataset;
  if(d.pair!=null)return me.pairs[d.pair]===d.v;
  if(d.yn!=null)return me.yn[d.yn]===d.v;
  return (me.chips[d.chip]||[]).indexOf(d.v)>-1;
}

// Подсвечивает выбранные кнопки
function sync(){
  document.querySelectorAll("#v-form .opt").forEach(b=>b.setAttribute("aria-pressed",on(b)));
}

// Нажатие на кнопку-вариант
function toggle(b){
  const d=b.dataset;
  if(d.pair!=null){
    if(me.pairs[d.pair]===d.v)delete me.pairs[d.pair];else me.pairs[d.pair]=d.v;
  }
  else if(d.yn!=null){
    if(me.yn[d.yn]===d.v)delete me.yn[d.yn];else me.yn[d.yn]=d.v;
  }
  else{
    const a=me.chips[d.chip]=me.chips[d.chip]||[],i=a.indexOf(d.v);
    if(i>-1)a.splice(i,1);else a.push(d.v);
  }
  sync();
}

// Разноцветные искорки при выборе
function burst(b){
  if(matchMedia("(prefers-reduced-motion:reduce)").matches)return;
  const r=b.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,cols=["#FF5CA8","#3DE0FF","#FFC247","#B8FF5C"];
  for(let i=0;i<9;i++){
    const p=document.createElement("i"),dx=(Math.random()-.5)*120,dy=-30-Math.random()*40;
    p.style.cssText="position:fixed;left:"+cx+"px;top:"+cy+"px;width:7px;height:7px;border-radius:50%;pointer-events:none;z-index:50;background:"+cols[i%4];
    document.body.appendChild(p);
    p.animate([{transform:"translate(0,0)",opacity:1},{transform:"translate("+dx*.6+"px,"+dy+"px)",opacity:1,offset:.4},{transform:"translate("+dx+"px,"+(dy+90)+"px) scale(.3)",opacity:0}],{duration:650+Math.random()*250,easing:"ease-out"}).onfinish=()=>p.remove();
  }
}

// Экран «Проверь перед отправкой». Кнопка «Сохранить анкету» отправляет данные на сервер
function openCheck(){
  const d=collect();
  if(!d.name){
    $("made").innerHTML='<p class="err">Напиши своё имя</p>';
    return;
  }
  const keep=target;
  target=d;
  renderList();
  target=keep;
  const body=$("v-list").innerHTML.replace(/<h1>.*?<\/h1><p class="sub">.*?<\/p>/,"");
  const n=Object.keys(d.yn).length+Object.values(d.chips).reduce((s,a)=>s+a.length,0);
  const al=(d.chips.allergy||[]).filter(x=>x!=="Нет аллергий").length||(d.f.allergy&&!/^нет\.?$/i.test(d.f.allergy));
  let h='<h1>Проверь перед отправкой</h1><p class="sub">Так Санта увидит твой чек-лист, <b>'+esc(d.name)+'</b>. Заполнено пунктов: '+n+'.</p>'+body;
  h+='<div class="card"><h2>Ещё раз по важному</h2>';
  if(al)h+='<p>Аллергии и ограничения отмечены. Ничего не забыто?</p>';
  else h+='<p>Про аллергии ничего не отмечено. Точно нет аллергий, а ещё продуктов, которые ты не ешь?</p><div class="pr"><button class="opt" id="al-ok" aria-pressed="false">Да, ничего нет</button><button class="opt" id="al-back">Добавлю</button></div>';
  h+='<label style="display:flex;gap:10px;align-items:center;margin:14px 0 0"><input id="sure" type="checkbox" style="width:22px;height:22px;accent-color:var(--pink)">Всё выше верно</label>';
  h+='<div class="row"><button id="send" disabled>Сохранить анкету</button><button class="alt" id="fix">Вернуться и поправить</button></div></div>';
  $("v-check").innerHTML=h;
  let okAl=!!al;
  const upd=()=>{
    $("send").disabled=!($("sure").checked&&okAl);
  };
  if($("al-ok")){
    $("al-ok").onclick=()=>{
      okAl=true;
      $("al-ok").setAttribute("aria-pressed","true");
      upd();
    };
    $("al-back").onclick=()=>{
      show("form");
      setTimeout(()=>{
        const g=document.querySelector('[data-chip="allergy"]');
        if(g)g.scrollIntoView({block:"center"});
      },60);
    };
  }
  $("sure").onchange=upd;
  $("fix").onclick=()=>show("form");
  $("send").onclick=async()=>{
    const b=$("send");
    b.disabled=true;
    const old=b.textContent;
    b.textContent="Сохраняю…";
    const res=await api("register",{name:d.name,pin:$("f-pin").value.trim(),data:{yn:d.yn,chips:d.chips,f:d.f}});
    if(!res.ok){
      b.disabled=false;
      b.textContent=old;
      showErr(res,true);
      return;
    }
    clearDraft();
    $("v-check").innerHTML='<h1>Анкета сохранена!</h1><div class="card"><p>'+(res.updated?"Анкету обновили.":"Ты в списке участников.")+' Когда организатор проведёт жеребьёвку, открой сайт, нажми «Узнать, для кого я Санта» и введи своё имя и секретное слово.</p><div class="row"><button id="rv2">Узнать, для кого я Санта</button></div></div>';
    $("rv2").onclick=gotoReveal;
    window.scrollTo(0,0);
    modal("Готово!",'<ol class="steps"><li>Твоя анкета сохранена на сайте.</li><li>Организатор проведёт жеребьёвку.</li><li>Вернись на сайт и нажми «Узнать, для кого я Санта».</li><li>Введи имя и секретное слово. Запомни его!</li></ol>');
  };
  show("check");
}

// Собирает ответы из анкеты в один объект
function collect(){
  const f={};
  ["age"].concat(SIZES.map(s=>s[0]),TEXT.map(t=>t[0])).forEach(k=>{
    const v=$("f-"+k).value.trim();
    if(v)f[k]=v;
  });
  const chips={};
  GROUPS.forEach(g=>{
    const a=(me.chips[g.k]||[]).concat(lines($("c-"+g.k).value));
    if(a.length)chips[g.k]=a;
  });
  f.surprise=$("f-surprise").value;
  return {name:$("f-name").value.trim(),pairs:me.pairs,yn:me.yn,chips:chips,f:f};
}