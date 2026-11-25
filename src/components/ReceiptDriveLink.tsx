import React, { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { CostCenter, Expense } from '../types';
import { GoogleDriveIcon } from './GoogleDriveIcon';
import { findReceiptInGoogleDrive, getReceiptDriveFileUrl } from '../utils/googleWorkspace';

type ResolvedHandler = (expenseId: string, fields: Partial<Expense>) => void;

/**
 * Abre el ARCHIVO de la factura/ticket en Drive (nunca la carpeta). Si el gasto no tiene guardado
 * el enlace al archivo (registros viejos), lo busca en Drive al hacer clic, lo abre y avisa para guardarlo.
 */
function useReceiptDriveOpener(expense: Expense, costCenters: CostCenter[], onFileResolved?: ResolvedHandler) {
  const [state, setState] = useState<'idle' | 'searching' | 'not-found'>('idle');
  const fileUrl = getReceiptDriveFileUrl(expense);
  // Sin enlace guardado siempre se intenta buscarlo: el archivo puede estar en Drive aunque el gasto
  // no lo tenga registrado (p. ej. se cerró la app mientras subía)
  const canSearch = !fileUrl && state !== 'not-found';

  const searchAndOpen = async () => {
    if (state === 'searching') return;
    // La pestaña se abre ya (dentro del clic) para que el navegador no la bloquee
    const tab = window.open('about:blank', '_blank');
    setState('searching');
    const found = await findReceiptInGoogleDrive(expense, costCenters);
    if (found?.driveUploadedUrl) {
      if (tab) {
        tab.opener = null;
        tab.location.href = found.driveUploadedUrl;
      } else {
        window.open(found.driveUploadedUrl, '_blank', 'noopener,noreferrer');
      }
      setState('idle');
      onFileResolved?.(expense.id, found);
    } else {
      tab?.close();
      setState('not-found');
    }
  };

  return { fileUrl, canSearch, state, searchAndOpen };
}

interface ReceiptDriveLinkProps {
  expense: Expense;
  costCenters?: CostCenter[];
  /** Se llama cuando se encontró el archivo de un registro viejo, para guardar su enlace */
  onFileResolved?: ResolvedHandler;
}

/**
 * Ícono chico de Google Drive de una factura/ticket (listas): abre siempre el archivo.
 * Si la factura/ticket no está en Drive, se ve gris y sin enlace.
 */
export function ReceiptDriveLink({ expense, costCenters = [], onFileResolved }: ReceiptDriveLinkProps) {
  const { fileUrl, canSearch, state, searchAndOpen } = useReceiptDriveOpener(expense, costCenters, onFileResolved);
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

  if (!canSearch && state !== 'searching') {
    return (
      <span
        className={`${base} opacity-30 grayscale cursor-help`}
        title="No se encontró el archivo de esta factura/ticket en Google Drive"
      >
        <GoogleDriveIcon className="w-3 h-3" />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={searchAndOpen}
      className={`${base} opacity-85 hover:opacity-100 hover:bg-slate-100 active:scale-95 cursor-pointer`}
      title="Abrir la factura/ticket en Google Drive"
    >
      {state === 'searching' ? <Loader2 className="w-3 h-3 animate-spin text-slate-500" /> : <GoogleDriveIcon className="w-3 h-3" />}
    </button>
  );
}

/**
 * Botón "Ver en Drive" del visor: abre el archivo; si no se lo encuentra, lo dice y ofrece
 * abrir la carpeta del centro de costos (con ese nombre, para que no se confunda con el archivo).
 */
export function ReceiptDriveButton({
  expense,
  costCenters = [],
  folderUrl,
  onFileResolved,
}: ReceiptDriveLinkProps & { folderUrl?: string | null }) {
  const { fileUrl, canSearch, state, searchAndOpen } = useReceiptDriveOpener(expense, costCenters, onFileResolved);
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
  if (canSearch || state === 'searching') {
    return (
      <button type="button" onClick={searchAndOpen} className={`${buttonClass} cursor-pointer`}>
        {state === 'searching' ? (
          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin text-slate-500" />
        ) : (
          <ExternalLink className="w-3.5 h-3.5 mr-1 text-slate-500" />
        )}
        <span>{state === 'searching' ? 'Buscando en Drive…' : 'Ver en Drive'}</span>
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500">
      No se encontró el archivo en Drive.
      {folderUrl && (
        <a href={folderUrl} target="_blank" rel="noopener noreferrer" className={buttonClass}>
          <ExternalLink className="w-3.5 h-3.5 mr-1 text-slate-500" />
          <span>Abrir carpeta del centro de costos</span>
        </a>
      )}
    </span>
  );
}
