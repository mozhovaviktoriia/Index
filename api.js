// Связь с сервером (api.php) и черновик анкеты.

// Запрос к api.php. Если хостинг вернул не данные, а страницу проверки, пробуем ещё раз
async function api(action,payload,tries){
  tries=tries||0;
  let txt;
  try{
    const r=await fetch("api.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.assign({action:action},payload||{})),credentials:"same-origin"});
    txt=await r.text();
  }catch(e){
    return {ok:false,net:true,error:"Нет связи с сервером. Проверь интернет и попробуй ещё раз."};
  }
  try{
    return JSON.parse(txt);
  }
  catch(e){
    if(tries<1){
      await new Promise(r=>setTimeout(r,700));
      return api(action,payload,tries+1);
    }
    return {ok:false,challenge:true,error:"Хостинг попросил обновить страницу (так работает его защита от ботов)."};
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