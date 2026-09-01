import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  FileCheck,
  Send,
  Upload,
  FileText,
  Trash2,
  Eye,
  Loader2,
  AlertCircle,
  Mail,
  Building,
  CheckCircle2,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { Expense, CostCenter, UserProfile, AppUserRecord } from '../types';
import {
  formatCurrency,
  formatDate,
  generateDriveFileName,
  formatWithholdingEmailSubject,
} from '../utils/helpers';
import { resolveEmailCcRecipients } from '../utils/emailCc';
import {
  uploadReceiptToGoogleDrive,
  sendGmailMessage,
  getStoredWorkspaceToken,
  getStoredWorkspaceUser,
} from '../utils/googleWorkspace';
import { SafePdfViewer } from './SafePdfViewer';

interface WithholdingCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
  costCenters: CostCenter[];
  appUsers?: AppUserRecord[];
  onSaved: (updatedExpense: Expense) => void;
  currentUser?: UserProfile;
  currentUserAccessToken?: string;
}

export function WithholdingCertificateModal({
  isOpen,
  onClose,
  expense,
  costCenters,
  appUsers = [],
  onSaved,
  currentUser,
  currentUserAccessToken,
}: WithholdingCertificateModalProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const matchedCc = expense
    ? costCenters.find((c) => (c.name || '').toLowerCase() === (expense.project || '').toLowerCase())
    : undefined;

  const sigla = matchedCc?.code || expense?.project?.slice(0, 4).toUpperCase() || 'ISF';
  const standardizedBaseName = expense ? generateDriveFileName(expense, costCenters) : 'ISF-Comprobante';

  // Initialize or reset state
  useEffect(() => {
    if (expense && isOpen) {
      setRecipientEmail(expense.submittedByEmail || 'admin@isf-argentina.org');
      setSendEmail(true);
      setCustomNotes('');
      if (expense.withholdingCertificateImage) {
        setFileBase64(expense.withholdingCertificateImage);
        setFileName(expense.withholdingCertificateFileName || 'Certificado_Retenciones.pdf');
        setFileType(
          expense.withholdingCertificateFileName?.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : 'image/png'
        );
      } else {
        setFileBase64(null);
        setFileName(null);
        setFileType(null);
      }
      setIsExecuting(false);
    }
  }, [expense, isOpen]);

  // Handle Ctrl+V paste
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/') || item.type === 'application/pdf') {
          const file = item.getAsFile();
          if (file) {
            handleProcessFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  if (!isOpen || !expense) return null;

  const handleProcessFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setFileBase64(result);
      setFileName(file.name);
      setFileType(file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png'));
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmSave = async () => {
    if (!fileBase64 || !fileName) {
      alert('Por favor adjunta el archivo del Certificado de Retenciones.');
      return;
    }

    setIsExecuting(true);
    const timestamp = new Date().toISOString();
    let finalDriveUrl: string | undefined = expense.withholdingCertificateDriveUrl;

    // 1. Upload to Google Drive in Cost Center folder
    try {
      const certDriveName = `${standardizedBaseName}-CertificadoRetencion-${fileName}`;
      const matchedCenter = costCenters.find(
        (c) => c.name.toLowerCase() === (expense.project || '').toLowerCase()
      );
      const driveRes = await uploadReceiptToGoogleDrive({
        expense,
        costCenter: matchedCenter,
        customFileName: certDriveName,
        fileBase64: fileBase64,
      });
      if (driveRes.success && driveRes.webViewLink) {
        finalDriveUrl = driveRes.webViewLink;
      }
    } catch (err) {
      console.warn('Withholding certificate drive upload notice:', err);
    }

    // 2. Send email notification if enabled
    let emailSent = false;
    if (sendEmail && recipientEmail) {
      try {
        const token = currentUserAccessToken || getStoredWorkspaceToken();
        const user = getStoredWorkspaceUser();
        const subject = formatWithholdingEmailSubject(expense.vendor, expense.amount, expense.currency);
        const recipientName = expense.submittedByName || 'Colaborador / Solicitante';

        const isPdf = fileName.toLowerCase().endsWith('.pdf');
        const isImage = Boolean(fileBase64 && !isPdf);

        const bodyHtml = `<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <div style="border-bottom: 2px solid #f59e0b; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="color: #b45309; margin: 0 0 4px 0; font-size: 20px;">Certificado de Retenciones Impositivas</h2>
            <p style="margin: 0; color: #64748b; font-size: 13px;">Ingeniería Sin Fronteras Argentina · Administración y Finanzas</p>
          </div>

          <p style="font-size: 14px;">Hola <strong>${recipientName}</strong>,</p>
          <p style="font-size: 14px;">Te enviamos adjunto el <strong>Certificado de Retención Impositiva</strong> correspondiente al comprobante de <em>${expense.vendor}</em> por <strong>${formatCurrency(
            expense.amount,
            expense.currency
          )}</strong> (Centro de Costos: <strong>${sigla} - ${expense.project}</strong>).</p>

          <div style="background:#fffbeb; border:1px solid #fde68a; padding:14px; border-radius:10px; margin:16px 0;">
            <p style="margin:0 0 4px; font-weight:bold; color:#92400e; font-size:13px;">📎 Certificado de Retención Adjunto:</p>
            <p style="margin:0; font-size:12px; color:#78350f;">
              Se adjunta la constancia oficial de retención: <strong>${fileName}</strong>.
            </p>
            ${
              isImage
                ? `<div style="margin-top: 10px; text-align: center;">
                    <img src="${fileBase64}" alt="Certificado de Retención" style="max-width: 100%; max-height: 300px; border-radius: 8px; border: 1px solid #cbd5e1;" />
                  </div>`
                : ''
            }
          </div>

          ${
            customNotes
              ? `<div style="background:#f8fafc; border:1px solid #e2e8f0; padding:12px 14px; border-radius:10px; margin:16px 0; font-size:12.5px; color:#334155;">
                  <strong>Mensaje adicional:</strong><br/>${customNotes.replace(/\n/g, '<br/>')}
                </div>`
              : ''
          }

          <p style="margin-top:20px; font-size:13px; color: #475569;">Muchas gracias por tu compromiso.<br/><strong>Área de Administración y Finanzas — ISF Argentina</strong></p>
        </div>`;

        const attachments = [
          {
            filename: fileName,
            contentType: fileType || (isPdf ? 'application/pdf' : 'image/jpeg'),
            base64: fileBase64,
          },
        ];

        const ccRecipients = resolveEmailCcRecipients({
          toEmail: recipientEmail,
          expense,
          costCenters,
          appUsers,
        });

        await sendGmailMessage({
          to: recipientEmail,
          cc: ccRecipients.length > 0 ? ccRecipients : undefined,
          subject,
          bodyHtml,
          accessToken: token || undefined,
          fromName: user?.name || 'ISF Finanzas',
          attachments,
        });
        emailSent = true;
      } catch (emailErr) {
        console.warn('Withholding email send fallback:', emailErr);
      }
    }

    // 3. Update expense object
    const updatedExpense: Expense = {
      ...expense,
      appliesWithholdings: true,
      withholdingCertificateImage: fileBase64,
      withholdingCertificateFileName: fileName,
      withholdingCertificateUploadedAt: timestamp,
      withholdingCertificateDriveUrl: finalDriveUrl,
      withholdingCertificateSentAt: emailSent ? timestamp : expense.withholdingCertificateSentAt,
      updatedAt: timestamp,
    };

    setIsExecuting(false);
    onSaved(updatedExpense);
    onClose();
  };

  const isPdf = fileName?.toLowerCase().endsWith('.pdf');

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white p-6 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/20">
                <FileCheck className="w-5 h-5 text-amber-200" />
              </div>
              <div>
                <h3 className="text-base font-bold tracking-tight">Cargar Certificado de Retenciones</h3>
                <p className="text-xs text-amber-100/90 mt-0.5">
                  Adjunta el certificado impositivo para completar la liquidación y notificar al solicitante
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isExecuting}
              className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
            
            {/* Expense Summary Pill */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-slate-900 text-sm">{expense.vendor}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {sigla}
                  </span>
                </div>
                <div className="text-slate-500 text-[11px] flex items-center space-x-2">
                  <span>Solicitante: <strong>{expense.submittedByName || 'No especificado'}</strong></span>
                  <span>•</span>
                  <span>{formatDate(expense.date)}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-slate-500 font-semibold">Monto del Comprobante</div>
                <div className="text-lg font-extrabold text-slate-900">
                  {formatCurrency(expense.amount, expense.currency)}
                </div>
              </div>
            </div>

            {/* Upload Certificate Dropzone */}
            <div className="p-5 bg-slate-900 text-white rounded-2xl shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        CERTIFICADO DE RETENCIONES (AFIP / ARCA)
                      </h4>
                      <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-amber-950 text-amber-300 border border-amber-500/30">
                        REQUERIDO
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Adjunta el archivo PDF o imagen del certificado (arrastra o pega con Ctrl+V).
                    </p>
                  </div>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleProcessFile(file);
                }}
              />

              {!fileBase64 ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleProcessFile(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center ${
                    isDragging
                      ? 'border-amber-400 bg-amber-950/40 text-amber-200'
                      : 'border-slate-700 hover:border-amber-500/70 hover:bg-slate-800/80 text-slate-300'
                  }`}
                >
                  <Upload className="w-7 h-7 mb-2 text-amber-400" />
                  <p className="text-xs font-semibold">
                    Haz clic para seleccionar o arrastra el archivo aquí
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Formatos: PDF, PNG, JPG (o captura con Ctrl+V)
                  </p>
                </div>
              ) : (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-3.5 flex items-center justify-between">
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 font-bold text-xs">
                      {isPdf ? 'PDF' : 'IMG'}
                    </div>
                    <div className="overflow-hidden">
                      <div className="text-xs font-bold text-white truncate max-w-xs sm:max-w-sm">
                        {fileName}
                      </div>
                      <div className="text-[11px] text-amber-300 font-medium flex items-center space-x-2">
                        <span>Certificado listo para archivar y enviar</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewModalOpen(true)}
                      className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition cursor-pointer"
                      title="Vista previa del certificado"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFileBase64(null);
                        setFileName(null);
                        setFileType(null);
                      }}
                      className="p-2 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 transition cursor-pointer"
                      title="Quitar certificado"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Email Notification Dispatch Options */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer accent-amber-600"
                />
                <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-amber-600" />
                  Enviar email automático con el Certificado al solicitante
                </span>
              </label>

              {sendEmail && (
                <div className="pl-6 space-y-2.5 pt-1 animate-in fade-in duration-150 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Destinatario:
                    </label>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-amber-500 outline-hidden"
                      placeholder="correo@isf-argentina.org"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Asunto que se enviará:
                    </label>
                    <div className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-mono text-[11px] text-slate-800 truncate">
                      {formatWithholdingEmailSubject(expense.vendor, expense.amount, expense.currency)}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Mensaje / aclaración adicional (opcional):
                    </label>
                    <textarea
                      rows={2}
                      value={customNotes}
                      onChange={(e) => setCustomNotes(e.target.value)}
                      placeholder="Ej: Se adjunta retención de Ganancias/IIBB correspondiente al periodo..."
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-amber-500 outline-hidden"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Status Transition Notice */}
            <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl text-xs flex items-center space-x-2 text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Al guardar el certificado, este gasto cambiará su estado a <strong className="text-emerald-800">Pagado (verde)</strong> definitivo.
              </span>
            </div>

          </div>

          {/* Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={isExecuting}
              className="px-4 py-2.5 text-slate-600 hover:text-slate-900 text-xs font-semibold rounded-xl hover:bg-slate-200 transition cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleConfirmSave}
              disabled={isExecuting || !fileBase64}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-2xl text-xs sm:text-sm font-bold shadow-xs transition active:scale-95 flex items-center space-x-2 cursor-pointer"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando y Notificando...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1" />
                  <span>Guardar y Enviar Certificado</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Full Preview Sub-modal */}
      {previewModalOpen && fileBase64 && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <span className="text-xs font-bold truncate">Vista Previa: {fileName}</span>
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex items-center justify-center flex-1 bg-slate-100 min-h-[350px]">
              {isPdf ? (
                <div className="w-full">
                  <SafePdfViewer
                    url={fileBase64}
                    fileName={fileName || 'certificado.pdf'}
                    title="Certificado de Retenciones"
                    heightClass="h-96"
                  />
                </div>
              ) : (
                <img
                  src={fileBase64}
                  alt="Certificado de Retenciones"
                  className="max-h-[70vh] object-contain rounded-xl shadow-md"
                />
              )}
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold"
              >
                Cerrar Vista Previa
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
