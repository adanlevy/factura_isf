import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Expense } from '../types';
import { GoogleDriveIcon } from './GoogleDriveIcon';
import { getVisibleReceiptDriveUrl } from '../utils/googleWorkspace';

type DriveStateExpense = Pick<Expense, 'driveFileId' | 'driveUploadedUrl' | 'driveFileStatus' | 'driveFileCheckedAt'>;

/** Texto del ícono gris: por qué no se puede abrir el archivo */
function missingReason(expense: DriveStateExpense): string {
  if (expense.driveFileStatus === 'MISSING') {
    const when = expense.driveFileCheckedAt ? new Date(expense.driveFileCheckedAt).toLocaleDateString('es-AR') : '';
    return `El archivo de esta factura/ticket no está en Google Drive${when ? ` (chequeado el ${when})` : ''}. Volvé a subirlo con «Reemplazar».`;
  }
  return 'Esta factura/ticket no tiene archivo en Google Drive';
}

/**
 * Ícono chico de Google Drive de una factura/ticket (listas). Refleja el estado guardado en el
 * gasto, el mismo para todos: de color (abre el archivo) si está en Drive; gris si no lo tiene o si
 * el último chequeo dio que no está. No busca nada al hacer clic.
 */
export function ReceiptDriveLink({ expense }: { expense: DriveStateExpense }) {
  const fileUrl = getVisibleReceiptDriveUrl(expense);
  const base = 'inline-flex items-center justify-center p-0.5 rounded shrink-0 transition';

  if (fileUrl) {
    return (
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} opacity-85 hover:opacity-100 hover:bg-slate-100 active:scale-95`}
        title="Abrir la factura/ticket en Google Drive"
      >
        <GoogleDriveIcon className="w-3 h-3" />
      </a>
    );
  }

  return (
    <span className={`${base} opacity-30 grayscale cursor-help`} title={missingReason(expense)}>
      <GoogleDriveIcon className="w-3 h-3" />
    </span>
  );
}

/**
 * Botón "Ver en Drive" del visor, con el mismo criterio que el ícono. Si el archivo no está, lo
 * dice y ofrece abrir la carpeta del centro de costos (con ese nombre, para no confundirla).
 */
export function ReceiptDriveButton({ expense, folderUrl }: { expense: DriveStateExpense; folderUrl?: string | null }) {
  const fileUrl = getVisibleReceiptDriveUrl(expense);
  const buttonClass =
    'inline-flex items-center px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition';

  if (fileUrl) {
    return (
      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className={buttonClass}>
        <ExternalLink className="w-3.5 h-3.5 mr-1 text-slate-500" />
        <span>Ver en Drive</span>
      </a>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500">
      {missingReason(expense)}
      {folderUrl && (
        <a href={folderUrl} target="_blank" rel="noopener noreferrer" className={buttonClass}>
          <ExternalLink className="w-3.5 h-3.5 mr-1 text-slate-500" />
          <span>Abrir carpeta del centro de costos</span>
        </a>
      )}
    </span>
  );
}
