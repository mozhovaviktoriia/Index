// Связь с сервером (api.php) и черновик анкеты.

// Запрос к api.php. text/plain не вызывает лишнюю проверку для нестандартного JSON POST.
async function api(action,payload){
  let txt;
  let status;
  try{
    const r=await fetch("api.php",{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8","Accept":"application/json"},body:JSON.stringify(Object.assign({action:action},payload||{})),credentials:"same-origin"});
    status=r.status;
    txt=await r.text();
  }catch(e){
    return {ok:false,net:true,error:"Нет связи с сервером. Проверь интернет и попробуй ещё раз."};
  }
  try{
    return JSON.parse(txt);
  }
  catch(e){
    return {ok:false,challenge:true,error:"Сервер вернул страницу вместо ответа"+(status?" (HTTP "+status+")":"")+". Открой проверку хостинга в новой вкладке, затем вернись сюда и повтори действие."};
  }
}

// Черновик анкеты: сохраняется, если пришлось обновить страницу
function saveDraft(){
  try{
    const f={};
    document.querySelectorAll("#v-form input,#v-form textarea").forEach(i=>{
      if(i.id)f[i.id]=i.value;
    });
    localStorage.setItem("santaDraft",JSON.stringify({me:me,f:f}));
  }catch(e){}
}

function loadDraft(){
  try{
    const s=localStorage.getItem("santaDraft");
    if(!s)return false;
    const d=JSON.parse(s);
    Object.assign(me,d.me);
    for(const id in d.f){
      const el=$(id);
      if(el)el.value=d.f[id];
    }
    sync();
    return true;
  }catch(e){
    return false;
  }
}

function clearDraft(){
  try{
    localStorage.removeItem("santaDraft");
  }catch(e){}
}