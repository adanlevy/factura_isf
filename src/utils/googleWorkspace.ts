// Google Workspace integration for Gmail API and Google Drive API
import { Expense, CostCenter, UserProfile, UserBankDetails, AppUserRecord } from '../types';
import { generateDriveFileName, formatCurrency, formatDate } from './helpers';
import { syncApiLogToCloud } from './apiUsageLogger';
import firebaseConfig from '../../firebase-applet-config.json';

const CUSTOM_CLIENT_ID_KEY = 'isf_custom_google_client_id';
const DEFAULT_CLIENT_ID =
  firebaseConfig?.oAuthClientId ||
  '50454054524-sd319a8otrbj57urqd8766f2baj9mv96.apps.googleusercontent.com';

export function getGoogleClientId(): string {
  try {
    const saved = localStorage.getItem(CUSTOM_CLIENT_ID_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch {}
  return (((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || DEFAULT_CLIENT_ID) as string).trim();
}

export function saveGoogleClientId(clientId: string) {
  try {
    if (clientId && clientId.trim()) {
      localStorage.setItem(CUSTOM_CLIENT_ID_KEY, clientId.trim());
    } else {
      localStorage.removeItem(CUSTOM_CLIENT_ID_KEY);
    }
  } catch (e) {
    console.warn('Error saving Google Client ID:', e);
  }
}

export const GOOGLE_OAUTH_CLIENT_ID = getGoogleClientId();
export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

const TOKEN_STORAGE_KEY = 'isf_google_workspace_token';
const USER_STORAGE_KEY = 'isf_google_workspace_user';

declare global {
  interface Window {
    google?: any;
  }
}

export interface GoogleWorkspaceUser {
  email: string;
  name: string;
  picture?: string;
}

export function getStoredWorkspaceToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveStoredWorkspaceToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Error saving Google token:', e);
  }
}

export function getStoredWorkspaceUser(): GoogleWorkspaceUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Initiates the Google OAuth popup to request permissions for Gmail and Google Drive
 */
export function requestGoogleWorkspaceAuth(): Promise<{ accessToken: string; user?: GoogleWorkspaceUser }> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      return reject(
        new Error('El cliente de Google Identity Services no está listo aún. Por favor espera un momento y vuelve a intentar.')
      );
    }

    try {
      const currentClientId = getGoogleClientId();
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: currentClientId,
        scope: GOOGLE_SCOPES,
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            console.error('Google OAuth error:', tokenResponse);
            return reject(new Error(tokenResponse.error_description || tokenResponse.error));
          }

          const accessToken = tokenResponse.access_token;
          saveStoredWorkspaceToken(accessToken);

          // Attempt to fetch user profile info
          let user: GoogleWorkspaceUser | undefined;
          try {
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (userInfoRes.ok) {
              const userInfo = await userInfoRes.json();
              user = {
                email: userInfo.email,
                name: userInfo.name || userInfo.email.split('@')[0],
                picture: userInfo.picture,
              };
              localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
            }
          } catch (fetchErr) {
            console.warn('Could not fetch Google user info:', fetchErr);
          }

          resolve({ accessToken, user });
        },
      });

      client.requestAccessToken({ prompt: 'select_account' });
    } catch (err: any) {
      console.error('Error initializing Google token client:', err);
      reject(err);
    }
  });
}

/**
 * Extracts Google Drive Folder ID from a sharing URL or ID string
 */
export function extractDriveFolderId(driveUrlOrFolder?: string): string | null {
  if (!driveUrlOrFolder) return null;
  const match = driveUrlOrFolder.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  // Check if it's already a raw ID
  if (/^[a-zA-Z0-9_-]{20,50}$/.test(driveUrlOrFolder.trim())) {
    return driveUrlOrFolder.trim();
  }
  return null;
}

/**
 * Extracts Google Drive File ID from a view/preview sharing URL or ID string
 */
