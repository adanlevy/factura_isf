import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  CreditCard,
  Send,
  Loader2,
  Receipt,
  Upload,
  FileText,
  Trash2,
  Eye,
  CheckCircle2,
  Users,
  AlertCircle,
  Building2,
  FolderKanban,
  Check,
} from 'lucide-react';
import { Expense, CostCenter, UserProfile, AppUserRecord, Vendor } from '../types';
import {
  formatCurrency,
  formatDate,
  formatPaymentEmailSubject,
  formatTransferDetails,
  generateDriveFileName,
} from '../utils/helpers';
import { resolveEmailCcRecipients } from '../utils/emailCc';
import {
  uploadReceiptToGoogleDrive,
  sendGmailMessage,
  getStoredWorkspaceToken,
  getStoredWorkspaceUser,
  extractDriveFileId,
} from '../utils/googleWorkspace';
import { cachePaymentProofFile } from '../utils/receiptCache';

interface BatchPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  expenses: Expense[];
  costCenters: CostCenter[];
  vendors?: Vendor[];
  appUsers?: AppUserRecord[];
  currentUser?: UserProfile;
  currentUserAccessToken?: string;
  onPaymentCompleted: (updatedExpenses: Expense[], emailsSentCount: number) => Promise<void> | void;
}

interface RecipientGroup {
  email: string;
  name: string;
  expenses: Expense[];
  totalAmount: number;
  ccRecipients: string[];
}

