import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, SearchCheck } from 'lucide-react';
import { CostCenter, Expense } from '../types';
import { GoogleDriveIcon } from './GoogleDriveIcon';
import { fetchAllExpensesFromServer, patchCentralExpenses } from '../utils/cloudSync';
import { DriveReceiptCheckResult, verifyReceiptsInGoogleDrive } from '../utils/googleWorkspace';
import { formatCurrency, formatDate, formatNumber } from '../utils/helpers';

interface DriveLinksCheckCardProps {
  costCenters: CostCenter[];
  /** Para que las listas abiertas reflejen el resultado sin esperar la sincronización */
  onExpensesPatched?: (patches: { id: string; changes: Partial<Expense> }[]) => void;
}

interface CheckSummary {
  total: number;
  ok: number;
  relinked: number;
  missing: Expense[];
  errors: number;
  finishedAt: string;
}

/**
 * Sistema → "Chequear enlaces de Google Drive": verifica que el archivo de cada factura/ticket
 * exista en Drive y guarda el resultado en el gasto (estado compartido por todos): ícono de color
 * si existe, gris si no. Si un gasto no tenía el enlace pero el archivo está, lo vuelve a vincular.
 */
export function DriveLinksCheckCard({ costCenters, onExpensesPatched }: DriveLinksCheckCardProps) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<CheckSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = progress !== null;

  const runCheck = async () => {
    setError(null);
    setSummary(null);
    setProgress({ done: 0, total: 0 });
    try {
      const all = await fetchAllExpensesFromServer();
      setProgress({ done: 0, total: all.length });
      const results = await verifyReceiptsInGoogleDrive(all, costCenters, (done, total) => setProgress({ done, total }));
      const byId = new Map(results.map((r) => [r.expenseId, r] as [string, DriveReceiptCheckResult]));

      // Se guarda solo lo que cambió (o el enlace recuperado); "no se pudo chequear" no cambia nada
      const checkedAt = new Date().toISOString();
      const patches: { id: string; changes: Partial<Expense> }[] = [];
      for (const exp of all) {
        const r = byId.get(exp.id);
        if (!r || r.status === 'ERROR') continue;
        const changes: Partial<Expense> = {};
        if (r.status === 'OK' && r.relinked && r.fileId) {
          changes.driveFileId = r.fileId;
          changes.driveUploadedUrl = r.webViewLink || `https://drive.google.com/file/d/${r.fileId}/view`;
          if (r.fileName) changes.driveUploadedFileName = r.fileName;
          changes.driveUploadStatus = 'SUCCESS';
        }
        if (exp.driveFileStatus !== r.status || Object.keys(changes).length > 0) {
          changes.driveFileStatus = r.status;
          changes.driveFileCheckedAt = checkedAt;
          patches.push({ id: exp.id, changes });
        }
      }
      if (patches.length > 0) {
        const res = await patchCentralExpenses(patches);
        const saved = patches.filter((p) => !res.failedIds.includes(p.id));
        onExpensesPatched?.(saved);
        if (res.failedIds.length > 0) {
          setError(`No se pudo guardar el resultado de ${formatNumber(res.failedIds.length)} gasto(s). Probá de nuevo.`);
        }
      }

      const missing = all
        .filter((e) => byId.get(e.id)?.status === 'MISSING')
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setSummary({
        total: all.length,
        ok: results.filter((r) => r.status === 'OK').length,
        relinked: results.filter((r) => r.status === 'OK' && r.relinked).length,
        missing,
        errors: results.filter((r) => r.status === 'ERROR').length,
        finishedAt: checkedAt,
      });
    } catch (err: any) {
      setError(err?.message || 'No se pudo completar el chequeo.');
    } finally {
      setProgress(null);
    }
  };

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <GoogleDriveIcon className="w-5 h-5" />
            Enlaces de Google Drive
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            Chequea que el archivo de cada factura/ticket exista en Drive. Las que no están quedan marcadas con el
            ícono gris para todos; si una no tenía el enlace pero el archivo está, se vuelve a vincular.
          </p>
        </div>
        <button
          type="button"
          onClick={runCheck}
          disabled={running}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 text-white text-xs font-bold shadow-xs transition cursor-pointer disabled:cursor-not-allowed shrink-0"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchCheck className="w-4 h-4" />}
          {running ? 'Chequeando…' : 'Chequear enlaces de Google Drive'}
        </button>
      </div>

      {running && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-600">
            <span>{progress.total === 0 ? 'Leyendo los gastos…' : `Chequeando ${formatNumber(progress.done)} de ${formatNumber(progress.total)}…`}</span>
            <span className="font-semibold">{percent}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-[width] duration-300" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {summary && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-xl border border-slate-200 p-2.5">
              <div className="text-lg font-black text-slate-800">{formatNumber(summary.total)}</div>
              <div className="text-[11px] text-slate-500">Chequeadas</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5">
              <div className="text-lg font-black text-emerald-700">{formatNumber(summary.ok)}</div>
              <div className="text-[11px] text-emerald-800">En Drive{summary.relinked > 0 ? ` (${formatNumber(summary.relinked)} revinculadas)` : ''}</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-2.5">
              <div className="text-lg font-black text-rose-700">{formatNumber(summary.missing.length)}</div>
              <div className="text-[11px] text-rose-800">Sin archivo en Drive</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-2.5">
              <div className="text-lg font-black text-slate-500">{formatNumber(summary.errors)}</div>
              <div className="text-[11px] text-slate-500">No se pudieron chequear</div>
            </div>
          </div>

          {summary.missing.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <CheckCircle2 className="w-4 h-4" />
              Todas las facturas/tickets chequeadas tienen su archivo en Drive.
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-700">
                Facturas/tickets sin archivo en Drive (se pueden volver a subir con «Reemplazar» en el visor):
              </p>
              <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-80 overflow-y-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Fecha</th>
                      <th className="text-left px-3 py-2">Cargó</th>
                      <th className="text-left px-3 py-2">Proveedor</th>
                      <th className="text-left px-3 py-2">Centro de costos</th>
                      <th className="text-right px-3 py-2">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.missing.map((e) => (
                      <tr key={e.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(e.date)}</td>
                        <td className="px-3 py-1.5">{e.submittedByName || e.submittedByEmail || '-'}</td>
                        <td className="px-3 py-1.5 font-semibold text-slate-800">{e.vendor || '-'}</td>
                        <td className="px-3 py-1.5">{e.project || '-'}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(e.amount || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {summary.errors > 0 && (
            <p className="text-[11px] text-slate-500">
              Las que no se pudieron chequear (Drive no respondió) mantienen su estado anterior: volvé a correr el chequeo más tarde.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
