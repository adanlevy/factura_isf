import React, { useState, useEffect } from 'react';
import {
  X,
  Receipt,
  Volume2,
  Download,
  Copy,
  Check,
  Sparkles,
  CreditCard,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCheck,
  FileText,
  Upload,
} from 'lucide-react';
import { Expense, CostCenter } from '../types';
import { formatCurrency, formatDate, generateDriveFileName, formatTransferDetails, getGoogleDrivePreviewUrl } from '../utils/helpers';
import { GoogleDriveLinkButton } from './GoogleDriveIcon';
import { SafePdfViewer } from './SafePdfViewer';
import {
  getCachedReceiptFile,
  getCachedPaymentProofFile,
  getCachedWithholdingCertificateFile,
} from '../utils/receiptCache';

interface ReceiptViewerModalProps {
  expense: Expense | null;
  costCenters?: CostCenter[];
  onClose: () => void;
  onProcessPayment?: (expense: Expense) => void;
  onUploadToDrive?: (expense: Expense) => void;
  onReplaceReceipt?: (expense: Expense) => void;
  onOpenWithholdingModal?: (expense: Expense) => void;
}

export function ReceiptViewerModal({
  expense,
  costCenters = [],
  onClose,
  onProcessPayment,
  onUploadToDrive,
  onReplaceReceipt,
  onOpenWithholdingModal,
}: ReceiptViewerModalProps) {
  const [copiedName, setCopiedName] = useState(false);
  const [isUploadingDrive, setIsUploadingDrive] = useState(false);
  const [resolvedReceiptUrl, setResolvedReceiptUrl] = useState<string | null>(null);
  const [resolvedPaymentProofUrl, setResolvedPaymentProofUrl] = useState<string | null>(null);
  const [resolvedWithholdingUrl, setResolvedWithholdingUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'INVOICE' | 'PAYMENT_PROOF' | 'WITHHOLDING_CERTIFICATE'>('INVOICE');

  useEffect(() => {
    if (!expense) {
      setResolvedReceiptUrl(null);
      setResolvedPaymentProofUrl(null);
      setResolvedWithholdingUrl(null);
      setActiveTab('INVOICE');
      return;
    }

    if (expense.receiptImage) {
      setResolvedReceiptUrl(expense.receiptImage);
    } else {
      getCachedReceiptFile(expense.id).then((cached) => {
        if (cached) setResolvedReceiptUrl(cached);
      });
    }

    if (expense.paymentProofImage) {
      setResolvedPaymentProofUrl(expense.paymentProofImage);
    } else {
      getCachedPaymentProofFile(expense.id).then((cached) => {
        if (cached) setResolvedPaymentProofUrl(cached);
      });
    }

    if (expense.withholdingCertificateImage) {
      setResolvedWithholdingUrl(expense.withholdingCertificateImage);
    } else {
      getCachedWithholdingCertificateFile(expense.id).then((cached) => {
        if (cached) setResolvedWithholdingUrl(cached);
      });
    }
  }, [expense]);

  if (!expense) return null;

  const displayReceiptUrl = resolvedReceiptUrl || expense.receiptImage;
  const displayPaymentProofUrl = resolvedPaymentProofUrl || expense.paymentProofImage;
  const displayWithholdingUrl = resolvedWithholdingUrl || expense.withholdingCertificateImage;

  const matchedCc = costCenters.find(
    (c) => c.name.toLowerCase() === (expense.project || '').toLowerCase()
  );

  // Generate standardized file name
  // Format: SIGLAS(Mayúscula)-Nombre Solicitante(Proper)-YYYYMMDD-Monto
  const standardizedFileName = generateDriveFileName(expense, costCenters);
  
  // Extension detection
  let fileExt = 'png';
  if (expense.receiptFileName?.toLowerCase().endsWith('.svg')) fileExt = 'svg';
  else if (expense.receiptFileName?.toLowerCase().endsWith('.pdf')) fileExt = 'pdf';
  else if (expense.receiptFileName?.toLowerCase().endsWith('.jpg') || expense.receiptFileName?.toLowerCase().endsWith('.jpeg')) fileExt = 'jpg';

  const fullDownloadFileName = `${standardizedFileName}.${fileExt}`;

  const driveReceiptPreviewUrl = getGoogleDrivePreviewUrl(expense.driveUploadedUrl || (displayReceiptUrl?.includes('drive.google.com') ? displayReceiptUrl : null));
  const drivePaymentProofPreviewUrl = getGoogleDrivePreviewUrl(expense.paymentProofDriveUrl || (displayPaymentProofUrl?.includes('drive.google.com') ? displayPaymentProofUrl : null));
  const driveWithholdingPreviewUrl = getGoogleDrivePreviewUrl(expense.withholdingCertificateDriveUrl || (displayWithholdingUrl?.includes('drive.google.com') ? displayWithholdingUrl : null));

  const directFileUrl = expense.driveUploadedUrl || (displayReceiptUrl && displayReceiptUrl.startsWith('data:') ? displayReceiptUrl : null);
  const driveFolderUrl = expense.driveFolderUrl || matchedCc?.driveUrl || (matchedCc?.driveFolder
    ? `https://drive.google.com/drive/search?q=${encodeURIComponent(matchedCc.driveFolder)}`
    : `https://drive.google.com/drive/search?q=${encodeURIComponent(expense.project || '')}`);
  const driveUrl = directFileUrl || driveFolderUrl;

  const isPendingPaymentType =
    expense.reimbursable ||
    expense.paymentType === 'PAGO_PROVEEDOR' ||
    expense.paymentType === 'REINTEGRO' ||
    expense.paymentMethod === 'Pago a Proveedor' ||
    expense.paymentMethod === 'Reintegro' ||
    expense.reimbursementStatus === 'PENDING';
  const isPaid =
    (isPendingPaymentType && expense.reimbursementStatus === 'REIMBURSED') ||
    Boolean(expense.paymentConfirmedAt) ||
    Boolean(expense.reimbursedAt);
  const isPending = isPendingPaymentType && !isPaid;

  const hasPaymentProof = Boolean(expense.paymentProofImage || expense.paymentProofFileName);
  const appliesWithholdings = Boolean(expense.appliesWithholdings);
  const hasWithholdingCert = Boolean(
    expense.withholdingCertificateImage ||
    expense.withholdingCertificateFileName ||
    expense.withholdingCertificateDriveUrl
  );

  const isPendingWithholding = isPaid && appliesWithholdings && !hasWithholdingCert;

  const handleCopyFileName = () => {
    navigator.clipboard.writeText(standardizedFileName);
    setCopiedName(true);
    setTimeout(() => setCopiedName(false), 2500);
  };

  const handleUploadDriveClick = async () => {
    if (onUploadToDrive && expense) {
      setIsUploadingDrive(true);
      await onUploadToDrive(expense);
      setIsUploadingDrive(false);
    }
  };

  const handleDownload = () => {
    if (activeTab === 'WITHHOLDING_CERTIFICATE') {
      if (displayWithholdingUrl) {
        const link = document.createElement('a');
        link.href = displayWithholdingUrl;
        link.download = expense.withholdingCertificateFileName || `Certificado-Retencion-${standardizedFileName}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      if (expense.withholdingCertificateDriveUrl) {
        window.open(expense.withholdingCertificateDriveUrl, '_blank');
        return;
      }
    }

    if (activeTab === 'PAYMENT_PROOF') {
      if (displayPaymentProofUrl) {
        const link = document.createElement('a');
        link.href = displayPaymentProofUrl;
        link.download = `Comprobante-Pago-${standardizedFileName}.${expense.paymentProofFileName?.toLowerCase().endsWith('.pdf') ? 'pdf' : 'png'}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      if (expense.paymentProofDriveUrl) {
        window.open(expense.paymentProofDriveUrl, '_blank');
        return;
      }
    }

    const targetUrl = displayReceiptUrl;
    if (targetUrl) {
      const link = document.createElement('a');
      link.href = targetUrl;
      link.download = fullDownloadFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (expense.driveUploadedUrl || driveUrl) {
      window.open(expense.driveUploadedUrl || driveUrl, '_blank');
    }
  };

  return (
    <div
      id="receipt-viewer-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="receipt-viewer-container"
        className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Receipt className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white">{expense.vendor}</h3>
              <span className="text-xs text-slate-400">
                {expense.invoiceNumber ? `Comprobante N° ${expense.invoiceNumber}` : 'Ticket'} • {formatDate(expense.date)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Standard Google Drive Integration Bar */}
        <div className="bg-indigo-900 text-indigo-100 px-5 py-3 border-b border-indigo-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2 overflow-hidden">
            <Sparkles className="w-4 h-4 text-indigo-300 shrink-0" />
            <div className="truncate">
              <span className="text-indigo-300 font-semibold mr-1">Nombre Drive:</span>
              <code className="font-mono font-bold text-white bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-700 select-all">
                {standardizedFileName}
              </code>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {expense.driveUploadedUrl && (
              <a
                href={expense.driveUploadedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition cursor-pointer shadow-xs"
                title="Abrir archivo guardado directamente en Google Drive"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1" />
                <span>📄 Abrir Archivo</span>
              </a>
            )}

            {driveFolderUrl && (
              <GoogleDriveLinkButton
                url={driveFolderUrl}
                title="Abrir carpeta del Centro de Costos en Google Drive"
                className="bg-white hover:bg-slate-100 text-slate-900 shadow-xs"
              />
            )}
          </div>
        </div>

        {/* Tabs if Payment Proof is attached or Withholdings apply */}
        {(hasPaymentProof || appliesWithholdings) && (
          <div className="bg-slate-100 px-6 pt-2 border-b border-slate-200 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab('INVOICE')}
              className={`px-3 py-1.5 rounded-t-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'INVOICE'
                  ? 'bg-white text-indigo-900 border-t-2 border-indigo-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Factura / Ticket Original</span>
            </button>

            {hasPaymentProof && (
              <button
                onClick={() => setActiveTab('PAYMENT_PROOF')}
                className={`px-3 py-1.5 rounded-t-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'PAYMENT_PROOF'
                    ? 'bg-white text-emerald-900 border-t-2 border-emerald-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                <span>Comprobante de Pago</span>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">Adjunto</span>
              </button>
            )}

            {appliesWithholdings && (
              <button
                onClick={() => setActiveTab('WITHHOLDING_CERTIFICATE')}
                className={`px-3 py-1.5 rounded-t-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'WITHHOLDING_CERTIFICATE'
                    ? 'bg-white text-amber-900 border-t-2 border-amber-500 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <FileCheck className="w-3.5 h-3.5 text-amber-600" />
                <span>Certificado de Retención</span>
                {hasWithholdingCert ? (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">Cargado</span>
                ) : (
                  <span className="bg-amber-100 text-amber-900 text-[10px] px-1.5 py-0.2 rounded-full font-bold">Pendiente</span>
                )}
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[75vh] overflow-y-auto">
          
          {/* Left: Image / SVG / PDF receipt preview */}
          <div className="flex flex-col items-center justify-center bg-slate-50 rounded-2xl p-4 border border-slate-200 min-h-[300px] relative">
            {activeTab === 'WITHHOLDING_CERTIFICATE' ? (
              driveWithholdingPreviewUrl ? (
                <div className="w-full">
                  <div className="w-full h-80 rounded-xl overflow-hidden border border-slate-200 shadow-xs bg-slate-100 mb-4">
                    <iframe
                      src={driveWithholdingPreviewUrl}
                      title={`Certificado de Retenciones: ${expense.vendor}`}
                      className="w-full h-full border-0"
                      allow="autoplay"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={handleDownload}
                      className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      <span>Descargar</span>
                    </button>
                    <a
                      href={expense.withholdingCertificateDriveUrl || displayWithholdingUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5 mr-1 text-slate-500" />
                      <span>Ver en Drive</span>
                    </a>
                    {onOpenWithholdingModal && (
                      <button
                        type="button"
                        onClick={() => onOpenWithholdingModal(expense)}
                        className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        <span>Reemplazar</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : displayWithholdingUrl ? (
                <>
                  {displayWithholdingUrl.startsWith('data:application/pdf') ||
                  expense.withholdingCertificateFileName?.toLowerCase().endsWith('.pdf') ? (
                    <div className="w-full">
                      <SafePdfViewer
                        url={displayWithholdingUrl}
                        fileName={expense.withholdingCertificateFileName || 'certificado_retenciones.pdf'}
                        title={`Certificado de Retenciones: ${expense.vendor}`}
                        heightClass="h-80"
                      />
                    </div>
                  ) : (
                    <img
                      src={displayWithholdingUrl}
                      alt={`Certificado de retenciones ${expense.vendor}`}
                      className="max-h-96 object-contain rounded-xl shadow-xs"
                    />
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={handleDownload}
                      className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      <span>Descargar</span>
                    </button>
                    {expense.withholdingCertificateDriveUrl && (
                      <a
                        href={expense.withholdingCertificateDriveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1 text-slate-500" />
                        <span>Ver en Drive</span>
                      </a>
                    )}
                    {onOpenWithholdingModal && (
                      <button
                        type="button"
                        onClick={() => onOpenWithholdingModal(expense)}
                        className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        <span>Reemplazar</span>
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center text-slate-500 space-y-3 p-6 flex flex-col items-center justify-center">
                  <div className="w-14 h-14 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center text-amber-600 shadow-xs">
                    <FileCheck className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">Certificado de Retenciones Pendiente</h4>
                    <p className="text-xs text-slate-500 max-w-xs mt-1 leading-relaxed">
                      Este pago tiene retenciones impositivas declaradas. Puedes cargar el certificado una vez emitido administrativamente.
                    </p>
                  </div>
                  {onOpenWithholdingModal && (
                    <button
                      type="button"
                      onClick={() => onOpenWithholdingModal(expense)}
                      className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                      <span>Subir Certificado de Retenciones</span>
                    </button>
                  )}
                </div>
              )
            ) : activeTab === 'PAYMENT_PROOF' ? (
              drivePaymentProofPreviewUrl ? (
                <div className="w-full">
                  <div className="w-full h-80 rounded-xl overflow-hidden border border-slate-200 shadow-xs bg-slate-100 mb-4">
                    <iframe
                      src={drivePaymentProofPreviewUrl}
                      title={`Comprobante de Pago: ${expense.vendor}`}
                      className="w-full h-full border-0"
                      allow="autoplay"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={handleDownload}
                      className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      <span>Descargar</span>
                    </button>
                    <a
                      href={expense.paymentProofDriveUrl || displayPaymentProofUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5 mr-1 text-slate-500" />
                      <span>Ver en Drive</span>
                    </a>
                    {onProcessPayment && (
                      <button
                        type="button"
                        onClick={() => onProcessPayment(expense)}
                        className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        <span>Reemplazar</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : displayPaymentProofUrl ? (
                <>
                  {displayPaymentProofUrl.startsWith('data:application/pdf') ||
                  expense.paymentProofFileName?.toLowerCase().endsWith('.pdf') ? (
                    <div className="w-full">
                      <SafePdfViewer
                        url={displayPaymentProofUrl}
                        fileName={expense.paymentProofFileName || 'comprobante_pago.pdf'}
                        title={`Comprobante de Pago: ${expense.vendor}`}
                        heightClass="h-80"
                      />
                    </div>
                  ) : (
                    <img
                      src={displayPaymentProofUrl}
                      alt={`Comprobante de pago ${expense.vendor}`}
                      className="max-h-96 object-contain rounded-xl shadow-xs"
                    />
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={handleDownload}
                      className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      <span>Descargar</span>
                    </button>
                    {expense.paymentProofDriveUrl && (
                      <a
                        href={expense.paymentProofDriveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1 text-slate-500" />
                        <span>Ver en Drive</span>
                      </a>
                    )}
                    {onProcessPayment && (
                      <button
                        type="button"
                        onClick={() => onProcessPayment(expense)}
                        className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        <span>Reemplazar</span>
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center text-slate-400 space-y-3 p-6 flex flex-col items-center justify-center">
                  <CreditCard className="w-12 h-12 mx-auto" />
                  <p className="text-xs">No se adjuntó comprobante de pago todavía.</p>
                  {onProcessPayment && (
                    <button
                      type="button"
                      onClick={() => onProcessPayment(expense)}
                      className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                      <span>Cargar Comprobante</span>
                    </button>
                  )}
                </div>
              )
            ) : driveReceiptPreviewUrl ? (
              <div className="w-full">
                <div className="w-full h-80 rounded-xl overflow-hidden border border-slate-200 shadow-xs bg-slate-100 mb-4">
                  <iframe
                    src={driveReceiptPreviewUrl}
                    title={`Comprobante / Factura: ${expense.vendor}`}
                    className="w-full h-full border-0"
                    allow="autoplay"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    <span>Descargar</span>
                  </button>
                  <a
                    href={expense.driveUploadedUrl || expense.driveFolderUrl || driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1 text-slate-500" />
                    <span>Ver en Drive</span>
                  </a>
                  {onReplaceReceipt && (
                    <button
                      type="button"
                      onClick={() => onReplaceReceipt(expense)}
                      className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      <span>Reemplazar</span>
                    </button>
                  )}
                </div>
              </div>
            ) : displayReceiptUrl ? (
              <>
                {displayReceiptUrl.startsWith('data:application/pdf') ||
                expense.receiptFileName?.toLowerCase().endsWith('.pdf') ? (
                  <div className="w-full">
                    <SafePdfViewer
                      url={displayReceiptUrl}
                      fileName={standardizedFileName}
                      title={`Comprobante ${expense.vendor}`}
                      heightClass="h-80"
                    />
                  </div>
                ) : (
                  <img
                    src={displayReceiptUrl}
                    alt={expense.vendor}
                    className="max-h-96 object-contain rounded-xl shadow-xs"
                  />
                )}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    <span>Descargar</span>
                  </button>
                  {(expense.driveUploadedUrl || expense.driveFolderUrl || driveUrl) && (
                    <a
                      href={expense.driveUploadedUrl || expense.driveFolderUrl || driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5 mr-1 text-slate-500" />
                      <span>Ver en Drive</span>
                    </a>
                  )}
                  {onReplaceReceipt && (
                    <button
                      type="button"
                      onClick={() => onReplaceReceipt(expense)}
                      className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      <span>Reemplazar</span>
                    </button>
                  )}
                </div>
              </>
            ) : driveUrl ? (
              <div className="text-center p-6 space-y-3 flex flex-col items-center justify-center">
                <div className="w-14 h-14 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-center text-indigo-600 shadow-xs">
                  <ExternalLink className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Comprobante en Google Drive</h4>
                  <p className="text-xs text-slate-500 max-w-xs mt-1 leading-relaxed">
                    El archivo digital está archivado de forma segura en Google Drive y los datos contables están registrados en la base de datos.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <a
                    href={driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1 text-slate-500" />
                    <span>Ver en Drive</span>
                  </a>
                  {onReplaceReceipt && (
                    <button
                      type="button"
                      onClick={() => onReplaceReceipt(expense)}
                      className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      <span>Reemplazar</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400 space-y-3 p-6 flex flex-col items-center justify-center">
                <Receipt className="w-12 h-12 mx-auto" />
                <p className="text-xs">No se adjuntó imagen para este comprobante.</p>
                {onReplaceReceipt && (
                  <button
                    type="button"
                    onClick={() => onReplaceReceipt(expense)}
                    className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    <span>Adjuntar / Reemplazar</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right: Detailed Metadata */}
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="text-xs text-slate-500">Monto Total</div>
              <div className="text-2xl font-extrabold text-slate-900">
                {formatCurrency(expense.amount, expense.currency)}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Centro de Costos:</span>
                <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                  {matchedCc?.code && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {matchedCc.code}
                    </span>
                  )}
                  <span>{expense.project}</span>
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Solicitante:</span>
                <span className="font-semibold text-slate-800">{expense.submittedByName || 'No especificado'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Categoría:</span>
                <span className="font-semibold text-slate-800">{expense.category}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Forma de Pago:</span>
                <span className="font-medium text-slate-800">{expense.paymentMethod}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Estado del Pago:</span>
                <div>
                  {isPendingWithholding ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                      <Clock className="w-3.5 h-3.5 mr-1 text-amber-700" />
                      Pagado - Pend. Retención
                    </span>
                  ) : isPaid ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                      Pagado
                    </span>
                  ) : isPending ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                      <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" />
                      Pendiente
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                      Directo
                    </span>
                  )}
                </div>
              </div>

              {/* Datos transferencia */}
              {(expense.transferDetails || expense.bankDetails) && (
                <div className="py-2 border-b border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-semibold text-xs flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Datos transferencia:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const txt = expense.transferDetails || formatTransferDetails(expense);
                        navigator.clipboard.writeText(txt);
                        alert('Datos de transferencia copiados al portapapeles.');
                      }}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-lg border border-indigo-200 transition cursor-pointer flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copiar</span>
                    </button>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-800 break-words leading-relaxed">
                    {expense.transferDetails || formatTransferDetails(expense)}
                  </div>
                </div>
              )}
            </div>

            {expense.notes && (
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="text-slate-500 font-semibold mb-1">Motivo / Detalle:</div>
                <p className="text-slate-800">{expense.notes}</p>
              </div>
            )}

            {expense.voiceTranscription && (
              <div className="p-3.5 bg-indigo-50/80 rounded-2xl border border-indigo-100 space-y-1">
                <div className="flex items-center text-indigo-700 font-semibold">
                  <Volume2 className="w-3.5 h-3.5 mr-1" />
                  Nota de voz procesada:
                </div>
                <p className="italic text-indigo-950">"{expense.voiceTranscription}"</p>
              </div>
            )}

            {expense.items && expense.items.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <div className="font-bold text-slate-700">Ítems de la Factura:</div>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                  {expense.items.map((item, idx) => (
                    <div key={idx} className="p-2.5 flex justify-between bg-white text-[11px]">
                      <span>
                        {item.quantity ? `${item.quantity}x ` : ''}
                        {item.description}
                      </span>
                      <span className="font-bold text-slate-900">${(item.total || 0).toLocaleString('es-AR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end items-center">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-semibold cursor-pointer transition active:scale-95 shadow-xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
