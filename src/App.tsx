import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Expense, UserProfile, Vendor, CostCenter, AppUserRecord, AuditLogEntry, DriveSettings } from './types';
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
import { AuditLogsView } from './components/AuditLogsView';
import { AuthProfileModal } from './components/AuthProfileModal';
import { UserLoginGate } from './components/UserLoginGate';
import { LegalPagesModal } from './components/LegalPagesModal';
import { ManualModal } from './components/ManualModal';
import { UpdateAvailableBanner } from './components/UpdateAvailableBanner';
import { clearLocalSessionData } from './utils/sessionCleanup';
import { ReplaceReceiptModal } from './components/ReplaceReceiptModal';
import { WithholdingCertificateModal } from './components/WithholdingCertificateModal';
import { APP_VERSION, APP_BUILD_DATE } from './version';
import { getStoredAuth, saveStoredAuth, getStoredUserBankDetails, saveStoredUserBankDetails } from './utils/auth';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './lib/firebase';
import { waitForPendingWrites } from 'firebase/firestore';
import { formatCurrency, sanitizeCostCenter, formatPaymentEmailSubject, formatTransferDetails, cleanCuit, generateDriveFileName, escapeHtml } from './utils/helpers';
import {
  uploadReceiptToGoogleDrive,
  replaceReceiptInGoogleDrive,
  deleteReceiptFromGoogleDrive,
  extractDriveFileId,
  getStoredWorkspaceToken,
  saveStoredWorkspaceToken,
  sendReceiptUploadConfirmationEmail,
  sendPaymentReversalEmail,
  sendNewUserWelcomeEmail,
  sendGmailMessage,
} from './utils/googleWorkspace';
import { resolveEmailCcRecipients } from './utils/emailCc';
import {
  subscribeToAuditLogs,
  fetchCentralAuditLogs,
  clearCentralAuditLogs,
  logAuditEvent,
  computeObjectDiff,
} from './utils/auditLogger';
import {
  fetchCentralSync,
  saveCentralExpenses,
  saveCentralVendors,
  saveCentralCategories,
  upsertCentralExpenses,
  patchCentralExpenses,
  patchExpensesIfNotPaid,
  saveExpenseChangesIfNotPaid,
  fetchExpenseFromServer,
  repairMisclassifiedPendingExpenses,
  upsertCentralExpensesDetailed,
  pickExpenseFields,
  diffExpenseFields,
  saveExpenseChanges,
  renameExpenseFieldValue,
  deleteCentralCostCenter,
  saveSingleCostCenter,
  deleteCentralExpenses,
  deleteCentralVendors,
  getDeletedExpensesSet,
  subscribeToDriveSettings,
  isPaymentProofUsedByOtherExpenses,
  saveDriveSettings,
  isExpenseDeletedInSession,
  fetchUserCloudPreferences,
  saveUserCloudPreferences,
  fetchCentralUsers,
  saveCentralUser,
  unifyLegacyUserDocs,
  deleteCentralUser,
  subscribeToUsersFirestore,
  getLocalUsersCache,
  deduplicateUsers,
  subscribeToRealtimeFirestore,
  subscribeToPendingExpenses,
  fetchExpensesPage,
  ExpenseQueryOptions,
  testFirestoreConnection,
  mergeExpensesList,
  mergeVendorsList,
  normalizeVendorBankDetails,
  sessionDeletedVendorIds,
  resolveUserRoleFromEmail,
} from './utils/cloudSync';
import {
  removeCachedReceiptFile,
  cacheReceiptFile,
  removeCachedPaymentProofFile,
  removeCachedWithholdingCertificateFile,
  getCachedReceiptFile,
} from './utils/receiptCache';
import { hydrateUserPatternsFromCloud } from './utils/sorting';
import { authFetch } from './utils/authFetch';
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

  const [isFirebaseAuthReady, setIsFirebaseAuthReady] = useState(false);
  // Rol REAL según la tabla de usuarios. currentUser.role es la vista activa: un Admin puede
  // "ver como Colaborador" sin perder su rol (antes la sincronización lo devolvía a Admin).
  const [permissionRole, setPermissionRole] = useState<'admin' | 'user' | null>(null);
  const permissionRoleRef = useRef<'admin' | 'user' | null>(null);
  useEffect(() => {
    permissionRoleRef.current = permissionRole;
  }, [permissionRole]);

  // Synchronize Firebase Auth state as the single source of truth for Firestore permissions
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.email) {
        const userEmail = firebaseUser.email.toLowerCase().trim();
        try {
          const detectedRole = await resolveUserRoleFromEmail(userEmail);
          if (detectedRole) {
            const profile: UserProfile = {
              name: firebaseUser.displayName || userEmail.split('@')[0],
              email: userEmail,
              picture: firebaseUser.photoURL || undefined,
              role: detectedRole,
            };
            setPermissionRole(detectedRole);
            setCurrentUser(profile);
            saveStoredAuth(profile);
          } else {
            console.info('[App Auth] Usuario no habilitado en app_users, cerrando sesión de Firebase Auth:', userEmail);
            await signOut(auth);
            setCurrentUser(null);
            saveStoredAuth(null);
          }
        } catch (e) {
          console.warn('[App Auth] Error verificando rol en auth state:', e);
        }
      } else {
        setCurrentUser(null);
        saveStoredAuth(null);
      }
      setIsFirebaseAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const currentUserRef = useRef<UserProfile | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Core Data with Centralized Cloud Persistence (Only server store, no local mock duplicates)
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [costCenters, setCostCenters] = useState<CostCenter[]>(() =>
    DEFAULT_COST_CENTERS_DATA.map(sanitizeCostCenter)
  );

  const availableCostCenters = useMemo(() => costCenters.map((c) => c.name), [costCenters]);

  const [availableCategories, setAvailableCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [appUsers, setAppUsers] = useState<AppUserRecord[]>(() => deduplicateUsers(getLocalUsersCache()));
  const legacyUsersUnifiedRef = useRef(false);
  const misclassifiedRepairedRef = useRef(false);
  const lastBatchAlreadyPaidRef = useRef(0);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isAuditLogsLoading, setIsAuditLogsLoading] = useState(false);

  // Modal States
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [viewingReceiptExpense, setViewingReceiptExpense] = useState<Expense | null>(null);
  const [expenseToReplaceReceipt, setExpenseToReplaceReceipt] = useState<Expense | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [paymentModalExpense, setPaymentModalExpense] = useState<Expense | null>(null);
  const [withholdingModalExpense, setWithholdingModalExpense] = useState<Expense | null>(null);
  const [isAuthProfileOpen, setIsAuthProfileOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
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

  // Query-level filtering and pagination state (scales to large Firestore collections)
  const [queryPeriod, setQueryPeriod] = useState<string>('all');
  const [queryCostCenter, setQueryCostCenter] = useState<string>('ALL');
  const [queryLimit, setQueryLimit] = useState<number>(50);
  const [hasMoreExpenses, setHasMoreExpenses] = useState<boolean>(false);
  const [isLoadingMoreExpenses, setIsLoadingMoreExpenses] = useState<boolean>(false);

  // Handlers for server-side query filtering and pagination
  const handleLoadMoreExpenses = async () => {
    setIsLoadingMoreExpenses(true);
    try {
      const nextLimit = queryLimit + 50;
      setQueryLimit(nextLimit);
      const res = await fetchExpensesPage(
        permissionRole === 'admin'
          ? { period: queryPeriod, costCenter: queryCostCenter, limitCount: nextLimit }
          : { submittedByEmail: currentUser?.email }
      );
      if (res.expenses && res.expenses.length > 0) {
        setExpenses((prev) => mergeExpensesList(prev, res.expenses));
      }
      setHasMoreExpenses(res.hasMore);
    } catch (err) {
      console.warn('Error fetching more expenses:', err);
    } finally {
      setIsLoadingMoreExpenses(false);
    }
  };

  const handlePeriodChange = (period: string) => {
    setQueryPeriod(period);
    setQueryLimit(50);
  };

  const handleCostCenterFilterChange = (cc: string) => {
    setQueryCostCenter(cc);
    setQueryLimit(50);
  };

  const handleLimitChange = (limitCount: number) => {
    setQueryLimit(limitCount);
  };

  // Initial Cloud Hydration & Real-time Sync on App load
  useEffect(() => {
    // Strictly wait until Firebase Auth is confirmed ready and user is authenticated
    if (!isFirebaseAuthReady || !currentUser || !currentUser.email) {
      return;
    }

    let isMounted = true;
    // Colaborador: todos sus comprobantes (sin paginación). Admin: la página filtrada de toda la organización.
    const expenseQueryOptions: ExpenseQueryOptions =
      permissionRole === 'admin'
        ? { period: queryPeriod, costCenter: queryCostCenter, limitCount: queryLimit }
        : { submittedByEmail: currentUser.email };

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
        const cloudData = await fetchCentralSync(expenseQueryOptions);
        if (cloudData && isMounted) {
          const deletedSet = getDeletedExpensesSet();
          if (Array.isArray(cloudData.expenses)) {
            setExpenses((prev) => {
              const filteredPrev = prev.filter((e) => e && e.id && !deletedSet.has(e.id));
              const filteredIncoming = cloudData.expenses.filter((e) => e && e.id && !deletedSet.has(e.id));
              return mergeExpensesList(filteredPrev, filteredIncoming);
            });
          }
          if (cloudData.hasMore !== undefined) {
            setHasMoreExpenses(cloudData.hasMore);
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

          setVendors(cleanVendors);

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
          const uniqueCloudUsers = deduplicateUsers(cloudUsers);
          setAppUsers(uniqueCloudUsers);

          // Synchronize active session role with Firestore
          const current = currentUserRef.current;
          if (current?.email) {
            const currentEmailClean = current.email.toLowerCase().trim();
            const meInCloud = uniqueCloudUsers.find(
              (u) => u.email.toLowerCase().trim() === currentEmailClean
            );
            // Solo un cambio REAL de rol en la tabla (no la vista "ver como Colaborador")
            if (meInCloud && meInCloud.role && meInCloud.role !== permissionRoleRef.current) {
              setPermissionRole(meInCloud.role);
              const updatedUser: UserProfile = {
                ...current,
                role: meInCloud.role,
                name: meInCloud.name || current.name,
                picture: meInCloud.picture || current.picture,
              };
              setCurrentUser(updatedUser);
              saveStoredAuth(updatedUser);
              if (meInCloud.role === 'user') {
                setActiveTab('expenses');
              }
            }
          }
        }

        // Hydrate user specific smart preferences and cost centers
        if (currentUser?.email) {
          const userPrefs = await fetchUserCloudPreferences(currentUser.email);
          if (userPrefs && userPrefs.categoryCostCenterPatterns) {
            hydrateUserPatternsFromCloud(currentUser.email, userPrefs.categoryCostCenterPatterns);
          }
          // Datos bancarios del perfil: la copia de la nube restaura este navegador (se borra al
          // cerrar sesión); si solo existían en este navegador (versiones anteriores), se suben.
          if (userPrefs?.bankDetails) {
            saveStoredUserBankDetails(currentUser.email, userPrefs.bankDetails);
          } else {
            const localBank = getStoredUserBankDetails(currentUser.email);
            if (localBank && (localBank.cbuCvu || localBank.alias)) {
              saveUserCloudPreferences(currentUser.email, { bankDetails: localBank }).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.warn('Initial cloud hydration note:', err);
      } finally {
        if (isMounted) setIsCloudSyncing(false);
      }
    }

    hydrateFromCloud();

    // Real-time Firestore listener with query-level filtering (period, cost center, limit)
    const unsubscribeRealtime = subscribeToRealtimeFirestore(
      (incoming) => {
        if (!isMounted) return;
        const deletedSet = getDeletedExpensesSet();
        const removedIds = incoming.removedExpenseIds || [];
        if (removedIds.length > 0) {
          setExpenses((prev) => prev.filter((e) => !removedIds.includes(e.id)));
        }
        if (incoming.expenses) {
          setExpenses((prev) => {
            const filteredPrev = prev.filter((e) => !deletedSet.has(e.id) && !removedIds.includes(e.id));
            const filteredIncoming = incoming.expenses!.filter((e) => !deletedSet.has(e.id) && !removedIds.includes(e.id));
            return mergeExpensesList(filteredPrev, filteredIncoming);
          });
        }
        if (incoming.hasMore !== undefined) {
          setHasMoreExpenses(incoming.hasMore);
        }
        if (incoming.vendors !== undefined) {
          setVendors((incoming.vendors || []).filter((v) => v && v.id && !sessionDeletedVendorIds.has(v.id)).map(normalizeVendorBankDetails));
        }
        if (incoming.costCenters && incoming.costCenters.length > 0) {
          setCostCenters(incoming.costCenters.map(sanitizeCostCenter));
        }
        setLastSyncTime(new Date());
      },
      expenseQueryOptions
    );

    // Admin: los pendientes de pago siempre cargados, más allá de la página actual
    let unsubscribePending = () => {};
    if (permissionRole === 'admin') {
      unsubscribePending = subscribeToPendingExpenses((incoming) => {
        if (!isMounted) return;
        const deletedSet = getDeletedExpensesSet();
        const removedIds = incoming.removedExpenseIds || [];
        if (removedIds.length > 0) {
          setExpenses((prev) => prev.filter((e) => !removedIds.includes(e.id)));
        }
        if (incoming.expenses) {
          setExpenses((prev) =>
            mergeExpensesList(
              prev.filter((e) => !deletedSet.has(e.id) && !removedIds.includes(e.id)),
              incoming.expenses!.filter((e) => !deletedSet.has(e.id) && !removedIds.includes(e.id))
            )
          );
        }
      });
    }

    const unsubscribeUsers = subscribeToUsersFirestore((incomingUsers) => {
      if (!isMounted) return;
      if (incomingUsers && incomingUsers.length > 0) {
        const uniqueIncoming = deduplicateUsers(incomingUsers);
        setAppUsers(uniqueIncoming);

        // Real-time synchronization of current active user session role
        const current = currentUserRef.current;
        if (current?.email) {
          const currentEmailClean = current.email.toLowerCase().trim();
          const meInCloud = uniqueIncoming.find(
            (u) => u.email.toLowerCase().trim() === currentEmailClean
          );
          if (meInCloud && meInCloud.role && meInCloud.role !== permissionRoleRef.current) {
            setPermissionRole(meInCloud.role);
            const updatedUser: UserProfile = {
              ...current,
              role: meInCloud.role,
              name: meInCloud.name || current.name,
              picture: meInCloud.picture || current.picture,
            };
            setCurrentUser(updatedUser);
            saveStoredAuth(updatedUser);
            if (meInCloud.role === 'user') {
              setActiveTab('expenses');
            }
            showToast(
              meInCloud.role === 'admin'
                ? '🛡️ Tus permisos se actualizaron a Administrador en tiempo real.'
                : '👤 Tus permisos se actualizaron a Colaborador en tiempo real.'
            );
          }
        }
      }
    });

    let unsubscribeAuditLogs = () => {};
    // In Firestore rules, audit_logs collection is strictly restricted to admin role
    if (currentUser.role === 'admin') {
      unsubscribeAuditLogs = subscribeToAuditLogs((incomingLogs) => {
        if (!isMounted) return;
        setAuditLogs(incomingLogs);
      });
    }

    return () => {
      isMounted = false;
      unsubscribeRealtime();
      unsubscribePending();
      unsubscribeUsers();
      unsubscribeAuditLogs();
    };
  }, [isFirebaseAuthReady, currentUser?.email, currentUser?.role, permissionRole, queryPeriod, queryCostCenter, queryLimit]);

  // Sync current user to auth session storage
  useEffect(() => {
    saveStoredAuth(currentUser);
  }, [currentUser]);

  // Configuración de Drive: carpeta única para comprobantes de pago y certificados de retención
  const [driveSettings, setDriveSettings] = useState<DriveSettings | null>(null);
  useEffect(() => {
    if (!isFirebaseAuthReady || !currentUser?.email) return;
    const unsubscribe = subscribeToDriveSettings(setDriveSettings);
    return () => unsubscribe();
  }, [isFirebaseAuthReady, currentUser?.email]);

  // Unificación de la tabla de usuarios (registros con clave vieja juan_dominio_org -> juan@dominio.org).
  // La hace el primer Admin que entra en la sesión; si no hay registros viejos, no escribe nada.
  useEffect(() => {
    if (!isFirebaseAuthReady || currentUser?.role !== 'admin' || legacyUsersUnifiedRef.current) return;
    legacyUsersUnifiedRef.current = true;
    unifyLegacyUserDocs()
      .then(async (res) => {
        const total = res.migrated.length + res.removed.length;
        if (total === 0 && res.failed.length === 0) return;
        await logAuditEvent({
          userEmail: currentUser?.email,
          userName: currentUser?.name,
          action: 'USER_ROLE_CHANGE',
          actionLabel: 'Unificación de Registros de Usuarios',
          entityType: 'user',
          entityId: 'unify-legacy-users',
          entityName: `${total} registro(s)`,
          summary:
            `Se unificaron registros de usuarios con el formato viejo de clave.` +
            (res.migrated.length ? ` Pasados al formato actual: ${res.migrated.join(', ')}.` : '') +
            (res.removed.length ? ` Duplicados viejos eliminados: ${res.removed.join(', ')}.` : '') +
            (res.roleConflicts.length ? ` Con rol distinto en el registro viejo (se conservó el actual): ${res.roleConflicts.join(', ')}.` : '') +
            (res.failed.length ? ` No se pudieron unificar: ${res.failed.join(', ')}.` : ''),
        }).catch(() => {});
        if (total > 0) showToast(`👥 Tabla de usuarios unificada: ${total} registro(s) duplicado(s) o en formato viejo corregido(s).`);
      })
      .catch((err) => console.warn('No se pudo unificar la tabla de usuarios:', err));
  }, [isFirebaseAuthReady, currentUser?.role, currentUser?.email]);

  // Corrige una vez los "Pago a Proveedor" / "Reintegro" que se guardaron como "No aplica"
  useEffect(() => {
    if (!isFirebaseAuthReady || permissionRole !== 'admin' || misclassifiedRepairedRef.current) return;
    misclassifiedRepairedRef.current = true;
    repairMisclassifiedPendingExpenses()
      .then(async (fixedIds) => {
        if (fixedIds.length === 0) return;
        await logAuditEvent({
          userEmail: currentUser?.email,
          userName: currentUser?.name,
          action: 'EXPENSE_STATUS_CHANGE',
          actionLabel: 'Corrección de Estado (Pendientes)',
          entityType: 'expense',
          entityId: 'repair-pending-status',
          entityName: `${fixedIds.length} comprobante(s)`,
          summary: `Se corrigieron ${fixedIds.length} comprobante(s) de Pago a Proveedor / Reintegro que figuraban como "No aplica": ahora están Pendientes de pago.`,
          metadata: { ids: fixedIds },
        }).catch(() => {});
        showToast(`🔧 Se corrigieron ${fixedIds.length} comprobante(s) de Pago a Proveedor que no figuraban como pendientes.`);
      })
      .catch((err) => console.warn('No se pudieron revisar los estados de pago:', err));
  }, [isFirebaseAuthReady, permissionRole, currentUser?.email]);

  const handleSaveDriveSettings = async (next: DriveSettings): Promise<boolean> => {
    const previous = driveSettings;
    const res = await saveDriveSettings(next);
    if (!res.ok) {
      showToast(`⚠️ ${res.error}`);
      return false;
    }
    setDriveSettings(next);

    const describe = (s?: DriveSettings | null) =>
      s?.paymentsFolderId ? s.paymentsFolderName || s.paymentsFolderUrl || s.paymentsFolderId : '(sin configurar)';
    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'UPDATE',
      actionLabel: 'Carpeta de Comprobantes de Pago y Retenciones',
      entityType: 'system',
      entityId: 'drive-settings',
      entityName: 'Carpeta de comprobantes de pago y retenciones',
      summary: next.paymentsFolderId
        ? `Los comprobantes de pago y certificados de retención ahora se guardan en la carpeta "${describe(next)}".`
        : 'Se quitó la carpeta de comprobantes de pago y retenciones: vuelven a guardarse en la carpeta de cada centro de costos.',
      changes: [
        {
          field: 'paymentsFolder',
          label: 'Carpeta de comprobantes de pago y retenciones',
          oldValue: describe(previous),
          newValue: describe(next),
        },
      ],
    });

    showToast(
      next.paymentsFolderId
        ? `✅ Carpeta de comprobantes de pago y retenciones guardada: "${describe(next)}".`
        : '✅ Carpeta quitada: los comprobantes de pago y retenciones vuelven a la carpeta de cada centro de costos.'
    );
    return true;
  };

  const toastTimerRef = useRef<number | null>(null);
  const showToast = (message: string) => {
    setToastMessage(message);
    // Un temporizador anterior no debe ocultar un mensaje más nuevo antes de tiempo
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };
  const SAVE_ERROR_HINT = 'sin permisos o sin conexión';
  // Campos de pago: al revertir se borran; al pagar se escriben (sin tocar el resto del comprobante)
  const PAYMENT_REVERT_FIELDS = [
    'reimbursementStatus',
    'reimbursedAt',
    'paymentConfirmedAt',
    'paymentProofFileName',
    'paymentProofDriveUrl',
    'paymentProofAt',
    'withholdingCertificateFileName',
    'withholdingCertificateUploadedAt',
    'withholdingCertificateDriveUrl',
    'withholdingCertificateSentAt',
    'updatedAt',
  ] as const;
  const BATCH_PAYMENT_FIELDS = [
    'reimbursementStatus',
    'reimbursedAt',
    'paymentConfirmedAt',
    'transferDetails',
    'paymentProofImage',
    'paymentProofFileName',
    'paymentProofAt',
    'paymentProofDriveUrl',
    'appliesWithholdings',
    'updatedAt',
  ] as const;
  const DRIVE_RECEIPT_FIELDS = [
    'driveUploadStatus',
    'driveUploadedFileName',
    'driveFolderTarget',
    'driveUploadedUrl',
    'driveUploadedAt',
    'driveFileId',
  ] as const;

  // --- VENDOR MANAGEMENT ACTIONS ---
  const handleAddVendor = async (newVendorData: Omit<Vendor, 'id' | 'createdAt'>) => {
    const newVendor: Vendor = {
      ...newVendorData,
      id: `v-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setVendors((prev) => [newVendor, ...prev]);
    // Solo el proveedor nuevo: reescribir todo el catálogo fallaba para Colaboradores
    // (no pueden modificar proveedores existentes) y pisaba cambios de otros Admins
    if (!(await saveCentralVendors([newVendor]))) {
      setVendors((prev) => prev.filter((v) => v.id !== newVendor.id));
      showToast(`⚠️ No se pudo agregar el proveedor "${newVendor.name}" (${SAVE_ERROR_HINT}).`);
      return;
    }

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'VENDOR_CREATE',
      actionLabel: 'Creación de Proveedor',
      entityType: 'vendor',
      entityId: newVendor.id,
      entityName: newVendor.name,
      summary: `Se agregó el proveedor "${newVendor.name}" (${newVendor.cuit || 'Sin CUIT'}) al catálogo.`,
    });

    showToast(`✅ Proveedor "${newVendor.name}" añadido al catálogo.`);
  };

  const handleBatchAddVendors = async (newVendorsList: Omit<Vendor, 'id' | 'createdAt'>[]) => {
    if (!newVendorsList || newVendorsList.length === 0) return;
    const initialized: Vendor[] = newVendorsList.map((v, idx) => ({
      ...v,
      id: `v-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      createdAt: new Date().toISOString(),
    }));
    setVendors((prev) => [...initialized, ...prev]);
    if (!(await saveCentralVendors(initialized))) {
      const ids = new Set(initialized.map((v) => v.id));
      setVendors((prev) => prev.filter((v) => !ids.has(v.id)));
      showToast(`⚠️ No se pudieron importar los proveedores (${SAVE_ERROR_HINT}).`);
      return;
    }

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'VENDOR_CREATE',
      actionLabel: 'Importación de Proveedores',
      entityType: 'vendor',
      entityId: 'batch-import',
      entityName: `${initialized.length} proveedores`,
      summary: `Se importaron ${initialized.length} proveedores en lote.`,
    });

    showToast(`✅ Se importaron ${initialized.length} proveedores exitosamente.`);
  };

  const handleUpdateVendor = async (updatedVendor: Vendor) => {
    const prevVendor = vendors.find((v) => v.id === updatedVendor.id);
    const prevName = (prevVendor?.name || '').trim().toLowerCase();
    const prevCuitDigits = (prevVendor?.cuit || prevVendor?.bankDetails?.cuitCuil || '').replace(/[^0-9]/g, '');
    const prevCbu = (prevVendor?.bankDetails?.cbuCvu || '').trim();
    const prevAlias = (prevVendor?.bankDetails?.alias || '').trim().toLowerCase();

    const newName = (updatedVendor.name || '').trim();
    const newCuit = (updatedVendor.cuit || updatedVendor.bankDetails?.cuitCuil || '').trim();
    const newCuitDigits = newCuit.replace(/[^0-9]/g, '');

    // 1. Update vendors state and central persistence (solo el proveedor editado)
    setVendors((prev) => prev.map((v) => (v.id === updatedVendor.id ? updatedVendor : v)));
    if (!(await saveCentralVendors([updatedVendor]))) {
      if (prevVendor) setVendors((prev) => prev.map((v) => (v.id === prevVendor.id ? prevVendor : v)));
      showToast(`⚠️ No se pudo actualizar el proveedor "${updatedVendor.name}" (${SAVE_ERROR_HINT}).`);
      return;
    }

    // Compute diff and audit log
    const diffs = computeObjectDiff(prevVendor, updatedVendor, {
      name: 'Razón Social / Nombre',
      cuit: 'CUIT / CUIL',
      notes: 'Notas',
      contactEmail: 'Email de Contacto',
      phone: 'Teléfono',
      address: 'Dirección',
    });

    if (prevVendor?.bankDetails || updatedVendor.bankDetails) {
      const bankDiffs = computeObjectDiff(prevVendor?.bankDetails, updatedVendor.bankDetails, {
        bankName: 'Banco',
        cbuCvu: 'CBU / CVU',
        alias: 'Alias Bancario',
        accountHolder: 'Titular de Cuenta',
        cuitCuil: 'CUIT del Titular',
        accountType: 'Tipo de Cuenta',
      });
      diffs.push(...bankDiffs);
    }

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'VENDOR_UPDATE',
      actionLabel: 'Edición de Proveedor',
      entityType: 'vendor',
      entityId: updatedVendor.id,
      entityName: updatedVendor.name,
      summary: `Se actualizaron los datos del proveedor "${updatedVendor.name}".`,
      changes: diffs.length > 0 ? diffs : undefined,
    });

    // 2. Cascade update matching expenses
    const otherVendorsWithSameCuit = vendors.filter(
      (v) => v.id !== updatedVendor.id && cleanCuit(v.cuit || v.bankDetails?.cuitCuil) === (newCuitDigits || prevCuitDigits)
    );
    const otherVendorNames = new Set(
      otherVendorsWithSameCuit.map((v) => (v.name || '').trim().toLowerCase()).filter(Boolean)
    );

    const updatedExpensesList: Expense[] = [];
    const updatedExpenses = expenses.map((e) => {
      // Un comprobante ya pagado conserva los datos con los que se pagó
      if (e.reimbursementStatus === 'REIMBURSED') return e;
      const isPersonalReimbursement = Boolean(
        (e.paymentType === 'REINTEGRO' || e.paymentMethod === 'Reintegro') &&
        e.submittedByName?.trim()
      );
      if (isPersonalReimbursement) return e;

      const expVendor = (e.vendor || '').trim().toLowerCase();
      // Guard: If this expense belongs to another distinct vendor that shares this CUIT, do not touch it
      if (otherVendorNames.has(expVendor)) {
        return e;
      }

      const expCuitDigits = (e.cuit || e.bankDetails?.cuitCuil || '').replace(/[^0-9]/g, '');
      const expCbu = (e.bankDetails?.cbuCvu || '').trim();
      const expAlias = (e.bankDetails?.alias || '').trim().toLowerCase();
      const expHolder = (e.bankDetails?.accountHolder || '').trim().toLowerCase();

      const isDirectNameMatch = Boolean(
        (prevName && expVendor === prevName) ||
        (newName && expVendor === newName.toLowerCase()) ||
        (prevName && expHolder && expHolder === prevName)
      );

      const isDirectBankMatch = Boolean(
        (prevCbu && expCbu && prevCbu === expCbu) ||
        (prevAlias && expAlias && prevAlias === expAlias)
      );

      // Only match by CUIT if no other vendor shares this CUIT or if name also aligns
      const isCuitOnlyMatch = Boolean(
        otherVendorNames.size === 0 &&
        ((prevCuitDigits && expCuitDigits && prevCuitDigits === expCuitDigits) ||
         (newCuitDigits && expCuitDigits && newCuitDigits === expCuitDigits))
      );

      const isMatch = isDirectNameMatch || isDirectBankMatch || isCuitOnlyMatch;

      if (isMatch) {
        const updated: Expense = {
          ...e,
          vendor: newName || e.vendor,
          cuit: newCuit || e.cuit,
          bankDetails: updatedVendor.bankDetails
            ? {
                ...updatedVendor.bankDetails,
                accountHolder: newName || updatedVendor.bankDetails.accountHolder || e.vendor,
                cuitCuil: newCuit || updatedVendor.bankDetails.cuitCuil || e.cuit || '',
              }
            : e.bankDetails,
          transferDetails: formatTransferDetails(
            {
              ...e,
              vendor: newName || e.vendor,
              cuit: newCuit || e.cuit,
              bankDetails: updatedVendor.bankDetails,
            },
            updatedVendor
          ),
          updatedAt: new Date().toISOString(),
        };
        updatedExpensesList.push(updated);
        return updated;
      }
      return e;
    });

    if (updatedExpensesList.length > 0) {
      setExpenses(updatedExpenses);
      const cascade = await patchCentralExpenses(
        updatedExpensesList.map((e) => ({
          id: e.id,
          changes: pickExpenseFields(e, ['vendor', 'cuit', 'bankDetails', 'transferDetails', 'updatedAt']),
        }))
      );
      if (!cascade.ok) {
        showToast(`⚠️ Proveedor actualizado, pero ${cascade.failedIds.length} comprobante(s) no se pudieron sincronizar.`);
        return;
      }
    }

    showToast(
      updatedExpensesList.length > 0
        ? `✅ Proveedor "${updatedVendor.name}" actualizado y sincronizado en ${updatedExpensesList.length} comprobante(s).`
        : `✅ Proveedor "${updatedVendor.name}" actualizado.`
    );
  };

  const handleDeleteVendor = async (id: string) => {
    const vendorToDelete = vendors.find((v) => v.id === id);
    setVendors((prev) => prev.filter((v) => v.id !== id));
    if (!(await deleteCentralVendors([id]))) {
      if (vendorToDelete) setVendors((prev) => [vendorToDelete, ...prev.filter((v) => v.id !== id)]);
      showToast(`⚠️ No se pudo eliminar el proveedor (${SAVE_ERROR_HINT}).`);
      return;
    }

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'VENDOR_DELETE',
      actionLabel: 'Eliminación de Proveedor',
      entityType: 'vendor',
      entityId: id,
      entityName: vendorToDelete?.name || id,
      summary: `Se eliminó el proveedor "${vendorToDelete?.name || id}" del catálogo.`,
    });

    if (vendorToDelete) {
      const vName = (vendorToDelete.name || '').trim().toLowerCase();
      const vCuitRaw = (vendorToDelete.cuit || vendorToDelete.bankDetails?.cuitCuil || '').trim();
      const vCuitDigits = vCuitRaw.replace(/[^0-9]/g, '');
      const vCbu = (vendorToDelete.bankDetails?.cbuCvu || '').trim();
      const vAlias = (vendorToDelete.bankDetails?.alias || '').trim().toLowerCase();
      const vHolder = (vendorToDelete.bankDetails?.accountHolder || '').trim().toLowerCase();

      const otherVendorsWithSameCuit = vendors.filter(
        (v) => v.id !== id && cleanCuit(v.cuit || v.bankDetails?.cuitCuil) === vCuitDigits
      );
      const otherVendorNames = new Set(
        otherVendorsWithSameCuit.map((v) => (v.name || '').trim().toLowerCase()).filter(Boolean)
      );

      const updatedExpensesList: Expense[] = [];
      const updatedExpenses = expenses.map((e) => {
        // Un comprobante ya pagado conserva los datos con los que se pagó
        if (e.reimbursementStatus === 'REIMBURSED') return e;
        const expVendor = (e.vendor || '').trim().toLowerCase();
        if (otherVendorNames.has(expVendor)) {
          return e;
        }

        const expCuitRaw = (e.cuit || e.bankDetails?.cuitCuil || '').trim();
        const expCuitDigits = expCuitRaw.replace(/[^0-9]/g, '');
        const expCbu = (e.bankDetails?.cbuCvu || '').trim();
        const expAlias = (e.bankDetails?.alias || '').trim().toLowerCase();
        const expHolder = (e.bankDetails?.accountHolder || '').trim().toLowerCase();

        const isDirectNameMatch = Boolean(
          (vName && expVendor === vName) ||
          (vName && expHolder && expHolder === vName)
        );
        const isDirectBankMatch = Boolean(
          (vCbu && expCbu && vCbu === expCbu) ||
          (vAlias && expAlias && vAlias === expAlias) ||
          (vHolder && expHolder && vHolder === expHolder)
        );
        const isCuitOnlyMatch = Boolean(
          otherVendorNames.size === 0 &&
          vCuitDigits && expCuitDigits && vCuitDigits === expCuitDigits
        );

        const isMatch = isDirectNameMatch || isDirectBankMatch || isCuitOnlyMatch;

        if (isMatch && e.bankDetails) {
          const updated: Expense = {
            ...e,
            // Keep invoice vendor name intact, but orphan the bank account details
            bankDetails: undefined,
            updatedAt: new Date().toISOString(),
          };
          updatedExpensesList.push(updated);
          return updated;
        }
        return e;
      });

      if (updatedExpensesList.length > 0) {
        setExpenses(updatedExpenses);
        // bankDetails: undefined se borra de verdad del documento (con set+merge quedaba)
        const cascade = await patchCentralExpenses(
          updatedExpensesList.map((e) => ({ id: e.id, changes: { bankDetails: undefined, updatedAt: e.updatedAt } }))
        );
        if (!cascade.ok) {
          console.warn('Error updating expenses on vendor delete:', cascade.failedIds);
        }
      }

      showToast(
        updatedExpensesList.length > 0
          ? `🗑️ Proveedor "${vendorToDelete.name}" eliminado y desvinculado de los datos de cuenta de ${updatedExpensesList.length} comprobante(s).`
          : `🗑️ Proveedor "${vendorToDelete.name}" eliminado del catálogo.`
      );
    }
  };

  const handleViewVendorExpenses = (vendorName: string) => {
    setInitialFilterVendor(vendorName);
    setActiveTab('admin_movements');
  };

  // --- EXPENSE ACTIONS ---
  const handleUploadExpenseToDrive = async (expenseArg: Expense) => {
    // Después de recargar, el archivo no está en memoria: se busca en la caché local del navegador
    let expenseToUpload = expenseArg;
    if (!expenseToUpload.receiptImage) {
      const cached = await getCachedReceiptFile(expenseToUpload.id).catch(() => null);
      if (cached) expenseToUpload = { ...expenseToUpload, receiptImage: cached };
    }
    if (!expenseToUpload.receiptImage) {
      showToast(
        '⚠️ El archivo de este comprobante no está en este navegador. Usá "Reemplazar" en el visor para volver a adjuntarlo.'
      );
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
          prev.map((e) => (e.id === expenseToUpload.id ? { ...e, ...pickExpenseFields(updatedObj, DRIVE_RECEIPT_FIELDS) } : e))
        );
        // Solo los datos de Drive: no se pisa lo que otra persona haya cambiado en el comprobante
        await patchCentralExpenses([{ id: expenseToUpload.id, changes: pickExpenseFields(updatedObj, DRIVE_RECEIPT_FIELDS) }]);
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
        patchCentralExpenses([{ id: expenseToUpload.id, changes: { driveUploadStatus: 'ERROR' } }]).catch(() => {});
        showToast(`⚠️ No se pudo subir a Drive: ${res.error || 'Verifica la conexión'}`);
      }
    } catch (e: any) {
      patchCentralExpenses([{ id: expenseToUpload.id, changes: { driveUploadStatus: 'ERROR' } }]).catch(() => {});
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

  // Si el comprobante se borró mientras su archivo subía a Drive, no se reescribe (lo resucitaría)
  // y se elimina el archivo que quedó huérfano en Drive.
  const discardUploadIfExpenseDeleted = (
    expenseId: string,
    res: { success: boolean; fileId?: string; fileName?: string }
  ): boolean => {
    if (!isExpenseDeletedInSession(expenseId)) return false;
    if (res.success && (res.fileId || res.fileName)) {
      deleteReceiptFromGoogleDrive({ fileId: res.fileId, fileName: res.fileName }).catch(() => {});
    }
    return true;
  };

  // Si el comprobante no llegó a guardarse, el archivo que se subió a Drive no queda huérfano
  const discardUploadIfExpenseNotSaved = async (
    expenseId: string,
    savePromise: Promise<{ failedIds: string[] }>,
    res: { success: boolean; fileId?: string }
  ): Promise<boolean> => {
    const { failedIds } = await savePromise;
    if (!failedIds.includes(expenseId)) return false;
    if (res.success && res.fileId) deleteReceiptFromGoogleDrive({ fileId: res.fileId }).catch(() => {});
    return true;
  };

  const SLOW_SAVE_MESSAGE = '⏳ Guardando... Si no hay conexión, se sincroniza apenas vuelva.';

  const handleSaveNewExpense = (newExpense: Expense) => {
    // If expense has a receipt, initialize driveUploadStatus to PENDING
    const initialExpense: Expense = {
      ...newExpense,
      submittedByEmail: newExpense.submittedByEmail || currentUser?.email || undefined,
      submittedByName: newExpense.submittedByName || currentUser?.name || currentUser?.email?.split('@')[0] || undefined,
      submittedByPicture: newExpense.submittedByPicture || currentUser?.picture || undefined,
      driveUploadStatus: newExpense.receiptImage ? 'PENDING' : newExpense.driveUploadStatus,
    };

    setExpenses((prev) => [initialExpense, ...prev.filter((e) => e.id !== initialExpense.id)]);
    // El correo de confirmación y el registro de auditoría salen recién con el guardado confirmado
    const savePromise = upsertCentralExpensesDetailed([initialExpense]);
    const slowNotice = window.setTimeout(() => showToast(SLOW_SAVE_MESSAGE), 8000);

    // Auto upload to Google Drive ONLY on creation if receipt is attached
    if (newExpense.receiptImage) {
      const matchingCc = costCenters.find(
        (c) => c.name.toLowerCase() === (newExpense.project || '').toLowerCase()
      );
      uploadReceiptToGoogleDrive({
        expense: newExpense,
        costCenter: matchingCc,
      })
        .then(async (res) => {
          if (discardUploadIfExpenseDeleted(newExpense.id, res)) return;
          if (await discardUploadIfExpenseNotSaved(newExpense.id, savePromise, res)) return;
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
            patchCentralExpenses([{ id: newExpense.id, changes: updatedDriveFields }]);
          } else {
            const errorFields = { driveUploadStatus: 'ERROR' as const };
            setExpenses((prev) =>
              prev.map((e) =>
                e.id === newExpense.id
                  ? { ...e, ...errorFields }
                  : e
              )
            );
            patchCentralExpenses([{ id: newExpense.id, changes: errorFields }]);
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
          // También en la base: si no, el comprobante quedaba "Subiendo..." para siempre
          patchCentralExpenses([{ id: newExpense.id, changes: { driveUploadStatus: 'ERROR' } }]).catch(() => {});
        });
    }

    savePromise.then(({ failedIds }) => {
    window.clearTimeout(slowNotice);
    if (failedIds.includes(initialExpense.id)) {
      setExpenses((prev) => prev.filter((e) => e.id !== initialExpense.id));
      showToast(`⚠️ No se pudo guardar el comprobante de "${newExpense.vendor}" (${SAVE_ERROR_HINT}). Volvé a cargarlo.`);
      return;
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

    // Audit log: registrar carga de gasto individual
    logAuditEvent({
      userEmail: currentUser?.email || initialExpense.submittedByEmail,
      userName: currentUser?.name || initialExpense.submittedByName,
      action: 'EXPENSE_CREATE',
      actionLabel: 'Carga de Comprobante',
      entityType: 'expense',
      entityId: initialExpense.id,
      entityName: `${initialExpense.vendor || 'Proveedor'} (${formatCurrency(initialExpense.amount, initialExpense.currency)})`,
      summary: `Se cargó el comprobante de "${initialExpense.vendor || 'Proveedor'}" por ${formatCurrency(initialExpense.amount, initialExpense.currency)} (Proyecto: ${initialExpense.project || 'Sin asignar'}, Categoría: ${initialExpense.category || 'Sin asignar'}, Factura: ${initialExpense.invoiceNumber || 'S/N'}, Medio: ${initialExpense.paymentMethod || 'No especificado'}).`,
      changes: [
        { field: 'vendor', fieldLabel: 'Proveedor', oldValue: '(Nuevo)', newValue: initialExpense.vendor || 'Sin especificar' },
        { field: 'amount', fieldLabel: 'Monto', oldValue: '0', newValue: formatCurrency(initialExpense.amount, initialExpense.currency) },
        { field: 'project', fieldLabel: 'Centro de Costos', oldValue: '(Sin asignar)', newValue: initialExpense.project || 'Sin asignar' },
        { field: 'category', fieldLabel: 'Categoría', oldValue: '(Sin asignar)', newValue: initialExpense.category || 'Sin asignar' },
        { field: 'date', fieldLabel: 'Fecha del Comprobante', oldValue: '-', newValue: initialExpense.date || '-' },
        ...(initialExpense.invoiceNumber ? [{ field: 'invoiceNumber', fieldLabel: 'N° Factura / Comprobante', oldValue: '-', newValue: initialExpense.invoiceNumber }] : []),
        ...(initialExpense.cuit ? [{ field: 'cuit', fieldLabel: 'CUIT Emisor', oldValue: '-', newValue: initialExpense.cuit }] : []),
        ...(initialExpense.paymentMethod ? [{ field: 'paymentMethod', fieldLabel: 'Medio de Pago', oldValue: '-', newValue: initialExpense.paymentMethod }] : []),
        ...(initialExpense.paymentType ? [{ field: 'paymentType', fieldLabel: 'Tipo de Pago', oldValue: '-', newValue: initialExpense.paymentType }] : []),
        ...(initialExpense.notes ? [{ field: 'notes', fieldLabel: 'Notas / Observaciones', oldValue: '-', newValue: initialExpense.notes }] : []),
        { field: 'hasReceipt', fieldLabel: 'Archivo Adjunto', oldValue: 'No', newValue: initialExpense.receiptImage ? (initialExpense.receiptFileName || 'Comprobante adjunto') : 'Sin archivo' },
      ],
      metadata: {
        amount: initialExpense.amount,
        currency: initialExpense.currency,
        vendor: initialExpense.vendor,
        project: initialExpense.project,
        category: initialExpense.category,
        invoiceNumber: initialExpense.invoiceNumber,
        hasReceipt: Boolean(initialExpense.receiptImage),
        submittedBy: initialExpense.submittedByEmail || currentUser?.email,
      },
    }).catch((e) => console.warn('Audit log error on expense create:', e));
    });
  };

  const handleSaveBatchExpenses = (newExpenses: Expense[]) => {
    if (!newExpenses || newExpenses.length === 0) return;

    const initializedExpenses = newExpenses.map((exp) => ({
      ...exp,
      driveUploadStatus: exp.receiptImage ? ('PENDING' as const) : exp.driveUploadStatus,
    }));

    setExpenses((prev) => [...initializedExpenses, ...prev]);
    const savePromise = upsertCentralExpensesDetailed(initializedExpenses);
    const slowNotice = window.setTimeout(() => showToast(SLOW_SAVE_MESSAGE), 8000);

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
          .then(async (res) => {
            if (discardUploadIfExpenseDeleted(exp.id, res)) return;
            if (await discardUploadIfExpenseNotSaved(exp.id, savePromise, res)) return;
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
              patchCentralExpenses([{ id: exp.id, changes: updatedDriveFields }]);
            } else {
              const errorFields = { driveUploadStatus: 'ERROR' as const };
              setExpenses((prev) =>
                prev.map((e) =>
                  e.id === exp.id
                    ? { ...e, ...errorFields }
                    : e
                )
              );
              patchCentralExpenses([{ id: exp.id, changes: errorFields }]);
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
            patchCentralExpenses([{ id: exp.id, changes: { driveUploadStatus: 'ERROR' } }]).catch(() => {});
          });
      }
    });

    savePromise.then(({ failedIds }) => {
    window.clearTimeout(slowNotice);
    const failedSet = new Set(failedIds);
    if (failedSet.size > 0) {
      setExpenses((prev) => prev.filter((e) => !failedSet.has(e.id)));
    }
    const savedExpenses = initializedExpenses.filter((e) => !failedSet.has(e.id));
    if (savedExpenses.length === 0) {
      showToast(`⚠️ No se pudo guardar ningún comprobante (${SAVE_ERROR_HINT}). Volvé a cargarlos.`);
      return;
    }

    // Send single consolidated summary email for all batch uploaded receipts
    const batchTargetRecipient = (savedExpenses[0]?.submittedByEmail || currentUser?.email || '').trim();
    if (batchTargetRecipient) {
      sendReceiptUploadConfirmationEmail({
        expenses: savedExpenses,
        currentUser: currentUser || {
          name: savedExpenses[0]?.submittedByName || batchTargetRecipient.split('@')[0],
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
            showToast(`📧 Resumen con los ${savedExpenses.length} comprobantes enviado a ${batchTargetRecipient}.`);
          } else {
            console.warn('Batch receipt upload email notice:', res.error || res.message);
          }
        })
        .catch((err) => {
          console.warn('Could not send batch upload confirmation email:', err);
        });
    }

    // Audit log: registrar cada comprobante subido en el lote
    savedExpenses.forEach((exp) => {
      logAuditEvent({
        userEmail: currentUser?.email || exp.submittedByEmail,
        userName: currentUser?.name || exp.submittedByName,
        action: 'EXPENSE_CREATE',
        actionLabel: 'Carga de Comprobante (Lote)',
        entityType: 'expense',
        entityId: exp.id,
        entityName: `${exp.vendor || 'Proveedor'} (${formatCurrency(exp.amount, exp.currency)})`,
        summary: `Se cargó el comprobante de "${exp.vendor || 'Proveedor'}" por ${formatCurrency(exp.amount, exp.currency)} (Proyecto: ${exp.project || 'Sin asignar'}, Categoría: ${exp.category || 'Sin asignar'}, Factura: ${exp.invoiceNumber || 'S/N'}, Medio: ${exp.paymentMethod || 'No especificado'}).`,
        changes: [
          { field: 'vendor', fieldLabel: 'Proveedor', oldValue: '(Nuevo)', newValue: exp.vendor || 'Sin especificar' },
          { field: 'amount', fieldLabel: 'Monto', oldValue: '0', newValue: formatCurrency(exp.amount, exp.currency) },
          { field: 'project', fieldLabel: 'Centro de Costos', oldValue: '(Sin asignar)', newValue: exp.project || 'Sin asignar' },
          { field: 'category', fieldLabel: 'Categoría', oldValue: '(Sin asignar)', newValue: exp.category || 'Sin asignar' },
          { field: 'date', fieldLabel: 'Fecha del Comprobante', oldValue: '-', newValue: exp.date || '-' },
          ...(exp.invoiceNumber ? [{ field: 'invoiceNumber', fieldLabel: 'N° Factura / Comprobante', oldValue: '-', newValue: exp.invoiceNumber }] : []),
          ...(exp.cuit ? [{ field: 'cuit', fieldLabel: 'CUIT Emisor', oldValue: '-', newValue: exp.cuit }] : []),
          ...(exp.paymentMethod ? [{ field: 'paymentMethod', fieldLabel: 'Medio de Pago', oldValue: '-', newValue: exp.paymentMethod }] : []),
          ...(exp.paymentType ? [{ field: 'paymentType', fieldLabel: 'Tipo de Pago', oldValue: '-', newValue: exp.paymentType }] : []),
          ...(exp.notes ? [{ field: 'notes', fieldLabel: 'Notas / Observaciones', oldValue: '-', newValue: exp.notes }] : []),
          { field: 'hasReceipt', fieldLabel: 'Archivo Adjunto', oldValue: 'No', newValue: exp.receiptImage ? (exp.receiptFileName || 'Comprobante adjunto') : 'Sin archivo' },
        ],
        metadata: {
          amount: exp.amount,
          currency: exp.currency,
          vendor: exp.vendor,
          project: exp.project,
          category: exp.category,
          invoiceNumber: exp.invoiceNumber,
          hasReceipt: Boolean(exp.receiptImage),
          submittedBy: exp.submittedByEmail || currentUser?.email,
          batchUpload: true,
        },
      }).catch((e) => console.warn('Audit log error on batch expense item create:', e));
    });

    if (savedExpenses.length > 1) {
      const totalAmount = savedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      logAuditEvent({
        userEmail: currentUser?.email || savedExpenses[0]?.submittedByEmail,
        userName: currentUser?.name || savedExpenses[0]?.submittedByName,
        action: 'BATCH_CREATE',
        actionLabel: 'Carga en Lote de Comprobantes',
        entityType: 'expense',
        entityId: `batch-${Date.now()}`,
        entityName: `${savedExpenses.length} comprobantes`,
        summary: `Se cargaron ${savedExpenses.length} comprobantes en lote por un monto total de ${formatCurrency(totalAmount)}.`,
        metadata: {
          count: savedExpenses.length,
          totalAmount,
        },
      }).catch((e) => console.warn('Audit log error on batch summary create:', e));
    }

    showToast(
      failedSet.size > 0
        ? `⚠️ Se guardaron ${savedExpenses.length} comprobante(s); ${failedSet.size} no se pudieron guardar (${SAVE_ERROR_HINT}).`
        : `✅ ${savedExpenses.length} comprobantes guardados exitosamente.`
    );
    });
  };

  const handleUpdateExpense = async (updatedExpense: Expense) => {
    const current = expenses.find((e) => e.id === updatedExpense.id);
    // Base: el comprobante tal como estaba al abrir el editor. Solo se guardan los campos que la
    // persona cambió; si mientras tanto otro Admin lo pagó, ese pago no se pisa.
    const prevExpense = editingExpense && editingExpense.id === updatedExpense.id ? editingExpense : current;
    const timestamped: Expense = {
      ...updatedExpense,
      updatedAt: new Date().toISOString(),
    };
    const changes = diffExpenseFields(prevExpense, timestamped);
    const merged: Expense = { ...(current || timestamped), ...changes, updatedAt: timestamped.updatedAt };
    setExpenses((prev) => prev.map((e) => (e.id === timestamped.id ? merged : e)));
    if (viewingReceiptExpense && viewingReceiptExpense.id === timestamped.id) {
      setViewingReceiptExpense(merged);
    }
    if (!(await saveExpenseChanges(prevExpense, timestamped))) {
      if (current) setExpenses((prev) => prev.map((e) => (e.id === current.id ? current : e)));
      // El modal muestra el error y queda abierto con los datos cargados
      throw new Error(`No se pudieron guardar los cambios (${SAVE_ERROR_HINT}).`);
    }
    try {

      const diffs = computeObjectDiff(prevExpense, timestamped, {
        vendor: 'Proveedor',
        amount: 'Monto',
        currency: 'Moneda',
        project: 'Centro de Costos',
        category: 'Categoría',
        date: 'Fecha del Comprobante',
        invoiceNumber: 'N° Factura / Comprobante',
        reimbursementStatus: 'Estado de Reintegro',
        reimbursable: 'Aplica Reintegro',
        paymentMethod: 'Medio de Pago',
        paymentType: 'Tipo de Pago',
        notes: 'Notas / Observaciones',
        accountingNotes: 'Notas Contables',
        cuit: 'CUIT Emisor',
        recipientName: 'Nombre Receptor',
        recipientCuit: 'CUIT Receptor',
      });

      await logAuditEvent({
        userEmail: currentUser?.email,
        userName: currentUser?.name,
        action: 'EXPENSE_UPDATE',
        actionLabel: 'Edición de Comprobante',
        entityType: 'expense',
        entityId: timestamped.id,
        entityName: `${timestamped.vendor || 'Comprobante'} (${formatCurrency(timestamped.amount, timestamped.currency)})`,
        summary: `Se actualizaron los datos del comprobante de "${timestamped.vendor || 'Comprobante'}".`,
        changes: diffs.length > 0 ? diffs : undefined,
      });

      showToast('✅ Comprobante actualizado correctamente.');
    } catch (err) {
      console.error('Error saving updated expense:', err);
    }
  };

  const handleWithholdingCertificateSaved = async (
    updatedExpense: Expense,
    info?: { emailPending: boolean }
  ): Promise<boolean> => {
    const timestamped: Expense = {
      ...updatedExpense,
      updatedAt: new Date().toISOString(),
    };
    const base = withholdingModalExpense && withholdingModalExpense.id === timestamped.id
      ? withholdingModalExpense
      : expenses.find((e) => e.id === timestamped.id);
    const original = expenses.find((e) => e.id === timestamped.id);
    const changes = diffExpenseFields(base, timestamped);
    setExpenses((prev) =>
      prev.map((e) => (e.id === timestamped.id ? { ...e, ...changes, withholdingCertificateImage: timestamped.withholdingCertificateImage } : e))
    );
    if (viewingReceiptExpense && viewingReceiptExpense.id === timestamped.id) {
      setViewingReceiptExpense(timestamped);
    }
    if (!(await saveExpenseChanges(base, timestamped))) {
      if (original) setExpenses((prev) => prev.map((e) => (e.id === original.id ? original : e)));
      showToast(`⚠️ No se pudo guardar el certificado de "${timestamped.vendor}" (${SAVE_ERROR_HINT}).`);
      return false;
    }
    try {

      await logAuditEvent({
        userEmail: currentUser?.email,
        userName: currentUser?.name,
        action: 'WITHHOLDING_CERT',
        actionLabel: 'Certificado de Retención',
        entityType: 'expense',
        entityId: timestamped.id,
        entityName: `${timestamped.vendor || 'Comprobante'} (${formatCurrency(timestamped.amount, timestamped.currency)})`,
        summary: `Se adjuntó certificado de retención para el comprobante de "${timestamped.vendor}".`,
      });

      // Si además se envía por correo, el aviso final lo da handleWithholdingEmailResult
      if (!info?.emailPending) showToast(`📄 Certificado de retención guardado para ${timestamped.vendor}.`);
    } catch (err) {
      console.warn('Audit log error on withholding cert:', err);
    }
    return true;
  };

  // Un comprobante ya pagado es evidencia contable: solo Administración puede reemplazar su archivo
  const handleRequestReplaceReceipt = (exp: Expense) => {
    if (exp.reimbursementStatus === 'REIMBURSED' && permissionRole !== 'admin') {
      showToast('🔒 Este comprobante ya fue pagado: solo Administración puede reemplazar su archivo.');
      return;
    }
    setExpenseToReplaceReceipt(exp);
  };

  // Resultado del correo del certificado (se envía después de guardarlo)
  const handleWithholdingEmailResult = async (
    expenseId: string,
    result: { sent: boolean; error?: string; sentAt: string }
  ) => {
    const vendor = expenses.find((e) => e.id === expenseId)?.vendor || 'el comprobante';
    if (!result.sent) {
      showToast(`⚠️ Certificado guardado para ${vendor}, pero no se pudo enviar el correo${result.error ? `: ${result.error}` : '.'}`);
      return;
    }
    setExpenses((prev) => prev.map((e) => (e.id === expenseId ? { ...e, withholdingCertificateSentAt: result.sentAt } : e)));
    await patchCentralExpenses([{ id: expenseId, changes: { withholdingCertificateSentAt: result.sentAt } }]);
    showToast(`📄 Certificado de retención guardado y enviado por correo (${vendor}).`);
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

    // Guardar en Firestore central (sin IA / sin OCR): solo los campos del archivo
    patchCentralExpenses([
      {
        id: targetExpense.id,
        changes: {
          receiptImage: newFileBase64,
          receiptFileName: updatedExpense.receiptFileName,
          ...pickExpenseFields(updatedExpense, DRIVE_RECEIPT_FIELDS),
        },
      },
    ]).then((res) => {
      if (!res.ok) showToast(`⚠️ El archivo se subió a Drive, pero no se pudo registrar en el sistema (${SAVE_ERROR_HINT}).`);
    });

    // Registrar en auditoría el cambio de archivo
    logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'REPLACE_RECEIPT',
      actionLabel: 'Reemplazo de Foto de Comprobante',
      entityType: 'expense',
      entityId: targetExpense.id,
      entityName: `${targetExpense.vendor} (${formatCurrency(targetExpense.amount, targetExpense.currency)})`,
      summary: `Se reemplazó el archivo adjunto del comprobante de "${targetExpense.vendor}" por "${newFileName}".`,
      changes: [
        {
          field: 'receiptFileName',
          fieldLabel: 'Archivo Adjunto',
          oldValue: targetExpense.receiptFileName || '(Anterior)',
          newValue: newFileName,
        },
      ],
    }).catch((e) => console.warn('Audit log error on replace receipt:', e));

    // Si el visor de comprobante estaba abierto con este gasto, refrescarlo
    if (viewingReceiptExpense && viewingReceiptExpense.id === targetExpense.id) {
      setViewingReceiptExpense(updatedExpense);
    }

    showToast('✅ Foto reemplazada en Google Drive y plataforma sin alterar los datos contables.');
  };

  // El pago en lote sube una sola constancia a Drive y la vincula a todos sus comprobantes:
  // solo se borra el archivo si ningún otro comprobante (fuera de excludeIds) lo sigue usando.
  const isPaymentProofSharedWithOthers = async (item: Expense, excludeIds: string[]): Promise<boolean> => {
    const fileId = extractDriveFileId(item.paymentProofDriveUrl);
    if (!fileId || !item.paymentProofDriveUrl) return false;
    const usedLocally = expenses.some(
      (e) => !excludeIds.includes(e.id) && extractDriveFileId(e.paymentProofDriveUrl) === fileId
    );
    if (usedLocally) return true;
    return isPaymentProofUsedByOtherExpenses(item.paymentProofDriveUrl, excludeIds);
  };

  // Borra de Drive y de la caché local los archivos de un comprobante YA eliminado de la base.
  // Se ejecuta solo tras confirmar el borrado: si Firestore lo rechaza, los archivos se conservan.
  const cleanupDeletedExpenseFiles = async (item: Expense, deletedIds: string[] = [item.id]) => {
    removeCachedReceiptFile(item.id).catch(() => {});
    removeCachedPaymentProofFile(item.id).catch(() => {});
    removeCachedWithholdingCertificateFile(item.id).catch(() => {});

    const driveFileId = extractDriveFileId(item.driveUploadedUrl);
    if (driveFileId || item.driveUploadedFileName) {
      deleteReceiptFromGoogleDrive({
        fileId: driveFileId || undefined,
        fileName: item.driveUploadedFileName,
      }).catch(() => {});
    }
    const paymentProofId = extractDriveFileId(item.paymentProofDriveUrl);
    const paymentProofShared = await isPaymentProofSharedWithOthers(item, deletedIds);
    if (!paymentProofShared && (paymentProofId || item.paymentProofFileName)) {
      deleteReceiptFromGoogleDrive({
        fileId: paymentProofId || undefined,
        fileName: item.paymentProofFileName,
      }).catch(() => {});
    }
    const certId = extractDriveFileId(item.withholdingCertificateDriveUrl);
    if (certId || item.withholdingCertificateFileName) {
      deleteReceiptFromGoogleDrive({
        fileId: certId || undefined,
        fileName: item.withholdingCertificateFileName,
      }).catch(() => {});
    }
  };

  // Vuelve a mostrar comprobantes cuyo borrado fue rechazado (sin duplicarlos)
  const restoreExpensesInState = (items: Expense[]) => {
    if (items.length === 0) return;
    setExpenses((prev) => {
      const present = new Set(prev.map((e) => e.id));
      return [...items.filter((e) => !present.has(e.id)), ...prev];
    });
  };

  const handleDeleteExpense = async (id: string) => {
    if (!id) return;
    const toDelete = expenses.find((e) => e.id === id);

    // 1. Actualización optimista de la UI
    setExpenses((prev) => prev.filter((e) => e.id !== id));

    // 2. Borrado en Firestore (+ tombstone compartido) y espejo del servidor
    const { deletedIds } = await deleteCentralExpenses([id]);
    if (!deletedIds.includes(id)) {
      if (toDelete) restoreExpensesInState([toDelete]);
      showToast('⚠️ No se pudo eliminar el comprobante (sin permisos o sin conexión). No se hicieron cambios.');
      return;
    }

    // 3. Recién con el borrado confirmado: archivos de Drive y log de cambios
    if (toDelete) cleanupDeletedExpenseFiles(toDelete);

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'EXPENSE_DELETE',
      actionLabel: 'Eliminación de Comprobante',
      entityType: 'expense',
      entityId: id,
      entityName: toDelete ? `${toDelete.vendor} ($${toDelete.amount})` : id,
      summary: `Se eliminó el comprobante de "${toDelete?.vendor || id}" por ${toDelete ? formatCurrency(toDelete.amount, toDelete.currency) : ''}.`,
    });

    showToast('🗑️ Comprobante eliminado.');
  };

  const handleBatchDeleteExpenses = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const toDeleteItems = expenses.filter((e) => ids.includes(e.id));

    // 1. Actualización optimista de la UI
    setExpenses((prev) => prev.filter((e) => !ids.includes(e.id)));

    // 2. Borrado en Firestore (+ tombstones) y espejo del servidor
    const { deletedIds, failedIds } = await deleteCentralExpenses(ids);
    const deletedSet = new Set(deletedIds);
    restoreExpensesInState(toDeleteItems.filter((e) => !deletedSet.has(e.id)));

    if (deletedIds.length === 0) {
      showToast('⚠️ No se pudo eliminar ningún comprobante (sin permisos o sin conexión). No se hicieron cambios.');
      return;
    }

    // 3. Solo lo confirmado: archivos de Drive y log de cambios
    toDeleteItems
      .filter((e) => deletedSet.has(e.id))
      .forEach((e) => cleanupDeletedExpenseFiles(e, deletedIds));

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'EXPENSE_DELETE',
      actionLabel: 'Eliminación en Lote de Comprobantes',
      entityType: 'expense',
      entityId: 'batch-delete',
      entityName: `${deletedIds.length} comprobantes`,
      summary: `Se eliminaron ${deletedIds.length} comprobantes en lote.${failedIds.length > 0 ? ` ${failedIds.length} no pudieron eliminarse.` : ''}`,
      metadata: { deletedIds, failedIds },
    });

    showToast(
      failedIds.length > 0
        ? `⚠️ Se eliminaron ${deletedIds.length} comprobante(s); ${failedIds.length} no se pudieron eliminar (sin permisos o sin conexión).`
        : `🗑️ ${deletedIds.length} comprobante(s) eliminados.`
    );
  };

  const handleToggleReimbursementStatus = async (id: string) => {
    const exp = expenses.find((e) => e.id === id);
    if (!exp) return;

    if (exp.reimbursementStatus === 'PENDING') {
      // Open PaymentProcessModal so the admin can upload the payment receipt, preview email, and confirm
      await openPaymentIfStillPending(exp);
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
        paymentProofAt: undefined,
        withholdingCertificateImage: undefined,
        withholdingCertificateFileName: undefined,
        withholdingCertificateUploadedAt: undefined,
        withholdingCertificateDriveUrl: undefined,
        withholdingCertificateSentAt: undefined,
        updatedAt: new Date().toISOString(),
      };
      setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));

      // 0. Guardar primero: si la base rechaza la reversión, no se avisa a nadie ni se toca Drive
      const reverted = await patchCentralExpenses([{ id, changes: pickExpenseFields(updated, PAYMENT_REVERT_FIELDS) }]);
      if (!reverted.ok) {
        setExpenses((prev) => prev.map((e) => (e.id === id ? exp : e)));
        showToast(`⚠️ No se pudo revertir el pago de "${exp.vendor}" (${SAVE_ERROR_HINT}). No se hicieron cambios.`);
        return;
      }

      // 1. Enviar email avisando que se revirtió el pago
      let reversalEmailOk = false;
      try {
        const emailRes = await sendPaymentReversalEmail({
          expense: exp,
          costCenters,
          appUsers,
          currentUser,
        });
        reversalEmailOk = Boolean(emailRes?.success);
      } catch (emailErr) {
        console.warn('Notice sending payment reversal email:', emailErr);
      }

      // 2. Eliminar el archivo del comprobante de pago subido a Google Drive (en caso de que se hubiera subido)
      const standardizedBaseName = generateDriveFileName(exp, costCenters);
      const paymentProofFileId = extractDriveFileId(exp.paymentProofDriveUrl) || undefined;
      const paymentProofNames: string[] = [];
      if (exp.paymentProofFileName) {
        paymentProofNames.push(exp.paymentProofFileName);
        if (!exp.paymentProofFileName.startsWith(standardizedBaseName)) {
          paymentProofNames.push(`${standardizedBaseName}-ComprobantePago-${exp.paymentProofFileName}`);
        }
      }

      // Si la constancia es compartida (pago en lote), queda en Drive para los demás comprobantes
      const paymentProofShared = await isPaymentProofSharedWithOthers(exp, [id]);
      if (!paymentProofShared && (paymentProofFileId || paymentProofNames.length > 0)) {
        try {
          await deleteReceiptFromGoogleDrive({
            fileId: paymentProofFileId,
            fileNames: paymentProofNames,
            fileName: paymentProofNames[0],
          });
        } catch (driveErr) {
          console.warn('Error deleting payment proof from Google Drive:', driveErr);
        }
      }
      removeCachedPaymentProofFile(id).catch(() => {});

      // 3. Eliminar el certificado de retención subido a Google Drive (en caso de que se hubiera subido)
      const withholdingCertFileId = extractDriveFileId(exp.withholdingCertificateDriveUrl) || undefined;
      const withholdingCertNames: string[] = [];
      if (exp.withholdingCertificateFileName) {
        withholdingCertNames.push(exp.withholdingCertificateFileName);
        if (!exp.withholdingCertificateFileName.startsWith(standardizedBaseName)) {
          withholdingCertNames.push(`${standardizedBaseName}-CertificadoRetencion-${exp.withholdingCertificateFileName}`);
        }
      }

      if (withholdingCertFileId || withholdingCertNames.length > 0) {
        try {
          await deleteReceiptFromGoogleDrive({
            fileId: withholdingCertFileId,
            fileNames: withholdingCertNames,
            fileName: withholdingCertNames[0],
          });
        } catch (driveErr) {
          console.warn('Error deleting withholding certificate from Google Drive:', driveErr);
        }
      }
      removeCachedWithholdingCertificateFile(id).catch(() => {});

      try {
        await logAuditEvent({
          userEmail: currentUser?.email,
          userName: currentUser?.name,
          action: 'EXPENSE_STATUS_CHANGE',
          actionLabel: 'Reversión de Pago',
          entityType: 'expense',
          entityId: id,
          entityName: `${exp.vendor} ($${exp.amount})`,
          summary: `Se revirtió el pago de "${exp.vendor}" a Pendiente.${
            reversalEmailOk ? ' Se envió email de aviso.' : ' No se pudo enviar el email de aviso.'
          } Los comprobantes de transferencia y retención se enviaron a la papelera de Google Drive.`,
        });
        showToast(
          reversalEmailOk
            ? `ℹ️ Pago de "${exp.vendor}" revertido a Pendiente. Notificación enviada y comprobantes de Drive a la papelera.`
            : `⚠️ Pago de "${exp.vendor}" revertido a Pendiente, pero no se pudo enviar el correo de aviso.`
        );
      } catch (err) {
        console.error('Error updating status in cloud:', err);
      }
    }
  };

  // Registra un pago en lote: escribe solo los campos del pago (no pisa otros cambios) y
  // devuelve los IDs que quedaron guardados. Los correos se mandan recién después.
  const handleBatchPaymentSave = async (updatedExpenses: Expense[]): Promise<string[]> => {
    const originals = new Map(expenses.map((e) => [e.id, e]));
    const updatedMap = new Map(updatedExpenses.map((e) => [e.id, e]));
    setExpenses((prev) => prev.map((e) => (updatedMap.has(e.id) ? { ...e, ...pickExpenseFields(updatedMap.get(e.id)!, BATCH_PAYMENT_FIELDS) } : e)));

    // Transacción: solo se registran los que siguen sin pagar (evita pagos dobles entre Admins)
    const res = await patchExpensesIfNotPaid(
      updatedExpenses.map((e) => ({ id: e.id, changes: pickExpenseFields(e, BATCH_PAYMENT_FIELDS) }))
    );
    lastBatchAlreadyPaidRef.current = res.alreadyPaidIds.length;
    const notSaved = new Set([...res.failedIds, ...res.alreadyPaidIds]);
    if (notSaved.size > 0) {
      setExpenses((prev) => prev.map((e) => (notSaved.has(e.id) && originals.has(e.id) ? originals.get(e.id)! : e)));
      // Los que ya estaban pagados se refrescan con la versión del servidor
      for (const id of res.alreadyPaidIds) {
        fetchExpenseFromServer(id).then((fresh) => {
          if (fresh) setExpenses((prev) => prev.map((e) => (e.id === fresh.id ? { ...e, ...fresh } : e)));
        });
      }
    }
    return res.okIds;
  };

  const handleBatchPaymentCompleted = async (
    savedExpenses: Expense[],
    emailsSentCount: number,
    info?: { failedCount: number; emailsExpected: number }
  ) => {
    const alreadyPaid = lastBatchAlreadyPaidRef.current;
    lastBatchAlreadyPaidRef.current = 0;
    const failedCount = Math.max(0, (info?.failedCount || 0) - alreadyPaid);
    const emailsFailed = Math.max(0, (info?.emailsExpected || 0) - emailsSentCount);

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'EXPENSE_STATUS_CHANGE',
      actionLabel: 'Liquidación y Pago en Lote',
      entityType: 'expense',
      entityId: `batch-${Date.now()}`,
      entityName: `${savedExpenses.length} comprobantes`,
      summary: `Se liquidaron y pagaron ${savedExpenses.length} comprobantes en lote.${
        emailsSentCount > 0 ? ` Se enviaron ${emailsSentCount} avisos por correo.` : ''
      }${emailsFailed > 0 ? ` ${emailsFailed} correo(s) no se pudieron enviar.` : ''}${
        failedCount > 0 ? ` ${failedCount} comprobante(s) no se pudieron registrar.` : ''
      }`,
    }).catch((err) => console.warn('Audit log error on batch payment:', err));

    if (failedCount > 0 || emailsFailed > 0 || alreadyPaid > 0) {
      showToast(
        `⚠️ Se liquidaron ${savedExpenses.length} comprobante(s).${
          alreadyPaid > 0 ? ` ${alreadyPaid} ya habían sido pagados por otra persona (no se repitieron).` : ''
        }${failedCount > 0 ? ` ${failedCount} no se pudieron registrar (${SAVE_ERROR_HINT}).` : ''}${
          emailsFailed > 0 ? ` ${emailsFailed} correo(s) no se pudieron enviar.` : ''
        }`
      );
    } else if (emailsSentCount > 0) {
      showToast(`🎉 Se liquidaron ${savedExpenses.length} comprobantes y se enviaron ${emailsSentCount} avisos por email.`);
    } else {
      showToast(`✅ Se marcaron ${savedExpenses.length} comprobantes como Reintegrados / Liquidados.`);
    }
  };

  const handleBatchSettleReimbursements = async (ids: string[]) => {
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.slice(0, 10);
    const targetExpenses = expenses.filter((e) => ids.includes(e.id));
    if (targetExpenses.length === 0) return;

    const updatedExpenses: Expense[] = targetExpenses.map((e) => {
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
    });

    // Guardar primero; solo se avisa por lo que quedó registrado
    const savedIds = new Set(await handleBatchPaymentSave(updatedExpenses));
    const savedExpenses = updatedExpenses.filter((e) => savedIds.has(e.id));
    if (savedExpenses.length === 0) {
      showToast(`⚠️ No se pudo registrar la liquidación (${SAVE_ERROR_HINT}). No se envió ningún correo.`);
      return;
    }

    // Group and send notification emails to submitters
    let emailsSentCount = 0;
    const groups = new Map<string, { name: string; items: Expense[] }>();
    for (const exp of savedExpenses) {
      const email = (exp.submittedByEmail || '').trim().toLowerCase();
      if (!email) continue; // sin email de quien lo cargó no hay a quién avisar
      const name = exp.submittedByName || exp.submittedByEmail?.split('@')[0] || 'Solicitante';
      if (!groups.has(email)) groups.set(email, { name, items: [] });
      groups.get(email)!.items.push(exp);
    }

    const token = getStoredWorkspaceToken();

    for (const [email, group] of groups.entries()) {
      try {
        const total = group.items.reduce((sum, item) => sum + (item.amount || 0), 0);
        const subject = group.items.length === 1
          ? formatPaymentEmailSubject(group.items[0].vendor, group.items[0].amount, group.items[0].currency)
          : `Reintegros Liquidados: ${group.items.length} comprobantes - Total ${formatCurrency(total)}`;

        const rows = group.items.map((it) => `<tr>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px;">${escapeHtml(it.date)}</td>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: bold;">${escapeHtml(it.vendor)}</td>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px;">${escapeHtml(it.project)}</td>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; text-align: right; font-weight: bold; color: #065f46;">${formatCurrency(it.amount, it.currency)}</td>
        </tr>`).join('');

        const bodyHtml = `<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
          <h2 style="color: #065f46; margin-top: 0;">Confirmación de Reintegro Liquidado</h2>
          <p>Hola <strong>${escapeHtml(group.name)}</strong>,</p>
          <p>Te confirmamos que se han transferido y liquidado con éxito <strong>${group.items.length} comprobante(s)</strong> por un total de <strong>${formatCurrency(total)}</strong>:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <thead><tr style="background: #f8fafc;"><th style="padding: 6px 10px; text-align: left; font-size: 11px;">Fecha</th><th style="padding: 6px 10px; text-align: left; font-size: 11px;">Proveedor</th><th style="padding: 6px 10px; text-align: left; font-size: 11px;">Proyecto</th><th style="padding: 6px 10px; text-align: right; font-size: 11px;">Importe</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr style="background: #ecfdf5;"><td colspan="3" style="padding: 8px 10px; font-weight: bold; color: #065f46;">Total</td><td style="padding: 8px 10px; font-weight: bold; text-align: right; color: #065f46;">${formatCurrency(total)}</td></tr></tfoot>
          </table>
          <p style="font-size: 12px; color: #64748b;">Área de Administración y Finanzas — ISF Argentina</p>
        </div>`;

        const cc = resolveEmailCcRecipients({ toEmail: email, expenses: group.items, costCenters, appUsers });
        const sendRes = await sendGmailMessage({
          to: email,
          cc: cc.length > 0 ? cc : undefined,
          subject,
          bodyHtml,
          accessToken: token || undefined,
          fromName: currentUser?.name || 'ISF Finanzas',
        });
        if (sendRes.success) emailsSentCount++;
      } catch (e) {
        console.warn('Error sending batch settle email to', email, e);
      }
    }

    await handleBatchPaymentCompleted(savedExpenses, emailsSentCount, {
      failedCount: updatedExpenses.length - savedExpenses.length,
      emailsExpected: groups.size,
    });
  };

  const handleAddNewCostCenter = async (newCc: Omit<CostCenter, 'id'>) => {
    const item = sanitizeCostCenter({
      ...newCc,
      id: `cc-${Date.now()}`,
    });
    setCostCenters((prev) => [...prev, item]);
    // Solo el centro nuevo (antes se reescribía la lista completa)
    if (!(await saveSingleCostCenter(item))) {
      setCostCenters((prev) => prev.filter((c) => c.id !== item.id));
      showToast(`⚠️ No se pudo crear el centro de costos "${item.name}" (${SAVE_ERROR_HINT}).`);
      return;
    }

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'COST_CENTER_CREATE',
      actionLabel: 'Creación de Centro de Costos',
      entityType: 'cost_center',
      entityId: item.id,
      entityName: item.name,
      summary: `Se creó el centro de costos "${item.name}" (${item.code}).`,
    });

    showToast(`✅ Centro de costos "${item.name}" (${item.code}) creado.`);
  };

  const handleUpdateCostCenter = async (updatedCc: CostCenter) => {
    const sanitized = sanitizeCostCenter(updatedCc);
    const oldItem = costCenters.find((c) => c.id === sanitized.id);
    const oldName = oldItem ? oldItem.name : sanitized.name;

    setCostCenters((prev) => prev.map((cc) => (cc.id === sanitized.id ? sanitized : cc)));
    if (!(await saveSingleCostCenter(sanitized))) {
      if (oldItem) setCostCenters((prev) => prev.map((cc) => (cc.id === oldItem.id ? oldItem : cc)));
      showToast(`⚠️ No se pudo actualizar el centro de costos "${sanitized.name}" (${SAVE_ERROR_HINT}).`);
      return;
    }

    const diffs = computeObjectDiff(oldItem, sanitized, {
      name: 'Nombre del Centro de Costos',
      code: 'Código / Abreviatura',
      driveFolder: 'Carpeta en Drive',
      driveUrl: 'Enlace a Drive',
      notificationEmails: 'Emails en Copia / Notificaciones',
      responsibleName: 'Responsable',
      description: 'Descripción',
    });

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'COST_CENTER_UPDATE',
      actionLabel: 'Edición de Centro de Costos',
      entityType: 'cost_center',
      entityId: sanitized.id,
      entityName: sanitized.name,
      summary: `Se actualizó el centro de costos "${sanitized.name}" (${sanitized.code}).`,
      changes: diffs.length > 0 ? diffs : undefined,
    });

    if (oldName !== sanitized.name) {
      setExpenses((prev) =>
        prev.map((e) => (e.project === oldName ? { ...e, project: sanitized.name } : e))
      );
      // Renombrar en TODOS los comprobantes de la base (antes solo cambiaba en pantalla y se revertía)
      try {
        const renamed = await renameExpenseFieldValue('project', oldName, sanitized.name);
        showToast(
          renamed.failed > 0
            ? `⚠️ Centro de costos actualizado; ${renamed.failed} comprobante(s) no se pudieron renombrar.`
            : `✅ Centro de costos "${sanitized.name}" (${sanitized.code}) actualizado en ${renamed.updated} comprobante(s).`
        );
      } catch (err) {
        console.error('Error renaming cost center in expenses:', err);
        showToast(`⚠️ Centro de costos actualizado, pero no se pudo renombrar en los comprobantes (${SAVE_ERROR_HINT}).`);
      }
      return;
    }
    showToast(`✅ Centro de costos "${sanitized.name}" (${sanitized.code}) actualizado.`);
  };

  const handleDeleteCostCenter = async (id: string) => {
    const toDelete = costCenters.find((c) => c.id === id);
    setCostCenters((prev) => prev.filter((cc) => cc.id !== id));
    // Borrado real del documento (antes se reescribía la lista sin él y el centro reaparecía)
    if (!(await deleteCentralCostCenter(id))) {
      if (toDelete) setCostCenters((prev) => [...prev.filter((c) => c.id !== id), toDelete]);
      showToast(`⚠️ No se pudo eliminar el centro de costos "${toDelete?.name || id}" (${SAVE_ERROR_HINT}).`);
      return;
    }

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'COST_CENTER_DELETE',
      actionLabel: 'Eliminación de Centro de Costos',
      entityType: 'cost_center',
      entityId: id,
      entityName: toDelete?.name || id,
      summary: `Se eliminó el centro de costos "${toDelete?.name || id}".`,
    });

    showToast(`🗑️ Centro de costos "${toDelete?.name || id}" eliminado.`);
  };

  const handleQuickAddCostCenterName = async (costCenterName: string) => {
    if (!costCenters.some((c) => c.name.toLowerCase() === costCenterName.toLowerCase())) {
      const acronym = costCenterName.slice(0, 4).toUpperCase();
      const item: CostCenter = {
        id: `cc-${Date.now()}`,
        name: costCenterName,
        code: acronym,
        driveFolder: `Carpeta ${costCenterName}`,
        driveUrl: `https://drive.google.com/drive/search?q=${encodeURIComponent(costCenterName)}`,
      };
      setCostCenters((prev) => [...prev, item]);
      if (!(await saveSingleCostCenter(item))) {
        setCostCenters((prev) => prev.filter((c) => c.id !== item.id));
        showToast(`⚠️ No se pudo crear el centro de costos "${costCenterName}" (${SAVE_ERROR_HINT}).`);
        return;
      }

      await logAuditEvent({
        userEmail: currentUser?.email,
        userName: currentUser?.name,
        action: 'COST_CENTER_CREATE',
        actionLabel: 'Creación Rápida de Centro de Costos',
        entityType: 'cost_center',
        entityId: item.id,
        entityName: item.name,
        summary: `Se creó automáticamente el centro de costos "${item.name}" (${item.code}).`,
      });

      showToast(`✅ Centro de costos "${costCenterName}" creado.`);
    }
  };

  const handleAddNewCategory = async (category: string) => {
    if (!availableCategories.includes(category)) {
      const previous = availableCategories;
      const updated = [...availableCategories, category];
      setAvailableCategories(updated);
      if (!(await saveCentralCategories(updated))) {
        setAvailableCategories(previous);
        showToast(`⚠️ No se pudo crear la categoría "${category}" (${SAVE_ERROR_HINT}).`);
        return;
      }

      await logAuditEvent({
        userEmail: currentUser?.email,
        userName: currentUser?.name,
        action: 'CATEGORY_CREATE',
        actionLabel: 'Creación de Categoría',
        entityType: 'category',
        entityId: category,
        entityName: category,
        summary: `Se creó la categoría de gasto "${category}".`,
      });

      showToast(`✅ Categoría "${category}" creada.`);
    }
  };

  const handleUpdateCategory = async (oldName: string, newName: string) => {
    const previous = availableCategories;
    const updated = availableCategories.map((c) => (c === oldName ? newName : c));
    setAvailableCategories(updated);
    if (!(await saveCentralCategories(updated))) {
      setAvailableCategories(previous);
      showToast(`⚠️ No se pudo renombrar la categoría "${oldName}" (${SAVE_ERROR_HINT}).`);
      return;
    }

    setExpenses((prev) =>
      prev.map((e) => (e.category === oldName ? { ...e, category: newName } : e))
    );
    // Renombrar en TODOS los comprobantes de la base, no solo en los cargados en pantalla
    let renamedInfo = '';
    try {
      const renamed = await renameExpenseFieldValue('category', oldName, newName);
      renamedInfo = renamed.failed > 0 ? ` (${renamed.failed} comprobante(s) no se pudieron actualizar)` : ` en ${renamed.updated} comprobante(s)`;
    } catch (err) {
      console.error('Error renaming category in expenses:', err);
      renamedInfo = ' (no se pudo actualizar en los comprobantes)';
    }

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'CATEGORY_UPDATE',
      actionLabel: 'Modificación de Categoría',
      entityType: 'category',
      entityId: newName,
      entityName: newName,
      summary: `Se renombró la categoría "${oldName}" a "${newName}".`,
      changes: [
        {
          field: 'name',
          label: 'Nombre de Categoría',
          oldValue: oldName,
          newValue: newName,
        },
      ],
    });

    showToast(`✅ Categoría "${oldName}" modificada a "${newName}"${renamedInfo}.`);
  };

  const handleDeleteCategory = async (category: string) => {
    const previous = availableCategories;
    const updated = availableCategories.filter((c) => c !== category);
    setAvailableCategories(updated);
    if (!(await saveCentralCategories(updated))) {
      setAvailableCategories(previous);
      showToast(`⚠️ No se pudo eliminar la categoría "${category}" (${SAVE_ERROR_HINT}).`);
      return;
    }

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'CATEGORY_DELETE',
      actionLabel: 'Eliminación de Categoría',
      entityType: 'category',
      entityId: category,
      entityName: category,
      summary: `Se eliminó la categoría de gasto "${category}".`,
    });

    showToast(`🗑️ Categoría "${category}" eliminada.`);
  };

  // --- USER / ROLE MANAGEMENT ACTIONS ---
  const handleAddAppUser = async (newUser: AppUserRecord) => {
    const previousUsers = appUsers;
    const updatedUsers = [newUser, ...appUsers.filter((u) => u.email.toLowerCase() !== newUser.email.toLowerCase())];
    setAppUsers(updatedUsers);
    if (!(await saveCentralUser(newUser))) {
      setAppUsers(previousUsers);
      throw new Error(`No se pudo registrar a "${newUser.email}" (${SAVE_ERROR_HINT}).`);
    }

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'USER_ROLE_CHANGE',
      actionLabel: 'Alta de Usuario',
      entityType: 'user',
      entityId: newUser.email,
      entityName: newUser.name || newUser.email,
      summary: `Se registró al usuario "${newUser.email}" con rol ${newUser.role === 'admin' ? 'Administrador' : 'Colaborador'}.`,
    });
    
    // Automatically trigger welcome email with system explanations and direct link
    sendNewUserWelcomeEmail({
      user: {
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      },
    }).catch((err) => {
      console.warn('Could not send welcome email:', err);
    });

    showToast(`✅ Usuario "${newUser.email}" registrado en Firestore.`);
  };

  // El acceso depende solo de la tabla de usuarios: nunca puede quedar sin administradores
  const wouldRemoveLastAdmin = (email: string) => {
    const target = appUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    const admins = appUsers.filter((u) => u.role === 'admin');
    return target?.role === 'admin' && admins.length <= 1;
  };

  const handleUpdateUserRole = async (email: string, newRole: 'admin' | 'user') => {
    const existing = appUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    const oldRole = existing?.role || 'user';

    if (newRole === 'user' && wouldRemoveLastAdmin(email)) {
      showToast('⚠️ No se puede quitar el último administrador: primero asigná a otra persona como administrador.');
      return;
    }

    setAppUsers((prev) =>
      prev.map((u) => (u.email.toLowerCase() === email.toLowerCase() ? { ...u, role: newRole } : u))
    );
    const userToSave = existing ? { ...existing, role: newRole } : { email, name: email.split('@')[0], role: newRole };
    if (!(await saveCentralUser(userToSave))) {
      setAppUsers((prev) =>
        prev.map((u) => (u.email.toLowerCase() === email.toLowerCase() ? { ...u, role: oldRole } : u))
      );
      showToast(`⚠️ No se pudo cambiar el rol de "${email}" (${SAVE_ERROR_HINT}).`);
      return;
    }

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'USER_ROLE_CHANGE',
      actionLabel: 'Cambio de Rol de Usuario',
      entityType: 'user',
      entityId: email,
      entityName: userToSave.name || email,
      summary: `Se actualizó el rol de "${email}" de ${oldRole === 'admin' ? 'Administrador' : 'Colaborador'} a ${newRole === 'admin' ? 'Administrador' : 'Colaborador'}.`,
      changes: [
        {
          field: 'role',
          label: 'Rol de Acceso',
          oldValue: oldRole === 'admin' ? 'Administrador' : 'Colaborador',
          newValue: newRole === 'admin' ? 'Administrador' : 'Colaborador',
        },
      ],
    });

    if (currentUser && currentUser.email.toLowerCase() === email.toLowerCase()) {
      const updated = { ...currentUser, role: newRole };
      setCurrentUser(updated);
      saveStoredAuth(updated);
      if (newRole === 'user' && activeTab !== 'expenses') {
        setActiveTab('expenses');
      }
    }
    showToast(`✅ Rol de "${email}" actualizado a ${newRole === 'admin' ? 'Administrador' : 'Colaborador'}.`);
  };

  const handleToggleCcAllOutgoingEmails = async (email: string, ccAll: boolean) => {
    setAppUsers((prev) =>
      prev.map((u) => (u.email.toLowerCase() === email.toLowerCase() ? { ...u, ccAllOutgoingEmails: ccAll } : u))
    );
    const existing = appUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    const userToSave = existing ? { ...existing, ccAllOutgoingEmails: ccAll } : { email, name: email.split('@')[0], role: 'admin' as const, ccAllOutgoingEmails: ccAll };
    await saveCentralUser(userToSave);

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'USER_ROLE_CHANGE',
      actionLabel: 'Configuración CC Emails',
      entityType: 'user',
      entityId: email,
      entityName: userToSave.name || email,
      summary: ccAll
        ? `Se activó la copia global (CC) en emails salientes para "${email}".`
        : `Se desactivó la copia global (CC) en emails salientes para "${email}".`,
      changes: [
        {
          field: 'ccAllOutgoingEmails',
          label: 'Copia en todos los emails salientes',
          oldValue: ccAll ? 'Desactivado' : 'Activado',
          newValue: ccAll ? 'Activado' : 'Desactivado',
        },
      ],
    });

    showToast(
      ccAll
        ? `📧 Usuario "${email}" agregado en copia (CC) de todos los correos salientes.`
        : `📧 Usuario "${email}" removido de la copia global de correos salientes.`
    );
  };

  const handleDeleteAppUser = async (email: string) => {
    if (wouldRemoveLastAdmin(email)) {
      showToast('⚠️ No se puede eliminar al último administrador: primero asigná a otra persona como administrador.');
      return;
    }
    if (currentUser && currentUser.email.toLowerCase() === email.toLowerCase()) {
      showToast('⚠️ No podés eliminar tu propio usuario. Pedíselo a otro administrador.');
      return;
    }
    const removed = appUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    setAppUsers((prev) => prev.filter((u) => u.email.toLowerCase() !== email.toLowerCase()));
    if (!(await deleteCentralUser(email))) {
      if (removed) setAppUsers((prev) => [removed, ...prev.filter((u) => u.email.toLowerCase() !== email.toLowerCase())]);
      showToast(`⚠️ No se pudo eliminar a "${email}" (${SAVE_ERROR_HINT}).`);
      return;
    }

    await logAuditEvent({
      userEmail: currentUser?.email,
      userName: currentUser?.name,
      action: 'USER_ROLE_CHANGE',
      actionLabel: 'Eliminación de Usuario',
      entityType: 'user',
      entityId: email,
      entityName: email,
      summary: `Se eliminó el usuario "${email}" del sistema.`,
    });

    showToast(`🗑️ Usuario "${email}" eliminado.`);
  };

  // Direct Quick Send Email (Instant background dispatch without intermediate modals)
  const handleQuickSendEmail = async (
    expense: Expense,
    mode: 'REQUEST_BANK_DETAILS' | 'PAYMENT_CONFIRMATION'
  ) => {
    const to = expense.submittedByEmail || '';
    if (!to) {
      showToast('⚠️ Este comprobante no tiene el email de quien lo cargó: no se puede enviar el pedido.');
      return;
    }
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
            <p>Hola <strong>${escapeHtml(recipientName)}</strong>,</p>
            <p>Desde Administración y Finanzas estamos procesando tu reintegro por <strong>${formatCurrency(expense.amount, expense.currency)}</strong> correspondiente al comprobante de <em>${escapeHtml(expense.vendor)}</em> (Centro de Costos: <strong>${escapeHtml(expense.project || 'General')}</strong>).</p>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 0; font-size: 13px;">Por favor indícanos tus datos de transferencia (CBU/CVU, Alias, Banco y CUIT) para proceder a la liquidación del pago a la brevedad.</p>
            </div>
            <p style="font-size: 12px; color: #64748b;">Área Administrativa & Tesorería — ISF Argentina</p>
          </div>`
        : `<div style="font-family: Arial, sans-serif; max-width: 600px; color: #1e293b; line-height: 1.6;">
            <h2 style="color: #059669; margin-bottom: 8px;">Reintegro de Gasto Liquidado</h2>
            <p>Hola <strong>${escapeHtml(recipientName)}</strong>,</p>
            <p>Te confirmamos que el reintegro por <strong>${formatCurrency(expense.amount, expense.currency)}</strong> de <em>${escapeHtml(expense.vendor)}</em> ha sido <strong>transferido y liquidado con éxito</strong>.</p>
            <p style="font-size: 12px; color: #64748b;">Área de Administración & Finanzas — ISF Argentina</p>
          </div>`;

    let sent = false;
    let sendError = '';
    try {
      const response = await authFetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          bodyHtml,
          accessToken: getStoredWorkspaceToken(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      sent = Boolean(response.ok && data.success);
      sendError = data?.error || '';
    } catch (err: any) {
      sendError = err?.message || '';
    }

    if (!sent) {
      showToast(`⚠️ No se pudo enviar el correo a ${to}${sendError ? `: ${sendError}` : '.'}`);
      return;
    }

    // Recién con el correo enviado se registra (y se guarda en la base, antes quedaba solo en pantalla)
    const changes: Partial<Expense> =
      mode === 'REQUEST_BANK_DETAILS'
        ? { bankDetailsRequestedAt: timestamp, updatedAt: timestamp }
        : {
            paymentConfirmedAt: timestamp,
            reimbursementStatus: 'REIMBURSED',
            reimbursedAt: timestamp.slice(0, 10),
            updatedAt: timestamp,
          };
    setExpenses((prev) => prev.map((e) => (e.id === expense.id ? { ...e, ...changes } : e)));
    const saved = await patchCentralExpenses([{ id: expense.id, changes }]);
    showToast(
      !saved.ok
        ? `⚠️ Correo enviado a ${to}, pero no se pudo registrar en el sistema (${SAVE_ERROR_HINT}).`
        : mode === 'REQUEST_BANK_DETAILS'
        ? `📧 Solicitud de datos enviada directamente a ${to}`
        : `📧 Confirmación de pago enviada directamente a ${to}`
    );
  };

  // Payment trigger (Opens PaymentProcessModal with payment receipt upload and confirmation flow)
  // Antes de abrir "Pagar" se confirma con el servidor que siga pendiente
  const openPaymentIfStillPending = async (expense: Expense) => {
    const fresh = await fetchExpenseFromServer(expense.id);
    if (fresh && fresh.reimbursementStatus === 'REIMBURSED') {
      setExpenses((prev) => prev.map((e) => (e.id === fresh.id ? { ...e, ...fresh } : e)));
      showToast(`ℹ️ "${expense.vendor}" ya fue pagado por otra persona.`);
      return;
    }
    setPaymentModalExpense(fresh ? { ...expense, ...fresh, receiptImage: expense.receiptImage } : expense);
  };

  const handleDirectPayExpense = async (expense: Expense) => {
    await openPaymentIfStillPending(expense);
  };

  const handleEmailSentSuccess = async (expenseId: string, mode: 'request_bank_details' | 'confirm_payment') => {
    const timestamp = new Date().toISOString();
    let updatedItem: Expense | null = null;
    const targetExpense = expenses.find((e) => e.id === expenseId);

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
        const changedFields =
          mode === 'request_bank_details'
            ? ['bankDetailsRequestedAt', 'updatedAt']
            : ['paymentConfirmedAt', 'reimbursementStatus', 'reimbursedAt', 'updatedAt'];
        const saved = await patchCentralExpenses([{ id: expenseId, changes: pickExpenseFields(updatedItem, changedFields) }]);
        if (!saved.ok) {
          if (targetExpense) setExpenses((prev) => prev.map((e) => (e.id === expenseId ? targetExpense : e)));
          showToast(`⚠️ El correo salió, pero no se pudo registrar en el sistema (${SAVE_ERROR_HINT}).`);
          return;
        }
        await logAuditEvent({
          userEmail: currentUser?.email,
          userName: currentUser?.name,
          action: 'EXPENSE_STATUS_CHANGE',
          actionLabel: mode === 'request_bank_details' ? 'Solicitud de Datos Bancarios' : 'Confirmación de Pago',
          entityType: 'expense',
          entityId: expenseId,
          entityName: targetExpense ? `${targetExpense.vendor} ($${targetExpense.amount})` : expenseId,
          summary:
            mode === 'request_bank_details'
              ? `Se envió solicitud de datos bancarios para el comprobante de "${targetExpense?.vendor}".`
              : `Se envió confirmación de pago y liquidación de comprobante para "${targetExpense?.vendor}".`,
        });
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

  const handlePaymentCompleted = async (updatedExpense: Expense): Promise<boolean> => {
    const timestamped: Expense = {
      ...updatedExpense,
      updatedAt: new Date().toISOString(),
    };
    // Base: el comprobante tal como estaba al abrir el modal (así no se pisan cambios de otros)
    const base = paymentModalExpense && paymentModalExpense.id === timestamped.id
      ? paymentModalExpense
      : expenses.find((e) => e.id === timestamped.id);
    const original = expenses.find((e) => e.id === timestamped.id);
    const changes = diffExpenseFields(base, timestamped);
    setExpenses((prev) => prev.map((e) => (e.id === timestamped.id ? { ...e, ...changes, paymentProofImage: timestamped.paymentProofImage } : e)));
    if (viewingReceiptExpense && viewingReceiptExpense.id === timestamped.id) {
      setViewingReceiptExpense(timestamped);
    }
    // Solo si sigue sin pagar (otro Admin pudo haberlo pagado mientras tanto)
    const outcome = await saveExpenseChangesIfNotPaid(base, timestamped);
    if (outcome !== 'ok') {
      if (outcome === 'already_paid') {
        const fresh = await fetchExpenseFromServer(timestamped.id);
        if (fresh) setExpenses((prev) => prev.map((e) => (e.id === fresh.id ? { ...e, ...fresh } : e)));
        showToast(`⚠️ "${timestamped.vendor}" ya había sido pagado por otra persona. No se registró de nuevo ni se envió correo.`);
      } else {
        if (original) setExpenses((prev) => prev.map((e) => (e.id === original.id ? original : e)));
        showToast(`⚠️ No se pudo registrar el pago de "${timestamped.vendor}" (${SAVE_ERROR_HINT}).`);
      }
      return false;
    }
    try {
      await logAuditEvent({
        userEmail: currentUser?.email,
        userName: currentUser?.name,
        action: 'EXPENSE_STATUS_CHANGE',
        actionLabel: 'Pago y Liquidación',
        entityType: 'expense',
        entityId: timestamped.id,
        entityName: `${timestamped.vendor} ($${timestamped.amount})`,
        summary: `Se procesó y confirmó el pago del gasto de "${timestamped.vendor}" por ${formatCurrency(timestamped.amount, timestamped.currency)}.`,
      });
      showToast(`✅ Pago y comprobante registrados exitosamente para ${timestamped.submittedByName || timestamped.vendor}`);
    } catch (err) {
      console.warn('Audit log error on payment:', err);
    }
    return true;
  };

  const canSwitchRole = useMemo(() => {
    if (!currentUser?.email) return false;
    const cleanEmail = currentUser.email.toLowerCase().trim();
    // 1. Central record in appUsers has absolute priority
    const record = appUsers.find((u) => u.email.toLowerCase().trim() === cleanEmail);
    if (record && record.role) {
      return record.role === 'admin';
    }
    // 2. Rol real verificado al iniciar sesión (no la vista activa)
    return permissionRole === 'admin';
  }, [currentUser?.email, permissionRole, appUsers]);

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

  const handleLogout = async () => {
    // Los archivos que todavía no llegaron a Drive viven solo en este navegador: al cerrar sesión
    // se borran. Se avisa antes para que se puedan reintentar.
    const myEmail = (currentUser?.email || '').toLowerCase();
    const notInDrive = expenses.filter(
      (e) =>
        (e.submittedByEmail || '').toLowerCase() === myEmail &&
        (e.driveUploadStatus === 'PENDING' || e.driveUploadStatus === 'ERROR')
    );
    if (notInDrive.length > 0) {
      const proceed = window.confirm(
        `Tenés ${notInDrive.length} comprobante(s) cuyo archivo todavía no se subió a Google Drive ` +
          `(${notInDrive.slice(0, 3).map((e) => e.vendor || 'Comprobante').join(', ')}${notInDrive.length > 3 ? '…' : ''}).\n\n` +
          'Si cerrás sesión, esos archivos se borran de este navegador y vas a tener que volver a adjuntarlos.\n\n' +
          '¿Cerrar sesión igual? (Cancelar para volver y usar "Reintentar")'
      );
      if (!proceed) return;
    }
    // Cambios guardados sin conexión: se espera unos segundos a que lleguen a la base
    await Promise.race([waitForPendingWrites(db).catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
    setIsAuthProfileOpen(false);
    showToast('Cerrando sesión y borrando los datos de este navegador...');
    await signOut(auth).catch(console.warn);
    saveStoredAuth(null);
    saveStoredWorkspaceToken(null);
    // No quedan comprobantes, usuarios ni archivos del usuario anterior en este navegador
    await clearLocalSessionData();
    // Recarga limpia: nada del usuario anterior queda en memoria
    window.location.reload();
  };

  const pendingReimbursementAmount = useMemo(() => {
    return expenses
      .filter((e) => e.reimbursable && e.reimbursementStatus === 'PENDING')
      .reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [expenses]);

  if (!isFirebaseAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-600">Verificando sesión segura...</p>
        </div>
      </div>
    );
  }

  if (!currentUser || !currentUser.email) {
    return (
      <>
        <UpdateAvailableBanner />
        <UserLoginGate
          onLogin={(profile) => {
            setPermissionRole(profile.role);
            setCurrentUser(profile);
            saveStoredAuth(profile);
            showToast(`¡Bienvenido/a, ${profile.name}!`);
          }}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Aviso de versión nueva publicada */}
      <UpdateAvailableBanner />

      {/* Top Clean Header & Navigation Menu */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenNewModal={() => setIsScannerModalOpen(true)}
        onOpenAuthProfile={() => setIsAuthProfileOpen(true)}
        onOpenManual={() => setIsManualOpen(true)}
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
              vendors={vendors}
              currentUser={currentUser}
              onEditExpense={(exp) => setEditingExpense(exp)}
              onViewReceipt={(exp) => setViewingReceiptExpense(exp)}
              onOpenNewModal={() => setIsScannerModalOpen(true)}
              onDeleteExpense={handleDeleteExpense}
              onReplaceReceipt={handleRequestReplaceReceipt}
              onRetryDriveUpload={handleUploadExpenseToDrive}
              queryPeriod={queryPeriod}
              onPeriodChange={handlePeriodChange}
              queryCostCenter={queryCostCenter}
              onCostCenterChange={handleCostCenterFilterChange}
              queryLimit={queryLimit}
              onLimitChange={handleLimitChange}
              hasMoreExpenses={hasMoreExpenses}
              isLoadingMore={isLoadingMoreExpenses}
              onLoadMore={handleLoadMoreExpenses}
            />
          )}

          {/* 2. Gestión Pagos */}
          {activeTab === 'admin_movements' && (
            currentUser.role === 'admin' ? (
              <AdminMovementView
                expenses={expenses}
                costCenters={costCenters}
                vendors={vendors}
                appUsers={appUsers}
                currentUser={currentUser}
                onToggleReimbursementStatus={handleToggleReimbursementStatus}
                onDirectPayExpense={handleDirectPayExpense}
                onProcessPayment={handleDirectPayExpense}
                onRequestBankDetails={(exp) => handleQuickSendEmail(exp, 'REQUEST_BANK_DETAILS')}
                onViewReceipt={(exp) => setViewingReceiptExpense(exp)}
                onEditExpense={(exp) => setEditingExpense(exp)}
                onDeleteExpense={handleDeleteExpense}
                onBatchDeleteExpenses={handleBatchDeleteExpenses}
                onBatchSettleReimbursements={handleBatchSettleReimbursements}
                onBatchPaymentCompleted={handleBatchPaymentCompleted}
                onBatchPaymentSave={handleBatchPaymentSave}
                driveSettings={driveSettings}
                onRetryDriveUpload={handleUploadExpenseToDrive}
                onAddVendor={handleAddVendor}
                onUpdateVendor={handleUpdateVendor}
                onReplaceReceipt={handleRequestReplaceReceipt}
                onOpenWithholdingModal={(exp) => setWithholdingModalExpense(exp)}
                initialFilterVendor={initialFilterVendor}
                queryPeriod={queryPeriod}
                onPeriodChange={handlePeriodChange}
                queryCostCenter={queryCostCenter}
                onCostCenterChange={handleCostCenterFilterChange}
                queryLimit={queryLimit}
                onLimitChange={handleLimitChange}
                hasMoreExpenses={hasMoreExpenses}
                isLoadingMore={isLoadingMoreExpenses}
                onLoadMore={handleLoadMoreExpenses}
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
              driveSettings={driveSettings}
              onSaveDriveSettings={handleSaveDriveSettings}
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

          {/* 8. Log de Cambios y Auditoría (Accounting profile only) */}
          {activeTab === 'audit_logs' && currentUser.role === 'admin' && (
            <AuditLogsView
              logs={auditLogs}
              currentUser={currentUser}
              onRefreshLogs={async () => {
                const refreshed = await fetchCentralAuditLogs(500);
                setAuditLogs(refreshed);
                showToast('🔄 Registros de auditoría actualizados.');
              }}
              onClearLogs={async () => {
                const ok = await clearCentralAuditLogs({ email: currentUser.email, name: currentUser.name });
                if (ok) {
                  setAuditLogs([]);
                  showToast('🗑️ Registro de auditoría inicializado y borrado.');
                }
                return ok;
              }}
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
              id="footer-manual-btn"
              onClick={() => setIsManualOpen(true)}
              className="text-slate-500 hover:text-indigo-600 transition cursor-pointer hover:underline"
            >
              Manual de Uso
            </button>
            <span className="text-slate-300">•</span>
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
        onUpdateVendor={handleUpdateVendor}
      />

      <ReceiptViewerModal
        expense={viewingReceiptExpense}
        costCenters={costCenters}
        onClose={() => setViewingReceiptExpense(null)}
        onProcessPayment={currentUser.role === 'admin' ? handleDirectPayExpense : undefined}
        onUploadToDrive={handleUploadExpenseToDrive}
        onReplaceReceipt={
          permissionRole === 'admin' || viewingReceiptExpense?.reimbursementStatus !== 'REIMBURSED'
            ? handleRequestReplaceReceipt
            : undefined
        }
        onOpenWithholdingModal={currentUser.role === 'admin' ? (exp) => setWithholdingModalExpense(exp) : undefined}
      />

      <WithholdingCertificateModal
        isOpen={Boolean(withholdingModalExpense)}
        expense={withholdingModalExpense}
        costCenters={costCenters}
        driveSettings={driveSettings}
        appUsers={appUsers}
        currentUser={currentUser || undefined}
        onClose={() => setWithholdingModalExpense(null)}
        onSaved={handleWithholdingCertificateSaved}
        onEmailResult={handleWithholdingEmailResult}
        onRevertPayment={handleToggleReimbursementStatus}
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
        driveSettings={driveSettings}
        appUsers={appUsers}
        currentUser={currentUser}
        onClose={() => setPaymentModalExpense(null)}
        onPaymentCompleted={handlePaymentCompleted}
        onNotify={showToast}
        vendors={vendors}
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

      <ManualModal
        isOpen={isManualOpen}
        role={currentUser.role}
        onClose={() => setIsManualOpen(false)}
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