export function BatchPaymentModal({
  isOpen,
  onClose,
  expenses,
  costCenters,
  vendors = [],
  appUsers = [],
  currentUser,
  currentUserAccessToken,
  onPaymentCompleted,
}: BatchPaymentModalProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStep, setExecutionStep] = useState<string>('');
  const [sendEmails, setSendEmails] = useState(true);
  const [appliesWithholdings, setAppliesWithholdings] = useState(false);

  // Shared payment proof voucher (optional)
  const [paymentProofBase64, setPaymentProofBase64] = useState<string | null>(null);
  const [paymentProofFileName, setPaymentProofFileName] = useState<string | null>(null);
  const [paymentProofFileType, setPaymentProofFileType] = useState<string | null>(null);
  const [isDraggingProof, setIsDraggingProof] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setIsExecuting(false);
      setExecutionStep('');
      setSendEmails(true);
      setAppliesWithholdings(false);
      setPaymentProofBase64(null);
      setPaymentProofFileName(null);
      setPaymentProofFileType(null);
    }
  }, [isOpen]);

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
              `Comprobante_Transferencia_Lote_${Date.now()}.png`,
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

  const handleProcessFile = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setPaymentProofBase64(result);
      setPaymentProofFileName(file.name);
      setPaymentProofFileType(
        file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')
      );
    };
    reader.readAsDataURL(file);
  };

  // Group pending expenses by submitter
  const recipientGroups: RecipientGroup[] = useMemo(() => {
    const map = new Map<string, { name: string; expenses: Expense[] }>();

    for (const exp of expenses) {
      const email = (exp.submittedByEmail || 'admin@isf-argentina.org').trim().toLowerCase();
      const name = exp.submittedByName || exp.submittedByEmail?.split('@')[0] || 'Solicitante';

      if (!map.has(email)) {
        map.set(email, { name, expenses: [] });
      }
      map.get(email)!.expenses.push(exp);
    }

    return Array.from(map.entries()).map(([email, data]) => {
      const totalAmount = data.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      const ccRecipients = resolveEmailCcRecipients({
        toEmail: email,
        expenses: data.expenses,
        costCenters,
        appUsers,
      });

      return {
        email,
        name: data.name,
        expenses: data.expenses,
        totalAmount,
        ccRecipients,
      };
    });
  }, [expenses, costCenters, appUsers]);

  const totalAmount = useMemo(() => {
    return expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [expenses]);

  if (!isOpen || expenses.length === 0) return null;

  const handleConfirmBatchPayment = async () => {
    setIsExecuting(true);
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.slice(0, 10);
    const token = currentUserAccessToken || getStoredWorkspaceToken();
    const workspaceUser = getStoredWorkspaceUser();

    let emailsSentCount = 0;

    // Common attachments if proof uploaded
    const attachments = paymentProofBase64 && paymentProofFileName
      ? [
          {
            filename: paymentProofFileName,
            contentType:
              paymentProofFileType ||
              (paymentProofFileName.toLowerCase().endsWith('.pdf')
                ? 'application/pdf'
                : 'image/jpeg'),
            base64: paymentProofBase64,
          },
        ]
      : undefined;

    const isPdfProof = paymentProofFileName?.toLowerCase().endsWith('.pdf');
    const isImageProof = Boolean(paymentProofBase64 && !isPdfProof);

    // 1. Send emails to each recipient group if enabled
    if (sendEmails && recipientGroups.length > 0) {
      for (let i = 0; i < recipientGroups.length; i++) {
        const group = recipientGroups[i];
        setExecutionStep(`Enviando correo (${i + 1}/${recipientGroups.length}) a ${group.name}...`);

        try {
          const isSingle = group.expenses.length === 1;
          const firstExp = group.expenses[0];

          const allAreVendorPayments = group.expenses.every((e) => {
            const t = (e.paymentType || e.paymentMethod || '').trim().toUpperCase();
            return t === 'PAGO_PROVEEDOR' || t === 'PAGO A PROVEEDOR' || t === 'PROVEEDOR' || e.paymentMethod === 'Pago a Proveedor';
          });
          const allAreReimbursements = group.expenses.every((e) => {
            const t = (e.paymentType || e.paymentMethod || '').trim().toUpperCase();
            return t === 'REINTEGRO' || t === 'REEMBOLSO' || e.paymentMethod === 'Reintegro';
          });

          // Subject
          let emailSubject: string;
          if (isSingle) {
            emailSubject = formatPaymentEmailSubject(
              firstExp.vendor,
              firstExp.amount,
              firstExp.currency,
              firstExp.paymentType || firstExp.paymentMethod
            );
          } else if (allAreVendorPayments) {
            emailSubject = `[Pagos] Proveedores Liquidados: ${group.expenses.length} comprobantes - Total ${formatCurrency(group.totalAmount)}`;
          } else if (allAreReimbursements) {
            emailSubject = `[Pagos] Reintegros Liquidados: ${group.expenses.length} comprobantes - Total ${formatCurrency(group.totalAmount)}`;
          } else {
            emailSubject = `[Pagos] Comprobantes Liquidados: ${group.expenses.length} comprobantes - Total ${formatCurrency(group.totalAmount)}`;
          }

          const headerTitle = allAreVendorPayments
            ? 'Confirmación de Pago(s) a Proveedor(es)'
            : allAreReimbursements
            ? 'Confirmación de Reintegro(s) Liquidado(s)'
            : 'Confirmación de Pago y Liquidación';

          const descriptorText = allAreVendorPayments
            ? 'el pago a proveedor'
            : allAreReimbursements
            ? 'el reintegro'
            : 'el pago';

          // Expenses breakdown HTML table
          const expensesRows = group.expenses
            .map((e) => {
              const matchedCc = costCenters.find(
                (c) => (c.name || '').toLowerCase() === (e.project || '').toLowerCase()
              );
              const sigla = matchedCc?.code || e.project?.slice(0, 4).toUpperCase() || 'ISF';

              return `<tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12.5px; color: #334155;">${formatDate(e.date)}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12.5px; font-weight: bold; color: #0f172a;">${e.vendor}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569;">${sigla} · ${e.project}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">${e.invoiceNumber || '-'}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: bold; text-align: right; color: #065f46;">${formatCurrency(e.amount, e.currency)}</td>
              </tr>`;
            })
            .join('');

          // Consolidated bank details
          const sampleBank = group.expenses.find((e) => e.bankDetails)?.bankDetails;

          const emailBodyHtml = `<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6; max-width: 650px; margin: 0 auto; background: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 20px;">
              <h2 style="color: #065f46; margin: 0 0 4px 0; font-size: 20px;">${headerTitle}</h2>
              <p style="margin: 0; color: #64748b; font-size: 13px;">Ingeniería Sin Fronteras Argentina · Administración y Finanzas</p>
            </div>

            <p style="font-size: 14px;">Hola <strong>${group.name}</strong>,</p>
            <p style="font-size: 14px;">
              Te confirmamos que se ha(n) <strong>transferido y liquidado con éxito</strong> ${
                isSingle
                  ? `${descriptorText} por <strong>${formatCurrency(group.totalAmount)}</strong> correspondiente a tu comprobante de <em>${firstExp.vendor}</em>.`
                  : `<strong>${group.expenses.length} comprobantes</strong> por un total de <strong>${formatCurrency(group.totalAmount)}</strong>.`
              }
            </p>

            <div style="margin: 18px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
              <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                  <tr style="background: #f8fafc; border-bottom: 2px solid #cbd5e1;">
                    <th style="padding: 8px 12px; font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase;">Fecha</th>
                    <th style="padding: 8px 12px; font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase;">Proveedor</th>
                    <th style="padding: 8px 12px; font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase;">Proyecto</th>
                    <th style="padding: 8px 12px; font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase;">Nro Factura</th>
                    <th style="padding: 8px 12px; font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase; text-align: right;">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  ${expensesRows}
                </tbody>
                <tfoot>
                  <tr style="background: #ecfdf5;">
                    <td colspan="4" style="padding: 10px 12px; font-size: 13px; font-weight: bold; color: #065f46;">TOTAL LIQUIDADO</td>
                    <td style="padding: 10px 12px; font-size: 14px; font-weight: 800; text-align: right; color: #065f46;">${formatCurrency(group.totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            ${
              sampleBank
                ? `<div style="background:#f8fafc; border:1px solid #e2e8f0; padding:14px; border-radius:10px; margin:16px 0;">
              <p style="margin:0 0 6px; font-weight:bold; color:#0f172a; font-size:13px;">Detalles de la transferencia bancaria:</p>
              <ul style="margin:0; padding-left:20px; font-size:12.5px; color:#334155; line-height: 1.6;">
                ${sampleBank.alias ? `<li><strong>Alias:</strong> ${sampleBank.alias}</li>` : ''}
                ${sampleBank.cbuCvu ? `<li><strong>CBU / CVU:</strong> ${sampleBank.cbuCvu}</li>` : ''}
                ${sampleBank.bankName ? `<li><strong>Banco:</strong> ${sampleBank.bankName}</li>` : ''}
                ${sampleBank.accountHolder ? `<li><strong>Titular:</strong> ${sampleBank.accountHolder}</li>` : ''}
              </ul>
            </div>`
                : ''
            }

            ${
              paymentProofFileName
                ? `<div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:14px; border-radius:10px; margin:16px 0;">
              <p style="margin:0 0 4px; font-weight:bold; color:#065f46; font-size:13px;">📎 Comprobante de Transferencia Bancaria Adjunto:</p>
              <p style="margin:0; font-size:12px; color:#047857;">
                Se adjunta la constancia de pago de la transferencia: <strong>${paymentProofFileName}</strong>.
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
              ℹ️ <strong>Nota sobre retenciones:</strong> Esta liquidación aplica retenciones impositivas. El Certificado de Retención correspondiente será remitido por correo una vez emitido administrativamente.
            </div>`
                : ''
            }

            <p style="margin-top:24px; font-size:13px; color: #475569;">Muchas gracias por tu compromiso.<br/><strong>Área de Administración y Finanzas — ISF Argentina</strong></p>
          </div>`;

          await sendGmailMessage({
            to: group.email,
            cc: group.ccRecipients.length > 0 ? group.ccRecipients : undefined,
            subject: emailSubject,
            bodyHtml: emailBodyHtml,
            accessToken: token || undefined,
            fromName: workspaceUser?.name || currentUser?.name || 'ISF Finanzas',
            attachments,
          });

          emailsSentCount++;
        } catch (emailErr) {
          console.warn(`[Batch Payment] Notice sending email to ${group.email}:`, emailErr);
        }
      }
    }

    // 2. Prepare updated expenses list
    setExecutionStep('Actualizando estados de liquidación en el sistema...');

    const updatedExpenses: Expense[] = expenses.map((e) => {
      const matchingVendor = vendors.find(
        (v) => (v.name || '').trim().toLowerCase() === (e.vendor || '').trim().toLowerCase()
      );
      const transferSnapshot = e.transferDetails || formatTransferDetails(e, matchingVendor);

      return {
        ...e,
        reimbursementStatus: 'REIMBURSED' as const,
        reimbursedAt: todayStr,
        paymentConfirmedAt: nowIso,
        transferDetails: transferSnapshot || e.transferDetails,
        paymentProofImage: paymentProofBase64 || e.paymentProofImage,
        paymentProofFileName: paymentProofFileName || e.paymentProofFileName,
        appliesWithholdings: appliesWithholdings || e.appliesWithholdings,
        updatedAt: nowIso,
      };
    });

    // Cache payment proof if attached
    if (paymentProofBase64) {
      for (const exp of updatedExpenses) {
        cachePaymentProofFile(exp.id, paymentProofBase64).catch(() => {});
      }
    }

    // 3. Complete payment callback
    await onPaymentCompleted(updatedExpenses, emailsSentCount);
    setIsExecuting(false);
    onClose();
  };

  return (
    <div
      id="batch-payment-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in"
    >
      <div
        id="batch-payment-modal-container"
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-white/15 text-white backdrop-blur-xs">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Liquidación y Pago en Lote</h2>
              <p className="text-xs text-emerald-100">
                Pagar y notificar múltiples comprobantes seleccionados
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExecuting}
            className="p-1.5 rounded-xl hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-slate-800 text-sm">
          {/* Summary Banner */}
          <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                Total a Liquidar ({expenses.length} comprobante{expenses.length !== 1 ? 's' : ''})
              </span>
              <div className="text-2xl font-black text-emerald-700 tracking-tight mt-0.5">
                {formatCurrency(totalAmount)}
              </div>
            </div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-800 bg-white/80 border border-emerald-200 px-3 py-1.5 rounded-xl self-start sm:self-auto">
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                {recipientGroups.length} solicitante{recipientGroups.length !== 1 ? 's' : ''} destinatario{recipientGroups.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Email Notification Option */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/70 space-y-3">
            <label className="flex items-start space-x-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sendEmails}
                onChange={(e) => setSendEmails(e.target.checked)}
                disabled={isExecuting}
                className="mt-0.5 w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
              />
              <div>
                <span className="font-bold text-slate-900 text-xs sm:text-sm flex items-center space-x-1.5">
                  <span>Enviar aviso de liquidación por email a los solicitantes</span>
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold">
                    Recomendado
                  </span>
                </span>
                <p className="text-[11.5px] text-slate-500 mt-0.5">
                  Cada solicitante recibirá un correo formal con el desglose de sus comprobantes pagados, datos bancarios y el comprobante adjunto.
                </p>
              </div>
            </label>

            {/* Recipient Groups Breakdown Preview */}
            {sendEmails && (
              <div className="pt-2 border-t border-slate-200/80 space-y-2">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                  Destinatarios ({recipientGroups.length}):
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {recipientGroups.map((g) => (
                    <div
                      key={g.email}
                      className="bg-white border border-slate-200 rounded-xl p-2.5 text-xs flex items-center justify-between shadow-2xs"
                    >
                      <div className="min-w-0 flex-1 mr-2">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-slate-900 truncate">{g.name}</span>
                          <span className="text-slate-400 text-[11px] truncate">({g.email})</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10.5px] text-slate-500">
                          <span className="bg-slate-100 px-1.5 py-0.2 rounded font-medium text-slate-600">
                            {g.expenses.length} comprobante{g.expenses.length !== 1 ? 's' : ''}
                          </span>
                          {g.ccRecipients.length > 0 && (
                            <span className="text-slate-400 truncate" title={`CC: ${g.ccRecipients.join(', ')}`}>
                              CC: {g.ccRecipients.length} en copia
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="font-bold text-emerald-700 shrink-0">
                        {formatCurrency(g.totalAmount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Payment Proof Voucher Upload (Optional) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                Comprobante de Transferencia Bancaria (Opcional)
              </label>
              <span className="text-[10px] text-slate-400">
                Se adjuntará a todos los correos y se guardará con los gastos
              </span>
            </div>

            {paymentProofBase64 ? (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {paymentProofFileName}
                    </p>
                    <p className="text-[10.5px] text-emerald-700 font-medium">
                      Listo para adjuntar y archivar
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentProofBase64(null);
                    setPaymentProofFileName(null);
                    setPaymentProofFileType(null);
                  }}
                  disabled={isExecuting}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                  title="Quitar comprobante"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
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
                  if (e.dataTransfer.files?.[0]) {
                    handleProcessFile(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition ${
                  isDraggingProof
                    ? 'border-emerald-500 bg-emerald-50/50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleProcessFile(e.target.files[0]);
                    }
                  }}
                />
                <div className="flex flex-col items-center space-y-1">
                  <Upload className="w-5 h-5 text-slate-400" />
                  <p className="text-xs font-semibold text-slate-700">
                    Arrastra la constancia de transferencia o haz clic para seleccionarla
                  </p>
                  <p className="text-[10.5px] text-slate-400">
                    O pega directamente con <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200 font-mono text-[10px] text-slate-600">Ctrl+V</kbd>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Withholdings Checkbox */}
          <div className="pt-1">
            <label className="flex items-center space-x-2.5 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={appliesWithholdings}
                onChange={(e) => setAppliesWithholdings(e.target.checked)}
                disabled={isExecuting}
                className="w-3.5 h-3.5 text-amber-600 border-slate-300 rounded focus:ring-amber-500 cursor-pointer"
              />
              <span className="text-slate-600">
                Aplica retenciones impositivas (notificará que el certificado se remitirá posteriormente)
              </span>
            </label>
          </div>

          {/* Collapsible List of Expenses to be Paid */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
              Comprobantes en este lote ({expenses.length}):
            </span>
            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
              {expenses.map((exp) => (
                <div
                  key={exp.id}
                  className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs flex items-center justify-between"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-slate-800 truncate">{exp.vendor}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {formatDate(exp.date)} · {exp.project} {exp.submittedByName ? `· ${exp.submittedByName}` : ''}
                    </p>
                  </div>
                  <span className="font-extrabold text-slate-900 shrink-0">
                    {formatCurrency(exp.amount, exp.currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 text-center sm:text-left">
            {isExecuting && (
              <span className="flex items-center space-x-2 text-emerald-700 font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{executionStep || 'Procesando pagos y liquidaciones...'}</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isExecuting}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmBatchPayment}
              disabled={isExecuting}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition active:scale-95 flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Confirmar y Pagar ({expenses.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
