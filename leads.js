/* Lógica pura de los contactos en frío (users/{uid}/leads y leadsPool): historial, siguiente acción, "no contactar", unión de fichas y copia
   de seguridad. Clásico (globales) para el navegador y CommonJS para tests/leads.test.js. Sin DOM ni Firebase. */

// Cada contacto lleva su propio historial dentro del documento (campo history: lista de {at, by, type, ...}). Va DENTRO del contacto, y no
// en una colección aparte, porque asignar/reasignar/devolver a la bolsa copia el documento a otra ruta con el mismo id y borra el antiguo:
// un historial colgado de la ruta vieja se quedaría huérfano. Tope holgado; al pasarlo se descartan los eventos más antiguos.
var LEAD_HISTORY_MAX = 900;

function leadHistoryAppend(history, entries){
  var out = (Array.isArray(history) ? history : []).concat(entries || []);
  return out.length > LEAD_HISTORY_MAX ? out.slice(out.length - LEAD_HISTORY_MAX) : out;
}
// true si añadir estas entradas haría pasar el tope: entonces se escribe la lista recortada entera en vez de usar arrayUnion.
function leadHistoryNeedsTrim(history, count){
  return (Array.isArray(history) ? history.length : 0) + (count || 0) > LEAD_HISTORY_MAX;
}

