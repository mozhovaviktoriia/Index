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
let chatLoading=false,chatDirection="giver",chatReady=false,chatAliasPending=false;

function renderChatSecretNickname(nickname){
  const el=$("chat-secret-nickname");
  if(!el)return;
  if(!nickname){
    el.textContent="";
    el.classList.add("hide");
    return;
  }
  el.textContent="Твоя секретная кличка для этой переписки: "+nickname+". Она обновится при следующем входе.";
  el.classList.remove("hide");
}

function renderChat(){
  if(!chatAuth)return;
  const el=$("v-list");
  chatDirection="giver";
  chatReady=false;
  chatAliasPending=true;
  el.insertAdjacentHTML("beforeend",'<div class="card chat-card"><h2>Уточнить подарок</h2><p class="sub">Переписки раздельные и анонимные.</p><p class="hint">Уведомления о сообщениях приходят в общий чат Telegram.</p><div class="chat-tabs" role="tablist"><button class="chat-tab" type="button" role="tab" data-direction="giver" aria-selected="true">Тому, кому дарю</button><button class="chat-tab" type="button" role="tab" data-direction="recipient" aria-selected="false">Кто дарит мне</button></div><div id="chat-secret-nickname" class="chat-secret-nickname hide" role="status" aria-live="polite"></div><div id="chat-status" class="sub" role="status" aria-live="polite">Загружаю сообщения…</div><div id="chat-messages" class="chat-messages" aria-live="polite"></div><label for="chat-input">Сообщение</label><div class="chat-compose"><textarea id="chat-input" maxlength="1000" placeholder="Напиши вопрос или ответ"></textarea><button id="chat-send" disabled>Отправить</button></div><p class="hint">До 1000 символов. Enter + Ctrl отправляет сообщение.</p></div>');
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
  chatAliasPending=true;
  chatReady=false;
  $("chat-send").disabled=true;
  renderChatSecretNickname(null);
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
  list.innerHTML=messages.map(message=>{
    const actions=message.fromYou?'<div class="chat-actions"><button type="button" class="chat-action" data-chat-edit="'+(+message.id)+'">Изменить</button><button type="button" class="chat-action" data-chat-delete="'+(+message.id)+'">Удалить</button></div>':"";
    return '<div class="chat-message'+(message.fromYou?" mine":"")+'"><strong>'+(message.fromYou?"Ты":other)+'</strong>'+(message.edited?'<small class="chat-edited">изменено</small>':"")+'<p>'+esc(message.text)+'</p>'+actions+'</div>';
  }).join("");
  list.scrollTop=list.scrollHeight;
  list.querySelectorAll("button[data-chat-edit]").forEach(button=>button.onclick=()=>{
    const text=button.closest(".chat-message").querySelector("p").textContent;
    editChatMessage(+button.dataset.chatEdit,text);
  });
  list.querySelectorAll("button[data-chat-delete]").forEach(button=>button.onclick=()=>confirmChatMessageDelete(+button.dataset.chatDelete));
}

function editChatMessage(id,text){
  const d=$("dlg"),auth=chatAuth,direction=chatDirection;
  d.innerHTML='<h2>Редактировать сообщение</h2><label for="chat-edit-text">Текст сообщения</label><textarea id="chat-edit-text" maxlength="1000"></textarea><p id="chat-edit-error" class="err" role="status"></p><div class="row"><button id="chat-edit-save">Сохранить</button><button type="button" class="alt" id="chat-edit-cancel">Отмена</button></div>';
  $("chat-edit-text").value=text;
  $("chat-edit-cancel").onclick=()=>d.close();
  $("chat-edit-save").onclick=async()=>{
    const message=$("chat-edit-text").value.trim(),button=$("chat-edit-save");
    if(!message){
      $("chat-edit-error").textContent="Сообщение не может быть пустым.";
      return;
    }
    button.disabled=true;
    const res=await api("chat_edit",{name:auth.name,pin:auth.pin,direction:direction,id:id,message:message});
    button.disabled=false;
    if(!res.ok){
      $("chat-edit-error").textContent=res.error||"Не удалось изменить сообщение.";
      return;
    }
    if(chatAuth!==auth||chatDirection!==direction)return;
    d.close();
    chatAuth.role=res.role;
    renderChatMessages(res.messages||[]);
    $("chat-status").textContent="";
  };
  d.showModal();
}

