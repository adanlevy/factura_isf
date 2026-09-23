/**
 * Pruebas de las reglas de Firestore (firestore.rules) contra el emulador oficial.
 * Ejecutar desde la raíz del repo:  npm run test:rules
 *
 * Cubre ataques que deben RECHAZARSE y flujos legítimos de la app que deben SEGUIR FUNCIONANDO.
 */
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(here, '..', '..', 'firestore.rules'), 'utf8');

const env = await initializeTestEnvironment({
  projectId: 'demo-factura-isf',
  firestore: { rules, host: '127.0.0.1', port: 8085 },
});

const results = [];
async function expectAllowed(name, fn) { await check(name, true, fn); }
async function expectDenied(name, fn) { await check(name, false, fn); }
async function check(name, shouldAllow, fn) {
  let allowed;
  try { await fn(); allowed = true; } catch { allowed = false; }
  results.push({ ok: allowed === shouldAllow, name, allowed, shouldAllow });
}

const as = (email, extra = {}) =>
  env.authenticatedContext(email.replace(/[^a-z0-9]/gi, '_'), { email, email_verified: true, ...extra }).firestore();

const PAID = { reimbursementStatus: 'REIMBURSED', reimbursedAt: '2026-09-10', paymentConfirmedAt: '2026-09-10T10:00:00Z' };

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('app_users/colab@gmail.com').set({ email: 'colab@gmail.com', name: 'Colab', role: 'user' });
    await db.doc('app_users/otro@gmail.com').set({ email: 'otro@gmail.com', name: 'Otro', role: 'user' });
    await db.doc('app_users/jefe@isf-argentina.org').set({ email: 'jefe@isf-argentina.org', name: 'Jefe', role: 'admin' });
    await db.doc('expenses/exp-otro').set({ id: 'exp-otro', submittedByEmail: 'otro@gmail.com', amount: 50000, reimbursementStatus: 'PENDING', bankDetails: { cbuCvu: '0000000000000000000001', alias: 'otro.real' }, date: '2026-09-01', project: 'GPA' });
    await db.doc('expenses/exp-colab').set({ id: 'exp-colab', submittedByEmail: 'colab@gmail.com', amount: 1000, reimbursementStatus: 'PENDING', date: '2026-09-02', project: 'GPA' });
    await db.doc('expenses/exp-colab-pagado').set({ id: 'exp-colab-pagado', submittedByEmail: 'colab@gmail.com', amount: 2000, date: '2026-09-03', project: 'GPA', ...PAID });
    await db.doc('expenses/exp-legacy').set({ id: 'exp-legacy', amount: 300, date: '2026-01-01' });
    await db.doc('vendors/v1').set({ id: 'v1', name: 'Proveedor', bankDetails: { cbuCvu: '1111111111111111111111' } });
  });
}

// Borrado como lo hace la app: batch con delete + tombstone
function deleteWithTombstone(db, ids, deletedBy) {
  const batch = db.batch();
  for (const id of ids) {
    batch.delete(db.doc(`expenses/${id}`));
    batch.set(db.doc(`deleted_expenses/${id}`), { id, deletedAt: new Date().toISOString(), deletedBy });
  }
  return batch.commit();
}

// ------------------------------------------------------------------ ataques
await seed();
const extrano = as('cualquiera@gmail.com');
await expectDenied('Cuenta Google cualquiera lee comprobantes', () => extrano.doc('expenses/exp-otro').get());
await expectDenied('Cuenta Google cualquiera lee proveedores (CBU)', () => extrano.doc('vendors/v1').get());
await expectDenied('Cuenta Google cualquiera se auto-registra en app_users', () => extrano.doc('app_users/cualquiera@gmail.com').set({ email: 'cualquiera@gmail.com', role: 'user' }));
await expectDenied('...y tras intentarlo sigue sin leer comprobantes', () => extrano.doc('expenses/exp-otro').get());

const orgNoVerif = as('falso@isf-argentina.org', { email_verified: false });
await expectDenied('Email @isf-argentina.org NO verificado lee comprobantes', () => orgNoVerif.doc('expenses/exp-otro').get());
await expectDenied('Email @isf-argentina.org NO verificado se auto-registra', () => orgNoVerif.doc('app_users/falso@isf-argentina.org').set({ email: 'falso@isf-argentina.org', role: 'user' }));

