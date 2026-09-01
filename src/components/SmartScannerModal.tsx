import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload,
  Sparkles,
  X,
  Check,
  RotateCcw,
  Loader2,
  FileText,
  Trash2,
  CheckCircle2,
  Save,
  Eye,
  ExternalLink,
  Download,
  CreditCard,
  User,
  Building2,
  AlertCircle,
  Edit3,
  Search,
  ChevronDown,
  Plus,
} from 'lucide-react';
import {
  Expense,
  ExpenseItem,
  ReimbursementStatus,
  PaymentMethod,
  UserBankDetails,
  UserProfile,
  Vendor,
  ExpensePaymentType,
  CostCenter,
} from '../types';
import { getStoredUserBankDetails, getSuggestedProject } from '../utils/auth';
import {
  getSmartSortedCostCenters,
  recordCategoryCostCenterUsage,
} from '../utils/sorting';
import {
  findVendorByCuitOrName,
  formatCuit,
  cleanCuit,
} from '../utils/helpers';
import { notifyBankDetailsChange } from '../utils/googleWorkspace';
import { FacturaIllustration } from './FacturaIcon';
import { SafePdfViewer } from './SafePdfViewer';
import { VendorFormModal } from './VendorFormModal';
import { AccountSelector } from './AccountSelector';

export interface SmartScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveExpense: (expense: Expense) => void;
  onSaveBatchExpenses?: (expenses: Expense[]) => void;
  availableProjects: string[];
  availableCategories?: string[];
  onAddNewProject: (project: string) => void;
  currentUser: UserProfile | null;
  existingExpenses: Expense[];
  vendors?: Vendor[];
  costCenters?: CostCenter[];
  onAddVendor?: (vendor: Omit<Vendor, 'id' | 'createdAt'>) => void;
}

export interface QueueItem {
  id: string;
  file: File | null;
  fileName: string;
  fileSize?: number;
  mimeType: string;
  previewUrl: string;
  status: 'analyzing' | 'ready' | 'error' | 'incomplete';
  statusMessage?: string;

  // Track if user manually entered both amount and date to stop IA overwrites
  manuallyEditedAmount?: boolean;
  manuallyEditedDate?: boolean;
  abortController?: AbortController;

  // Data fields extracted or edited
  vendor: string;
  cuit?: string;
  amount: number | '';
  currency: string;
  date: string; // '' by default until extracted or typed
  invoiceNumber: string;
  category?: string;
  project: string;
  paymentType: ExpensePaymentType | '';
  reimbursable: boolean;
  reimbursementStatus: ReimbursementStatus;
  paymentMethod: PaymentMethod | string;
  bankDetails?: UserBankDetails;
  notes: string;
  accountingNotes?: string;
  items: ExpenseItem[];
  aiConfidenceSummary?: string;
  savedSuccessfully?: boolean;
}

/**
 * Optimiza la imagen preservando fidelidad total de color RGB y resolución adecuada
 */
