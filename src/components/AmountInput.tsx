import React, { useEffect, useRef, useState } from 'react';
import { formatNumber, parseLocaleNumber } from '../utils/helpers';

interface AmountInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Monto actual ('' o null = vacío) */
  value: number | '' | null | undefined;
  /** Recibe el número interpretado, o '' si el campo quedó vacío o no es un número */
  onValueChange: (value: number | '') => void;
}

const toDisplay = (value: AmountInputProps['value']) =>
  value === '' || value === null || value === undefined || !Number.isFinite(Number(value))
    ? ''
    : formatNumber(value, 2);

/**
 * Campo de monto con formato argentino: muestra 1.234,56 y acepta "1.234,56", "1234,56" o "1234.56".
 * Mientras se escribe se respeta el texto tal cual; al salir del campo se acomoda el formato.
 */
export function AmountInput({ value, onValueChange, onFocus, onBlur, placeholder = '0,00', ...rest }: AmountInputProps) {
  const [text, setText] = useState(() => toDisplay(value));
  const focusedRef = useRef(false);

  // Si el monto cambia desde afuera (por ejemplo, lo completa la IA), se muestra con formato
  useEffect(() => {
    if (focusedRef.current) return;
    setText(toDisplay(value));
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={text}
      onFocus={(e) => {
        focusedRef.current = true;
        onFocus?.(e);
      }}
      onChange={(e) => {
        const next = e.target.value.replace(/[^\d.,\-\s$]/g, '');
        setText(next);
        const parsed = parseLocaleNumber(next);
        onValueChange(parsed === null ? '' : parsed);
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        const parsed = parseLocaleNumber(text);
        setText(parsed === null ? '' : formatNumber(parsed, 2));
        onBlur?.(e);
      }}
    />
  );
}