const colab = as('colab@gmail.com');
await expectDenied('Colaborador edita el CBU de un comprobante ajeno', () => colab.doc('expenses/exp-otro').update({ 'bankDetails.cbuCvu': '9999999999999999999999' }));
await expectDenied('Colaborador se adueña de un comprobante ajeno + pone su CBU', () => colab.doc('expenses/exp-otro').update({ submittedByEmail: 'colab@gmail.com', 'bankDetails.cbuCvu': '9999999999999999999999' }));
await expectDenied('Colaborador edita un comprobante legacy sin dueño', () => colab.doc('expenses/exp-legacy').update({ amount: 1 }));
await expectDenied('Colaborador se auto-aprueba (marca su comprobante como REIMBURSED)', () => colab.doc('expenses/exp-colab').update({ reimbursementStatus: 'REIMBURSED' }));
await expectDenied('Colaborador registra un comprobante de pago en su comprobante', () => colab.doc('expenses/exp-colab').update({ paymentConfirmedAt: '2026-09-20T00:00:00Z' }));
await expectDenied('Colaborador se cambia el dueño a sí mismo en su propio comprobante (a otro)', () => colab.doc('expenses/exp-colab').update({ submittedByEmail: 'otro@gmail.com' }));
await expectDenied('Colaborador crea un comprobante ya pagado', () => colab.doc('expenses/exp-nuevo-pagado').set({ id: 'exp-nuevo-pagado', submittedByEmail: 'colab@gmail.com', amount: 5, ...PAID }));
await expectDenied('Colaborador crea un comprobante a nombre de otro', () => colab.doc('expenses/exp-a-nombre-de-otro').set({ id: 'exp-a-nombre-de-otro', submittedByEmail: 'otro@gmail.com', amount: 5, reimbursementStatus: 'PENDING' }));
await expectDenied('Colaborador cambia el monto de su comprobante YA PAGADO', () => colab.doc('expenses/exp-colab-pagado').update({ amount: 999999 }));
await expectDenied('Colaborador borra su comprobante YA PAGADO', () => deleteWithTombstone(colab, ['exp-colab-pagado'], 'colab@gmail.com'));
await expectDenied('Colaborador borra un comprobante ajeno', () => deleteWithTombstone(colab, ['exp-otro'], 'colab@gmail.com'));
await expectDenied('Colaborador crea tombstone de un comprobante ajeno (para bloquearlo)', () => colab.doc('deleted_expenses/exp-otro').set({ id: 'exp-otro', deletedAt: 'x', deletedBy: 'colab@gmail.com' }));
await expectDenied('Tombstone sin borrar el comprobante', () => colab.doc('deleted_expenses/exp-colab').set({ id: 'exp-colab', deletedAt: 'x', deletedBy: 'colab@gmail.com' }));
await expectDenied('Tombstone firmado a nombre de otra persona', () => deleteWithTombstone(colab, ['exp-colab'], 'otro@gmail.com'));
await expectDenied('Colaborador se pone en copia de TODOS los emails salientes', () => colab.doc('app_users/colab@gmail.com').update({ ccAllOutgoingEmails: true }));
await expectDenied('Colaborador se escala a admin', () => colab.doc('app_users/colab@gmail.com').update({ role: 'admin' }));

await seed();
const orgMember = as('nuevo@isf-argentina.org');
await expectDenied('Miembro @isf-argentina.org (no registrado) borra comprobante ajeno', () => deleteWithTombstone(orgMember, ['exp-otro'], 'nuevo@isf-argentina.org'));
await expectDenied('Miembro @isf-argentina.org se auto-registra como admin', () => orgMember.doc('app_users/nuevo@isf-argentina.org').set({ email: 'nuevo@isf-argentina.org', role: 'admin' }));
await expectDenied('Miembro @isf-argentina.org se auto-registra con CC global', () => orgMember.doc('app_users/nuevo@isf-argentina.org').set({ email: 'nuevo@isf-argentina.org', role: 'user', ccAllOutgoingEmails: true }));

// ------------------------------------------- resurrección por escritura tardía
await seed();
const jefe = as('jefe@isf-argentina.org');
await expectAllowed('Colaborador borra su comprobante pendiente (delete + tombstone)', () => deleteWithTombstone(colab, ['exp-colab'], 'colab@gmail.com'));
await expectDenied('Escritura tardía del dueño (callback de Drive) NO lo resucita', () => colab.doc('expenses/exp-colab').set({ id: 'exp-colab', submittedByEmail: 'colab@gmail.com', amount: 1000, driveUploadStatus: 'SUCCESS' }, { merge: true }));
await expectDenied('Escritura tardía de un admin NO lo resucita', () => jefe.doc('expenses/exp-colab').set({ id: 'exp-colab', amount: 1000 }, { merge: true }));
await expectAllowed('Admin puede quitar un tombstone (restauración manual)', () => jefe.doc('deleted_expenses/exp-colab').delete());

