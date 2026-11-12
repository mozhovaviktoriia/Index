// Режим организатора: вход по паролю, список участников, удаление и жеребьёвка.

// Список участников
function renderOrg(res){
  orgDrawn=!!res.drawn;
  $("count").textContent="Участников: "+res.participants.length;
  $("chips").innerHTML=res.participants.map(p=>'<span class="chip">'+esc(p.name)+'<button class="x" data-r="'+(+p.id)+'" aria-label="Удалить">✕</button></span>').join("");
  $("orgstate").textContent=orgDrawn?"Жеребьёвка проведена. Кто кому дарит, здесь не видно.":"Жеребьёвка ещё не проводилась.";
  $("go").textContent=orgDrawn?"Провести заново":"Провести жеребьёвку";
  const deadlineInput=res.deadline?kyivDateTimeInput(res.deadline):"";
  $("deadline-input").value=deadlineInput||"";
  $("deadline-status").textContent=res.deadline?(deadlineInput?"Срок установлен (время Киева).":"Не удалось прочитать сохранённый срок."):"Срок пока не установлен.";
  renderDeadline(res.deadline,orgDrawn);
}

function kyivDateTimeInput(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  const parts={};
  new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Kyiv",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})
    .formatToParts(date).forEach(p=>{parts[p.type]=p.value;});
  return parts.year+"-"+parts.month+"-"+parts.day+"T"+parts.hour+":"+parts.minute;
}

async function loadOrg(){
  if(!orgPw)return;
  const res=await api("admin_list",{password:orgPw});
  if(!res.ok){
    showErr(res,false);
    return;
  }
  renderOrg(res);
}

// Окно входа (пароль проверяет сервер)
function orgLogin(){
  const d=$("dlg");
  d.innerHTML='<h2>Вход для организатора</h2><label for="apw">Пароль</label><input id="apw" type="password" autocomplete="off"><div id="apwerr"></div><div class="row"><button id="apok">Войти</button><button class="alt" id="apno">Отмена</button></div>';
  $("apno").onclick=()=>d.close();
  $("apok").onclick=async()=>{
    const pw=$("apw").value;
    $("apok").disabled=true;
    const res=await api("admin_list",{password:pw});
    $("apok").disabled=false;
    if(!res.ok){
      if(res.challenge){
        d.close();
        showErr(res,false);
      }
      else $("apwerr").innerHTML='<p class="err">'+esc(res.error||"Ошибка")+'</p>';
      return;
    }
    orgPw=pw;
    d.close();
    document.body.classList.add("org");
    $("v-welcome").classList.add("hide");
    $("top").classList.remove("hide");
    renderOrg(res);
    show("draw");
  };
  $("apw").addEventListener("keydown",e=>{
    if(e.key==="Enter")$("apok").click();
  });
  d.showModal();
}

// Жеребьёвка выполняется на сервере
async function doDraw(){
  const res=await api("admin_draw",{password:orgPw});
  if(!res.ok){
    showErr(res,false);
    return;
  }
  $("pairs").innerHTML='<div class="card"><h2>Жеребьёвка проведена</h2><p>Участников: '+(+res.count)+'. Теперь каждый может открыть сайт и нажать «Узнать, для кого я Санта».</p></div>';
  modal("Жеребьёвка проведена!",'<ol class="steps"><li>Напиши участникам, что всё готово.</li><li>Пусть откроют сайт и нажмут «Узнать, для кого я Санта».</li><li>Имя и секретное слово — как в анкете.</li></ol>');
  loadOrg();
}

$("go").onclick=()=>{
  if(!orgDrawn){
    doDraw();
    return;
  }
  const d=$("dlg");
  d.innerHTML='<h2>Провести заново?</h2><p>Прежние пары сбросятся. Кто уже узнал свою пару, увидит другую.</p><div class="row"><button id="rdok">Провести заново</button><button class="alt" id="rdno">Отмена</button></div>';
  $("rdno").onclick=()=>d.close();
  $("rdok").onclick=()=>{
    d.close();
    doDraw();
  };
  d.showModal();
};
$("refresh").onclick=loadOrg;

async function saveDeadline(value){
  const save=$("deadline-save"),clear=$("deadline-clear");
  save.disabled=true;
  clear.disabled=true;
  $("deadline-status").textContent="Сохраняю…";
  const res=await api("admin_set_deadline",{password:orgPw,deadline:value});
  save.disabled=false;
  clear.disabled=false;
  if(!res.ok){
    $("deadline-status").textContent="";
    showErr(res,false);
    return;
  }
  const deadlineInput=res.deadline?kyivDateTimeInput(res.deadline):"";
  $("deadline-input").value=deadlineInput||"";
  $("deadline-status").textContent=res.deadline?(deadlineInput?"Срок сохранён (время Киева).":"Срок сохранён, но не удалось прочитать дату."):"Срок убран.";
  renderDeadline(res.deadline,orgDrawn);
}

$("deadline-save").onclick=()=>saveDeadline($("deadline-input").value);
$("deadline-clear").onclick=()=>saveDeadline("");

// Удаление участника
$("chips").addEventListener("click",e=>{
  const b=e.target.closest("button[data-r]");
  if(!b)return;
  const name=b.parentElement.firstChild.textContent;
  const d=$("dlg");
  d.innerHTML='<h2>Удалить участника?</h2><p>'+esc(name)+' пропадёт из списка. Пусть заполнит анкету заново.</p><p class="sub">Жеребьёвка сбросится, её нужно будет провести заново.</p><div class="row"><button id="rmok">Удалить</button><button class="alt" id="rmno">Отмена</button></div>';
  $("rmno").onclick=()=>d.close();
  $("rmok").onclick=async()=>{
    const res=await api("admin_delete",{password:orgPw,id:+b.dataset.r});
    d.close();
    if(!res.ok){
      showErr(res,false);
      return;
    }
    $("pairs").innerHTML="";
    loadOrg();
  };
  d.showModal();
});
$("adm").onclick=orgLogin;