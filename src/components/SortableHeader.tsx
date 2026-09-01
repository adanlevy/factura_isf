import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { ExpenseSortField, SortDirection } from '../utils/sorting';

interface SortableHeaderProps {
  label: string;
  field: ExpenseSortField;
  currentField: ExpenseSortField;
  currentDirection: SortDirection;
  onSort: (field: ExpenseSortField) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
  title?: string;
}

export function SortableHeader({
  label,
  field,
  currentField,
  currentDirection,
  onSort,
  align = 'left',
  className = '',
  title,
}: SortableHeaderProps) {
  const isActive = currentField === field;

  const alignClass =
    align === 'right'
      ? 'justify-end text-right'
      : align === 'center'
      ? 'justify-center text-center'
      : 'justify-start text-left';

  return (
    <th
      id={`sort-header-${field}`}
      scope="col"
      className={`text-xs font-bold text-slate-600 uppercase tracking-wider select-none cursor-pointer transition-colors hover:bg-slate-100/80 ${className}`}
      onClick={() => onSort(field)}
      title={title || `Ordenar por ${label}`}
    >
      <div className={`inline-flex items-center gap-1.5 w-full ${alignClass}`}>
        <span>{label}</span>
        <span
          className={`inline-flex p-0.5 rounded-sm transition-colors ${
            isActive ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 group-hover:text-slate-600'
          }`}
        >
          {isActive ? (
            currentDirection === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 opacity-50" />
          )}
        </span>
      </div>
    </th>
  );
}

interface MobileSortOption {
  field: ExpenseSortField;
  label: string;
}

interface MobileSortSelectorProps {
  currentField: ExpenseSortField;
  currentDirection: SortDirection;
  onSortChange: (field: ExpenseSortField, direction: SortDirection) => void;
  options: MobileSortOption[];
}

export function MobileSortSelector({
  currentField,
  currentDirection,
  onSortChange,
  options,
}: MobileSortSelectorProps) {
  return (
    <div
      id="mobile-sort-selector"
      className="flex items-center justify-between gap-2 p-2.5 bg-slate-100/80 rounded-xl border border-slate-200 text-xs"
    >
      <div className="flex items-center gap-1.5 text-slate-700 font-semibold shrink-0">
        <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600" />
        <span>Ordenar:</span>
      </div>
      <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
        <select
          id="mobile-sort-field-select"
          value={currentField}
          onChange={(e) => onSortChange(e.target.value as ExpenseSortField, currentDirection)}
          className="bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-hidden min-w-0 max-w-[170px] truncate"
        >
          {options.map((opt) => (
            <option key={opt.field} value={opt.field}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          id="mobile-sort-direction-btn"
          type="button"
          onClick={() => onSortChange(currentField, currentDirection === 'asc' ? 'desc' : 'asc')}
          className="flex items-center gap-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-bold transition shadow-2xs shrink-0 cursor-pointer"
          title={currentDirection === 'asc' ? 'Ascendente (A-Z, Menor a Mayor)' : 'Descendente (Z-A, Mayor a Menor)'}
        >
          {currentDirection === 'asc' ? (
            <>
              <ArrowUp className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Asc</span>
            </>
          ) : (
            <>
              <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Desc</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