// ------------------------------------------------------- flujos legítimos
await seed();
await expectAllowed('Colaborador crea su comprobante (Reintegro, pendiente)', () => colab.doc('expenses/exp-n1').set({ id: 'exp-n1', submittedByEmail: 'colab@gmail.com', amount: 10, reimbursementStatus: 'PENDING', reimbursable: true, paymentType: 'REINTEGRO', bankDetails: { cbuCvu: '2222222222222222222222' }, date: '2026-09-20', project: 'GPA' }));
await expectAllowed('Colaborador crea su comprobante (Tarjeta corporativa)', () => colab.doc('expenses/exp-n2').set({ id: 'exp-n2', submittedByEmail: 'colab@gmail.com', amount: 10, reimbursementStatus: 'NOT_APPLICABLE', paymentType: 'TARJETA_CORPORATIVA', bankDetails: null, date: '2026-09-20' }));
await expectAllowed('Callback de Drive actualiza su comprobante pendiente', () => colab.doc('expenses/exp-n1').set({ driveUploadStatus: 'SUCCESS', driveUploadedUrl: 'https://drive/x', updatedAt: 'now' }, { merge: true }));
await expectAllowed('Colaborador edita monto/CBU de su comprobante pendiente', () => colab.doc('expenses/exp-colab').update({ amount: 1500, bankDetails: { cbuCvu: '3333333333333333333333' }, updatedAt: 'now' }));
await expectAllowed('Colaborador cambia tipo de pago (PENDING -> NOT_APPLICABLE)', () => colab.doc('expenses/exp-colab').update({ paymentType: 'TARJETA_CORPORATIVA', reimbursementStatus: 'NOT_APPLICABLE', reimbursable: false }));
await expectAllowed('Colaborador reemplaza la foto de su comprobante YA PAGADO', () => colab.doc('expenses/exp-colab-pagado').update({ receiptFileName: 'nueva.jpg', driveUploadedUrl: 'https://drive/y', driveUploadStatus: 'SUCCESS', updatedAt: 'now' }));
await expectAllowed('Colaborador lee comprobantes y proveedores', () => colab.doc('expenses/exp-otro').get().then(() => colab.doc('vendors/v1').get()));
await expectAllowed('Colaborador crea un proveedor', () => colab.doc('vendors/v2').set({ id: 'v2', name: 'Nuevo' }));
await expectAllowed('Colaborador agrega un registro de auditoría', () => colab.doc('audit_logs/l1').set({ id: 'l1', action: 'EXPENSE_CREATE' }));
await expectAllowed('Login: colaborador actualiza su nombre/foto (rol igual)', () => colab.doc('app_users/colab@gmail.com').set({ email: 'colab@gmail.com', name: 'Colab Nuevo', picture: 'p.png', role: 'user', updatedAt: 'now' }, { merge: true }));
await expectAllowed('Login: miembro @isf-argentina.org verificado se auto-registra como user', () => orgMember.doc('app_users/nuevo@isf-argentina.org').set({ email: 'nuevo@isf-argentina.org', name: 'Nuevo', role: 'user', updatedAt: 'now' }));
await expectAllowed('Miembro @isf-argentina.org lee comprobantes', () => orgMember.doc('expenses/exp-otro').get());
await expectAllowed('Admin liquida un comprobante ajeno (REIMBURSED + pago)', () => jefe.doc('expenses/exp-otro').update({ ...PAID, paymentProofDriveUrl: 'https://drive/z' }));
await expectAllowed('Admin revierte el pago a pendiente', () => jefe.doc('expenses/exp-otro').update({ reimbursementStatus: 'PENDING' }));
await expectAllowed('Admin activa la copia global de un usuario', () => jefe.doc('app_users/colab@gmail.com').update({ ccAllOutgoingEmails: true }));
await expectAllowed('Admin borra 5 comprobantes en un batch (con tombstones)', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (let i = 0; i < 5; i++) await ctx.firestore().doc(`expenses/lote-${i}`).set({ id: `lote-${i}`, submittedByEmail: 'otro@gmail.com', amount: i });
  });
  await deleteWithTombstone(jefe, [0, 1, 2, 3, 4].map((i) => `lote-${i}`), 'jefe@isf-argentina.org');
});
await expectAllowed('Admin guarda 15 comprobantes en un batch (liquidación en lote)', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (let i = 0; i < 15; i++) await ctx.firestore().doc(`liq-${i}`.replace(/^/, 'expenses/')).set({ id: `liq-${i}`, submittedByEmail: 'otro@gmail.com', amount: i, reimbursementStatus: 'PENDING' });
  });
  const batch = jefe.batch();
  for (let i = 0; i < 15; i++) batch.set(jefe.doc(`expenses/liq-${i}`), { ...PAID }, { merge: true });
  await batch.commit();
});
await expectAllowed('Admin crea 15 comprobantes nuevos en un batch', async () => {
  const batch = jefe.batch();
  for (let i = 0; i < 15; i++) batch.set(jefe.doc(`expenses/alta-${i}`), { id: `alta-${i}`, amount: i }, { merge: true });
  await batch.commit();
});

// ------------------------------------------------------------------ reporte
await env.cleanup();
console.log('\n=== Reglas de Firestore ===');
for (const r of results) {
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.allowed ? 'permitido' : 'denegado '} | ${r.name}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pruebas OK`);
process.exit(failed.length > 0 ? 1 : 0);
