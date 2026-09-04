import { Expense, CostCenter, Vendor } from '../types';

export function toProperCase(str: string): string {
  if (!str) return 'Solicitante';
  return str
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return '';
      // If it has parentheses like (Voluntaria) or (Staff)
      const cleanWord = word.replace(/[()]/g, '');
      const formatted = cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1).toLowerCase();
      if (word.startsWith('(') && word.endsWith(')')) return `(${formatted})`;
      if (word.startsWith('(')) return `(${formatted}`;
      if (word.endsWith(')')) return `${formatted})`;
      return formatted;
    })
    .join(' ');
}

export function generateDriveFileName(
  expense: Partial<Expense>,
  costCenters: CostCenter[] = [],
  extension: string = ''
): string {
  // 1. Siglas (Mayúscula)
  const matchedCc = costCenters.find(
    (cc) => cc.name.toLowerCase() === (expense.project || '').trim().toLowerCase()
  );
  let code = '';
  if (matchedCc && matchedCc.code) {
    code = matchedCc.code.trim().toUpperCase();
  } else if (expense.project) {
    // Generate an abbreviation from first letters or first 4 chars
    const words = expense.project.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      code = words.map((w) => w[0]).join('').slice(0, 5).toUpperCase();
    } else {
      code = expense.project.slice(0, 4).toUpperCase();
    }
  } else {
    code = 'ISF';
  }

  // 2. Nombre Solicitante (Proper)
  const rawName = expense.submittedByName || expense.submittedByEmail?.split('@')[0] || 'Solicitante';
  const properName = toProperCase(rawName);

  // 3. YYYYMMDD
  let yyyymmdd = '';
  if (expense.date) {
    yyyymmdd = expense.date.replace(/[^0-9]/g, '');
  }
  if (yyyymmdd.length !== 8) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    yyyymmdd = `${y}${m}${d}`;
  }

  // 4. Monto en número sin signo currency (número entero o decimal limpio)
  const rawAmount = typeof expense.amount === 'number' ? Math.round(expense.amount) : 0;
  const cleanAmount = String(rawAmount);

  // Format: SIGLAS-Nombre Solicitante-YYYYMMDD-Monto
  let baseName = `${code}-${properName}-${yyyymmdd}-${cleanAmount}`;
  if (extension) {
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    baseName += ext;
  }
  return baseName;
}

export function formatCurrency(amount: number, currency: string = 'ARS'): string {
  try {
    const symbolMap: Record<string, string> = {
      ARS: '$',
      USD: 'US$',
      EUR: '€',
      MXN: 'Mex$',
      CLP: 'CLP$',
      COP: 'COL$',
      BRL: 'R$',
    };

    const symbol = symbolMap[currency] || `${currency} `;
    return `${symbol} ${Number(amount || 0).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  } catch {
    return `${currency} ${amount}`;
  }
}

export function formatDate(dateString: string): string {
  if (!dateString) return '-';
  try {
    const parts = dateString.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(dateString);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
    return dateString;
  } catch {
    return dateString;
  }
}

export function formatUploadDateTime(
  createdAt?: string,
  fallbackDate?: string
): { date: string; time?: string; formatted: string } {
  const target = createdAt || fallbackDate;
  if (!target) return { date: '-', formatted: '-' };
  try {
    const d = new Date(target);
    if (!isNaN(d.getTime())) {
      const dateStr = d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      if (target.includes('T') || target.includes(':')) {
        const timeStr = d.toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        return {
          date: dateStr,
          time: `${timeStr} hs`,
          formatted: `${dateStr} ${timeStr}`,
        };
      }
      return { date: dateStr, formatted: dateStr };
    }
    const fd = formatDate(target);
    return { date: fd, formatted: fd };
  } catch {
    return { date: target, formatted: target };
  }
}

export function exportToCSV(expenses: Expense[]): void {
  const headers = [
    'ID',
    'Fecha de Carga',
    'Fecha Factura',
    'Enviado por',
    'Email del Solicitante',
    'Proveedor',
    'N° Factura',
    'Categoría',
    'Proyecto / Centro de Costos',
    'Moneda',
    'Monto Total',
    '¿Aplica Reintegro?',
    'Estado Reintegro',
    'Método de Pago',
    'Notas / Justificación',
    'Transcripción de Audio',
  ];

  const rows = expenses.map((exp) => [
    `"${exp.id}"`,
    `"${formatUploadDateTime(exp.createdAt, exp.date).formatted}"`,
    `"${exp.date}"`,
    `"${(exp.submittedByName || '').replace(/"/g, '""')}"`,
    `"${(exp.submittedByEmail || '').replace(/"/g, '""')}"`,
    `"${(exp.vendor || '').replace(/"/g, '""')}"`,
    `"${(exp.invoiceNumber || '').replace(/"/g, '""')}"`,
    `"${(exp.category || '').replace(/"/g, '""')}"`,
    `"${(exp.project || '').replace(/"/g, '""')}"`,
    `"${exp.currency || 'ARS'}"`,
    exp.amount || 0,
    exp.reimbursable ? 'SÍ' : 'NO',
    exp.reimbursementStatus === 'PENDING'
      ? 'Pendiente'
      : exp.reimbursementStatus === 'REIMBURSED'
      ? 'Reintegrado'
      : 'No Aplica',
    `"${(exp.paymentMethod || '').replace(/"/g, '""')}"`,
    `"${(exp.notes || '').replace(/"/g, '""')}"`,
    `"${(exp.voiceTranscription || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent =
    '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `rendicion_gastos_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Converts a base64 data URL to a Blob object
 */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    console.warn('Error converting dataUrl to Blob:', e);
    return null;
  }
}