// '' | 'overdue' | 'today' | 'future' — fechas YYYY-MM-DD en hora local (el día local lo calcula quien llama).
function leadActionState(dateStr, todayStr){
  if(!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return '';
  if(dateStr < todayStr) return 'overdue';
  return dateStr === todayStr ? 'today' : 'future';
}

// Vistas rápidas del filtro de Contactos. Un contacto marcado "no contactar" nunca aparece como tarea pendiente: la vista "No contactar"
// es la única que lo lista. Los ya convertidos o descartados tampoco necesitan siguiente acción.
function leadMatchesView(l, view, todayStr){
  var st = l.status || 'nuevo';
  var open = !l.doNotContact && st !== 'convertido' && st !== 'no_interesa';
  if(view === 'hoy'){ var a = leadActionState(l.nextActionAt, todayStr); return open && (a === 'overdue' || a === 'today'); }
  if(view === 'sin_accion') return open && !l.nextActionAt;
  if(view === 'no_contactar') return !!l.doNotContact;
  return true;
}

// Campos que deben sobrevivir cuando se unen varios contactos en uno (el unir de la bolsa reconstruye el documento desde cero).
// "No contactar" gana si CUALQUIERA del grupo lo tenía: unir nunca puede reactivar a quien pidió no ser contactado.
function leadMergeMeta(group){
  var out = {}, i, l;
  var dnc = group.filter(function(x){ return x.doNotContact; });
  if(dnc.length){
    out.doNotContact = true;
    var reason = dnc.map(function(x){ return x.dncReason; }).filter(Boolean)[0];
    if(reason) out.dncReason = reason;
    var dates = dnc.map(function(x){ return x.dncAt; }).filter(Boolean).sort();
    if(dates.length) out.dncAt = dates[0];
  }
  var sources = [];
  group.forEach(function(x){ if(x.source && sources.indexOf(x.source) < 0) sources.push(x.source); });
  if(sources.length) out.source = sources.join(' · ');
  var withAction = group.filter(function(x){ return x.nextActionAt; }).sort(function(a, b){ return a.nextActionAt < b.nextActionAt ? -1 : a.nextActionAt > b.nextActionAt ? 1 : 0; });
  if(withAction.length){ out.nextActionAt = withAction[0].nextActionAt; if(withAction[0].nextAction) out.nextAction = withAction[0].nextAction; }
  var hist = [];
  for(i = 0; i < group.length; i++){ l = group[i]; if(Array.isArray(l.history)) hist = hist.concat(l.history); }
  if(hist.length){
    hist.sort(function(a, b){ return String(a.at || '') < String(b.at || '') ? -1 : String(a.at || '') > String(b.at || '') ? 1 : 0; });
    out.history = hist.length > LEAD_HISTORY_MAX ? hist.slice(hist.length - LEAD_HISTORY_MAX) : hist;
  }
  return out;
}

// Texto de una línea del historial. ctx = { status: {clave: etiqueta}, who: function(uid) -> nombre }.
function leadHistoryText(e, ctx){
  ctx = ctx || {};
  var statusLabel = function(s){ return (ctx.status && ctx.status[s]) || s || '—'; };
  var who = function(u){ return u === 'pool' ? 'la bolsa sin asignar' : (ctx.who ? ctx.who(u) : u) || 'otro asesor'; };
  switch(e && e.type){
    case 'import': return 'Importado' + (e.note ? ' desde ' + e.note : '');
    case 'status': return 'Estado: ' + statusLabel(e.from) + ' → ' + statusLabel(e.to);
    case 'assign': return 'Movido de ' + who(e.from) + ' a ' + who(e.to);
    case 'next': return e.to || e.note ? 'Siguiente acción: ' + (e.to || 'sin texto') + (e.note ? ' (' + e.note + ')' : '') : 'Siguiente acción quitada';
    case 'dnc': return e.to ? 'Marcado como NO CONTACTAR' + (e.note ? ': ' + e.note : '') : 'Quitada la marca de no contactar';
    case 'source': return 'Origen: ' + (e.from || '—') + ' → ' + (e.to || '—');
    case 'merge': return 'Unido con otros contactos' + (e.note ? ' (' + e.note + ')' : '');
    default: return (e && e.type) || 'Evento';
  }
}

/* ---------- Copia de seguridad ---------- */
function leadTsToIso(v){
  if(!v) return '';
  if(typeof v === 'object' && typeof v.toDate === 'function'){ try { return v.toDate().toISOString(); } catch(e) { return ''; } }
  return String(v);
}
// Convierte un documento (tal como sale de Firestore) en un objeto plano y serializable: los Timestamp pasan a texto ISO. Es lo que
// guarda la copia JSON (fiel, restaurable) y lo que alimenta el CSV (legible).
function leadExportRow(doc, scope, ownerUid, ownerLabel){
  var out = {};
  Object.keys(doc).forEach(function(k){
    var v = doc[k];
    out[k] = (v && typeof v === 'object' && typeof v.toDate === 'function') ? leadTsToIso(v) : v;
  });
  out._scope = scope;              // 'bolsa' | 'asesor'
  out._ownerUid = ownerUid || '';
  out._ownerLabel = ownerLabel || '';
  return out;
}

var LEAD_CSV_COLUMNS = ['_scope', '_ownerLabel', '_ownerUid', 'id', 'leadNo', 'name', 'email', 'phone', 'status', 'lastContactAt', 'nextAction', 'nextActionAt', 'source', 'doNotContact', 'dncReason', 'dncAt', 'importedAt', 'assignedAt', 'notes', 'historyCount'];

// Excel interpreta como fórmula una celda que empieza por = + - @ (un teléfono "+49…" incluido): se antepone ' para que se lea como texto.
// La copia JSON es la fiel; el CSV es para leer y filtrar en Excel.
function leadCsvCell(v){
  var s = v == null ? '' : (typeof v === 'boolean' ? (v ? 'sí' : '') : String(v));
  if(/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function leadsToCsv(rows){
  var lines = [LEAD_CSV_COLUMNS.join(';')];
  rows.forEach(function(r){
    var flat = Object.assign({}, r, { historyCount: Array.isArray(r.history) ? r.history.length : 0 });
    lines.push(LEAD_CSV_COLUMNS.map(function(c){ return leadCsvCell(flat[c]); }).join(';'));
  });
  return lines.join('\r\n');
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { LEAD_HISTORY_MAX: LEAD_HISTORY_MAX, leadHistoryAppend: leadHistoryAppend, leadHistoryNeedsTrim: leadHistoryNeedsTrim, leadActionState: leadActionState, leadMatchesView: leadMatchesView, leadMergeMeta: leadMergeMeta, leadHistoryText: leadHistoryText, leadTsToIso: leadTsToIso, leadExportRow: leadExportRow, leadsToCsv: leadsToCsv, leadCsvCell: leadCsvCell, LEAD_CSV_COLUMNS: LEAD_CSV_COLUMNS };
}
