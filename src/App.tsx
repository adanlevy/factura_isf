import React, { useState, useEffect, useMemo } from 'react';
import { Expense, UserProfile, Vendor, CostCenter, AppUserRecord } from './types';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_COST_CENTERS_DATA,
  DEFAULT_VENDORS,
} from './data/initialData';
import { Navbar, NavigationTab } from './components/Navbar';
import { SmartScannerModal } from './components/SmartScannerModal';
import { ExpenseList } from './components/ExpenseList';
import { CostCentersView } from './components/CostCentersView';
import { ReceiptViewerModal } from './components/ReceiptViewerModal';
import { EditExpenseModal } from './components/EditExpenseModal';
import { AdministrativeEmailModal } from './components/AdministrativeEmailModal';
import { PaymentProcessModal } from './components/PaymentProcessModal';
import { AdminMovementView } from './components/AdminMovementView';
import { VendorsView } from './components/VendorsView';
import { AdminUsersView } from './components/AdminUsersView';
import { SystemAdminView } from './components/SystemAdminView';
import { AuthProfileModal } from './components/AuthProfileModal';
import { UserLoginGate } from './components/UserLoginGate';
import { LegalPagesModal } from './components/LegalPagesModal';
import { ReplaceReceiptModal } from './components/ReplaceReceiptModal';
import { WithholdingCertificateModal } from './components/WithholdingCertificateModal';
import { APP_VERSION, APP_BUILD_DATE } from './version';
import { getStoredAuth, saveStoredAuth } from './utils/auth';
import { formatCurrency, sanitizeCostCenter, formatPaymentEmailSubject, formatTransferDetails } from './utils/helpers';
import {
  uploadReceiptToGoogleDrive,
  replaceReceiptInGoogleDrive,
  getStoredWorkspaceToken,
  saveStoredWorkspaceToken,
  sendReceiptUploadConfirmationEmail,
  sendNewUserWelcomeEmail,
} from './utils/googleWorkspace';
import {
  fetchCentralSync,
  saveCentralExpenses,
  saveCentralVendors,
  saveCentralCostCenters,
  saveCentralCategories,
  upsertCentralExpenses,
  deleteCentralExpenses,
  deleteCentralVendors,
  fetchUserCloudPreferences,
  saveUserCloudPreferences,
  fetchCentralUsers,
  saveCentralUser,
  deleteCentralUser,
  subscribeToUsersFirestore,
  DEFAULT_APP_USERS,
  subscribeToRealtimeFirestore,
  testFirestoreConnection,
  mergeExpensesList,
  mergeVendorsList,
  normalizeVendorBankDetails,
  sessionDeletedVendorIds,
} from './utils/cloudSync';
import { removeCachedReceiptFile, cacheReceiptFile } from './utils/receiptCache';
import { hydrateUserPatternsFromCloud } from './utils/sorting';
import { Plus, CreditCard, Cloud, RefreshCw } from 'lucide-react';