function confirmChatMessageDelete(id){
  const d=$("dlg"),auth=chatAuth,direction=chatDirection;
  d.innerHTML='<h2>Удалить сообщение?</h2><p>Это действие нельзя отменить.</p><p id="chat-delete-error" class="err" role="status"></p><div class="row"><button id="chat-delete-confirm">Удалить</button><button type="button" class="alt" id="chat-delete-cancel">Отмена</button></div>';
  $("chat-delete-cancel").onclick=()=>d.close();
  $("chat-delete-confirm").onclick=async()=>{
    const button=$("chat-delete-confirm");
    button.disabled=true;
    const res=await api("chat_delete",{name:auth.name,pin:auth.pin,direction:direction,id:id});
    button.disabled=false;
    if(!res.ok){
      $("chat-delete-error").textContent=res.error||"Не удалось удалить сообщение.";
      return;
    }
    if(chatAuth!==auth||chatDirection!==direction)return;
    d.close();
    chatAuth.role=res.role;
    renderChatMessages(res.messages||[]);
    $("chat-status").textContent="";
  };
  d.showModal();
}

async function loadChat(){
  if(!chatAuth||chatLoading||!$("chat-status"))return;
  const auth=chatAuth;
  const direction=chatDirection;
  const rotateAlias=chatAliasPending;
  chatAliasPending=false;
  chatLoading=true;
  const status=$("chat-status");
  try{
    const res=await api("chat_load",{name:auth.name,pin:auth.pin,direction:direction,rotate_alias:rotateAlias});
    if(chatAuth!==auth||chatDirection!==direction)return;
    if(!res.ok){
      if(rotateAlias)chatAliasPending=true;
      chatReady=false;
      $("chat-send").disabled=true;
      status.textContent="Не удалось загрузить чат: "+(res.error||"попробуй обновить страницу.");
      return;
    }
    if(res.direction!==direction){
      if(rotateAlias)chatAliasPending=true;
      chatReady=false;
      $("chat-send").disabled=true;
      status.textContent="Версия чата на хостинге устарела. Обнови api.php и checklist.js.";
      return;
    }
    chatReady=true;
    $("chat-send").disabled=false;
    chatAuth.role=res.role;
    renderChatSecretNickname(res.secret_nickname);
    renderChatMessages(res.messages||[]);
    status.textContent="";
  }finally{
    chatLoading=false;
    if(chatAuth&&(chatAuth!==auth||chatDirection!==direction)&&!$("v-list").classList.contains("hide"))loadChat();
  }
}

async function sendChatMessage(){
  const input=$("chat-input"),button=$("chat-send"),status=$("chat-status");
  if(!chatAuth||!chatReady||!input||!button||button.disabled)return;
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
  if(res.direction!==direction){
    chatReady=false;
    button.disabled=true;
    status.textContent="Версия чата на хостинге устарела. Обнови api.php и checklist.js.";
    return;
  }
  input.value="";
  chatAuth.role=res.role;
  renderChatMessages(res.messages||[]);
  status.textContent="Сообщение отправлено. Отправляю уведомление в Telegram-группу…";
  const notificationResult=await sendTelegramNotification(res.notification);
  status.textContent=notificationResult.ok
    ? "Сообщение отправлено, уведомление доставлено в Telegram-группу."
    : "Сообщение сохранено в чате, но уведомление в Telegram-группу не отправлено: "+notificationResult.error;
}

setInterval(()=>{
  if(chatAuth&&!document.hidden&&!$("v-list").classList.contains("hide")){
    loadChat();
  }
},10000);