import { createContext, useContext } from 'react';
import { UserBankDetails, Vendor } from '../types';

/**
 * Cuenta para los "Reintegro a mí": un registro del listado de proveedores asociado al perfil
 * (no datos bancarios sueltos). Se comparte por contexto para que la carga de comprobantes,
 * la edición y el perfil usen la misma cuenta y el mismo selector.
 */
export interface ReimbursementAccountContextValue {
  /** Registro de proveedor asociado al perfil (null si todavía no eligió) */
  vendor: Vendor | null;
  /**
   * Abre el buscador del listado de proveedores con confirmación ("¿Estás seguro?").
   * Devuelve el proveedor asociado, o null si la persona cancela.
   */
  chooseAccount: (reason?: 'first-use' | 'profile') => Promise<Vendor | null>;
  /** Quita la asociación del perfil */
  unlink: () => Promise<boolean>;
}

export const ReimbursementAccountContext = createContext<ReimbursementAccountContextValue>({
  vendor: null,
  chooseAccount: async () => null,
  unlink: async () => false,
});

export function useReimbursementAccount(): ReimbursementAccountContextValue {
  return useContext(ReimbursementAccountContext);
}

/** Cuenta a la que se transfiere un reintegro, tomada del registro de proveedor asociado */
export function vendorToReimbursementBank(vendor: Vendor | null | undefined): UserBankDetails | null {
  const bank = vendor?.bankDetails;
  if (!vendor || !bank || !(bank.cbuCvu?.trim() || bank.alias?.trim())) return null;
  return {
    bankName: bank.bankName || '',
    accountType: bank.accountType || 'Indefinido',
    cbuCvu: bank.cbuCvu || '',
    alias: bank.alias || '',
    cuitCuil: bank.cuitCuil || vendor.cuit || '',
    accountHolder: bank.accountHolder || vendor.name,
  };
}