/**
 * Creates a safe Blob URL from data URL, avoiding Chrome blocking of iframe data:application/pdf
 */
export function createSafeBlobUrl(rawUrl?: string): { blobUrl: string; isBlob: boolean; cleanup: () => void } {
  if (!rawUrl) {
    return { blobUrl: '', isBlob: false, cleanup: () => {} };
  }
  if (rawUrl.startsWith('blob:') || rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    return { blobUrl: rawUrl, isBlob: rawUrl.startsWith('blob:'), cleanup: () => {} };
  }
  if (rawUrl.startsWith('data:')) {
    const blob = dataUrlToBlob(rawUrl);
    if (blob) {
      const blobUrl = URL.createObjectURL(blob);
      return { blobUrl, isBlob: true, cleanup: () => URL.revokeObjectURL(blobUrl) };
    }
  }
  return { blobUrl: rawUrl, isBlob: false, cleanup: () => {} };
}

/**
 * Smart matching for category based on vendor, description, or raw extracted category
 */
export function matchBestCategory(
  extractedCategory: string | undefined,
  vendor: string | undefined,
  items: Array<{ description?: string }> | undefined,
  availableCategories: string[]
): string {
  const v = (vendor || '').toLowerCase();
  const rawCat = (extractedCategory || '').toLowerCase();
  const itemsText = (items || []).map((i) => i.description || '').join(' ').toLowerCase();
  const allText = `${v} ${rawCat} ${itemsText}`;

  // 1. Check exact match in availableCategories
  if (extractedCategory) {
    const exact = availableCategories.find(
      (c) => c.toLowerCase() === extractedCategory.trim().toLowerCase()
    );
    if (exact) return exact;
  }

  // 2. Combustible / Estaciones de Servicio / Peajes / Transporte
  const isFuel =
    allText.includes('ypf') ||
    allText.includes('shell') ||
    allText.includes('axion') ||
    allText.includes('puma') ||
    allText.includes('refinor') ||
    allText.includes('gulf') ||
    allText.includes('oil') ||
    allText.includes('combustible') ||
    allText.includes('nafta') ||
    allText.includes('gasoil') ||
    allText.includes('diesel') ||
    allText.includes('gnc') ||
    allText.includes('infinia') ||
    allText.includes('v-power') ||
    allText.includes('peaje') ||
    allText.includes('ausol') ||
    allText.includes('ausa') ||
    allText.includes('aubasa') ||
    allText.includes('corredores viales') ||
    allText.includes('estacionamiento') ||
    allText.includes('estacion de servicio') ||
    allText.includes('estación de servicio') ||
    allText.includes('est. de serv') ||
    allText.includes('transporte');

  if (isFuel) {
    const fuelCat = availableCategories.find(
      (c) =>
        c.toLowerCase().includes('combustible') ||
        c.toLowerCase().includes('transporte') ||
        c.toLowerCase().includes('peaje')
    );
    if (fuelCat) return fuelCat;
  }

  // 3. Alimentos, Supermercado, Restaurantes
  const isFood =
    allText.includes('coto') ||
    allText.includes('carrefour') ||
    allText.includes('jumbo') ||
    allText.includes('dia argentina') ||
    allText.includes('vea') ||
    allText.includes('disco') ||
    allText.includes('changomas') ||
    allText.includes('vital') ||
    allText.includes('maxiconsumo') ||
    allText.includes('restauran') ||
    allText.includes('cafe') ||
    allText.includes('café') ||
    allText.includes('bar') ||
    allText.includes('panaderia') ||
    allText.includes('alimento') ||
    allText.includes('viatico') ||
    allText.includes('viático') ||
    allText.includes('comida') ||
    allText.includes('almuerzo') ||
    allText.includes('cena');

  if (isFood) {
    const foodCat = availableCategories.find(
      (c) =>
        c.toLowerCase().includes('alimento') ||
        c.toLowerCase().includes('viático') ||
        c.toLowerCase().includes('viatico')
    );
    if (foodCat) return foodCat;
  }

  // 4. Materiales de Construcción & Herramientas
  const isConst =
    allText.includes('easy') ||
    allText.includes('sodimac') ||
    allText.includes('ferreteria') ||
    allText.includes('ferretería') ||
    allText.includes('corralon') ||
    allText.includes('corralón') ||
    allText.includes('bulonera') ||
    allText.includes('pintureria') ||
    allText.includes('material') ||
    allText.includes('construccion') ||
    allText.includes('herramienta');

  if (isConst) {
    const constCat = availableCategories.find(
      (c) =>
        c.toLowerCase().includes('material') ||
        c.toLowerCase().includes('construcción') ||
        c.toLowerCase().includes('herramienta')
    );
    if (constCat) return constCat;
  }

  // 5. Alojamiento
  const isHotel =
    allText.includes('hotel') ||
    allText.includes('hostel') ||
    allText.includes('hospedaje') ||
    allText.includes('alojamiento') ||
    allText.includes('booking') ||
    allText.includes('airbnb');

  if (isHotel) {
    const hotelCat = availableCategories.find(
      (c) =>
        c.toLowerCase().includes('alojamiento') ||
        c.toLowerCase().includes('hospedaje')
    );
    if (hotelCat) return hotelCat;
  }

  // 6. Papelería / Librería
  const isStationery =
    allText.includes('libreria') ||
    allText.includes('librería') ||
    allText.includes('imprenta') ||
    allText.includes('impresion') ||
    allText.includes('papel') ||
    allText.includes('fotocopia') ||
    allText.includes('staples');

  if (isStationery) {
    const statCat = availableCategories.find(
      (c) =>
        c.toLowerCase().includes('librería') ||
        c.toLowerCase().includes('papelería') ||
        c.toLowerCase().includes('impresion')
    );
    if (statCat) return statCat;
  }

  // 7. Envíos / Telefonía
  const isComms =
    allText.includes('andreani') ||
    allText.includes('correo argentino') ||
    allText.includes('oca') ||
    allText.includes('dhl') ||
    allText.includes('fedex') ||
    allText.includes('claro') ||
    allText.includes('movistar') ||
    allText.includes('personal') ||
    allText.includes('telecom') ||
    allText.includes('fibertel');

  if (isComms) {
    const commCat = availableCategories.find(
      (c) =>
        c.toLowerCase().includes('comunicacion') ||
        c.toLowerCase().includes('comunicaciones') ||
        c.toLowerCase().includes('envío') ||
        c.toLowerCase().includes('envio') ||
        c.toLowerCase().includes('telefonía')
    );
    if (commCat) return commCat;
  }

  // 8. Closest partial match
  if (extractedCategory) {
    const partial = availableCategories.find(
      (c) =>
        c.toLowerCase().includes(rawCat) ||
        rawCat.includes(c.toLowerCase())
    );
    if (partial) return partial;
  }

  // Default fallback to first available or 'Otros Gastos Operativos'
  return availableCategories[0] || 'Otros Gastos Operativos';
}

