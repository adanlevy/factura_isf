import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Eye,
  Trash2,
  Sparkles,
  ArrowRight,
  HardDrive,
} from 'lucide-react';
import { Expense, CostCenter } from '../types';
import { formatCurrency, formatDate, generateDriveFileName } from '../utils/helpers';
import { SafePdfViewer } from './SafePdfViewer';

interface ReplaceReceiptModalProps {
  expense: Expense | null;
  costCenters?: CostCenter[];
  isOpen: boolean;
  onClose: () => void;
  onConfirmReplace: (expense: Expense, newFileBase64: string, newFileName: string) => Promise<void>;
}

export function ReplaceReceiptModal({
  expense,
  costCenters = [],
  isOpen,
  onClose,
  onConfirmReplace,
}: ReplaceReceiptModalProps) {
  const [newFileBase64, setNewFileBase64] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !expense) {
      setNewFileBase64(null);
      setNewFileName('');
      setIsProcessing(false);
      setStatusMessage(null);
      setErrorMessage(null);
    }
  }, [isOpen, expense]);

  // Listen for Clipboard Paste (Ctrl+V) when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      if (isProcessing) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            processFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, isProcessing]);

  if (!isOpen || !expense) return null;

  const matchedCc = costCenters.find(
    (c) => c.name.toLowerCase() === (expense.project || '').toLowerCase()
  );

  const standardizedBaseName = generateDriveFileName(expense, costCenters);

  const processFile = (file: File) => {
    setErrorMessage(null);
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
    
    if (!validTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Por favor selecciona una imagen válida (JPG, PNG) o un documento PDF.');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('El archivo seleccionado supera el límite de 20MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setNewFileBase64(result);
        setNewFileName(file.name);
      }
    };
    reader.onerror = () => {
      setErrorMessage('Error al leer el archivo. Inténtalo nuevamente.');
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleConfirm = async () => {
    if (!newFileBase64 || !expense) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('1. Reemplazando archivo en Google Drive y eliminando versión anterior...');

    try {
      await onConfirmReplace(expense, newFileBase64, newFileName);
      setStatusMessage('¡Archivo actualizado correctamente!');
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Error during receipt replacement:', err);
      setErrorMessage(err.message || 'Ocurrió un error al reemplazar el archivo.');
      setIsProcessing(false);
      setStatusMessage(null);
    }
  };

  const isPdf = newFileName.toLowerCase().endsWith('.pdf') || (newFileBase64 && newFileBase64.startsWith('data:application/pdf'));

  return (
    <div
      id="replace-receipt-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
    >
      <div
        id="replace-receipt-container"
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/90 text-white flex items-center justify-center shadow-xs">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Cambiar Foto / Archivo de Factura</h3>
              <p className="text-xs text-slate-300">
                Reemplaza la imagen o PDF sin modificar los datos contables ni pasar por IA
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Expense Quick Summary Banner */}
        <div className="bg-indigo-50/80 px-5 py-3 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">{expense.vendor}</span>
            <span className="text-slate-400">•</span>
            <span className="font-extrabold text-indigo-900">{formatCurrency(expense.amount, expense.currency)}</span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-600">{expense.project}</span>
          </div>
          <div className="text-[11px] font-mono text-indigo-700 bg-white px-2 py-0.5 rounded-lg border border-indigo-200">
            {formatDate(expense.date)}
          </div>
        </div>

        {/* Informative Note */}
        <div className="px-6 pt-4">
          <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-950">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900">Reemplazo directo sin IA (Sin OCR):</p>
              <p className="text-[11.5px] text-amber-800 leading-relaxed mt-0.5">
                Esta acción eliminará el archivo antiguo de Google Drive y subirá el nuevo archivo a la carpeta del Centro de Costos ({matchedCc?.driveFolder || expense.project}). Todos los datos cargados (monto, fecha, proveedor, método de pago) se mantendrán intactos.
              </p>
            </div>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4 max-h-[68vh] overflow-y-auto">
          {!newFileBase64 ? (
            /* File Selector Dropzone */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[220px] ${
                isDragging
                  ? 'border-indigo-600 bg-indigo-50/80 scale-[0.99]'
                  : 'border-slate-300 hover:border-indigo-500 hover:bg-slate-50/80'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp, application/pdf"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 shadow-xs">
                <UploadCloud className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-1">
                Haz clic para seleccionar o arrastra la nueva factura / ticket
              </h4>
              <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-3">
                Soporta archivos <strong>JPG, PNG o documentos PDF</strong> de hasta 20MB. También puedes pegar directamente con <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[11px] text-slate-700">Ctrl + V</kbd>.
              </p>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-xl">
                <span>📁 Explorar archivos</span>
              </span>
            </div>
          ) : (
            /* Preview of Selected Replacement */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Nuevo archivo seleccionado:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setNewFileBase64(null);
                    setNewFileName('');
                  }}
                  disabled={isProcessing}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Elegir otro archivo</span>
                </button>
              </div>

              {/* Preview Box */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex flex-col items-center justify-center min-h-[220px]">
                {isPdf ? (
                  <div className="w-full">
                    <SafePdfViewer
                      url={newFileBase64}
                      fileName={newFileName}
                      title={`Nuevo Comprobante: ${expense.vendor}`}
                      heightClass="h-64"
                    />
                  </div>
                ) : (
                  <img
                    src={newFileBase64}
                    alt="Vista previa de nuevo comprobante"
                    className="max-h-64 object-contain rounded-xl shadow-xs"
                  />
                )}
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="font-mono text-slate-800 font-semibold">{newFileName}</span>
                </div>
              </div>

              {/* Target Drive File Name */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <HardDrive className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="text-slate-600 truncate">
                    Nombre en Drive: <strong className="text-indigo-950 font-mono">{standardizedBaseName}.{isPdf ? 'pdf' : 'png'}</strong>
                  </span>
                </div>
                <span className="shrink-0 text-[10.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Carpeta: {matchedCc?.driveFolder || expense.project}
                </span>
              </div>
            </div>
          )}

          {/* Status / Error messages */}
          {statusMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs text-emerald-900 animate-in fade-in">
              <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-xs text-rose-900 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2.5 rounded-2xl text-xs font-semibold text-slate-700 hover:bg-slate-200 transition cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!newFileBase64 || isProcessing}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-xs transition active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Reemplazando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar y Reemplazar Archivo</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
