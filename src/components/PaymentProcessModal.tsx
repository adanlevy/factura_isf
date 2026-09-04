import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  CreditCard,
  Send,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Receipt,
  Upload,
  FileText,
  Trash2,
  Eye,
  FileSpreadsheet,
} from 'lucide-react';
import { Expense, CostCenter, UserProfile, AppUserRecord } from '../types';
import { formatCurrency, generateDriveFileName, formatPaymentEmailSubject, formatTransferDetails } from '../utils/helpers';
import { resolveEmailCcRecipients } from '../utils/emailCc';
import {
  uploadReceiptToGoogleDrive,
  sendGmailMessage,
  getStoredWorkspaceToken,
  getStoredWorkspaceUser,
  extractDriveFileId,
} from '../utils/googleWorkspace';
import { cachePaymentProofFile } from '../utils/receiptCache';
import { SafePdfViewer } from './SafePdfViewer';

interface PaymentProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
  costCenters: CostCenter[];
  appUsers?: AppUserRecord[];
  onPaymentCompleted: (updatedExpense: Expense) => void;
  currentUser?: UserProfile;
  currentUserAccessToken?: string;
}

export function PaymentProcessModal({
  isOpen,
  onClose,
  expense,
  costCenters,
  appUsers = [],
  onPaymentCompleted,
  currentUser,
  currentUserAccessToken,
}: PaymentProcessModalProps) {
  const [isExecuting, setIsExecuting] = useState(false);

  // Withholding tax checkbox state
  const [appliesWithholdings, setAppliesWithholdings] = useState(false);

  // Payment proof / voucher attachment state (Optional)
  const [paymentProofBase64, setPaymentProofBase64] = useState<string | null>(null);
  const [paymentProofFileName, setPaymentProofFileName] = useState<string | null>(null);
  const [paymentProofFileType, setPaymentProofFileType] = useState<string | null>(null);
  const [isDraggingProof, setIsDraggingProof] = useState(false);
  const [previewProofModal, setPreviewProofModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const matchedCc = expense
    ? costCenters.find((c) => (c.name || '').toLowerCase() === (expense.project || '').toLowerCase())
    : undefined;

  const sigla = matchedCc?.code || expense?.project?.slice(0, 4).toUpperCase() || 'ISF';
  const folderName = matchedCc?.driveFolder || `${expense?.project || 'General'} 2026`;
  const folderUrl =
    matchedCc?.driveUrl ||
    `https://drive.google.com/drive/search?q=${encodeURIComponent(folderName)}`;

  // Extension detection for original invoice
  let fileExt = 'png';
  if (expense?.receiptFileName?.toLowerCase().endsWith('.svg')) fileExt = 'svg';
  else if (expense?.receiptFileName?.toLowerCase().endsWith('.pdf')) fileExt = 'pdf';
  else if (
    expense?.receiptFileName?.toLowerCase().endsWith('.jpg') ||
    expense?.receiptFileName?.toLowerCase().endsWith('.jpeg')
  )
    fileExt = 'jpg';

  const standardizedBaseName = expense ? generateDriveFileName(expense, costCenters) : 'ISF-Comprobante';
  const normalizedFileName = `${standardizedBaseName}.${fileExt}`;

  const recipientEmail = expense?.submittedByEmail || 'admin@isf-argentina.org';
  const recipientName = expense?.submittedByName || 'Colaborador / Solicitante';
  const hasBankData = Boolean(
    expense?.bankDetails?.cbuCvu || expense?.bankDetails?.alias || expense?.bankDetails?.bankName
  );

  // File loading helper
  const handleProcessFile = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setPaymentProofBase64(result);
      setPaymentProofFileName(file.name);
      setPaymentProofFileType(file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'));
    };
    reader.readAsDataURL(file);
  };

  // Clipboard paste listener for fast screenshot pasting (Ctrl+V)
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const namedFile = new File(
              [file],
              `Comprobante_Transferencia_${Date.now()}.png`,
              { type: file.type }
            );
            handleProcessFile(namedFile);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  // Sync state when modal opens or expense changes
  useEffect(() => {
    if (expense && isOpen) {
      setAppliesWithholdings(Boolean(expense.appliesWithholdings));
      if (expense.paymentProofImage) {
        setPaymentProofBase64(expense.paymentProofImage);
        setPaymentProofFileName(expense.paymentProofFileName || 'Comprobante_Pago.png');
        setPaymentProofFileType(
          expense.paymentProofFileName?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png'
        );
      } else {
        setPaymentProofBase64(null);
        setPaymentProofFileName(null);
        setPaymentProofFileType(null);
      }
      setIsExecuting(false);
    }
  }, [expense, isOpen]);

  if (!isOpen || !expense) return null;

  const handleConfirmPayment = async () => {
    setIsExecuting(true);

    const timestamp = new Date().toISOString();
    let finalPaymentProofUrl: string | undefined = undefined;

    // 1. Upload payment proof to Google Drive if attached (deleting old proof if replacing)
    if (paymentProofBase64 && paymentProofFileName) {
      try {
        const proofDriveName = `${standardizedBaseName}-ComprobantePago-${paymentProofFileName}`;
        const matchedCenter = costCenters.find(
          (c) => c.name.toLowerCase() === (expense.project || '').toLowerCase()
        );
        const oldFileId = extractDriveFileId(expense.paymentProofDriveUrl) || undefined;
        const oldFileName = expense.paymentProofFileName
          ? (expense.paymentProofFileName.startsWith(standardizedBaseName)
              ? expense.paymentProofFileName
              : `${standardizedBaseName}-ComprobantePago-${expense.paymentProofFileName}`)
          : undefined;

        const driveRes = await uploadReceiptToGoogleDrive({
          expense,
          costCenter: matchedCenter,
          customFileName: proofDriveName,
          fileBase64: paymentProofBase64,
          oldFileId,
          oldFileName,
        });
        if (driveRes.success && driveRes.webViewLink) {
          finalPaymentProofUrl = driveRes.webViewLink;
        }
      } catch (err) {
        console.warn('Payment proof drive upload notice:', err);
      }

      // Cache updated payment proof for immediate preview rendering
      cachePaymentProofFile(expense.id, paymentProofBase64).catch(() => {});
    }

    // 2. Build email and send confirmation to submitter
    const isPdfProof = paymentProofFileName?.toLowerCase().endsWith('.pdf');
    const isImageProof = Boolean(paymentProofBase64 && !isPdfProof);

    const cleanPaymentType = (expense.paymentType || expense.paymentMethod || '').trim().toUpperCase();
    const isVendorPayment =
      cleanPaymentType === 'PAGO_PROVEEDOR' ||
      cleanPaymentType === 'PAGO A PROVEEDOR' ||
      cleanPaymentType === 'PROVEEDOR' ||
      cleanPaymentType === 'TRANSFERENCIA PROVEEDOR' ||
      expense.paymentMethod === 'Pago a Proveedor' ||
      expense.paymentMethod === 'Pago a proveedor';

    const emailSubject = formatPaymentEmailSubject(
      expense.vendor,
      expense.amount,
      expense.currency,
      isVendorPayment ? 'PAGO_PROVEEDOR' : 'REINTEGRO'
    );

    const emailHeaderTitle = isVendorPayment ? 'Confirmación de Pago a Proveedor' : 'Confirmación de Reintegro Liquidado';
    const emailPaymentSentence = isVendorPayment
      ? `Te confirmamos que el pago a proveedor por <strong>${formatCurrency(
          expense.amount,
          expense.currency
        )}</strong> correspondiente al comprobante de <em>${expense.vendor}</em> (Centro de Costos: <strong>${sigla} - ${expense.project}</strong>) ha sido <strong>transferido y ejecutado con éxito</strong>.`
      : `Te confirmamos que el reintegro por <strong>${formatCurrency(
          expense.amount,
          expense.currency
        )}</strong> correspondiente a tu comprobante de <em>${expense.vendor}</em> (Centro de Costos: <strong>${sigla} - ${expense.project}</strong>) ha sido <strong>transferido y liquidado con éxito</strong>.`;

    const emailBodyHtml = `<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="color: #065f46; margin: 0 0 4px 0; font-size: 20px;">${emailHeaderTitle}</h2>
        <p style="margin: 0; color: #64748b; font-size: 13px;">Ingeniería Sin Fronteras Argentina · Administración y Finanzas</p>
      </div>

      <p style="font-size: 14px;">Hola <strong>${recipientName}</strong>,</p>
      <p style="font-size: 14px;">${emailPaymentSentence}</p>

      ${
        hasBankData && expense.bankDetails
          ? `<div style="background:#f8fafc; border:1px solid #e2e8f0; padding:14px; border-radius:10px; margin:16px 0;">
        <p style="margin:0 0 6px; font-weight:bold; color:#0f172a; font-size:13px;">Detalles de la transferencia:</p>
        <ul style="margin:0; padding-left:20px; font-size:12.5px; color:#334155; line-height: 1.6;">
          ${expense.bankDetails.alias ? `<li><strong>Alias:</strong> ${expense.bankDetails.alias}</li>` : ''}
          ${expense.bankDetails.cbuCvu ? `<li><strong>CBU / CVU:</strong> ${expense.bankDetails.cbuCvu}</li>` : ''}
          ${expense.bankDetails.bankName ? `<li><strong>Banco:</strong> ${expense.bankDetails.bankName}</li>` : ''}
          ${expense.bankDetails.accountHolder ? `<li><strong>Titular:</strong> ${expense.bankDetails.accountHolder}</li>` : ''}
        </ul>
      </div>`
          : ''
      }

      ${
        paymentProofFileName
          ? `<div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:14px; border-radius:10px; margin:16px 0;">
        <p style="margin:0 0 4px; font-weight:bold; color:#065f46; font-size:13px;">📎 Comprobante de Transferencia Adjunto:</p>
        <p style="margin:0; font-size:12px; color:#047857;">
          Se adjunta la constancia de transferencia bancaria: <strong>${paymentProofFileName}</strong>.
        </p>
        ${
          isImageProof
            ? `<div style="margin-top: 10px; text-align: center;">
                <img src="${paymentProofBase64}" alt="Comprobante de Pago" style="max-width: 100%; max-height: 300px; border-radius: 8px; border: 1px solid #cbd5e1;" />
              </div>`
            : ''
        }
      </div>`
          : ''
      }

      ${
        appliesWithholdings
          ? `<div style="background:#fffbeb; border:1px solid #fde68a; padding:12px 14px; border-radius:10px; margin:16px 0; font-size:12px; color:#92400e;">
        ℹ️ <strong>Nota sobre retenciones:</strong> Este pago aplica retenciones impositivas. El Certificado de Retención correspondiente será remitido por correo una vez emitido administrativamente.
      </div>`
          : ''
      }

      <p style="margin-top:20px; font-size:13px; color: #475569;">Muchas gracias por tu compromiso.<br/><strong>Área de Administración y Finanzas — ISF Argentina</strong></p>
    </div>`;

    try {
      const token = currentUserAccessToken || getStoredWorkspaceToken();
      const user = getStoredWorkspaceUser();

      const attachments = paymentProofBase64 && paymentProofFileName
        ? [
            {
              filename: paymentProofFileName,
              contentType: paymentProofFileType || (paymentProofFileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
              base64: paymentProofBase64,
            },
          ]
        : undefined;

      const ccRecipients = resolveEmailCcRecipients({
        toEmail: recipientEmail,
        expense,
        costCenters,
        appUsers,
      });

      await sendGmailMessage({
        to: recipientEmail,
        cc: ccRecipients.length > 0 ? ccRecipients : undefined,
        subject: emailSubject,
        bodyHtml: emailBodyHtml,
        accessToken: token || undefined,
        fromName: user?.name || 'ISF Finanzas',
        attachments,
      });
    } catch (emailErr) {
      console.warn('Email notification error fallback:', emailErr);
    }

    // 3. Update expense model
    const currentTransferSnapshot =
      expense.transferDetails ||
      formatTransferDetails(expense) ||
      (expense.bankDetails ? formatTransferDetails({ bankDetails: expense.bankDetails, vendor: expense.vendor, cuit: expense.cuit }) : '');

    const updatedExpense: Expense = {
      ...expense,
      reimbursementStatus: 'REIMBURSED',
      reimbursedAt: timestamp.slice(0, 10),
      paymentConfirmedAt: timestamp,
      updatedAt: timestamp,
      transferDetails: currentTransferSnapshot || expense.transferDetails,
      appliesWithholdings: appliesWithholdings,
      paymentProofImage: paymentProofBase64 || expense.paymentProofImage,
      paymentProofFileName: paymentProofFileName || expense.paymentProofFileName,
      paymentProofAt: paymentProofBase64 ? timestamp : expense.paymentProofAt,
      paymentProofDriveUrl: finalPaymentProofUrl || expense.paymentProofDriveUrl,
      driveUploadedFileName: expense.driveUploadedFileName || normalizedFileName,
      driveFolderTarget: expense.driveFolderTarget || folderName,
      driveUploadedUrl: expense.driveUploadedUrl || folderUrl,
      driveUploadStatus: expense.driveUploadStatus || 'SUCCESS',
      driveUploadedAt: expense.driveUploadedAt || timestamp,
    };

    setIsExecuting(false);
    onPaymentCompleted(updatedExpense);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-xs">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white tracking-tight">
                  Pagar Comprobante y Liquidar Reintegro
                </h3>
                <p className="text-xs text-slate-300">
                  {expense.vendor} • {formatCurrency(expense.amount, expense.currency)}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isExecuting}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Body */}
          <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            
            {/* Top Summary Card */}
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Comercio / Proveedor:</span>
                <strong className="text-slate-900 font-bold text-sm block">{expense.vendor}</strong>
                {expense.invoiceNumber && (
                  <span className="text-slate-500 block font-mono text-[11px]">
                    N° {expense.invoiceNumber}
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Monto a Liquidar:</span>
                <strong className="text-emerald-600 font-extrabold text-lg block">
                  {formatCurrency(expense.amount, expense.currency)}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Centro de Costos:</span>
                <div className="flex items-center space-x-1.5 font-semibold text-slate-800">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {sigla}
                  </span>
                  <span className="truncate">{expense.project}</span>
                </div>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Solicitante del Reintegro:</span>
                <strong className="text-slate-800 block">{recipientName}</strong>
                <span className="text-slate-500 block text-[11px] truncate">{recipientEmail}</span>
              </div>
            </div>

            {/* Bank Data Details Banner */}
            {hasBankData ? (
              <div className="p-4 bg-emerald-50/90 border border-emerald-200 rounded-2xl text-xs space-y-1">
                <div className="font-bold text-emerald-950 flex items-center">
                  <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600 shrink-0" />
                  <span>Datos bancarios registrados para transferir:</span>
                </div>
                <div className="text-emerald-900 font-mono text-xs pl-6 font-medium">
                  {expense.bankDetails?.alias && (
                    <span>Alias: <strong className="text-emerald-950">{expense.bankDetails.alias}</strong></span>
                  )}
                  {expense.bankDetails?.cbuCvu && (
                    <span>{expense.bankDetails?.alias ? ' • ' : ''}CBU/CVU: <strong className="text-emerald-950">{expense.bankDetails.cbuCvu}</strong></span>
                  )}
                  {expense.bankDetails?.bankName && (
                    <span> ({expense.bankDetails.bankName})</span>
                  )}
                  {expense.bankDetails?.accountHolder && (
                    <span> • Titular: <strong>{expense.bankDetails.accountHolder}</strong></span>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3.5 bg-amber-50 border border-amber-200/90 rounded-2xl text-xs space-y-1">
                <div className="font-bold text-amber-900 flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-1.5 text-amber-600 shrink-0" />
                  <span>Comprobante sin datos bancarios registrados</span>
                </div>
                <p className="text-amber-800 text-[11px] pl-5.5">
                  Puedes confirmar la liquidación directamente si se realizó el pago en efectivo o por otro canal.
                </p>
              </div>
            )}

            {/* The single clean Voucher upload card */}
            <div className="p-5 bg-slate-900 text-white rounded-2xl shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        CARGAR COMPROBANTE DE PAGO / TRANSFERENCIA
                      </h4>
                      <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-slate-800 text-emerald-400 border border-emerald-500/30">
                        OPCIONAL
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Adjunta la constancia de transferencia bancaria (PNG, JPG, PDF o captura con Ctrl+V). Se incluirá en el email.
                    </p>
                  </div>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleProcessFile(file);
                }}
              />

              {!paymentProofBase64 ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingProof(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingProof(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent?.stopImmediatePropagation?.();
                    setIsDraggingProof(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleProcessFile(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                    isDraggingProof
                      ? 'border-emerald-400 bg-emerald-950/40 text-emerald-200'
                      : 'border-slate-700 bg-slate-800/60 hover:bg-slate-800 hover:border-emerald-500 text-slate-300'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-slate-700/80 text-emerald-400 flex items-center justify-center">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div className="text-xs">
                      <strong className="text-white font-semibold">Haz clic para seleccionar comprobante</strong> o arrastra el archivo aquí
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      <span>PNG, JPG, PDF</span>
                      <span>•</span>
                      <span>💡 También puedes presionar <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-white font-mono text-[10px] font-bold">ctrl+v</kbd> para pegar captura</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-slate-800 rounded-xl border border-emerald-500/40 flex items-center justify-between gap-3">
                  <div className="flex items-center space-x-3 min-w-0">
                    {paymentProofFileType === 'application/pdf' ? (
                      <div className="w-11 h-11 rounded-lg bg-rose-950/60 border border-rose-700/60 text-rose-400 flex items-center justify-center shrink-0">
                        <FileText className="w-6 h-6" />
                      </div>
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-slate-700 overflow-hidden shrink-0 border border-slate-600">
                        <img
                          src={paymentProofBase64}
                          alt="Preview Comprobante"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                        <span className="truncate">{paymentProofFileName}</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      </div>
                      <div className="text-[11px] text-emerald-300 font-medium">
                        Comprobante cargado • Se adjuntará al correo de notificación y quedará archivado
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewProofModal(true)}
                      className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition cursor-pointer"
                      title="Ver vista previa"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition cursor-pointer"
                      title="Reemplazar archivo"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentProofBase64(null);
                        setPaymentProofFileName(null);
                        setPaymentProofFileType(null);
                      }}
                      className="p-2 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 transition cursor-pointer"
                      title="Quitar comprobante"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Aplica Retenciones Checkbox Section */}
            <div className={`p-4 rounded-2xl border transition-all ${
              appliesWithholdings
                ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-400/40 shadow-xs'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
            }`}>
              <label className="flex items-start space-x-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={appliesWithholdings}
                  onChange={(e) => setAppliesWithholdings(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer accent-amber-600"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-xs text-slate-900">
                      Aplica Retenciones
                    </span>
                    {appliesWithholdings && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300 animate-in fade-in duration-150">
                        Pendiente Certificado
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-slate-600 mt-0.5 leading-relaxed">
                    Si está marcado, el comprobante se registrará como <strong className="text-amber-800 font-semibold">Pagado - Pend. Retención</strong> (naranja). Podrás adjuntar el Certificado de Retenciones en los próximos días desde Gestión Pagos para pasar a estado Pagado definitivo y notificar al solicitante.
                  </p>
                </div>
              </label>
            </div>

          </div>

          {/* Clean Modal Footer */}
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
              onClick={handleConfirmPayment}
              disabled={isExecuting}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl text-xs sm:text-sm font-bold shadow-xs transition active:scale-95 flex items-center space-x-2 cursor-pointer"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Liquidando Pago...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1" />
                  <span>Confirmar Pago</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Sub-modal: Full View Preview of uploaded payment proof */}
      {previewProofModal && paymentProofBase64 && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Receipt className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs">{paymentProofFileName}</span>
              </div>
              <button
                onClick={() => setPreviewProofModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-slate-100 min-h-[300px]">
              {paymentProofFileType === 'application/pdf' ? (
                <SafePdfViewer url={paymentProofBase64} fileName={paymentProofFileName || 'comprobante.pdf'} />
              ) : (
                <img
                  src={paymentProofBase64}
                  alt="Comprobante de pago"
                  className="max-h-[70vh] max-w-full object-contain rounded-xl shadow-md"
                />
              )}
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setPreviewProofModal(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
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