/**
 * Limpia y normaliza un CUIT/CUIL dejando solo los dígitos numéricos
 */
export function cleanCuit(cuit?: string): string {
  if (!cuit) return '';
  return cuit.replace(/\D/g, '');
}

/**
 * Formatea un CUIT de 11 dígitos a formato estándar XX-XXXXXXXX-X
 */
export function formatCuit(cuit?: string): string {
  const clean = cleanCuit(cuit);
  if (clean.length === 11) {
    return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`;
  }
  return cuit || '';
}

/**
 * Busca un proveedor en el catálogo con desambiguación precisa por CBU/Alias, nombre y/o CUIT.
 * Da máxima prioridad al CBU/Alias y a la coincidencia de nombre exacto para evitar colisiones entre
 * múltiples proveedores registrados bajo el mismo CUIT o nombre.
 */
export function findVendorByCuitOrName(
  vendors: Vendor[] = [],
  cuit?: string,
  vendorName?: string,
  bankDetails?: { cbuCvu?: string; alias?: string; accountHolder?: string }
): Vendor | undefined {
  if (!vendors || vendors.length === 0) return undefined;

  const clean = cleanCuit(cuit);
  const normName = (vendorName || '').trim().toLowerCase();
  const cbu = (bankDetails?.cbuCvu || '').trim();
  const alias = (bankDetails?.alias || '').trim().toLowerCase();
  const holder = (bankDetails?.accountHolder || '').trim().toLowerCase();

  // 0. Coincidencia directa por CBU o Alias bancario si fue provisto
  if (cbu || alias) {
    const directBank = vendors.find((v) => {
      const vCbu = (v.bankDetails?.cbuCvu || '').trim();
      const vAlias = (v.bankDetails?.alias || '').trim().toLowerCase();
      return (cbu && vCbu && vCbu === cbu) || (alias && vAlias && vAlias === alias);
    });
    if (directBank) return directBank;
  }

  // 1. Coincidencia exacta de Nombre Y CUIT
  if (normName && clean && clean.length >= 8) {
    const candidates = vendors.filter((v) => {
      const vName = (v.name || '').trim().toLowerCase();
      const vCuit = cleanCuit(v.cuit || v.bankDetails?.cuitCuil);
      return vName === normName && vCuit === clean;
    });
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      if (cbu || alias || holder) {
        const bankMatch = candidates.find((v) => {
          const vCbu = (v.bankDetails?.cbuCvu || '').trim();
          const vAlias = (v.bankDetails?.alias || '').trim().toLowerCase();
          const vHolder = (v.bankDetails?.accountHolder || '').trim().toLowerCase();
          return (
            (cbu && vCbu && vCbu === cbu) ||
            (alias && vAlias && vAlias === alias) ||
            (holder && vHolder && vHolder === holder)
          );
        });
        if (bankMatch) return bankMatch;
      }
      return candidates[0];
    }
  }

  // 2. Coincidencia exacta de Nombre
  if (normName) {
    const candidates = vendors.filter((v) => (v.name || '').trim().toLowerCase() === normName);
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      if (clean && clean.length >= 8) {
        const withCuit = candidates.find((v) => cleanCuit(v.cuit || v.bankDetails?.cuitCuil) === clean);
        if (withCuit) return withCuit;
      }
      if (cbu || alias) {
        const bankMatch = candidates.find((v) => {
          const vCbu = (v.bankDetails?.cbuCvu || '').trim();
          const vAlias = (v.bankDetails?.alias || '').trim().toLowerCase();
          return (cbu && vCbu && vCbu === cbu) || (alias && vAlias && vAlias === alias);
        });
        if (bankMatch) return bankMatch;
      }
      return candidates[0];
    }
  }

  // 3. Si no hubo coincidencia exacta de nombre, buscar por CUIT
  if (clean && clean.length >= 8) {
    const matchingVendors = vendors.filter((v) => {
      const vCuit = cleanCuit(v.cuit || v.bankDetails?.cuitCuil);
      return vCuit === clean;
    });

    if (matchingVendors.length === 1) {
      return matchingVendors[0];
    }

    if (matchingVendors.length > 1) {
      if (cbu || alias) {
        const bankMatch = matchingVendors.find((v) => {
          const vCbu = (v.bankDetails?.cbuCvu || '').trim();
          const vAlias = (v.bankDetails?.alias || '').trim().toLowerCase();
          return (cbu && vCbu && vCbu === cbu) || (alias && vAlias && vAlias === alias);
        });
        if (bankMatch) return bankMatch;
      }

      if (normName) {
        const partial = matchingVendors.find((v) => {
          const vName = (v.name || '').trim().toLowerCase();
          const vHolder = (v.bankDetails?.accountHolder || '').trim().toLowerCase();
          return (
            vName.includes(normName) ||
            normName.includes(vName) ||
            (vHolder && (vHolder.includes(normName) || normName.includes(vHolder)))
          );
        });
        if (partial) return partial;
      }
    }
  }

  // 4. Coincidencia parcial de nombre (si no hubo conflicto)
  if (normName) {
    const partial = vendors.find((v) => {
      const vName = (v.name || '').trim().toLowerCase();
      return vName.includes(normName) || normName.includes(vName);
    });
    if (partial) return partial;
  }

  return undefined;
}

/**
 * Sanitiza un Centro de Costos, limpiando emails residuales (como edeolmos@isf-argentina.org)
 * de nombres, carpetas o URLs.
 */
export function sanitizeCostCenter(cc: CostCenter): CostCenter {
  if (!cc) return cc;

  const removeUnwanted = (str?: string) => {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/edeolmos@isf-argentina\.org/gi, '')
      .replace(/[a-zA-Z0-9._%+-]+@isf-argentina\.org/gi, '')
      .replace(/\s*-\s*$/, '')
      .replace(/^\s*-\s*/, '')
      .trim();
  };

  const name = removeUnwanted(cc.name) || 'Centro de Costos';
  const code = (removeUnwanted(cc.code) || name.slice(0, 4)).toUpperCase();

  let driveFolder = removeUnwanted(cc.driveFolder);
  if (!driveFolder || driveFolder.includes('@')) {
    driveFolder = `${name} 2026`;
  }

  let driveUrl = cc.driveUrl;
  if (driveUrl && (driveUrl.toLowerCase().includes('edeolmos') || driveUrl.includes('@'))) {
    driveUrl = `https://drive.google.com/drive/search?q=${encodeURIComponent(driveFolder)}`;
  }

  const notifyEmails = (cc.notifyEmails || cc.ccEmails || '').trim();

  return {
    ...cc,
    id: cc.id || `cc-${Date.now()}`,
    name,
    code,
    driveFolder,
    driveUrl: driveUrl || `https://drive.google.com/drive/search?q=${encodeURIComponent(driveFolder)}`,
    notifyEmails: notifyEmails || '',
    ccEmails: notifyEmails || '',
    active: cc.active !== false,
  };
}

