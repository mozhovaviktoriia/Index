// Запуск страницы: переключение экранов, приветствие, «Узнать, для кого я Санта».

let eventDeadline=null,eventDrawn=false;

function setDeadlineText(id,text){
  $(id).textContent=text;
  document.querySelectorAll(`[data-deadline-copy="${id}"]`).forEach(node=>node.textContent=text);
}

function renderDeadline(deadline,drawn){
  eventDeadline=deadline;
  eventDrawn=!!drawn;
  const banner=$("deadline-banner");
  if(!eventDeadline){
    banner.classList.add("hide");
    setDeadlineText("deadline-date","");
    setDeadlineText("deadline-countdown","");
    setDeadlineText("deadline-note","");
    return;
  }
  banner.classList.remove("hide");
  updateDeadline();
}

function updateDeadline(){
  if(!eventDeadline)return;
  const date=new Date(eventDeadline);
  if(Number.isNaN(date.getTime())){
    setDeadlineText("deadline-date","Не удалось прочитать срок чек-листов.");
    setDeadlineText("deadline-countdown","");
    setDeadlineText("deadline-note","");
    return;
  }
  const formatted=new Intl.DateTimeFormat("ru-RU",{
    timeZone:"Europe/Kyiv",day:"numeric",month:"long",year:"numeric",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).format(date);
  setDeadlineText("deadline-date","Заполнить чек-листы до "+formatted+".");
  if(eventDrawn){
    setDeadlineText("deadline-countdown","Жеребьёвка уже проведена.");
    setDeadlineText("deadline-note","");
    return;
  }
  const left=Math.floor((date.getTime()-Date.now())/1000);
  if(left<=0){
    setDeadlineText("deadline-countdown","Срок заполнения истёк.");
    setDeadlineText("deadline-note","Жеребьёвку организатор запускает вручную.");
    return;
  }
  const days=Math.floor(left/86400),hours=Math.floor(left%86400/3600),minutes=Math.floor(left%3600/60),seconds=left%60;
  const pad=n=>String(n).padStart(2,"0");
  setDeadlineText("deadline-countdown","До срока осталось: "+(days?days+" дн ":"")+pad(hours)+" ч "+pad(minutes)+" мин "+pad(seconds)+" сек");
  setDeadlineText("deadline-note","После срока организатор вручную начнёт жеребьёвку.");
}

async function loadEventInfo(){
  const res=await api("event_info");
  if(!res.ok){
    $("deadline-banner").classList.remove("hide");
    setDeadlineText("deadline-date","Не удалось загрузить срок чек-листов.");
    setDeadlineText("deadline-countdown",res.error||"Обнови страницу позже.");
    setDeadlineText("deadline-note","");
    return;
  }
  renderDeadline(res.deadline,res.drawn);
}

// Переключение экранов
function show(v){
  ["form","check","draw","list"].forEach(k=>$("v-"+k).classList.toggle("hide",k!==v));
  document.querySelectorAll("nav button").forEach(b=>b.setAttribute("aria-selected",b.dataset.v===(v==="check"?"form":v)));
  if(v==="draw")loadOrg();
  if(v==="list")renderList();
  window.scrollTo(0,0);
}

// Переходы между экранами
function goHome(){
  ["form","check","draw","list"].forEach(k=>$("v-"+k).classList.add("hide"));
  $("top").classList.add("hide");
  document.body.classList.remove("org");
  $("v-welcome").classList.remove("hide");
  window.scrollTo(0,0);
}

function enterForm(){
  $("v-welcome").classList.add("hide");
  $("top").classList.remove("hide");
  show("form");
}

function gotoReveal(){
  ["form","check","draw","list"].forEach(k=>$("v-"+k).classList.add("hide"));
  $("top").classList.add("hide");
  $("v-welcome").classList.remove("hide");
  $("codebox").classList.remove("hide");
  window.scrollTo(0,0);
}

// Запуск: вкладки, анкета, кнопки
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>b.dataset.v==="home"?goHome():show(b.dataset.v));
renderForm();
sync();
$("v-form").addEventListener("click",e=>{
  const b=e.target.closest(".opt");
  if(b){
    toggle(b);
    if(on(b))burst(b);
    return;
  }
  if(e.target.id==="make"){
    if(!$("f-pin").value.trim()){
      $("made").innerHTML='<p class="err">Придумай секретное слово</p>';
      return;
    }
    openCheck();
  }
});
// Участник узнаёт свою пару: имя + секретное слово
$("havecode").onclick=()=>{
  const hid=$("codebox").classList.toggle("hide");
  if(!hid)modal("Как узнать свою пару",'<ol class="steps"><li>Введи имя так, как писал(а) в анкете.</li><li>Введи своё секретное слово.</li><li>Если жеребьёвки ещё не было, загляни позже.</li></ol>');
};
// Участник загружает свою анкету после проверки секретного слова
$("edit").onclick=()=>{
  const d=$("dlg");
  d.innerHTML='<h2>Изменить свою анкету</h2><p class="sub">Введи имя и секретное слово из анкеты.</p><label for="edit-name">Имя</label><input id="edit-name" autocomplete="off"><label for="edit-pin">Секретное слово</label><input id="edit-pin" type="password" autocomplete="off"><div id="edit-err"></div><div class="row"><button id="edit-load">Загрузить анкету</button><button class="alt" id="edit-cancel">Отмена</button></div>';
  $("edit-cancel").onclick=()=>d.close();
  $("edit-load").onclick=async()=>{
    const name=$("edit-name").value.trim(),pin=$("edit-pin").value.trim();
    if(!name||!pin){
      $("edit-err").innerHTML='<p class="err">Введи имя и секретное слово</p>';
      return;
    }
    const b=$("edit-load");
    b.disabled=true;
    const res=await api("edit_load",{name:name,pin:pin});
    b.disabled=false;
    if(!res.ok){
      if(res.challenge){
        d.close();
        showErr(res,false);
      }
      else $("edit-err").innerHTML='<p class="err">'+esc(res.error||"Ошибка")+'</p>';
      return;
    }
    fillForm(res.data,name,pin);
    editingName=name;
    $("v-welcome").classList.add("hide");
    $("top").classList.remove("hide");
    $("v-form").querySelector("h1").textContent="Редактирование анкеты";
    $("make").textContent="Проверить изменения";
    d.close();
    show("form");
  };
  $("edit-name").addEventListener("keydown",e=>{if(e.key==="Enter")$("edit-load").click();});
  $("edit-pin").addEventListener("keydown",e=>{if(e.key==="Enter")$("edit-load").click();});
  d.showModal();
};
$("reveal").onclick=async()=>{
  const name=$("rname").value.trim(),pin=$("rpin").value.trim();
  if(!name||!pin){
    $("codeerr").innerHTML='<p class="err">Введи имя и секретное слово</p>';
    return;
  }
  const b=$("reveal");
  b.disabled=true;
  const res=await api("reveal",{name:name,pin:pin});
  b.disabled=false;
  if(!res.ok){
    if(res.challenge)showErr(res,false);
    else $("codeerr").innerHTML='<p class="err">'+esc(res.error||"Ошибка")+'</p>';
    return;
  }
  $("codeerr").innerHTML="";
  if(res.status==="waiting"){
    modal("Пока рано","<p>Организатор ещё не провёл жеребьёвку. Загляни позже.</p>");
    return;
  }
  burst(b);
  target=Object.assign({name:res.target.name},res.target.data);
  ticks={};
  $("v-welcome").classList.add("hide");
  $("top").classList.remove("hide");
  show("list");
};
// Кнопка «Поехали» на приветствии
$("start").onclick=()=>{
  const nick=$("nick").value.trim();
  if(editingName){
    me={pairs:{},yn:{},chips:{}};
    renderForm();
    sync();
  }
  editingName="";
  $("f-name").readOnly=false;
  $("f-pin").readOnly=false;
  $("f-pin").type="text";
  $("make").textContent="Проверить анкету";
  $("v-welcome").classList.add("hide");
  $("top").classList.remove("hide");
  if(nick)$("f-name").value=nick;
  document.querySelector("#v-form h1").textContent=nick?"Итак, "+nick+", выкладывай желания":"Выкладывай свои желания";
  show("form");
};
$("nick").addEventListener("keydown",e=>{
  if(e.key==="Enter")$("start").click();
});
// Если страницу пришлось обновить, возвращаем ответы из черновика
if(loadDraft()){
  enterForm();
  modal("Ответы на месте","<p>Страница обновилась, и твои ответы вернулись. Нажми «Проверить анкету» ещё раз.</p>");
}
loadEventInfo();
setInterval(updateDeadline,1000);
setInterval(loadEventInfo,60000);