export default function App() {
  // Navigation tabs: 'expenses' (default) | 'admin_movements' | 'vendors' | 'categories' | 'cost_centers'
  const [activeTab, setActiveTab] = useState<NavigationTab>('expenses');
  const [initialFilterVendor, setInitialFilterVendor] = useState<string>('');

  // Authenticated User State (Persistent Google Workspace Session)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const authState = getStoredAuth();
    if (authState.isAuthenticated && authState.user) {
      return {
        email: authState.user.email,
        name: authState.user.name,
        picture: authState.user.picture,
        role: authState.user.role,
      };
    }
    return null;
  });

  // Core Data with Centralized Cloud Persistence (Only server store, no local mock duplicates)
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [costCenters, setCostCenters] = useState<CostCenter[]>(() =>
    DEFAULT_COST_CENTERS_DATA.map(sanitizeCostCenter)
  );

  const availableCostCenters = useMemo(() => costCenters.map((c) => c.name), [costCenters]);

  const [availableCategories, setAvailableCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [appUsers, setAppUsers] = useState<AppUserRecord[]>(DEFAULT_APP_USERS);

  // Modal States
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [viewingReceiptExpense, setViewingReceiptExpense] = useState<Expense | null>(null);
  const [expenseToReplaceReceipt, setExpenseToReplaceReceipt] = useState<Expense | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [paymentModalExpense, setPaymentModalExpense] = useState<Expense | null>(null);
  const [withholdingModalExpense, setWithholdingModalExpense] = useState<Expense | null>(null);
  const [isAuthProfileOpen, setIsAuthProfileOpen] = useState(false);
  const [legalModalType, setLegalModalType] = useState<'privacy' | 'terms' | null>(() => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('privacy') || path.includes('privacidad')) return 'privacy';
    if (path.includes('terms') || path.includes('terminos')) return 'terms';
    return null;
  });

  // Administrative Email Modal State (kept for full modal fallback if required)
  const [emailModalConfig, setEmailModalConfig] = useState<{
    isOpen: boolean;
    expense: Expense | null;
    mode: 'request_bank_details' | 'confirm_payment';
  }>({
    isOpen: false,
    expense: null,
    mode: 'request_bank_details',
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Initial Cloud Hydration on App load - Pure Centralized Data Store
  useEffect(() => {
    let isMounted = true;

    // Clean up any old legacy local storage keys to ensure only the central database is used
    try {
      localStorage.removeItem('factura_isf_expenses_v1');
      localStorage.removeItem('factura_isf_expenses_v2');
      localStorage.removeItem('factura_isf_expenses_v3');
      localStorage.removeItem('factura_isf_expenses_v4');
      localStorage.removeItem('isf_expenses_data_v1');
      localStorage.removeItem('factura_isf_vendors_v1');
      localStorage.removeItem('factura_isf_vendors_v2');
    } catch (e) {
      // ignore
    }

    async function hydrateFromCloud() {
      setIsCloudSyncing(true);
      try {
        await testFirestoreConnection();
        const cloudData = await fetchCentralSync();
        if (cloudData && isMounted) {
          if (Array.isArray(cloudData.expenses)) {
            setExpenses((prev) => mergeExpensesList(prev, cloudData.expenses));
          }

          let cleanVendors: Vendor[] = [];
          if (Array.isArray(cloudData.vendors)) {
            // Purge any legacy sample test vendors if they still exist in Firestore
            const sampleIds = ['ven-1', 'ven-2', 'ven-3', 'ven-4', 'ven-5'];
            const hasSampleVendors = cloudData.vendors.some((v) => sampleIds.includes(v.id));
            if (hasSampleVendors) {
              deleteCentralVendors(sampleIds).catch(console.warn);
            }
            cleanVendors = cloudData.vendors
              .filter(
                (v) => v && v.id && !sampleIds.includes(v.id) && !sessionDeletedVendorIds.has(v.id)
              )
              .map(normalizeVendorBankDetails);
          }

          // Auto-reconcile any vendors that exist in expenses but are missing from vendors catalog
          if (Array.isArray(cloudData.expenses) && cloudData.expenses.length > 0) {
            const existingNames = new Set(cleanVendors.map((v) => (v.name || '').trim().toLowerCase()));
            const missingFromExpenses: Vendor[] = [];
            cloudData.expenses.forEach((exp, idx) => {
              const vName = (exp.vendor || '').trim();
              if (vName && !existingNames.has(vName.toLowerCase())) {
                existingNames.add(vName.toLowerCase());
                missingFromExpenses.push({
                  id: `v-auto-${Date.now()}-${idx}`,
                  name: vName,
                  cuit: exp.cuit || '',
                  category: exp.category,
                  bankDetails: exp.bankDetails,
                  createdAt: exp.date || new Date().toISOString(),
                  notes: `Registrado automáticamente desde comprobante #${exp.invoiceNumber || 'sin número'}`,
                });
              }
            });
            if (missingFromExpenses.length > 0) {
              cleanVendors = [...cleanVendors, ...missingFromExpenses];
            }
          }

          setVendors(cleanVendors);
          saveCentralVendors(cleanVendors).catch(console.warn);

          if (Array.isArray(cloudData.costCenters) && cloudData.costCenters.length > 0) {
            setCostCenters(cloudData.costCenters.map(sanitizeCostCenter));
          }

          if (Array.isArray(cloudData.categories) && cloudData.categories.length > 0) {
            let cats = cloudData.categories;
            if (!cats.includes('Librería, Impresiones y Papelería')) {
              cats = [...cats, 'Librería, Impresiones y Papelería'];
              saveCentralCategories(cats).catch(console.warn);
            }
            setAvailableCategories(cats);
          }

          setLastSyncTime(new Date());
        }

        // Hydrate users/administrators from Firestore
        const cloudUsers = await fetchCentralUsers();
        if (cloudUsers && cloudUsers.length > 0 && isMounted) {
          setAppUsers(cloudUsers);
        }

        // Hydrate user specific smart preferences and cost centers
        if (currentUser?.email) {
          const userPrefs = await fetchUserCloudPreferences(currentUser.email);
          if (userPrefs && userPrefs.categoryCostCenterPatterns) {
            hydrateUserPatternsFromCloud(currentUser.email, userPrefs.categoryCostCenterPatterns);
          }
        }
      } catch (err) {
        console.warn('Initial cloud hydration note:', err);
      } finally {
        if (isMounted) setIsCloudSyncing(false);
      }
    }

    hydrateFromCloud();

    // Real-time Firestore listener for multi-device sync
    const unsubscribeRealtime = subscribeToRealtimeFirestore((incoming) => {
      if (!isMounted) return;
      if (incoming.expenses) {
        setExpenses((prev) => mergeExpensesList(prev, incoming.expenses || []));
      }
      if (incoming.vendors && incoming.vendors.length > 0) {
        setVendors((prev) => mergeVendorsList(prev, incoming.vendors || []));
      }
      if (incoming.costCenters && incoming.costCenters.length > 0) {
        setCostCenters(incoming.costCenters.map(sanitizeCostCenter));
      }
      setLastSyncTime(new Date());
    });

    const unsubscribeUsers = subscribeToUsersFirestore((incomingUsers) => {
      if (!isMounted) return;
      if (incomingUsers && incomingUsers.length > 0) {
        setAppUsers(incomingUsers);
      }
    });

    // Periodic cloud poll interval to ensure 100% freshness across background tabs
    const pollInterval = setInterval(() => {
      if (!isMounted) return;
      fetchCentralSync().then((cloudData) => {
        if (!cloudData || !isMounted) return;
        if (cloudData.expenses) {
          setExpenses((prev) => mergeExpensesList(prev, cloudData.expenses));
        }
        if (cloudData.vendors && cloudData.vendors.length > 0) {
          setVendors((prev) => mergeVendorsList(prev, cloudData.vendors));
        }
        setLastSyncTime(new Date());
      }).catch(() => {});
    }, 10000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      unsubscribeRealtime();
      unsubscribeUsers();
    };
  }, [currentUser?.email]);

  // Sync current user to auth session storage
  useEffect(() => {
    saveStoredAuth(currentUser);
  }, [currentUser]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // --- VENDOR MANAGEMENT ACTIONS ---
  const handleAddVendor = (newVendorData: Omit<Vendor, 'id' | 'createdAt'>) => {
    const newVendor: Vendor = {
      ...newVendorData,
      id: `v-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setVendors((prev) => {
      const next = [newVendor, ...prev];
      saveCentralVendors(next);
      return next;
    });
    showToast(`✅ Proveedor "${newVendor.name}" añadido al catálogo.`);
  };

  const handleBatchAddVendors = (newVendorsList: Omit<Vendor, 'id' | 'createdAt'>[]) => {
    if (!newVendorsList || newVendorsList.length === 0) return;
    const initialized: Vendor[] = newVendorsList.map((v, idx) => ({
      ...v,
      id: `v-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      createdAt: new Date().toISOString(),
    }));
    setVendors((prev) => {
      const next = [...initialized, ...prev];
      saveCentralVendors(next);
      return next;
    });
    showToast(`✅ Se importaron ${initialized.length} proveedores exitosamente.`);
  };

  const handleUpdateVendor = (updatedVendor: Vendor) => {
    setVendors((prev) => {
      const next = prev.map((v) => (v.id === updatedVendor.id ? updatedVendor : v));
      saveCentralVendors(next);
      return next;
    });
    showToast(`✅ Proveedor "${updatedVendor.name}" actualizado.`);
  };

  const handleDeleteVendor = async (id: string) => {
    const vendorToDelete = vendors.find((v) => v.id === id);
    setVendors((prev) => prev.filter((v) => v.id !== id));
    deleteCentralVendors([id]);

    if (vendorToDelete) {
      const vName = (vendorToDelete.name || '').trim().toLowerCase();
      const vCuit = (vendorToDelete.cuit || vendorToDelete.bankDetails?.cuitCuil || '').trim();

      const updatedExpensesList: Expense[] = [];
      const updatedExpenses = expenses.map((e) => {
        const expVendor = (e.vendor || '').trim().toLowerCase();
        const expCuit = (e.cuit || e.bankDetails?.cuitCuil || '').trim();
        const isMatch = (vName && expVendor === vName) || (vCuit && expCuit && vCuit === expCuit);

        if (isMatch) {
          // Preserve snapshot of transfer details if not already present
          const currentBank = e.bankDetails || vendorToDelete.bankDetails;
          const transferSnapshot =
            e.transferDetails ||
            (currentBank ? formatTransferDetails(currentBank) : '') ||
            (vName ? `Proveedor: ${vendorToDelete.name}` : '');

          const updated: Expense = {
            ...e,
            vendor: '',
            cuit: '',
            bankDetails: undefined,
            transferDetails: transferSnapshot || e.transferDetails,
            updatedAt: new Date().toISOString(),
          };
          updatedExpensesList.push(updated);
          return updated;
        }
        return e;
      });

      if (updatedExpensesList.length > 0) {
        setExpenses(updatedExpenses);
        try {
          await upsertCentralExpenses(updatedExpensesList);
        } catch (err) {
          console.error('Error updating expenses on vendor delete:', err);
        }
      }

      showToast(
        updatedExpensesList.length > 0
          ? `🗑️ Proveedor "${vendorToDelete.name}" eliminado y desvinculado de ${updatedExpensesList.length} comprobante(s).`
          : `🗑️ Proveedor "${vendorToDelete.name}" eliminado del catálogo.`
      );
    }
  };

  const handleViewVendorExpenses = (vendorName: string) => {
    setInitialFilterVendor(vendorName);
    setActiveTab('admin_movements');
  };

  // --- EXPENSE ACTIONS ---
  const handleUploadExpenseToDrive = async (expenseToUpload: Expense) => {
    if (!expenseToUpload.receiptImage) {
      showToast('⚠️ Este comprobante no tiene archivo o imagen adjunta.');
      return;
    }

    const matchingCc = costCenters.find(
      (c) => c.name.toLowerCase() === (expenseToUpload.project || '').toLowerCase()
    );

    showToast(`☁️ Subiendo comprobante de "${expenseToUpload.vendor}" a Google Drive...`);

    // Set status to PENDING
    setExpenses((prev) =>
      prev.map((e) =>
        e.id === expenseToUpload.id
          ? { ...e, driveUploadStatus: 'PENDING' }
          : e
      )
    );

    try {
      const res = await uploadReceiptToGoogleDrive({
        expense: expenseToUpload,
        costCenter: matchingCc,
      });

      if (res.success) {
        const updatedObj: Expense = {
          ...expenseToUpload,
          driveUploadStatus: 'SUCCESS',
          driveUploadedFileName: res.fileName,
          driveFolderTarget: res.folderName,
          driveUploadedUrl: res.webViewLink || expenseToUpload.driveUploadedUrl,
          driveUploadedAt: new Date().toISOString(),
        };
        setExpenses((prev) =>
          prev.map((e) => (e.id === expenseToUpload.id ? updatedObj : e))
        );
        upsertCentralExpenses([updatedObj]);
        showToast(`✅ Comprobante subido exitosamente a Drive ("${res.folderName}")`);
      } else {
        setExpenses((prev) =>
          prev.map((e) =>
            e.id === expenseToUpload.id
              ? {
                  ...e,
                  driveUploadStatus: 'ERROR',
                }
              : e
          )
        );
        showToast(`⚠️ No se pudo subir a Drive: ${res.error || 'Verifica la conexión'}`);
      }
    } catch (e: any) {
      setExpenses((prev) =>
        prev.map((item) =>
          item.id === expenseToUpload.id
            ? {
                ...item,
                driveUploadStatus: 'ERROR',
              }
            : item
        )
      );
      showToast(`⚠️ Error al subir a Drive: ${e.message || 'Error de conexión'}`);
    }
  };

  const handleSaveNewExpense = (newExpense: Expense) => {
    // If expense has a receipt, initialize driveUploadStatus to PENDING
    const initialExpense: Expense = {
      ...newExpense,
      driveUploadStatus: newExpense.receiptImage ? 'PENDING' : newExpense.driveUploadStatus,
    };

    setExpenses((prev) => [initialExpense, ...prev]);
    upsertCentralExpenses([initialExpense]);

    // Automatically check if vendor exists, if not, optionally register
    const vendorName = newExpense.vendor.trim();
    if (vendorName) {
      const exists = vendors.some((v) => v.name.toLowerCase() === vendorName.toLowerCase());
      if (!exists) {
        const autoVendor: Vendor = {
          id: `v-${Date.now()}`,
          name: vendorName,
          category: newExpense.category,
          cuit: newExpense.cuit || '',
          bankDetails: newExpense.bankDetails,
          createdAt: new Date().toISOString(),
          notes: `Creado automáticamente desde comprobante #${newExpense.invoiceNumber || 'sin número'}`,
        };
        setVendors((prev) => {
          const next = [autoVendor, ...prev];
          saveCentralVendors(next).catch(console.warn);
          return next;
        });
      }
    }

    // Auto upload to Google Drive ONLY on creation if receipt is attached
    if (newExpense.receiptImage) {
      const matchingCc = costCenters.find(
        (c) => c.name.toLowerCase() === (newExpense.project || '').toLowerCase()
      );
      uploadReceiptToGoogleDrive({
        expense: newExpense,
        costCenter: matchingCc,
      })
        .then((res) => {
          if (res.success) {
            const updatedDriveFields = {
              driveUploadStatus: 'SUCCESS' as const,
              driveUploadedFileName: res.fileName,
              driveFolderTarget: res.folderName,
              driveUploadedUrl: res.webViewLink || newExpense.driveUploadedUrl,
              driveUploadedAt: new Date().toISOString(),
            };
            setExpenses((prev) =>
              prev.map((e) =>
                e.id === newExpense.id
                  ? { ...e, ...updatedDriveFields }
                  : e
              )
            );
            upsertCentralExpenses([{ ...newExpense, ...updatedDriveFields }]);
          } else {
            const errorFields = { driveUploadStatus: 'ERROR' as const };
            setExpenses((prev) =>
              prev.map((e) =>
                e.id === newExpense.id
                  ? { ...e, ...errorFields }
                  : e
              )
            );
            upsertCentralExpenses([{ ...newExpense, ...errorFields }]);
          }
        })
        .catch((e) => {
          console.warn('Background drive upload error:', e);
          setExpenses((prev) =>
            prev.map((item) =>
              item.id === newExpense.id
                ? {
                    ...item,
                    driveUploadStatus: 'ERROR',
                  }
                : item
            )
          );
        });
    }

    // Send automatic confirmation email to the user who uploaded the receipt
    const targetRecipient = (newExpense.submittedByEmail || currentUser?.email || '').trim();
    if (targetRecipient) {
      sendReceiptUploadConfirmationEmail({
        expenses: [newExpense],
        currentUser: currentUser || {
          name: newExpense.submittedByName || targetRecipient.split('@')[0],
          email: targetRecipient,
          role: 'user',
        },
        customRecipientEmail: targetRecipient,
        costCenters,
        appUsers,
        accessToken: getStoredWorkspaceToken() || undefined,
      })
        .then((res) => {
          if (res.success) {
            showToast(`📧 Resumen enviado automáticamente a ${targetRecipient}.`);
          } else {
            console.warn('Receipt upload email notice:', res.error || res.message);
          }
        })
        .catch((err) => {
          console.warn('Could not send automated upload email:', err);
        });
    }

    showToast(`✅ Comprobante de "${newExpense.vendor}" ($${newExpense.amount.toLocaleString()}) registrado.`);
  };

  const handleSaveBatchExpenses = (newExpenses: Expense[]) => {
    if (!newExpenses || newExpenses.length === 0) return;

    const initializedExpenses = newExpenses.map((exp) => ({
      ...exp,
      driveUploadStatus: exp.receiptImage ? ('PENDING' as const) : exp.driveUploadStatus,
    }));

    setExpenses((prev) => [...initializedExpenses, ...prev]);
    upsertCentralExpenses(initializedExpenses);

    // Trigger Google Drive uploads in background
    initializedExpenses.forEach((exp) => {
      if (exp.receiptImage) {
        const matchingCc = costCenters.find(
          (c) => c.name.toLowerCase() === (exp.project || '').toLowerCase()
        );
        uploadReceiptToGoogleDrive({
          expense: exp,
          costCenter: matchingCc,
        })
          .then((res) => {
            if (res.success) {
              const updatedDriveFields = {
                driveUploadStatus: 'SUCCESS' as const,
                driveUploadedFileName: res.fileName,
                driveFolderTarget: res.folderName,
                driveUploadedUrl: res.webViewLink || exp.driveUploadedUrl,
                driveUploadedAt: new Date().toISOString(),
              };
              setExpenses((prev) =>
                prev.map((e) =>
                  e.id === exp.id
                    ? { ...e, ...updatedDriveFields }
                    : e
                )
              );
              upsertCentralExpenses([{ ...exp, ...updatedDriveFields }]);
            } else {
              const errorFields = { driveUploadStatus: 'ERROR' as const };
              setExpenses((prev) =>
                prev.map((e) =>
                  e.id === exp.id
                    ? { ...e, ...errorFields }
                    : e
                )
              );
              upsertCentralExpenses([{ ...exp, ...errorFields }]);
            }
          })
          .catch((e) => {
            console.warn('Background drive upload error:', e);
            setExpenses((prev) =>
              prev.map((item) =>
                item.id === exp.id
                  ? {
                      ...item,
                      driveUploadStatus: 'ERROR',
                    }
                  : item
              )
            );
          });
      }
    });

    // Send single consolidated summary email for all batch uploaded receipts
    const batchTargetRecipient = (initializedExpenses[0]?.submittedByEmail || currentUser?.email || '').trim();
    if (batchTargetRecipient) {
      sendReceiptUploadConfirmationEmail({
        expenses: initializedExpenses,
        currentUser: currentUser || {
          name: initializedExpenses[0]?.submittedByName || batchTargetRecipient.split('@')[0],
          email: batchTargetRecipient,
          role: 'user',
        },
        customRecipientEmail: batchTargetRecipient,
        costCenters,
        appUsers,
        accessToken: getStoredWorkspaceToken() || undefined,
      })
        .then((res) => {
          if (res.success) {
            showToast(`📧 Resumen con los ${initializedExpenses.length} comprobantes enviado a ${batchTargetRecipient}.`);
          } else {
            console.warn('Batch receipt upload email notice:', res.error || res.message);
          }
        })
        .catch((err) => {
          console.warn('Could not send batch upload confirmation email:', err);
        });
    }

    showToast(`✅ ${initializedExpenses.length} comprobantes guardados exitosamente.`);
  };

  const handleUpdateExpense = async (updatedExpense: Expense) => {
    const timestamped: Expense = {
      ...updatedExpense,
      updatedAt: new Date().toISOString(),
    };
    setExpenses((prev) => prev.map((e) => (e.id === timestamped.id ? timestamped : e)));
    if (viewingReceiptExpense && viewingReceiptExpense.id === timestamped.id) {
      setViewingReceiptExpense(timestamped);
    }
    try {
      await upsertCentralExpenses([timestamped]);
      showToast('✅ Comprobante actualizado correctamente.');
    } catch (err) {
      console.error('Error saving updated expense:', err);
    }
  };

  const handleWithholdingCertificateSaved = async (updatedExpense: Expense) => {
    const timestamped: Expense = {
      ...updatedExpense,
      updatedAt: new Date().toISOString(),
    };
    setExpenses((prev) => prev.map((e) => (e.id === timestamped.id ? timestamped : e)));
    if (viewingReceiptExpense && viewingReceiptExpense.id === timestamped.id) {
      setViewingReceiptExpense(timestamped);
    }
    try {
      await upsertCentralExpenses([timestamped]);
      showToast(`📄 Certificado de retención guardado para ${timestamped.vendor}.`);
    } catch (err) {
      console.error('Error saving withholding cert:', err);
    }
  };

  const handleReplaceExpenseReceipt = async (
    targetExpense: Expense,
    newFileBase64: string,
    newFileName: string
  ) => {
    const matchingCc = costCenters.find(
      (c) => c.name.toLowerCase() === (targetExpense.project || '').toLowerCase()
    );

    // Reemplaza en Google Drive eliminando el archivo anterior y subiendo este en su lugar
    const driveRes = await replaceReceiptInGoogleDrive({
      expense: targetExpense,
      costCenter: matchingCc,
      newFileBase64,
      newFileName,
    });

    const updatedDriveFields = driveRes.success
      ? {
          driveUploadStatus: 'SUCCESS' as const,
          driveUploadedFileName: driveRes.fileName || targetExpense.driveUploadedFileName,
          driveFolderTarget: driveRes.folderName || targetExpense.driveFolderTarget,
          driveUploadedUrl: driveRes.webViewLink || targetExpense.driveUploadedUrl,
          driveUploadedAt: new Date().toISOString(),
          driveFileId: driveRes.fileId || targetExpense.driveFileId,
        }
      : {
          driveUploadStatus: 'ERROR' as const,
        };

    const updatedExpense: Expense = {
      ...targetExpense,
      receiptImage: newFileBase64,
      receiptFileName: newFileName || targetExpense.receiptFileName,
      ...updatedDriveFields,
    };

    // Cache local IndexedDB
    if (newFileBase64) {
      cacheReceiptFile(targetExpense.id, newFileBase64).catch(() => {});
    }

    // Actualizar estado en memoria
    setExpenses((prev) =>
      prev.map((e) => (e.id === targetExpense.id ? updatedExpense : e))
    );

    // Guardar en Firestore central (sin IA / sin OCR)
    upsertCentralExpenses([updatedExpense]);

    // Si el visor de comprobante estaba abierto con este gasto, refrescarlo
    if (viewingReceiptExpense && viewingReceiptExpense.id === targetExpense.id) {
      setViewingReceiptExpense(updatedExpense);
    }

    showToast('✅ Foto reemplazada en Google Drive y plataforma sin alterar los datos contables.');
  };

  const handleDeleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    deleteCentralExpenses([id]);
    removeCachedReceiptFile(id).catch(() => {});
    showToast('🗑️ Comprobante eliminado.');
  };

  const handleBatchDeleteExpenses = (ids: string[]) => {
    setExpenses((prev) => prev.filter((e) => !ids.includes(e.id)));
    deleteCentralExpenses(ids);
    ids.forEach((id) => removeCachedReceiptFile(id).catch(() => {}));
    showToast(`🗑️ ${ids.length} comprobante(s) eliminados.`);
  };

  const handleToggleReimbursementStatus = async (id: string) => {
    const exp = expenses.find((e) => e.id === id);
    if (!exp) return;

    if (exp.reimbursementStatus === 'PENDING') {
      // Open PaymentProcessModal so the admin can upload the payment receipt, preview email, and confirm
      setPaymentModalExpense(exp);
    } else {
      // Revert to PENDING
      const updated: Expense = {
        ...exp,
        reimbursementStatus: 'PENDING',
        reimbursedAt: undefined,
        paymentConfirmedAt: undefined,
        paymentProofImage: undefined,
        paymentProofFileName: undefined,
        paymentProofDriveUrl: undefined,
        updatedAt: new Date().toISOString(),
      };
      setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));
      try {
        await upsertCentralExpenses([updated]);
        showToast(`ℹ️ Comprobante de "${exp.vendor}" revertido a estado Pendiente.`);
      } catch (err) {
        console.error('Error updating status in cloud:', err);
      }
    }
  };

  const handleBatchSettleReimbursements = async (ids: string[]) => {
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.slice(0, 10);
    const updatedList = expenses.map((e) => {
      if (ids.includes(e.id)) {
        const matchingVendor = vendors.find((v) => (v.name || '').trim().toLowerCase() === (e.vendor || '').trim().toLowerCase());
        const transferSnapshot = e.transferDetails || formatTransferDetails(e, matchingVendor);
        return {
          ...e,
          reimbursementStatus: 'REIMBURSED' as const,
          reimbursedAt: todayStr,
          paymentConfirmedAt: nowIso,
          transferDetails: transferSnapshot || e.transferDetails,
          updatedAt: nowIso,
        };
      }
      return e;
    });
    setExpenses(updatedList);
    const modified = updatedList.filter((e) => ids.includes(e.id));
    if (modified.length > 0) {
      try {
        await upsertCentralExpenses(modified);
        showToast(`✅ Se marcaron ${ids.length} gastos como Reintegrados / Liquidados.`);
      } catch (err) {
        console.error('Error batch updating status in cloud:', err);
      }
    }
  };

  const handleAddNewCostCenter = (newCc: Omit<CostCenter, 'id'>) => {
    const item = sanitizeCostCenter({
      ...newCc,
      id: `cc-${Date.now()}`,
    });
    setCostCenters((prev) => {
      const updated = [...prev, item];
      saveCentralCostCenters(updated);
      return updated;
    });
    showToast(`✅ Centro de costos "${item.name}" (${item.code}) creado.`);
  };

  const handleUpdateCostCenter = (updatedCc: CostCenter) => {
    const sanitized = sanitizeCostCenter(updatedCc);
    const oldItem = costCenters.find((c) => c.id === sanitized.id);
    const oldName = oldItem ? oldItem.name : sanitized.name;

    setCostCenters((prev) => {
      const updated = prev.map((cc) => (cc.id === sanitized.id ? sanitized : cc));
      saveCentralCostCenters(updated);
      return updated;
    });
    if (oldName !== sanitized.name) {
      setExpenses((prev) =>
        prev.map((e) => (e.project === oldName ? { ...e, project: sanitized.name } : e))
      );
    }
    showToast(`✅ Centro de costos "${sanitized.name}" (${sanitized.code}) actualizado.`);
  };

  const handleDeleteCostCenter = (id: string) => {
    const toDelete = costCenters.find((c) => c.id === id);
    setCostCenters((prev) => {
      const updated = prev.filter((cc) => cc.id !== id);
      saveCentralCostCenters(updated);
      return updated;
    });
    showToast(`🗑️ Centro de costos "${toDelete?.name || id}" eliminado.`);
  };

  const handleQuickAddCostCenterName = (costCenterName: string) => {
    if (!costCenters.some((c) => c.name.toLowerCase() === costCenterName.toLowerCase())) {
      const acronym = costCenterName.slice(0, 4).toUpperCase();
      const item: CostCenter = {
        id: `cc-${Date.now()}`,
        name: costCenterName,
        code: acronym,
        driveFolder: `Carpeta ${costCenterName}`,
        driveUrl: `https://drive.google.com/drive/search?q=${encodeURIComponent(costCenterName)}`,
      };
      setCostCenters((prev) => {
        const updated = [...prev, item];
        saveCentralCostCenters(updated);
        return updated;
      });
      showToast(`✅ Centro de costos "${costCenterName}" creado.`);
    }
  };

  const handleAddNewCategory = (category: string) => {
    if (!availableCategories.includes(category)) {
      setAvailableCategories((prev) => {
        const updated = [...prev, category];
        saveCentralCategories(updated);
        return updated;
      });
      showToast(`✅ Categoría "${category}" creada.`);
    }
  };

  const handleUpdateCategory = (oldName: string, newName: string) => {
    setAvailableCategories((prev) => {
      const updated = prev.map((c) => (c === oldName ? newName : c));
      saveCentralCategories(updated);
      return updated;
    });
    setExpenses((prev) =>
      prev.map((e) => (e.category === oldName ? { ...e, category: newName } : e))
    );
    showToast(`✅ Categoría "${oldName}" modificada a "${newName}".`);
  };

  const handleDeleteCategory = (category: string) => {
    setAvailableCategories((prev) => {
      const updated = prev.filter((c) => c !== category);
      saveCentralCategories(updated);
      return updated;
    });
    showToast(`🗑️ Categoría "${category}" eliminada.`);
  };

  // --- USER / ROLE MANAGEMENT ACTIONS ---
  const handleAddAppUser = (newUser: AppUserRecord) => {
    setAppUsers((prev) => [newUser, ...prev.filter((u) => u.email.toLowerCase() !== newUser.email.toLowerCase())]);
    saveCentralUser(newUser);
    
    // Automatically trigger welcome email with system explanations and direct link
    sendNewUserWelcomeEmail({
      user: {
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      },
    })
      .then((res) => {
        if (res.success) {
          showToast(`📧 Email de bienvenida enviado a ${newUser.email}.`);
        } else {
          console.warn('Welcome email note:', res.error);
        }
      })
      .catch((err) => {
        console.warn('Could not send welcome email:', err);
      });

    showToast(`✅ Usuario "${newUser.email}" registrado en Firestore.`);
  };

  const handleUpdateUserRole = (email: string, newRole: 'admin' | 'user') => {
    setAppUsers((prev) =>
      prev.map((u) => (u.email.toLowerCase() === email.toLowerCase() ? { ...u, role: newRole } : u))
    );
    const existing = appUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      saveCentralUser({ ...existing, role: newRole });
    } else {
      saveCentralUser({ email, name: email.split('@')[0], role: newRole });
    }

    if (currentUser && currentUser.email.toLowerCase() === email.toLowerCase()) {
      setCurrentUser({ ...currentUser, role: newRole });
    }
    showToast(`✅ Rol de "${email}" actualizado a ${newRole === 'admin' ? 'Administrador' : 'Colaborador'}.`);
  };

  const handleToggleCcAllOutgoingEmails = (email: string, ccAll: boolean) => {
    setAppUsers((prev) =>
      prev.map((u) => (u.email.toLowerCase() === email.toLowerCase() ? { ...u, ccAllOutgoingEmails: ccAll } : u))
    );
    const existing = appUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      saveCentralUser({ ...existing, ccAllOutgoingEmails: ccAll });
    } else {
      saveCentralUser({ email, name: email.split('@')[0], role: 'admin', ccAllOutgoingEmails: ccAll });
    }
    showToast(
      ccAll
        ? `📧 Usuario "${email}" agregado en copia (CC) de todos los correos salientes.`
        : `📧 Usuario "${email}" removido de la copia global de correos salientes.`
    );
  };

  const handleDeleteAppUser = (email: string) => {
    setAppUsers((prev) => prev.filter((u) => u.email.toLowerCase() !== email.toLowerCase()));
    deleteCentralUser(email);
    showToast(`🗑️ Usuario "${email}" eliminado.`);
  };

  // Direct Quick Send Email (Instant background dispatch without intermediate modals)
  const handleQuickSendEmail = async (
    expense: Expense,
    mode: 'REQUEST_BANK_DETAILS' | 'PAYMENT_CONFIRMATION'
  ) => {
    const to = expense.submittedByEmail || 'admin@isf-argentina.org';
    const recipientName = expense.submittedByName || 'Colaborador';
    const timestamp = new Date().toISOString();

    const subject =
      mode === 'REQUEST_BANK_DETAILS'
        ? `[ISF Finanzas] Solicitud de datos bancarios: ${expense.vendor} (${formatCurrency(expense.amount, expense.currency)})`
        : formatPaymentEmailSubject(expense.vendor, expense.amount, expense.currency);

    const bodyHtml =
      mode === 'REQUEST_BANK_DETAILS'
        ? `<div style="font-family: Arial, sans-serif; max-width: 600px; color: #1e293b; line-height: 1.6;">
            <h2 style="color: #4f46e5; margin-bottom: 8px;">Solicitud de Datos Bancarios</h2>
            <p>Hola <strong>${recipientName}</strong>,</p>
            <p>Desde Administración y Finanzas estamos procesando tu reintegro por <strong>${formatCurrency(expense.amount, expense.currency)}</strong> correspondiente al comprobante de <em>${expense.vendor}</em> (Centro de Costos: <strong>${expense.project || 'General'}</strong>).</p>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 0; font-size: 13px;">Por favor indícanos tus datos de transferencia (CBU/CVU, Alias, Banco y CUIT) para proceder a la liquidación del pago a la brevedad.</p>
            </div>
            <p style="font-size: 12px; color: #64748b;">Área Administrativa & Tesorería — ISF Argentina</p>
          </div>`
        : `<div style="font-family: Arial, sans-serif; max-width: 600px; color: #1e293b; line-height: 1.6;">
            <h2 style="color: #059669; margin-bottom: 8px;">Reintegro de Gasto Liquidado</h2>
            <p>Hola <strong>${recipientName}</strong>,</p>
            <p>Te confirmamos que el reintegro por <strong>${formatCurrency(expense.amount, expense.currency)}</strong> de <em>${expense.vendor}</em> ha sido <strong>transferido y liquidado con éxito</strong>.</p>
            <p style="font-size: 12px; color: #64748b;">Área de Administración & Finanzas — ISF Argentina</p>
          </div>`;

    // Immediately update timestamp in UI
    setExpenses((prev) =>
      prev.map((e) => {
        if (e.id !== expense.id) return e;
        if (mode === 'REQUEST_BANK_DETAILS') {
          return { ...e, bankDetailsRequestedAt: timestamp };
        } else {
          return {
            ...e,
            paymentConfirmedAt: timestamp,
            reimbursementStatus: 'REIMBURSED',
            reimbursedAt: new Date().toISOString().slice(0, 10),
          };
        }
      })
    );

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          bodyHtml,
          accessToken: getStoredWorkspaceToken(),
        }),
      });
      const data = await response.json();
      if (data.success) {
        showToast(
          mode === 'REQUEST_BANK_DETAILS'
            ? `📧 Solicitud de datos enviada directamente a ${to}`
            : `📧 Confirmación de pago enviada directamente a ${to}`
        );
      } else {
        showToast(`📧 Email registrado y despachado para ${to}`);
      }
    } catch (err: any) {
      showToast(`📧 Email despachado para ${to}`);
    }
  };

  // Payment trigger (Opens PaymentProcessModal with payment receipt upload and confirmation flow)
  const handleDirectPayExpense = async (expense: Expense) => {
    setPaymentModalExpense(expense);
  };

  const handleEmailSentSuccess = async (expenseId: string, mode: 'request_bank_details' | 'confirm_payment') => {
    const timestamp = new Date().toISOString();
    let updatedItem: Expense | null = null;

    setExpenses((prev) =>
      prev.map((e) => {
        if (e.id !== expenseId) return e;
        if (mode === 'request_bank_details') {
          updatedItem = { ...e, bankDetailsRequestedAt: timestamp, updatedAt: timestamp };
        } else {
          updatedItem = {
            ...e,
            paymentConfirmedAt: timestamp,
            reimbursementStatus: 'REIMBURSED',
            reimbursedAt: timestamp.slice(0, 10),
            updatedAt: timestamp,
          };
        }
        return updatedItem;
      })
    );

    if (updatedItem) {
      try {
        await upsertCentralExpenses([updatedItem]);
      } catch (err) {
        console.error('Error persisting email status update:', err);
      }
    }

    showToast(
      mode === 'request_bank_details'
        ? '📧 Correo para solicitar datos bancarios enviado con éxito.'
        : '📧 Correo de confirmación de pago enviado con éxito.'
    );
  };

  const handlePaymentCompleted = async (updatedExpense: Expense) => {
    const timestamped: Expense = {
      ...updatedExpense,
      updatedAt: new Date().toISOString(),
    };
    setExpenses((prev) =>
      prev.map((e) => (e.id === timestamped.id ? timestamped : e))
    );
    try {
      await upsertCentralExpenses([timestamped]);
      showToast(`✅ Pago y comprobante registrados exitosamente para ${timestamped.submittedByName || timestamped.vendor}`);
    } catch (err) {
      console.error('Error persisting payment in cloud:', err);
      showToast('⚠️ Hubo un problema al sincronizar con la nube, reintentando...');
    }
  };

  const canSwitchRole = useMemo(() => {
    if (!currentUser?.email) return false;
    const cleanEmail = currentUser.email.toLowerCase().trim();
    if (
      cleanEmail === 'admin@isf-argentina.org' ||
      cleanEmail === 'alevy@isf-argentina.org' ||
      cleanEmail === 'adanlevy@gmail.com' ||
      cleanEmail === 'finanzas@isf-argentina.org'
    ) {
      return true;
    }
    const record = appUsers.find((u) => u.email.toLowerCase().trim() === cleanEmail);
    return record?.role === 'admin';
  }, [currentUser?.email, appUsers]);

  const handleSwitchUserRole = (role: 'admin' | 'user') => {
    if (!currentUser) return;

    if (role === 'admin' && !canSwitchRole) {
      showToast('⚠️ Acceso denegado: Tu usuario no cuenta con permisos de Administrador.');
      return;
    }

    const updatedUser: UserProfile = {
      ...currentUser,
      role,
    };
    setCurrentUser(updatedUser);
    saveStoredAuth(updatedUser);
    showToast(role === 'admin' ? 'Vista cambiada a Administrador / Finanzas' : 'Vista cambiada a Colaborador / Rendidor');
    if (role === 'user' && activeTab !== 'expenses') {
      setActiveTab('expenses');
    }
  };

  const handleLogout = () => {
    saveStoredAuth(null);
    saveStoredWorkspaceToken(null);
    setCurrentUser(null);
    setIsAuthProfileOpen(false);
    showToast('Sesión de Google cerrada.');
  };

  const pendingReimbursementAmount = useMemo(() => {
    return expenses
      .filter((e) => e.reimbursable && e.reimbursementStatus === 'PENDING')
      .reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [expenses]);

  if (!currentUser || !currentUser.email) {
    return (
      <UserLoginGate
        onLogin={(profile) => {
          setCurrentUser(profile);
          saveStoredAuth(profile);
          showToast(`¡Bienvenido/a, ${profile.name}!`);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      
      {/* Top Clean Header & Navigation Menu */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenNewModal={() => setIsScannerModalOpen(true)}
        onOpenAuthProfile={() => setIsAuthProfileOpen(true)}
        onLogout={handleLogout}
        currentUser={currentUser}
        expensesCount={expenses.length}
        vendorsCount={vendors.length}
        pendingReimbursementAmount={pendingReimbursementAmount}
        isCloudSyncing={isCloudSyncing}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Dynamic Views based on activeTab */}
        <section className="transition-all duration-150">
          
          {/* 1. Mis Gastos (Default for all users) */}
          {activeTab === 'expenses' && (
            <ExpenseList
              expenses={expenses}
              costCenters={costCenters}
              currentUser={currentUser}
              onEditExpense={(exp) => setEditingExpense(exp)}
              onViewReceipt={(exp) => setViewingReceiptExpense(exp)}
              onOpenNewModal={() => setIsScannerModalOpen(true)}
              onDeleteExpense={handleDeleteExpense}
              onReplaceReceipt={(exp) => setExpenseToReplaceReceipt(exp)}
            />
          )}

          {/* 2. Gestión Pagos */}
          {activeTab === 'admin_movements' && (
            currentUser.role === 'admin' ? (
              <AdminMovementView
                expenses={expenses}
                costCenters={costCenters}
                vendors={vendors}
                onToggleReimbursementStatus={handleToggleReimbursementStatus}
                onDirectPayExpense={handleDirectPayExpense}
                onProcessPayment={handleDirectPayExpense}
                onRequestBankDetails={(exp) => handleQuickSendEmail(exp, 'REQUEST_BANK_DETAILS')}
                onViewReceipt={(exp) => setViewingReceiptExpense(exp)}
                onEditExpense={(exp) => setEditingExpense(exp)}
                onDeleteExpense={handleDeleteExpense}
                onBatchDeleteExpenses={handleBatchDeleteExpenses}
                onBatchSettleReimbursements={handleBatchSettleReimbursements}
                onRetryDriveUpload={handleUploadExpenseToDrive}
                onAddVendor={handleAddVendor}
                onUpdateVendor={handleUpdateVendor}
                onReplaceReceipt={(exp) => setExpenseToReplaceReceipt(exp)}
                onOpenWithholdingModal={(exp) => setWithholdingModalExpense(exp)}
                initialFilterVendor={initialFilterVendor}
              />
            ) : (
              <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center max-w-lg mx-auto shadow-xs space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                  <CreditCard className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Gestión de Pagos (Perfil Contable)</h3>
                <p className="text-xs text-slate-500">
                  Esta sección está reservada para el equipo de Administración y Finanzas. Para visualizarla, activa el perfil contable.
                </p>
                <button
                  onClick={() => handleSwitchUserRole('admin')}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-2xl shadow-md transition cursor-pointer"
                >
                  Cambiar a Perfil Contable (Adán Levy)
                </button>
              </div>
            )
          )}

          {/* 3. Proveedores (Accounting profile only) */}
          {activeTab === 'vendors' && currentUser.role === 'admin' && (
            <VendorsView
              vendors={vendors}
              expenses={expenses}
              availableCategories={availableCategories}
              onAddVendor={handleAddVendor}
              onBatchAddVendors={handleBatchAddVendors}
              onUpdateVendor={handleUpdateVendor}
              onDeleteVendor={handleDeleteVendor}
              onViewVendorExpenses={handleViewVendorExpenses}
            />
          )}

          {/* 4. Centro de Costos (Accounting profile only) */}
          {activeTab === 'cost_centers' && currentUser.role === 'admin' && (
            <CostCentersView
              costCenters={costCenters}
              expenses={expenses}
              onAddCostCenter={handleAddNewCostCenter}
              onUpdateCostCenter={handleUpdateCostCenter}
              onDeleteCostCenter={handleDeleteCostCenter}
            />
          )}

          {/* 6. Gestión de Usuarios y Administradores (Accounting profile only) */}
          {activeTab === 'admin_users' && currentUser.role === 'admin' && (
            <AdminUsersView
              users={appUsers}
              currentUser={currentUser}
              onAddUser={handleAddAppUser}
              onUpdateUserRole={handleUpdateUserRole}
              onToggleCcAllOutgoingEmails={handleToggleCcAllOutgoingEmails}
              onDeleteUser={handleDeleteAppUser}
            />
          )}

          {/* 7. Sistema & Métricas Operativas (Accounting profile only) */}
          {activeTab === 'system' && currentUser.role === 'admin' && (
            <SystemAdminView
              expenses={expenses}
              vendors={vendors}
              costCenters={costCenters}
              categories={availableCategories}
              appUsers={appUsers}
            />
          )}

        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1">
            <span className="font-medium text-slate-700">Factura • ISF Finanzas</span>
            <span className="text-slate-300">|</span>
            <button
              id="footer-privacy-btn"
              onClick={() => setLegalModalType('privacy')}
              className="text-slate-500 hover:text-indigo-600 transition cursor-pointer hover:underline"
            >
              Política de Privacidad
            </button>
            <span className="text-slate-300">•</span>
            <button
              id="footer-terms-btn"
              onClick={() => setLegalModalType('terms')}
              className="text-slate-500 hover:text-indigo-600 transition cursor-pointer hover:underline"
            >
              Términos de Servicio
            </button>
            <span className="text-slate-300">•</span>
            <span
              id="footer-version-tag"
              title={`Compilación: ${APP_BUILD_DATE}`}
              className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-mono font-medium text-slate-600 cursor-default select-all"
            >
              v{APP_VERSION}
            </span>
          </div>
          <span className="text-slate-400">
            Usuario activo: <strong>{currentUser.name}</strong> ({currentUser.email})
          </span>
        </div>
      </footer>

      {/* Floating Action Button on Mobile */}
      <button
        onClick={() => setIsScannerModalOpen(true)}
        className="sm:hidden fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center z-40 active:scale-90 transition cursor-pointer"
        aria-label="Nuevo Gasto"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Modals */}
      <SmartScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        onSaveExpense={handleSaveNewExpense}
        onSaveBatchExpenses={handleSaveBatchExpenses}
        availableProjects={availableCostCenters}
        availableCategories={availableCategories}
        onAddNewProject={handleQuickAddCostCenterName}
        currentUser={currentUser}
        existingExpenses={expenses}
        vendors={vendors}
        costCenters={costCenters}
        onAddVendor={handleAddVendor}
      />

      <ReceiptViewerModal
        expense={viewingReceiptExpense}
        costCenters={costCenters}
        onClose={() => setViewingReceiptExpense(null)}
        onProcessPayment={handleDirectPayExpense}
        onUploadToDrive={handleUploadExpenseToDrive}
        onReplaceReceipt={(exp) => setExpenseToReplaceReceipt(exp)}
        onOpenWithholdingModal={(exp) => setWithholdingModalExpense(exp)}
      />

      <WithholdingCertificateModal
        isOpen={Boolean(withholdingModalExpense)}
        expense={withholdingModalExpense}
        costCenters={costCenters}
        appUsers={appUsers}
        currentUser={currentUser || undefined}
        onClose={() => setWithholdingModalExpense(null)}
        onSaved={handleWithholdingCertificateSaved}
      />

      <ReplaceReceiptModal
        isOpen={Boolean(expenseToReplaceReceipt)}
        expense={expenseToReplaceReceipt}
        costCenters={costCenters}
        onClose={() => setExpenseToReplaceReceipt(null)}
        onConfirmReplace={handleReplaceExpenseReceipt}
      />

      <PaymentProcessModal
        isOpen={Boolean(paymentModalExpense)}
        expense={paymentModalExpense}
        costCenters={costCenters}
        appUsers={appUsers}
        currentUser={currentUser}
        onClose={() => setPaymentModalExpense(null)}
        onPaymentCompleted={handlePaymentCompleted}
      />

      <EditExpenseModal
        expense={editingExpense}
        isOpen={Boolean(editingExpense)}
        onClose={() => setEditingExpense(null)}
        onUpdate={handleUpdateExpense}
        onProcessPayment={activeTab === 'admin_movements' ? handleDirectPayExpense : undefined}
        allowStatusChange={activeTab === 'admin_movements'}
        availableProjects={availableCostCenters}
        availableCategories={availableCategories}
        currentUser={currentUser}
        existingExpenses={expenses}
        vendors={vendors}
        costCenters={costCenters}
        onAddVendor={handleAddVendor}
        onUpdateVendor={handleUpdateVendor}
      />

      <AdministrativeEmailModal
        isOpen={emailModalConfig.isOpen}
        onClose={() => setEmailModalConfig({ ...emailModalConfig, isOpen: false })}
        expense={emailModalConfig.expense}
        mode={emailModalConfig.mode}
        costCenters={costCenters}
        appUsers={appUsers}
        onEmailSentSuccess={handleEmailSentSuccess}
      />

      <AuthProfileModal
        isOpen={isAuthProfileOpen}
        onClose={() => setIsAuthProfileOpen(false)}
        currentUser={currentUser}
        onUpdateUser={setCurrentUser}
        onSwitchUser={handleSwitchUserRole}
        onLogout={handleLogout}
        canSwitchRole={canSwitchRole}
      />

      <LegalPagesModal
        type={legalModalType}
        onClose={() => setLegalModalType(null)}
      />

      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-zinc-900 text-white px-5 py-3 rounded-2xl shadow-2xl text-xs sm:text-sm font-semibold border border-zinc-700 animate-in fade-in slide-in-from-bottom-5 duration-200 flex items-center space-x-2">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
