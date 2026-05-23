import { useState } from 'react';
import type {
  ChangeEvent,
  FocusEvent,
  InputHTMLAttributes,
} from 'react';

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'min' | 'max' | 'step'
>;

export interface IntegerInputOptions {
  allowNegative?: boolean;
  blurFallbackValue?: number;
  clearZeroOnFocus?: boolean;
  emptyValue?: number;
  max?: number;
  min?: number;
}

interface IntegerInputProps extends NativeInputProps, IntegerInputOptions {
  onValueChange: (value: number) => void;
  step?: number;
  value: number;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function integerBounds(options: IntegerInputOptions) {
  return {
    min: finiteOr(
      options.min,
      options.allowNegative ? Number.NEGATIVE_INFINITY : 0,
    ),
    max: finiteOr(options.max, Number.POSITIVE_INFINITY),
  };
}

export function clampIntegerValue(value: number, options: IntegerInputOptions = {}): number {
  const { min, max } = integerBounds(options);
  const integer = Math.trunc(Number.isFinite(value) ? value : 0);
  if (max < min) return min;
  return Math.min(max, Math.max(min, integer));
}

export function normalizeIntegerInputDraft(
  rawValue: string,
  options: Pick<IntegerInputOptions, 'allowNegative'> = {},
): string {
  const hasNegativeSign = options.allowNegative && rawValue.trimStart().startsWith('-');
  const digits = rawValue.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return hasNegativeSign ? '-' : '';
  return `${hasNegativeSign ? '-' : ''}${digits}`;
}

export function integerInputDraftOnFocus(
  value: number,
  options: Pick<IntegerInputOptions, 'clearZeroOnFocus'> = {},
): string {
  const clearZeroOnFocus = options.clearZeroOnFocus ?? true;
  return clearZeroOnFocus && value === 0 ? '' : String(Math.trunc(value));
}

export function integerValueFromDraft(
  draft: string,
  options: IntegerInputOptions = {},
): number {
  if (draft === '' || draft === '-') return options.emptyValue ?? 0;
  return clampIntegerValue(Number.parseInt(draft, 10), options);
}

export function committedIntegerInputValue(
  draft: string,
  options: IntegerInputOptions = {},
): number {
  if (draft === '' || draft === '-') {
    const { min } = integerBounds(options);
    const fallback = options.blurFallbackValue ?? Math.max(min, options.emptyValue ?? 0);
    return clampIntegerValue(fallback, options);
  }
  return clampIntegerValue(Number.parseInt(draft, 10), options);
}

export function IntegerInput({
  allowNegative = false,
  blurFallbackValue,
  clearZeroOnFocus = true,
  emptyValue = 0,
  inputMode,
  max,
  min,
  onBlur,
  onFocus,
  onValueChange,
  pattern,
  role,
  step = 1,
  value,
  ...inputProps
}: IntegerInputProps) {
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const options = {
    allowNegative,
    blurFallbackValue,
    clearZeroOnFocus,
    emptyValue,
    max,
    min,
  };
  const displayValue = draftValue ?? String(clampIntegerValue(value, options));
  const ariaValueNow = integerValueFromDraft(displayValue, options);

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setDraftValue(integerInputDraftOnFocus(value, options));
    onFocus?.(event);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const normalizedDraft = normalizeIntegerInputDraft(event.target.value, options);
    const nextValue = integerValueFromDraft(normalizedDraft, options);
    const nextDraft = normalizedDraft === '' || normalizedDraft === '-'
      ? normalizedDraft
      : String(nextValue);
    setDraftValue(nextDraft);
    onValueChange(nextValue);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const committedValue = committedIntegerInputValue(draftValue ?? displayValue, options);
    setDraftValue(null);
    onValueChange(committedValue);
    onBlur?.(event);
  };

  return (
    <input
      {...inputProps}
      aria-valuemax={Number.isFinite(max) ? max : undefined}
      aria-valuemin={Number.isFinite(min) ? min : undefined}
      aria-valuenow={ariaValueNow}
      inputMode={inputMode ?? 'numeric'}
      onBlur={handleBlur}
      onChange={handleChange}
      onFocus={handleFocus}
      pattern={pattern ?? (allowNegative ? '-?[0-9]*' : '[0-9]*')}
      role={role ?? 'spinbutton'}
      step={step}
      type="text"
      value={displayValue}
    />
  );
}