export function extractDriveFileId(driveUrlOrFile?: string): string | null {
  if (!driveUrlOrFile) return null;
  const trimmed = driveUrlOrFile.trim();
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch && fileMatch[1]) return fileMatch[1];
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];
  if (/^[a-zA-Z0-9_-]{20,60}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Uploads a receipt image/PDF to Google Drive in the specific Cost Center's folder
 */
export async function uploadReceiptToGoogleDrive(params: {
  expense: Expense;
  costCenter?: CostCenter;
  fileBase64?: string;
  accessToken?: string;
  customFileName?: string;
  folderId?: string;
  oldFileId?: string;
  oldFileName?: string;
}): Promise<{
  success: boolean;
  fileId?: string;
  fileName?: string;
  folderName?: string;
  webViewLink?: string;
  message?: string;
  error?: string;
}> {
  const {
    expense,
    costCenter,
    fileBase64,
    accessToken: explicitToken,
    customFileName,
    folderId: explicitFolderId,
    oldFileId,
    oldFileName,
  } = params;
  const token = explicitToken || getStoredWorkspaceToken();

  const fileData = fileBase64 || expense.receiptImage;
  if (!fileData) {
    return {
      success: false,
      error: 'No hay archivo adjunto (PDF o imagen) para subir.',
    };
  }

  const costCenterCode = costCenter?.code || 'GADM';
  const folderName = costCenter?.driveFolder || `${expense.project || 'General'} 2026`;
  const folderUrl = costCenter?.driveUrl || `https://drive.google.com/drive/search?q=${encodeURIComponent(folderName)}`;
  const folderId = explicitFolderId || costCenter?.driveFolderId || extractDriveFolderId(folderUrl);

  let fileExt = 'png';
  if (expense.receiptFileName?.toLowerCase().endsWith('.pdf') || fileData.startsWith('data:application/pdf') || fileData.startsWith('JVBERi0')) {
    fileExt = 'pdf';
  } else if (expense.receiptFileName?.toLowerCase().endsWith('.jpg') || expense.receiptFileName?.toLowerCase().endsWith('.jpeg')) {
    fileExt = 'jpg';
  }

  const baseFileName = customFileName || generateDriveFileName(expense, costCenter ? [costCenter] : []);
  const standardizedFileName = baseFileName.includes('.') ? baseFileName : `${baseFileName}.${fileExt}`;

  try {
    const response = await fetch('/api/upload-to-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expenseId: expense.id,
        fileName: standardizedFileName,
        folderName,
        folderUrl,
        folderId,
        costCenterCode,
        fileBase64: fileData,
        accessToken: token,
        oldFileId,
        oldFileName,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      if (response.status === 401 || data.isAuthError) {
        saveStoredWorkspaceToken(null);
      }
      throw new Error(data.error || 'Error al subir a Google Drive');
    }

    if (data.apiLog) {
      syncApiLogToCloud(data.apiLog).catch(() => {});
    }

    return {
      success: true,
      fileId: data.fileId,
      fileName: data.fileName || standardizedFileName,
      folderName: data.folderName || folderName,
      webViewLink: data.fileId
        ? `https://drive.google.com/file/d/${data.fileId}/view`
        : folderUrl,
      message: data.message,
    };
  } catch (err: any) {
    console.error('Drive upload failure:', err);
    return {
      success: false,
      error: err.message || 'Error de red al comunicarse con Google Drive.',
    };
  }
}

/**
 * Deletes a receipt file from Google Drive by fileId(s) or fileName(s)
 */
export async function deleteReceiptFromGoogleDrive(params: {
  fileId?: string;
  fileIds?: string[];
  fileName?: string;
  fileNames?: string[];
  folderName?: string;
  accessToken?: string;
}): Promise<{
  success: boolean;
  deletedIds?: string[];
  message?: string;
  error?: string;
}> {
  const { fileId, fileIds, fileName, fileNames, folderName, accessToken: explicitToken } = params;
  const token = explicitToken || getStoredWorkspaceToken();

  try {
    const response = await fetch('/api/delete-from-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId,
        fileIds,
        fileName,
        fileNames,
        folderName,
        accessToken: token,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      if (response.status === 401 || data.isAuthError) {
        saveStoredWorkspaceToken(null);
      }
      throw new Error(data.error || 'Error al eliminar archivo de Google Drive');
    }

    return {
      success: true,
      deletedIds: data.deletedIds,
      message: data.message,
    };
  } catch (err: any) {
    console.warn('Drive deletion error:', err);
    return {
      success: false,
      error: err.message || 'Error al conectar con Google Drive para eliminar el archivo.',
    };
  }
}

/**
 * Replaces a receipt file in Google Drive: deletes the old file and uploads the new file into the same Cost Center folder
 */
export async function replaceReceiptInGoogleDrive(params: {
  expense: Expense;
  costCenter?: CostCenter;
  newFileBase64: string;
  newFileName?: string;
  accessToken?: string;
}): Promise<{
  success: boolean;
  fileId?: string;
  fileName?: string;
  folderName?: string;
  webViewLink?: string;
  message?: string;
  error?: string;
}> {
  const { expense, costCenter, newFileBase64, newFileName, accessToken: explicitToken } = params;
  const token = explicitToken || getStoredWorkspaceToken();

  const costCenterCode = costCenter?.code || 'GADM';
  const folderName = costCenter?.driveFolder || `${expense.project || 'General'} 2026`;
  const folderUrl = costCenter?.driveUrl || `https://drive.google.com/drive/search?q=${encodeURIComponent(folderName)}`;
  const folderId = costCenter?.driveFolderId || extractDriveFolderId(folderUrl);

  let fileExt = 'png';
  if (newFileName?.toLowerCase().endsWith('.pdf') || newFileBase64.startsWith('data:application/pdf') || newFileBase64.startsWith('JVBERi0')) {
    fileExt = 'pdf';
  } else if (newFileName?.toLowerCase().endsWith('.jpg') || newFileName?.toLowerCase().endsWith('.jpeg')) {
    fileExt = 'jpg';
  }

  const baseFileName = generateDriveFileName(expense, costCenter ? [costCenter] : []);
  const standardizedFileName = baseFileName.includes('.') ? baseFileName : `${baseFileName}.${fileExt}`;

  const oldFileId = expense.driveFileId || extractDriveFileId(expense.driveUploadedUrl) || undefined;
  const oldFileName = expense.driveUploadedFileName || (expense.driveUploadedUrl ? standardizedFileName : undefined);

  try {
    const response = await fetch('/api/upload-to-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expenseId: expense.id,
        fileName: standardizedFileName,
        folderName,
        folderUrl,
        folderId,
        costCenterCode,
        fileBase64: newFileBase64,
        accessToken: token,
        oldFileId,
        oldFileName,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      if (response.status === 401 || data.isAuthError) {
        saveStoredWorkspaceToken(null);
      }
      throw new Error(data.error || 'Error al reemplazar en Google Drive');
    }

    if (data.apiLog) {
      syncApiLogToCloud(data.apiLog).catch(() => {});
    }

    return {
      success: true,
      fileId: data.fileId,
      fileName: data.fileName || standardizedFileName,
      folderName: data.folderName || folderName,
      webViewLink: data.fileId
        ? `https://drive.google.com/file/d/${data.fileId}/view`
        : folderUrl,
      message: data.message,
    };
  } catch (err: any) {
    console.error('Drive replacement failure:', err);
    return {
      success: false,
      error: err.message || 'Error al reemplazar el archivo en Google Drive.',
    };
  }
}

import { resolveEmailCcRecipients } from './emailCc';

/**
 * Sends a real email through the Gmail API in the name of the connected Google account
 */
export async function sendGmailMessage(params: {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  bodyHtml: string;
  fromName?: string;
  accessToken?: string;
  attachments?: Array<{
    filename: string;
    contentType?: string;
    base64: string;
  }>;
}): Promise<{
  success: boolean;
  messageId?: string;
  mode?: string;
  message?: string;
  error?: string;
}> {
  const { to, cc, bcc, subject, bodyHtml, fromName, accessToken: explicitToken, attachments } = params;
  const token = explicitToken || getStoredWorkspaceToken();

  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        cc,
        bcc,
        subject,
        bodyHtml,
        fromName: fromName || 'ISF Finanzas',
        accessToken: token,
        attachments,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      if (response.status === 401 || data.isAuthError) {
        saveStoredWorkspaceToken(null);
      }
      throw new Error(data.error || 'Error al despachar el correo');
    }

    if (data.apiLog) {
      syncApiLogToCloud(data.apiLog).catch(() => {});
    }

    return {
      success: true,
      messageId: data.messageId,
      mode: data.mode,
      message: data.message,
    };
  } catch (err: any) {
    console.error('Gmail send error:', err);
    return {
      success: false,
      error: err.message || 'No se pudo enviar el correo vía Gmail API.',
    };
  }
}