/**
 * Trunca el nombre del proveedor a un máximo de caracteres especificados (por defecto 12).
 */
export function truncateVendorName(vendor?: string, maxLength: number = 12): string {
  if (!vendor || !vendor.trim()) return 'Proveedor';
  const clean = vendor.trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength).trim();
}

/**
 * Genera el asunto de correo para confirmación de pago / liquidación según el tipo:
 * - Pago a proveedor: [Pagos] Proveedor (máx 12)-Monto / Comprobante de pago a proveedor
 * - Reintegro: [Pagos] Proveedor (máx 12)-Monto / Comprobante de reintegro liquidado
 * - General / Mixto: [Pagos] Proveedor (máx 12)-Monto / Comprobante de pago liquidado
 */
export function formatPaymentEmailSubject(
  vendor?: string,
  amount: number = 0,
  currency: string = 'ARS',
  paymentTypeOrMethod?: string
): string {
  const vendorShort = truncateVendorName(vendor, 12);
  const formattedAmt = formatCurrency(amount, currency);

  const cleanType = (paymentTypeOrMethod || '').trim().toUpperCase();
  const isVendorPayment =
    cleanType === 'PAGO_PROVEEDOR' ||
    cleanType === 'PAGO A PROVEEDOR' ||
    cleanType === 'PROVEEDOR' ||
    cleanType === 'TRANSFERENCIA PROVEEDOR';

  const isReimbursement =
    cleanType === 'REINTEGRO' ||
    cleanType === 'REEMBOLSO';

  let descriptor = 'Comprobante de pago liquidado';
  if (isVendorPayment) {
    descriptor = 'Comprobante de pago a proveedor';
  } else if (isReimbursement) {
    descriptor = 'Comprobante de reintegro liquidado';
  }

  return `[Pagos] ${vendorShort}-${formattedAmt} / ${descriptor}`;
}

