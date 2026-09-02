import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Building2,
  FileText,
  CreditCard,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Upload,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { Vendor, UserBankDetails } from '../types';
import { formatCuit } from '../utils/helpers';

interface VendorFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (vendorData: Omit<Vendor, 'id' | 'createdAt'>) => void;
  initialData?: Partial<Vendor> | null;
  existingVendors?: Vendor[];
  title?: string;
  subtitle?: string;
  suggestedName?: string;
  suggestedCuit?: string;
}

export function VendorFormModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  existingVendors = [],
  title,
  subtitle,
  suggestedName,
  suggestedCuit,
}: VendorFormModalProps) {
  const [name, setName] = useState('');
  const [cuit, setCuit] = useState('');
  const [notes, setNotes] = useState('');
  const [bankDetails, setBankDetails] = useState<UserBankDetails>({
    bankName: '',
    accountType: 'Indefinido',
    cbuCvu: '',
    alias: '',
    cuitCuil: '',
    accountHolder: '',
  });

  // State for explicit CUIT approval when CUIT coincides with an existing vendor
  const [isCuitApproved, setIsCuitApproved] = useState(false);
  const [showCuitConfirmDialog, setShowCuitConfirmDialog] = useState(false);

  // OCR Document Processing state
  const [isProcessingDoc, setIsProcessingDoc] = useState(false);
  const [docFeedback, setDocFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
    details?: string;
  } | null>(null);
  const [prevValuesBeforeOcr, setPrevValuesBeforeOcr] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const prevIsOpenRef = useRef(false);

  // Initialize or reset form state ONLY when modal opens (transition from closed to open)
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      if (initialData) {
        setName(initialData.name || '');
        setCuit(initialData.cuit || '');
        setNotes(initialData.notes || '');

        // Normalize legacy account type if needed
        let initialAccType: 'Indefinido' | 'Billetera' | 'Caja de Ahorro' | 'Cuenta Corriente' = 'Indefinido';
        const rawType = (initialData.bankDetails?.accountType || '').toLowerCase();
        if (rawType.includes('billetera') || rawType.includes('cvu') || rawType.includes('virtual')) {
          initialAccType = 'Billetera';
        } else if (rawType.includes('corriente')) {
          initialAccType = 'Cuenta Corriente';
        } else if (rawType.includes('ahorro')) {
          initialAccType = 'Caja de Ahorro';
        } else if (rawType === 'indefinido') {
          initialAccType = 'Indefinido';
        }

        // Normalize currency
        let initialCurrency: '$Ar' | 'u$' = '$Ar';
        if (
          initialData.bankDetails?.currency === 'u$' ||
          initialData.bankDetails?.currency === 'USD' ||
          rawType.includes('usd') ||
          rawType.includes('u$') ||
          rawType.includes('dolar')
        ) {
          initialCurrency = 'u$';
        }

        setBankDetails({
          bankName: initialData.bankDetails?.bankName || '',
          accountType: initialAccType,
          currency: initialCurrency,
          cbuCvu: initialData.bankDetails?.cbuCvu || '',
          alias: initialData.bankDetails?.alias || '',
          cuitCuil: initialData.bankDetails?.cuitCuil || initialData.cuit || '',
          accountHolder: initialData.bankDetails?.accountHolder || initialData.name || '',
        });
      } else {
        setName('');
        setCuit('');
        setNotes('');
        setBankDetails({
          bankName: '',
          accountType: 'Indefinido',
          currency: '$Ar',
          cbuCvu: '',
          alias: '',
          cuitCuil: '',
          accountHolder: '',
        });
      }
      setDocFeedback(null);
      setPrevValuesBeforeOcr(null);
      setIsProcessingDoc(false);
      setIsCuitApproved(false);
      setShowCuitConfirmDialog(false);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  // Clean CBU/CVU helper (digits only)
  const cleanNumber = (val?: string) => (val || '').replace(/[^0-9]/g, '');
  const cleanAlias = (val?: string) => (val || '').trim().toLowerCase();
  const cleanCuit = (val?: string) => (val || '').replace(/[^0-9]/g, '');

  // Validation against existing catalog vendors (excluding current vendor being edited)
  const validation = useMemo(() => {
    const currentId = initialData?.id;
    const otherVendors = (existingVendors || []).filter((v) => !currentId || v.id !== currentId);

    const enteredAlias = cleanAlias(bankDetails.alias);
    const enteredCbu = cleanNumber(bankDetails.cbuCvu);
    const enteredCuit = cleanCuit(cuit || bankDetails.cuitCuil);

    // 1. Alias collision (FORBIDDEN)
    let aliasCollision: { vendorName: string; alias: string } | null = null;
    if (enteredAlias) {
      const match = otherVendors.find((v) => cleanAlias(v.bankDetails?.alias) === enteredAlias);
      if (match) {
        aliasCollision = {
          vendorName: match.name,
          alias: bankDetails.alias || '',
        };
      }
    }

    // 2. CBU / CVU collision (FORBIDDEN)
    let cbuCollision: { vendorName: string; cbu: string } | null = null;
    if (enteredCbu && enteredCbu.length >= 8) {
      const match = otherVendors.find((v) => cleanNumber(v.bankDetails?.cbuCvu) === enteredCbu);
      if (match) {
        cbuCollision = {
          vendorName: match.name,
          cbu: bankDetails.cbuCvu || '',
        };
      }
    }

    // 3. CUIT collision (REQUIRES EXPLICIT APPROVAL)
    let cuitCollision: { vendorName: string; cuit: string; bankDetails?: UserBankDetails } | null = null;
    if (enteredCuit && enteredCuit.length >= 8) {
      const match = otherVendors.find((v) => cleanCuit(v.cuit || v.bankDetails?.cuitCuil) === enteredCuit);
      if (match) {
        cuitCollision = {
          vendorName: match.name,
          cuit: cuit || bankDetails.cuitCuil || '',
          bankDetails: match.bankDetails,
        };
      }
    }

    const hasBlockingError = Boolean(aliasCollision || cbuCollision);

    return {
      aliasCollision,
      cbuCollision,
      cuitCollision,
      hasBlockingError,
    };
  }, [existingVendors, initialData, bankDetails.alias, bankDetails.cbuCvu, bankDetails.cuitCuil, cuit]);

  // Handle OCR file processing
  const handleProcessDocument = async (file: File) => {
    if (!file) return;
    setIsProcessingDoc(true);
    setDocFeedback(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        try {
          const res = await fetch('/api/process-vendor-doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: base64,
              mimeType: file.type || 'image/jpeg',
            }),
          });
          const result = await res.json();
          if (result.success && result.data) {
            const data = result.data;
            // Save prev values to allow revert
            setPrevValuesBeforeOcr({
              name,
              cuit,
              notes,
              bankDetails: { ...bankDetails },
            });

            const bankName = data.bankName || data.bankDetails?.bankName || '';
            const accountType = data.accountType || data.bankDetails?.accountType || '';
            const cbuCvu = data.cbuCvu || data.bankDetails?.cbuCvu || '';
            const alias = data.alias || data.bankDetails?.alias || '';
            const cuitVal = data.cuit || data.bankDetails?.cuitCuil || '';
            const accountHolder = data.accountHolder || data.name || data.bankDetails?.accountHolder || '';

            if (data.name && (!name || name === 'Nuevo Proveedor' || name.trim() === '')) {
              setName(data.name);
            }
            if (cuitVal) {
              setCuit(cuitVal);
            }
            if (data.notes) {
              setNotes((prev) => (prev ? `${prev} | ${data.notes}` : data.notes));
            }

            setBankDetails((prev) => ({
              ...prev,
              bankName: bankName || prev.bankName,
              accountType: accountType || prev.accountType,
              cbuCvu: cbuCvu || prev.cbuCvu,
              alias: alias || prev.alias,
              cuitCuil: cuitVal || prev.cuitCuil,
              accountHolder: accountHolder || name || prev.accountHolder,
            }));

            setDocFeedback({
              type: 'success',
              message: `✅ Datos leídos con éxito: ${data.name || 'Constancia/Comprobante'}`,
              details: data.confidenceSummary || 'Información extraída con IA y aplicada al formulario.',
            });
          } else {
            setDocFeedback({
              type: 'warning',
              message: '⚠️ La IA no pudo extraer datos claros del documento adjunto.',
            });
          }
        } catch (err: any) {
          console.error('Error processing vendor document:', err);
          setDocFeedback({
            type: 'error',
            message: '❌ Error al comunicarse con el servicio de lectura IA.',
          });
        } finally {
          setIsProcessingDoc(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('FileReader error:', err);
      setIsProcessingDoc(false);
      setDocFeedback({
        type: 'error',
        message: '❌ No se pudo leer el archivo seleccionado.',
      });
    }
  };

  // Clipboard paste listener for quick screenshot pasting (Ctrl+V / Cmd+V)
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleProcessDocument(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  if (!isOpen) return null;

  const executeSave = () => {
    const hasAnyBank = Boolean(
      bankDetails.bankName?.trim() ||
        bankDetails.cbuCvu?.trim() ||
        bankDetails.alias?.trim() ||
        bankDetails.accountHolder?.trim()
    );

    const cleanCuit = cuit.trim();

    const payload: Omit<Vendor, 'id' | 'createdAt'> = {
      name: name.trim(),
      cuit: cleanCuit || undefined,
      notes: notes.trim() || undefined,
      bankDetails: hasAnyBank
        ? {
            bankName: bankDetails.bankName.trim(),
            accountType: bankDetails.accountType || 'Indefinido',
            currency: bankDetails.currency || '$Ar',
            cbuCvu: bankDetails.cbuCvu.trim(),
            alias: bankDetails.alias.trim(),
            cuitCuil: cleanCuit || (bankDetails.cuitCuil || '').trim(),
            accountHolder: name.trim() || bankDetails.accountHolder?.trim() || '',
          }
        : undefined,
    };

    onSave(payload);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!name.trim()) {
      alert('Por favor ingrese el Nombre o Razón Social del proveedor.');
      return;
    }

    if (validation.hasBlockingError) {
      if (validation.aliasCollision) {
        alert(
          `No es posible guardar: El Alias "${validation.aliasCollision.alias}" ya está registrado en el proveedor "${validation.aliasCollision.vendorName}". Los Alias bancarios no pueden duplicarse.`
        );
      } else if (validation.cbuCollision) {
        alert(
          `No es posible guardar: El CBU/CVU "${validation.cbuCollision.cbu}" ya está registrado en el proveedor "${validation.cbuCollision.vendorName}". Los CBU/CVU no pueden duplicarse.`
        );
      }
      return;
    }

    // If CUIT collision exists, block until user checks the approval box below the CUIT field
    if (validation.cuitCollision && !isCuitApproved) {
      alert(
        `Coincidencia de CUIT detectada: El CUIT ${validation.cuitCollision.cuit} ya pertenece a "${validation.cuitCollision.vendorName}". Para guardar, debes tildar la casilla de confirmación ubicada debajo del campo CUIT.`
      );
      return;
    }

    executeSave();
  };

  const modalTitle = title || (initialData ? 'Editar Proveedor' : 'Nuevo Proveedor');
  const modalSubtitle =
    subtitle || (initialData ? 'Actualiza los datos del catálogo y cuentas de pago' : 'Registra un proveedor en el catálogo oficial');

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
      <div
        className={`bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[94vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200 relative ${
          isDragging ? 'ring-4 ring-indigo-500 ring-offset-2' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleProcessDocument(e.dataTransfer.files[0]);
          }
        }}
      >
        {/* Full-area Drag Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-indigo-900/90 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-white animate-in fade-in">
            <div className="w-20 h-20 rounded-3xl bg-white text-indigo-600 flex items-center justify-center shadow-xl animate-bounce mb-4">
              <Upload className="w-10 h-10" />
            </div>
            <h4 className="text-xl font-extrabold text-white">¡Suelta el archivo aquí!</h4>
            <p className="text-sm text-indigo-200 mt-1 max-w-md text-center">
              Constancia de CUIT, Factura o Comprobante bancario para autocompletar con IA.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white tracking-tight">{modalTitle}</h3>
              <p className="text-xs text-slate-300">{modalSubtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {/* ENLARGED DRAG & DROP ZONE */}
          <div className="rounded-3xl border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-gradient-to-b from-indigo-50/60 to-white p-5 sm:p-6 transition text-center relative group">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleProcessDocument(e.target.files[0]);
                }
              }}
            />

            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition shadow-2xs">
                {isProcessingDoc ? (
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                ) : (
                  <Upload className="w-6 h-6" />
                )}
              </div>

              <div>
                <h4 className="text-sm font-extrabold text-slate-900">
                  {isProcessingDoc
                    ? 'Procesando documento con Inteligencia Artificial...'
                    : 'Arrastra y suelta aquí la Constancia de CUIT, Factura o Comprobante'}
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
                  La IA detectará automáticamente <strong>Nombre / Razón Social</strong>, <strong>CUIT</strong>,{' '}
                  <strong>Alias</strong>, <strong>CBU</strong> y <strong>Banco</strong>.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isProcessingDoc}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Explorar Archivo (PDF / Imagen)</span>
                </button>
                <span className="text-xs text-slate-400 font-medium px-1">o pega una captura con</span>
                <kbd className="px-2 py-1 text-[11px] font-mono font-bold text-slate-700 bg-white border border-slate-300 rounded-lg shadow-2xs">
                  Ctrl + V
                </kbd>
              </div>
            </div>
          </div>

          {/* Document Feedback Banner */}
          {docFeedback && (
            <div
              className={`p-3.5 rounded-2xl text-xs flex items-start justify-between gap-2 border animate-in fade-in ${
                docFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : docFeedback.type === 'warning'
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : 'bg-rose-50 text-rose-900 border-rose-200'
              }`}
            >
              <div className="flex items-start space-x-2.5">
                {docFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-bold">{docFeedback.message}</p>
                  {docFeedback.details && <p className="text-[11px] opacity-90 mt-0.5">{docFeedback.details}</p>}
                </div>
              </div>
              {prevValuesBeforeOcr && (
                <button
                  type="button"
                  onClick={() => {
                    setName(prevValuesBeforeOcr.name);
                    setCuit(prevValuesBeforeOcr.cuit);
                    setNotes(prevValuesBeforeOcr.notes);
                    setBankDetails(prevValuesBeforeOcr.bankDetails);
                    setPrevValuesBeforeOcr(null);
                    setDocFeedback(null);
                  }}
                  className="text-[11px] font-bold underline hover:opacity-80 shrink-0 cursor-pointer"
                >
                  Deshacer
                </button>
              )}
            </div>
          )}

          {/* Validation Errors & Alerts */}
          {(validation.aliasCollision || validation.cbuCollision) && (
            <div className="space-y-2">
              {validation.aliasCollision && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start space-x-2.5 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold text-rose-950">Error: Alias bancario duplicado (Prohibido)</p>
                    <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">
                      El Alias <strong>&quot;{validation.aliasCollision.alias}&quot;</strong> ya está registrado para el proveedor{' '}
                      <strong>&quot;{validation.aliasCollision.vendorName}&quot;</strong>. Los Alias bancarios deben ser únicos.
                    </p>
                  </div>
                </div>
              )}

              {validation.cbuCollision && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start space-x-2.5 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold text-rose-950">Error: CBU/CVU bancario duplicado (Prohibido)</p>
                    <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">
                      El CBU/CVU <strong>&quot;{validation.cbuCollision.cbu}&quot;</strong> ya está registrado para el proveedor{' '}
                      <strong>&quot;{validation.cbuCollision.vendorName}&quot;</strong>. Los CBU/CVU no pueden duplicarse.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <form id="vendor-form-modal-form" onSubmit={handleSubmit} className="space-y-4">
            {/* General Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nombre o Razón Social <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Distribuidora Norte S.A. o Juan Pérez"
                  className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white transition"
                />
                {suggestedName && suggestedName.trim() && name.trim().toLowerCase() !== suggestedName.trim().toLowerCase() && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 animate-in fade-in">
                    <span className="text-[11px] text-slate-500 font-medium">Sugerencia del comprobante:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const val = suggestedName.trim();
                        setName(val);
                        if (!bankDetails.accountHolder) {
                          setBankDetails((prev) => ({ ...prev, accountHolder: val }));
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200 text-[11px] font-semibold transition cursor-pointer active:scale-95"
                      title="Clic para aplicar este nombre o razón social"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
                      <span className="truncate max-w-[280px]">{suggestedName.trim()}</span>
                      <span className="text-[10px] text-indigo-500 font-normal ml-0.5">(aplicar)</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">CUIT / CUIL</label>
                <input
                  type="text"
                  value={cuit}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCuit(val);
                    setBankDetails((prev) => ({ ...prev, cuitCuil: val }));
                    setIsCuitApproved(false);
                  }}
                  placeholder="Ej: 30-12345678-9"
                  className={`w-full px-3.5 py-2 rounded-2xl border text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white transition ${
                    validation.cuitCollision ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200'
                  }`}
                />
                {suggestedCuit && suggestedCuit.trim() && cuit.replace(/[^0-9]/g, '') !== suggestedCuit.replace(/[^0-9]/g, '') && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 animate-in fade-in">
                    <span className="text-[11px] text-slate-500 font-medium">Sugerencia del comprobante:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const val = suggestedCuit.trim();
                        setCuit(val);
                        setBankDetails((prev) => ({ ...prev, cuitCuil: val }));
                        setIsCuitApproved(false);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200 text-[11px] font-semibold font-mono transition cursor-pointer active:scale-95"
                      title="Clic para aplicar este CUIT"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
                      <span>{formatCuit(suggestedCuit.trim())}</span>
                      <span className="text-[10px] text-indigo-500 font-normal font-sans ml-0.5">(aplicar)</span>
                    </button>
                  </div>
                )}

                {/* Cartel de Coincidencia de CUIT colocado directamente debajo del campo del CUIT */}
                {validation.cuitCollision && (
                  <div className="mt-2.5 p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2 animate-in fade-in">
                    <div className="flex items-start space-x-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-extrabold text-amber-950">Coincidencia de CUIT detectada</p>
                        <p className="text-[11px] text-amber-900 mt-0.5 leading-relaxed">
                          El CUIT <strong>{validation.cuitCollision.cuit}</strong> ya se encuentra registrado en el catálogo bajo el proveedor{' '}
                          <strong>&quot;{validation.cuitCollision.vendorName}&quot;</strong>.
                        </p>
                      </div>
                    </div>

                    <label className="flex items-center space-x-2.5 p-2 bg-white/90 rounded-xl border border-amber-200 hover:border-amber-400 cursor-pointer text-amber-950 font-semibold text-[11px] transition">
                      <input
                        type="checkbox"
                        checked={isCuitApproved}
                        onChange={(e) => setIsCuitApproved(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-amber-300 cursor-pointer shrink-0"
                      />
                      <span>
                        He verificado la coincidencia y autorizo registrar este proveedor con el mismo CUIT (misma empresa/titular con diferente cuenta).
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Bank / Transfer Details Card */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    Datos Bancarios y Transferencia
                  </h4>
                </div>
                <span className="text-[10px] text-slate-500">Para liquidación directa</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Alias Bancario
                    {validation.aliasCollision && <span className="text-rose-600 font-bold ml-1">(Duplicado)</span>}
                  </label>
                  <input
                    type="text"
                    value={bankDetails.alias || ''}
                    onChange={(e) => setBankDetails({ ...bankDetails, alias: e.target.value })}
                    placeholder="ejemplo.alias.mp"
                    className={`w-full px-3 py-1.5 rounded-xl border text-xs font-mono outline-hidden transition ${
                      validation.aliasCollision
                        ? 'border-rose-300 bg-rose-50/50 text-rose-900 focus:ring-2 focus:ring-rose-500'
                        : 'border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    CBU / CVU (22 dígitos)
                    {validation.cbuCollision && <span className="text-rose-600 font-bold ml-1">(Duplicado)</span>}
                  </label>
                  <input
                    type="text"
                    value={bankDetails.cbuCvu || ''}
                    onChange={(e) => setBankDetails({ ...bankDetails, cbuCvu: e.target.value })}
                    placeholder="0000003100010000000000"
                    className={`w-full px-3 py-1.5 rounded-xl border text-xs font-mono outline-hidden transition ${
                      validation.cbuCollision
                        ? 'border-rose-300 bg-rose-50/50 text-rose-900 focus:ring-2 focus:ring-rose-500'
                        : 'border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500'
                    }`}
                  />
                </div>

                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Banco o Billetera</label>
                    <input
                      type="text"
                      value={bankDetails.bankName || ''}
                      onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
                      placeholder="Ej: Galicia, Santander, Mercado Pago..."
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Tipo de Cuenta</label>
                    <select
                      value={bankDetails.accountType || 'Indefinido'}
                      onChange={(e) => setBankDetails({ ...bankDetails, accountType: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden transition cursor-pointer font-medium text-slate-800"
                    >
                      <option value="Indefinido">Indefinido</option>
                      <option value="Billetera">Billetera</option>
                      <option value="Caja de Ahorro">Caja de Ahorro</option>
                      <option value="Cuenta Corriente">Cuenta Corriente</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Moneda de la Cuenta</label>
                    <select
                      value={bankDetails.currency || '$Ar'}
                      onChange={(e) => setBankDetails({ ...bankDetails, currency: e.target.value as '$Ar' | 'u$' })}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden transition cursor-pointer font-bold text-indigo-900"
                    >
                      <option value="$Ar">$Ar (Pesos)</option>
                      <option value="u$">u$ (Dólares)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes / Observations */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Observaciones / Condiciones Comerciales
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Datos de contacto, notas contables, condiciones de pago, acuerdos especiales..."
                className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white transition"
              />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="vendor-form-modal-form"
            disabled={validation.hasBlockingError || (Boolean(validation.cuitCollision) && !isCuitApproved)}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-2xl text-xs font-bold shadow-md cursor-pointer transition active:scale-95 flex items-center space-x-1.5"
            title={
              validation.hasBlockingError
                ? 'Corrige los errores de CBU/Alias duplicado para continuar'
                : validation.cuitCollision && !isCuitApproved
                ? 'Debes tildar la casilla de confirmación de CUIT debajo del campo CUIT para guardar'
                : undefined
            }
          >
            <Check className="w-4 h-4" />
            <span>{initialData ? 'Guardar Cambios' : 'Crear Proveedor'}</span>
          </button>
        </div>

        {/* CUIT Approval Confirmation Sub-Modal */}
        {showCuitConfirmDialog && validation.cuitCollision && (
          <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-5 animate-in fade-in">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-amber-200 shadow-2xl space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900">Coincidencia de CUIT en Catálogo</h4>
                  <p className="text-xs text-slate-500">Se requiere confirmación para continuar</p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 space-y-2">
                <p className="leading-relaxed">
                  El CUIT <strong className="font-mono">{validation.cuitCollision.cuit}</strong> ya se encuentra registrado para:
                </p>
                <div className="p-2.5 bg-white rounded-xl border border-amber-200 space-y-1 font-sans">
                  <div className="font-bold text-slate-900">{validation.cuitCollision.vendorName}</div>
                  {validation.cuitCollision.bankDetails?.alias && (
                    <div className="text-[11px] text-slate-600 font-mono">
                      Alias: {validation.cuitCollision.bankDetails.alias}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-amber-900/90 leading-relaxed">
                  ¿Confirmas que deseas registrar a <strong>&quot;{name}&quot;</strong> con el mismo CUIT?
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCuitConfirmDialog(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancelar y Revisar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCuitApproved(true);
                    setShowCuitConfirmDialog(false);
                    executeSave();
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Aprobar y Registrar</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
