import React from 'react';
import { AlertTriangle, CheckCircle2, CloudUpload, X } from 'lucide-react';
import { dismissUpload, useUploads, UploadEntry } from '../utils/uploadTracker';

function percentOf(entry: UploadEntry): number {
  if (entry.phase === 'done') return 100;
  if (!entry.total) return 0;
  return Math.min(100, Math.round((entry.loaded / entry.total) * 100));
}

function UploadRow({ entry }: { entry: UploadEntry; key?: string }) {
  const percent = percentOf(entry);
  const status =
    entry.phase === 'sending'
      ? `Enviando… ${percent}%`
      : entry.phase === 'saving'
      ? 'Guardando en Drive…'
      : entry.phase === 'done'
      ? 'Subida'
      : 'No se pudo subir';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-800 truncate" title={entry.label}>
          {entry.label}
        </span>
        <span
          className={`shrink-0 flex items-center gap-1 font-semibold ${
            entry.phase === 'done' ? 'text-emerald-700' : entry.phase === 'error' ? 'text-rose-700' : 'text-slate-500'
          }`}
        >
          {entry.phase === 'done' && <CheckCircle2 className="w-3.5 h-3.5" />}
          {entry.phase === 'error' && <AlertTriangle className="w-3.5 h-3.5" />}
          {status}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full bg-slate-200 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={entry.phase === 'saving' ? undefined : percent}
        aria-label={`Subida de ${entry.label}`}
      >
        {entry.phase === 'saving' ? (
          <div className="h-full w-1/3 rounded-full bg-indigo-500 animate-[upload-indeterminate_1.2s_ease-in-out_infinite]" />
        ) : (
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              entry.phase === 'done' ? 'bg-emerald-500' : entry.phase === 'error' ? 'bg-rose-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${entry.phase === 'error' ? 100 : percent}%` }}
          />
        )}
      </div>
      {entry.phase === 'error' && (
        <p className="text-[11px] text-rose-700 leading-snug">
          La factura/ticket quedó guardada. La app va a reintentar subir el archivo automáticamente (también al
          volver a abrirla en este dispositivo), o podés usar «Reintentar» en Mis Gastos.
        </p>
      )}
    </div>
  );
}

/**
 * Avance de las subidas de facturas/tickets a Google Drive. Se ve mientras hay subidas en curso
 * (y unos segundos al terminar), con el aviso de no cerrar la app hasta que terminen.
 */
export function UploadProgressPanel() {
  const uploads = useUploads();
  if (uploads.length === 0) return null;

  const active = uploads.filter((u) => u.phase === 'sending' || u.phase === 'saving');
  const finished = active.length === 0;
  const hasError = uploads.some((u) => u.phase === 'error');

  return (
    <div
      className="fixed z-[70] bottom-20 sm:bottom-4 left-4 right-4 sm:left-auto sm:w-96 rounded-2xl border border-slate-200 bg-white shadow-xl p-3.5 space-y-3"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`p-1.5 rounded-lg shrink-0 ${
            finished ? (hasError ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600') : 'bg-indigo-50 text-indigo-600'
          }`}
        >
          {finished ? (
            hasError ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />
          ) : (
            <CloudUpload className="w-4 h-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">
            {finished
              ? hasError
                ? 'Hubo un problema con la subida'
                : 'Listo: subido a Google Drive'
              : active.length === 1
              ? 'Subiendo 1 factura/ticket a Google Drive'
              : `Subiendo ${active.length} facturas/tickets a Google Drive`}
          </p>
          {!finished && (
            <p className="text-xs font-semibold text-amber-700">No cierres la app hasta que termine.</p>
          )}
        </div>
        {finished && (
          <button
            type="button"
            onClick={() => uploads.forEach((u) => dismissUpload(u.id))}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="space-y-2.5 max-h-48 overflow-y-auto">
        {uploads.map((entry) => (
          <UploadRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}