/**
 * Genera el asunto de correo para envío de certificado de retenciones:
 * [Pagos-Retención]-Proveedor (máximo 12 dígitos)-Monto / Certificado de Retención
 */
export function formatWithholdingEmailSubject(vendor?: string, amount: number = 0, currency: string = 'ARS'): string {
  const vendorShort = truncateVendorName(vendor, 12);
  const formattedAmt = formatCurrency(amount, currency);
  return `[Pagos-Retención]-${vendorShort}-${formattedAmt} / Certificado de Retención`;
}

/**
 * Genera un texto plano estandarizado con los datos de transferencia/bancarios del proveedor o solicitante
 * para persistirlos en el comprobante una vez pagado o liquidado.
 */
export function formatTransferDetails(expense?: Partial<Expense> | null, vendorObj?: Vendor | null): string {
  if (!expense && !vendorObj) return '';
  const bank = expense?.bankDetails || vendorObj?.bankDetails;
  const vendorName = (expense?.vendor || vendorObj?.name || '').trim();
  const cuit = (expense?.cuit || bank?.cuitCuil || vendorObj?.cuit || '').trim();

  const parts: string[] = [];
  if (vendorName) parts.push(`Destinatario: ${vendorName}`);
  if (cuit) parts.push(`CUIT/CUIL: ${cuit}`);
  if (bank?.bankName) {
    const accType = bank.accountType && bank.accountType !== 'Indefinido' ? ` (${bank.accountType})` : '';
    parts.push(`Banco: ${bank.bankName}${accType}`);
  }
  if (bank?.alias) parts.push(`Alias: ${bank.alias}`);
  if (bank?.cbuCvu) parts.push(`CBU/CVU: ${bank.cbuCvu}`);
  if (bank?.accountHolder && (!vendorName || bank.accountHolder.trim().toLowerCase() !== vendorName.toLowerCase())) {
    parts.push(`Titular: ${bank.accountHolder}`);
  }

  return parts.join(' | ');
}

