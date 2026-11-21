// Мелкие помощники: поиск элементов, защита текста, всплывающие окошки.

// Короткий доступ к элементу по id
const $=id=>document.getElementById(id);
// Делает чужой текст безопасным: его нельзя вставить в страницу как HTML
const esc=s=>{
  const d=document.createElement("div");
  d.textContent=s;
  return d.innerHTML;
};
function normalizeYN(values){
  const source=values&&typeof values==="object"&&!Array.isArray(values)?values:{};
  const normalized={};
  YN.forEach(key=>{
    if(["y","n","m"].includes(source[key]))normalized[key]=source[key];
  });
  Object.entries(YN_LEGACY).forEach(([key,legacy])=>{
    if(normalized[key])return;
    const oldValues=legacy.map(oldKey=>source[oldKey]).filter(value=>["y","n","m"].includes(value));
    if(!oldValues.length)return;
    // Conflicting old choices become neutral after their categories are merged.
    normalized[key]=oldValues.every(value=>value===oldValues[0])?oldValues[0]:"m";
  });
  return normalized;
}
function formatYNLabel(value){
  const match=value.match(/^(.*?)\s*(\([^()]*\))$/);
  if(!match)return esc(value);
  return '<span class="yn-title">'+esc(match[1])+'</span><small class="yn-detail">'+esc(match[2])+'</small>';
}
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