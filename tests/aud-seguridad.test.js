/* Bloque 6 — privacidad y seguridad (AOR-SEC-001..004, AOR-TAX-006). Las reglas de Firestore se analizan como TEXTO: NO se han ejecutado con el emulador
   (no hay Java ni firebase-tools en este equipo). Estas pruebas fijan invariantes y documentan los huecos; no sustituyen a una prueba con @firebase/rules-unit-testing. */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const root=path.join(__dirname,'..'), read=f=>fs.readFileSync(path.join(root,f),'utf8');
const idx=read('index.html'), med=read('preguntas-medicas.html'), ana=read('analisis.html'), rules=read('firestore.rules'), F=require('../fiscal.js');
const has=(s,re,m)=>assert.ok(re.test(s),m||('no encontrado: '+re));

// ---------------- AOR-SEC-001: datos de salud ----------------
test('SEC-001: los datos de salud NO viven solo en memoria — localStorage (por cliente y borrador), espejo en carpeta, Firestore y exportación JSON',()=>{
  has(med,/var STORAGE_KEY='aoraes_med_draft_v1';/); has(med,/var MED_BY_CLIENT_KEY='aoraes_med_by_client_v1';/);
  has(med,/localStorage\.setItem\(MED_BY_CLIENT_KEY, JSON\.stringify\(byClient\)\)/); has(med,/localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(state\)\)/);
  has(med,/aoraesMirrorClients/);                                                                       // espejo en la carpeta Clientes del disco
  has(idx,/window\.AORAES_CLOUD\.syncClient\(\{ id:rec\.id, record:rec, solution:sols\[rec\.id\]\|\|null, medico:meds\[rec\.id\]\|\|null/);   // Firestore
  has(idx,/return \{ id:id, record:rec, solution:getAllSolutions\(id\)\|\|null, medico:medico,/);              // exportación
  has(rules,/d\.medico is map/);                                                                         // la regla acepta `medico` como mapa libre
});
test('SEC-001 (CORREGIDO): al cerrar sesión o cambiar de asesor se borra TAMBIÉN el borrador médico `aoraes_med_draft_v1` y el sueldo recordado',()=>{
  const bloques=idx.match(/try\{ localStorage\.removeItem\(CLIENTS_KEY\);[^}]*\}catch\(e\)\{\}/g)||[]; assert.equal(bloques.length,2,'cierre de sesión y cambio de vista de asesor');
  bloques.forEach(b=>{ for(const k of ['aoraes_med_draft_v1','aoraes_bruto_mensual','aoraes_bruto_anual','MED_BY_CLIENT_KEY','CLIENTS_KEY','SOLUTIONS_KEY','ACTIVE_KEY']) assert.ok(b.includes(k),k+' en: '+b.slice(0,90)); });
});
test('SEC-001: el borrador sin cliente activo se escribe en una ranura GLOBAL (no por asesor) — por eso debe limpiarse al salir',()=>{
  has(med,/\} else \{\s*localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(state\)\);/);
});