/**
 * Extrae el ID de archivo de Google Drive a partir de URLs con /file/d/, id=, open?id=, uc?id=
 */
export function extractGoogleDriveFileId(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const clean = url.trim();
  if (!clean || clean.startsWith('data:') || clean.startsWith('blob:')) return null;

  // Pattern /file/d/{FILE_ID}
  const matchFileD = clean.match(/\/file\/d\/([a-zA-Z0-9_-]{15,})/);
  if (matchFileD && matchFileD[1]) return matchFileD[1];

  // Pattern [?&]id={FILE_ID}
  const matchId = clean.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (matchId && matchId[1]) return matchId[1];

  // Pattern /d/{FILE_ID}
  const matchD = clean.match(/\/d\/([a-zA-Z0-9_-]{15,})/);
  if (matchD && matchD[1]) return matchD[1];

  return null;
}

/**
 * Genera la URL de incrustación de vista previa de Google Drive (/preview)
 * compatible tanto para imágenes (PNG, JPG, SVG) como para archivos PDF o documentos.
 */
export function getGoogleDrivePreviewUrl(url?: string | null): string | null {
  const fileId = extractGoogleDriveFileId(url);
  if (!fileId) return null;
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

/**
 * Normaliza texto para búsquedas:
 * - Convierte a minúsculas
 * - Remueve tildes / diacríticos (ej: á->a, é->e, í->i, ó->o, ú->u, etc.)
 * - Elimina espacios en los extremos
 */
export function normalizeSearchText(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Verifica si alguno de los campos objetivos (targets) coincide con la búsqueda (query).
 * - Ignora tildes/acentos
 * - Ignora mayúsculas/minúsculas
 * - Para CUITs y números: ignora guiones (-), puntos (.), barras (/) y espacios
 */
export function matchesSearch(
  targets: string | null | undefined | (string | null | undefined)[],
  query: string | null | undefined
): boolean {
  if (!query || !query.trim()) return true;
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const targetList = Array.isArray(targets) ? targets : [targets];
  const queryDigits = normalizedQuery.replace(/\D/g, '');

  return targetList.some((target) => {
    if (!target) return false;
    const normalizedTarget = normalizeSearchText(target);
    if (!normalizedTarget) return false;

    // 1. Coincidencia directa de texto normalizado sin tildes
    if (normalizedTarget.includes(normalizedQuery)) return true;

    // 2. Coincidencia numérica / CUIT ignorando guiones, espacios y signos
    if (queryDigits.length >= 2) {
      const targetDigits = normalizedTarget.replace(/\D/g, '');
      if (targetDigits.includes(queryDigits)) return true;
    }

    // 3. Coincidencia de múltiples palabras (todas las palabras de la búsqueda deben estar presentes)
    const words = normalizedQuery.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const allWordsMatch = words.every((w) => {
        if (normalizedTarget.includes(w)) return true;
        const wDigits = w.replace(/\D/g, '');
        if (wDigits.length >= 2) {
          const targetDigits = normalizedTarget.replace(/\D/g, '');
          if (targetDigits.includes(wDigits)) return true;
        }
        return false;
      });
      if (allWordsMatch) return true;
    }

    return false;
  });
}


