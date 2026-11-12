// Запуск страницы: переключение экранов, приветствие, «Узнать, для кого я Санта».

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