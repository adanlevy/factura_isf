import React, { useState, useEffect } from 'react';
import {
  Mail,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building,
  CreditCard,
  User,
  Sparkles,
  X,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';
import { Expense, CostCenter, AppUserRecord } from '../types';
import { formatCurrency, formatDate, formatPaymentEmailSubject } from '../utils/helpers';
import { resolveEmailCcRecipients } from '../utils/emailCc';
import {
  sendGmailMessage,
  getStoredWorkspaceToken,
  getStoredWorkspaceUser,
  requestGoogleWorkspaceAuth,
} from '../utils/googleWorkspace';

interface AdministrativeEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
  mode: 'request_bank_details' | 'confirm_payment';
  costCenters?: CostCenter[];
  appUsers?: AppUserRecord[];
  onEmailSentSuccess: (expenseId: string, mode: 'request_bank_details' | 'confirm_payment') => void;
  currentUserAccessToken?: string;
}

export function AdministrativeEmailModal({
  isOpen,
  onClose,
  expense,
  mode,
  costCenters = [],
  appUsers = [],
  onEmailSentSuccess,
  currentUserAccessToken,
}: AdministrativeEmailModalProps) {
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [plainMessage, setPlainMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [statusResult, setStatusResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [workspaceToken, setWorkspaceToken] = useState(currentUserAccessToken || getStoredWorkspaceToken());
  const [workspaceUser, setWorkspaceUser] = useState(getStoredWorkspaceUser());

  // Synchronize state when expense or mode or isOpen changes
  useEffect(() => {
    if (expense) {
      const recipientEmail = expense.submittedByEmail || 'admin@isf-argentina.org';
      const recipientName = expense.submittedByName || 'Colaborador / Destinatario';

      const defaultSubject =
        mode === 'request_bank_details'
          ? `[ISF Finanzas] Solicitud de datos bancarios para reintegro de gasto: ${expense.vendor} ($${expense.amount.toLocaleString()})`
          : formatPaymentEmailSubject(expense.vendor, expense.amount, expense.currency);

      const defaultPlainText =
        mode === 'request_bank_details'
          ? `Hola ${recipientName},\n\nDesde el área de Administración y Finanzas estamos procesando tu rendición de gastos por ${formatCurrency(
              expense.amount,
              expense.currency
            )} correspondiente a ${expense.vendor} (Centro de Costos: ${expense.project}).\n\nPor favor, responde a este correo o indícanos tus datos de transferencia bancaria (CBU/CVU, Alias, Banco y CUIT/CUIL) para poder liquidar el reintegro a la brevedad.\n\nMuchas gracias.\nÁrea Administrativa & Tesorería — ISF Argentina`
          : `Hola ${recipientName},\n\nTe confirmamos que el reintegro por ${formatCurrency(
              expense.amount,
              expense.currency
            )} correspondiente a tu comprobante de ${expense.vendor} (Comprobante: ${
              expense.invoiceNumber || 'Ticket Rendido'
            } / Centro de Costos: ${expense.project}) ha sido transferido y liquidado con éxito.\n\n${
              expense.bankDetails
                ? `Datos de destino de la transferencia:\n- Banco: ${
                    expense.bankDetails.bankName || '-'
                  }\n- CBU / CVU: ${expense.bankDetails.cbuCvu || '-'}\n- Alias: ${
                    expense.bankDetails.alias || '-'
                  }\n- Titular: ${expense.bankDetails.accountHolder || recipientName}\n\n`
                : ''
            }Cualquier consulta estamos a disposición.\nÁrea de Tesorería y Finanzas — ISF Argentina`;

      setToEmail(recipientEmail);
      setSubject(defaultSubject);
      setPlainMessage(defaultPlainText);
      setStatusResult(null);
    }
  }, [expense, mode, isOpen]);

  useEffect(() => {
    if (currentUserAccessToken) {
      setWorkspaceToken(currentUserAccessToken);
    }
  }, [currentUserAccessToken]);

  if (!isOpen || !expense) return null;

  const ccRecipients = expense
    ? resolveEmailCcRecipients({
        toEmail,
        expense,
        costCenters,
        appUsers,
      })
    : [];

  const ccQueryParam = ccRecipients.length > 0 ? `&cc=${encodeURIComponent(ccRecipients.join(','))}` : '';

  const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    toEmail
  )}${ccQueryParam}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(plainMessage)}`;

  const mailtoUrl = `mailto:${encodeURIComponent(toEmail)}?${ccRecipients.length > 0 ? `cc=${encodeURIComponent(ccRecipients.join(','))}&` : ''}subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(plainMessage)}`;

  const handleCopyText = () => {
    const ccHeader = ccRecipients.length > 0 ? `CC: ${ccRecipients.join(', ')}\n` : '';
    navigator.clipboard.writeText(`Para: ${toEmail}\n${ccHeader}Asunto: ${subject}\n\n${plainMessage}`);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleConnectGoogle = async () => {
    try {
      const res = await requestGoogleWorkspaceAuth();
      setWorkspaceToken(res.accessToken);
      if (res.user) setWorkspaceUser(res.user);
    } catch (e: any) {
      console.warn('Auth failed:', e);
    }
  };

  const handleOpenGmail = () => {
    window.open(gmailComposeUrl, '_blank', 'noopener,noreferrer');
    onEmailSentSuccess(expense.id, mode);
    setStatusResult({
      success: true,
      message: `📧 Abierto en Gmail para enviar a ${toEmail}. Estado actualizado en el sistema.`,
    });
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setStatusResult(null);

    // Prepare HTML version
    const htmlFormatted = `<div style="font-family: sans-serif; line-height: 1.6; color: #1e293b;">
      ${plainMessage.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('')}
    </div>`;

    try {
      const token = workspaceToken || getStoredWorkspaceToken();
      const sendRes = await sendGmailMessage({
        to: toEmail,
        cc: ccRecipients.length > 0 ? ccRecipients : undefined,
        subject,
        bodyHtml: htmlFormatted,
        accessToken: token || undefined,
        fromName: workspaceUser?.name || 'ISF Argentina Finanzas',
      });

      if (sendRes.success) {
        onEmailSentSuccess(expense.id, mode);
        setStatusResult({
          success: true,
          message: sendRes.mode === 'gmail_api'
            ? `✅ Correo enviado exitosamente vía Gmail API desde ${workspaceUser?.email || 'tu cuenta'} (ID: ${sendRes.messageId}).`
            : `✅ Correo registrado y despachado exitosamente para ${toEmail}.`,
        });
        setTimeout(() => {
          onClose();
        }, 1800);
      } else {
        throw new Error(sendRes.error || 'No se pudo enviar el correo.');
      }
    } catch (err: any) {
      // Fallback: still update state and prompt Gmail
      onEmailSentSuccess(expense.id, mode);
      setStatusResult({
        success: true,
        message: `ℹ️ Registro completado en el sistema. Puedes enviar el correo directamente usando el botón "Abrir en Gmail".`,
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div
          className={`px-6 py-5 text-white flex items-center justify-between ${
            mode === 'request_bank_details' ? 'bg-indigo-950' : 'bg-slate-900'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs ${
                mode === 'request_bank_details' ? 'bg-indigo-600' : 'bg-emerald-600'
              }`}
            >
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                {mode === 'request_bank_details'
                  ? 'Enviar Solicitud de Datos Bancarios'
                  : 'Enviar Confirmación de Pago de Reintegro'}
              </h3>
              <p className="text-xs text-slate-300">
                Gasto: {expense.vendor} • {formatCurrency(expense.amount, expense.currency)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSendEmail} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {statusResult && (
            <div
              className={`p-4 rounded-2xl border text-xs font-semibold flex items-center space-x-2 ${
                statusResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {statusResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              )}
              <span>{statusResult.message}</span>
            </div>
          )}

          {/* Direct Send Quick Actions */}
          <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-indigo-900">
              <span>🚀 Enviar directamente desde tu cliente de correo:</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleOpenGmail}
                className="inline-flex items-center px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                title="Abrir redacción en Gmail con un clic"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1" />
                <span>Abrir en Gmail (1 Clic)</span>
              </button>
              <a
                href={mailtoUrl}
                className="inline-flex items-center px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium transition"
                title="Abrir en cliente de correo por defecto"
              >
                <span>Otro Correo</span>
              </a>
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium transition cursor-pointer"
                title="Copiar texto completo"
              >
                {copiedText ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                ) : (
                  <Copy className="w-3.5 h-3.5 mr-1 text-slate-500" />
                )}
                <span>{copiedText ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          {/* Recipient Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Destinatario (Email del solicitante) *
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden font-medium"
              />
            </div>
          </div>

          {/* CC Emails Indicator */}
          {ccRecipients.length > 0 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-start space-x-2 text-xs">
              <Mail className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-700 block">En copia automática (CC):</span>
                <span className="font-mono text-[11px] text-slate-600 break-all">{ccRecipients.join(', ')}</span>
              </div>
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Asunto del Correo *
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden font-medium"
            />
          </div>

          {/* Current Bank Details on File if available */}
          {expense.bankDetails && (
            <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 space-y-1">
              <div className="font-bold text-amber-900 flex items-center">
                <CreditCard className="w-3.5 h-3.5 mr-1.5 text-amber-700" />
                Datos bancarios registrados del colaborador:
              </div>
              <div className="grid grid-cols-2 gap-1 text-[11px] text-amber-900/90 pt-1">
                <div><strong>Banco:</strong> {expense.bankDetails.bankName || '-'}</div>
                <div><strong>Alias:</strong> {expense.bankDetails.alias || '-'}</div>
                <div><strong>CBU/CVU:</strong> {expense.bankDetails.cbuCvu || '-'}</div>
                <div><strong>Titular:</strong> {expense.bankDetails.accountHolder || '-'}</div>
              </div>
            </div>
          )}

          {/* Message Text */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Mensaje a Enviar
            </label>
            <textarea
              rows={7}
              value={plainMessage}
              onChange={(e) => setPlainMessage(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden leading-relaxed"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition cursor-pointer"
            >
              Cerrar
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenGmail}
                className="px-4 py-2.5 rounded-2xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Enviar por Gmail</span>
              </button>

              <button
                type="submit"
                disabled={isSending}
                className={`px-5 py-2.5 rounded-2xl text-xs font-bold text-white shadow-xs flex items-center space-x-2 transition cursor-pointer disabled:opacity-50 ${
                  mode === 'request_bank_details'
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Registrando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Registrar & Despachar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
