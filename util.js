/* Utilidades compartidas por index.html e inmueble.js: escapar HTML, formato de euros y de años. Clásico (globales). */

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

var EUR=new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0});

// Importes con punto de millares SIEMPRE ("1.090 €", no "1090 €"): el formato es-ES de Intl no agrupa los de cuatro cifras, y mezclar
// "1090 €" con "10.902 €" en la misma pantalla parece un error. Espacio de no separación antes del símbolo, como Intl.
function eur(n){
  if(n==null||isNaN(n)) return '—';
  var v=Math.round(n), s=String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  return (v<0?'-':'')+s+'\u00a0€';
}

function fmtAnos(meses){
  var s=(Math.round((meses/12)*10)/10).toString().replace('.',',');
  return s+(s==='1'?' año':' años');
}