function prepareImageForGemini(
  sourceCanvasOrImage: HTMLCanvasElement | HTMLImageElement,
  maxDimension: number = 1800
): string {
  const srcWidth =
    ('naturalWidth' in sourceCanvasOrImage
      ? sourceCanvasOrImage.naturalWidth
      : sourceCanvasOrImage.width) || 1280;
  const srcHeight =
    ('naturalHeight' in sourceCanvasOrImage
      ? sourceCanvasOrImage.naturalHeight
      : sourceCanvasOrImage.height) || 720;

  let targetWidth = srcWidth;
  let targetHeight = srcHeight;

  if (targetWidth > maxDimension || targetHeight > maxDimension) {
    if (targetWidth > targetHeight) {
      targetHeight = Math.round((targetHeight * maxDimension) / targetWidth);
      targetWidth = maxDimension;
    } else {
      targetWidth = Math.round((targetWidth * maxDimension) / targetHeight);
      targetHeight = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if ('toDataURL' in sourceCanvasOrImage) {
      return (sourceCanvasOrImage as HTMLCanvasElement).toDataURL('image/jpeg', 0.85);
    }
    return '';
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvasOrImage, 0, 0, targetWidth, targetHeight);

  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Helper to highlight matching substring in lookup results (Salesforce style)
 */
function highlightLookupMatch(text: string, query: string): React.ReactNode {
  if (!query || !query.trim() || !text) return text;
  const q = query.trim().toLowerCase();
  const lower = text.toLowerCase();
  const index = lower.indexOf(q);
  if (index === -1) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + q.length);
  const after = text.slice(index + q.length);

  return (
    <>
      {before}
      <span className="font-extrabold text-purple-900 bg-purple-100 rounded-xs px-0.5">
        {match}
      </span>
      {highlightLookupMatch(after, query)}
    </>
  );
}

/**
 * Subcomponente para la columna "Datos de cuenta"
 * Implementa el selector dinámico estilo Lookup de Salesforce con búsqueda dinámica,
 * máximo de 6 sugerencias y la última opción fija "Nueva cuenta".
 * Al hacer clic en un dato ya seleccionado, abre el modal de edición.
 * Al presionar la cruz (Quitar), limpia y abre el buscador.
 */
function AccountDataCell({
  item,
  currentUser,
  storedBank,
  vendors,
  onUpdateBankDetails,
  onAddVendor,
  onSelectAccount,
}: {
  item: QueueItem;
  currentUser: UserProfile | null;
  storedBank: UserBankDetails | null;
  vendors: Vendor[];
  onUpdateBankDetails: (details: UserBankDetails | undefined) => void;
  onAddVendor?: (vendor: Omit<Vendor, 'id' | 'createdAt'>) => void;
  onSelectAccount?: (data: {
    bankDetails: UserBankDetails;
    vendorName?: string;
    cuit?: string;
    category?: string;
  }) => void;
}) {
  if (item.paymentType !== 'REINTEGRO' && item.paymentType !== 'PAGO_PROVEEDOR') {
    return <span className="text-[11px] text-slate-400 font-medium">n/a</span>;
  }

  return (
    <AccountSelector
      bankDetails={item.bankDetails}
      vendorName={item.vendor}
      cuit={item.cuit || item.bankDetails?.cuitCuil}
      vendors={vendors}
      currentUser={currentUser || undefined}
      storedBank={storedBank || undefined}
      paymentType={item.paymentType}
      onAddVendor={onAddVendor}
      onSelectAccount={(data) => {
        onUpdateBankDetails(data.bankDetails);
        if (onSelectAccount) {
          onSelectAccount(data);
        }
      }}
      onClearAccount={() => {
        onUpdateBankDetails(undefined);
      }}
    />
  );
}

export function SmartScannerModal({
  isOpen,
  onClose,
  onSaveExpense,
  onSaveBatchExpenses,
  availableProjects,
  availableCategories,
  onAddNewProject,
  currentUser,
  existingExpenses,
  vendors = [],
  costCenters = [],
  onAddVendor,
}: SmartScannerModalProps) {
  // Queue of uploaded receipts
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [previewZoomFile, setPreviewZoomFile] = useState<{
    url: string;
    mimeType: string;
    fileName?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const suggestedProject = useMemo(() => {
    return getSuggestedProject(currentUser?.email || '', existingExpenses, availableProjects);
  }, [currentUser, existingExpenses, availableProjects]);

  const storedBank = useMemo(() => {
    return currentUser?.email ? getStoredUserBankDetails(currentUser.email) : null;
  }, [currentUser]);

  // Fast 1-click experience: auto-open file picker when modal opens if queue is empty
  const autoTriggeredRef = useRef(false);
  useEffect(() => {
    if (isOpen) {
      if (!autoTriggeredRef.current && queue.length === 0) {
        autoTriggeredRef.current = true;
        const timer = setTimeout(() => {
          fileInputRef.current?.click();
        }, 120);
        return () => clearTimeout(timer);
      }
    } else {
      autoTriggeredRef.current = false;
    }
  }, [isOpen, queue.length]);

  // --- FILE HANDLING & QUEUE INGESTION ---
  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file, index) => {
      // Stagger processing slightly to prevent hitting burst rate limits
      if (index === 0) {
        processAndEnqueueFile(file);
      } else {
        setTimeout(() => {
          processAndEnqueueFile(file);
        }, index * 250);
      }
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processAndEnqueueFile = (file: File) => {
    const isImage = file.type.startsWith('image/') && !file.type.includes('svg');
    const reader = new FileReader();

    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;

      if (!isImage) {
        // PDF or SVG
        addFileToQueue(file, file.name, file.type || 'application/pdf', dataUrl, file.size);
        return;
      }

      // Optimize image
      const img = new Image();
      img.onload = () => {
        try {
          const optimizedDataUrl = prepareImageForGemini(img, 1800);
          addFileToQueue(file, file.name, 'image/jpeg', optimizedDataUrl, file.size);
        } catch (err) {
          console.warn('Image optimization fallback:', err);
          addFileToQueue(file, file.name, file.type || 'image/jpeg', dataUrl, file.size);
        }
      };
      img.onerror = () => {
        addFileToQueue(file, file.name, file.type || 'image/jpeg', dataUrl, file.size);
      };
      img.src = dataUrl;
    };

    reader.readAsDataURL(file);
  };

  const addFileToQueue = (
    file: File | null,
    fileName: string,
    mimeType: string,
    previewUrl: string,
    fileSize?: number
  ) => {
    const newItemId = `queue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const newItem: QueueItem = {
      id: newItemId,
      file,
      fileName,
      fileSize,
      mimeType,
      previewUrl,
      status: 'analyzing',
      statusMessage: 'Gemini IA analizando...',
      vendor: '',
      amount: '',
      currency: 'ARS',
      date: '', // No default date; extracted by IA or filled manually
      invoiceNumber: '',
      category: '', // No precargar antes de que la IA analice
      project: '', // No precargar antes de que la IA analice
      paymentType: '', // Vacío por defecto; el usuario debe elegirlo
      reimbursable: false,
      reimbursementStatus: 'NOT_APPLICABLE',
      paymentMethod: '',
      bankDetails: undefined,
      notes: '',
      items: [],
      manuallyEditedAmount: false,
      manuallyEditedDate: false,
    };

    // Append to queue immediately
    setQueue((prev) => [newItem, ...prev]);

    // Trigger AI extraction asynchronously in background
    triggerAiExtractionForItem(newItemId, previewUrl, mimeType);
  };

  // --- BACKGROUND AI INVOICE EXTRACTION ---
  const triggerAiExtractionForItem = async (
    itemId: string,
    previewUrl: string,
    mimeType: string
  ) => {
    // Abort previous if exists
    const abortController = new AbortController();

    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        if (item.abortController) {
          item.abortController.abort();
        }
        return {
          ...item,
          status: 'analyzing',
          statusMessage: 'Analizando con IA...',
          abortController,
        };
      })
    );

    const maxAttempts = 2;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (abortController.signal.aborted) return;

        const response = await fetch('/api/extract-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: previewUrl,
            mimeType,
            availableCategories,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          let parsedErr = '';
          try {
            const errObj = JSON.parse(errText);
            parsedErr = errObj.error || errObj.message || response.statusText;
          } catch {
            parsedErr = errText || response.statusText;
          }
          throw new Error(parsedErr || `HTTP ${response.status}`);
        }

        const result = await response.json();

        if (result.success && result.data) {
          const data = result.data;
          const amountNum = typeof data.amount === 'number' && data.amount > 0 ? data.amount : null;
          const extractedDate =
            typeof data.date === 'string' && data.date.trim().length >= 8 ? data.date.trim() : null;

          // Strict validation: BOTH Amount and Date must be present to be considered successful (ready)
          const isSuccessfulOcr = amountNum !== null && extractedDate !== null;

          setQueue((prev) =>
            prev.map((item) => {
              if (item.id !== itemId) return item;

              // If user manually entered both amount and date while IA was running, don't overwrite user values
              const userAlreadyCompleted = item.manuallyEditedAmount && item.manuallyEditedDate;
              if (userAlreadyCompleted) {
                return {
                  ...item,
                  status: 'ready',
                  statusMessage: 'Completado manualmente',
                };
              }

              const finalAmount = item.manuallyEditedAmount
                ? item.amount
                : amountNum !== null
                ? amountNum
                : item.amount;
              const finalDate = item.manuallyEditedDate
                ? item.date
                : extractedDate || item.date;

              const hasValidAmount = typeof finalAmount === 'number' && finalAmount > 0;
              const hasValidDate = Boolean(finalDate && finalDate.trim().length >= 8);
              const finalStatus = hasValidAmount && hasValidDate ? 'ready' : 'incomplete';

              const extractedCuit = data.cuit ? String(data.cuit).trim() : undefined;
              const proposedVendor = data.vendor || 'Comercio';
              const proposedCuit = extractedCuit;

              const smartCostCenters = getSmartSortedCostCenters(
                availableProjects,
                existingExpenses,
                currentUser?.email
              );
              const finalProject = item.project || smartCostCenters.topSuggested || suggestedProject || availableProjects[0] || 'General';

              // Payment type is NOT deduced by AI (kept empty so user selects it)
              const finalPaymentType = item.paymentType || '';
              const finalBankDetails = item.bankDetails;
              const isPendingPaymentType = finalPaymentType === 'REINTEGRO' || finalPaymentType === 'PAGO_PROVEEDOR';

              const vendorDisplayNote = `${proposedVendor}${proposedCuit ? ` (CUIT ${formatCuit(proposedCuit)})` : ''}`;

              return {
                ...item,
                status: finalStatus,
                statusMessage: finalStatus === 'ready' ? 'Análisis completado' : 'Falta Monto o Fecha',
                vendor: item.vendor || proposedVendor,
                cuit: item.cuit || proposedCuit,
                amount: finalAmount,
                currency: data.currency || item.currency || 'ARS',
                date: finalDate,
                invoiceNumber: data.invoiceNumber || item.invoiceNumber,
                project: finalProject,
                paymentType: finalPaymentType,
                bankDetails: finalBankDetails,
                reimbursable: isPendingPaymentType,
                reimbursementStatus: isPendingPaymentType ? (item.reimbursementStatus || 'PENDING') : 'NOT_APPLICABLE',
                paymentMethod:
                  finalPaymentType === 'REINTEGRO'
                    ? 'Reintegro'
                    : finalPaymentType === 'PAGO_PROVEEDOR'
                    ? 'Pago a Proveedor'
                    : finalPaymentType === 'TARJETA_CORPORATIVA'
                    ? 'Tarjeta Corporativa'
                    : finalPaymentType === 'TARJETA_DEBITO_GALICIA'
                    ? 'Tarjeta Débito Galicia'
                    : '',
                items: data.items && data.items.length > 0 ? data.items : item.items,
                aiConfidenceSummary: isSuccessfulOcr
                  ? data.confidenceSummary ||
                    `Detectado: ${vendorDisplayNote} • $${amountNum?.toLocaleString()} • ${extractedDate}`
                  : 'IA no pudo detectar Monto y/o Fecha con certeza. Por favor complétalos en la tabla.',
              };
            })
          );
          return; // Succeeded!
        } else {
          setQueue((prev) =>
            prev.map((item) => {
              if (item.id !== itemId) return item;
              const hasValidAmount = typeof item.amount === 'number' && item.amount > 0;
              const hasValidDate = Boolean(item.date && item.date.trim().length >= 8);
              const finalStatus = hasValidAmount && hasValidDate ? 'ready' : 'incomplete';
              return {
                ...item,
                status: finalStatus,
                statusMessage: 'No se detectó Monto/Fecha',
                aiConfidenceSummary:
                  'No se detectó Monto y Fecha en el comprobante. Complétalos en la tabla.',
              };
            })
          );
          return;
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }
        lastError = err;
        if (attempt < maxAttempts) {
          // Wait before retry
          await new Promise((res) => setTimeout(res, 1200));
        }
      }
    }

    // If all attempts failed
    console.warn(`Extraction error for item ${itemId}:`, lastError?.message || lastError);
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          status: 'error',
          statusMessage: 'Error al contactar IA. Puedes reintentar o completar a mano.',
        };
      })
    );
  };

  const handleReanalyzeAll = () => {
    queue.forEach((item) => {
      if (item.previewUrl) {
        triggerAiExtractionForItem(item.id, item.previewUrl, item.mimeType);
      }
    });
  };

  // --- ITEM FIELD UPDATES (Detects manual user input to stop IA) ---
  const handleAmountChange = (itemId: string, newAmountVal: string) => {
    const parsed = newAmountVal === '' ? '' : parseFloat(newAmountVal);
    const num = typeof parsed === 'number' && !isNaN(parsed) ? parsed : '';

    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const manuallyEditedAmount = num !== '';
        const manuallyEditedDate =
          item.manuallyEditedDate || Boolean(item.date && item.date.length >= 8);

        // If user manually enters both amount and date, abort IA call if running
        if (manuallyEditedAmount && manuallyEditedDate && item.status === 'analyzing') {
          if (item.abortController) {
            item.abortController.abort();
          }
        }

        const isComplete =
          typeof num === 'number' && num > 0 && Boolean(item.date && item.date.length >= 8);

        return {
          ...item,
          amount: num,
          manuallyEditedAmount: true,
          status: isComplete
            ? 'ready'
            : item.status === 'analyzing' && manuallyEditedAmount && manuallyEditedDate
            ? 'ready'
            : item.status,
          statusMessage: isComplete ? 'Completado manualmente' : item.statusMessage,
        };
      })
    );
  };

  const handleDateChange = (itemId: string, newDateVal: string) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const hasDate = Boolean(newDateVal && newDateVal.trim().length >= 8);
        const hasAmount = typeof item.amount === 'number' && item.amount > 0;

        // If user manually enters both amount and date, abort IA call if running
        if (hasDate && hasAmount && item.status === 'analyzing') {
          if (item.abortController) {
            item.abortController.abort();
          }
        }

        const isComplete = hasDate && hasAmount;

        return {
          ...item,
          date: newDateVal,
          manuallyEditedDate: true,
          status: isComplete
            ? 'ready'
            : item.status === 'analyzing' && hasDate && hasAmount
            ? 'ready'
            : item.status,
          statusMessage: isComplete ? 'Completado manualmente' : item.statusMessage,
        };
      })
    );
  };

  const handleCostCenterChange = (itemId: string, newProject: string) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          project: newProject,
        };
      })
    );
    const item = queue.find((q) => q.id === itemId);
    if (item) {
      recordCategoryCostCenterUsage(currentUser?.email, 'General', newProject);
    }
  };

  const updateQueueItem = (itemId: string, updates: Partial<QueueItem>) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...updates } : item))
    );
  };

  const handleVendorChange = (itemId: string, newVendor: string) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          vendor: newVendor,
        };
      })
    );
  };

  const handleRemoveItem = (itemId: string) => {
    const item = queue.find((q) => q.id === itemId);
    if (item?.abortController) {
      item.abortController.abort();
    }
    setQueue((prev) => prev.filter((item) => item.id !== itemId));
  };

  // --- SAVE EXPENSE (SINGLE & BULK) ---
  const handleSaveSingleItem = (item: QueueItem) => {
    const hasAmount = typeof item.amount === 'number' && item.amount > 0;
    const hasCostCenter = Boolean(item.project && item.project.trim().length > 0);
    const hasDate = Boolean(item.date && item.date.trim().length >= 8);

    if (!hasAmount) {
      alert('El Monto es obligatorio y debe ser mayor a 0.');
      return;
    }
    if (!hasCostCenter) {
      alert('El Centro de Costos es obligatorio. Por favor selecciona o ingresa un centro de costos.');
      return;
    }
    if (!hasDate) {
      alert('La Fecha es obligatoria.');
      return;
    }

    const isPendingPaymentType = item.paymentType === 'REINTEGRO' || item.paymentType === 'PAGO_PROVEEDOR';

    const newExpense: Expense = {
      id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      date: item.date,
      vendor: item.vendor.trim() || 'Comercio / Proveedor',
      cuit: item.cuit || undefined,
      amount: Number(item.amount),
      currency: item.currency || 'ARS',
      invoiceNumber: item.invoiceNumber || undefined,
      category: 'General',
      project: item.project.trim(),

      submittedByEmail: currentUser?.email || undefined,
      submittedByName: currentUser?.name || currentUser?.email?.split('@')[0] || undefined,
      submittedByPicture: currentUser?.picture || undefined,
      bankDetails:
        item.paymentType === 'REINTEGRO' || item.paymentType === 'PAGO_PROVEEDOR'
          ? item.bankDetails
          : undefined,

      paymentType: (item.paymentType || 'TARJETA_CORPORATIVA') as ExpensePaymentType,
      reimbursable: isPendingPaymentType,
      reimbursementStatus: isPendingPaymentType
        ? item.reimbursementStatus || 'PENDING'
        : 'NOT_APPLICABLE',
      paymentMethod:
        item.paymentType === 'REINTEGRO'
          ? 'Reintegro'
          : item.paymentType === 'PAGO_PROVEEDOR'
          ? 'Pago a Proveedor'
          : item.paymentType === 'TARJETA_DEBITO_GALICIA'
          ? 'Tarjeta Débito Galicia'
          : 'Tarjeta Corporativa',
      notes: item.accountingNotes || item.notes || '',
      accountingNotes: item.accountingNotes || item.notes || '',
      items: item.items || [],
      receiptImage: item.previewUrl || undefined,
      receiptFileName: item.fileName || undefined,
      aiConfidenceSummary: item.aiConfidenceSummary || undefined,
      isAiExtracted: true,
    };

    onSaveExpense(newExpense);

    // Mark as saved and remove after brief success animation
    setQueue((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, savedSuccessfully: true } : q))
    );

    setTimeout(() => {
      setQueue((prev) => prev.filter((q) => q.id !== item.id));
    }, 500);
  };

  const handleSaveAllReady = () => {
    const validItems = queue.filter(
      (q) =>
        !q.savedSuccessfully &&
        typeof q.amount === 'number' &&
        q.amount > 0 &&
        Boolean(q.project && q.project.trim()) &&
        Boolean(q.date && q.date.trim().length >= 8)
    );

    const incompleteItems = queue.filter(
      (q) =>
        !q.savedSuccessfully &&
        !(
          typeof q.amount === 'number' &&
          q.amount > 0 &&
          Boolean(q.project && q.project.trim()) &&
          Boolean(q.date && q.date.trim().length >= 8)
        )
    );

    if (validItems.length === 0) {
      alert('No hay comprobantes completos. Completa Monto (> 0), Centro de Costos y Fecha en cada uno.');
      return;
    }

    if (incompleteItems.length > 0) {
      const confirmPartial = confirm(
        `Hay ${validItems.length} comprobante(s) completos listos para guardar y ${incompleteItems.length} comprobante(s) a los que les falta Monto, Centro de Costos o Fecha.\n\n¿Deseas guardar los ${validItems.length} comprobantes completos ahora?`
      );
      if (!confirmPartial) return;
    }

    const createdExpenses: Expense[] = [];
    const validIds = new Set(validItems.map((v) => v.id));

    validItems.forEach((item) => {
      const numAmount = typeof item.amount === 'number' ? item.amount : 0;
      const isPendingPaymentType = item.paymentType === 'REINTEGRO' || item.paymentType === 'PAGO_PROVEEDOR';
      const newExpense: Expense = {
        id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        vendor: item.vendor.trim() || 'Comercio / Proveedor',
        cuit: item.cuit ? cleanCuit(item.cuit) : undefined,
        amount: numAmount,
        currency: item.currency || 'ARS',
        date: item.date,
        createdAt: new Date().toISOString(),
        invoiceNumber: item.invoiceNumber.trim() || undefined,
        category: 'General',
        project: item.project.trim(),

        submittedByEmail: currentUser?.email || undefined,
        submittedByName: currentUser?.name || currentUser?.email?.split('@')[0] || undefined,
        submittedByPicture: currentUser?.picture || undefined,
        bankDetails:
          item.paymentType === 'REINTEGRO' || item.paymentType === 'PAGO_PROVEEDOR'
            ? item.bankDetails
            : undefined,

        paymentType: (item.paymentType || 'TARJETA_CORPORATIVA') as ExpensePaymentType,
        reimbursable: isPendingPaymentType,
        reimbursementStatus: isPendingPaymentType
          ? item.reimbursementStatus || 'PENDING'
          : 'NOT_APPLICABLE',
        paymentMethod:
          item.paymentType === 'REINTEGRO'
            ? 'Reintegro'
            : item.paymentType === 'PAGO_PROVEEDOR'
            ? 'Pago a Proveedor'
            : item.paymentType === 'TARJETA_DEBITO_GALICIA'
            ? 'Tarjeta Débito Galicia'
            : 'Tarjeta Corporativa',
        notes: item.accountingNotes || item.notes || '',
        accountingNotes: item.accountingNotes || item.notes || '',
        items: item.items || [],
        receiptImage: item.previewUrl || undefined,
        receiptFileName: item.fileName || undefined,
        aiConfidenceSummary: item.aiConfidenceSummary || undefined,
        isAiExtracted: true,
      };

      createdExpenses.push(newExpense);
    });

    if (onSaveBatchExpenses) {
      onSaveBatchExpenses(createdExpenses);
    } else {
      createdExpenses.forEach((exp) => onSaveExpense(exp));
    }

    // Mark as saved and remove after brief success animation
    setQueue((prev) =>
      prev.map((q) => (validIds.has(q.id) ? { ...q, savedSuccessfully: true } : q))
    );

    setTimeout(() => {
      setQueue((prev) => prev.filter((q) => !validIds.has(q.id)));
    }, 500);
  };

  if (!isOpen) return null;

  const analyzingCount = queue.filter((q) => q.status === 'analyzing').length;
  const readyCount = queue.filter((q) => q.status === 'ready').length;

  return (
    <div
      id="smart-scanner-modal-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-3 md:p-4"
    >
      <div
        id="smart-scanner-modal-container"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[96vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header - Compact */}
        <div className="px-3.5 py-2 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-400/30 p-0.5 flex items-center justify-center text-white shrink-0">
              <FacturaIllustration id="scanner_header_icon" className="w-4.5 h-4.5" />
            </div>
            <div className="flex items-center flex-wrap gap-x-2">
              <h2 className="text-xs sm:text-sm font-bold text-white leading-none">
                Carga de Comprobantes
              </h2>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                <Sparkles className="w-2.5 h-2.5 text-amber-400" /> Extracción con IA
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              aria-label="Cerrar modal"
              title="Cerrar modal"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Top Control Bar: Cargar Archivo(s), Analizando / Reanalizar con IA, Guardar Todos */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Primary Upload Button */}
            <label
              htmlFor="multi-receipt-upload-input"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Cargar</span>
              <input
                ref={fileInputRef}
                id="multi-receipt-upload-input"
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={(e) => handleFilesSelected(e.target.files)}
                className="hidden"
              />
            </label>

            {/* Dynamic AI Status / Action Button */}
            {analyzingCount > 0 ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold rounded-lg shadow-2xs cursor-wait"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                <span>Analizando con IA{analyzingCount > 1 ? ` (${analyzingCount})` : ''}...</span>
              </button>
            ) : queue.length > 0 ? (
              <button
                type="button"
                onClick={handleReanalyzeAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer active:scale-95"
                title="Reejecutar análisis de IA sobre todos los comprobantes cargados"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Reanalizar con IA</span>
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 font-medium">
              {queue.length} en cola {readyCount > 0 && `• ${readyCount} listos`}
            </span>

            {readyCount > 1 && (
              <button
                type="button"
                onClick={handleSaveAllReady}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer active:scale-95"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Guardar todos los listos ({readyCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Body: Drop Area or Compressed Table */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFilesSelected(e.dataTransfer.files);
          }}
          className={`flex-1 overflow-y-auto p-3 sm:p-4 transition-colors ${
            isDragging ? 'bg-indigo-50/70 ring-2 ring-indigo-500 ring-inset' : 'bg-slate-100/70'
          }`}
        >
          {queue.length === 0 ? (
            /* Empty State: Clean & Compact Dropzone */
            <div className="h-full min-h-[280px] flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-slate-300 rounded-2xl bg-white/90 hover:bg-white transition-all">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 shadow-2xs">
                <Upload className="w-6 h-6" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-slate-800 mb-1">
                Arrastra tus comprobantes aquí o selecciona desde tu equipo
              </h3>
              <p className="text-xs text-slate-500 max-w-md mb-4">
                Soporta selección múltiple de archivos JPG, PNG y PDF. La IA extraerá los datos automáticamente y sugerirá el centro de costos según la categoría.
              </p>

              <label
                htmlFor="empty-state-upload-input-compact"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer active:scale-95 flex items-center gap-2"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Seleccionar archivos</span>
                <input
                  id="empty-state-upload-input-compact"
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  onChange={(e) => handleFilesSelected(e.target.files)}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <>
              {/* 1. Desktop & Tablet View: Compressed Table */}
              <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-xs">
                <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[1050px]">
                  <thead className="bg-slate-900 text-white font-semibold text-[11px] tracking-wider uppercase sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 w-16 text-center">Foto</th>
                      <th className="py-2.5 px-3 min-w-[150px]">Nombre / Factura</th>
                      <th className="py-2.5 px-3 min-w-[110px]">
                        Monto <span className="text-rose-300 font-bold">*</span>
                      </th>
                      <th className="py-2.5 px-3 min-w-[125px]">
                        Fecha (DD-MM-AAAA) <span className="text-rose-300 font-bold">*</span>
                      </th>
                      <th className="py-2.5 px-3 min-w-[195px] w-[195px]">
                        Centro de Costos <span className="text-rose-300 font-bold">*</span>
                      </th>
                      <th className="py-2.5 px-3 min-w-[160px]">Tipo de pago</th>
                      <th className="py-2.5 px-3 min-w-[150px]">Datos de cuenta</th>
                      <th className="py-2.5 px-3 min-w-[170px]">Notas Contables</th>
                      <th className="py-2.5 px-3 w-28 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {queue.map((item, index) => {
                      // Compute smart sorted cost centers dynamically
                      const smartCostCenters = getSmartSortedCostCenters(
                        availableProjects,
                        existingExpenses,
                        currentUser?.email
                      );

                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            item.savedSuccessfully
                              ? 'bg-emerald-50/80 opacity-70'
                              : item.status === 'analyzing'
                              ? 'bg-indigo-50/40 hover:bg-indigo-50/60'
                              : index % 2 === 0
                              ? 'bg-white hover:bg-slate-50/80'
                              : 'bg-slate-50/50 hover:bg-slate-100/60'
                          }`}
                        >
                          {/* 1. COLUMNA FOTO + INDICADOR/BOTÓN REINTENTAR IA */}
                          <td className="py-2 px-2.5 align-middle text-center">
                            <div className="relative inline-block group">
                              <div
                                onClick={() =>
                                  item.previewUrl &&
                                  setPreviewZoomFile({
                                    url: item.previewUrl,
                                    mimeType: item.mimeType,
                                    fileName: item.fileName,
                                  })
                                }
                                className="w-12 h-14 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden cursor-pointer shadow-2xs hover:ring-2 hover:ring-indigo-500 transition relative flex items-center justify-center mx-auto"
                                title="Click para ver comprobante en grande (PDF o Imagen)"
                              >
                                {item.mimeType === 'application/pdf' ||
                                item.previewUrl.startsWith('data:application/pdf') ||
                                item.fileName.toLowerCase().endsWith('.pdf') ? (
                                  <div className="flex flex-col items-center justify-center text-red-500 p-0.5">
                                    <FileText className="w-5 h-5" />
                                    <span className="text-[8px] font-bold uppercase">PDF</span>
                                  </div>
                                ) : (
                                  <img
                                    src={item.previewUrl}
                                    alt="Ticket"
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold">
                                  <Eye className="w-3 h-3" />
                                </div>
                              </div>

                              {/* Status badge indicator WITH Retry IA button */}
                              <div className="mt-1 flex items-center justify-center">
                                {item.status === 'analyzing' ? (
                                  <span
                                    className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 px-1 py-0.5 rounded shadow-2xs"
                                    title="Analizando con IA..."
                                  >
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> IA...
                                  </span>
                                ) : item.status === 'error' ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      triggerAiExtractionForItem(
                                        item.id,
                                        item.previewUrl,
                                        item.mimeType
                                      )
                                    }
                                    className="inline-flex items-center gap-0.5 text-[9px] font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 px-1 py-0.5 rounded transition cursor-pointer active:scale-95 shadow-2xs"
                                    title="Error. Clic para reintentar IA"
                                  >
                                    <RotateCcw className="w-2.5 h-2.5 text-rose-600" /> Reintentar
                                  </button>
                                ) : item.status === 'incomplete' ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      triggerAiExtractionForItem(
                                        item.id,
                                        item.previewUrl,
                                        item.mimeType
                                      )
                                    }
                                    className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-1 py-0.5 rounded transition cursor-pointer active:scale-95 shadow-2xs"
                                    title="Falta Monto o Fecha. Clic para reintentar IA"
                                  >
                                    <RotateCcw className="w-2.5 h-2.5 text-amber-700" /> Reintentar
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      triggerAiExtractionForItem(
                                        item.id,
                                        item.previewUrl,
                                        item.mimeType
                                      )
                                    }
                                    className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-1 py-0.5 rounded transition cursor-pointer active:scale-95 shadow-2xs"
                                    title="OCR exitoso. Clic para reintentar IA"
                                  >
                                    <Check className="w-2.5 h-2.5" /> IA OK
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 2. COLUMNA PROVEEDOR */}
                          <td className="py-2 px-2.5 align-middle">
                            <input
                              type="text"
                              value={item.vendor}
                              onChange={(e) => handleVendorChange(item.id, e.target.value)}
                              placeholder={item.status === 'analyzing' ? '⏳ IA leyendo...' : 'Ej: YPF, Coto...'}
                              className={`w-full text-xs font-bold px-2 py-1.5 rounded-lg border focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden shadow-2xs ${
                                !item.vendor.trim() || item.status === 'analyzing'
                                  ? 'border-amber-300 bg-amber-50/40 text-amber-900 placeholder:text-amber-400'
                                  : 'border-slate-300 bg-white text-slate-900'
                              }`}
                            />
                            {item.invoiceNumber && (
                              <div className="text-[10px] text-slate-500 truncate mt-0.5" title={`Comprobante: ${item.invoiceNumber}`}>
                                N° {item.invoiceNumber}
                              </div>
                            )}
                          </td>

                          {/* 3. COLUMNA MONTO */}
                          <td className="py-2 px-2.5 align-middle">
                            <div className="relative">
                              <span className="absolute left-2 top-1.5 text-slate-400 font-bold text-xs">
                                $
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                value={item.amount === '' ? '' : item.amount}
                                onChange={(e) => handleAmountChange(item.id, e.target.value)}
                                placeholder="0.00"
                                className={`w-full pl-5 pr-2 py-1.5 text-xs font-extrabold rounded-lg border focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden ${
                                  item.amount === '' || item.amount === 0
                                    ? 'border-amber-300 bg-amber-50/40 text-amber-900 placeholder:text-amber-400'
                                    : 'border-slate-300 bg-white text-slate-900'
                                }`}
                              />
                            </div>
                          </td>

                          {/* 4. COLUMNA FECHA (DD-MM-AAAA) */}
                          <td className="py-2 px-2.5 align-middle">
                            <input
                              type="date"
                              value={item.date || ''}
                              onChange={(e) => handleDateChange(item.id, e.target.value)}
                              className={`w-full text-xs px-2 py-1.5 rounded-lg border focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden font-medium ${
                                !item.date
                                  ? 'border-amber-300 bg-amber-50/40 text-amber-900'
                                  : 'border-slate-300 bg-white text-slate-800'
                              }`}
                            />
                          </td>

                          {/* 5. COLUMNA CENTRO DE COSTOS */}
                          <td className="py-2 px-2.5 align-middle">
                            <div className="w-full min-w-[180px] max-w-[210px]">
                              <select
                                value={item.project || ''}
                                title={item.project ? `Centro seleccionado: ${item.project}` : 'Seleccionar Centro de Costos'}
                                onChange={(e) => handleCostCenterChange(item.id, e.target.value)}
                                className={`w-full text-xs px-2 py-1.5 rounded-lg border font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden transition cursor-pointer ${
                                  !item.project
                                    ? 'border-amber-300 bg-amber-50/60 text-slate-600 font-semibold'
                                    : 'border-slate-300 bg-white text-slate-900 shadow-2xs'
                                }`}
                              >
                                <option value="" disabled>
                                  {item.status === 'analyzing' ? '⏳ IA asignando...' : '— Seleccionar Centro de Costos —'}
                                </option>
                                {smartCostCenters.frequent.length > 0 && (
                                  <optgroup label="⭐ Frecuentes">
                                    {smartCostCenters.frequent.map((p) => (
                                      <option key={`p-sug-${item.id}-${p}`} value={p} className="font-normal text-xs py-1">
                                        {p}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                <optgroup label="📁 Todos los Centros (A-Z)">
                                  {smartCostCenters.alphabetical.map((p) => (
                                    <option key={`p-rem-${item.id}-${p}`} value={p} className="font-normal text-xs py-1">
                                      {p}
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                            </div>
                          </td>

                          {/* 6. COLUMNA TIPO DE PAGO */}
                          <td className="py-2 px-2.5 align-middle">
                            <select
                              value={item.paymentType || ''}
                              onChange={(e) => {
                                const val = e.target.value as ExpensePaymentType;
                                const isReimb = val === 'REINTEGRO';
                                
                                let newBank = item.bankDetails;
                                if (isReimb && !item.bankDetails) {
                                  newBank = storedBank || (currentUser?.name ? {
                                    accountHolder: currentUser.name,
                                    bankName: '',
                                    accountType: 'Indefinido',
                                    cbuCvu: '',
                                    alias: '',
                                    cuitCuil: '',
                                  } : undefined);
                                } else if (val === 'PAGO_PROVEEDOR') {
                                  // Do not auto-fill bank details from OCR / auto-matching
                                  newBank = item.bankDetails;
                                }

                                updateQueueItem(item.id, {
                                  paymentType: val,
                                  reimbursable: isReimb,
                                  reimbursementStatus: isReimb ? 'PENDING' : 'NOT_APPLICABLE',
                                  bankDetails: newBank,
                                  paymentMethod:
                                    val === 'REINTEGRO'
                                      ? 'Reintegro'
                                      : val === 'PAGO_PROVEEDOR'
                                      ? 'Pago Proveedor'
                                      : val === 'TARJETA_CORPORATIVA'
                                      ? 'Tarjeta Corporativa'
                                      : val === 'TARJETA_DEBITO_GALICIA'
                                      ? 'Tarjeta Débito Galicia'
                                      : '',
                                });
                              }}
                              className={`w-full text-xs px-2 py-1.5 rounded-lg border font-medium focus:ring-1 focus:ring-indigo-500 outline-hidden ${
                                !item.paymentType
                                  ? 'border-slate-300 bg-white text-slate-500'
                                  : 'border-slate-300 bg-white text-slate-800'
                              }`}
                            >
                              <option value="" disabled>
                                — Tipo de Pago —
                              </option>
                              <option value="TARJETA_CORPORATIVA">💳 Tarjeta Corporativa</option>
                              <option value="REINTEGRO">🔄 Reintegro</option>
                              <option value="TARJETA_DEBITO_GALICIA">🏦 Débito Galicia</option>
                              <option value="PAGO_PROVEEDOR">🏢 Pago Proveedor</option>
                            </select>
                          </td>

                          {/* 7. COLUMNA DATOS DE CUENTA */}
                          <td className="py-2 px-2.5 align-middle">
                            <AccountDataCell
                              item={item}
                              currentUser={currentUser}
                              storedBank={storedBank}
                              vendors={vendors}
                              onAddVendor={onAddVendor}
                              onUpdateBankDetails={(newBank) => {
                                setQueue((prev) =>
                                  prev.map((q) => (q.id === item.id ? { ...q, bankDetails: newBank } : q))
                                );
                              }}
                              onSelectAccount={({ bankDetails }) => {
                                setQueue((prev) =>
                                  prev.map((q) => (q.id === item.id ? { ...q, bankDetails } : q))
                                );
                              }}
                            />
                          </td>

                          {/* 8. COLUMNA NOTAS CONTABLES */}
                          <td className="py-2 px-2.5 align-middle">
                            <input
                              type="text"
                              value={item.accountingNotes ?? item.notes ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateQueueItem(item.id, { accountingNotes: val, notes: val });
                              }}
                              placeholder="Detalle o nota contable..."
                              className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 outline-hidden"
                            />
                          </td>

                          {/* 9. COLUMNA ACCIONES: Guardar & Eliminar */}
                          <td className="py-2 px-2.5 align-middle text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Botón Guardar (Solo Ícono) */}
                              <button
                                type="button"
                                disabled={item.savedSuccessfully}
                                onClick={() => handleSaveSingleItem(item)}
                                className={`p-2 rounded-lg text-white shadow-2xs transition flex items-center justify-center cursor-pointer active:scale-95 ${
                                  item.savedSuccessfully
                                    ? 'bg-emerald-600 opacity-90'
                                    : 'bg-emerald-600 hover:bg-emerald-700'
                                }`}
                                title={item.savedSuccessfully ? 'Comprobante guardado' : 'Guardar comprobante'}
                              >
                                {item.savedSuccessfully ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <Save className="w-4 h-4" />
                                )}
                              </button>

                              {/* Botón Eliminar */}
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                title="Eliminar de la cola"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. Mobile View: Structured Cards */}
            <div className="block md:hidden space-y-3">
              {queue.map((item) => {
                const smartCostCenters = getSmartSortedCostCenters(
                  availableProjects,
                  existingExpenses,
                  currentUser?.email
                );

                return (
                  <div
                    key={`mobile-card-${item.id}`}
                    className={`bg-white rounded-xl border p-3.5 shadow-2xs space-y-3 transition-all ${
                      item.savedSuccessfully
                        ? 'border-emerald-300 bg-emerald-50/50 opacity-75'
                        : item.status === 'analyzing'
                        ? 'border-indigo-200 bg-indigo-50/20'
                        : 'border-slate-200'
                    }`}
                  >
                    {/* Header row: Thumbnail, file details, status, delete button */}
                    <div className="flex items-center justify-between gap-2.5 pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          onClick={() =>
                            item.previewUrl &&
                            setPreviewZoomFile({
                              url: item.previewUrl,
                              mimeType: item.mimeType,
                              fileName: item.fileName,
                            })
                          }
                          className="w-12 h-12 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden cursor-pointer shrink-0 relative flex items-center justify-center shadow-2xs"
                          title="Ver comprobante ampliado"
                        >
                          {item.mimeType === 'application/pdf' ||
                          item.previewUrl.startsWith('data:application/pdf') ||
                          item.fileName.toLowerCase().endsWith('.pdf') ? (
                            <div className="flex flex-col items-center justify-center text-red-500">
                              <FileText className="w-5 h-5" />
                              <span className="text-[7.5px] font-bold uppercase">PDF</span>
                            </div>
                          ) : (
                            <img
                              src={item.previewUrl}
                              alt="Ticket"
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <div className="absolute inset-0 bg-black/25 flex items-center justify-center text-white text-[9px] opacity-0 active:opacity-100">
                            <Eye className="w-3.5 h-3.5" />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">
                            {item.fileName || 'Comprobante'}
                          </div>
                          {item.invoiceNumber && (
                            <div className="text-[10.5px] text-slate-500 font-medium truncate">
                              N° {item.invoiceNumber}
                            </div>
                          )}
                          <div className="mt-0.5">
                            {item.status === 'analyzing' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded shadow-2xs animate-pulse">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" /> Analizando IA...
                              </span>
                            ) : item.status === 'error' || item.status === 'incomplete' ? (
                              <button
                                type="button"
                                onClick={() =>
                                  triggerAiExtractionForItem(item.id, item.previewUrl, item.mimeType)
                                }
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded transition cursor-pointer active:scale-95 shadow-2xs"
                              >
                                <RotateCcw className="w-2.5 h-2.5" /> Reintentar IA
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded shadow-2xs">
                                <Check className="w-2.5 h-2.5" /> IA OK
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer shrink-0"
                        title="Eliminar comprobante de la cola"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Card Form fields */}
                    <div className="space-y-2.5">
                      {/* 1. Nombre / Factura */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Nombre / Factura
                        </label>
                        <input
                          type="text"
                          value={item.vendor}
                          onChange={(e) => handleVendorChange(item.id, e.target.value)}
                          placeholder={item.status === 'analyzing' ? '⏳ IA leyendo...' : 'Ej: YPF, Coto...'}
                          className={`w-full text-xs font-bold px-2 py-1.5 rounded-lg border focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden shadow-2xs ${
                            !item.vendor.trim() || item.status === 'analyzing'
                              ? 'border-amber-300 bg-amber-50/40 text-amber-900 placeholder:text-amber-400'
                              : 'border-slate-300 bg-white text-slate-900'
                          }`}
                        />
                        {item.invoiceNumber && (
                          <div className="text-[10px] text-slate-500 truncate mt-0.5">
                            N° {item.invoiceNumber}
                          </div>
                        )}
                      </div>

                      {/* 2. Monto & Fecha */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Monto <span className="text-rose-500 font-bold">*</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-slate-400 font-bold text-xs">
                              $
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              value={item.amount === '' ? '' : item.amount}
                              onChange={(e) => handleAmountChange(item.id, e.target.value)}
                              placeholder="0.00"
                              className={`w-full pl-6 pr-2 py-2 text-xs font-extrabold rounded-lg border focus:ring-1 focus:ring-indigo-500 outline-hidden ${
                                item.amount === '' || item.amount === 0
                                  ? 'border-amber-300 bg-amber-50/40 text-amber-900'
                                  : 'border-slate-300 bg-white text-slate-900'
                              }`}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Fecha Doc. <span className="text-rose-500 font-bold">*</span>
                          </label>
                          <input
                            type="date"
                            value={item.date || ''}
                            onChange={(e) => handleDateChange(item.id, e.target.value)}
                            className={`w-full text-xs px-2 py-2 rounded-lg border focus:ring-1 focus:ring-indigo-500 outline-hidden font-medium ${
                              !item.date
                                ? 'border-amber-300 bg-amber-50/40 text-amber-900'
                                : 'border-slate-300 bg-white text-slate-800'
                            }`}
                          />
                        </div>
                      </div>

                      {/* 3. Centro de Costos */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Centro de Costos <span className="text-rose-500 font-bold">*</span>
                        </label>
                        <select
                          value={item.project || ''}
                          onChange={(e) => handleCostCenterChange(item.id, e.target.value)}
                          className={`w-full text-xs px-2.5 py-2 rounded-lg border font-medium focus:ring-1 focus:ring-indigo-500 outline-hidden ${
                            !item.project
                              ? 'border-amber-300 bg-amber-50/40 text-slate-500'
                              : 'border-slate-300 bg-white text-slate-800'
                          }`}
                        >
                          <option value="" disabled>
                            {item.status === 'analyzing' ? '⏳ IA asignando...' : '— Seleccionar Centro —'}
                          </option>
                          {smartCostCenters.frequent.length > 0 && (
                            <optgroup label="⭐ Frecuentes">
                              {smartCostCenters.frequent.map((p) => (
                                <option key={`m-p-sug-${item.id}-${p}`} value={p} className="font-normal text-xs">
                                  {p}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="📁 Otros A-Z">
                            {smartCostCenters.alphabetical.map((p) => (
                              <option key={`m-p-rem-${item.id}-${p}`} value={p} className="font-normal text-xs">
                                {p}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>

                      {/* 4. Tipo de Pago & Datos de Cuenta */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Tipo de Pago
                          </label>
                          <select
                            value={item.paymentType || ''}
                            onChange={(e) => {
                              const val = e.target.value as ExpensePaymentType;
                              const isReimb = val === 'REINTEGRO';
                              let newBank = item.bankDetails;
                              if (isReimb && !item.bankDetails) {
                                newBank = storedBank || (currentUser?.name ? {
                                  accountHolder: currentUser.name,
                                  bankName: '',
                                  accountType: 'Indefinido',
                                  cbuCvu: '',
                                  alias: '',
                                  cuitCuil: '',
                                } : undefined);
                              } else if (val === 'PAGO_PROVEEDOR') {
                                // Do not auto-fill bank details from OCR / auto-matching
                                newBank = item.bankDetails;
                              }
                              updateQueueItem(item.id, {
                                paymentType: val,
                                reimbursable: isReimb,
                                reimbursementStatus: isReimb ? 'PENDING' : 'NOT_APPLICABLE',
                                bankDetails: newBank,
                                paymentMethod:
                                  val === 'REINTEGRO'
                                    ? 'Reintegro'
                                    : val === 'PAGO_PROVEEDOR'
                                    ? 'Pago a Proveedor'
                                    : val === 'TARJETA_CORPORATIVA'
                                    ? 'Tarjeta Corporativa'
                                    : val === 'TARJETA_DEBITO_GALICIA'
                                    ? 'Tarjeta Débito Galicia'
                                    : '',
                              });
                            }}
                            className={`w-full text-xs px-2 py-2 rounded-lg border font-medium focus:ring-1 focus:ring-indigo-500 outline-hidden ${
                              !item.paymentType
                                ? 'border-slate-300 bg-white text-slate-500'
                                : 'border-slate-300 bg-white text-slate-800'
                            }`}
                          >
                            <option value="" disabled>
                              — Tipo de Pago —
                            </option>
                            <option value="TARJETA_CORPORATIVA">💳 Tarjeta Corporativa</option>
                            <option value="REINTEGRO">🔄 Reintegro (A mí)</option>
                            <option value="TARJETA_DEBITO_GALICIA">🏦 Débito Galicia</option>
                            <option value="PAGO_PROVEEDOR">🏢 Pago Proveedor</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Datos de Cuenta
                          </label>
                          <AccountDataCell
                            item={item}
                            currentUser={currentUser}
                            storedBank={storedBank}
                            vendors={vendors}
                            onAddVendor={onAddVendor}
                            onUpdateBankDetails={(newBank) => {
                              setQueue((prev) =>
                                prev.map((q) => (q.id === item.id ? { ...q, bankDetails: newBank } : q))
                              );
                            }}
                            onSelectAccount={({ bankDetails }) => {
                              setQueue((prev) =>
                                prev.map((q) => (q.id === item.id ? { ...q, bankDetails } : q))
                              );
                            }}
                          />
                        </div>
                      </div>

                      {/* 5. Notas Contables en Móvil */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Notas Contables
                        </label>
                        <input
                          type="text"
                          value={item.accountingNotes ?? item.notes ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateQueueItem(item.id, { accountingNotes: val, notes: val });
                          }}
                          placeholder="Detalle o nota contable..."
                          className="w-full text-xs px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 outline-hidden"
                        />
                      </div>

                      {/* Botón Guardar en Móvil */}
                      <div className="pt-1.5">
                        <button
                          type="button"
                          disabled={item.savedSuccessfully}
                          onClick={() => handleSaveSingleItem(item)}
                          className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white shadow-xs transition flex items-center justify-center gap-2 cursor-pointer active:scale-98 ${
                            item.savedSuccessfully
                              ? 'bg-emerald-600 opacity-90'
                              : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                        >
                          {item.savedSuccessfully ? (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Guardado Exitosamente</span>
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              <span>Guardar este Comprobante</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        </div>

        {/* Footer info bar - Compact */}
        <div className="bg-white border-t border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">
              {queue.length === 0
                ? 'Ningún comprobante cargado'
                : `${queue.length} comprobante${queue.length > 1 ? 's' : ''} en cola`}
            </span>
            {readyCount > 0 && (
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium border border-emerald-200">
                {readyCount} listo{readyCount > 1 ? 's' : ''} para guardar
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium transition cursor-pointer"
            >
              Cerrar
            </button>
            {readyCount > 0 && (
              <button
                type="button"
                onClick={handleSaveAllReady}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Guardar todos ({readyCount})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FULL PREVIEW ZOOM MODAL (HANDLES BOTH IMAGES & PDF EMBEDS) */}
      {previewZoomFile && (
        <div
          onClick={() => setPreviewZoomFile(null)}
          className="fixed inset-0 z-70 bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 cursor-zoom-out animate-in fade-in duration-100"
        >
          {previewZoomFile.mimeType === 'application/pdf' ||
          previewZoomFile.url.startsWith('data:application/pdf') ||
          previewZoomFile.fileName?.toLowerCase().endsWith('.pdf') ? (
            /* PDF Container */
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative w-[95vw] max-w-5xl h-[88vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-slate-700 cursor-default"
            >
              <div className="absolute top-2.5 right-2.5 z-20">
                <button
                  type="button"
                  onClick={() => setPreviewZoomFile(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 transition cursor-pointer"
                  aria-label="Cerrar vista previa"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <SafePdfViewer
                url={previewZoomFile.url}
                fileName={previewZoomFile.fileName || 'comprobante.pdf'}
                title={previewZoomFile.fileName || 'Comprobante en formato PDF'}
                className="w-full h-full border-0 rounded-none shadow-none"
                heightClass="h-full"
              />
            </div>
          ) : (
            /* Image Container */
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl p-2 cursor-default flex flex-col"
            >
              <button
                onClick={() => setPreviewZoomFile(null)}
                className="absolute top-4 right-4 bg-slate-900/80 hover:bg-slate-900 text-white p-2 rounded-full transition cursor-pointer z-10"
                aria-label="Cerrar vista previa"
              >
                <X className="w-5 h-5" />
              </button>
              <img
                src={previewZoomFile.url}
                alt="Comprobante ampliado"
                className="max-h-[85vh] w-auto object-contain mx-auto rounded-xl"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
