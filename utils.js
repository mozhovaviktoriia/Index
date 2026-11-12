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

// Окошко проверки хостинга: страница проверки должна открыться отдельно от API-запроса
function reloadModal(msg,keep){
  const d=$("dlg");
  d.innerHTML='<h2>Проверка хостинга</h2><p>'+esc(msg)+'</p><p class="sub">Открой проверку в новой вкладке, пройди её, затем вернись и повтори действие.'+(keep?' Твои ответы сохранятся.':'')+'</p><div class="row"><button id="opencheck">Открыть проверку</button><button class="alt" id="dlgok">Понятно</button></div>';
  $("opencheck").onclick=()=>{
    if(keep)saveDraft();
    window.open("api.php","_blank","noopener");
  };
  $("dlgok").onclick=()=>d.close();
  if(!d.open)d.showModal();
}

// Показывает ошибку от сервера
function showErr(res,keep){
  if(res.challenge)reloadModal(res.error,keep);
  else modal("Не получилось",'<p>'+esc(res.error||"Что-то пошло не так")+'</p>');
}