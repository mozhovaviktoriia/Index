// Мелкие помощники: поиск элементов, защита текста, всплывающие окошки.

// Короткий доступ к элементу по id
const $=id=>document.getElementById(id);
// Делает чужой текст безопасным: его нельзя вставить в страницу как HTML
const esc=s=>{
  const d=document.createElement("div");
  d.textContent=s;
  return d.innerHTML;
};
// Разбивает текст по запятым и переносам строк
const lines=t=>(t||"").split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);

// Всплывающее окошко
function modal(title,body){
  const d=$("dlg");
  d.innerHTML='<h2>'+title+'</h2>'+body+'<div class="row"><button id="dlgok">Понятно</button></div>';
  $("dlgok").onclick=()=>d.close();
  if(!d.open)d.showModal();
}

// Окошко «обнови страницу»: иногда хостинг просит проверку браузера
function reloadModal(msg,keep){
  modal("Нужно обновить страницу",'<p>'+esc(msg)+'</p>'+(keep?'<p class="sub">Твои ответы сохранятся.</p>':'')+'<div class="row"><button id="rl">Обновить страницу</button></div>');
  $("rl").onclick=()=>{
    if(keep)saveDraft();
    location.reload();
  };
}

// Показывает ошибку от сервера
function showErr(res,keep){
  if(res.challenge)reloadModal(res.error,keep);
  else modal("Не получилось",'<p>'+esc(res.error||"Что-то пошло не так")+'</p>');
}