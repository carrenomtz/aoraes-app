/* Utilidades compartidas por index.html e inmueble.js: escapar HTML, formato de euros y de años. Clásico (globales). */

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

var EUR=new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0});

function eur(n){ return (n==null||isNaN(n))?'—':EUR.format(Math.round(n)); }

function fmtAnos(meses){
  var s=(Math.round((meses/12)*10)/10).toString().replace('.',',');
  return s+(s==='1'?' año':' años');
}
