// Режим организатора: вход по паролю, список участников, удаление и жеребьёвка.

function renderOrganizerNotices(notices){
  const el=$("notice-queue");
  if(!notices.length){
    el.innerHTML='<p class="sub">Нет ожидающих писем.</p>';
    return;
  }
  el.innerHTML=notices.map(notice=>'<div class="notice-queue-item"><strong>'+esc(notice.recipient_name)+'</strong><p class="organizer-notice-message">'+esc(notice.message)+'</p><div class="row"><button type="button" data-notice-edit="'+(+notice.id)+'">Изменить</button><button type="button" class="alt" data-notice-cancel="'+(+notice.id)+'">Отменить отправку</button></div></div>').join("");
  el.querySelectorAll("button[data-notice-edit]").forEach(button=>button.onclick=()=>{
    const item=button.closest(".notice-queue-item");
    editOrganizerNotice(+button.dataset.noticeEdit,item.querySelector(".organizer-notice-message").textContent);
  });
  el.querySelectorAll("button[data-notice-cancel]").forEach(button=>button.onclick=()=>{
    const item=button.closest(".notice-queue-item");
    confirmOrganizerNoticeCancel(+button.dataset.noticeCancel,item.querySelector("strong").textContent);
  });
}

// Список участников
function renderOrg(res){
  orgDrawn=!!res.drawn;
  $("count").textContent="Участников: "+res.participants.length;
  $("chips").innerHTML=res.participants.map(p=>'<span class="chip">'+esc(p.name)+'<button class="x" data-r="'+(+p.id)+'" aria-label="Удалить">✕</button></span>').join("");
  const recipient=$("notice-recipient");
  recipient.innerHTML='<option value="">Выбери участника</option>'+res.participants.map(p=>'<option value="'+(+p.id)+'">'+esc(p.name)+'</option>').join("");
  recipient.disabled=!res.participants.length;
  $("notice-send").disabled=!res.participants.length;
  renderOrganizerNotices(res.notices||[]);
  $("orgstate").textContent=orgDrawn?"Жеребьёвка проведена. Кто кому дарит, здесь не видно.":"Жеребьёвка ещё не проводилась.";
  $("go").textContent=orgDrawn?"Провести заново":"Провести жеребьёвку";
  $("reset-draw").classList.toggle("hide",!orgDrawn);
  const deadlineInput=res.deadline?kyivDateTimeInput(res.deadline):"";
  $("deadline-input").value=deadlineInput||"";
  $("deadline-status").textContent=res.deadline?(deadlineInput?"Срок установлен (время Киева).":"Не удалось прочитать сохранённый срок."):"Срок пока не установлен.";
  $("timer-mode").value=res.timer_mode==="gift"?"gift":"draw";
  $("timer-status").textContent=res.timer_mode==="gift"?"Показан таймер до отправки подарков 25 декабря 2026 года.":"Показан таймер заполнения чек-листов.";
  renderDeadline(res.deadline,orgDrawn,res.timer_mode);
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
$("reset-draw").onclick=()=>{
  const d=$("dlg");
  d.innerHTML='<h2>Сбросить жеребьёвку?</h2><p>Все пары будут удалены, а участники снова смогут редактировать чек-листы. Список участников и срок заполнения сохранятся.</p><p class="sub">Если участники уже узнали пары, сообщи им, что прежняя жеребьёвка отменена.</p><div class="row"><button id="reset-ok">Сбросить жеребьёвку</button><button class="alt" id="reset-cancel">Отмена</button></div>';
  $("reset-cancel").onclick=()=>d.close();
  $("reset-ok").onclick=async()=>{
    const button=$("reset-ok");
    button.disabled=true;
    const res=await api("admin_reset_draw",{password:orgPw});
    if(!res.ok){
      button.disabled=false;
      showErr(res,false);
      return;
    }
    d.close();
    $("pairs").innerHTML="";
    await loadOrg();
    modal("Жеребьёвка сброшена","<p>Пары удалены, чек-листы снова можно редактировать.</p>");
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
  renderDeadline(res.deadline,orgDrawn,$("timer-mode").value);
}

$("deadline-save").onclick=()=>saveDeadline($("deadline-input").value);
$("deadline-clear").onclick=()=>saveDeadline("");

$("timer-mode").onchange=async()=>{
  const mode=$("timer-mode").value;
  $("timer-mode").disabled=true;
  const res=await api("admin_set_timer_mode",{password:orgPw,mode});
  $("timer-mode").disabled=false;
  if(!res.ok){
    showErr(res,false);
    await loadOrg();
    return;
  }
  await loadOrg();
  $("timer-status").textContent=mode==="gift"?"Показан таймер до отправки подарков 25 декабря 2026 года.":"Показан таймер заполнения чек-листов.";
};

async function sendOrganizerNotice(){
  const recipientId=Number($("notice-recipient").value),message=$("notice-message").value.trim();
  if(!recipientId){
    $("notice-status").textContent="Выбери участника.";
    return;
  }
  if(!message){
    $("notice-status").textContent="Напиши текст сообщения.";
    $("notice-message").focus();
    return;
  }
  const button=$("notice-send");
  button.disabled=true;
  $("notice-status").textContent="Отправляю…";
  const res=await api("admin_send_notice",{password:orgPw,recipient_id:recipientId,message:message});
  button.disabled=false;
  if(!res.ok){
    if(res.challenge){
      $("notice-status").textContent="";
      showErr(res,false);
    }else{
      $("notice-status").textContent="Не удалось отправить: "+(res.error||"попробуй ещё раз.");
    }
    return;
  }
  $("notice-message").value="";
  $("notice-status").textContent="Сообщение отправлено для "+res.recipient_name+". Оно появится после ввода имени и секретного слова.";
  await loadOrg();
}

$("notice-send").onclick=sendOrganizerNotice;

function editOrganizerNotice(id,message){
  const d=$("dlg");
  d.innerHTML='<h2>Изменить письмо</h2><label for="notice-edit-text">Текст письма</label><textarea id="notice-edit-text" maxlength="2000"></textarea><p id="notice-edit-error" class="err" role="status"></p><div class="row"><button id="notice-edit-save">Сохранить</button><button type="button" class="alt" id="notice-edit-cancel">Закрыть</button></div>';
  $("notice-edit-text").value=message;
  $("notice-edit-cancel").onclick=()=>d.close();
  $("notice-edit-save").onclick=async()=>{
    const text=$("notice-edit-text").value.trim(),button=$("notice-edit-save");
    if(!text){
      $("notice-edit-error").textContent="Текст письма не может быть пустым.";
      return;
    }
    button.disabled=true;
    const res=await api("admin_notice_edit",{password:orgPw,id:id,message:text});
    button.disabled=false;
    if(!res.ok){
      if(res.challenge){
        d.close();
        showErr(res,false);
      }else{
        $("notice-edit-error").textContent=res.error||"Не удалось изменить письмо.";
      }
      return;
    }
    d.close();
    $("notice-status").textContent="Письмо обновлено.";
    await loadOrg();
  };
  d.showModal();
}

function confirmOrganizerNoticeCancel(id,recipientName){
  const d=$("dlg");
  d.innerHTML='<h2>Отменить отправку?</h2><p>Письмо для '+esc(recipientName)+' будет удалено из очереди.</p><p class="sub">Отменить можно, только пока адресат его не открыл.</p><p id="notice-cancel-error" class="err" role="status"></p><div class="row"><button id="notice-cancel-confirm">Отменить отправку</button><button type="button" class="alt" id="notice-cancel-close">Закрыть</button></div>';
  $("notice-cancel-close").onclick=()=>d.close();
  $("notice-cancel-confirm").onclick=async()=>{
    const button=$("notice-cancel-confirm");
    button.disabled=true;
    const res=await api("admin_notice_cancel",{password:orgPw,id:id});
    button.disabled=false;
    if(!res.ok){
      if(res.challenge){
        d.close();
        showErr(res,false);
      }else{
        $("notice-cancel-error").textContent=res.error||"Не удалось отменить отправку.";
      }
      return;
    }
    d.close();
    $("notice-status").textContent="Отправка отменена.";
    await loadOrg();
  };
  d.showModal();
}

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