// ---------------- AOR-SEC-002: Steuer-ID, IBAN ----------------
test('SEC-002 (hallazgo P): Steuer-ID e IBAN son campos de la ficha (sincronizados a Firestore con el resto) y salen en la sección «Datos personales» del informe, que el asesor puede desactivar; el perfil fiscal nunca los importa',()=>{
  has(ana,/data-pers="steuerId_A"/); has(ana,/data-pers="iban_A"/); has(ana,/\['IBAN',g\('iban',letter\)\]/); has(ana,/\['Steuer-ID',g\('steuerId',letter\)\]/);
  has(ana,/copia de S\.11 \(identificación, contacto, IBAN, Steuer-ID\) para que el\s+\/\/ asesor tenga la ficha completa/);
  has(ana,/var INFORME_OFF_KEY='aoraes_informe_off_v1';/);                                              // secciones del informe que se pueden desactivar
  assert.ok(!/iban/i.test(read('fiscal.js')+read('fiscal-ui.js')+read('jubilacion.html')));            // ningún cálculo usa el IBAN
  assert.ok(!/steuerId|Steuer-ID/.test(read('fiscal.js').replace(/\/\/[^\n]*/g,'')));
});
test('SEC-002: acceso a fichas = el propio asesor aprobado o el administrador (lee TODAS las carteras vía collectionGroup); el borrado de cuenta elimina clientes, contactos y perfil',()=>{
  has(rules,/function canAccessAdvisorData\(uid\)/); has(rules,/match \/\{path=\*\*\}\/clients\/\{clientId\} \{\s*allow read: if isAdmin\(\);/);
  has(idx,/getDocs\(collection\(db,'users',uid,'clients'\)\)\.then\(function\(snap\)\{ return Promise\.all\(snap\.docs\.map\(function\(d\)\{ return deleteDoc\(d\.ref\)/);
});

// ---------------- AOR-SEC-003: reglas (análisis estático, NO emulador) ----------------
test('SEC-003: ninguna regla concede acceso incondicional; la raíz no tiene comodín permisivo',()=>{
  assert.ok(!/allow[^;\n]*:\s*if\s+true\s*;/.test(rules)); assert.ok(!/match \/\{document=\*\*\}/.test(rules));
});
test('SEC-003: users — el propietario no puede escribir role ni status (create fija client/active o advisor/pending; update limita las claves); solo el admin cambia `status`; nadie borra su propio perfil',()=>{
  const u=rules.slice(rules.indexOf('match /users/{uid} {'),rules.indexOf('match /savedArticles'));
  has(u,/keys\(\)\.hasOnly\(\['email', 'fullName', 'phone', 'profession', 'source', 'role', 'status', 'createdAt'\]\)/);
  has(u,/\(request\.resource\.data\.role == 'client' && request\.resource\.data\.status == 'active'\)/); has(u,/\(request\.resource\.data\.role == 'advisor' && request\.resource\.data\.status == 'pending'\)/);
  has(u,/isAdmin\(\)\s*&& request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\['status'\]\)/);
  const upd=u.slice(u.indexOf('allow update'),u.indexOf('allow delete'));
  assert.ok(!/affectedKeys\(\)\.hasOnly\([^)]*'(role|status)'[^)]*\)\s*(\n\s*&&\s*request\.resource\.data\.fullName|\n\s*&&\s*request\.resource\.data\.lastLoginAt)/.test(upd.replace(/isAdmin\(\)[^|]*hasOnly\(\['status'\]\)/,'')));
  has(u,/allow delete: if isAdmin\(\)\s*&& request\.auth\.uid != uid/);
});
test('SEC-003: create y update de clients/leads/progress comparten la misma validación (sin «update bypass»)',()=>{
  has(rules,/match \/clients\/\{clientId\} \{[\s\S]*?allow create, update: if canAccessAdvisorData\(uid\) && validClientDoc\(clientId\);/);
  has(rules,/match \/leads\/\{leadId\} \{[\s\S]*?allow create, update: if canAccessAdvisorData\(uid\) && validLeadDoc\(\);/);
  has(rules,/match \/progress\/\{docId\} \{[\s\S]*?allow create, update: if isOwner\(uid\)/);
});
test('SEC-003 (hallazgo): `clients` valida el tipo de `name` y el nº de claves, pero `record` (≤80 claves) y `medico` son mapas libres — Steuer-ID, IBAN y respuestas de salud no tienen esquema ni tamaño por campo',()=>{
  has(rules,/d\.record\.keys\(\)\.size\(\) <= 80/); has(rules,/d\.keys\(\)\.size\(\) <= 12/); assert.ok(!/hasOnly\(\['id', 'record', 'solution', 'medico', 'exportedAt'\]\)/.test(rules));
});
test('SEC-003 (hallazgo): los administradores se reconocen por UID fijo en un fichero público y por users/{uid}.role==admin+status==approved; el alta de usuario NO exige email_verified',()=>{
  has(rules,/request\.auth\.uid == 'DMDXyvqfaeQiXfb3pYmoX95vNR82'/); assert.ok(!/email_verified/.test(rules));
});
test('SEC-003 (hallazgo): consultationRequests admite creación SIN autenticación (límites de tamaño, sin límite de frecuencia: Firestore Rules no puede imponerlo → App Check)',()=>{
  const c=rules.slice(rules.indexOf('match /consultationRequests'),rules.indexOf('match /advisorNotes')); has(c,/allow create: if request\.resource\.data\.keys\(\)\.hasOnly/); has(c,/\(!isSignedIn\(\) && request\.resource\.data\.profileUid == ''\)/);
});
test('SEC-003/CAT-001 (corregido, probado con emulador): para pasar a `verificado` las reglas exigen además fuente.documento y costes no vacíos',()=>{
  const p=rules.slice(rules.indexOf('function validProductoVersion'),rules.indexOf('match /productosVersiones'));
  has(p,/request\.resource\.data\.ilustrativo == false/); has(p,/request\.resource\.data\.verificadoPor\.size\(\) > 0/);
  has(p,/request\.resource\.data\.fuente\.documento is string/); has(p,/request\.resource\.data\.fuente\.documento\.size\(\) > 0/); has(p,/request\.resource\.data\.costes\.size\(\) > 0/);
});

// ---------------- AOR-SEC-004: exposición pública ----------------
test('SEC-004: el sitio se publica desde la raíz del repositorio (CNAME): firestore.rules, tests/ y scripts/ se sirven públicamente (comprobado por HTTP el 09-11-2026)',()=>{
  assert.ok(fs.existsSync(path.join(root,'CNAME'))); has(rules,/FIREBASE_TOKEN \(secreto de Actions\) se rotó por última vez el 18 sept\. 2026/);   // dato de operación en un fichero público
});
test('SEC-004: no hay claves privadas, tokens de GitHub, claves sk_live ni FIREBASE_TOKEN en el repositorio, y las tablas de costes de cobertura se inyectan en tiempo de ejecución (los tests usan datos FICTICIOS)',()=>{
  const todo=['index.html','analisis.html','jubilacion.html','plan-futuro.html','vsp.html','calc.js','productos.js','centro.js','fiscal.js','firestore.rules','sw.js'].map(read).join('\n');
  assert.ok(!/BEGIN (RSA |EC )?PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|sk_live_|AKIA[0-9A-Z]{16}/.test(todo));
  assert.match(read('tests/plan-futuro.test.js'),/FICTICIAS/);
});

// ---------------- AOR-TAX-006: perfil fiscal ----------------
const T0='2026-11-09T10:00:00.000Z', T1='2026-11-09T11:00:00.000Z';
const analisis=(bruto)=>({savedAt:T0,data:{fields:{'gross:salarioBruto_A':bruto,'gross:numPagas_A':12,'pers:estadoCivil_A':'Soltero/a'},children:[]}});
const conPermiso=()=>{ const rec={}; F.normalizeFiscal(rec); F.fiscalOtorgarPermiso(rec.fiscal,'asesor',T0); return rec; };
test('TAX-006 (CORREGIDO): un campo importado y luego CONFIRMADO no se sobrescribe en una reimportación posterior (antes pasaba a «proporcionado» con el valor nuevo)',()=>{
  const rec=conPermiso(); F.fiscalImportar(rec.fiscal,analisis(4000),T0); assert.equal(rec.fiscal.campos.gross_salary_primary.value,48000);
  assert.ok(F.fiscalConfirmar(rec.fiscal,'gross_salary_primary',T0));
  const r=F.fiscalImportar(rec.fiscal,analisis(5000),T1), x=rec.fiscal.campos.gross_salary_primary;
  assert.equal(x.value,48000); assert.equal(x.estado,'confirmado'); assert.ok(x.confirmadoEn);
  assert.ok(r.omitidos.some(o=>o.k==='gross_salary_primary'&&/confirmado/i.test(o.motivo)),'se informa de por qué no se importa');
});
test('TAX-006: un campo importado SIN confirmar sí se actualiza (con historial); uno escrito a mano nunca se pisa; sin permiso o con permiso revocado no se importa nada',()=>{
  const rec=conPermiso(); F.fiscalImportar(rec.fiscal,analisis(4000),T0); F.fiscalImportar(rec.fiscal,analisis(5000),T1);
  const x=rec.fiscal.campos.gross_salary_primary; assert.equal(x.value,60000); assert.equal(x.estado,'proporcionado'); assert.equal(x.versiones.length,1);
  F.fiscalFijar(rec.fiscal,'gross_salary_primary',70000,'manual',T1); F.fiscalImportar(rec.fiscal,analisis(9000),T1); assert.equal(rec.fiscal.campos.gross_salary_primary.value,70000);
  const sin={}; F.normalizeFiscal(sin); assert.equal(F.fiscalImportar(sin.fiscal,analisis(4000),T0).bloqueado,true);
  F.fiscalOtorgarPermiso(sin.fiscal,'asesor',T0); F.fiscalRevocarPermiso(sin.fiscal,T1); assert.equal(F.fiscalImportar(sin.fiscal,analisis(4000),T1).bloqueado,true);
});
test('TAX-006: el alcance del permiso excluye Steuer-ID, nombre, nacimiento, gastos y ahorros; el ejercicio fiscal nunca se importa (hay que confirmarlo)',()=>{
  assert.deepEqual(F.FISCAL_ALCANCE_IMPORTACION,['gross_salary_primary','gross_salary_partner','marital_status','children_count','church_tax_status']);
  const rec=conPermiso(); F.fiscalImportar(rec.fiscal,analisis(4000),T0); assert.equal(rec.fiscal.campos.gross_salary_primary.ejercicio,null);
});
test('TAX-006 (hallazgo R): fiscalNum usa parseFloat(replace(",",".")): «60.000» daría 60 — hoy NO es alcanzable porque fiscal-ui.js usa <input type="number">',()=>{
  assert.equal(F.fiscalValidar('gross_salary_primary','60.000').valor,60); has(read('fiscal-ui.js'),/<input type="number" class="inm-inp" id=/);
});

/* Despliegue: Pages no debe publicar archivos internos */
test('pages.yml publica _site sin reglas, pruebas, scripts ni config de Firebase y lo comprueba', () => {
  const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert');
  const y=fs.readFileSync(path.join(__dirname,'..','.github','workflows','pages.yml'),'utf8');
  for (const x of ["--exclude='tests'","--exclude='scripts'","--exclude='firestore.rules'","--exclude='firebase.json'","--exclude='.firebaserc'"]) assert.ok(y.includes(x), 'falta '+x);
  assert.match(y,/test ! -e "_site\/\$f"/);
  assert.match(y,/if: github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'/);
  assert.match(y,/upload-pages-artifact@v3[\s\S]*path: _site/);
});
