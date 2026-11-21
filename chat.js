// Анонимный чат участников одной пары.
let chatLoading=false;

function renderChat(){
  if(!chatAuth)return;
  const el=$("v-list");
  el.insertAdjacentHTML("beforeend",'<div class="card chat-card"><h2>Уточнить подарок</h2><p class="sub">Сообщения видны только вашей паре. Имена не показываются.</p><div id="chat-status" class="sub" role="status" aria-live="polite">Загружаю сообщения…</div><div id="chat-messages" class="chat-messages" aria-live="polite"></div><label for="chat-input">Сообщение</label><div class="chat-compose"><textarea id="chat-input" maxlength="1000" placeholder="Напиши вопрос или ответ"></textarea><button id="chat-send">Отправить</button></div><p class="hint">До 1000 символов. Enter + Ctrl отправляет сообщение.</p></div>');
  $("chat-send").onclick=sendChatMessage;
  $("chat-input").addEventListener("keydown",e=>{
    if(e.key==="Enter"&&e.ctrlKey){
      e.preventDefault();
      sendChatMessage();
    }
  });
  loadChat();
}

function renderChatMessages(messages){
  const list=$("chat-messages");
  if(!list)return;
  if(!messages.length){
    list.innerHTML='<p class="sub">Пока сообщений нет. Можно начать с вопроса о подарке.</p>';
    return;
  }
  const other=chatAuth.role==="giver"?"Получатель":"Санта";
  list.innerHTML=messages.map(message=>'<div class="chat-message'+(message.fromYou?" mine":"")+'"><strong>'+ (message.fromYou?"Ты":other) +'</strong><p>'+esc(message.text)+'</p><time>'+esc(message.sentAt)+'</time></div>').join("");
  list.scrollTop=list.scrollHeight;
}

async function loadChat(){
  if(!chatAuth||chatLoading||!$("chat-status"))return;
  const auth=chatAuth;
  chatLoading=true;
  const status=$("chat-status");
  try{
    const res=await api("chat_load",{name:auth.name,pin:auth.pin});
    if(chatAuth!==auth)return;
    if(!res.ok){
      status.textContent="Не удалось загрузить чат: "+(res.error||"попробуй обновить страницу.");
      return;
    }
    chatAuth.role=res.role;
    renderChatMessages(res.messages||[]);
    status.textContent="";
  }finally{
    chatLoading=false;
    if(chatAuth&&chatAuth!==auth&&!$("v-list").classList.contains("hide"))loadChat();
  }
}

async function sendChatMessage(){
  const input=$("chat-input"),button=$("chat-send"),status=$("chat-status");
  if(!chatAuth||!input||!button||button.disabled)return;
  const auth=chatAuth;
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
  const res=await api("chat_send",{name:auth.name,pin:auth.pin,message:message});
  button.disabled=false;
  if(chatAuth!==auth)return;
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
