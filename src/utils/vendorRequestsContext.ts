import { createContext, useContext } from 'react';
import { VendorChangeRequest } from '../types';

/**
 * Pedidos de cambio de proveedores pendientes visibles para quien usa la app
 * (Admin: todos; Colaborador: los suyos). Se comparte por contexto para que el selector
 * de cuentas, que aparece en varias pantallas, sepa si un proveedor tiene un cambio pendiente.
 */
export const VendorRequestsContext = createContext<VendorChangeRequest[]>([]);

export function usePendingVendorRequests(): VendorChangeRequest[] {
  return useContext(VendorRequestsContext);
}