/**
 * Checks if the backend server has a centralized Google Service Account or Refresh Token configured
 */
export async function checkCentralizedDriveStatus(): Promise<{
  configured: boolean;
  source: string | null;
  message?: string;
}> {
  try {
    const res = await fetch('/api/drive/status');
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Could not check centralized drive status:', e);
  }
  return { configured: false, source: null };
}

/**
 * Sends an automated summary confirmation email to the submitter after uploading expense receipts
 */
export async function sendReceiptUploadConfirmationEmail(params: {
  expenses: Expense[];
  currentUser?: UserProfile | null;
  customRecipientEmail?: string;
  costCenters?: CostCenter[];
  appUsers?: AppUserRecord[];
  explicitCc?: string | string[];
  accessToken?: string;
}): Promise<{
  success: boolean;
  messageId?: string;
  message?: string;
  error?: string;
}> {
  const { expenses, currentUser, customRecipientEmail, costCenters, appUsers, explicitCc, accessToken } = params;
  if (!expenses || expenses.length === 0) {
    return { success: false, error: 'No hay comprobantes para notificar.' };
  }

  // Determine recipient email and submitter name
  const firstExpense = expenses[0];
  const recipientEmail =
    customRecipientEmail ||
    firstExpense.submittedByEmail ||
    currentUser?.email ||
    'admin@isf-argentina.org';

  const recipientName =
    firstExpense.submittedByName ||
    currentUser?.name ||
    recipientEmail.split('@')[0] ||
    'Colaborador';

  const ccRecipients = resolveEmailCcRecipients({
    toEmail: recipientEmail,
    expenses,
    costCenters,
    appUsers,
    explicitCc,
  });

  const count = expenses.length;
  const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const formattedTotal = formatCurrency(totalAmount, 'ARS');

  const subject =
    count === 1
      ? `[ISF Finanzas] Comprobante cargado: ${firstExpense.vendor || 'Gasto'} (${formatCurrency(firstExpense.amount || 0, firstExpense.currency)})`
      : `[ISF Finanzas] Resumen de ${count} comprobantes cargados (${formattedTotal})`;

  // Build rows HTML
  const rowsHtml = expenses
    .map((exp, idx) => {
      const cleanType = (exp.paymentType || exp.paymentMethod || '').trim().toUpperCase();
      const isVendorPayment =
        cleanType === 'PAGO_PROVEEDOR' ||
        cleanType === 'PAGO A PROVEEDOR' ||
        cleanType === 'PROVEEDOR' ||
        cleanType === 'TRANSFERENCIA PROVEEDOR' ||
        exp.paymentMethod === 'Pago a Proveedor' ||
        exp.paymentMethod === 'Pago a proveedor';

      const isReimb =
        !isVendorPayment &&
        (cleanType === 'REINTEGRO' ||
         cleanType === 'REEMBOLSO' ||
         exp.paymentMethod === 'Reintegro' ||
         (exp.reimbursable && exp.paymentType !== 'PAGO_PROVEEDOR'));

      const formattedAmt = formatCurrency(exp.amount || 0, exp.currency);
      const bankInfo = exp.bankDetails?.alias
        ? `Alias: <strong>${exp.bankDetails.alias}</strong>`
        : exp.bankDetails?.cbuCvu
        ? `CBU/CVU: ${exp.bankDetails.cbuCvu}`
        : '';

      const typeLabel = isVendorPayment
        ? `<span style="color: #0284c7; font-weight: 600;">🏢 Pago a proveedor</span>`
        : isReimb
        ? `<span style="color: #d97706; font-weight: 600;">🔄 Reintegro</span>`
        : `<span style="color: #059669; font-weight: 600;">💳 ${exp.paymentMethod || 'Pago Directo'}</span>`;

      return `
        <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 0 ? 'background-color: #ffffff;' : 'background-color: #f8fafc;'}">
          <td style="padding: 10px 12px; font-size: 13px; font-weight: 600; color: #1e293b;">
            ${exp.vendor || 'Sin especificar'}
            ${exp.invoiceNumber ? `<div style="font-size: 11px; color: #64748b; font-weight: normal;">N° ${exp.invoiceNumber}</div>` : ''}
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #475569; white-space: nowrap;">
            ${formatDate(exp.date)}
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #334155;">
            <span style="display: inline-block; padding: 2px 8px; background-color: #e0e7ff; color: #3730a3; border-radius: 4px; font-weight: 600; font-size: 11px;">
              ${exp.project || 'General'}
            </span>
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #475569;">
            ${exp.category || 'Varios'}
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #334155;">
            ${typeLabel}${bankInfo ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${bankInfo}</div>` : ''}
          </td>
          <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: #0f172a; text-align: right; white-space: nowrap;">
            ${formattedAmt}
          </td>
        </tr>
      `;
    })
    .join('');

  const bodyHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: #0f172a; padding: 24px 28px; color: #ffffff; }
          .badge { display: inline-block; background: rgba(52, 211, 153, 0.2); color: #34d399; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
          .content { padding: 28px; }
          .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin: 20px 0; display: flex; justify-content: space-between; }
          .table-container { overflow-x: auto; margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; }
          table { width: 100%; border-collapse: collapse; text-align: left; }
          th { background: #f1f5f9; padding: 10px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #cbd5e1; }
          .footer { background: #f8fafc; padding: 20px 28px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; text-align: center; }
          .btn { display: inline-block; background: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 10px 20px; font-size: 13px; font-weight: 600; border-radius: 6px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="badge">Gestión de Gastos</div>
            <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">Ingeniería Sin Fronteras Argentina</h1>
            <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">Confirmación de Comprobantes Registrados</p>
          </div>

          <div class="content">
            <p style="font-size: 15px; margin-top: 0;">Hola <strong>${recipientName}</strong>,</p>
            <p style="font-size: 14px; line-height: 1.5; color: #334155;">
              Te confirmamos que se ${count === 1 ? 'ha registrado exitosamente tu comprobante' : `han registrado exitosamente tus <strong>${count} comprobantes</strong>`} en el sistema de rendiciones de ISF Argentina.
            </p>

            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 18px 0;">
              <table style="width: 100%; border: none;">
                <tr>
                  <td style="padding: 4px 0; font-size: 13px; color: #64748b;">Cantidad de Comprobantes:</td>
                  <td style="padding: 4px 0; font-size: 13px; font-weight: 700; color: #0f172a; text-align: right;">${count}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; font-size: 13px; color: #64748b;">Monto Total Rendido:</td>
                  <td style="padding: 4px 0; font-size: 16px; font-weight: 800; color: #059669; text-align: right;">${formattedTotal}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; font-size: 13px; color: #64748b;">Fecha de Carga:</td>
                  <td style="padding: 4px 0; font-size: 13px; font-weight: 600; color: #334155; text-align: right;">
                    ${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              </table>
            </div>

            <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Detalle de lo cargado:</div>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Proveedor</th>
                    <th>Fecha Doc.</th>
                    <th>Centro de Costos</th>
                    <th>Categoría</th>
                    <th>Tipo</th>
                    <th style="text-align: right;">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>

            ${
              expenses.some(
                (e) =>
                  e.paymentType === 'REINTEGRO' ||
                  e.paymentMethod === 'Reintegro' ||
                  (e.reimbursable && e.paymentType !== 'PAGO_PROVEEDOR')
              )
                ? `<div style="background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; padding: 12px 14px; font-size: 12px; color: #92400e; margin-top: 15px;">
                    ℹ️ <strong>Atención Reintegros:</strong> Los comprobantes marcados como reintegro fueron derivados automáticamente a Tesorería / Administración para su correspondiente revisión y liquidación.
                  </div>`
                : ''
            }
            ${
              expenses.some(
                (e) =>
                  e.paymentType === 'PAGO_PROVEEDOR' ||
                  e.paymentMethod === 'Pago a Proveedor' ||
                  e.paymentMethod === 'Pago a proveedor'
              )
                ? `<div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 12px 14px; font-size: 12px; color: #1e40af; margin-top: 15px;">
                    ℹ️ <strong>Atención Pagos a Proveedores:</strong> Los comprobantes marcados como pago a proveedor fueron registrados en el circuito de pagos a proveedores de Administración y Finanzas.
                  </div>`
                : ''
            }

            <p style="font-size: 13px; color: #64748b; margin-top: 24px; line-height: 1.5;">
              Puedes acceder a la plataforma para consultar el estado de tus rendiciones y comprobantes en cualquier momento.
            </p>
          </div>

          <div class="footer">
            <strong>Ingeniería Sin Fronteras Argentina</strong> — Área de Administración, Finanzas y Tesorería<br>
            Este es un correo automático de notificación de carga de comprobantes.
          </div>
        </div>
      </body>
    </html>
  `;

  return sendGmailMessage({
    to: recipientEmail,
    cc: ccRecipients.length > 0 ? ccRecipients : undefined,
    subject,
    bodyHtml,
    fromName: 'ISF Finanzas',
    accessToken,
  });
}

/**
 * Sends a notification email to administrators whenever bank details are added or modified
 */
export async function notifyBankDetailsChange(params: {
  updatedBy: { email: string; name?: string };
  targetType: 'user' | 'vendor' | 'expense';
  targetName: string;
  bankDetails: UserBankDetails;
  accessToken?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const { updatedBy, targetType, targetName, bankDetails, accessToken } = params;

  if (!bankDetails || (!bankDetails.bankName && !bankDetails.cbuCvu && !bankDetails.alias)) {
    return { success: false, error: 'Sin datos bancarios para notificar.' };
  }

  const recipients = ['admin@isf-argentina.org', 'bpaton@isf-argentina.org'];
  const targetTypeLabel =
    targetType === 'user'
      ? 'Perfil de Colaborador'
      : targetType === 'vendor'
      ? 'Proveedor'
      : 'Rendición / Comprobante';

  const subject = `[ISF Finanzas] Notificación: Cambio/Alta de Datos Bancarios de ${targetName}`;

  const bodyHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: #1e1b4b; padding: 20px 24px; color: #ffffff; }
          .badge { display: inline-block; background: rgba(99, 102, 241, 0.2); color: #a5b4fc; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
          .content { padding: 24px; }
          .data-table { width: 100%; border-collapse: collapse; margin-top: 16px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
          .data-table td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
          .data-table td.label { font-weight: 600; color: #64748b; width: 35%; background: #f8fafc; }
          .data-table td.val { font-weight: 700; color: #0f172a; }
          .footer { background: #f8fafc; padding: 16px 24px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="badge">Aviso de Seguridad y Finanzas</div>
            <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #ffffff;">Actualización de Datos Bancarios</h1>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #cbd5e1;">Ingeniería Sin Fronteras Argentina</p>
          </div>
          <div class="content">
            <p style="font-size: 14px; margin-top: 0; color: #334155;">
              Se ha registrado un alta o modificación de datos bancarios para <strong>${targetName}</strong> (${targetTypeLabel}).
            </p>
            <div style="background-color: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #3730a3; margin-bottom: 16px;">
              👤 <strong>Modificado por:</strong> ${updatedBy.name || updatedBy.email} (${updatedBy.email})<br>
              📅 <strong>Fecha y hora:</strong> ${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style="font-size: 13px; font-weight: 700; color: #0f172a;">Nuevos Datos Bancarios Registrados:</div>
            <table class="data-table">
              <tr><td class="label">Titular:</td><td class="val">${bankDetails.accountHolder || '-'}</td></tr>
              <tr><td class="label">Banco:</td><td class="val">${bankDetails.bankName || '-'}</td></tr>
              <tr><td class="label">Tipo de Cuenta:</td><td class="val">${bankDetails.accountType || '-'}</td></tr>
              <tr><td class="label">CBU / CVU:</td><td class="val">${bankDetails.cbuCvu || '-'}</td></tr>
              <tr><td class="label">Alias:</td><td class="val">${bankDetails.alias || '-'}</td></tr>
              <tr><td class="label">CUIT / CUIL:</td><td class="val">${bankDetails.cuitCuil || '-'}</td></tr>
            </table>
          </div>
          <div class="footer">
            Ingeniería Sin Fronteras Argentina · Sistema de Comprobantes<br>
            Notificación automática enviada a la Administración.
          </div>
        </div>
      </body>
    </html>
  `;

  return sendGmailMessage({
    to: recipients.join(', '),
    subject,
    bodyHtml,
    fromName: 'ISF Finanzas Alertas',
    accessToken,
  });
}

/**
 * Sends an automated notification email when an expense payment is reverted to PENDING
 */
export async function sendPaymentReversalEmail(params: {
  expense: Expense;
  costCenters?: CostCenter[];
  appUsers?: AppUserRecord[];
  currentUser?: UserProfile | null;
  accessToken?: string;
  reversalReason?: string;
}): Promise<{
  success: boolean;
  messageId?: string;
  message?: string;
  error?: string;
}> {
  const { expense, costCenters, appUsers, currentUser, accessToken, reversalReason } = params;

  const recipientEmail =
    expense.submittedByEmail ||
    currentUser?.email ||
    'admin@isf-argentina.org';

  const recipientName =
    expense.submittedByName ||
    recipientEmail.split('@')[0] ||
    'Colaborador';

  const ccRecipients = resolveEmailCcRecipients({
    toEmail: recipientEmail,
    expense,
    costCenters,
    appUsers,
  });

  const matchedCenter = costCenters?.find(
    (c) => c.name.toLowerCase() === (expense.project || '').toLowerCase()
  );
  const centerLabel = matchedCenter
    ? `${matchedCenter.code} - ${matchedCenter.name}`
    : expense.project || 'General';

  const formattedAmount = formatCurrency(expense.amount || 0, expense.currency);
  const subject = `[ISF Finanzas] Reversión de Pago: ${expense.vendor || 'Comprobante'} (${formattedAmount})`;

  const dateFormatted = formatDate(expense.date);
  const revertedByName = currentUser?.name || currentUser?.email || 'Administración';
  const timestampStr = `${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;

  const bodyHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: #0f172a; padding: 22px 24px; color: #ffffff; border-bottom: 3px solid #f59e0b; }
          .badge { display: inline-block; background: rgba(245, 158, 11, 0.2); color: #fde68a; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
          .content { padding: 24px; }
          .data-table { width: 100%; border-collapse: collapse; margin-top: 16px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
          .data-table td { padding: 9px 12px; font-size: 12.5px; border-bottom: 1px solid #f1f5f9; }
          .data-table td.label { font-weight: 600; color: #64748b; width: 35%; background: #f8fafc; }
          .data-table td.val { font-weight: 700; color: #0f172a; }
          .footer { background: #f8fafc; padding: 16px 24px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="badge">Aviso de Reversión</div>
            <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #ffffff;">Reversión de Pago Registrado</h1>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #cbd5e1;">Ingeniería Sin Fronteras Argentina · Administración y Finanzas</p>
          </div>
          <div class="content">
            <p style="font-size: 14px; margin-top: 0; color: #334155;">
              Hola <strong>${recipientName}</strong>,
            </p>
            <p style="font-size: 13.5px; color: #334155; line-height: 1.5;">
              Te informamos que se ha <strong>revertido el registro de pago</strong> correspondiente al comprobante de <strong>${expense.vendor || 'Proveedor'}</strong> por <strong>${formattedAmount}</strong>.
            </p>
            <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; font-size: 12.5px; color: #92400e; margin: 16px 0;">
              ⚠️ <strong>Estado actual:</strong> El comprobante ha regresado al estado <strong>Pendiente de Pago</strong> en la plataforma para su debida revisión, ajuste o posterior liquidación.
              ${reversalReason ? `<div style="margin-top: 6px; font-size: 12px;"><strong>Motivo indicado:</strong> ${reversalReason}</div>` : ''}
            </div>

            <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 14px;">Detalles del Comprobante Revertido:</div>
            <table class="data-table">
              <tr><td class="label">Proveedor:</td><td class="val">${expense.vendor || '-'}</td></tr>
              ${expense.invoiceNumber ? `<tr><td class="label">N° Comprobante:</td><td class="val">${expense.invoiceNumber}</td></tr>` : ''}
              <tr><td class="label">Fecha Comprobante:</td><td class="val">${dateFormatted}</td></tr>
              <tr><td class="label">Centro de Costos:</td><td class="val">${centerLabel}</td></tr>
              <tr><td class="label">Categoría:</td><td class="val">${expense.category || '-'}</td></tr>
              <tr><td class="label">Monto:</td><td class="val" style="color: #0f172a; font-size: 13.5px;">${formattedAmount}</td></tr>
              <tr><td class="label">Tipo / Método:</td><td class="val">${expense.paymentMethod || 'Pago a Proveedor'}</td></tr>
              <tr><td class="label">Revertido por:</td><td class="val">${revertedByName}</td></tr>
              <tr><td class="label">Fecha de Reversión:</td><td class="val">${timestampStr}</td></tr>
            </table>

            <p style="font-size: 12px; color: #64748b; margin-top: 20px; line-height: 1.5;">
              ℹ️ Los comprobantes de transferencia y certificados de retención que se hubieran subido previamente para este pago han sido eliminados de Google Drive y del sistema.
            </p>
          </div>
          <div class="footer">
            <strong>Ingeniería Sin Fronteras Argentina</strong> — Área de Administración, Finanzas y Tesorería<br>
            Este es un correo automático generado por el sistema de gestión de comprobantes.
          </div>
        </div>
      </body>
    </html>
  `;

  return sendGmailMessage({
    to: recipientEmail,
    cc: ccRecipients.length > 0 ? ccRecipients : undefined,
    subject,
    bodyHtml,
    fromName: 'ISF Finanzas',
    accessToken,
  });
}


/**
 * Fetches Google Drive Folder Name and details automatically from URL or ID
 */
export async function fetchDriveFolderInfo(
  folderUrlOrId: string,
  accessToken?: string
): Promise<{
  success: boolean;
  folderId?: string;
  folderName?: string | null;
  webViewLink?: string;
  error?: string;
}> {
  if (!folderUrlOrId || !folderUrlOrId.trim()) {
    return { success: false, error: 'URL o ID de carpeta vacío' };
  }

  const token = accessToken || getStoredWorkspaceToken();

  try {
    const res = await fetch('/api/drive-folder-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderUrl: folderUrlOrId.trim(),
        accessToken: token,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err: any) {
    console.warn('Error fetching drive folder info:', err);
  }

  return { success: false, error: 'No se pudo obtener información de la carpeta' };
}

/**
 * Sends an automated welcome email to a new user registered in the system
 */
export async function sendNewUserWelcomeEmail(params: {
  user: { email: string; name?: string; role?: 'admin' | 'user' };
  appUsers?: AppUserRecord[];
  explicitCc?: string | string[];
  accessToken?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const { user, appUsers, explicitCc, accessToken } = params;

  if (!user.email || !user.email.includes('@')) {
    return { success: false, error: 'Email inválido para enviar bienvenida.' };
  }

  const recipientName = user.name || user.email.split('@')[0];
  const roleLabel = user.role === 'admin' ? 'Administrador / Tesorería' : 'Colaborador / Rendidor de Gastos';
  const appUrl = 'https://facturas-isf.ai.studio/';

  const ccRecipients = resolveEmailCcRecipients({
    toEmail: user.email,
    appUsers,
    explicitCc,
  });

  const subject = 'Bienvenido/a al Sistema de Rendición de Gastos — Ingeniería Sin Fronteras Argentina';

  const bodyHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05); }
          .header { background: #0f172a; padding: 28px 24px; color: #ffffff; text-align: center; }
          .badge { display: inline-block; background: rgba(99, 102, 241, 0.25); color: #c7d2fe; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
          .content { padding: 28px 24px; font-size: 14px; line-height: 1.6; color: #334155; }
          .feature-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 18px 0; }
          .feature-item { display: flex; margin-bottom: 12px; }
          .feature-icon { font-size: 16px; margin-right: 10px; flex-shrink: 0; }
          .btn-container { text-align: center; margin: 28px 0 16px 0; }
          .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 10px; text-decoration: none; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.3); }
          .footer { background: #f8fafc; padding: 18px 24px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="badge">Ingeniería Sin Fronteras Argentina</div>
            <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #ffffff;">Sistema de Rendición de Gastos</h1>
            <p style="margin: 6px 0 0 0; font-size: 13px; color: #cbd5e1;">Área de Administración, Finanzas y Tesorería</p>
          </div>

          <div class="content">
            <p style="margin-top: 0; font-size: 15px;">Hola <strong>${recipientName}</strong>,</p>
            
            <p>
              Te damos la bienvenida al sistema digital de comprobantes y rendición de gastos de <strong>Ingeniería Sin Fronteras Argentina</strong>. Tu cuenta ha sido habilitada con el perfil de <strong>${roleLabel}</strong>.
            </p>

            <div class="feature-box">
              <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 10px;">¿Cómo funciona el sistema?</div>
              
              <div class="feature-item">
                <span class="feature-icon">📄</span>
                <div>
                  <strong>Carga inteligente de comprobantes:</strong> Puedes arrastrar o fotografiar tus facturas y tickets (imágenes o PDF). El lector con inteligencia artificial extraerá de forma automática el proveedor, CUIT, fecha y monto.
                </div>
              </div>

              <div class="feature-item">
                <span class="feature-icon">📁</span>
                <div>
                  <strong>Centro de Costos & Google Drive:</strong> Asigna cada comprobante a su proyecto correspondiente. Los archivos se ordenan y guardan automáticamente en las carpetas de Google Drive de ISF con la nomenclatura estandarizada.
                </div>
              </div>

              <div class="feature-item">
                <span class="feature-icon">💳</span>
                <div>
                  <strong>Reintegros y Pagos:</strong> Si abonaste con fondos personales, indica "Reintegro" y tus datos bancarios (Alias / CBU) para que Tesorería gestione el reintegro.
                </div>
              </div>

              <div class="feature-item" style="margin-bottom: 0;">
                <span class="feature-icon">📊</span>
                <div>
                  <strong>Seguimiento en vivo:</strong> Consulta en todo momento el estado de tus comprobantes, fechas de pago y notas contables.
                </div>
              </div>
            </div>

            <div class="btn-container">
              <a href="${appUrl}" target="_blank" class="btn">
                Ingresar al Sistema de Rendición
              </a>
            </div>

            <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 10px;">
              Enlace directo: <a href="${appUrl}" style="color: #4f46e5;">${appUrl}</a>
            </p>
          </div>

          <div class="footer">
            <strong>Ingeniería Sin Fronteras Argentina</strong><br>
            Por cualquier consulta o duda operativa, contáctate con el equipo de Administración y Finanzas.
          </div>
        </div>
      </body>
    </html>
  `;

  return sendGmailMessage({
    to: user.email,
    cc: ccRecipients.length > 0 ? ccRecipients : undefined,
    subject,
    bodyHtml,
    fromName: 'ISF Finanzas',
    accessToken,
  });
}


