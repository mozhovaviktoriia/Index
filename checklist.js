// Чек-лист подопечного: как выглядят ответы того, кому ты даришь подарок.

// Помощники для карточек
const sec=(t,b,c)=>b?'<div class="card '+(c||"")+'"><h2>'+t+'</h2>'+b+'</div>':"";
const ynText=x=>YN.includes(x)?formatYNLabel(x):esc(x);
const chipsH=a=>{
  const unique=Array.from(new Set(a));
  return unique.length?'<div class="chips">'+unique.map(c=>'<span class="chip">'+ynText(c)+'</span>').join("")+'</div>':"";
};
const plain=a=>a.length?'<ul>'+a.map(x=>'<li>'+ynText(x)+'</li>').join("")+'</ul>':"";

// Рисует чек-лист подопечного
function renderList(){
  const el=$("v-list");
  if(!target){
    el.innerHTML='<h1>Чек-лист</h1><div class="card"><p>Сначала проведи жеребьёвку и нажми «Открыть» у любой пары.</p></div>';
    return;
  }
  const t=target,f=t.f||{},yn=normalizeYN(t.yn),ch=t.chips||{};
  const by=v=>YN.filter(n=>yn[n]===v);
  const wish=by("y").concat(lines(f.want));
  const no=by("n").concat(lines(f.no));
  const wl=wish.length?'<ul>'+wish.map((x,i)=>'<li><label><input type="checkbox" data-k="'+i+'"'+(ticks[i]?" checked":"")+'><span class="'+(ticks[i]?"done":"")+'">'+ynText(x)+'</span></label></li>').join("")+'</ul>':"";
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
  renderChat();
}

// Анонимный чат участников одной пары.
let chatLoading=false,chatDirection="giver";

function renderChat(){
  if(!chatAuth)return;
  const el=$("v-list");
  chatDirection="giver";
  el.insertAdjacentHTML("beforeend",'<div class="card chat-card"><h2>Уточнить подарок</h2><p class="sub">Переписки раздельные и анонимные.</p><div class="chat-tabs" role="tablist"><button class="chat-tab" type="button" role="tab" data-direction="giver" aria-selected="true">Тому, кому дарю</button><button class="chat-tab" type="button" role="tab" data-direction="recipient" aria-selected="false">Кто дарит мне</button></div><div id="chat-status" class="sub" role="status" aria-live="polite">Загружаю сообщения…</div><div id="chat-messages" class="chat-messages" aria-live="polite"></div><label for="chat-input">Сообщение</label><div class="chat-compose"><textarea id="chat-input" maxlength="1000" placeholder="Напиши вопрос или ответ"></textarea><button id="chat-send">Отправить</button></div><p class="hint">До 1000 символов. Enter + Ctrl отправляет сообщение.</p></div>');
  document.querySelectorAll(".chat-tab").forEach(button=>button.onclick=()=>selectChat(button.dataset.direction));
  $("chat-send").onclick=sendChatMessage;
  $("chat-input").addEventListener("keydown",e=>{
    if(e.key==="Enter"&&e.ctrlKey){
      e.preventDefault();
      sendChatMessage();
    }
  });
  loadChat();
}

function selectChat(direction){
  if(direction===chatDirection)return;
  chatDirection=direction;
  document.querySelectorAll(".chat-tab").forEach(button=>{
    button.setAttribute("aria-selected",button.dataset.direction===direction?"true":"false");
  });
  $("chat-messages").innerHTML="";
  $("chat-status").textContent="Загружаю сообщения…";
  loadChat();
}

function renderChatMessages(messages){
  const list=$("chat-messages");
  if(!list)return;
  if(!messages.length){
    list.innerHTML='<p class="sub">Пока сообщений нет. Можно начать с вопроса о подарке.</p>';
    return;
  }
  const other=chatDirection==="giver"?"Получатель":"Санта";
  list.innerHTML=messages.map(message=>'<div class="chat-message'+(message.fromYou?" mine":"")+'"><strong>'+(message.fromYou?"Ты":other)+'</strong><p>'+esc(message.text)+'</p><time>'+esc(message.sentAt)+'</time></div>').join("");
  list.scrollTop=list.scrollHeight;
}

async function loadChat(){
  if(!chatAuth||chatLoading||!$("chat-status"))return;
  const auth=chatAuth;
  const direction=chatDirection;
  chatLoading=true;
  const status=$("chat-status");
  try{
    const res=await api("chat_load",{name:auth.name,pin:auth.pin,direction:direction});
    if(chatAuth!==auth||chatDirection!==direction)return;
    if(!res.ok){
      status.textContent="Не удалось загрузить чат: "+(res.error||"попробуй обновить страницу.");
      return;
    }
    chatAuth.role=res.role;
    renderChatMessages(res.messages||[]);
    status.textContent="";
  }finally{
    chatLoading=false;
    if(chatAuth&&(chatAuth!==auth||chatDirection!==direction)&&!$("v-list").classList.contains("hide"))loadChat();
  }
}

async function sendChatMessage(){
  const input=$("chat-input"),button=$("chat-send"),status=$("chat-status");
  if(!chatAuth||!input||!button||button.disabled)return;
  const auth=chatAuth;
  const direction=chatDirection;
  const message=input.value.trim();
  if(!message){
    status.textContent="Напиши сообщение перед отправкой.";
    input.focus();
    return;
  }
  if(message.length>1000){
    status.textContent="Сообщение должно быть не длиннее 1000 символов.";
    return;
  }
  button.disabled=true;
  status.textContent="Отправляю…";
  const res=await api("chat_send",{name:auth.name,pin:auth.pin,direction:direction,message:message});
  button.disabled=false;
  if(chatAuth!==auth||chatDirection!==direction)return;
  if(!res.ok){
    status.textContent="Не удалось отправить сообщение: "+(res.error||"попробуй ещё раз.");
    return;
  }
  input.value="";
  chatAuth.role=res.role;
  renderChatMessages(res.messages||[]);
  status.textContent="";
}

setInterval(()=>{
  if(chatAuth&&!document.hidden&&!$("v-list").classList.contains("hide"))loadChat();
},10000);