import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import fs from 'node:fs';
const which = process.argv[2];            // ruta de las reglas a probar
const label = process.argv[3] || which;
const rules = fs.readFileSync(which, 'utf8');
const env = await initializeTestEnvironment({ projectId: 'aoraes-test-' + Math.random().toString(36).slice(2), firestore: { rules, host: '127.0.0.1', port: 8080 } });
const ADMIN = 'DMDXyvqfaeQiXfb3pYmoX95vNR82', ADV = 'advisor1';
await env.withSecurityRulesDisabled(async c => {
  await setDoc(doc(c.firestore(), 'users', ADV), { role: 'advisor', status: 'approved' });
});
const adm = env.authenticatedContext(ADMIN).firestore();
const adv = env.authenticatedContext(ADV).firestore();
const anon = env.unauthenticatedContext().firestore();
const base = (o = {}) => ({ productoId: 'prod-x', familia: 'VA', proveedor: 'P', nombre: 'N', version: '1', estado: 'pendiente_revision', ilustrativo: false,
  vigenteDesde: '2026-01-01', vigenteHasta: null, fuente: {}, costes: [], notas: '', verificadoPor: '', verificadoEn: '', detalle: {}, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...o });
let ok = 0, bad = 0; const res = [];
async function t(name, expect, fn) { try { await (expect === 'allow' ? assertSucceeds(fn()) : assertFails(fn())); ok++; res.push('  ✔ ' + name); } catch (e) { bad++; res.push('  ✖ ' + name + '  (esperado ' + expect + ')'); } }

await t('anónimo no lee productosVersiones', 'deny', () => getDoc(doc(anon, 'productosVersiones', 'a')));
await t('asesor aprobado lee productosVersiones', 'allow', () => getDoc(doc(adv, 'productosVersiones', 'a')));
await t('asesor NO crea ficha', 'deny', () => setDoc(doc(adv, 'productosVersiones', 'b'), base()));
await t('admin crea borrador/pendiente', 'allow', () => setDoc(doc(adm, 'productosVersiones', 'c'), base()));
await t('admin NO crea directamente como verificado', 'deny', () => setDoc(doc(adm, 'productosVersiones', 'd'), base({ estado: 'verificado', verificadoPor: 'x', verificadoEn: '2026-01-01', fuente: { documento: 'AVB' }, costes: [{}] })));
const seed = async id => env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), 'productosVersiones', id), { ...base(), createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') }));
const created = new Date('2026-01-01');
const verif = o => base({ createdAt: created, estado: 'verificado', verificadoPor: 'carlos', verificadoEn: '2026-11-09', ...o });
await seed('v1'); await seed('v2'); await seed('v3'); await seed('v4');
await t('[AOR-SEC-003] verificar SIN fuente y SIN costes', process.env.EXPECT_HOLE_CLOSED === '1' ? 'deny' : 'allow', () => setDoc(doc(adm, 'productosVersiones', 'v1'), verif({ fuente: {}, costes: [] })));
await t('[AOR-SEC-003] verificar con fuente pero SIN costes', process.env.EXPECT_HOLE_CLOSED === '1' ? 'deny' : 'allow', () => setDoc(doc(adm, 'productosVersiones', 'v4'), verif({ fuente: { documento: 'AVB' }, costes: [] })));
await t('verificar con fuente.documento y costes', 'allow', () => setDoc(doc(adm, 'productosVersiones', 'v2'), verif({ fuente: { documento: 'AVB 2026' }, costes: [{ tipo: 'abschluss' }] })));
await t('verificar con ilustrativo=true', 'deny', () => setDoc(doc(adm, 'productosVersiones', 'v3'), verif({ ilustrativo: true, fuente: { documento: 'AVB' }, costes: [{}] })));
await t('nadie borra', 'deny', async () => { const { deleteDoc } = await import('firebase/firestore'); return deleteDoc(doc(adm, 'productosVersiones', 'v2')); });
console.log('\n' + label + '\n' + res.join('\n') + '\n  => ' + ok + ' ok, ' + bad + ' fallos');
await env.cleanup(); process.exit(bad ? 1 : 0);
